"""Tarea 11 (modelo de métricas) · La API de autoría de clases, hitos, riesgo y finales.

Todo va por HTTP contra un borrador clonado del caso sembrado. Cubre las tres rutas nuevas
(``PUT …/rules/{milestones,risk,endings}``: 400 con ``field``, 409 con la revisión vencida, solo borradores,
auditoría), las opciones con ``responseClass`` (y el editor viejo, que sigue mandando solo ``classification``),
la ``intensity`` de los nodos y lo que el editor devuelve para que el cliente lea lo que escribe.
"""
import itertools
import json

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.simulation.models import AuditLog, CaseVersion, DecisionOption

User = get_user_model()
BASE = "/api/admin/cases"

HITOS = [
    {"key": "valida_emocion", "label": "Validar la emoción", "description": "Nombra lo que la persona siente.", "decisive": False},
    {"key": "recomienda_proteccion", "label": "Recomendar medidas de protección", "decisive": True},
]


def cl(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin(db):
    return User.objects.create_user(email="rules_admin@x.com", password="x", nombre="Ad", apellido="Ru", role="ADMIN")


@pytest.fixture
def other_admin(db):
    return User.objects.create_user(email="rules_admin2@x.com", password="x", nombre="Ad2", apellido="Ru", role="ADMIN")


@pytest.fixture
def api(admin):
    return cl(admin)


@pytest.fixture
def published_cv(db):
    return CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED").id


@pytest.fixture
def draft(api):
    """Un borrador nuevo y vacío de reglas del modelo (el sembrado ya trae hitos y opciones que los cumplen)."""
    response = api.post(BASE, {"title": "Caso de reglas del modelo"}, format="json")
    assert response.status_code == 200, response.data
    return response.data["data"]["caseVersionId"]


@pytest.fixture
def seeded_draft(api, published_cv):
    """Un borrador clonado del caso sembrado, con su modelo ya poblado."""
    response = api.post(f"{BASE}/{published_cv}/clone-version")
    assert response.status_code == 200, response.data
    return response.data["data"]["caseVersionId"]


def _editor(api, cv):
    return api.get(f"{BASE}/{cv}/editor").data["data"]


def _put(api, cv, part, body, revision="current"):
    """``PUT …/rules/<part>`` con la revisión vigente (o la que se pida; ``None`` = sin revisión)."""
    body = dict(body)
    if revision == "current":
        revision = _editor(api, cv)["revision"]
    if revision is not None:
        body["revision"] = revision
    return api.put(f"{BASE}/{cv}/rules/{part}", body, format="json")


def _rules_json(cv):
    return json.loads(CaseVersion.objects.get(pk=cv).rules)


def _new_node(api, cv, key, **extra):
    body = {"nodeKey": key, "title": "Extra", "narrative": "N", "revision": _editor(api, cv)["revision"], **extra}
    response = api.post(f"{BASE}/{cv}/nodes", body, format="json")
    assert response.status_code == 200, response.data
    return next(n for n in response.data["data"]["nodes"] if n["key"] == key)


_keys = itertools.count()


def _decision(api, cv, **overrides):
    n = next(_keys)
    a, b = _new_node(api, cv, f"ra-{n}"), _new_node(api, cv, f"rb-{n}")
    body = {"sourceNodeId": a["id"], "targetNodeId": b["id"], "text": "Decido esto", **overrides}
    body.setdefault("revision", _editor(api, cv)["revision"])
    return api.post(f"{BASE}/{cv}/decisions", body, format="json")


def _created_decision(response):
    assert response.status_code == 200, response.data
    return max(response.data["data"]["decisions"], key=lambda d: d["id"])


# ─── hitos ──────────────────────────────────────────────────────────────────────────────────────
def test_los_hitos_se_guardan_el_editor_los_devuelve_y_la_revision_avanza(api, admin, draft):
    before = _editor(api, draft)
    CaseVersion.objects.filter(pk=draft).update(rules=json.dumps({"secondChance": True, "feedbackTiming": "AT_CLOSE"}))

    response = _put(api, draft, "milestones", {"milestones": HITOS})

    assert response.status_code == 200, response.data
    assert response.data["message"] == "Hitos actualizados"
    data = response.data["data"]
    assert data["revision"] == before["revision"] + 1
    assert data["rules"]["milestones"] == [
        {**HITOS[0]},
        {"key": "recomienda_proteccion", "label": "Recomendar medidas de protección", "description": "", "decisive": True},
    ]
    stored = _rules_json(draft)
    assert (stored["secondChance"], stored["feedbackTiming"]) == (True, "AT_CLOSE")  # las demás claves quedan
    row = AuditLog.objects.filter(action="ADMIN_UPDATE_MILESTONES", resource_id=str(draft), actor_id=admin.id).get()
    assert json.loads(row.context_json)["taxonomy"] == "reglas.actualizar_hitos"
    assert row.resource_type == "CASE_VERSION"


def test_una_lista_vacia_quita_todos_los_hitos(api, draft):
    _put(api, draft, "milestones", {"milestones": HITOS})

    response = _put(api, draft, "milestones", {"milestones": []})

    assert response.status_code == 200
    assert response.data["data"]["rules"]["milestones"] == []


@pytest.mark.parametrize(
    "milestones",
    [
        [{"key": "con espacio", "label": "x"}],
        [{"key": "", "label": "x"}],
        [{"key": "a" * 61, "label": "x"}],
        [{"label": "sin clave"}],
        [{"key": "ok", "label": ""}],
        [{"key": "ok", "label": "   "}],
        [{"key": "ok", "label": "x" * 256}],
        [{"key": "ok", "label": "x", "description": "d" * 2001}],
        [{"key": "ok", "label": "x", "description": 7}],
        [{"key": "ok", "label": "x", "decisive": "si"}],
        [{"key": "ok", "label": "x", "extra": 1}],
        ["texto"],
        [{"key": "dup", "label": "a"}, {"key": "dup", "label": "b"}],
        [{"key": f"h{n}", "label": "x"} for n in range(41)],
    ],
    ids=["clave-con-espacio", "clave-vacia", "clave-larga", "sin-clave", "sin-nombre", "nombre-blanco", "nombre-largo",
         "descripcion-larga", "descripcion-no-texto", "decisive-no-bool", "campo-desconocido", "no-objeto", "duplicado",
         "mas-de-40"],
)
def test_un_hito_mal_formado_o_repetido_es_400_con_su_campo_y_no_cambia_nada(api, draft, milestones):
    before = _editor(api, draft)

    response = _put(api, draft, "milestones", {"milestones": milestones})

    assert response.status_code == 400, response.data
    assert response.data["field"] == "milestones"
    after = _editor(api, draft)
    assert after["revision"] == before["revision"]
    assert after["rules"] == before["rules"]


def test_la_lista_de_hitos_es_obligatoria_y_debe_ser_una_lista(api, draft):
    assert _put(api, draft, "milestones", {}).status_code == 400
    assert _put(api, draft, "milestones", {"milestones": "no"}).status_code == 400


def test_el_caso_sembrado_no_pierde_los_hitos_que_sus_opciones_cumplen(api, seeded_draft):
    before = _editor(api, seeded_draft)["rules"]["milestones"]
    assert before

    response = _put(api, seeded_draft, "milestones", {"milestones": []})

    assert response.status_code == 400
    assert response.data["field"] == "milestones"
    assert _editor(api, seeded_draft)["rules"]["milestones"] == before


def test_quitar_un_hito_que_una_opcion_cumple_es_400_y_lo_nombra(api, draft):
    _put(api, draft, "milestones", {"milestones": HITOS})
    created = _decision(api, draft, responseClass="RECOMMENDED", effects={"milestones": ["valida_emocion"]})
    option = _created_decision(created)
    assert option["effects"]["milestones"] == ["valida_emocion"]

    response = _put(api, draft, "milestones", {"milestones": HITOS[1:]})

    assert response.status_code == 400
    assert response.data["field"] == "milestones"
    assert "valida_emocion" in response.data["message"]
    assert [m["key"] for m in _editor(api, draft)["rules"]["milestones"]] == ["valida_emocion", "recomienda_proteccion"]


def test_quitar_un_hito_que_la_condicion_de_un_final_nombra_es_400_y_lo_nombra(api, draft):
    _put(api, draft, "milestones", {"milestones": HITOS})
    final = {"key": "protectora", "title": "Protectora", "message": "Cerraste con protección.",
             "when": {"milestone": "recomienda_proteccion"}}
    assert _put(api, draft, "endings", {"endings": [final]}).status_code == 200

    response = _put(api, draft, "milestones", {"milestones": HITOS[:1]})

    assert response.status_code == 400
    assert response.data["field"] == "milestones"
    assert "recomienda_proteccion" in response.data["message"]


# ─── nivel de riesgo ────────────────────────────────────────────────────────────────────────────
def test_el_nivel_de_riesgo_se_guarda_y_null_lo_borra(api, admin, draft):
    response = _put(api, draft, "risk", {"riskLevel": "SEVERE"})

    assert response.status_code == 200, response.data
    assert response.data["message"] == "Nivel de riesgo actualizado"
    assert response.data["data"]["rules"]["riskLevel"] == "SEVERE"
    assert _rules_json(draft)["riskLevel"] == "SEVERE"
    row = AuditLog.objects.filter(action="ADMIN_UPDATE_RISK", resource_id=str(draft), actor_id=admin.id).get()
    assert json.loads(row.context_json)["taxonomy"] == "reglas.actualizar_riesgo"

    cleared = _put(api, draft, "risk", {"riskLevel": None})

    assert cleared.status_code == 200
    assert cleared.data["data"]["rules"]["riskLevel"] is None
    assert "riskLevel" not in _rules_json(draft)


@pytest.mark.parametrize("level", ["ALTO", "severe", "", 3, ["SEVERE"]])
def test_un_nivel_de_riesgo_fuera_del_vocabulario_es_400_con_su_campo(api, draft, level):
    response = _put(api, draft, "risk", {"riskLevel": level})

    assert response.status_code == 400, response.data
    assert response.data["field"] == "riskLevel"


def test_el_nivel_de_riesgo_es_obligatorio_aunque_sea_null(api, draft):
    response = _put(api, draft, "risk", {})

    assert response.status_code == 400
    assert response.data["field"] == "riskLevel"


# ─── finales ────────────────────────────────────────────────────────────────────────────────────
def test_los_finales_se_guardan_en_orden_con_el_tono_neutral_por_defecto(api, admin, draft):
    _put(api, draft, "milestones", {"milestones": HITOS})
    finales = [
        {"key": "critica", "title": "Crítica", "message": "Hubo daño.", "tone": "critical",
         "when": {"count": "contraindicated", "gte": 2}},
        {"key": "protectora", "title": "Protectora", "message": "Protegiste.",
         "when": {"all": [{"milestone": "recomienda_proteccion"}, {"not": {"persona": {"activation": "CRISIS"}}}]}},
        {"key": "con_brechas", "title": "Con brechas", "message": "Faltó algo."},
    ]

    response = _put(api, draft, "endings", {"endings": finales})

    assert response.status_code == 200, response.data
    assert response.data["message"] == "Finales actualizados"
    endings = response.data["data"]["rules"]["endings"]
    assert [e["key"] for e in endings] == ["critica", "protectora", "con_brechas"]
    assert [e["tone"] for e in endings] == ["critical", "neutral", "neutral"]
    assert endings[1]["when"] == finales[1]["when"]
    assert "when" not in endings[2]
    row = AuditLog.objects.filter(action="ADMIN_UPDATE_ENDINGS", resource_id=str(draft), actor_id=admin.id).get()
    assert json.loads(row.context_json)["taxonomy"] == "reglas.actualizar_finales"


def test_guardar_los_finales_conserva_hitos_riesgo_y_las_demas_claves(api, draft):
    _put(api, draft, "milestones", {"milestones": HITOS})
    _put(api, draft, "risk", {"riskLevel": "MODERATE"})
    before = _rules_json(draft)

    _put(api, draft, "endings", {"endings": [{"key": "f", "title": "F", "message": "M"}]})

    after = _rules_json(draft)
    assert {k: v for k, v in after.items() if k != "endings"} == {k: v for k, v in before.items() if k != "endings"}


def _final(**overrides):
    return {"key": "f", "title": "Final", "message": "Mensaje", **overrides}


@pytest.mark.parametrize(
    "endings",
    [
        [_final(key="con espacio")],
        [_final(key="")],
        [_final(title="")],
        [_final(message="  ")],
        [_final(title="t" * 256)],
        [_final(tone="enojado")],
        [_final(when={"metric": 3})],
        [_final(when={"milestone": ""})],
        [_final(when={"count": "inventada", "gte": 1})],
        [_final(when={"persona": {"bond": "ENOJADA"}})],
        [_final(when="siempre")],
        [_final(when={"all": [{"milestone": "no_declarado"}]})],
        [_final(when={"not": {"milestone": "no_declarado"}})],
        [_final(extra=1)],
        [_final(), _final(title="Otro")],
        ["texto"],
        [_final(key=f"f{n}") for n in range(11)],
    ],
    ids=["clave-con-espacio", "clave-vacia", "sin-titulo", "sin-mensaje", "titulo-largo", "tono-invalido",
         "condicion-metric-rota", "hito-vacio", "conteo-desconocido", "persona-invalida", "condicion-no-objeto",
         "hito-no-declarado", "hito-no-declarado-en-not", "campo-desconocido", "clave-duplicada", "no-objeto",
         "mas-de-10"],
)
def test_un_final_invalido_es_400_con_su_campo_y_no_cambia_nada(api, draft, endings):
    before = _editor(api, draft)

    response = _put(api, draft, "endings", {"endings": endings})

    assert response.status_code == 400, response.data
    assert response.data["field"] == "endings"
    after = _editor(api, draft)
    assert after["revision"] == before["revision"]
    assert after["rules"] == before["rules"]


def test_la_condicion_que_nombra_un_hito_no_declarado_lo_nombra_en_el_error(api, draft):
    response = _put(api, draft, "endings", {"endings": [_final(when={"milestone": "fantasma"})]})

    assert response.status_code == 400
    assert "fantasma" in response.data["message"]


# ─── solo borradores y revisión optimista ───────────────────────────────────────────────────────
PARTES = [
    ("milestones", {"milestones": HITOS}),
    ("risk", {"riskLevel": "SEVERE"}),
    ("endings", {"endings": [_final()]}),
]


@pytest.mark.parametrize(("part", "body"), PARTES)
def test_una_version_publicada_no_se_toca_ni_deja_rastro(api, published_cv, part, body):
    before = CaseVersion.objects.get(pk=published_cv)
    audits = AuditLog.objects.filter(action__startswith="ADMIN_UPDATE_").count()

    response = _put(api, published_cv, part, body)

    assert response.status_code == 400
    assert "DRAFT" in response.data["message"]
    after = CaseVersion.objects.get(pk=published_cv)
    assert (after.rules, after.version) == (before.rules, before.version)
    assert AuditLog.objects.filter(action__startswith="ADMIN_UPDATE_").count() == audits


@pytest.mark.parametrize(("part", "body"), PARTES)
def test_una_revision_vencida_es_409_con_el_estado_actual_y_no_escribe(api, other_admin, draft, part, body):
    stale = _editor(api, draft)["revision"]
    assert _put(cl(other_admin), draft, "risk", {"riskLevel": "VARIABLE"}, revision=stale).status_code == 200
    rules_before = _rules_json(draft)

    response = _put(api, draft, part, body, revision=stale)

    assert response.status_code == 409
    assert response.data["code"] == "REVISION_CONFLICT"
    assert response.data["current"]["revision"] == stale + 1
    assert _rules_json(draft) == rules_before


# ─── opciones: responseClass y el editor viejo ──────────────────────────────────────────────────
def test_una_clase_fuera_del_vocabulario_es_400_con_su_campo(api, draft):
    response = _decision(api, draft, responseClass="EXCELENTE")

    assert response.status_code == 400
    assert response.data["field"] == "responseClass"


def test_una_opcion_nueva_sin_clase_ni_clasificacion_es_400_con_su_campo(api, draft):
    response = _decision(api, draft)

    assert response.status_code == 400
    assert response.data["field"] == "responseClass"


@pytest.mark.parametrize(
    ("response_class", "classification"),
    [("RECOMMENDED", "ADEQUATE"), ("ACCEPTABLE", "ADEQUATE"), ("RISKY", "RISKY"), ("CONTRAINDICATED", "INADEQUATE")],
)
def test_la_clase_se_guarda_y_la_clasificacion_antigua_se_deriva_de_ella(api, draft, response_class, classification):
    edge = _created_decision(_decision(api, draft, responseClass=response_class))

    assert edge["responseClass"] == response_class
    assert edge["classification"] == classification
    assert DecisionOption.objects.get(pk=edge["id"]).response_class == response_class


@pytest.mark.parametrize(
    ("classification", "response_class"),
    [("ADEQUATE", "RECOMMENDED"), ("RISKY", "RISKY"), ("INADEQUATE", "CONTRAINDICATED")],
)
def test_el_editor_viejo_con_solo_classification_sigue_funcionando_y_deriva_la_clase(api, draft, classification, response_class):
    edge = _created_decision(_decision(api, draft, classification=classification, scoreDelta=5, stressDelta=-3))

    assert edge["classification"] == classification
    assert edge["responseClass"] == response_class
    assert DecisionOption.objects.get(pk=edge["id"]).response_class == response_class


def test_los_deltas_numericos_se_aceptan_y_se_ignoran(api, draft):
    edge = _created_decision(
        _decision(api, draft, responseClass="RISKY", scoreDelta=9, stressDelta=9, prohibitedPenalty=9)
    )

    assert (edge["scoreDelta"], edge["stressDelta"], edge["prohibitedPenalty"]) == (0, 0, 0)


def test_la_conducta_prohibida_sin_clase_explicita_es_contraindicada(api, draft):
    edge = _created_decision(_decision(api, draft, classification="RISKY", prohibitedConduct=True))

    assert edge["responseClass"] == "CONTRAINDICATED"


def test_una_contraindicada_sin_motivo_de_prohibicion_se_acepta_aqui(api, draft):
    """La regla de publicación (no este guardado) es la que avisa de que le falta el motivo."""
    response = _decision(api, draft, responseClass="CONTRAINDICATED")

    assert _created_decision(response)["responseClass"] == "CONTRAINDICATED"


def test_reenviar_la_clasificacion_de_una_aceptable_no_la_vuelve_recomendada(api, draft):
    edge = _created_decision(_decision(api, draft, responseClass="ACCEPTABLE"))

    response = api.put(
        f"{BASE}/{draft}/decisions/{edge['id']}",
        {"sourceNodeId": edge["sourceNodeId"], "targetNodeId": edge["targetNodeId"], "text": "Otro texto",
         "classification": "ADEQUATE", "revision": _editor(api, draft)["revision"]},
        format="json",
    )

    again = next(d for d in response.data["data"]["decisions"] if d["id"] == edge["id"])
    assert (again["text"], again["responseClass"], again["classification"]) == ("Otro texto", "ACCEPTABLE", "ADEQUATE")


def test_actualizar_sin_clase_ni_clasificacion_no_toca_la_clase(api, draft):
    edge = _created_decision(_decision(api, draft, responseClass="RISKY"))

    response = api.put(
        f"{BASE}/{draft}/decisions/{edge['id']}",
        {"sourceNodeId": edge["sourceNodeId"], "targetNodeId": edge["targetNodeId"], "text": "Solo el texto",
         "revision": _editor(api, draft)["revision"]},
        format="json",
    )

    assert response.status_code == 200, response.data
    again = next(d for d in response.data["data"]["decisions"] if d["id"] == edge["id"])
    assert (again["text"], again["responseClass"]) == ("Solo el texto", "RISKY")


def test_los_efectos_de_la_opcion_aceptan_persona_hitos_declarados_y_competencias_en_lista(api, draft):
    _put(api, draft, "milestones", {"milestones": HITOS})
    effects = {"persona": {"bond": 1, "activation": -1}, "milestones": ["valida_emocion"], "competencies": ["PAP"]}

    edge = _created_decision(_decision(api, draft, responseClass="RECOMMENDED", effects=effects))

    assert edge["effects"] == {**effects, "competencies": {"PAP": None}}  # la lista de códigos se guarda como {código: null}


def test_un_hito_que_el_caso_no_declara_es_400_en_los_efectos(api, draft):
    response = _decision(api, draft, responseClass="RECOMMENDED", effects={"milestones": ["fantasma"]})

    assert response.status_code == 400
    assert response.data["field"] == "effects"
    assert "fantasma" in response.data["message"]


# ─── nodos: intensidad ──────────────────────────────────────────────────────────────────────────
def test_un_nodo_nuevo_nace_con_intensidad_media_y_el_editor_la_devuelve(api, draft):
    node = _new_node(api, draft, "n-media")

    assert node["intensity"] == "MEDIUM"


def test_un_nodo_nuevo_sensible_sin_intensidad_explicita_nace_alto(api, draft):
    node = _new_node(api, draft, "n-sensible", sensitiveContent=True, warningMessage="Aviso")

    assert node["intensity"] == "HIGH"


def test_la_intensidad_explicita_manda_y_se_puede_cambiar(api, draft):
    node = _new_node(api, draft, "n-baja", sensitiveContent=True, intensity="LOW")
    assert node["intensity"] == "LOW"

    response = api.put(
        f"{BASE}/{draft}/nodes/{node['id']}",
        {"nodeKey": "n-baja", "title": "Extra", "narrative": "N", "intensity": "MEDIUM",
         "revision": _editor(api, draft)["revision"]},
        format="json",
    )

    assert next(n for n in response.data["data"]["nodes"] if n["id"] == node["id"])["intensity"] == "MEDIUM"


def test_actualizar_un_nodo_sin_intensidad_no_la_toca(api, draft):
    node = _new_node(api, draft, "n-alta", intensity="HIGH", warningMessage="Aviso")

    response = api.put(
        f"{BASE}/{draft}/nodes/{node['id']}",
        {"nodeKey": "n-alta", "title": "Otro título", "narrative": "N", "revision": _editor(api, draft)["revision"]},
        format="json",
    )

    assert next(n for n in response.data["data"]["nodes"] if n["id"] == node["id"])["intensity"] == "HIGH"


def test_una_intensidad_fuera_del_vocabulario_es_400_con_su_campo(api, draft):
    response = api.post(
        f"{BASE}/{draft}/nodes",
        {"nodeKey": "n-mala", "title": "t", "narrative": "n", "intensity": "ENORME", "revision": _editor(api, draft)["revision"]},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["field"] == "intensity"


# ─── el editor ──────────────────────────────────────────────────────────────────────────────────
def test_el_editor_devuelve_las_reglas_y_la_clase_efectiva_de_cada_opcion(api, seeded_draft):
    data = _editor(api, seeded_draft)

    assert set(data["rules"]) == {"milestones", "riskLevel", "endings"}
    assert data["decisions"]
    assert all(d["responseClass"] in {"RECOMMENDED", "ACCEPTABLE", "RISKY", "CONTRAINDICATED"} for d in data["decisions"])
    assert all("classification" in d and "scoreDelta" in d for d in data["decisions"])  # lo viejo sigue (Tarea 21)


# ─── la revisión también viaja en la cabecera ──────────────────────────────────────────────────
@pytest.mark.parametrize(("part", "body"), PARTES)
def test_la_cabecera_x_case_revision_hace_la_comprobacion_optimista(api, other_admin, draft, part, body):
    stale = _editor(api, draft)["revision"]
    assert _put(cl(other_admin), draft, "risk", {"riskLevel": "VARIABLE"}, revision=stale).status_code == 200

    vencida = api.put(f"{BASE}/{draft}/rules/{part}", body, format="json", HTTP_X_CASE_REVISION=str(stale))
    assert vencida.status_code == 409
    assert vencida.data["code"] == "REVISION_CONFLICT"

    vigente = api.put(
        f"{BASE}/{draft}/rules/{part}", body, format="json", HTTP_X_CASE_REVISION=str(_editor(api, draft)["revision"])
    )
    assert vigente.status_code == 200, vigente.data
