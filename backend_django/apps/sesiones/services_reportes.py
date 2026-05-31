"""Mirrors Spring ReporteService 1:1 (domain/reporte/ReporteService.java).

Blends legacy quiz data (sesiones_juego / respuestas) with simulation data
(simulation_attempts_v2 / attempt_events / reflection_journals /
rubric_evaluations). Dashboard aggregates are GLOBAL; the group report is scoped
to a grupo's students. CSV export returns a plain string (no JSON envelope) and
replicates Spring's manual ``String.format`` layout byte-for-byte (US-style
``.`` decimals, ``,`` delimiters, trailing ``\n`` per line — no csv quoting).
"""
from datetime import datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models import Avg
from django.utils import timezone
from rest_framework.exceptions import NotFound

from apps.grupos.models import Grupo
from apps.simulation.models.attempt import (
    AttemptEvent,
    ReflectionJournal,
    SimulationAttempt,
)
from apps.simulation.models.rubric import RubricEvaluation

from .models import SesionJuego

User = get_user_model()

DECISION_EVENT_TYPES = ["DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED"]
SCORED_STATUSES = ["COMPLETED", "SAFE_EXITED"]


def _nombre_completo(user):
    return f"{user.nombre} {user.apellido}"


def _grupo_student_ids(grupo_id):
    with connection.cursor() as cur:
        cur.execute(
            "SELECT estudiante_id FROM grupo_estudiante WHERE grupo_id = %s", [grupo_id]
        )
        return [row[0] for row in cur.fetchall()]


def _count_decisions(attempt_ids, classification):
    if not attempt_ids:
        return 0
    return AttemptEvent.objects.filter(
        attempt_id__in=attempt_ids,
        event_type__in=DECISION_EVENT_TYPES,
        decision_option__classification=classification,
    ).count()


def _count_reflections(attempt_ids):
    if not attempt_ids:
        return 0
    return ReflectionJournal.objects.filter(attempt_id__in=attempt_ids).count()


def _count_rubrics(attempt_ids):
    if not attempt_ids:
        return 0
    return (
        RubricEvaluation.objects.filter(attempt_id__in=attempt_ids)
        .values("attempt_id")
        .distinct()
        .count()
    )


# --- Dashboard -------------------------------------------------------------
def get_dashboard():
    start_of_day = datetime.combine(timezone.now().date(), time.min)

    sesiones_completadas_hoy = SesionJuego.objects.filter(
        completado=True,
        fecha_fin__gte=start_of_day,
        fecha_fin__lt=start_of_day + timedelta(days=1),
    ).count()
    simulaciones_completadas_hoy = SimulationAttempt.objects.filter(
        status__in=SCORED_STATUSES, ended_at__gte=start_of_day
    ).count()
    simulaciones_en_progreso = SimulationAttempt.objects.filter(
        status="IN_PROGRESS"
    ).count()
    simulaciones_completadas = SimulationAttempt.objects.filter(
        status__in=SCORED_STATUSES
    ).count()

    avg_legacy = float(
        SesionJuego.objects.filter(completado=True).aggregate(a=Avg("puntaje_total"))["a"]
        or 0
    )
    avg_sim = float(
        SimulationAttempt.objects.filter(status__in=SCORED_STATUSES).aggregate(
            a=Avg("accumulated_score")
        )["a"]
        or 0
    )

    ultimas_sesiones = [
        {
            "id": s.id,
            "casoTitulo": s.caso.titulo,
            "estudiante": _nombre_completo(s.estudiante),
            "puntaje": s.puntaje_total,
            "completado": s.completado,
        }
        for s in SesionJuego.objects.filter(completado=True)
        .select_related("caso", "estudiante")
        .order_by("-fecha_fin")[:10]
    ]

    ultimos_intentos = [
        {
            "id": str(a.id),
            "casoTitulo": a.case_version.simulation_case.title,
            "estudiante": _nombre_completo(a.student),
            "puntaje": a.accumulated_score,
            "estado": a.status,
        }
        for a in SimulationAttempt.objects.select_related(
            "case_version__simulation_case", "student"
        ).order_by("-started_at")[:10]
    ]

    intentos_recientes = [
        {
            "id": f"legacy-{s['id']}",
            "casoTitulo": s["casoTitulo"],
            "estudiante": s["estudiante"],
            "puntaje": s["puntaje"],
            "estado": "COMPLETADO" if s["completado"] else "EN_PROGRESO",
            "origen": "LEGACY",
        }
        for s in ultimas_sesiones
    ] + [
        {
            "id": a["id"],
            "casoTitulo": a["casoTitulo"],
            "estudiante": a["estudiante"],
            "puntaje": a["puntaje"],
            "estado": a["estado"],
            "origen": "SIMULATION",
        }
        for a in ultimos_intentos
    ]
    intentos_recientes = sorted(
        intentos_recientes, key=lambda x: x["puntaje"], reverse=True
    )[:10]

    return {
        "estudiantesActivos": sesiones_completadas_hoy + simulaciones_completadas_hoy,
        "casosCompletadosHoy": simulaciones_completadas_hoy,
        "puntajePromedioGlobal": avg_sim if avg_sim > 0 else avg_legacy,
        "ultimasSesiones": ultimas_sesiones,
        "simulacionesCompletadas": simulaciones_completadas,
        "simulacionesEnProgreso": simulaciones_en_progreso,
        "puntajePromedioSimulacion": avg_sim,
        "decisionesAdecuadas": AttemptEvent.objects.filter(
            event_type__in=DECISION_EVENT_TYPES,
            decision_option__classification="ADEQUATE",
        ).count(),
        "decisionesRiesgosas": AttemptEvent.objects.filter(
            event_type__in=DECISION_EVENT_TYPES,
            decision_option__classification="RISKY",
        ).count(),
        "decisionesInadecuadas": AttemptEvent.objects.filter(
            event_type__in=DECISION_EVENT_TYPES,
            decision_option__classification="INADEQUATE",
        ).count(),
        "decisionesProhibidas": AttemptEvent.objects.filter(
            event_type="PROHIBITED_DECISION_SELECTED"
        ).count(),
        "ultimosIntentos": ultimos_intentos,
        "intentosRecientes": intentos_recientes,
    }


