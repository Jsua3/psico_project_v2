"""E6-4 · El evento ``FEEDBACK_VIEWED`` (RQ-NEG-005; R13 de la fase).

«Mejora tras la retroalimentación» solo cuenta a quien VIO la retroalimentación del intento anterior antes de empezar
el siguiente. El maestro pide el evento «al abrir el reporte»: lo registra la **primera** lectura del reporte por su
dueño —en cualquiera de las tres rutas: ``report``, ``completion-report`` y ``student-report``— de un intento
COMPLETADO. Es la única escritura de un GET y por eso es estrecha: solo del dueño, solo completado, a lo sumo una
fila por intento (lo garantiza la base, con una clave de idempotencia que ningún cliente puede enviar) y si falla la
lectura sigue. No altera ningún reporte, línea de tiempo ni conteo.
"""
import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from apps.simulation.models import AttemptEvent, AttemptReport, DecisionOption, SimulationAttempt
from apps.simulation.services import attempt_report, game_service
from shared.testing import measure, run_concurrently

from .test_attempt_concurrency import _option, committed_attempt  # noqa: F401  (fixture)
from .test_attempt_report_frozen import (  # noqa: F401  (fixtures y ayudantes)
    BASE,
    _complete,
    _start,
    case_version_id,
    cl,
    completed,
    estudiante,
)

pytestmark = [pytest.mark.req("RQ-NEG-005")]

User = get_user_model()


def _viewed(attempt_id):
    return AttemptEvent.objects.filter(attempt_id=attempt_id, event_type="FEEDBACK_VIEWED")


def _read(client, endpoint, attempt_id, token):
    headers = {"HTTP_X_SIEP_ATTEMPT_TOKEN": token}
    path = {
        "report": f"{BASE}/attempts/{attempt_id}/report",
        "completion-report": f"{BASE}/attempts/{attempt_id}/completion-report",
        "student-report": f"{BASE}/attempts/{attempt_id}/student-report",
    }[endpoint]
    return client.get(path, **headers)


ENDPOINTS = ["report", "completion-report", "student-report"]


@pytest.fixture
def profesor(estudiante):
    return User.objects.get(email="prof_world_owner@x.com")


@pytest.mark.parametrize("endpoint", ENDPOINTS)
def test_la_primera_lectura_del_dueno_registra_un_evento_y_las_siguientes_no(completed, endpoint, caplog):
    client, attempt_id, token = completed
    assert _viewed(attempt_id).count() == 0  # cerrar el intento no lo registra

    first = _read(client, endpoint, attempt_id, token)
    with caplog.at_level("ERROR"):
        again = _read(client, endpoint, attempt_id, token)
    assert not [r for r in caplog.records if "retroalimentación" in r.getMessage()]  # repetir no es un error

    assert first.status_code == again.status_code == 200
    event = _viewed(attempt_id).get()
    assert event.node_id is None and event.decision_option_id is None
    assert event.request_id == attempt_report.FEEDBACK_VIEWED_KEY
    for other in ENDPOINTS:  # leerlo por otra ruta tampoco suma
        _read(client, other, attempt_id, token)
    assert _viewed(attempt_id).count() == 1


def test_la_clave_del_evento_no_la_puede_enviar_ningun_cliente():
    """Si un cliente pudiera mandarla como ``requestId`` chocaría con la fila del sistema y recibiría un 409."""
    from rest_framework.exceptions import ValidationError

    from shared.idempotency import normalize_request_id

    with pytest.raises(ValidationError):
        normalize_request_id(attempt_report.FEEDBACK_VIEWED_KEY)


def test_el_docente_y_el_admin_leen_sin_escribir(completed, profesor):
    _, attempt_id, _ = completed
    admin = User.objects.create_user(email="fv_admin@x.com", password="x", nombre="A", apellido="B", role="ADMIN")

    teacher_read = cl(profesor).get(f"{BASE}/attempts/{attempt_id}/student-report")
    admin_read = cl(admin).get(f"{BASE}/attempts/{attempt_id}/student-report")

    assert teacher_read.status_code == admin_read.status_code == 200
    assert _viewed(attempt_id).count() == 0


@pytest.mark.parametrize("status", ["PAUSED", "REPLACED", "SAFE_EXITED"])
def test_un_intento_que_no_esta_completado_no_registra(completed, status):
    client, attempt_id, token = completed
    SimulationAttempt.objects.filter(pk=attempt_id).update(status=status)

    assert _read(client, "completion-report", attempt_id, token).status_code == 200
    assert _read(client, "student-report", attempt_id, token).status_code == 200

    assert _viewed(attempt_id).count() == 0


def test_otro_estudiante_no_registra_nada_en_un_intento_ajeno(completed, estudiante):
    _, attempt_id, _ = completed
    stranger = User.objects.create_user(email="fv_otro@x.com", password="x", nombre="O", apellido="T", role="ESTUDIANTE")

    response = cl(stranger).get(f"{BASE}/attempts/{attempt_id}/student-report")

    assert response.status_code == 403
    assert _viewed(attempt_id).count() == 0


