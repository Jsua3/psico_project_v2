"""Bytes canónicos del documento y su huella (R11 de E4).

Los mismos datos producen los mismos bytes: claves ordenadas, separadores compactos, UTF-8 sin
escapar los acentos y sin ``NaN``. La huella (``definition_hash``) se calcula sobre el documento
**completo** con ``caso.estado`` fijado a ``PUBLICADO``: el estado cambia al publicar y no es parte
de lo que se validó.
"""
import hashlib
import json

HASH_PREFIX = "sha256:"
#: El estado con el que se calcula la huella, sea cual sea el estado actual de la versión.
HASHED_STATE = "PUBLICADO"


def canonical_bytes(document):
    """Los bytes con los que se compara y se firma un documento."""
    return json.dumps(
        document, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def document_text(document):
    """El documento legible (sangría de 2, claves ordenadas, salto de línea final) para los archivos."""
    return json.dumps(document, sort_keys=True, ensure_ascii=False, indent=2, allow_nan=False) + "\n"


def hashed_view(document):
    """El documento tal como entra a la huella: igual, con ``caso.estado`` fijado."""
    caso = document.get("caso")
    if not isinstance(caso, dict):
        return document
    return {**document, "caso": {**caso, "estado": HASHED_STATE}}


def definition_hash(document):
    """``sha256:<hex>`` de los bytes canónicos del documento (con el estado fijado)."""
    return HASH_PREFIX + hashlib.sha256(canonical_bytes(hashed_view(document))).hexdigest()
