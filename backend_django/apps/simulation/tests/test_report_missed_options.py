"""Tarea 9 (x-siep 2.1) · el informe de cierre dice qué respuestas el estudiante no llegó a ver y qué le faltó explorar.

Mismo caso que las Tareas 7 y 8 (``sample_definition_v21``): ``analizar`` (RECOMMENDED) exige haber inspeccionado la
``carpeta``; ``intervenir`` (RISKY, sin requisito) lleva al cierre. ``secondChance`` se apaga para cerrar el intento
de una elección (la prueba del reintento lo deja encendido a propósito).
"""
import json
from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.simulation.models import (
    AttemptEvent,
    AttemptReport,
    CaseVersion,
    DecisionOption,
    SimulationAttempt,
    SimulationCase,
)
from apps.simulation.services import attempt_report, game_service, world_service
from apps.simulation.services.authoring import definition_io
from apps.simulation.tests.definition_samples import sample_definition_v21
from apps.simulation.tests.test_world import _assign_case_to_student
from shared.jsonutils import read_map

User = get_user_model()

OBJECT_KEY = "carpeta"
OBJECT_LABEL = "Carpeta"


@pytest.fixture
def author(db):
    return User.objects.create_user(
        email="miss_admin@x.com", password="pass1234", nombre="Ad", apellido="Min", role="ADMIN"
    )


@pytest.fixture
def actor(db):
    return User.objects.create_user(
        email="miss_est@x.com", password="pass1234", nombre="Est", apellido="Miss", role="ESTUDIANTE"
    )


@pytest.fixture
def game(actor, author):
    case = SimulationCase.objects.create(code="MISS-CASO", title="Lo no visto", created_by=author)
    version = definition_io.write_definition(sample_definition_v21(), case=case, actor=author)
    CaseVersion.objects.filter(pk=version.id).update(
        status="PUBLISHED", validated_at=timezone.now(), definition_hash="a" * 64
    )
    _assign_case_to_student(actor, version.id)
    started = game_service.start_attempt(version.id, actor)
    options = {o.option_key: o for o in DecisionOption.objects.filter(case_version_id=version.id)}
    return SimpleNamespace(
        version_id=version.id, attempt=SimulationAttempt.objects.get(pk=started["attemptId"]), token=started["attemptToken"], actor=actor,
        gated=options["analizar"], plain=options["intervenir"],
    )


def _choose(game, option):
    return game_service.choose_decision(game.attempt.id, game.token, option.id, game.actor)


def _finish_with_the_plain_option(game):
    CaseVersion.objects.filter(pk=game.version_id).update(
        rules=json.dumps({**read_map(CaseVersion.objects.get(pk=game.version_id).rules), "secondChance": False})
    )
    _choose(game, game.plain)
    attempt = SimulationAttempt.objects.get(pk=game.attempt.id)
    assert attempt.status == "COMPLETED"
    return attempt


def _report(game):
    return attempt_report.report_for(SimulationAttempt.objects.get(pk=game.attempt.id))


def test_report_lists_what_was_not_offered(game):
    _finish_with_the_plain_option(game)

    report = _report(game)

    assert report["schemaVersion"] == 4
    assert report["decisionReview"][0]["missed"] == [{
        "optionId": game.gated.id, "text": game.gated.text, "class": "RECOMMENDED",
        "missing": [{"kind": "inspected", "key": OBJECT_KEY, "label": OBJECT_LABEL}],
    }]


def test_the_event_is_saved_once_and_never_on_a_retry(game):
    _choose(game, game.plain)  # secondChance encendido: RISKY pide reintento y no registra la decisión
    assert not AttemptEvent.objects.filter(attempt_id=game.attempt.id, event_type="OPTIONS_NOT_OFFERED").exists()
    # fuera de la ventana de doble clic, para que la segunda elección no sea una repetición
    AttemptEvent.objects.filter(attempt_id=game.attempt.id).update(occurred_at=timezone.now() - timedelta(hours=1))
    _finish_with_the_plain_option(game)

    events = list(AttemptEvent.objects.filter(attempt_id=game.attempt.id, event_type="OPTIONS_NOT_OFFERED"))

    assert len(events) == 1
    assert json.loads(events[0].detail) == {"v": 1, "options": [{"id": game.gated.id, "unmet": [["inspected", OBJECT_KEY]]}]}
    assert events[0].node_id == game.plain.source_node_id


def test_nothing_missed_gives_an_empty_list(game):
    world_service.open_interaction(game.attempt.id, game.token, OBJECT_KEY, game.actor)
    _finish_with_the_plain_option(game)

    report = _report(game)

    assert all(item["missed"] == [] for item in report["decisionReview"])
    assert not AttemptEvent.objects.filter(attempt_id=game.attempt.id, event_type="OPTIONS_NOT_OFFERED").exists()


def test_the_bookkeeping_event_is_not_in_the_timeline(game):
    _finish_with_the_plain_option(game)

    assert "OPTIONS_NOT_OFFERED" not in {entry["type"] for entry in _report(game)["timeline"]}


def test_student_projection_keeps_missed(game):
    _finish_with_the_plain_option(game)

    assert "missed" in attempt_report.for_student(_report(game))["decisionReview"][0]


def test_a_version_3_report_is_read_untouched(game):
    attempt = _finish_with_the_plain_option(game)
    row = AttemptReport.objects.get(attempt_id=attempt.id)
    old = json.loads(row.report_json)
    old["schemaVersion"] = 3
    for item in old["decisionReview"]:
        item.pop("missed", None)
    AttemptReport.objects.filter(pk=row.pk).update(report_json=json.dumps(old, ensure_ascii=False))

    read = attempt_report.report_for(SimulationAttempt.objects.get(pk=attempt.id))

    assert read == old and "missed" not in read["decisionReview"][0]


def test_a_corrupt_event_detail_gives_an_empty_list(game):
    attempt = _finish_with_the_plain_option(game)
    AttemptReport.objects.filter(attempt_id=attempt.id).delete()  # se rearma en vivo
    AttemptEvent.objects.filter(event_type="OPTIONS_NOT_OFFERED").update(detail="{roto")

    assert _report(game)["decisionReview"][0]["missed"] == []


def test_an_unknown_key_falls_back_to_the_key_as_label(game):
    attempt = _finish_with_the_plain_option(game)
    AttemptReport.objects.filter(attempt_id=attempt.id).delete()  # se rearma en vivo
    AttemptEvent.objects.filter(event_type="OPTIONS_NOT_OFFERED").update(
        detail=json.dumps({"v": 1, "options": [{"id": game.gated.id, "unmet": [["used", "NO_EXISTE"]]}]})
    )

    missed = _report(game)["decisionReview"][0]["missed"]

    assert missed[0]["missing"] == [{"kind": "used", "key": "NO_EXISTE", "label": "NO_EXISTE"}]
