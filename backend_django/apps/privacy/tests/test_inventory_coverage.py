"""S3-1 · Inventario de datos clasificado y verificable (cierra RNF-003 y SIEP-RNF-05).

La compuerta: cada columna de cada modelo gestionado tiene una clasificación; cada dato personal, sensible o
secreto tiene su motivo y declara por dónde sale; el documento versionado coincide con el inventario.

Cada control lleva su control negativo: un monkeypatch que lo rompe y la comprobación de que la compuerta
lo ve y lo nombra. Las comprobaciones leen ``inventory.DATA_INVENTORY`` en el momento de la llamada, para que
el monkeypatch les llegue.
"""
import copy
import json
import secrets
from types import SimpleNamespace

import pytest
from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.privacy import inventory
from apps.privacy.inventory import (
    CANALES,
    CON_SALIDAS,
    PERSONAL,
    PUBLIC,
    SECRET,
    SENSITIVE,
    TECHNICAL,
    classify,
    render_markdown,
    salidas,
    stale,
    uncovered,
)
from apps.simulation.models.rubric import AuditLog
from apps.simulation.tests.test_game import assign_case_to_student, case_version_id, cl, estudiante  # noqa: F401
from apps.users.models import AccessRequest
from apps.users.serializers import AccessRequestSerializer, AdminUserSerializer, UserSummarySerializer

pytestmark = [pytest.mark.req("RNF-003", "SIEP-RNF-05"), pytest.mark.security]

User = get_user_model()
BASE = "/api/simulation"

#: Nombres de columna que delatan datos de una persona o de su intento. Una tabla con ``default`` no puede
#: tenerlos: si los tiene, sus columnas se listan una a una y cada una se clasifica.
NOMBRES_SOSPECHOSOS = frozenset({
    "email", "nombre", "apellido", "password", "password_hash", "ip_address", "user_agent", "actor_id",
    "actor_role", "text", "encrypted_text", "context_json", "comment", "note", "reason", "detail",
    "student_id", "estudiante_id", "instructor_id", "profesor_id", "created_by", "last_edited_by",
    "requested_by", "decided_by", "submitted_by", "assigned_by", "invited_by", "content_reviewer",
    "evidence_json", "evidence_note", "report_json", "snapshot_json", "attempt_token_hash", "attempt_id",
    "replace_reason", "player_x", "player_y", "inventory_json", "flags_json",
})

#: Clasificaciones que el inventario debe dar a columnas concretas. Si cambian, algo de la política cambió.
HECHOS = (
    ("users", "email", PERSONAL),
    ("users", "nombre", PERSONAL),
    ("users", "apellido", PERSONAL),
    ("users", "password_hash", SECRET),
    ("reflection_journals", "encrypted_text", SENSITIVE),
    ("audit_logs", "ip_address", PERSONAL),
    ("audit_logs", "user_agent", PERSONAL),
    ("access_requests", "email", PERSONAL),
    ("rate_limit_buckets", "key_hash", TECHNICAL),
)

#: Serializadores de salida de ``users``: no deben exponer la contraseña ni su hash.
SERIALIZADORES_DE_USUARIOS = (UserSummarySerializer, AdminUserSerializer, AccessRequestSerializer)


# ── Comprobaciones (las usan las pruebas y sus controles negativos) ───────────────────────────────────────


def _fallos_de_cobertura():
    return [f"{tabla}.{columna}" for tabla, columna in uncovered()]


def _fallos_de_obsolescencia():
    return [f"{tabla}.{columna}" for tabla, columna in stale()]


def comprobar_cobertura():
    """La compuerta de cobertura: falla nombrando cada columna sin clasificar."""
    fallos = _fallos_de_cobertura()
    assert not fallos, (
        "Columnas sin clasificar (añádelas a DATA_INVENTORY en apps/privacy/inventory.py): " + ", ".join(fallos)
    )


def _tablas_default_sospechosas():
    fallos = []
    for tabla, entrada in inventory.DATA_INVENTORY.items():
        if entrada.get("default") is None:
            continue
        if entrada["default"] not in (PUBLIC, TECHNICAL):
            fallos.append(f"{tabla}: default {entrada['default']} (solo PUBLIC o TECHNICAL)")
        for columna, valor in entrada.get("columns", {}).items():
            clase = valor[0] if isinstance(valor, tuple) else valor
            if clase in CON_SALIDAS:
                fallos.append(f"{tabla}.{columna}: personal o sensible en una tabla con default")
    for tabla, columna in inventory.columnas_reales():
        entrada = inventory.DATA_INVENTORY.get(tabla, {})
        if entrada.get("default") is not None and columna in NOMBRES_SOSPECHOSOS:
            fallos.append(f"{tabla}.{columna}: nombre sospechoso en una tabla con default")
    return fallos


