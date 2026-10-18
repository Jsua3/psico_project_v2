"""``purge_rate_limits`` borra solo los contadores de ventanas vencidas hace más de dos días (S1-2, DJA-2)."""
import io

import pytest
from django.core.management import call_command

from apps.security import limiter
from apps.security.models import RateLimitBucket

pytestmark = [pytest.mark.req("DJA-2"), pytest.mark.security, pytest.mark.django_db]

INSTANTE = 1_800_000_000.0
DIA = 86400


@pytest.fixture
def reloj(monkeypatch):
    instante = {"t": INSTANTE}
    monkeypatch.setattr(limiter, "_now", lambda: instante["t"])
    return instante


def _contador(window_start, nombre):
    return RateLimitBucket.objects.create(
        scope="login_ip", key_hash=limiter.key_hash(nombre), window_start=window_start, count=1
    )


def test_borra_solo_las_ventanas_vencidas_hace_mas_de_dos_dias(reloj):
    corte = int(INSTANTE) - 2 * DIA
    _contador(corte - 1, "vencida")  # más de dos días: se borra
    _contador(corte, "justo-en-el-limite")  # exactamente dos días: se conserva
    _contador(int(INSTANTE) - DIA, "de-ayer")
    _contador(int(INSTANTE), "vigente")
    salida = io.StringIO()

    call_command("purge_rate_limits", stdout=salida)

    assert set(RateLimitBucket.objects.values_list("key_hash", flat=True)) == {
        limiter.key_hash("justo-en-el-limite"),
        limiter.key_hash("de-ayer"),
        limiter.key_hash("vigente"),
    }
    assert "borraron 1" in salida.getvalue()


def test_con_dry_run_cuenta_lo_que_borraria_y_no_borra_nada(reloj):
    _contador(int(INSTANTE) - 3 * DIA, "vencida")
    salida = io.StringIO()

    call_command("purge_rate_limits", "--dry-run", stdout=salida)

    assert RateLimitBucket.objects.count() == 1
    assert "1" in salida.getvalue()
