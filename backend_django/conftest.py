"""Root pytest configuration.

pytest.ini already sets DJANGO_SETTINGS_MODULE; this file is the anchor that
keeps the project root on sys.path so ``apps.*`` and ``psychosim.*`` import.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "psychosim.settings.test")


def pytest_collection_modifyitems(config, items):
    """Un ``req`` sin código o con un código mal escrito rompe la recolección."""
    from shared.testing import invalid_req_codes

    problems = []
    for item in items:
        for marker in item.iter_markers("req"):
            if not marker.args:
                problems.append(f"{item.nodeid}: req() sin código")
            for code in invalid_req_codes(marker.args):
                problems.append(f"{item.nodeid}: código inválido {code!r}")
    if problems:
        raise pytest.UsageError("Marcador req inválido:\n" + "\n".join(problems))


@pytest.fixture
def fetch_raise():
    """Un acceso perezoso accidental a una relación lanza en vez de hacer N+1 (DJA-7)."""
    from shared.testing import fetch_mode_raise

    with fetch_mode_raise():
        yield
