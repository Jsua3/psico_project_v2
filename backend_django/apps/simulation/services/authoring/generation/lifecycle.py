"""C1 · Ciclo de vida de una generación por etapas. Python puro: no toca el ORM, recibe datos.

::

    created --skeleton--> skeleton_ready --(cada escena)--> scenes_ready --assemble--> imported | failed | needs_repair
    needs_repair --repair_scene (las escenas marcadas)--> scenes_ready
    cualquier estado no terminal --cancel--> cancelled

Los valores de estado se repiten aquí como cadenas (el modelo no se importa para no arrastrar Django); una prueba
vigila que coincidan con ``GenerationStatus``.
"""
from datetime import datetime, timedelta
from typing import Literal

CREATED = "created"
SKELETON_READY = "skeleton_ready"
SCENES_READY = "scenes_ready"
NEEDS_REPAIR = "needs_repair"
IMPORTED = "imported"
FAILED = "failed"
CANCELLED = "cancelled"

IN_PROGRESS = (CREATED, SKELETON_READY, SCENES_READY, NEEDS_REPAIR)
TERMINAL = (IMPORTED, FAILED, CANCELLED)

# Rondas de reparación que admite el ensamblado antes de importar con las faltas editoriales o fallar.
# Lo lee ``assembly.assemble``; bajarlo a 1 es el recorte de la sección 6 del plan.
MAX_REPAIR_ROUNDS = 2

STALE_SECONDS = 150
ABANDONED_HOURS = 24

Transition = Literal["skeleton", "scene", "repair_scene", "assemble", "cancel"]

# Estados desde los que se admite cada transición.
_ALLOWED: dict[str, tuple[str, ...]] = {
    "skeleton": (CREATED,),
    "scene": (SKELETON_READY,),
    "repair_scene": (NEEDS_REPAIR,),
    "assemble": (SCENES_READY,),
    "cancel": IN_PROGRESS,
}


def can(status: str, transition: Transition) -> bool:
    return status in _ALLOWED.get(transition, ())


def after_scene(scenes: dict, order: list[str]) -> str:
    """``scenes_ready`` cuando cada escena del esqueleto (``order``) está ``done``; si no, ``skeleton_ready``."""
    if order and all((scenes.get(key) or {}).get("state") == "done" for key in order):
        return SCENES_READY
    return SKELETON_READY


def is_stale(started_at: datetime | None, now: datetime, seconds: int = STALE_SECONDS) -> bool:
    """Una etapa «en curso» desde hace ``seconds`` o más se considera abandonada y se puede pedir de nuevo."""
    return started_at is not None and now - started_at >= timedelta(seconds=seconds)


def is_abandoned(updated_at: datetime, now: datetime, hours: int = ABANDONED_HOURS) -> bool:
    """Una generación sin cambios desde hace ``hours`` o más se cancela sola."""
    return now - updated_at >= timedelta(hours=hours)
