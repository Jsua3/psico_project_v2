"""E3-5 · Pistas por escena, bajo demanda y sin costo (C9, RF-11, RF-18, CU-09, decisión 13).

Cada escena (mapa) puede traer pistas que el estudiante pide **una a una**: no cambian el puntaje,
las métricas ni el final, no se revelan dos veces por un doble clic o dos pestañas y el texto de
las que no pidió nunca viaja al jugador (Review Focus 3). La autoría es del dueño del caso, con
texto plano y tope de 280 caracteres (Review Focus 4).
"""
import uuid
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.simulation.models import (
    AttemptEvent,
    AttemptHintView,
    AttemptWorldState,
    AuditLog,
    CaseVersion,
    SceneHint,
    SceneMap,
    SimulationAttempt,
)
from apps.simulation.services import hints as hint_service
from apps.simulation.services.world_state import ensure_world_state
from shared.testing import run_concurrently

from .test_attempt_concurrency import committed_attempt  # noqa: F401  (fixture)
from .test_world import (  # noqa: F401  (fixtures)
    _start,
    attempt_headers,
    case_version_id,
    cl,
    estudiante,
    otro_estudiante,
    profesor,
)

pytestmark = [pytest.mark.req("RF-11"), pytest.mark.req("RF-18"), pytest.mark.req("CU-09")]

User = get_user_model()
BASE = "/api/simulation"
AUTHORING = "/api/authoring/cases"


def _admin():
    return User.objects.create_user(
        email=f"hint_admin_{uuid.uuid4().hex[:6]}@x.com", password="x", nombre="Ad", apellido="Min",
        role="ADMIN",
    )


def _current_map(attempt_id):
    attempt = SimulationAttempt.objects.get(pk=attempt_id)
    return SceneMap.objects.get(case_version_id=attempt.case_version_id, node_id=attempt.current_node_id)


def _world_state(attempt_id):
    """El estado de mundo del intento (leer el mundo ya no lo crea: se asegura aquí)."""
    attempt = SimulationAttempt.objects.select_related("current_node").get(pk=attempt_id)
    return ensure_world_state(attempt)


def _hints(scene_map, *texts):
    return [
        SceneHint.objects.create(scene_map=scene_map, hint_order=(index + 1) * 10, text=text)
        for index, text in enumerate(texts)
    ]


def _state(client, attempt_id, token):
    return client.get(f"{BASE}/attempts/{attempt_id}/hints", **attempt_headers(token))


def _next(client, attempt_id, token, **extra):
    return client.post(
        f"{BASE}/attempts/{attempt_id}/hints/next", {"attemptToken": token, **extra}, format="json"
    )


@pytest.fixture
def started(estudiante, case_version_id):
    client = cl(estudiante)
    attempt_id, token = _start(client, case_version_id)
    return client, attempt_id, token


# ─── el estado ────────────────────────────────────────────────────────────────────────────────
def test_the_initial_state_counts_the_hints_and_shows_none(started):
    client, attempt_id, token = started
    _hints(_current_map(attempt_id), "Observa a la familia.", "Recuerda el protocolo.", "Respira.")

    response = _state(client, attempt_id, token)

    assert response.status_code == 200, response.data
    assert response.data["data"] == {"available": 3, "shown": []}
    assert response["Cache-Control"] == "no-store"


def test_a_scene_without_hints_says_so(started):
    client, attempt_id, token = started

    state = _state(client, attempt_id, token).data["data"]
    refused = _next(client, attempt_id, token)

    assert state == {"available": 0, "shown": [], "reason": "NONE_FOR_SCENE"}
    assert refused.status_code == 409
    assert refused.data["code"] == "NO_MORE_HINTS"


# ─── pedir la siguiente ───────────────────────────────────────────────────────────────────────
def test_next_reveals_in_hint_order_and_leaves_an_event(started):
    client, attempt_id, token = started
    scene_map = _current_map(attempt_id)
    later = SceneHint.objects.create(scene_map=scene_map, hint_order=20, text="Segunda pista.")
    first = SceneHint.objects.create(scene_map=scene_map, hint_order=10, text="Primera pista.")

    one = _next(client, attempt_id, token, requestId="req-hint-0000001")

    assert one.status_code == 200, one.data
    assert one.data["data"] == {
        "available": 1, "shown": [{"id": first.id, "order": 10, "text": "Primera pista."}],
    }
    event = AttemptEvent.objects.get(attempt_id=attempt_id, event_type="HINT_VIEWED")
    assert event.request_id == "req-hint-0000001"
    assert event.node_id == SimulationAttempt.objects.get(pk=attempt_id).current_node_id
    assert AttemptHintView.objects.filter(attempt_id=attempt_id, hint=first).count() == 1
    assert not AttemptHintView.objects.filter(attempt_id=attempt_id, hint=later).exists()


