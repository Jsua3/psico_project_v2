"""``x-siep``: lo que SIEP añade al DSL del taller (R7 y R10 de E4).

La base del documento (``export.to_base_document``) lleva lo que el esquema del taller puede
expresar. Aquí va el resto, **sin duplicarlo**: cada entidad que está en la base se enlaza por su
``id`` de DSL y lleva solo sus extras; las que no caben (un personaje sin rol, una herramienta sin
descripción, una escena que solo se alcanza por una puerta, una rúbrica sin criterios usables) van
completas y sin ``id``. Todas las listas siguen el orden del modelo. Dentro del mundo, las
referencias van por la **clave del producto** (opción, personaje, herramienta, objeto).
"""
from .vocabulary import CLASSIFICATION_OF_CLASS, COMMENT_KEYS, ResponseClass

#: La versión base del documento: la 2.0 describe las respuestas por clase, hitos y persona (sin puntaje, estrés ni
#: penalización). El importador aún lee la 1.0 y la convierte (``casedef.legacy``).
BASE_VERSION = "2.0"
#: La 2.1 añade ``requiere`` y ``reaccion`` por opción y ``objetivo`` por escena. Solo se escribe si el caso los usa:
#: un caso sin ellos se exporta igual que en la 2.0 (la huella sellada de las versiones publicadas no cambia).
VERSION = "2.1"
#: La 2.2 añade ``mapa.estructura`` (la sala armada por piezas). Mismo criterio que la 2.1: solo la lleva un caso que la
#: usa, así que la huella sellada de las versiones ya publicadas no cambia.
STRUCTURE_VERSION = "2.2"


def _text(value):
    return value.strip() if isinstance(value, str) else ""


def version_of(definition):
    """``"2.2"`` si algún mapa trae ``structure``; si no, ``"2.1"`` si alguna opción trae ``requires`` o ``reaction`` o
    alguna escena trae ``goal`` o ``comments``; si no, ``"2.0"``."""
    if any(scene.world is not None and scene.world.structure is not None for scene in definition.scenes):
        return STRUCTURE_VERSION
    for scene in definition.scenes:
        if _text(scene.goal) or scene.comments:
            return VERSION
        if any(option.requires or option.reaction for option in scene.options):
            return VERSION
    return BASE_VERSION


def _character_entries(definition, ids):
    entries = []
    for character in definition.characters:
        entry = {
            "clave": character.key, "retrato": character.portrait_key,
            "enFicha": character.show_in_brief, "orden": character.display_order,
        }
        if character.key in ids.character:
            entry["id"] = ids.character[character.key]
        else:
            entry["nombre"] = character.display_name
            entry["rol"] = character.role_label
        entries.append(entry)
    return entries


def _tool_entries(definition, ids):
    entries = []
    for tool in definition.tools:
        entry = {"codigo": tool.code, "icono": tool.icon, "activa": tool.active}
        if tool.code in ids.tool:
            entry["id"] = ids.tool[tool.code]
        else:
            entry["etiqueta"] = tool.label
            entry["descripcion"] = tool.description
            entry["categoria"] = tool.category
        entries.append(entry)
    return entries


def _option_entry(option, scene_key, ids):
    entry = {
        "clave": option.key, "clase": option.response_class,
        "retroalimentacionInmediata": option.immediate_feedback, "efectos": option.effects,
    }
    option_id = ids.option.get((scene_key, option.key))
    if option_id:
        entry["id"] = option_id
        if (scene_key, option.key) not in ids.feedback:  # sin entrada propia en la base: el texto suelto viaja aquí
            if _text(option.feedback_text):
                entry["mensaje"] = option.feedback_text
            if _text(option.theory_basis):
                entry["fundamento"] = option.theory_basis
    else:
        entry.update({
            "texto": option.text, "destino": option.target,
            "clasificacion": CLASSIFICATION_OF_CLASS[ResponseClass(option.response_class)],
            "prohibida": option.response_class == ResponseClass.CONTRAINDICATED, "motivo": option.reason, "consecuencia": option.consequence,
            "mensaje": option.feedback_text, "fundamento": option.theory_basis,
        })
    if option.requires:
        entry["requiere"] = option.requires
    if option.reaction:
        entry["reaccion"] = option.reaction
    return entry


def _comment_entry(comment):
    values = {
        "personaje": comment.character, "linea": comment.line, "cuando": comment.when,
        "emocion": comment.emotion, "gesto": comment.gesture,
    }
    return {key: values[key] for key in COMMENT_KEYS if values[key]}


def _object_entry(obj):
    return {
        "clave": obj.key, "etiqueta": obj.label, "tipo": obj.type, "x": obj.x, "y": obj.y,
        "ancho": obj.width, "alto": obj.height, "z": obj.z_index, "orientacion": obj.facing,
        "color": obj.color_hex, "icono": obj.icon, "codigoCorto": obj.short_code,
        "colision": obj.collision, "visible": obj.visible, "indicacion": obj.interaction_prompt,
        "texto": obj.interaction_text, "opcion": obj.option, "personaje": obj.character,
        "herramienta": obj.tool_code, "desbloqueo": obj.unlock_condition,
        "movimiento": obj.movement_pattern, "metadatos": obj.metadata,
    }


