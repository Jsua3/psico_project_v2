"""C1 · Tarea 4 · Python revisa el esqueleto y cada escena que escribe el modelo (``generation/checks.py``).

Piezas puras: sin proveedor, sin red y sin base de datos. Las respuestas buenas son las del proveedor falso; cada caso malo
parte de una de ellas y rompe una sola regla. Se vigila además que los motivos sean fijos (nunca citan al modelo), que se
junten todos de una vez y que los borradores hagan ida y vuelta por JSON.
"""
import copy
import json

import pytest

from apps.biblioteca.services import lugares
from apps.simulation.services.ai_providers import FAKE_FIXTURES
from apps.simulation.services.authoring.assistant import prompts as assistant_prompts
from apps.simulation.services.authoring.generation import checks, context
from apps.simulation.services.authoring.generation.checks import GenerationInvalid, SceneDraft, SkeletonDraft

CARPETA = FAKE_FIXTURES / "universidad"
SALAS = ["aula", "bienestar", "sala-espera", "consultorio"]
COMPETENCIAS = [
    {"codigo": codigo, "nombre": codigo.title()}
    for codigo in ("PAP", "COMUNICACION_EMPATIA", "DECISION_RUTA", "COMPRENSION_SITUACION", "REFLEXION")
]
HOSTIL = "ZZ-TEXTO-DEL-MODELO-ZZ"


