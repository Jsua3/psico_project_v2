"""S3-2a · ``/api/simulation/cases/{caseVersionId}/consent`` (C12): leer, aceptar y retirar el aviso de contenido (ETH-01).

Solo la persona estudiante usa estas rutas (filas ``consent.read`` y ``consent.record`` de la matriz): el ADMIN y el
docente no juegan. Cada registro es de quien lo hizo: nadie ve ni toca el de otra persona. Las rutas funcionan con las
banderas de exigencia apagadas (así el cliente puede empezar a registrar antes de que el servidor lo exija).
"""
import json
from datetime import datetime

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.privacy.models import ConsentRecord, ConsentType
from apps.privacy.views import ConsentView
from apps.simulation.models import AuditLog

from .support import cliente, crear_version, url_consentimiento

pytestmark = [pytest.mark.req("ETH-01", "SIEP-RF-05", "RNF-010"), pytest.mark.security]

ACEPTAR = "consentimiento.aceptar"
RETIRAR = "consentimiento.retirar"


def _aceptar(persona, version_id, aviso):
    return cliente(persona).post(url_consentimiento(version_id), {"noticeVersion": aviso}, format="json")


# ── GET: el estado ───────────────────────────────────────────────────────────────────────────────────────


def test_sin_registro_el_estado_dice_que_no_ha_aceptado(settings, estudiante_a, version_publicada):
    respuesta = cliente(estudiante_a).get(url_consentimiento(version_publicada.id))

    assert respuesta.status_code == 200
    assert respuesta.data == {
        "success": True,
        "data": {
            "required": False,
            "noticeVersion": settings.SIEP_CONTENT_NOTICE_VERSION,
            "accepted": False,
            "acceptedAt": None,
        },
    }


@pytest.mark.parametrize("encendida", [True, False])
def test_el_estado_dice_si_el_servidor_exige_el_consentimiento(settings, estudiante_a, version_publicada, encendida):
    settings.SIEP_CONSENT_REQUIRED = encendida

    datos = cliente(estudiante_a).get(url_consentimiento(version_publicada.id)).data["data"]

    assert datos["required"] is encendida


def test_tras_aceptar_el_estado_trae_la_fecha_de_aceptacion(settings, estudiante_a, version_publicada):
    aceptado = _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION).data["data"]

    datos = cliente(estudiante_a).get(url_consentimiento(version_publicada.id)).data["data"]

    assert datos["accepted"] is True
    assert datos["acceptedAt"] == aceptado["acceptedAt"]


def test_un_registro_de_otra_version_del_aviso_no_cuenta_como_aceptado(settings, estudiante_a, version_publicada):
    ConsentRecord.objects.create(
        person=estudiante_a, consent_type=ConsentType.CONTENT_NOTICE, case_version=version_publicada, notice_version="aviso-viejo"
    )

    datos = cliente(estudiante_a).get(url_consentimiento(version_publicada.id)).data["data"]

    assert datos["accepted"] is False and datos["acceptedAt"] is None
    assert datos["noticeVersion"] == settings.SIEP_CONTENT_NOTICE_VERSION


def test_el_consentimiento_es_por_version_del_caso(settings, estudiante_a, version_publicada, docente):
    otra = crear_version(docente, estado="PUBLISHED")
    _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION)

    assert cliente(estudiante_a).get(url_consentimiento(otra.id)).data["data"]["accepted"] is False


# ── POST: aceptar ────────────────────────────────────────────────────────────────────────────────────────


def test_aceptar_con_la_version_vigente_crea_el_registro_y_responde_201(settings, estudiante_a, version_publicada):
    respuesta = _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION)

    assert respuesta.status_code == 201
    datos = respuesta.data["data"]
    assert set(datos) == {"caseVersionId", "acceptedAt", "noticeVersion"}
    assert datos["caseVersionId"] == version_publicada.id
    assert datos["noticeVersion"] == settings.SIEP_CONTENT_NOTICE_VERSION
    registro = ConsentRecord.objects.get(person=estudiante_a)
    assert registro.consent_type == ConsentType.CONTENT_NOTICE
    assert registro.case_version_id == version_publicada.id
    assert registro.notice_version == settings.SIEP_CONTENT_NOTICE_VERSION
    assert registro.withdrawn_at is None
    assert datos["acceptedAt"] == registro.accepted_at.isoformat()


def test_aceptar_otra_vez_responde_200_sin_segunda_fila(settings, estudiante_a, version_publicada):
    primera = _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION)

    segunda = _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION)

    assert (primera.status_code, segunda.status_code) == (201, 200)
    assert segunda.data["data"] == primera.data["data"]  # la misma aceptación, con su fecha original
    assert ConsentRecord.objects.filter(person=estudiante_a).count() == 1