def _dialogue_entry(tree):
    return {
        "clave": tree.key, "hablante": tree.speaker, "retrato": tree.portrait_key, "emocion": tree.emotion,
        "objeto": tree.object_key,
        "lineas": [
            {"orden": line.order, "hablante": line.speaker, "texto": line.text, "emocion": line.emotion}
            for line in tree.lines
        ],
        "elecciones": [
            {
                "clave": choice.key, "texto": choice.text, "opcion": choice.option,
                "herramientaRequerida": choice.required_tool, "efecto": choice.effect, "orden": choice.order,
            }
            for choice in tree.choices
        ],
    }


def _world_entry(world):
    entry = {
        "clave": world.key, "titulo": world.title, "ancho": world.width, "alto": world.height,
        "tema": world.theme, "aparicion": {"x": world.spawn_x, "y": world.spawn_y},
        "ambiente": world.ambient,
    }
    if world.structure is not None:  # solo la sala por piezas (2.2): una de imagen fija se exporta igual que antes
        entry["estructura"] = world.structure
    return {
        **entry,
        "colisiones": [
            {"clave": z.key, "etiqueta": z.label, "x": z.x, "y": z.y, "ancho": z.width, "alto": z.height}
            for z in world.collisions
        ],
        "objetos": [_object_entry(obj) for obj in world.objects],
        "dialogos": [_dialogue_entry(tree) for tree in world.dialogues],
    }


def _scene_entry(scene, ids):
    in_base = scene.key in ids.scene
    entry = {
        "clave": scene.key, "inicial": scene.start, "terminal": scene.terminal,
        "salidaSeguraObligatoria": scene.safe_exit_required, "intensidad": scene.intensity,
        "apoyo": list(scene.support),
        "herramientasRequeridas": list(scene.required_tools), "posicion": {"x": scene.x, "y": scene.y},
        "opciones": [_option_entry(option, scene.key, ids) for option in scene.options],
    }
    if in_base:
        entry["id"] = ids.scene[scene.key]
        if scene.options and not _text(scene.prompt):
            entry["preguntaDerivada"] = True
        if not scene.options and scene.hints:  # sin decisión en la base no hay dónde llevar las pistas
            entry["pistas"] = list(scene.hints)
    else:
        entry.update({
            "titulo": scene.title, "descripcion": scene.narrative, "sensible": scene.sensitive,
            "advertencia": scene.warning, "pregunta": scene.prompt, "pistas": list(scene.hints),
        })
    if _text(scene.goal):
        entry["objetivo"] = scene.goal
    if scene.comments:
        entry["comentarios"] = [_comment_entry(comment) for comment in scene.comments]
    if scene.world is not None:
        entry["mapa"] = _world_entry(scene.world)
    return entry


def _criterion_entry(criterion, rubric_index, criterion_index, ids):
    entry = {
        "puntajeMaximo": criterion.max_score, "peso": criterion.weight, "activo": criterion.active,
    }
    criterion_id = ids.criterion.get((rubric_index, criterion_index))
    if criterion_id:
        entry["id"] = criterion_id
    else:
        entry.update({
            "competencia": criterion.competency, "titulo": criterion.title,
            "descripcion": criterion.description,
        })
    if criterion.competency_code:
        entry["competenciaCodigo"] = criterion.competency_code
    if criterion.level_descriptors:
        # Solo si el autor escribió alguno: un criterio sin descriptores propios no cambia el documento de siempre.
        entry["descriptoresNivel"] = dict(criterion.level_descriptors)
    return entry


def _rubric_entries(definition, ids):
    entries = []
    for index, rubric in enumerate(definition.rubrics):
        entry = {
            "criterios": [
                _criterion_entry(criterion, index, c_index, ids)
                for c_index, criterion in enumerate(rubric.criteria)
            ]
        }
        if index in ids.rubric:
            entry["id"] = ids.rubric[index]
        else:
            entry.update({
                "nombre": rubric.name, "descripcion": rubric.description,
                "version": rubric.version, "activa": rubric.active,
            })
        entries.append(entry)
    return entries


def build(definition, ids):
    """La sección ``x-siep`` de ``definition`` (la base ya fijó los ``ids``)."""
    siep = {
        "version": version_of(definition),
        "mundoVersion": definition.world_schema_version,
        "reglas": definition.rules,
        "personajes": _character_entries(definition, ids),
        "herramientas": _tool_entries(definition, ids),
        "escenas": [_scene_entry(scene, ids) for scene in definition.scenes],
        "rubricas": _rubric_entries(definition, ids),
    }
    if _text(definition.context):
        siep["contexto"] = definition.context
        if not _text(definition.description):
            siep["descripcionDerivada"] = True  # la base lleva el contexto como descripción: no se guarda como tal
    if definition.content_warnings:
        siep["temasSensibles"] = list(definition.content_warnings)  # RK-7: solo si el caso declara alguno
    return siep
