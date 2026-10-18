"""Qué vista lleva qué límite (S1-2, DJA-2): el cableado que las pruebas de ruta dan por hecho.

Las vistas que cobran por cada petición (entrada, Google, solicitud de acceso, cambio de clave, importaciones y
validaciones pesadas) declaran su clase; las órdenes de crisis no aparecen aquí y lo prueba ``test_throttling``.
"""
import pytest

from apps.grupos.views import GrupoEstudiantesImportView
from apps.security.throttling import (
    AccessRequestEmailThrottle,
    AccessRequestGlobalThrottle,
    AccessRequestIpThrottle,
    GoogleIpThrottle,
    HeavyUserThrottle,
    ImportUserThrottle,
    LoginIpThrottle,
    PasswordChangeUserThrottle,
)
from apps.simulation.views.authoring_views import (
    CaseDefinitionView,
    CaseImportView,
    CaseValidateView,
    LifecycleView,
    WorldValidateView,
)
from apps.users.views import AccessRequestCreateView, ChangePasswordView, GoogleLoginView, LoginView

pytestmark = [pytest.mark.req("DJA-2"), pytest.mark.security]

CON_LIMITE = [
    (LoginView, [LoginIpThrottle]),
    (GoogleLoginView, [GoogleIpThrottle]),
    (AccessRequestCreateView, [AccessRequestIpThrottle, AccessRequestEmailThrottle, AccessRequestGlobalThrottle]),
    (ChangePasswordView, [PasswordChangeUserThrottle]),
    (GrupoEstudiantesImportView, [ImportUserThrottle]),
    (CaseImportView, [ImportUserThrottle]),
    (CaseDefinitionView, [HeavyUserThrottle]),
    (LifecycleView, [HeavyUserThrottle]),
    (WorldValidateView, [HeavyUserThrottle]),
    (CaseValidateView, [HeavyUserThrottle]),
]


@pytest.mark.parametrize("vista, clases", CON_LIMITE, ids=[vista.__name__ for vista, _ in CON_LIMITE])
def test_la_vista_declara_su_limite(vista, clases):
    assert vista.throttle_classes == clases
