"""SIM-VBG-002, el caso insignia en tres capítulos: su documento cumple el diseño (bloque K1).

El diseño está en ``.superpowers/plans/2026-11-12-mundo-por-piezas-y-caso-insignia-diseno.md`` (sección 7): 16 decisiones
(las 6 del caso original, intactas, y 10 nuevas), 21 hitos y 7 finales. Estas pruebas leen el JSON, sin base de datos.
El contenido nuevo (las 10 decisiones, las reacciones, los objetivos y los comentarios) es un borrador que Psicología debe
validar; aquí se comprueba la forma, no el criterio clínico.
"""
import json
from pathlib import Path

from apps.simulation.casedef import conditions, report, validate
from apps.simulation.casedef.vocabulary import COMMENTS_MAX, EXPRESSIONS, GESTURES, GOAL_MAX, REACTION_LINE_MAX

CASOS = Path(validate.__file__).resolve().parents[1] / "data" / "cases"
DOCUMENTO = CASOS / "SIM-VBG-002.dsl.json"
LEGADO = CASOS / "SIM-VBG-001.dsl.json"

#: Las 16 decisiones en el orden de la tabla 7.2: (clave de la escena, «O» original o «N» nueva).
ORDEN = [
    ("c1-entrada", "N"), ("c1-sala-espera", "O"), ("c1-lugar-para-hablar", "N"), ("c1-enfermeria", "N"),
    ("c2-trabajo-social", "O"), ("c2-accion-tecnica", "O"), ("c2-antes-de-decir", "N"), ("c2-tras-el-silencio", "N"),
    ("c2-pasillo", "N"), ("c2-habitacion", "N"),
    ("c3-recepcion", "O"), ("c3-consultorio-relato", "N"), ("c3-consultorio-marco", "O"), ("c3-pasillo", "N"),
    ("c3-sala-espera", "N"), ("c3-consultorio-cierre", "O"),
]
#: Cada decisión original y la escena del legado de la que sale (E01…E06, en orden).
ORIGINALES = dict(zip([clave for clave, tipo in ORDEN if tipo == "O"], ["E01", "E02", "E03", "E04", "E05", "E06"]))
#: Los hitos nuevos, en el orden N1…N10 (sección 7.3).
HITOS_NUEVOS = [
    "primer_contacto", "entorno_preparado", "equipo_coordinado", "percepcion_explorada", "emocion_acompanada",
    "familia_conectada", "verdad_cuidada", "relato_protegido", "ruta_acompanada", "red_familiar_valorada",
]
SIN_ROMPER = {"not": {"persona": {"bond": "WITHDRAWN"}}}
#: El requisito de la mejor opción de N2, N3, N6, N7, N8 y N9 (tabla 7.2 y sección 7.3). Nadie más lleva requisito.
REQUISITOS = {
    "n2-sala-de-escucha": {"talked": "enfermera"},
    "n3-acordar-con-el-medico": {"inspected": "hoja-ingreso"},
    "n6-resumir-y-conectar": {"talked": "trabajadora-social"},
    "n7-no-mentir-y-avisar": {"milestone": "equipo_coordinado"},
    "n8-partir-del-informe": {"all": [{"inspected": "informe-hospital"}, SIN_ROMPER]},
    "n9-explicar-y-acompanar": {"all": [{"talked": "orientadora-juridica"}, {"talked": "comisaria"}, SIN_ROMPER]},
}
FINALES = [
    "critica", "ruta_abandonada", "protectora", "duelo_desatendido", "proteccion_incompleta", "riesgo_persistente",
    "con_brechas",
]


def _leer(ruta):
    return json.loads(ruta.read_text(encoding="utf-8"))


def _escenas(documento):
    """``{clave: (escena de la base o None, escena de x-siep)}``."""
    base = {e["id"]: e for e in documento["escenas"]}
    return {x["clave"]: (base.get(x.get("id")), x) for x in documento["x-siep"]["escenas"]}


def _opciones(documento):
    """``{clave de la opción: todo lo que la define}``, juntando la base y ``x-siep``."""
    opciones = {}
    for base, x in _escenas(documento).values():
        por_id = {o["id"]: o for o in base["decision"]["opciones"]} if base and base.get("decision") else {}
        for opcion in x["opciones"]:
            b = por_id[opcion["id"]]
            opciones[opcion["clave"]] = {
                "texto": b["texto"], "clasificacion": b["clasificacion"],
                "conductaProhibida": b.get("conductaProhibida", False), "motivoProhibicion": b.get("motivoProhibicion"),
                "clase": opcion["clase"], "efectos": opcion["efectos"],
                "retroalimentacionInmediata": opcion["retroalimentacionInmediata"],
            }
    return opciones


