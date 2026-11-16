"""C1 · Tarea 9 · La tubería completa contra el contrato, con el proveedor falso.

Todo por HTTP, como lo usará el editor (C2): crear, esqueleto, escenas, ensamblar, abrir el borrador en el editor y
ensayarlo. Ninguna prueba toca la red: el proveedor es ``FakeProvider``. Las fallas del proveedor salen de las marcas
``[falso:…]`` de la descripción; lo demás se prepara con ``QuerySet.update`` o ``monkeypatch``.
"""
import json
import uuid
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.simulation.models import CaseGeneration, CaseVersion, SimulationCase
from apps.simulation.services import ai_providers
from apps.simulation.services.authoring.generation import assembly, context

User = get_user_model()
BASE = "/api/authoring/generations"
EDITOR = "/api/authoring/cases"
DESCRIPCION = "Una estudiante de segundo semestre se queda sola después de clase y necesita que la acompañen con calma."
COMPETENCIAS = [
    {"codigo": codigo, "nombre": codigo.title()}
    for codigo in ("PAP", "COMUNICACION_EMPATIA", "DECISION_RUTA", "COMPRENSION_SITUACION", "REFLEXION")
]
APAGADO = "La generación con IA no está disponible."


@pytest.fixture(autouse=True)
def _config(settings, monkeypatch):
    settings.AI_AUTHORING_ENABLED = True
    settings.AI_AUTHORING_PROVIDER = "fake"
    settings.AI_AUTHORING_GENERATIONS_PER_DAY = 5
    settings.AI_AUTHORING_GENERATION_MAX_CALLS = 20
    monkeypatch.setattr(context, "competencias_por_defecto", lambda: COMPETENCIAS)


def _user(prefix, role):
    return User.objects.create_user(
        email=f"{prefix}_{uuid.uuid4().hex[:8]}@x.com", password="pass1234", nombre="N", apellido="A", role=role,
    )


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def docente(db):
    return _user("genctr_doc", "PROFESOR")


@pytest.fixture
def api_docente(docente):
    return _client(docente)


# ─── ayudas ───────────────────────────────────────────────────────────────────────────────────────


def crear(api, descripcion=DESCRIPCION):
    return api.post(BASE, {"lugarId": "universidad", "descripcion": descripcion}, format="json")


def datos(response, status=200):
    assert response.status_code == status, response.content
    assert response.json()["success"] is True, response.json()
    return response.json()["data"]


def esqueleto(api, gid):
    return datos(api.post(f"{BASE}/{gid}/skeleton"))


def escena(api, gid, clave, repair=False):
    return api.post(f"{BASE}/{gid}/scenes/{clave}" + ("?repair=1" if repair else ""))


def claves(gen):
    return [e["clave"] for e in gen["skeleton"]["escenas"]]


def todas_las_escenas(api, gid, gen):
    for clave in claves(gen):
        gen = datos(escena(api, gid, clave))
    return gen


def hasta_escenas_listas(api, descripcion=DESCRIPCION):
    gid = datos(crear(api, descripcion), 201)["id"]
    gen = todas_las_escenas(api, gid, esqueleto(api, gid))
    assert gen["status"] == "scenes_ready"
    return gid, gen


def ensamblar(api, gid):
    return datos(api.post(f"{BASE}/{gid}/assemble"))


def cuerpo(response):
    return response.json()


def filas_de_casos():
    return SimulationCase.objects.count(), CaseVersion.objects.count()


@pytest.fixture
def siempre_la_variante_mala(monkeypatch):
    """El falso da la escena con el enlace ``file:`` también en la reparación (hace creer que el modelo no corrige)."""
    monkeypatch.setattr(ai_providers, "_FAKE_PREVIOUS_SCENE", "§ninguna-escena-anterior§")


# ─── el recorrido feliz y el editor ───────────────────────────────────────────────────────────────


def test_describir_generar_y_abrir_en_el_editor(api_docente):
    gid = datos(crear(api_docente), 201)["id"]
    gen = esqueleto(api_docente, gid)
    assert gen["status"] == "skeleton_ready" and len(claves(gen)) == 4
    # El navegador pide hasta dos escenas a la vez; cada petición reserva su escena y no se pisan: aquí van en pares.
    for par in (claves(gen)[:2], claves(gen)[2:]):
        for clave in par:
            gen = datos(escena(api_docente, gid, clave))
    assert gen["status"] == "scenes_ready"
    assert [s["state"] for s in gen["scenes"]] == ["done"] * 4
    final = ensamblar(api_docente, gid)
    assert final["status"] == "imported" and final["caseVersionId"] and final["issues"] == []

    editor = datos(api_docente.get(f"{EDITOR}/{final['caseVersionId']}/editor"))
    assert editor["nodes"] and all(n["aiSuggested"] for n in editor["nodes"])
    assert all(d["aiSuggested"] for d in editor["decisions"])
    assert any(d["requires"] for d in editor["decisions"])
    assert any(n["comments"] for n in editor["nodes"])
    assert any(n["goal"] for n in editor["nodes"])
    assert editor["hints"]
    assert editor["status"] != "PUBLISHED"  # un borrador: la IA nunca publica
    assert datos(api_docente.get(f"{BASE}/status"))["inProgress"] is None