def _hechos_que_no_cuadran():
    fallos = []
    for tabla, columna, esperada in HECHOS:
        try:
            real = classify(tabla, columna)
        except KeyError as error:
            fallos.append(str(error))
            continue
        if real != esperada:
            fallos.append(f"{tabla}.{columna} es {real}, debía ser {esperada}")
    return fallos


def _sin_motivo():
    faltos = []
    for tabla, entrada in inventory.DATA_INVENTORY.items():
        for columna, valor in entrada.get("columns", {}).items():
            clase = valor[0] if isinstance(valor, tuple) else valor
            if clase in CON_SALIDAS and not (isinstance(valor, tuple) and valor[1].strip()):
                faltos.append(f"{tabla}.{columna}")
    return faltos


def _salidas_sin_declarar():
    fallos = []
    for tabla, columna in inventory.columnas_reales():
        entrada = inventory.DATA_INVENTORY.get(tabla)
        if entrada is None:
            continue  # lo dice ``uncovered``
        try:
            clase = classify(tabla, columna)
        except KeyError:
            continue  # lo dice ``uncovered``
        exits = entrada.get("exits", {})
        if clase in CON_SALIDAS and columna not in exits and "*" not in exits:
            fallos.append(f"{tabla}.{columna} ({clase})")
    return fallos


def _canales_desconocidos():
    fallos = []
    for tabla, entrada in inventory.DATA_INVENTORY.items():
        declarados = [*entrada.get("exits", {}).items(), *entrada.get("forbidden_exits", {}).items()]
        for columna, canales in declarados:
            fallos.extend(f"{tabla}.{columna}: {canal}" for canal in canales if canal not in CANALES)
    return fallos


def _salidas_prohibidas_usadas():
    fallos = []
    for tabla, entrada in inventory.DATA_INVENTORY.items():
        for columna, prohibidos in entrada.get("forbidden_exits", {}).items():
            for canal in sorted(set(salidas(tabla, columna)) & set(prohibidos)):
                fallos.append(f"{tabla}.{columna} sale por {canal}, que está prohibido")
    return fallos


def _serializadores_con_hash():
    fallos = []
    for serializador in SERIALIZADORES_DE_USUARIOS:
        campos = serializador.Meta.fields
        if campos == "__all__" or {"password", "password_hash"} & set(campos):
            fallos.append(serializador.__name__)
    return fallos


def _hash_expuesto(datos, usuario):
    """True si el hash de contraseña de ``usuario`` aparece en los datos que sale por un serializador."""
    return usuario.password in json.dumps(datos, default=str)


def _formas_del_texto(texto):
    """El texto tal cual y como lo deja ``json.dumps`` (con las tildes escapadas): la auditoría guarda JSON."""
    return {texto, json.dumps(texto)[1:-1]}


def _filas_de_auditoria_con(texto):
    """(id, columna) de cada campo de cada fila de auditoría que contiene ``texto`` en cualquiera de sus formas."""
    formas = _formas_del_texto(texto)
    hallazgos = []
    for fila in AuditLog.objects.all():
        for campo in AuditLog._meta.concrete_fields:
            valor = getattr(fila, campo.attname)
            if valor is not None and any(forma in str(valor) for forma in formas):
                hallazgos.append((fila.pk, campo.column))
    return hallazgos


def _modelo_falso(tabla, columnas, label):
    campos = [SimpleNamespace(column=columna) for columna in columnas]
    meta = SimpleNamespace(db_table=tabla, managed=True, concrete_fields=campos, label=label, auto_created=False)
    return SimpleNamespace(_meta=meta)


def _con_modelo_extra(monkeypatch, modelo):
    original = django_apps.get_models

    def con_extra(*args, **kwargs):
        return [*original(*args, **kwargs), modelo]

    monkeypatch.setattr(django_apps, "get_models", con_extra)


# ── Pruebas de la compuerta ───────────────────────────────────────────────────────────────────────────────


def test_el_inventario_cubre_cada_columna_real():
    comprobar_cobertura()


def test_no_hay_entradas_obsoletas():
    assert not _fallos_de_obsolescencia(), "Entradas obsoletas en DATA_INVENTORY: " + ", ".join(_fallos_de_obsolescencia())


def test_el_documento_versionado_coincide_con_el_inventario():
    versionado = inventory.DOC_PATH.read_text(encoding="utf-8")
    assert versionado == render_markdown(), (
        "docs/seguridad/inventario-de-datos.md no coincide con el inventario: "
        "regénéralo con `python -m apps.privacy.inventory --write`"
    )


