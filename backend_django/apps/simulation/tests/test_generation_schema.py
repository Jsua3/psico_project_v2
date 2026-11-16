"""C1 · Tarea 1 · Esquemas, contexto e instrucciones de la generación por etapas.

Piezas puras: ningún proveedor ni red. Se prueba que (1) los dos esquemas caben en lo que admite la API de Anthropic
(objetos cerrados, todo obligatorio, sin uniones ni límites numéricos), (2) las claves del contexto son las que crea
``copiar_al_caso``, (3) el texto del asistente por partes no cambió al sacar ``CONTENT_RULES`` y (4) el bloque del lugar
es idéntico en las dos etapas y lleva la marca de caché.
"""
import hashlib
import json

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.biblioteca.services import copiar_al_caso, lugares
from apps.simulation.casedef import vocabulary
from apps.simulation.models import CaseVersion, MapObject
from apps.simulation.services.authoring.assistant import prompts as assistant_prompts
from apps.simulation.services.authoring.generation import context, prompts, schema
from apps.simulation.tests.test_authoring_assistant_proposals import _union_params

User = get_user_model()

#: sha256 de ``SYSTEM_AUTHORING`` capturada antes de sacar ``CONTENT_RULES`` a una constante.
HUELLA_ANTES = "30bafdd6d81e8d3da9eccdb10d9253932d7c3be2929f51ea5b8dc4d47c856b77"

ESQUELETO_MINIMO = {
    "titulo": "Caso", "contexto": "Contexto", "objetivosAprendizaje": ["Objetivo"],
    "escenas": [{"sala": "x", "titulo": "T", "objetivo": "O", "persona": "p", "intensidad": "LOW",
                 "advertencia": "", "final": False, "siguientes": []}],
    "hitos": [], "finales": [],
}


def recorrer(nodo):
    resultado = [nodo]
    if isinstance(nodo, dict):
        for interno in nodo.values():
            resultado += recorrer(interno)
    elif isinstance(nodo, list):
        for interno in nodo:
            resultado += recorrer(interno)
    return resultado


def borrador_vacio(lugar_id):
    """Un borrador ya con todas las salas del lugar copiadas (por el mismo camino que usa el editor)."""
    profesor = User.objects.create_user(email="gen_prof@x.com", password="pass1234", nombre="N", apellido="A", role="PROFESOR")
    cliente = APIClient()
    cliente.force_authenticate(user=profesor)
    lugar = lugares.cargar_lugar(lugar_id)
    respuesta = cliente.post(
        "/api/authoring/cases",
        {"title": "Generado", "lugarId": lugar_id, "salas": [s["id"] for s in lugar["salas"]]},
        format="json",
    )
    assert respuesta.status_code == 200, respuesta.data
    return CaseVersion.objects.get(pk=respuesta.data["data"]["caseVersionId"])


def test_los_dos_esquemas_caben_en_el_tope_de_uniones():
    assert _union_params(schema.SKELETON) <= 13 and _union_params(schema.SCENE) <= 13
    assert _union_params(schema.SKELETON) == 0 and _union_params(schema.SCENE) == 0


def test_todo_objeto_es_cerrado_y_con_todo_obligatorio():
    for nodo in recorrer(schema.SKELETON) + recorrer(schema.SCENE):
        if isinstance(nodo, dict) and nodo.get("type") == "object":
            assert nodo["additionalProperties"] is False and set(nodo["required"]) == set(nodo["properties"])