def test_el_caso_generado_se_puede_ensayar(api_docente):
    gid, _ = hasta_escenas_listas(api_docente)
    version = ensamblar(api_docente, gid)["caseVersionId"]
    respuesta = api_docente.post(f"{EDITOR}/{version}/rehearsal", {}, format="json")
    assert respuesta.status_code == 200, respuesta.content
    ensayo = datos(respuesta)
    assert ensayo["attemptId"]


# ─── retomar ──────────────────────────────────────────────────────────────────────────────────────


def test_retomar_tras_cerrar_la_pestana(api_docente):
    gid = datos(crear(api_docente), 201)["id"]
    gen = esqueleto(api_docente, gid)
    primera, segunda = claves(gen)[:2]
    datos(escena(api_docente, gid, primera))

    # Otra pestaña: solo conoce ``status``.
    en_curso = datos(api_docente.get(f"{BASE}/status"))["inProgress"]
    assert en_curso["id"] == gid and en_curso["status"] == "skeleton_ready"
    estados = {s["clave"]: s["state"] for s in en_curso["scenes"]}
    assert estados[primera] == "done" and estados[segunda] == "pending"

    # Una escena quedó «en curso» cuando se cerró la pestaña: ocupada hasta 150 s, luego se puede pedir de nuevo.
    fila = CaseGeneration.objects.get(pk=gid)
    escenas = json.loads(fila.scenes_json)
    escenas[segunda].update(state="running", started_at=timezone.now().isoformat())
    CaseGeneration.objects.filter(pk=gid).update(scenes_json=json.dumps(escenas))
    assert datos(api_docente.get(f"{BASE}/{gid}"))["scenes"][1]["state"] == "running"
    ocupada = escena(api_docente, gid, segunda)
    assert ocupada.status_code == 409 and cuerpo(ocupada)["code"] == "GENERATION_BUSY"
    assert CaseGeneration.objects.get(pk=gid).calls == 2  # la segunda petición no gastó llamada

    escenas[segunda]["started_at"] = (timezone.now() - timedelta(seconds=151)).isoformat()
    CaseGeneration.objects.filter(pk=gid).update(scenes_json=json.dumps(escenas))
    gen = datos(escena(api_docente, gid, segunda))
    assert {s["clave"]: s["state"] for s in gen["scenes"]}[segunda] == "done"


# ─── reparación ───────────────────────────────────────────────────────────────────────────────────


def test_reparar_una_ronda_y_volver_a_escenas_listas(api_docente):
    gid, _ = hasta_escenas_listas(api_docente, DESCRIPCION + " [falso:reparar]")
    gen = ensamblar(api_docente, gid)
    assert gen["status"] == "needs_repair" and gen["repairRounds"] == 1
    assert gen["repair"]["round"] == 1 and gen["repair"]["scenes"] == ["aula"]
    assert [i["code"] for i in gen["repair"]["issues"]["aula"]] == ["DSL.TEXT_LINK"]
    assert gen["issues"] == [] and gen["caseVersionId"] is None
    assert {s["clave"]: s["state"] for s in gen["scenes"]}["aula"] == "pending"

    otra = escena(api_docente, gid, "bienestar", repair=True)  # no está en repair.scenes
    assert otra.status_code == 409 and cuerpo(otra)["code"] == "GENERATION_STATE"

    gen = datos(escena(api_docente, gid, "aula", repair=True))
    assert gen["status"] == "scenes_ready" and gen["repair"] is None
    final = ensamblar(api_docente, gid)
    assert final["status"] == "imported" and final["issues"] == [] and final["repairRounds"] == 1


