"""A-06 — La contraseña con la que se crean los estudiantes importados sin password propio es configuración.

Antes era una constante dentro de ``grupos/services.py``
(``DEFAULT_IMPORTED_STUDENT_PASSWORD = "Siep2026!"``). Ahora sale de
``settings.IMPORTED_STUDENT_DEFAULT_PASSWORD``, que lee la variable de entorno del
mismo nombre y, si no existe o está vacía, conserva el valor de siempre: nunca se
crea una cuenta con la contraseña en blanco.
"""
import importlib
import io
import zipfile
from xml.etree import ElementTree as ET

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings

from apps.grupos import services

from .test_grupos import _xlsx_upload, cl, profesor  # noqa: F401

User = get_user_model()

POR_DEFECTO = "Siep2026!"
OTRA = "Otra-Clave-2026!"
SPREADSHEET_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def _importar(profesor, filas, codigo):
    grupo = cl(profesor).post("/api/grupos", {"nombre": "G", "codigo": codigo}, format="json").data["data"]
    resp = cl(profesor).post(
        f"/api/grupos/{grupo['id']}/estudiantes/import/",
        {"file": _xlsx_upload([["nombre", "apellido", "email", "password"], *filas])},
        format="multipart",
    )
    assert resp.status_code == 200, resp.data
    return resp.data["data"]


def _textos_de_las_instrucciones(xlsx_bytes):
    with zipfile.ZipFile(io.BytesIO(xlsx_bytes)) as zf:
        sheet = zf.read("xl/worksheets/sheet2.xml").decode("utf-8")
    return [node.text or "" for node in ET.fromstring(sheet).iter(f"{SPREADSHEET_NS}t")]


# ── lo que ya hacía (debe seguir igual sin configurar nada) ──────────────────
def test_sin_configurar_nada_la_contrasena_por_defecto_es_la_de_siempre(profesor):
    data = _importar(profesor, [["Ana", "Rojas", "ana.a06@x.com", ""]], "A06A")

    assert data["defaultPassword"] == POR_DEFECTO
    assert User.objects.get(email="ana.a06@x.com").check_password(POR_DEFECTO)


def test_la_plantilla_dice_cual_es_la_contrasena_por_defecto():
    textos = _textos_de_las_instrucciones(services.student_import_template_bytes())

    assert f"Si se deja vacio se usara {POR_DEFECTO}." in textos


# ── lo que se vuelve configurable ────────────────────────────────────────────
@override_settings(IMPORTED_STUDENT_DEFAULT_PASSWORD=OTRA)
def test_la_contrasena_configurada_se_informa_y_se_usa(profesor):
    data = _importar(profesor, [["Ana", "Rojas", "ana.a06b@x.com", ""]], "A06B")

    assert data["defaultPassword"] == OTRA
    creada = User.objects.get(email="ana.a06b@x.com")
    assert creada.check_password(OTRA)
    assert not creada.check_password(POR_DEFECTO)


@override_settings(IMPORTED_STUDENT_DEFAULT_PASSWORD=OTRA)
def test_una_contrasena_propia_en_el_archivo_manda_sobre_la_configurada(profesor):
    _importar(profesor, [["Luis", "Perez", "luis.a06@x.com", "Propia-123!"]], "A06C")

    creada = User.objects.get(email="luis.a06@x.com")
    assert creada.check_password("Propia-123!")
    assert not creada.check_password(OTRA)


@override_settings(IMPORTED_STUDENT_DEFAULT_PASSWORD=OTRA)
def test_la_plantilla_dice_la_contrasena_configurada():
    textos = _textos_de_las_instrucciones(services.student_import_template_bytes())

    assert f"Si se deja vacio se usara {OTRA}." in textos
    assert not any(POR_DEFECTO in texto for texto in textos)


# ── cómo se lee de la variable de entorno ────────────────────────────────────
@pytest.fixture
def leer_de_base(monkeypatch):
    """Devuelve el valor que `settings/base.py` calcula para un valor dado de la variable de entorno."""
    from psychosim.settings import base

    def leer(valor):
        if valor is None:
            monkeypatch.delenv("IMPORTED_STUDENT_DEFAULT_PASSWORD", raising=False)
        else:
            monkeypatch.setenv("IMPORTED_STUDENT_DEFAULT_PASSWORD", valor)
        return importlib.reload(base).IMPORTED_STUDENT_DEFAULT_PASSWORD

    yield leer
    monkeypatch.undo()
    importlib.reload(base)


def test_la_variable_de_entorno_define_la_contrasena(leer_de_base):
    assert leer_de_base("Clave-Real-1") == "Clave-Real-1"


def test_la_variable_de_entorno_se_recorta(leer_de_base):
    assert leer_de_base("  Clave-Real-1  ") == "Clave-Real-1"


@pytest.mark.parametrize("valor", [None, "", "   "])
def test_sin_variable_o_en_blanco_se_conserva_el_valor_de_siempre(leer_de_base, valor):
    assert leer_de_base(valor) == POR_DEFECTO
