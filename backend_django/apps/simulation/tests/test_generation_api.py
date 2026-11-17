"""C1 · Tarea 7 · Las rutas HTTP de la generación por etapas (``/api/authoring/generations``).

Todo con el proveedor falso: ninguna prueba toca la red. Las vistas no tienen lógica (la tiene el servicio, que prueba
``test_generation_service.py``); aquí se prueba el cableado: permiso, sobre, códigos, forma del contrato y que la
respuesta no filtre el documento guardado.
"""
import json
import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import CaseGeneration
from apps.simulation.services.authoring.generation import context

User = get_user_model()
BASE = "/api/authoring/generations"
SECRETO = "TEXTO-SECRETO-DE-LA-DESCRIPCION"
DESCRIPCION = (
    f"Una estudiante de segundo semestre se queda sola después de clase y necesita que la acompañen con calma. {SECRETO}"
)
COMPETENCIAS = [
    {"codigo": codigo, "nombre": codigo.title()}
    for codigo in ("PAP", "COMUNICACION_EMPATIA", "DECISION_RUTA", "COMPRENSION_SITUACION", "REFLEXION")
]
CAMPOS = {
    "id", "lugarId", "descripcion", "status", "skeleton", "scenes", "repairRounds", "repair", "lastError",
    "caseVersionId", "issues", "callsUsed", "callsLimit", "createdAt", "updatedAt",
}


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


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture
def docente(db):
    return _user("genapi_doc", "PROFESOR")


@pytest.fixture
def api_docente(docente):
    return _client(docente)


@pytest.fixture
def api_estudiante(db):
    return _client(_user("genapi_est", "ESTUDIANTE"))


@pytest.fixture
def api_anonimo():
    return _client()


def crear(api, descripcion=DESCRIPCION):
    return api.post(BASE, {"lugarId": "universidad", "descripcion": descripcion}, format="json")


def datos(response):
    assert response.json()["success"] is True, response.json()
    return response.json()["data"]


def con_esqueleto(api):
    gid = datos(crear(api))["id"]
    return gid, datos(api.post(f"{BASE}/{gid}/skeleton"))


def test_recorrido_por_http_con_el_falso(api_docente):
    creada = crear(api_docente)
    assert creada.status_code == 201
    gen = datos(creada)
    assert gen["status"] == "created"
    gid = gen["id"]

    respuesta = api_docente.post(f"{BASE}/{gid}/skeleton")
    assert respuesta.status_code == 200
    gen = datos(respuesta)
    assert gen["status"] == "skeleton_ready"
    for escena in gen["skeleton"]["escenas"]:
        respuesta = api_docente.post(f"{BASE}/{gid}/scenes/{escena['clave']}")
        assert respuesta.status_code == 200
        gen = datos(respuesta)
    assert gen["status"] == "scenes_ready"

    assert datos(api_docente.get(f"{BASE}/{gid}"))["status"] == "scenes_ready"
    assert datos(api_docente.get(f"{BASE}/status"))["inProgress"]["id"] == gid

    respuesta = api_docente.post(f"{BASE}/{gid}/assemble")
    assert respuesta.status_code == 200
    gen = datos(respuesta)
    assert gen["status"] == "imported" and gen["caseVersionId"]
    assert datos(api_docente.get(f"{BASE}/status"))["inProgress"] is None


def test_status_con_la_forma_del_contrato(api_docente):
    data = datos(api_docente.get(f"{BASE}/status"))
    assert data == {"enabled": True, "remainingToday": 5, "inProgress": None}
    crear(api_docente)
    assert datos(api_docente.get(f"{BASE}/status"))["remainingToday"] == 4


def test_status_apagado_es_200_y_las_demas_rutas_404(api_docente, settings):
    settings.AI_AUTHORING_ENABLED = False
    assert datos(api_docente.get(f"{BASE}/status"))["enabled"] is False
    apagado = crear(api_docente)
    assert apagado.status_code == 404
    assert apagado.json()["message"] == "La generación con IA no está disponible."
    assert api_docente.get(f"{BASE}/{uuid.uuid4()}").status_code == 404


def test_anonimo_401_y_estudiante_403_en_cada_ruta(api_anonimo, api_estudiante):
    gid = uuid.uuid4()
    rutas = [
        ("get", f"{BASE}/status"), ("post", BASE), ("get", f"{BASE}/{gid}"), ("delete", f"{BASE}/{gid}"),
        ("post", f"{BASE}/{gid}/skeleton"), ("post", f"{BASE}/{gid}/scenes/aula"),
        ("post", f"{BASE}/{gid}/scenes/aula?repair=1"), ("post", f"{BASE}/{gid}/assemble"),
    ]
    for metodo, ruta in rutas:
        assert getattr(api_anonimo, metodo)(ruta).status_code == 401, (metodo, ruta)
        assert getattr(api_estudiante, metodo)(ruta).status_code == 403, (metodo, ruta)