def leer(nombre):
    return json.loads((CARPETA / nombre).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def ctx():
    return context.del_lugar(lugares.cargar_lugar("universidad"), COMPETENCIAS)


@pytest.fixture
def esqueleto():
    return leer("esqueleto.json")


@pytest.fixture
def sk(esqueleto, ctx):
    return checks.validate_skeleton(esqueleto, ctx)


@pytest.fixture
def aula():
    return leer("escena-aula.json")


def motivos_de(llamada):
    with pytest.raises(GenerationInvalid) as excepcion:
        llamada()
    return excepcion.value


# --- Lo bueno ------------------------------------------------------------------------------------------------------


def test_el_esqueleto_del_proveedor_falso_es_valido(ctx):
    borrador = checks.validate_skeleton(leer("esqueleto.json"), ctx)
    assert isinstance(borrador, SkeletonDraft)
    assert [e.sala for e in borrador.escenas] == SALAS
    assert borrador.finales[-1].get("when") is None and isinstance(borrador.finales[0]["when"], dict)


@pytest.mark.parametrize("sala", SALAS)
def test_cada_escena_del_proveedor_falso_es_valida(sala, sk, ctx):
    borrador = checks.validate_scene(leer(f"escena-{sala}.json"), sk, sala, ctx)
    assert isinstance(borrador, SceneDraft)
    assert bool(borrador.opciones) == (not next(e for e in sk.escenas if e.sala == sala).final)


def test_la_variante_de_reparacion_del_falso_tambien_pasa_las_revisiones_de_python(sk, ctx):
    assert checks.validate_scene(leer("escena-aula.reparar.json"), sk, "aula", ctx)


def test_los_comentarios_quitan_las_claves_vacias_y_traen_cuando_como_dict(sk, ctx, aula):
    borrador = checks.validate_scene(aula, sk, "aula", ctx)
    assert borrador.comentarios[0] == {
        "personaje": "docente", "linea": aula["comentarios"][0]["linea"], "emocion": "preocupada",
    }
    assert borrador.comentarios[1]["cuando"] == {"inspected": "mochila"}
    assert borrador.opciones[1]["requiere"] == {"talked": "docente"}
    assert borrador.opciones[0]["requiere"] == {}


# --- Esqueleto malo ------------------------------------------------------------------------------------------------


def sala_repetida(e):
    e["escenas"][1]["sala"] = "aula"


def sala_inexistente(e):
    e["escenas"][0]["sala"] = "sala-inventada"


def sin_bifurcacion(e):
    e["escenas"][0]["siguientes"] = ["bienestar"]


def ciclo(e):
    e["escenas"][3].update(final=False, siguientes=["aula"])


def sin_final(e):
    e["escenas"][3]["final"] = False


def hito_inventado(e):
    e["hitos"].append("hito_que_no_existe")


def final_por_defecto_con_condicion(e):
    e["finales"][-1]["cuando"] = json.dumps({"milestone": "valorar_el_riesgo"})


def inalcanzable(e):
    e["escenas"][0]["siguientes"] = ["bienestar", "consultorio"]
    e["escenas"][1]["siguientes"] = ["consultorio"]


def final_con_hecho(e):
    e["finales"][0]["cuando"] = json.dumps({"talked": "docente"})


@pytest.mark.parametrize("cambio, motivo", [
    (sala_repetida, "Dos escenas ocupan la misma sala."),
    (sala_inexistente, "La escena «1» está en una sala que el lugar no tiene."),
    (sin_bifurcacion, "El recorrido necesita al menos una escena con dos caminos."),
    (ciclo, "El recorrido vuelve sobre una escena ya vista."),
    (sin_final, "El recorrido necesita al menos una escena final."),
    (hito_inventado, "El esqueleto usa un hito que el lugar no tiene."),
    (final_por_defecto_con_condicion, "El último final debe ser el final por defecto, sin condición."),
    (final_con_hecho, "La condición de un final solo puede usar hitos, conteos o la persona."),
])
def test_esqueleto_invalido(cambio, motivo, esqueleto, ctx):
    cambio(esqueleto)
    error = motivos_de(lambda: checks.validate_skeleton(esqueleto, ctx))
    assert motivo in error.motivos
    assert error.escena is None


def test_esqueleto_con_otras_reglas_rotas(esqueleto, ctx):
    esqueleto["escenas"] = esqueleto["escenas"][:3]
    assert "El caso necesita de 4 a 6 escenas." in motivos_de(lambda: checks.validate_skeleton(esqueleto, ctx)).motivos


@pytest.mark.parametrize("cambio, motivo", [
    (lambda e: e["escenas"][0].update(persona="enfermera"), "La escena «1» atiende a alguien que no está en su sala."),
    (lambda e: e["escenas"][2].update(advertencia=""), "Una escena de intensidad alta necesita su aviso."),
    (lambda e: e["escenas"][3].update(siguientes=["aula"]), "Una escena final no puede tener escenas siguientes."),
    (lambda e: e["escenas"][1].update(siguientes=[]), "Una escena que no es final sigue a una o dos escenas."),
    (lambda e: e["escenas"][1].update(siguientes=["nada"]), "Una escena sigue a otra que el esqueleto no tiene."),
    (lambda e: e["escenas"][0].update(siguientes=["bienestar", "bienestar"]), "Una escena repite el mismo camino."),
    (inalcanzable, "Una escena no se alcanza desde la primera."),
    (lambda e: e["hitos"].clear(), "El esqueleto necesita al menos un hito."),
    (lambda e: e["finales"].__setitem__(slice(None), e["finales"][-1:]), "El caso necesita de 2 a 4 finales."),
    (lambda e: e["finales"][0].update(clave="con espacio"), "La clave de un final no es válida o está repetida."),
    (lambda e: e["finales"][0].update(cuando=""), "Solo el último final puede quedar sin condición."),
    (lambda e: e["finales"][0].update(cuando=json.dumps({"milestone": "hito_raro"})),
     "La condición de un final nombra un hito que el esqueleto no usa."),
    (lambda e: e["finales"][0].update(cuando="no es json"), "La condición de un final solo puede usar hitos, conteos o la persona."),
    (lambda e: e.update(titulo="   "), "El texto «título» no puede quedar vacío."),
    (lambda e: e.update(contexto="<b>negrita</b>"), "El texto «contexto» debe ser texto plano, sin etiquetas ni enlaces."),
    (lambda e: e["objetivosAprendizaje"].append("x" * 300), "El texto «objetivo de aprendizaje» supera el largo permitido."),
    (lambda e: e["escenas"][0].update(objetivo="x" * 201), "El texto «objetivo de la escena» supera el largo permitido."),
    (lambda e: e["escenas"][0].update(intensidad="EXTREME"), "El campo «intensidad» trae un valor fuera de la lista permitida."),
    (lambda e: e["finales"][0].update(tono="rojo"), "El campo «tono» trae un valor fuera de la lista permitida."),
    (lambda e: e["escenas"][0].update(final="no"), "El campo «escenas» no tiene la forma esperada."),
    (lambda e: e["finales"][0].update(mensaje="la violo"), assistant_prompts.GRAPHIC_REASON),
])
def test_esqueleto_otras_reglas(cambio, motivo, esqueleto, ctx):
    cambio(esqueleto)
    assert motivo in motivos_de(lambda: checks.validate_skeleton(esqueleto, ctx)).motivos


@pytest.mark.parametrize("raw", [None, [], "texto", 7, {}, {"titulo": "solo"}])
def test_un_esqueleto_sin_la_forma_se_rechaza_sin_romper(raw, ctx):
    assert motivos_de(lambda: checks.validate_skeleton(raw, ctx)).motivos == ["El campo «esqueleto» no tiene la forma esperada."]


# --- Escena mala ---------------------------------------------------------------------------------------------------


def requiere_persona_de_otra_sala(s):
    s["opciones"][1]["requiere"] = json.dumps({"talked": "enfermera"})


def requiere_herramienta(s):
    s["opciones"][1]["requiere"] = json.dumps({"has": "PAP"})


def requiere_hito_no_declarado(s):
    s["opciones"][1]["requiere"] = json.dumps({"milestone": "hito_raro"})


def cuando_con_objeto_ajeno(s):
    s["comentarios"][1]["cuando"] = json.dumps({"inspected": "botiquin"})


def todas_con_requisito(s):
    for opcion in s["opciones"]:
        opcion["requiere"] = json.dumps({"talked": "docente"})


def sin_recomendada(s):
    for opcion in s["opciones"]:
        if opcion["clase"] == "RECOMMENDED":
            opcion["clase"] = "ACCEPTABLE"


def solo_recomendadas(s):
    for opcion in s["opciones"]:
        opcion.update(clase="RECOMMENDED", razonProhibicion="")


def destino_fuera_del_grafo(s):
    s["opciones"][0]["destino"] = "consultorio"


def camino_sin_respuesta(s):
    for opcion in s["opciones"]:
        opcion["destino"] = "bienestar"


def siete_comentarios(s):
    s["comentarios"] = [copy.deepcopy(s["comentarios"][0]) for _ in range(7)]


def texto_grafico(s):
    s["narracion"] += " Cuentan que la violo."


@pytest.mark.parametrize("cambio, motivo", [
    (requiere_persona_de_otra_sala, "Un requisito nombra a alguien que no está en la sala."),
    (requiere_herramienta, "Un requisito usa algo que no se puede conseguir en este caso."),
    (requiere_hito_no_declarado, "Un requisito usa un hito que el caso no declara."),
    (cuando_con_objeto_ajeno, "Un comentario depende de algo que no está en la sala."),
    (todas_con_requisito, "Toda decisión necesita al menos una respuesta sin requisito."),
    (sin_recomendada, "La escena necesita al menos una respuesta recomendada."),
    (solo_recomendadas, "La escena necesita al menos una respuesta que no sea la recomendada."),
    (destino_fuera_del_grafo, "Una respuesta lleva a una escena que no sigue a esta."),
    (camino_sin_respuesta, "Un camino del recorrido no tiene ninguna respuesta que lleve a él."),
    (siete_comentarios, "Una escena admite hasta 6 comentarios."),
    (texto_grafico, assistant_prompts.GRAPHIC_REASON),
])
def test_escena_invalida(cambio, motivo, aula, sk, ctx):
    cambio(aula)
    error = motivos_de(lambda: checks.validate_scene(aula, sk, "aula", ctx))
    assert motivo in error.motivos
    assert error.escena == "aula"


def cinco_opciones(s):
    extra = copy.deepcopy(s["opciones"][0])
    extra["clave"] = "otra-recomendada"
    s["opciones"].append(extra)


def test_mas_de_cuatro_respuestas_se_rechaza_aunque_haya_una_de_cada_clase(aula, sk, ctx):
    """El modelo real escribió 5 respuestas (una por clase y una segunda recomendada); el juego muestra cuatro (A–D)."""
    cinco_opciones(aula)
    assert "Una decisión admite hasta 4 respuestas." in motivos_de(lambda: checks.validate_scene(aula, sk, "aula", ctx)).motivos


def test_cuatro_respuestas_pasan_y_dos_no(aula, sk, ctx):
    assert len(checks.validate_scene(aula, sk, "aula", ctx).opciones) == 4
    aula["opciones"] = aula["opciones"][:2]
    assert "Una decisión necesita de 3 a 4 respuestas." in motivos_de(lambda: checks.validate_scene(aula, sk, "aula", ctx)).motivos


@pytest.mark.parametrize("cambio, motivo", [
    (lambda s: s["opciones"][3].update(razonProhibicion=""), "Una respuesta contraindicada necesita su razón."),
    (lambda s: s["opciones"][0].update(razonProhibicion="Una razón."), "Solo una respuesta contraindicada lleva razón de prohibición."),
    (lambda s: s["opciones"][1].update(clave=s["opciones"][0]["clave"]), "La clave de una respuesta no es válida o está repetida."),
    (lambda s: s["opciones"][1].update(clave="Con Espacios"), "La clave de una respuesta no es válida o está repetida."),
    (lambda s: s["opciones"][0].update(retroalimentacion=""), "El texto «retroalimentación» no puede quedar vacío."),
    (lambda s: s["opciones"][0].update(efectoVinculo=2), "El efecto de una respuesta sobre la persona debe ser -1, 0 o 1."),
    (lambda s: s["opciones"][0].update(efectoActivacion=True), "El efecto de una respuesta sobre la persona debe ser -1, 0 o 1."),
    (lambda s: s["opciones"][0].update(hitos=["hito_raro"]), "Una respuesta cumple un hito que el esqueleto no usa."),
    (lambda s: s["opciones"][0].update(competencias=["INVENTADA"]), "Una respuesta toca una competencia que la rúbrica no tiene."),
    (lambda s: s["opciones"][0].update(reaccionLinea="uno\ndos"), "El texto «reacción» debe ir en una sola línea."),
    (lambda s: s["opciones"][0].update(reaccionLinea="x" * 401), "El texto «reacción» supera el largo permitido."),
    (lambda s: s.update(lineas=[]), "Una escena lleva de 1 a 8 líneas de diálogo."),
    (lambda s: s["lineas"][0].update(personaje="enfermera"), "Una línea la dice alguien que no está en la sala."),
    (lambda s: s["comentarios"][0].update(personaje="enfermera"), "Un comentario lo dice alguien que no está en la sala."),
    (lambda s: s["comentarios"][0].update(linea="Mira www.ejemplo.com"), "El texto «comentario» debe ser texto plano, sin etiquetas ni enlaces."),
    (lambda s: s["pistas"].append("otra pista"), "Una escena admite hasta 3 pistas."),
    (lambda s: s["pistas"].__setitem__(0, "x" * 281), "El texto «pista» supera el largo permitido."),
    (lambda s: s["opciones"][1].update(requiere="{" + "x" * 2000), "Un requisito supera el largo permitido."),
    (lambda s: s["opciones"][1].update(requiere="no es json"), "Un requisito no tiene la forma esperada."),
    (lambda s: s["opciones"][1].update(requiere=json.dumps({"talked": "docente", "extra": 1})), "Un requisito no tiene la forma esperada."),
    (lambda s: s["opciones"][1].update(requiere=json.dumps({"inspected": "botiquin"})), "Un requisito nombra un objeto que no está en la sala."),
    (lambda s: s["opciones"][1].update(requiere=json.dumps({"count": "risky", "gte": 1})), "Un requisito usa algo que no se puede conseguir en este caso."),
    (lambda s: s["opciones"][1].update(requiere=json.dumps({"not": {"all": [{"has": "PAP"}]}})), "Un requisito usa algo que no se puede conseguir en este caso."),
    (lambda s: s["comentarios"][1].update(cuando=json.dumps({"milestone": "hito_raro"})), "Un comentario usa un hito que el caso no declara."),
])
def test_escena_otras_reglas(cambio, motivo, aula, sk, ctx):
    cambio(aula)
    assert motivo in motivos_de(lambda: checks.validate_scene(aula, sk, "aula", ctx)).motivos


@pytest.mark.parametrize("cambio, motivo", [
    (lambda s: s["lineas"][0].update(emocion="furiosa"), "El campo «emocion» trae un valor fuera de la lista permitida."),
    (lambda s: s["opciones"][0].update(reaccionEmocion="furiosa"), "El campo «reaccionEmocion» trae un valor fuera de la lista permitida."),
    (lambda s: s["opciones"][0].update(reaccionGesto="baila"), "El campo «reaccionGesto» trae un valor fuera de la lista permitida."),
    (lambda s: s["opciones"][0].update(clase="OPTIMA"), "El campo «clase» trae un valor fuera de la lista permitida."),
    (lambda s: s["comentarios"][0].update(gesto="sonrie-con-calma"), "El campo «gesto» trae un valor fuera de la lista permitida."),
    (lambda s: s["comentarios"][0].update(emocion="furiosa"), "El campo «emocion» trae un valor fuera de la lista permitida."),
])
def test_el_vocabulario_se_revisa_en_cada_lugar(cambio, motivo, aula, sk, ctx):
    cambio(aula)
    assert motivo in motivos_de(lambda: checks.validate_scene(aula, sk, "aula", ctx)).motivos


def test_una_escena_final_no_lleva_respuestas_y_una_que_no_es_final_si(sk, ctx):
    consultorio = leer("escena-consultorio.json")
    assert checks.validate_scene(consultorio, sk, "consultorio", ctx).opciones == ()
    consultorio["opciones"] = leer("escena-aula.json")["opciones"]
    assert "Una escena final no lleva respuestas." in motivos_de(lambda: checks.validate_scene(consultorio, sk, "consultorio", ctx)).motivos


def test_la_escena_debe_estar_en_el_esqueleto(sk, ctx, aula):
    error = motivos_de(lambda: checks.validate_scene(aula, sk, "enfermeria", ctx))
    assert error.motivos == ["La escena no está en el esqueleto del caso."]
    assert error.escena == "enfermeria"


@pytest.mark.parametrize("raw", [None, [], "texto", {}, {"narracion": "solo"}])
def test_una_escena_sin_la_forma_se_rechaza_sin_romper(raw, sk, ctx):
    assert motivos_de(lambda: checks.validate_scene(raw, sk, "aula", ctx)).motivos == ["El campo «escena» no tiene la forma esperada."]


def test_lo_revictimizante_solo_pasa_en_una_contraindicada_con_su_razon(aula, sk, ctx):
    frase = "Seguro exageras, no sera para tanto."
    aula["opciones"][3].update(texto=frase)
    assert checks.validate_scene(aula, sk, "aula", ctx)  # CONTRAINDICATED con razón: se admite
    aula["opciones"][2]["texto"] = frase  # ACCEPTABLE: no
    assert assistant_prompts.REVICTIMIZING_REASON in motivos_de(lambda: checks.validate_scene(aula, sk, "aula", ctx)).motivos
    aula["opciones"][2]["texto"] = "Respuesta normal."
    aula["lineas"][0]["texto"] = frase  # una línea de diálogo: tampoco
    assert assistant_prompts.REVICTIMIZING_REASON in motivos_de(lambda: checks.validate_scene(aula, sk, "aula", ctx)).motivos


# --- Todos los motivos, motivos fijos, ida y vuelta -----------------------------------------------------------------


def test_junta_todos_los_motivos_de_una_vez(aula, sk, ctx):
    sin_recomendada(aula)
    destino_fuera_del_grafo(aula)
    requiere_herramienta(aula)
    siete_comentarios(aula)
    error = motivos_de(lambda: checks.validate_scene(aula, sk, "aula", ctx))
    assert {
        "La escena necesita al menos una respuesta recomendada.",
        "Una respuesta lleva a una escena que no sigue a esta.",
        "Un requisito usa algo que no se puede conseguir en este caso.",
        "Una escena admite hasta 6 comentarios.",
    } <= set(error.motivos)
    assert len(error.motivos) == len(set(error.motivos))


def test_junta_todos_los_motivos_del_esqueleto(esqueleto, ctx):
    sala_repetida(esqueleto)
    hito_inventado(esqueleto)
    final_con_hecho(esqueleto)
    assert {
        "Dos escenas ocupan la misma sala.", "El esqueleto usa un hito que el lugar no tiene.",
        "La condición de un final solo puede usar hitos, conteos o la persona.",
    } <= set(motivos_de(lambda: checks.validate_skeleton(esqueleto, ctx)).motivos)




def test_los_motivos_son_fijos_y_no_citan_al_modelo(esqueleto, aula, sk, ctx):
    recogidos = []
    # Una pasada por cada campo de texto del esqueleto y de la escena: el texto del modelo es hostil y trae un enlace.
    hostil = f"<b>{HOSTIL}</b> https://{HOSTIL}.example"

    def recorrer(nodo, raiz, validar):
        if isinstance(nodo, dict):
            for clave in list(nodo):
                if isinstance(nodo[clave], (dict, list)):
                    recorrer(nodo[clave], raiz, validar)
                elif isinstance(nodo[clave], str):
                    original = nodo[clave]
                    nodo[clave] = hostil
                    try:
                        validar(raiz)
                    except GenerationInvalid as error:
                        recogidos.extend(error.motivos)
                    nodo[clave] = original
        elif isinstance(nodo, list):
            for indice, interno in enumerate(nodo):
                if isinstance(interno, (dict, list)):
                    recorrer(interno, raiz, validar)
                elif isinstance(interno, str):
                    original = nodo[indice]
                    nodo[indice] = hostil
                    try:
                        validar(raiz)
                    except GenerationInvalid as error:
                        recogidos.extend(error.motivos)
                    nodo[indice] = original

    recorrer(esqueleto, esqueleto, lambda r: checks.validate_skeleton(r, ctx))
    recorrer(aula, aula, lambda r: checks.validate_scene(r, sk, "aula", ctx))
    assert recogidos, "el texto hostil debería provocar rechazos"
    for motivo in recogidos:
        assert HOSTIL not in motivo
        assert checks.is_fixed_motivo(motivo), motivo


def test_todos_los_motivos_fijos_se_usan_en_las_pruebas_o_son_fijos(esqueleto, aula, sk, ctx):
    assert all(checks.is_fixed_motivo(m) for m in checks.FIXED_MOTIVOS)
    assert not checks.is_fixed_motivo("Un texto cualquiera del modelo.")
    assert assistant_prompts.GRAPHIC_REASON in checks.FIXED_MOTIVOS


def test_ida_y_vuelta_json_de_los_borradores(sk, ctx, aula):
    escena = checks.validate_scene(aula, sk, "aula", ctx)
    for borrador in (sk, escena):
        datos = checks.as_json(borrador)
        assert json.loads(json.dumps(datos)) == datos  # JSON puro
        assert checks.from_json(type(borrador), datos) == borrador
        assert checks.as_json(checks.from_json(type(borrador), datos)) == datos
    with pytest.raises(TypeError):
        checks.from_json(dict, {})


def test_la_variante_de_reparar_trae_una_falta_editorial_que_python_no_ve_y_el_validador_si(ctx):
    """``file:`` en la narración pasa ``checks.py`` pero el validador del caso lo señala como ``DSL.TEXT_LINK`` en esa escena."""
    from apps.simulation.casedef import text_check

    variante = leer("escena-aula.reparar.json")
    assert "file:" in variante["narracion"]
    documento = {"x-siep": {"escenas": [{"id": "aula", "descripcion": variante["narracion"]}]}}
    hallazgos = text_check.check(documento)
    assert [(h.code, h.path) for h in hallazgos] == [("DSL.TEXT_LINK", "x-siep.escenas[0].descripcion")]
    assert not hallazgos[0].code.startswith("DSL.SCHEMA")


@pytest.mark.parametrize("hoja", [
    {"gte": 1, "count": "risky"},  # el comparador primero: el orden de las claves no decide
    {"persona": {"bond": "OPEN"}},
    {"used": "PAP"},
    {"all": [{"lt": 2, "count": "risky"}]},
    {"not": {"gte": 1, "count": "contraindicated"}},
])
def test_requisito_y_comentario_solo_admiten_hojas_talked_inspected_y_milestone(hoja, aula, sk, ctx):
    aula["opciones"][1]["requiere"] = json.dumps(hoja)
    assert "Un requisito usa algo que no se puede conseguir en este caso." in motivos_de(
        lambda: checks.validate_scene(aula, sk, "aula", ctx)).motivos
    aula["opciones"][1]["requiere"] = ""
    aula["comentarios"][1]["cuando"] = json.dumps(hoja)
    assert "Un comentario depende de algo que no se puede conseguir en este caso." in motivos_de(
        lambda: checks.validate_scene(aula, sk, "aula", ctx)).motivos


def test_una_hoja_de_tipo_desconocido_no_pasa_en_silencio(aula, sk, ctx):
    aula["opciones"][1]["requiere"] = json.dumps({"talked": "docente", "otra": 1})
    assert motivos_de(lambda: checks.validate_scene(aula, sk, "aula", ctx)).motivos == ["Un requisito no tiene la forma esperada."]
