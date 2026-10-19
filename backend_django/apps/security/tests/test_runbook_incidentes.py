"""Ensayo en seco del runbook de incidentes (S7-5; RNF-007, SIEP-RNF-02).

``docs/seguridad/incidentes.md`` promete unos pasos para cada incidente. Aquí se siguen esos pasos con el cliente de pruebas y
los comandos de gestión, y se comprueba el efecto. Cada prueba dice en su docstring qué fila del runbook ensaya.

Control negativo: cada escenario tiene una prueba ``test_control_negativo_*`` que apaga su control y exige que el ensayo se
ponga en rojo. Y el documento solo puede citar comandos, rutas, variables, códigos, etiquetas de auditoría y archivos que
existan: ``test_el_runbook_solo_cita...`` y sus casos con un nombre inventado.
"""
import io
import json
import logging
import re
import secrets
from datetime import timedelta
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.db import DatabaseError, connection, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from apps.privacy import consent_service
from apps.privacy.tests.support import asignar_caso, version_publicada
from apps.security import limiter
from apps.simulation.models import AuditLog
from apps.simulation.services.audit_service import AUDIT_TAXONOMY
from apps.users.services import account_service

pytestmark = [pytest.mark.req("RNF-007", "SIEP-RNF-02"), pytest.mark.security]

User = get_user_model()
BACKEND = Path(__file__).resolve().parents[3]
RAIZ = Path(__file__).resolve().parents[4]
RUNBOOK = RAIZ / "docs" / "seguridad" / "incidentes.md"
INVENTARIO = BACKEND / "shared" / "surface-inventory.json"

LOGIN = "/api/auth/login"
ME = "/api/auth/me"
CAMBIAR_CLAVE = "/api/auth/change-password"
AUDITORIA = "/api/admin/audit"
CASOS = "/api/simulation/cases"
BASE = "/api/simulation"
CABECERA_DEL_INTENTO = "HTTP_X_SIEP_ATTEMPT_TOKEN"
IP_DE_LA_PERSONA = "198.51.100.10"
#: Una temporal fijada hace 400 días caduca con el plazo por defecto (SIEP_TEMP_PASSWORD_DAYS = 7). A propósito no depende
#: del plazo configurado: así el control negativo (plazo enorme) sí deja entrar a la temporal vencida.
ANTIGUEDAD_DE_TEMPORAL_VENCIDA = timedelta(days=400)


@pytest.fixture
def reloj(monkeypatch):
    """Congela el reloj del limitador: sus ventanas no caducan a mitad de la prueba."""
    instante = {"t": 1_800_000_000.0}
    monkeypatch.setattr(limiter, "_now", lambda: instante["t"])
    return instante


@pytest.fixture
def limitador(settings):
    """El limitador encendido (en las pruebas va apagado por defecto)."""
    settings.SIEP_THROTTLE_ENABLED = True
    return settings


# ── Ayudantes ──────────────────────────────────────────────────────────────────────────────────────────────────────────


def _cuenta(rol, etiqueta):
    """Una cuenta con una clave que genera esta ejecución (nunca un literal). Devuelve ``(persona, clave)``."""
    clave = secrets.token_urlsafe(24)
    persona = User.objects.create_user(
        email=f"{etiqueta}.{secrets.token_hex(4)}@example.com",
        password=clave,
        nombre="Prueba",
        apellido=etiqueta.capitalize(),
        role=rol,
    )
    return persona, clave


def _entra(persona, clave, ip=IP_DE_LA_PERSONA):
    return APIClient().post(LOGIN, {"email": persona.email, "password": clave}, format="json", REMOTE_ADDR=ip)


def _token(persona, clave, ip=IP_DE_LA_PERSONA):
    respuesta = _entra(persona, clave, ip)
    assert respuesta.status_code == 200, f"el inicio de sesión debe dar 200 y dio {respuesta.status_code}"
    return respuesta.data["data"]["token"]


def _como(token):
    cliente = APIClient()
    cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return cliente


def _auditoria(api, **filtros):
    respuesta = api.get(AUDITORIA, filtros)
    assert respuesta.status_code == 200, respuesta.data
    return respuesta.data["data"]["items"]


