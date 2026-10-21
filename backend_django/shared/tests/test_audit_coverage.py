"""S4-1 · La compuerta de cobertura de auditoría (RNF-007, SIEP-RNF-02, SF-09).

``audit_logs`` debe responder «quién entró, quién cambió qué y quién leyó datos de otra persona». Esta prueba recorre el
inventario de superficie (S0-2) y exige que toda ruta que **muta** estado (POST, PUT, PATCH, DELETE) o que **lee** lo que
un ADMIN o un PROFESOR puede ver declare su auditoría en ``AUDIT_BY_ROUTE`` (``shared/surface.py``): un código de
auditoría o ``EXENTO: <motivo>``. Una ruta nueva que nazca sin declararla rompe esta prueba.

También se comprueba que cada código declarado exista en la taxonomía, que un ``EXENTO`` lleve motivo, que no haya
códigos fantasma (declarados pero que ningún ``@auditable``/``record``/``append`` de ``apps/`` escribe) y que todo código
crudo que el código escribe tenga su etiqueta ``entidad.verbo`` en la taxonomía. Cada control tiene su control negativo.
"""
import ast
import re
from pathlib import Path
from types import SimpleNamespace

import pytest
from django.urls import get_resolver, path
from rest_framework.views import APIView

from apps.simulation.services import audit_service
from shared import surface
from shared.permissions import policy_permission

pytestmark = [pytest.mark.req("RNF-007", "SIEP-RNF-02"), pytest.mark.security]

APPS = Path(__file__).resolve().parents[2] / "apps"
MUTANTES = ("POST", "PUT", "PATCH", "DELETE")
PERSONAL_DE_LA_INSTITUCION = {"ADMIN", "PROFESOR"}
EXENTO = "EXENTO:"
MENSAJE = (
    "esta ruta muta o lee datos de otra persona y no declara su auditoría: añádela a AUDIT_BY_ROUTE en shared/surface.py"
)
ALIAS_DE_AUTORIA = ("api/authoring/cases", "api/admin/cases")


# ── Qué filas exigen declaración ───────────────────────────────────────────────────────────────────────────────────
def _roles(fila):
    exposicion = fila["exposure"]
    return set(exposicion.removeprefix("role:").split(",")) if exposicion.startswith("role:") else set()


def _requiere_declaracion(fila):
    """Muta, o es una lectura que puede hacer un ADMIN o un PROFESOR (o cualquier persona con sesión). Conservador a
    propósito: una lectura de lo propio o de un catálogo se declara ``EXENTO`` con su motivo. Las lecturas públicas y las
    que solo hace un ESTUDIANTE (su propio intento) quedan fuera."""
    if fila["method"] in MUTANTES:
        return True
    if fila["method"] != "GET":
        return False
    return bool(_roles(fila) & PERSONAL_DE_LA_INSTITUCION) or fila["exposure"] == surface.AUTHENTICATED


def _codigos(valor):
    """Los códigos que declara una entrada (separados por coma); vacío si es una exención."""
    if not valor or valor.startswith(EXENTO):
        return []
    return [codigo.strip() for codigo in valor.split(",")]


# ── Qué escribe el código ──────────────────────────────────────────────────────────────────────────────────────────
def _literal(nodo):
    return nodo.value if isinstance(nodo, ast.Constant) and isinstance(nodo.value, str) else None


def _literales_de(arbol):
    """Los códigos o etiquetas que una llamada a ``auditable(...)``, ``record(...)`` o ``append(...)`` escribe como literal.

    Cubre ``@auditable("X")``, ``auditable("X")(funcion)`` (la llamada de dentro es otra ``Call``), ``record("X", ...)``,
    ``audit_service.append(actor, rol, "X", ...)`` y ``append(action="X", ...)``. ``list.append(x)`` no entra: el
    ``append`` de auditoría lleva al menos tres argumentos.
    """
    encontrados = set()
    for nodo in ast.walk(arbol):
        if not isinstance(nodo, ast.Call):
            continue
        funcion = nodo.func
        nombre = funcion.attr if isinstance(funcion, ast.Attribute) else getattr(funcion, "id", "")
        if nombre not in {"auditable", "record", "append"}:
            continue
        if nombre == "append" and len(nodo.args) + len(nodo.keywords) < 3:
            continue
        literal = next((_literal(k.value) for k in nodo.keywords if k.arg == "action"), None)
        posicion = 2 if nombre == "append" else 0
        if literal is None and len(nodo.args) > posicion:
            literal = _literal(nodo.args[posicion])
        if literal:
            encontrados.add(literal)
    return encontrados


