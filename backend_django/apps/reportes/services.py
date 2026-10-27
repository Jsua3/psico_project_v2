"""Reporting del simulador: dashboard global + reporte por grupo + export CSV.

Extraído de la app legacy ``sesiones`` (T3.2). Todas las métricas son
solo-simulación (SimulationAttempt / AttemptEvent / ReflectionJournal /
RubricEvaluation); se removió la mezcla del quiz legacy. El CSV se devuelve como
string plano (sin envoltorio JSON), con ``.`` decimal y ``,`` delimitador.
"""
import csv
import io
import json
from datetime import datetime, time

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.grupos.models import Grupo, GrupoEstudiante, MembershipStatus
from apps.simulation.assessment import analytics, definitions
from apps.simulation.models.attempt import (
    AttemptEvent,
    AttemptReport,
    AttemptStatus,
    ReflectionJournal,
    SimulationAttempt,
)
from apps.simulation.models.case import CaseVersion
from apps.simulation.models.rubric import EvaluationOrigin, RubricEvaluation
from apps.simulation.services import case_rules
from apps.simulation.services.audit_service import arg, auditable
from apps.simulation.services.instructor_scope import student_ids_for_instructor
from shared.identity import IdentityPresenter

User = get_user_model()

DECISION_EVENT_TYPES = ["DECISION_SELECTED", "PROHIBITED_DECISION_SELECTED"]


def _nombre_completo(user):
    return IdentityPresenter.display_name(user)


def _grupo_student_ids(grupo_id):
    return list(
        GrupoEstudiante.objects.filter(grupo_id=grupo_id, status=MembershipStatus.ACTIVE)
        .values_list("estudiante_id", flat=True)
    )


def _class_counts(events, by=None):
    """Las decisiones registradas de ``events`` contadas por clase de respuesta, en UNA consulta agrupada.

    Agrupa por la clase de la opción (no trae un evento por fila: el costo lo marca la variedad de clases, no el
    historial). Con ``by`` (p. ej. ``"attempt__student_id"``) devuelve ``{valor de by: conteos}``; sin él, un solo conteo.
    Los reintentos no cuentan: son respuestas que el juego no aplicó.
    """
    group = ([by] if by else []) + ["decision_option__response_class"]
    rows = (
        events.filter(event_type__in=DECISION_EVENT_TYPES, decision_option__isnull=False)
        .values(*group).annotate(n=Count("id")).order_by()
    )
    result = {}
    for row in rows:
        counts = result.setdefault(row[by] if by else None, _no_counts())
        counts[row["decision_option__response_class"].lower()] += row["n"]
    return result if by else result.get(None, _no_counts())


def _no_counts():
    return {"recommended": 0, "acceptable": 0, "risky": 0, "contraindicated": 0}


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

    # «Completada» es solo COMPLETED: SAFE_EXITED es una interrupción y la UI la rotula «Interrumpido».
    simulaciones_completadas_hoy = attempts.filter(
        status=AttemptStatus.COMPLETED, ended_at__gte=start_of_day
    ).count()
    simulaciones_en_progreso = attempts.filter(
        status=AttemptStatus.IN_PROGRESS
    ).count()
    simulaciones_completadas = attempts.filter(
        status=AttemptStatus.COMPLETED
    ).count()
    ultimos_intentos = [
        {
            "id": str(a.id),
            "attemptId": str(a.id),
            "casoTitulo": a.case_version.simulation_case.title,
            "estudiante": _nombre_completo(a.student),
            "studentAlias": IdentityPresenter.alias_for(a.student_id, viewer=usuario),
            "estado": a.status,
        }
        for a in attempts.select_related(
            "case_version__simulation_case", "student"
        ).order_by("-started_at")[:10]
    ]
    return {
        "estudiantesActivos": simulaciones_completadas_hoy,
        "simulacionesCompletadasHoy": simulaciones_completadas_hoy,
        "simulacionesCompletadas": simulaciones_completadas,
        "simulacionesEnProgreso": simulaciones_en_progreso,
        # Cuántas respuestas hubo de cada clase: hechos, no una medida de nadie.
        "decisiones": _class_counts(events),
        "ultimosIntentos": ultimos_intentos,
        # Los mismos diez, por fecha de inicio: ningún orden por desempeño.
        "intentosRecientes": list(ultimos_intentos),
    }


