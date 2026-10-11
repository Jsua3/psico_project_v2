# -*- coding: utf-8 -*-
"""Pruebas del validador del DSL (Fase 4).

Ejecución, desde esta carpeta (solo biblioteca estándar; jsonschema es opcional):

    C:/Python313/python.exe -I -B test_validar_dsl.py -v

(``C:/Python313/python.exe`` es la instalación del equipo donde se ejecutó; en
otro equipo se usa ``python`` o ``python3``. ``-B`` evita la carpeta ``__pycache__``.)

Con ``-I`` Python no agrega la carpeta del script a ``sys.path``; por eso el módulo
la agrega aquí. Qué se prueba:

  1. El escenario válido pasa las 17 reglas, sin una sola «no aplica».
  2. El escenario con errores incumple exactamente las reglas previstas y cada
     incumplimiento señala el elemento correcto.
  3. Mutaciones: partes del caso válido rotas de una en una incumplen la regla
     correspondiente y solo esa.
  4. Efectos en cadena: una rotura que arrastra otras reglas las arrastra de forma
     previsible (Fase 3, §6.4).
  5. Las reglas como código: las OCL son las del enunciado, en su orden.
  6. La capa de forma, la degradación sin esquema o sin jsonschema.
  7. Los formatos de archivo y el código de salida.
  8. Robustez: un flujo muy largo, los valores nulos, el formato de los
     identificadores y el reparto de un error entre la forma y las reglas.
"""
import contextlib
import copy
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

for _flujo in (sys.stdout, sys.stderr):  # que los mensajes con tildes salgan bien al redirigir la salida
    try:
        _flujo.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

import validar_dsl as v  # noqa: E402

RAIZ = AQUI.parent
ARCHIVO = RAIZ / "simulador_psicologia_social.json"
ESQUEMA = json.loads((RAIZ / "dsl-casos.schema.json").read_text(encoding="utf-8"))
DATOS = json.loads(ARCHIVO.read_text(encoding="utf-8"))
VALIDO = DATOS["escenarios"][0]["caso"]
CON_ERRORES = DATOS["escenarios"][1]["caso"]

OCL = [f"OCL-0{n}" for n in range(1, 9)]
PROP = [f"PROP-0{n}" for n in range(1, 9)]
TODAS = ["FORMA"] + OCL + PROP

try:
    import jsonschema
except Exception:  # noqa: BLE001
    jsonschema = None


# ───────────────────────────── ayudas ─────────────────────────────
def evaluar(doc, esquema=ESQUEMA):
    return v.validar_documento(doc, esquema, usar_jsonschema=False)


def estados(informe):
    return {r["regla"]: r["estado"] for r in informe["reglas"]}


def incumplidas(informe):
    return set(informe["reglasIncumplidas"])


def hallazgos(informe, regla):
    return next(r for r in informe["reglas"] if r["regla"] == regla)["hallazgos"]


def con(cambio, base=VALIDO):
    doc = copy.deepcopy(base)
    cambio(doc)
    return doc


def escena(d, ident):
    return next(e for e in d["escenas"] if e["id"] == ident)


def opcion(d, ident):
    for e in d["escenas"]:
        for o in e.get("decision", {}).get("opciones", []):
            if o["id"] == ident:
                return o
    raise KeyError(ident)


def retro(d, ident):
    return next(r for r in d["retroalimentacion"] if r["id"] == ident)


def intento(d):
    return d["ejecucion"]["intentos"][0]


def registros(d):
    return intento(d)["bitacora"]["decisiones"]


def ejecutar(argv):
    salida, error = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(error):
        codigo = v.main(argv)
    return codigo, salida.getvalue(), error.getvalue()


def escenario(ident, tipo, caso):
    return {"id": ident, "nombre": ident, "tipo": tipo, "caso": caso}


def envoltorio(*escenarios):
    return {"dsl": {"nombre": "DSL de casos situacionales de SIEP", "version": "1.0"},
            "escenarios": list(escenarios)}


@contextlib.contextmanager
def archivo_temporal(contenido, texto=False):
    with tempfile.TemporaryDirectory() as carpeta:
        ruta = Path(carpeta) / "entrada.json"
        ruta.write_text(contenido if texto else json.dumps(contenido, ensure_ascii=False), encoding="utf-8")
        yield str(ruta)


# ──────────────────────── mutaciones del caso válido ────────────────────────
# Cada una rompe una sola cosa. Las que dejarían referencias colgando (sin escenas,
# sin ninguna decisión) quitan también lo que dependía de lo roto, para que la
# rotura sea una sola. Los efectos que sí se arrastran se prueban aparte.
def m_sin_escenas(d):
    d["escenas"] = []
    del d["retroalimentacion"], d["ejecucion"]


def m_decision_con_una_opcion(d):
    del escena(d, "E02")["decision"]["opciones"][1]  # quita OP05, que nadie cita


def m_destino_inexistente(d):
    opcion(d, "OP05")["siguienteEscena"] = "E09"


def m_sin_siguiente_escena(d):
    del opcion(d, "OP05")["siguienteEscena"]


