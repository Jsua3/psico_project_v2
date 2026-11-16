"""C1 · El servicio de la generación por etapas: límites por docente, cerrojos, reparación y auditoría.

Cada función pública recibe ``actor`` y comprueba la propiedad (404 si la generación no es suya, también para ADMIN).

Las etapas que llaman al proveedor (esqueleto y escena) siguen la misma plantilla (``_run_stage``):

1. **Reserva corta** (``transaction.atomic`` + ``select_for_update`` de la fila): propiedad, transición, etapa en curso,
   tope de llamadas; marca la etapa ``running`` con una marca de tiempo y suma 1 a ``calls``. Se confirma.
2. **Llamada al proveedor sin transacción abierta.**
3. **Validación** con ``checks``: ``GenerationInvalid`` cuenta como ``malformed``.
4. **Guardado corto** con cerrojo: resultado o error, ``lastError``, tokens y estado. Si la generación se canceló mientras
   tanto, o la marca de la etapa ya no es la nuestra (otra petición la retomó), el resultado se descarta.
5. **Auditoría** fuera de la transacción.

Cerrojos: el orden es siempre la fila del usuario y luego la de la generación (solo ``start`` toma la del usuario; la
generación que crea nace dentro de ese cerrojo). ``assemble`` no llama a la red: toma la fila con ``nowait`` y la conserva
durante todo el ensamblado, así dos ensamblados a la vez no crean dos borradores y el segundo recibe ``GenerationBusy``.
"""
import json
import logging
import time
from datetime import datetime, timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, OperationalError, connection, transaction
from django.utils import timezone
from rest_framework import status as http
from rest_framework.exceptions import NotFound

from apps.biblioteca.services import lugares
from apps.simulation.casedef.text import plain_text_problem
from apps.simulation.models import CaseGeneration, GenerationStatus
from apps.simulation.services import audit_service
from apps.simulation.services.ai_providers import ProviderError, provider_class
from apps.simulation.services.authoring.assistant import config as assistant_config
from apps.simulation.services.authoring.assistant.limits import LimitExceeded
from shared.exceptions import ApiError

from . import assembly, checks, context, lifecycle, prompts, schema
from .checks import GenerationInvalid, SkeletonDraft

logger = logging.getLogger(__name__)

#: ``lock_not_available`` de PostgreSQL: lo que devuelve ``FOR UPDATE NOWAIT`` cuando otra transacción tiene la fila.
LOCK_NOT_AVAILABLE = "55P03"
#: Clave del cerrojo de asesoría que serializa el recuento diario global de ``start``.
GLOBAL_COUNT_LOCK = 7_302_611
#: Escenas que una generación puede tener a la vez en curso (el servidor lo impone, no solo el cliente).
MAX_SCENES_IN_FLIGHT = 2
MIN_DESCRIPTION = 40
MAX_DESCRIPTION = prompts.MAX_DESCRIPTION

# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (todos los mensajes de este módulo)
MESSAGES = {
    "timeout": "La IA tardó demasiado en responder. Vuelve a intentarlo.",
    "http": "No pudimos hablar con la IA. Vuelve a intentarlo en un momento.",
    "malformed": "La IA respondió algo que no pudimos usar. Vuelve a intentarlo.",
    "refusal": "La IA no quiso escribir esta parte. Prueba a describir el caso con otras palabras.",
}
IN_PROGRESS_MESSAGE = "Ya tienes un caso generándose. Retómalo o cancélalo para empezar otro."
BUSY_MESSAGE = "Esta parte ya se está escribiendo. Espera un momento."
STATE_MESSAGE = "Ese paso no corresponde ahora. Vuelve a cargar el avance."
CALLS_EXHAUSTED_MESSAGE = "Este caso ya usó todos sus intentos con la IA. Empieza uno nuevo."
DAILY_MESSAGE = "Llegaste al límite de casos generados por hoy."
# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología
GLOBAL_DAILY_MESSAGE = "La plataforma llegó al límite de casos generados por hoy. Vuelve a intentarlo mañana."
DISABLED_MESSAGE = "La generación con IA no está disponible."
DESCRIPTION_SHORT = "Cuéntanos un poco más: al menos 40 caracteres."
DESCRIPTION_LONG = "La descripción puede tener hasta 2000 caracteres."
DESCRIPTION_PLAIN = "La descripción debe ser texto plano, sin etiquetas, enlaces ni caracteres especiales."
PLACE_MISSING = "Elige el lugar donde pasa el caso."
NOT_FOUND_MESSAGE = "La generación no existe."