def _la_base_rechaza(sentencia, parametros):
    """``True`` si PostgreSQL rechaza la sentencia (el trigger de S4-2). El fallo se deshace en un punto de guardado."""
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(sentencia, parametros)
    except DatabaseError:
        return True
    return False


# ── Fila 1 del runbook: una cuenta parece comprometida ─────────────────────────────────────────────────────────────────


def _ensayo_cuenta_comprometida():
    admin, clave_admin = _cuenta("ADMIN", "admin")
    ana, clave_ana = _cuenta("ESTUDIANTE", "ana")
    beto, clave_beto = _cuenta("ESTUDIANTE", "beto")
    api_admin = _como(_token(admin, clave_admin))
    token_ana = _token(ana, clave_ana)
    token_beto = _token(beto, clave_beto)

    # Paso 1: cerrar las sesiones de la persona. Su token de antes deja de servir; el de otra persona, no.
    respuesta = api_admin.post(f"/api/admin/users/{ana.pk}/revoke-sessions")
    assert respuesta.status_code == 200, respuesta.data
    viejo = _como(token_ana).get(ME)
    assert viejo.status_code == 401 and viejo.data["code"] == "TOKEN_INVALID", (
        "el token revocado debe dar 401 TOKEN_INVALID"
    )
    assert _como(token_beto).get(ME).status_code == 200, "cerrar las sesiones de ana no toca las de beto"

    # Paso 2: cambiar la clave (PUT). La anterior ya no entra y la temporal nueva sí.
    nueva = secrets.token_urlsafe(24)
    respuesta = api_admin.put(
        f"/api/admin/users/{ana.pk}",
        {"email": ana.email, "nombre": ana.nombre, "apellido": ana.apellido, "role": "ESTUDIANTE", "password": nueva},
        format="json",
    )
    assert respuesta.status_code == 200, respuesta.data
    assert _entra(ana, clave_ana).status_code == 401, "la clave anterior ya no debe entrar"
    assert _entra(ana, nueva).status_code == 200, "la clave temporal que fijó el ADMIN debe entrar"

    # Paso 3: desactivar la cuenta. Ya no puede entrar.
    respuesta = api_admin.patch(f"/api/admin/users/{ana.pk}/status", {"activo": False}, format="json")
    assert respuesta.status_code == 200, respuesta.data
    assert _entra(ana, nueva).status_code == 401, "una cuenta desactivada no debe entrar"

    # Paso 4: la auditoría tiene el rastro: sesion.revocar y usuario.estado sobre la cuenta de ana.
    for accion in ("sesion.revocar", "usuario.estado"):
        filas = _auditoria(api_admin, actorId=admin.pk, action=accion)
        assert any(fila["resourceId"] == str(ana.pk) for fila in filas), f"falta {accion} sobre la cuenta de ana"


@pytest.mark.django_db
def test_fila_1_cuenta_comprometida_se_cierra_se_cambia_y_se_desactiva():
    """Ensaya la fila 1 del runbook («Una cuenta parece comprometida») con sus cuatro pasos."""
    _ensayo_cuenta_comprometida()


@pytest.mark.django_db
def test_control_negativo_fila_1_sin_la_bandera_de_sesion_el_token_revocado_sigue_valiendo(settings):
    """Control negativo de la fila 1: con SIEP_SESSION_EPOCH_ENFORCE apagada, el token revocado sigue dando 200."""
    settings.SIEP_SESSION_EPOCH_ENFORCE = False
    with pytest.raises(AssertionError, match="token revocado"):
        _ensayo_cuenta_comprometida()


# ── Fila 2 del runbook: una persona perdió el acceso o su temporal caducó ──────────────────────────────────────────────


