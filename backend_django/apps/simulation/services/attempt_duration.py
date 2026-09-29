"""Tiempo activo estimado de un intento.

`ended_at - started_at` mide tiempo transcurrido: incluye las pausas de la
salida segura y los intentos abandonados cuyo `ended_at` se fija cuando el
estudiante empieza otro intento, a veces días después. Esta estimación suma los
intervalos entre marcas consecutivas (inicio, eventos, fin), acota cada una a
`idle_cap` segundos y descarta el intervalo que sigue a una salida segura.
"""

IDLE_CAP_SECONDS = 300
PAUSE_EVENT = "SAFE_EXIT_REQUESTED"


def active_duration_seconds(started_at, ended_at, events, idle_cap=IDLE_CAP_SECONDS):
    """Devuelve segundos enteros de actividad, o None si el intento no terminó.

    `events` es una lista de tuplas (event_type, occurred_at) ordenada por
    occurred_at.
    """
    if started_at is None or ended_at is None:
        return None
    marks = [("START", started_at), *events, ("END", ended_at)]
    total = 0.0
    for (previous_type, previous_at), (_, current_at) in zip(marks, marks[1:]):
        if previous_type == PAUSE_EVENT:
            continue
        gap = (current_at - previous_at).total_seconds()
        if gap <= 0:
            continue
        total += min(gap, idle_cap)
    return int(total)
