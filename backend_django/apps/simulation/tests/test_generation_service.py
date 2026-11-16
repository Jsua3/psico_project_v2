"""C1 · Tarea 6 · El servicio por etapas (``generation/service.py``): límites, cerrojos, reparación y auditoría.

Todo corre con el proveedor falso (o con ``post_json`` sustituido para las respuestas mal formadas de un proveedor real) y
nunca toca la red. Las pruebas multihilo usan ``real_commits`` y limpian lo que crean; las demás van en la transacción de la
prueba. Las competencias de la rúbrica se sustituyen (``COMPETENCIAS``) para no depender de la siembra.
"""
import copy
import json
import time
import uuid
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.simulation.models import AuditLog, CaseGeneration, SimulationCase
from apps.simulation.services import ai_providers
from apps.simulation.services.ai_providers import FAKE_FIXTURES, FakeProvider, ProviderError
from apps.simulation.services.authoring.generation import assembly, checks, context, lifecycle, service
from apps.simulation.services.authoring.generation.checks import PERSONAL_DATA_MOTIVO
from shared.exceptions import ApiError
from shared.testing import purge_audit_rows, run_concurrently

User = get_user_model()
SECRETO = "TEXTO-SECRETO-DE-LA-DESCRIPCION"
DESCRIPCION = (
    f"Una estudiante de segundo semestre se queda sola después de clase y necesita que la acompañen con calma. {SECRETO}"
)
KEY = "sk-ant-clave-de-prueba-0123456789"
COMPETENCIAS = [
    {"codigo": codigo, "nombre": codigo.title()}
    for codigo in ("PAP", "COMUNICACION_EMPATIA", "DECISION_RUTA", "COMPRENSION_SITUACION", "REFLEXION")
]
SALAS = ["aula", "bienestar", "sala-espera", "consultorio"]
CARPETA = FAKE_FIXTURES / "universidad"


@pytest.fixture(autouse=True)
def _config(settings, monkeypatch):
    settings.AI_AUTHORING_ENABLED = True
    settings.AI_AUTHORING_PROVIDER = "fake"
    settings.AI_AUTHORING_GENERATIONS_PER_DAY = 5
    settings.AI_AUTHORING_GENERATION_MAX_CALLS = 20
    monkeypatch.setattr(context, "competencias_por_defecto", lambda: COMPETENCIAS)


def _user(prefix, role="PROFESOR"):
    return User.objects.create_user(
        email=f"{prefix}_{uuid.uuid4().hex[:8]}@x.com", password="pass1234", nombre="N", apellido="A", role=role,
    )


@pytest.fixture
def docente(db):
    return _user("gensvc_doc")


@pytest.fixture
def otra(db):
    return _user("gensvc_otra")


def limpiar(user):
    """Borra a la persona de una prueba multihilo: primero sus filas de auditoría (la base solo las suelta en su ventana)."""
    purge_audit_rows(AuditLog.objects.filter(actor_id=user.pk))
    user.delete()


def leer(nombre):
    return json.loads((CARPETA / nombre).read_text(encoding="utf-8"))


def crear(docente, descripcion=DESCRIPCION):
    return service.start(docente, "universidad", descripcion)["id"]


def con_esqueleto(docente, descripcion=DESCRIPCION):
    gid = crear(docente, descripcion)
    return gid, service.run_skeleton(docente, gid)


def con_escenas(docente, descripcion=DESCRIPCION):
    gid, vista = con_esqueleto(docente, descripcion)
    for escena in vista["skeleton"]["escenas"]:
        vista = service.run_scene(docente, gid, escena["clave"], repair=False)
    return gid, vista


def filas():
    return AuditLog.objects.filter(action="AI_AUTHORING_GENERATE").order_by("id")


def contexto(fila):
    return json.loads(fila.context_json)


def sin_gastar_proveedor(monkeypatch):
    """Cuenta las llamadas al proveedor falso (para probar que una petición rechazada no gasta ninguna)."""
    llamadas = []
    original = FakeProvider.complete_structured

    def contado(self, *args, **kwargs):
        llamadas.append(1)
        return original(self, *args, **kwargs)

    monkeypatch.setattr(FakeProvider, "complete_structured", contado)
    return llamadas


def con_demora(monkeypatch, segundos=0.8):
    """El proveedor falso tarda: las peticiones simultáneas se solapan de verdad."""
    original = FakeProvider.complete_structured

    def lento(self, *args, **kwargs):
        time.sleep(segundos)
        return original(self, *args, **kwargs)

    monkeypatch.setattr(FakeProvider, "complete_structured", lento)


# ─── la tubería ───────────────────────────────────────────────────────────────────────────────────


def test_la_tuberia_completa_con_el_falso_importa(db, docente):
    gid, vista = con_escenas(docente)
    assert vista["status"] == "scenes_ready"
    assert [e["state"] for e in vista["scenes"]] == ["done"] * 4
    assert vista["callsUsed"] == 5 and vista["lastError"] is None

    final = service.run_assemble(docente, gid)

    assert final["status"] == "imported" and final["caseVersionId"]
    assert SimulationCase.objects.filter(versions__pk=final["caseVersionId"]).exists()
    assert service.status(docente)["inProgress"] is None
    assert "document_json" not in final and "documentJson" not in final


