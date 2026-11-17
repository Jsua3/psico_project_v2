"""C1 · Tarea 5 · Ensamblado del caso generado (``generation/assembly.py``), importación y marcas de la IA.

Se arma con las respuestas del proveedor falso (el lugar ``universidad``: ``aula`` → ``bienestar``/``sala-espera`` →
``consultorio``) pasadas por ``checks``. Todo corre contra la base de datos de prueba, sin red. Se vigila sobre todo que
``failed`` y ``needs_repair`` no dejen **ninguna** fila (casos, versiones, nodos, mapas, objetos, rúbricas).
"""
import dataclasses
import json

import pytest
from django.contrib.auth import get_user_model

from apps.biblioteca.services import lugares
from apps.simulation.casedef import report
from apps.simulation.casedef.export import to_document
from apps.simulation.casedef.report import Issue
from apps.simulation.casedef.validate import validate_document
from apps.simulation.models import (
    CaseCharacter,
    CaseGeneration,
    CaseVersion,
    ClinicalTool,
    DecisionOption,
    DialogueChoice,
    DialogueLine,
    DialogueTree,
    MapObject,
    Rubric,
    RubricCriterion,
    SceneMap,
    SimulationCase,
    SimulationNode,
)
from apps.simulation.services import case_rules, rubric_service
from apps.simulation.services.ai_providers import FAKE_FIXTURES
from apps.simulation.services.authoring import importing
from apps.simulation.services.authoring.generation import assembly, checks, context, lifecycle
from shared.exceptions import ApiError

User = get_user_model()
CARPETA = FAKE_FIXTURES / "universidad"
SALAS = ["aula", "bienestar", "sala-espera", "consultorio"]
COMPETENCIAS = [
    {"codigo": codigo, "nombre": codigo.title()}
    for codigo in ("PAP", "COMUNICACION_EMPATIA", "DECISION_RUTA", "COMPRENSION_SITUACION", "REFLEXION")
]
TABLAS = (
    SimulationCase, CaseVersion, SimulationNode, SceneMap, MapObject, DecisionOption, DialogueTree, DialogueLine,
    DialogueChoice, CaseCharacter, ClinicalTool, Rubric, RubricCriterion,
)


def leer(nombre):
    return json.loads((CARPETA / nombre).read_text(encoding="utf-8"))


_CTX = None


def _contexto():
    global _CTX
    if _CTX is None:
        _CTX = context.del_lugar(lugares.cargar_lugar("universidad", por_piezas=True), COMPETENCIAS)
    return _CTX


def _esqueleto():
    return checks.validate_skeleton(leer("esqueleto.json"), _contexto())


def _escenas(**cambios):
    sk = _esqueleto()
    return {
        sala: checks.validate_scene(leer(cambios.get(sala, f"escena-{sala}.json")), sk, sala, _contexto())
        for sala in SALAS
    }


def contar_filas():
    return {tabla.__name__: tabla.objects.count() for tabla in TABLAS}


@pytest.fixture
def docente(db):
    return User.objects.create_user(email="gen_doc@x.com", password="pass1234", nombre="N", apellido="A", role="PROFESOR")


@pytest.fixture
def rubrica(db, docente):
    """La rúbrica por defecto del sistema: de ahí sale la que lleva cada borrador generado."""
    admin = User.objects.create_user(email="gen_admin@x.com", password="pass1234", nombre="N", apellido="A", role="ADMIN")
    rubric_service.seed_default_rubric(admin)


@pytest.fixture
def base(rubrica, docente):
    return assembly.base_definition("universidad", _esqueleto(), docente)


def generacion(docente, escenas=None, rondas=0):
    sk = _esqueleto()
    escenas = escenas or _escenas()
    return CaseGeneration.objects.create(
        owner=docente, lugar_id="universidad", description="x" * 60, status="scenes_ready",
        skeleton_json=json.dumps(checks.as_json(sk), ensure_ascii=False),
        scenes_json=json.dumps(
            {k: {"state": "done", "data": checks.as_json(v), "error": None, "started_at": None} for k, v in escenas.items()},
            ensure_ascii=False,
        ),
        repair_rounds=rondas,
    )


