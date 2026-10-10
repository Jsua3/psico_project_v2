"""Validación de puertas como cadena de responsabilidad (Chain of Responsibility).

Cada regla es un eslabón (``DoorRule``) que revisa UNA cosa de la puerta y, si
se cumple, pasa la petición al siguiente. La primera que no se cumple lanza su
error y corta la cadena. El orden importa y es el contrato: que la puerta
exista, que conduzca al destino, que el jugador esté cerca y, al final, las
condiciones ``requires*`` de su metadata.

Para agregar una condición nueva basta con crear un eslabón y ponerlo en
``build_door_chain``; ``world_service`` no se toca.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from rest_framework.exceptions import NotFound, ValidationError

from shared.jsonutils import read_map, read_string_list

from ..models import MapObject

DEFAULT_LOCKED_MESSAGE = "La puerta está bloqueada."


@dataclass
class DoorContext:
    """Lo que viaja por la cadena: la petición y lo que los eslabones van resolviendo."""

    attempt: object
    state: object
    door_key: str
    target_node_key: str
    door: object = None
    meta: dict = field(default_factory=dict)

    @property
    def locked_message(self) -> str:
        return self.meta.get("lockedMessage") or DEFAULT_LOCKED_MESSAGE


class DoorRule(ABC):
    """Eslabón: revisa una regla y delega en el siguiente."""

    def __init__(self):
        self._next = None

    def set_next(self, rule: "DoorRule") -> "DoorRule":
        """Encadena ``rule`` después de este eslabón y la devuelve (para seguir encadenando)."""
        self._next = rule
        return rule

    def handle(self, ctx: DoorContext) -> None:
        self.check(ctx)
        if self._next is not None:
            self._next.handle(ctx)

    @abstractmethod
    def check(self, ctx: DoorContext) -> None:
        """Lanza el error de la regla si no se cumple; si se cumple, no hace nada."""


class DoorExistsRule(DoorRule):
    def check(self, ctx):
        door = MapObject.objects.filter(
            scene_map_id=ctx.state.scene_map_id, object_key=ctx.door_key, object_type="EXIT"
        ).first()
        if not door:
            raise NotFound(f"La puerta no existe en la sala actual: {ctx.door_key}")
        ctx.door = door
        ctx.meta = read_map(door.metadata_json)


class DoorTargetRule(DoorRule):
    def check(self, ctx):
        if ctx.meta.get("targetNodeKey") != ctx.target_node_key:
            raise ValidationError("La puerta no conduce a la sala solicitada")


class DoorNearbyRule(DoorRule):
    """El jugador debe estar al alcance; la medida la da quien construye la cadena."""

    def __init__(self, require_nearby):
        super().__init__()
        self._require_nearby = require_nearby

    def check(self, ctx):
        self._require_nearby(ctx.state, ctx.door, "la puerta")


class RequiresInspectedRule(DoorRule):
    def check(self, ctx):
        inspected = set(read_string_list(ctx.state.inspected_object_keys_json))
        for required in ctx.meta.get("requiresInspected") or []:
            if required not in inspected:
                raise ValidationError(ctx.locked_message)


class RequiresToolsRule(DoorRule):
    def check(self, ctx):
        inventory = set(read_string_list(ctx.state.inventory_json))
        for required in ctx.meta.get("requiresTools") or []:
            if required not in inventory:
                raise ValidationError(ctx.locked_message)


class RequiresNodesRule(DoorRule):
    def check(self, ctx):
        required_nodes = ctx.meta.get("requiresNodes") or []
        if required_nodes and ctx.attempt.current_node.node_key not in required_nodes:
            raise ValidationError(ctx.locked_message)


class RequiresNpcsRule(DoorRule):
    def check(self, ctx):
        flags = read_map(ctx.state.flags_json)
        viewed_npcs = flags.get("viewedNpcKeys")
        viewed_npcs = set(viewed_npcs) if isinstance(viewed_npcs, list) else set()
        for required in ctx.meta.get("requiresNpcs") or []:
            if required not in viewed_npcs:
                raise ValidationError(ctx.locked_message)


def build_door_chain(require_nearby) -> DoorRule:
    """Arma la cadena en el orden contractual y devuelve el primer eslabón."""
    first = DoorExistsRule()
    (
        first
        .set_next(DoorTargetRule())
        .set_next(DoorNearbyRule(require_nearby))
        .set_next(RequiresInspectedRule())
        .set_next(RequiresToolsRule())
        .set_next(RequiresNodesRule())
        .set_next(RequiresNpcsRule())
    )
    return first
