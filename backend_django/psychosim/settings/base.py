"""Shared Django settings for the PsychoSim (SIEP) backend.

Django owns the PostgreSQL schema: every table is created and evolved by the
migrations of each app (E0-8); the constraints that production enforces live in
the models' ``Meta`` and are pinned by ``test_schema_contract.py``.
"""
import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY", "django-insecure-change-in-production"
)

INSTALLED_APPS = [
    # auth + contenttypes are required by djangorestframework-simplejwt (it
    # imports django.contrib.auth.models at load time). Our user model is custom
    # (no PermissionsMixin); these apps only add Django's small housekeeping
    # tables (content_type/permission). The running server never auto-creates
    # tables (only migrate does).
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "drf_spectacular",
    "apps.users",
    "apps.grupos",
    "apps.simulation",
    "apps.reportes",
    "apps.progression",
]

MIDDLEWARE = [
    # Primero: cubre toda la cadena para medir la duración y fijar X-Request-Id.
    "shared.middleware.RequestContextMiddleware",
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise sirve los estáticos del SPA (Angular) y del backend en
    # producción sin necesidad de un servidor web aparte.
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    # Binds the request to a thread-local for audit-trail actor/IP capture.
    "apps.simulation.middleware.AuditContextMiddleware",
]

ROOT_URLCONF = "psychosim.urls"
WSGI_APPLICATION = "psychosim.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]
AUTH_USER_MODEL = "users.CustomUser"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# En Railway (y otros PaaS) la base de datos se inyecta como DATABASE_URL.
# Si existe, se usa; si no, se arma con las variables DB_* (desarrollo local).
_DATABASE_URL = os.environ.get("DATABASE_URL")
if _DATABASE_URL:
    import dj_database_url

    DATABASES = {
        "default": dj_database_url.parse(
            _DATABASE_URL, conn_max_age=600, conn_health_checks=True
        ),
    }
    # Sin tope, una BD inalcanzable bloquea /api/health ~130 s (el valor por defecto de
    # psycopg) y gunicorn mata el worker a los 120 s.
    DATABASES["default"].setdefault("OPTIONS", {}).setdefault("connect_timeout", 5)
    DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("DB_NAME", "psychosim"),
            "USER": os.environ.get("DB_USER", "psychosim"),
            "PASSWORD": os.environ.get("DB_PASSWORD", "psychosim_secret"),
            "HOST": os.environ.get("DB_HOST", "localhost"),
            "PORT": os.environ.get("DB_PORT", "5433"),
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {"connect_timeout": 5},
        }
    }

# Spring uses BCrypt ($2a/$2b). Keep BCrypt first so newly created users are
# written in a format Spring can also verify; CustomUser.check_password also
# handles raw BCrypt hashes already present in the Flyway-seeded ``users`` table.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.BCryptPasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        # JWT + el cambio de contraseña obligatorio de las cuentas aprobadas (E2-9).
        "apps.users.authentication.SiepJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    # JSON solo como objeto (``request.data.get`` es la norma de las vistas) + formularios.
    "DEFAULT_PARSER_CLASSES": [
        "shared.parsers.ObjectJSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "DEFAULT_SCHEMA_CLASS": "shared.openapi.SiepAutoSchema",
    "EXCEPTION_HANDLER": "shared.exceptions.custom_exception_handler",
}

# La revisión del caso puede viajar en la cabecera ``X-Case-Revision`` (E2-6): con el frontend en
# otro origen el navegador hace antes una consulta de verificación (preflight) y debe constar.
from corsheaders.defaults import default_headers  # noqa: E402

CORS_ALLOW_HEADERS = (*default_headers, "x-case-revision")

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        hours=int(os.environ.get("JWT_EXPIRATION_HOURS", "8"))
    ),
    "TOKEN_OBTAIN_SERIALIZER": "apps.users.serializers.PsychoSimTokenObtainSerializer",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "userId",
}