def test_dos_rondas_de_reparacion_y_luego_importa_con_faltas(api_docente, siempre_la_variante_mala):
    gid, _ = hasta_escenas_listas(api_docente, DESCRIPCION + " [falso:reparar]")
    for ronda in (1, 2):
        gen = ensamblar(api_docente, gid)
        assert gen["status"] == "needs_repair" and gen["repairRounds"] == ronda
        gen = datos(escena(api_docente, gid, "aula", repair=True))
        assert gen["status"] == "scenes_ready"
    final = ensamblar(api_docente, gid)
    assert final["status"] == "imported" and final["repairRounds"] == 2 and final["caseVersionId"]
    assert [i["code"] for i in final["issues"]] == ["DSL.TEXT_LINK"]
    assert set(final["issues"][0]) >= {"code", "severity", "message"}
    assert datos(api_docente.get(f"{EDITOR}/{final['caseVersionId']}/editor"))["nodes"]


def test_failed_no_deja_caso_ni_version(api_docente, monkeypatch):
    """Un documento roto de verdad (``escenas`` deja de ser una lista): ``checks`` no puede producirlo, así que se inyecta en la
    frontera del ensamblado (``to_document``); el validador real lo rechaza con una falta que no es editorial."""
    gid, _ = hasta_escenas_listas(api_docente)
    real = assembly.to_document

    def roto(definition):
        document = real(definition)
        document["escenas"] = "no-es-una-lista"
        return document

    monkeypatch.setattr(assembly, "to_document", roto)
    antes = filas_de_casos()
    gen = ensamblar(api_docente, gid)
    assert gen["status"] == "failed" and gen["caseVersionId"] is None
    assert gen["issues"] and not assembly.is_editorial(gen["issues"][0])
    assert gen["repairRounds"] == 0  # una falta que no es de una escena no gasta rondas
    assert filas_de_casos() == antes
    # La generación conserva el documento para diagnóstico, pero la API no lo devuelve.
    assert CaseGeneration.objects.get(pk=gid).document_json
    assert "document" not in datos(api_docente.get(f"{BASE}/{gid}"))
    assert datos(api_docente.get(f"{BASE}/status"))["inProgress"] is None
    repetido = api_docente.post(f"{BASE}/{gid}/assemble")
    assert repetido.status_code == 409 and cuerpo(repetido)["code"] == "GENERATION_STATE"


# ─── fallas del proveedor por HTTP ────────────────────────────────────────────────────────────────

MENSAJES = {
    "timeout": "La IA tardó demasiado en responder. Vuelve a intentarlo.",
    "http": "No pudimos hablar con la IA. Vuelve a intentarlo en un momento.",
    "malformed": "La IA respondió algo que no pudimos usar. Vuelve a intentarlo.",
}


@pytest.mark.parametrize("kind", ["timeout", "http", "malformed"])
def test_cada_kind_por_http_502_con_su_mensaje_y_es_retomable(api_docente, kind):
    gid = datos(crear(api_docente, f"{DESCRIPCION} [falso:{kind}]"), 201)["id"]
    respuesta = api_docente.post(f"{BASE}/{gid}/skeleton")
    assert respuesta.status_code == 502
    assert cuerpo(respuesta)["code"] == "AI_PROVIDER_ERROR" and cuerpo(respuesta)["kind"] == kind
    assert cuerpo(respuesta)["message"] == MENSAJES[kind]
    gen = datos(api_docente.get(f"{BASE}/{gid}"))
    assert gen["status"] == "created" and gen["callsUsed"] == 1
    assert gen["lastError"] == {"stage": "skeleton", "clave": None, "kind": kind, "message": MENSAJES[kind]}
    # La etapa sigue retomable: se vuelve a pedir (y vuelve a fallar con lo mismo, sin quedarse «ocupada»).
    assert api_docente.post(f"{BASE}/{gid}/skeleton").status_code == 502


def test_la_negativa_es_422_ai_refused(api_docente):
    gid = datos(crear(api_docente, f"{DESCRIPCION} [falso:refusal]"), 201)["id"]
    respuesta = api_docente.post(f"{BASE}/{gid}/skeleton")
    assert respuesta.status_code == 422 and cuerpo(respuesta)["code"] == "AI_REFUSED"
    assert cuerpo(respuesta)["message"] == "La IA no quiso escribir esta parte. Prueba a describir el caso con otras palabras."
    assert datos(api_docente.get(f"{BASE}/{gid}"))["lastError"]["kind"] == "refusal"