def _personas(mapa):
    return {o["personaje"] for o in mapa["objetos"] if o["tipo"] == "PERSON" and o["visible"] and o["personaje"]}


def test_el_documento_es_2_2_y_no_tiene_ni_un_hallazgo():
    """Con las salas del hospital por piezas el documento es 2.2 y cumple también OCL-13 a OCL-18 (contrato x-siep 2.2)."""
    documento = _leer(DOCUMENTO)
    assert documento["caso"]["id"] == "SIM-VBG-002"
    assert documento["x-siep"]["version"] == "2.2"
    assert validate.validate_document(documento) == []  # ni errores ni avisos
    estados = {r.rule: r.state for r in validate.run_rules(documento).results}
    assert report.INCUMPLE not in estados.values()
    reglas = ("09", "10", "11", "12", "13", "14", "15", "16", "17", "18")
    assert [estados[f"OCL-{n}"] for n in reglas] == ["CUMPLE"] * len(reglas)


def test_dieciseis_decisiones_en_el_orden_del_diseno_y_un_final():
    documento = _leer(DOCUMENTO)
    con_decision = [e for e in documento["escenas"] if e.get("decision")]
    por_id = {x["id"]: x["clave"] for x in documento["x-siep"]["escenas"] if "id" in x}
    assert [por_id[e["id"]] for e in con_decision] == [clave for clave, _ in ORDEN]
    # Lineal: todas las opciones de una decisión llevan a la escena siguiente, y la última, al cierre.
    ids = [e["id"] for e in documento["escenas"]]
    for posicion, escena in enumerate(con_decision):
        assert {o["siguienteEscena"] for o in escena["decision"]["opciones"]} == {ids[posicion + 1]}
    finales = [x for x in documento["x-siep"]["escenas"] if x["terminal"]]
    assert [x["clave"] for x in finales] == ["cierre-caso"]


def test_las_seis_decisiones_originales_son_las_del_legado():
    """Mismo texto, misma calificación, mismos efectos e hitos, opción por opción y en el mismo orden."""
    nuevas, legado = _opciones(_leer(DOCUMENTO)), _opciones(_leer(LEGADO))
    escenas, del_legado = _escenas(_leer(DOCUMENTO)), _leer(LEGADO)
    legado_por_id = {x["id"]: x for x in del_legado["x-siep"]["escenas"] if "id" in x}
    comparadas = 0
    for clave, id_legado in ORIGINALES.items():
        esperadas = [o["clave"] for o in legado_por_id[id_legado]["opciones"]]
        assert [o["clave"] for o in escenas[clave][1]["opciones"]] == esperadas, clave
        for opcion in esperadas:
            assert nuevas[opcion] == legado[opcion], opcion
            comparadas += 1
    assert comparadas == 19


def test_las_diez_decisiones_nuevas_tienen_tres_opciones_con_la_calificacion_de_la_hoja():
    escenas, opciones = _escenas(_leer(DOCUMENTO)), _opciones(_leer(DOCUMENTO))
    for clave, tipo in ORDEN:
        if tipo != "N":
            continue
        claves = [o["clave"] for o in escenas[clave][1]["opciones"]]
        assert [opciones[o]["clase"] for o in claves] == ["RECOMMENDED", "RISKY", "CONTRAINDICATED"], clave
        assert [opciones[o]["clasificacion"] for o in claves] == ["ADECUADA", "RIESGOSA", "INADECUADA"], clave
        prohibida = opciones[claves[2]]
        assert prohibida["conductaProhibida"] is True and prohibida["motivoProhibicion"], clave
        assert all(opciones[o]["retroalimentacionInmediata"] for o in claves), clave


def test_el_requisito_esta_solo_en_la_mejor_opcion_de_n2_n3_n6_n7_n8_y_n9():
    vistos = {}
    for _, x in _escenas(_leer(DOCUMENTO)).values():
        for opcion in x["opciones"]:
            if "requiere" in opcion:
                assert opcion["clase"] == "RECOMMENDED", opcion["clave"]
                assert conditions.is_valid(opcion["requiere"], facts=True), opcion["clave"]
                vistos[opcion["clave"]] = opcion["requiere"]
        # OCL-09 en palabras: cada decisión deja siempre una opción sin requisito.
        assert not x["opciones"] or any("requiere" not in o for o in x["opciones"]), x["clave"]
    assert vistos == REQUISITOS


