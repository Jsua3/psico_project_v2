from django.urls import path

from .views.instructor_views import (
    AttemptTraceView,
    InstructorAttemptsView,
    RecentAttemptsView,
    ReplaceAttemptView,
    RubricEvaluationView,
)

# Montado en "api/instructor/" (con slash final en el include raíz).
urlpatterns = [
    path("attempts", InstructorAttemptsView.as_view()),
    path("attempts/recent", RecentAttemptsView.as_view()),
    path("attempts/<uuid:attempt_id>/trace", AttemptTraceView.as_view()),
    path("attempts/<uuid:attempt_id>/rubric-evaluation", RubricEvaluationView.as_view()),
    path("attempts/<uuid:attempt_id>/replace", ReplaceAttemptView.as_view()),
]
