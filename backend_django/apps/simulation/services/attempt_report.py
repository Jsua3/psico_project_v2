"""Reporte congelado del intento (E1-8, RF-22, RF-23, CU-12, TD-08, N2).

Al completarse un intento se persiste, dentro de la misma transacción, **un** reporte
inmutable (``AttemptReport``). Es un superconjunto del reporte de cierre de siempre
(``game_dtos.build_completion_report``: el frontend actual no cambia) con lo que añade
E1-8: ``schemaVersion``, ``ordinal``, ``definitionHash``, ``decisionReview[]``,
``reflections[]`` (sin el texto de la bitácora) y ``timeByScene``. Lo leen el reporte del
intento, el del estudiante y el historial; leer no escribe. Un intento completado antes
de E1-8 no tiene fila: se sirve en vivo (sin persistirlo) y ``backfill_attempt_reports``
lo congela.

E6-1d (``schemaVersion 2``) añade el perfil por competencia (``competencyLevels``), ``nonRecommendedCount``,
``reflectionCoverage`` y ``keyLearningEvidence``: se calculan UNA vez, al cerrar, con la rúbrica, el catálogo y los
efectos de ese momento, y no se recalculan (un reporte cerrado no cambia). Un reporte v1 sigue siendo v1: se lee tal
cual, sin las claves nuevas.

``schemaVersion 3`` (modelo de métricas) retira lo numérico y lo heurístico: sin ``finalScore``, ``finalStress``,
``metrics``, ``competencies`` ni conteos por clasificación; con ``milestones {done[], missing[]}``, ``persona``,
``ending`` con ``reason``, ``decisionReview[].class``, ``counts`` por clase de respuesta y ``competencyLevels[].evidence[]``.
Las recomendaciones salen solo de hitos faltantes y competencias en inicio (más lo reconsiderado y retomar con
acompañamiento). Un reporte v1 o v2 cerrado se sirve byte a byte: nada lee ``report_schema_version`` para transformarlo.
"""
import hashlib
import json
import logging

from django.db import transaction
from django.db.models import Q

from shared.jsonutils import read_map

from apps.simulation.casedef.vocabulary import ResponseClass
from apps.simulation.serializers import game_dtos as dto

from apps.simulation.assessment import competencies as assessment_competencies
from apps.simulation.assessment import definitions, evidence
from apps.simulation.assessment import evaluation as system_evaluation

from ..models import (
    AttemptEvent,
    AttemptReport,
    AttemptStatus,
    CaseVersion,
    DecisionOption,
    FormativeLevel,
    ReflectionJournal,
    SimulationAttempt,
    SimulationNode,
)
from . import attempt_duration, case_effects, case_rules, case_state

logger = logging.getLogger(__name__)

#: 1 = E1-8; 2 = E6-1d (perfil por competencia, no recomendadas, cobertura, evidencia); 3 = modelo de métricas
#: (hitos, persona, clases de respuesta; sin puntaje, estrés ni competencias heurísticas).
REPORT_SCHEMA_VERSION = 3


def load_events(attempt_id):
    """Los eventos del intento en orden, con lo que el reporte lee de cada uno."""
    return list(
        AttemptEvent.objects.filter(attempt_id=attempt_id)
        .select_related("node", "decision_option__target_node")
        .order_by("occurred_at", "id")
    )


