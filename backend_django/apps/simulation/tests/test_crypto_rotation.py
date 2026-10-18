"""S5-2 · Llaves de reflexiones versionadas, rotación y reporte del docente con filas ilegibles.

Cada prueba genera sus llaves con ``secrets.token_urlsafe``: ningún secreto es un literal.
"""
import base64
import io
import logging
import runpy
import secrets
import uuid
from pathlib import Path
from unittest import mock

import pytest
from cryptography.exceptions import InvalidTag
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.models import CaseVersion, ReflectionJournal, SimulationAttempt, SimulationNode
from apps.simulation.services import crypto_service

pytestmark = [pytest.mark.req("RNF-01"), pytest.mark.security]

User = get_user_model()
HEREDADA = "local-aes-gcm-v1"
COMANDO = "rotate_reflection_key"
BASE_PY = Path(__file__).resolve().parents[3] / "psychosim" / "settings" / "base.py"


def _secreto():
    return secrets.token_urlsafe(48)


def _texto():
    return "Bitácora " + secrets.token_urlsafe(16)


def _ids():
    """Un intento y un nodo con la forma que usa el servidor (UUID y entero)."""
    return uuid.uuid4(), secrets.randbelow(10**9) + 1


@pytest.fixture
def llave_versionada(settings):
    """La activa es ``k1``; ``k2`` queda para rotar después; la heredada tiene su propio secreto."""
    settings.REFLECTION_ENCRYPTION_KEY = _secreto()
    settings.REFLECTION_KEYS = {"k1": _secreto(), "k2": _secreto()}
    settings.REFLECTION_ACTIVE_KEY = "k1"
    return settings


# ── Ajustes (psychosim/settings/base.py): REFLECTION_KEYS y REFLECTION_ACTIVE_KEY ───────────────────


def _base(monkeypatch, **entorno):
    """Carga base.py con ese entorno, sin REFLECTION_KEYS ni REFLECTION_ACTIVE_KEY salvo que se pasen."""
    for nombre in ("REFLECTION_KEYS", "REFLECTION_ACTIVE_KEY"):
        monkeypatch.delenv(nombre, raising=False)
    for nombre, valor in entorno.items():
        monkeypatch.setenv(nombre, valor)
    return runpy.run_path(str(BASE_PY), run_name="base_bajo_prueba")


def test_sin_reflection_keys_la_activa_es_la_heredada(monkeypatch):
    base = _base(monkeypatch)

    assert base["REFLECTION_KEYS"] == {}
    assert base["REFLECTION_ACTIVE_KEY"] == HEREDADA


def test_una_activa_vacia_o_con_espacios_cuenta_como_ausente(monkeypatch):
    base = _base(monkeypatch, REFLECTION_ACTIVE_KEY="   ")

    assert base["REFLECTION_ACTIVE_KEY"] == HEREDADA


def test_reflection_keys_admite_espacios_y_un_trozo_vacio_al_final(monkeypatch):
    k1, k2 = _secreto(), _secreto()

    base = _base(monkeypatch, REFLECTION_KEYS=f"  k1 = {k1} , k2={k2},", REFLECTION_ACTIVE_KEY=" k2 ")

    assert base["REFLECTION_KEYS"] == {"k1": k1, "k2": k2}
    assert base["REFLECTION_ACTIVE_KEY"] == "k2"


@pytest.mark.parametrize("forma", ["sin_igual", "id_vacio", "secreto_vacio", "id_con_espacio", "id_con_caracter_raro"])
def test_un_par_mal_formado_detiene_el_arranque_sin_mostrar_el_secreto(monkeypatch, forma):
    secreto = _secreto()
    pares = {
        "sin_igual": secreto,
        "id_vacio": f"={secreto}",
        "secreto_vacio": "k2=",
        "id_con_espacio": f"k 2={secreto}",
        "id_con_caracter_raro": f"k$2={secreto}",
    }

    with pytest.raises(ImproperlyConfigured, match="REFLECTION_KEYS: el par 2 no tiene la forma id=secreto") as error:
        _base(monkeypatch, REFLECTION_KEYS=f"k1={_secreto()},{pares[forma]}")

    # La causa va en el mensaje; el secreto, ni entero ni en parte, y tampoco en una excepción encadenada.
    assert secreto not in str(error.value)
    assert error.value.__context__ is None


