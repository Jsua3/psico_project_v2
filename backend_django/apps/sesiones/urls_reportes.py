from django.urls import path

from .views_reportes import DashboardView, ReporteGrupoExportView, ReporteGrupoView

# Mounted at "api/reportes" (no trailing slash) — sub-routes start with "/".
urlpatterns = [
    path("/dashboard", DashboardView.as_view()),
    path("/grupo/<int:grupo_id>", ReporteGrupoView.as_view()),
    path("/grupo/<int:grupo_id>/export", ReporteGrupoExportView.as_view()),
]