def test_una_falla_en_una_escena_deja_esa_escena_en_error_y_se_reintenta(api_docente, monkeypatch):
    gid = datos(crear(api_docente), 201)["id"]
    gen = esqueleto(api_docente, gid)
    real = ai_providers.FakeProvider.complete_structured

    def falla_una_vez(self, system, messages, schema, model, *args, **kwargs):
        monkeypatch.setattr(ai_providers.FakeProvider, "complete_structured", real)
        raise ai_providers.ProviderError("timeout", "simulado")

    monkeypatch.setattr(ai_providers.FakeProvider, "complete_structured", falla_una_vez)
    respuesta = escena(api_docente, gid, claves(gen)[0])
    assert respuesta.status_code == 502 and cuerpo(respuesta)["kind"] == "timeout"
    actual = datos(api_docente.get(f"{BASE}/{gid}"))
    assert actual["scenes"][0]["state"] == "error" and actual["scenes"][0]["error"]["kind"] == "timeout"
    assert actual["lastError"]["stage"] == "scene" and actual["lastError"]["clave"] == claves(gen)[0]
    gen = datos(escena(api_docente, gid, claves(gen)[0]))
    assert gen["scenes"][0]["state"] == "done" and gen["scenes"][0]["error"] is None and gen["lastError"] is None


def test_409_generation_busy_con_el_esqueleto_en_curso(api_docente):
    gid = datos(crear(api_docente), 201)["id"]
    CaseGeneration.objects.filter(pk=gid).update(skeleton_started_at=timezone.now())
    respuesta = api_docente.post(f"{BASE}/{gid}/skeleton")
    assert respuesta.status_code == 409 and cuerpo(respuesta)["code"] == "GENERATION_BUSY"
    assert cuerpo(respuesta)["message"] == "Esta parte ya se está escribiendo. Espera un momento."
    assert CaseGeneration.objects.get(pk=gid).calls == 0


def test_429_generation_calls_exhausted(api_docente):
    gid = datos(crear(api_docente), 201)["id"]
    CaseGeneration.objects.filter(pk=gid).update(calls=20)
    respuesta = api_docente.post(f"{BASE}/{gid}/skeleton")
    assert respuesta.status_code == 429 and cuerpo(respuesta)["code"] == "GENERATION_CALLS_EXHAUSTED"
    assert cuerpo(respuesta)["message"] == "Este caso ya usó todos sus intentos con la IA. Empieza uno nuevo."
    assert datos(api_docente.get(f"{BASE}/{gid}"))["callsUsed"] == 20
    # Con el tope agotado tampoco avanzan las escenas de un esqueleto ya listo.
    CaseGeneration.objects.filter(pk=gid).update(calls=0)
    gen = esqueleto(api_docente, gid)
    CaseGeneration.objects.filter(pk=gid).update(calls=20)
    assert escena(api_docente, gid, claves(gen)[0]).status_code == 429


# ─── apagado y propiedad ──────────────────────────────────────────────────────────────────────────


def test_apagar_la_bandera_con_una_generacion_real_da_404_en_todo_menos_status(api_docente, settings):
    gid, gen = hasta_escenas_listas(api_docente)
    clave = claves(gen)[0]
    settings.AI_AUTHORING_ENABLED = False
    llamadas = [
        api_docente.get(f"{BASE}/{gid}"),
        api_docente.post(f"{BASE}/{gid}/skeleton"),
        api_docente.post(f"{BASE}/{gid}/scenes/{clave}"),
        api_docente.post(f"{BASE}/{gid}/scenes/{clave}?repair=1"),
        api_docente.post(f"{BASE}/{gid}/assemble"),
        api_docente.delete(f"{BASE}/{gid}"),
        crear(api_docente),
    ]
    for respuesta in llamadas:
        assert respuesta.status_code == 404, respuesta.content
        assert cuerpo(respuesta)["code"] == "NOT_FOUND" and cuerpo(respuesta)["message"] == APAGADO
    estado = datos(api_docente.get(f"{BASE}/status"))
    assert estado["enabled"] is False
    # Apagar no toca lo que ya existe.
    assert CaseGeneration.objects.get(pk=gid).status == "scenes_ready"


def test_otra_docente_y_el_admin_reciben_404_en_escenas_y_assemble(api_docente):
    gid, gen = hasta_escenas_listas(api_docente)
    clave = claves(gen)[0]
    for ajeno in (_client(_user("genctr_otra", "PROFESOR")), _client(_user("genctr_admin", "ADMIN"))):
        assert ajeno.post(f"{BASE}/{gid}/scenes/{clave}").status_code == 404
        assert ajeno.post(f"{BASE}/{gid}/scenes/{clave}?repair=1").status_code == 404
        assert ajeno.post(f"{BASE}/{gid}/assemble").status_code == 404
        assert ajeno.post(f"{BASE}/{gid}/skeleton").status_code == 404
        assert ajeno.get(f"{BASE}/{gid}").status_code == 404
        assert ajeno.delete(f"{BASE}/{gid}").status_code == 404
    assert CaseGeneration.objects.get(pk=gid).status == "scenes_ready"