def test_un_id_repetido_detiene_el_arranque(monkeypatch):
    with pytest.raises(ImproperlyConfigured, match="repite un id"):
        _base(monkeypatch, REFLECTION_KEYS=f"k1={_secreto()},k1={_secreto()}")


# ── crypto_service: compatibilidad con la heredada y llaves versionadas ─────────────────────────────


def test_las_filas_con_la_heredada_siguen_legibles_cuando_la_activa_es_versionada(llave_versionada):
    llave_versionada.REFLECTION_ACTIVE_KEY = HEREDADA
    texto = _texto()
    antigua = crypto_service.encrypt(texto)  # cifrada como antes de S5-2: sin datos asociados
    llave_versionada.REFLECTION_ACTIVE_KEY = "k1"

    assert crypto_service.key_ref() == "k1"
    assert crypto_service.decrypt(antigua, key_ref=HEREDADA) == texto
    assert crypto_service.decrypt(antigua) == texto


def test_con_llave_versionada_el_texto_vuelve_y_la_referencia_es_el_id(llave_versionada):
    intento, nodo = _ids()
    texto = _texto()

    cifrado = crypto_service.encrypt(texto, attempt_id=intento, node_id=nodo)

    assert cifrado != texto
    assert crypto_service.key_ref() == "k1"
    assert crypto_service.decrypt(cifrado, key_ref="k1", attempt_id=intento, node_id=nodo) == texto


@pytest.mark.parametrize("cambio", ["intento", "nodo"])
def test_mover_el_cifrado_a_otro_intento_o_nodo_hace_fallar_el_descifrado(llave_versionada, cambio):
    intento, nodo = _ids()
    cifrado = crypto_service.encrypt(_texto(), attempt_id=intento, node_id=nodo)
    otro_intento, otro_nodo = (uuid.uuid4(), nodo) if cambio == "intento" else (intento, nodo + 1)

    with pytest.raises(InvalidTag):
        crypto_service.decrypt(cifrado, key_ref="k1", attempt_id=otro_intento, node_id=otro_nodo)


def test_un_id_desconocido_lanza_unknown_key_ref_sin_secretos(llave_versionada):
    intento, nodo = _ids()
    cifrado = crypto_service.encrypt(_texto(), attempt_id=intento, node_id=nodo)
    secretos = [
        llave_versionada.REFLECTION_KEYS["k1"],
        llave_versionada.REFLECTION_KEYS["k2"],
        llave_versionada.REFLECTION_ENCRYPTION_KEY,
    ]

    with pytest.raises(crypto_service.UnknownKeyRef) as error:
        crypto_service.decrypt(cifrado, key_ref="retirada", attempt_id=intento, node_id=nodo)

    assert isinstance(error.value, ValueError)
    assert not any(secreto in str(error.value) for secreto in secretos)


def test_dos_ids_con_el_mismo_secreto_derivan_llaves_distintas(settings):
    secreto = _secreto()
    settings.REFLECTION_KEYS = {"k1": secreto, "k2": secreto}
    settings.REFLECTION_ACTIVE_KEY = "k1"
    intento, nodo = _ids()
    cifrado = crypto_service.encrypt(_texto(), attempt_id=intento, node_id=nodo)

    # Mismos datos asociados: lo único que cambia es el id que entra en HKDF.
    with pytest.raises(InvalidTag):
        crypto_service.decrypt(cifrado, key_ref="k2", attempt_id=intento, node_id=nodo)


def test_una_llave_versionada_no_cifra_sin_datos_asociados(llave_versionada):
    with pytest.raises(ValueError):
        crypto_service.encrypt(_texto())


def test_una_activa_ausente_de_reflection_keys_no_cifra(settings):
    settings.REFLECTION_KEYS = {"k1": _secreto()}
    settings.REFLECTION_ACTIVE_KEY = "k9"
    intento, nodo = _ids()

    with pytest.raises(ImproperlyConfigured, match="REFLECTION_KEYS"):
        crypto_service.encrypt(_texto(), attempt_id=intento, node_id=nodo)


