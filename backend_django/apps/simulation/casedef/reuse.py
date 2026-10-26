"""La reutilización de un clon (E4-7, R22): cuánto del original sobrevive idéntico.

Se mide sobre el **modelo** y no sobre el documento: los ids de DSL se asignan por posición y renumerarlos al
insertar una escena no cuenta como cambio de las demás. Una entidad es «la misma» si está en los dos con la
misma clase y la misma clave del producto, e «idéntica» si además todos sus campos coinciden. La razón es las
idénticas entre la **mayor** de las dos cantidades de entidades (la del origen y la del clon): lo añadido, lo
cambiado y lo borrado la bajan. Las clases son los personajes, las herramientas, las escenas, las opciones, las
pistas, los mapas, los objetos, las colisiones, los diálogos y los criterios de las rúbricas.
"""
from fractions import Fraction


def _scene(scene):
    return (
        scene.title, scene.narrative, scene.sensitive, scene.warning, scene.start, scene.terminal, scene.support,
        scene.required_tools, scene.safe_exit_required, scene.intensity, scene.x, scene.y, scene.prompt,
    )


def _option(option):
    return (
        option.text, option.target, option.classification, option.prohibited, option.reason, option.consequence,
        option.immediate_feedback, option.feedback_text, option.theory_basis,
        option.response_class, option.effects,
    )


def _object(obj):
    return (
        obj.label, obj.type, obj.x, obj.y, obj.width, obj.height, obj.z_index, obj.facing, obj.color_hex, obj.icon,
        obj.short_code, obj.collision, obj.visible, obj.interaction_prompt, obj.interaction_text, obj.option,
        obj.character, obj.tool_code, obj.unlock_condition, obj.movement_pattern, obj.metadata,
    )


def _dialogue(tree):
    return (
        tree.speaker, tree.portrait_key, tree.emotion, tree.object_key,
        tuple((line.order, line.speaker, line.text, line.emotion) for line in tree.lines),
        tuple((c.key, c.text, c.option, c.required_tool, c.effect, c.order) for c in tree.choices),
    )


def entities(definition):
    """``{(clase, identidad): huella}`` de las entidades que cuentan para la reutilización."""
    found = {}
    for c in definition.characters:
        found[("personaje", c.key)] = (c.display_name, c.role_label, c.portrait_key, c.show_in_brief, c.display_order)
    for t in definition.tools:
        found[("herramienta", t.code)] = (t.label, t.icon, t.category, t.description, t.active)
    for scene in definition.scenes:
        found[("escena", scene.key)] = _scene(scene)
        for option in scene.options:
            found[("opción", (scene.key, option.key))] = _option(option)
        for position, hint in enumerate(scene.hints):
            found[("pista", (scene.key, position))] = hint
        world = scene.world
        if world is None:
            continue
        found[("mapa", world.key)] = (
            scene.key, world.title, world.width, world.height, world.theme, world.spawn_x, world.spawn_y, world.ambient,
        )
        for zone in world.collisions:
            found[("colisión", (world.key, zone.key))] = (zone.label, zone.x, zone.y, zone.width, zone.height)
        for obj in world.objects:
            found[("objeto", (world.key, obj.key))] = _object(obj)
        for tree in world.dialogues:
            found[("diálogo", (world.key, tree.key))] = _dialogue(tree)
    for rubric in definition.rubrics:
        for c in rubric.criteria:
            found[("criterio", (rubric.name, c.title))] = (
                c.competency, c.description, c.max_score, c.weight, c.active, c.competency_code,
            )
    return found


def reuse_ratio(source, clone):
    """``Fraction`` entre 0 y 1: lo idéntico entre la mayor de las dos cantidades; ``None`` si ambos están vacíos."""
    before, after = entities(source), entities(clone)
    total = max(len(before), len(after))
    if total == 0:
        return None
    identical = sum(1 for identity, fingerprint in after.items() if before.get(identity) == fingerprint)
    return Fraction(identical, total)
