"""S3-3 · La lista ética verificable: cada casilla dice quién la respalda (RNF-010, SIEP-RF-05).

La lista de publicación era solo la declaración de quien autora el caso: marcar «revisión ética» daba el 100 % sin que
existiera ninguna revisión, y «protocolos de seguridad» sin una sola escena con recursos de apoyo. SIEP trata casos de
violencia con estudiantes: una casilla marcada sin el dato que debería respaldarla no puede bastar para publicar. Ahora
cada casilla declara su respaldo y el sistema comprueba las que puede:

- ``system``: «protocolos de seguridad» (alguna escena con un recurso de apoyo) y «advertencias de contenido» (un aviso de
  contenido vigente en el servidor). Marcadas sin su dato, bloquean enviar a revisión y publicar
  (``ETHICS.NO_SUPPORT_RESOURCES`` y ``ETHICS.NO_CONTENT_NOTICE``).
- ``constancia``: «revisión ética», con ``REVIEW_WORKFLOW_STRICT``. La constancia de Psicología se registra al APROBAR, así
  que solo se exige al aprobar (``ETHICS.NO_CONTENT_REVIEW``) y se acepta la que llega en esa misma llamada o una previa.
  Sin la bandera la constancia es opcional y la casilla es solo la declaración de quien autora.
- ``author``: el resto. Nadie puede comprobarlas con los datos de hoy.

Una casilla SIN marcar no genera nada (que falte lo cubre ``CHECKLIST_INCOMPLETE``). Cada control tiene su control negativo:
apagada UNA comprobación, el caso sin el dato se publica.
"""
import datetime
import json
import secrets

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.simulation.models import (
    CaseReview,
    CaseVersion,
    PublicationChecklist,
    PublicationChecklistItem,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.services.authoring import gate, publication
from shared.exceptions import ApiError

from .publication_support import TEST_SUPPORT_RESOURCE as RECURSO, give_support_resource

pytestmark = [pytest.mark.req("RNF-010", "SIEP-RF-05"), pytest.mark.security]

User = get_user_model()
BASE = "/api/authoring/cases"
SIETE = (
    "contentOriginal", "ethicsReviewed", "safetyProtocols", "noStigmatizing", "triggerWarnings", "accessibilityOk",
    "scopeEducational",
)
#: Quién respalda cada casilla SIN la bandera estricta: la constancia no es obligatoria y «revisión ética» es declaración.
RESPALDO_SIN_BANDERA = {
    "contentOriginal": "author", "ethicsReviewed": "author", "safetyProtocols": "system", "noStigmatizing": "author",
    "triggerWarnings": "system", "accessibilityOk": "author", "scopeEducational": "author",
}


def cl(usuario):
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


def _persona(rol):
    """Una persona nueva con un correo y una clave que se generan en la ejecución."""
    return User.objects.create_user(
        email=f"eth_{rol.lower()}_{secrets.token_hex(4)}@x.com", password=secrets.token_urlsafe(32),
        nombre="Nom", apellido="Ape", role=rol,
    )


@pytest.fixture
def admin(db):
    return _persona("ADMIN")


@pytest.fixture
def owner(db):
    return _persona("PROFESOR")


def _constancia():
    return {
        "reviewer": "Mg. Elena Rojas (Psicología)", "reviewedOn": timezone.now().date().isoformat(),
        "reference": "Acta 12-2026",
    }


def _recursos_de(cv):
    return [json.loads(raw) for raw in SimulationNode.objects.filter(case_version_id=cv).values_list(
        "support_resources_json", flat=True)]


def _marcar(persona, cv, codigos):
    respuesta = cl(persona).put(f"{BASE}/{cv}/checklist", {codigo: True for codigo in codigos}, format="json")
    assert respuesta.status_code == 200, respuesta.data
    return respuesta.data["data"]


def _borrador(owner, *, marcadas=SIETE, con_recurso=False):
    """Un borrador VÁLIDO de ``owner``: copia del caso sembrado (que no trae recursos de apoyo) con ``marcadas`` marcadas."""
    sembrado = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    cv = publication.clone_version(sembrado.id, owner)["caseVersionId"]
    caso = SimulationCase.objects.create(
        code=f"ETH-{secrets.token_hex(3).upper()}", title="Caso de la lista ética", created_by=owner
    )
    CaseVersion.objects.filter(pk=cv).update(simulation_case=caso, semantic_version="0.1.0")
    assert not any(_recursos_de(cv)), "el caso sembrado ya trae recursos de apoyo: estas pruebas dejarían de decir algo"
    if con_recurso:
        give_support_resource(cv)
    if marcadas:
        _marcar(owner, cv, marcadas)
    return cv


def _ciclo(persona, cv, accion, **cuerpo):
    return cl(persona).post(f"{BASE}/{cv}/lifecycle", {"action": accion, **cuerpo}, format="json")


def _enviado(owner, **opciones):
    """Un borrador válido, con su recurso y todo marcado, ya enviado a revisión."""
    cv = _borrador(owner, con_recurso=True, **opciones)
    respuesta = _ciclo(owner, cv, "submit")
    assert respuesta.status_code == 200, respuesta.data
    return cv


def _codigos_eticos(respuesta):
    """Los códigos ``ETHICS.*`` que la respuesta 409 trae en sus bloqueos, en orden."""
    return [
        issue["code"] for bloqueo in respuesta.data["blockers"] for issue in bloqueo.get("issues", [])
        if issue["code"].startswith("ETHICS.")
    ]


def _items(vista):
    return {item["code"]: item for item in vista["checklist"]["items"]}


# ─── «protocolos de seguridad» (respaldo del sistema: recursos de apoyo) ───────────────────────────────
def test_protocolos_de_seguridad_marcados_sin_recursos_de_apoyo_bloquean_enviar_a_revision(owner):
    cv = _borrador(owner)

    respuesta = _ciclo(owner, cv, "submit")

    assert respuesta.status_code == 409
    assert respuesta.data["code"] == "CASE_NOT_PUBLISHABLE"
    assert _codigos_eticos(respuesta) == ["ETHICS.NO_SUPPORT_RESOURCES"]
    bloqueo = next(b for b in respuesta.data["blockers"] if b["code"] == "ETHICS.NO_SUPPORT_RESOURCES")
    issue = bloqueo["issues"][0]
    assert issue["severity"] == "error"
    assert issue["message"] == bloqueo["message"] == respuesta.data["message"]
    assert "recursos de apoyo" in issue["message"]
    assert CaseVersion.objects.get(pk=cv).status == "DRAFT"


def test_un_recurso_de_apoyo_en_una_escena_basta_para_esa_parte(owner):
    cv = _borrador(owner, con_recurso=True)

    assert _ciclo(owner, cv, "submit").status_code == 200


def test_un_recurso_agregado_con_el_editor_cuenta(owner):
    """El recurso entra por donde entra de verdad: el nodo del editor (``supportResources``)."""
    cv = _borrador(owner)
    cliente = cl(owner)
    nodo = cliente.get(f"{BASE}/{cv}/editor").data["data"]["nodes"][0]
    cuerpo = {
        "nodeKey": nodo["key"], "title": nodo["title"], "narrative": nodo["narrative"], "supportResources": [RECURSO],
        "requiredTools": nodo["requiredTools"], "sensitiveContent": nodo["sensitiveContent"],
        "safeExitRequired": nodo["safeExitRequired"], "warningMessage": nodo["warningMessage"],
        "terminal": nodo["terminal"], "startNode": nodo["startNode"], "positionX": nodo["positionX"],
        "positionY": nodo["positionY"],
    }
    assert _ciclo(owner, cv, "submit").status_code == 409

    guardado = cliente.put(f"{BASE}/{cv}/nodes/{nodo['id']}", cuerpo, format="json")

    assert guardado.status_code == 200, guardado.data
    assert _ciclo(owner, cv, "submit").status_code == 200


@pytest.mark.parametrize("guardado", ["[]", '["", "   "]', "[1, null, {}]", "no es json", "{}"])
def test_un_recurso_vacio_o_ilegible_no_cuenta(owner, guardado):
    cv = _borrador(owner)
    SimulationNode.objects.filter(case_version_id=cv).update(support_resources_json=guardado)

    respuesta = _ciclo(owner, cv, "submit")

    assert respuesta.status_code == 409
    assert _codigos_eticos(respuesta) == ["ETHICS.NO_SUPPORT_RESOURCES"]


def test_publicar_directo_tambien_se_bloquea_sin_recursos_de_apoyo(owner, admin):
    """El atajo del ADMIN (sin la bandera estricta) pasa por la misma compuerta."""
    cv = _borrador(owner)

    por_ciclo = _ciclo(admin, cv, "approve")
    por_publish = cl(admin).post(f"{BASE}/{cv}/publish", {}, format="json")

    for respuesta in (por_ciclo, por_publish):
        assert respuesta.status_code == 409
        assert respuesta.data["code"] == "CASE_NOT_PUBLISHABLE"
        assert _codigos_eticos(respuesta) == ["ETHICS.NO_SUPPORT_RESOURCES"]
    assert CaseVersion.objects.get(pk=cv).status == "DRAFT"


def test_el_motivo_del_bloqueo_llega_a_la_vista_del_ciclo_de_vida(owner):
    cv = _borrador(owner)

    estado = cl(owner).get(f"{BASE}/{cv}/lifecycle").data["data"]

    assert estado["blockedReason"]["code"] == "ETHICS.NO_SUPPORT_RESOURCES"
    assert "recursos de apoyo" in estado["blockedReason"]["message"]


# ─── «advertencias de contenido» (respaldo del sistema: el aviso vigente en el servidor) ─────────────────
@pytest.mark.parametrize("vacio", ["", "   "])
def test_advertencias_marcadas_sin_aviso_vigente_en_el_servidor_bloquean(owner, settings, vacio):
    cv = _borrador(owner, con_recurso=True)
    settings.SIEP_CONTENT_NOTICE_VERSION = vacio

    respuesta = _ciclo(owner, cv, "submit")

    assert respuesta.status_code == 409
    assert respuesta.data["code"] == "CASE_NOT_PUBLISHABLE"
    assert _codigos_eticos(respuesta) == ["ETHICS.NO_CONTENT_NOTICE"]
    assert CaseVersion.objects.get(pk=cv).status == "DRAFT"


def test_con_un_aviso_vigente_pasa_esa_parte(owner, settings):
    cv = _borrador(owner, con_recurso=True)
    settings.SIEP_CONTENT_NOTICE_VERSION = f"v-{secrets.token_hex(3)}"

    assert _ciclo(owner, cv, "submit").status_code == 200


def test_sin_recursos_ni_aviso_cada_falta_sale_una_sola_vez_y_en_el_orden_de_la_lista(owner, settings):
    cv = _borrador(owner)
    settings.SIEP_CONTENT_NOTICE_VERSION = ""

    respuesta = _ciclo(owner, cv, "submit")

    assert _codigos_eticos(respuesta) == ["ETHICS.NO_SUPPORT_RESOURCES", "ETHICS.NO_CONTENT_NOTICE"]


# ─── «revisión ética» (respaldo de la constancia, solo con la bandera, solo al aprobar) ───────────────────
def test_enviar_a_revision_no_exige_la_constancia_porque_aun_no_puede_existir(owner, admin, settings):
    settings.REVIEW_WORKFLOW_STRICT = True
    cv = _borrador(owner, con_recurso=True)

    enviado = _ciclo(owner, cv, "submit")
    estado = cl(admin).get(f"{BASE}/{cv}/lifecycle").data["data"]

    assert enviado.status_code == 200
    assert estado["allowedTransitions"] == ["approve", "reject"]
    assert "blockedReason" not in estado  # si lo hubiera, el botón «Aprobar» quedaría deshabilitado para siempre


def test_con_la_bandera_aprobar_sin_constancia_da_ethics_no_content_review(owner, admin, settings):
    settings.REVIEW_WORKFLOW_STRICT = True
    cv = _enviado(owner)

    respuesta = _ciclo(admin, cv, "approve")

    assert respuesta.status_code == 409
    assert respuesta.data["code"] == "CASE_NOT_PUBLISHABLE"
    assert _codigos_eticos(respuesta) == ["ETHICS.NO_CONTENT_REVIEW"]
    assert "constancia" in respuesta.data["message"]
    assert CaseVersion.objects.get(pk=cv).status == "IN_REVIEW"
    assert CaseReview.objects.get(case_version_id=cv).content_reference is None


def test_con_la_bandera_la_constancia_de_esa_misma_llamada_publica(owner, admin, settings):
    settings.REVIEW_WORKFLOW_STRICT = True
    cv = _enviado(owner)

    respuesta = _ciclo(admin, cv, "approve", contentReview=_constancia())

    assert respuesta.status_code == 200, respuesta.data
    assert CaseVersion.objects.get(pk=cv).status == "PUBLISHED"
    assert CaseReview.objects.get(case_version_id=cv).content_reference == "Acta 12-2026"


def test_con_la_bandera_una_constancia_previa_tambien_respalda_la_casilla(owner, admin, settings):
    settings.REVIEW_WORKFLOW_STRICT = True
    cv = _enviado(owner)
    CaseReview.objects.filter(case_version_id=cv).update(
        content_reviewer="Mg. Ana Torres", content_reviewed_on=timezone.now().date(), content_reference="Acta previa 7"
    )

    respuesta = _ciclo(admin, cv, "approve")

    assert respuesta.status_code == 200, respuesta.data
    assert CaseVersion.objects.get(pk=cv).status == "PUBLISHED"
    assert CaseReview.objects.get(case_version_id=cv).content_reference == "Acta previa 7"


def test_una_constancia_incompleta_o_con_fecha_futura_sigue_siendo_un_400_de_forma(owner, admin, settings):
    settings.REVIEW_WORKFLOW_STRICT = True
    cv = _enviado(owner)

    incompleta = _ciclo(admin, cv, "approve", contentReview={"reviewer": "Mg. Elena Rojas"})
    manana = (timezone.now().date() + datetime.timedelta(days=1)).isoformat()
    futura = _ciclo(admin, cv, "approve", contentReview={**_constancia(), "reviewedOn": manana})

    for respuesta in (incompleta, futura):
        assert respuesta.status_code == 400
        assert respuesta.data["code"] == "CONTENT_REVIEW_REQUIRED"
    assert CaseVersion.objects.get(pk=cv).status == "IN_REVIEW"


def test_sin_la_bandera_la_constancia_no_se_exige(owner, admin, settings):
    settings.REVIEW_WORKFLOW_STRICT = False
    cv = _borrador(owner, con_recurso=True)  # «revisión ética» marcada y ninguna constancia

    respuesta = _ciclo(admin, cv, "approve")

    assert respuesta.status_code == 200, respuesta.data
    assert CaseVersion.objects.get(pk=cv).status == "PUBLISHED"
    assert CaseReview.objects.get(case_version_id=cv).content_reference is None


# ─── lo que NO se comprueba ───────────────────────────────────────────────────────────────────────────
def test_una_casilla_sin_marcar_no_genera_un_bloqueo_de_respaldo(owner, settings):
    """Sin recursos y sin aviso, pero SIN marcar esas casillas: solo falta lo de siempre (lista incompleta)."""
    settings.SIEP_CONTENT_NOTICE_VERSION = ""
    cv = _borrador(owner, marcadas=("contentOriginal", "noStigmatizing"))

    respuesta = _ciclo(owner, cv, "submit")

    assert respuesta.status_code == 409
    assert [b["code"] for b in respuesta.data["blockers"]] == ["CHECKLIST_INCOMPLETE"]


def test_el_respaldo_no_cambia_los_codigos_del_mundo_ni_del_documento_ni_los_repite(owner):
    """Un caso con errores de validación Y sin recursos: lo de siempre primero y sin cambios, lo ético al final y una vez."""
    creado = cl(owner).post(BASE, {"title": "Caso a medias"}, format="json").data["data"]
    cv = creado["caseVersionId"]
    _marcar(owner, cv, SIETE)
    validacion = cl(owner).post(f"{BASE}/{cv}/validate", {}, format="json").data["data"]

    respuesta = _ciclo(owner, cv, "submit")

    bloqueos = respuesta.data["blockers"]
    assert [b["code"] for b in bloqueos] == ["VALIDATION_ERRORS", "ETHICS.NO_SUPPORT_RESOURCES"]
    errores = [issue["code"] for issue in bloqueos[0]["issues"]]
    assert errores == [issue["code"] for issue in validacion["issues"] if issue["severity"] == "error"]
    assert not any(codigo.startswith("ETHICS.") for codigo in errores)
    todos = [issue["code"] for bloqueo in bloqueos for issue in bloqueo.get("issues", [])]
    assert todos.count("ETHICS.NO_SUPPORT_RESOURCES") == 1
    assert respuesta.data["message"] == bloqueos[0]["message"]


def test_publicar_lo_ya_publicado_sin_exigir_la_lista_no_reevalua_la_lista_etica(db):
    """Sellar lo publicado (``seal_published_versions``, la semilla) no pide la lista: ni sus casillas ni su respaldo."""
    sembrado = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
    lista = PublicationChecklist.objects.create(
        case_version=sembrado, submitted_by=sembrado.created_by, completion_ratio=100, status="COMPLETE"
    )
    PublicationChecklistItem.objects.bulk_create([
        PublicationChecklistItem(checklist=lista, code=codigo, label=codigo, required=True, fulfilled=True)
        for codigo in SIETE
    ])
    assert not any(_recursos_de(sembrado.id))

    sello = gate.ensure_publishable(sembrado, require_checklist=False)

    assert sello.definition_hash


def test_una_lista_anterior_a_los_items_al_100_cuenta_las_seis_casillas_de_entonces_como_marcadas(owner):
    cv = _borrador(owner, marcadas=())
    PublicationChecklist.objects.filter(case_version_id=cv).delete()
    PublicationChecklist.objects.create(case_version_id=cv, submitted_by=owner, completion_ratio=100, status="COMPLETE")

    respuesta = _ciclo(owner, cv, "submit")

    assert respuesta.status_code == 409
    assert _codigos_eticos(respuesta) == ["ETHICS.NO_SUPPORT_RESOURCES"]


# ─── la vista del editor: quién respalda cada casilla ─────────────────────────────────────────────────
def test_la_vista_del_editor_dice_quien_respalda_cada_casilla_y_si_el_dato_existe(owner):
    cv = _borrador(owner, marcadas=())

    items = _items(cl(owner).get(f"{BASE}/{cv}/editor").data["data"])

    assert {codigo: item["backing"] for codigo, item in items.items()} == RESPALDO_SIN_BANDERA
    assert items["safetyProtocols"]["backed"] is False  # el caso sembrado no trae recursos de apoyo
    assert items["triggerWarnings"]["backed"] is True  # el servidor tiene un aviso vigente
    assert [c for c, item in items.items() if item["backed"] is None] == [
        c for c, respaldo in RESPALDO_SIN_BANDERA.items() if respaldo == "author"
    ]


def test_lo_que_dice_la_vista_es_el_dato_no_la_casilla(owner, settings):
    cv = _borrador(owner, marcadas=(), con_recurso=True)
    settings.SIEP_CONTENT_NOTICE_VERSION = ""

    items = _items(cl(owner).get(f"{BASE}/{cv}/editor").data["data"])

    assert items["safetyProtocols"]["fulfilled"] is False and items["safetyProtocols"]["backed"] is True
    assert items["triggerWarnings"]["fulfilled"] is False and items["triggerWarnings"]["backed"] is False


def test_cada_respaldo_tiene_su_etiqueta_corta_en_espanol(owner):
    cv = _borrador(owner, marcadas=())

    items = _items(cl(owner).get(f"{BASE}/{cv}/editor").data["data"])

    por_respaldo = {}
    for item in items.values():
        assert isinstance(item["backingLabel"], str) and item["backingLabel"].strip()
        por_respaldo.setdefault(item["backing"], set()).add(item["backingLabel"])
    assert all(len(etiquetas) == 1 for etiquetas in por_respaldo.values())  # una etiqueta por respaldo
    assert len({next(iter(etiquetas)) for etiquetas in por_respaldo.values()}) == len(por_respaldo)
    assert all(len(next(iter(etiquetas))) <= 60 for etiquetas in por_respaldo.values())  # corta


def test_con_la_bandera_la_revision_etica_pasa_a_respaldarse_con_la_constancia(owner, admin, settings):
    settings.REVIEW_WORKFLOW_STRICT = True
    cv = _enviado(owner)

    items_antes = _items(cl(admin).get(f"{BASE}/{cv}/editor").data["data"])
    assert _ciclo(admin, cv, "approve", contentReview=_constancia()).status_code == 200
    despues = _items(cl(admin).get(f"{BASE}/{cv}/editor").data["data"])["ethicsReviewed"]

    antes = items_antes["ethicsReviewed"]
    assert (antes["backing"], antes["backed"]) == ("constancia", False)
    assert (despues["backing"], despues["backed"]) == ("constancia", True)
    assert antes["backingLabel"] != items_antes["contentOriginal"]["backingLabel"]


def test_un_caso_ya_publicado_se_sigue_abriendo_con_su_lista(admin):
    sembrado = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")

    respuesta = cl(admin).get(f"{BASE}/{sembrado.id}/editor")

    assert respuesta.status_code == 200
    assert set(_items(respuesta.data["data"])) == set(SIETE)
    assert all({"backing", "backed", "backingLabel"} <= set(item) for item in _items(respuesta.data["data"]).values())


def test_quien_revisa_ve_la_lista_con_sus_respaldos_en_el_ciclo_de_vida(owner, admin, settings):
    """La pantalla de revisión lee ``GET …/lifecycle``: trae la misma lista que el editor, sin pedir el caso entero."""
    settings.REVIEW_WORKFLOW_STRICT = True
    cv = _enviado(owner)
    api = cl(admin)

    estado = api.get(f"{BASE}/{cv}/lifecycle").data["data"]
    editor = api.get(f"{BASE}/{cv}/editor").data["data"]
    aprobado = _ciclo(admin, cv, "approve", contentReview=_constancia())

    assert estado["checklist"] == editor["checklist"]
    antes = _items(estado)
    assert (antes["ethicsReviewed"]["backing"], antes["ethicsReviewed"]["backed"]) == ("constancia", False)
    assert (antes["safetyProtocols"]["backing"], antes["safetyProtocols"]["backed"]) == ("system", True)
    assert antes["contentOriginal"]["backed"] is None
    assert _items(aprobado.data["data"])["ethicsReviewed"]["backed"] is True  # también en la respuesta de la transición


# ─── lo declarado es lo que se comprueba ──────────────────────────────────────────────────────────────
def test_cada_casilla_declara_su_respaldo_y_el_sistema_comprueba_las_que_dice():
    from apps.simulation.services.authoring import checklist, ethics

    declarado = {codigo: respaldo for codigo, *_, respaldo in checklist.CHECKLIST_ITEMS}

    assert declarado == {**RESPALDO_SIN_BANDERA, "ethicsReviewed": "constancia"}
    assert {codigo for codigo, respaldo in declarado.items() if respaldo != "author"} == set(ethics.CHECKS)
    assert tuple(declarado) == SIETE


def test_sin_la_bandera_la_constancia_deja_de_ser_el_respaldo():
    from apps.simulation.services.authoring import checklist

    assert checklist.backing_of("ethicsReviewed", strict_mode=True) == "constancia"
    assert checklist.backing_of("ethicsReviewed", strict_mode=False) == "author"
    assert checklist.backing_of("safetyProtocols", strict_mode=False) == "system"
    assert checklist.backing_of("contentOriginal", strict_mode=True) == "author"


def test_todo_codigo_etico_tiene_su_mensaje_llano_sin_numeros_ni_identificadores():
    import re

    from apps.simulation.services.authoring import ethics

    codigos = [comprobacion.code for comprobacion in ethics.CHECKS.values()]
    assert sorted(codigos) == ["ETHICS.NO_CONTENT_NOTICE", "ETHICS.NO_CONTENT_REVIEW", "ETHICS.NO_SUPPORT_RESOURCES"]
    for comprobacion in ethics.CHECKS.values():
        assert comprobacion.message.strip().endswith(".")
        assert not re.search(r"\bid\b|id=|\d", comprobacion.message), comprobacion.code


# ─── la función pura: recibe los hechos y devuelve los hallazgos ──────────────────────────────────────
def _hechos(**cambios):
    from apps.simulation.services.authoring import ethics

    base = {"scene_resources": (), "content_notice": "", "content_review": False}
    return ethics.Facts(**{**base, **cambios})


def test_la_funcion_pura_solo_mira_las_casillas_marcadas():
    from apps.simulation.services.authoring import ethics

    sin_nada = _hechos()

    assert ethics.unbacked_issues(set(), sin_nada, strict_mode=True, at_approval=True) == []
    assert ethics.unbacked_issues({"contentOriginal", "noStigmatizing"}, sin_nada, strict_mode=True, at_approval=True) == []
    marcadas = set(SIETE)
    codigos = [i["code"] for i in ethics.unbacked_issues(marcadas, sin_nada, strict_mode=True, at_approval=True)]
    assert codigos == ["ETHICS.NO_CONTENT_REVIEW", "ETHICS.NO_SUPPORT_RESOURCES", "ETHICS.NO_CONTENT_NOTICE"]


def test_la_constancia_solo_se_mira_al_aprobar_y_con_la_bandera():
    from apps.simulation.services.authoring import ethics

    marcadas = {"ethicsReviewed"}
    sin_nada = _hechos()

    assert ethics.unbacked_issues(marcadas, sin_nada, strict_mode=True, at_approval=False) == []
    assert ethics.unbacked_issues(marcadas, sin_nada, strict_mode=False, at_approval=True) == []
    assert [i["code"] for i in ethics.unbacked_issues(marcadas, sin_nada, strict_mode=True, at_approval=True)] == [
        "ETHICS.NO_CONTENT_REVIEW"
    ]
    assert ethics.unbacked_issues(
        marcadas, _hechos(content_review=True), strict_mode=True, at_approval=True
    ) == []


def test_un_hallazgo_tiene_la_forma_de_un_validation_issue():
    from apps.simulation.services.authoring import ethics

    (issue,) = ethics.unbacked_issues({"safetyProtocols"}, _hechos(), strict_mode=False, at_approval=False)

    assert set(issue) == {"code", "severity", "message"}
    assert issue["severity"] == "error" and issue["code"] == "ETHICS.NO_SUPPORT_RESOURCES"


@pytest.mark.parametrize(
    "escenas, hay",
    [
        ((), False),
        (((), ()), False),
        ((("",), ("   ",)), False),
        (((1, None, {}),), False),
        ((("Línea de apoyo",),), True),
        (((), ("Línea de apoyo", "")), True),
    ],
)
def test_hay_recursos_de_apoyo_si_alguna_escena_trae_un_texto_no_vacio(escenas, hay):
    from apps.simulation.services.authoring import ethics

    assert ethics.has_support_resources(escenas) is hay


# ─── controles negativos: apagada UNA comprobación, el caso sin el dato se publica ───────────────────────
def _sin_comprobar(monkeypatch, codigo):
    """Apaga UNA comprobación: su ``holds`` dice siempre que el dato existe (el resto sigue encendido)."""
    import dataclasses

    from apps.simulation.services.authoring import ethics

    monkeypatch.setitem(
        ethics.CHECKS, codigo, dataclasses.replace(ethics.CHECKS[codigo], holds=lambda facts: True)
    )


def test_control_negativo_sin_la_comprobacion_de_recursos_el_caso_sin_recursos_se_publica(owner, admin, monkeypatch):
    cv = _borrador(owner)
    assert _ciclo(owner, cv, "submit").status_code == 409  # encendida: bloquea

    _sin_comprobar(monkeypatch, "safetyProtocols")

    assert _ciclo(owner, cv, "submit").status_code == 200  # apagada: la casilla marcada basta
    assert _ciclo(admin, cv, "approve").status_code == 200
    assert CaseVersion.objects.get(pk=cv).status == "PUBLISHED"


def test_control_negativo_sin_la_comprobacion_del_aviso_el_caso_sin_aviso_se_publica(owner, admin, settings, monkeypatch):
    cv = _borrador(owner, con_recurso=True)
    settings.SIEP_CONTENT_NOTICE_VERSION = ""
    assert _ciclo(owner, cv, "submit").status_code == 409

    _sin_comprobar(monkeypatch, "triggerWarnings")

    assert _ciclo(owner, cv, "submit").status_code == 200
    assert _ciclo(admin, cv, "approve").status_code == 200
    assert CaseVersion.objects.get(pk=cv).status == "PUBLISHED"


def test_control_negativo_sin_la_comprobacion_de_la_constancia_se_publica_sin_constancia(owner, admin, settings, monkeypatch):
    settings.REVIEW_WORKFLOW_STRICT = True
    cv = _enviado(owner)
    assert _ciclo(admin, cv, "approve").status_code == 409

    _sin_comprobar(monkeypatch, "ethicsReviewed")

    assert _ciclo(admin, cv, "approve").status_code == 200
    assert CaseVersion.objects.get(pk=cv).status == "PUBLISHED"
    assert CaseReview.objects.get(case_version_id=cv).content_reference is None


def test_control_negativo_apagar_una_comprobacion_no_apaga_las_demas(owner, settings, monkeypatch):
    cv = _borrador(owner)
    settings.SIEP_CONTENT_NOTICE_VERSION = ""

    _sin_comprobar(monkeypatch, "safetyProtocols")
    respuesta = _ciclo(owner, cv, "submit")

    assert respuesta.status_code == 409
    assert _codigos_eticos(respuesta) == ["ETHICS.NO_CONTENT_NOTICE"]


def test_la_compuerta_directa_rechaza_con_los_bloqueos_y_sin_ellos_devuelve_el_sello(owner):
    """``gate.ensure_publishable`` es el punto único: lo que se ve por HTTP sale de aquí."""
    cv = _borrador(owner)
    version = CaseVersion.objects.get(pk=cv)

    with pytest.raises(ApiError) as rechazo:
        gate.ensure_publishable(version)
    give_support_resource(cv)
    sello =gate.ensure_publishable(CaseVersion.objects.get(pk=cv))

    assert rechazo.value.api_code == "CASE_NOT_PUBLISHABLE"
    assert [b["code"] for b in rechazo.value.extra["blockers"]] == ["ETHICS.NO_SUPPORT_RESOURCES"]
    assert sello.definition_hash.startswith("sha256:")
