"""Siembra de la sonda de CSP (plan 03, S2-4): el caso publicado con marcado solo existe en la BD de la sonda.

``shared.csp_probe_seed`` deja un caso PUBLICADO cuyos textos llevan ``<script>`` e ``<img onerror>`` para que la sonda
compruebe que no se ejecutan. Aquí se prueba que lo hace sin tocar el caso demo, que solo corre con los ajustes de la
sonda y que el motivo del diseño es cierto: la API y la compuerta de publicación impiden el marcado, así que la
siembra tiene que escribirlo en la base directamente, ya publicado.
"""
import json

import pytest
from django.core.management.base import CommandError
from rest_framework.test import APIClient

from apps.simulation.models import (
    CaseVersion,
    DecisionOption,
    DialogueLine,
    MapObject,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.services.authoring import definition_io
from shared import csp_probe_seed
from shared.csp_probe_seed import PROBE_CODE, SCRIPT, SOURCE_CODE, seed_markup_case

pytestmark = [pytest.mark.req("RNF-002"), pytest.mark.security, pytest.mark.django_db]

IMPORT = "/api/authoring/cases/import"


@pytest.fixture
def con_ajustes_de_la_sonda(settings):
    settings.SETTINGS_MODULE = "psychosim.settings.csp_probe"


@pytest.fixture
def admin(db):
    from django.contrib.auth import get_user_model

    return get_user_model().objects.filter(role="ADMIN", activo=True).order_by("id").first()


def _importar_borrador(admin, codigo):
    """Una copia BENIGNA del caso demo como borrador (sin publicar)."""
    fuente = CaseVersion.objects.get(simulation_case__code=SOURCE_CODE, status="PUBLISHED")
    documento = definition_io.export_definition(fuente.id)
    documento["caso"]["id"] = codigo
    cliente = APIClient()
    cliente.force_authenticate(user=admin)
    respuesta = cliente.generic(
        "POST", IMPORT, data=json.dumps(documento, ensure_ascii=False).encode("utf-8"), content_type="application/json"
    )
    assert respuesta.status_code == 201, respuesta.data
    return cliente, respuesta.data["data"]["caseVersionId"]


# ── Solo con los ajustes de la sonda ─────────────────────────────────────────────────────────────


def test_se_niega_con_cualquier_otro_ajuste_y_no_escribe_nada():
    antes = SimulationCase.objects.count()

    with pytest.raises(CommandError, match="csp_probe"):
        seed_markup_case()

    assert SimulationCase.objects.count() == antes


@pytest.mark.parametrize("modulo", ["psychosim.settings.production", "psychosim.settings.local", "psychosim.settings.base"])
def test_se_niega_con_los_ajustes_de_desarrollo_y_de_produccion(settings, modulo):
    settings.SETTINGS_MODULE = modulo

    with pytest.raises(CommandError):
        seed_markup_case()


# ── Lo que deja ──────────────────────────────────────────────────────────────────────────────────


def test_deja_un_caso_aparte_publicado_con_el_marcado_en_sus_textos(con_ajustes_de_la_sonda):
    resultado = seed_markup_case()

    caso = SimulationCase.objects.get(code=PROBE_CODE)
    version = CaseVersion.objects.get(pk=resultado["caseVersionId"])
    assert version.simulation_case_id == caso.id == resultado["caseId"]
    assert version.status == "PUBLISHED"
    assert SCRIPT in caso.title and SCRIPT in resultado["title"]
    assert SCRIPT in (version.narrative_context or "")
    assert all(SCRIPT in objetivo for objetivo in json.loads(version.learning_objectives))
    # (modelo, cómo llega a la versión, columna): los textos que ven las personas.
    textos = (
        (SimulationNode, "case_version_id", "title"),
        (SimulationNode, "case_version_id", "narrative"),
        (DecisionOption, "case_version_id", "text"),
        (MapObject, "scene_map__case_version_id", "label"),
        (DialogueLine, "dialogue_tree__scene_map__case_version_id", "text"),
    )
    for modelo, camino, columna in textos:
        valores = list(modelo.objects.filter(**{camino: version.id}).values_list(columna, flat=True))
        assert valores, f"{modelo.__name__} sin filas en la copia"
        assert all(SCRIPT in valor for valor in valores), f"{modelo.__name__}.{columna} sin el marcado"
    assert resultado["touched"]["simulation_nodes"] == SimulationNode.objects.filter(case_version_id=version.id).count()
    assert resultado["touched"]["map_objects"] > 0 and resultado["touched"]["dialogue_lines"] > 0


def test_no_toca_el_caso_demo_ni_sus_textos(con_ajustes_de_la_sonda):
    demo = CaseVersion.objects.get(simulation_case__code=SOURCE_CODE, status="PUBLISHED")
    antes = json.dumps(definition_io.export_definition(demo.id), sort_keys=True, ensure_ascii=False)

    seed_markup_case()

    assert json.dumps(definition_io.export_definition(demo.id), sort_keys=True, ensure_ascii=False) == antes
    assert "<script" not in antes
    assert "<script" not in (SimulationCase.objects.get(code=SOURCE_CODE).title or "")


def test_control_negativo_una_segunda_siembra_no_se_pisa_en_silencio(con_ajustes_de_la_sonda):
    seed_markup_case()

    # El código del caso es único: sembrar dos veces en la misma base es un error claro, no dos casos ni un caso a medias.
    with pytest.raises(CommandError, match="importar"):
        seed_markup_case()


# ── El motivo del diseño: la API y la compuerta impiden el marcado ───────────────────────────────


def test_la_api_rechaza_el_marcado_en_el_contexto_de_un_borrador(admin):
    cliente, version_id = _importar_borrador(admin, "PREMISA-001")

    respuesta = cliente.put(f"/api/authoring/cases/{version_id}/brief", {"context": f"Contexto {SCRIPT}"}, format="json")

    assert respuesta.status_code == 400
    assert respuesta.data["field"] == "context"


def test_la_compuerta_de_publicacion_rechaza_el_marcado_en_los_demas_textos(admin):
    cliente, version_id = _importar_borrador(admin, "PREMISA-002")
    nodo = SimulationNode.objects.filter(case_version_id=version_id).order_by("id").first()
    SimulationNode.objects.filter(pk=nodo.pk).update(title=f"{nodo.title} {SCRIPT}")
    base = f"/api/authoring/cases/{version_id}"
    cliente.put(
        f"{base}/checklist",
        {clave: True for clave in csp_probe_seed.CHECKLIST},
        format="json",
    )

    respuesta = cliente.post(f"{base}/lifecycle", {"action": "submit"}, format="json")

    assert respuesta.status_code == 409
    assert any(aviso["code"] == "DSL.TEXT_MARKUP" for aviso in respuesta.data["blockers"][0]["issues"])
    assert CaseVersion.objects.get(pk=version_id).status != "PUBLISHED"