def _ensayo_persona_sin_acceso():
    admin, clave_admin = _cuenta("ADMIN", "soporte")
    persona, clave = _cuenta("ESTUDIANTE", "olvidada")
    # Su temporal se fijó hace mucho: ya caducó con el plazo por defecto.
    User.objects.filter(pk=persona.pk).update(
        must_change_password=True,
        temp_password_set_at=timezone.now() - ANTIGUEDAD_DE_TEMPORAL_VENCIDA,
    )
    assert _entra(persona, clave).status_code == 401, "una temporal caducada no entra"
    persona.refresh_from_db()
    assert persona.is_pending_approval, "la cuenta vuelve a «pendiente»"

    # Activarla desde el ADMIN aprueba la cuenta y manda una temporal nueva por correo.
    api_admin = _como(_token(admin, clave_admin))
    respuesta = api_admin.patch(f"/api/admin/users/{persona.pk}/status", {"activo": True}, format="json")
    assert respuesta.status_code == 200, respuesta.data
    correos = [mensaje for mensaje in mail.outbox if persona.email in mensaje.to]
    assert correos, "la aprobación debe mandar la temporal por correo"
    encontrada = re.search(r"Contraseña temporal: (\S+)", correos[-1].body)
    assert encontrada, "el correo trae la contraseña temporal"
    temporal = encontrada.group(1)

    entrada = _entra(persona, temporal)
    assert entrada.status_code == 200, "la temporal del correo debe entrar"
    token = entrada.data["data"]["token"]
    bloqueada = _como(token).get(CASOS)
    assert bloqueada.status_code == 403 and bloqueada.data["code"] == "PASSWORD_CHANGE_REQUIRED", (
        "con la temporal solo se puede cambiar la clave"
    )
    nueva = secrets.token_urlsafe(24)
    cambio = _como(token).post(CAMBIAR_CLAVE, {"currentPassword": temporal, "newPassword": nueva}, format="json")
    assert cambio.status_code == 200, cambio.data
    assert _como(cambio.data["data"]["token"]).get(CASOS).status_code == 200, "tras cambiarla, la persona opera"


@pytest.mark.django_db
def test_fila_2_temporal_caducada_se_recupera_activando_la_cuenta():
    """Ensaya la fila 2 del runbook («Una persona perdió el acceso o su clave temporal caducó»)."""
    _ensayo_persona_sin_acceso()


@pytest.mark.django_db
def test_control_negativo_fila_2_sin_caducidad_la_temporal_sigue_entrando(settings):
    """Control negativo de la fila 2: sin caducidad (plazo enorme), la temporal vencida sigue entrando."""
    settings.SIEP_TEMP_PASSWORD_DAYS = 10_000
    with pytest.raises(AssertionError, match="temporal caducada"):
        _ensayo_persona_sin_acceso()


# ── Fila 3 del runbook: el único ADMIN perdió su clave ─────────────────────────────────────────────────────────────────


def _ensayo_unico_admin(monkeypatch):
    admin, clave_0 = _cuenta("ADMIN", "unico")
    # Su clave temporal se fijó hoy: entra y obtiene una sesión que luego quedará vieja.
    User.objects.filter(pk=admin.pk).update(must_change_password=True, temp_password_set_at=timezone.now())
    token_viejo = _token(admin, clave_0)

    # La temporal caduca antes del primer cambio: ya no entra. El ADMIN no pasa a «pendiente».
    User.objects.filter(pk=admin.pk).update(temp_password_set_at=timezone.now() - ANTIGUEDAD_DE_TEMPORAL_VENCIDA)
    assert _entra(admin, clave_0).status_code == 401, "una temporal caducada no entra"
    admin.refresh_from_db()
    assert admin.activo and admin.role == "ADMIN", "el ADMIN sigue activo: su clave caducada solo deja de servir"

    # Paso 1: create_admin --reset, con la clave en la variable de entorno (nunca como argumento).
    clave_1 = secrets.token_urlsafe(24)
    monkeypatch.setenv("SIEP_ADMIN_PASSWORD", clave_1)
    salida = io.StringIO()
    call_command("create_admin", "--reset", "--email", admin.email, stdout=salida)
    texto = salida.getvalue()
    assert "Administrador repuesto" in texto, texto
    assert clave_1 not in texto and admin.email not in texto, "la salida no trae la clave ni el correo"

    # Paso 2: entra con la temporal nueva, pero solo puede cambiar la clave hasta hacerlo.
    entrada = _entra(admin, clave_1)
    assert entrada.status_code == 200, entrada.data
    token_nuevo = entrada.data["data"]["token"]
    bloqueada = _como(token_nuevo).get("/api/admin/users")
    assert bloqueada.status_code == 403 and bloqueada.data["code"] == "PASSWORD_CHANGE_REQUIRED", (
        "con la temporal nueva debe cambiarla antes de seguir"
    )

    # Paso 3: los tokens de antes de la reposición ya no sirven.
    viejo = _como(token_viejo).get(ME)
    assert viejo.status_code == 401 and viejo.data["code"] == "TOKEN_INVALID", (
        "los tokens de antes de la reposición deben dar 401"
    )

    clave_2 = secrets.token_urlsafe(24)
    cambio = _como(token_nuevo).post(CAMBIAR_CLAVE, {"currentPassword": clave_1, "newPassword": clave_2}, format="json")
    assert cambio.status_code == 200, cambio.data
    api_admin = _como(cambio.data["data"]["token"])
    assert api_admin.get("/api/admin/users").status_code == 200, "tras cambiarla, el ADMIN vuelve a operar"
    # El comando no tiene petición ni actor: la fila nombra la cuenta repuesta en el recurso y en el contexto.
    filas = _auditoria(api_admin, action="usuario.reponer_admin")
    assert any(
        fila["resourceId"] == str(admin.pk) and fila["context"].get("targetId") == admin.pk for fila in filas
    ), "la reposición queda en la auditoría"