def case_definition_hash(case_version_id):
    """Huella (sha256) de la definición del caso tal como está ahora: grafo, textos, clases, efectos y reglas.

    Mira la clase de respuesta, los efectos, las reglas y la intensidad de cada escena; ya no las columnas retiradas
    (clasificación, puntaje, estrés, penalización y conducta prohibida). La huella de un reporte v1 o v2 ya cerrado
    no se recalcula.

    Es la «versión» con la que se cerró el intento: si después cambia cualquier texto o efecto,
    el reporte guarda la huella de lo que la persona vio.
    """
    rules = CaseVersion.objects.filter(pk=case_version_id).values_list("rules", flat=True).first()
    nodes = list(
        SimulationNode.objects.filter(case_version_id=case_version_id)
        .order_by("node_key")
        .values_list(
            "node_key", "title", "narrative", "start_node", "terminal_node", "sensitive_content", "intensity",
        )
    )
    options = list(
        DecisionOption.objects.filter(case_version_id=case_version_id)
        .order_by("option_key")
        .values_list(
            "option_key", "source_node__node_key", "target_node__node_key", "text", "response_class",
            "immediate_feedback", "consequence_text", "theory_basis", "feedback_text", "effects",
        )
    )
    canonical = json.dumps(
        {"nodes": nodes, "options": options, "rules": read_map(rules)},
        sort_keys=True, ensure_ascii=False, separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def attempt_ordinal(attempt):
    """N.º de intento del estudiante en el **caso** (todas sus versiones), contando este (R10)."""
    return SimulationAttempt.objects.filter(
        student_id=attempt.student_id,
        case_version__simulation_case_id=attempt.case_version.simulation_case_id,
    ).filter(
        Q(started_at__lt=attempt.started_at) | Q(started_at=attempt.started_at, id__lte=attempt.id)
    ).count()


def build_decision_review(events):
    """``decisionReview[]``: una entrada por decisión registrada, en el orden en que ocurrieron."""
    review = []
    first_answers = {}  # nodo → primera respuesta que el juego no aplicó (reintento)
    for ev in events:
        if not ev.decision_option_id:
            continue
        if ev.event_type in case_effects.RETRY_EVENT_TYPES:
            first_answers.setdefault(ev.node_id, ev.decision_option)
            continue
        if ev.event_type not in case_effects.REGISTERED_DECISION_EVENT_TYPES:
            continue
        option = ev.decision_option
        response_class = case_state.response_class_of(option)
        feedback = {"explanation": option.feedback_text or option.immediate_feedback or ""}
        if option.theory_basis:
            feedback["theoryBasis"] = option.theory_basis
        item = {
            "order": len(review) + 1,
            "nodeId": ev.node_id,
            "nodeTitle": ev.node.title if ev.node_id else "",
            "chosen": {"optionId": option.id, "text": option.text},
            "consequence": dto.consequence_dto(option)["text"],
            "feedback": feedback,
            "class": response_class.value,
            "prohibited": response_class == ResponseClass.CONTRAINDICATED,
        }
        first = first_answers.pop(ev.node_id, None)
        if first is not None:
            item["reconsidered"] = {"firstOptionId": first.id, "firstOptionText": first.text}
        review.append(item)
    return review


def _competency_levels(attempt, events):
    """El perfil por competencia; es un dato derivado y NUNCA impide cerrar ni leer un reporte: si falla, queda vacío (y
    se registra). Va en un punto de guardado para que un error de base de datos no deje abortada la transacción."""
    try:
        with transaction.atomic():
            return assessment_competencies.competency_profile(attempt, events)
    except Exception:  # noqa: BLE001 - el cierre del intento no depende de su perfil por competencia
        logger.exception("No se pudo calcular el perfil por competencia del intento %s", attempt.id)
        return []


def _milestone_entry(milestone):
    return {"key": milestone.key, "label": milestone.label, "decisive": milestone.decisive}


def build_milestones(attempt):
    """``{"done": [...], "missing": [...]}``: los hitos del caso cumplidos y los que faltaron, cada uno ``{key, label, decisive}``.

    ``done`` va en el orden en que se cumplieron (lo guardado en el estado del mundo); un hito cumplido que la versión
    ya no declara se conserva con ``label = key``. ``missing`` son los declarados que no se cumplieron, en el orden en
    que el caso los declara.
    """
    declared = {m.key: m for m in case_rules.rules_of(attempt.case_version).milestones}
    in_order = case_state.milestones_in_order(attempt)
    done = [
        _milestone_entry(declared[key]) if key in declared else {"key": key, "label": key, "decisive": False}
        for key in in_order
    ]
    missing = [_milestone_entry(m) for key, m in declared.items() if key not in in_order]
    return {"done": done, "missing": missing}


def _lower_first(text):
    """El texto con la primera letra en minúscula (el resto, como está: «ICBF» no se vuelve «icbf»)."""
    text = text.strip().rstrip(".")
    return text[:1].lower() + text[1:]


def build_recommendations(milestones, competency_levels, base):
    """Las recomendaciones del reporte v3: hitos faltantes (los decisivos primero), competencias en inicio y las de hechos.

    Nada más: sin recomendación por puntaje, estrés ni una genérica de relleno; una lista vacía es válida.
    ``base`` son las de hechos que arma el DTO (lo reconsiderado y retomar con acompañamiento).
    """
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23)
    missing = sorted(milestones["missing"], key=lambda m: not m["decisive"])  # estable: conserva el orden del caso
    from_milestones = [
        f"Revisa cómo {_lower_first(m['label'])}: es un paso del caso que quedó sin cumplir." for m in missing
    ]
    from_competencies = [
        f"Refuerza {entry['name']}: en las respuestas que la ponen en juego estás en inicio, repásalo con tu docente."
        for entry in competency_levels
        if entry.get("level") == FormativeLevel.EN_INICIO.value
    ]
    return from_milestones + from_competencies + list(base)


