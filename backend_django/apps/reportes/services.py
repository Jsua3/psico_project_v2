"""Reporting del simulador: dashboard global + reporte por grupo + export CSV.

Extraído de la app legacy ``sesiones`` (T3.2). Todas las métricas son
solo-simulación (SimulationAttempt / AttemptEvent / ReflectionJournal /
RubricEvaluation); se removió la mezcla del quiz legacy. El CSV se devuelve como
string plano (sin envoltorio JSON), con ``.`` decimal y ``,`` delimitador.
"""
import csv
import io
from datetime import datetime, time

from django.contrib.auth import get_user_model
from django.db.models import Avg
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.grupos.models import Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.models.attempt import (
    AttemptEvent,
    AttemptStatus,
    ReflectionJournal,
    SimulationAttempt,
)
from apps.simulation.models.rubric import EvaluationOrigin, RubricEvaluation
from apps.simulation.services.instructor_scope import student_ids_for_instructor
from shared.identity import IdentityPresenter

User = get_user_model()

DECISION_EVENT_TYPES = ["DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED"]
# SAFE_EXITED ya solo existe en intentos históricos (salida segura terminal, de
# antes de la pausa reanudable) y sigue puntuando (decisión 2026-10-01). Los
# intentos en pausa y los reemplazados (REPLACED) no puntúan.
SCORED_STATUSES = [AttemptStatus.COMPLETED, AttemptStatus.SAFE_EXITED]


def _nombre_completo(user):
    return IdentityPresenter.display_name(user)


def _grupo_student_ids(grupo_id):
    return list(
        GrupoEstudiante.objects.filter(grupo_id=grupo_id, status=MembershipStatus.ACTIVE)
        .values_list("estudiante_id", flat=True)
    )


def _count_decisions(attempt_ids, classification):
    if not attempt_ids:
        return 0
    return AttemptEvent.objects.filter(
        attempt_id__in=attempt_ids,
        event_type__in=DECISION_EVENT_TYPES,
        decision_option__classification=classification,
    ).count()


def _safe_exit_attempt_ids(attempts):
    """Intentos que usaron la salida segura.

    Cuenta el evento, no el estado: una pausa sigue contando aunque después se
    reanude, se complete o se reemplace. Los SAFE_EXITED históricos cuentan
    siempre, porque entonces la salida segura cerraba el intento.
    """
    ids = {a.id for a in attempts if a.status == AttemptStatus.SAFE_EXITED}
    ids.update(
        AttemptEvent.objects.filter(
            attempt_id__in=[a.id for a in attempts], event_type="SAFE_EXIT_REQUESTED"
        ).values_list("attempt_id", flat=True)
    )
    return ids


def _count_reflections(attempt_ids):
    if not attempt_ids:
        return 0
    return ReflectionJournal.objects.filter(attempt_id__in=attempt_ids).count()


def _count_rubrics(attempt_ids):
    if not attempt_ids:
        return 0
    # Solo las rúbricas que aplicó un docente (E6-1e): la evaluación automática del sistema no es una «rúbrica aplicada».
    return (
        RubricEvaluation.objects.filter(attempt_id__in=attempt_ids, origin=EvaluationOrigin.DOCENTE)
        .values("attempt_id")
        .distinct()
        .count()
    )