def test_cada_escena_tiene_objetivo_y_cada_opcion_su_reaccion():
    for clave, (_, x) in _escenas(_leer(DOCUMENTO)).items():
        if not x["opciones"]:
            continue
        assert 0 < len(x["objetivo"]) <= GOAL_MAX and "\n" not in x["objetivo"], clave
        personas = _personas(x["mapa"])
        for opcion in x["opciones"]:
            reaccion = opcion["reaccion"]
            assert 0 < len(reaccion["linea"]) <= REACTION_LINE_MAX and "\n" not in reaccion["linea"], opcion["clave"]
            assert reaccion["emocion"] in EXPRESSIONS and reaccion["gesto"] in GESTURES, opcion["clave"]
            assert reaccion.get("personaje", next(iter(personas))) in personas, opcion["clave"]


def test_los_comentarios_los_dice_alguien_de_la_sala():
    for clave, (_, x) in _escenas(_leer(DOCUMENTO)).items():
        if not x["opciones"]:
            continue
        comentarios = x["comentarios"]
        assert 2 <= len(comentarios) <= COMMENTS_MAX, clave
        personas = _personas(x["mapa"])
        cosas = {o["clave"] for o in x["mapa"]["objetos"] if o["visible"]}
        for comentario in comentarios:
            assert comentario["personaje"] in personas, (clave, comentario["linea"])
            assert 0 < len(comentario["linea"]) <= REACTION_LINE_MAX and "\n" not in comentario["linea"]
            assert comentario["emocion"] in EXPRESSIONS and comentario["gesto"] in GESTURES
            if "cuando" in comentario:
                assert conditions.is_valid(comentario["cuando"], facts=True), (clave, comentario["linea"])
                for tipo, cosa in conditions.facts_in(comentario["cuando"]):
                    assert tipo in ("talked", "inspected") and cosa in cosas, (clave, cosa)


def test_cada_decision_la_ofrece_una_persona_de_su_propia_sala():
    """Los hechos ``talked`` e ``inspected`` cuentan en la sala del mapa de la escena: por eso se decide ahí mismo."""
    for clave, (_, x) in _escenas(_leer(DOCUMENTO)).items():
        personas = {o["clave"] for o in x["mapa"]["objetos"] if o["tipo"] == "PERSON"}
        ofrecidas = {
            eleccion["opcion"]
            for dialogo in x["mapa"]["dialogos"] if dialogo["objeto"] in personas
            for eleccion in dialogo["elecciones"] if eleccion["opcion"]
        }
        assert ofrecidas == {o["clave"] for o in x["opciones"]}, clave


def test_los_once_hitos_originales_y_los_diez_nuevos():
    reglas, legado = _leer(DOCUMENTO)["x-siep"]["reglas"], _leer(LEGADO)["x-siep"]["reglas"]
    hitos = reglas["milestones"]
    assert hitos[:11] == legado["milestones"]
    assert sum(1 for h in hitos if h["decisive"]) == 3
    assert [h["key"] for h in hitos[11:]] == HITOS_NUEVOS
    for nuevo in hitos[11:]:
        assert nuevo["decisive"] is False and nuevo["description"] == "Por validar con Psicología." and nuevo["label"]
    # Cada hito nuevo lo deja la mejor opción de su decisión, y solo ella.
    escenas = _escenas(_leer(DOCUMENTO))
    nuevas = [clave for clave, tipo in ORDEN if tipo == "N"]
    for clave, hito in zip(nuevas, HITOS_NUEVOS):
        quien = [o["clase"] for o in escenas[clave][1]["opciones"] if hito in o["efectos"]["milestones"]]
        assert quien == ["RECOMMENDED"], hito
    assert (reglas["riskLevel"], reglas["secondChance"]) == (legado["riskLevel"], legado["secondChance"])


def test_los_siete_finales_en_el_orden_en_que_se_evaluan():
    reglas, legado = _leer(DOCUMENTO)["x-siep"]["reglas"], _leer(LEGADO)["x-siep"]["reglas"]
    finales = reglas["endings"]
    assert [f["key"] for f in finales] == FINALES
    assert all(conditions.is_valid(f["when"]) for f in finales[:-1])  # sin hechos de exploración
    assert "when" not in finales[-1]  # el de por defecto
    critico_legado = next(f for f in legado["endings"] if f["key"] == "critica")
    assert finales[0]["when"] == critico_legado["when"]  # la condición del final crítico original
    assert all(f["title"] and f["message"] and f["tone"] for f in finales)


