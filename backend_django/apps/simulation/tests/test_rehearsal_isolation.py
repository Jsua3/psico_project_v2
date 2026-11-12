"""A2 · Tarea 6 — el ensayo existe para el juego y no existe para todo lo demás.

Un ensayo es un ``SimulationAttempt`` con ``is_rehearsal=True``. El gestor por defecto (``objects``) lo excluye; solo el
juego, que encuentra el intento por su token, y el propio ensayo usan ``all_objects``. Estas pruebas fijan las dos mitades:

* el juego lo encuentra por su token y lo juega su autor (la docente dueña del caso o el ADMIN) por las mismas rutas del
  estudiante, sin asignación, consentimiento ni ventana; a cualquier otra persona le dice 403;
* al llegar a un final muestra el final y lo que no llegó a ver, calculado en el momento, y no deja informe congelado,
  evaluación automática ni aviso de intento completado; y ningún lector de intentos (informes, listas, métricas,
  progresión, encuestas, evaluaciones) lo cuenta (C9).
"""
import json
import re
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection
from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo
from apps.privacy import consent_service
from apps.progression import access as progression_access
from apps.progression.models import StudentCaseCompletion
from apps.reportes import services as reportes
from apps.simulation.assessment import analytics
from apps.simulation.models import (
    AttemptEvent,
    AttemptReport,
    AttemptStatus,
    CaseVersion,
    DecisionOption,
    EvaluationOrigin,
    RubricEvaluation,
    SimulationAttempt,
    SimulationNode,
)
from apps.simulation.services import attempt_report, game_service, instructor_service, rubric_service
from apps.simulation.signals import attempt_completed, attempt_start_requested

from .case_exploration import explore_what_the_case_asks_for

User = get_user_model()

BASE = "/api/simulation"
TOKEN_HEADER = "HTTP_X_SIEP_ATTEMPT_TOKEN"

BACKEND = Path(__file__).resolve().parents[3]
#: Los únicos módulos que pueden nombrar el gestor que ve los ensayos. ``rehearsal.py`` y ``editor_view.py`` son de las
#: Tareas 7 y 8: aún no existen o no lo usan, y la prueba solo exige que quien lo use esté en la lista.
#: El gestor se USA como atributo (``SimulationAttempt.all_objects``, ``Modelo.all_objects``): una variable local que se llame
#: igual (``world_definition`` tiene una, de objetos del mapa) no es el gestor.
#: ``_base_manager`` también ve los ensayos (es el ``Manager`` simple): solo privacidad lo usa, a propósito.
USO_DEL_GESTOR = re.compile(r"\.(?:all_objects|_base_manager)(?![A-Za-z0-9_])")
LISTA_BLANCA = {
    "apps/simulation/models/attempt.py",
    "apps/simulation/services/game_service.py",
    "apps/simulation/services/attempt_lock.py",
    "apps/simulation/services/rehearsal.py",
    "apps/simulation/services/authoring/editor_view.py",
    # Privacidad lee y suprime por ``_base_manager``: debe ver cada fila del titular, ensayos incluidos.
    "apps/privacy/services.py",
}


# ─── Ayudantes ─────────────────────────────────────────────────────────────────────────────────────────────────────
def _usuario(email, role):
    return User.objects.create_user(email=email, password="x", nombre="Nom", apellido="Ape", role=role)