def total_a_marcar(sk, escenas):
    return (
        len(sk.escenas)
        + sum(len(e.opciones) for e in escenas.values())
        + sum(len(e.lineas) for e in escenas.values())
        + len(sk.escenas)  # una persona a atender por sala
        + len(sk.finales)
    )


def marcadas(version):
    reglas = case_rules.rules_of(version)
    return (
        SimulationNode.objects.filter(case_version=version, ai_suggested=True).count()
        + DecisionOption.objects.filter(case_version=version, ai_suggested=True).count()
        + DialogueLine.objects.filter(dialogue_tree__scene_map__case_version=version, ai_suggested=True).count()
        + MapObject.objects.filter(scene_map__case_version=version, ai_suggested=True).count()
        + sum(1 for final in reglas.endings if final.get("aiSuggested"))
    )


# --- Base y armado ---------------------------------------------------------------------------------------------------


def test_base_definition_no_deja_filas(rubrica, docente):
    antes = contar_filas()
    definicion = assembly.base_definition("universidad", _esqueleto(), docente)
    assert contar_filas() == antes
    assert [s.key for s in definicion.scenes] == SALAS


def test_build_con_el_proveedor_falso_da_un_documento_2_2_valido(base):
    doc = to_document(assembly.build(base, _esqueleto(), _escenas()))
    assert doc["x-siep"]["version"] == "2.2"
    assert [i for i in validate_document(doc) if i.severity == "error"] == []


def test_una_sala_por_escena_y_la_primera_es_el_inicio(base):
    sk = _esqueleto()
    definicion = assembly.build(base, sk, _escenas())
    assert [s.key for s in definicion.scenes] == [e.sala for e in sk.escenas]
    assert [s.start for s in definicion.scenes] == [True, False, False, False]
    assert [s.terminal for s in definicion.scenes] == [e.final for e in sk.escenas]
    assert all(s.world is not None for s in definicion.scenes)
    assert [s.sensitive for s in definicion.scenes] == [e.intensidad == "HIGH" for e in sk.escenas]
    assert definicion.scenes[2].warning == sk.escenas[2].advertencia
    assert definicion.rules["endings"] == list(sk.finales)
    assert {m["key"] for m in definicion.rules["milestones"]} == set(sk.hitos)


def test_las_opciones_cuelgan_del_guion_de_la_persona_a_atender(base):
    sk = _esqueleto()
    escenas = _escenas()
    definicion = assembly.build(base, sk, escenas)
    for outline, scene in zip(sk.escenas, definicion.scenes):
        arboles = [t for t in scene.world.dialogues if t.key == f"guion-{outline.sala}"]
        assert len(arboles) == 1
        arbol = arboles[0]
        assert arbol.object_key == outline.persona
        persona = next(o for o in scene.world.objects if o.key == outline.persona)
        assert persona.metadata["personaClave"] is True
        assert [l.text for l in arbol.lines] == [l["texto"] for l in escenas[outline.sala].lineas]
        assert [c.option for c in arbol.choices] == [f"{outline.sala}-{o['clave']}" for o in escenas[outline.sala].opciones]
        assert [o.key for o in scene.options] == [c.option for c in arbol.choices]
        assert all(o.target in SALAS for o in scene.options)


def test_las_opciones_llevan_efectos_y_reaccion_sin_claves_vacias(base):
    definicion = assembly.build(base, _esqueleto(), _escenas())
    aula = definicion.scenes[0]
    primera = aula.options[0]
    assert primera.key == "aula-escuchar-y-acompanar"
    assert primera.target == "bienestar"
    assert primera.effects == {
        "persona": {"bond": 1, "activation": -1}, "milestones": ["aplicar_primeros_auxilios_psicologicos"],
        "competencies": ["PAP", "COMUNICACION_EMPATIA"],
    }
    assert primera.reaction == {"linea": "Gracias... Sí, creo que puedo ir si vas conmigo.", "emocion": "triste", "gesto": "asiente"}
    assert primera.requires == {}
    assert aula.options[1].requires == {"talked": "docente"}
    sin_hitos = aula.options[2]
    assert "milestones" not in sin_hitos.effects and "persona" not in sin_hitos.effects
    assert primera.immediate_feedback == primera.feedback_text


