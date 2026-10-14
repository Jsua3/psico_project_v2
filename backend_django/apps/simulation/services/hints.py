"""Pistas por escena (C9, RF-11, RF-18, CU-09, decisión 13).

El estudiante pide las pistas de su escena **una a una** y sin costo: una pista no cambia el
puntaje, las métricas, el recorrido ni el reporte. La escena es la sala donde está (el mapa de
su estado de mundo). Qué pistas pidió vive en ``attempt_hint_views`` (única por intento y pista);
cada revelación deja un evento ``HINT_VIEWED`` con el ``requestId`` del cliente, así que la misma
orden repetida (doble clic, reintento, dos pestañas) revela **una** y devuelve el mismo estado.
El texto de las que no pidió nunca sale de aquí.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework import status

from apps.simulation.models import (
    AttemptEvent,
    AttemptHintView,
    AttemptWorldState,
    SceneHint,
    SceneMap,
)
from shared.exceptions import ApiError
from shared.idempotency import DUPLICATE_WINDOW_SECONDS, normalize_request_id

from . import attempt_lifecycle as lifecycle
from . import game_service
from .attempt_lock import locked_attempt

NONE_FOR_SCENE = "NONE_FOR_SCENE"
ALL_SHOWN = "ALL_SHOWN"
HINT_EVENT = "HINT_VIEWED"


def _scene_map_id(attempt):
    """La sala donde está el jugador; si aún no tiene estado de mundo, la de su nodo actual."""
    map_id = (
        AttemptWorldState.objects.filter(pk=attempt.id).values_list("scene_map_id", flat=True).first()
    )
    if map_id:
        return map_id
    return (
        SceneMap.objects.filter(case_version_id=attempt.case_version_id, node_id=attempt.current_node_id)
        .values_list("id", flat=True)
        .first()
    )


def _scene(attempt):
    """``(pistas de la escena en orden, ids de las que el intento ya pidió)``."""
    map_id = _scene_map_id(attempt)
    hints = list(SceneHint.objects.filter(scene_map_id=map_id).order_by("hint_order", "id"))
    viewed = set(
        AttemptHintView.objects.filter(attempt_id=attempt.id, hint__scene_map_id=map_id)
        .values_list("hint_id", flat=True)
    )
    return hints, viewed


def _state_dto(hints, viewed):
    shown = [h for h in hints if h.id in viewed]
    state = {
        "available": len(hints) - len(shown),
        "shown": [{"id": h.id, "order": h.hint_order, "text": h.text} for h in shown],
    }
    if not hints:
        state["reason"] = NONE_FOR_SCENE
    elif state["available"] == 0:
        state["reason"] = ALL_SHOWN
    return state


def get_hint_state(attempt_id, attempt_token, actor):
    """``GET …/attempts/{id}/hints``: lo que el intento ya vio y cuántas le quedan en esta escena."""
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor)
    hints, viewed = _scene(attempt)
    return _state_dto(hints, viewed)


@locked_attempt
def reveal_next_hint(attempt_id, attempt_token, actor, request_id=None):
    """``POST …/attempts/{id}/hints/next``: revela la siguiente pista de la escena (una sola vez)."""
    attempt = game_service._require_attempt(attempt_id, attempt_token, actor)
    request_id = normalize_request_id(request_id)
    if request_id:
        previous = AttemptEvent.objects.filter(attempt_id=attempt.id, request_id=request_id).first()
        if previous is not None:
            # La misma orden otra vez: el estado actual, sin revelar nada más.
            if previous.event_type != HINT_EVENT:
                raise game_service.request_id_reused()
            return _state_dto(*_scene(attempt))
    if not lifecycle.state_of(attempt).plays:
        raise ApiError(
            "ATTEMPT_NOT_PLAYING",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "El intento no está en juego: reanúdalo para pedir pistas.",
            status.HTTP_409_CONFLICT,
        )
    # Un doble clic o dos pestañas, aunque cada orden traiga su propio requestId: dentro de la
    # ventana de duplicado de la pista anterior no se revela otra.
    since = timezone.now() - timedelta(seconds=DUPLICATE_WINDOW_SECONDS)
    if AttemptEvent.objects.filter(
        attempt_id=attempt.id, event_type=HINT_EVENT, occurred_at__gte=since
    ).exists():
        return _state_dto(*_scene(attempt))

    hints, viewed = _scene(attempt)
    following = next((h for h in hints if h.id not in viewed), None)
    if following is None:
        raise ApiError(
            "NO_MORE_HINTS",
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            "No hay más pistas para esta escena.",
            status.HTTP_409_CONFLICT,
        )
    AttemptHintView.objects.create(attempt=attempt, hint=following)
    AttemptEvent.objects.create(
        attempt=attempt,
        event_type=HINT_EVENT,
        node=attempt.current_node,
        detail=f"Pista {following.hint_order} solicitada",
        request_id=request_id,
    )
    return _state_dto(hints, viewed | {following.id})