def test_el_estado_dice_cuanto_le_queda_y_la_generacion_en_curso(db, docente):
    assert service.status(docente) == {"enabled": True, "remainingToday": 5, "inProgress": None}
    gid = crear(docente)
    estado = service.status(docente)
    assert estado["remainingToday"] == 4 and estado["inProgress"]["id"] == gid
    service.cancel(docente, gid)  # las canceladas cuentan
    assert service.status(docente)["remainingToday"] == 4 and service.status(docente)["inProgress"] is None


def test_una_sola_en_curso_y_la_segunda_recibe_su_id(db, docente):
    primera = crear(docente)
    with pytest.raises(service.GenerationInProgress) as error:
        crear(docente)
    assert error.value.status_code == 409 and error.value.api_code == "GENERATION_IN_PROGRESS"
    assert error.value.extra["generationId"] == primera
    assert error.value.detail == "Ya tienes un caso generándose. Retómalo o cancélalo para empezar otro."


def test_una_abandonada_hace_24_h_se_cancela_sola_al_crear_otra(db, docente):
    vieja = crear(docente)
    CaseGeneration.objects.filter(pk=vieja).update(updated_at=timezone.now() - timedelta(hours=25))
    nueva = crear(docente)
    assert nueva != vieja
    assert CaseGeneration.objects.get(pk=vieja).status == "cancelled"


def test_leer_el_estado_cancela_la_abandonada(db, docente):
    vieja = crear(docente)
    CaseGeneration.objects.filter(pk=vieja).update(updated_at=timezone.now() - timedelta(hours=lifecycle.ABANDONED_HOURS + 1))
    assert service.status(docente)["inProgress"] is None
    assert CaseGeneration.objects.get(pk=vieja).status == "cancelled"


# ─── la descripción ───────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("texto, mensaje", [
    ("corta", "Cuéntanos un poco más: al menos 40 caracteres."),
    ("x" * 2001, "La descripción puede tener hasta 2000 caracteres."),
])
def test_la_descripcion_se_valida_antes_de_crear(db, docente, texto, mensaje):
    with pytest.raises(ApiError) as error:
        service.start(docente, "universidad", texto)
    assert error.value.api_code == "VALIDATION_ERROR" and error.value.status_code == 400
    assert error.value.extra["field"] == "descripcion" and error.value.detail == mensaje
    assert CaseGeneration.objects.count() == 0


def test_datos_personales_en_la_descripcion_no_crean_nada_ni_llaman_al_proveedor(db, docente, monkeypatch):
    llamadas = sin_gastar_proveedor(monkeypatch)
    texto = "La estudiante escribe a maria.perez@correo.com cuando se siente sola después de clase y necesita ayuda."
    with pytest.raises(ApiError) as error:
        service.start(docente, "universidad", texto)
    assert error.value.status_code == 400 and error.value.api_code == "VALIDATION_ERROR"
    assert error.value.extra["field"] == "descripcion" and error.value.detail == PERSONAL_DATA_MOTIVO
    assert "maria.perez" not in str(error.value.detail)
    assert CaseGeneration.objects.count() == 0 and not filas().exists() and llamadas == []


def test_un_lugar_que_no_existe_es_404_y_uno_vacio_es_400(db, docente):
    with pytest.raises(Exception) as error:
        service.start(docente, "no-existe", DESCRIPCION)
    assert error.value.status_code == 404
    with pytest.raises(ApiError) as error:
        service.start(docente, "", DESCRIPCION)
    assert error.value.status_code == 400 and error.value.extra["field"] == "lugarId"


# ─── el tope diario ───────────────────────────────────────────────────────────────────────────────


def test_el_tope_diario_da_429_con_su_texto(db, docente, settings):
    settings.AI_AUTHORING_GENERATIONS_PER_DAY = 2
    for _ in range(2):
        service.cancel(docente, crear(docente))
    with pytest.raises(service.DailyLimitExceeded) as error:
        crear(docente)
    assert error.value.status_code == 429 and error.value.api_code == "AI_LIMIT_EXCEEDED" and error.value.scope == "daily"
    assert error.value.detail == "Llegaste al límite de casos generados por hoy."
    assert service.status(docente)["remainingToday"] == 0


def test_el_tope_diario_al_borde(real_commits, settings):
    user = _user("gensvc_borde")
    try:
        settings.AI_AUTHORING_GENERATIONS_PER_DAY = 5
        for _ in range(4):  # cuatro creadas hoy (terminales): queda un cupo
            CaseGeneration.objects.create(owner=user, lugar_id="universidad", description="x" * 50, status="cancelled")

        resultados = run_concurrently(lambda: crear(user), lambda: crear(user))

        errores = [r.error for r in resultados if r.error is not None]
        assert len(errores) == 1 and isinstance(errores[0], service.DailyLimitExceeded)
        assert sum(1 for r in resultados if r.error is None) == 1
        assert CaseGeneration.objects.filter(owner=user).count() == 5
    finally:
        limpiar(user)