# --- Group report ----------------------------------------------------------
def generar_reporte_grupo(grupo_id, caso_id, case_version_id):
    grupo = Grupo.objects.filter(pk=grupo_id).first()
    if not grupo:
        raise NotFound(f"Grupo no encontrado: {grupo_id}")

    legacy = _build_legacy_report(grupo_id, caso_id)
    simulacion = (
        _build_simulation_report(grupo, case_version_id)
        if case_version_id is not None
        else None
    )

    return {
        "grupoId": legacy["grupoId"],
        "casoId": legacy["casoId"],
        "caseVersionId": case_version_id,
        "totalSesiones": legacy["totalSesiones"],
        "puntajePromedio": legacy["puntajePromedio"],
        "tasaAciertos": legacy["tasaAciertos"],
        "tiempoPromedioMs": legacy["tiempoPromedioMs"],
        "estudiantes": legacy["estudiantes"],
        "simulacion": simulacion,
    }


def _empty_legacy(grupo_id, caso_id):
    return {
        "grupoId": grupo_id,
        "casoId": caso_id,
        "totalSesiones": 0,
        "puntajePromedio": 0.0,
        "tasaAciertos": 0.0,
        "tiempoPromedioMs": 0,
        "estudiantes": [],
    }


def _build_legacy_report(grupo_id, caso_id):
    if caso_id is None:
        return _empty_legacy(grupo_id, None)

    student_ids = _grupo_student_ids(grupo_id)
    sesiones = list(
        SesionJuego.objects.filter(
            estudiante_id__in=student_ids, caso_id=caso_id, completado=True
        )
        .select_related("estudiante")
        .prefetch_related("respuestas")
    )
    if not sesiones:
        return _empty_legacy(grupo_id, caso_id)

    puntaje_promedio = sum(s.puntaje_total for s in sesiones) / len(sesiones)

    all_resp = [r for s in sesiones for r in s.respuestas.all()]
    total_resp = len(all_resp)
    correctas = sum(1 for r in all_resp if r.es_correcta)
    tasa_aciertos = (correctas / total_resp * 100) if total_resp > 0 else 0.0
    tiempos = [r.tiempo_respuesta_ms for r in all_resp if r.tiempo_respuesta_ms is not None]
    tiempo_promedio = (sum(tiempos) / len(tiempos)) if tiempos else 0.0

    estudiantes = []
    for s in sesiones:
        resp = list(s.respuestas.all())
        total = len(resp)
        corr = sum(1 for r in resp if r.es_correcta)
        s_tiempos = [r.tiempo_respuesta_ms for r in resp if r.tiempo_respuesta_ms is not None]
        tiempo = (sum(s_tiempos) / len(s_tiempos)) if s_tiempos else 0.0
        estudiantes.append(
            {
                "id": s.estudiante_id,
                "nombre": _nombre_completo(s.estudiante),
                "puntaje": s.puntaje_total,
                "porcentajeAciertos": (corr / total * 100) if total > 0 else 0.0,
                "tiempoPromedioMs": float(tiempo),
                "estado": "COMPLETADO" if s.completado else "EN_PROGRESO",
            }
        )

    return {
        "grupoId": grupo_id,
        "casoId": caso_id,
        "totalSesiones": len(sesiones),
        "puntajePromedio": float(puntaje_promedio),
        "tasaAciertos": float(tasa_aciertos),
        "tiempoPromedioMs": int(tiempo_promedio),  # Spring casts (long)
        "estudiantes": estudiantes,
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

    completados = sum(1 for a in attempts if a.status == "COMPLETED")
    en_progreso = sum(1 for a in attempts if a.status == "IN_PROGRESS")
    salida_segura = sum(1 for a in attempts if a.status == "SAFE_EXITED")
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
        _estudiante_sim_dto(st, by_student.get(st.id, [])) for st in students
    ]
    estudiantes.sort(key=lambda e: e["nombre"])

    return {
        "totalIntentos": len(attempts),
        "intentosCompletados": completados,
        "intentosEnProgreso": en_progreso,
        "intentosSalidaSegura": salida_segura,
        "puntajePromedio": float(puntaje_promedio),
        "decisionesAdecuadas": _count_decisions(attempt_ids, "ADEQUATE"),
        "decisionesRiesgosas": _count_decisions(attempt_ids, "RISKY"),
        "decisionesInadecuadas": _count_decisions(attempt_ids, "INADEQUATE"),
        "bitacorasRegistradas": _count_reflections(attempt_ids),
        "rubricasAplicadas": _count_rubrics(attempt_ids),
        "estudiantes": estudiantes,
    }


