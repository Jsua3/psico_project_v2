"""Rutas de la generación por etapas, montadas en ``/api/authoring/generations/`` (sin alias en ``/api/admin``)."""
from django.urls import path

from .views.authoring_generation import (
    GenerationAssembleView,
    GenerationDetailView,
    GenerationListCreateView,
    GenerationSceneView,
    GenerationSkeletonView,
    GenerationStatusView,
)

urlpatterns = [
    path("status", GenerationStatusView.as_view()),
    path("", GenerationListCreateView.as_view()),
    path("<uuid:gen_id>", GenerationDetailView.as_view()),
    path("<uuid:gen_id>/skeleton", GenerationSkeletonView.as_view()),
    path("<uuid:gen_id>/scenes/<slug:clave>", GenerationSceneView.as_view()),
    path("<uuid:gen_id>/assemble", GenerationAssembleView.as_view()),
]
