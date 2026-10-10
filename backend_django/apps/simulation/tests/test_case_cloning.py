"""P-03 — La declaración de qué se copia al clonar (``case_cloning``), sin base de datos.

La copia completa de una versión la fija ``test_clone_version_contract``; aquí se
comprueba la pieza pequeña: que cada ``CopySpec`` solo declare campos reales y planos
de su modelo, y que ``copy`` junte lo declarado con los vínculos que pone quien clona.
"""
from types import SimpleNamespace

import pytest
from django.db import models

from apps.simulation.services import case_cloning

SPECS = {
    name: spec for name, spec in vars(case_cloning).items() if isinstance(spec, case_cloning.CopySpec)
}


def test_el_modulo_declara_una_copia_por_entidad_del_caso():
    assert set(SPECS) == {
        "CASE_VERSION", "NODE", "DECISION", "MAP", "COLLISION_ZONE", "MAP_OBJECT",
        "DIALOGUE_TREE", "DIALOGUE_LINE", "DIALOGUE_CHOICE", "CLINICAL_TOOL", "RUBRIC",
        "RUBRIC_CRITERION",
    }


@pytest.mark.parametrize("name", sorted(SPECS))
def test_cada_campo_declarado_es_un_campo_plano_real_del_modelo(name):
    spec = SPECS[name]
    concrete = {f.name: f for f in spec.model._meta.concrete_fields}

    for field_name in spec.fields:
        assert field_name in concrete, f"{spec.model.__name__} no tiene el campo {field_name}"
        field = concrete[field_name]
        assert not field.primary_key
        assert not isinstance(field, models.ForeignKey), f"{field_name} es un vínculo: lo pone quien clona"
        assert field_name not in {"created_at", "updated_at"}


@pytest.mark.parametrize("name", sorted(SPECS))
def test_ningun_campo_se_declara_dos_veces(name):
    fields = SPECS[name].fields

    assert len(fields) == len(set(fields))


def test_copy_junta_los_campos_declarados_con_los_vinculos():
    created = {}

    class FakeManager:
        @staticmethod
        def create(**kwargs):
            created.update(kwargs)
            return SimpleNamespace(**kwargs)

    spec = case_cloning.CopySpec(SimpleNamespace(objects=FakeManager), ("a", "b"))
    source = SimpleNamespace(a=1, b="dos", c="no se copia")
    version = object()

    result = spec.copy(source, case_version=version)

    assert created == {"a": 1, "b": "dos", "case_version": version}
    assert result.case_version is version


def test_copy_no_toca_la_fila_de_origen():
    class FakeManager:
        @staticmethod
        def create(**kwargs):
            return SimpleNamespace(**kwargs)

    spec = case_cloning.CopySpec(SimpleNamespace(objects=FakeManager), ("a",))
    source = SimpleNamespace(a=[1, 2], pk=7)

    copy = spec.copy(source, owner="x")

    assert source.a == [1, 2] and source.pk == 7
    assert copy.a == [1, 2] and not hasattr(copy, "pk")
