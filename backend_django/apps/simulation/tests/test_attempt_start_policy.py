"""E1-1 · Política de inicio de intento (C1): un solo intento abierto por estudiante y caso.

Cubre RN-07 (sin ``forceNew`` del estudiante cuando ya hay uno abierto), DM-5.4 (el
índice único parcial es la última defensa) y RNF-08 (dos inicios simultáneos crean
**un** intento, con hilos y commits reales).
"""
import importlib
import uuid
from datetime import datetime

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.grupos.models import Grupo, GrupoCaseVersion, GrupoEstudiante
from apps.simulation.models import CaseVersion, SimulationAttempt, SimulationNode
from apps.simulation.models.rubric import AuditLog
from apps.simulation.services import game_service
from shared.testing import run_concurrently

from .test_game import (  # noqa: F401  (fixtures de pytest)
    assign_case_to_student,
    attempt_headers,
    case_version_id,
    cl,
    estudiante,
)

pytestmark = pytest.mark.req("RN-07")

BASE = "/api/simulation"
User = get_user_model()


def _start(client, case_version_id, **extra):
    return client.post(f"{BASE}/attempts", {"caseVersionId": case_version_id, **extra}, format="json")


def _open_attempt(estudiante, case_version_id, codigo):
    assign_case_to_student(estudiante, case_version_id, codigo)
    client = cl(estudiante)
    return client, _start(client, case_version_id).data["data"]


def test_iniciar_con_un_intento_abierto_devuelve_el_abierto_con_resumed_true(estudiante, case_version_id):
    client, first = _open_attempt(estudiante, case_version_id, "SP-ABIERTO")

    again = _start(client, case_version_id)

    assert again.status_code == 200
    assert again.data["data"]["attemptId"] == first["attemptId"]
    assert again.data["data"]["resumed"] is True
    assert SimulationAttempt.objects.filter(student=estudiante).count() == 1


def test_iniciar_sin_intento_abierto_crea_uno_con_resumed_false(estudiante, case_version_id):
    _, first = _open_attempt(estudiante, case_version_id, "SP-NUEVO")

    assert first["resumed"] is False
    assert first["status"] == "IN_PROGRESS"


def test_un_intento_pausado_cuenta_como_abierto(estudiante, case_version_id):
    client, first = _open_attempt(estudiante, case_version_id, "SP-PAUSA")
    client.post(
        f"{BASE}/attempts/{first['attemptId']}/safe-exit",
        {"attemptToken": first["attemptToken"], "reason": "pausa"}, format="json",
    )

    again = _start(client, case_version_id).data["data"]

    assert again["attemptId"] == first["attemptId"]
    assert again["status"] == "PAUSED"
    assert again["resumed"] is True


def test_force_new_con_la_bandera_apagada_reemplaza_el_abierto(settings, estudiante, case_version_id):
    settings.ATTEMPT_START_STRICT = False
    client, first = _open_attempt(estudiante, case_version_id, "SP-LEGADO")

    fresh = _start(client, case_version_id, forceNew=True).data["data"]

    assert fresh["attemptId"] != first["attemptId"]
    assert fresh["resumed"] is False
    assert SimulationAttempt.objects.get(pk=first["attemptId"]).status == "REPLACED"


def test_force_new_con_la_bandera_activa_responde_409_con_el_intento_abierto(
    settings, estudiante, case_version_id
):
    settings.ATTEMPT_START_STRICT = True
    client, first = _open_attempt(estudiante, case_version_id, "SP-ESTRICTO")

    response = _start(client, case_version_id, forceNew=True)

    assert response.status_code == 409
    assert response.data["code"] == "ATTEMPT_ALREADY_OPEN"
    assert response.data["existingAttemptId"] == first["attemptId"]
    assert response.data["success"] is False
    assert SimulationAttempt.objects.get(pk=first["attemptId"]).status == "IN_PROGRESS"


