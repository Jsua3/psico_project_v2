"""Límites del limitador compartido (S1-2, DJA-2): una sola tabla de alcances, ventanas en segundos.

Son los de la especificación (§2.5 del plan de seguridad). Cada clase de ``throttling.py`` toma su par de aquí,
así que cambiar un valor cambia todas las rutas que lo usan y las pruebas lo fijan para no moverlo sin querer.
"""
from collections import namedtuple

Limit = namedtuple("Limit", "limit window")

LIMITS: dict[str, Limit] = {
    "login_ip": Limit(300, 600),
    "login_fail_account_ip": Limit(5, 900),
    "login_fail_account": Limit(30, 900),
    "google_ip": Limit(300, 600),
    "access_request_ip": Limit(5, 3600),
    "access_request_email": Limit(2, 86400),
    "access_request_global": Limit(200, 86400),
    # No limita peticiones: agrupa el aviso al ADMIN. La primera solicitud de cada ventana de 10 minutos avisa y el
    # resto de esa ventana no (``access_request_service``); el contador atómico evita avisos dobles entre procesos.
    "access_request_notice": Limit(1, 600),
    "import_user": Limit(10, 3600),
    "heavy_user": Limit(30, 60),
    # Sin clase todavía: el informe de CSP (DJA-4) aún no tiene ruta que lo use.
    "csp_report_ip": Limit(60, 60),
    "password_change_user": Limit(10, 3600),
    # Se DEFINE pero NO se aplica globalmente: contar cada petición autenticada añade una escritura a la base por
    # cada una. Se decide después de medir ``npm run load:aula``.
    "api_user": Limit(600, 60),
    # Contador, no límite (S4-3): cuenta los fallos al escribir la auditoría para ``security_report``. Ninguna ruta lo
    # aplica, así que su tope no se usa.
    "audit_failure": Limit(0, 3600),
}

#: Los contadores que ``hit`` suma sin aplicar ningún tope. ``security_report`` no los cuenta como límites aplicados.
CONTADORES = frozenset({"audit_failure"})