def _literales_del_codigo():
    encontrados = set()
    for ruta in sorted(APPS.rglob("*.py")):
        relativa = "/" + ruta.relative_to(APPS).as_posix()
        if "/tests/" in relativa or "/migrations/" in relativa:
            continue
        encontrados |= _literales_de(ast.parse(ruta.read_text(encoding="utf-8"), filename=relativa))
    return encontrados


# ── Las afirmaciones (las usan la prueba y su control negativo) ────────────────────────────────────────────────────
def _afirmar_toda_ruta_declara_su_auditoria(filas):
    sin_declarar = [(f["method"], f["route"]) for f in filas if _requiere_declaracion(f) and not f["audit"]]
    assert not sin_declarar, f"{MENSAJE}: {sin_declarar}"


def _afirmar_codigos_y_exenciones_validos(tabla):
    etiquetas = set(audit_service.AUDIT_TAXONOMY.values())
    for clave, valor in tabla.items():
        if str(valor).startswith("EXENTO"):
            motivo = str(valor).removeprefix(EXENTO).strip() if str(valor).startswith(EXENTO) else ""
            assert motivo, f"{clave}: una exención lleva «EXENTO: <motivo>» con el motivo escrito"
            continue
        codigos = _codigos(valor)
        assert codigos and all(codigos), f"{clave}: declara una auditoría vacía"
        for codigo in codigos:
            conocido = codigo in audit_service.AUDIT_TAXONOMY or codigo in etiquetas
            assert conocido, f"{clave}: «{codigo}» no está en AUDIT_TAXONOMY (ni como código ni como etiqueta)"


def _afirmar_sin_codigos_fantasma(tabla, escritos):
    declarados = {codigo for valor in tabla.values() for codigo in _codigos(valor)}
    fantasmas = sorted(declarados - escritos)
    assert not fantasmas, (
        f"códigos declarados en AUDIT_BY_ROUTE que ningún @auditable/record/append de apps/ escribe: {fantasmas}"
    )


def _afirmar_todo_codigo_escrito_tiene_etiqueta(escritos):
    """Un código crudo (``USER_APPROVED``) debe tener su etiqueta en la taxonomía; uno que ya es una etiqueta
    (``asignacion.crear``, que contiene un punto) debe ser una etiqueta que la taxonomía conoce."""
    etiquetas = set(audit_service.AUDIT_TAXONOMY.values())
    sin_etiqueta = sorted(
        codigo for codigo in escritos
        if (codigo not in etiquetas if "." in codigo else codigo not in audit_service.AUDIT_TAXONOMY)
    )
    assert not sin_etiqueta, f"códigos que se escriben y no tienen etiqueta en AUDIT_TAXONOMY: {sin_etiqueta}"


# ── Las pruebas sobre el código y el inventario reales ─────────────────────────────────────────────────────────────
def test_toda_ruta_que_muta_o_lee_datos_ajenos_declara_su_auditoria():
    _afirmar_toda_ruta_declara_su_auditoria(surface.collect_routes())


def test_cada_codigo_declarado_existe_en_la_taxonomia_y_cada_exencion_lleva_motivo():
    _afirmar_codigos_y_exenciones_validos(surface.AUDIT_BY_ROUTE)


def test_ningun_codigo_declarado_es_un_fantasma():
    _afirmar_sin_codigos_fantasma(surface.AUDIT_BY_ROUTE, _literales_del_codigo())


def test_todo_codigo_que_el_codigo_escribe_tiene_su_etiqueta_en_la_taxonomia():
    _afirmar_todo_codigo_escrito_tiene_etiqueta(_literales_del_codigo())


def test_la_tabla_no_declara_rutas_que_ya_no_existen():
    existentes = {(fila["route"], fila["method"]) for fila in surface.collect_routes()}

    assert sorted(set(surface.AUDIT_BY_ROUTE) - existentes) == []


def test_el_campo_audit_del_inventario_es_la_tabla():
    for fila in surface.collect_routes():
        assert fila["audit"] == surface.AUDIT_BY_ROUTE.get((fila["route"], fila["method"])), fila


def test_los_dos_prefijos_de_autoria_declaran_lo_mismo():
    """``/api/authoring/cases`` es el espacio canónico y ``/api/admin/cases`` su alias: el mismo urlconf, la misma auditoría."""
    canonica, alias = ALIAS_DE_AUTORIA

    def sufijos(prefijo):
        return {
            (ruta.removeprefix(prefijo), metodo): valor
            for (ruta, metodo), valor in surface.AUDIT_BY_ROUTE.items()
            if ruta == prefijo or ruta.startswith(prefijo + "/")
        }

    assert sufijos(canonica) and sufijos(canonica) == sufijos(alias)


