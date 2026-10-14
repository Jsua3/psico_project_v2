"""E1-11 · El desbloqueo lineal se exige en el servidor, al iniciar (SIEP-RF-12).

Hasta ahora el catálogo marcaba un caso como bloqueado pero ``POST /attempts`` lo
iniciaba igual: el orden lo hacía cumplir solo la interfaz. Ahora un caso bloqueado
para ese estudiante responde 403 ``ACCESS_LOCKED_BY_SEQUENCE`` y el orden de la
secuencia es el del **caso** (no la fecha de creación de la versión).
"""
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import Grupo, GrupoCaseVersion, GrupoEstudiante
from apps.progression.catalog import is_case_unlocked
from apps.progression.services import record_case_completion
from apps.simulation.models import CaseVersion, SimulationCase, SimulationNode

pytestmark = pytest.mark.req("SIEP-RF-12")

BASE = "/api/simulation"
User = get_user_model()


def _cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _published_version(case, semantic_version, admin):
    version = CaseVersion.objects.create(
        simulation_case=case, semantic_version=semantic_version, status="PUBLISHED",
        created_by=admin, published_at=timezone.now(),
    )
    SimulationNode.objects.create(
        case_version=version, node_key="inicio", title="Inicio", narrative="Inicio", start_node=True,
    )
    return version


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="admin_secuencia@x.com", password="x", nombre="Ad", apellido="Sec", role="ADMIN"
    )


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="prof_secuencia@x.com", password="x", nombre="Pro", apellido="Sec", role="PROFESOR"
    )


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_secuencia@x.com", password="x", nombre="Est", apellido="Sec", role="ESTUDIANTE"
    )


@pytest.fixture
def first_version(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


@pytest.fixture
def second_version(admin):
    case = SimulationCase.objects.create(
        code=f"SIM-SEC-{uuid.uuid4().hex[:6].upper()}", title="Segundo caso", description="stub",
        active=True, created_by=admin,
    )
    return _published_version(case, "1.0.0", admin)


def _assign(estudiante, profesor, *versions):
    grupo = Grupo.objects.create(nombre="G-sec", codigo=f"SEC{uuid.uuid4().hex[:6].upper()}", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante, status="ACTIVE")
    for version in versions:
        GrupoCaseVersion.objects.create(grupo=grupo, case_version=version)
    return grupo


def _start(client, version):
    return client.post(f"{BASE}/attempts", {"caseVersionId": version.id}, format="json")


def test_el_segundo_caso_esta_bloqueado_hasta_completar_el_primero(
    estudiante, profesor, first_version, second_version
):
    _assign(estudiante, profesor, first_version, second_version)
    c = _cl(estudiante)

    blocked = _start(c, second_version)

    assert blocked.status_code == 403
    assert blocked.data["code"] == "ACCESS_LOCKED_BY_SEQUENCE"
    assert not _attempts_of(estudiante, second_version)
    assert _start(c, first_version).status_code == 200


def _attempts_of(estudiante, version):
    from apps.simulation.models import SimulationAttempt

    return list(SimulationAttempt.objects.filter(student=estudiante, case_version=version))


def test_al_completar_el_primero_el_segundo_se_puede_iniciar(
    estudiante, profesor, first_version, second_version
):
    _assign(estudiante, profesor, first_version, second_version)
    record_case_completion(estudiante.id, first_version.simulation_case_id)

    response = _start(_cl(estudiante), second_version)

    assert response.status_code == 200
    assert response.data["data"]["resumed"] is False


def test_el_catalogo_y_el_inicio_coinciden(estudiante, profesor, first_version, second_version):
    _assign(estudiante, profesor, first_version, second_version)
    c = _cl(estudiante)

    for item in c.get(f"{BASE}/catalog").data["data"]:
        response = _start(c, CaseVersion.objects.get(pk=item["caseVersionId"]))
        assert (response.status_code == 200) is item["unlocked"], item


def test_una_version_nueva_del_primer_caso_no_cambia_el_orden_de_la_secuencia(
    estudiante, profesor, admin, first_version, second_version
):
    # Una versión más reciente del PRIMER caso: por fecha de creación quedaría después del segundo.
    newer = _published_version(first_version.simulation_case, "9.9.9", admin)
    _assign(estudiante, profesor, first_version, second_version, newer)
    record_case_completion(estudiante.id, first_version.simulation_case_id)

    assert is_case_unlocked(estudiante, newer.id) is True
    assert is_case_unlocked(estudiante, second_version.id) is True
    order = [item["caseVersionId"] for item in _cl(estudiante).get(f"{BASE}/catalog").data["data"]]
    assert order.index(newer.id) < order.index(second_version.id)


def test_el_profesor_y_el_admin_no_tienen_bloqueo(profesor, admin, second_version):
    assert is_case_unlocked(profesor, second_version.id) is True
    assert is_case_unlocked(admin, second_version.id) is True


def test_un_caso_no_asignado_no_cuenta_como_desbloqueado(estudiante, second_version):
    assert is_case_unlocked(estudiante, second_version.id) is False


def test_reanudar_un_intento_abierto_no_anuncia_un_inicio_nuevo(estudiante, profesor, first_version):
    """El simulador solo anuncia (y progresión puede vetar) un intento NUEVO; reanudar no."""
    from apps.simulation.signals import attempt_start_requested

    _assign(estudiante, profesor, first_version)
    c = _cl(estudiante)
    _start(c, first_version)
    calls = []

    def probe(sender, **kwargs):
        calls.append(kwargs)

    attempt_start_requested.connect(probe, weak=False)
    try:
        again = _start(c, first_version)
    finally:
        attempt_start_requested.disconnect(probe)

    assert again.data["data"]["resumed"] is True
    assert calls == []