def m_decision_repetida(d):
    escena(d, "E03")["decision"] = {
        "id": "D01",
        "pregunta": "¿Cómo cierra el estudiante la conversación?",
        "opciones": [
            {"id": "OP06", "texto": "Agendar una revisión del horario", "siguienteEscena": "E05",
             "clasificacion": "ADECUADA"},
            {"id": "OP07", "texto": "Dar el tema por terminado", "siguienteEscena": "E05",
             "clasificacion": "RIESGOSA"},
        ],
    }


def m_herramienta_no_definida(d):
    opcion(d, "OP01")["herramienta"] = "H99"


def m_retro_sin_referencia(d):
    del retro(d, "R01")["decision"]


def m_retro_con_decision_y_opcion(d):
    retro(d, "R01")["opcion"] = "OP01"


def m_retro_hacia_decision_inexistente(d):
    retro(d, "R01")["decision"] = "D09"


def m_titulo_vacio(d):
    d["caso"]["titulo"] = ""


def m_sin_descripcion(d):
    del d["caso"]["descripcion"]


def m_sin_ninguna_decision(d):
    d["escenas"] = [escena(d, "E03")]
    d["caso"]["escenaInicial"] = "E03"
    del d["retroalimentacion"], d["ejecucion"]


def m_herramienta_repetida(d):
    d["herramientas"].append(copy.deepcopy(d["herramientas"][0]))


def m_escena_repetida(d):
    d["escenas"].append(copy.deepcopy(escena(d, "E05")))


def m_escena_huerfana(d):
    d["escenas"].append({"id": "E06", "titulo": "Escena sin camino",
                         "descripcion": "Fin del caso. Ninguna opción conduce a esta escena."})


def m_inicial_inexistente(d):
    d["caso"]["escenaInicial"] = "E09"


def m_personaje_inexistente(d):
    escena(d, "E01")["participantes"].append("P09")


def m_opcion_de_otra_decision(d):
    registros(d)[0]["opcionElegida"] = "OP04"  # OP04 es de la decisión D02; el intento estaba en E01


def m_orden_repetido(d):
    registros(d)[2]["orden"] = 2


def m_opcion_registrada_inexistente(d):
    registros(d)[1]["opcionElegida"] = "OP09"


def m_escena_actual_incoherente(d):
    intento(d)["escenaActual"] = "E03"


def m_reflexion_repetida(d):
    reflexiones = intento(d)["bitacora"]["reflexiones"]
    reflexiones.append(copy.deepcopy(reflexiones[0]))


def m_momento_anterior_al_inicio(d):
    registros(d)[0]["momento"] = "2026-10-09T14:00:00-05:00"


def m_ciclo(d):
    escena(d, "E03")["decision"] = {
        "id": "D03",
        "pregunta": "¿Cómo sigue el grupo después del horario?",
        "opciones": [
            {"id": "OP06", "texto": "Volver a empezar la conversación", "siguienteEscena": "E01",
             "clasificacion": "RIESGOSA"},
            {"id": "OP07", "texto": "Revisar el acuerdo con el grupo", "siguienteEscena": "E05",
             "clasificacion": "ADECUADA"},
        ],
    }


def m_evaluacion_incompleta(d):
    del d["ejecucion"]["evaluaciones"][0]["valoraciones"][2]


def m_rubrica_inexistente(d):
    d["caso"]["rubrica"] = "RUB-09"


def m_dos_intentos_abiertos(d):
    for ident, bit, estado in (("INT-02", "BIT-02", "EN_CURSO"), ("INT-03", "BIT-03", "PAUSADO")):
        nuevo = copy.deepcopy(intento(d))
        nuevo.update({"id": ident, "estado": estado, "escenaActual": "E01"})
        nuevo.pop("finalizadoEn")
        nuevo["bitacora"] = {"id": bit, "creadaEn": "2026-10-10T09:00:00-05:00", "bloqueada": False,
                             "decisiones": [], "reflexiones": []}
        d["ejecucion"]["intentos"].append(nuevo)


def m_estudiante_inexistente(d):
    intento(d)["estudiante"] = "EST-09"


def m_nota_numerica(d):
    d["ejecucion"]["evaluaciones"][0]["nota"] = 4.5


def m_prohibida_sin_motivo(d):
    opcion(d, "OP02")["conductaProhibida"] = True


def m_bitacora_abierta_en_intento_completado(d):
    intento(d)["bitacora"]["bloqueada"] = False


def m_borrador_con_intentos(d):
    d["caso"]["estado"] = "BORRADOR"


def m_atributo_derivado_escrito(d):
    escena(d, "E03")["esConclusion"] = True


def m_decision_nula(d):
    escena(d, "E03")["decision"] = None


def m_cierre_antes_del_inicio(d):
    intento(d)["finalizadoEn"] = "2026-10-09T14:00:00-05:00"


def m_cierre_tardio(d):
    intento(d)["finalizadoEn"] = "2026-10-09T15:09:30-05:00"  # 2 min 25 s después de la última decisión
    d["ejecucion"]["evaluaciones"][0]["evaluadaEn"] = "2026-10-09T15:09:31-05:00"


def m_reflexion_posterior_al_cierre(d):
    intento(d)["bitacora"]["reflexiones"][1]["momento"] = "2026-10-09T15:08:20-05:00"