# --- Group report ----------------------------------------------------------
def _grupo_del_alcance(grupo_id, usuario):
    """El grupo, si ``usuario`` puede reportarlo: un docente solo los suyos (RF-25) y activos (D-13); el ADMIN, cualquiera."""
    grupo = Grupo.objects.filter(pk=grupo_id).first()
    if not grupo:
        raise NotFound(f"Grupo no encontrado: {grupo_id}")
    if getattr(usuario, "role", None) != "ADMIN":
        if grupo.profesor_id != usuario.id:
            raise PermissionDenied("No tienes permiso para ver el reporte de este grupo")
        if not grupo.activo:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise PermissionDenied("El grupo no está activo: su reporte ya no se genera")
    return grupo


def generar_reporte_grupo(grupo_id, case_version_id, usuario):
    grupo = _grupo_del_alcance(grupo_id, usuario)
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


def _empty_simulation_report(hitos=()):
    return {
        "totalIntentos": 0,
        "intentosCompletados": 0,
        "intentosEnProgreso": 0,
        "intentosEnPausa": 0,
        "intentosSalidaSegura": 0,
        "hitos": [_hito_dto(hito, None) for hito in hitos],
        "bitacorasRegistradas": 0,
        "rubricasAplicadas": 0,
        "estudiantes": [],
    }


# BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
COBERTURA_EN_PALABRAS = {
    analytics.MAJORITY: "La mayoría lo cumplió",
    analytics.LESS_THAN_HALF: "Menos de la mitad",
    None: "—",
}


def _hito_dto(hito, coverage):
    """Un hito declarado y su cobertura en el grupo; ``coverage`` es ``None`` si la celda mínima lo suprime.

    Con menos de 20 estudiantes solo viaja la categoría (sin conteo ni porcentaje al lado); con 20 o más, además
    ``porcentaje``. Suprimido, ``cobertura`` es nulo y no hay otra clave que lo delate.
    """
    dto = {"key": hito.key, "label": hito.label, "decisive": hito.decisive,
           "cobertura": coverage["category"] if coverage else None}
    if coverage and coverage["percent"] is not None:
        dto["porcentaje"] = coverage["percent"]
    return dto


def _hitos_cumplidos(raw):
    """Las claves de los hitos cumplidos de un reporte congelado v3, o ``None`` si no los trae (v1, v2 o ilegible)."""
    try:
        report = json.loads(raw)
    except (TypeError, ValueError):
        return None
    milestones = report.get("milestones") if isinstance(report, dict) else None
    done = milestones.get("done") if isinstance(milestones, dict) else None
    if not isinstance(done, list):
        return None
    return [entry["key"] for entry in done if isinstance(entry, dict) and isinstance(entry.get("key"), str)]


def _hitos_del_grupo(case_version_id, student_ids):
    """``(hitos declarados, [(estudiante, claves)] de cada intento completado con hitos, última lista por estudiante)``.

    Solo cuentan los intentos COMPLETADOS con reporte congelado v3: un reporte anterior no trae hitos y no es un
    «no cumplió». Una consulta; el último intento de cada estudiante es el de inicio más reciente.
    """
    version = CaseVersion.objects.filter(pk=case_version_id).first()
    declared = case_rules.rules_of(version).milestones if version is not None else ()
    rows = (
        AttemptReport.objects.filter(
            attempt__case_version_id=case_version_id, attempt__student_id__in=student_ids,
            attempt__status=AttemptStatus.COMPLETED,
        )
        .order_by("attempt__started_at", "attempt_id")
        .values_list("attempt__student_id", "report_json")
    )
    attempts, latest = [], {}
    for student_id, raw in rows:
        done = _hitos_cumplidos(raw)
        if done is not None:
            attempts.append((student_id, done))
            latest[student_id] = done  # el orden ascendente deja al final el más reciente
    return declared, attempts, latest


