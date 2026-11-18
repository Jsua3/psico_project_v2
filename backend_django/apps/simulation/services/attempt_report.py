"""Reporte congelado del intento (E1-8, RF-22, RF-23, CU-12, TD-08, N2).

Al completarse un intento se persiste, dentro de la misma transacción, **un** reporte
inmutable (``AttemptReport``). Es un superconjunto del reporte de cierre de siempre
(``game_dtos.build_completion_report``: el frontend actual no cambia) con lo que añade
E1-8: ``schemaVersion``, ``ordinal``, ``definitionHash``, ``decisionReview[]``,
``reflections[]`` (sin el texto de la bitácora) y ``timeByScene``. Lo leen el reporte del
intento, el del estudiante y el historial; leer no escribe. Un intento completado antes
de E1-8 no tiene fila: se sirve en vivo (sin persistirlo) y ``backfill_attempt_reports``
lo congela.

E6-1d (``schemaVersion 2``) añade el perfil por competencia (``competencyLevels``), ``nonRecommendedCount``,
``reflectionCoverage`` y ``keyLearningEvidence``: se calculan UNA vez, al cerrar, con la rúbrica, el catálogo y los
efectos de ese momento, y no se recalculan (un reporte cerrado no cambia). Un reporte v1 sigue siendo v1: se lee tal
cual, sin las claves nuevas.

``schemaVersion 3`` (modelo de métricas) retira lo numérico y lo heurístico: sin ``finalScore``, ``finalStress``,
``metrics``, ``competencies`` ni conteos por clasificación; con ``milestones {done[], missing[]}``, ``persona``,
``ending`` con ``reason``, ``decisionReview[].class``, ``counts`` por clase de respuesta y ``competencyLevels[].evidence[]``.
Las recomendaciones salen solo de hitos faltantes y competencias en inicio (más lo reconsiderado y retomar con
acompañamiento). Un reporte v1 o v2 cerrado no se recalcula ni se reescribe: sus bytes quedan como se guardaron y el
docente, el ADMIN y la analítica los leen tal cual. Al ESTUDIANTE se le sirve una proyección de solo lectura
(``for_student``) sin las claves del modelo numérico viejo: la regla «ninguna cifra al estudiante» es del contrato HTTP
(I-2, R-17).

``schemaVersion 4`` (x-siep 2.1) añade a cada ``decisionReview[]`` la lista ``missed``: las respuestas de esa escena que no
se ofrecieron al estudiante porque le faltaba explorar algo, cada una ``{optionId, text, class, missing[{kind, key,
label}]}`` (lista vacía si se le ofrecieron todas). Sale del evento de contabilidad ``OPTIONS_NOT_OFFERED``, que el juego
guarda justo antes de cada decisión registrada y que no aparece en la línea de tiempo. Un reporte v3 o anterior se lee
tal cual, sin ``missed``.
"""
import hashlib
import json
import logging

from django.db import transaction
from django.db.models import Q

from shared.jsonutils import read_map

from apps.simulation.casedef.vocabulary import ResponseClass
from apps.simulation.serializers import game_dtos as dto

from apps.simulation.assessment import competencies as assessment_competencies
from apps.simulation.assessment import definitions, evidence
from apps.simulation.assessment import evaluation as system_evaluation

from ..models import (
    REGISTERED_DECISION_EVENT_TYPES,
    RETRY_EVENT_TYPES,
    AttemptEvent,
    AttemptReport,
    AttemptStatus,
    CaseVersion,
    DecisionOption,
    DialogueChoice,
    FormativeLevel,
    ClinicalTool,
    MapObject,
    ReflectionJournal,
    SceneMap,
    SimulationAttempt,
    SimulationNode,
)
from . import attempt_duration, case_rules, case_state
from .option_availability import OPTIONS_NOT_OFFERED

logger = logging.getLogger(__name__)

#: 1 = E1-8; 2 = E6-1d (perfil por competencia, no recomendadas, cobertura, evidencia); 3 = modelo de métricas
#: (hitos, persona, clases de respuesta; sin puntaje, estrés ni competencias heurísticas); 4 = x-siep 2.1 (lo que el
#: estudiante no llegó a ver, ``decisionReview[].missed``).
REPORT_SCHEMA_VERSION = 4


