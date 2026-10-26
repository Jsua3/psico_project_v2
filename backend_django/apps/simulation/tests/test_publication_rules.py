"""Las seis reglas de publicación del modelo de respuesta (Tarea 10 del modelo de métricas).

Las reglas son puras (``casedef.publication_rules``) y se prueban sobre grafos hechos a mano; el adaptador
de filas (``validation.publication_issues``) y la compuerta se prueban sobre el caso sembrado y un borrador.
"""
import json

import pytest
from django.contrib.auth import get_user_model

from apps.simulation.casedef import publication_rules as rules
from apps.simulation.casedef.publication_rules import (
    EndingNode,
    MilestoneNode,
    OptionNode,
    PublicationGraph,
    SceneNode,
)
from apps.simulation.models import CaseVersion, DecisionOption, SimulationNode
from apps.simulation.services.authoring import validation

from .test_case_lifecycle import _draft_owned_by, _post, cl

pytestmark = pytest.mark.req("RN-05")

User = get_user_model()


# ─── un grafo pequeño hecho a mano ───────────────────────────────────────────────────────────
def opt(key, target, cls="RECOMMENDED", **kw):
    return OptionNode(key=key, target=target, response_class=cls, **kw)


def scene(key, *options, start=False, terminal=False, **kw):
    return SceneNode(key=key, title=key.upper(), start=start, terminal=terminal, options=tuple(options), **kw)


def graph(*scenes, milestones=(), endings=(), own=False, rubric=()):
    return PublicationGraph(
        scenes=tuple(scenes),
        milestones=tuple(MilestoneNode(m, m) for m in milestones),
        endings=tuple(endings),
        own_endings=own,
        rubric_competencies=tuple(rubric),
    )


def codes(issues, severity=None):
    return sorted(i.code for i in issues if severity is None or i.severity == severity)


def line(*, marks_a=(), marks_b=(), cls_b="RECOMMENDED"):
    """inicio -> medio -> fin, con dos opciones en el inicio hacia medio (a y b)."""
    return graph(
        scene("s", opt("a", "m", milestones=marks_a), opt("b", "m", cls_b, milestones=marks_b), start=True),
        scene("m", opt("c", "f")),
        scene("f", terminal=True),
    )


# ─── 1. escena sin recomendada ────────────────────────────────────────────────────────────────
def test_a_scene_without_a_recommended_option_is_an_error():
    g = graph(scene("s", opt("a", "f", "RISKY"), opt("b", "f", "ACCEPTABLE"), start=True), scene("f", terminal=True))
    found = [i for i in rules.check(g) if i.code == "scene-without-recommended"]
    assert [(i.severity, i.scene_key, i.field) for i in found] == [("error", "s", "responseClass")]


def test_a_scene_with_a_recommended_option_or_a_terminal_scene_passes():
    assert "scene-without-recommended" not in codes(rules.check(line()))


# ─── 2. contraindicada sin motivo ─────────────────────────────────────────────────────────────
def test_a_contraindicated_option_needs_a_reason():
    g = graph(
        scene(
            "s", opt("a", "f"), opt("x", "f", "CONTRAINDICATED"),
            opt("y", "f", "CONTRAINDICATED", prohibition_reason="Culpa a la persona"), start=True,
        ),
        scene("f", terminal=True),
    )
    found = [i for i in rules.check(g) if i.code == "contraindicated-without-reason"]
    assert [(i.severity, i.scene_key, i.option_key) for i in found] == [("error", "s", "x")]


def test_a_blank_reason_is_not_a_reason():
    g = graph(
        scene("s", opt("a", "f"), opt("x", "f", "CONTRAINDICATED", prohibition_reason="  "), start=True),
        scene("f", terminal=True),
    )
    assert "contraindicated-without-reason" in codes(rules.check(g))


# ─── 3. hito inalcanzable ─────────────────────────────────────────────────────────────────────
def test_a_milestone_that_no_option_marks_is_unreachable():
    g = line(marks_a=("uno",))
    g = PublicationGraph(g.scenes, (MilestoneNode("uno"), MilestoneNode("dos")), (), False, ())
    found = [i for i in rules.check(g) if i.code == "milestone-unreachable"]
    assert [(i.severity, i.milestone_key, i.field) for i in found] == [("error", "dos", "milestones")]