def _build_simulation_report(grupo, case_version_id):
    student_ids = _grupo_student_ids(grupo.id)
    if not student_ids:
        return _empty_simulation_report(_hitos_del_grupo(case_version_id, [])[0])

    attempts = list(
        SimulationAttempt.objects.filter(
            case_version_id=case_version_id, student_id__in=student_ids
        ).order_by("-started_at")
    )
    declared, completed, latest = _hitos_del_grupo(case_version_id, student_ids)
    if not attempts:
        return _empty_simulation_report(declared)

    completados = sum(1 for a in attempts if a.status == AttemptStatus.COMPLETED)
    en_progreso = sum(1 for a in attempts if a.status == AttemptStatus.IN_PROGRESS)
    en_pausa = sum(1 for a in attempts if a.status == AttemptStatus.PAUSED)
    safe_exit_ids = _safe_exit_attempt_ids(attempts)

    attempt_ids = [a.id for a in attempts]
    by_student = {}
    for a in attempts:
        by_student.setdefault(a.student_id, []).append(a)
    classes = _class_counts(AttemptEvent.objects.filter(attempt_id__in=attempt_ids), by="attempt__student_id")
    coverage = analytics.milestone_coverage(
        completed, [hito.key for hito in declared], max(definitions.MIN_CELL_FLOOR, definitions.min_cell_size())
    )

    students = list(User.objects.filter(id__in=student_ids))
    estudiantes = [
        _estudiante_sim_dto(
            st, by_student.get(st.id, []), safe_exit_ids, clases=classes.get(st.id), hitos_cumplidos=latest.get(st.id)
        )
        for st in students
    ]
    # Por nombre y nada más: ningún listado ordena a las personas por su desempeño.
    estudiantes.sort(key=lambda e: e["nombre"])

    return {
        "totalIntentos": len(attempts),
        "intentosCompletados": completados,
        "intentosEnProgreso": en_progreso,
        "intentosEnPausa": en_pausa,
        "intentosSalidaSegura": len(safe_exit_ids),
        "hitos": [_hito_dto(hito, coverage[hito.key] if coverage else None) for hito in declared],
        "bitacorasRegistradas": _count_reflections(attempt_ids),
        "rubricasAplicadas": _count_rubrics(attempt_ids),
        "estudiantes": estudiantes,
    }


def _estudiante_sim_dto(student, attempts, safe_exit_ids=None, clases=None, hitos_cumplidos=None):
    """Un estudiante en el reporte de su docente: hechos de sus intentos, sus hitos y cuántas respuestas de cada clase dio.

    ``hitos_cumplidos`` son las claves del último intento completado con reporte v3 (``None`` si no tiene): el docente
    ve a SUS estudiantes, así que aquí no hay celda mínima. Sin puntaje ni promedio de nada.
    """
    if safe_exit_ids is None:
        safe_exit_ids = _safe_exit_attempt_ids(attempts)
    completados = sum(1 for a in attempts if a.status == AttemptStatus.COMPLETED)
    en_progreso = sum(1 for a in attempts if a.status == AttemptStatus.IN_PROGRESS)
    en_pausa = sum(1 for a in attempts if a.status == AttemptStatus.PAUSED)
    salida_segura = sum(1 for a in attempts if a.id in safe_exit_ids)
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
        "clases": clases if clases is not None else _no_counts(),
        "hitosCumplidos": hitos_cumplidos,
        "bitacorasRegistradas": _count_reflections(attempt_ids),
        "rubricasAplicadas": _count_rubrics(attempt_ids),
        "estado": estado,
    }


# --- Learning analytics (C13) ----------------------------------------------
def _analytics_scope(grupo_id, usuario):
    """Los estudiantes cuyos intentos puede agregar ``usuario``: ``None`` = todos (ADMIN sin grupo), si no, sus ids."""
    if grupo_id is not None:
        return _grupo_student_ids(_grupo_del_alcance(grupo_id, usuario).id)
    return student_ids_for_instructor(usuario)