def m_abierto_en_una_conclusion(d):
    i = intento(d)
    i["estado"] = "EN_CURSO"
    del i["finalizadoEn"]
    i["bitacora"]["bloqueada"] = False


def m_valoracion_anterior_al_cierre(d):
    d["ejecucion"]["evaluaciones"][0]["evaluadaEn"] = "2026-10-09T15:05:00-05:00"


def m_caso_sin_rubrica(d):
    del d["caso"]["rubrica"]


def m_rubrica_inactiva(d):
    d["rubricas"][0]["activa"] = False


def m_siguiente_escena_nula(d):
    opcion(d, "OP05")["siguienteEscena"] = None


def m_herramienta_nula(d):
    opcion(d, "OP01")["herramienta"] = None


def m_retro_con_decision_nula(d):
    retro(d, "R01")["decision"] = None


def m_id_de_caso_con_salto_de_linea(d):
    d["caso"]["id"] = "CASO-001\n"


# (nombre, mutación, regla que debe fallar, elemento afectado esperado)
MUTACIONES = [
    ("sin escenas", m_sin_escenas, "OCL-01", "Caso CASO-001"),
    ("decisión con una sola opción", m_decision_con_una_opcion, "OCL-02", "Decisión D02"),
    ("siguienteEscena inexistente", m_destino_inexistente, "OCL-03", "Opción OP05"),
    ("opción sin siguienteEscena", m_sin_siguiente_escena, "OCL-03", "Opción OP05"),
    ("identificador de decisión repetido", m_decision_repetida, "OCL-04", "Decisión D01 (escena E03)"),
    ("herramienta no definida", m_herramienta_no_definida, "OCL-05", "Opción OP01"),
    ("retroalimentación sin referencia", m_retro_sin_referencia, "OCL-06", "Retroalimentación R01"),
    ("retroalimentación con decisión y opción", m_retro_con_decision_y_opcion, "OCL-06", "Retroalimentación R01"),
    ("retroalimentación hacia una decisión inexistente", m_retro_hacia_decision_inexistente, "OCL-06",
     "Retroalimentación R01"),
    ("título vacío", m_titulo_vacio, "OCL-07", "Caso CASO-001"),
    ("sin descripción", m_sin_descripcion, "OCL-07", "Caso CASO-001"),
    ("sin ninguna decisión", m_sin_ninguna_decision, "OCL-08", "Caso CASO-001"),
    ("herramienta con identificador repetido", m_herramienta_repetida, "PROP-01", "Herramienta H01"),
    ("escena con identificador repetido", m_escena_repetida, "PROP-01", "Escena E05"),
    ("escena inalcanzable", m_escena_huerfana, "PROP-02", "Escena E06"),
    ("escena inicial inexistente", m_inicial_inexistente, "PROP-02", "Caso CASO-001"),
    ("personaje inexistente en una escena", m_personaje_inexistente, "PROP-03", "Escena E01"),
    ("opción registrada de otra decisión", m_opcion_de_otra_decision, "PROP-04",
     "Registro de decisión 1 del intento INT-01"),
    ("orden de registro repetido", m_orden_repetido, "PROP-05",
     "Registro de decisión en la posición 3 del intento INT-01"),
    ("opción registrada inexistente", m_opcion_registrada_inexistente, "PROP-05",
     "Registro de decisión 2 del intento INT-01"),
    ("escena actual incoherente con el recorrido", m_escena_actual_incoherente, "PROP-05", "Intento INT-01"),
    ("dos reflexiones para una escena", m_reflexion_repetida, "PROP-05",
     "Reflexión sobre la escena E01 del intento INT-01"),
    ("momento anterior al inicio del intento", m_momento_anterior_al_inicio, "PROP-05",
     "Registro de decisión 1 del intento INT-01"),
    ("intento que termina antes de empezar", m_cierre_antes_del_inicio, "PROP-05", "Intento INT-01"),
    ("intento completado que cierra después de su última decisión", m_cierre_tardio, "PROP-05",
     "Intento INT-01"),
    ("reflexión posterior al cierre del intento", m_reflexion_posterior_al_cierre, "PROP-05",
     "Reflexión sobre la escena E02 del intento INT-01"),
    ("intento abierto que ya llegó a una conclusión", m_abierto_en_una_conclusion, "PROP-05",
     "Intento INT-01"),
    ("ciclo en el flujo", m_ciclo, "PROP-06", "Opción OP06"),
    ("evaluación EVALUADA sin cubrir los criterios", m_evaluacion_incompleta, "PROP-07", "Evaluación EV-01"),
    ("rúbrica del caso inexistente", m_rubrica_inexistente, "PROP-07", "Caso CASO-001"),
    ("evaluación con una rúbrica y caso sin rúbrica", m_caso_sin_rubrica, "PROP-07", "Evaluación EV-01"),
    ("evaluación con una rúbrica inactiva", m_rubrica_inactiva, "PROP-07", "Evaluación EV-01"),
    ("valoración del sistema anterior al cierre del intento", m_valoracion_anterior_al_cierre, "PROP-07",
     "Evaluación EV-01"),
    ("dos intentos abiertos del mismo estudiante", m_dos_intentos_abiertos, "PROP-08", "Estudiante EST-01"),
    ("intento de un estudiante inexistente", m_estudiante_inexistente, "PROP-08", "Intento INT-01"),
    ("nota numérica en la evaluación", m_nota_numerica, "FORMA", "Evaluación EV-01"),
    ("conducta prohibida sin motivo", m_prohibida_sin_motivo, "FORMA", "Opción OP02"),
    ("bitácora abierta en un intento completado", m_bitacora_abierta_en_intento_completado, "FORMA",
     "Bitácora BIT-01"),
    ("intentos con el caso en BORRADOR", m_borrador_con_intentos, "FORMA", "Caso CASO-001"),
    ("atributo derivado esConclusion escrito", m_atributo_derivado_escrito, "FORMA", "Escena E03"),
    ("decision: null en una conclusión", m_decision_nula, "FORMA", "Escena E03"),
    ("herramienta: null", m_herramienta_nula, "FORMA", "Opción OP01"),
    ("identificador de caso con salto de línea final", m_id_de_caso_con_salto_de_linea, "FORMA",
     "Caso CASO-001\n"),
    ("siguienteEscena: null", m_siguiente_escena_nula, "OCL-03", "Opción OP05"),
]