# ─── el tope de llamadas ──────────────────────────────────────────────────────────────────────────


def test_el_tope_de_llamadas_corta_los_reintentos(db, docente, settings, monkeypatch):
    settings.AI_AUTHORING_GENERATION_MAX_CALLS = 2
    gid = crear(docente, DESCRIPCION + " [falso:timeout]")
    llamadas = sin_gastar_proveedor(monkeypatch)
    for _ in range(2):  # una etapa que falla también gasta su llamada
        with pytest.raises(service.AiProviderFailed):
            service.run_skeleton(docente, gid)
    assert CaseGeneration.objects.get(pk=gid).calls == 2

    with pytest.raises(service.GenerationCallsExhausted) as error:
        service.run_skeleton(docente, gid)

    assert error.value.status_code == 429 and error.value.api_code == "GENERATION_CALLS_EXHAUSTED"
    assert error.value.detail == "Este caso ya usó todos sus intentos con la IA. Empieza uno nuevo."
    assert len(llamadas) == 2 and CaseGeneration.objects.get(pk=gid).calls == 2


# ─── fallos del proveedor ─────────────────────────────────────────────────────────────────────────

MENSAJES = {
    "timeout": "La IA tardó demasiado en responder. Vuelve a intentarlo.",
    "http": "No pudimos hablar con la IA. Vuelve a intentarlo en un momento.",
    "malformed": "La IA respondió algo que no pudimos usar. Vuelve a intentarlo.",
    "refusal": "La IA no quiso escribir esta parte. Prueba a describir el caso con otras palabras.",
}
CASOS = [
    ("[falso:timeout]", "timeout", "AI_PROVIDER_ERROR", 502), ("[falso:http]", "http", "AI_PROVIDER_ERROR", 502),
    ("[falso:malformed]", "malformed", "AI_PROVIDER_ERROR", 502), ("[falso:refusal]", "refusal", "AI_REFUSED", 422),
]


@pytest.mark.parametrize("marca, kind, codigo, estado", CASOS)
def test_cada_kind_deja_lasterror_con_su_mensaje_y_el_esqueleto_sigue_retomable(db, docente, marca, kind, codigo, estado):
    gid = crear(docente, f"{DESCRIPCION} {marca}")

    with pytest.raises(ApiError) as error:
        service.run_skeleton(docente, gid)

    assert error.value.api_code == codigo and error.value.status_code == estado
    assert error.value.detail == MENSAJES[kind]
    if codigo == "AI_PROVIDER_ERROR":
        assert error.value.extra["kind"] == kind
    vista = service.get(docente, gid)
    assert vista["status"] == "created"  # el estado guardado ya refleja el error y no avanzó
    assert vista["lastError"] == {"stage": "skeleton", "clave": None, "kind": kind, "message": MENSAJES[kind]}
    assert CaseGeneration.objects.get(pk=gid).skeleton_started_at is None  # se puede volver a pedir ya
    fila = filas().last()
    assert contexto(fila)["stage"] == "skeleton" and contexto(fila)["outcome"] == "error" and contexto(fila)["kind"] == kind
    assert "fallo" not in json.dumps(contexto(fila)) and SECRETO not in json.dumps(contexto(fila))


@pytest.mark.parametrize("kind", ["timeout", "http", "malformed", "refusal"])
def test_un_fallo_en_una_escena_la_deja_en_error_y_retomable(db, docente, monkeypatch, kind):
    gid, vista = con_esqueleto(docente)
    original = FakeProvider.complete_structured
    fallos = [True]

    def falla_una_vez(self, system, messages, schema, model, *args, **kwargs):
        if fallos and "Etapa: escena aula" in FakeProvider._ultimo_texto(messages):
            fallos.pop()
            raise ProviderError(kind, "detalle interno del proveedor")
        return original(self, system, messages, schema, model, *args, **kwargs)

    monkeypatch.setattr(FakeProvider, "complete_structured", falla_una_vez)

    with pytest.raises(ApiError) as error:
        service.run_scene(docente, gid, "aula", repair=False)

    assert error.value.detail == MENSAJES[kind] and "detalle interno" not in str(error.value.detail)
    vista = service.get(docente, gid)
    aula = next(e for e in vista["scenes"] if e["clave"] == "aula")
    assert aula["state"] == "error" and aula["error"] == {"kind": kind, "message": MENSAJES[kind]}
    assert vista["lastError"] == {"stage": "scene", "clave": "aula", "kind": kind, "message": MENSAJES[kind]}
    assert vista["status"] == "skeleton_ready" and vista["callsUsed"] == 2

    reintento = service.run_scene(docente, gid, "aula", repair=False)  # sigue retomable
    assert next(e for e in reintento["scenes"] if e["clave"] == "aula")["state"] == "done"
    assert reintento["lastError"] is None  # se borra cuando la misma etapa sale bien


# ─── respuestas mal formadas de un proveedor real (transporte sustituido) ─────────────────────────

