"""E3-8 · Efectos, métricas y finales del caso como datos de la versión (RNF-008, TD-02).

``decision_options.effects`` y ``case_versions.rules.{metrics, endings}`` son la fuente. Una opción
sin efectos cae a la severidad por clasificación; un caso sin finales propios no tiene final (o
usa los del caso PDF si declara sus siete métricas); un dato malformado en la base nunca rompe una
partida (Review Focus 5) y se rechaza al autorarlo; y el reporte ya cerrado no cambia.
"""
import json
import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.simulation.models import (
    CaseVersion,
    DecisionOption,
    SceneMap,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.services import case_effects
from shared.testing import seal_version

pytestmark = [pytest.mark.req("RNF-008"), pytest.mark.req("TD-02")]

User = get_user_model()
BASE = "/api/simulation"
AUTHORING = "/api/authoring/cases"

METRICS = [{"key": "confianza", "initial": 50}, {"key": "calma", "initial": 40}]
ENDINGS = [
    {
        "key": "contenido", "title": "Contenido", "message": "Contuviste a la familia.", "tone": "positive",
        "when": {"all": [{"flag": "familia_contenida"}, {"metric": "confianza", "gte": 60}]},
    },
    {"key": "neutro", "title": "Neutro", "message": "Terminó el caso.", "tone": "neutral"},
]


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(
        email=email, password="Clave-Segura-2026!", nombre="N", apellido="A", role=role
    )


@pytest.fixture
def admin(db):
    return _user("fx_admin@x.com", "ADMIN")


@pytest.fixture
def profesor(db):
    return _user("fx_prof@x.com", "PROFESOR")


@pytest.fixture
def estudiante(db, profesor):
    student = _user("fx_est@x.com", "ESTUDIANTE")
    grupo = Grupo.objects.create(nombre="G efectos", codigo=f"FX{uuid.uuid4().hex[:4]}", profesor=profesor)
    GrupoEstudiante.objects.create(grupo=grupo, estudiante=student, status="ACTIVE")
    student.grupo_fixture = grupo
    return student


def _published(owner, *, rules, effects, classification="ADEQUATE", prohibited=False):
    """Una versión publicada de dos nodos y una sola opción, con sus datos como datos."""
    case = SimulationCase.objects.create(
        code=f"FX-{uuid.uuid4().hex[:6].upper()}", title="Caso de efectos", created_by=owner
    )
    version = CaseVersion.objects.create(
        simulation_case=case, semantic_version="1.0.0", status="PUBLISHED", created_by=owner,
        rules=rules if isinstance(rules, str) else json.dumps(rules),
    )
    seal_version(version)  # arrancar un intento exige el sello de la compuerta (E4-4)
    start = SimulationNode.objects.create(
        case_version=version, node_key="inicio", title="Inicio", narrative="x", start_node=True
    )
    end = SimulationNode.objects.create(
        case_version=version, node_key="fin", title="Fin", narrative="x", terminal_node=True
    )
    for node, key in ((start, "sala-inicio"), (end, "sala-fin")):
        SceneMap.objects.create(
            case_version=version, node=node, map_key=key, title=key, width=960, height=540,
            spawn_x=100, spawn_y=100,
        )
    option = DecisionOption.objects.create(
        case_version=version, option_key="opt-1", source_node=start, target_node=end, text="Hacer algo",
        classification=classification, prohibited_conduct=prohibited,
        effects=effects if isinstance(effects, str) else json.dumps(effects),
    )
    return version, option


def _play(student, version, option):
    """Asigna el caso, inicia un intento y elige la única opción; devuelve el estado final."""
    CaseAssignment.objects.create(grupo=student.grupo_fixture, case_version=version)
    client = cl(student)
    started = client.post(f"{BASE}/attempts", {"caseVersionId": version.id}, format="json")
    assert started.status_code == 200, started.data
    attempt = started.data["data"]
    decided = client.post(
        f"{BASE}/attempts/{attempt['attemptId']}/decisions",
        {"attemptToken": attempt["attemptToken"], "decisionOptionId": option.id, "requestId": uuid.uuid4().hex},
        format="json",
    )
    assert decided.status_code == 200, decided.data
    return client, attempt, decided.data["data"]


# ─── los efectos de la opción ─────────────────────────────────────────────────────────────────
def test_an_option_without_effects_takes_its_severity_from_the_classification():
    cases = [
        ({"classification": "ADEQUATE"}, case_effects.SEVERITY_RECOMMENDED),
        ({"classification": "RISKY"}, case_effects.SEVERITY_RISKY),
        ({"classification": "INADEQUATE"}, case_effects.SEVERITY_CRITICAL),
        ({"classification": "ADEQUATE", "prohibited_conduct": True}, case_effects.SEVERITY_CRITICAL),
    ]

    for fields, severity in cases:
        decision = DecisionOption(option_key="sin-efectos", **fields)
        assert case_effects.option_effects(decision) == {"severity": severity, "flags": {}, "metrics": {}}
        assert case_effects.option_severity(decision) == severity


def test_the_options_own_effects_win_over_the_classification():
    decision = DecisionOption(
        option_key="con-efectos", classification="INADEQUATE",
        effects=json.dumps({"severity": "acceptable", "flags": {"a": True}, "metrics": {"confianza": 5}}),
    )

    assert case_effects.option_effects(decision) == {
        "severity": "acceptable", "flags": {"a": True}, "metrics": {"confianza": 5},
    }


@pytest.mark.parametrize(
    "raw",
    [
        "no es json", "[1, 2]", '"texto"', "null", "5", "",
        '{"severity": "banana", "flags": 3, "metrics": "x"}',
        '{"flags": {"a": "si"}, "metrics": {"m": 1.5, "n": true}}',
    ],
)
def test_malformed_effects_in_the_database_are_discarded_not_raised(raw):
    decision = DecisionOption(option_key="roto", classification="RISKY", effects=raw)

    result = case_effects.option_effects(decision)

    assert result == {"severity": case_effects.SEVERITY_RISKY, "flags": {}, "metrics": {}}


# ─── jugar con datos ──────────────────────────────────────────────────────────────────────────
def test_the_effects_apply_flags_and_metrics_and_the_versions_own_endings_decide(admin, estudiante):
    version, option = _published(
        admin,
        rules={"metrics": METRICS, "endings": ENDINGS},
        effects={"severity": "recommended", "flags": {"familia_contenida": True},
                 "metrics": {"confianza": 15, "calma": -10}},
    )

    _, _, state = _play(estudiante, version, option)

    assert state["status"] == "COMPLETED"
    ending = state["completionReport"]["ending"]
    assert ending["key"] == "contenido"
    assert ending["caseFlags"] == {"familia_contenida": True}
    assert ending["caseMetrics"] == {"confianza": 65, "calma": 30}
    assert ending["severityCounts"] == {"recommended": 1, "acceptable": 0, "risky": 0, "critical": 0}


def test_the_default_ending_of_the_list_applies_when_no_condition_does(admin, estudiante):
    version, option = _published(
        admin, rules={"metrics": METRICS, "endings": ENDINGS},
        effects={"severity": "recommended", "metrics": {"confianza": 5}},
    )

    _, _, state = _play(estudiante, version, option)

    ending = state["completionReport"]["ending"]
    assert ending["key"] == "neutro"
    assert ending["caseMetrics"]["confianza"] == 55


def test_a_case_without_endings_and_without_the_seven_metrics_has_no_ending(admin, estudiante):
    version, option = _published(admin, rules={}, effects={})

    _, _, state = _play(estudiante, version, option)

    assert state["status"] == "COMPLETED"
    assert state["completionReport"]["ending"] is None


def test_a_case_that_declares_the_seven_metrics_without_endings_uses_the_default_endings(admin, estudiante):
    version, option = _published(
        admin, rules={"metrics": case_effects.DEFAULT_METRICS}, effects={"severity": "recommended"},
    )

    _, _, state = _play(estudiante, version, option)

    ending = state["completionReport"]["ending"]
    assert ending["key"] == "riesgo"  # sin valorar riesgo, protección ni derechos
    assert ending["caseMetrics"] == {key: 50 for key in case_effects.CASE_METRIC_KEYS}


@pytest.mark.parametrize(
    "rules",
    [
        "no es json",
        "[]",
        {"metrics": 5, "endings": "x"},
        {"metrics": [None, 3, {"key": ""}, {"key": "ok", "initial": "mucho"}], "endings": [None, 7, {"key": 1}]},
    ],
)
def test_malformed_rules_in_the_database_do_not_break_the_game(admin, estudiante, rules):
    version, option = _published(admin, rules=rules, effects={"flags": {"a": True}})

    _, _, state = _play(estudiante, version, option)

    assert state["status"] == "COMPLETED"
    assert state["completionReport"]["ending"] is None


def test_malformed_effects_in_the_database_do_not_break_the_game(admin, estudiante):
    version, option = _published(
        admin, rules={"metrics": METRICS, "endings": ENDINGS},
        effects='{"severity": "banana", "flags": [1], "metrics": {"confianza": "mucho"}}',
        classification="ADEQUATE",
    )

    _, _, state = _play(estudiante, version, option)

    assert state["status"] == "COMPLETED"
    assert state["completionReport"]["ending"]["key"] == "neutro"


def test_a_malformed_when_never_matches_and_the_default_still_does(admin, estudiante):
    endings = [
        {"key": "roto", "title": "Roto", "message": "", "tone": "neutral", "when": {"eval": "1 + 1"}},
        {"key": "por_defecto", "title": "Por defecto", "message": "Fin.", "tone": "neutral"},
    ]
    version, option = _published(admin, rules={"metrics": METRICS, "endings": endings}, effects={})

    _, _, state = _play(estudiante, version, option)

    assert state["completionReport"]["ending"]["key"] == "por_defecto"


def test_the_closed_report_does_not_change_when_the_data_changes_later(admin, estudiante):
    version, option = _published(
        admin, rules={"metrics": METRICS, "endings": ENDINGS},
        effects={"severity": "recommended", "flags": {"familia_contenida": True}, "metrics": {"confianza": 15}},
    )
    client, attempt, state = _play(estudiante, version, option)
    before = client.get(
        f"{BASE}/attempts/{attempt['attemptId']}/report", HTTP_X_SIEP_ATTEMPT_TOKEN=attempt["attemptToken"]
    ).data["data"]

    DecisionOption.objects.filter(pk=option.pk).update(effects=json.dumps({"severity": "critical"}))
    CaseVersion.objects.filter(pk=version.pk).update(
        rules=json.dumps({"metrics": METRICS, "endings": [ENDINGS[1]]})
    )
    after = client.get(
        f"{BASE}/attempts/{attempt['attemptId']}/report", HTTP_X_SIEP_ATTEMPT_TOKEN=attempt["attemptToken"]
    ).data["data"]

    assert after == before
    assert before["ending"]["key"] == "contenido"


def test_the_effects_never_travel_to_the_player(admin, estudiante):
    version, option = _published(
        admin, rules={"metrics": METRICS, "endings": ENDINGS},
        effects={"severity": "recommended", "flags": {"bandera_secreta_xyz": True}, "metrics": {"confianza": 1}},
    )
    CaseAssignment.objects.create(grupo=estudiante.grupo_fixture, case_version=version)
    client = cl(estudiante)
    started = client.post(f"{BASE}/attempts", {"caseVersionId": version.id}, format="json").data["data"]

    body = json.dumps(started)

    assert "bandera_secreta_xyz" not in body
    assert '"effects"' not in body


# ─── autoría ──────────────────────────────────────────────────────────────────────────────────
@pytest.fixture
def case(profesor):
    client = cl(profesor)
    created = client.post(AUTHORING, {"title": "Caso con efectos"}, format="json")
    assert created.status_code == 200, created.data
    cv = created.data["data"]["caseVersionId"]
    with_end = client.post(
        f"{AUTHORING}/{cv}/nodes",
        {"nodeKey": "fin", "title": "Fin", "narrative": "Fin.", "terminal": True}, format="json",
    ).data["data"]
    ids = {n["key"]: n["id"] for n in with_end["nodes"]}
    return {"cv": cv, "source": ids["inicio"], "target": ids["fin"]}


def _body(case, **extra):
    return {
        "sourceNodeId": case["source"], "targetNodeId": case["target"],
        "text": "Hablar con la familia.", "classification": "ADEQUATE", **extra,
    }


def _decide(client, case, **extra):
    return client.post(f"{AUTHORING}/{case['cv']}/decisions", _body(case, **extra), format="json")


def test_the_author_saves_effects_and_the_editor_returns_them(profesor, case):
    effects = {"severity": "recommended", "flags": {"familia_contenida": True}, "metrics": {"confianza": 15}}

    response = _decide(cl(profesor), case, effects=effects)

    assert response.status_code == 200, response.data
    assert response.data["data"]["decisions"][0]["effects"] == effects


def test_absent_effects_are_not_touched_and_an_empty_object_clears_them(profesor, case):
    client = cl(profesor)
    effects = {"severity": "risky", "flags": {"a": True}, "metrics": {"confianza": -5}}
    decision_id = _decide(client, case, effects=effects).data["data"]["decisions"][0]["id"]

    kept = client.put(
        f"{AUTHORING}/{case['cv']}/decisions/{decision_id}", _body(case, text="Otro texto."), format="json"
    )
    cleared = client.put(
        f"{AUTHORING}/{case['cv']}/decisions/{decision_id}", _body(case, effects={}), format="json"
    )

    assert kept.data["data"]["decisions"][0]["effects"] == effects
    assert cleared.data["data"]["decisions"][0]["effects"] == {}


@pytest.mark.parametrize(
    "effects",
    [
        "texto",
        [1, 2],
        {"desconocido": 1},
        {"severity": "banana"},
        {"flags": [1]},
        {"flags": {"con espacio": True}},
        {"flags": {"a": "si"}},
        {"flags": {f"f{i}": True for i in range(21)}},
        {"metrics": {"no_declarada": 5}},
        {"metrics": {"confianza": 101}},
        {"metrics": {"confianza": 1.5}},
        {"metrics": {"confianza": True}},
    ],
)
def test_malformed_effects_are_a_400_naming_the_field_and_save_nothing(profesor, case, effects):
    response = _decide(cl(profesor), case, effects=effects)

    assert response.status_code == 400, response.data
    assert response.data["field"] == "effects"
    assert DecisionOption.objects.filter(case_version_id=case["cv"]).count() == 0


def test_cloning_copies_the_effects_and_the_rules(profesor, admin, case):
    client = cl(profesor)
    effects = {"severity": "acceptable", "flags": {"a": True}, "metrics": {"confianza": 3}}
    _decide(client, case, effects=effects)
    rules = {"secondChance": True, "metrics": METRICS, "endings": ENDINGS}
    CaseVersion.objects.filter(pk=case["cv"]).update(rules=json.dumps(rules))

    cloned = cl(admin).post(f"{AUTHORING}/{case['cv']}/clone-version", {}, format="json")

    assert cloned.status_code == 200, cloned.data
    clone = CaseVersion.objects.get(pk=cloned.data["data"]["caseVersionId"])
    assert json.loads(clone.rules) == rules
    assert json.loads(DecisionOption.objects.get(case_version=clone).effects) == effects
