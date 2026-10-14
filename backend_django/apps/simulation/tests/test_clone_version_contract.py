"""P-03 — ``clone_version`` copia cada campo de cada entidad (prueba de clon completo).

Antes de reemplazar los ``_clone_*`` campo por campo por una copia declarativa, esta
prueba fija qué trae el clon: recorre **todos** los campos concretos de cada modelo del
caso y comprueba que valen lo mismo que en la versión de origen, salvo los que se
excluyen a propósito (identificadores, marcas de tiempo, el vínculo con la versión) y
los **huecos conocidos**: campos que el clon hoy NO copia y que, por eso, valen el
valor por defecto del modelo. Los huecos están escritos aquí para que dejen de ser un
olvido silencioso: si un cambio empieza a copiarlos, esta prueba obliga a quitarlos de
la lista a conciencia.

Para que «copiado» se distinga de «quedó en el valor por defecto», la fuente trae, de
cada entidad, una fila extra con **todos** los campos en un valor distinto del
predeterminado (se calculan desde el modelo: un campo nuevo entra solo). También
comprueba que la versión PUBLICADA de origen no se modifica (REGLA-005).
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import models
from rest_framework.test import APIClient

from apps.simulation.models import (
    CaseCharacter,
    CaseVersion,
    ClinicalTool,
    CollisionZone,
    DecisionOption,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    MapObject,
    Rubric,
    RubricCriterion,
    SceneHint,
    SceneMap,
    SimulationNode,
)

User = get_user_model()
BASE = "/api/admin/cases"

#: Campos que difieren a propósito entre origen y clon (no son «datos del caso»).
ALWAYS_EXCLUDED = {"id", "created_at", "updated_at"}

#: Lo que el clon NO copia a propósito y recibe el valor por defecto del modelo.
#: `Rubric.is_default` es una marca GLOBAL (`set_default` apaga la de todas las demás
#: rúbricas): copiarla dejaría dos rúbricas predeterminadas. Hasta A-07 la lista tenía cuatro
#: campos más (`Rubric.version`, `RubricCriterion.weight` y `.active`, y el
#: `world_schema_version` de la versión), que eran olvidos, no decisiones.
KNOWN_GAPS = {
    Rubric: {"is_default"},
}

#: modelo → (orden, {clave foránea: campo con que se la etiqueta}, campos excluidos propios)
ENTITIES = {
    SimulationNode: ("id", {}, {"case_version"}),
    DecisionOption: ("id", {"source_node": "node_key", "target_node": "node_key"}, {"case_version"}),
    SceneMap: ("id", {"node": "node_key"}, {"case_version"}),
    CollisionZone: ("id", {"scene_map": "map_key"}, set()),
    MapObject: ("id", {"scene_map": "map_key", "decision_option": "option_key", "character": "character_key"}, set()),
    CaseCharacter: ("id", {}, {"case_version"}),
    SceneHint: ("hint_order", {"scene_map": "map_key"}, set()),
    DialogueTree: ("id", {"scene_map": "map_key", "map_object": "object_key"}, set()),
    DialogueLine: ("display_order", {"dialogue_tree": "tree_key"}, set()),
    DialogueChoice: ("display_order", {"dialogue_tree": "tree_key", "decision_option": "option_key"}, set()),
    ClinicalTool: ("id", {}, {"case_version"}),
    Rubric: ("id", {}, {"case_version", "created_by"}),
    RubricCriterion: ("display_order", {"rubric": "name"}, set()),
}

#: Campos de lista JSON (los demás `*_json` son objetos).
JSON_LISTS = {"support_resources_json", "required_tools_json"}


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        email="admin_clone@x.com", password="x", nombre="Ad", apellido="Min", role="ADMIN"
    )


# ── filas y comparación ──────────────────────────────────────────────────────
_PARENT = {
    CollisionZone: "scene_map", MapObject: "scene_map", DialogueTree: "scene_map", SceneHint: "scene_map",
    DialogueLine: "dialogue_tree", DialogueChoice: "dialogue_tree", RubricCriterion: "rubric",
}


def _rows(model, version_id):
    """Filas de una entidad de la versión, en el orden en que el clon las crea."""
    if model in (SimulationNode, DecisionOption, SceneMap, ClinicalTool, Rubric, CaseCharacter):
        queryset = model.objects.filter(case_version_id=version_id)
    elif model in (CollisionZone, MapObject, DialogueTree, SceneHint):
        queryset = model.objects.filter(scene_map__case_version_id=version_id)
    elif model in (DialogueLine, DialogueChoice):
        queryset = model.objects.filter(dialogue_tree__scene_map__case_version_id=version_id)
    else:  # RubricCriterion
        queryset = model.objects.filter(rubric__case_version_id=version_id)
    order = ENTITIES[model][0]
    parent = _PARENT.get(model)
    ordering = [order, "id"] if parent is None else [f"{parent}__id", order, "id"]
    return list(queryset.order_by(*ordering))


def _label(row, fk_name, label_field):
    related = getattr(row, fk_name)
    return None if related is None else getattr(related, label_field)


def _plain_values(row, model, excluded):
    values = {}
    for field in model._meta.concrete_fields:
        if field.name in excluded or field.name in ALWAYS_EXCLUDED or isinstance(field, models.ForeignKey):
            continue
        values[field.name] = getattr(row, field.attname)
    return values


# ── la fuente: la versión publicada con una fila extra «toda distinta» por entidad ──
def _distinct_from_default(field):
    if isinstance(field, models.BooleanField):
        return not bool(field.get_default())
    if isinstance(field, models.IntegerField):
        return int(field.get_default() or 0) + 7
    if isinstance(field, models.DecimalField):
        return Decimal(field.get_default() or 0) + Decimal("1.25")
    if field.name.endswith("_json"):
        return '["p03"]' if field.name in JSON_LISTS else '{"p03": 1}'
    text = f"p03-{field.name}"
    return text[: field.max_length] if getattr(field, "max_length", None) else text


def _all_distinct(model, **fixed):
    """Valores de todos los campos planos del modelo, cada uno distinto del predeterminado."""
    values = {}
    for field in model._meta.concrete_fields:
        if (
            field.primary_key or isinstance(field, models.ForeignKey) or field.choices
            or field.name in ALWAYS_EXCLUDED or field.name in fixed
        ):
            continue
        values[field.name] = _distinct_from_default(field)
    values.update(fixed)
    return values


@pytest.fixture
def autor(db):
    """Quien creó la rúbrica de la fuente: distinto de quien clona, para que se note de quién queda la copia."""
    return User.objects.create_user(
        email="autor_rubrica@x.com", password="x", nombre="Au", apellido="Tor", role="PROFESOR"
    )


@pytest.fixture
def fuente(admin, autor):
    version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    CaseVersion.objects.filter(pk=version.pk).update(world_schema_version=2)
    version.refresh_from_db()

    node_a = SimulationNode.objects.create(case_version=version, **_all_distinct(SimulationNode))
    node_b = SimulationNode.objects.create(
        case_version=version, **_all_distinct(SimulationNode, node_key="p03-node-b", start_node=False)
    )
    decision = DecisionOption.objects.create(
        case_version=version, source_node=node_a, target_node=node_b,
        **_all_distinct(DecisionOption, classification="RISKY"),
    )
    scene_map = SceneMap.objects.create(case_version=version, node=node_a, **_all_distinct(SceneMap))
    CollisionZone.objects.create(scene_map=scene_map, **_all_distinct(CollisionZone))
    SceneHint.objects.create(scene_map=scene_map, **_all_distinct(SceneHint))
    character = CaseCharacter.objects.create(case_version=version, **_all_distinct(CaseCharacter))
    obj = MapObject.objects.create(
        scene_map=scene_map, decision_option=decision, character=character,
        **_all_distinct(MapObject, object_type="PROP"),
    )
    tree = DialogueTree.objects.create(scene_map=scene_map, map_object=obj, **_all_distinct(DialogueTree))
    DialogueLine.objects.create(dialogue_tree=tree, **_all_distinct(DialogueLine))
    DialogueChoice.objects.create(dialogue_tree=tree, decision_option=decision, **_all_distinct(DialogueChoice))
    ClinicalTool.objects.create(case_version=version, **_all_distinct(ClinicalTool))
    rubric = Rubric.objects.create(case_version=version, created_by=autor, **_all_distinct(Rubric))
    RubricCriterion.objects.create(rubric=rubric, **_all_distinct(RubricCriterion))
    return version


def _clone(admin, fuente):
    resp = cl(admin).post(f"{BASE}/{fuente.id}/clone-version")
    assert resp.status_code == 200, resp.data
    return CaseVersion.objects.get(pk=resp.data["data"]["caseVersionId"])


# ── pruebas ──────────────────────────────────────────────────────────────────
def test_la_fuente_trae_una_fila_toda_distinta_de_cada_entidad(fuente):
    for model in ENTITIES:
        extra = [row for row in _rows(model, fuente.id) if _is_p03(row, model)]
        assert extra, f"la fuente no tiene la fila extra de {model.__name__}"
        for name, value in _plain_values(extra[0], model, ENTITIES[model][2]).items():
            field = model._meta.get_field(name)
            if field.choices or name in {"display_order"}:
                continue
            default = field.get_default()
            assert value != default, f"{model.__name__}.{name} quedó en su valor por defecto en la fuente"


def _is_p03(row, model):
    return any(isinstance(v, str) and v.startswith("p03-") for v in _plain_values(row, model, set()).values())


@pytest.mark.parametrize("model", list(ENTITIES), ids=lambda m: m.__name__)
def test_el_clon_copia_cada_campo_de_cada_fila(admin, fuente, model):
    clone = _clone(admin, fuente)
    _, labels, excluded = ENTITIES[model]
    gaps = KNOWN_GAPS.get(model, set())
    source_rows, clone_rows = _rows(model, fuente.id), _rows(model, clone.id)

    assert len(clone_rows) == len(source_rows)
    for source, copy in zip(source_rows, clone_rows):
        source_values = _plain_values(source, model, excluded)
        copy_values = _plain_values(copy, model, excluded)
        for name in gaps:
            default = model._meta.get_field(name).get_default()
            copied = copy_values.pop(name)
            source_values.pop(name)
            if _is_p03(source, model):
                assert copied == default, f"{model.__name__}.{name} ya no es un hueco: quítalo de KNOWN_GAPS"
        # Para las filas sembradas el hueco puede coincidir con el valor por defecto: no se compara.
        assert copy_values == source_values
        for fk_name, label_field in labels.items():
            assert _label(copy, fk_name, label_field) == _label(source, fk_name, label_field), fk_name


def test_el_clon_de_la_version_es_un_borrador_enlazado_al_origen(admin, fuente):
    clone = _clone(admin, fuente)

    assert clone.status == "DRAFT"
    assert clone.cloned_from_id == fuente.id
    assert clone.simulation_case_id == fuente.simulation_case_id
    assert clone.narrative_context == fuente.narrative_context
    assert clone.published_at is None
    assert clone.created_by_id == admin.id
    assert clone.semantic_version != fuente.semantic_version
    # A-07: el clon conserva el esquema de mundo de la fuente (antes recibía el valor por defecto).
    assert fuente.world_schema_version == 2
    assert clone.world_schema_version == fuente.world_schema_version


def test_las_rubricas_clonadas_conservan_a_su_dueno_y_no_pasan_a_quien_clona(admin, autor, fuente):
    """Revisión de fase E2 (F16b): quien clona no se vuelve el dueño de la rúbrica. Si lo fuera,
    un ADMIN que clona la rúbrica privada de una autora la haría visible para todos los docentes."""
    clone = _clone(admin, fuente)

    assert set(Rubric.objects.filter(case_version=fuente).values_list("created_by_id", flat=True)) >= {autor.id}
    assert Rubric.objects.filter(case_version=clone).exists()
    assert set(Rubric.objects.filter(case_version=clone).values_list("created_by_id", flat=True)) == set(
        Rubric.objects.filter(case_version=fuente).values_list("created_by_id", flat=True)
    )
    assert admin.id not in set(Rubric.objects.filter(case_version=clone).values_list("created_by_id", flat=True))


def test_cada_entidad_del_clon_cuelga_del_clon_y_no_de_la_fuente(admin, fuente):
    clone = _clone(admin, fuente)

    for model in (SimulationNode, DecisionOption, SceneMap, ClinicalTool, Rubric):
        assert set(model.objects.filter(case_version=clone).values_list("id", flat=True)).isdisjoint(
            model.objects.filter(case_version=fuente).values_list("id", flat=True)
        )
    for decision in DecisionOption.objects.filter(case_version=clone):
        assert decision.source_node.case_version_id == clone.id
        assert decision.target_node.case_version_id == clone.id
    for obj in MapObject.objects.filter(scene_map__case_version=clone).exclude(decision_option=None):
        assert obj.scene_map.case_version_id == clone.id
        assert obj.decision_option.case_version_id == clone.id
    for tree in DialogueTree.objects.filter(scene_map__case_version=clone).exclude(map_object=None):
        assert tree.map_object.scene_map.case_version_id == clone.id
    for choice in DialogueChoice.objects.filter(dialogue_tree__scene_map__case_version=clone).exclude(
        decision_option=None
    ):
        assert choice.decision_option.case_version_id == clone.id


def test_clonar_no_modifica_la_version_publicada(admin, fuente):
    def snapshot():
        return {
            model.__name__: [
                tuple(sorted(_plain_values(row, model, set()).items(), key=lambda kv: kv[0]))
                for row in _rows(model, fuente.id)
            ]
            for model in ENTITIES
        }

    antes = snapshot()
    version_antes = CaseVersion.objects.filter(pk=fuente.pk).values().get()

    _clone(admin, fuente)

    assert snapshot() == antes
    assert CaseVersion.objects.filter(pk=fuente.pk).values().get() == version_antes