# --- Dashboard -------------------------------------------------------------
def get_dashboard(usuario):
    """Tablero del docente: solo los estudiantes de sus grupos (RF-25). El ADMIN ve todo."""
    student_ids = student_ids_for_instructor(usuario)
    attempts = SimulationAttempt.objects.all()
    events = AttemptEvent.objects.all()
    if student_ids is not None:
        attempts = attempts.filter(student_id__in=student_ids)
        events = events.filter(attempt__student_id__in=student_ids)

    start_of_day = datetime.combine(timezone.now().date(), time.min)

    # «Completada» es solo COMPLETED: SAFE_EXITED es una interrupción y la UI la
    # rotula «Interrumpido». Los promedios usan SCORED_STATUSES.
    simulaciones_completadas_hoy = attempts.filter(
        status=AttemptStatus.COMPLETED, ended_at__gte=start_of_day
    ).count()
    simulaciones_en_progreso = attempts.filter(
        status=AttemptStatus.IN_PROGRESS
    ).count()
    simulaciones_completadas = attempts.filter(
        status=AttemptStatus.COMPLETED
    ).count()
    avg_sim = float(
        attempts.filter(status__in=SCORED_STATUSES).aggregate(
            a=Avg("accumulated_score")
        )["a"]
        or 0
    )

    ultimos_intentos = [
        {
            "id": str(a.id),
            "attemptId": str(a.id),
            "casoTitulo": a.case_version.simulation_case.title,
            "estudiante": _nombre_completo(a.student),
            "studentAlias": IdentityPresenter.alias_for(a.student_id, viewer=usuario),
            "puntaje": a.accumulated_score,
            "estado": a.status,
        }
        for a in attempts.select_related(
            "case_version__simulation_case", "student"
        ).order_by("-started_at")[:10]
    ]
    intentos_recientes = sorted(
        ultimos_intentos, key=lambda x: x["puntaje"], reverse=True
    )[:10]

    return {
        "estudiantesActivos": simulaciones_completadas_hoy,
        "simulacionesCompletadasHoy": simulaciones_completadas_hoy,
        "puntajePromedioGlobal": avg_sim,
        "simulacionesCompletadas": simulaciones_completadas,
        "simulacionesEnProgreso": simulaciones_en_progreso,
        "puntajePromedioSimulacion": avg_sim,
        "decisionesAdecuadas": events.filter(
            event_type__in=DECISION_EVENT_TYPES,
            decision_option__classification="ADEQUATE",
        ).count(),
        "decisionesRiesgosas": events.filter(
            event_type__in=DECISION_EVENT_TYPES,
            decision_option__classification="RISKY",
        ).count(),
        "decisionesInadecuadas": events.filter(
            event_type__in=DECISION_EVENT_TYPES,
            decision_option__classification="INADEQUATE",
        ).count(),
        "decisionesProhibidas": events.filter(
            event_type="PROHIBITED_DECISION_SELECTED"
        ).count(),
        "ultimosIntentos": ultimos_intentos,
        "intentosRecientes": intentos_recientes,
    }


# --- Group report ----------------------------------------------------------
def generar_reporte_grupo(grupo_id, case_version_id, usuario):
    grupo = Grupo.objects.filter(pk=grupo_id).first()
    if not grupo:
        raise NotFound(f"Grupo no encontrado: {grupo_id}")
    # Un docente solo reporta sus grupos (RF-25) y activos (D-13); el ADMIN reporta cualquiera.
    if getattr(usuario, "role", None) != "ADMIN":
        if grupo.profesor_id != usuario.id:
            raise PermissionDenied("No tienes permiso para ver el reporte de este grupo")
        if not grupo.activo:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise PermissionDenied("El grupo no está activo: su reporte ya no se genera")
    simulacion = (
        _build_simulation_report(grupo, case_version_id)
        if case_version_id is not None
        else None
    )
    return {
        "grupoId": grupo_id,
        "caseVersionId": case_version_id,
        "simulacion": simulacion,
    }


def _empty_simulation_report():
    return {
        "totalIntentos": 0,
        "intentosCompletados": 0,
        "intentosEnProgreso": 0,
        "intentosSalidaSegura": 0,
        "puntajePromedio": 0.0,
        "decisionesAdecuadas": 0,
        "decisionesRiesgosas": 0,
        "decisionesInadecuadas": 0,
        "bitacorasRegistradas": 0,
        "rubricasAplicadas": 0,
        "estudiantes": [],
    }


