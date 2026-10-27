"""S3-4 · Suprimir la identidad de una persona (RNF-003): ``services.erase_person``.

La prueba principal construye UNA persona con datos en TODAS las tablas del inventario que pueden tener datos suyos (ver
``data_subject_support.Mundo``: fue estudiante y hoy es docente), con marcadores únicos en su correo, su nombre, su apellido y
cada texto libre suyo, y otra persona completa con los suyos. Tras suprimirla:

(a) un barrido de TODAS las columnas de texto y JSON de TODAS las tablas de ``public`` (y de las bitácoras, descifradas) no
    encuentra ninguno de sus marcadores;
(b) ``users`` conserva su fila, seudonimizada e inactiva;
(c) sus intentos, eventos, decisiones, pistas, informes, evaluaciones y pertenencias siguen;
(d) no puede entrar y su token viejo da 401;
(e) la auditoría de sus filas conserva acción, recurso y fechas, pero ya no la IP ni el navegador;
(f) queda UN evento ``datos.suprimir`` con los ids de la persona y del ADMIN, sin datos personales;
(g) repetir la supresión no falla ni cambia nada;
(h) ``dry_run`` no cambia ni una fila (se compara un volcado de TODA la base, auditoría incluida);
(i) un ADMIN no se suprime, quien ejecuta debe ser un ADMIN activo y los datos de OTRA persona no se tocan.

Cada garantía lleva su control negativo: con la regla (o el cierre) apagado, la misma afirmación deja de cumplirse.
"""
import contextlib
import copy
import json
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, GrupoEstudiante
from apps.privacy import data_subject, inventory, services
from apps.privacy.data_subject import CONSERVAR, DETALLE_SALIDA_SEGURA, Pertenencia, Regla, correo_seudonimo
from apps.privacy.models import ConsentRecord
from apps.privacy.tests.data_subject_support import Entorno, Mundo, barrer, volcado
from apps.progression.models import StudentCaseCompletion
from apps.simulation.models import (
    AttemptEvent,
    AttemptFeedback,
    AttemptHintView,
    AttemptReport,
    AttemptWorldState,
    AuditLog,
    CaseReview,
    CriterionScore,
    PublicationChecklistItem,
    ReflectionJournal,
    RubricEvaluation,
    SimulationAttempt,
)
from apps.users.models import AccessRequest
from apps.users.services import account_service
from shared.exceptions import ApiError