def test_ninguna_tabla_con_default_oculta_un_dato_personal_o_sensible():
    assert not _tablas_default_sospechosas(), "Tablas con default que ocultan datos: " + ", ".join(_tablas_default_sospechosas())


@pytest.mark.parametrize(("tabla", "columna", "clase"), HECHOS)
def test_los_hechos_del_inventario_se_cumplen(tabla, columna, clase):
    assert classify(tabla, columna) == clase


def test_classify_de_una_columna_sin_clasificar_nombra_la_columna():
    with pytest.raises(KeyError, match="users.columna_inventada"):
        classify("users", "columna_inventada")


def test_todo_dato_personal_sensible_o_secreto_tiene_motivo():
    assert not _sin_motivo(), "Columnas sin motivo: " + ", ".join(_sin_motivo())


def test_todo_dato_personal_sensible_o_secreto_declara_por_donde_sale():
    assert not _salidas_sin_declarar(), "Sin salidas declaradas: " + ", ".join(_salidas_sin_declarar())


def test_los_canales_son_los_conocidos():
    assert not _canales_desconocidos(), "Canales desconocidos: " + ", ".join(_canales_desconocidos())


def test_ninguna_salida_usa_un_canal_prohibido():
    assert not _salidas_prohibidas_usadas(), "; ".join(_salidas_prohibidas_usadas())


# ── Serializadores y auditoría con filas reales ───────────────────────────────────────────────────────────


def test_los_serializadores_de_usuarios_no_declaran_la_contrasena():
    assert not _serializadores_con_hash(), "Serializadores con la contraseña: " + ", ".join(_serializadores_con_hash())


@pytest.mark.django_db
def test_los_serializadores_con_una_fila_real_no_sacan_el_hash():
    token = secrets.token_urlsafe(12)
    usuario = User.objects.create_user(
        email=f"{token}@example.com",
        password=secrets.token_urlsafe(24),
        nombre="Ana",
        apellido="Prueba",
        role="ESTUDIANTE",
    )
    solicitud = AccessRequest.objects.create(nombre="Ana", apellido="Prueba", email=f"sol-{token}@example.com")
    assert usuario.password  # el hash que guarda la columna password_hash
    assert not _hash_expuesto(UserSummarySerializer(usuario).data, usuario)
    assert not _hash_expuesto(AdminUserSerializer(usuario).data, usuario)
    assert "password" not in AccessRequestSerializer(solicitud).data


@pytest.mark.django_db
def test_la_bitacora_no_sale_por_la_auditoria(estudiante, case_version_id):  # noqa: F811
    assign_case_to_student(estudiante, case_version_id, "PRIV-S3-1")
    c = cl(estudiante)
    inicio = c.post(f"{BASE}/attempts", {"caseVersionId": case_version_id}, format="json").data["data"]
    texto = "Bitácora " + secrets.token_urlsafe(24)

    resp = c.post(
        f"{BASE}/attempts/{inicio['attemptId']}/reflections",
        {"attemptToken": inicio["attemptToken"], "nodeId": inicio["currentNode"]["id"], "text": texto},
        format="json",
    )

    assert resp.status_code == 200
    assert AuditLog.objects.filter(action="REFLECTION_SAVED", resource_id=str(inicio["attemptId"])).exists()
    assert _filas_de_auditoria_con(texto) == []


@pytest.mark.django_db
def test_el_detector_ve_el_texto_si_queda_en_la_auditoria():
    texto = "Bitácora " + secrets.token_urlsafe(24)
    fila = AuditLog.objects.create(
        action="PRUEBA", context_json=json.dumps({"texto": texto}), retention_until=timezone.now()
    )
    assert _filas_de_auditoria_con(texto) == [(fila.pk, "context_json")]


# ── Controles negativos: cada uno rompe la política a propósito y la compuerta debe verlo ───────────────


def test_control_negativo_columna_nueva_sin_clasificar(monkeypatch):
    _con_modelo_extra(monkeypatch, _modelo_falso("users", ["columna_inventada"], label="users.Falso"))
    with pytest.raises(AssertionError, match="users.columna_inventada"):
        comprobar_cobertura()


def test_control_negativo_entrada_quitada(monkeypatch):
    reducido = {tabla: entrada for tabla, entrada in inventory.DATA_INVENTORY.items() if tabla != "grupos"}
    monkeypatch.setattr(inventory, "DATA_INVENTORY", reducido)
    with pytest.raises(AssertionError, match="grupos"):
        comprobar_cobertura()


def test_control_negativo_entrada_obsoleta(monkeypatch):
    extendido = {
        **inventory.DATA_INVENTORY,
        "tabla_fantasma": {"purpose": "x", "retention": "x", "default": TECHNICAL},
    }
    monkeypatch.setattr(inventory, "DATA_INVENTORY", extendido)
    assert "tabla_fantasma.(tabla)" in _fallos_de_obsolescencia()