# --- Ensamblado y marcas ---------------------------------------------------------------------------------------------


def test_assemble_importa_y_marca_todo_lo_sugerido(rubrica, docente):
    sk, escenas = _esqueleto(), _escenas()
    r = assembly.assemble(generacion(docente, escenas), docente)
    assert r.result == "imported" and r.case_version_id
    version = CaseVersion.objects.get(pk=r.case_version_id)
    mapas = SceneMap.objects.filter(case_version=version)
    assert mapas.count() == len(SALAS) and all(mapa.structure for mapa in mapas)
    assert version.status == "DRAFT" and version.simulation_case.created_by_id == docente.id
    assert marcadas(version) == total_a_marcar(sk, escenas)
    assert r.document["x-siep"]["version"] == "2.2"


def test_mark_ai_suggested_devuelve_cuantas_partes_marco(rubrica, docente):
    sk, escenas = _esqueleto(), _escenas()
    base_ = assembly.base_definition("universidad", sk, docente)
    documento = to_document(assembly.build(base_, sk, escenas))
    version_id = importing.import_document(documento, docente)["caseVersionId"]
    contador = assembly.mark_ai_suggested(version_id, {e.sala: e.persona for e in sk.escenas})
    assert contador == total_a_marcar(sk, escenas)
    assert assembly.mark_ai_suggested(version_id, {e.sala: e.persona for e in sk.escenas}) == contador


def test_el_borrador_trae_rubrica_con_competencias(rubrica, docente):
    r = assembly.assemble(generacion(docente), docente)
    version = CaseVersion.objects.get(pk=r.case_version_id)
    propias = Rubric.objects.filter(case_version=version)
    assert propias.count() == 1 and propias[0].active
    criterios = RubricCriterion.objects.filter(rubric=propias[0])
    assert criterios.count() == RubricCriterion.objects.filter(rubric__is_default=True, rubric__case_version=None).count()
    assert {c.competency_ref.code for c in criterios} >= {c["codigo"] for c in COMPETENCIAS}
    assert Rubric.objects.get(is_default=True).case_version_id is None


def test_con_falta_de_ocl_y_rondas_libres_pide_reparar_y_no_crea_nada(rubrica, docente):
    """La variante de reparación de ``aula`` lleva un enlace ``file:`` en la narración: falta editorial (``DSL.TEXT_LINK``)."""
    gen = generacion(docente, _escenas(aula="escena-aula.reparar.json"))
    antes = contar_filas()
    r = assembly.assemble(gen, docente)
    assert r.result == "needs_repair" and r.case_version_id is None
    assert list(r.by_scene) == ["aula"]
    assert [i["code"] for i in r.by_scene["aula"]] == ["DSL.TEXT_LINK"]
    assert r.by_scene["aula"][0]["path"] == "escenas[0].descripcion"
    assert all(assembly.is_editorial(i) for i in r.by_scene["aula"])
    assert contar_filas() == antes


def test_con_falta_de_ocl_sin_rondas_importa_con_la_falta(rubrica, docente):
    gen = generacion(docente, _escenas(aula="escena-aula.reparar.json"), rondas=lifecycle.MAX_REPAIR_ROUNDS)
    r = assembly.assemble(gen, docente)
    assert r.result == "imported" and r.case_version_id
    assert [i["code"] for i in r.issues] == ["DSL.TEXT_LINK"]
    assert CaseVersion.objects.filter(pk=r.case_version_id).exists()


def _con_issues(monkeypatch, *issues):
    """El validador del documento devuelve estas faltas además de las que de verdad encuentre."""
    real = assembly.validate_document
    monkeypatch.setattr(assembly, "validate_document", lambda doc: [*real(doc), *issues])


def test_con_error_de_forma_sin_rondas_falla_y_no_crea_nada(rubrica, docente, monkeypatch):
    _con_issues(monkeypatch, Issue("DSL.FORMA", report.ERROR, "escenas[1].titulo", "forma"))
    gen = generacion(docente, rondas=lifecycle.MAX_REPAIR_ROUNDS)
    antes = contar_filas()
    r = assembly.assemble(gen, docente)
    assert r.result == "failed" and r.case_version_id is None
    assert [i["code"] for i in r.issues] == ["DSL.FORMA"]
    assert r.document["x-siep"]["version"] == "2.2"
    assert contar_filas() == antes