pytestmark = [pytest.mark.req("RNF-003"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()
LOGIN = "/api/auth/login"
ME = "/api/auth/me"


@pytest.fixture
def entorno(db):
    return Entorno()


@pytest.fixture
def mundo(entorno):
    return Mundo("ana", entorno)


@pytest.fixture
def otro(entorno):
    return Mundo("beto", entorno)


def _suprimir(mundo, **opciones):
    return services.erase_person(mundo.persona, executed_by=mundo.entorno.admin, **opciones)


def _entra(correo, clave):
    return APIClient().post(LOGIN, {"email": correo, "password": clave}, format="json").status_code


def _conteos():
    return {tabla: len(filas) for tabla, filas in volcado().items()}


def _conservado(mundo):
    """Lo que debe quedar igual tras suprimir: lo que hizo la persona, columna a columna."""
    p = mundo.persona.pk
    return {
        "intentos": list(
            SimulationAttempt.objects.filter(student_id=p).order_by("id").values_list(
                "id", "case_version_id", "current_node_id", "status", "started_at", "ended_at",
                "active_seconds", "last_activity_at", "replaced_by_id", "replace_reason",
            )
        ),
        "eventos": list(
            AttemptEvent.objects.filter(attempt__student_id=p).order_by("id").values_list(
                "id", "attempt_id", "event_type", "node_id", "decision_option_id", "occurred_at",
            )
        ),
        "pistas": list(AttemptHintView.objects.filter(attempt__student_id=p).order_by("id").values_list("id", "attempt_id", "hint_id", "viewed_at")),
        "mundo": list(
            AttemptWorldState.objects.filter(attempt__student_id=p).values_list(
                "attempt_id", "scene_map_id", "player_x", "player_y", "inventory_json", "flags_json"
            )
        ),
        "informes": list(AttemptReport.objects.filter(attempt__student_id=p).values_list("id", "attempt_ordinal", "definition_hash")),
        "finalizaciones": list(StudentCaseCompletion.objects.filter(student_id=p).values_list("id", "simulation_case_id", "first_completed_at")),
        "evaluaciones": list(
            RubricEvaluation.objects.filter(attempt__student_id=p).order_by("id").values_list(
                "id", "total_score", "comment", "instructor_id", "status"
            )
        ),
        "puntajes": list(
            CriterionScore.objects.filter(rubric_evaluation__attempt__student_id=p).order_by("id").values_list("id", "score", "level", "comment")
        ),
        "membresias": list(
            GrupoEstudiante.objects.filter(estudiante_id=p).values_list("grupo_id", "estudiante_id", "status", "invited_by_id")
        ),
        "asignaciones": list(CaseAssignment.objects.filter(estudiante_id=p).values_list("id", "case_version_id", "assigned_by_id")),
        "consentimientos": list(
            ConsentRecord.objects.filter(person_id=p).values_list("id", "case_version_id", "notice_version", "accepted_at", "withdrawn_at")
        ),
        "solicitudes": list(AccessRequest.objects.filter(pk__in=_ids_de_solicitudes(mundo)).order_by("id").values_list("id", "status", "created_at")),
    }


def _ids_de_solicitudes(mundo):
    if not hasattr(mundo, "_ids_solicitudes"):
        mundo._ids_solicitudes = sorted(AccessRequest.objects.filter(email__iexact=mundo.persona.email).values_list("pk", flat=True))
    return mundo._ids_solicitudes


# ── El mundo de la prueba es de verdad ───────────────────────────────────────────────────────────────────────────


def test_el_mundo_planta_cada_marcador_antes_de_suprimir(mundo):
    """Control del barrido: sin esto, un barrido vacío tras suprimir no probaría nada."""
    hallazgos = barrer(mundo.marcadores_a_borrar())
    tablas = {tabla for tabla, _ in hallazgos}

    assert {
        "users", "access_requests", "attempt_events", "attempt_reports", "reflection_journals", "case_reviews",
        "publication_checklist_items", "audit_logs",
    } <= tablas
    for clave in ("correo", "nombre", "apellido", "reflexion", "salida", "etiqueta", "nota", "evidencia", "pregunta", "agente"):
        assert barrer([mundo.m[clave]]), f"el marcador «{clave}» no está en ninguna parte antes de suprimir"


def test_el_mundo_tiene_filas_en_todas_las_tablas_con_dueno(mundo):
    """Cada tabla de PERSON_SCOPE tiene al menos una fila de la persona (si no, esta prueba no cubriría esa tabla)."""
    vacias = [
        tabla for tabla, pertenencias in data_subject.PERSON_SCOPE.items()
        if not any(data_subject.modelo_de(tabla).objects.filter(p.filas(mundo.persona)).exists() for p in pertenencias)
    ]
    assert vacias == []


# ── (a) El barrido de todo el esquema no encuentra nada ──────────────────────────────────────────────────────────


def test_a_tras_suprimir_el_barrido_de_todo_el_esquema_no_encuentra_ningun_marcador(mundo):
    marcadores = mundo.marcadores_a_borrar()
    assert barrer(marcadores), "el barrido debe encontrar los marcadores ANTES de suprimir"

    _suprimir(mundo)

    assert barrer(marcadores) == []


def test_a_el_informe_devuelto_no_trae_ningun_dato_personal(mundo):
    correo, nombre, apellido = mundo.persona.email, mundo.persona.nombre, mundo.persona.apellido

    informe = _suprimir(mundo)

    texto = json.dumps(informe, ensure_ascii=False)
    for dato in (correo, nombre, apellido, *mundo.marcadores_a_borrar(), mundo.m["comentario"]):
        assert dato not in texto


# ── (b) La cuenta conserva su fila, seudonimizada e inactiva ─────────────────────────────────────────────────────


def test_b_la_cuenta_queda_seudonimizada_inactiva_y_sin_clave(mundo):
    persona = mundo.persona
    User.objects.filter(pk=persona.pk).update(must_change_password=True, temp_password_set_at=timezone.now())

    _suprimir(mundo)

    persona.refresh_from_db()
    assert persona.email == f"eliminada-{persona.pk}@invalid" == correo_seudonimo(persona.pk)
    assert persona.nombre == "Cuenta" and persona.apellido == f"eliminada-{persona.pk}"
    assert persona.activo is False
    assert persona.role == "PROFESOR"  # el rol se conserva
    assert not persona.has_usable_password()
    assert persona.check_password(mundo.clave) is False
    assert persona.must_change_password is False and persona.temp_password_set_at is None
    assert persona.session_epoch >= 1  # se cerraron sus sesiones


def test_b_la_cuenta_suprimida_no_es_una_cuenta_pendiente_ni_se_aprueba_por_lote(mundo):
    """Una cuenta suprimida no puede volver a ser «pendiente de aprobación»: se le mandaría una clave temporal a un correo inválido."""
    _suprimir(mundo)
    mundo.persona.refresh_from_db()

    assert mundo.persona.is_pending_approval is False
    resultado = account_service.approve_pending([mundo.persona.pk], mundo.entorno.admin)
    assert resultado["approved"] == 0 and resultado["skipped"] == [mundo.persona.pk]


def test_b_control_negativo_sin_apagar_la_marca_de_cambio_de_clave_la_cuenta_suprimida_seria_pendiente_de_aprobacion(
    mundo, monkeypatch
):
    """Por qué el cierre de la cuenta apaga ``must_change_password``: inactiva, sin clave y con el cambio pendiente, un ADMIN podría
    «aprobarla» y mandar una clave temporal a un correo que no existe."""
    User.objects.filter(pk=mundo.persona.pk).update(must_change_password=True, temp_password_set_at=timezone.now())
    monkeypatch.setattr(data_subject, "CIERRE_DE_CUENTA", {"activo": False})

    _suprimir(mundo)

    mundo.persona.refresh_from_db()
    assert mundo.persona.is_pending_approval is True


def test_los_textos_del_sistema_que_la_supresion_restituye_son_los_que_escribe_el_servidor(mundo):
    sin_clave = User()
    sin_clave.set_password(None)
    assert sin_clave.password == data_subject.SIN_CLAVE and not sin_clave.has_usable_password()

    # Una salida segura sin motivo escribe el texto de siempre (``game_service.safe_exit``). Solo un estudiante juega.
    User.objects.filter(pk=mundo.persona.pk).update(role="ESTUDIANTE")
    token = mundo.token_del_intento
    ruta = f"/api/simulation/attempts/{mundo.attempt.pk}"
    mundo._post(f"{ruta}/safe-exit", {"attemptToken": token})
    ultimo = AttemptEvent.objects.filter(attempt=mundo.attempt, event_type="SAFE_EXIT_REQUESTED").order_by("-id").first()
    assert ultimo.detail == DETALLE_SALIDA_SEGURA

    # Una decisión con evidencia saltada añade el sufijo que la supresión recorta.
    decision = AttemptEvent.objects.filter(attempt=mundo.attempt, event_type="DECISION_SELECTED").get()
    assert data_subject.SUFIJO_DE_OVERRIDE in decision.detail


def test_b_las_solicitudes_de_acceso_se_anonimizan_una_por_una(mundo):
    ids = _ids_de_solicitudes(mundo)
    assert len(ids) == 2

    _suprimir(mundo)

    filas = list(AccessRequest.objects.filter(pk__in=ids).order_by("pk"))
    assert [f.email for f in filas] == [f"anonimizada-{pk}@invalid" for pk in ids]
    assert {f.nombre for f in filas} == {"Solicitud"}
    assert [f.apellido for f in filas] == [f"anonimizada-{pk}" for pk in ids]
    assert sorted(f.status for f in filas) == ["PENDING", "REVIEWED"]  # el estado del trámite se conserva


# ── (c) Lo que hizo la persona sigue ─────────────────────────────────────────────────────────────────────────────


def test_c_sus_intentos_eventos_decisiones_y_pertenencias_siguen_con_los_mismos_valores(mundo):
    antes = _conservado(mundo)
    assert all(antes[clave] for clave in antes), "el mundo debe tener filas en cada una de estas tablas"
    conteos = _conteos()

    _suprimir(mundo)

    despues = _conservado(mundo)
    # El informe congelado conserva todo salvo el motivo escrito de la salida segura (se comprueba aparte).
    assert despues == antes
    asi_quedan = _conteos()
    for tabla, cuenta in conteos.items():
        if tabla not in {"reflection_journals", "audit_logs"}:
            assert asi_quedan[tabla] == cuenta, tabla


def test_c_el_comentario_de_la_encuesta_de_la_persona_se_vacia_y_su_calificacion_y_la_respuesta_de_otra_se_conservan(mundo, otro):
    """E6-3: el comentario es texto libre de la persona y se vacía; la calificación (1 a 5) es lo que hizo y queda, como el
    resto del intento (así la analítica no pierde retroactivamente una respuesta cuando alguien pide su supresión)."""
    propia = AttemptFeedback.objects.get(attempt__student=mundo.persona)
    assert propia.comment and mundo.m["encuesta"] in propia.comment
    otra_antes = list(AttemptFeedback.objects.filter(attempt__student=otro.persona).values_list("id", "rating", "comment"))
    assert len(otra_antes) == 1

    _suprimir(mundo)

    despues = AttemptFeedback.objects.get(pk=propia.pk)
    assert despues.comment == ""
    assert (despues.rating, despues.attempt_id, despues.created_at) == (propia.rating, propia.attempt_id, propia.created_at)
    assert list(AttemptFeedback.objects.filter(attempt__student=otro.persona).values_list("id", "rating", "comment")) == otra_antes


def test_c_las_bitacoras_de_la_persona_se_borran_y_las_de_otra_no(mundo, otro):
    assert ReflectionJournal.objects.filter(attempt__student=mundo.persona).count() == 1
    otra_antes = list(ReflectionJournal.objects.filter(attempt__student=otro.persona).values_list("id", "encrypted_text"))

    _suprimir(mundo)

    assert ReflectionJournal.objects.filter(attempt__student=mundo.persona).count() == 0
    assert list(ReflectionJournal.objects.filter(attempt__student=otro.persona).values_list("id", "encrypted_text")) == otra_antes


def test_c_el_motivo_de_la_salida_segura_y_las_etiquetas_se_quitan_del_evento_y_del_informe(mundo):
    attempt = mundo.attempt
    informe_antes = json.loads(AttemptReport.objects.get(attempt=attempt).report_json)
    detalle_de_decision = AttemptEvent.objects.filter(
        attempt=attempt, event_type__in=("DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED")
    ).get().detail
    assert mundo.m["etiqueta"] in detalle_de_decision and mundo.m["salida"] in json.dumps(informe_antes)

    _suprimir(mundo)

    salida = AttemptEvent.objects.get(attempt=attempt, event_type="SAFE_EXIT_REQUESTED")
    assert salida.detail == DETALLE_SALIDA_SEGURA
    decision = AttemptEvent.objects.filter(
        attempt=attempt, event_type__in=("DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED")
    ).get()
    assert mundo.m["etiqueta"] not in decision.detail
    assert decision.detail == detalle_de_decision.split(" | Override de evidencia: ")[0]  # el mensaje del sistema queda
    informe = json.loads(AttemptReport.objects.get(attempt=attempt).report_json)
    for entrada in informe["timeline"]:
        if entrada["type"] == "SAFE_EXIT_REQUESTED":
            assert entrada["label"] == DETALLE_SALIDA_SEGURA
            entrada["label"] = next(
                e["label"] for e in informe_antes["timeline"] if e["type"] == "SAFE_EXIT_REQUESTED"
            )
    assert informe == informe_antes  # el resto del informe es lo que hizo la persona y queda igual


def test_c_el_texto_de_un_docente_sobre_la_persona_se_conserva_por_decision(mundo):
    """Decisión de la institución (SD-9): hoy los comentarios de evaluación se conservan. Si la regla cambia, esta prueba lo dice."""
    assert data_subject.ERASURE_RULES[("rubric_evaluations", "comment")].accion == CONSERVAR
    assert data_subject.ERASURE_RULES[("criterion_scores", "comment")].accion == CONSERVAR

    _suprimir(mundo)

    assert mundo.m["comentario"] in RubricEvaluation.objects.get(pk=mundo.evaluacion_recibida.pk).comment
    assert mundo.m["comentario"] in CriterionScore.objects.get(pk=mundo.puntaje_recibido.pk).comment
    assert barrer([mundo.m["comentario"]]), "el comentario se conserva y el barrido lo ve: está declarado"


def test_c_el_token_de_cada_intento_de_la_persona_queda_inutil(mundo):
    antes = SimulationAttempt.objects.get(pk=mundo.attempt.pk).attempt_token_hash

    _suprimir(mundo)

    despues = SimulationAttempt.objects.get(pk=mundo.attempt.pk).attempt_token_hash
    assert despues == f"suprimido-{mundo.attempt.pk}" != antes


# ── (d) No puede entrar y su token viejo da 401 ──────────────────────────────────────────────────────────────────


def _afirmar_que_no_entra(mundo, correo_viejo):
    assert _entra(correo_viejo, mundo.clave) == 401, "con el correo de antes no debe entrar"
    # El correo seudónimo ni siquiera pasa la validación del formulario (``.invalid`` no es un dominio): 400, nunca 200.
    assert _entra(correo_seudonimo(mundo.persona.pk), mundo.clave) in (400, 401), "con el correo seudónimo tampoco"
    assert mundo.cliente().get(ME).status_code == 401, "el token de antes debe dar 401"


def test_d_no_puede_entrar_y_su_token_viejo_da_401(mundo):
    correo_viejo = mundo.persona.email
    assert _entra(correo_viejo, mundo.clave) == 200, "antes de suprimir, entra"
    assert mundo.cliente().get(ME).status_code == 200, "antes de suprimir, su token vale"

    _suprimir(mundo)

    _afirmar_que_no_entra(mundo, correo_viejo)


def test_d_control_negativo_sin_cerrar_la_cuenta_ni_sus_sesiones_el_token_viejo_sigue_valiendo(mundo, monkeypatch):
    correo_viejo = mundo.persona.email
    monkeypatch.setattr(data_subject, "CIERRE_DE_CUENTA", {})
    monkeypatch.setattr(account_service, "revoke_sessions", lambda user_id: None)

    _suprimir(mundo)

    assert mundo.cliente().get(ME).status_code == 200, "con el cierre apagado, el token de antes sigue valiendo"
    with pytest.raises(AssertionError):
        _afirmar_que_no_entra(mundo, correo_viejo)


# ── (e) La auditoría de sus filas pierde la IP y el navegador, y nada más ────────────────────────────────────────


CAMPOS_DE_AUDITORIA = (
    "id", "actor_id", "actor_role", "action", "resource_type", "resource_id", "context_json", "occurred_at", "retention_until",
)


def _filas_de_auditoria(mundo):
    return list(
        AuditLog.objects.filter(actor_id=mundo.persona.pk).order_by("id").values(*CAMPOS_DE_AUDITORIA, "ip_address", "user_agent")
    )


def test_e_la_auditoria_de_sus_filas_conserva_accion_recurso_y_fechas_pero_no_la_ip_ni_el_agente(mundo):
    antes = _filas_de_auditoria(mundo)
    assert len(antes) >= 5
    assert any(f["ip_address"] for f in antes) and any(f["user_agent"] for f in antes)

    _suprimir(mundo)

    despues = _filas_de_auditoria(mundo)
    assert [f["id"] for f in despues] == [f["id"] for f in antes]
    for fila_antes, fila_despues in zip(antes, despues, strict=True):
        assert fila_despues["ip_address"] is None and fila_despues["user_agent"] is None
        for campo in CAMPOS_DE_AUDITORIA:
            if campo == "context_json" and fila_antes["action"] == "AI_ASSISTANT_QUERY":
                continue  # la fila antigua pierde su texto libre; se comprueba en la prueba siguiente
            assert fila_despues[campo] == fila_antes[campo], (fila_antes["action"], campo)


def test_e_la_pregunta_antigua_del_asistente_se_quita_del_contexto_y_lo_demas_queda(mundo):
    fila = AuditLog.objects.get(actor_id=mundo.persona.pk, action="AI_ASSISTANT_QUERY")
    assert mundo.m["pregunta"] in fila.context_json

    _suprimir(mundo)

    fila.refresh_from_db()
    assert json.loads(fila.context_json) == {"taxonomy": "asistente.consultar", "question_length": 12}


def test_e_las_filas_de_otras_personas_no_pierden_su_ip(mundo, otro):
    ips_de_otra_antes = list(AuditLog.objects.filter(actor_id=otro.persona.pk).order_by("id").values_list("id", "ip_address", "user_agent"))
    assert any(ip for _, ip, _ in ips_de_otra_antes)

    _suprimir(mundo)

    assert list(AuditLog.objects.filter(actor_id=otro.persona.pk).order_by("id").values_list("id", "ip_address", "user_agent")) == ips_de_otra_antes


def test_e_control_negativo_sin_la_regla_de_la_ip_y_el_agente_las_filas_los_conservan(mundo, monkeypatch):
    reglas = dict(data_subject.ERASURE_RULES)
    for columna in ("ip_address", "user_agent"):
        reglas[("audit_logs", columna)] = Regla(CONSERVAR, "regla apagada por la prueba")
    monkeypatch.setattr(data_subject, "ERASURE_RULES", reglas)

    _suprimir(mundo)

    assert any(f["ip_address"] for f in _filas_de_auditoria(mundo))
    assert barrer([mundo.m["agente"]]), "el barrido ve el navegador que se quedó"


# ── (f) UN evento datos.suprimir, con ids ────────────────────────────────────────────────────────────────────────


def test_f_queda_un_solo_evento_con_el_id_de_la_persona_y_el_del_admin_sin_datos_personales(mundo):
    correo, nombre, apellido = mundo.persona.email, mundo.persona.nombre, mundo.persona.apellido
    admin = mundo.entorno.admin

    informe = _suprimir(mundo)

    [evento] = AuditLog.objects.filter(action="PERSONAL_DATA_ERASED")
    assert (evento.actor_id, evento.actor_role) == (admin.pk, "ADMIN")
    assert (evento.resource_type, evento.resource_id) == ("USER", str(mundo.persona.pk))
    contexto = json.loads(evento.context_json)
    assert contexto == {
        "taxonomy": "datos.suprimir", "targetId": mundo.persona.pk, "executedBy": admin.pk,
        "changed": informe["cambiadas"], "deleted": informe["borradas"],
        "tables": sum(1 for t in informe["tablas"].values() if t["cambiadas"] or t["borradas"]),
    }
    volcado_del_evento = json.dumps(
        [evento.action, evento.actor_role, evento.resource_type, evento.resource_id, evento.context_json, evento.ip_address, evento.user_agent]
    )
    for dato in (correo, nombre, apellido, admin.email, *mundo.marcadores_a_borrar()):
        assert dato not in volcado_del_evento


def test_f_el_simulacro_no_deja_ningun_evento(mundo):
    _suprimir(mundo, dry_run=True)

    assert not AuditLog.objects.filter(action="PERSONAL_DATA_ERASED").exists()


# ── (g) Repetir no falla ni cambia nada ──────────────────────────────────────────────────────────────────────────


def test_g_repetir_la_supresion_no_falla_ni_cambia_ni_una_fila(mundo):
    primera = _suprimir(mundo)
    despues_de_la_primera = volcado()

    segunda = _suprimir(mundo)

    assert volcado() == despues_de_la_primera
    assert primera["yaSuprimida"] is False and segunda["yaSuprimida"] is True
    assert segunda["cambiadas"] == 0 and segunda["borradas"] == 0
    assert AuditLog.objects.filter(action="PERSONAL_DATA_ERASED").count() == 1


def test_g_repetir_limpia_lo_que_aparecio_despues_de_la_primera_vez(mundo):
    """Idempotente no es ciego: una bitácora que se guardó mientras corría la primera supresión se borra al repetir."""
    _suprimir(mundo)
    rezagada = ReflectionJournal.objects.create(
        attempt=mundo.attempt, node=mundo.entorno.nodo_inicial, encrypted_text="texto-cifrado-rezagado",
        encryption_key_ref="local-aes-gcm-v1",
    )

    segunda = _suprimir(mundo)

    assert segunda["yaSuprimida"] is True and segunda["borradas"] == 1
    assert not ReflectionJournal.objects.filter(pk=rezagada.pk).exists()
    assert AuditLog.objects.filter(action="PERSONAL_DATA_ERASED").count() == 2  # la segunda sí cambió algo y deja su evento


def test_g_control_negativo_sin_el_filtro_de_lo_que_ya_cambio_repetir_si_cambia_filas(mundo, monkeypatch):
    _suprimir(mundo)
    despues_de_la_primera = volcado()
    monkeypatch.setattr(services, "_distinto", lambda campo, valor: Q())  # toda fila cuenta como «por cambiar»

    segunda = _suprimir(mundo)

    assert segunda["cambiadas"] > 0
    assert volcado() != despues_de_la_primera, "sin el filtro, repetir reescribe filas y vuelve a cerrar las sesiones"


# ── Una sola transacción ─────────────────────────────────────────────────────────────────────────────────────────


def test_si_algo_falla_a_medias_no_queda_nada_cambiado(mundo, monkeypatch):
    def fallar(user_id):
        raise RuntimeError("fallo a medias")

    monkeypatch.setattr(account_service, "revoke_sessions", fallar)
    antes = volcado()

    with pytest.raises(RuntimeError, match="a medias"):
        _suprimir(mundo)

    assert volcado() == antes
    assert not AuditLog.objects.filter(action="PERSONAL_DATA_ERASED").exists()


def test_control_negativo_sin_la_transaccion_un_fallo_a_medias_deja_la_supresion_a_medias(mundo, monkeypatch):
    def fallar(user_id):
        raise RuntimeError("fallo a medias")

    monkeypatch.setattr(account_service, "revoke_sessions", fallar)
    monkeypatch.setattr(services, "transaction", SimpleNamespace(atomic=contextlib.nullcontext))
    antes = volcado()

    with pytest.raises(RuntimeError, match="a medias"):
        _suprimir(mundo)

    assert volcado() != antes, "sin ``transaction.atomic``, lo ya cambiado se queda"


def test_suprimir_a_una_persona_sin_datos_solo_cambia_su_cuenta(entorno):
    nueva = User.objects.create_user(email="sin-datos@example.com", password=None, nombre="Ana", apellido="Nueva", role="ESTUDIANTE")

    informe = services.erase_person(nueva, executed_by=entorno.admin)

    assert {tabla for tabla, datos in informe["tablas"].items() if datos["cambiadas"] or datos["borradas"]} == {"users"}
    nueva.refresh_from_db()
    assert nueva.email == correo_seudonimo(nueva.pk) and nueva.activo is False


# ── (h) El simulacro no cambia nada ──────────────────────────────────────────────────────────────────────────────


def test_h_el_simulacro_no_cambia_ni_una_fila_y_cuenta_lo_mismo_que_la_supresion_real(mundo):
    antes = volcado()

    simulado = _suprimir(mundo, dry_run=True)

    assert volcado() == antes, "el simulacro cambió algo (incluida la auditoría)"
    real = _suprimir(mundo)
    assert volcado() != antes, "el detector de cambios está ciego: la supresión real no cambió el volcado"
    assert simulado["simulacro"] is True and real["simulacro"] is False
    assert simulado["tablas"] == real["tablas"]
    assert (simulado["cambiadas"], simulado["borradas"]) == (real["cambiadas"], real["borradas"])


# ── (i) Quién se puede suprimir y quién ejecuta ──────────────────────────────────────────────────────────────────


def test_i_un_admin_no_se_suprime_y_no_se_toca_nada(mundo):
    User.objects.filter(pk=mundo.persona.pk).update(role="ADMIN")  # la copia en memoria sigue diciendo PROFESOR
    antes = volcado()

    with pytest.raises(ApiError) as error:
        _suprimir(mundo)

    assert error.value.api_code == "ERASE_ADMIN_FORBIDDEN"
    assert "quita el rol" in str(error.value.detail).lower()
    assert volcado() == antes


def test_i_la_misma_persona_con_otro_rol_si_se_suprime(mundo):
    """Control del control: lo único que impide suprimirla en la prueba anterior es el rol de ADMIN."""
    assert _suprimir(mundo)["cambiadas"] > 0


@pytest.mark.parametrize("quien", ["estudiante", "docente", "admin_inactivo", "la_propia_persona", "inexistente"])
def test_i_quien_ejecuta_debe_ser_un_admin_activo_y_no_se_toca_nada(mundo, quien):
    entorno = mundo.entorno
    if quien == "admin_inactivo":
        User.objects.filter(pk=entorno.admin.pk).update(activo=False)  # la copia en memoria sigue diciendo «activo»
    ejecutor = {
        "estudiante": entorno.alumno,
        "docente": entorno.docente,
        "admin_inactivo": entorno.admin,
        "la_propia_persona": mundo.persona,
        "inexistente": None,
    }[quien]
    antes = volcado()

    with pytest.raises(ApiError) as error:
        services.erase_person(mundo.persona, executed_by=ejecutor)

    assert error.value.api_code == "EXECUTOR_NOT_ADMIN"
    assert volcado() == antes


def test_i_los_datos_de_otra_persona_no_se_tocan(mundo, otro):
    exportacion_antes = services.export_person(otro.persona)
    marcadores_de_otra = barrer(otro.marcadores_a_borrar())
    assert marcadores_de_otra

    _suprimir(mundo)

    exportacion_despues = services.export_person(otro.persona)
    for exportacion in (exportacion_antes, exportacion_despues):
        exportacion.pop("generadoEn")
    assert exportacion_despues == exportacion_antes
    assert barrer(otro.marcadores_a_borrar()) == marcadores_de_otra
    otro.persona.refresh_from_db()
    assert otro.persona.activo is True and otro.persona.email == f"{otro.m['correo']}@example.com"


def test_i_lo_que_la_persona_hizo_a_otros_no_se_toca(mundo):
    """Como docente: el intento que sustituyó, la evaluación que dio, el caso y el grupo siguen intactos."""
    ajeno = SimulationAttempt.objects.get(pk=mundo.intento_ajeno.pk)
    evaluacion = RubricEvaluation.objects.get(pk=mundo.evaluacion_dada.pk)
    nota_ajena = CaseReview.objects.get(pk=mundo.revision_ajena.pk)
    antes = (
        ajeno.attempt_token_hash, ajeno.replace_reason, ajeno.replaced_by_id, evaluacion.comment, evaluacion.total_score,
        nota_ajena.note, nota_ajena.content_reviewer, mundo.grupo.nombre, mundo.caso.title,
    )

    _suprimir(mundo)

    ajeno.refresh_from_db()
    evaluacion.refresh_from_db()
    nota_ajena.refresh_from_db()
    mundo.grupo.refresh_from_db()
    mundo.caso.refresh_from_db()
    despues = (
        ajeno.attempt_token_hash, ajeno.replace_reason, ajeno.replaced_by_id, evaluacion.comment, evaluacion.total_score,
        nota_ajena.note, nota_ajena.content_reviewer, mundo.grupo.nombre, mundo.caso.title,
    )
    assert despues == antes
    assert mundo.m["nota_ajena"] in nota_ajena.note


def test_i_lo_que_escribio_como_docente_si_se_borra(mundo):
    _suprimir(mundo)

    propia = CaseReview.objects.get(pk=mundo.revision_propia.pk)
    assert propia.note == "" and propia.content_reviewer == f"Cuenta eliminada-{mundo.persona.pk}"
    assert (propia.requested_by_id, propia.decided_by_id, propia.decision) == (mundo.persona.pk, mundo.persona.pk, "APPROVED")
    assert PublicationChecklistItem.objects.get(pk=mundo.punto.pk).evidence_note is None


# ── Falla cerrada: sin cobertura completa no se suprime ──────────────────────────────────────────────────────────


def test_sin_cobertura_completa_la_supresion_se_niega_y_no_toca_nada(mundo, monkeypatch):
    copia = copy.deepcopy(inventory.DATA_INVENTORY)
    copia["attempt_events"]["columns"]["analitica_nueva_de_e6"] = (inventory.SENSITIVE, "columna inventada para la prueba")
    monkeypatch.setattr(inventory, "DATA_INVENTORY", copia)
    antes = volcado()

    with pytest.raises(ApiError) as error:
        _suprimir(mundo)

    assert error.value.api_code == "ERASURE_RULES_INCOMPLETE"
    assert "analitica_nueva_de_e6" in str(error.value.detail)
    assert volcado() == antes


def test_el_simulacro_tambien_se_niega_sin_cobertura_completa(mundo, monkeypatch):
    reglas = dict(data_subject.ERASURE_RULES)
    del reglas[("users", "email")]
    monkeypatch.setattr(data_subject, "ERASURE_RULES", reglas)

    with pytest.raises(ApiError) as error:
        _suprimir(mundo, dry_run=True)

    assert error.value.api_code == "ERASURE_RULES_INCOMPLETE"


def test_una_persona_que_no_existe_da_un_error_claro(entorno):
    fantasma = User(pk=2_000_000_000, email="fantasma@example.com", nombre="Fantasma", apellido="Inexistente")

    with pytest.raises(ApiError) as error:
        services.erase_person(fantasma, executed_by=entorno.admin)

    assert error.value.api_code == "PERSON_NOT_FOUND"


# ── Controles negativos de las garantías importantes ─────────────────────────────────────────────────────────────


def test_control_negativo_sin_la_regla_de_las_reflexiones_el_barrido_encuentra_el_marcador(mundo, monkeypatch):
    reglas = dict(data_subject.ERASURE_RULES)
    for columna in ("attempt_id", "encrypted_text"):
        reglas[("reflection_journals", columna)] = Regla(CONSERVAR, "regla apagada por la prueba")
    monkeypatch.setattr(data_subject, "ERASURE_RULES", reglas)

    _suprimir(mundo)

    assert barrer([mundo.m["reflexion"]]) == [("reflection_journals", "encrypted_text (descifrado)")]


@pytest.mark.parametrize(
    ("clave", "tabla", "columna"),
    [
        ("correo", "users", "email"),
        ("nombre", "users", "nombre"),
        ("apellido", "users", "apellido"),
        ("correo", "access_requests", "email"),
        ("nota", "case_reviews", "note"),
        ("evidencia", "publication_checklist_items", "evidence_note"),
        ("salida", "attempt_events", "detail"),
        ("salida", "attempt_reports", "report_json"),
        ("pregunta", "audit_logs", "context_json"),
    ],
)
def test_control_negativo_sin_la_regla_de_cada_dato_el_barrido_lo_encuentra(mundo, monkeypatch, clave, tabla, columna):
    reglas = dict(data_subject.ERASURE_RULES)
    reglas[(tabla, columna)] = Regla(CONSERVAR, "regla apagada por la prueba")
    monkeypatch.setattr(data_subject, "ERASURE_RULES", reglas)

    _suprimir(mundo)

    assert (tabla, columna) in barrer([mundo.m[clave]])


def test_control_negativo_sin_el_papel_de_la_regla_del_token_se_toca_el_intento_de_otra_persona(mundo, monkeypatch):
    regla = data_subject.ERASURE_RULES[("simulation_attempts_v2", "attempt_token_hash")]
    assert regla.roles == ("titular",)
    reglas = {**data_subject.ERASURE_RULES, ("simulation_attempts_v2", "attempt_token_hash"): Regla(
        regla.accion, regla.motivo, roles=None, valor=regla.valor
    )}
    monkeypatch.setattr(data_subject, "ERASURE_RULES", reglas)
    antes = SimulationAttempt.objects.get(pk=mundo.intento_ajeno.pk).attempt_token_hash

    _suprimir(mundo)

    assert SimulationAttempt.objects.get(pk=mundo.intento_ajeno.pk).attempt_token_hash != antes


def test_control_negativo_con_el_alcance_demasiado_ancho_se_tocan_las_filas_de_otra_persona(mundo, otro, monkeypatch):
    alcance = dict(data_subject.PERSON_SCOPE)
    alcance["audit_logs"] = (Pertenencia("actor", lambda persona: Q()),)
    monkeypatch.setattr(data_subject, "PERSON_SCOPE", alcance)

    _suprimir(mundo)

    assert not any(ip for ip in AuditLog.objects.filter(actor_id=otro.persona.pk).values_list("ip_address", flat=True))