def test_aceptar_con_otra_version_del_aviso_responde_409_con_la_vigente(settings, estudiante_a, version_publicada):
    respuesta = _aceptar(estudiante_a, version_publicada.id, "aviso-que-el-cliente-mostro")

    assert respuesta.status_code == 409
    assert respuesta.data["success"] is False
    assert respuesta.data["code"] == "NOTICE_VERSION_STALE"
    assert respuesta.data["noticeVersion"] == settings.SIEP_CONTENT_NOTICE_VERSION
    assert not ConsentRecord.objects.filter(person=estudiante_a).exists()


def test_la_version_se_compara_tal_cual_sin_mayusculas_ni_espacios_de_mas(settings, estudiante_a, version_publicada):
    vigente = settings.SIEP_CONTENT_NOTICE_VERSION

    assert _aceptar(estudiante_a, version_publicada.id, vigente.upper()).status_code == 409
    assert not ConsentRecord.objects.filter(person=estudiante_a).exists()


@pytest.mark.parametrize("cuerpo", [{}, {"noticeVersion": ""}, {"noticeVersion": None}, {"noticeVersion": "x" * 41}])
def test_aceptar_sin_una_version_valida_responde_400_con_el_campo(estudiante_a, version_publicada, cuerpo):
    respuesta = cliente(estudiante_a).post(url_consentimiento(version_publicada.id), cuerpo, format="json")

    assert respuesta.status_code == 400
    assert respuesta.data["code"] == "VALIDATION_ERROR"
    assert respuesta.data["field"] == "noticeVersion"
    assert not ConsentRecord.objects.filter(person=estudiante_a).exists()


def test_aceptar_otra_vez_despues_de_retirar_crea_un_registro_nuevo(settings, estudiante_a, version_publicada):
    vigente = settings.SIEP_CONTENT_NOTICE_VERSION
    primera = _aceptar(estudiante_a, version_publicada.id, vigente)
    cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))

    segunda = _aceptar(estudiante_a, version_publicada.id, vigente)

    assert segunda.status_code == 201
    assert datetime.fromisoformat(segunda.data["data"]["acceptedAt"]) >= datetime.fromisoformat(primera.data["data"]["acceptedAt"])
    filas = ConsentRecord.objects.filter(person=estudiante_a).order_by("id")
    assert [fila.withdrawn_at is None for fila in filas] == [False, True]  # lo retirado se conserva


# ── DELETE: retirar ──────────────────────────────────────────────────────────────────────────────────────


def test_retirar_responde_200_y_despues_el_estado_dice_que_no_ha_aceptado(settings, estudiante_a, version_publicada):
    _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION)

    respuesta = cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))

    assert respuesta.status_code == 200
    datos = respuesta.data["data"]
    assert set(datos) == {"caseVersionId", "withdrawnAt"}
    assert datos["caseVersionId"] == version_publicada.id
    assert ConsentRecord.objects.get(person=estudiante_a).withdrawn_at.isoformat() == datos["withdrawnAt"]
    assert cliente(estudiante_a).get(url_consentimiento(version_publicada.id)).data["data"]["accepted"] is False


def test_retirar_sin_registro_vigente_responde_200_con_la_fecha_nula(estudiante_a, version_publicada):
    respuesta = cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))

    assert respuesta.status_code == 200
    assert respuesta.data["data"] == {"caseVersionId": version_publicada.id, "withdrawnAt": None}


def test_retirar_dos_veces_es_idempotente(settings, estudiante_a, version_publicada):
    _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION)

    primera = cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))
    segunda = cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))

    assert primera.data["data"]["withdrawnAt"] is not None
    assert segunda.status_code == 200 and segunda.data["data"]["withdrawnAt"] is None
    assert ConsentRecord.objects.get(person=estudiante_a).withdrawn_at.isoformat() == primera.data["data"]["withdrawnAt"]


def test_retirar_cierra_todos_los_registros_vigentes_del_caso_aunque_sean_de_otras_versiones_del_aviso(
    settings, estudiante_a, version_publicada
):
    ConsentRecord.objects.create(
        person=estudiante_a, consent_type=ConsentType.CONTENT_NOTICE, case_version=version_publicada, notice_version="aviso-viejo"
    )
    _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION)

    cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))

    assert not ConsentRecord.objects.filter(person=estudiante_a, withdrawn_at__isnull=True).exists()