def build_report_payload(attempt, events, ordinal=None, definition_hash=None):
    """El reporte completo (superconjunto del de cierre) con lo de E1-8, v3."""
    payload = dto.build_completion_report(attempt, events, class_of=case_state.response_class_of)
    # La lista nombra las notas (sin su texto: solo el dueño lo lee, por su propia ruta).
    reflections = [
        {"nodeId": r.node_id, "nodeTitle": r.node.title, "locked": r.locked}
        for r in ReflectionJournal.objects.filter(attempt_id=attempt.id).select_related("node").order_by("node_id")
    ]
    competency_levels = _competency_levels(attempt, events)
    coverage = evidence.reflection_coverage(
        [r["nodeId"] for r in reflections], evidence.decision_scene_ids(events), definitions.reflection_definition()
    )
    # Solo las decisiones registradas cuentan por clase: los reintentos se reportan aparte.
    decisions = [
        ev.decision_option for ev in events
        if ev.decision_option_id and ev.event_type in case_effects.REGISTERED_DECISION_EVENT_TYPES
    ]
    by_class = case_state.counts(decisions)
    milestones = build_milestones(attempt)
    payload.update({
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "ordinal": ordinal if ordinal is not None else attempt_ordinal(attempt),
        "definitionHash": definition_hash or case_definition_hash(attempt.case_version_id),
        "counts": {
            **by_class,
            "retries": payload["retries"],
            "prohibitedRetries": payload["prohibitedRetries"],
            "toolsUsed": payload["toolsUsed"],
            "reflections": payload["reflectionsCount"],
        },
        "milestones": milestones,
        "persona": case_state.persona_dto(case_state.read(attempt).persona),
        "recommendations": build_recommendations(milestones, competency_levels, payload["recommendations"]),
        "decisionReview": build_decision_review(events),
        "reflections": reflections,
        # E6-1d: nombres de nivel, nunca un índice numérico (RN-09).
        "competencyLevels": competency_levels,
        "profileRules": definitions.PROFILE_RULES,  # la versión de la regla con la que se calculó (E6, revisión I-3)
        "nonRecommendedCount": evidence.non_recommended_count(events),
        "reflectionCoverage": coverage,
        "keyLearningEvidence": evidence.key_learning_evidence(
            attempt.status == AttemptStatus.COMPLETED, coverage, competency_levels
        ),
        "timeByScene": [
            {"nodeId": scene["nodeId"], "seconds": round(scene["seconds"], 1)}
            for scene in attempt_duration.scene_durations(
                [(ev.event_type, ev.node_id, ev.occurred_at) for ev in events], end_at=attempt.ended_at
            )
        ],
    })
    return payload


def freeze_report(attempt, events=None):
    """Persiste el reporte del intento (una sola vez; idempotente) y devuelve la fila."""
    existing = AttemptReport.objects.filter(attempt_id=attempt.id).first()
    if existing is not None:
        return existing
    events = events if events is not None else load_events(attempt.id)
    ordinal = attempt_ordinal(attempt)
    definition_hash = case_definition_hash(attempt.case_version_id)
    payload = build_report_payload(attempt, events, ordinal, definition_hash)
    row = AttemptReport.objects.create(
        attempt=attempt,
        report_json=json.dumps(payload, ensure_ascii=False),
        report_schema_version=REPORT_SCHEMA_VERSION,
        definition_hash=definition_hash,
        attempt_ordinal=ordinal,
    )
    _record_system_evaluation(attempt, payload)
    return row


