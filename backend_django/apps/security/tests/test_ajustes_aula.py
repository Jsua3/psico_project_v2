"""Los ajustes del modo aula (``psychosim.settings.aula``): la demostración por la red local, sin aflojar producción ni desarrollo.

Cada caso carga los ajustes en un proceso aparte con su propio entorno (``base`` lee las claves del entorno al importarse).
"""
import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[3]
LEER = (
    "import json, importlib; m = importlib.import_module('psychosim.settings.aula'); "
    "print(json.dumps({k: getattr(m, k) for k in ('DEBUG', 'ALLOWED_HOSTS', 'CSRF_TRUSTED_ORIGINS', 'CORS_ALLOWED_ORIGINS',"
    " 'SESSION_COOKIE_SECURE', 'CSRF_COOKIE_SECURE', 'SECURE_SSL_REDIRECT', 'SECURE_HSTS_SECONDS')}))"
)
CLAVE = "aula-" + "x" * 40
REFLEXION = "aula-reflexion-" + "y" * 40


def _cargar(**entorno):
    env = {k: v for k, v in os.environ.items() if not k.startswith(("SIEP_AULA_", "DJANGO_SECRET_KEY", "REFLECTION_ENCRYPTION_KEY"))}
    env.update({"SIEP_AULA_HOSTS": "192.168.1.20,localhost", "SIEP_AULA_PUERTO": "8200", "DJANGO_SECRET_KEY": CLAVE,
                "REFLECTION_ENCRYPTION_KEY": REFLEXION, **entorno})
    env = {k: v for k, v in env.items() if v is not None}
    return subprocess.run([sys.executable, "-c", LEER], cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120)


def test_por_la_red_sin_https_y_solo_con_los_hosts_del_aula():
    r = _cargar()
    assert r.returncode == 0, r.stderr[-800:]
    ajustes = json.loads(r.stdout.strip().splitlines()[-1])
    assert ajustes["DEBUG"] is False
    assert ajustes["ALLOWED_HOSTS"] == ["192.168.1.20", "localhost"]
    assert ajustes["CSRF_TRUSTED_ORIGINS"] == ["http://192.168.1.20:8200", "http://localhost:8200"]
    assert ajustes["CORS_ALLOWED_ORIGINS"] == []
    assert ajustes["SESSION_COOKIE_SECURE"] is False and ajustes["CSRF_COOKIE_SECURE"] is False
    assert ajustes["SECURE_SSL_REDIRECT"] is False and ajustes["SECURE_HSTS_SECONDS"] == 0


def test_sin_hosts_ni_puerto_no_arranca_y_dice_que_falta():
    for falta in ("SIEP_AULA_HOSTS", "SIEP_AULA_PUERTO"):
        r = _cargar(**{falta: None})
        assert r.returncode != 0 and f"falta la variable {falta}" in r.stderr


def test_rechaza_comodines_puertos_raros_y_claves_de_ejemplo():
    assert "sin comodines" in _cargar(SIEP_AULA_HOSTS="*").stderr
    assert "número de puerto" in _cargar(SIEP_AULA_PUERTO="ochenta").stderr
    r = _cargar(DJANGO_SECRET_KEY="django-insecure-change-in-production")
    assert r.returncode != 0 and "DJANGO_SECRET_KEY debe ser propia del aula" in r.stderr
    assert "django-insecure" not in r.stderr.split("ImproperlyConfigured")[-1]  # el valor no se muestra