# ── Base de datos: intentos reales, filas de bitácora y el comando de rotación ──────────────────────


@pytest.fixture
def estudiante(db):
    return User.objects.create_user(
        email="est_rotacion@x.com", password="x", nombre="Est", apellido="Rot", role="ESTUDIANTE"
    )


@pytest.fixture
def profesor(db):
    return User.objects.create_user(
        email="prof_rotacion@x.com", password="x", nombre="Pro", apellido="Rot", role="PROFESOR"
    )


def _cliente(usuario):
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


def _intento(estudiante, profesor):
    """Un intento real del estudiante, con el caso asignado a un grupo del docente.

    Devuelve (intento, tres nodos del caso, datos de la respuesta que abrió el intento).
    """
    caso = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    grupo = Grupo.objects.create(nombre="Grupo rotación", codigo=f"ROT-{secrets.token_hex(3)}", profesor=profesor)
    with connection.cursor() as cur:
        cur.execute(
            "INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, estudiante.id],
        )
        cur.execute(
            "INSERT INTO case_assignments (grupo_id, case_version_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [grupo.id, caso.id],
        )
    respuesta = _cliente(estudiante).post("/api/simulation/attempts", {"caseVersionId": caso.id}, format="json")
    assert respuesta.status_code == 200, respuesta.data
    datos = respuesta.data["data"]
    intento = SimulationAttempt.objects.get(pk=datos["attemptId"])
    nodos = list(SimulationNode.objects.filter(case_version_id=caso.id).order_by("pk")[:3])
    return intento, nodos, datos


def _fila(intento, nodo, texto, llave):
    """Una fila de bitácora cifrada con ``llave`` como la cifraría el servidor."""
    cifrado = crypto_service.encrypt(texto, key_ref=llave, attempt_id=intento.id, node_id=nodo.id)
    return ReflectionJournal.objects.create(attempt=intento, node=nodo, encrypted_text=cifrado, encryption_key_ref=llave)


def _leer(fila):
    """El texto de la fila, descifrado con SU referencia y SUS datos asociados."""
    fila.refresh_from_db()
    return crypto_service.decrypt(
        fila.encrypted_text, key_ref=fila.encryption_key_ref, attempt_id=fila.attempt_id, node_id=fila.node_id
    )


def _ref(fila):
    fila.refresh_from_db()
    return fila.encryption_key_ref


def _corromper(fila):
    """Deja la fila con un cifrado que ninguna llave descifra."""
    ReflectionJournal.objects.filter(pk=fila.pk).update(
        encrypted_text=base64.b64encode(secrets.token_bytes(40)).decode("ascii")
    )


def call_command_output(**opciones):
    """Ejecuta el comando capturando su salida (stdout y stderr)."""
    salida, errores = io.StringIO(), io.StringIO()
    call_command(COMANDO, stdout=salida, stderr=errores, **opciones)
    return salida.getvalue() + errores.getvalue()


def test_una_reflexion_nueva_se_cifra_con_la_activa_y_guarda_su_id(estudiante, profesor, llave_versionada):
    intento, _, datos = _intento(estudiante, profesor)
    texto = _texto()
    nodo_inicial = datos["currentNode"]["id"]

    respuesta = _cliente(estudiante).post(
        f"/api/simulation/attempts/{intento.id}/reflections",
        {"attemptToken": datos["attemptToken"], "nodeId": nodo_inicial, "text": texto},
        format="json",
    )

    assert respuesta.status_code == 200
    fila = ReflectionJournal.objects.get(attempt_id=intento.id, node_id=nodo_inicial)
    assert _ref(fila) == "k1"
    assert _leer(fila) == texto


