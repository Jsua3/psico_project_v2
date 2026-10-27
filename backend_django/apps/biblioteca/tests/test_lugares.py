"""P6 · Tarea 2 · La biblioteca de lugares por API: ``GET /api/biblioteca/lugares`` y ``…/lugares/<id>``.

La biblioteca vive en ``biblioteca/escenarios/`` (P1/P4). La API la lee del disco en cada petición y se la sirve al
editor de casos: solo a quien autora (PROFESOR y ADMIN). Nunca devuelve rutas del servidor; el arte va como URL pública
bajo ``/assets/biblioteca/``.
"""
import json
from pathlib import Path

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.biblioteca.services import lugares

User = get_user_model()
LUGARES = "/api/biblioteca/lugares"
URL_PUBLICA = "/assets/biblioteca/escenarios/"


def cl(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


def _user(email, role):
    return User.objects.create_user(email=email, password="pass1234", nombre="N", apellido="A", role=role)


@pytest.fixture
def profesor(db):
    return _user("bib_prof@x.com", "PROFESOR")


@pytest.fixture
def admin(db):
    return _user("bib_admin@x.com", "ADMIN")


@pytest.fixture
def estudiante(db):
    return _user("bib_est@x.com", "ESTUDIANTE")


def _textos(valor):
    """Todos los textos de un JSON, en cualquier profundidad."""
    if isinstance(valor, dict):
        for hijo in valor.values():
            yield from _textos(hijo)
    elif isinstance(valor, list):
        for hijo in valor:
            yield from _textos(hijo)
    elif isinstance(valor, str):
        yield valor


def _rutas_de_arte(valor):
    """Los pares ``(clave, texto)`` de las claves que llevan una imagen: ``arte``, ``fondo``, ``hoja`` y ``portada``."""
    if isinstance(valor, dict):
        for clave, hijo in valor.items():
            if clave in {"arte", "fondo", "hoja", "portada"} and isinstance(hijo, str):
                yield clave, hijo
            else:
                yield from _rutas_de_arte(hijo)
    elif isinstance(valor, list):
        for hijo in valor:
            yield from _rutas_de_arte(hijo)


# ─── quién puede usarla ───────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("ruta", [LUGARES, f"{LUGARES}/universidad"])
def test_el_profesor_y_el_admin_leen_la_biblioteca(profesor, admin, ruta):
    assert cl(profesor).get(ruta).status_code == 200
    assert cl(admin).get(ruta).status_code == 200


@pytest.mark.parametrize("ruta", [LUGARES, f"{LUGARES}/universidad"])
def test_un_estudiante_no_lee_la_biblioteca(estudiante, ruta):
    assert cl(estudiante).get(ruta).status_code == 403


@pytest.mark.parametrize("ruta", [LUGARES, f"{LUGARES}/universidad"])
def test_sin_sesion_es_401(db, ruta):
    assert cl().get(ruta).status_code == 401


# ─── la lista ─────────────────────────────────────────────────────────────────────────────────
def test_la_lista_trae_los_lugares_del_indice(profesor):
    indice = json.loads((Path(settings.BIBLIOTECA_DIR) / "escenarios" / "indice.json").read_text(encoding="utf-8"))
    response = cl(profesor).get(LUGARES)
    lista = response.data["data"]
    assert [lugar["id"] for lugar in lista] == [lugar["id"] for lugar in indice["lugares"]]
    universidad = next(lugar for lugar in lista if lugar["id"] == "universidad")
    assert universidad["nombre"] == "Universidad"
    assert universidad["salas"] == 10 and universidad["hitos"] == 6
    assert universidad["completo"] is True and universidad["arteProvisional"] is True
    assert universidad["nivelRiesgoPorDefecto"] == "MODERATE"
    assert universidad["temas"] == ["orientacion", "bienestar", "violencia-genero"]
    assert universidad["descripcion"]
    assert universidad["portada"].startswith(URL_PUBLICA + "universidad/arte/salas/")


# ─── el detalle ───────────────────────────────────────────────────────────────────────────────
def test_el_detalle_trae_salas_catalogo_hitos_y_personajes(profesor):
    lugar = cl(profesor).get(f"{LUGARES}/universidad").data["data"]
    assert lugar["id"] == "universidad"
    assert len(lugar["salas"]) == 10
    sala = next(s for s in lugar["salas"] if s["id"] == "pasillo")
    assert sala["fondo"] == f"{URL_PUBLICA}universidad/arte/salas/pasillo.png"
    assert {"muebles", "objetos", "personajes", "puertas", "entrada"} <= set(sala)
    assert len(lugar["hitos"]) == 6 and lugar["nivelRiesgoPorDefecto"] == "MODERATE"
    assert {"muebles", "objetos", "herramientas"} == set(lugar["catalogo"])
    assert lugar["recorridosSugeridos"] and lugar["personajes"]


def test_el_arte_del_detalle_son_urls_publicas(profesor):
    lugar = cl(profesor).get(f"{LUGARES}/universidad").data["data"]
    catalogo = lugar["catalogo"]
    artes = [m["arte"] for m in catalogo["muebles"]]
    artes += [o["arte"] for o in catalogo["objetos"]] + [h["arte"] for h in catalogo["herramientas"]]
    artes += [o["animacionCerca"]["hoja"] for o in catalogo["objetos"] if "animacionCerca" in o]
    artes += [s["fondo"] for s in lugar["salas"]]
    assert artes and all(a.startswith(URL_PUBLICA + "universidad/arte/") and a.endswith(".png") for a in artes)


def test_un_lugar_inexistente_es_404(profesor):
    response = cl(profesor).get(f"{LUGARES}/no-existe")
    assert response.status_code == 404
    assert response.data["code"] == "NOT_FOUND"


@pytest.mark.parametrize("id_", ["..", "../escenarios", "UNIVERSIDAD", "universidad%2f..", "a b", "-x", "x--y"])
def test_un_id_raro_nunca_sale_de_la_biblioteca(profesor, id_):
    assert cl(profesor).get(f"{LUGARES}/{id_}").status_code == 404


def test_solo_se_sirve_lo_que_el_indice_nombra(profesor, tmp_path, settings):
    """Una carpeta del disco que el índice no nombra no es un lugar."""
    (tmp_path / "escenarios" / "huerfano").mkdir(parents=True)
    (tmp_path / "escenarios" / "huerfano" / "escenario.json").write_text("{}", encoding="utf-8")
    (tmp_path / "escenarios" / "indice.json").write_text(json.dumps({"esquema": 1, "lugares": []}), encoding="utf-8")
    settings.BIBLIOTECA_DIR = tmp_path
    assert cl(profesor).get(f"{LUGARES}/huerfano").status_code == 404
    assert cl(profesor).get(LUGARES).data["data"] == []


def test_la_biblioteca_ausente_es_un_503_claro(profesor, tmp_path, settings):
    settings.BIBLIOTECA_DIR = tmp_path / "vacia"
    response = cl(profesor).get(LUGARES)
    assert response.status_code == 503
    assert response.data["code"] == "BIBLIOTECA_NO_DISPONIBLE"
    assert str(tmp_path) not in json.dumps(response.data)


# ─── lo que nunca sale ────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("ruta", [LUGARES, f"{LUGARES}/universidad", f"{LUGARES}/casa", f"{LUGARES}/comisaria"])
def test_la_respuesta_de_lugares_no_incluye_rutas_absolutas(profesor, ruta):
    cuerpo = cl(profesor).get(ruta).data
    secretos = {str(settings.BIBLIOTECA_DIR), str(settings.BASE_DIR), str(Path(settings.BIBLIOTECA_DIR).parent)}
    for texto in _textos(cuerpo):
        assert not any(secreto and secreto in texto for secreto in secretos), texto
        assert "\\" not in texto, texto
        assert not (len(texto) > 2 and texto[1:3] == ":/"), texto  # ``D:/…``
        assert not texto.startswith(("/app/", "/home/", "/usr/", "/var/", "/tmp/")), texto
    for clave, ruta_de_arte in _rutas_de_arte(cuerpo):
        assert ruta_de_arte.startswith("/assets/biblioteca/escenarios/"), (clave, ruta_de_arte)


# ─── el servicio devuelve copias ──────────────────────────────────────────────────────────────
def test_cargar_lugar_devuelve_una_copia_cada_vez(db):
    primero = lugares.cargar_lugar("universidad")
    primero["salas"][0]["nombre"] = "MUTADO"
    primero["hitos"].clear()
    segundo = lugares.cargar_lugar("universidad")
    assert segundo["salas"][0]["nombre"] != "MUTADO"
    assert len(segundo["hitos"]) == 6


def test_los_tres_lugares_del_indice_se_cargan_con_su_id(db):
    for entrada in lugares.listar_lugares():
        assert lugares.cargar_lugar(entrada["id"])["id"] == entrada["id"]
