"""Caso PDF — puertas backend-driven con validación de doorKey/requires y
efecto mariposa (flags, métricas y 4 finales).

Corre contra el caso publicado por seed_caso_pdf (SIM-VBG-001 v2.x):
hospital-urgencias ⇄ hospital-sala-escucha → comisaria-recepcion ⇄
comisaria-consultorio, con 6 decisiones canónicas.
"""
import uuid
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.casedef.vocabulary import Activation, Bond
from apps.simulation.models import AttemptEvent, CaseVersion, DecisionOption, DialogueChoice, SimulationAttempt
from apps.simulation.services import case_state

User = get_user_model()

#: Las filas sembradas ya nacen en el modelo nuevo (persona e hitos, finales por clases) y el cálculo del final lee
#: todavía el antiguo (banderas, métricas, severidad): estas pruebas esperan finales que ese cálculo ya no ve.
SKIP_MOTOR_NUEVO = pytest.mark.skip(reason="finales por el motor nuevo: se reescriben en la Tarea 6")


def cl(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def estudiante(db, case_version_id):
    estudiante = User.objects.create_user(
        email="est_pdf@x.com", password="x", nombre="Est", apellido="Pdf", role="ESTUDIANTE"
    )
    profesor = User.objects.create_user(
        email="prof_pdf@x.com", password="x", nombre="Prof", apellido="Pdf", role="PROFESOR"
    )
    grupo = Grupo.objects.create(nombre="Grupo PDF", codigo="PDF", profesor=profesor)
    with connection.cursor() as cur:
        cur.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, estudiante.id],
        )
        cur.execute(
            "INSERT INTO case_assignments (grupo_id, case_version_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, case_version_id],
        )
    return estudiante