def test_rota_de_la_heredada_a_la_versionada_y_de_una_versionada_a_otra(estudiante, profesor, llave_versionada):
    intento, (n1, n2, _), _ = _intento(estudiante, profesor)
    textos = [_texto(), _texto()]
    filas = [_fila(intento, n1, textos[0], HEREDADA), _fila(intento, n2, textos[1], HEREDADA)]

    salida = call_command_output()  # a la activa, k1
    assert "rotadas=2" in salida
    for fila, texto in zip(filas, textos):
        assert _ref(fila) == "k1"
        assert _leer(fila) == texto

    llave_versionada.REFLECTION_ACTIVE_KEY = "k2"
    salida = call_command_output()
    assert "rotadas=2" in salida
    for fila, texto in zip(filas, textos):
        assert _ref(fila) == "k2"
        assert _leer(fila) == texto


def test_dry_run_cuenta_lo_que_rotaria_y_no_escribe_nada(estudiante, profesor, llave_versionada):
    intento, (n1, n2, _), _ = _intento(estudiante, profesor)
    _fila(intento, n1, _texto(), HEREDADA)
    _fila(intento, n2, _texto(), HEREDADA)
    antes = list(
        ReflectionJournal.objects.filter(attempt_id=intento.id).order_by("pk").values_list("encrypted_text", "encryption_key_ref")
    )

    salida = call_command_output(dry_run=True)

    assert "rotadas=2" in salida
    despues = list(
        ReflectionJournal.objects.filter(attempt_id=intento.id).order_by("pk").values_list("encrypted_text", "encryption_key_ref")
    )
    assert despues == antes


def test_una_fila_que_no_descifra_cuenta_como_fallida_sin_detener_el_resto(estudiante, profesor, llave_versionada):
    intento, (n1, n2, n3), _ = _intento(estudiante, profesor)
    primera = _fila(intento, n1, _texto(), HEREDADA)
    rota = _fila(intento, n2, _texto(), HEREDADA)
    ultima = _fila(intento, n3, _texto(), HEREDADA)
    _corromper(rota)
    salida, errores = io.StringIO(), io.StringIO()

    with pytest.raises(CommandError, match="1 filas no se pudieron rotar"):
        call_command(COMANDO, batch_size=1, stdout=salida, stderr=errores)

    assert _ref(primera) == "k1"
    assert _ref(ultima) == "k1"
    assert _ref(rota) == HEREDADA
    assert "fallidas=1" in salida.getvalue()
    assert f"(ids): {rota.pk}" in salida.getvalue()


def test_reanudable_la_segunda_ejecucion_no_toca_ninguna_fila(estudiante, profesor, llave_versionada):
    from apps.simulation.management.commands import rotate_reflection_key as comando

    intento, (n1, n2, _), _ = _intento(estudiante, profesor)
    filas = [_fila(intento, n1, _texto(), HEREDADA), _fila(intento, n2, _texto(), HEREDADA)]
    call_command_output()
    antes = [_leer(fila) for fila in filas]
    cifrados_antes = list(ReflectionJournal.objects.filter(attempt_id=intento.id).order_by("pk").values_list("encrypted_text", flat=True))

    with mock.patch.object(comando, "_escribir", wraps=comando._escribir) as escribir:
        salida = call_command_output()

    assert escribir.call_count == 0
    assert "leídas=0" in salida
    assert [_leer(fila) for fila in filas] == antes
    assert list(ReflectionJournal.objects.filter(attempt_id=intento.id).order_by("pk").values_list("encrypted_text", flat=True)) == cifrados_antes


def test_interrumpido_a_medias_cada_fila_queda_legible_con_su_referencia(estudiante, profesor, llave_versionada):
    from apps.simulation.management.commands import rotate_reflection_key as comando

    intento, nodos, _ = _intento(estudiante, profesor)
    textos = [_texto() for _ in range(3)]
    filas = [_fila(intento, nodo, texto, HEREDADA) for nodo, texto in zip(nodos, textos)]
    escribir_real = comando._escribir
    escrituras = []

    def escribir_y_cortar(pk, cifrado, llave):
        if escrituras:
            raise RuntimeError("corte simulado tras la primera fila")
        escrituras.append(pk)
        escribir_real(pk, cifrado, llave)

    with mock.patch.object(comando, "_escribir", side_effect=escribir_y_cortar):
        with pytest.raises(RuntimeError, match="corte simulado"):
            call_command(COMANDO, batch_size=1)

    # Ninguna fila queda sin llave que la descifre: cada una se lee con su propia referencia.
    for fila, texto in zip(filas, textos):
        assert _leer(fila) == texto
    assert [_ref(fila) for fila in filas][0] == "k1"

    salida = call_command_output()
    assert "rotadas=2" in salida
    for fila, texto in zip(filas, textos):
        assert _ref(fila) == "k1"
        assert _leer(fila) == texto


