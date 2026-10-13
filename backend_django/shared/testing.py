"""Ayudantes de prueba compartidos (E0-1, E0-5, E0-11)."""
from __future__ import annotations

import re
import time
from contextlib import contextmanager
from dataclasses import dataclass

import django.db.models.query as _query
from django.db import connection
from django.db.models import FETCH_RAISE
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


@contextmanager
def fetch_mode_raise():
    """Dentro del bloque, todo QuerySet nuevo nace con ``FETCH_RAISE`` (DJA-7).

    Un acceso perezoso accidental a una relación lanza ``FieldFetchBlocked`` en
    vez de disparar una consulta N+1 silenciosa. Django 6.1 expone el modo por
    defecto como ``django.db.models.query.DEFAULT_FETCH_MODE``; se restaura al salir.
    """
    previous = _query.DEFAULT_FETCH_MODE
    _query.DEFAULT_FETCH_MODE = FETCH_RAISE
    try:
        yield
    finally:
        _query.DEFAULT_FETCH_MODE = previous


@contextmanager
def assert_queries_at_most(limit):
    """Falla si el bloque ejecuta más de ``limit`` consultas de datos."""
    with CaptureQueriesContext(connection) as captured:
        yield captured
    used = sum(
        1
        for q in captured.captured_queries
        if not q["sql"].lstrip().upper().startswith(_TRANSACTION_CONTROL)
    )
    assert used <= limit, f"{used} consultas; el máximo es {limit}"