def test_con_error_de_forma_atribuible_y_rondas_libres_pide_reparar(rubrica, docente, monkeypatch):
    _con_issues(monkeypatch, Issue("DSL.FORMA", report.ERROR, "x-siep.escenas[1].mapa", "forma"))
    antes = contar_filas()
    r = assembly.assemble(generacion(docente), docente)
    assert r.result == "needs_repair" and list(r.by_scene) == ["bienestar"]
    assert contar_filas() == antes


def test_error_no_atribuible_a_una_escena_falla_sin_pedir_reparar(rubrica, docente, monkeypatch):
    _con_issues(monkeypatch, Issue("DSL.FORMA", report.ERROR, "caso.titulo", "forma"))
    antes = contar_filas()
    r = assembly.assemble(generacion(docente), docente)  # quedan rondas, pero reparar escenas no lo arregla
    assert r.result == "failed" and r.by_scene == {}
    assert contar_filas() == antes


def test_falta_editorial_no_atribuible_importa_con_la_falta(rubrica, docente, monkeypatch):
    _con_issues(monkeypatch, Issue("DSL.OCL-03", report.ERROR, "caso", "ocl"))
    r = assembly.assemble(generacion(docente), docente)
    assert r.result == "imported" and [i["code"] for i in r.issues] == ["DSL.OCL-03"]


def test_si_otro_import_tomo_el_codigo_assemble_repite_una_vez(rubrica, docente, monkeypatch):
    real = importing.import_document
    llamadas = []

    def tomado(document, actor, **kw):
        llamadas.append(document["caso"]["id"])
        if len(llamadas) == 1:
            raise ApiError("CASE_VERSION_EXISTS", "tomado", 409)
        return real(document, actor, **kw)

    monkeypatch.setattr(assembly.importing, "import_document", tomado)
    r = assembly.assemble(generacion(docente), docente)
    assert r.result == "imported" and len(llamadas) == 2


# --- importing.import_document ---------------------------------------------------------------------------------------


def test_import_document_sin_el_parametro_sigue_rechazando_faltas_de_ocl(rubrica, docente):
    sk = _esqueleto()
    documento = to_document(assembly.build(
        assembly.base_definition("universidad", sk, docente), sk, _escenas(aula="escena-aula.reparar.json"),
    ))
    antes = contar_filas()
    with pytest.raises(ApiError) as rechazo:
        importing.import_document(documento, docente)
    assert rechazo.value.api_code == "DSL_INVALID"
    assert contar_filas() == antes
    # Con el parámetro, la misma falta editorial no bloquea; las demás siguen bloqueando igual.
    assert importing.import_document(documento, docente, allow_rule_faults=True)["caseVersionId"]


def test_allow_rule_faults_sigue_bloqueando_lo_que_no_es_editorial(rubrica, docente, monkeypatch):
    sk = _esqueleto()
    documento = to_document(assembly.build(assembly.base_definition("universidad", sk, docente), sk, _escenas()))
    documento["ejecucion"] = {}
    with pytest.raises(ApiError) as rechazo:
        importing.import_document(documento, docente, allow_rule_faults=True)
    assert rechazo.value.api_code == "DSL_INVALID"


def test_is_editorial():
    assert assembly.EDITORIAL_PREFIXES == ("DSL.OCL-", "DSL.PROP-", "DSL.TEXT_")
    assert assembly.is_editorial(Issue("DSL.OCL-02", report.ERROR, "", ""))
    assert assembly.is_editorial({"code": "DSL.PROP-04"})
    assert assembly.is_editorial({"code": "DSL.TEXT_MARKUP"})
    assert not assembly.is_editorial(Issue("DSL.FORMA", report.ERROR, "", ""))
    assert not assembly.is_editorial(Issue("DSL.SIEP_REF", report.ERROR, "", ""))
    assert dataclasses.is_dataclass(assembly.AssembleResult)


def test_la_constante_editorial_es_la_de_importing():
    assert assembly.EDITORIAL_PREFIXES is importing.RULE_FAULT_PREFIXES