def test_la_generacion_de_otra_persona_es_404_tambien_para_admin(api_docente, db):
    gid = datos(crear(api_docente))["id"]
    admin = _client(_user("genapi_admin", "ADMIN"))
    otra = _client(_user("genapi_otra", "PROFESOR"))
    for cliente in (admin, otra):
        assert cliente.get(f"{BASE}/{gid}").status_code == 404
        assert cliente.post(f"{BASE}/{gid}/skeleton").status_code == 404
        assert cliente.delete(f"{BASE}/{gid}").status_code == 404


def test_respuesta_con_la_forma_del_contrato(api_docente):
    gid, gen = con_esqueleto(api_docente)
    assert set(gen) == CAMPOS
    assert set(gen["skeleton"]) == {"titulo", "escenas"}
    assert set(gen["skeleton"]["escenas"][0]) == {"clave", "titulo", "final"}
    assert set(gen["scenes"][0]) == {"clave", "titulo", "state", "error"}
    assert gen["callsLimit"] == 20 and gen["callsUsed"] == 1
    assert gen["createdAt"].endswith("Z")


def test_en_curso_y_cancelar(api_docente):
    gid = datos(crear(api_docente))["id"]
    otra = crear(api_docente)
    assert otra.status_code == 409
    cuerpo = otra.json()
    assert cuerpo["code"] == "GENERATION_IN_PROGRESS" and cuerpo["generationId"] == gid
    assert cuerpo["message"] == "Ya tienes un caso generándose. Retómalo o cancélalo para empezar otro."

    borrada = api_docente.delete(f"{BASE}/{gid}")
    assert borrada.status_code == 200 and datos(borrada)["status"] == "cancelled"
    repetida = api_docente.delete(f"{BASE}/{gid}")
    assert repetida.status_code == 409 and repetida.json()["code"] == "GENERATION_STATE"


def test_tope_diario_429(api_docente, settings):
    settings.AI_AUTHORING_GENERATIONS_PER_DAY = 1
    gid = datos(crear(api_docente))["id"]
    api_docente.delete(f"{BASE}/{gid}")
    limite = crear(api_docente)
    assert limite.status_code == 429
    assert limite.json()["code"] == "AI_LIMIT_EXCEEDED" and limite.json()["scope"] == "daily"


def test_descripcion_corta_o_larga_400_con_field(api_docente):
    corta = crear(api_docente, "muy corta")
    assert corta.status_code == 400
    assert corta.json()["code"] == "VALIDATION_ERROR" and corta.json()["field"] == "descripcion"
    assert corta.json()["message"] == "Cuéntanos un poco más: al menos 40 caracteres."
    larga = crear(api_docente, "a" * 2001)
    assert larga.status_code == 400 and larga.json()["field"] == "descripcion"
    assert larga.json()["message"] == "La descripción puede tener hasta 2000 caracteres."
    sin_lugar = api_docente.post(BASE, {"descripcion": DESCRIPCION}, format="json")
    assert sin_lugar.status_code == 400 and sin_lugar.json()["field"] == "lugarId"
    numero = api_docente.post(BASE, {"lugarId": "universidad", "descripcion": 12345}, format="json")
    assert numero.status_code == 400 and numero.json()["field"] == "descripcion"


def test_lugar_que_no_existe_404(api_docente):
    respuesta = api_docente.post(BASE, {"lugarId": "no-existe", "descripcion": DESCRIPCION}, format="json")
    assert respuesta.status_code == 404


def test_clave_de_escena_que_no_esta_404(api_docente):
    gid, _ = con_esqueleto(api_docente)
    assert api_docente.post(f"{BASE}/{gid}/scenes/no-esta").status_code == 404
    assert api_docente.post(f"{BASE}/{gid}/scenes/Mayus_cula").status_code == 404


def test_repair_1_fuera_de_needs_repair_409(api_docente):
    gid, gen = con_esqueleto(api_docente)
    clave = gen["skeleton"]["escenas"][0]["clave"]
    respuesta = api_docente.post(f"{BASE}/{gid}/scenes/{clave}?repair=1")
    assert respuesta.status_code == 409 and respuesta.json()["code"] == "GENERATION_STATE"
    assert respuesta.json()["message"] == "Ese paso no corresponde ahora. Vuelve a cargar el avance."