# ═══════════════════════════ 1. Escenario válido ═══════════════════════════
class EscenarioValido(unittest.TestCase):
    def setUp(self):
        self.informe = evaluar(VALIDO)

    def test_pasa_las_diecisiete_reglas_sin_ninguna_no_aplica(self):
        self.assertEqual(self.informe["incumplimientos"], 0)
        self.assertEqual(self.informe["obtenido"], "valido")
        self.assertEqual(list(estados(self.informe)), TODAS)
        self.assertEqual({e for e in estados(self.informe).values()}, {v.CUMPLE})

    def test_cumple_los_minimos_que_pide_el_enunciado(self):
        c = self.informe["caso"]
        self.assertGreaterEqual(c["personajes"], 2)
        self.assertGreaterEqual(c["escenas"], 2)
        self.assertGreaterEqual(c["decisiones"], 1)
        self.assertGreaterEqual(c["opciones"], 2)
        self.assertGreaterEqual(c["herramientas"], 1)
        self.assertGreaterEqual(c["retroalimentaciones"], 1)

    def test_toda_decision_tiene_al_menos_dos_opciones(self):
        for e in VALIDO["escenas"]:
            if "decision" in e:
                self.assertGreaterEqual(len(e["decision"]["opciones"]), 2, e["id"])

    @unittest.skipIf(jsonschema is None, "jsonschema no está instalado")
    def test_es_valido_para_el_esquema_oficial_de_jsonschema(self):
        validador = jsonschema.Draft202012Validator(ESQUEMA)
        self.assertEqual(list(validador.iter_errors(VALIDO)), [])


# ═══════════════════════ 2. Escenario con errores ═══════════════════════
class EscenarioConErrores(unittest.TestCase):
    # regla -> (elemento afectado, ruta)
    PREVISTO = {
        "OCL-02": ("Decisión D01", "escenas[0].decision.opciones"),
        "OCL-03": ("Opción OP03", "escenas[1].decision.opciones[1].siguienteEscena"),
        "OCL-05": ("Opción OP02", "escenas[1].decision.opciones[0].herramienta"),
        "OCL-06": ("Retroalimentación R02", "retroalimentacion[1]"),
        "OCL-07": ("Caso CASO-002", "caso.descripcion"),
    }

    def setUp(self):
        self.informe = evaluar(CON_ERRORES)

    def test_incumple_exactamente_las_reglas_previstas(self):
        self.assertEqual(incumplidas(self.informe), set(self.PREVISTO))
        self.assertEqual(self.informe["obtenido"], "con-errores")

    def test_incluye_las_tres_reglas_que_pide_el_enunciado(self):
        self.assertLessEqual({"OCL-02", "OCL-03", "OCL-05"}, incumplidas(self.informe))

    def test_cada_error_se_atribuye_a_un_solo_elemento_y_es_el_correcto(self):
        for regla_id, (elemento, ruta) in self.PREVISTO.items():
            with self.subTest(regla=regla_id):
                encontrados = hallazgos(self.informe, regla_id)
                self.assertEqual(len(encontrados), 1)
                self.assertEqual(encontrados[0]["elemento"], elemento)
                self.assertEqual(encontrados[0]["ruta"], ruta)
        self.assertEqual(self.informe["incumplimientos"], len(self.PREVISTO))

    def test_el_resto_de_las_reglas_cumple_o_no_aplica(self):
        for regla_id, estado in estados(self.informe).items():
            if regla_id not in self.PREVISTO:
                self.assertIn(estado, (v.CUMPLE, v.NO_APLICA), regla_id)
        for regla_id in ("FORMA", "OCL-01", "OCL-04", "OCL-08", "PROP-01", "PROP-02", "PROP-03", "PROP-06"):
            self.assertEqual(estados(self.informe)[regla_id], v.CUMPLE, regla_id)

    def test_los_errores_no_arrastran_otras_reglas(self):
        # El destino inexistente E09 no deja ninguna escena inalcanzable, y la
        # retroalimentación huérfana no deja nada colgando.
        self.assertEqual(estados(self.informe)["PROP-02"], v.CUMPLE)

    def test_las_soluciones_propuestas_dejan_el_caso_sin_errores(self):
        def corregir(d):
            escena(d, "E01")["decision"]["opciones"].append(  # OCL-02: agregar otra opción
                {"id": "OP04", "texto": "Pedirle a Julián que explique el retraso ante el equipo",
                 "siguienteEscena": "E03", "clasificacion": "RIESGOSA"})
            opcion(d, "OP03")["siguienteEscena"] = "E03"  # OCL-03: referenciar una escena válida
            d["herramientas"].append({"id": "H02", "nombre": "Acta de acuerdos",  # OCL-05: registrar la herramienta
                                      "descripcion": "Formato para registrar los acuerdos de una reunión."})
            retro(d, "R02")["opcion"] = "OP03"  # OCL-06: asociarla a la opción que explica
            d["caso"]["descripcion"] = "Un equipo discute por un informe atrasado y espera una intervención."  # OCL-07

        informe = evaluar(con(corregir, CON_ERRORES))
        self.assertEqual(informe["reglasIncumplidas"], [], informe["reglasIncumplidas"])
        self.assertEqual(informe["obtenido"], "valido")


