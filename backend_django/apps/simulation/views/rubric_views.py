from rest_framework import status
from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_ok

from ..services import competencies, rubric_service


_CAN_READ = policy_permission("rubric", "read")
_CAN_EDIT = policy_permission("rubric", "edit")


class CompetencyListCreateView(APIView):
    """``GET /api/competencies`` (personal) y ``POST`` (ADMIN): el catálogo de competencias (E3-9)."""

    def get_permissions(self):
        action = "read" if self.request.method == "GET" else "manage"
        return [policy_permission("competency", action)()]

    def get(self, request):
        return api_ok(competencies.list_competencies())

    def post(self, request):
        return api_ok(
            competencies.create_competency(request.data),
            message="Competencia creada",
            http_status=status.HTTP_201_CREATED,
        )


class RubricListCreateView(APIView):
    def get_permissions(self):
        return [(_CAN_READ if self.request.method == "GET" else _CAN_EDIT)()]

    def get(self, request):
        return api_ok(rubric_service.list_rubrics(request.user))

    def post(self, request):
        return api_ok(
            rubric_service.create_rubric(request.data, request.user),
            message="Rubrica creada",
            http_status=status.HTTP_201_CREATED,
        )


class RubricDetailView(APIView):
    def get_permissions(self):
        return [(_CAN_READ if self.request.method == "GET" else _CAN_EDIT)()]

    def get(self, request, rubric_id):
        return api_ok(rubric_service.get_rubric(rubric_id, request.user))

    def put(self, request, rubric_id):
        return api_ok(
            rubric_service.update_rubric(rubric_id, request.data, request.user),
            message="Rubrica actualizada",
        )

    def patch(self, request, rubric_id):
        return self.put(request, rubric_id)


class RubricActivateView(APIView):
    permission_classes = [_CAN_EDIT]

    def post(self, request, rubric_id):
        return api_ok(rubric_service.activate(rubric_id, True, request.user), message="Rubrica activada")


class RubricDeactivateView(APIView):
    permission_classes = [_CAN_EDIT]

    def post(self, request, rubric_id):
        return api_ok(rubric_service.activate(rubric_id, False, request.user), message="Rubrica desactivada")


class RubricDuplicateView(APIView):
    permission_classes = [_CAN_EDIT]

    def post(self, request, rubric_id):
        return api_ok(rubric_service.duplicate(rubric_id, request.user), message="Rubrica duplicada")


class RubricDefaultView(APIView):
    permission_classes = [policy_permission("rubric", "default")]

    def post(self, request, rubric_id):
        return api_ok(
            rubric_service.set_default(rubric_id, request.user),
            message="Rubrica predeterminada actualizada",
        )


class CaseVersionRubricView(APIView):
    def get_permissions(self):
        return [(_CAN_READ if self.request.method == "GET" else _CAN_EDIT)()]

    def get(self, request, case_version_id):
        return api_ok(rubric_service.case_version_rubric(case_version_id, request.user))

    def put(self, request, case_version_id):
        return api_ok(
            rubric_service.assign_to_case_version(case_version_id, request.data.get("rubricId"), request.user),
            message="Rubrica asignada",
        )

    def post(self, request, case_version_id):
        return self.put(request, case_version_id)