def test_the_hints_run_out_with_all_shown_and_then_409(started, monkeypatch):
    client, attempt_id, token = started
    _hints(_current_map(attempt_id), "Uno.", "Dos.")
    real_now = timezone.now
    offset = {"seconds": 0}
    monkeypatch.setattr(timezone, "now", lambda: real_now() + timedelta(seconds=offset["seconds"]))

    offset["seconds"] = 10
    first = _next(client, attempt_id, token, requestId="req-hint-aaaaaaa1")
    offset["seconds"] = 20
    second = _next(client, attempt_id, token, requestId="req-hint-aaaaaaa2")
    offset["seconds"] = 30
    third = _next(client, attempt_id, token, requestId="req-hint-aaaaaaa3")

    assert first.data["data"]["available"] == 1
    assert [(h["order"], h["text"]) for h in first.data["data"]["shown"]] == [(10, "Uno.")]
    assert [h["text"] for h in second.data["data"]["shown"]] == ["Uno.", "Dos."]
    assert second.data["data"]["available"] == 0
    assert second.data["data"]["reason"] == "ALL_SHOWN"
    assert third.status_code == 409
    assert third.data["code"] == "NO_MORE_HINTS"
    assert AttemptHintView.objects.filter(attempt_id=attempt_id).count() == 2
    assert _state(client, attempt_id, token).data["data"]["reason"] == "ALL_SHOWN"


# ─── una sola vez ─────────────────────────────────────────────────────────────────────────────
def test_the_same_request_id_reveals_one_hint_and_replays_the_response(started):
    client, attempt_id, token = started
    _hints(_current_map(attempt_id), "Uno.", "Dos.")

    first = _next(client, attempt_id, token, requestId="req-hint-repetido")
    second = _next(client, attempt_id, token, requestId="req-hint-repetido")

    assert first.status_code == second.status_code == 200
    assert second.data["data"] == first.data["data"]
    assert AttemptHintView.objects.filter(attempt_id=attempt_id).count() == 1
    assert AttemptEvent.objects.filter(attempt_id=attempt_id, event_type="HINT_VIEWED").count() == 1


def test_a_double_click_without_request_id_reveals_one_and_the_window_then_closes(started, monkeypatch):
    client, attempt_id, token = started
    _hints(_current_map(attempt_id), "Uno.", "Dos.")

    first = _next(client, attempt_id, token)
    second = _next(client, attempt_id, token)  # el segundo clic, dentro de la ventana de duplicado

    assert first.status_code == second.status_code == 200
    assert second.data["data"] == first.data["data"]
    assert AttemptHintView.objects.filter(attempt_id=attempt_id).count() == 1

    real_now = timezone.now
    monkeypatch.setattr(timezone, "now", lambda: real_now() + timedelta(seconds=5))
    third = _next(client, attempt_id, token)

    assert third.status_code == 200
    assert [h["text"] for h in third.data["data"]["shown"]] == ["Uno.", "Dos."]
    assert AttemptHintView.objects.filter(attempt_id=attempt_id).count() == 2


def test_two_threads_with_the_same_request_id_reveal_one_hint(committed_attempt):
    a = committed_attempt
    scene_map = _current_map(a.attempt_id)
    created = _hints(scene_map, "Uno.", "Dos.")
    try:
        def reveal():
            return hint_service.reveal_next_hint(
                a.attempt_id, a.token, a.student, request_id="req-hint-hilos-1"
            )

        outcomes = run_concurrently(reveal, reveal)

        assert [o.error for o in outcomes] == [None, None]
        assert outcomes[0].value == outcomes[1].value
        assert AttemptHintView.objects.filter(attempt_id=a.attempt_id).count() == 1
        assert AttemptEvent.objects.filter(attempt_id=a.attempt_id, event_type="HINT_VIEWED").count() == 1
    finally:
        AttemptHintView.objects.filter(attempt_id=a.attempt_id).delete()
        SceneHint.objects.filter(pk__in=[h.pk for h in created]).delete()