@pytest.mark.django_db
def test_fila_3_unico_admin_sin_clave_se_repone_con_create_admin(monkeypatch):
    """Ensaya la fila 3 del runbook («El único ADMIN perdió su clave»): caducada no entra; create_admin --reset repone."""
    _ensayo_unico_admin(monkeypatch)


@pytest.mark.django_db
def test_control_negativo_fila_3_sin_revocar_al_reponer_el_token_viejo_sigue(monkeypatch):
    """Control negativo de la fila 3: si la reposición no cierra las sesiones, el token de antes sigue dando 200."""
    monkeypatch.setattr(account_service, "revoke_sessions", lambda user_id: None)
    with pytest.raises(AssertionError, match="antes de la reposici"):
        _ensayo_unico_admin(monkeypatch)


# ── Fila 5 del runbook: alguien está probando contraseñas ──────────────────────────────────────────────────────────────


def _ensayo_fuerza_bruta(caplog):
    admin, clave_admin = _cuenta("ADMIN", "vigia")
    persona, clave = _cuenta("ESTUDIANTE", "atacada")
    ip = "198.51.100.77"
    fallos = [_entra(persona, secrets.token_urlsafe(16), ip).status_code for _ in range(5)]
    assert fallos == [401] * 5, "los cinco primeros fallos dan 401"

    with caplog.at_level(logging.INFO, logger="siep.security"):
        sexto = _entra(persona, secrets.token_urlsafe(16), ip)
    assert sexto.status_code == 429 and sexto.data["code"] == "THROTTLED", "el sexto intento da 429 THROTTLED"
    eventos = [
        registro.fields
        for registro in caplog.records
        if registro.name == "siep.security" and getattr(registro, "fields", {}).get("event") == "account_throttled"
    ]
    assert eventos == [{"event": "account_throttled", "scope": "login_fail_account_ip", "actor_id": persona.pk}], (
        "el registro trae la cuenta por su id"
    )
    assert persona.email not in str(eventos), "el registro no lleva el correo"
    assert _entra(persona, clave, ip).status_code == 429, "con la cuenta bloqueada, ni la clave buena entra"

    api_admin = _como(_token(admin, clave_admin))
    bloqueos = _auditoria(api_admin, action="sesion.bloquear")
    assert any(fila["resourceId"] == str(persona.pk) for fila in bloqueos), "la auditoría anota el bloqueo"

    # Paso 2: unblock_login levanta el bloqueo de esa cuenta y de esa IP; la clave buena vuelve a entrar.
    salida = io.StringIO()
    call_command("unblock_login", "--email", persona.email, "--ip", ip, stdout=salida)
    assert persona.email not in salida.getvalue(), "el comando no imprime el correo"
    assert _entra(persona, clave, ip).status_code == 200, "tras levantar el bloqueo, la clave buena entra"