# ═══════════════════════════ 3. Mutaciones ═══════════════════════════
class MutacionesDelCasoValido(unittest.TestCase):
    def test_cada_mutacion_incumple_la_regla_correspondiente_y_solo_esa(self):
        for nombre, mutacion, regla_id, elemento in MUTACIONES:
            with self.subTest(mutacion=nombre):
                informe = evaluar(con(mutacion))
                self.assertEqual(incumplidas(informe), {regla_id}, estados(informe))
                self.assertEqual(informe["obtenido"], "con-errores")
                self.assertIn(elemento, [h["elemento"] for h in hallazgos(informe, regla_id)])

    def test_las_mutaciones_cubren_las_ocho_reglas_ocl_y_las_ocho_propuestas(self):
        cubiertas = {m[2] for m in MUTACIONES}
        self.assertLessEqual(set(TODAS), cubiertas)

    def test_la_regla_de_forma_muestra_la_regla_del_dominio_que_infringe(self):
        casos = {
            m_prohibida_sin_motivo: "[INV-12]",
            m_bitacora_abierta_en_intento_completado: "[INV-19]",
            m_borrador_con_intentos: "[RN-03]",
        }
        for mutacion, marca in casos.items():
            with self.subTest(marca=marca):
                mensajes = [h["mensaje"] for h in hallazgos(evaluar(con(mutacion)), "FORMA")]
                self.assertTrue(any(m.startswith(marca) for m in mensajes), mensajes)

    def test_sin_escenas_las_reglas_que_dependen_de_ellas_no_se_evaluan(self):
        e = estados(evaluar(con(m_sin_escenas)))
        for regla_id in ("OCL-08", "PROP-02", "PROP-06"):
            self.assertEqual(e[regla_id], v.NO_APLICA, regla_id)

    def test_sin_escena_inicial_el_recorrido_no_se_reconstruye_y_prop_04_no_se_da_por_cumplida(self):
        informe = evaluar(con(m_inicial_inexistente))
        self.assertEqual(incumplidas(informe), {"PROP-02"})
        self.assertEqual(estados(informe)["PROP-04"], v.NO_APLICA)


# ═════════════════════ 4. Efectos en cadena documentados ═════════════════════
class EfectosEnCadena(unittest.TestCase):
    def test_quitar_una_opcion_que_otra_cita_deja_la_cita_colgada_y_una_escena_inalcanzable(self):
        # Fase 3, §6.4. D01 conserva dos opciones (OCL-02 se cumple), pero R03 cita
        # a OP03 (OCL-06) y E04 solo se alcanzaba por OP03 (PROP-02). Además la
        # opción ya no existe para la bitácora, que no la usó, así que PROP-05 no se ve afectada.
        informe = evaluar(con(lambda d: d["escenas"][0]["decision"]["opciones"].pop(2)))
        self.assertEqual(incumplidas(informe), {"OCL-06", "PROP-02"})
        self.assertEqual(hallazgos(informe, "OCL-06")[0]["elemento"], "Retroalimentación R03")
        self.assertEqual(hallazgos(informe, "PROP-02")[0]["elemento"], "Escena E04")

    def test_la_opcion_que_el_intento_uso_no_se_puede_quitar_sin_que_la_bitacora_lo_note(self):
        informe = evaluar(con(lambda d: d["escenas"][1]["decision"]["opciones"].pop(0)))  # quita OP04
        self.assertEqual(incumplidas(informe), {"OCL-02", "PROP-02", "PROP-05"})
        self.assertEqual(hallazgos(informe, "PROP-02")[0]["elemento"], "Escena E05")
        self.assertIn("OP04", hallazgos(informe, "PROP-05")[0]["mensaje"])


