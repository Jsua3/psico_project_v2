"""E1-4 · Continuar un intento revalida el acceso (RN-04 en su parte, Review Focus 2).

El docente retira al estudiante del grupo, desactiva el grupo o quita la asignación
mientras hay un intento abierto: continuar y cada orden del intento responden 403
``ACCESS_NOT_ASSIGNED``. Una versión archivada o un caso dado de baja **se dejan
terminar**: solo un caso nuevo exige estar publicado. Un intento cerrado se sigue
pudiendo leer.
"""
import pytest
from django.contrib.auth import get_user_model

from apps.grupos.models import Grupo, CaseAssignment, GrupoEstudiante
from apps.simulation.models import CaseVersion, DecisionOption, SimulationAttempt, SimulationCase

from .test_world import _start, case_version_id, cl, estudiante  # noqa: F401  (fixtures)
from .case_exploration import explore_what_the_case_asks_for

pytestmark = pytest.mark.req("RN-04")

BASE = "/api/simulation"
GROUP_CODE = "WORLD1"  # el grupo que arma la fixture ``estudiante`` de test_world
User = get_user_model()


def _remove_from_group(estudiante):
    GrupoEstudiante.objects.filter(estudiante=estudiante).delete()


def _deactivate_group(estudiante):
    Grupo.objects.filter(codigo=GROUP_CODE).update(activo=False)


def _unassign_case(estudiante):
    CaseAssignment.objects.filter(grupo__codigo=GROUP_CODE).delete()


LOSE_ACCESS = {
    "retirado del grupo": _remove_from_group,
    "grupo desactivado": _deactivate_group,
    "asignación retirada": _unassign_case,
}


def _operations(attempt_id, token, case_version_id, option_id, map_key):
    """(nombre, método, ruta, cuerpo) de lo que el estudiante hace con un intento abierto."""
    body = {"attemptToken": token}
    return [
        ("continuar", "get", f"{BASE}/cases/{case_version_id}/active-attempt", None),
        ("estado", "get", f"{BASE}/attempts/{attempt_id}", None),
        ("decidir", "post", f"{BASE}/attempts/{attempt_id}/decisions", {**body, "decisionOptionId": option_id}),
        ("mundo", "get", f"{BASE}/attempts/{attempt_id}/world", None),
        ("mover", "patch", f"{BASE}/attempts/{attempt_id}/world-state",
         {**body, "playerX": 340, "playerY": 430, "currentMapKey": map_key}),
    ]


def _call(client, token, method, path, body):
    kwargs = {"HTTP_X_SIEP_ATTEMPT_TOKEN": token}
    if method == "get":
        return client.get(path, **kwargs)
    return getattr(client, method)(path, body, format="json")


@pytest.mark.parametrize("how", sorted(LOSE_ACCESS))
def test_un_estudiante_sin_acceso_no_puede_continuar_ni_operar(estudiante, case_version_id, how):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    node_id = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    option = DecisionOption.objects.filter(source_node_id=node_id, response_class="RECOMMENDED").first()
    map_key = c.get(f"{BASE}/attempts/{attempt_id}/world", HTTP_X_SIEP_ATTEMPT_TOKEN=token).data["data"]["map"]["key"]
    LOSE_ACCESS[how](estudiante)

    for name, method, path, body in _operations(attempt_id, token, case_version_id, option.id, map_key):
        response = _call(c, token, method, path, body)
        assert response.status_code == 403, (how, name, response.data)
        assert response.data["code"] == "ACCESS_NOT_ASSIGNED", (how, name, response.data)
    assert SimulationAttempt.objects.get(pk=attempt_id).status == "IN_PROGRESS"


