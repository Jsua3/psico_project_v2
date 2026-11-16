from django.apps import AppConfig


class BibliotecaConfig(AppConfig):
    name = "apps.biblioteca"
    label = "biblioteca"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        # Las reglas OCL-13/14/18 (``casedef``, puro) leen el catálogo de piezas por esta función.
        from apps.simulation.casedef import catalogo

        from .services import catalogo_piezas

        catalogo.registrar(catalogo_piezas.catalogo_vigente)
