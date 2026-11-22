"""Bloque BK (rediseño del portal) · lo que la interfaz nueva necesita del servidor, solo agregado.

- BK-1: la ficha (``GET /api/simulation/cases/{id}/brief``) y el catálogo dicen cuántas escenas tiene el caso, dónde
  empieza, su portada en pixel art, los temas sensibles declarados y si se valora con una rúbrica. ``conRubrica`` usa la
  MISMA resolución que la valoración (asignada, propia o predeterminada): con «hay una asignada» la ficha mentiría.
- BK-3: la revisión docente dice el estado de la valoración de cada intento y filtra ``?evaluacion=pendiente``; una
  valoración guardada a medias sigue pendiente.
- BK-4: la lista de autoría trae el caso de cada versión, cuándo se editó, cuántas escenas tienen guion y la portada.

Ningún permiso cambia: lo que antes era 403 o 404 lo sigue siendo.
"""
import json
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.simulation.models import (
    CaseVersion,
    DecisionOption,
    Rubric,
    RubricEvaluation,
    SceneMap,
    SimulationAttempt,
    SimulationCase,
    SimulationNode,
    SimulationRubricAssignment,
)

from .test_instructor import assign_case_to_student

User = get_user_model()
BRIEF = "/api/simulation/cases/{}/brief"
CATALOG = "/api/simulation/catalog"
AUTHORING = "/api/authoring/cases"
ATTEMPTS = "/api/instructor/attempts"
RECENT = "/api/instructor/attempts/recent"
FONDO = "/assets/game/rooms/consultorio-dia.png"


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="x", nombre="N", apellido="A", role=role)


@pytest.fixture
def profesor(db):
    return _user("bk_prof@x.com", "PROFESOR")


@pytest.fixture
def admin(db):
    return _user("bk_admin@x.com", "ADMIN")


@pytest.fixture
def estudiante(db):
    return _user("bk_est@x.com", "ESTUDIANTE")