# ─── errores ──────────────────────────────────────────────────────────────────────────────────────


class GenerationInProgress(ApiError):
    def __init__(self, generation_id):
        super().__init__("GENERATION_IN_PROGRESS", IN_PROGRESS_MESSAGE, http.HTTP_409_CONFLICT, generationId=str(generation_id))


class GenerationBusy(ApiError):
    def __init__(self):
        super().__init__("GENERATION_BUSY", BUSY_MESSAGE, http.HTTP_409_CONFLICT)


class GenerationState(ApiError):
    def __init__(self):
        super().__init__("GENERATION_STATE", STATE_MESSAGE, http.HTTP_409_CONFLICT)


class GenerationCallsExhausted(ApiError):
    def __init__(self):
        super().__init__("GENERATION_CALLS_EXHAUSTED", CALLS_EXHAUSTED_MESSAGE, http.HTTP_429_TOO_MANY_REQUESTS)


class GenerationDisabled(ApiError):
    def __init__(self):
        super().__init__("NOT_FOUND", DISABLED_MESSAGE, http.HTTP_404_NOT_FOUND)


class DailyLimitExceeded(LimitExceeded):
    """Mismo código y estado que el del asistente (``AI_LIMIT_EXCEEDED``, ``scope="daily"``) con su propio texto."""

    def __init__(self):
        ApiError.__init__(self, "AI_LIMIT_EXCEEDED", DAILY_MESSAGE, http.HTTP_429_TOO_MANY_REQUESTS, scope="daily")
        self.scope = "daily"


class GlobalDailyLimitExceeded(DailyLimitExceeded):
    """El tope diario de toda la plataforma: mismo código, estado y ``scope`` que el de la docente, con su propio texto."""

    def __init__(self):
        ApiError.__init__(self, "AI_LIMIT_EXCEEDED", GLOBAL_DAILY_MESSAGE, http.HTTP_429_TOO_MANY_REQUESTS, scope="daily")
        self.scope = "daily"


class AiRefused(ApiError):
    def __init__(self):
        super().__init__("AI_REFUSED", MESSAGES["refusal"], http.HTTP_422_UNPROCESSABLE_ENTITY)


class AiProviderFailed(ApiError):
    def __init__(self, kind):
        super().__init__("AI_PROVIDER_ERROR", MESSAGES[kind], http.HTTP_502_BAD_GATEWAY, kind=kind)


def _invalid(field: str, message: str) -> ApiError:
    return ApiError("VALIDATION_ERROR", message, http.HTTP_400_BAD_REQUEST, field=field)


def _not_found() -> NotFound:
    return NotFound(NOT_FOUND_MESSAGE)


# ─── lectura y vista ──────────────────────────────────────────────────────────────────────────────


def _loads(text: str, default):
    try:
        value = json.loads(text) if text else default
    except ValueError:
        return default
    return value if isinstance(value, type(default)) else default