CUERPOS = {
    "cortada por max_tokens": {"stop_reason": "max_tokens", "content": [{"type": "text", "text": '{"titulo": "El caso que se cor'}]},
    "sin bloque de texto": {"stop_reason": "end_turn", "content": [{"type": "thinking", "thinking": "pensando"}]},
    "texto que no es JSON": {"stop_reason": "end_turn", "content": [{"type": "text", "text": "Claro, aquí tienes el caso."}]},
}


@pytest.mark.parametrize("cuerpo", list(CUERPOS.values()), ids=list(CUERPOS))
def test_una_respuesta_real_mal_formada_es_malformed_y_retomable(db, docente, settings, monkeypatch, cuerpo):
    settings.AI_AUTHORING_PROVIDER = "anthropic"
    settings.AI_AUTHORING_API_KEY = KEY
    monkeypatch.setattr(ai_providers, "post_json", lambda *args, **kwargs: copy.deepcopy(cuerpo))
    gid = crear(docente)

    with pytest.raises(service.AiProviderFailed) as error:
        service.run_skeleton(docente, gid)

    assert error.value.extra["kind"] == "malformed" and error.value.detail == MENSAJES["malformed"]
    vista = service.get(docente, gid)
    assert vista["status"] == "created" and vista["lastError"]["kind"] == "malformed"
    assert vista["lastError"]["message"] == MENSAJES["malformed"]
    assert CaseGeneration.objects.get(pk=gid).skeleton_started_at is None  # retomable
    assert contexto(filas().last())["kind"] == "malformed"
    assert KEY not in json.dumps(vista) and "se cor" not in json.dumps(vista)
    assert all(KEY not in fila.context_json and SECRETO not in fila.context_json for fila in filas())


# ─── una escena que `checks` rechaza se reintenta como reparación ─────────────────────────────────


def test_una_escena_rechazada_por_checks_se_reintenta_como_reparacion(db, docente, monkeypatch):
    gid, _ = con_esqueleto(docente)
    original = FakeProvider.complete_structured
    mensajes = []
    invalida = leer("escena-aula.json")
    invalida["narracion"] = ""  # checks: «narración» no puede quedar vacía
    primera = [True]

    def invalida_una_vez(self, system, messages, schema, model, *args, **kwargs):
        if "Etapa: escena aula" in FakeProvider._ultimo_texto(messages):
            mensajes.append(FakeProvider._ultimo_texto(messages))
            if primera:
                primera.pop()
                return copy.deepcopy(invalida)
        return original(self, system, messages, schema, model, *args, **kwargs)

    monkeypatch.setattr(FakeProvider, "complete_structured", invalida_una_vez)

    with pytest.raises(service.AiProviderFailed) as error:
        service.run_scene(docente, gid, "aula", repair=False)
    assert error.value.extra["kind"] == "malformed"
    guardada = json.loads(CaseGeneration.objects.get(pk=gid).scenes_json)["aula"]
    assert guardada["state"] == "error" and guardada["rejected"]["narracion"] == "" and guardada["motivos"]
    assert "rejected" not in json.dumps(service.get(docente, gid)) and "motivos" not in json.dumps(service.get(docente, gid))

    vista = service.run_scene(docente, gid, "aula", repair=False)  # la escena normal, no ?repair=1

    assert "Escena anterior (JSON):" not in mensajes[0]
    assert "Escena anterior (JSON):" in mensajes[1] and "Faltas que corregir:" in mensajes[1]
    assert checks.EMPTY.replace("«»", "«narración»") in mensajes[1]
    assert next(e for e in vista["scenes"] if e["clave"] == "aula")["state"] == "done"
    final = json.loads(CaseGeneration.objects.get(pk=gid).scenes_json)["aula"]
    assert "rejected" not in final and "motivos" not in final and final["data"]["narracion"]


# ─── un esqueleto que `checks` rechaza se guarda, se registra y se reintenta como reparación ───────

MARCADOR_MODELO = "MARCADOR-DEL-TEXTO-DEL-MODELO"


def _esqueleto_invalido():
    malo = leer("esqueleto.json")
    malo["titulo"] = ""  # checks: «título» no puede quedar vacío
    malo["contexto"] = MARCADOR_MODELO
    return malo


def _proveedor_que_rechaza_el_esqueleto_una_vez(monkeypatch, mensajes):
    original = FakeProvider.complete_structured
    primera = [True]

    def invalido_una_vez(self, system, messages, schema, model, *args, **kwargs):
        texto = FakeProvider._ultimo_texto(messages)
        if "Etapa: esqueleto" in texto:
            mensajes.append(texto)
            if primera:
                primera.pop()
                return _esqueleto_invalido()
        return original(self, system, messages, schema, model, *args, **kwargs)

    monkeypatch.setattr(FakeProvider, "complete_structured", invalido_una_vez)