@pytest.mark.django_db
def test_fila_5_probar_contrasenas_se_bloquea_y_unblock_login_lo_levanta(limitador, reloj, caplog):
    """Ensaya la fila 5 del runbook («Alguien está probando contraseñas»): 429 THROTTLED, registro sin correo y desbloqueo."""
    _ensayo_fuerza_bruta(caplog)


@pytest.mark.django_db
def test_control_negativo_fila_5_sin_limitador_no_hay_429(settings, reloj, caplog):
    """Control negativo de la fila 5: con el limitador apagado, el sexto intento no da 429."""
    settings.SIEP_THROTTLE_ENABLED = False
    with pytest.raises(AssertionError, match="sexto intento"):
        _ensayo_fuerza_bruta(caplog)


# ── Fila 6 del runbook: hay que apagar una función ya ──────────────────────────────────────────────────────────────────


def _ensayo_bandera_del_consentimiento(ajustes):
    estudiante, clave = _cuenta("ESTUDIANTE", "mundo")
    version = version_publicada()
    asignar_caso(estudiante, version)
    api = _como(_token(estudiante, clave))
    ajustes.SIEP_CONSENT_REQUIRED = False
    inicio = api.post(f"{BASE}/attempts", {"caseVersionId": version.id}, format="json")
    assert inicio.status_code == 200, inicio.data
    ruta = f"{BASE}/attempts/{inicio.data['data']['attemptId']}"
    token_intento = inicio.data["data"]["attemptToken"]
    cabecera = {CABECERA_DEL_INTENTO: token_intento}
    cuerpo = {"attemptToken": token_intento}

    # Con la bandera apagada, el mundo abre.
    assert api.get(f"{ruta}/world", **cabecera).status_code == 200, "con la bandera apagada el mundo abre"

    # Con la bandera encendida, el mundo pide el consentimiento; la pausa y reanudar no.
    ajustes.SIEP_CONSENT_REQUIRED = True
    mundo = api.get(f"{ruta}/world", **cabecera)
    assert mundo.status_code == 403 and mundo.data["code"] == "CONSENT_REQUIRED", (
        "con la bandera encendida, el mundo da 403 CONSENT_REQUIRED"
    )
    assert api.post(f"{ruta}/safe-exit", cuerpo, format="json").status_code == 200, "la pausa funciona encendida"
    assert api.post(f"{ruta}/resume", cuerpo, format="json").status_code == 200, "reanudar funciona encendida"

    # Apagada otra vez: la pausa sigue funcionando.
    ajustes.SIEP_CONSENT_REQUIRED = False
    assert api.post(f"{ruta}/safe-exit", cuerpo, format="json").status_code == 200, "la pausa funciona apagada"


@pytest.mark.django_db
def test_fila_6_bandera_del_consentimiento_encender_y_apagar(settings):
    """Ensaya la fila 6 del runbook (bandera y pausa): SIEP_CONSENT_REQUIRED da 403 encendida, abre apagada, y la pausa va."""
    _ensayo_bandera_del_consentimiento(settings)


@pytest.mark.django_db
def test_control_negativo_fila_6_sin_la_exigencia_el_mundo_abre_encendido(settings, monkeypatch):
    """Control negativo de la fila 6: si la exigencia del consentimiento desaparece, el mundo abre con la bandera encendida."""
    monkeypatch.setattr(consent_service, "require_consent", lambda *args, **kwargs: None)
    with pytest.raises(AssertionError, match="403 CONSENT_REQUIRED"):
        _ensayo_bandera_del_consentimiento(settings)


# ── Fila 7 del runbook: hay que entregar evidencia ─────────────────────────────────────────────────────────────────────