# ═════════════════════ 5. Las reglas como código ═════════════════════
class ReglasComoCodigo(unittest.TestCase):
    def test_las_reglas_ocl_son_las_ocho_del_enunciado_en_su_orden(self):
        ids = [r["id"] for r in v.REGLAS if r["tipo"] == "OCL"]
        self.assertEqual(ids, OCL)
        esperadas = {
            "OCL-01": "al menos una escena", "OCL-02": "como mínimo dos opciones",
            "OCL-03": "referenciar una escena existente", "OCL-04": "dos decisiones con el mismo identificador",
            "OCL-05": "previamente definida en el caso", "OCL-06": "asociada a una decisión u opción",
            "OCL-07": "título y una descripción", "OCL-08": "al menos un punto de decisión",
        }
        titulos = {r["id"]: r["titulo"] for r in v.REGLAS}
        for regla_id, fragmento in esperadas.items():
            self.assertIn(fragmento, titulos[regla_id], regla_id)

    def test_cada_regla_documenta_su_expresion_ocl_en_el_docstring(self):
        for r in v.REGLAS:
            doc = r["funcion"].__doc__
            with self.subTest(regla=r["id"]):
                self.assertTrue(doc.strip().startswith(r["id"] + "."), doc[:40])
                self.assertIn("context ", doc)
                self.assertIn("inv ", doc)

    def test_las_propuestas_estan_marcadas_y_son_ocho(self):
        propuestas = [r["id"] for r in v.REGLAS if r["tipo"] == "PROPUESTA"]
        self.assertEqual(propuestas, PROP)

    def test_hay_una_funcion_por_regla(self):
        funciones = [r["funcion"] for r in v.REGLAS]
        self.assertEqual(len(funciones), len(set(funciones)))
        self.assertEqual(len(funciones), 16)


# ══════════════════ 6. Capa de forma y degradación elegante ══════════════════
class CapaDeForma(unittest.TestCase):
    def documentos_de_prueba(self):
        yield "válido", VALIDO
        yield "con errores", CON_ERRORES
        for nombre, mutacion, _, _ in MUTACIONES:
            yield nombre, con(mutacion)

    @unittest.skipIf(jsonschema is None, "jsonschema no está instalado")
    def test_el_interprete_coincide_con_jsonschema_en_todos_los_documentos(self):
        for nombre, doc in self.documentos_de_prueba():
            with self.subTest(documento=nombre):
                propios = v.InterpreteEsquema(ESQUEMA).errores(doc)
                cruzada = v.comprobacion_cruzada(ESQUEMA, doc, propios)
                self.assertTrue(cruzada["coincide"], cruzada)

    def test_sin_esquema_la_forma_no_se_evalua_pero_las_reglas_siguen(self):
        informe = v.validar_documento(CON_ERRORES, None, usar_jsonschema=False)
        self.assertEqual(estados(informe)["FORMA"], v.NO_EVALUADA)
        self.assertEqual(incumplidas(informe), {"OCL-02", "OCL-03", "OCL-05", "OCL-06", "OCL-07"})
        valido = v.validar_documento(VALIDO, None, usar_jsonschema=False)
        self.assertEqual(valido["incumplimientos"], 0)

    def test_sin_jsonschema_el_resultado_es_el_mismo(self):
        anterior = v._modulo_jsonschema
        try:
            v._modulo_jsonschema = lambda: None  # simula que jsonschema no está instalado
            informe = v.validar_documento(CON_ERRORES, ESQUEMA, usar_jsonschema=True)
        finally:
            v._modulo_jsonschema = anterior
        self.assertIsNone(informe["comprobacionCruzada"])
        self.assertEqual(incumplidas(informe), incumplidas(evaluar(CON_ERRORES)))

    def test_un_documento_que_no_es_un_objeto_se_informa_sin_fallar(self):
        informe = evaluar(["no", "es", "un", "documento"])
        self.assertEqual(estados(informe)["FORMA"], v.INCUMPLE)
        self.assertEqual(informe["obtenido"], "con-errores")

    def test_documentos_mal_formados_no_hacen_fallar_a_las_reglas(self):
        malos = [
            {},
            {"caso": "texto", "escenas": "no es lista"},
            {"caso": {"id": 5}, "escenas": [None, 3, {"decision": []}],
             "retroalimentacion": [1, {"decision": ["x"]}], "ejecucion": {"intentos": [7, {"bitacora": 9}]}},
        ]
        for doc in malos:
            informe = evaluar(doc)
            internos = [h for r in informe["reglas"] for h in r["hallazgos"] if h["elemento"] == "(interno)"]
            self.assertEqual(internos, [], doc)
            self.assertEqual(informe["obtenido"], "con-errores")


