"""La marca «sugerido por la IA» (P5): contarla y bajarla cuando la persona que autora revisa la parte.

Lo que propone el asistente entra al caso con ``ai_suggested = True`` (nodo, decisión, objeto, línea de diálogo o
final) y esa marca **bloquea el envío a revisión y la aprobación** (``gate``) hasta que alguien la baja. Se baja
con ``accept_*``: es la única manera de decir «esta parte la revisé», aparte de reescribirla con ``aiSuggested: false``
(los finales se aceptan con ``PUT …/rules/endings``). Cada aceptación avanza la revisión del caso y devuelve el editor.
"""
from django.db import transaction

from apps.simulation.models import DecisionOption, DialogueLine, DialogueTree, MapObject, SimulationNode
from apps.simulation.services import case_rules

from .editor_view import editor
from .guards import bump_revision, ensure_draft, in_version


def ai_suggested_count(version):
    """Cuántas partes de la versión siguen marcadas como sugeridas por la IA (nodos, decisiones, objetos, líneas y finales)."""
    version_id = version.id
    endings = sum(1 for ending in case_rules.rules_of(version).endings if ending.get("aiSuggested"))
    return (
        SimulationNode.objects.filter(case_version_id=version_id, ai_suggested=True).count()
        + DecisionOption.objects.filter(case_version_id=version_id, ai_suggested=True).count()
        + MapObject.objects.filter(scene_map__case_version_id=version_id, ai_suggested=True).count()
        + DialogueLine.objects.filter(dialogue_tree__scene_map__case_version_id=version_id, ai_suggested=True).count()
        + endings
    )


def _accept(model, element_id, case_version_id, revision, lower):
    """Baja la marca del elemento ``element_id`` (404 si no existe, 400 si es de otra versión); idempotente."""
    ensure_draft(case_version_id, revision)
    element = in_version(model, element_id, case_version_id)
    lower(element)
    bump_revision(case_version_id)
    return editor(case_version_id)


def _lower_on_row(element):
    if element.ai_suggested:
        element.ai_suggested = False
        element.save(update_fields=["ai_suggested"])


def _lower_on_lines(tree):
    DialogueLine.objects.filter(dialogue_tree_id=tree.id, ai_suggested=True).update(ai_suggested=False)


@transaction.atomic
def accept_node(case_version_id, node_id, revision=None):
    return _accept(SimulationNode, node_id, case_version_id, revision, _lower_on_row)


@transaction.atomic
def accept_decision(case_version_id, decision_id, revision=None):
    return _accept(DecisionOption, decision_id, case_version_id, revision, _lower_on_row)


@transaction.atomic
def accept_object(case_version_id, object_id, revision=None):
    return _accept(MapObject, object_id, case_version_id, revision, _lower_on_row)


@transaction.atomic
def accept_dialogue(case_version_id, tree_id, revision=None):
    """Baja la marca de **todas** las líneas del diálogo: la API las trata por árbol."""
    return _accept(DialogueTree, tree_id, case_version_id, revision, _lower_on_lines)