def test_control_negativo_default_con_nombre_sospechoso(monkeypatch):
    _con_modelo_extra(monkeypatch, _modelo_falso("scene_maps", ["email"], label="simulation.Falso"))
    assert any(fallo.startswith("scene_maps.email:") for fallo in _tablas_default_sospechosas())


def test_control_negativo_hecho_mal_clasificado(monkeypatch):
    copia = copy.deepcopy(inventory.DATA_INVENTORY)
    copia["users"]["columns"]["email"] = (PUBLIC, "")
    monkeypatch.setattr(inventory, "DATA_INVENTORY", copia)
    assert "users.email es PUBLIC, debía ser PERSONAL" in _hechos_que_no_cuadran()


def test_control_negativo_dato_sin_motivo(monkeypatch):
    copia = copy.deepcopy(inventory.DATA_INVENTORY)
    copia["users"]["columns"]["email"] = PERSONAL
    monkeypatch.setattr(inventory, "DATA_INVENTORY", copia)
    assert "users.email" in _sin_motivo()


def test_control_negativo_salida_prohibida(monkeypatch):
    copia = copy.deepcopy(inventory.DATA_INVENTORY)
    copia["users"]["exits"]["password_hash"] = ["api"]
    monkeypatch.setattr(inventory, "DATA_INVENTORY", copia)
    assert "users.password_hash sale por api, que está prohibido" in _salidas_prohibidas_usadas()


def test_control_negativo_serializador_con_el_hash(monkeypatch):
    monkeypatch.setattr(UserSummarySerializer.Meta, "fields", [*UserSummarySerializer.Meta.fields, "password_hash"])
    assert "UserSummarySerializer" in _serializadores_con_hash()


# ── Modelo de métricas (Tarea 15) ────────────────────────────────────────────────────────────────────────────

#: Columnas que el modelo de métricas retiró: siguen en la tabla hasta la Tarea 16 y no salen por ningún canal.
COLUMNAS_RETIRADAS = (
    ("simulation_attempts_v2", "accumulated_score"),
    ("simulation_attempts_v2", "stress_index"),
    ("simulation_attempts_v2", "victim_risk"),
    ("simulation_attempts_v2", "user_trust"),
    ("simulation_attempts_v2", "institutional_route_activated"),
    ("attempt_events", "score_delta"),
    ("attempt_events", "stress_delta"),
    ("decision_options", "score_delta"),
    ("decision_options", "stress_delta"),
    ("decision_options", "prohibited_penalty"),
    ("rubric_evaluations", "total_score"),
    ("criterion_scores", "score"),
)


def test_la_clase_de_respuesta_y_la_intensidad_son_contenido_del_caso():
    assert classify("decision_options", "response_class") is PUBLIC
    assert classify("simulation_nodes", "intensity") is PUBLIC


def test_el_estado_de_la_persona_y_los_hitos_son_sensibles_y_salen_por_la_api_y_el_reporte():
    assert classify("attempt_world_states", "flags_json") is SENSITIVE
    motivo = inventory.motivo("attempt_world_states", "flags_json")
    assert "hitos" in motivo and "persona" in motivo
    assert salidas("attempt_world_states", "flags_json") == ["api", "reporte"]
    motivo_del_informe = inventory.motivo("attempt_reports", "report_json")
    assert all(palabra in motivo_del_informe for palabra in ("hitos", "persona", "motivo del final"))


@pytest.mark.parametrize(("tabla", "columna"), COLUMNAS_RETIRADAS)
def test_las_columnas_retiradas_no_declaran_ninguna_salida(tabla, columna):
    assert salidas(tabla, columna) == []
    assert tabla in inventory.DATA_INVENTORY and columna in inventory.DATA_INVENTORY[tabla]["exits"]


@pytest.mark.parametrize(
    ("tabla", "columna"), [par for par in COLUMNAS_RETIRADAS if par[0] in {"simulation_attempts_v2", "attempt_events"}],
)
def test_las_columnas_retiradas_conservan_su_clase_y_dicen_por_que_no_salen(tabla, columna):
    assert classify(tabla, columna) is SENSITIVE
    assert "retirado por el modelo de métricas; columna hasta la Tarea 16" in inventory.motivo(tabla, columna)


@pytest.mark.parametrize(("tabla", "columna"), [("rubric_evaluations", "total_score"), ("criterion_scores", "score")])
def test_el_puntaje_de_la_evaluacion_docente_es_interno(tabla, columna):
    assert "interno: el DTO sirve solo el nivel" in inventory.motivo(tabla, columna)
