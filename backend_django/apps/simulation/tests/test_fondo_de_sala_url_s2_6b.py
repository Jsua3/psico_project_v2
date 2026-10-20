"""S2-6b · La URL del fondo de sala (``world_asset_url_problem``).

El fondo de sala lo carga el navegador de CADA estudiante (envía su IP y su navegador al tercero), así que solo puede
salir de ``/assets/`` del propio sitio o de un host que el servidor permita (``SIEP_ALLOWED_ASSET_HOSTS``, vacía por
defecto: solo rutas propias). La prueba de guardado y de publicación está en ``test_limites_autoria_s2_6b.py``.
"""
import pytest

from apps.simulation.services.world_assets import world_asset_url_problem

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security]

HOST_PERMITIDO = "permitido.test"


@pytest.fixture
def sin_hosts(settings):
    settings.SIEP_ALLOWED_ASSET_HOSTS = []
    return settings


@pytest.fixture
def con_host_permitido(settings):
    settings.SIEP_ALLOWED_ASSET_HOSTS = [HOST_PERMITIDO]
    return settings


@pytest.mark.parametrize("valor", [None, "", "/assets/world/bg.webp", "/assets/world/a_b-c.png"])
def test_sin_fondo_o_con_ruta_propia_es_valido(sin_hosts, valor):
    assert world_asset_url_problem(valor) is None


@pytest.mark.parametrize(
    "valor",
    [
        "/assets/../x",                    # subir de carpeta
        "//evil.test/x.png",               # URL protocol-relative: no empieza por /assets/
        "http://x",                        # sin TLS y fuera de la lista
        "javascript:alert(1)",
        "data:image/png;base64,AAAA",
        "file:///etc/passwd",
        "assets/world/bg.webp",            # relativa sin la barra inicial de /assets/
        "/assets/mal\\ruta.png",           # barra invertida
        "/assets/con\x00nulo.png",         # carácter de control
        "/assets/doble//barra.png",        # doble barra dentro de la ruta propia
        "/assets/%2e%2e/x.png",            # %2e%2e: el navegador lo normaliza como «..»
        "/assets/%2E%2e/x.png",            # las mayúsculas de la codificación cuentan igual
        "/assets/..%2fx.png",              # %2f: una barra codificada
        "/assets/x%5cy.png",               # %5c: una barra invertida codificada
        "/assets/" + "a" * 293,            # 301 caracteres: se pasa del tope de 300
        "a" * 301,                         # 301 caracteres y ni siquiera es una ruta propia
        "https://evil.test/x.png",         # https de un host que no está en la lista
        5,                                 # no es texto
    ],
)
def test_ruta_ajena_o_mal_formada_da_un_problema(sin_hosts, valor):
    problema = world_asset_url_problem(valor)

    assert isinstance(problema, str) and problema


def test_https_de_host_permitido_es_valido(con_host_permitido):
    assert world_asset_url_problem(f"https://{HOST_PERMITIDO}/x.png") is None


def test_https_de_host_que_no_esta_en_la_lista_da_problema(sin_hosts):
    assert world_asset_url_problem(f"https://{HOST_PERMITIDO}/x.png") is not None


def test_https_de_host_permitido_en_mayusculas_es_valido(con_host_permitido):
    assert world_asset_url_problem(f"https://{HOST_PERMITIDO.upper()}/x.png") is None


@pytest.mark.parametrize(
    "valor",
    [
        f"https://u:p@{HOST_PERMITIDO}/x",     # usuario y contraseña
        f"https://{HOST_PERMITIDO}:8443/x",    # puerto
        f"https://{HOST_PERMITIDO}",           # sin ruta de archivo
        "https://127.0.0.1/x.png",             # dirección IP literal
        "https://[::1]/x.png",                 # IPv6 literal
        f"https://{HOST_PERMITIDO}/%2e%2e/x.png",  # una codificación de «..» en la ruta, con el host permitido
        f"https://{HOST_PERMITIDO}/a%2Fb.png",     # %2f en mayúsculas
        f"https://{HOST_PERMITIDO}/a%5Cb.png",     # %5c en mayúsculas
    ],
)
def test_https_con_credenciales_puerto_sin_ruta_o_ip_da_problema(con_host_permitido, valor):
    assert world_asset_url_problem(valor) is not None


def test_una_ip_no_se_admite_aunque_este_en_la_lista(settings):
    settings.SIEP_ALLOWED_ASSET_HOSTS = ["127.0.0.1"]

    assert world_asset_url_problem("https://127.0.0.1/x.png") is not None


# ─── Codificaciones de punto, barra y barra invertida (%2e, %2f, %5c) ─────────────────────
@pytest.mark.parametrize("codificacion", ["%2e", "%2E", "%2f", "%2F", "%5c", "%5C"])
def test_ruta_propia_con_un_punto_una_barra_o_una_barra_invertida_codificados_da_problema(sin_hosts, codificacion):
    assert world_asset_url_problem(f"/assets/x{codificacion}y.png") is not None


@pytest.mark.parametrize("codificacion", ["%2e%2e", "%2E%2e", "%2e%2E", "%2E%2E", "..%2f", "%2f..", "%5c%2e"])
def test_ruta_propia_con_combinaciones_de_codificacion_da_problema(sin_hosts, codificacion):
    assert world_asset_url_problem(f"/assets/{codificacion}x.png") is not None


@pytest.mark.parametrize("codificacion", ["%2e%2e", "%2E%2e", "%2f", "%5C"])
def test_https_de_host_permitido_con_codificacion_da_problema(con_host_permitido, codificacion):
    assert world_asset_url_problem(f"https://{HOST_PERMITIDO}/a{codificacion}b.png") is not None


def test_una_ruta_propia_sin_codificaciones_sigue_valida(sin_hosts):
    # Un nombre con guion bajo y un punto normal no es una codificación: la regla no debe frenarlo.
    assert world_asset_url_problem("/assets/world/mi_fondo.v2.webp") is None
