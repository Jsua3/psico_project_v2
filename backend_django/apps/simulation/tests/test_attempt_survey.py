"""E6-3 · La encuesta breve opcional al terminar un intento (RQ-NEG-004; R14 de la fase, contrato C14).

Una respuesta por intento completado: ``rating`` entero de 1 a 5 y un comentario opcional de texto plano de hasta 500
caracteres. Solo existe si Psicología la aprueba: con ``ATTEMPT_FEEDBACK_SURVEY`` apagada (por defecto) los dos
endpoints responden 404 como si no existieran. La responde el dueño del intento, sin el token del intento (cerrado, ya
no protege nada). El comentario es del estudiante: nunca viaja al reporte, a la auditoría ni a la analítica.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import AttemptFeedback, AuditLog, DecisionOption, SimulationAttempt
from apps.simulation.services import attempt_survey, game_service
from shared.exceptions import ApiError
from shared.testing import run_concurrently

from .test_attempt_concurrency import _option, committed_attempt, explored_attempt  # noqa: F401  (fixtures)
from .test_attempt_report_frozen import (  # noqa: F401  (fixtures y ayudantes)
    BASE,
    _reports,
    _start,
    case_version_id,
    cl,
    completed,
    estudiante,
)

pytestmark = [pytest.mark.req("RQ-NEG-004")]

User = get_user_model()


def _url(attempt_id):
    return f"{BASE}/attempts/{attempt_id}/feedback"


@pytest.fixture
def survey_on(settings):
    settings.ATTEMPT_FEEDBACK_SURVEY = True


# ─── apagada: no existe ───────────────────────────────────────────────────────────────────────
def test_apagada_los_dos_endpoints_responden_404_como_si_no_existieran(completed):
    client, attempt_id, _ = completed

    posted = client.post(_url(attempt_id), {"rating": 5}, format="json")
    read = client.get(_url(attempt_id))

    assert posted.status_code == read.status_code == 404
    assert posted.data["code"] == read.data["code"] == "NOT_FOUND"
    assert AttemptFeedback.objects.count() == 0


# ─── responder ────────────────────────────────────────────────────────────────────────────────
def test_el_dueno_responde_una_vez_y_el_comentario_queda_limpio(completed, survey_on):
    client, attempt_id, token = completed
    before = _reports(client, attempt_id, token)

    posted = client.post(_url(attempt_id), {"rating": 4, "comment": "  Me ayudó a ordenar lo que viví.  "}, format="json")

    assert posted.status_code == 201, posted.data
    data = posted.data["data"]
    assert data["submitted"] is True and data["rating"] == 4
    assert data["comment"] == "Me ayudó a ordenar lo que viví."
    assert data["submittedAt"]
    row = AttemptFeedback.objects.get(attempt_id=attempt_id)
    assert (row.rating, row.comment) == (4, "Me ayudó a ordenar lo que viví.")
    # el comentario es del estudiante: no viaja a ningún reporte ni a la auditoría
    assert _reports(client, attempt_id, token) == before
    assert not AuditLog.objects.filter(context_json__contains="ordenar lo que viví").exists()


def test_una_segunda_respuesta_es_un_409_y_no_cambia_la_primera(completed, survey_on):
    client, attempt_id, _ = completed
    client.post(_url(attempt_id), {"rating": 5, "comment": "Primera"}, format="json")

    again = client.post(_url(attempt_id), {"rating": 1, "comment": "Segunda"}, format="json")

    assert again.status_code == 409
    assert again.data["code"] == "FEEDBACK_ALREADY_SENT"
    row = AttemptFeedback.objects.get(attempt_id=attempt_id)
    assert (row.rating, row.comment) == (5, "Primera")


def test_si_la_carrera_pasa_la_comprobacion_previa_la_base_igual_rechaza_a_la_segunda(completed, survey_on, monkeypatch):
    """Determinista: la comprobación previa «no ve» la respuesta de la otra orden; la restricción única la rechaza."""
    client, attempt_id, _ = completed
    client.post(_url(attempt_id), {"rating": 5, "comment": "Primera"}, format="json")
    real, asked = attempt_survey._answered, []

    def blind_the_first_time(pk):
        asked.append(pk)
        return False if len(asked) == 1 else real(pk)

    monkeypatch.setattr(attempt_survey, "_answered", blind_the_first_time)

    again = client.post(_url(attempt_id), {"rating": 1, "comment": "Segunda"}, format="json")

    assert again.status_code == 409 and again.data["code"] == "FEEDBACK_ALREADY_SENT"
    assert len(asked) == 2  # antes del INSERT y, tras el choque, para saber de quién fue el conflicto
    row = AttemptFeedback.objects.get(attempt_id=attempt_id)
    assert (row.rating, row.comment) == (5, "Primera")


def test_el_comentario_es_opcional(completed, survey_on):
    client, attempt_id, _ = completed

    posted = client.post(_url(attempt_id), {"rating": 3}, format="json")

    assert posted.status_code == 201
    assert posted.data["data"]["comment"] == ""


def test_la_consulta_dice_si_ya_respondio(completed, survey_on):
    client, attempt_id, _ = completed

    before = client.get(_url(attempt_id))
    client.post(_url(attempt_id), {"rating": 2, "comment": "Regular"}, format="json")
    after = client.get(_url(attempt_id))

    assert before.status_code == after.status_code == 200
    assert before.data["data"] == {"submitted": False}
    assert after.data["data"]["submitted"] is True
    assert (after.data["data"]["rating"], after.data["data"]["comment"]) == (2, "Regular")


# ─── lo que se rechaza ────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("rating", [0, 6, -1, 4.5, 3.0, "4", True, False, None, [], {}])
def test_una_calificacion_que_no_es_un_entero_de_1_a_5_es_un_400_con_el_campo(completed, survey_on, rating):
    client, attempt_id, _ = completed

    response = client.post(_url(attempt_id), {"rating": rating}, format="json")

    assert response.status_code == 400, response.data
    assert response.data["field"] == "rating" and response.data["code"] == "VALIDATION_ERROR"
    assert AttemptFeedback.objects.count() == 0


def test_sin_calificacion_es_un_400(completed, survey_on):
    client, attempt_id, _ = completed

    response = client.post(_url(attempt_id), {"comment": "Sin nota"}, format="json")

    assert response.status_code == 400 and response.data["field"] == "rating"


@pytest.mark.parametrize(
    "comment",
    ["x" * 501, "<b>negrita</b>", "mira <script>alert(1)</script>", "https://ejemplo.com/aviso", 5, ["a"], {"a": 1}],
)
def test_un_comentario_largo_con_marcado_o_que_no_es_texto_es_un_400_con_el_campo(completed, survey_on, comment):
    client, attempt_id, _ = completed

    response = client.post(_url(attempt_id), {"rating": 4, "comment": comment}, format="json")

    assert response.status_code == 400, response.data
    assert response.data["field"] == "comment"
    assert AttemptFeedback.objects.count() == 0


def test_un_comentario_de_500_caracteres_se_acepta(completed, survey_on):
    client, attempt_id, _ = completed

    response = client.post(_url(attempt_id), {"rating": 4, "comment": "x" * 500}, format="json")

    assert response.status_code == 201


@pytest.mark.parametrize("rating", [1, 2, 3, 4, 5])
def test_cada_calificacion_de_1_a_5_se_acepta(completed, survey_on, rating):
    client, attempt_id, _ = completed

    response = client.post(_url(attempt_id), {"rating": rating}, format="json")

    assert response.status_code == 201 and response.data["data"]["rating"] == rating


def test_un_comentario_de_varias_lineas_se_acepta_y_se_conserva(completed, survey_on):
    client, attempt_id, _ = completed

    response = client.post(_url(attempt_id), {"rating": 4, "comment": "Primera idea.\nSegunda idea."}, format="json")

    assert response.status_code == 201
    assert response.data["data"]["comment"] == "Primera idea.\nSegunda idea."


@pytest.mark.parametrize("body", [[1, 2], "texto", 5], ids=["lista", "texto", "número"])
def test_un_cuerpo_que_no_es_un_objeto_es_un_400_y_no_un_500(completed, survey_on, body):
    client, attempt_id, _ = completed

    response = client.post(_url(attempt_id), body, format="json")

    assert response.status_code == 400  # lo rechaza el analizador de JSON de la API, antes del servicio
    assert AttemptFeedback.objects.count() == 0


def test_ninguna_respuesta_de_la_encuesta_se_guarda_en_una_cache(completed, survey_on, settings):
    """El middleware de atestación de las pruebas pone ``no-store`` a toda respuesta y taparía a la vista: se quita."""
    _, attempt_id, _ = completed
    settings.MIDDLEWARE = [m for m in settings.MIDDLEWARE if "test_attestation" not in m]
    owner = cl(User.objects.get(pk=SimulationAttempt.objects.get(pk=attempt_id).student_id))  # cliente nuevo: carga el MIDDLEWARE de arriba

    posted = owner.post(_url(attempt_id), {"rating": 4}, format="json")
    read = owner.get(_url(attempt_id))

    assert "X-SIEP-Test-Environment" not in posted.headers  # el encabezado es de la vista, no del entorno de pruebas
    assert posted["Cache-Control"] == read["Cache-Control"] == "no-store"


@pytest.mark.parametrize("status", ["IN_PROGRESS", "PAUSED", "REPLACED", "SAFE_EXITED"])
def test_un_intento_que_no_esta_completado_no_se_encuesta(completed, survey_on, status):
    client, attempt_id, _ = completed
    SimulationAttempt.objects.filter(pk=attempt_id).update(status=status)

    response = client.post(_url(attempt_id), {"rating": 4}, format="json")

    assert response.status_code == 409
    assert response.data["code"] == "ATTEMPT_NOT_COMPLETED"
    assert AttemptFeedback.objects.count() == 0


def test_un_intento_no_completado_se_consulta_como_no_respondido(completed, survey_on):
    client, attempt_id, _ = completed
    SimulationAttempt.objects.filter(pk=attempt_id).update(status="IN_PROGRESS")

    assert client.get(_url(attempt_id)).data["data"] == {"submitted": False}


# ─── quién ────────────────────────────────────────────────────────────────────────────────────
def test_otro_estudiante_recibe_404_y_no_se_entera_de_que_existe(completed, survey_on):
    _, attempt_id, _ = completed
    stranger = User.objects.create_user(email="enc_otro@x.com", password="x", nombre="O", apellido="T", role="ESTUDIANTE")

    posted = cl(stranger).post(_url(attempt_id), {"rating": 4}, format="json")
    read = cl(stranger).get(_url(attempt_id))

    assert posted.status_code == read.status_code == 404
    assert AttemptFeedback.objects.count() == 0


@pytest.mark.parametrize("role", ["PROFESOR", "ADMIN"])
def test_el_docente_y_el_admin_no_responden_la_encuesta_de_un_estudiante(completed, survey_on, role):
    _, attempt_id, _ = completed
    staff = User.objects.create_user(email=f"enc_{role.lower()}@x.com", password="x", nombre="S", apellido="T", role=role)

    posted = cl(staff).post(_url(attempt_id), {"rating": 4}, format="json")
    read = cl(staff).get(_url(attempt_id))

    assert posted.status_code == read.status_code == 403
    assert AttemptFeedback.objects.count() == 0


def test_sin_sesion_es_un_401(completed, survey_on):
    _, attempt_id, _ = completed

    assert APIClient().post(_url(attempt_id), {"rating": 4}, format="json").status_code == 401
    assert APIClient().get(_url(attempt_id)).status_code == 401


# ─── carrera ──────────────────────────────────────────────────────────────────────────────────
def test_dos_respuestas_simultaneas_dejan_una_sola_y_la_otra_es_un_409(explored_attempt, settings):
    """Hilos con commits reales: la unicidad es de la base y la perdedora recibe el 409, no un 500."""
    settings.ATTEMPT_FEEDBACK_SURVEY = True
    a = explored_attempt
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
        lambda: attempt_survey.submit(a.attempt_id, {"rating": 5, "comment": "Una"}, a.student),
        lambda: attempt_survey.submit(a.attempt_id, {"rating": 1, "comment": "Otra"}, a.student),
    )

    assert AttemptFeedback.objects.filter(attempt_id=a.attempt_id).count() == 1
    errors = [o.error for o in outcomes if o.error is not None]
    assert len(errors) == 1 and isinstance(errors[0], ApiError) and errors[0].api_code == "FEEDBACK_ALREADY_SENT"
    assert sum(1 for o in outcomes if o.error is None) == 1
