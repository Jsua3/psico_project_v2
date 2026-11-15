"""S3-4 · Exportar los datos de una persona (RNF-003): ``services.export_person``.

La exportación contiene TODO lo suyo (la cuenta sin columnas ``SECRET``, membresías, intentos, decisiones, bitácoras descifradas,
evaluaciones recibidas, consentimientos, solicitudes y la auditoría donde fue actor, con su IP y su navegador) y NADA de otra
persona: ni sus marcadores ni su id en una columna que apunte a una persona. Escribir el archivo es cosa del comando; aquí se
prueba el diccionario.

Cada garantía lleva su control negativo: con el alcance ancho, con un hash clasificado distinto o con una bitácora alterada, la
misma afirmación deja de cumplirse.
"""
import json

import pytest
from django.contrib.auth import get_user_model
from django.db.models import Q

from apps.privacy import data_subject, inventory, services
from apps.privacy.data_subject import PERSON_SCOPE, Pertenencia
from apps.privacy.tests.data_subject_support import Entorno, Mundo, volcado
from apps.simulation.models import ReflectionJournal, SimulationAttempt

pytestmark = [pytest.mark.req("RNF-003"), pytest.mark.security, pytest.mark.django_db]

User = get_user_model()

#: Columnas que apuntan a una cuenta: en la exportación de una persona solo pueden valer SU id.
COLUMNAS_QUE_APUNTAN_A_UNA_PERSONA = frozenset({
    "student_id", "estudiante_id", "instructor_id", "profesor_id", "created_by", "last_edited_by", "requested_by",
    "decided_by", "submitted_by", "assigned_by", "invited_by", "replaced_by_id", "actor_id", "person_id",
})


@pytest.fixture
def entorno(db):
    return Entorno()


@pytest.fixture
def mundo(entorno):
    return Mundo("ana", entorno)


@pytest.fixture
def otro(entorno):
    return Mundo("beto", entorno)


def _referencias_a_personas(exportacion):
    for tabla, filas in exportacion["tablas"].items():
        for fila in filas:
            for clave, valor in fila.items():
                if clave in COLUMNAS_QUE_APUNTAN_A_UNA_PERSONA and valor is not None:
                    yield tabla, clave, valor


def _afirmar_solo_su_id(exportacion, persona):
    ajenas = [(t, c, v) for t, c, v in _referencias_a_personas(exportacion) if v != persona.pk]
    assert ajenas == [], f"la exportación trae ids de otras personas: {ajenas}"


# ── Lo que trae ──────────────────────────────────────────────────────────────────────────────────────────────────


def test_la_exportacion_trae_filas_de_cada_tabla_con_dueno(mundo):
    exportacion = services.export_person(mundo.persona)

    assert set(exportacion["tablas"]) == set(PERSON_SCOPE)
    vacias = [tabla for tabla, filas in exportacion["tablas"].items() if not filas]
    assert vacias == [], f"el mundo de la prueba no puebla estas tablas: {vacias}"
    assert exportacion["resumen"] == {
        "filas": sum(len(f) for f in exportacion["tablas"].values()), "tablas": len(PERSON_SCOPE),
    }


def test_trae_el_formato_la_fecha_y_el_id_de_la_persona(mundo):
    exportacion = services.export_person(mundo.persona)

    assert exportacion["formato"] == services.FORMATO_DE_EXPORTACION == 1
    assert exportacion["persona"] == {"id": mundo.persona.pk}
    assert exportacion["generadoEn"][:4].isdigit() and "T" in exportacion["generadoEn"]


def test_los_intentos_salen_con_los_hitos_la_persona_y_el_informe_v3_y_sin_puntaje(mundo):
    exportacion = services.export_person(mundo.persona)

    [mundo_del_intento] = [
        fila for fila in exportacion["tablas"]["attempt_world_states"] if str(fila["attempt_id"]) == str(mundo.attempt.pk)
    ]
    banderas = json.loads(mundo_del_intento["flags_json"])  # columna de texto: sale tal cual, como JSON en una cadena
    assert "milestones" in banderas
    assert set(banderas["persona"]) >= {"bond", "activation"}
    [informe] = [fila for fila in exportacion["tablas"]["attempt_reports"] if str(fila["attempt_id"]) == str(mundo.attempt.pk)]
    congelado = json.loads(informe["report_json"])
    assert congelado["schemaVersion"] == 4
    assert "milestones" in congelado and "persona" in congelado
    # Nada de puntaje en lo que cuenta la persona: ni el intento lo guarda ni el informe lo trae.
    texto = json.dumps(exportacion)
    assert "accumulatedScore" not in texto and "finalScore" not in texto and "finalStress" not in texto
    [intento] = [fila for fila in exportacion["tablas"]["simulation_attempts_v2"] if str(fila["id"]) == str(mundo.attempt.pk)]
    assert not {"accumulated_score", "stress_index", "victim_risk", "user_trust"} & set(intento)


