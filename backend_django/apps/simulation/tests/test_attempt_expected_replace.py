"""Pasada final del rediseño (DP-26): «empezar de nuevo» solo reemplaza el intento que la persona aceptó perder.

El cliente lee el intento abierto, la persona acepta perderlo y recién entonces envía ``forceNew``. Entre la lectura y el
envío otra pestaña puede reemplazarlo: sin ``expectedAttemptId`` el servidor reemplazaría el intento NUEVO, que nadie
aceptó perder. Con él, la comparación se hace bajo el cerrojo de la fila del intento abierto: 409 ``ATTEMPT_CHANGED`` y
nada cambia. El campo es aditivo: sin él, el comportamiento de siempre.
"""
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.simulation.models import CaseVersion, SimulationAttempt
from apps.simulation.models.rubric import AuditLog
from apps.simulation.services import game_service
from shared.exceptions import ApiError
from shared.testing import purge_audit_rows, run_concurrently

from .test_game import (  # noqa: F401  (fixtures de pytest)
    assign_case_to_student,
    case_version_id,
    cl,
    estudiante,
)

pytestmark = pytest.mark.req("RN-07")

BASE = "/api/simulation"
User = get_user_model()


def _start(client, case_version_id, **extra):
    return client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id, **extra}, format="json")


@pytest.fixture
def legado(settings):
    # La ruta heredada (bandera apagada) es la que deja al estudiante reemplazar su propio intento.
    settings.ATTEMPT_START_STRICT = False


def test_la_otra_pestana_reemplazo_entre_la_lectura_y_el_envio_responde_409(legado, estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "EX-CARRERA")
    client = cl(estudiante)
    visto = _start(client, case_version_id).data["data"]  # lo que la persona vio y aceptó perder
    otra_pestana = _start(client, case_version_id, forceNew=True).data["data"]  # ganó la carrera

    response = _start(client, case_version_id, forceNew=True, expectedAttemptId=visto["attemptId"])

    assert response.status_code == 409
    assert response.data["code"] == "ATTEMPT_CHANGED"
    assert response.data["currentAttemptId"] == otra_pestana["attemptId"]
    # El intento nuevo de la otra pestaña sigue intacto y no se creó ninguno más.
    assert SimulationAttempt.objects.get(pk=otra_pestana["attemptId"]).status == "IN_PROGRESS"
    assert SimulationAttempt.objects.filter(student=estudiante).count() == 2


def test_con_el_intento_esperado_reemplaza_ese_y_crea_uno_nuevo(legado, estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "EX-IGUAL")
    client = cl(estudiante)
    visto = _start(client, case_version_id).data["data"]

    response = _start(client, case_version_id, forceNew=True, expectedAttemptId=visto["attemptId"])

    assert response.status_code == 200
    assert response.data["data"]["attemptId"] != visto["attemptId"]
    assert response.data["data"]["resumed"] is False
    assert SimulationAttempt.objects.get(pk=visto["attemptId"]).status == "REPLACED"


def test_con_el_intento_esperado_ya_cerrado_y_sin_abierto_crea_uno_sin_perder_nada(legado, estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "EX-SINABIERTO")
    client = cl(estudiante)

    response = _start(client, case_version_id, forceNew=True, expectedAttemptId=str(uuid.uuid4()))

    assert response.status_code == 200
    assert response.data["data"]["resumed"] is False
    assert SimulationAttempt.objects.filter(student=estudiante).count() == 1


def test_sin_el_campo_se_conserva_el_reemplazo_de_siempre(legado, estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "EX-LEGADO")
    client = cl(estudiante)
    primero = _start(client, case_version_id).data["data"]

    response = _start(client, case_version_id, forceNew=True)

    assert response.status_code == 200
    assert SimulationAttempt.objects.get(pk=primero["attemptId"]).status == "REPLACED"


def test_un_id_mal_formado_es_400(legado, estudiante, case_version_id):
    assign_case_to_student(estudiante, case_version_id, "EX-FORMATO")

    response = _start(cl(estudiante), case_version_id, forceNew=True, expectedAttemptId="no-es-un-uuid")

    assert response.status_code == 400


@pytest.mark.req("RNF-08")
def test_dos_reemplazos_simultaneos_del_mismo_intento_reemplazan_una_sola_vez(settings, real_commits):
    """Dos pestañas aceptan perder el MISMO intento y envían a la vez: una lo reemplaza, la otra recibe 409."""
    settings.ATTEMPT_START_STRICT = False
    suffix = uuid.uuid4().hex[:8]
    profesor = User.objects.get(email="profesora@psychosim.edu.co")
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    estudiante = User.objects.create_user(
        email=f"exp_{suffix}@x.com", password="pass1234", nombre="Exp", apellido="Reemplazo", role="ESTUDIANTE"
    )
    grupo = Grupo.objects.create(nombre=f"Exp {suffix}", codigo=f"EX-{suffix}", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante, status="ACTIVE")
    CaseAssignment.objects.create(grupo=grupo, case_version=version)
    started = timezone.now()

    try:
        visto = game_service.start_attempt(version.id, estudiante)["attemptId"]

        def reemplazar():
            return game_service.start_attempt(version.id, estudiante, True, expected_attempt_id=visto)

        outcomes = run_concurrently(reemplazar, reemplazar)

        ganadores = [o for o in outcomes if o.error is None]
        perdedores = [o for o in outcomes if o.error is not None]
        assert len(ganadores) == 1 and len(perdedores) == 1, [o.error for o in outcomes]
        assert isinstance(perdedores[0].error, ApiError) and perdedores[0].error.api_code == "ATTEMPT_CHANGED"
        nuevo = ganadores[0].value["attemptId"]
        assert SimulationAttempt.objects.get(pk=visto).status == "REPLACED"
        assert SimulationAttempt.objects.get(pk=nuevo).status == "IN_PROGRESS"
        assert SimulationAttempt.objects.filter(student_id=estudiante.id).count() == 2
    finally:
        SimulationAttempt.objects.filter(student_id=estudiante.id).delete()
        CaseAssignment.objects.filter(grupo=grupo).delete()
        GrupoEstudiante.objects.filter(grupo=grupo).delete()
        grupo.delete()
        purge_audit_rows(AuditLog.objects.filter(action="ATTEMPT_STARTED", occurred_at__gte=started))
        estudiante.delete()