def _build_simulation_report(grupo, case_version_id):
    student_ids = _grupo_student_ids(grupo.id)
    if not student_ids:
        return _empty_simulation_report()

    attempts = list(
        SimulationAttempt.objects.filter(
            case_version_id=case_version_id, student_id__in=student_ids
        ).order_by("-started_at")
    )
    if not attempts:
        return _empty_simulation_report()

    completados = sum(1 for a in attempts if a.status == AttemptStatus.COMPLETED)
    en_progreso = sum(1 for a in attempts if a.status == AttemptStatus.IN_PROGRESS)
    en_pausa = sum(1 for a in attempts if a.status == AttemptStatus.PAUSED)
    safe_exit_ids = _safe_exit_attempt_ids(attempts)
    scored = [a for a in attempts if a.status in SCORED_STATUSES]
    puntaje_promedio = (
        sum(a.accumulated_score for a in scored) / len(scored) if scored else 0.0
    )

    attempt_ids = [a.id for a in attempts]
    by_student = {}
    for a in attempts:
        by_student.setdefault(a.student_id, []).append(a)

    students = list(User.objects.filter(id__in=student_ids))
    estudiantes = [
        _estudiante_sim_dto(st, by_student.get(st.id, []), safe_exit_ids)
        for st in students
    ]
    estudiantes.sort(key=lambda e: e["nombre"])

    return {
        "totalIntentos": len(attempts),
        "intentosCompletados": completados,
        "intentosEnProgreso": en_progreso,
        "intentosEnPausa": en_pausa,
        "intentosSalidaSegura": len(safe_exit_ids),
        "puntajePromedio": float(puntaje_promedio),
        "decisionesAdecuadas": _count_decisions(attempt_ids, "ADEQUATE"),
        "decisionesRiesgosas": _count_decisions(attempt_ids, "RISKY"),
        "decisionesInadecuadas": _count_decisions(attempt_ids, "INADEQUATE"),
        "bitacorasRegistradas": _count_reflections(attempt_ids),
        "rubricasAplicadas": _count_rubrics(attempt_ids),
        "estudiantes": estudiantes,
    }


def _estudiante_sim_dto(student, attempts, safe_exit_ids=None):
    if safe_exit_ids is None:
        safe_exit_ids = _safe_exit_attempt_ids(attempts)
    completados = sum(1 for a in attempts if a.status == AttemptStatus.COMPLETED)
    en_progreso = sum(1 for a in attempts if a.status == AttemptStatus.IN_PROGRESS)
    en_pausa = sum(1 for a in attempts if a.status == AttemptStatus.PAUSED)
    salida_segura = sum(1 for a in attempts if a.id in safe_exit_ids)
    scored = [a for a in attempts if a.status in SCORED_STATUSES]
    puntaje = sum(a.accumulated_score for a in scored) / len(scored) if scored else 0.0
    attempt_ids = [a.id for a in attempts]

    if en_progreso > 0:
        estado = "EN_PROGRESO"
    elif en_pausa > 0:
        estado = "EN_PAUSA"
    elif completados > 0:
        estado = "COMPLETADO"
    elif any(a.status == AttemptStatus.SAFE_EXITED for a in attempts):
        estado = "SAFE_EXITED"
    else:
        estado = "PENDIENTE"

    return {
        "id": student.id,
        "nombre": _nombre_completo(student),
        "totalIntentos": len(attempts),
        "intentosCompletados": completados,
        "intentosEnProgreso": en_progreso,
        "intentosEnPausa": en_pausa,
        "intentosSalidaSegura": salida_segura,
        "puntajePromedio": float(puntaje),
        "decisionesAdecuadas": _count_decisions(attempt_ids, "ADEQUATE"),
        "decisionesRiesgosas": _count_decisions(attempt_ids, "RISKY"),
        "decisionesInadecuadas": _count_decisions(attempt_ids, "INADEQUATE"),
        "bitacorasRegistradas": _count_reflections(attempt_ids),
        "rubricasAplicadas": _count_rubrics(attempt_ids),
        "estado": estado,
    }


# --- CSV export ------------------------------------------------------------
#: Primer carácter con el que una hoja de cálculo interpreta la celda como fórmula (D-8).
_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_cell(value):
    """Una celda de TEXTO de un CSV, neutralizada: lo que empieza como fórmula se antepone con
    ``'`` para que Excel o Calc la lean como texto. No se usa con números (un ``-15.0`` es un
    puntaje, no una fórmula). El entrecomillado de comas, comillas y saltos lo hace ``csv``."""
    text = "" if value is None else str(value)
    if text.startswith(_CSV_FORMULA_PREFIXES):
        return "'" + text
    return text