@pytest.fixture
def seeded(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


def _published(owner, code):
    """Un caso publicado mínimo: una escena de inicio con su sala de imagen fija y un final."""
    case = SimulationCase.objects.create(code=code, title=f"Caso {code}", created_by=owner)
    version = CaseVersion.objects.create(
        simulation_case=case, semantic_version="1.0.0", status="PUBLISHED", created_by=owner,
    )
    start = SimulationNode.objects.create(
        case_version=version, node_key="inicio", title="La llamada", narrative="Suena el teléfono.", start_node=True,
    )
    end = SimulationNode.objects.create(
        case_version=version, node_key="fin", title="Cierre", narrative="Se despiden.", terminal_node=True,
    )
    DecisionOption.objects.create(
        case_version=version, option_key="o1", source_node=start, target_node=end, text="Contestar",
        response_class="RECOMMENDED",
    )
    SceneMap.objects.create(
        case_version=version, node=start, map_key="consultorio", title="Consultorio",
        ambient_json=json.dumps({"backgroundImage": FONDO}),
    )
    return version


def _sin_rubrica_predeterminada():
    Rubric.objects.filter(is_default=True).update(active=False)


def _start_map(version):
    start = SimulationNode.objects.get(case_version=version, start_node=True)
    return SceneMap.objects.get(node=start)


# ─── BK-1 · la ficha ──────────────────────────────────────────────────────────────────────────────
def test_la_ficha_dice_cuantas_escenas_donde_empieza_y_su_portada(estudiante, profesor, seeded):
    assign_case_to_student(estudiante, seeded.id, "BK-FICHA", profesor=profesor)
    scene_map = _start_map(seeded)
    SceneMap.objects.filter(pk=scene_map.pk).update(ambient_json=json.dumps({"backgroundImage": FONDO}), structure=None)

    brief = cl(estudiante).get(BRIEF.format(seeded.id)).json()["data"]

    assert brief["escenas"] == SimulationNode.objects.filter(case_version=seeded).count()
    start = SimulationNode.objects.get(case_version=seeded, start_node=True)
    assert brief["inicio"] == {"escena": start.title, "lugar": scene_map.title}
    assert brief["portada"] == FONDO


@pytest.mark.parametrize(
    "ambient, structure",
    [
        ({"backgroundImage": FONDO}, {"ancho": 3, "piezas": []}),  # una sala por piezas no tiene imagen propia
        ({"backgroundImage": "javascript:alert(1)"}, None),  # S2-6b: un fondo no permitido no llega a la persona
        ({"backgroundImage": "http://otro.example/fondo.png"}, None),
        ({}, None),
    ],
)
def test_sin_imagen_fija_permitida_la_portada_es_nula(estudiante, profesor, seeded, ambient, structure):
    assign_case_to_student(estudiante, seeded.id, "BK-PORTADA", profesor=profesor)
    SceneMap.objects.filter(pk=_start_map(seeded).pk).update(ambient_json=json.dumps(ambient), structure=structure)

    assert cl(estudiante).get(BRIEF.format(seeded.id)).json()["data"]["portada"] is None


def test_un_caso_sin_escena_de_inicio_no_dice_donde_empieza(estudiante, profesor):
    version = _published(profesor, "BK-SIN-INICIO")
    SimulationNode.objects.filter(case_version=version).update(start_node=False)
    assign_case_to_student(estudiante, version.id, "BK-SININI", profesor=profesor)

    brief = cl(estudiante).get(BRIEF.format(version.id)).json()["data"]

    assert brief["inicio"] is None and brief["portada"] is None and brief["escenas"] == 2


def test_los_temas_sensibles_salen_limpios_y_por_defecto_no_hay(estudiante, profesor):
    version = _published(profesor, "BK-TEMAS")
    assign_case_to_student(estudiante, version.id, "BK-TEMAS", profesor=profesor)
    client = cl(estudiante)

    assert client.get(BRIEF.format(version.id)).json()["data"]["temasSensibles"] == []

    CaseVersion.objects.filter(pk=version.pk).update(
        content_warnings=json.dumps(["  violencia de pareja ", "", 7, None, "riesgo de feminicidio"])
    )
    assert client.get(BRIEF.format(version.id)).json()["data"]["temasSensibles"] == [
        "violencia de pareja", "riesgo de feminicidio",
    ]


def test_un_texto_roto_en_los_temas_no_tumba_la_ficha(estudiante, profesor):
    version = _published(profesor, "BK-TEMAS-ROTO")
    CaseVersion.objects.filter(pk=version.pk).update(content_warnings="{no es json")
    assign_case_to_student(estudiante, version.id, "BK-ROTO", profesor=profesor)

    response = cl(estudiante).get(BRIEF.format(version.id))

    assert response.status_code == 200 and response.json()["data"]["temasSensibles"] == []


@pytest.mark.parametrize("como", ["ninguna", "predeterminada", "propia", "asignada"])
def test_con_rubrica_sigue_la_resolucion_de_la_valoracion(estudiante, profesor, como):
    version = _published(profesor, f"BK-RUB-{como.upper()}")
    assign_case_to_student(estudiante, version.id, f"BK-R-{como[:4].upper()}", profesor=profesor)
    _sin_rubrica_predeterminada()
    if como == "predeterminada":
        Rubric.objects.create(name="Plataforma", is_default=True, active=True, created_by=profesor)
    elif como == "propia":
        Rubric.objects.create(name="Del caso", case_version=version, active=True, created_by=profesor)
    elif como == "asignada":
        rubric = Rubric.objects.create(name="Del curso", active=True, created_by=profesor)
        SimulationRubricAssignment.objects.create(case_version=version, rubric=rubric, assigned_by=profesor)

    brief = cl(estudiante).get(BRIEF.format(version.id)).json()["data"]

    assert brief["conRubrica"] is (como != "ninguna")


def test_la_ficha_de_un_caso_no_asignado_sigue_sin_revelar_nada(profesor):
    version = _published(profesor, "BK-NO-ASIG")
    CaseVersion.objects.filter(pk=version.pk).update(content_warnings=json.dumps(["violencia de pareja"]))
    outsider = _user("bk_fuera@x.com", "ESTUDIANTE")

    response = cl(outsider).get(BRIEF.format(version.id))

    assert response.status_code == 403
    assert "temasSensibles" not in json.dumps(response.json()) and "violencia" not in json.dumps(response.json())


# ─── BK-1 · el catálogo ───────────────────────────────────────────────────────────────────────────
def test_el_catalogo_trae_portada_y_escenas_de_cada_caso(admin, profesor):
    version = _published(profesor, "BK-CATALOGO")

    items = {i["caseVersionId"]: i for i in cl(admin).get(CATALOG).json()["data"]}

    assert items[version.id]["portada"] == FONDO
    assert items[version.id]["escenas"] == 2
    assert all({"portada", "escenas"} <= set(item) for item in items.values())


def test_el_catalogo_del_estudiante_trae_lo_mismo_solo_de_lo_asignado(estudiante, profesor):
    version = _published(profesor, "BK-CAT-EST")
    otro = _published(profesor, "BK-CAT-OTRO")
    assign_case_to_student(estudiante, version.id, "BK-CATEST", profesor=profesor)

    items = cl(estudiante).get(CATALOG).json()["data"]

    ids = {i["caseVersionId"] for i in items}
    assert version.id in ids and otro.id not in ids
    mine = next(i for i in items if i["caseVersionId"] == version.id)
    assert mine["portada"] == FONDO and mine["escenas"] == 2


# ─── BK-4 · la lista de autoría ───────────────────────────────────────────────────────────────────
def test_la_lista_de_autoria_dice_caso_edicion_guion_y_portada(profesor):
    client = cl(profesor)
    created = client.post(AUTHORING, {"title": "Caso de la lista"}, format="json").json()["data"]
    cv = created["caseVersionId"]

    item = next(i for i in client.get(AUTHORING).json()["data"] if i["caseVersionId"] == cv)

    version = CaseVersion.objects.get(pk=cv)
    assert item["caseId"] == version.simulation_case_id
    # Recién creado nadie lo ha editado: la fecha es la de creación (no «ahora» inventado).
    assert version.updated_at is None and item["updatedAt"] == version.created_at.isoformat()
    # La escena vacía de siempre tiene narración de muestra pero ninguna respuesta: aún no tiene guion.
    assert item["nodeCount"] == 1 and item["escenasConGuion"] == 0
    assert item["portada"] is None  # la sala inicial no trae fondo


def test_editar_el_caso_mueve_la_fecha_de_la_ultima_edicion(profesor):
    client = cl(profesor)
    created = client.post(AUTHORING, {"title": "Caso que se edita"}, format="json").json()["data"]
    cv = created["caseVersionId"]
    antes = timezone.now()

    response = client.put(
        f"{AUTHORING}/{cv}/brief", {"context": "Nuevo contexto.", "revision": created["revision"]}, format="json"
    )
    assert response.status_code == 200, response.content

    version = CaseVersion.objects.get(pk=cv)
    assert version.updated_at is not None and version.updated_at >= antes.replace(microsecond=0)
    item = next(i for i in client.get(AUTHORING).json()["data"] if i["caseVersionId"] == cv)
    assert item["updatedAt"] == version.updated_at.isoformat()


def test_una_escena_tiene_guion_con_narracion_y_respuestas_o_si_es_un_final(profesor):
    version = _published(profesor, "BK-GUION")  # inicio con respuesta + final con narración: 2 con guion
    SimulationNode.objects.create(case_version=version, node_key="vacia", title="Vacía", narrative="   ")
    SimulationNode.objects.create(case_version=version, node_key="sin-salida", title="Sin salida", narrative="Texto.")
    SimulationNode.objects.create(
        case_version=version, node_key="final-vacio", title="Final vacío", narrative="", terminal_node=True,
    )
    CaseVersion.objects.filter(pk=version.pk).update(status="DRAFT")

    item = next(i for i in cl(profesor).get(AUTHORING).json()["data"] if i["caseVersionId"] == version.id)

    assert item["nodeCount"] == 5 and item["escenasConGuion"] == 2
    assert item["portada"] == FONDO


def test_la_lista_de_autoria_sigue_siendo_solo_de_lo_propio(profesor):
    otro = _user("bk_prof_otro@x.com", "PROFESOR")
    ajeno = _published(otro, "BK-AJENO")

    ids = {i["caseVersionId"] for i in cl(profesor).get(AUTHORING).json()["data"]}

    assert ajeno.id not in ids


def test_clonar_una_version_conserva_los_temas_sensibles(admin, profesor):
    version = _published(profesor, "BK-CLON")
    CaseVersion.objects.filter(pk=version.pk).update(content_warnings=json.dumps(["duelo"]))

    response = cl(admin).post(f"/api/admin/cases/{version.id}/clone-version", {}, format="json")

    assert response.status_code == 200, response.content
    clon = CaseVersion.objects.get(pk=response.json()["data"]["caseVersionId"])
    assert json.loads(clon.content_warnings) == ["duelo"]


# ─── BK-3 · la revisión ───────────────────────────────────────────────────────────────────────────
def _attempt(estudiante, version, status, ended=True):
    return SimulationAttempt.objects.create(
        attempt_token_hash=uuid.uuid4().hex, student=estudiante, case_version=version,
        current_node=SimulationNode.objects.filter(case_version=version, start_node=True).first(),
        status=status, ended_at=timezone.now() if ended else None,
    )


def _evaluation(attempt, profesor, status):
    rubric = Rubric.objects.filter(active=True).order_by("id").first()
    return RubricEvaluation.objects.create(
        attempt=attempt, rubric=rubric, instructor=profesor, status=status, origin="DOCENTE",
    )


@pytest.fixture
def bandeja(estudiante, profesor):
    """Cuatro intentos del estudiante de la docente sobre un caso que se valora con una rúbrica propia."""
    version = _published(profesor, "BK-BANDEJA")
    Rubric.objects.create(name="Del caso", case_version=version, active=True, created_by=profesor)
    assign_case_to_student(estudiante, version.id, "BK-BANDEJA", profesor=profesor)
    sin_valorar = _attempt(estudiante, version, "COMPLETED")
    a_medias = _attempt(estudiante, version, "COMPLETED")
    _evaluation(a_medias, profesor, "PENDING")
    valorado = _attempt(estudiante, version, "COMPLETED")
    _evaluation(valorado, profesor, "EVALUATED")
    en_curso = _attempt(estudiante, version, "IN_PROGRESS", ended=False)
    return {
        "version": version,
        "sin_valorar": str(sin_valorar.id), "a_medias": str(a_medias.id),
        "valorado": str(valorado.id), "en_curso": str(en_curso.id),
    }


def _estados(response):
    assert response.status_code == 200, response.content
    return {i["attemptId"]: i["evaluationStatus"] for i in response.json()["data"]["items"]}


def test_cada_intento_dice_el_estado_de_su_valoracion(profesor, bandeja):
    estados = _estados(cl(profesor).get(ATTEMPTS, {"caseVersionId": bandeja["version"].id}))

    assert estados == {
        bandeja["sin_valorar"]: "PENDIENTE",
        bandeja["a_medias"]: "PENDIENTE",  # guardada sin concluir: el estudiante aún no la ve
        bandeja["valorado"]: "APLICADA",
        bandeja["en_curso"]: "NO_APLICA",
    }


def test_por_revisar_son_los_terminados_sin_valoracion_concluida(profesor, bandeja):
    pendientes = _estados(cl(profesor).get(ATTEMPTS, {"evaluacion": "pendiente"}))

    assert set(pendientes) == {bandeja["sin_valorar"], bandeja["a_medias"]}
    assert set(pendientes.values()) == {"PENDIENTE"}


def test_el_filtro_aplicada_trae_solo_los_valorados(profesor, bandeja):
    aplicadas = _estados(cl(profesor).get(ATTEMPTS, {"evaluacion": "aplicada"}))

    assert aplicadas == {bandeja["valorado"]: "APLICADA"}


def test_el_filtro_cuenta_lo_filtrado_en_la_cobertura(profesor, bandeja):
    body = cl(profesor).get(ATTEMPTS, {"evaluacion": "pendiente", "pageSize": 1}).json()["data"]

    assert body["coverage"] == {"shown": 1, "total": 2}


def test_sin_ninguna_rubrica_un_terminado_no_queda_por_revisar(estudiante, profesor):
    _sin_rubrica_predeterminada()
    version = _published(profesor, "BK-SIN-RUB")
    assign_case_to_student(estudiante, version.id, "BK-SINRUB", profesor=profesor)
    terminado = str(_attempt(estudiante, version, "COMPLETED").id)
    client = cl(profesor)

    assert _estados(client.get(ATTEMPTS, {"caseVersionId": version.id})) == {terminado: "NO_APLICA"}
    assert terminado not in _estados(client.get(ATTEMPTS, {"evaluacion": "pendiente"}))


def test_con_la_rubrica_predeterminada_todo_terminado_espera_valoracion(estudiante, profesor):
    _sin_rubrica_predeterminada()
    Rubric.objects.create(name="Plataforma", is_default=True, active=True, created_by=profesor)
    version = _published(profesor, "BK-PREDET")
    assign_case_to_student(estudiante, version.id, "BK-PREDET", profesor=profesor)
    terminado = str(_attempt(estudiante, version, "COMPLETED").id)

    assert _estados(cl(profesor).get(ATTEMPTS, {"evaluacion": "pendiente"})) == {terminado: "PENDIENTE"}


def test_un_filtro_de_valoracion_desconocido_es_un_400(profesor):
    response = cl(profesor).get(ATTEMPTS, {"evaluacion": "pendientes"})

    assert response.status_code == 400 and response.json()["code"] == "INVALID_QUERY_PARAM"


def test_el_filtro_no_abre_la_revision_al_estudiante(estudiante):
    assert cl(estudiante).get(ATTEMPTS, {"evaluacion": "pendiente"}).status_code == 403


def test_los_recientes_traen_la_version_el_fin_y_el_estado_de_la_valoracion(profesor, bandeja):
    response = cl(profesor).get(RECENT)

    assert response.status_code == 200
    items = {i["attemptId"]: i for i in response.json()["data"]}
    assert items[bandeja["valorado"]]["evaluationStatus"] == "APLICADA"
    assert items[bandeja["sin_valorar"]]["evaluationStatus"] == "PENDIENTE"
    assert items[bandeja["en_curso"]]["evaluationStatus"] == "NO_APLICA"
    assert items[bandeja["en_curso"]]["endedAt"] is None
    assert items[bandeja["valorado"]]["caseVersionId"] == bandeja["version"].id


def test_los_recientes_no_muestran_intentos_de_otra_docente(estudiante, profesor, bandeja):
    otra = _user("bk_otra@x.com", "PROFESOR")

    assert cl(otra).get(RECENT).json()["data"] == []
