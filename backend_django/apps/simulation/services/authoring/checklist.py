"""La lista de publicación (E2-7): siete ítems y el ítem derivado de la constancia de Psicología.

Los seis primeros son los de siempre; ``scopeEducational`` («el caso declara su alcance
educativo», RN-01) se añade en E2-7 y su texto es un **borrador** hasta que Psicología lo
valide (decisión 17). Con ``REVIEW_WORKFLOW_STRICT`` apagada solo los seis son obligatorios
(el editor de hoy tiene seis casillas); encendida, los siete.

La «revisión de contenido por Psicología» NO es una casilla del autor: se cumple con la
constancia que el ADMIN registra al aprobar (``case_reviews``), y aquí solo se muestra.
"""
from django.conf import settings

#: (código, texto, ¿obligatorio sin la bandera?, ¿texto en borrador?)
CHECKLIST_ITEMS = (
    ("contentOriginal", "Contenido original — sin copiar personajes, mapas ni narrativa comercial.", True, False),
    ("ethicsReviewed", "Revisión ética — caso validado por experto o comité.", True, False),
    ("safetyProtocols", "Protocolos de seguridad — ruta VBG, NNA y salida segura incluidos.", True, False),
    ("noStigmatizing", "Sin lenguaje estigmatizante ni estereotipos clínicos.", True, False),
    ("triggerWarnings", "Advertencias de contenido sensible configuradas en nodos.", True, False),
    ("accessibilityOk", "Accesibilidad — fallback accesible y controles táctiles probados.", True, False),
    # BORRADOR: texto nuevo, pendiente de la validación de Psicología (decisión 17, VD-23).
    (
        "scopeEducational",
        "El caso declara su alcance educativo: es un ejercicio formativo, no un diagnóstico ni una "
        "intervención clínica real.",
        False,
        True,
    ),
)
CODES = tuple(code for code, *_ in CHECKLIST_ITEMS)


def strict():
    return bool(settings.REVIEW_WORKFLOW_STRICT)


def required_codes(strict_mode):
    """Los códigos obligatorios: los seis de siempre; con la bandera, los siete."""
    return tuple(code for code, _, required_always, _ in CHECKLIST_ITEMS if strict_mode or required_always)


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
