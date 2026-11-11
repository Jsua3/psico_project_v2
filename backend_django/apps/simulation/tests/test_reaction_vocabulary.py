import pytest
from apps.simulation.casedef import vocabulary as v
from apps.simulation.casedef.vocabulary import Activation as A, ResponseClass as R
from apps.simulation.services.authoring.assistant import schema

@pytest.mark.parametrize("cls, activation, gesture", [
    (R.RECOMMENDED, A.CALM, "se-acerca"), (R.ACCEPTABLE, A.TENSE, "asiente"),
    (R.RISKY, A.TENSE, "baja-la-mirada"), (R.CONTRAINDICATED, A.TENSE, "se-aparta"),
    (R.CONTRAINDICATED, A.CRISIS, "se-agita"), (R.RECOMMENDED, A.CRISIS, "se-acerca"),
])
def test_default_gesture(cls, activation, gesture):
    assert v.default_gesture(cls, activation) == gesture
    assert gesture in v.GESTURES

def test_assistant_shares_the_expression_list():
    assert schema.EXPRESSIONS is v.EXPRESSIONS