def test_force_new_con_la_bandera_activa_sin_intento_abierto_crea_el_intento(
    settings, estudiante, case_version_id
):
    settings.ATTEMPT_START_STRICT = True
    assign_case_to_student(estudiante, case_version_id, "SP-ESTRICTO-LIBRE")

    response = _start(cl(estudiante), case_version_id, forceNew=True)

    assert response.status_code == 200
    assert response.data["data"]["resumed"] is False
    assert response.data["data"]["status"] == "IN_PROGRESS"


def _attempt_row(student_id, case_version_id, status="IN_PROGRESS", **extra):
    return SimulationAttempt(
        attempt_token_hash=uuid.uuid4().hex,
        case_version_id=case_version_id,
        student_id=student_id,
        current_node=SimulationNode.objects.filter(case_version_id=case_version_id, start_node=True).first(),
        status=status,
        **extra,
    )


@pytest.mark.req("DM-5.4")
@pytest.mark.parametrize("status", ["IN_PROGRESS", "PAUSED"])
@pytest.mark.django_db
def test_el_indice_unico_impide_un_segundo_intento_abierto(estudiante, case_version_id, status):
    _attempt_row(estudiante.id, case_version_id, "IN_PROGRESS").save()

    with pytest.raises(IntegrityError), transaction.atomic():
        _attempt_row(estudiante.id, case_version_id, status).save()


@pytest.mark.req("DM-5.4")
@pytest.mark.django_db
def test_el_indice_unico_permite_cerrados_junto_a_un_abierto(estudiante, case_version_id):
    for status in ("COMPLETED", "REPLACED", "SAFE_EXITED", "COMPLETED"):
        _attempt_row(estudiante.id, case_version_id, status).save()

    _attempt_row(estudiante.id, case_version_id, "IN_PROGRESS").save()

    assert SimulationAttempt.objects.filter(student=estudiante).count() == 5


@pytest.mark.req("RNF-08")
@pytest.mark.django_db
@pytest.mark.parametrize(
    ("field", "value"),
    [("stress_index", 101), ("stress_index", -1), ("victim_risk", 101), ("user_trust", -1)],
)
def test_los_indicadores_del_intento_quedan_entre_0_y_100(estudiante, case_version_id, field, value):
    with pytest.raises(IntegrityError), transaction.atomic():
        _attempt_row(estudiante.id, case_version_id, **{field: value}).save()


@pytest.mark.req("RNF-08")
def test_dos_inicios_concurrentes_crean_un_solo_intento(real_commits):
    suffix = uuid.uuid4().hex[:8]
    profesor = User.objects.get(email="profesora@psychosim.edu.co")
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    estudiante = User.objects.create_user(
        email=f"conc_{suffix}@x.com", password="pass1234", nombre="Conc", apellido="Inicio", role="ESTUDIANTE"
    )
    grupo = Grupo.objects.create(nombre=f"Conc {suffix}", codigo=f"CI-{suffix}", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante)
    GrupoCaseVersion.objects.create(grupo=grupo, case_version=version)
    started = timezone.now()

    def start():
        return game_service.start_attempt(version.id, estudiante)

    try:
        outcomes = run_concurrently(start, start)

        assert [o.error for o in outcomes] == [None, None]
        states = [o.value for o in outcomes]
        assert states[0]["attemptId"] == states[1]["attemptId"]
        assert sorted(s["resumed"] for s in states) == [False, True]
        assert SimulationAttempt.objects.filter(student_id=estudiante.id).count() == 1
    finally:
        SimulationAttempt.objects.filter(student_id=estudiante.id).delete()
        GrupoCaseVersion.objects.filter(grupo=grupo).delete()
        GrupoEstudiante.objects.filter(grupo=grupo).delete()
        grupo.delete()
        AuditLog.objects.filter(action="ATTEMPT_STARTED", occurred_at__gte=started).delete()
        estudiante.delete()