def test_assemble_sin_escenas_409(api_docente):
    gid, _ = con_esqueleto(api_docente)
    respuesta = api_docente.post(f"{BASE}/{gid}/assemble")
    assert respuesta.status_code == 409 and respuesta.json()["code"] == "GENERATION_STATE"


def test_la_respuesta_nunca_trae_el_documento_ni_texto_del_modelo_fuera_de_los_titulos(api_docente):
    gid, gen = con_esqueleto(api_docente)
    for escena in gen["skeleton"]["escenas"]:
        gen = datos(api_docente.post(f"{BASE}/{gid}/scenes/{escena['clave']}"))
    datos(api_docente.post(f"{BASE}/{gid}/assemble"))
    # El documento solo se guarda con ``failed``: se simula uno y se prueba que no sale por ninguna ruta.
    marca = "MARCA-DEL-DOCUMENTO-GUARDADO"
    CaseGeneration.objects.filter(pk=gid).update(document_json=json.dumps({"marca": marca}))
    fila = CaseGeneration.objects.get(pk=gid)
    piezas = [p for p in _textos(json.loads(fila.scenes_json)) if len(p) > 30]
    assert piezas  # las escenas guardadas traen texto del modelo...
    for ruta in (f"{BASE}/{gid}", f"{BASE}/status"):
        texto = api_docente.get(ruta).content.decode()
        assert marca not in texto and "document" not in set(datos(api_docente.get(f"{BASE}/{gid}")))
        # ...y nada de él sale en la respuesta (la descripción sí: es el campo ``descripcion`` del contrato).
        assert not any(pieza in texto for pieza in piezas)
    assert set(datos(api_docente.get(f"{BASE}/{gid}"))) == CAMPOS


def _textos(valor):
    if isinstance(valor, str):
        yield valor
    elif isinstance(valor, dict):
        for item in valor.values():
            yield from _textos(item)
    elif isinstance(valor, list):
        for item in valor:
            yield from _textos(item)


# ─── ola de arreglos de la revisión final ─────────────────────────────────────────────────────────


def test_repair_acepta_1_y_true_y_rechaza_cualquier_otro_valor(api_docente):
    gid, _ = con_esqueleto(api_docente)
    ruta = f"{BASE}/{gid}/scenes/aula"

    rechazo = api_docente.post(f"{ruta}?repair=yes")
    assert rechazo.status_code == 400
    cuerpo = rechazo.json()
    assert cuerpo["code"] == "VALIDATION_ERROR" and cuerpo["field"] == "repair"
    assert cuerpo["message"] == "El parámetro repair solo admite 1."
    assert api_docente.post(f"{ruta}?repair=0").status_code == 400
    assert api_docente.post(f"{ruta}?repair=TRUE").status_code == 400

    for valor in ("1", "true"):  # la reparación: la generación no está en needs_repair, así que el estado lo rechaza
        respuesta = api_docente.post(f"{ruta}?repair={valor}")
        assert respuesta.status_code == 409 and respuesta.json()["code"] == "GENERATION_STATE", valor

    assert api_docente.post(f"{ruta}?repair=").status_code == 200  # vacío: la escena normal
    assert datos(api_docente.get(f"{BASE}/{gid}"))["callsUsed"] == 2


def test_sin_el_parametro_repair_es_la_escena_normal(api_docente):
    gid, _ = con_esqueleto(api_docente)
    respuesta = api_docente.post(f"{BASE}/{gid}/scenes/aula")
    assert respuesta.status_code == 200
    assert next(e for e in datos(respuesta)["scenes"] if e["clave"] == "aula")["state"] == "done"


def test_sin_rubrica_por_defecto_http_responde_como_apagado_y_no_crea_filas(api_docente, monkeypatch):
    monkeypatch.setattr(context, "competencias_por_defecto", lambda: [])
    assert datos(api_docente.get(f"{BASE}/status"))["enabled"] is False
    respuesta = crear(api_docente)
    assert respuesta.status_code == 404 and respuesta.json()["code"] == "NOT_FOUND"
    assert respuesta.json()["message"] == "La generación con IA no está disponible."
    assert not CaseGeneration.objects.exists()


def test_las_marcas_de_tiempo_son_utc_con_z(api_docente, settings):
    settings.TIME_ZONE = "America/Bogota"
    gen = datos(crear(api_docente))
    assert gen["createdAt"].endswith("Z") and gen["updatedAt"].endswith("Z")
    guardada = CaseGeneration.objects.get(pk=gen["id"]).created_at
    from datetime import timezone
    from zoneinfo import ZoneInfo

    esperado = guardada.replace(tzinfo=ZoneInfo("America/Bogota")).astimezone(timezone.utc)
    assert gen["createdAt"] == esperado.strftime("%Y-%m-%dT%H:%M:%SZ")
