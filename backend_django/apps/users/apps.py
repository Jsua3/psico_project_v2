from django.apps import AppConfig


class UsersConfig(AppConfig):
    name = "apps.users"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        # Registra los checks de base de datos del proyecto (siep.E001, historial viejo).
        from shared import checks  # noqa: F401
