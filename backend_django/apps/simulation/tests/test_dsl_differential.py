"""E4-3 · Prueba diferencial contra el validador del taller (RNF-07, RF-12, N4).

«Lo que se ejecuta es lo que se validó» solo vale si el validador del producto opina **igual** que el del
equipo. Esta prueba corre el validador del taller en su propio proceso (``taller_dsl_driver.py``, una
sola vez para todo el lote, sin importar su código aquí) y compara, documento por documento, el
veredicto y el conjunto de reglas que se incumplen (``FORMA``, ``OCL-xx``, ``PROP-xx``) con los del
producto. El corpus son los dos escenarios del taller, 200 alteraciones al azar (semilla fija, una a tres
por documento: borrar una clave, poner un valor de otro tipo o duplicar un elemento) y las 30
alteraciones dirigidas de ``test_casedef_rules`` (el azar no produce, por ejemplo, un ciclo). Si
difieren, el defecto es del port, no de la prueba.

Las pruebas «de la prueba» rompen a propósito una regla del producto y exigen que la diferencial
**falle**: así se sabe que muerde en cada una de las 17 reglas (forma incluida).
"""
import copy
import dataclasses

import pytest

from apps.simulation.casedef import validate as product_validate
from apps.simulation.casedef.report import Outcome
from apps.simulation.casedef.rules import REGISTRY
from apps.simulation.casedef.validate import run_rules
from apps.simulation.tests import dsl_support
from apps.simulation.tests.test_casedef_rules import CASES

pytestmark = [pytest.mark.req("RNF-07"), pytest.mark.req("RF-12")]

MUTATIONS = 200
ALL_RULES = ["FORMA"] + [f"OCL-0{n}" for n in range(1, 9)] + [f"PROP-0{n}" for n in range(1, 9)]


def _directed():
    documents = []
    for _, base, alteration, _ in CASES:
        document = base()
        alteration(document)
        documents.append(document)
    return documents


@pytest.fixture(scope="module")
def corpus():
    scenarios = dsl_support.scenarios()
    documents = (
        [document for _, _, document in scenarios] + dsl_support.mutated(MUTATIONS) + _directed()
    )
    names = (
        [name for name, _, _ in scenarios]
        + [f"alteración {n}" for n in range(MUTATIONS)]
        + [case[0] for case in CASES]
    )
    return documents, names, dsl_support.workshop_reports(documents)


def _differences(documents, names, reports):
    assert len(reports) == len(documents)
    found = []
    for name, document, workshop in zip(names, documents, reports):
        ours = run_rules(copy.deepcopy(document))
        theirs = set(workshop["reglasIncumplidas"])
        if ours.verdict() != workshop["obtenido"] or ours.failed_rules() != theirs:
            found.append((name, workshop["obtenido"], sorted(theirs), ours.verdict(), sorted(ours.failed_rules())))
    return found


def test_the_product_and_the_workshop_validators_agree_on_the_whole_corpus(corpus):
    documents, names, reports = corpus
    assert len(documents) == 2 + MUTATIONS + len(CASES)
    assert _differences(documents, names, reports) == []


def test_the_corpus_exercises_every_rule_and_many_combinations(corpus):
    """Una diferencial sobre documentos que siempre fallan igual no probaría nada."""
    _, _, reports = corpus
    combinations = {tuple(sorted(report["reglasIncumplidas"])) for report in reports}
    assert len(combinations) >= 25
    exercised = {rule for combination in combinations for rule in combination}
    assert exercised == set(ALL_RULES), sorted(set(ALL_RULES) - exercised)


@pytest.mark.parametrize("rule_id", ALL_RULES)
def test_the_differential_bites_when_a_product_rule_is_broken(corpus, monkeypatch, rule_id):
    """Prueba de la prueba: con la regla rota en el producto, la diferencial ve la diferencia."""
    documents, names, reports = corpus
    if rule_id == "FORMA":
        monkeypatch.setattr(product_validate.form, "errors", lambda _schema, _document: [])
    else:
        broken = [
            dataclasses.replace(spec, function=lambda _doc: Outcome(0, [], "roto a propósito"))
            if spec.id == rule_id else spec
            for spec in REGISTRY
        ]
        monkeypatch.setattr(product_validate, "REGISTRY", broken)
    assert _differences(documents, names, reports) != [], rule_id