#: Las claves del modelo numérico viejo (puntaje, estrés, métricas, estado clínico, deltas, conteos por severidad y el
#: final de entonces). Un reporte v1/v2 cerrado las guarda y no se reescribe; ``for_student`` las quita, en cualquier
#: nivel, de lo que se sirve al estudiante. La prueba ``test_no_numbers_to_student`` lleva su propia copia escrita a mano
#: y la compara con esta: si una clave se añade aquí, la prueba obliga a añadirla allá.
RETIRED_KEYS = frozenset({
    "accumulatedScore", "stressIndex", "metrics", "clinicalState", "scoreDelta", "stressDelta", "finalScore",
    "finalStress", "adequateDecisions", "riskyDecisions", "inadequateDecisions", "prohibitedDecisions",
    "trustDelta", "victimRiskDelta", "victimRisk", "userTrust", "sceneStress", "professionalScore",
    "revictimizationRisk",
    # ``ending`` del motor viejo: las métricas, las banderas y los conteos por severidad del caso.
    "caseMetrics", "caseFlags", "severityCounts",
})

#: Bloques de nivel superior que un reporte anterior a la v3 llena con conteos por severidad (``counts``: adecuadas,
#: con riesgo, inadecuadas, prohibidas…). El ``counts`` de la v3 es otra cosa (hechos por clase) y se queda.
RETIRED_BLOCKS_BEFORE_V3 = frozenset({"counts"})


def _without_retired(value):
    if isinstance(value, dict):
        return {key: _without_retired(child) for key, child in value.items() if key not in RETIRED_KEYS}
    if isinstance(value, list):
        return [_without_retired(child) for child in value]
    return value


def for_student(report):
    """El reporte tal como lo lee el ESTUDIANTE (I-2, R-17): una proyección de solo lectura.

    Un reporte ``schemaVersion >= 3`` (o ``None``) se devuelve igual. Uno v1/v2 se devuelve como una COPIA sin las
    ``RETIRED_KEYS`` (a cualquier profundidad) ni los bloques de conteos por severidad: no toca el diccionario recibido
    ni lo guardado. El docente y la analítica no pasan por aquí.
    """
    version = report.get("schemaVersion", 1) if isinstance(report, dict) else None
    if version is None or (isinstance(version, int) and not isinstance(version, bool) and version >= 3):
        return report
    projected = _without_retired(report)
    for block in RETIRED_BLOCKS_BEFORE_V3:
        projected.pop(block, None)
    return projected


def load_events(attempt_id):
    """Los eventos del intento en orden, con lo que el reporte lee de cada uno."""
    return list(
        AttemptEvent.objects.filter(attempt_id=attempt_id)
        .select_related("node", "decision_option__target_node")
        .order_by("occurred_at", "id")
    )