def _stamp(value: datetime | None) -> str | None:
    """``value`` en UTC con ``Z``. Con ``USE_TZ=False`` los ``datetime`` de la base son ingenuos y de ``TIME_ZONE``."""
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=ZoneInfo(settings.TIME_ZONE))
    return value.astimezone(dt_timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _scene_state(entry: dict, now: datetime, timeout: dict) -> dict:
    if entry.get("state") == "running" and lifecycle.is_stale(_parse(entry.get("started_at")), now):
        return {"state": "error", "error": dict(timeout)}
    return {"state": entry.get("state", "pending"), "error": entry.get("error")}


def view(gen: CaseGeneration) -> dict:
    """La ``Generation`` del contrato. Sin ``document_json`` y sin texto del modelo salvo los títulos; con la descripción.

    Una etapa «en curso» que ya venció (``lifecycle.is_stale``) se muestra como error de ``timeout`` para que el editor ofrezca
    pedirla de nuevo; lo guardado no cambia.
    """
    now = timezone.now()
    skeleton = _loads(gen.skeleton_json, {})
    scenes = _loads(gen.scenes_json, {})
    outlines = skeleton.get("escenas", []) if skeleton else []
    repair = _loads(gen.repair_json, {})
    last_error = _loads(gen.last_error_json, {})
    timeout = {"kind": "timeout", "message": MESSAGES["timeout"]}
    if not last_error and lifecycle.is_stale(gen.skeleton_started_at, now):
        last_error = {"stage": "skeleton", "clave": None, **timeout}
    return {
        "id": str(gen.id),
        "lugarId": gen.lugar_id,
        "descripcion": gen.description,
        "status": gen.status,
        "skeleton": (
            {
                "titulo": skeleton["titulo"],
                "escenas": [{"clave": o["sala"], "titulo": o["titulo"], "final": bool(o["final"])} for o in outlines],
            }
            if outlines else None
        ),
        "scenes": [
            {
                "clave": o["sala"],
                "titulo": o["titulo"],
                **_scene_state(scenes.get(o["sala"]) or {}, now, timeout),
            }
            for o in outlines
        ],
        "repairRounds": gen.repair_rounds,
        "repair": (
            {"round": repair.get("round", gen.repair_rounds), "scenes": repair.get("scenes", []), "issues": repair.get("issues", {})}
            if gen.status == GenerationStatus.NEEDS_REPAIR and repair else None
        ),
        "lastError": last_error or None,
        "caseVersionId": gen.case_version_id if gen.status == GenerationStatus.IMPORTED else None,
        # Solo con ``imported`` y ``failed``; en ``needs_repair`` las faltas por escena viven en ``repair.issues``.
        "issues": _loads(gen.report_json, []) if gen.status in (GenerationStatus.IMPORTED, GenerationStatus.FAILED) else [],
        "callsUsed": gen.calls,
        "callsLimit": assistant_config.current().generation_max_calls,
        "createdAt": _stamp(gen.created_at),
        "updatedAt": _stamp(gen.updated_at),
    }


def _config():
    config = assistant_config.current()
    if not _available(config):
        raise GenerationDisabled()
    return config


def _available(config) -> bool:
    """Lista para llamar y con la rúbrica por defecto: sin ella ninguna escena pasaría las comprobaciones de competencias."""
    return config.generation_ready and bool(context.competencias_por_defecto())


def _owned(gen_id, actor, *, lock: bool = False, nowait: bool = False) -> CaseGeneration:
    """La generación de ``actor`` (404 si no existe o es de otra persona), con cerrojo de fila si se pide."""
    queryset = CaseGeneration.objects.all()
    if lock:
        queryset = queryset.select_for_update(nowait=nowait)
    try:
        return queryset.get(pk=gen_id, owner=actor)
    except (CaseGeneration.DoesNotExist, ValueError, TypeError, DjangoValidationError):  # un id que no es UUID: el ORM lo rechaza
        raise _not_found() from None


# ─── auditoría ────────────────────────────────────────────────────────────────────────────────────


def _audit(gen_id, actor, stage: str, outcome: str, *, started: float | None = None, model: str | None = None,
           kind: str | None = None, tokens: tuple[int, int] = (0, 0), round_: int = 0) -> None:
    """Una fila de auditoría sin la descripción ni texto del modelo (la lista blanca lo garantiza también)."""
    ctx = {
        "generationId": str(gen_id), "stage": stage, "outcome": outcome, "tokens_in": tokens[0], "tokens_out": tokens[1],
        "round": round_,
    }
    if started is not None:
        ctx["duration_ms"] = int((time.monotonic() - started) * 1000)
    if model:
        ctx["model"] = model
    if kind:
        ctx["kind"] = kind
    audit_service.record("AI_AUTHORING_GENERATE", "CASE_GENERATION", gen_id, ctx, actor=actor)


# ─── status, start, get, cancel ───────────────────────────────────────────────────────────────────


def _cancel_abandoned(actor) -> None:
    now = timezone.now()
    for gen in CaseGeneration.objects.filter(owner=actor, status__in=GenerationStatus.IN_PROGRESS):
        if lifecycle.is_abandoned(gen.updated_at, now):
            # ``update`` no toca ``updated_at`` (auto_now solo corre en ``save``) y es atómico sobre el estado visto.
            CaseGeneration.objects.filter(pk=gen.pk, status=gen.status).update(status=GenerationStatus.CANCELLED)


def _created_today(actor) -> int:
    return CaseGeneration.objects.filter(owner=actor, created_at__date=timezone.now().date()).count()


def _created_today_by_all() -> int:
    return CaseGeneration.objects.filter(created_at__date=timezone.now().date()).count()


def status(actor) -> dict:
    """``GenerationStatus``: si está disponible, cuántas le quedan hoy y la generación en curso (o ``None``).

    No es solo lectura: cancela las generaciones de la docente que llevan 24 h o más sin cambios (``_cancel_abandoned``).
    """
    config = assistant_config.current()
    _cancel_abandoned(actor)
    current = CaseGeneration.objects.filter(owner=actor, status__in=GenerationStatus.IN_PROGRESS).first()
    return {
        "enabled": _available(config),
        "remainingToday": max(0, config.generations_per_day - _created_today(actor)),
        "inProgress": view(current) if current else None,
    }


def _check_description(descripcion) -> str:
    if not isinstance(descripcion, str):
        raise _invalid("descripcion", DESCRIPTION_SHORT)
    texto = descripcion.strip()
    if len(texto) < MIN_DESCRIPTION:
        raise _invalid("descripcion", DESCRIPTION_SHORT)
    if len(texto) > MAX_DESCRIPTION:
        raise _invalid("descripcion", DESCRIPTION_LONG)
    if plain_text_problem(texto, MAX_DESCRIPTION, multiline=True) is not None:
        raise _invalid("descripcion", DESCRIPTION_PLAIN)
    try:
        checks.check_description(texto)
    except GenerationInvalid as exc:  # datos personales: nada se guarda ni se manda al proveedor
        raise _invalid("descripcion", exc.motivos[0]) from None
    return texto


def start(actor, lugar_id: str, descripcion: str) -> dict:
    """Crea una generación (``created``): valida, cancela las abandonadas, cuenta el tope del día y crea."""
    config = _config()
    if not isinstance(lugar_id, str) or not lugar_id.strip():
        raise _invalid("lugarId", PLACE_MISSING)
    lugares.cargar_lugar(lugar_id.strip())  # 404 si el lugar no existe
    texto = _check_description(descripcion)
    # Orden de cerrojos: primero la fila del usuario (serializa sus creaciones y el recuento del día), luego la generación.
    user_model = get_user_model()
    _cancel_abandoned(actor)  # fuera de la transacción: un tope que se pasa no debe deshacer la cancelación
    try:
        with transaction.atomic():
            user_model.objects.select_for_update().get(pk=actor.pk)
            if _created_today(actor) >= config.generations_per_day:
                raise DailyLimitExceeded()
            with connection.cursor() as cursor:  # serializa el recuento global entre docentes (siempre tras la fila del usuario)
                cursor.execute("SELECT pg_advisory_xact_lock(%s)", [GLOBAL_COUNT_LOCK])
            if _created_today_by_all() >= config.generations_global_per_day:
                raise GlobalDailyLimitExceeded()
            gen = CaseGeneration.objects.create(owner=actor, lugar_id=lugar_id.strip(), description=texto)
    except IntegrityError:
        # ``uq_generation_in_progress_per_owner``: ya tiene una en curso; se le da su id.
        current = CaseGeneration.objects.filter(owner=actor, status__in=GenerationStatus.IN_PROGRESS).first()
        if current is None:
            raise
        raise GenerationInProgress(current.id) from None
    _audit(gen.id, actor, "start", "ok")
    return view(gen)


def get(actor, gen_id) -> dict:
    _config()
    return view(_owned(gen_id, actor))


def cancel(actor, gen_id) -> dict:
    _config()
    with transaction.atomic():
        gen = _owned(gen_id, actor, lock=True)
        if not lifecycle.can(gen.status, "cancel"):
            raise GenerationState()
        gen.status = GenerationStatus.CANCELLED
        gen.save(update_fields=["status", "updated_at"])
    _audit(gen.id, actor, "cancel", "ok", round_=gen.repair_rounds)
    return view(gen)


# ─── etapas con el proveedor ──────────────────────────────────────────────────────────────────────


class _Plan:
    """Lo que la reserva deja listo para la llamada: los mensajes, el esquema y cómo validar la salida."""

    def __init__(self, *, messages, schema_, effort, validate, token, stage, clave, model):
        self.messages, self.schema, self.effort, self.validate = messages, schema_, effort, validate
        self.token, self.stage, self.clave, self.model = token, stage, clave, model
        self.round = 0


def _context_for(gen: CaseGeneration) -> dict:
    return context.del_lugar(lugares.cargar_lugar(gen.lugar_id), context.competencias_por_defecto())


#: Dónde vive la salida rechazada del esqueleto mientras no hay esqueleto: dentro de ``scenes_json`` (``view`` solo lee ahí las
#: salas del esqueleto, y sus claves, ``[a-z0-9-]``, nunca chocan con esta). Al aceptarse el esqueleto ``scenes_json`` se
#: reescribe entero y la entrada desaparece.
SKELETON_REJECTED_KEY = "__skeleton__"


def _plan_skeleton(gen, config, ctx, token) -> _Plan:
    rejected = _loads(gen.scenes_json, {}).get(SKELETON_REJECTED_KEY)
    reparar = None
    if isinstance(rejected, dict) and rejected.get("rejected") is not None:
        # La salida rechazada por ``checks`` se reintenta como una reparación: el modelo corrige en vez de empezar de cero.
        reparar = {"anterior": rejected["rejected"], "faltas": list(rejected.get("motivos", []))}
    return _Plan(
        messages=prompts.skeleton_messages(ctx, gen.description, reparar), schema_=schema.SKELETON, effort=config.generate_effort_skeleton,
        validate=lambda raw: checks.validate_skeleton(raw, ctx), token=token, stage="skeleton", clave=None,
        model=config.model_generate,
    )


def _plan_scene(gen, config, ctx, token, clave, entry, repair: bool) -> _Plan:
    sk_dict = json.loads(gen.skeleton_json)
    sk = checks.from_json(SkeletonDraft, sk_dict)
    reparar = None
    faltas: list[str] = []
    validador: list[str] = []  # mensajes del validador del caso: pueden citar texto que escribió el modelo
    anterior = None
    if entry.get("rejected"):
        # La salida rechazada por ``checks`` se reintenta como una reparación: el modelo corrige en vez de empezar de cero.
        anterior, faltas = entry["rejected"], list(entry.get("motivos", []))
    elif repair and entry.get("data"):
        anterior = entry["data"]
    if repair:
        issues = (_loads(gen.repair_json, {}).get("issues") or {}).get(clave, [])
        validador = [issue["message"] for issue in issues if isinstance(issue, dict) and issue.get("message")]
    if anterior is not None:
        reparar = {"anterior": anterior, "faltas": faltas, "faltas_validador": validador}
    return _Plan(
        messages=prompts.scene_messages(ctx, sk_dict, clave, reparar), schema_=schema.SCENE, effort=config.generate_effort_scene,
        validate=lambda raw: checks.validate_scene(raw, sk, clave, ctx), token=token, stage="scene", clave=clave,
        model=config.model_generate,
    )


def _reserve(gen_id, actor, transition: str, clave: str | None, config) -> _Plan:
    """Paso 1: reserva corta. Comprueba y marca la etapa ``running``; todo lo que falle aquí no deja nada a medias."""
    with transaction.atomic():
        gen = _owned(gen_id, actor, lock=True)
        if not lifecycle.can(gen.status, transition):
            raise GenerationState()
        now = timezone.now()
        scenes = _loads(gen.scenes_json, {})
        if transition == "skeleton":
            if gen.skeleton_started_at is not None and not lifecycle.is_stale(gen.skeleton_started_at, now):
                raise GenerationBusy()
            if gen.calls >= config.generation_max_calls:
                raise GenerationCallsExhausted()
            plan = _plan_skeleton(gen, config, _context_for(gen), now)
            gen.skeleton_started_at = now
        else:
            order = [o["sala"] for o in _loads(gen.skeleton_json, {}).get("escenas", [])]
            if clave not in order:
                raise _not_found()
            entry = scenes.setdefault(clave, {"state": "pending", "data": None, "error": None, "started_at": None})
            repair = transition == "repair_scene"
            if repair and clave not in (_loads(gen.repair_json, {}).get("scenes") or []):
                raise GenerationState()
            if entry.get("state") == "running":
                started = _parse(entry.get("started_at"))
                if not lifecycle.is_stale(started, now):
                    raise GenerationBusy()
            elif entry.get("state") not in ("pending", "error"):
                raise GenerationState()
            in_flight = sum(
                1 for key, other in scenes.items()
                if key != clave and isinstance(other, dict) and other.get("state") == "running"
                and not lifecycle.is_stale(_parse(other.get("started_at")), now)
            )
            if in_flight >= MAX_SCENES_IN_FLIGHT:
                raise GenerationBusy()
            if gen.calls >= config.generation_max_calls:
                raise GenerationCallsExhausted()
            plan = _plan_scene(gen, config, _context_for(gen), now, clave, entry, repair)
            entry.update(state="running", started_at=now.isoformat())
            gen.scenes_json = json.dumps(scenes, ensure_ascii=False)
        gen.calls += 1
        plan.round = gen.repair_rounds
        gen.save()
    return plan


def _parse(value) -> datetime | None:
    try:
        return datetime.fromisoformat(value) if value else None
    except (TypeError, ValueError):
        return None


def _usage(meta: dict) -> tuple[int, int]:
    try:
        usage = meta.get("usage") or {}
        tokens_in = sum(int(usage.get(k) or 0) for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"))
        return tokens_in, int(usage.get("output_tokens") or 0)
    except (TypeError, ValueError, AttributeError):
        return 0, 0


def _call(plan: _Plan, config, meta: dict):
    """Pasos 2 y 3: la llamada (sin transacción) y la validación. Devuelve ``(borrador, kind, rechazado, motivos)``."""
    raw = None
    try:
        provider = provider_class(config.provider)(config.api_key, config.model_generate)
        raw = provider.complete_structured(
            prompts.SYSTEM_GENERATE, plan.messages, plan.schema, config.model_generate,
            max_tokens=config.generate_max_tokens, timeout=config.generate_timeout_seconds,
            effort=plan.effort, fallbacks=config.generate_fallbacks or None, meta=meta,
        )
        return plan.validate(raw), None, None, None
    except ProviderError as exc:
        return None, exc.kind if exc.kind in MESSAGES else "http", None, None
    except GenerationInvalid as exc:
        return None, "malformed", raw, list(exc.motivos)
    except Exception as exc:  # noqa: BLE001 - un fallo inesperado deja la etapa retomable en vez de colgada en «en curso»
        # Solo la clase y la etapa: el mensaje de la excepción podría traer texto del modelo o de la docente.
        logger.error("generation_stage_unexpected", extra={"fields": {"stage": plan.stage, "error_class": type(exc).__name__}})
        return None, "http", None, None


def _save(gen_id, actor, plan: _Plan, draft, kind, rejected, motivos, tokens: tuple[int, int]) -> str:
    """Paso 4: guardado corto con cerrojo. Devuelve ``ok``, ``error`` o ``discarded``."""
    with transaction.atomic():
        gen = _owned(gen_id, actor, lock=True)
        scenes = _loads(gen.scenes_json, {})
        if plan.stage == "skeleton":
            mine = gen.skeleton_started_at == plan.token
        else:
            mine = (scenes.get(plan.clave) or {}).get("started_at") == plan.token.isoformat()
        if gen.status == GenerationStatus.CANCELLED or not mine:
            return "discarded"
        gen.tokens_in += tokens[0]
        gen.tokens_out += tokens[1]
        last_error = _loads(gen.last_error_json, {})
        same_stage = last_error.get("stage") == plan.stage and last_error.get("clave") == plan.clave
        if plan.stage == "skeleton":
            gen.skeleton_started_at = None
            if kind is None:
                gen.skeleton_json = json.dumps(checks.as_json(draft), ensure_ascii=False)
                gen.scenes_json = json.dumps(
                    {o.sala: {"state": "pending", "data": None, "error": None, "started_at": None} for o in draft.escenas},
                    ensure_ascii=False,
                )
                gen.status = GenerationStatus.SKELETON_READY
            elif rejected is not None:  # solo para reintentar como reparación; la API nunca lo devuelve
                scenes[SKELETON_REJECTED_KEY] = {"rejected": rejected, "motivos": motivos}
                gen.scenes_json = json.dumps(scenes, ensure_ascii=False)
        else:
            entry = scenes[plan.clave]
            entry["started_at"] = None
            if kind is None:
                entry.update(state="done", data=checks.as_json(draft), error=None)
                entry.pop("rejected", None)
                entry.pop("motivos", None)
                gen.status = _status_after_scene(gen, scenes)
            else:
                entry.update(state="error", error={"kind": kind, "message": MESSAGES[kind]})
                if rejected is not None:  # solo para reintentar como reparación; la API nunca lo devuelve
                    entry.update(rejected=rejected, motivos=motivos)
            gen.scenes_json = json.dumps(scenes, ensure_ascii=False)
        if kind is None:
            if same_stage:
                gen.last_error_json = "{}"
        else:
            gen.last_error_json = json.dumps(
                {"stage": plan.stage, "clave": plan.clave, "kind": kind, "message": MESSAGES[kind]}, ensure_ascii=False,
            )
        gen.save()
    return "ok" if kind is None else "error"


def _status_after_scene(gen: CaseGeneration, scenes: dict) -> str:
    order = [o["sala"] for o in _loads(gen.skeleton_json, {}).get("escenas", [])]
    if gen.status == GenerationStatus.NEEDS_REPAIR:
        # ``after_scene`` devolvería ``skeleton_ready`` mientras alguna escena no esté ``done``: en reparación solo se mira
        # las escenas marcadas.
        marked = _loads(gen.repair_json, {}).get("scenes") or []
        if all((scenes.get(key) or {}).get("state") == "done" for key in marked):
            return GenerationStatus.SCENES_READY
        return GenerationStatus.NEEDS_REPAIR
    return lifecycle.after_scene(scenes, order)


def _run_stage(gen_id, actor, transition: str, clave: str | None) -> dict:
    config = _config()
    plan = _reserve(gen_id, actor, transition, clave, config)
    started = time.monotonic()
    meta: dict = {}
    try:
        draft, kind, rejected, motivos = _call(plan, config, meta)
        tokens = _usage(meta)
        if motivos:
            # Los motivos son textos fijos de ``checks.FIXED_MOTIVOS``: nunca texto del modelo ni de la descripción.
            logger.warning(
                "generation_stage_rejected generation=%s stage=%s clave=%s motivos=%s", gen_id, plan.stage, plan.clave, motivos,
                extra={"fields": {"generation_id": str(gen_id), "stage": plan.stage, "clave": plan.clave, "motivos": motivos}},
            )
    except BaseException as exc:
        # Cualquier fallo antes del guardado dejaría la etapa «en curso» (409 ocupado hasta 150 s): se suelta como error.
        logger.error("generation_stage_unexpected", extra={"fields": {"stage": plan.stage, "error_class": type(exc).__name__}})
        _save(gen_id, actor, plan, None, "http", None, None, (0, 0))
        raise
    outcome = _save(gen_id, actor, plan, draft, kind, rejected, motivos, tokens)
    model = meta.get("model") or config.model_generate
    _audit(
        gen_id, actor, plan.stage, "discarded" if outcome == "discarded" else ("ok" if kind is None else "error"),
        started=started, model=model, kind=kind, tokens=tokens, round_=plan.round,
    )
    if outcome == "discarded":
        raise GenerationState()
    if kind == "refusal":
        raise AiRefused()
    if kind is not None:
        raise AiProviderFailed(kind)
    return view(_owned(gen_id, actor))


def run_skeleton(actor, gen_id) -> dict:
    return _run_stage(gen_id, actor, "skeleton", None)


def run_scene(actor, gen_id, clave: str, *, repair: bool) -> dict:
    return _run_stage(gen_id, actor, "repair_scene" if repair else "scene", clave)


# ─── ensamblado ───────────────────────────────────────────────────────────────────────────────────


def run_assemble(actor, gen_id) -> dict:
    """Ensambla las escenas. No llama a la red: toma la fila con ``nowait`` y la conserva hasta guardar el resultado.

    Un segundo ``assemble`` simultáneo no puede tomar la fila y recibe ``GenerationBusy`` sin esperar; así no se crean dos
    borradores. Si el primero ya confirmó, el estado (``imported``/``needs_repair``…) no admite ``assemble``: ``GenerationState``.
    """
    _config()
    started = time.monotonic()
    with transaction.atomic():
        try:
            gen = _owned(gen_id, actor, lock=True, nowait=True)
        except OperationalError as exc:
            if getattr(getattr(exc, "__cause__", None), "sqlstate", None) != LOCK_NOT_AVAILABLE:
                raise  # caída de conexión, interbloqueo…: no es «ocupado»
            raise GenerationBusy() from None
        if not lifecycle.can(gen.status, "assemble"):
            raise GenerationState()
        result = assembly.assemble(gen, actor)
        rounds = gen.repair_rounds
        gen.report_json = json.dumps(result.issues, ensure_ascii=False)
        if result.result == "imported":
            gen.status = GenerationStatus.IMPORTED
            gen.case_version_id = result.case_version_id
        elif result.result == "needs_repair":
            order = [o["sala"] for o in _loads(gen.skeleton_json, {}).get("escenas", [])]
            marked = [key for key in order if key in result.by_scene]
            scenes = _loads(gen.scenes_json, {})
            for key in marked:  # vuelven a ``pending`` conservando su texto: la reparación parte de él
                scenes[key].update(state="pending", error=None, started_at=None)
            gen.scenes_json = json.dumps(scenes, ensure_ascii=False)
            gen.repair_rounds = rounds = rounds + 1
            gen.repair_json = json.dumps(
                {"round": rounds, "scenes": marked, "issues": {key: result.by_scene[key] for key in marked}},
                ensure_ascii=False,
            )
            gen.status = GenerationStatus.NEEDS_REPAIR
        else:
            gen.status = GenerationStatus.FAILED
            gen.document_json = json.dumps(result.document, ensure_ascii=False)
        if _loads(gen.last_error_json, {}).get("stage") == "assemble":
            gen.last_error_json = "{}"
        gen.save()
    _audit(gen.id, actor, "assemble", "ok" if result.result != "failed" else "error", started=started, round_=rounds)
    return view(gen)