def test_un_esqueleto_rechazado_por_checks_se_guarda_y_el_reintento_lo_repara(db, docente, monkeypatch):
    gid = crear(docente)
    mensajes = []
    _proveedor_que_rechaza_el_esqueleto_una_vez(monkeypatch, mensajes)

    with pytest.raises(service.AiProviderFailed) as error:
        service.run_skeleton(docente, gid)
    assert error.value.extra["kind"] == "malformed"
    guardado = json.loads(CaseGeneration.objects.get(pk=gid).scenes_json)["__skeleton__"]
    assert guardado["rejected"]["contexto"] == MARCADOR_MODELO and guardado["motivos"]
    assert all(motivo in checks.FIXED_MOTIVOS or checks.is_fixed_motivo(motivo) for motivo in guardado["motivos"])
    vista = service.get(docente, gid)
    assert vista["status"] == "created" and vista["scenes"] == []
    assert "__skeleton__" not in json.dumps(vista) and MARCADOR_MODELO not in json.dumps(vista)

    vista = service.run_skeleton(docente, gid)

    assert "Esqueleto anterior (JSON):" not in mensajes[0]
    assert "Esqueleto anterior (JSON):" in mensajes[1] and "Faltas que corregir:" in mensajes[1]
    assert checks.EMPTY.replace("«»", "«título»") in mensajes[1] and MARCADOR_MODELO in mensajes[1]
    assert vista["status"] == "skeleton_ready" and vista["callsUsed"] == 2
    assert "__skeleton__" not in json.loads(CaseGeneration.objects.get(pk=gid).scenes_json)  # aceptado: se borra


def test_un_fallo_del_proveedor_tras_un_esqueleto_rechazado_conserva_la_reparacion(db, docente, monkeypatch):
    gid = crear(docente)
    mensajes = []
    _proveedor_que_rechaza_el_esqueleto_una_vez(monkeypatch, mensajes)
    with pytest.raises(service.AiProviderFailed):
        service.run_skeleton(docente, gid)
    original = FakeProvider.complete_structured
    fallo = [True]

    def cae_una_vez(self, system, messages, schema, model, *args, **kwargs):
        if fallo and "Etapa: esqueleto" in FakeProvider._ultimo_texto(messages):
            fallo.pop()
            raise ProviderError("timeout", "interno")
        return original(self, system, messages, schema, model, *args, **kwargs)

    monkeypatch.setattr(FakeProvider, "complete_structured", cae_una_vez)
    with pytest.raises(service.AiProviderFailed):
        service.run_skeleton(docente, gid)
    assert "__skeleton__" in json.loads(CaseGeneration.objects.get(pk=gid).scenes_json)

    service.run_skeleton(docente, gid)

    assert "Esqueleto anterior (JSON):" in mensajes[-1]


def test_los_motivos_del_esqueleto_rechazado_se_registran_sin_texto_del_modelo(db, docente, monkeypatch, caplog):
    gid = crear(docente)
    _proveedor_que_rechaza_el_esqueleto_una_vez(monkeypatch, [])

    with caplog.at_level("WARNING"), pytest.raises(service.AiProviderFailed):
        service.run_skeleton(docente, gid)

    motivo = checks.EMPTY.replace("«»", "«título»")
    assert motivo in caplog.text and str(gid) in caplog.text and "skeleton" in caplog.text
    assert MARCADOR_MODELO not in caplog.text and SECRETO not in caplog.text


def test_los_motivos_de_una_escena_rechazada_se_registran_con_su_clave_sin_texto_del_modelo(db, docente, monkeypatch, caplog):
    gid, _ = con_esqueleto(docente)
    original = FakeProvider.complete_structured
    mala = leer("escena-aula.json")
    mala["narracion"] = ""
    mala["pistas"] = [MARCADOR_MODELO]

    def invalida(self, system, messages, schema, model, *args, **kwargs):
        if "Etapa: escena aula" in FakeProvider._ultimo_texto(messages):
            return copy.deepcopy(mala)
        return original(self, system, messages, schema, model, *args, **kwargs)

    monkeypatch.setattr(FakeProvider, "complete_structured", invalida)

    with caplog.at_level("WARNING"), pytest.raises(service.AiProviderFailed):
        service.run_scene(docente, gid, "aula", repair=False)

    assert checks.EMPTY.replace("«»", "«narración»") in caplog.text
    assert str(gid) in caplog.text and "scene" in caplog.text and "aula" in caplog.text
    assert MARCADOR_MODELO not in caplog.text and SECRETO not in caplog.text


# ─── la reparación ────────────────────────────────────────────────────────────────────────────────


def a_needs_repair(docente):
    gid, _ = con_escenas(docente, f"{DESCRIPCION} [falso:reparar]")
    return gid, service.run_assemble(docente, gid)


