"""IP del cliente con saltos de confianza (S1-1, SIEP-RNF-02).

Con ``SIEP_TRUSTED_PROXIES = n`` (n proxies de confianza delante de Django, cada uno añade a la cola de
``X-Forwarded-For`` la dirección que ve), el cliente real es la entrada que queda a ``n`` posiciones desde la
derecha. Lo que el cliente escribió va a la izquierda y no cuenta: una cabecera falsificada no cambia el
resultado. Con ``n = 0`` no se confía en la cabecera y se usa ``REMOTE_ADDR``.

Este es el ÚNICO módulo que lee ``HTTP_X_FORWARDED_FOR`` (regla ``ip-reenviada-solo-client-ip``).
"""
import ipaddress

from django.conf import settings


def client_ip(request) -> str:
    """Dirección del cliente según ``SIEP_TRUSTED_PROXIES``; ``""`` si la petición no trae ``REMOTE_ADDR``."""
    remote = request.META.get("REMOTE_ADDR") or ""
    saltos = getattr(settings, "SIEP_TRUSTED_PROXIES", 0)
    if saltos < 1:  # 0 (o un valor negativo, que nunca debe leer por la izquierda): no se confía en la cabecera
        return remote
    reenviada = request.META.get("HTTP_X_FORWARDED_FOR") or ""
    entradas = [entrada.strip() for entrada in reenviada.split(",") if entrada.strip()]
    if len(entradas) < saltos:
        return remote
    try:
        return str(ipaddress.ip_address(entradas[-saltos]))
    except ValueError:
        return remote
