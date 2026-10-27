"""La biblioteca de lugares para el editor de casos (P6) · ``GET /api/biblioteca/lugares[/<id>]``.

Solo lee. La usan quienes autoran casos (PROFESOR y ADMIN, la misma puerta ``case.author`` que la autoría); un estudiante
recibe 403 y sin sesión 401. Nada de lo que devuelve es una ruta del servidor: el arte va como URL pública.
"""
from rest_framework.views import APIView

from shared.permissions import policy_permission
from shared.response import api_ok

from .services import lugares


class _BibliotecaView(APIView):
    permission_classes = [policy_permission("case", "author")]


class LugarListView(_BibliotecaView):
    def get(self, request):
        return api_ok(lugares.listar_lugares())


class LugarDetailView(_BibliotecaView):
    def get(self, request, lugar_id):
        return api_ok(lugares.lugar_publico(lugares.cargar_lugar(lugar_id)))