def test_la_reparacion_cuenta_rondas_en_el_servidor(db, docente, monkeypatch):
    gid, vista = a_needs_repair(docente)
    assert vista["status"] == "needs_repair" and vista["repairRounds"] == 1 and vista["caseVersionId"] is None
    assert vista["repair"]["round"] == 1 and vista["repair"]["scenes"] == ["aula"]
    assert vista["repair"]["issues"]["aula"] and vista["issues"] == []  # issues: solo con imported y failed
    assert next(e for e in vista["scenes"] if e["clave"] == "aula")["state"] == "pending"
    assert not SimulationCase.objects.filter(title__icontains="Daniela").exists()  # nada a medias

    mensajes = []
    original = FakeProvider.complete_structured

    def registra(self, system, messages, *args, **kwargs):
        mensajes.append(FakeProvider._ultimo_texto(messages))
        return original(self, system, messages, *args, **kwargs)

    monkeypatch.setattr(FakeProvider, "complete_structured", registra)
    vista = service.run_scene(docente, gid, "aula", repair=True)
    assert "Escena anterior (JSON):" in mensajes[0] and "Faltas que corregir:" in mensajes[0]
    assert vista["status"] == "scenes_ready"
    final = service.run_assemble(docente, gid)
    assert final["status"] == "imported" and final["repairRounds"] == 1 and final["issues"] == []


def test_dos_rondas_y_la_tercera_importa_con_las_faltas_editoriales(db, docente, monkeypatch):
    gid, vista = a_needs_repair(docente)
    mala = leer("escena-aula.reparar.json")
    original = FakeProvider.complete_structured

    def sigue_mal(self, system, messages, *args, **kwargs):
        if "Etapa: escena aula" in FakeProvider._ultimo_texto(messages):
            return copy.deepcopy(mala)
        return original(self, system, messages, *args, **kwargs)

    monkeypatch.setattr(FakeProvider, "complete_structured", sigue_mal)

    service.run_scene(docente, gid, "aula", repair=True)
    vista = service.run_assemble(docente, gid)
    assert vista["status"] == "needs_repair" and vista["repairRounds"] == 2 and vista["repair"]["round"] == 2

    service.run_scene(docente, gid, "aula", repair=True)
    vista = service.run_assemble(docente, gid)  # ya no quedan rondas

    assert vista["status"] == "imported" and vista["repairRounds"] == 2 and vista["caseVersionId"]
    assert vista["issues"] and all(i["code"].startswith(assembly.EDITORIAL_PREFIXES) for i in vista["issues"])


def test_repair_de_una_escena_fuera_de_la_lista_da_409(db, docente):
    gid, vista = a_needs_repair(docente)
    assert vista["repair"]["scenes"] == ["aula"]
    with pytest.raises(service.GenerationState) as error:
        service.run_scene(docente, gid, "bienestar", repair=True)
    assert error.value.status_code == 409 and error.value.api_code == "GENERATION_STATE"
    with pytest.raises(service.GenerationState):  # y la normal tampoco: el estado no es skeleton_ready
        service.run_scene(docente, gid, "aula", repair=False)


def test_repair_fuera_de_needs_repair_da_409(db, docente):
    gid, vista = con_esqueleto(docente)
    with pytest.raises(service.GenerationState):
        service.run_scene(docente, gid, "aula", repair=True)
    with pytest.raises(service.GenerationState):  # assemble sin todas las escenas
        service.run_assemble(docente, gid)
    with pytest.raises(service.GenerationState):  # el esqueleto solo se admite en created
        service.run_skeleton(docente, gid)


def test_una_escena_que_no_es_del_esqueleto_es_404(db, docente):
    gid, _ = con_esqueleto(docente)
    with pytest.raises(Exception) as error:
        service.run_scene(docente, gid, "no-es-una-sala", repair=False)
    assert error.value.status_code == 404


# ─── escenas en curso ─────────────────────────────────────────────────────────────────────────────


def marcar_en_curso(gid, clave, hace):
    gen = CaseGeneration.objects.get(pk=gid)
    escenas = json.loads(gen.scenes_json)
    escenas[clave].update(state="running", started_at=(timezone.now() - timedelta(seconds=hace)).isoformat())
    CaseGeneration.objects.filter(pk=gid).update(scenes_json=json.dumps(escenas))


def test_una_escena_en_curso_hace_mas_de_150_s_se_puede_pedir_de_nuevo(db, docente):
    gid, _ = con_esqueleto(docente)
    marcar_en_curso(gid, "aula", 10)
    with pytest.raises(service.GenerationBusy):
        service.run_scene(docente, gid, "aula", repair=False)
    marcar_en_curso(gid, "aula", 200)

    vista = service.run_scene(docente, gid, "aula", repair=False)

    assert next(e for e in vista["scenes"] if e["clave"] == "aula")["state"] == "done"


def test_un_esqueleto_en_curso_hace_mas_de_150_s_se_puede_pedir_de_nuevo(db, docente):
    gid = crear(docente)
    CaseGeneration.objects.filter(pk=gid).update(skeleton_started_at=timezone.now() - timedelta(seconds=10))
    with pytest.raises(service.GenerationBusy) as error:
        service.run_skeleton(docente, gid)
    assert error.value.status_code == 409 and error.value.detail == "Esta parte ya se está escribiendo. Espera un momento."
    CaseGeneration.objects.filter(pk=gid).update(skeleton_started_at=timezone.now() - timedelta(seconds=151))
    assert service.run_skeleton(docente, gid)["status"] == "skeleton_ready"


