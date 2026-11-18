"""Los largos de lectura: avisos (nunca errores) para los textos que obligarían a desplazarse para leerlos.

La pantalla del juego muestra la narración en un panel bajo y la conversación en un cuadro con las cuatro respuestas: un
texto largo obliga a la persona estudiante a desplazarse para leer o para ver las respuestas C y D. Cada tipo de texto que
se lee al jugar tiene un **tope de lectura**, medido sobre el caso insignia SIM-VBG-002 (lo que se lee cómodo) y sobre los
casos generados con la IA (``.superpowers/noche-2026-11-14/largos-de-texto.md``). Pasarlo es un aviso que la docente ve en
la revisión con el texto concreto; el caso se importa, se edita y se publica igual. Los topes duros (``text_check``,
``limits``) siguen siendo los de siempre.

``TOPES`` es la fuente única: la instrucción de la generación (``generation/prompts.py``) dice estos mismos números.
"""
from . import messages
from .report import PREFIX, WARNING, Issue
from .text_check import strings

CODE = PREFIX + "READING_LENGTH"

#: Tipo de texto → tope de lectura en caracteres.
TOPES = {
    "narración": 300,
    "parlamento": 200,
    "pregunta": 160,
    "opción": 140,
    "consecuencia": 240,
    "reacción": 160,
    "comentario": 120,
    "pista": 140,
}

#: Final de la ruta (``*`` por cada posición de lista) → tipo de texto. Una ruta que empieza en ``escenas`` es de la base;
#: las demás se buscan como sufijo, así que valen en ``x-siep.escenas`` y en los mapas por piezas.
_DE_LA_BASE = {
    ("escenas", "*", "descripcion"): "narración",
}
_SUFIJOS = (
    (("dialogos", "*", "lineas", "*", "texto"), "parlamento"),
    (("decision", "pregunta"), "pregunta"),
    (("x-siep", "escenas", "*", "pregunta"), "pregunta"),
    (("decision", "opciones", "*", "texto"), "opción"),
    (("dialogos", "*", "elecciones", "*", "texto"), "opción"),
    (("decision", "opciones", "*", "consecuencia"), "consecuencia"),
    (("opciones", "*", "retroalimentacionInmediata"), "consecuencia"),
    (("x-siep", "escenas", "*", "opciones", "*", "mensaje"), "consecuencia"),
    (("opciones", "*", "reaccion", "linea"), "reacción"),
    (("comentarios", "*", "linea"), "comentario"),
    (("decision", "pistas", "*"), "pista"),
    (("x-siep", "escenas", "*", "pistas", "*"), "pista"),
)

# BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
_NOMBRE = {
    "narración": "la narración", "parlamento": "este parlamento", "pregunta": "la pregunta", "opción": "esta respuesta",
    "consecuencia": "esta retroalimentación", "reacción": "esta reacción", "comentario": "este comentario",
    "pista": "esta pista",
}
_CONSEJO = {
    "narración": "cuenta solo lo que se ve al llegar y deja lo demás a los personajes y a los objetos",
    "parlamento": "repártelo en varios turnos cortos del mismo personaje",
    "pregunta": "déjala en una sola pregunta corta",
    "opción": "déjala en una o dos líneas para que las cuatro respuestas se vean sin desplazarse",
    "consecuencia": "quédate con lo que la respuesta logra o daña, en dos frases",
    "reacción": "déjala en una frase corta",
    "comentario": "déjalo en una frase",
    "pista": "déjala en una frase breve",
}
EXTRACTO = 60


def tipo_de(shape: tuple) -> str | None:
    """El tipo de texto de una ruta (con ``*``), o ``None`` si no es un texto que se lee al jugar."""
    if shape in _DE_LA_BASE:
        return _DE_LA_BASE[shape]
    for sufijo, tipo in _SUFIJOS:
        if shape[-len(sufijo):] == sufijo:
            return tipo
    return None


def _extracto(texto: str) -> str:
    plano = " ".join(texto.split())
    return plano if len(plano) <= EXTRACTO else plano[:EXTRACTO].rstrip() + "…"


def mensaje(tipo: str, largo: int, texto: str, lugar: str = "") -> str:
    """El aviso llano: dónde, cuánto mide, hasta cuánto se lee cómodo, qué hacer y cómo empieza el texto."""
    cuerpo = (
        f"{_NOMBRE[tipo]} tiene {largo} caracteres y en la pantalla del juego se lee cómodo hasta {TOPES[tipo]}; "
        f"{_CONSEJO[tipo]}. Empieza así: «{_extracto(texto)}»"
    )
    frase = f"{lugar}: {cuerpo}" if lugar else cuerpo
    return frase[:1].upper() + frase[1:]


def _lista(valor) -> list:
    return valor if isinstance(valor, list) else []


def _opciones_con_eleccion(document: dict) -> set:
    """Los ids de las opciones que se eligen desde una elección del diálogo: en el juego se lee la elección, no la opción."""
    ids = set()
    for escena in _lista(document.get("x-siep", {}).get("escenas") if isinstance(document.get("x-siep"), dict) else None):
        if not isinstance(escena, dict):
            continue
        mapa = escena.get("mapa") if isinstance(escena.get("mapa"), dict) else {}
        elegidas = {
            eleccion.get("opcion")
            for dialogo in _lista(mapa.get("dialogos")) if isinstance(dialogo, dict)
            for eleccion in _lista(dialogo.get("elecciones")) if isinstance(eleccion, dict) and _es_texto(eleccion.get("opcion"))
        }
        ids.update(
            opcion.get("id") for opcion in _lista(escena.get("opciones"))
            if isinstance(opcion, dict) and _es_texto(opcion.get("id")) and _es_texto(opcion.get("clave"))
            and opcion.get("clave") in elegidas
        )
    return ids


def _es_texto(valor) -> bool:
    """Un documento ajeno puede traer listas u objetos donde va una clave: solo cuentan los textos."""
    return isinstance(valor, str)


def _texto_de_opcion_oculto(document: dict, route: tuple, ocultas: set) -> bool:
    """¿Es ``escenas[i].decision.opciones[j].texto`` de una opción que el juego muestra con el texto de su elección?"""
    if route[:1] != ("escenas",) or route[-1:] != ("texto",) or "opciones" not in route:
        return False
    try:
        opcion = document["escenas"][route[1]]["decision"]["opciones"][route[4]]
    except (KeyError, IndexError, TypeError):
        return False
    return isinstance(opcion, dict) and _es_texto(opcion.get("id")) and opcion.get("id") in ocultas


def check(document, names=None) -> list[Issue]:
    """Un aviso ``DSL.READING_LENGTH`` por cada texto que pasa su tope de lectura (un mismo texto repetido, una vez)."""
    if not isinstance(document, dict):
        return []
    names = names if names is not None else messages.names_of(document)
    issues, vistos = [], set()
    ocultas = _opciones_con_eleccion(document)
    orden = lambda item: tuple((0, step) if isinstance(step, int) else (1, step) for step in item[0])  # noqa: E731
    for route, value in sorted(strings(document), key=orden):
        shape = tuple("*" if isinstance(step, int) else step for step in route)
        tipo = tipo_de(shape)
        if tipo is None or (tipo == "opción" and _texto_de_opcion_oculto(document, route, ocultas)):
            continue
        largo = len(value.strip())
        if largo <= TOPES[tipo] or (tipo, value.strip()) in vistos:
            continue
        vistos.add((tipo, value.strip()))
        lugar = messages.locate(document, route, names)
        issues.append(Issue(CODE, WARNING, messages.route_text(route), mensaje(tipo, largo, value, lugar)))
    return issues