def test_las_lecturas_publicas_y_las_del_estudiante_no_exigen_declaracion():
    """La regla no es desmesurada: las que quedan sin declarar son públicas o del ESTUDIANTE sobre su propio intento."""
    sin_declarar = [f for f in surface.collect_routes() if not _requiere_declaracion(f)]

    assert sin_declarar
    for fila in sin_declarar:
        assert fila["method"] == "GET", fila
        assert fila["exposure"] == surface.PUBLIC or _roles(fila) == {"ESTUDIANTE"}, fila


# ── Las rutas que el plan nombra tienen su código ──────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "ruta, metodo, codigo",
    [
        ("api/auth/login", "POST", "LOGIN_SUCCEEDED"),
        ("api/auth/login", "POST", "LOGIN_FAILED"),
        ("api/auth/login", "POST", "LOGIN_LOCKED"),
        ("api/auth/google", "POST", "LOGIN_SUCCEEDED"),
        ("api/auth/logout", "POST", "LOGOUT"),
        ("api/admin/users", "POST", "USER_CREATED"),
        ("api/admin/users/<int:user_id>", "PUT", "USER_ROLE_CHANGED"),
        ("api/admin/users/<int:user_id>/status", "PATCH", "USER_STATUS_CHANGED"),
        ("api/auth/access-request", "POST", "ACCESS_REQUEST_CREATED"),
        ("api/admin/access-requests/<int:request_id>/status", "PATCH", "ACCESS_REQUEST_RESOLVED"),
        ("api/reportes/grupo/<int:grupo_id>", "GET", "REPORT_VIEWED"),
        ("api/reportes/estudiante/<int:estudiante_id>", "GET", "REPORT_VIEWED"),
        ("api/reportes/dashboard", "GET", "ANALYTICS_VIEWED"),
        ("api/reportes/grupo/<int:grupo_id>/export", "GET", "REPORT_EXPORTED"),
        ("api/admin/audit", "GET", "AUDIT_VIEWED"),
        ("api/rubrics", "POST", "RUBRIC_CREATED"),
        ("api/rubrics/<int:rubric_id>", "PUT", "RUBRIC_UPDATED"),
        ("api/rubrics/<int:rubric_id>/activate", "POST", "RUBRIC_ACTIVATED"),
    ],
)
def test_las_rutas_del_plan_declaran_su_evento(ruta, metodo, codigo):
    assert codigo in _codigos(surface.AUDIT_BY_ROUTE[(ruta, metodo)])


# ── Controles negativos ────────────────────────────────────────────────────────────────────────────────────────────
def _fila_inventada(metodo="POST", exposicion="role:ADMIN", audit=None):
    return {
        "route": "api/inventada", "method": metodo, "exposure": exposicion, "body": "json-small",
        "throttle": None, "audit": audit,
    }


@pytest.mark.parametrize("metodo", MUTANTES)
def test_control_negativo_una_ruta_que_muta_y_no_declara_rompe_la_compuerta(metodo):
    filas = [*surface.collect_routes(), _fila_inventada(metodo)]

    with pytest.raises(AssertionError, match="AUDIT_BY_ROUTE en shared/surface.py"):
        _afirmar_toda_ruta_declara_su_auditoria(filas)


@pytest.mark.parametrize("exposicion", ["role:ADMIN", "role:PROFESOR", "role:ADMIN,PROFESOR", "role:ADMIN,ESTUDIANTE"])
def test_control_negativo_una_lectura_de_personal_que_no_declara_rompe_la_compuerta(exposicion):
    filas = [*surface.collect_routes(), _fila_inventada("GET", exposicion)]

    with pytest.raises(AssertionError, match="AUDIT_BY_ROUTE en shared/surface.py"):
        _afirmar_toda_ruta_declara_su_auditoria(filas)


@pytest.mark.parametrize("exposicion", ["public", "role:ESTUDIANTE"])
def test_una_lectura_publica_o_del_estudiante_no_rompe_la_compuerta(exposicion):
    _afirmar_toda_ruta_declara_su_auditoria([*surface.collect_routes(), _fila_inventada("GET", exposicion)])


def test_control_negativo_una_ruta_nueva_de_verdad_sin_declarar_rompe_la_compuerta(monkeypatch):
    """Con el recorrido real del ``urlconf``: una vista que muta y se monta sin tocar ``AUDIT_BY_ROUTE`` la rompe."""

    class RutaNueva(APIView):
        permission_classes = [policy_permission("user", "manage")]

        def post(self, request):
            return None

    urlconf = SimpleNamespace(url_patterns=[*get_resolver().url_patterns, path("api/nueva-ruta-mutante", RutaNueva.as_view())])
    monkeypatch.setattr(surface, "get_resolver", lambda: urlconf)

    with pytest.raises(AssertionError, match="api/nueva-ruta-mutante"):
        _afirmar_toda_ruta_declara_su_auditoria(surface.collect_routes())