def test_una_version_archivada_se_deja_terminar(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    explore_what_the_case_asks_for(attempt_id)  # el caso 2.1 retiene la recomendada hasta explorar
    node_id = SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    option = DecisionOption.objects.filter(source_node_id=node_id, response_class="RECOMMENDED").first()
    CaseVersion.objects.filter(pk=case_version_id).update(status="ARCHIVED")

    active = c.get(f"{BASE}/cases/{case_version_id}/active-attempt")
    # Continuar reemite el token del intento: la orden siguiente usa el nuevo.
    decided = c.post(
        f"{BASE}/attempts/{attempt_id}/decisions",
        {"attemptToken": active.data["data"]["attemptToken"], "decisionOptionId": option.id}, format="json",
    )

    assert active.status_code == 200
    assert active.data["data"]["attemptId"] == attempt_id
    assert decided.status_code == 200


def test_un_caso_dado_de_baja_se_deja_terminar_pero_no_se_inicia_otro(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    SimulationCase.objects.filter(versions__pk=case_version_id).update(active=False)

    active = c.get(f"{BASE}/cases/{case_version_id}/active-attempt")
    state = c.get(
        f"{BASE}/attempts/{attempt_id}", HTTP_X_SIEP_ATTEMPT_TOKEN=active.data["data"]["attemptToken"]
    )
    other = User.objects.create_user(
        email="otro_baja@x.com", password="x", nombre="O", apellido="B", role="ESTUDIANTE"
    )
    started = cl(other).post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json")

    assert active.status_code == 200
    assert state.status_code == 200
    assert started.status_code == 403


def test_el_profesor_y_el_admin_revisan_por_la_traza_sin_depender_de_la_asignacion(estudiante, case_version_id):
    """La revisión docente (``/api/instructor``) no pasa por la asignación del estudiante; por
    token solo lee el dueño (E2-2): el docente y el ADMIN reciben 403."""
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    _unassign_case(estudiante)
    profesor = Grupo.objects.get(codigo=GROUP_CODE).profesor
    admin = User.objects.create_user(
        email="admin_revisa@x.com", password="x", nombre="A", apellido="R", role="ADMIN"
    )

    assert cl(profesor).get(f"/api/instructor/attempts/{attempt_id}/trace").status_code == 200
    assert cl(admin).get(f"/api/instructor/attempts/{attempt_id}/trace").status_code == 200
    by_token = cl(profesor).get(f"{BASE}/attempts/{attempt_id}", HTTP_X_SIEP_ATTEMPT_TOKEN=token)
    assert by_token.status_code == 403


def test_un_intento_cerrado_se_sigue_pudiendo_leer_sin_asignacion(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    SimulationAttempt.objects.filter(pk=attempt_id).update(status="COMPLETED")
    _remove_from_group(estudiante)

    state = c.get(f"{BASE}/attempts/{attempt_id}", HTTP_X_SIEP_ATTEMPT_TOKEN=token)
    report = c.get(f"{BASE}/attempts/{attempt_id}/completion-report", HTTP_X_SIEP_ATTEMPT_TOKEN=token)

    assert state.status_code == 200
    assert report.status_code == 200


def test_sin_intento_abierto_continuar_sigue_respondiendo_204(estudiante, case_version_id):
    c = cl(estudiante)
    _remove_from_group(estudiante)

    response = c.get(f"{BASE}/cases/{case_version_id}/active-attempt")

    assert response.status_code == 204


def test_post_attempts_reanuda_un_intento_abierto_de_una_version_archivada(estudiante, case_version_id):
    """Revisión de E1 (I-3): C1 («POST devuelve el abierto con resumed») no puede contradecir «se deja terminar»."""
    c = cl(estudiante)
    attempt_id, _ = _start(c, case_version_id)
    CaseVersion.objects.filter(pk=case_version_id).update(status="ARCHIVED")

    again = c.post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json")

    assert again.status_code == 200
    assert again.data["data"]["attemptId"] == attempt_id
    assert again.data["data"]["resumed"] is True


def test_post_attempts_reanuda_un_intento_abierto_de_un_caso_dado_de_baja(estudiante, case_version_id):
    c = cl(estudiante)
    attempt_id, _ = _start(c, case_version_id)
    SimulationCase.objects.filter(versions__pk=case_version_id).update(active=False)

    again = c.post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json")

    assert again.status_code == 200 and again.data["data"]["attemptId"] == attempt_id


def test_iniciar_uno_nuevo_de_una_version_archivada_sigue_siendo_403(estudiante, case_version_id):
    CaseVersion.objects.filter(pk=case_version_id).update(status="ARCHIVED")

    response = cl(estudiante).post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json")

    assert response.status_code == 403


@pytest.mark.parametrize("how", sorted(LOSE_ACCESS))
def test_la_salida_segura_sigue_disponible_aunque_el_estudiante_ya_no_este_asignado(
    estudiante, case_version_id, how
):
    """Revisión de E1 (I-7): REGLA-004 / ETH-02, la salida segura siempre es alcanzable."""
    c = cl(estudiante)
    attempt_id, token = _start(c, case_version_id)
    LOSE_ACCESS[how](estudiante)

    response = c.post(
        f"{BASE}/attempts/{attempt_id}/safe-exit", {"attemptToken": token, "reason": "necesito parar"},
        format="json",
    )

    assert response.status_code == 200, response.data
    assert response.data["data"]["status"] == "PAUSED"
    assert response.data["data"]["supportResources"]
    resumed = c.post(f"{BASE}/attempts/{attempt_id}/resume", {"attemptToken": token}, format="json")
    assert resumed.status_code == 403 and resumed.data["code"] == "ACCESS_NOT_ASSIGNED"