def test_dos_pedidos_simultaneos_de_la_misma_escena(real_commits, monkeypatch):
    user = _user("gensvc_misma")
    try:
        gid = crear(user)
        service.run_skeleton(user, gid)
        con_demora(monkeypatch)

        resultados = run_concurrently(
            lambda: service.run_scene(user, gid, "aula", repair=False),
            lambda: service.run_scene(user, gid, "aula", repair=False),
        )

        errores = [r.error for r in resultados if r.error is not None]
        assert len(errores) == 1 and isinstance(errores[0], service.GenerationBusy)
        assert sum(1 for r in resultados if r.error is None) == 1
        assert CaseGeneration.objects.get(pk=gid).calls == 2  # 1 esqueleto + 1 escena, no 3
    finally:
        limpiar(user)


def test_dos_ensamblados_simultaneos_crean_un_solo_borrador(real_commits, monkeypatch):
    user = _user("gensvc_asm")
    antes = set(SimulationCase.objects.values_list("pk", flat=True))
    try:
        gid = crear(user)
        service.run_skeleton(user, gid)
        for sala in SALAS:
            service.run_scene(user, gid, sala, repair=False)
        real = assembly.assemble

        def lento(gen, actor):
            time.sleep(0.8)  # el cerrojo de la fila se sostiene durante todo el ensamblado
            return real(gen, actor)

        monkeypatch.setattr(assembly, "assemble", lento)

        resultados = run_concurrently(lambda: service.run_assemble(user, gid), lambda: service.run_assemble(user, gid))

        errores = [r.error for r in resultados if r.error is not None]
        assert len(errores) == 1 and isinstance(errores[0], service.GenerationBusy)
        assert errores[0].status_code == 409 and errores[0].api_code == "GENERATION_BUSY"
        assert [r.value["status"] for r in resultados if r.error is None] == ["imported"]
        nuevos = SimulationCase.objects.exclude(pk__in=antes)
        assert nuevos.count() == 1
    finally:
        SimulationCase.objects.exclude(pk__in=antes).delete()
        limpiar(user)


# ─── cancelar, propiedad y apagado ────────────────────────────────────────────────────────────────


def test_cancelar_libera_y_un_resultado_tardio_se_descarta(db, docente, monkeypatch):
    gid, _ = con_esqueleto(docente)
    original = FakeProvider.complete_structured

    def cancela_a_mitad(self, system, messages, *args, **kwargs):
        service.cancel(docente, gid)  # la docente cancela mientras la IA escribe
        return original(self, system, messages, *args, **kwargs)

    monkeypatch.setattr(FakeProvider, "complete_structured", cancela_a_mitad)

    with pytest.raises(service.GenerationState):
        service.run_scene(docente, gid, "aula", repair=False)

    gen = CaseGeneration.objects.get(pk=gid)
    aula = json.loads(gen.scenes_json)["aula"]
    assert gen.status == "cancelled" and aula["data"] is None and aula["state"] != "done"
    assert contexto(filas().last())["outcome"] == "discarded"
    assert crear(docente) != gid  # quedó libre para empezar otra
    with pytest.raises(service.GenerationState):  # una cancelada no se cancela de nuevo
        service.cancel(docente, gid)


def test_otra_docente_recibe_404_en_todo(db, docente, otra):
    gid, _ = con_esqueleto(docente)
    llamadas = [
        lambda: service.get(otra, gid),
        lambda: service.run_skeleton(otra, gid),
        lambda: service.run_scene(otra, gid, "aula", repair=False),
        lambda: service.run_scene(otra, gid, "aula", repair=True),
        lambda: service.run_assemble(otra, gid),
        lambda: service.cancel(otra, gid),
        lambda: service.get(docente, "no-es-un-uuid"),
        lambda: service.get(docente, uuid.uuid4()),
    ]
    for llamada in llamadas:
        with pytest.raises(Exception) as error:
            llamada()
        assert error.value.status_code == 404
    assert service.status(otra)["inProgress"] is None
    admin = _user("gensvc_admin", "ADMIN")
    with pytest.raises(Exception) as error:
        service.get(admin, gid)
    assert error.value.status_code == 404
    assert CaseGeneration.objects.get(pk=gid).status == "skeleton_ready"  # nadie la tocó


def test_apagado_todo_404_salvo_status(db, docente, settings):
    gid = crear(docente)
    settings.AI_AUTHORING_ENABLED = False
    llamadas = [
        lambda: service.start(docente, "universidad", DESCRIPCION),
        lambda: service.get(docente, gid),
        lambda: service.run_skeleton(docente, gid),
        lambda: service.run_scene(docente, gid, "aula", repair=False),
        lambda: service.run_assemble(docente, gid),
        lambda: service.cancel(docente, gid),
    ]
    for llamada in llamadas:
        with pytest.raises(service.GenerationDisabled) as error:
            llamada()
        assert error.value.status_code == 404 and error.value.api_code == "NOT_FOUND"
        assert error.value.detail == "La generación con IA no está disponible."
    assert service.status(docente)["enabled"] is False


