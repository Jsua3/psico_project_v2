"""Generación y reparación de salas por piezas."""
import copy
import json

import pytest

from apps.biblioteca.services import lugares
from apps.simulation.casedef import geometria, rules_estructura
from apps.simulation.models import SceneMap
from apps.simulation.services.authoring.generation import checks, context, prompts, schema, service
from apps.simulation.tests.test_authoring_assistant_proposals import _union_params
from apps.simulation.tests.test_generation_service import (
    DESCRIPCION, _config, con_escenas, docente, leer,
)


@pytest.fixture
def datos():
    ctx = context.del_lugar(lugares.cargar_lugar("universidad", por_piezas=True), [])
    # Las competencias del esqueleto no se validan hasta la escena.
    sk = checks.validate_skeleton(leer("esqueleto.json"), ctx)
    return ctx, sk


def test_contexto_resume_una_vez_catalogo_y_puertas():
    lugar = lugares.cargar_lugar("universidad", por_piezas=True)
    ctx = context.del_lugar(lugar, [])
    assert ctx["catalogoPiezas"]["anchos"] == list(geometria.ANCHOS)
    assert ctx["catalogoPiezas"]["piezas"]
    assert set(ctx["catalogoPiezas"]["piezas"][0]) == {"tipo", "modelo", "ocupa", "muros", "franja"}
    for sala in ctx["salas"]:
        assert "estructura" in sala and "puertas" in sala and "catalogoPiezas" not in sala
        assert all(set(p) == {"id", "muro", "pos", "modelo"} for p in sala["puertas"])
    fija = copy.deepcopy(lugar)
    fija["salas"][0].pop("estructura")
    sala_fija = context.del_lugar(fija, [])["salas"][0]
    assert "estructura" not in sala_fija and "puertas" not in sala_fija


def test_la_instruccion_nombra_cada_regla_de_sala():
    texto = prompts.SYSTEM_GENERATE
    for valor in [*(f"OCL-{n}" for n in range(13, 19)), *map(str, geometria.ANCHOS),
                  *map(str, (rules_estructura.REJILLA, rules_estructura.RADIO_PUERTA,
                             rules_estructura.RADIO_PERSONA, rules_estructura.RADIO_OBJETO))]:
        assert valor in texto


def test_el_esquema_de_escena_no_suma_uniones():
    assert schema.SCENE["properties"]["estructura"] == {"type": "string"}
    assert _union_params(schema.SCENE) == 0


def _rechaza(datos, estructura, sala="aula"):
    ctx, sk = datos
    escena = leer(f"escena-{sala}.json")
    escena["estructura"] = estructura
    with pytest.raises(checks.GenerationInvalid) as error:
        checks.validate_scene(escena, sk, sala, ctx)
    assert error.value.motivos and all(checks.is_fixed_motivo(m) for m in error.value.motivos)
    return error.value.motivos


def test_checks_rechaza_estructura_que_no_es_json(datos):
    assert checks.STRUCTURE_FORM in _rechaza(datos, "no es json")


def test_checks_rechaza_ids_repetidos(datos):
    estructura = copy.deepcopy(next(s for s in datos[0]["salas"] if s["id"] == "aula")["estructura"])
    estructura["piezas"][1]["id"] = estructura["piezas"][0]["id"]
    assert checks.STRUCTURE_FORM in _rechaza(datos, json.dumps(estructura))


def test_checks_rechaza_estructura_que_cambia_el_ancho(datos):
    estructura = copy.deepcopy(next(s for s in datos[0]["salas"] if s["id"] == "aula")["estructura"])
    estructura["ancho"] = 1200
    assert checks.STRUCTURE_FIXED in _rechaza(datos, json.dumps(estructura))


def test_checks_rechaza_estructura_en_sala_de_imagen_fija(datos):
    sala = next(s for s in datos[0]["salas"] if s["id"] == "aula")
    estructura = sala.pop("estructura")
    assert checks.STRUCTURE_FIXED in _rechaza(datos, json.dumps(estructura))


@pytest.mark.parametrize("campo", ["propios", "tapetes", "exterior"])
def test_checks_rechaza_campos_fijos_cambiados(datos, campo):
    estructura = copy.deepcopy(next(s for s in datos[0]["salas"] if s["id"] == "aula")["estructura"])
    estructura[campo] = True if campo == "exterior" else []
    assert checks.STRUCTURE_FIXED in _rechaza(datos, json.dumps(estructura))


def test_generar_universidad_con_falso_importa_la_sala_reacomodada(db, docente):
    gid, _ = con_escenas(docente)
    final = service.run_assemble(docente, gid)
    assert final["status"] == "imported"
    mapa = SceneMap.objects.get(case_version_id=final["caseVersionId"], node__node_key="bienestar")
    assert mapa.structure == json.loads(leer("escena-bienestar.json")["estructura"])


def test_sala_encimada_pasa_por_reparacion_y_termina_importada(db, docente):
    gid, _ = con_escenas(docente, DESCRIPCION + " [falso:sala-encimada]")
    intermedio = service.run_assemble(docente, gid)
    assert intermedio["status"] == "needs_repair"
    assert any(i["code"] == "DSL.OCL-14" for i in intermedio["repair"]["issues"]["aula"])
    service.run_scene(docente, gid, "aula", repair=True)
    final = service.run_assemble(docente, gid)
    assert final["status"] == "imported" and final["caseVersionId"]
    assert not any(i["code"] == "DSL.OCL-14" for i in final["issues"])
