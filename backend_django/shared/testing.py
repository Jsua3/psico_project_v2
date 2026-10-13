"""Ayudantes de prueba compartidos (E0-1, E0-5, E0-11)."""
from __future__ import annotations

import re
import time
from dataclasses import dataclass

from django.db import connection
from django.test.utils import CaptureQueriesContext

_WRITE_PREFIXES = ("INSERT", "UPDATE", "DELETE")
# Control de transacción que Django emite dentro de la transacción de cada prueba
# (atomic() anidado) y que no existe en producción: no es acceso a datos.
_TRANSACTION_CONTROL = ("SAVEPOINT", "RELEASE SAVEPOINT", "ROLLBACK TO SAVEPOINT")


@dataclass(frozen=True)
class RequestCost:
    """Lo que cuesta una llamada: consultas, escrituras, milisegundos y bytes."""

    queries: int
    writes: int
    milliseconds: float
    bytes: int
    statements: tuple[str, ...]


def measure(call):
    """Ejecuta ``call()`` y devuelve ``(respuesta, RequestCost)``."""
    started = time.perf_counter()
    with CaptureQueriesContext(connection) as captured:
        response = call()
    elapsed = (time.perf_counter() - started) * 1000
    statements = tuple(
        q["sql"]
        for q in captured.captured_queries
        if not q["sql"].lstrip().upper().startswith(_TRANSACTION_CONTROL)
    )
    writes = sum(1 for sql in statements if sql.lstrip().upper().startswith(_WRITE_PREFIXES))
    body = getattr(response, "content", b"") or b""
    return response, RequestCost(
        queries=len(statements),
        writes=writes,
        milliseconds=round(elapsed, 1),
        bytes=len(body),
        statements=statements,
    )


_REQ_CODE = re.compile(r"[A-Z][A-Z0-9]*(-[A-Z0-9]+(\.[0-9]+)?)+")


def invalid_req_codes(codes):
    """Devuelve los códigos de ``@pytest.mark.req`` que no tienen forma de requisito."""
    return [code for code in codes if not _REQ_CODE.fullmatch(str(code))]
