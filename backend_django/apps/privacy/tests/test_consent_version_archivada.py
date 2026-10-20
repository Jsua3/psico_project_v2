"""S3-2a2 (1) · Una versión archivada sigue alcanzable para quien tiene algo que retirar o un intento abierto.

``reachable_version``: una versión publicada de un caso activo se ofrece como siempre. Una que ya no lo es (archivada, o de
un caso dado de baja) se ofrece SOLO a quien tiene un intento suyo de ella o un registro de consentimiento de ella; a los
demás, el mismo 404 de siempre. Retirar nunca queda fuera de alcance, y quien tiene un intento abierto puede volver a aceptar.
"""
import pytest

from apps.privacy.models import ConsentRecord
from apps.simulation.services.authoring import lifecycle

from .support import BASE, asignar_caso, cliente, crear_version, url_consentimiento

pytestmark = [pytest.mark.req("ETH-01", "SIEP-RF-05", "RNF-010"), pytest.mark.security]


def _aceptar(persona, version_id, aviso):
    return cliente(persona).post(url_consentimiento(version_id), {"noticeVersion": aviso}, format="json")


def _cuerpo(metodo, aviso):
    return {"data": {"noticeVersion": aviso}, "format": "json"} if metodo == "post" else {}


def _abrir_intento(estudiante, version):
    """Un intento abierto de ``estudiante`` en la versión publicada, con el caso asignado (como en la sala)."""
    asignar_caso(estudiante, version)
    respuesta = cliente(estudiante).post(f"{BASE}/attempts", {"caseVersionId": version.id}, format="json")
    assert respuesta.status_code in (200, 201), respuesta.data
    return respuesta.data["data"]


def _archivar(version, administrador):
    lifecycle.archive(version.id, administrador)
    version.refresh_from_db()
    assert version.status == "ARCHIVED"


# ── Con algo que retirar o un intento abierto, la versión archivada sigue ────────────────────────────────────


def test_con_registro_en_una_version_archivada_se_lee_el_estado_y_se_retira(settings, estudiante_a, version_publicada, administrador):
    assert _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION).status_code == 201
    _archivar(version_publicada, administrador)

    estado = cliente(estudiante_a).get(url_consentimiento(version_publicada.id))
    retiro = cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))

    assert estado.status_code == 200 and estado.data["data"]["accepted"] is True
    assert retiro.status_code == 200 and retiro.data["data"]["withdrawnAt"] is not None


def test_con_intento_abierto_en_una_version_archivada_se_acepta_y_se_retira(settings, estudiante_a, version_publicada, administrador):
    _abrir_intento(estudiante_a, version_publicada)
    _archivar(version_publicada, administrador)

    aceptar = _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION)
    retiro = cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))

    assert aceptar.status_code == 201
    assert retiro.status_code == 200 and retiro.data["data"]["withdrawnAt"] is not None


def test_el_intento_abierto_de_una_version_archivada_vuelve_a_jugar_tras_aceptar(settings, estudiante_a, version_publicada, administrador):
    intento = _abrir_intento(estudiante_a, version_publicada)
    _archivar(version_publicada, administrador)
    settings.SIEP_CONSENT_REQUIRED = True
    api = cliente(estudiante_a)
    ruta = f"{BASE}/attempts/{intento['attemptId']}"
    cabecera = {"HTTP_X_SIEP_ATTEMPT_TOKEN": intento["attemptToken"]}

    sin_consentimiento = api.get(f"{ruta}/world", **cabecera)
    assert sin_consentimiento.status_code == 403 and sin_consentimiento.data["code"] == "CONSENT_REQUIRED"

    assert _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION).status_code == 201
    con_consentimiento = api.get(f"{ruta}/world", **cabecera)
    assert con_consentimiento.status_code == 200
    mundo = con_consentimiento.data["data"]
    movimiento = api.patch(
        f"{ruta}/world-state",
        {
            "attemptToken": intento["attemptToken"],
            "playerX": mundo["player"]["x"] + 4,
            "playerY": mundo["player"]["y"],
            "currentMapKey": mundo["map"]["key"],
        },
        format="json",
    )
    assert movimiento.status_code == 200


# ── Sin intento ni registro, la versión archivada responde 404 como si no existiera ───────────────────────────


@pytest.mark.parametrize("metodo", ["get", "post", "delete"])
def test_sin_intento_ni_registro_la_version_archivada_responde_404_como_si_no_existiera(
    settings, estudiante_b, version_publicada, administrador, metodo
):
    _archivar(version_publicada, administrador)

    respuesta = getattr(cliente(estudiante_b), metodo)(
        url_consentimiento(version_publicada.id), **_cuerpo(metodo, settings.SIEP_CONTENT_NOTICE_VERSION)
    )

    assert respuesta.status_code == 404
    assert (respuesta.data["code"], respuesta.data["message"]) == ("NOT_FOUND", "Caso no encontrado")
    assert not ConsentRecord.objects.exists()


@pytest.mark.parametrize("como", ["intento", "registro"])
def test_tener_algo_de_otra_version_archivada_no_abre_esta(settings, estudiante_a, version_publicada, administrador, docente, como):
    if como == "intento":
        _abrir_intento(estudiante_a, version_publicada)
    else:
        assert _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION).status_code == 201
    _archivar(version_publicada, administrador)
    otra = crear_version(docente, estado="ARCHIVED")

    assert cliente(estudiante_a).get(url_consentimiento(otra.id)).status_code == 404
    assert _aceptar(estudiante_a, otra.id, settings.SIEP_CONTENT_NOTICE_VERSION).status_code == 404
    assert cliente(estudiante_a).delete(url_consentimiento(otra.id)).status_code == 404


# ── Una versión que no existe sigue en 404 para todas las personas ───────────────────────────────────────────


@pytest.mark.parametrize("metodo", ["get", "post", "delete"])
@pytest.mark.parametrize("inexistente", [999_999_999, 10**30], ids=["inexistente", "fuera de rango"])
def test_una_version_inexistente_sigue_en_404_aunque_la_persona_tenga_registro(
    settings, estudiante_a, version_publicada, administrador, metodo, inexistente
):
    assert _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION).status_code == 201
    _archivar(version_publicada, administrador)

    respuesta = getattr(cliente(estudiante_a), metodo)(
        url_consentimiento(inexistente), **_cuerpo(metodo, settings.SIEP_CONTENT_NOTICE_VERSION)
    )

    assert respuesta.status_code == 404 and respuesta.data["code"] == "NOT_FOUND"


def test_con_solo_un_registro_en_una_version_archivada_no_se_puede_volver_a_aceptar(settings, estudiante_a, version_publicada, administrador):
    # Leer y retirar sí (ver el primer caso); aceptar de nuevo exige un intento: un registro viejo sin intento no abre una
    # aceptación nueva sobre una versión que ya no se juega.
    assert _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION).status_code == 201
    _archivar(version_publicada, administrador)
    assert cliente(estudiante_a).delete(url_consentimiento(version_publicada.id)).status_code == 200

    de_nuevo = _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION)

    assert de_nuevo.status_code == 404
    assert ConsentRecord.objects.filter(person=estudiante_a, case_version_id=version_publicada.id).count() == 1
