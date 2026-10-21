from django.urls import path

from .views import AnaliticasView, DashboardView, ReporteEstudianteView, ReporteGrupoExportView, ReporteGrupoView

# Mounted at "api/reportes/".
urlpatterns = [
    path("dashboard", DashboardView.as_view()),
    path("analiticas", AnaliticasView.as_view()),
    path("grupo/<int:grupo_id>", ReporteGrupoView.as_view()),
    path("grupo/<int:grupo_id>/export", ReporteGrupoExportView.as_view()),
    path("estudiante/<int:estudiante_id>", ReporteEstudianteView.as_view()),
]