def _estudiante_sim_dto(student, attempts):
    completados = sum(1 for a in attempts if a.status == "COMPLETED")
    en_progreso = sum(1 for a in attempts if a.status == "IN_PROGRESS")
    salida_segura = sum(1 for a in attempts if a.status == "SAFE_EXITED")
    scored = [a for a in attempts if a.status in SCORED_STATUSES]
    puntaje = sum(a.accumulated_score for a in scored) / len(scored) if scored else 0.0
    attempt_ids = [a.id for a in attempts]

    if en_progreso > 0:
        estado = "EN_PROGRESO"
    elif completados > 0:
        estado = "COMPLETADO"
    elif salida_segura > 0:
        estado = "SAFE_EXITED"
    else:
        estado = "PENDIENTE"

    return {
        "id": student.id,
        "nombre": _nombre_completo(student),
        "totalIntentos": len(attempts),
        "intentosCompletados": completados,
        "intentosEnProgreso": en_progreso,
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
def exportar_csv(grupo_id, caso_id, case_version_id):
    reporte = generar_reporte_grupo(grupo_id, caso_id, case_version_id)
    parts = []
    if reporte["simulacion"] is not None:
        parts.append(
            "Estudiante,Intentos,Completados,En progreso,Salida segura,Puntaje prom.,"
            "Adecuadas,Riesgosas,Inadecuadas,Bitacoras,Rubricas,Estado\n"
        )
        for e in reporte["simulacion"]["estudiantes"]:
            parts.append(
                "{},{},{},{},{},{:.1f},{},{},{},{},{},{}\n".format(
                    e["nombre"],
                    e["totalIntentos"],
                    e["intentosCompletados"],
                    e["intentosEnProgreso"],
                    e["intentosSalidaSegura"],
                    e["puntajePromedio"],
                    e["decisionesAdecuadas"],
                    e["decisionesRiesgosas"],
                    e["decisionesInadecuadas"],
                    e["bitacorasRegistradas"],
                    e["rubricasAplicadas"],
                    e["estado"],
                )
            )
        return "".join(parts)

    parts.append("Estudiante,Puntaje,% Aciertos,Tiempo Promedio (ms),Estado\n")
    for e in reporte["estudiantes"]:
        parts.append(
            "{},{},{:.1f},{:.0f},{}\n".format(
                e["nombre"],
                e["puntaje"],
                e["porcentajeAciertos"],
                e["tiempoPromedioMs"],
                e["estado"],
            )
        )
    return "".join(parts)