def test_a_milestone_marked_only_on_a_scene_off_the_path_is_unreachable():
    g = graph(
        scene("s", opt("a", "f"), start=True),
        scene("huerfana", opt("z", "f", milestones=("lejos",))),
        scene("f", terminal=True),
        milestones=("lejos",),
    )
    assert codes(rules.check(g), "error") == ["milestone-unreachable"]


def test_a_milestone_marked_on_a_reachable_scene_passes():
    g = PublicationGraph(line(marks_b=("uno",)).scenes, (MilestoneNode("uno"),), (), False, ())
    assert "milestone-unreachable" not in codes(rules.check(g))


# ─── 4. final inalcanzable ────────────────────────────────────────────────────────────────────
def _ending_graph(*endings, own=True, **kw):
    base = line(**kw)
    return PublicationGraph(base.scenes, (), tuple(endings), own, ())


def test_an_ending_no_path_can_satisfy_is_unreachable():
    g = _ending_graph(
        EndingNode("imposible", "Imposible", {"count": "contraindicated", "gte": 1}),
        EndingNode("resto", "Resto", None),
    )
    found = [i for i in rules.check(g) if i.code == "ending-unreachable"]
    assert [(i.severity, i.ending_key) for i in found] == [("error", "imposible")]


def test_an_ending_some_path_satisfies_is_reachable():
    g = _ending_graph(
        EndingNode("riesgo", "Riesgo", {"count": "risky", "gte": 1}),
        EndingNode("resto", "Resto", None),
        cls_b="RISKY",
    )
    assert "ending-unreachable" not in codes(rules.check(g))


def test_persona_conditions_follow_the_persona_along_the_path():
    # recomendada, recomendada: de cautelosa a abierta (acotada)
    open_ = _ending_graph(EndingNode("a", "A", {"persona": {"bond": "OPEN"}}), EndingNode("d", "D", None))
    assert "ending-unreachable" not in codes(rules.check(open_))
    # solo b es con riesgo y c es recomendada: el vínculo nunca baja a retraída en dos pasos que suben y bajan
    withdrawn = _ending_graph(EndingNode("w", "W", {"persona": {"bond": "WITHDRAWN"}}), EndingNode("d", "D", None))
    assert "ending-unreachable" in codes(rules.check(withdrawn))
    withdrawn_by_risk = _ending_graph(
        EndingNode("w", "W", {"persona": {"bond": "WITHDRAWN"}}), EndingNode("d", "D", None), cls_b="RISKY"
    )
    # b con riesgo (-1) y c recomendada (+1): vuelve a cautelosa; tampoco llega a retraída
    assert "ending-unreachable" in codes(rules.check(withdrawn_by_risk))


def test_a_declared_persona_effect_overrides_the_class_table():
    g = graph(
        scene("s", opt("a", "f", persona_step=(-1, 0)), start=True),
        scene("f", terminal=True),
        endings=(EndingNode("w", "W", {"persona": {"bond": "WITHDRAWN"}}), EndingNode("d", "D", None)),
        own=True,
    )
    assert "ending-unreachable" not in codes(rules.check(g))


def test_own_endings_all_conditional_without_a_default_fail_when_a_path_matches_none():
    g = _ending_graph(EndingNode("riesgo", "Riesgo", {"count": "risky", "gte": 1}), cls_b="RISKY")
    found = rules.check(g)
    # el camino a-c no tiene respuestas con riesgo y no cumple el único final: falta el de por defecto
    assert "ending-without-default" in codes(found, "error")
    assert "ending-unreachable" not in codes(found)


def test_conditional_endings_covering_every_path_need_no_default():
    g = _ending_graph(
        EndingNode("con", "Con", {"count": "recommended", "gte": 1}),
        EndingNode("sin", "Sin", {"count": "recommended", "eq": 0}),
    )
    found = rules.check(g)
    assert "ending-without-default" not in codes(found)
    assert "ending-unreachable" in codes(found)  # "sin" no se cumple nunca: c siempre es recomendada


def test_the_template_endings_never_trip_the_default_rule():
    g = _ending_graph(EndingNode("critica", "C", {"count": "contraindicated", "gte": 2}), own=False)
    assert "ending-without-default" not in codes(rules.check(g))