def test_el_evento_no_altera_el_reporte_en_vivo_ni_su_linea_de_tiempo(completed, profesor):
    client, attempt_id, token = completed
    AttemptReport.objects.filter(attempt_id=attempt_id).delete()  # un intento anterior a E1-8: se sirve en vivo
    teacher = cl(profesor)
    before = teacher.get(f"{BASE}/attempts/{attempt_id}/student-report").data["data"]
    assert _viewed(attempt_id).count() == 0

    assert _read(client, "student-report", attempt_id, token).status_code == 200  # ahora sí existe el evento
    assert _viewed(attempt_id).count() == 1
    after = teacher.get(f"{BASE}/attempts/{attempt_id}/student-report").data["data"]

    assert after == before


def test_ver_la_retroalimentacion_despues_de_cerrar_no_alarga_ninguna_escena():
    """Puro: el evento llega minutos después del cierre y el tiempo por escena (y el cálculo viejo) no se enteran."""
    from datetime import datetime, timedelta

    from apps.simulation.services import attempt_duration

    start = datetime(2026, 10, 18, 9, 0, 0)
    events = [
        ("NODE_ENTERED", 1, start),
        ("DECISION_SELECTED", 1, start + timedelta(seconds=30)),
        ("NODE_ENTERED", 2, start + timedelta(seconds=30)),
        ("ATTEMPT_COMPLETED", 2, start + timedelta(seconds=90)),
    ]
    end = start + timedelta(seconds=90)
    viewed = events + [("FEEDBACK_VIEWED", None, end + timedelta(minutes=10))]

    assert attempt_duration.scene_durations(viewed, end_at=end) == attempt_duration.scene_durations(events, end_at=end)
    assert attempt_duration.active_duration_seconds(
        start, end, [(t, at) for t, _, at in viewed]
    ) == attempt_duration.active_duration_seconds(start, end, [(t, at) for t, _, at in events])


def test_el_evento_aparece_en_la_traza_del_docente_sin_romperla(completed, profesor):
    client, attempt_id, token = completed
    _read(client, "report", attempt_id, token)

    trace = cl(profesor).get(f"/api/instructor/attempts/{attempt_id}/trace").data["data"]

    assert [e["type"] for e in trace["events"]][-1:] == ["FEEDBACK_VIEWED"]
    assert "FEEDBACK_VIEWED" not in {entry["type"] for entry in trace["timeline"]}


def test_si_la_escritura_falla_la_lectura_responde_igual(completed, monkeypatch):
    client, attempt_id, token = completed

    def broken(attempt):
        raise RuntimeError("la escritura del evento se rompió")

    monkeypatch.setattr(attempt_report, "_insert_feedback_viewed", broken)

    response = _read(client, "report", attempt_id, token)

    assert response.status_code == 200
    assert response.data["data"]["status"] == "COMPLETED"
    assert _viewed(attempt_id).count() == 0


def test_un_error_real_de_base_de_datos_al_registrar_el_evento_no_rompe_la_lectura(completed, monkeypatch):
    """Un error de SQL aborta la transacción de PostgreSQL: solo el punto de guardado deja que la lectura siga."""
    client, attempt_id, token = completed

    def broken(attempt):
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1/0")

    monkeypatch.setattr(attempt_report, "_insert_feedback_viewed", broken)

    response = _read(client, "report", attempt_id, token)

    assert response.status_code == 200 and response.data["data"]["status"] == "COMPLETED"
    assert _viewed(attempt_id).count() == 0


def test_leer_como_dueno_cuesta_una_sola_escritura_que_la_base_descarta_al_repetir(completed, profesor):
    client, attempt_id, _ = completed
    url = f"{BASE}/attempts/{attempt_id}/student-report"

    _, teacher = measure(lambda: cl(profesor).get(url))
    _, owner_first = measure(lambda: client.get(url))
    _, owner_again = measure(lambda: client.get(url))

    # El docente no escribe el evento del dueño; solo deja SU fila de auditoría (S4-1: leer datos de otra persona, `reporte.leer`).
    teacher_inserts = [sql for sql in teacher.statements if sql.lstrip().upper().startswith("INSERT")]
    assert teacher.writes == 1 and len(teacher_inserts) == 1
    assert '"audit_logs"' in teacher_inserts[0] and '"attempt_events"' not in teacher_inserts[0]
    assert owner_first.writes == owner_again.writes == 1  # un solo INSERT … ON CONFLICT DO NOTHING
    assert owner_again.queries == owner_first.queries  # repetir cuesta lo mismo: nada de «¿existe ya?» antes


def test_dos_lecturas_simultaneas_dejan_un_solo_evento(committed_attempt):
    """Hilos con commits reales: la clave de idempotencia es de la base, no de una comprobación previa."""
    a = committed_attempt
    for _ in range(12):
        attempt = SimulationAttempt.objects.get(pk=a.attempt_id)
        if attempt.status != "IN_PROGRESS":
            break
        good = _option(attempt.current_node_id, "ADEQUATE") or DecisionOption.objects.filter(
            source_node_id=attempt.current_node_id
        ).first()
        game_service.choose_decision(a.attempt_id, a.token, good.id, a.student)
    assert SimulationAttempt.objects.get(pk=a.attempt_id).status == "COMPLETED"

    outcomes = run_concurrently(
        lambda: game_service.get_student_report(a.attempt_id, a.student),
        lambda: game_service.get_student_report(a.attempt_id, a.student),
        lambda: game_service.get_attempt_report(a.attempt_id, a.token, a.student),
    )

    assert [o.error for o in outcomes] == [None, None, None]
    assert _viewed(a.attempt_id).count() == 1