def test_sin_restricciones_que_la_api_no_admite():
    texto = json.dumps([schema.SKELETON, schema.SCENE])
    for prohibida in ("minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "anyOf", "$ref"):
        assert f'"{prohibida}"' not in texto


def test_los_esquemas_usan_los_vocabularios_cerrados():
    escena = schema.SCENE["properties"]
    assert escena["lineas"]["items"]["properties"]["emocion"]["enum"] == list(vocabulary.EXPRESSIONS)
    opcion = escena["opciones"]["items"]["properties"]
    assert opcion["clase"]["enum"] == [m.value for m in vocabulary.ResponseClass]
    assert opcion["efectoVinculo"] == {"type": "integer", "enum": [-1, 0, 1]}
    assert opcion["efectoActivacion"] == {"type": "integer", "enum": [-1, 0, 1]}
    assert opcion["reaccionEmocion"]["enum"] == ["", *vocabulary.EXPRESSIONS]
    assert opcion["reaccionGesto"]["enum"] == ["", *vocabulary.GESTURES]
    comentario = escena["comentarios"]["items"]["properties"]
    assert comentario["emocion"]["enum"] == ["", *vocabulary.EXPRESSIONS]
    assert comentario["gesto"]["enum"] == ["", *vocabulary.GESTURES]
    esqueleto = schema.SKELETON["properties"]
    assert esqueleto["escenas"]["items"]["properties"]["intensidad"]["enum"] == ["LOW", "MEDIUM", "HIGH"]
    assert esqueleto["finales"]["items"]["properties"]["tono"]["enum"] == ["critical", "positive", "warning", "neutral"]


def test_los_topes_son_los_del_plan():
    assert (schema.MIN_SCENES, schema.MAX_SCENES) == (4, 6)
    assert (schema.MIN_OPTIONS, schema.MAX_OPTIONS) == (3, 4)
    assert (schema.MAX_COMMENTS, schema.MAX_HINTS, schema.MAX_LINES) == (6, 3, 8)


@pytest.mark.parametrize("lugar_id", ["universidad", "casa", "comisaria"])  # los del índice de la biblioteca
def test_las_claves_del_contexto_son_las_que_crea_la_copia(lugar_id, db):
    lugar = lugares.cargar_lugar(lugar_id)
    version = borrador_vacio(lugar_id)
    ctx = context.del_lugar(lugar, [])
    assert [s["id"] for s in ctx["salas"]] == [s["id"] for s in lugar["salas"]]
    for sala in ctx["salas"]:
        en_base = set(
            MapObject.objects.filter(scene_map__node__node_key=sala["id"], scene_map__case_version=version)
            .values_list("object_key", flat=True)
        )
        assert {p["clave"] for p in sala["personas"]} | {o["clave"] for o in sala["objetos"]} <= en_base
        assert all(p["personaje"] and p["nombre"] for p in sala["personas"])


def test_claves_de_sala_reproduce_el_orden_de_la_copia():
    sala = {
        "muebles": [{"ref": "banca"}, {"ref": "banca"}],
        "objetos": [{"ref": "banca"}, {"ref": "folleto"}],
        "personajes": [{"ref": "vigilante"}, {"ref": "vigilante"}],
        "puertas": [{"id": "puerta-a"}],
    }
    assert copiar_al_caso.claves_de_sala(sala) == {
        "muebles": ["banca", "banca-2"],
        "objetos": ["banca-3", "folleto"],
        "personajes": ["vigilante", "vigilante-2"],
        "puertas": ["puerta-a"],
    }


def test_el_contexto_trae_hitos_con_clave_del_modelo_de_reglas_y_competencias():
    lugar = lugares.cargar_lugar("universidad")
    ctx = context.del_lugar(lugar, [{"codigo": "CONTENCION", "nombre": "Contención"}])
    assert ctx["lugar"]["id"] == "universidad"
    assert ctx["hitos"] and all("-" not in h["clave"] for h in ctx["hitos"])
    assert ctx["hitos"][0]["clave"] == copiar_al_caso.clave_de_hito(lugar["hitos"][0]["key"])
    assert ctx["competencias"] == [{"codigo": "CONTENCION", "nombre": "Contención"}]
    assert set(ctx["listas"]) == {"clases", "emociones", "gestos", "intensidades", "tonos"}


def test_el_texto_del_asistente_no_cambia():
    assert assistant_prompts.CONTENT_RULES in assistant_prompts.SYSTEM_AUTHORING
    assert hashlib.sha256(assistant_prompts.SYSTEM_AUTHORING.encode()).hexdigest() == HUELLA_ANTES


def test_el_contexto_va_primero_con_cache_y_es_identico_entre_etapas():
    ctx = context.del_lugar(lugares.cargar_lugar("universidad"), [])
    a = prompts.skeleton_messages(ctx, "descripción")
    b = prompts.scene_messages(ctx, ESQUELETO_MINIMO, "x")
    assert a[0]["role"] == "user" and b[0]["role"] == "user"
    assert a[0]["content"][0] == b[0]["content"][0]
    assert a[0]["content"][0]["cache_control"] == {"type": "ephemeral"}
    assert a[0]["content"][1]["text"].startswith("Etapa: esqueleto\nLugar: universidad")
    assert b[0]["content"][1]["text"].startswith("Etapa: escena x\nLugar: universidad")


def test_la_descripcion_se_recorta_y_la_reparacion_lleva_la_escena_anterior_y_las_faltas():
    ctx = context.del_lugar(lugares.cargar_lugar("universidad"), [])
    largo = prompts.skeleton_messages(ctx, "a" * 5000)[0]["content"][1]["text"]
    assert "a" * 2000 in largo and "a" * 2001 not in largo
    reparar = {"anterior": {"narracion": "ESCENA_ANTERIOR"}, "faltas": ["Falta fija uno.", "Falta fija dos."]}
    texto = prompts.scene_messages(ctx, ESQUELETO_MINIMO, "x", reparar)[0]["content"][1]["text"]
    assert "ESCENA_ANTERIOR" in texto and "Falta fija uno." in texto and "Falta fija dos." in texto
    sin = prompts.scene_messages(ctx, ESQUELETO_MINIMO, "x")[0]["content"][1]["text"]
    assert "ESCENA_ANTERIOR" not in sin


def test_el_sistema_es_fijo_y_trae_las_reglas_de_contenido():
    assert assistant_prompts.CONTENT_RULES in prompts.SYSTEM_GENERATE
    assert "DEBES" not in prompts.SYSTEM_GENERATE and "MUST" not in prompts.SYSTEM_GENERATE


def test_el_contexto_serializado_es_estable():
    lugar = lugares.cargar_lugar("universidad")
    a = prompts.skeleton_messages(context.del_lugar(lugar, []), "d")[0]["content"][0]["text"]
    b = prompts.skeleton_messages(context.del_lugar(lugares.cargar_lugar("universidad"), []), "otra")[0]["content"][0]["text"]
    assert a == b


def test_el_sistema_dice_cada_regla_que_python_revisa_del_recorrido_y_de_los_finales():
    texto = " ".join(prompts.SYSTEM_GENERATE.split())
    for frase in (
        "al menos una escena con dos caminos",
        "una o dos escenas siguientes",
        "nunca vuelve sobre una escena ya vista",
        "se alcanza desde la primera",
        "al menos una escena final",
        "sin escenas siguientes y sin respuestas",
        "el último final es el final por defecto",
        "solo hitos, conteos o la persona",
        "nunca talked ni inspected",
        "es el destino de alguna respuesta",
    ):
        assert frase in texto, frase