def _analytics_audit_context(args, kwargs, result):
    """Qué se consultó, nunca a quién: el grupo, la versión y si la respuesta salió suprimida (sin ids ni cifras)."""
    return {
        "groupId": arg(args, kwargs, 0, "grupo_id"),
        "caseVersionId": arg(args, kwargs, 1, "case_version_id"),
        "suppressed": result["cohort"]["suppressed"],
    }


@auditable("ANALYTICS_VIEWED", "ANALYTICS", -1, context=_analytics_audit_context)
def generar_analitica(grupo_id, case_version_id, usuario):
    """Los agregados de aprendizaje (RQ-NEG-001 a 005, C13) del alcance de ``usuario``, con celda mínima por bloque.

    Un docente agrega solo a los estudiantes de sus grupos activos con membresía ACTIVE (RF-25); con ``grupo_id``, ese
    grupo debe ser suyo y estar activo (403) y existir (404). El ADMIN agrega a cualquiera, con la MISMA celda mínima.
    Cada consulta buena se audita (``analitica.ver``) sin ids de estudiantes.
    """
    scope = _analytics_scope(grupo_id, usuario)
    declared = None  # varias versiones: el bloque de hitos lista los observados, por clave
    if case_version_id is not None:
        version = CaseVersion.objects.filter(pk=case_version_id).first()
        if version is None:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise NotFound(f"Versión de caso no encontrada: {case_version_id}")
        declared = [(m.key, m.label, m.decisive) for m in case_rules.rules_of(version).milestones]
    return analytics.compute(
        analytics.load_rows(scope, case_version_id),
        milestones=declared,
        min_cell=definitions.min_cell_size(),
        acceptable_level=definitions.acceptable_level(),
        reflection_definition=definitions.reflection_definition(),
        profile_rules=definitions.PROFILE_RULES,
        survey_enabled=definitions.survey_enabled(),
    )


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
    """El reporte del grupo en CSV: un renglón por estudiante y una columna por hito, más la cobertura del grupo.

    La columna de cada hito dice «Sí» o «No» por estudiante (su último intento completado con hitos; vacía si no tiene):
    el docente ve a sus propios estudiantes. El último renglón, «Cobertura del grupo», trae por hito la cobertura en
    palabras —«La mayoría lo cumplió», «Menos de la mitad» o «—» si la celda mínima la suprime— y, con 20 estudiantes
    o más, el porcentaje entre paréntesis. Sin puntaje, promedio ni orden por desempeño (los estudiantes van por nombre).
    """
    reporte = generar_reporte_grupo(grupo_id, case_version_id, usuario)
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    simulacion = reporte["simulacion"]
    if simulacion is not None:
        hitos = simulacion["hitos"]
        writer.writerow([
            "Estudiante", "Intentos", "Completados", "En progreso", "Salida segura",
            "Recomendadas", "Aceptables", "Con riesgo", "Contraindicadas", "Bitacoras", "Rubricas", "Estado",
            *[csv_cell(hito["label"]) for hito in hitos],
        ])
        for e in simulacion["estudiantes"]:
            cumplidos = e["hitosCumplidos"]
            writer.writerow([
                csv_cell(e["nombre"]),
                e["totalIntentos"],
                e["intentosCompletados"],
                e["intentosEnProgreso"],
                e["intentosSalidaSegura"],
                e["clases"]["recommended"],
                e["clases"]["acceptable"],
                e["clases"]["risky"],
                e["clases"]["contraindicated"],
                e["bitacorasRegistradas"],
                e["rubricasAplicadas"],
                csv_cell(e["estado"]),
                *[("" if cumplidos is None else "Sí" if hito["key"] in cumplidos else "No") for hito in hitos],
            ])
        if hitos and simulacion["estudiantes"]:
            writer.writerow([
                "Cobertura del grupo", *[""] * 11,
                *[
                    csv_cell(COBERTURA_EN_PALABRAS[hito["cobertura"]]) + (
                        f" ({hito['porcentaje']} %)" if "porcentaje" in hito else ""
                    )
                    for hito in hitos
                ],
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
