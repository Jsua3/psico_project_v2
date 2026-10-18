"""E4-4 · ``seal_published_versions``: sellar lo que se publicó antes del sello (RN-05, SIEP-RN-02).

Las versiones publicadas antes de E4 no tienen ``validated_at`` ni ``definition_hash``; sin sello no se
puede arrancar un intento nuevo. El comando valida cada publicada sin sello con la misma compuerta de
publicación (sin exigir la lista ética, que es una constancia humana) y fija el sello; las que no
validan se informan y quedan sin sello. ``--reseal`` recalcula también las ya selladas (cuando el
formato del documento cambia a propósito). Es idempotente.
"""
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.simulation.casedef.canonical import definition_hash
from apps.simulation.models import CaseVersion, SimulationCase, SimulationNode
from apps.simulation.services.authoring import definition_io, publication

pytestmark = [pytest.mark.req("RN-05"), pytest.mark.req("SIEP-RN-02")]

User = get_user_model()


@pytest.fixture
def owner(db):
    return User.objects.create_user(
        email="seal_owner@x.com", password="pass1234", nombre="Pro", apellido="Fe", role="PROFESOR"
    )


def _published_without_seal(owner, code):
    """Una copia válida del caso sembrado, publicada por ORM como antes de E4 (sin sello)."""
    seeded = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    cv = publication.clone_version(seeded.id, owner)["caseVersionId"]
    case = SimulationCase.objects.create(code=code, title=f"Caso {code}", created_by=owner)
    CaseVersion.objects.filter(pk=cv).update(
        simulation_case=case, semantic_version="0.1.0", status="PUBLISHED", validated_at=None, definition_hash=None
    )
    return cv


def _run(*args):
    out, err = StringIO(), StringIO()
    call_command("seal_published_versions", *args, stdout=out, stderr=err)
    return out.getvalue(), err.getvalue()


def test_a_published_version_without_a_seal_is_sealed_with_the_hash_of_its_document(owner):
    cv = _published_without_seal(owner, "SEAL-A")

    out, _ = _run()

    version = CaseVersion.objects.get(pk=cv)
    assert version.validated_at is not None
    assert version.definition_hash == definition_hash(definition_io.export_definition(cv))
    assert version.status == "PUBLISHED"
    assert "SEAL-A" in out


def test_a_version_that_does_not_validate_is_reported_and_stays_without_a_seal(owner):
    cv = _published_without_seal(owner, "SEAL-B")
    SimulationNode.objects.filter(case_version_id=cv).delete()

    out, err = _run()

    version = CaseVersion.objects.get(pk=cv)
    assert (version.validated_at, version.definition_hash) == (None, None)
    assert version.status == "PUBLISHED"  # el comando informa, no despublica
    assert "SEAL-B" in (out + err) and "NO_NODES" in (out + err)


def test_running_it_twice_changes_nothing(owner):
    cv = _published_without_seal(owner, "SEAL-C")
    _run()
    first = CaseVersion.objects.get(pk=cv)

    _run()
    second = CaseVersion.objects.get(pk=cv)

    assert (second.validated_at, second.definition_hash) == (first.validated_at, first.definition_hash)


def test_reseal_recomputes_the_versions_that_already_have_a_seal(owner):
    cv = _published_without_seal(owner, "SEAL-D")
    _run()
    sealed = CaseVersion.objects.get(pk=cv)
    CaseVersion.objects.filter(pk=cv).update(narrative_context="Un contexto que cambió después del sello.")

    _run()  # sin --reseal no se toca
    assert CaseVersion.objects.get(pk=cv).definition_hash == sealed.definition_hash

    _run("--reseal")
    resealed = CaseVersion.objects.get(pk=cv)
    assert resealed.definition_hash != sealed.definition_hash
    assert resealed.definition_hash == definition_hash(definition_io.export_definition(cv))


def test_drafts_and_archived_versions_are_left_alone(owner):
    cv = _published_without_seal(owner, "SEAL-E")
    CaseVersion.objects.filter(pk=cv).update(status="ARCHIVED")
    draft = publication.clone_version(
        CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id, owner
    )["caseVersionId"]

    _run()

    for pk in (cv, draft):
        version = CaseVersion.objects.get(pk=pk)
        assert (version.validated_at, version.definition_hash) == (None, None)


def test_strict_mode_fails_when_a_version_cannot_be_sealed(owner):
    """I5 de la revisión: un despliegue necesita saber, por el código de salida, que algo quedó sin sello."""
    cv = _published_without_seal(owner, "SEAL-F")
    SimulationNode.objects.filter(case_version_id=cv).delete()

    with pytest.raises(CommandError) as failed:
        _run("--strict")

    assert "SEAL-F" in str(failed.value)
    assert CaseVersion.objects.get(pk=cv).definition_hash is None  # igual que sin --strict: no se despublica


def test_strict_mode_passes_when_every_version_seals(owner):
    cv = _published_without_seal(owner, "SEAL-G")

    out, _ = _run("--strict")

    assert CaseVersion.objects.get(pk=cv).definition_hash is not None
    assert "SEAL-G" in out