#: Evento de que el estudiante abrió su retroalimentación (E6-4). Sin nodo ni opción.
FEEDBACK_VIEWED = "FEEDBACK_VIEWED"
#: Su clave de idempotencia: el ``request_id`` único por intento hace que la base descarte la segunda fila. Lleva una
#: «/», que ningún cliente puede mandar en un ``requestId`` (``shared.idempotency``), así que no choca con las órdenes.
FEEDBACK_VIEWED_KEY = "sistema/retroalimentacion-vista"


def _insert_feedback_viewed(attempt):
    AttemptEvent.objects.bulk_create(
        [AttemptEvent(
            attempt=attempt, event_type=FEEDBACK_VIEWED, request_id=FEEDBACK_VIEWED_KEY,
            detail="Retroalimentación vista",  # BORRADOR: texto nuevo del servidor, pendiente de Psicología (VD-23)
        )],
        ignore_conflicts=True,  # INSERT … ON CONFLICT DO NOTHING: a lo sumo una fila por intento, sin comprobar antes
    )


def record_feedback_viewed(attempt, actor):
    """Registra que el dueño de un intento COMPLETADO abrió su reporte (E6-4, R13); solo la primera vez cuenta.

    Es la única escritura de una lectura y por eso es estrecha: solo el dueño (el docente y el ADMIN leen sin escribir),
    solo un intento completado, y nunca rompe la lectura —en un punto de guardado— si la escritura falla.
    """
    if attempt.status != AttemptStatus.COMPLETED or attempt.student_id != actor.id:
        return
    try:
        with transaction.atomic():
            _insert_feedback_viewed(attempt)
    except Exception:  # noqa: BLE001 - la lectura del reporte no depende de este evento
        logger.exception("No se pudo registrar que el intento %s vio su retroalimentación", attempt.id)


def _record_system_evaluation(attempt, payload):
    """La evaluación automática (E6-1e) deriva del reporte que acaba de congelarse y NUNCA rompe el cierre: es un dato
    derivado, como lo que escuchan los suscriptores de ``attempt_completed`` (``send_robust``). Va en un punto de
    guardado para que un fallo de base de datos no deje abortada la transacción que cierra el intento."""
    try:
        with transaction.atomic():
            system_evaluation.record_system_evaluation(attempt, payload)
    except Exception:  # noqa: BLE001 - el cierre del intento no depende de su evaluación automática
        logger.exception("No se pudo crear la evaluación del sistema del intento %s", attempt.id)


def repair_system_evaluation(attempt):
    """Crea la evaluación del sistema de un intento CERRADO con reporte v2 que no la tiene; devuelve la fila o ``None``.

    La crea ``freeze_report`` al cerrar, pero ahí un fallo transitorio (un deadlock, un tiempo de espera) solo se
    registra y el intento quedaría sin ella para siempre: este es el camino de reparación (lo usa
    ``backfill_attempt_reports``). Lee el reporte CONGELADO —no recalcula nada— y, a diferencia del cierre, deja
    pasar el error para que quien repara sepa que no pudo. Un reporte v1 no tiene niveles de qué derivarla.
    """
    frozen = frozen_report_for(attempt.id)
    if frozen is None or frozen.get("schemaVersion", 1) < 2:
        return None
    return system_evaluation.record_system_evaluation(attempt, frozen)


def frozen_report_for(attempt_id):
    """El reporte congelado del intento como diccionario, o ``None`` si no hay."""
    raw = AttemptReport.objects.filter(attempt_id=attempt_id).values_list("report_json", flat=True).first()
    return json.loads(raw) if raw else None


def report_for(attempt):
    """El reporte del intento: el congelado si es un intento completado con fila; si no, en vivo.

    En vivo no se persiste (leer no escribe). Un intento completado antes de E1-8 se arma con el reporte completo (v3).
    Un reporte congelado v1 o v2 se devuelve tal cual, sin transformarlo. Uno que no se completó (pausado,
    reemplazado, salida segura histórica) no tiene reporte de cierre: recibe solo el resumen, sin decisiones, clases,
    hitos, competencias ni final, para que nada que califique su recorrido llegue antes de cerrar.
    """
    if attempt.status == AttemptStatus.COMPLETED:
        frozen = frozen_report_for(attempt.id)
        if frozen is not None:
            return frozen
        return build_report_payload(attempt, load_events(attempt.id))
    return dto.build_student_summary(attempt, load_events(attempt.id))