def test_an_unreachable_template_ending_is_only_a_warning_and_an_own_one_an_error():
    ending = (EndingNode("critica", "C", {"count": "contraindicated", "gte": 2}), EndingNode("resto", "R", None))
    base = line()
    template = PublicationGraph(base.scenes, (MilestoneNode("uno"),), ending, False, ())
    own = PublicationGraph(base.scenes, (MilestoneNode("uno"),), ending, True, ())
    found = [i for i in rules.check(template) if i.code == "ending-unreachable"]
    assert [(i.severity, i.ending_key, i.template) for i in found] == [("warning", "critica", True)]
    found = [i for i in rules.check(own) if i.code == "ending-unreachable"]
    assert [(i.severity, i.ending_key, i.template) for i in found] == [("error", "critica", False)]


def _wide_graph(layers):
    """Capas de escenas con dos opciones cada una: 2**layers caminos."""
    scenes = [scene("s0", opt("a0", "s1"), opt("b0", "s1"), start=True)]
    for n in range(1, layers):
        scenes.append(scene(f"s{n}", opt(f"a{n}", f"s{n + 1}"), opt(f"b{n}", f"s{n + 1}")))
    scenes.append(scene(f"s{layers}", terminal=True))
    return graph(*scenes, endings=(EndingNode("imposible", "I", {"count": "risky", "gte": 1}),), own=True)


def test_the_path_cap_skips_the_reachability_check_with_one_warning():
    found = rules.check(_wide_graph(12))  # 4096 caminos > MAX_PATHS
    assert [(i.code, i.severity) for i in found if i.code.startswith("ending")] == [
        ("ending-reachability-skipped", "warning")
    ]


def test_under_the_cap_the_check_runs():
    found = rules.check(_wide_graph(4))
    assert "ending-reachability-skipped" not in codes(found)
    assert "ending-unreachable" in codes(found)


def test_a_graph_with_no_complete_path_reports_no_ending_issue():
    g = graph(scene("s", start=True), endings=(EndingNode("x", "X", {"milestone": "q"}),), own=True)
    assert [c for c in codes(rules.check(g)) if c.startswith("ending")] == []


# ─── 5. competencia sin evidencia ─────────────────────────────────────────────────────────────
def _competency_graph(declared):
    return graph(
        scene("s", opt("a", "f", competencies=declared), opt("b", "f"), start=True),
        scene("f", terminal=True),
        rubric=("EMPATIA", "ETICA"),
    )


def test_when_no_option_declares_competencies_it_is_only_a_warning():
    found = [i for i in rules.check(_competency_graph(())) if i.code == "competency-without-evidence"]
    assert [(i.severity, i.competency_code) for i in found] == [("warning", None)]


def test_once_an_option_declares_competencies_each_uncovered_one_is_an_error():
    found = [i for i in rules.check(_competency_graph(("EMPATIA",))) if i.code == "competency-without-evidence"]
    assert [(i.severity, i.competency_code, i.field) for i in found] == [("error", "ETICA", "effects.competencies")]


def test_all_competencies_covered_passes():
    assert "competency-without-evidence" not in codes(rules.check(_competency_graph(("EMPATIA", "ETICA"))))


def test_a_case_without_rubric_competencies_has_nothing_to_cover():
    g = graph(scene("s", opt("a", "f", competencies=("X",)), start=True), scene("f", terminal=True))
    assert "competency-without-evidence" not in codes(rules.check(g))


def test_a_competency_declared_only_off_the_path_is_not_evidence():
    g = graph(
        scene("s", opt("a", "f", competencies=("EMPATIA",)), start=True),
        scene("huerfana", opt("z", "f", competencies=("ETICA",))),
        scene("f", terminal=True),
        rubric=("EMPATIA", "ETICA"),
    )
    found = [i for i in rules.check(g) if i.code == "competency-without-evidence"]
    assert [i.competency_code for i in found] == ["ETICA"]


# ─── 6. intensidad alta sin advertencia ───────────────────────────────────────────────────────
def test_a_high_intensity_scene_needs_a_warning():
    g = graph(
        scene("s", opt("a", "h"), start=True),
        scene("h", opt("b", "f"), intensity="HIGH", warning_message=" "),
        scene("f", terminal=True),
    )
    found = [i for i in rules.check(g) if i.code == "high-intensity-without-warning"]
    assert [(i.severity, i.scene_key, i.field) for i in found] == [("error", "h", "warningMessage")]


