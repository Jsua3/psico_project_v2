"""Señales del simulador (P-13 · Observer).

Quien produce un hecho del dominio lo anuncia; quien reacciona se suscribe. Así el servicio
del juego no conoce a sus suscriptores y otra app puede reaccionar sin que él cambie.
"""
from django.dispatch import Signal

#: Un intento acaba de pasar a COMPLETED. Se emite de forma **síncrona**, dentro de la
#: transacción de ``choose_decision`` y después de guardar el evento ``ATTEMPT_COMPLETED``:
#: si algo revierte la transacción, también lo que hicieron los suscriptores. Se emite con
#: ``send_robust``: un suscriptor que falle se registra en el log y no rompe la decisión
#: (quien juega nunca debe ver un error por lo que hace otra app con la finalización).
#: Cuidado: capturar la excepción no repara una transacción rota por un error de la base;
#: un suscriptor que escriba debe abrir su propio savepoint (``transaction.atomic``), como
#: lo hace ``get_or_create`` en progresión.
#:
#: Argumentos: ``sender`` (``SimulationAttempt``) y ``attempt`` (el intento ya guardado).
attempt_completed = Signal()

#: Un estudiante pide iniciar un intento NUEVO de una versión (SIEP-RF-12, E1-11). Se emite con
#: ``send`` —no ``send_robust``— y ANTES de crear nada: un suscriptor que quiera impedirlo lanza
#: ``ApiError`` y la petición responde con él (el simulador no conoce a quien lo veta; hoy,
#: progresión exige el desbloqueo lineal). No se emite al reanudar un intento abierto.
#:
#: Argumentos: ``sender`` (``SimulationAttempt``), ``student`` (el usuario), ``case_version_id`` y
#: ``replacing`` (``True`` si el estudiante pide «empezar de nuevo» sobre un intento abierto: es un
#: inicio nuevo y no goza de la excepción de «se deja terminar» que solo protege al que ya está en juego).
attempt_start_requested = Signal()