# ═════════════ 7. Formatos de archivo, informe y código de salida ═════════════
class ArchivoYCodigoDeSalida(unittest.TestCase):
    def test_el_archivo_entregado_sale_con_codigo_0(self):
        codigo, salida, _ = ejecutar([str(ARCHIVO)])
        self.assertEqual(codigo, 0, salida)
        self.assertIn("RESUMEN", salida)
        self.assertIn("OCL-02, OCL-03, OCL-05, OCL-06, OCL-07", salida)

    def test_detecta_la_lista_de_escenarios_y_el_documento_unico(self):
        formato, meta, escenarios = v.extraer_escenarios(DATOS)
        self.assertEqual(formato, "lista-de-escenarios")
        self.assertEqual(meta["version"], "1.0")
        self.assertEqual([e["esperado"] for e in escenarios], ["valido", "con-errores"])
        formato, meta, escenarios = v.extraer_escenarios(VALIDO)
        self.assertEqual(formato, "documento-unico")
        self.assertEqual(len(escenarios), 1)
        formato, _, escenarios = v.extraer_escenarios([VALIDO, CON_ERRORES], esperar="valido")
        self.assertEqual(formato, "lista-json")
        self.assertEqual(len(escenarios), 2)

    def test_un_escenario_esperado_valido_que_falla_sale_con_codigo_1(self):
        with archivo_temporal(envoltorio(escenario("A", "valido", CON_ERRORES))) as ruta:
            codigo, salida, _ = ejecutar([ruta])
        self.assertEqual(codigo, 1)
        self.assertIn("NO SE CUMPLE", salida)

    def test_un_escenario_esperado_con_errores_que_no_falla_sale_con_codigo_1(self):
        with archivo_temporal(envoltorio(escenario("A", "con-errores", VALIDO))) as ruta:
            codigo, salida, _ = ejecutar([ruta])
        self.assertEqual(codigo, 1)
        self.assertIn("NO SE CUMPLE", salida)

    def test_basta_un_escenario_inesperado_entre_varios(self):
        contenido = envoltorio(escenario("A", "valido", VALIDO), escenario("B", "con-errores", CON_ERRORES),
                               escenario("C", "valido", con(m_titulo_vacio)))
        with archivo_temporal(contenido) as ruta:
            codigo, _, _ = ejecutar([ruta])
        self.assertEqual(codigo, 1)

    def test_documento_unico_se_espera_valido_salvo_que_se_indique_otra_cosa(self):
        with archivo_temporal(VALIDO) as ruta:
            self.assertEqual(ejecutar([ruta])[0], 0)
            self.assertEqual(ejecutar([ruta, "--esperar", "con-errores"])[0], 1)
        with archivo_temporal(CON_ERRORES) as ruta:
            self.assertEqual(ejecutar([ruta])[0], 1)
            self.assertEqual(ejecutar([ruta, "--esperar", "con-errores"])[0], 0)

    def test_archivo_inexistente_json_roto_o_forma_desconocida_salen_con_codigo_2(self):
        self.assertEqual(ejecutar([str(AQUI / "no-existe.json")])[0], 2)
        with archivo_temporal("{ esto no es json", texto=True) as ruta:
            codigo, _, error = ejecutar([ruta])
        self.assertEqual(codigo, 2)
        self.assertIn("no es JSON válido", error)
        with archivo_temporal({"algo": 1}) as ruta:
            self.assertEqual(ejecutar([ruta])[0], 2)
        with archivo_temporal(envoltorio(escenario("A", "casi-valido", VALIDO))) as ruta:
            self.assertEqual(ejecutar([ruta])[0], 2)

    def test_una_version_del_dsl_distinta_de_la_del_archivo_sale_con_codigo_2(self):
        distinto = con(lambda d: d.update(versionDsl="2.0"))
        with archivo_temporal(envoltorio(escenario("A", "valido", distinto))) as ruta:
            codigo, _, error = ejecutar([ruta])
        self.assertEqual(codigo, 2)
        self.assertIn("versionDsl", error)

    def test_la_salida_json_es_legible_por_maquina(self):
        codigo, salida, _ = ejecutar([str(ARCHIVO), "--json"])
        self.assertEqual(codigo, 0)
        datos = json.loads(salida)
        self.assertEqual(datos["resumen"], {"escenarios": 2, "expectativasCumplidas": 2, "codigoSalida": 0})
        primero, segundo = datos["escenarios"]
        self.assertEqual((primero["esperado"], primero["obtenido"]), ("valido", "valido"))
        self.assertEqual(segundo["reglasIncumplidas"], ["OCL-02", "OCL-03", "OCL-05", "OCL-06", "OCL-07"])
        regla = next(r for r in segundo["reglas"] if r["regla"] == "OCL-02")
        self.assertEqual(set(regla["hallazgos"][0]), {"elemento", "ruta", "mensaje"})
        self.assertEqual([r["regla"] for r in primero["reglas"]], TODAS)

    def test_sin_jsonschema_da_el_mismo_veredicto_por_la_linea_de_comandos(self):
        _, con_js, _ = ejecutar([str(ARCHIVO), "--json"])
        codigo, sin_js, _ = ejecutar([str(ARCHIVO), "--json", "--sin-jsonschema"])
        self.assertEqual(codigo, 0)
        a, b = json.loads(con_js), json.loads(sin_js)
        for x, y in zip(a["escenarios"], b["escenarios"]):
            self.assertEqual(x["reglas"], y["reglas"])

    def test_sin_el_archivo_del_esquema_el_informe_avisa_que_no_comprobo_la_forma(self):
        anterior = v.localizar_esquema
        try:
            v.localizar_esquema = lambda explicito=None: None  # simula que no se encuentra el esquema
            codigo, salida, _ = ejecutar([str(ARCHIVO)])
        finally:
            v.localizar_esquema = anterior
        self.assertEqual(codigo, 0)  # las reglas semánticas siguen dando el veredicto esperado
        self.assertIn("NO ENCONTRADO", salida)
        self.assertIn("la forma del documento no se comprobó", salida)
        self.assertIn("NO_EVALUADA", salida)

    def test_el_informe_en_texto_trae_regla_estado_elemento_y_mensaje(self):
        _, salida, _ = ejecutar([str(ARCHIVO)])
        for fragmento in ("Regla", "Estado", "Elemento", "Descripción", "INCUMPLE", "Elemento: Decisión D01",
                          "Mensaje:", "Elemento: Opción OP03", "PROPUESTA", "Código de salida: 0"):
            self.assertIn(fragmento, salida, fragmento)