def _ensayo_evidencia():
    admin, clave_admin = _cuenta("ADMIN", "auditor")
    ana, clave_ana = _cuenta("ESTUDIANTE", "evidencia")
    api_admin = _como(_token(admin, clave_admin))
    assert _entra(ana, secrets.token_urlsafe(16)).status_code == 401, "un fallo de acceso queda en la auditoría"
    assert api_admin.post(f"/api/admin/users/{ana.pk}/revoke-sessions").status_code == 200

    # Paso 1: GET /api/admin/audit con filtro por actor y por acción devuelve lo que promete el runbook.
    filas = _auditoria(api_admin, actorId=admin.pk, page=1, pageSize=50)
    assert filas and all(fila["actorId"] == admin.pk for fila in filas), "el filtro por actor solo trae sus filas"
    fallos = _auditoria(api_admin, action="sesion.fallar")
    assert any(fila["resourceId"] == str(ana.pk) for fila in fallos), "el fallo de ana queda en sesion.fallar"
    cuerpo = api_admin.get(AUDITORIA, {"pageSize": 200}).content.decode("utf-8")
    secretos = (admin.email, ana.email, clave_admin, clave_ana)
    assert not any(valor in cuerpo for valor in secretos), "la auditoría no trae correos ni claves"

    # Paso 2: security_report --days 1 da recuentos, sin correos ni claves.
    salida = io.StringIO()
    call_command("security_report", "--days", "1", stdout=salida)
    informe = salida.getvalue()
    recuento = re.search(r"Fallos de inicio de sesión: (\d+)", informe)
    assert recuento and int(recuento.group(1)) >= 1, "el informe cuenta el fallo de inicio de sesión"
    assert not any(valor in informe for valor in (admin.email, ana.email, clave_admin, clave_ana)), (
        "el informe no trae correos ni claves"
    )

    # Paso 3: audit_logs es de solo añadir: UPDATE y DELETE fallan (S4-2).
    fila = AuditLog.objects.filter(actor_id=admin.pk).order_by("pk").first()
    assert fila is not None, "la auditoría tiene filas del ADMIN"
    assert _la_base_rechaza("UPDATE audit_logs SET action = action WHERE id = %s", [fila.pk]), (
        "UPDATE sobre audit_logs debe fallar"
    )
    assert _la_base_rechaza("DELETE FROM audit_logs WHERE id = %s", [fila.pk]), "DELETE sobre audit_logs debe fallar"


@pytest.mark.django_db
def test_fila_7_evidencia_filtrada_sin_datos_personales_y_de_solo_anadir():
    """Ensaya la fila 7 del runbook («Hay que entregar evidencia»): la API con filtros, security_report y el trigger S4-2."""
    _ensayo_evidencia()


@pytest.mark.django_db
def test_control_negativo_fila_7_sin_el_trigger_la_auditoria_se_reescribe():
    """Control negativo de la fila 7: sin el trigger de la migración 0026, la base deja reescribir audit_logs."""
    with connection.cursor() as cursor:
        cursor.execute("ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_append_only")
    with pytest.raises(AssertionError, match="UPDATE sobre audit_logs"):
        _ensayo_evidencia()


# ── El documento: solo cita lo que existe ──────────────────────────────────────────────────────────────────────────────

_COMANDO = re.compile(r"manage\.py\s+([a-z_]+)")
_RUTA = re.compile(r"(?:\b(GET|POST|PUT|PATCH|DELETE)\s+)?(/api/[^\s`'\"),;]+)")
_NOMBRE_EN_MAYUSCULAS = re.compile(r"`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)(?:=[^`]*)?`")
_ETIQUETA_DE_AUDITORIA = re.compile(r"`([a-z]+\.[a-z_]+)`")
_ARCHIVO_CITADO = re.compile(r"`((?:docs|backend_django|scripts|frontend)/[^`\s]+)`")
_EXTENSIONES = frozenset({"md", "py", "json", "sql", "mjs", "js", "ts", "txt", "html", "yml", "yaml", "csv", "log", "env"})
_SECCIONES = ("Primero, esto", "Si pasa X, haz Y", "Quién decide y a quién se avisa", "Qué NO hacer", "Ensayo")


def _forma(ruta):
    """La ruta con sus parámetros reducidos a «<>»: ``/api/admin/users/{id}`` = ``api/admin/users/<int:user_id>``."""
    partes = ruta.split("?", 1)[0].rstrip(".").strip("/").split("/")
    return "/".join("<>" if re.fullmatch(r"\{[^}]*\}|<[^>]*>|:\w+", parte) else parte for parte in partes)


