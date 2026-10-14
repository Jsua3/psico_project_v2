"""E2-5 · La máquina de estados de la versión del caso (§3.3 del plan), sin base de datos.

La tabla de transiciones está escrita a mano aquí y se contrasta con ``can_transition``
para **cada** estado × acción × tipo de actor; después se fijan las propiedades que no
deben romperse (de ``ARCHIVED`` solo se sale clonando; ``PUBLISHED`` nunca vuelve atrás).
"""
import itertools

import pytest

from apps.simulation.services.authoring import lifecycle

pytestmark = [pytest.mark.req("RF-13"), pytest.mark.req("CU-05")]

STATES = ("DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED")
ACTIONS = ("submit", "approve", "reject", "archive", "clone")

#: Quién puede cada transición. «author» = PROFESOR dueño del caso; «admin» = ADMIN.
TABLE = {
    ("DRAFT", "submit"): {"author", "admin"},
    ("DRAFT", "archive"): {"author", "admin"},
    ("IN_REVIEW", "approve"): {"admin"},
    ("IN_REVIEW", "reject"): {"admin"},
    ("PUBLISHED", "archive"): {"author", "admin"},
    ("PUBLISHED", "clone"): {"author", "admin"},
    ("ARCHIVED", "clone"): {"author", "admin"},
}

ACTORS = {
    "author": {"role": "PROFESOR", "is_author": True},
    "foreign": {"role": "PROFESOR", "is_author": False},
    "admin": {"role": "ADMIN", "is_author": False},
    "student": {"role": "ESTUDIANTE", "is_author": False},
}


@pytest.mark.parametrize(
    "state,action,actor", list(itertools.product(STATES, ACTIONS, ACTORS))
)
def test_can_transition_matches_the_table(state, action, actor):
    expected = actor in TABLE.get((state, action), set())

    assert lifecycle.can_transition(state, action, **ACTORS[actor]) is expected


@pytest.mark.parametrize("actor", ACTORS)
@pytest.mark.parametrize("state", STATES)
def test_allowed_transitions_is_the_filter_of_can_transition(state, actor):
    expected = [a for a in ACTIONS if actor in TABLE.get((state, a), set())]

    assert lifecycle.allowed_transitions(state, **ACTORS[actor]) == expected


def test_an_archived_version_only_leaves_by_cloning():
    for action in ACTIONS:
        for actor in ACTORS.values():
            allowed = lifecycle.can_transition("ARCHIVED", action, **actor)
            assert allowed is (action == "clone" and actor["role"] != "ESTUDIANTE" and (
                actor["is_author"] or actor["role"] == "ADMIN"
            ))


def test_a_published_version_never_goes_back_to_draft_or_review():
    for action in ("submit", "approve", "reject"):
        for actor in ACTORS.values():
            assert lifecycle.can_transition("PUBLISHED", action, **actor) is False


def test_only_admin_decides_a_review():
    for action in ("approve", "reject"):
        assert lifecycle.can_transition("IN_REVIEW", action, role="PROFESOR", is_author=True) is False
        assert lifecycle.can_transition("IN_REVIEW", action, role="ADMIN", is_author=False) is True


def test_an_unknown_state_or_action_allows_nothing():
    assert lifecycle.can_transition("ZOMBIE", "submit", role="ADMIN", is_author=False) is False
    assert lifecycle.can_transition("DRAFT", "teleport", role="ADMIN", is_author=False) is False
    assert lifecycle.allowed_transitions("ZOMBIE", role="ADMIN", is_author=True) == []
