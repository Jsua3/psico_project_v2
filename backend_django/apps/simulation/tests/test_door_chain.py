"""Pruebas de las costuras que introduce P-08a (cadena de responsabilidad de las puertas).

Sin base de datos: cada eslabón se prueba solo, con contextos simulados, y la
cadena se prueba con eslabones espía. El comportamiento completo de
``_validate_door`` lo fija ``test_door_validation_contract``.
"""
import json
from types import SimpleNamespace

import pytest
from rest_framework.exceptions import NotFound, ValidationError

from apps.simulation.services import door_chain
from apps.simulation.services.door_chain import (
    DEFAULT_LOCKED_MESSAGE,
    DoorContext,
    DoorExistsRule,
    DoorNearbyRule,
    DoorRule,
    DoorTargetRule,
    RequiresInspectedRule,
    RequiresNodesRule,
    RequiresNpcsRule,
    RequiresToolsRule,
    build_door_chain,
)


def _ctx(meta=None, **state):
    base = dict(inspected_object_keys_json="[]", inventory_json="[]", flags_json="{}", scene_map_id=1)
    base.update(state)
    return DoorContext(
        attempt=SimpleNamespace(current_node=SimpleNamespace(node_key="nodo-a")),
        state=SimpleNamespace(**base),
        door_key="puerta",
        target_node_key="destino",
        door=SimpleNamespace(),
        meta=meta or {},
    )


# ─── La cadena ───────────────────────────────────────────────────────────────
def test_el_orden_de_la_cadena_es_el_contractual():
    rule, order = build_door_chain(lambda *a: None), []
    while rule is not None:
        order.append(type(rule))
        rule = rule._next

    assert order == [
        DoorExistsRule, DoorTargetRule, DoorNearbyRule,
        RequiresInspectedRule, RequiresToolsRule, RequiresNodesRule, RequiresNpcsRule,
    ]


class _Espia(DoorRule):
    def __init__(self, log, name, fail=False):
        super().__init__()
        self.log, self.name, self.fail = log, name, fail

    def check(self, ctx):
        self.log.append(self.name)
        if self.fail:
            raise ValidationError(self.name)


def test_set_next_devuelve_el_eslabon_agregado_y_se_recorre_en_orden():
    log = []
    a, b, c = _Espia(log, "a"), _Espia(log, "b"), _Espia(log, "c")
    assert a.set_next(b) is b
    b.set_next(c)

    a.handle(_ctx())

    assert log == ["a", "b", "c"]


def test_el_primer_eslabon_que_falla_corta_la_cadena():
    log = []
    a, b, c = _Espia(log, "a"), _Espia(log, "b", fail=True), _Espia(log, "c")
    a.set_next(b).set_next(c)

    with pytest.raises(ValidationError):
        a.handle(_ctx())

    assert log == ["a", "b"]


def test_se_puede_agregar_una_regla_nueva_sin_tocar_las_demas():
    class SoloDeDia(DoorRule):
        def check(self, ctx):
            raise ValidationError("Solo de día")

    chain = RequiresToolsRule()
    chain.set_next(SoloDeDia())

    with pytest.raises(ValidationError, match="Solo de día"):
        chain.handle(_ctx())


# ─── Eslabones estructurales ─────────────────────────────────────────────────
def test_la_puerta_inexistente_lanza_not_found_y_nombra_la_puerta(monkeypatch):
    monkeypatch.setattr(door_chain.MapObject, "objects", SimpleNamespace(
        filter=lambda **kw: SimpleNamespace(first=lambda: None)))

    with pytest.raises(NotFound, match="La puerta no existe en la sala actual: puerta"):
        DoorExistsRule().check(_ctx())


def test_la_puerta_existente_deja_su_objeto_y_su_metadata_en_el_contexto(monkeypatch):
    door = SimpleNamespace(metadata_json=json.dumps({"targetNodeKey": "destino"}))
    monkeypatch.setattr(door_chain.MapObject, "objects", SimpleNamespace(
        filter=lambda **kw: SimpleNamespace(first=lambda: door)))
    ctx = _ctx()

    DoorExistsRule().check(ctx)

    assert ctx.door is door and ctx.meta == {"targetNodeKey": "destino"}


def test_el_destino_distinto_lanza_validacion():
    with pytest.raises(ValidationError, match="La puerta no conduce a la sala solicitada"):
        DoorTargetRule().check(_ctx({"targetNodeKey": "otro"}))


def test_el_destino_correcto_pasa():
    DoorTargetRule().check(_ctx({"targetNodeKey": "destino"}))


def test_la_cercania_se_delega_en_la_funcion_inyectada():
    llamadas = []
    ctx = _ctx()

    DoorNearbyRule(lambda state, door, what: llamadas.append((state, door, what))).check(ctx)

    assert llamadas == [(ctx.state, ctx.door, "la puerta")]


# ─── Eslabones de condiciones ────────────────────────────────────────────────
def test_mensaje_de_bloqueo_por_defecto_y_personalizado():
    assert _ctx().locked_message == DEFAULT_LOCKED_MESSAGE
    assert _ctx({"lockedMessage": "Necesitas la llave"}).locked_message == "Necesitas la llave"


@pytest.mark.parametrize("rule,key,state_field,ok_value", [
    (RequiresInspectedRule, "requiresInspected", "inspected_object_keys_json", '["archivo"]'),
    (RequiresToolsRule, "requiresTools", "inventory_json", '["llave"]'),
])
def test_condiciones_de_lista_fallan_si_falta_y_pasan_si_esta(rule, key, state_field, ok_value):
    meta = {key: ["archivo", "llave"], "lockedMessage": "Bloqueada por X"}
    with pytest.raises(ValidationError, match="Bloqueada por X"):
        rule().check(_ctx(meta))

    # con todo lo requerido presente no lanza
    ok = _ctx({key: json.loads(ok_value)}, **{state_field: ok_value})
    rule().check(ok)


def test_requires_nodes_solo_se_exige_si_la_lista_no_esta_vacia():
    RequiresNodesRule().check(_ctx({"requiresNodes": []}))
    RequiresNodesRule().check(_ctx({"requiresNodes": ["nodo-a", "nodo-b"]}))
    with pytest.raises(ValidationError, match=DEFAULT_LOCKED_MESSAGE):
        RequiresNodesRule().check(_ctx({"requiresNodes": ["nodo-z"]}))


@pytest.mark.parametrize("flags", ["{}", '{"viewedNpcKeys": "no-es-lista"}', '{"viewedNpcKeys": ["otro"]}'])
def test_requires_npcs_falla_si_no_se_vio_al_npc(flags):
    with pytest.raises(ValidationError, match=DEFAULT_LOCKED_MESSAGE):
        RequiresNpcsRule().check(_ctx({"requiresNpcs": ["dra"]}, flags_json=flags))


def test_requires_npcs_pasa_si_se_vio_al_npc():
    RequiresNpcsRule().check(_ctx({"requiresNpcs": ["dra"]}, flags_json='{"viewedNpcKeys": ["dra"]}'))