def test_el_comando_no_imprime_texto_de_bitacoras(estudiante, profesor, llave_versionada):
    intento, (n1, n2, n3), _ = _intento(estudiante, profesor)
    textos = [_texto(), _texto()]
    _fila(intento, n1, textos[0], HEREDADA)
    _fila(intento, n2, textos[1], HEREDADA)
    _corromper(_fila(intento, n3, _texto(), HEREDADA))
    salida, errores = io.StringIO(), io.StringIO()

    with pytest.raises(CommandError) as error:
        call_command(COMANDO, stdout=salida, stderr=errores)

    todo = salida.getvalue() + errores.getvalue() + str(error.value)
    assert "rotadas=2" in todo
    for texto in textos:
        assert texto not in todo


def test_no_escribe_un_cifrado_que_no_descifra_igual_al_original(estudiante, profesor, llave_versionada):
    intento, (n1, _, _), _ = _intento(estudiante, profesor)
    texto = _texto()
    fila = _fila(intento, n1, texto, HEREDADA)
    cifrar_real = crypto_service.encrypt

    def cifrar_otro_texto(plano, **kwargs):
        # Un cifrado defectuoso: lo que se guardaría no es lo que se leyó.
        return cifrar_real("otro " + plano, **kwargs)

    with mock.patch.object(crypto_service, "encrypt", side_effect=cifrar_otro_texto):
        with pytest.raises(CommandError):
            call_command(COMANDO)

    assert _ref(fila) == HEREDADA
    assert _leer(fila) == texto


@pytest.mark.parametrize("opciones", [{"batch_size": 0}, {"batch_size": 2001}, {"to": "no-existe"}])
def test_opciones_fuera_de_rango_o_llave_desconocida_no_tocan_nada(estudiante, profesor, opciones):
    intento, (n1, _, _), _ = _intento(estudiante, profesor)
    fila = _fila(intento, n1, _texto(), HEREDADA)

    with pytest.raises(CommandError):
        call_command(COMANDO, **opciones)

    assert _ref(fila) == HEREDADA


@pytest.mark.usefixtures("fetch_raise")
def test_el_reporte_del_docente_con_una_bitacora_ilegible_no_da_500_ni_muestra_texto(estudiante, profesor, caplog):
    intento, (n1, n2, _), _ = _intento(estudiante, profesor)
    texto_legible = _texto()
    texto_ilegible = _texto()
    _fila(intento, n1, texto_legible, HEREDADA)
    ilegible = _fila(intento, n2, texto_ilegible, HEREDADA)
    ReflectionJournal.objects.filter(pk=ilegible.pk).update(encryption_key_ref="llave-retirada")

    with caplog.at_level(logging.ERROR, logger="siep.security"):
        respuesta = _cliente(profesor).get(f"/api/instructor/attempts/{intento.id}/trace")

    assert respuesta.status_code == 200
    por_nodo = {bitacora["nodeId"]: bitacora for bitacora in respuesta.data["data"]["reflections"]}
    assert por_nodo[n1.id]["text"] == texto_legible
    assert por_nodo[n1.id]["readable"] is True
    assert por_nodo[n2.id]["text"] is None
    assert por_nodo[n2.id]["readable"] is False
    assert texto_ilegible not in respuesta.content.decode("utf-8")
    lineas = [r for r in caplog.records if getattr(r, "fields", {}).get("event") == "reflection_undecryptable"]
    assert len(lineas) == 1
    assert str(ilegible.pk) in lineas[0].fields["scope"]
    assert texto_legible not in lineas[0].getMessage()
    assert texto_ilegible not in lineas[0].getMessage()