def test_control_negativo_borrar_una_declaracion_real_hace_caer_la_compuerta(monkeypatch):
    """La tabla y las filas van unidas: quitar la declaración del acceso deja la ruta sin auditoría y la prueba la nombra."""
    monkeypatch.delitem(surface.AUDIT_BY_ROUTE, ("api/auth/login", "POST"))

    with pytest.raises(AssertionError, match="api/auth/login"):
        _afirmar_toda_ruta_declara_su_auditoria(surface.collect_routes())


def test_control_negativo_un_codigo_fantasma_rompe_la_prueba():
    inventado = {**surface.AUDIT_BY_ROUTE, ("api/inventada", "POST"): "CODIGO_FANTASMA"}
    # Existe en la taxonomía, pero ningún código lo escribe (``traza.leer`` se escribe con su etiqueta, no con este código).
    solo_en_la_taxonomia = {**surface.AUDIT_BY_ROUTE, ("api/inventada", "GET"): "TRACE_VIEWED"}

    with pytest.raises(AssertionError, match="CODIGO_FANTASMA"):
        _afirmar_sin_codigos_fantasma(inventado, _literales_del_codigo())
    with pytest.raises(AssertionError, match="TRACE_VIEWED"):
        _afirmar_sin_codigos_fantasma(solo_en_la_taxonomia, _literales_del_codigo())


@pytest.mark.parametrize("valor", ["EXENTO:", "EXENTO:    ", "EXENTO", "EXENTO sin dos puntos", ""])
def test_control_negativo_una_exencion_sin_motivo_rompe_la_prueba(valor):
    with pytest.raises(AssertionError):
        _afirmar_codigos_y_exenciones_validos({("api/inventada", "POST"): valor})


def test_control_negativo_un_codigo_que_no_esta_en_la_taxonomia_rompe_la_prueba():
    with pytest.raises(AssertionError, match="CODIGO_FANTASMA"):
        _afirmar_codigos_y_exenciones_validos({("api/inventada", "POST"): "LOGIN_SUCCEEDED,CODIGO_FANTASMA"})


def test_control_negativo_un_codigo_escrito_sin_etiqueta_rompe_la_prueba():
    escritos = _literales_del_codigo() | {"CODIGO_SIN_ETIQUETA", "entidad.verbo_desconocido"}

    with pytest.raises(AssertionError, match="CODIGO_SIN_ETIQUETA"):
        _afirmar_todo_codigo_escrito_tiene_etiqueta(escritos)


# ── La búsqueda AST encuentra las formas que usa el código ─────────────────────────────────────────────────────────
def test_la_busqueda_ast_encuentra_las_formas_que_usa_el_codigo():
    fuente = '''
@auditable("COMO_DECORADOR", "X")
def f(): ...

g = auditable("COMO_LLAMADA", "X")(g)
audit_service.record("CON_RECORD", "X")
record("RECORD_SUELTO")
audit_service.append(None, "SYSTEM", "APPEND_POSICIONAL", "X", "1", {}, None, None, None)
audit_service.append(actor_id=None, actor_role="X", action="APPEND_CON_NOMBRE", resource_type="X")
lista.append("NO_ES_AUDITORIA")
lista.append("tampoco", "ni esto")
auditable(variable)
'''
    encontrados = _literales_de(ast.parse(fuente))

    assert encontrados == {
        "COMO_DECORADOR", "COMO_LLAMADA", "CON_RECORD", "RECORD_SUELTO", "APPEND_POSICIONAL", "APPEND_CON_NOMBRE",
    }


def test_el_codigo_real_escribe_los_eventos_de_s4_1():
    escritos = _literales_del_codigo()

    for codigo in (
        "LOGIN_SUCCEEDED", "LOGIN_FAILED", "LOGIN_LOCKED", "LOGOUT", "USER_CREATED", "USER_UPDATED", "USER_STATUS_CHANGED",
        "USER_ROLE_CHANGED", "ACCESS_REQUEST_CREATED", "ACCESS_REQUEST_RESOLVED", "REPORT_VIEWED", "REPORT_EXPORTED",
        "AUDIT_VIEWED", "RUBRIC_CREATED", "RUBRIC_UPDATED", "RUBRIC_ACTIVATED", "ADMIN_CREATED_BY_COMMAND",
        "ADMIN_RESET_BY_COMMAND",
    ):
        assert codigo in escritos, codigo


def test_la_expresion_regular_de_los_codigos_de_la_tabla_no_admite_espacios_sueltos():
    """Un código con espacios o mayúsculas mezcladas sería un error de tipeo en la tabla."""
    for valor in surface.AUDIT_BY_ROUTE.values():
        for codigo in _codigos(valor):
            assert re.fullmatch(r"[A-Z][A-Z0-9_]*|[a-z]+\.[a-z_]+", codigo), codigo
