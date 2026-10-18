"""E1-0b · Todo error del envoltorio trae ``code`` estable (§2.7 del plan estructural).

El cliente no depende de los textos: decide por ``code``. Los campos propios de un
error de dominio (``existingAttemptId``…) viajan en la raíz, junto a ``message``.
"""
import uuid

import pytest
from django.contrib.auth import get_user_model
from rest_framework.exceptions import Throttled
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.views import APIView

from shared.exceptions import ApiError, Conflict, custom_exception_handler

pytestmark = pytest.mark.req("RNF-06")

User = get_user_model()


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="codigo_error@x.com", password="pass1234", nombre="Cod", apellido="Err", role="ESTUDIANTE"
    )


def _logged(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _call(view_class, method="get"):
    request = getattr(APIRequestFactory(), method)("/prueba")
    return view_class.as_view()(request)


def test_api_error_lleva_code_y_los_campos_extra_en_la_raiz():
    class Boom(APIView):
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            raise ApiError(
                "ATTEMPT_ALREADY_OPEN", "Ya tienes un intento abierto", 409, existingAttemptId="abc-123"
            )

    response = _call(Boom)

    assert response.status_code == 409
    assert response.data == {
        "success": False,
        "code": "ATTEMPT_ALREADY_OPEN",
        "message": "Ya tienes un intento abierto",
        "existingAttemptId": "abc-123",
    }


def test_api_error_sin_estado_explicito_es_400():
    class Boom(APIView):
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            raise ApiError("REQUEST_ID_INVALID", "requestId inválido")

    assert _call(Boom).status_code == 400


def test_conflict_existente_trae_code_conflict():
    class Boom(APIView):
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            raise Conflict("Este caso fue modificado en otra sesión.")

    response = _call(Boom)

    assert response.status_code == 409
    assert response.data["code"] == "CONFLICT"
    assert response.data["message"] == "Este caso fue modificado en otra sesión."


def test_no_encontrado_trae_not_found(estudiante):
    response = _logged(estudiante).get(
        f"/api/simulation/attempts/{uuid.uuid4()}", HTTP_X_SIEP_ATTEMPT_TOKEN="token-que-no-existe"
    )

    assert response.status_code == 404
    assert response.data["code"] == "NOT_FOUND"
    assert response.data["success"] is False


def test_sin_autenticar_trae_unauthenticated():
    response = APIClient().get("/api/simulation/cases")

    assert response.status_code == 401
    assert response.data["code"] == "UNAUTHENTICATED"


def test_rol_incorrecto_trae_forbidden(estudiante):
    response = _logged(estudiante).get("/api/instructor/attempts/recent")

    assert response.status_code == 403
    assert response.data["code"] == "FORBIDDEN"


def test_cuerpo_invalido_trae_validation_error(estudiante):
    response = _logged(estudiante).post("/api/simulation/attempts", {}, format="json")

    assert response.status_code == 400
    assert response.data["code"] == "VALIDATION_ERROR"
    assert "caseVersionId" in response.data["message"]


def test_error_no_controlado_trae_internal_error():
    response = custom_exception_handler(RuntimeError("boom"), {})

    assert response.status_code == 500
    assert response.data == {
        "success": False,
        "code": "INTERNAL_ERROR",
        "message": "Error interno del servidor",
    }


@pytest.mark.req("DJA-2")
@pytest.mark.security
def test_limite_de_peticiones_trae_throttled_con_la_espera_en_el_cuerpo_y_en_la_cabecera():
    class Limitado(APIView):
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            raise Throttled(wait=42)

    response = _call(Limitado)

    assert response.status_code == 429
    assert response.data == {
        "success": False,
        "code": "THROTTLED",
        "message": "Demasiados intentos. Espera 42 s e inténtalo de nuevo.",
        "retryAfter": 42,
    }
    assert response["Retry-After"] == "42"


@pytest.mark.req("DJA-2")
@pytest.mark.security
def test_limite_sin_espera_conocida_pide_un_segundo():
    class Limitado(APIView):
        authentication_classes = []
        permission_classes = []

        def get(self, request):
            raise Throttled()

    response = _call(Limitado)

    assert response.status_code == 429
    assert response.data["retryAfter"] == 1
    assert response["Retry-After"] == "1"