def test_a_high_intensity_scene_with_a_warning_passes():
    g = graph(
        scene("s", opt("a", "f"), intensity="HIGH", warning_message="Contenido de violencia", start=True),
        scene("f", terminal=True),
    )
    assert "high-intensity-without-warning" not in codes(rules.check(g))


# ─── el adaptador de filas y la compuerta ─────────────────────────────────────────────────────
@pytest.fixture
def seeded(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")


@pytest.fixture
def prof(db):
    return User.objects.create_user(
        email="pr_prof@x.com", password="pass1234", nombre="No", apellido="Ap", role="PROFESOR"
    )


def test_the_migrated_seeded_case_has_no_errors_and_only_the_transition_warning(seeded):
    found = validation.publication_issues(seeded)

    # sus cuatro finales de plantilla se alcanzan; solo queda el aviso de transición de las competencias
    assert [(i["code"], i["severity"]) for i in found] == [("competency-without-evidence", "warning")]
    assert "competencyCode" not in found[0]


def test_every_issue_carries_field_message_and_its_key(prof):
    cv = _draft_owned_by(prof)
    version = CaseVersion.objects.get(pk=cv)
    SimulationNode.objects.filter(case_version_id=cv, start_node=True).update(intensity="HIGH", warning_message="")

    found = [i for i in validation.publication_issues(version) if i["code"] == "high-intensity-without-warning"]

    assert len(found) == 1
    issue = found[0]
    assert issue["severity"] == "error" and issue["field"] == "warningMessage" and issue["sceneKey"]
    assert "nodeId" in issue and "«" in issue["message"] and "intensidad alta" in issue["message"]


def test_a_prohibited_option_without_a_reason_is_left_to_the_world_validator(prof):
    cv = _draft_owned_by(prof)
    version = CaseVersion.objects.get(pk=cv)
    option = DecisionOption.objects.filter(case_version_id=cv).order_by("id").first()
    DecisionOption.objects.filter(pk=option.pk).update(prohibited_conduct=True, prohibition_reason=None)
    assert "contraindicated-without-reason" not in [i["code"] for i in validation.publication_issues(version)]

    DecisionOption.objects.filter(pk=option.pk).update(
        prohibited_conduct=False, response_class="CONTRAINDICATED", prohibition_reason=None
    )
    found = [i for i in validation.publication_issues(version) if i["code"] == "contraindicated-without-reason"]
    assert [(i["optionKey"], i["field"]) for i in found] == [(option.option_key, "prohibitionReason")]


def test_an_unreachable_milestone_and_ending_keep_the_draft_from_review(prof):
    """Revisión de foco 4: no se puede enviar a revisión un caso con un hito o un final que no se alcanzan."""
    cv = _draft_owned_by(prof)
    version = CaseVersion.objects.get(pk=cv)
    declared = json.loads(version.rules)
    declared["milestones"] = [*declared.get("milestones", []), {"key": "hito_huerfano", "label": "Hito huérfano"}]
    declared["endings"] = [
        {"key": "imposible", "title": "Final imposible", "message": "x", "tone": "neutral",
         "when": {"all": [{"milestone": "hito_huerfano"}, {"count": "contraindicated", "gte": 99}]}},
        {"key": "resto", "title": "El resto", "message": "x", "tone": "neutral"},
    ]
    CaseVersion.objects.filter(pk=cv).update(rules=json.dumps(declared))

    response = _post(cl(prof), cv, action="submit")

    assert response.status_code == 409
    assert response.data["code"] == "CASE_NOT_PUBLISHABLE"
    blocked = {issue["code"] for blocker in response.data["blockers"] for issue in blocker.get("issues", [])}
    assert {"milestone-unreachable", "ending-unreachable"} <= blocked
    assert CaseVersion.objects.get(pk=cv).status == "DRAFT"


def test_a_clean_draft_still_goes_to_review(prof):
    cv = _draft_owned_by(prof)

    assert _post(cl(prof), cv, action="submit").status_code == 200