def test_retirar_el_aviso_de_contenido_no_toca_el_tratamiento_de_datos(settings, estudiante_a, version_publicada):
    _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION)
    tratamiento = ConsentRecord.objects.create(
        person=estudiante_a, consent_type=ConsentType.DATA_TREATMENT, case_version=None, notice_version="datos-1"
    )

    cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))

    tratamiento.refresh_from_db()
    assert tratamiento.withdrawn_at is None


# ── Roles y sesión ───────────────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("metodo", ["get", "post", "delete"])
@pytest.mark.parametrize("fixture_persona", ["administrador", "docente"])
def test_el_admin_y_el_docente_no_juegan_y_reciben_403(request, version_publicada, metodo, fixture_persona):
    persona = request.getfixturevalue(fixture_persona)

    respuesta = getattr(cliente(persona), metodo)(url_consentimiento(version_publicada.id), **_cuerpo(metodo))

    assert respuesta.status_code == 403
    assert respuesta.data["code"] == "FORBIDDEN"
    assert not ConsentRecord.objects.exists()


@pytest.mark.parametrize("metodo", ["get", "post", "delete"])
def test_sin_sesion_responde_401(version_publicada, metodo):
    respuesta = getattr(cliente(), metodo)(url_consentimiento(version_publicada.id), **_cuerpo(metodo))

    assert respuesta.status_code == 401
    assert respuesta.data["code"] == "UNAUTHENTICATED"


def _cuerpo(metodo):
    return {"data": {"noticeVersion": "cualquiera"}, "format": "json"} if metodo == "post" else {}


# ── La versión del caso debe existir y estar publicada ───────────────────────────────────────────────────


@pytest.fixture(params=["inexistente", "fuera de rango", "borrador", "en revisión", "archivada", "caso dado de baja"])
def version_que_no_se_ofrece(request, docente):
    if request.param == "inexistente":
        return 999_999_999
    if request.param == "fuera de rango":
        return 10**30  # más grande que cualquier entero de la base: un 404, no un 500
    if request.param == "caso dado de baja":
        return crear_version(docente, estado="PUBLISHED", activo=False).id
    estado = {"borrador": "DRAFT", "en revisión": "IN_REVIEW", "archivada": "ARCHIVED"}[request.param]
    return crear_version(docente, estado=estado).id


@pytest.mark.parametrize("metodo", ["get", "post", "delete"])
def test_una_version_inexistente_o_no_publicada_responde_404(estudiante_a, version_que_no_se_ofrece, metodo):
    respuesta = getattr(cliente(estudiante_a), metodo)(url_consentimiento(version_que_no_se_ofrece), **_cuerpo(metodo))

    assert respuesta.status_code == 404
    assert respuesta.data["code"] == "NOT_FOUND"
    assert not ConsentRecord.objects.exists()


def test_el_404_va_antes_que_la_validacion_del_cuerpo(estudiante_a, version_borrador):
    # Un cuerpo vacío sobre una versión que no se ofrece no revela nada de más: es un 404, no un 400.
    respuesta = cliente(estudiante_a).post(url_consentimiento(version_borrador.id), {}, format="json")

    assert respuesta.status_code == 404


# ── Una persona no ve ni toca el consentimiento de otra ──────────────────────────────────────────────────


def test_el_consentimiento_de_una_persona_no_es_visible_ni_afecta_a_otra(settings, estudiante_a, estudiante_b, version_publicada):
    vigente = settings.SIEP_CONTENT_NOTICE_VERSION
    de_ana = _aceptar(estudiante_a, version_publicada.id, vigente).data["data"]

    # Beto no ve la aceptación de Ana...
    assert cliente(estudiante_b).get(url_consentimiento(version_publicada.id)).data["data"]["accepted"] is False
    # ...retirar no le quita nada a Ana...
    retiro = cliente(estudiante_b).delete(url_consentimiento(version_publicada.id))
    assert retiro.data["data"]["withdrawnAt"] is None
    assert cliente(estudiante_a).get(url_consentimiento(version_publicada.id)).data["data"]["acceptedAt"] == de_ana["acceptedAt"]
    # ...y aceptar crea su propio registro, aparte del de Ana.
    de_beto = _aceptar(estudiante_b, version_publicada.id, vigente)
    assert de_beto.status_code == 201
    assert ConsentRecord.objects.filter(person=estudiante_a).count() == 1
    assert ConsentRecord.objects.filter(person=estudiante_b).count() == 1


def test_el_cuerpo_no_puede_nombrar_a_otra_persona(settings, estudiante_a, estudiante_b, version_publicada):
    cliente(estudiante_b).post(
        url_consentimiento(version_publicada.id),
        {"noticeVersion": settings.SIEP_CONTENT_NOTICE_VERSION, "person": estudiante_a.id, "personId": estudiante_a.id},
        format="json",
    )

    assert ConsentRecord.objects.get().person_id == estudiante_b.id