def test_two_tabs_with_different_request_ids_also_reveal_one_hint(committed_attempt):
    a = committed_attempt
    created = _hints(_current_map(a.attempt_id), "Uno.", "Dos.")
    try:
        def reveal(request_id):
            return lambda: hint_service.reveal_next_hint(
                a.attempt_id, a.token, a.student, request_id=request_id
            )

        outcomes = run_concurrently(reveal("req-hint-pestana-1"), reveal("req-hint-pestana-2"))

        assert [o.error for o in outcomes] == [None, None]
        assert len(outcomes[0].value["shown"]) == len(outcomes[1].value["shown"]) == 1
        assert AttemptHintView.objects.filter(attempt_id=a.attempt_id).count() == 1
    finally:
        AttemptHintView.objects.filter(attempt_id=a.attempt_id).delete()
        SceneHint.objects.filter(pk__in=[h.pk for h in created]).delete()


# ─── sin costo y sin filtrarse ────────────────────────────────────────────────────────────────
def test_a_hint_changes_no_score_metric_or_path(started):
    client, attempt_id, token = started
    _hints(_current_map(attempt_id), "Una pista.")
    _world_state(attempt_id)
    fields = (
        "accumulated_score", "stress_index", "user_trust", "victim_risk", "current_node_id", "status",
    )
    before = SimulationAttempt.objects.filter(pk=attempt_id).values(*fields).get()
    world_before = AttemptWorldState.objects.filter(pk=attempt_id).values(
        "flags_json", "inventory_json", "used_tool_keys_json", "scene_map_id"
    ).get()

    assert _next(client, attempt_id, token).status_code == 200

    assert SimulationAttempt.objects.filter(pk=attempt_id).values(*fields).get() == before
    assert AttemptWorldState.objects.filter(pk=attempt_id).values(
        "flags_json", "inventory_json", "used_tool_keys_json", "scene_map_id"
    ).get() == world_before
    events = AttemptEvent.objects.filter(attempt_id=attempt_id, event_type="HINT_VIEWED")
    assert [(e.score_delta, e.stress_delta) for e in events] == [(0, 0)]


def test_unrevealed_hints_never_travel_to_the_player(started, estudiante, case_version_id):
    client, attempt_id, token = started
    _hints(
        _current_map(attempt_id),
        "PISTA-VISIBLE-ALFA", "PISTA-OCULTA-BETA", "PISTA-OCULTA-GAMMA",
    )
    assert _next(client, attempt_id, token).status_code == 200

    bodies = {
        "hints": _state(client, attempt_id, token).content.decode(),
        "attempt": client.get(f"{BASE}/attempts/{attempt_id}", **attempt_headers(token)).content.decode(),
        "world": client.get(f"{BASE}/attempts/{attempt_id}/world", **attempt_headers(token)).content.decode(),
        "cases": client.get(f"{BASE}/cases").content.decode(),
        "catalog": client.get(f"{BASE}/catalog").content.decode(),
        "brief": client.get(f"{BASE}/cases/{case_version_id}/brief").content.decode(),
    }

    assert "PISTA-VISIBLE-ALFA" in bodies["hints"]
    for name, body in bodies.items():
        assert "PISTA-OCULTA-BETA" not in body, name
        assert "PISTA-OCULTA-GAMMA" not in body, name
    for name in ("attempt", "world", "cases", "catalog", "brief"):
        assert "PISTA-VISIBLE-ALFA" not in bodies[name], name


def test_hints_follow_the_room_the_player_is_in(started):
    client, attempt_id, token = started
    here = _current_map(attempt_id)
    other = SceneMap.objects.filter(case_version_id=here.case_version_id).exclude(pk=here.pk).first()
    _world_state(attempt_id)
    _hints(here, "Pista de la sala uno.")
    _hints(other, "Pista de la sala dos.", "Otra de la sala dos.")
    assert _next(client, attempt_id, token).status_code == 200

    AttemptWorldState.objects.filter(pk=attempt_id).update(scene_map_id=other.id)
    elsewhere = _state(client, attempt_id, token).data["data"]
    AttemptWorldState.objects.filter(pk=attempt_id).update(scene_map_id=here.id)
    back = _state(client, attempt_id, token).data["data"]

    assert elsewhere == {"available": 2, "shown": []}
    assert back["reason"] == "ALL_SHOWN" and [h["text"] for h in back["shown"]] == ["Pista de la sala uno."]


# ─── quién y cuándo ───────────────────────────────────────────────────────────────────────────
def test_only_the_owner_plays_the_hints(started, profesor, otro_estudiante):
    client, attempt_id, token = started
    _hints(_current_map(attempt_id), "Una pista.")
    admin = _admin()

    for user in (profesor, admin, otro_estudiante):
        other = cl(user)
        assert _state(other, attempt_id, token).status_code == 403, user.role
        assert _next(other, attempt_id, token).status_code == 403, user.role
    assert AttemptHintView.objects.filter(attempt_id=attempt_id).count() == 0


