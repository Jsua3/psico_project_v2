"""La sala mínima jugable de una escena que el documento no trae (E4-5, R16).

Un documento del taller solo describe escenas, decisiones y opciones; el juego necesita una sala por
escena. ``default_world`` arma la más pequeña que se puede jugar (taller, fase 3 §7.4): un mapa, quien
presenta la escena, el diálogo con la pregunta y **una elección por opción**, y una salida segura. Es la
misma sala para el mismo texto: nada al azar, para que importar dos veces dé lo mismo.
"""
from .model import DialogueChoice, DialogueLine, DialogueTree, World, WorldObject

WIDTH, HEIGHT = 960, 540
THEME = "clinical-soft"
SPAWN = (145, 430)
#: A lo sumo cuatro personas en la sala: caben en la fila y el límite de objetos por mapa queda lejos.
MAX_PEOPLE = 4
PRESENTER_KEY = "presentador"
EXIT_KEY = "salida"
DIALOGUE_KEY = "dialogo"
NARRATOR = "Narrador"


def _slug(text):
    clean = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in str(text).lower()).strip("-")
    return clean or "escena"


def _person(key, label, character, order):
    return WorldObject(
        key=key, label=label, type="PERSON", x=360 + 90 * order, y=250, width=48, height=48,
        interaction_prompt="Hablar", character=character,
    )


def default_world(scene_key, title, text, options, participants=()):
    """La sala de una escena: ``options`` son sus ``Option`` y ``participants`` pares ``(clave, nombre)``.

    ``text`` es lo que dice quien presenta: la pregunta de la decisión o, si la escena no tiene
    opciones, su narración. Quien presenta es la primera persona de la escena (o «Narrador»).
    """
    people = list(participants)[:MAX_PEOPLE]
    speaker_character, speaker = people[0] if people else (None, NARRATOR)
    objects = [_person(PRESENTER_KEY, speaker, speaker_character, 0)]
    objects += [
        _person(f"persona-{n}", name, character, n) for n, (character, name) in enumerate(people[1:], start=1)
    ]
    objects.append(
        WorldObject(
            key=EXIT_KEY, label="Salida segura", type="EXIT", x=840, y=440, width=48, height=64,
            interaction_prompt="Salir",
        )
    )
    dialogues = ()
    if options:
        dialogues = (
            DialogueTree(
                key=DIALOGUE_KEY, speaker=speaker, object_key=PRESENTER_KEY,
                lines=(DialogueLine(order=1, speaker=speaker, text=text),),
                choices=tuple(
                    DialogueChoice(key=f"eleccion-{n}", text=option.text, option=option.key, order=n)
                    for n, option in enumerate(options, start=1)
                ),
            ),
        )
    else:  # una escena final no pregunta: quien la presenta dice su cierre al hablarle
        objects[0] = WorldObject(**{**objects[0].__dict__, "interaction_text": text})
    return World(
        key=f"sala-{_slug(scene_key)}", title=title or scene_key, width=WIDTH, height=HEIGHT, theme=THEME,
        spawn_x=SPAWN[0], spawn_y=SPAWN[1], objects=tuple(objects), dialogues=dialogues,
    )