def case_definition_hash(case_version_id):
    """Huella (sha256) de la definición del caso tal como está ahora: grafo, textos, clases, efectos y reglas.

    Mira la clase de respuesta, los efectos, las reglas y la intensidad de cada escena; ya no las columnas retiradas
    (clasificación, puntaje, estrés, penalización y conducta prohibida). La huella de un reporte v1 o v2 ya cerrado
    no se recalcula.

    Es la «versión» con la que se cerró el intento: si después cambia cualquier texto o efecto,
    el reporte guarda la huella de lo que la persona vio.
    """
    rules = CaseVersion.objects.filter(pk=case_version_id).values_list("rules", flat=True).first()
    nodes = list(
        SimulationNode.objects.filter(case_version_id=case_version_id)
        .order_by("node_key")
        .values_list(
            "node_key", "title", "narrative", "start_node", "terminal_node", "sensitive_content", "intensity",
        )
    )
    options = list(
        DecisionOption.objects.filter(case_version_id=case_version_id)
        .order_by("option_key")
        .values_list(
            "option_key", "source_node__node_key", "target_node__node_key", "text", "response_class",
            "immediate_feedback", "consequence_text", "theory_basis", "feedback_text", "effects",
        )
    )
    canonical = json.dumps(
        {"nodes": nodes, "options": options, "rules": read_map(rules)},
        sort_keys=True, ensure_ascii=False, separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def attempt_ordinal(attempt):
    """N.º de intento del estudiante en el **caso** (todas sus versiones), contando este (R10)."""
    return SimulationAttempt.objects.filter(
        student_id=attempt.student_id,
        case_version__simulation_case_id=attempt.case_version.simulation_case_id,
    ).filter(
        Q(started_at__lt=attempt.started_at) | Q(started_at=attempt.started_at, id__lte=attempt.id)
    ).count()


def _read_not_offered(detail):
    """``[(id de la opción, [(tipo, clave), …]), …]`` del detalle de un evento ``OPTIONS_NOT_OFFERED``; ilegible → ``[]``."""
    try:
        data = json.loads(detail or "")
    except (TypeError, ValueError):
        return []
    entries = data.get("options") if isinstance(data, dict) else None
    if not isinstance(entries, list):
        return []
    found = []
    for entry in entries:
        if not isinstance(entry, dict) or isinstance(entry.get("id"), bool) or not isinstance(entry.get("id"), int):
            continue
        raw = entry.get("unmet") if isinstance(entry.get("unmet"), list) else []
        unmet = [
            (fact[0], fact[1]) for fact in raw
            if isinstance(fact, list) and len(fact) == 2 and all(isinstance(part, str) for part in fact)
        ]
        found.append((entry["id"], unmet))
    return found


def missed_labels(version_id, pending):
    """Las etiquetas de lo que faltó, ``{(nodo, tipo, clave): etiqueta}``: una consulta por tipo de entidad, no por opción.

    ``pending`` es ``{nodo: [(id de opción, [(tipo, clave), …]), …]}``. Un objeto o una persona toma la etiqueta del objeto
    del mapa del nodo, un personaje de ambiente su nombre y una herramienta su etiqueta; sin hallarla, la clave.
    """
    wanted = {(node_id, kind, key) for node_id, entries in pending.items() for _, unmet in entries for kind, key in unmet}
    if not wanted:
        return {}
    nodes = {node_id for node_id, _, _ in wanted}
    kinds = {kind for _, kind, _ in wanted}
    object_labels, ambient_labels, tool_labels = {}, {}, {}
    if kinds & {"inspected", "talked"}:
        for node_id, key, label in MapObject.objects.filter(scene_map__node_id__in=nodes).values_list(
            "scene_map__node_id", "object_key", "label"
        ):
            object_labels[(node_id, key)] = label
    if "talked" in kinds:
        for node_id, ambient in SceneMap.objects.filter(node_id__in=nodes).values_list("node_id", "ambient_json"):
            npcs = read_map(ambient).get("ambientNpcs")
            for npc in npcs if isinstance(npcs, list) else []:
                if isinstance(npc, dict) and isinstance(npc.get("key"), str):
                    name = next(
                        (npc[f] for f in ("name", "label", "displayName") if isinstance(npc.get(f), str) and npc[f]), None
                    )
                    ambient_labels[(node_id, npc["key"])] = name or npc["key"]
    if kinds & {"has", "used"}:
        tool_labels = dict(
            ClinicalTool.objects.filter(case_version_id=version_id).values_list("tool_code", "label")
        )
    labels = {}
    for node_id, kind, key in wanted:
        if kind == "inspected":
            label = object_labels.get((node_id, key))
        elif kind == "talked":
            label = object_labels.get((node_id, key)) or ambient_labels.get((node_id, key))
        else:  # has / used: herramientas
            label = tool_labels.get(key)
        labels[(node_id, kind, key)] = label or key
    return labels


def _missed_for(entries, options, labels):
    """``missed`` de una decisión: las opciones no ofrecidas de su escena, con lo que faltó explorar."""
    missed = []
    for option_id, unmet in entries:
        option = options.get(option_id)
        if option is None:
            continue
        missed.append({
            "optionId": option.id,
            "text": option.text,
            "class": case_state.response_class_of(option).value,
            "missing": [
                {"kind": kind, "key": key, "label": labels.get((option.source_node_id, kind, key), key)}
                for kind, key in unmet
            ],
        })
    return missed


def _missed_by_decision(events):
    """``{id del evento de la decisión: [(opción, faltas)]}``: a cada decisión registrada, lo que el último
    ``OPTIONS_NOT_OFFERED`` anterior de su mismo nodo dijo que no se ofreció."""
    pending = {}
    claimed = {}
    for ev in events:
        if ev.event_type == OPTIONS_NOT_OFFERED and ev.node_id:
            pending[ev.node_id] = _read_not_offered(ev.detail)
        elif ev.decision_option_id and ev.event_type in REGISTERED_DECISION_EVENT_TYPES:
            claimed[ev.id] = pending.pop(ev.node_id, [])
    return claimed


def _choice_labels(option_ids):
    """``{id de opción: texto corto}``: lo que dice el botón de la elección de diálogo que ofrece la opción (V4).

    Es lo que la estudiante pulsó; si varias elecciones la ofrecen, la primera por orden. Sin elección, no hay entrada.
    """
    if not option_ids:
        return {}
    labels = {}
    rows = (
        DialogueChoice.objects.filter(decision_option_id__in=option_ids)
        .order_by("display_order", "id")
        .values_list("decision_option_id", "text")
    )
    for option_id, text in rows:
        if text and text.strip():
            labels.setdefault(option_id, text.strip())
    return labels


def build_decision_review(events):
    """``decisionReview[]``: una entrada por decisión registrada, en el orden en que ocurrieron.

    Cada una lleva ``missed``; sin evento ``OPTIONS_NOT_OFFERED`` (o con uno ilegible) es ``[]``. ``chosen.label`` es el
    texto corto del botón que se pulsó, cuando el caso lo trae y no es igual al de la opción (V4: «Elegiste:»).
    """
    claimed = _missed_by_decision(events)
    option_ids = {option_id for entries in claimed.values() for option_id, _ in entries}
    options = DecisionOption.objects.in_bulk(option_ids) if option_ids else {}
    by_node = {}
    version_id = None
    for ev in events:
        if claimed.get(ev.id):
            by_node.setdefault(ev.node_id, []).extend(claimed[ev.id])
            version_id = version_id or ev.node.case_version_id
    labels = missed_labels(version_id, by_node)
    review = []
    choice_labels = _choice_labels({ev.decision_option_id for ev in events if ev.decision_option_id})
    first_answers = {}  # nodo → primera respuesta que el juego no aplicó (reintento)
    for ev in events:
        if not ev.decision_option_id:
            continue
        if ev.event_type in RETRY_EVENT_TYPES:
            first_answers.setdefault(ev.node_id, ev.decision_option)
            continue
        if ev.event_type not in REGISTERED_DECISION_EVENT_TYPES:
            continue
        option = ev.decision_option
        response_class = case_state.response_class_of(option)
        feedback = {"explanation": option.feedback_text or option.immediate_feedback or ""}
        if option.theory_basis:
            feedback["theoryBasis"] = option.theory_basis
        item = {
            "order": len(review) + 1,
            "nodeId": ev.node_id,
            "nodeTitle": ev.node.title if ev.node_id else "",
            "chosen": {"optionId": option.id, "text": option.text},
            "consequence": dto.consequence_dto(option)["text"],
            "feedback": feedback,
            "class": response_class.value,
            "prohibited": response_class == ResponseClass.CONTRAINDICATED,
            "missed": _missed_for(claimed.get(ev.id, []), options, labels),
        }
        label = choice_labels.get(option.id)
        if label and label != option.text:
            item["chosen"]["label"] = label
        first = first_answers.pop(ev.node_id, None)
        if first is not None:
            item["reconsidered"] = {"firstOptionId": first.id, "firstOptionText": first.text}
        review.append(item)
    return review


def _competency_levels(attempt, events):
    """El perfil por competencia; es un dato derivado y NUNCA impide cerrar ni leer un reporte: si falla, queda vacío (y
    se registra). Va en un punto de guardado para que un error de base de datos no deje abortada la transacción."""
    try:
        with transaction.atomic():
            return assessment_competencies.competency_profile(attempt, events)
    except Exception:  # noqa: BLE001 - el cierre del intento no depende de su perfil por competencia
        logger.exception("No se pudo calcular el perfil por competencia del intento %s", attempt.id)
        return []


def _milestone_entry(milestone):
    return {"key": milestone.key, "label": milestone.label, "decisive": milestone.decisive}


def build_milestones(attempt):
    """``{"done": [...], "missing": [...]}``: los hitos del caso cumplidos y los que faltaron, cada uno ``{key, label, decisive}``.

    ``done`` va en el orden en que se cumplieron (lo guardado en el estado del mundo); un hito cumplido que la versión
    ya no declara se conserva con ``label = key``. ``missing`` son los declarados que no se cumplieron, en el orden en
    que el caso los declara.
    """
    declared = {m.key: m for m in case_rules.rules_of(attempt.case_version).milestones}
    in_order = case_state.milestones_in_order(attempt)
    done = [
        _milestone_entry(declared[key]) if key in declared else {"key": key, "label": key, "decisive": False}
        for key in in_order
    ]
    missing = [_milestone_entry(m) for key, m in declared.items() if key not in in_order]
    return {"done": done, "missing": missing}


def _lower_first(text):
    """El texto con la primera letra en minúscula (el resto, como está: «ICBF» no se vuelve «icbf»)."""
    text = text.strip().rstrip(".")
    return text[:1].lower() + text[1:]


def build_recommendations(milestones, competency_levels, base):
    """Las recomendaciones del reporte v3: hitos faltantes (los decisivos primero), competencias en inicio y las de hechos.

    Nada más: sin recomendación por puntaje, estrés ni una genérica de relleno; una lista vacía es válida.
    ``base`` son las de hechos que arma el DTO (lo reconsiderado y retomar con acompañamiento).
    """
    # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23)
    missing = sorted(milestones["missing"], key=lambda m: not m["decisive"])  # estable: conserva el orden del caso
    from_milestones = [
        f"Revisa cómo {_lower_first(m['label'])}: es un paso del caso que quedó sin cumplir." for m in missing
    ]
    from_competencies = [
        f"Refuerza {entry['name']}: en las respuestas que la ponen en juego estás en inicio, repásalo con tu docente."
        for entry in competency_levels
        if entry.get("level") == FormativeLevel.EN_INICIO.value
    ]
    return from_milestones + from_competencies + list(base)


def build_report_payload(attempt, events, ordinal=None, definition_hash=None):
    """El reporte completo (superconjunto del de cierre) con lo de E1-8, v3."""
    payload = dto.build_completion_report(attempt, events, class_of=case_state.response_class_of)
    # La lista nombra las notas (sin su texto: solo el dueño lo lee, por su propia ruta).
    reflections = [
        {"nodeId": r.node_id, "nodeTitle": r.node.title, "locked": r.locked}
        for r in ReflectionJournal.objects.filter(attempt_id=attempt.id).select_related("node").order_by("node_id")
    ]
    competency_levels = _competency_levels(attempt, events)
    coverage = evidence.reflection_coverage(
        [r["nodeId"] for r in reflections], evidence.decision_scene_ids(events), definitions.reflection_definition()
    )
    # Solo las decisiones registradas cuentan por clase: los reintentos se reportan aparte.
    decisions = [
        ev.decision_option for ev in events
        if ev.decision_option_id and ev.event_type in REGISTERED_DECISION_EVENT_TYPES
    ]
    by_class = case_state.counts(decisions)
    milestones = build_milestones(attempt)
    payload.update({
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "ordinal": ordinal if ordinal is not None else attempt_ordinal(attempt),
        "definitionHash": definition_hash or case_definition_hash(attempt.case_version_id),
        "counts": {
            **by_class,
            "retries": payload["retries"],
            "prohibitedRetries": payload["prohibitedRetries"],
            "toolsUsed": payload["toolsUsed"],
            "reflections": payload["reflectionsCount"],
        },
        "milestones": milestones,
        "persona": case_state.persona_dto(case_state.read(attempt).persona),
        "recommendations": build_recommendations(milestones, competency_levels, payload["recommendations"]),
        "decisionReview": build_decision_review(events),
        "reflections": reflections,
        # E6-1d: nombres de nivel, nunca un índice numérico (RN-09).
        "competencyLevels": competency_levels,
        # V5: si ninguna respuesta del caso declara competencias, el cierre de la estudiante no muestra el bloque.
        "competenciesDeclared": assessment_competencies.case_declares_competencies(attempt.case_version_id),
        "profileRules": definitions.PROFILE_RULES,  # la versión de la regla con la que se calculó (E6, revisión I-3)
        "nonRecommendedCount": evidence.non_recommended_count(events),
        "reflectionCoverage": coverage,
        "keyLearningEvidence": evidence.key_learning_evidence(
            attempt.status == AttemptStatus.COMPLETED, coverage, competency_levels
        ),
        "timeByScene": [
            {"nodeId": scene["nodeId"], "seconds": round(scene["seconds"], 1)}
            for scene in attempt_duration.scene_durations(
                [(ev.event_type, ev.node_id, ev.occurred_at) for ev in events], end_at=attempt.ended_at
            )
        ],
    })
    return payload


def freeze_report(attempt, events=None):
    """Persiste el reporte del intento (una sola vez; idempotente) y devuelve la fila."""
    existing = AttemptReport.objects.filter(attempt_id=attempt.id).first()
    if existing is not None:
        return existing
    events = events if events is not None else load_events(attempt.id)
    ordinal = attempt_ordinal(attempt)
    definition_hash = case_definition_hash(attempt.case_version_id)
    payload = build_report_payload(attempt, events, ordinal, definition_hash)
    row = AttemptReport.objects.create(
        attempt=attempt,
        report_json=json.dumps(payload, ensure_ascii=False),
        report_schema_version=REPORT_SCHEMA_VERSION,
        definition_hash=definition_hash,
        attempt_ordinal=ordinal,
    )
    _record_system_evaluation(attempt, payload)
    return row


#: Evento de que el estudiante abrió su retroalimentación (E6-4). Sin nodo ni opción.
FEEDBACK_VIEWED = "FEEDBACK_VIEWED"
#: Su clave de idempotencia: el ``request_id`` único por intento hace que la base descarte la segunda fila. Lleva una
#: «/», que ningún cliente puede mandar en un ``requestId`` (``shared.idempotency``), así que no choca con las órdenes.
FEEDBACK_VIEWED_KEY = "sistema/retroalimentacion-vista"


def _insert_feedback_viewed(attempt):
    AttemptEvent.objects.bulk_create(
        [AttemptEvent(
            attempt=attempt, event_type=FEEDBACK_VIEWED, request_id=FEEDBACK_VIEWED_KEY,
            detail="Retroalimentación vista",  # BORRADOR: texto nuevo del servidor, pendiente de Psicología (VD-23)
        )],
        ignore_conflicts=True,  # INSERT … ON CONFLICT DO NOTHING: a lo sumo una fila por intento, sin comprobar antes
    )


def record_feedback_viewed(attempt, actor):
    """Registra que el dueño de un intento COMPLETADO abrió su reporte (E6-4, R13); solo la primera vez cuenta.

    Es la única escritura de una lectura y por eso es estrecha: solo el dueño (el docente y el ADMIN leen sin escribir),
    solo un intento completado, y nunca rompe la lectura —en un punto de guardado— si la escritura falla.
    """
    if attempt.status != AttemptStatus.COMPLETED or attempt.student_id != actor.id:
        return
    try:
        with transaction.atomic():
            _insert_feedback_viewed(attempt)
    except Exception:  # noqa: BLE001 - la lectura del reporte no depende de este evento
        logger.exception("No se pudo registrar que el intento %s vio su retroalimentación", attempt.id)


def _record_system_evaluation(attempt, payload):
    """La evaluación automática (E6-1e) deriva del reporte que acaba de congelarse y NUNCA rompe el cierre: es un dato
    derivado, como lo que escuchan los suscriptores de ``attempt_completed`` (``send_robust``). Va en un punto de
    guardado para que un fallo de base de datos no deje abortada la transacción que cierra el intento."""
    try:
        with transaction.atomic():
            system_evaluation.record_system_evaluation(attempt, payload)
    except Exception:  # noqa: BLE001 - el cierre del intento no depende de su evaluación automática
        logger.exception("No se pudo crear la evaluación del sistema del intento %s", attempt.id)


def repair_system_evaluation(attempt):
    """Crea la evaluación del sistema de un intento CERRADO con reporte v2 que no la tiene; devuelve la fila o ``None``.

    La crea ``freeze_report`` al cerrar, pero ahí un fallo transitorio (un deadlock, un tiempo de espera) solo se
    registra y el intento quedaría sin ella para siempre: este es el camino de reparación (lo usa
    ``backfill_attempt_reports``). Lee el reporte CONGELADO —no recalcula nada— y, a diferencia del cierre, deja
    pasar el error para que quien repara sepa que no pudo. Un reporte v1 no tiene niveles de qué derivarla.
    """
    frozen = frozen_report_for(attempt.id)
    if frozen is None or frozen.get("schemaVersion", 1) < 2:
        return None
    return system_evaluation.record_system_evaluation(attempt, frozen)


def frozen_report_for(attempt_id):
    """El reporte congelado del intento como diccionario, o ``None`` si no hay."""
    raw = AttemptReport.objects.filter(attempt_id=attempt_id).values_list("report_json", flat=True).first()
    return json.loads(raw) if raw else None


def report_for(attempt):
    """El reporte del intento: el congelado si es un intento completado con fila; si no, en vivo.

    En vivo no se persiste (leer no escribe). Un intento completado antes de E1-8 se arma con el reporte completo (v3).
    Un reporte congelado v1 o v2 se devuelve tal cual, sin transformarlo. Uno que no se completó (pausado,
    reemplazado, salida segura histórica) no tiene reporte de cierre: recibe solo el resumen, sin decisiones, clases,
    hitos, competencias ni final, para que nada que califique su recorrido llegue antes de cerrar.
    """
    if attempt.status == AttemptStatus.COMPLETED:
        frozen = frozen_report_for(attempt.id)
        if frozen is not None:
            return frozen
        return build_report_payload(attempt, load_events(attempt.id))
    return dto.build_student_summary(attempt, load_events(attempt.id))