# ── Sin límite de peticiones (a propósito) ───────────────────────────────────────────────────────────────


def test_la_vista_del_consentimiento_no_tiene_limite_de_peticiones():
    # api/simulation/ no lleva limitador por diseño (S1-2): quien está ante el aviso no debe encontrarse con un 429.
    assert list(ConsentView.throttle_classes) == []


# ── Auditoría: una fila por creación y una por retiro, sin datos de la persona ──────────────────────────


def _filas(accion):
    return list(AuditLog.objects.filter(action=accion).order_by("id"))


def test_aceptar_deja_una_fila_de_auditoria_y_el_reenvio_no_deja_otra(settings, estudiante_a, version_publicada):
    vigente = settings.SIEP_CONTENT_NOTICE_VERSION
    _aceptar(estudiante_a, version_publicada.id, vigente)
    _aceptar(estudiante_a, version_publicada.id, vigente)  # idempotente: no es una aceptación nueva

    (fila,) = _filas(ACEPTAR)

    assert fila.actor_id == estudiante_a.id
    assert fila.actor_role == "ESTUDIANTE"
    assert fila.resource_type == "CASE_VERSION"
    assert fila.resource_id == str(version_publicada.id)


def test_retirar_deja_una_fila_de_auditoria_y_retirar_de_nuevo_no_deja_otra(settings, estudiante_a, version_publicada):
    _aceptar(estudiante_a, version_publicada.id, settings.SIEP_CONTENT_NOTICE_VERSION)
    cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))
    cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))  # ya no había nada vigente

    (fila,) = _filas(RETIRAR)

    assert fila.actor_id == estudiante_a.id
    assert fila.resource_type == "CASE_VERSION"
    assert fila.resource_id == str(version_publicada.id)


def test_aceptar_retirar_y_aceptar_de_nuevo_deja_dos_aceptaciones_y_un_retiro(settings, estudiante_a, version_publicada):
    vigente = settings.SIEP_CONTENT_NOTICE_VERSION
    _aceptar(estudiante_a, version_publicada.id, vigente)
    cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))
    _aceptar(estudiante_a, version_publicada.id, vigente)

    assert (len(_filas(ACEPTAR)), len(_filas(RETIRAR))) == (2, 1)


def test_el_contexto_de_la_auditoria_lleva_solo_la_version_del_caso_y_la_del_aviso(settings, estudiante_a, version_publicada):
    vigente = settings.SIEP_CONTENT_NOTICE_VERSION
    _aceptar(estudiante_a, version_publicada.id, vigente)
    cliente(estudiante_a).delete(url_consentimiento(version_publicada.id))

    for accion in (ACEPTAR, RETIRAR):
        (fila,) = _filas(accion)
        contexto = json.loads(fila.context_json)
        propios = {clave: valor for clave, valor in contexto.items() if clave not in {"method", "class", "taxonomy"}}
        assert propios == {"caseVersionId": version_publicada.id, "noticeVersion": vigente}, accion
        assert contexto["taxonomy"] == accion
        # Nada de la persona: ni su correo, ni su nombre, ni su id fuera de la columna del actor.
        texto = " ".join(str(valor) for valor in (fila.context_json, fila.resource_id, fila.resource_type))
        assert estudiante_a.email not in texto
        assert estudiante_a.nombre not in texto and estudiante_a.apellido not in texto


def test_un_rechazo_no_deja_fila_de_auditoria(estudiante_a, version_publicada, docente):
    _aceptar(estudiante_a, version_publicada.id, "aviso-que-el-cliente-mostro")  # 409
    cliente(estudiante_a).post(url_consentimiento(version_publicada.id), {}, format="json")  # 400
    cliente(docente).post(url_consentimiento(version_publicada.id), {"noticeVersion": "x"}, format="json")  # 403

    assert not AuditLog.objects.filter(action__in=(ACEPTAR, RETIRAR)).exists()


# ── Costo ────────────────────────────────────────────────────────────────────────────────────────────────


def test_leer_el_estado_cuesta_pocas_consultas(estudiante_a, version_publicada):
    with CaptureQueriesContext(connection) as capturadas:
        respuesta = cliente(estudiante_a).get(url_consentimiento(version_publicada.id))

    assert respuesta.status_code == 200
    datos = [q for q in capturadas.captured_queries if not q["sql"].lstrip().upper().startswith(("SAVEPOINT", "RELEASE", "ROLLBACK"))]
    assert len(datos) <= 4, [q["sql"] for q in datos]