def test_la_cuenta_va_con_sus_datos_pero_sin_la_clave(mundo):
    [cuenta] = services.export_person(mundo.persona)["tablas"]["users"]

    assert cuenta["email"] == mundo.persona.email
    assert cuenta["nombre"] == mundo.persona.nombre and cuenta["apellido"] == mundo.persona.apellido
    assert cuenta["role"] == "PROFESOR" and cuenta["id"] == mundo.persona.pk
    assert "password_hash" not in cuenta


def test_las_reflexiones_salen_descifradas_y_sin_el_texto_cifrado(mundo):
    [bitacora] = services.export_person(mundo.persona)["tablas"]["reflection_journals"]

    assert bitacora["text"] == f"Reflexion {mundo.m['reflexion']}"
    assert bitacora["readable"] is True
    assert "encrypted_text" not in bitacora and "encryption_key_ref" not in bitacora
    cifrado = ReflectionJournal.objects.get(pk=bitacora["id"]).encrypted_text
    assert cifrado not in json.dumps(services.export_person(mundo.persona))


def test_una_bitacora_que_no_se_descifra_sale_marcada_en_vez_de_romper_la_exportacion(mundo):
    ReflectionJournal.objects.filter(attempt__student=mundo.persona).update(encryption_key_ref="llave-que-ya-no-existe")

    [bitacora] = services.export_person(mundo.persona)["tablas"]["reflection_journals"]

    assert bitacora["text"] is None and bitacora["readable"] is False


def test_la_auditoria_donde_fue_actor_sale_con_su_ip_y_su_navegador(mundo):
    filas = services.export_person(mundo.persona)["tablas"]["audit_logs"]

    assert filas and all(f["actor_id"] == mundo.persona.pk for f in filas)
    assert any(f["ip_address"] and f["user_agent"] == f"agente-{mundo.m['agente']}" for f in filas)


def test_las_evaluaciones_recibidas_salen_con_su_texto_y_sin_el_id_del_docente(mundo):
    tablas = services.export_person(mundo.persona)["tablas"]

    [recibida] = [f for f in tablas["rubric_evaluations"] if f["id"] == mundo.evaluacion_recibida.pk]
    assert mundo.m["comentario"] in recibida["comment"]
    assert "instructor_id" not in recibida
    assert any(mundo.m["comentario"] in f["comment"] for f in tablas["criterion_scores"])


def test_lo_que_hizo_como_docente_sale_sin_los_datos_de_las_personas_a_las_que_atendio(mundo):
    tablas = services.export_person(mundo.persona)["tablas"]

    dada = [f for f in tablas["rubric_evaluations"] if f.get("instructor_id") == mundo.persona.pk]
    assert [f["id"] for f in dada] == [mundo.evaluacion_dada.pk]
    assert set(dada[0]) == {"id", "rubric_id", "instructor_id", "status", "origin", "evaluated_at"}  # sin nota ni comentario
    invitadas = [f for f in tablas["grupo_estudiante"] if "estudiante_id" not in f]
    assert invitadas and set(invitadas[0]) == {"grupo_id", "invited_by", "invited_at"}
    sustituido = [f for f in tablas["simulation_attempts_v2"] if f.get("replaced_by_id") == mundo.persona.pk]
    assert [f["id"] for f in sustituido] == [str(mundo.intento_ajeno.pk)]
    assert "attempt_token_hash" not in sustituido[0] and "student_id" not in sustituido[0]
    revisiones = {f["id"]: f for f in tablas["case_reviews"]}
    assert mundo.m["nota"] in revisiones[mundo.revision_propia.pk]["note"]
    assert "note" not in revisiones[mundo.revision_ajena.pk]  # la nota del docente que decidió no es de ella


# ── Lo que NO trae ───────────────────────────────────────────────────────────────────────────────────────────────


def test_nunca_trae_una_columna_secreta_ni_su_valor(mundo):
    exportacion = services.export_person(mundo.persona)
    texto = json.dumps(exportacion)

    secretas = [(tabla, columna) for tabla, columna in inventory.columnas_reales() if inventory.classify(tabla, columna) == inventory.SECRET]
    assert secretas, "el inventario debe tener columnas secretas"
    for tabla, columna in secretas:
        assert all(columna not in fila for fila in exportacion["tablas"].get(tabla, [])), (tabla, columna)
    assert User.objects.get(pk=mundo.persona.pk).password not in texto
    assert mundo.token_del_intento not in texto


def test_no_trae_nada_de_otra_persona(mundo, otro):
    exportacion = services.export_person(mundo.persona)
    texto = json.dumps(exportacion, ensure_ascii=False)

    for clave, valor in otro.m.items():
        assert valor not in texto, f"la exportación trae el marcador «{clave}» de otra persona"
    assert otro.persona.email not in texto
    _afirmar_solo_su_id(exportacion, mundo.persona)


def test_las_notas_y_los_datos_de_otro_docente_sobre_sus_casos_no_salen(mundo):
    texto = json.dumps(services.export_person(mundo.persona), ensure_ascii=False)

    assert mundo.m["nota_ajena"] not in texto
    assert mundo.entorno.docente.email not in texto and mundo.entorno.alumno.email not in texto