def _rutas_del_inventario():
    filas = json.loads(INVENTARIO.read_text(encoding="utf-8"))["routes"]
    return {(fila["method"], _forma(fila["route"])) for fila in filas}


def _codigo_de_produccion():
    """El texto del código del backend que corre en producción (sin pruebas ni migraciones)."""
    trozos = []
    for carpeta in ("apps", "shared", "psychosim"):
        for ruta in (BACKEND / carpeta).rglob("*.py"):
            if {"tests", "migrations", "__pycache__"} & set(ruta.parts):
                continue
            trozos.append(ruta.read_text(encoding="utf-8"))
    return "\n".join(trozos)


def _problemas(texto):
    """Lo que el documento cita y el código no tiene: comandos, rutas, variables, códigos, etiquetas y archivos."""
    problemas = []
    for nombre in sorted(set(_COMANDO.findall(texto))):
        if not list(BACKEND.glob(f"apps/*/management/commands/{nombre}.py")):
            problemas.append(f"comando: {nombre}")
    inventario = _rutas_del_inventario()
    for metodo, ruta in _RUTA.findall(texto):
        forma = _forma(ruta)
        existe = (metodo, forma) in inventario if metodo else any(forma == f for _, f in inventario)
        if not existe:
            problemas.append(f"ruta: {metodo + ' ' if metodo else ''}{ruta}")
    codigo = _codigo_de_produccion()
    for nombre in sorted(set(_NOMBRE_EN_MAYUSCULAS.findall(texto))):
        if not re.search(rf"(?<![A-Z0-9_]){nombre}(?![A-Z0-9_])", codigo):
            problemas.append(f"variable: {nombre}")
    etiquetas = set(AUDIT_TAXONOMY.values())
    for etiqueta in sorted(set(_ETIQUETA_DE_AUDITORIA.findall(texto))):
        if etiqueta.rsplit(".", 1)[1] not in _EXTENSIONES and etiqueta not in etiquetas:
            problemas.append(f"etiqueta: {etiqueta}")
    for archivo in sorted(set(_ARCHIVO_CITADO.findall(texto))):
        if not (RAIZ / archivo).exists():
            problemas.append(f"archivo: {archivo}")
    return problemas


def test_el_runbook_solo_cita_comandos_rutas_variables_etiquetas_y_archivos_que_existen():
    texto = RUNBOOK.read_text(encoding="utf-8")
    assert len(set(_COMANDO.findall(texto))) >= 5, "el documento debe citar comandos (si no, la comprobación no dice nada)"
    assert len(_RUTA.findall(texto)) >= 5, "el documento debe citar rutas de la API"
    assert _problemas(texto) == [], "el documento cita algo que no existe en el código"


@pytest.mark.parametrize(
    ("linea", "esperado"),
    [
        ("python manage.py comando_inventado_runbook", "comando: comando_inventado_runbook"),
        ("`GET /api/admin/usuarios-inventados/{id}`", "ruta: GET /api/admin/usuarios-inventados/{id}"),
        ("`SIEP_BANDERA_INVENTADA=false`", "variable: SIEP_BANDERA_INVENTADA"),
        ("`sesion.inventar`", "etiqueta: sesion.inventar"),
    ],
)
def test_control_negativo_un_nombre_inventado_se_marca(linea, esperado):
    """Control negativo: una copia del runbook con un comando, una ruta, una variable o una etiqueta inventados se marca."""
    texto = RUNBOOK.read_text(encoding="utf-8") + f"\n\n{linea}\n"
    assert esperado in _problemas(texto)


def test_el_runbook_tiene_sus_cinco_partes_y_no_trae_datos_reales():
    texto = RUNBOOK.read_text(encoding="utf-8")
    for seccion in _SECCIONES:
        assert re.search(rf"^#+ .*{re.escape(seccion)}", texto, re.MULTILINE), f"falta la sección «{seccion}»"
    assert re.findall(r"[\w.+-]+@[\w-]+\.[\w.-]+", texto) == [], "el runbook no lleva correos reales"
    assert re.search(r"[A-Za-z0-9_\-]{40,}", texto) is None, "ningún valor con pinta de llave o de token"