# ═════════════ 8. Robustez: documentos grandes, nulos y formatos ═════════════
class Robustez(unittest.TestCase):
    def test_un_flujo_de_miles_de_escenas_encadenadas_no_agota_la_pila(self):
        n = 1500
        escenas = []
        for i in range(1, n + 1):
            e = {"id": f"E{i:05d}", "titulo": "t", "descripcion": "d"}
            if i < n:
                e["decision"] = {"id": f"D{i:05d}", "pregunta": "p", "opciones": [
                    {"id": f"OP{2 * i:05d}", "texto": "a", "siguienteEscena": f"E{i + 1:05d}",
                     "clasificacion": "ADECUADA"},
                    {"id": f"OP{2 * i + 1:05d}", "texto": "b", "siguienteEscena": f"E{n:05d}",
                     "clasificacion": "RIESGOSA"}]}
            escenas.append(e)
        doc = {"versionDsl": "1.0", "escenas": escenas,
               "caso": {"id": "CASO-9", "titulo": "t", "descripcion": "d", "version": "1.0.0",
                        "estado": "BORRADOR", "escenaInicial": "E00001"}}
        informe = v.validar_documento(doc, None, usar_jsonschema=False)
        self.assertEqual(estados(informe)["PROP-06"], v.CUMPLE)
        internos = [h for r in informe["reglas"] for h in r["hallazgos"] if h["elemento"] == "(interno)"]
        self.assertEqual(internos, [])

    def test_un_ciclo_se_informa_con_la_opcion_que_lo_cierra(self):
        informe = evaluar(con(m_ciclo))
        encontrados = hallazgos(informe, "PROP-06")
        self.assertEqual([h["elemento"] for h in encontrados], ["Opción OP06"])
        self.assertIn("E01 -> E02 -> E03 -> E01", encontrados[0]["mensaje"])

    def test_los_mensajes_no_muestran_restos_de_python(self):
        for mutacion in (m_siguiente_escena_nula, m_herramienta_nula, m_retro_con_decision_nula):
            informe = evaluar(con(mutacion))
            for regla_ in informe["reglas"]:
                for h in regla_["hallazgos"]:
                    with self.subTest(mutacion=mutacion.__name__, regla=regla_["regla"]):
                        self.assertNotIn("None", h["mensaje"])

    def test_un_valor_nulo_se_informa_una_sola_vez_por_la_forma_cuando_la_regla_no_lo_evalua(self):
        informe = evaluar(con(m_herramienta_nula))
        self.assertEqual(len(hallazgos(informe, "FORMA")), 1)
        self.assertEqual(estados(informe)["OCL-05"], v.CUMPLE)

    def test_decision_nula_no_cuenta_como_punto_de_decision_en_el_esquema(self):
        doc = {"versionDsl": "1.0",
               "escenas": [{"id": "E01", "titulo": "t", "descripcion": "d", "decision": None}]}
        errores = v.InterpreteEsquema(ESQUEMA).errores(doc)
        contains = [e for e in errores if e["palabra"] == "contains"]
        self.assertEqual([(v.ruta_texto(e["ruta"]), e["regla"]) for e in contains], [("escenas", "OCL-08")])
        if jsonschema is not None:
            cruzada = v.comprobacion_cruzada(ESQUEMA, doc, errores)
            self.assertTrue(cruzada["coincide"], cruzada)

    def test_una_decision_sin_la_clave_opciones_se_informa_solo_en_ocl_02(self):
        informe = evaluar(con(lambda d: escena(d, "E01")["decision"].pop("opciones")))
        self.assertEqual(estados(informe)["FORMA"], v.CUMPLE)
        self.assertEqual([h["elemento"] for h in hallazgos(informe, "OCL-02")], ["Decisión D01"])

    def test_ningun_formato_termina_en_un_dolar_que_admita_un_salto_de_linea(self):
        formatos = [d["pattern"] for d in ESQUEMA["$defs"].values()
                    if isinstance(d, dict) and "pattern" in d]
        formatos += [p["pattern"] for d in ESQUEMA["$defs"].values() if isinstance(d, dict)
                     for p in d.get("properties", {}).values() if isinstance(p, dict) and "pattern" in p]
        self.assertGreaterEqual(len(formatos), 17)
        for formato in formatos:
            self.assertFalse(formato.endswith("$"), formato)

    @unittest.skipIf(jsonschema is None, "jsonschema no está instalado")
    def test_un_salto_de_linea_final_tampoco_pasa_el_esquema_oficial(self):
        doc = con(m_id_de_caso_con_salto_de_linea)
        validador = jsonschema.Draft202012Validator(ESQUEMA)
        self.assertEqual([list(e.absolute_path) for e in validador.iter_errors(doc)], [["caso", "id"]])


if __name__ == "__main__":
    unittest.main(verbosity=2)