@pytest.mark.parametrize("status", ["COMPLETED", "PAUSED", "REPLACED"])
def test_a_closed_or_paused_attempt_reveals_nothing(started, status):
    client, attempt_id, token = started
    _hints(_current_map(attempt_id), "Una pista.")
    SimulationAttempt.objects.filter(pk=attempt_id).update(status=status)

    state = _state(client, attempt_id, token)
    refused = _next(client, attempt_id, token)

    assert state.status_code == 200
    assert refused.status_code == 409
    assert refused.data["code"] == "ATTEMPT_NOT_PLAYING"
    assert AttemptHintView.objects.filter(attempt_id=attempt_id).count() == 0


def test_a_wrong_token_is_not_found(started):
    client, attempt_id, token = started

    assert _state(client, attempt_id, "token-equivocado").status_code == 404
    assert _next(client, attempt_id, "token-equivocado").status_code == 404


def test_a_bad_request_id_is_a_400(started):
    client, attempt_id, token = started
    _hints(_current_map(attempt_id), "Una pista.")

    response = _next(client, attempt_id, token, requestId="corto")

    assert response.status_code == 400


# ─── autoría ──────────────────────────────────────────────────────────────────────────────────
def _authored(client, title="Caso con pistas"):
    response = client.post(AUTHORING, {"title": title}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]


@pytest.fixture
def author(db):
    return User.objects.create_user(
        email="hint_author@x.com", password="Clave-Segura-2026!", nombre="Au", apellido="Tor",
        role="PROFESOR",
    )


@pytest.fixture
def case(author):
    return _authored(cl(author))


def test_the_author_creates_updates_and_deletes_a_hint(author, case):
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]
    client = cl(author)

    created = client.post(
        f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": "Observa antes de intervenir.", "hintOrder": 5},
        format="json",
    )
    assert created.status_code == 200, created.data
    hint = created.data["data"]["hints"][0]
    assert (hint["mapId"], hint["order"], hint["text"]) == (map_id, 5, "Observa antes de intervenir.")
    assert created.data["data"]["revision"] == case["revision"] + 1

    updated = client.put(
        f"{AUTHORING}/{cv}/hints/{hint['id']}", {"text": "Observa y escucha.", "hintOrder": 7}, format="json"
    )
    assert updated.status_code == 200
    assert updated.data["data"]["hints"][0]["text"] == "Observa y escucha."
    assert updated.data["data"]["hints"][0]["order"] == 7

    deleted = client.delete(f"{AUTHORING}/{cv}/hints/{hint['id']}")
    assert deleted.status_code == 200 and deleted.data["data"]["hints"] == []


def test_a_hint_without_order_goes_to_the_end(author, case):
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]
    client = cl(author)
    client.post(f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": "Uno.", "hintOrder": 3}, format="json")

    response = client.post(f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": "Dos."}, format="json")

    assert [h["order"] for h in response.data["data"]["hints"]] == [3, 4]


@pytest.mark.parametrize(
    "text",
    ["<script>alert(1)</script>", "Mira <b>esto</b>", "Entra a https://ejemplo.com", "", "x" * 281],
)
def test_invalid_hint_text_is_a_400_naming_the_field(author, case, text):
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]

    response = cl(author).post(f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": text}, format="json")

    assert response.status_code == 400, response.data
    assert response.data["field"] == "text"
    assert not SceneHint.objects.filter(scene_map_id=map_id).exists()


def test_a_missing_text_is_a_400_naming_the_field(author, case):
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]

    response = cl(author).post(f"{AUTHORING}/{cv}/maps/{map_id}/hints", {}, format="json")

    assert response.status_code == 400
    assert response.data["field"] == "text"


def test_a_foreign_professor_cannot_touch_the_hints(author, case):
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]
    hint = cl(author).post(
        f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": "Mía."}, format="json"
    ).data["data"]["hints"][0]
    foreign = User.objects.create_user(
        email="hint_foreign@x.com", password="Clave-Segura-2026!", nombre="Aj", apellido="Eno",
        role="PROFESOR",
    )

    assert cl(foreign).post(
        f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": "x"}, format="json"
    ).status_code == 403
    assert cl(foreign).put(
        f"{AUTHORING}/{cv}/hints/{hint['id']}", {"text": "x"}, format="json"
    ).status_code == 403
    assert cl(foreign).delete(f"{AUTHORING}/{cv}/hints/{hint['id']}").status_code == 403
    assert SceneHint.objects.get(pk=hint["id"]).text == "Mía."


