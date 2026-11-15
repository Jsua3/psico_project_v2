"""El catálogo de piezas que leen las reglas OCL-13, 14 y 18, inyectado desde fuera.

``casedef`` es Python puro (no lee archivos de configuración ni importa otras apps): quien conoce dónde está el manifiesto
de piezas —la app ``biblioteca``, al arrancar— registra aquí una función que lo devuelve. Sin ella, las reglas dicen que
el catálogo no está disponible.
"""
_proveedor = None


def registrar(proveedor):
    """``proveedor()`` devuelve el catálogo vigente (``apps.biblioteca.services.catalogo_piezas.Catalogo``) o ``None``."""
    global _proveedor
    _proveedor = proveedor


def vigente():
    return _proveedor() if _proveedor is not None else None