def test_cada_capitulo_abre_con_su_tarjeta_y_su_advertencia():
    escenas = _escenas(_leer(DOCUMENTO))
    aperturas = {"c1-entrada": (1, "La llegada"), "c2-trabajo-social": (2, "La noticia"),
                 "c3-recepcion": (3, "Quince días después")}
    for clave, (numero, titulo) in aperturas.items():
        base, x = escenas[clave]
        assert base["titulo"] == f"Capítulo {numero} · {titulo}"
        assert base["contenidoSensible"] is True and "salida segura" in base["advertencia"]
        ambiente = x["mapa"]["ambiente"]
        assert ambiente["capitulo"]["numero"] == numero and ambiente["capitulo"]["titulo"] == titulo
        assert ambiente["transitionText"]
    # Una escena de intensidad alta siempre lleva advertencia (regla de publicación).
    for base, x in escenas.values():
        if x["intensidad"] == "HIGH":
            assert base["advertencia"], x["clave"]


def test_mismas_herramientas_rubrica_objetivos_y_contexto_que_el_caso_original():
    documento, legado = _leer(DOCUMENTO), _leer(LEGADO)
    assert documento["herramientas"] == legado["herramientas"]
    assert documento["x-siep"]["herramientas"] == legado["x-siep"]["herramientas"]
    assert documento["caso"]["objetivosAprendizaje"] == legado["caso"]["objetivosAprendizaje"]
    assert [r["criterios"] for r in documento["rubricas"]] == [r["criterios"] for r in legado["rubricas"]]
    assert documento["x-siep"]["rubricas"] == legado["x-siep"]["rubricas"]
    assert documento["x-siep"]["contexto"] == legado["x-siep"]["contexto"]
    # Cada herramienta se puede recoger en alguna sala.
    entregadas = {
        o["herramienta"] for x in documento["x-siep"]["escenas"] for o in x["mapa"]["objetos"] if o["tipo"] == "TOOL"
    }
    assert entregadas == {h["codigo"] for h in documento["x-siep"]["herramientas"]}


#: Las 8 salas del hospital por piezas de P1 (`biblioteca/piezas/lugares/hospital.json`).
SALAS_DEL_HOSPITAL = {
    "entrada-urgencias", "sala-espera", "pasillo", "triaje", "estacion-enfermeria", "sala-escucha", "trabajo-social",
    "habitacion-recuperacion",
}


def test_capitulos_1_y_2_en_el_hospital_por_piezas_y_3_en_la_comisaria_de_hoy():
    """Capítulos 1 y 2: salas del hospital por piezas con su estructura. Capítulo 3: la comisaría de imagen fija (provisional)."""
    for clave, (_, x) in _escenas(_leer(DOCUMENTO)).items():
        mapa, ambiente = x["mapa"], x["mapa"]["ambiente"]
        assert ambiente["salaId"], clave
        if clave.startswith(("c1-", "c2-")):
            assert ambiente["lugarId"] == "hospital" and ambiente["salaId"] in SALAS_DEL_HOSPITAL, clave
            assert mapa["estructura"]["ancho"] == mapa["ancho"] and "backgroundImage" not in ambiente, clave
            # Ninguna clave cae en las salas del legado que el cliente dibuja y colisiona por su cuenta.
            assert mapa["clave"] != "hospital-urgencias" and not mapa["clave"].startswith("hospital-sala-escucha"), clave
            puertas = [o for o in mapa["objetos"] if o["tipo"] == "EXIT"]
            assert puertas and all({"muro", "pos", "modelo"} <= set(p["metadatos"]) for p in puertas), clave
        else:
            assert "estructura" not in mapa and ambiente["salaId"].startswith("comisaria-"), clave
            assert "salaProvisional" not in ambiente and ambiente["lugarId"] == "comisaria", clave
            assert ambiente["backgroundImage"].startswith("/assets/biblioteca/escenarios/comisaria/"), clave
            # Ninguna clave del capítulo 3 cae en las salas que el cliente dibuja y colisiona por su cuenta.
            assert not mapa["clave"].startswith("comisaria-"), clave