def test_sin_clave_y_sin_el_falso_status_dice_apagado(db, docente, settings):
    settings.AI_AUTHORING_PROVIDER = "anthropic"
    settings.AI_AUTHORING_API_KEY = ""
    assert service.status(docente)["enabled"] is False
    with pytest.raises(service.GenerationDisabled):
        crear(docente)


# ─── auditoría ────────────────────────────────────────────────────────────────────────────────────


def test_la_auditoria_registra_cada_etapa_sin_texto(db, docente):
    gid, _ = con_escenas(docente)
    service.run_assemble(docente, gid)
    gid2 = crear(docente)
    service.cancel(docente, gid2)

    registros = list(filas())
    assert {contexto(f)["stage"] for f in registros} >= {"start", "skeleton", "scene", "assemble", "cancel"}
    assert all(f.resource_type == "CASE_GENERATION" for f in registros)
    permitidos = {"taxonomy", "generationId", "stage", "model", "duration_ms", "outcome", "kind", "tokens_in", "tokens_out", "round"}
    for fila in registros:
        assert set(contexto(fila)) <= permitidos
        assert SECRETO not in json.dumps(contexto(fila)) and "estudiante" not in json.dumps(contexto(fila))
        assert contexto(fila)["taxonomy"] == "asistente_autoria.generar"
    escena = next(f for f in registros if contexto(f)["stage"] == "scene")
    assert contexto(escena)["outcome"] == "ok" and "duration_ms" in contexto(escena) and contexto(escena)["model"]
    assert len([f for f in registros if contexto(f)["stage"] == "scene"]) == 4


def test_la_auditoria_de_la_etapa_que_falla_no_lleva_texto_del_modelo(db, docente, monkeypatch):
    gid, _ = con_esqueleto(docente)
    def devuelve_basura(self, system, messages, *args, **kwargs):
        return {"narracion": "TEXTO-DEL-MODELO-RECHAZADO"}

    monkeypatch.setattr(FakeProvider, "complete_structured", devuelve_basura)
    with pytest.raises(service.AiProviderFailed):
        service.run_scene(docente, gid, "aula", repair=False)

    todo = json.dumps(service.get(docente, gid)) + "".join(f.context_json for f in filas())
    assert "TEXTO-DEL-MODELO-RECHAZADO" not in todo


# ─── fallos inesperados: la etapa se suelta, sin texto en el registro ─────────────────────────────


def test_un_fallo_inesperado_no_registra_el_mensaje_y_deja_la_etapa_retomable(db, docente, monkeypatch, caplog):
    gid, _ = con_esqueleto(docente)

    def explota(self, *args, **kwargs):
        raise RuntimeError("MARCADOR-DEL-MENSAJE con texto del modelo")

    monkeypatch.setattr(FakeProvider, "complete_structured", explota)
    with caplog.at_level("DEBUG"):
        with pytest.raises(service.AiProviderFailed) as error:
            service.run_scene(docente, gid, "aula", repair=False)

    assert error.value.extra["kind"] == "http"
    assert "MARCADOR-DEL-MENSAJE" not in caplog.text and all(r.exc_info is None for r in caplog.records)
    assert any(getattr(r, "fields", {}).get("error_class") == "RuntimeError" for r in caplog.records)


def test_si_falla_la_construccion_del_proveedor_la_etapa_se_puede_pedir_de_inmediato(db, docente, monkeypatch):
    gid, _ = con_esqueleto(docente)

    def sin_proveedor(nombre):
        raise RuntimeError("no se pudo construir")

    monkeypatch.setattr(service, "provider_class", sin_proveedor)
    with pytest.raises(service.AiProviderFailed):
        service.run_scene(docente, gid, "aula", repair=False)
    assert json.loads(CaseGeneration.objects.get(pk=gid).scenes_json)["aula"]["started_at"] is None

    monkeypatch.undo()  # el proveedor vuelve: la escena se pide enseguida, sin 409 ocupado
    monkeypatch.setattr(context, "competencias_por_defecto", lambda: COMPETENCIAS)
    vista = service.run_scene(docente, gid, "aula", repair=False)
    assert next(e for e in vista["scenes"] if e["clave"] == "aula")["state"] == "done"


def test_un_fallo_de_tokens_no_deja_la_etapa_colgada(db, docente, monkeypatch):
    gid = crear(docente)
    monkeypatch.setattr(service, "_usage", lambda meta: (_ for _ in ()).throw(RuntimeError("x")))
    with pytest.raises(RuntimeError):
        service.run_skeleton(docente, gid)
    assert CaseGeneration.objects.get(pk=gid).skeleton_started_at is None


def test_un_operationalerror_que_no_es_de_cerrojo_no_se_vuelve_ocupado(db, docente, monkeypatch):
    from django.db import OperationalError

    gid, _ = con_escenas(docente)
    original = service._owned

    def cae(gen_id, actor, *, lock=False, nowait=False):
        if nowait:
            raise OperationalError("conexión caída")
        return original(gen_id, actor, lock=lock, nowait=nowait)

    monkeypatch.setattr(service, "_owned", cae)
    with pytest.raises(OperationalError):
        service.run_assemble(docente, gid)