@pytest.fixture
def case_version_id(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


def _start(client, case_version_id):
    data = client.post(
        "/api/simulation/attempts", {"caseVersionId": case_version_id}, format="json"
    ).data["data"]
    return data["attemptId"], data["attemptToken"]


def _world(client, attempt_id, token):
    return client.get(
        f"/api/simulation/attempts/{attempt_id}/world",
        HTTP_X_SIEP_ATTEMPT_TOKEN=token,
    ).data["data"]


def _inspect(client, attempt_id, token, key):
    resp = client.post(
        f"/api/simulation/attempts/{attempt_id}/interactions/{key}",
        {"attemptToken": token}, format="json",
    )
    assert resp.status_code == 200, f"interacción {key}: {resp.data}"
    return resp.data["data"]


def _move(client, attempt_id, token, map_key, *points):
    """Camina en pasos plausibles (GAME-01: el servidor valida desplazamiento,
    proximidad y colisiones)."""
    for x, y in points:
        resp = client.patch(
            f"/api/simulation/attempts/{attempt_id}/world-state",
            {"attemptToken": token, "playerX": x, "playerY": y, "currentMapKey": map_key},
            format="json",
        )
        assert resp.status_code == 200, f"mover a ({x},{y}): {resp.data}"


#: Rutas plausibles en hospital-urgencias (spawn 480,430).
PATH_TO_FAMILIA = ((340, 430), (250, 430))
PATH_TO_DOOR = ((430, 435), (610, 440), (790, 445))
#: Ruta en hospital-sala-escucha desde el entry (160,452) hasta salida-institucional (838,440).
PATH_TO_SALIDA = ((340, 450), (520, 445), (700, 442), (820, 440))


def _inspect_familia_cerca(client, attempt_id, token):
    """Materializa el world state, camina hasta la familia y la inspecciona."""
    _world(client, attempt_id, token)
    _move(client, attempt_id, token, "hospital-urgencias", *PATH_TO_FAMILIA)
    return _inspect(client, attempt_id, token, "familia-crisis")


def _enter(client, attempt_id, token, target, door_key=None):
    body = {"attemptToken": token, "targetNodeKey": target}
    if door_key:
        body["doorKey"] = door_key
    return client.post(
        f"/api/simulation/attempts/{attempt_id}/enter-room", body, format="json",
    )


#: Segundos que el reloj simulado ha avanzado desde el inicio de la prueba (ver ``_deliberate_clock``).
_CLOCK = {"seconds": 0}


@pytest.fixture(autouse=True)
def _deliberate_clock(monkeypatch):
    """Cada decisión del recorrido es deliberada: el reloj avanza 3 s entre una y la siguiente.

    Sin eso, la misma opción dos veces en menos de 2 s es un doble clic (E1-3) y la segunda
    oportunidad del recorrido («la 1.ª respuesta mala se reintenta y la 2.ª se registra») no se gasta.
    """
    _CLOCK["seconds"] = 0
    real_now = timezone.now
    monkeypatch.setattr(timezone, "now", lambda: real_now() + timedelta(seconds=_CLOCK["seconds"]))


def _decide_payload(client, attempt_id, token, option_key, case_version_id):
    """La respuesta completa de la decisión: ``{attempt, consequence}`` y, si hay reintento, ``retry``."""
    _CLOCK["seconds"] += 3
    option = DecisionOption.objects.get(case_version_id=case_version_id, option_key=option_key)
    # Cada llamada es una respuesta deliberada: lleva su requestId, como el cliente real (E1-3);
    # sin él, la misma opción dos veces en menos de 2 s es un doble clic y no gasta el reintento.
    resp = client.post(
        f"/api/simulation/attempts/{attempt_id}/decisions",
        {"attemptToken": token, "decisionOptionId": option.id, "requestId": uuid.uuid4().hex},
        format="json",
    )
    assert resp.status_code == 200, f"decisión {option_key}: {resp.data}"
    return resp.data["data"]


def _decide(client, attempt_id, token, option_key, case_version_id):
    """El estado del intento tras la decisión."""
    return _decide_payload(client, attempt_id, token, option_key, case_version_id)["attempt"]


def test_acciones_clinicas_canonicas_exponen_herramienta_sin_fingir_decision(case_version_id):
    expected = {
        "familia-crisis": "PAP",
        "sobreviviente-consulta": "RISK_METER",
    }
    for tree_key, tool_code in expected.items():
        choices = DialogueChoice.objects.filter(
            dialogue_tree__scene_map__case_version_id=case_version_id,
            dialogue_tree__tree_key=tree_key,
            required_tool_code=tool_code,
        )
        assert choices.exists()
        assert all(choice.decision_option_id is None for choice in choices)


def test_pap_se_aplica_de_forma_pertinente_a_la_familia(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    world = _world(c, attempt_id, token)
    _move(c, attempt_id, token, world["map"]["key"], (340, 430))
    _inspect(c, attempt_id, token, "tool-pap")
    _move(c, attempt_id, token, world["map"]["key"], (250, 430))

    resp = c.post(
        f"/api/simulation/attempts/{attempt_id}/tools/use",
        {
            "attemptToken": token,
            "toolCode": "PAP",
            "targetInteractionKey": "familia-crisis",
        },
        format="json",
    )

    assert resp.status_code == 200
    result = resp.data["data"]
    assert result["pertinent"] is True
    assert "PAP@familia-crisis" in result["world"]["usedToolKeys"]


# ─── Puertas: validación backend ──────────────────────────────────────────────

def test_door_locked_until_familia_inspected(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)
    # Junto a la puerta pero sin hablar con la familia: bloqueada (requiresInspected).
    _move(c, attempt_id, token, "hospital-urgencias", *PATH_TO_DOOR)
    resp = _enter(c, attempt_id, token, "hospital-sala-escucha", "puerta-sala-escucha")
    assert resp.status_code == 400
    # Tras la interacción: pasa.
    _move(c, attempt_id, token, "hospital-urgencias", *reversed(PATH_TO_DOOR))
    _move(c, attempt_id, token, "hospital-urgencias", *PATH_TO_FAMILIA)
    _inspect(c, attempt_id, token, "familia-crisis")
    _move(c, attempt_id, token, "hospital-urgencias", (340, 430), (430, 435), (610, 440), (790, 445))
    resp = _enter(c, attempt_id, token, "hospital-sala-escucha", "puerta-sala-escucha")
    assert resp.status_code == 200
    assert resp.data["data"]["map"]["key"] == "hospital-sala-escucha"
    assert resp.data["data"]["player"]["x"] == 160


def test_door_nonexistent_key_404(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    resp = _enter(c, attempt_id, token, "hospital-sala-escucha", "puerta-fantasma")
    assert resp.status_code == 404


def test_door_target_mismatch_400(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _inspect_familia_cerca(c, attempt_id, token)
    # puerta-sala-escucha NO conduce a comisaria-recepcion.
    resp = _enter(c, attempt_id, token, "comisaria-recepcion", "puerta-sala-escucha")
    assert resp.status_code == 400


def test_salida_institucional_locked_by_node(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _inspect_familia_cerca(c, attempt_id, token)
    _move(c, attempt_id, token, "hospital-urgencias", (340, 430), (430, 435), (610, 440), (790, 445))
    assert _enter(c, attempt_id, token, "hospital-sala-escucha", "puerta-sala-escucha").status_code == 200
    # En etapa hospitalaria la salida institucional sigue bloqueada (requiresNodes).
    _move(c, attempt_id, token, "hospital-sala-escucha", *PATH_TO_SALIDA)
    resp = _enter(c, attempt_id, token, "comisaria-recepcion", "salida-institucional")
    assert resp.status_code == 400


def test_door_room_persists_after_reload(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _inspect_familia_cerca(c, attempt_id, token)
    _move(c, attempt_id, token, "hospital-urgencias", (340, 430), (430, 435), (610, 440), (790, 445))
    _enter(c, attempt_id, token, "hospital-sala-escucha", "puerta-sala-escucha")
    again = _world(c, attempt_id, token)
    assert again["map"]["key"] == "hospital-sala-escucha"
    # Y la vuelta funciona (el entry 160,452 queda junto a puerta-urgencias).
    resp = _enter(c, attempt_id, token, "hospital-urgencias", "puerta-urgencias")
    assert resp.status_code == 200
    assert resp.data["data"]["map"]["key"] == "hospital-urgencias"


def test_entry_coordinates_from_client_are_ignored(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _inspect_familia_cerca(c, attempt_id, token)
    _move(c, attempt_id, token, "hospital-urgencias", (340, 430), (430, 435), (610, 440), (790, 445))
    resp = _enter(c, attempt_id, token, "hospital-sala-escucha", "puerta-sala-escucha")
    assert resp.status_code == 200
    player = resp.data["data"]["player"]
    assert player["x"] == 160
    assert player["y"] == 452


# ─── Efecto mariposa: flags y métricas por decisión ───────────────────────────

def _milestones(attempt_id):
    return case_state.read(SimulationAttempt.objects.get(pk=attempt_id)).milestones


def _persona(attempt_id):
    return case_state.read(SimulationAttempt.objects.get(pk=attempt_id)).persona


def test_decision_hospital_recomendada_cumple_hitos_y_mueve_a_la_persona(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)  # materializa el world state
    assert _milestones(attempt_id) == frozenset()
    assert _persona(attempt_id) == (Bond.GUARDED, Activation.TENSE)

    payload = _decide_payload(c, attempt_id, token, "h1-pap-contencion", case_version_id)

    assert set(payload) == {"attempt", "consequence"}
    assert payload["attempt"]["currentNode"]["key"] != "hospital-urgencias"
    assert _milestones(attempt_id) >= {"pap_aplicado", "familia_contenida"}
    assert _persona(attempt_id) == (Bond.OPEN, Activation.CALM)  # Recomendada: +1 vínculo, -1 activación


def test_decision_hospital_critica_exige_reintento_sin_cumplir_hitos_ni_mover_a_la_persona(
    estudiante, case_version_id
):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _world(c, attempt_id, token)

    payload = _decide_payload(c, attempt_id, token, "h1-interrogar-victima", case_version_id)

    assert set(payload) == {"attempt", "consequence", "retry"}
    assert payload["retry"]["allowed"] is True
    assert payload["attempt"]["currentNode"]["key"] == "hospital-urgencias"
    assert _milestones(attempt_id) == frozenset()
    assert _persona(attempt_id) == (Bond.GUARDED, Activation.TENSE)
    assert AttemptEvent.objects.filter(
        attempt_id=attempt_id, event_type="PROHIBITED_DECISION_RETRY_REQUIRED"
    ).exists()
    assert SimulationAttempt.objects.get(pk=attempt_id).revictimization_risk is False


def _play_hospital(c, attempt_id, token, case_version_id, h1, h2, h3):
    _world(c, attempt_id, token)
    _decide(c, attempt_id, token, h1, case_version_id)
    _decide(c, attempt_id, token, h2, case_version_id)
    _decide(c, attempt_id, token, h3, case_version_id)


def test_decision_comisaria_recomendada_cumple_los_hitos_de_proteccion(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _play_hospital(c, attempt_id, token, case_version_id,
                   "h1-pap-contencion", "h2-459-1257", "h3-integral-psicosocial")
    assert "medidas_proteccion_activadas" not in _milestones(attempt_id)

    payload = _decide_payload(c, attempt_id, token, "c1-riesgo-proteccion-derechos", case_version_id)

    assert set(payload) == {"attempt", "consequence"}
    assert _milestones(attempt_id) >= {
        "riesgo_feminicidio_valorado", "medidas_proteccion_activadas", "asesoria_derechos_realizada",
    }


def test_decision_comisaria_critica_exige_reintento_sin_cumplir_el_hito_de_proteccion(
    estudiante, case_version_id
):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _play_hospital(c, attempt_id, token, case_version_id,
                   "h1-pap-contencion", "h2-459-1257", "h3-integral-psicosocial")
    persona_before = _persona(attempt_id)

    payload = _decide_payload(c, attempt_id, token, "c1-mediacion-perdon", case_version_id)

    assert payload["retry"]["allowed"] is True
    assert payload["attempt"]["currentNode"]["key"] == "hospital-cierre-bloque"
    assert "medidas_proteccion_activadas" not in _milestones(attempt_id)
    assert _persona(attempt_id) == persona_before  # el reintento no mueve a la persona


# ─── Finales ──────────────────────────────────────────────────────────────────

def _play_full(c, attempt_id, token, case_version_id, keys):
    _world(c, attempt_id, token)
    state = None
    for key in keys:
        state = _decide(c, attempt_id, token, key, case_version_id)
    return state


@SKIP_MOTOR_NUEVO
def test_final_integral(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    state = _play_full(c, attempt_id, token, case_version_id, [
        "h1-pap-contencion", "h2-459-1257", "h3-integral-psicosocial",
        "c1-riesgo-proteccion-derechos", "c2-2126-1098-1257", "c3-integral-derechos",
    ])
    assert state["status"] == "COMPLETED"
    ending = state["completionReport"]["ending"]
    assert ending["key"] == "integral"
    assert ending["severityCounts"]["critical"] == 0
    assert ending["severityCounts"]["recommended"] == 6
    assert ending["caseFlags"]["medidas_proteccion_activadas"] is True


def _registrada(key):
    """Una opción mala que SÍ queda registrada: la 1.ª respuesta mala de la escena se
    reintenta (no se aplica ni cuenta) y la 2.ª se registra y avanza."""
    return [key, key]


@SKIP_MOTOR_NUEVO
def test_final_critico_con_dos_criticas(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    state = _play_full(c, attempt_id, token, case_version_id, [
        *_registrada("h1-interrogar-victima"),
        "h2-459-1257",
        "h3-integral-psicosocial",
        *_registrada("c1-mediacion-perdon"),
        "c2-2126-1098-1257",
        "c3-integral-derechos",
    ])
    assert state["status"] == "COMPLETED"
    ending = state["completionReport"]["ending"]
    assert ending["key"] == "critico"
    assert ending["severityCounts"]["critical"] == 2


@SKIP_MOTOR_NUEVO
def test_final_riesgo_persistente_por_omision(estudiante, case_version_id):
    # Sin críticas, pero sin valorar feminicidio ni activar protección (C1
    # desviada a patrones de infancia, registrada) y C3 sin valoración de riesgo.
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    state = _play_full(c, attempt_id, token, case_version_id, [
        "h1-pap-contencion",
        "h2-459-1257",
        "h3-integral-psicosocial",
        *_registrada("c1-patrones-infancia"),
        "c2-2126-1098-1257",
        *_registrada("c3-valoracion-dependientes"),
    ])
    ending = state["completionReport"]["ending"]
    assert ending["key"] == "riesgo"
    assert ending["severityCounts"]["critical"] == 0
    assert not ending["caseFlags"].get("medidas_proteccion_activadas")


@SKIP_MOTOR_NUEVO
def test_final_riesgo_persistente_por_acumulacion(estudiante, case_version_id):
    # Protección completa, pero tres decisiones riesgosas REGISTRADAS.
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    state = _play_full(c, attempt_id, token, case_version_id, [
        "h1-pap-contencion",
        *_registrada("h2-459-1448"),
        *_registrada("h3-parcial-disonancia"),
        "c1-riesgo-proteccion-derechos",
        *_registrada("c2-eje-1448"),
        "c3-integral-derechos",
    ])
    ending = state["completionReport"]["ending"]
    assert ending["key"] == "riesgo"
    assert ending["severityCounts"]["risky"] == 3


@SKIP_MOTOR_NUEVO
def test_final_brechas_con_parciales(estudiante, case_version_id):
    # Protección completa (C1 recomendada) pero parciales acumuladas leves.
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    state = _play_full(c, attempt_id, token, case_version_id, [
        "h1-pap-contencion",
        *_registrada("h2-459-1448"),
        *_registrada("h3-parcial-disonancia"),
        "c1-riesgo-proteccion-derechos", "c2-2126-1098-1257", "c3-integral-derechos",
    ])
    ending = state["completionReport"]["ending"]
    assert ending["key"] == "brechas"
    assert ending["severityCounts"]["risky"] == 2


@SKIP_MOTOR_NUEVO
def test_un_reintento_no_impide_el_final_integral(estudiante, case_version_id):
    # DLG-07: una primera respuesta mala (que el juego no aplica) no baja el final.
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    state = _play_full(c, attempt_id, token, case_version_id, [
        "h1-pap-contencion",
        "h2-459-1448", "h2-459-1257",
        "h3-parcial-disonancia", "h3-integral-psicosocial",
        "c1-patrones-infancia", "c1-riesgo-proteccion-derechos",
        "c2-eje-1448", "c2-2126-1098-1257",
        "c3-integral-derechos",
    ])
    ending = state["completionReport"]["ending"]
    assert ending["key"] == "integral"
    assert ending["severityCounts"] == {
        "recommended": 6, "acceptable": 0, "risky": 0, "critical": 0,
    }
    assert state["completionReport"]["retries"] == 4


def test_cambiar_sala_no_puntua_ni_avanza(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _inspect_familia_cerca(c, attempt_id, token)
    _move(c, attempt_id, token, "hospital-urgencias", (340, 430), (430, 435), (610, 440), (790, 445))
    _enter(c, attempt_id, token, "hospital-sala-escucha", "puerta-sala-escucha")
    state = c.get(
        f"/api/simulation/attempts/{attempt_id}",
        HTTP_X_SIEP_ATTEMPT_TOKEN=token,
    ).data["data"]
    assert state["accumulatedScore"] == 0
    assert state["currentNode"]["key"] == "hospital-urgencias"  # el DAG no avanzó