# Reflection-at-rest encryption key (defaults to the JWT secret, like Spring's
# simulation.reflection.encryption-key:${jwt.secret}).
JWT_SECRET = os.environ.get(
    "JWT_SECRET",
    "psychosim-jwt-secret-key-must-be-at-least-256-bits-long-for-hs256",
)
REFLECTION_ENCRYPTION_KEY = os.environ.get("REFLECTION_ENCRYPTION_KEY", JWT_SECRET)
GOOGLE_OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
# E2-9 · Contraseñas: longitud mínima y lista de contraseñas comunes (LS-16). Se aplican donde
# alguien fija una (alta por el ADMIN, registro, cambio de contraseña); las cuentas que importa
# el docente ya no llevan contraseña: nacen pendientes de aprobación (RN-10, D-5).
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    # BCrypt solo admite 72 bytes: más largo es un 400 con su campo, no un 500.
    {"NAME": "apps.users.password_validators.MaximumLengthBytesValidator"},
]

# E2-9 · Límites de la importación de estudiantes (.xlsx): se comprueban ANTES de leer el
# libro (tamaño, firma ZIP, tamaño descomprimido, filas y tiempo).
IMPORT_MAX_BYTES = int(os.environ.get("SIEP_IMPORT_MAX_BYTES", str(2 * 1024 * 1024)))
IMPORT_MAX_UNCOMPRESSED_BYTES = int(os.environ.get("SIEP_IMPORT_MAX_UNCOMPRESSED_BYTES", str(8 * 1024 * 1024)))
IMPORT_MAX_ZIP_MEMBERS = 64
IMPORT_MAX_ROWS = int(os.environ.get("SIEP_IMPORT_MAX_ROWS", "1000"))
IMPORT_MAX_COLUMNS = int(os.environ.get("SIEP_IMPORT_MAX_COLUMNS", "32"))
IMPORT_MAX_SECONDS = float(os.environ.get("SIEP_IMPORT_MAX_SECONDS", "5"))
# Asistente de IA (RF-027): APAGADO por defecto. Enviaría la pregunta y el contexto
# del caso a un proveedor externo (privacidad, Ley 1581/2012); solo se enciende con
# un valor explícito en AI_ASSISTANT_ENABLED. Apagado, la vista responde 404.
def _env_flag(name, default=False):
    """Bandera booleana por variable de entorno: 1/true/yes/on la encienden; ausente, ``default``."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


# ─── Banderas del contrato expand → migrate → contract (plan estructural §2.8, E5-10) ────
# Lo nuevo ya está en el servidor y `test_contract_closure.py` recorre el ciclo completo con todas en su valor final.
# Una bandera arranca en su valor FINAL cuando el cliente visual ya migró (F9-10: REVIEW_WORKFLOW_STRICT y
# REVISION_REQUIRED) y en su valor HEREDADO mientras algo del cliente todavía depende de lo viejo (ATTEMPT_START_STRICT y
# FEEDBACK_AT_CLOSE_ONLY esperan a F10-9 y F10-4). Cada una dice abajo qué hace en cada estado; `CONTRACT_FLAGS_REGISTRY`
# dice a qué valor van, qué las bloquea hoy y quién las retira. Una variable `SIEP_<BANDERA>=0` apaga una encendida
# (interruptor de emergencia: el camino heredado sigue en el servidor hasta que el usuario decida borrarlo).
#: E1-1 · ATTEMPT_START_STRICT. Encendida: con un intento abierto, `forceNew` de un ESTUDIANTE → 409
#: ATTEMPT_ALREADY_OPEN con el id del abierto (RN-07: el estudiante reanuda; solo el docente lo reemplaza).
#: Apagada: `forceNew` cierra el abierto como REPLACED y empieza otro (la ruta heredada de «Reintentar caso»).
ATTEMPT_START_STRICT = _env_flag("SIEP_ATTEMPT_START_STRICT")
#: E1-7 · FEEDBACK_AT_CLOSE_ONLY. Encendida: la respuesta de una decisión no trae clasificación, deltas ni mensaje
#: evaluativo (`attempt.feedback` es nulo): la retroalimentación pedagógica llega al cierre (RN-08, decisiones 6 y 10).
#: Apagada: cada decisión devuelve de inmediato `feedback` con clasificación, deltas y mensaje (salvo que la versión
#: del caso declare `feedbackTiming = AT_CLOSE`).
FEEDBACK_AT_CLOSE_ONLY = _env_flag("SIEP_FEEDBACK_AT_CLOSE_ONLY")
#: E1-9 · RUBRIC_NUMERIC_TOTAL. Encendida: las vistas del docente incluyen el total numérico de la evaluación
#: (`totalScore`). Apagada (valor final, ED-2/RN-09): la evaluación es formativa, por niveles; el total no viaja y el
#: estudiante nunca recibe un número. Existe para el paso *contract* y las revisiones que aún lo piden.
RUBRIC_NUMERIC_TOTAL = _env_flag("SIEP_RUBRIC_NUMERIC_TOTAL")

#: E2-5 · REVIEW_WORKFLOW_STRICT. Encendida: la publicación pasa por revisión: solo se publica desde `IN_REVIEW`
#: (`POST …/publish` sobre un borrador → 409 REVIEW_REQUIRED), con la lista completa de siete ítems y la constancia de
#: revisión de contenido de Psicología (400 CONTENT_REVIEW_REQUIRED si falta). Apagada: `/publish` del ADMIN sigue
#: publicando un borrador, la constancia es opcional y solo los seis ítems originales son obligatorios.
#: ENCENDIDA POR DEFECTO desde F9-10 (valor final): el cliente publica por el ciclo de vida con la constancia.
REVIEW_WORKFLOW_STRICT = _env_flag("SIEP_REVIEW_WORKFLOW_STRICT", default=True)
#: E2-6 · REVISION_REQUIRED. Encendida: `revision` es obligatoria en toda mutación de autoría (400 REVISION_REQUIRED
#: si falta). Apagada: es opcional pero, cuando viene y está vencida, el servidor responde 409 REVISION_CONFLICT.
#: ENCENDIDA POR DEFECTO desde F9-10 (valor final): el editor y los fixtures e2e mandan la revisión en cada mutación.
REVISION_REQUIRED = _env_flag("SIEP_REVISION_REQUIRED", default=True)
#: E2-10 · INVITATIONS_AUTO_ACCEPT: PUENTE transitorio. Encendida: invitar a un estudiante lo une al grupo de una vez
#: (`ACTIVE`), sin aceptación ni correo, como hasta E1. Apagada (valor final, decisión 22): la invitación queda
#: `INVITED` hasta que el estudiante responde.
INVITATIONS_AUTO_ACCEPT = _env_flag("SIEP_INVITATIONS_AUTO_ACCEPT")

#: Una entrada por bandera: `target_contract` es el valor al que va; `retirement_gate` el hito que la retira;
#: `blocked_by` qué impide encenderla HOY (vacío si ya está en su valor final) y `owner` quién la retira. Lo medido
#: lo fue el 2026-10-17 corriendo el subconjunto e2e de CI con la bandera encendida; lo vuelve a comprobar quien la
#: encienda. `test_contract_closure.py` exige las seis entradas completas.
CONTRACT_FLAGS_REGISTRY = {
    "ATTEMPT_START_STRICT": {
        "env": "SIEP_ATTEMPT_START_STRICT",
        "target_contract": True,
        "retirement_gate": "F9-10 (retiro de forceNew en cliente)",
        "blocked_by": (
            "El juego manda `forceNew` en «Reintentar caso» e «Iniciar nuevo intento» (`SimulationService.startAttempt`): "
            "encendida, el subconjunto e2e de CI recibe 41 respuestas 409 de `POST /api/simulation/attempts` y falla en "
            "unas treinta pruebas; la carga nocturna (`scripts/load/aula.mjs`) también abre cada ciclo con `forceNew`."
        ),
        "owner": "sesión visual (F9-10); la carga nocturna, estructural",
    },
    "FEEDBACK_AT_CLOSE_ONLY": {
        "env": "SIEP_FEEDBACK_AT_CLOSE_ONLY",
        "target_contract": True,
        "retirement_gate": "F9-10 (cierre de F6/F10-4)",
        "blocked_by": (
            "El juego lee la clasificación y el mensaje de la respuesta de cada decisión (`simulation-play.component.ts`): "
            "encendida, `@full-case` falla con «Cannot read properties of undefined (reading 'key')»."
        ),
        "owner": "sesión visual (F10-4 y F9-10)",
    },
    "RUBRIC_NUMERIC_TOTAL": {
        "env": "SIEP_RUBRIC_NUMERIC_TOTAL",
        "target_contract": False,
        "retirement_gate": "ED-2 / RN-09 (evaluación formativa por niveles, permanece False)",
        "blocked_by": None,
        "owner": "producto (ED-2): permanece apagada",
    },
    "REVIEW_WORKFLOW_STRICT": {
        "env": "SIEP_REVIEW_WORKFLOW_STRICT",
        "target_contract": True,
        "retirement_gate": "F9-10 (cierre de F10-6† en e2e) — ENCENDIDA por defecto",
        "blocked_by": None,
        "owner": "sesión visual (F9-10); borrar el camino heredado del servidor lo decide el usuario",
    },
    "REVISION_REQUIRED": {
        "env": "SIEP_REVISION_REQUIRED",
        "target_contract": True,
        "retirement_gate": "F9-10 (cabecera X-Case-Revision obligatoria en todos los clientes) — ENCENDIDA por defecto",
        "blocked_by": None,
        "owner": "sesión visual (F9-10); borrar el camino heredado del servidor lo decide el usuario",
    },
    "INVITATIONS_AUTO_ACCEPT": {
        "env": "SIEP_INVITATIONS_AUTO_ACCEPT",
        "target_contract": False,
        "retirement_gate": "Apagada desde E2-10; el puente se borra con F10-8†",
        "blocked_by": None,
        "owner": "estructural (el puente se borra cuando el visual tenga la bandeja de invitaciones, F10-8†)",
    },
}
#: R16 · máximo de avisos de invitación que sale de UNA importación (el resto queda invitado y lo
#: ve en su bandeja): acota el tiempo de la petición y el volumen de correo.
INVITATION_EMAIL_LIMIT = int(os.environ.get("SIEP_INVITATION_EMAIL_LIMIT", "25"))

#: E5-7 · retención mínima de auditoría (≥ 12 meses = 360 días por defecto, RNF-007).
AUDIT_RETENTION_DAYS = max(360, int(os.environ.get("AUDIT_RETENTION_DAYS", "360")))

AI_ASSISTANT_ENABLED = os.environ.get("AI_ASSISTANT_ENABLED", "false").strip().lower() in {
    "1", "true", "yes", "on",
}
AI_ASSISTANT_PROVIDER = os.environ.get("AI_ASSISTANT_PROVIDER", "openai").strip()
AI_ASSISTANT_API_KEY = os.environ.get("AI_ASSISTANT_API_KEY", "").strip()
AI_ASSISTANT_MODEL = os.environ.get("AI_ASSISTANT_MODEL", "gpt-4o-mini").strip()

ACCESS_REQUEST_NOTIFY_EMAILS = [
    email.strip()
    for email in os.environ.get(
        "ACCESS_REQUEST_NOTIFY_EMAILS",
        "admin@psychosim.edu.co,secretariapsicologia@cue.edu.co",
    ).split(",")
    if email.strip()
]
# Django 6.1: MAILERS reemplaza a EMAIL_BACKEND/EMAIL_HOST/... (deprecados, se
# retiran en Django 7.0). Por defecto el correo sale por consola; en producción
# se fija EMAIL_BACKEND (p. ej. el backend SMTP) y sus OPTIONS salen de variables
# (E2-12): EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, EMAIL_USE_TLS,
# EMAIL_USE_SSL y EMAIL_TIMEOUT. Una opción sin definir no se pasa al backend.
def _mailer_options():
    options = {}
    text = {"EMAIL_HOST": "host", "EMAIL_HOST_USER": "username", "EMAIL_HOST_PASSWORD": "password"}
    for variable, option in text.items():
        value = os.environ.get(variable, "")
        if value.strip():
            options[option] = value.strip() if option != "password" else value
    for variable, option in {"EMAIL_PORT": "port", "EMAIL_TIMEOUT": "timeout"}.items():
        value = os.environ.get(variable, "").strip()
        if value:
            options[option] = int(value)
    for variable, option in {"EMAIL_USE_TLS": "use_tls", "EMAIL_USE_SSL": "use_ssl"}.items():
        if os.environ.get(variable, "").strip():
            options[option] = _env_flag(variable)
    if "host" in options:
        # Sin tiempo de espera un servidor SMTP colgado retiene la petición indefinidamente.
        options.setdefault("timeout", 10)
    return options


MAILERS = {
    "default": {
        "BACKEND": os.environ.get(
            "EMAIL_BACKEND",
            "django.core.mail.backends.console.EmailBackend",
        ),
        **({"OPTIONS": _mailer_options()} if _mailer_options() else {}),
    },
}
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "siep@psychosim.edu.co")

SPECTACULAR_SETTINGS = {
    "TITLE": "PsychoSim / SIEP API",
    "DESCRIPTION": "Backend Django para el simulador SIEP (contrato idéntico a Spring).",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "DEFAULT_SCHEMA_CLASS": "shared.openapi.SiepAutoSchema",
    "PREPROCESSING_HOOKS": [
        "shared.openapi.preprocess_canonical_api_endpoints",
    ],
    "ENUM_GENERATE_CHOICE_DESCRIPTION": False,  # sin el listado en inglés de las etiquetas de Django
    # Un nombre estable por conjunto de valores: dos campos `status` con opciones distintas ya no chocan.
    "ENUM_NAME_OVERRIDES": {
        "AttemptStatusEnum": "apps.simulation.models.AttemptStatus",
        "CaseVersionStatusEnum": "apps.simulation.models.CaseVersionStatus",
        "AccessReasonEnum": "apps.grupos.access.REASONS",
        "AssignmentStateEnum": "apps.grupos.contracts.ASSIGNMENT_STATES",
        "AssignmentTargetTypeEnum": "apps.grupos.contracts.ASSIGNMENT_TARGETS",
        "IssueSeverityEnum": "apps.simulation.serializers.contracts.ISSUE_SEVERITIES",
        "HintReasonEnum": "apps.simulation.serializers.contracts.HINT_REASONS",
        "LifecycleActionEnum": "apps.simulation.serializers.contracts.LIFECYCLE_ACTIONS",
        "MembershipStatusEnum": "apps.grupos.models.MembershipStatus",
        "HealthStatusEnum": "shared.health_docs.HEALTH_STATUS",
        "HealthDbEnum": "shared.health_docs.HEALTH_DB",
    },
}

# Logs: una línea JSON por registro, con el id de la request (RNF-06, TD-10).
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"request_id": {"()": "shared.jsonlog.RequestIdFilter"}},
    "formatters": {"json": {"()": "shared.jsonlog.JsonFormatter"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "filters": ["request_id"],
        },
    },
    "root": {"handlers": ["console"], "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO")},
}

LANGUAGE_CODE = "es"
TIME_ZONE = "America/Bogota"
USE_I18N = True
# Spring uses LocalDateTime and the columns are "timestamp without time zone";
# keep datetimes naive so the JSON contract matches Spring exactly.
USE_TZ = False

# ── Archivos estáticos / SPA (Angular) servidos por WhiteNoise ───────────────
# Los estáticos propios de Django (p. ej. swagger) se recogen en STATIC_ROOT.
STATIC_URL = "/django-static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# El build de Angular se copia a backend_django/frontend_dist en el contenedor.
# Si existe, WhiteNoise lo sirve en la raíz (index.html incluido); las rutas del
# SPA que no son archivos caen en el catch-all de urls.py.
SPA_DIST_DIR = BASE_DIR / "frontend_dist"
if SPA_DIST_DIR.exists():
    WHITENOISE_ROOT = str(SPA_DIST_DIR)
    WHITENOISE_INDEX_FILE = True
