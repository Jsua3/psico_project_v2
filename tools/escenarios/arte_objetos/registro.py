"""Registro de todos los dibujos: un módulo por grupo, cada uno con su dict MODELOS = {id: función}."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from arte_objetos import casa, comisaria, comunes, universidad  # noqa: E402

GRUPOS = {
    'comunes': comunes.MODELOS,
    'universidad': universidad.MODELOS,
    'casa': casa.MODELOS,
    'comisaria': comisaria.MODELOS,
}

MODELOS = {}
for _grupo, _dibujos in GRUPOS.items():
    for _id, _fn in _dibujos.items():
        if _id in MODELOS:
            raise SystemExit(f"El modelo {_id} está dibujado dos veces")
        MODELOS[_id] = _fn
