from django.apps import AppConfig


class ProgressionConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.progression"

    def ready(self):
        # P-13: progresión se suscribe a «un intento se completó»; el servicio del juego
        # no la importa. `dispatch_uid` evita suscribirla dos veces si `ready` se repite.
        from apps.simulation.signals import attempt_completed

        from .receivers import record_completion_on_attempt_completed

        attempt_completed.connect(
            record_completion_on_attempt_completed,
            dispatch_uid="progression.record_case_completion",
        )
