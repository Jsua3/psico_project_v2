"""La lista de publicación (E2-7): siete ítems y el ítem derivado de la constancia de Psicología.

Los seis primeros son los de siempre; ``scopeEducational`` («el caso declara su alcance
educativo», RN-01) se añade en E2-7 y su texto es un **borrador** hasta que Psicología lo
valide (decisión 17). Con ``REVIEW_WORKFLOW_STRICT`` apagada solo los seis son obligatorios
(el editor de hoy tiene seis casillas); encendida, los siete.

La «revisión de contenido por Psicología» NO es una casilla del autor: se cumple con la
constancia que el ADMIN registra al aprobar (``case_reviews``), y aquí solo se muestra.

Cada ítem declara además **quién lo respalda** (S3-3): una casilla marcada no basta por sí sola.

- ``SYSTEM``: el sistema lo comprueba con los datos del caso o del servidor (``ethics``).
- ``CONSTANCIA``: lo respalda la constancia de Psicología, que se registra al aprobar. Solo vale con
  ``REVIEW_WORKFLOW_STRICT``: apagada la constancia es opcional y la casilla es solo declaración.
- ``AUTHOR``: solo la declaración de quien autora el caso; nadie puede comprobarla con los datos de hoy.
"""
from django.conf import settings

SYSTEM = "system"
CONSTANCIA = "constancia"
AUTHOR = "author"

#: (código, texto, ¿obligatorio sin la bandera?, ¿texto en borrador?, ¿quién lo respalda?)
CHECKLIST_ITEMS = (
    ("contentOriginal", "Contenido original — sin copiar personajes, mapas ni narrativa comercial.", True, False, AUTHOR),
    ("ethicsReviewed", "Revisión ética — caso validado por experto o comité.", True, False, CONSTANCIA),
    ("safetyProtocols", "Protocolos de seguridad — ruta VBG, NNA y salida segura incluidos.", True, False, SYSTEM),
    ("noStigmatizing", "Sin lenguaje estigmatizante ni estereotipos clínicos.", True, False, AUTHOR),
    ("triggerWarnings", "Advertencias de contenido sensible configuradas en nodos.", True, False, SYSTEM),
    ("accessibilityOk", "Accesibilidad — fallback accesible y controles táctiles probados.", True, False, AUTHOR),
    # BORRADOR: texto nuevo, pendiente de la validación de Psicología (decisión 17, VD-23).
    (
        "scopeEducational",
        "El caso declara su alcance educativo: es un ejercicio formativo, no un diagnóstico ni una "
        "intervención clínica real.",
        False,
        True,
        AUTHOR,
    ),
)
CODES = tuple(code for code, *_ in CHECKLIST_ITEMS)
_BACKING = {code: backing for code, *_, backing in CHECKLIST_ITEMS}

# BORRADOR: textos nuevos del servidor, pendientes de la aprobación de Psicología (VD-23).
#: Etiqueta corta de cada respaldo, para quien lee la lista sin programar.
BACKING_LABELS = {
    SYSTEM: "Lo comprueba el sistema",
    CONSTANCIA: "Lo respalda la constancia de Psicología",
    AUTHOR: "Declaración de quien autora el caso",
}


def strict():
    return bool(settings.REVIEW_WORKFLOW_STRICT)


def backing_of(code, strict_mode):
    """Quién respalda la casilla ``code`` ahora: ``SYSTEM``, ``CONSTANCIA`` o ``AUTHOR``.

    La constancia solo es obligatoria con la bandera estricta; apagada, ``ethicsReviewed`` es solo la declaración de
    quien autora (``AUTHOR``).
    """
    declared = _BACKING[code]
    return declared if declared != CONSTANCIA or strict_mode else AUTHOR


def required_codes(strict_mode):
    """Los códigos obligatorios: los seis de siempre; con la bandera, los siete."""
    return tuple(code for code, _, required_always, *_ in CHECKLIST_ITEMS if strict_mode or required_always)


def legacy_strict_cap():
    """El tope de una lista guardada ANTES de los ítems (sin filas) cuando rige el modo estricto.

    Esa lista da «100 %» con las seis casillas de entonces; el modo estricto exige siete. No puede
    quedar completa sin volver a marcarse: se topa en lo que cubren los seis.
    """
    return round(100.0 * len(required_codes(False)) / len(required_codes(True)))


def ratio(fulfilled_codes, strict_mode):
    """Porcentaje (entero) de ítems obligatorios cumplidos."""
    required = required_codes(strict_mode)
    done = sum(1 for code in required if code in fulfilled_codes)
    return round(done * 100.0 / len(required))
