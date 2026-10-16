"""E4-1b · Contrato de cobertura: toda columna del caso se exporta o se excluye con motivo.

Es el equivalente, para el documento, de ``test_clone_version_contract``: si alguien añade una columna
a un modelo del caso y no decide si viaja en la definición, esta prueba falla. Sin ella la columna
nueva no entraría al documento, ni a la ida y vuelta, ni a la huella: la definición «validada» y la
que se ejecuta se separarían sin avisar (Review Focus 1 de E4). Las columnas que **no** viajan declaran
por qué (ids, marcas de tiempo, quién creó la fila, estado operativo).
"""
import pytest
from django.apps import apps

from apps.simulation.casedef.coverage import EXCLUDED, EXPORTED

pytestmark = [pytest.mark.req("RNF-07"), pytest.mark.req("TD-02")]


def _concrete_fields(model_name):
    model = apps.get_model("simulation", model_name)
    return {field.name for field in model._meta.concrete_fields}


@pytest.mark.parametrize("model_name", sorted(set(EXPORTED) | set(EXCLUDED)))
def test_every_column_is_exported_or_excluded_with_a_reason(model_name):
    fields = _concrete_fields(model_name)
    exported = set(EXPORTED.get(model_name, ()))
    excluded = set(EXCLUDED.get(model_name, {}))
    assert not exported & excluded, f"{model_name}: {sorted(exported & excluded)} está en las dos listas"
    assert fields - exported - excluded == set(), (
        f"{model_name}: columnas sin declarar {sorted(fields - exported - excluded)}; "
        "añádelas a EXPORTED (y al documento) o a EXCLUDED con su motivo"
    )
    assert (exported | excluded) - fields == set(), (
        f"{model_name}: declara columnas que ya no existen {sorted((exported | excluded) - fields)}"
    )


def test_every_excluded_column_has_a_reason():
    for model_name, columns in EXCLUDED.items():
        for column, reason in columns.items():
            assert reason.strip(), f"{model_name}.{column} se excluye sin motivo"


def test_the_models_of_the_case_are_all_covered():
    """Los modelos que ``case_cloning`` copia son los mismos que la definición cubre."""
    from apps.simulation.services import case_cloning

    copied = {
        spec.model.__name__ for spec in vars(case_cloning).values()
        if isinstance(spec, case_cloning.CopySpec)
    }
    assert copied - set(EXPORTED) == set(), f"modelos que se clonan y no se exportan: {sorted(copied - set(EXPORTED))}"