def test_una_persona_sin_datos_exporta_solo_su_cuenta():
    nueva = User.objects.create_user(email="sin-datos@example.com", password=None, nombre="Ana", apellido="Nueva", role="ESTUDIANTE")

    exportacion = services.export_person(nueva)

    assert exportacion["resumen"] == {"filas": 1, "tablas": 1}
    assert [tabla for tabla, filas in exportacion["tablas"].items() if filas] == ["users"]


def test_un_intento_que_ella_misma_reemplazo_sale_una_sola_vez(mundo):
    """Una fila que cae en dos papeles (titular y sustituyente) se exporta una sola vez, con el papel más amplio."""
    propio = SimulationAttempt.objects.create(
        attempt_token_hash="hash-de-prueba-" + mundo.m["correo"], case_version=mundo.entorno.version, student=mundo.persona,
        current_node=mundo.entorno.nodo_inicial, status="REPLACED", replaced_by=mundo.persona,
        replace_reason="Reemplazado por nuevo intento",
    )

    filas = services.export_person(mundo.persona)["tablas"]["simulation_attempts_v2"]

    [fila] = [f for f in filas if f["id"] == str(propio.pk)]
    assert sum(1 for f in filas if f["id"] == str(propio.pk)) == 1
    assert fila["student_id"] == mundo.persona.pk and "attempt_token_hash" not in fila


def test_el_ensayo_de_una_docente_sale_en_la_exportacion(mundo):
    """``SimulationAttempt.objects`` oculta los ensayos; privacidad lee por ``_base_manager`` y los ve (con sus hijos)."""
    ensayo = SimulationAttempt.all_objects.create(
        attempt_token_hash="hash-ensayo-" + mundo.m["correo"], case_version=mundo.entorno.version, student=mundo.persona,
        current_node=mundo.entorno.nodo_inicial, is_rehearsal=True,
    )
    assert not SimulationAttempt.objects.filter(pk=ensayo.pk).exists()

    filas = services.export_person(mundo.persona)["tablas"]["simulation_attempts_v2"]

    [fila] = [f for f in filas if f["id"] == str(ensayo.pk)]
    assert fila["student_id"] == mundo.persona.pk and "attempt_token_hash" not in fila


def test_exportar_no_escribe_nada(mundo):
    antes = volcado()

    services.export_person(mundo.persona)

    assert volcado() == antes


def test_la_exportacion_es_json_serializable_y_estable(mundo):
    primera = services.export_person(mundo.persona)
    segunda = services.export_person(mundo.persona)

    assert json.loads(json.dumps(primera)) == primera
    primera.pop("generadoEn"), segunda.pop("generadoEn")
    assert primera == segunda


# ── Controles negativos ──────────────────────────────────────────────────────────────────────────────────────────


def test_control_negativo_con_el_alcance_ancho_sale_lo_de_otra_persona(mundo, otro, monkeypatch):
    exportacion = services.export_person(mundo.persona)
    _afirmar_solo_su_id(exportacion, mundo.persona)  # con el alcance correcto se cumple
    alcance = dict(PERSON_SCOPE)
    alcance["simulation_attempts_v2"] = (Pertenencia("titular", lambda persona: Q()),)
    alcance["users"] = (Pertenencia("titular", lambda persona: Q()),)
    monkeypatch.setattr(data_subject, "PERSON_SCOPE", alcance)

    ancha = services.export_person(mundo.persona)

    with pytest.raises(AssertionError):
        _afirmar_solo_su_id(ancha, mundo.persona)
    assert otro.persona.email in json.dumps(ancha)


def test_control_negativo_si_el_hash_se_clasificara_distinto_saldria_en_la_exportacion(mundo, monkeypatch):
    copia = {**inventory.DATA_INVENTORY, "users": {**inventory.DATA_INVENTORY["users"]}}
    copia["users"]["columns"] = {**copia["users"]["columns"], "password_hash": (inventory.PERSONAL, "clasificada mal a propósito")}
    monkeypatch.setattr(inventory, "DATA_INVENTORY", copia)

    [cuenta] = services.export_person(mundo.persona)["tablas"]["users"]

    assert cuenta["password_hash"] == User.objects.get(pk=mundo.persona.pk).password


def test_control_negativo_sin_el_papel_de_actor_las_evaluaciones_dadas_traerian_los_datos_de_otro(mundo, monkeypatch):
    alcance = dict(PERSON_SCOPE)
    alcance["rubric_evaluations"] = (Pertenencia("evaluador", lambda persona: Q(instructor_id=persona.pk)),)  # sin ``solo``
    monkeypatch.setattr(data_subject, "PERSON_SCOPE", alcance)

    dada = [f for f in services.export_person(mundo.persona)["tablas"]["rubric_evaluations"] if f["id"] == mundo.evaluacion_dada.pk]

    assert dada and "comment" in dada[0], "sin ``solo``, sale el comentario sobre otra persona: ``solo`` es el control"