def exportar_csv(grupo_id, case_version_id, usuario):
    reporte = generar_reporte_grupo(grupo_id, case_version_id, usuario)
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    if reporte["simulacion"] is not None:
        writer.writerow([
            "Estudiante", "Intentos", "Completados", "En progreso", "Salida segura", "Puntaje prom.",
            "Adecuadas", "Riesgosas", "Inadecuadas", "Bitacoras", "Rubricas", "Estado",
        ])
        for e in reporte["simulacion"]["estudiantes"]:
            writer.writerow([
                csv_cell(e["nombre"]),
                e["totalIntentos"],
                e["intentosCompletados"],
                e["intentosEnProgreso"],
                e["intentosSalidaSegura"],
                f"{e['puntajePromedio']:.1f}",
                e["decisionesAdecuadas"],
                e["decisionesRiesgosas"],
                e["decisionesInadecuadas"],
                e["bitacorasRegistradas"],
                e["rubricasAplicadas"],
                csv_cell(e["estado"]),
            ])
    return buffer.getvalue()


# --- Student report (C3) ----------------------------------------------------
STUDENT_REPORT_DEFAULT_LIMIT = 50
STUDENT_REPORT_MAX_LIMIT = 200


def generar_reporte_estudiante(student_id, case_version_id, limit, usuario):
    """Los intentos de un estudiante para su docente o el ADMIN (C3, RF-26, CU-15).

    Un docente solo lee estudiantes de **sus** grupos activos (D-13); el ADMIN, cualquiera.
    ``ordinal`` es el n.º de intento del estudiante en el **caso** (todas sus versiones); el
    tiempo activo sale del acumulador del intento (E1-5). ``coverage`` dice cuántos intentos
    se muestran de cuántos hay con ese filtro («Mostrando X de N»).
    """
    estudiante = User.objects.filter(pk=student_id, role="ESTUDIANTE").first()
    if estudiante is None:
        # BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
        raise NotFound(f"Estudiante no encontrado: {student_id}")
    # None = ADMIN (sin restricción); para el resto, solo los estudiantes de sus grupos activos.
    alcance = student_ids_for_instructor(usuario)
    if alcance is not None and estudiante.id not in alcance:
        raise PermissionDenied("No tienes permiso para ver el reporte de este estudiante")

    limit = max(1, min(limit or STUDENT_REPORT_DEFAULT_LIMIT, STUDENT_REPORT_MAX_LIMIT))
    todos = list(
        SimulationAttempt.objects.filter(student_id=estudiante.id)
        .select_related("case_version__simulation_case")
        .order_by("started_at", "id")
    )
    ordinals, por_caso = {}, {}
    for attempt in todos:
        case_id = attempt.case_version.simulation_case_id
        por_caso[case_id] = por_caso.get(case_id, 0) + 1
        ordinals[attempt.id] = por_caso[case_id]
    visibles = [
        a for a in reversed(todos)  # los más recientes primero
        if case_version_id is None or a.case_version_id == case_version_id
    ]
    mostrados = visibles[:limit]
    return {
        "student": {"ref": IdentityPresenter.student_ref(estudiante.id), "displayName": _nombre_completo(estudiante)},
        "attempts": [
            {
                "attemptId": str(a.id),
                "caseVersionId": a.case_version_id,
                "caseTitle": a.case_version.simulation_case.title,
                "status": a.status,
                "startedAt": a.started_at.isoformat() if a.started_at else None,
                "activeSeconds": int(round(a.active_seconds or 0)),
                "clockSeconds": (
                    int((a.ended_at - a.started_at).total_seconds())
                    if a.started_at and a.ended_at else None
                ),
                "ordinal": ordinals[a.id],
            }
            for a in mostrados
        ],
        "coverage": {"shown": len(mostrados), "total": len(visibles)},
    }