def _cliente(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _opcion(options, *, adecuada=True):
    if not adecuada:
        return options[0]
    return next(
        (o for o in options if DecisionOption.objects.get(pk=o["id"]).response_class == "RECOMMENDED"), options[0]
    )


def _estado(client, attempt_id, token):
    response = client.get(f"{BASE}/attempts/{attempt_id}", **{TOKEN_HEADER: token})
    assert response.status_code == 200, response.data
    return response.data["data"]


def _decidir(client, state, *, adecuada=True, opcion=None):
    option = opcion or _opcion(state["currentNode"]["options"], adecuada=adecuada)
    response = client.post(
        f"{BASE}/attempts/{state['attemptId']}/decisions",
        {"attemptToken": state["attemptToken"], "decisionOptionId": option["id"]},
        format="json",
    )
    assert response.status_code == 200, response.data
    return response.data["data"]["attempt"]


def _jugar_hasta_el_final(client, state, *, explorar=True, adecuada=True):
    if explorar:
        explore_what_the_case_asks_for(state["attemptId"])
        state = _estado(client, state["attemptId"], state["attemptToken"])
    for _ in range(60):
        if state["status"] != "IN_PROGRESS":
            break
        state = _decidir(client, state, adecuada=adecuada)
    assert state["status"] == "COMPLETED"
    return state


def _recibidas(senal):
    """Se suscribe a ``senal`` y devuelve la lista donde irán cayendo los envíos; ``_desconectar`` la suelta."""
    recibidas = []

    def receptor(sender, **kwargs):
        recibidas.append(kwargs)

    senal.connect(receptor, weak=False, dispatch_uid="test-ensayo-receptor")
    return recibidas


def _desconectar(senal):
    senal.disconnect(dispatch_uid="test-ensayo-receptor")


def _empezar_ensayo(version, autor):
    inicio = SimulationNode.objects.get(case_version_id=version.id, start_node=True)
    attempt, token = game_service.start_rehearsal_attempt(version, autor, inicio)
    return attempt, token


@pytest.fixture
def version(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


@pytest.fixture
def mundo(version):
    """Una docente con un grupo y un estudiante con el caso asignado; el ADMIN; otra docente sin relación."""
    profesora = _usuario("prof_a2t6@x.com", "PROFESOR")
    otra = _usuario("otra_a2t6@x.com", "PROFESOR")
    admin = _usuario("admin_a2t6@x.com", "ADMIN")
    estudiante = _usuario("est_a2t6@x.com", "ESTUDIANTE")
    grupo = Grupo.objects.create(nombre="Grupo A2T6", codigo="a2t6-grupo", profesor=profesora)
    with connection.cursor() as cur:
        cur.execute("INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s)", [grupo.id, estudiante.id])
    CaseAssignment.objects.create(grupo=grupo, case_version=version)
    return SimpleNamespace(
        version=version, profesora=profesora, otra=otra, admin=admin, estudiante=estudiante, grupo=grupo,
    )


@pytest.fixture
def jugada(mundo):
    """Un intento NORMAL del estudiante, completado por la API, y un ensayo de la docente, completado por la API."""
    normal = _estado(_cliente(mundo.estudiante), *_empezar_normal(mundo))
    normal = _jugar_hasta_el_final(_cliente(mundo.estudiante), normal)
    attempt, token = _empezar_ensayo(mundo.version, mundo.profesora)
    cliente = _cliente(mundo.profesora)
    ensayo = _estado(cliente, str(attempt.id), token)
    ensayo = _jugar_hasta_el_final(cliente, ensayo)
    return SimpleNamespace(normal=normal, ensayo=ensayo, ensayo_id=attempt.id, token=token)


def _empezar_normal(mundo):
    response = _cliente(mundo.estudiante).post(f"{BASE}/attempts", {"caseVersionId": mundo.version.id}, format="json")
    assert response.status_code in (200, 201), response.data
    data = response.data["data"]
    return data["attemptId"], data["attemptToken"]


def _ensayo_directo_del_estudiante(mundo, *, status):
    """Una fila de ensayo con un ESTUDIANTE de autor: la API no lo permite, pero un lector no debe confiar en eso."""
    inicio = SimulationNode.objects.get(case_version_id=mundo.version.id, start_node=True)
    ahora = timezone.now()
    attempt = SimulationAttempt.all_objects.create(
        is_rehearsal=True, student=mundo.estudiante, case_version=mundo.version, current_node=inicio,
        attempt_token_hash=f"hash-directo-{status}", status=status, last_activity_at=ahora,
        ended_at=ahora if status == AttemptStatus.COMPLETED else None,
    )
    return attempt


# ─── El gestor ─────────────────────────────────────────────────────────────────────────────────────────────────────
def _archivos_de_apps_sin_tests_ni_migraciones():
    for raiz in ("apps", "shared"):
        for ruta in sorted((BACKEND / raiz).rglob("*.py")):
            relativa = ruta.relative_to(BACKEND).as_posix()
            if "/tests/" in relativa or "/migrations/" in relativa or relativa.endswith("conftest.py"):
                continue
            yield relativa, ruta


def test_all_objects_solo_en_la_lista_blanca():
    usados = {
        relativa for relativa, ruta in _archivos_de_apps_sin_tests_ni_migraciones()
        if USO_DEL_GESTOR.search(ruta.read_text(encoding="utf-8"))
    }
    assert usados <= LISTA_BLANCA, f"el gestor que ve los ensayos solo se usa en la lista blanca: sobran {sorted(usados - LISTA_BLANCA)}"
    # La lista no está vacía de verdad: el juego sí lo usa.
    assert "apps/simulation/services/game_service.py" in usados


def test_el_gestor_por_defecto_no_ve_ensayos(mundo):
    attempt, _ = _empezar_ensayo(mundo.version, mundo.profesora)

    assert SimulationAttempt._default_manager is SimulationAttempt.objects
    assert not SimulationAttempt.objects.filter(pk=attempt.id).exists()
    assert SimulationAttempt.objects.count() == 0
    assert SimulationAttempt.all_objects.filter(pk=attempt.id).exists()
    # Los gestores inversos heredan el filtro (es lo deseado)...
    assert list(mundo.version.simulationattempt_set.all()) == []
    # ...y lo que pasa por el gestor base (guardar, releer, la clave del evento) sigue viendo el ensayo.
    attempt.refresh_from_db()
    assert attempt.is_rehearsal is True
    assert AttemptEvent.objects.filter(attempt_id=attempt.id).first().attempt.id == attempt.id


def test_un_intento_normal_si_lo_ve_el_gestor_por_defecto(mundo):
    inicio = SimulationNode.objects.get(case_version_id=mundo.version.id, start_node=True)
    normal = SimulationAttempt.objects.create(
        attempt_token_hash="hash-normal", case_version=mundo.version, student=mundo.estudiante, current_node=inicio,
    )

    assert normal.is_rehearsal is False
    assert SimulationAttempt.objects.filter(pk=normal.pk).exists()
    assert SimulationAttempt.all_objects.filter(pk=normal.pk).exists()


# ─── Empezar el ensayo ─────────────────────────────────────────────────────────────────────────────────────────────
def test_empezar_un_ensayo_guarda_los_dos_eventos_y_no_avisa_que_un_estudiante_empieza(mundo):
    recibidas = _recibidas(attempt_start_requested)
    try:
        attempt, token = _empezar_ensayo(mundo.version, mundo.profesora)
    finally:
        _desconectar(attempt_start_requested)

    assert recibidas == []
    assert attempt.is_rehearsal is True
    assert attempt.student_id == mundo.profesora.id
    assert attempt.status == AttemptStatus.IN_PROGRESS
    assert attempt.attempt_token_hash == game_service._hash_token(token)
    assert list(AttemptEvent.objects.filter(attempt_id=attempt.id).values_list("event_type", flat=True)) == [
        "ATTEMPT_STARTED", "NODE_ENTERED",
    ]


def test_un_ensayo_no_exige_version_publicada(mundo):
    CaseVersion.objects.filter(pk=mundo.version.pk).update(status="DRAFT")
    borrador = CaseVersion.objects.get(pk=mundo.version.pk)

    attempt, token = _empezar_ensayo(borrador, mundo.profesora)

    assert SimulationAttempt.all_objects.filter(pk=attempt.id, is_rehearsal=True).exists()
    assert token


# ─── Quién lo juega ────────────────────────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("autor", ["profesora", "admin"])
def test_el_juego_encuentra_el_ensayo_por_token_y_lo_juega_su_autor(mundo, autor):
    usuario = getattr(mundo, autor)
    attempt, token = _empezar_ensayo(mundo.version, usuario)
    cliente = _cliente(usuario)
    ruta = f"{BASE}/attempts/{attempt.id}"

    for sufijo in ("", "/world", "/progress-map", "/hints"):
        respuesta = cliente.get(ruta + sufijo, **{TOKEN_HEADER: token})
        assert respuesta.status_code == 200, (sufijo, respuesta.data)
    estado = respuesta = cliente.get(ruta, **{TOKEN_HEADER: token}).data["data"]
    assert estado["status"] == "IN_PROGRESS"
    assert estado["currentNode"]["options"], "el ensayo ofrece las opciones de la escena como el juego real"
    # Las órdenes también: elegir, la pausa y reanudar.
    explore_what_the_case_asks_for(str(attempt.id))
    estado = _estado(cliente, str(attempt.id), token)
    assert _decidir(cliente, estado)["status"] in ("IN_PROGRESS", "COMPLETED")
    assert cliente.post(f"{ruta}/safe-exit", {"attemptToken": token, "reason": "pausa"}, format="json").status_code == 200
    assert cliente.post(f"{ruta}/resume", {"attemptToken": token}, format="json").status_code == 200


def test_un_ensayo_no_pasa_por_asignacion_ni_consentimiento(mundo, settings):
    """La docente no tiene el caso asignado y, aunque el aviso de contenido se exija, su ensayo no lo pide."""
    assert not CaseAssignment.objects.filter(estudiante=mundo.profesora).exists()
    attempt, token = _empezar_ensayo(mundo.version, mundo.profesora)
    exigido = []
    original = consent_service.require_consent
    consent_service.require_consent = lambda *a, **k: exigido.append(a)
    try:
        respuesta = _cliente(mundo.profesora).get(f"{BASE}/attempts/{attempt.id}/world", **{TOKEN_HEADER: token})
    finally:
        consent_service.require_consent = original

    assert respuesta.status_code == 200
    assert exigido == []


def test_otro_docente_o_un_estudiante_con_el_token_reciben_403(mundo):
    attempt, token = _empezar_ensayo(mundo.version, mundo.profesora)
    ruta = f"{BASE}/attempts/{attempt.id}"

    for intruso in (mundo.otra, mundo.estudiante, mundo.admin):
        for sufijo in ("", "/world", "/progress-map"):
            respuesta = _cliente(intruso).get(ruta + sufijo, **{TOKEN_HEADER: token})
            assert respuesta.status_code == 403, (intruso.role, sufijo, respuesta.status_code)
        decidir = _cliente(intruso).post(
            f"{ruta}/decisions", {"attemptToken": token, "decisionOptionId": 1}, format="json",
        )
        assert decidir.status_code == 403, (intruso.role, decidir.status_code)
    # Y sin sesión, 401.
    assert _cliente().get(ruta, **{TOKEN_HEADER: token}).status_code == 401


def test_una_docente_recibe_403_ante_cualquier_fallo_y_un_estudiante_conserva_sus_errores(mundo):
    attempt, token = _empezar_ensayo(mundo.version, mundo.profesora)
    docente, estudiante = _cliente(mundo.profesora), _cliente(mundo.estudiante)
    ruta = f"{BASE}/attempts/{attempt.id}"
    inexistente = f"{BASE}/attempts/00000000-0000-4000-8000-000000000000"

    # Docente: sin token, con un token equivocado, intento inexistente: 403 siempre (la matriz de la API no cambia).
    assert docente.get(ruta).status_code == 403
    assert docente.get(ruta, **{TOKEN_HEADER: "no-es-el-token"}).status_code == 403
    assert docente.get(inexistente, **{TOKEN_HEADER: token}).status_code == 403
    # Estudiante: lo de hoy (400 sin token, 404 si no existe; el ensayo ajeno con su token es 403).
    assert estudiante.get(ruta).status_code == 400
    assert estudiante.get(inexistente, **{TOKEN_HEADER: token}).status_code == 404
    assert estudiante.get(ruta, **{TOKEN_HEADER: "no-es-el-token"}).status_code == 404


def test_un_docente_con_el_token_de_un_intento_de_estudiante_recibe_403(mundo):
    normal_id, token = _empezar_normal(mundo)

    for usuario in (mundo.profesora, mundo.admin):
        assert _cliente(usuario).get(f"{BASE}/attempts/{normal_id}", **{TOKEN_HEADER: token}).status_code == 403


@pytest.mark.parametrize("sufijo", ["/feedback", "/evaluation"])
def test_las_rutas_que_siguen_solo_con_play_cierran_a_la_docente(mundo, sufijo):
    attempt, token = _empezar_ensayo(mundo.version, mundo.profesora)

    respuesta = _cliente(mundo.profesora).get(f"{BASE}/attempts/{attempt.id}{sufijo}", **{TOKEN_HEADER: token})

    assert respuesta.status_code == 403


def test_el_historial_y_el_intento_activo_siguen_solo_para_el_estudiante(mundo):
    _empezar_ensayo(mundo.version, mundo.profesora)

    assert _cliente(mundo.profesora).get(f"{BASE}/attempts/history").status_code == 403
    assert _cliente(mundo.profesora).get(f"{BASE}/cases/{mundo.version.id}/active-attempt").status_code == 403
    historial = _cliente(mundo.estudiante).get(f"{BASE}/attempts/history")
    assert historial.status_code == 200 and historial.data["data"] == []


# ─── Llegar a un final ─────────────────────────────────────────────────────────────────────────────────────────────
def test_un_ensayo_completado_no_congela_informe_ni_evalua_ni_avisa(mundo):
    recibidas = _recibidas(attempt_completed)
    try:
        attempt, token = _empezar_ensayo(mundo.version, mundo.profesora)
        cliente = _cliente(mundo.profesora)
        final = _jugar_hasta_el_final(cliente, _estado(cliente, str(attempt.id), token))
    finally:
        _desconectar(attempt_completed)

    assert final["status"] == "COMPLETED"
    assert not AttemptReport.objects.filter(attempt_id=attempt.id).exists()
    assert not RubricEvaluation.objects.filter(attempt_id=attempt.id).exists()
    assert not RubricEvaluation.objects.filter(attempt_id=attempt.id, origin=EvaluationOrigin.SISTEMA).exists()
    assert recibidas == []
    assert not StudentCaseCompletion.objects.filter(student_id=mundo.profesora.id).exists()
    # El evento de cierre sí queda en la traza del ensayo (es parte de jugarlo).
    assert AttemptEvent.objects.filter(attempt_id=attempt.id, event_type="ATTEMPT_COMPLETED").exists()


def test_el_final_del_ensayo_trae_el_informe_calculado_en_el_momento(mundo):
    attempt, token = _empezar_ensayo(mundo.version, mundo.profesora)
    cliente = _cliente(mundo.profesora)

    final = _jugar_hasta_el_final(cliente, _estado(cliente, str(attempt.id), token))

    informe = final["completionReport"]
    assert informe is not None
    assert informe["decisionReview"], "el final muestra lo decidido"
    assert all("missed" in entrada for entrada in informe["decisionReview"])
    assert not AttemptReport.objects.filter(attempt_id=attempt.id).exists()
    # Releer el estado de un ensayo ya completado lo vuelve a calcular, no lo lee de ninguna fila.
    otra_vez = _estado(cliente, str(attempt.id), token)
    assert otra_vez["completionReport"]["decisionReview"] == informe["decisionReview"]


@pytest.mark.parametrize("sufijo", ["/completion-report", "/report"])
def test_el_informe_del_ensayo_por_token_se_calcula_en_el_momento(mundo, sufijo):
    attempt, token = _empezar_ensayo(mundo.version, mundo.profesora)
    cliente = _cliente(mundo.profesora)
    _jugar_hasta_el_final(cliente, _estado(cliente, str(attempt.id), token))

    respuesta = cliente.get(f"{BASE}/attempts/{attempt.id}{sufijo}", **{TOKEN_HEADER: token})

    assert respuesta.status_code == 200, respuesta.data
    informe = respuesta.data["data"]
    assert informe["decisionReview"] and all("missed" in entrada for entrada in informe["decisionReview"])
    assert not AttemptReport.objects.filter(attempt_id=attempt.id).exists()
    assert not AttemptEvent.objects.filter(attempt_id=attempt.id, event_type=attempt_report.FEEDBACK_VIEWED).exists()


def test_el_informe_del_ensayo_dice_lo_que_no_llego_a_ver(mundo):
    """Decidir sin explorar: el juego retiene las respuestas recomendadas y el informe del ensayo las nombra en ``missed``."""
    attempt, token = _empezar_ensayo(mundo.version, mundo.profesora)
    cliente = _cliente(mundo.profesora)
    state = _estado(cliente, str(attempt.id), token)
    inicio = state["currentNode"]["id"]

    state = _decidir(cliente, state, adecuada=False)  # la primera que se ofrece, sin haber explorado nada
    if state["currentNode"]["id"] == inicio:  # una respuesta riesgosa pide reconsiderar: se elige otra
        distinta = next(o for o in state["currentNode"]["options"] if o["id"] != _opcion(state["currentNode"]["options"], adecuada=False)["id"])
        state = _decidir(cliente, state, opcion=distinta)
    final = _jugar_hasta_el_final(cliente, state)

    faltas = [m for entrada in final["completionReport"]["decisionReview"] for m in entrada["missed"]]
    assert faltas, "no explorar antes de decidir deja respuestas sin ofrecer"
    assert all(m["missing"] for m in faltas)


def test_el_informe_por_token_de_un_ensayo_en_juego_sigue_siendo_un_error_de_estado(mundo):
    attempt, token = _empezar_ensayo(mundo.version, mundo.profesora)
    cliente = _cliente(mundo.profesora)

    assert cliente.get(f"{BASE}/attempts/{attempt.id}/report", **{TOKEN_HEADER: token}).status_code == 409
    assert cliente.get(f"{BASE}/attempts/{attempt.id}/completion-report", **{TOKEN_HEADER: token}).status_code == 400


# ─── C9: ningún lector de intentos cuenta un ensayo ────────────────────────────────────────────────────────────────
def _ids(filas, clave="attemptId"):
    return [fila[clave] for fila in filas]


def test_ningun_lector_de_intentos_cuenta_un_ensayo(mundo, jugada):
    normal_id = jugada.normal["attemptId"]
    ensayo_id = str(jugada.ensayo_id)
    # Un ensayo con un ESTUDIANTE de autor, completado y con una decisión: lo que un lector por estudiante vería.
    del_estudiante = _ensayo_directo_del_estudiante(mundo, status=AttemptStatus.COMPLETED)
    AttemptEvent.objects.create(
        attempt=del_estudiante, event_type="DECISION_SELECTED", node=del_estudiante.current_node,
        decision_option=DecisionOption.objects.filter(response_class="CONTRAINDICATED").first(),
    )
    del_estudiante_id = str(del_estudiante.id)
    ensayos = {ensayo_id, del_estudiante_id}

    # Control: el gestor completo sí los tiene, el normal no, y el intento normal sí cuenta donde corresponde.
    assert {str(a.id) for a in SimulationAttempt.all_objects.filter(is_rehearsal=True)} == ensayos
    assert [str(a.id) for a in SimulationAttempt.objects.all()] == [normal_id]

    # instructor_service: la lista, lo reciente, la traza, la rúbrica y el reemplazo del intento.
    for lector in (mundo.admin, mundo.profesora):
        listado = instructor_service.list_attempts(lector)
        assert _ids(listado["items"]) == [normal_id], lector.role
        assert listado["coverage"] == {"shown": 1, "total": 1}
        assert _ids(instructor_service.recent_attempts(lector)) == [normal_id]
    for id_ensayo in ensayos:
        with pytest.raises(NotFound):
            instructor_service.trace(id_ensayo, mundo.admin)
        with pytest.raises(NotFound):
            instructor_service.rubric(id_ensayo, mundo.admin)
        with pytest.raises(NotFound):
            instructor_service.replace_attempt(id_ensayo, "no", mundo.admin)
        with pytest.raises(NotFound):
            rubric_service.attempt_rubric_view(id_ensayo, mundo.admin)
        with pytest.raises(NotFound):
            rubric_service.save_attempt_evaluation(id_ensayo, {"scores": []}, mundo.admin)
        with pytest.raises(NotFound):
            rubric_service.owner_evaluation_view(id_ensayo, mundo.estudiante)
        with pytest.raises(NotFound):
            game_service.get_student_report(id_ensayo, mundo.admin)
    assert instructor_service.trace(normal_id, mundo.admin) is not None  # control: el normal sí se traza

    # reportes: el tablero del docente y del ADMIN (intentos y conteo de decisiones), el reporte del grupo y el del estudiante.
    eventos_normales = AttemptEvent.objects.filter(
        attempt_id=normal_id, event_type__in=("DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED"),
    ).count()
    assert eventos_normales > 0
    for lector in (mundo.admin, mundo.profesora):
        tablero = reportes.get_dashboard(lector)
        assert tablero["simulacionesCompletadas"] == 1, lector.role
        assert _ids(tablero["ultimosIntentos"], "attemptId") == [normal_id]
        assert sum(tablero["decisiones"].values()) == eventos_normales, lector.role
    reporte = reportes.generar_reporte_grupo(mundo.grupo.id, mundo.version.id, mundo.profesora)["simulacion"]
    assert reporte["totalIntentos"] == 1 and reporte["intentosCompletados"] == 1
    assert [e["totalIntentos"] for e in reporte["estudiantes"]] == [1]
    assert sum(reporte["estudiantes"][0]["clases"].values()) == eventos_normales
    del_alumno = reportes.generar_reporte_estudiante(mundo.estudiante.id, None, None, mundo.profesora)
    assert _ids(del_alumno["attempts"]) == [normal_id]
    assert del_alumno["coverage"] == {"shown": 1, "total": 1}

    # game_service: el historial del propio estudiante.
    assert _ids(game_service.list_attempt_history(mundo.estudiante)) == [normal_id]

    # analítica: una fila por intento completado del alcance.
    filas = analytics.load_rows(None)
    assert [fila.attempt_id for fila in filas] == [normal_id]

    # privacidad: ¿tiene el estudiante un intento de esta versión? Solo el normal cuenta.
    assert consent_service._tiene_intento(mundo.estudiante, mundo.version.id) is True
    SimulationAttempt.objects.filter(pk=normal_id).delete()
    assert consent_service._tiene_intento(mundo.estudiante, mundo.version.id) is False
    assert consent_service._tiene_intento(mundo.profesora, mundo.version.id) is False


def test_ningun_lector_cuenta_un_ensayo_abierto_ni_la_progresion_ni_la_encuesta(mundo, settings):
    abierto = _ensayo_directo_del_estudiante(mundo, status=AttemptStatus.IN_PROGRESS)
    # Con la ventana cerrada solo un intento ABIERTO deja terminar: un ensayo abierto no debe abrirla.
    CaseAssignment.objects.filter(case_version=mundo.version).update(closes_at=timezone.now() - timedelta(days=1))

    decision = progression_access.access_decision(mundo.estudiante, mundo.version.id)
    assert decision.allowed is False
    assert progression_access.sequence_of(mundo.estudiante)[0].decision.allowed is False
    # Control: el mismo caso con un intento NORMAL abierto sí se deja terminar.
    SimulationAttempt.all_objects.filter(pk=abierto.pk).delete()
    inicio = SimulationNode.objects.get(case_version_id=mundo.version.id, start_node=True)
    SimulationAttempt.objects.create(
        attempt_token_hash="hash-normal-abierto", case_version=mundo.version, student=mundo.estudiante,
        current_node=inicio,
    )
    assert progression_access.access_decision(mundo.estudiante, mundo.version.id).allowed is True


def test_la_encuesta_y_el_relleno_de_informes_no_alcanzan_a_un_ensayo(mundo, jugada, settings):
    from apps.simulation.services import attempt_survey

    settings.ATTEMPT_SURVEY_ENABLED = True
    for lector in (mundo.profesora, mundo.estudiante):
        with pytest.raises(NotFound):
            attempt_survey.read(jugada.ensayo_id, lector)
    # El relleno de informes congelados recorre los intentos completados: el ensayo no recibe fila ni evaluación.
    call_command("backfill_attempt_reports")
    assert not AttemptReport.objects.filter(attempt_id=jugada.ensayo_id).exists()
    assert not RubricEvaluation.objects.filter(attempt_id=jugada.ensayo_id).exists()
    # Control: el intento normal ya tenía su informe congelado.
    assert AttemptReport.objects.filter(attempt_id=jugada.normal["attemptId"]).exists()


def test_el_ordinal_de_un_intento_no_cuenta_los_ensayos(mundo):
    """El n.º de intento del estudiante cuenta sus intentos, no los ensayos que haya a su nombre."""
    _ensayo_directo_del_estudiante(mundo, status=AttemptStatus.COMPLETED)
    inicio = SimulationNode.objects.get(case_version_id=mundo.version.id, start_node=True)
    normal = SimulationAttempt.objects.create(
        attempt_token_hash="hash-ordinal", case_version=mundo.version, student=mundo.estudiante, current_node=inicio,
    )

    assert attempt_report.attempt_ordinal(normal) == 1


def test_el_ensayo_de_la_docente_no_aparece_en_el_historial_de_nadie(mundo, jugada):
    historial = _cliente(mundo.estudiante).get(f"{BASE}/attempts/history").data["data"]

    assert _ids(historial) == [jugada.normal["attemptId"]]
    assert json.dumps(historial).count(str(jugada.ensayo_id)) == 0
