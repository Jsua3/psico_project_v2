"""Formato JSON de los logs (una línea por registro) con el id de la request."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from shared.middleware import request_id_var


class RequestIdFilter(logging.Filter):
    """Pone el ``request_id`` vigente en todo registro que no lo traiga."""

    def filter(self, record):
        if not hasattr(record, "request_id"):
            # django.request registra las 4xx/5xx fuera del middleware, con la request en el
            # registro y el ContextVar ya restablecido.
            request = getattr(record, "request", None)
            record.request_id = getattr(request, "request_id", None) or request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        payload.update(getattr(record, "fields", None) or {})
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)