def test_los_estados_abiertos_del_modelo_coinciden_con_los_del_ciclo_de_vida():
    from apps.simulation.models.attempt import OPEN_ATTEMPT_STATUSES
    from apps.simulation.services import attempt_lifecycle

    assert set(OPEN_ATTEMPT_STATUSES) == set(attempt_lifecycle.OPEN_STATUSES)


def test_la_migracion_de_datos_deja_el_intento_abierto_mas_reciente_de_cada_par():
    migration = importlib.import_module("apps.simulation.migrations.0002_attempt_open_dedupe")
    rows = [  # (id, student_id, case_version_id, started_at)
        ("a", 10, 100, datetime(2026, 1, 1)),
        ("b", 10, 100, datetime(2026, 1, 3)),
        ("c", 10, 100, datetime(2026, 1, 2)),
        ("d", 10, 200, datetime(2026, 1, 1)),
        ("e", 11, 100, datetime(2026, 1, 1)),
    ]

    assert sorted(migration.superseded_attempt_ids(rows)) == ["a", "c"]


@pytest.mark.req("RNF-08")
def test_force_new_espera_el_cerrojo_y_no_pisa_un_intento_que_se_completo(real_commits, settings):
    """Revisión de E1 (I-2): un reemplazo heredado que leyó «abierto» no puede sobrescribir un intento que
    otra orden acaba de completar; el cerrojo lo hace esperar y releer."""
    import threading
    import time

    from apps.simulation.services.attempt_lock import lock_attempt_row

    settings.ATTEMPT_START_STRICT = False
    suffix = uuid.uuid4().hex[:8]
    profesor = User.objects.get(email="profesora@psychosim.edu.co")
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    estudiante = User.objects.create_user(
        email=f"fn_{suffix}@x.com", password="pass1234", nombre="Fn", apellido="Cerrojo", role="ESTUDIANTE"
    )
    grupo = Grupo.objects.create(nombre=f"Fn {suffix}", codigo=f"FN-{suffix}", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=estudiante)
    GrupoCaseVersion.objects.create(grupo=grupo, case_version=version)
    started = timezone.now()
    first_id = game_service.start_attempt(version.id, estudiante)["attemptId"]
    holding = threading.Event()

    def completer():
        with transaction.atomic():  # la orden que está cerrando el intento
            lock_attempt_row(first_id)
            holding.set()
            time.sleep(0.8)  # tiempo de sobra para que la otra orden lea «abierto» y espere el cerrojo
            now = timezone.now()
            SimulationAttempt.objects.filter(pk=first_id).update(status="COMPLETED", ended_at=now, locked_at=now)

    def starter():
        assert holding.wait(5)
        return game_service.start_attempt(version.id, estudiante, force_new=True)

    try:
        outcomes = run_concurrently(completer, starter)

        assert outcomes[0].error is None and outcomes[1].error is None, [o.error for o in outcomes]
        assert SimulationAttempt.objects.get(pk=first_id).status == "COMPLETED"
        state = outcomes[1].value
        assert state["resumed"] is False and state["attemptId"] != first_id
        assert SimulationAttempt.objects.get(pk=state["attemptId"]).status == "IN_PROGRESS"
    finally:
        SimulationAttempt.objects.filter(student_id=estudiante.id).delete()
        GrupoCaseVersion.objects.filter(grupo=grupo).delete()
        GrupoEstudiante.objects.filter(grupo=grupo).delete()
        grupo.delete()
        AuditLog.objects.filter(occurred_at__gte=started).delete()
        estudiante.delete()


def test_el_inicio_acepta_request_id_y_continuar_informa_resumed(estudiante, case_version_id):
    client, first = _open_attempt(estudiante, case_version_id, "SP-REQID")

    again = _start(client, case_version_id, requestId="req-inicio-0001")
    active = client.get(f"{BASE}/cases/{case_version_id}/active-attempt")

    assert again.status_code == 200 and again.data["data"]["attemptId"] == first["attemptId"]
    assert active.status_code == 200 and active.data["data"]["resumed"] is True
    assert _start(client, case_version_id, requestId="no vale").status_code == 400