def test_a_hint_of_another_case_is_not_reachable_through_this_one(author, case):
    other = _authored(cl(author), "Otro caso")
    foreign = cl(author).post(
        f"{AUTHORING}/{other['caseVersionId']}/maps/{other['maps'][0]['id']}/hints",
        {"text": "Ajena."}, format="json",
    ).data["data"]["hints"][0]
    cv = case["caseVersionId"]

    assert cl(author).delete(f"{AUTHORING}/{cv}/hints/{foreign['id']}").status_code == 400
    assert cl(author).post(
        f"{AUTHORING}/{cv}/maps/{other['maps'][0]['id']}/hints", {"text": "x"}, format="json"
    ).status_code == 400
    assert SceneHint.objects.filter(pk=foreign["id"]).exists()


def test_a_published_version_is_not_edited(author, case):
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]
    CaseVersion.objects.filter(pk=cv).update(status="PUBLISHED")

    response = cl(author).post(f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": "x"}, format="json")

    assert response.status_code == 400


def test_a_stale_revision_conflicts(author, case):
    cv, map_id, stale = case["caseVersionId"], case["maps"][0]["id"], case["revision"]
    admin = _admin()
    assert cl(admin).post(
        f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": "Primero."}, format="json"
    ).status_code == 200

    response = cl(author).post(
        f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": "Segundo.", "revision": stale}, format="json"
    )

    assert response.status_code == 409
    assert response.data["code"] == "REVISION_CONFLICT"


def test_cloning_copies_the_hints_on_the_cloned_maps(author, case):
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]
    client = cl(author)
    client.post(f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": "Uno.", "hintOrder": 1}, format="json")
    client.post(f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": "Dos.", "hintOrder": 2}, format="json")

    cloned = cl(_admin()).post(f"{AUTHORING}/{cv}/clone-version", {}, format="json")

    assert cloned.status_code == 200, cloned.data
    clone_id = cloned.data["data"]["caseVersionId"]
    copies = list(
        SceneHint.objects.filter(scene_map__case_version_id=clone_id).order_by("hint_order")
    )
    assert [(h.hint_order, h.text) for h in copies] == [(1, "Uno."), (2, "Dos.")]
    assert {h.scene_map.case_version_id for h in copies} == {clone_id}
    assert SceneHint.objects.filter(scene_map_id=map_id).count() == 2  # el original no se tocó


def test_every_hint_mutation_is_audited(author, case):
    cv, map_id = case["caseVersionId"], case["maps"][0]["id"]
    client = cl(author)

    hint = client.post(
        f"{AUTHORING}/{cv}/maps/{map_id}/hints", {"text": "Auditada."}, format="json"
    ).data["data"]["hints"][0]
    client.put(f"{AUTHORING}/{cv}/hints/{hint['id']}", {"text": "Editada."}, format="json")
    client.delete(f"{AUTHORING}/{cv}/hints/{hint['id']}")

    def audited(action, resource_type, resource_id):
        return AuditLog.objects.filter(
            action=action, resource_type=resource_type, resource_id=str(resource_id), actor_id=author.id
        ).exists()

    assert audited("ADMIN_CREATE_HINT", "MAP", map_id)
    assert audited("ADMIN_UPDATE_HINT", "HINT", hint["id"])
    assert audited("ADMIN_DELETE_HINT", "HINT", hint["id"])


# ─── una pista no suma tiempo a la escena (revisión de fase de E3, M4 re-graduado) ─────────────
def test_a_hint_does_not_change_the_time_by_scene_nor_the_event_based_duration():
    import datetime as dt

    from apps.simulation.services import attempt_duration

    start = dt.datetime(2026, 10, 14, 9, 0, 0)
    end = start + dt.timedelta(seconds=1200)
    base = [
        ("NODE_ENTERED", 1, start),
        ("DECISION_SELECTED", 1, start + dt.timedelta(seconds=600)),
    ]
    with_hint = [base[0], ("HINT_VIEWED", 1, start + dt.timedelta(seconds=540)), base[1]]

    assert attempt_duration.scene_durations(with_hint, end_at=end) == attempt_duration.scene_durations(
        base, end_at=end
    )
    pairs = lambda events: [(kind, at) for kind, _, at in events]  # noqa: E731
    assert attempt_duration.active_duration_seconds(
        start, end, pairs(with_hint)
    ) == attempt_duration.active_duration_seconds(start, end, pairs(base))
