import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection

from apps.grupos.models import Grupo
from apps.users.models import CustomUser

pytestmark = [pytest.mark.django_db, pytest.mark.req("RNF-009")]


def _members(grupo):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM grupo_estudiante ge JOIN users u ON u.id = ge.estudiante_id "
            "WHERE ge.grupo_id = %s AND u.email LIKE %s",
            [grupo.id, "carga%"],
        )
        return cursor.fetchone()[0]


def test_crea_n_estudiantes_en_el_grupo_demo_con_el_caso_asignado():
    call_command("seed_load_students", "--count", "5", "--password", "Efimera-123456!")

    emails = list(
        CustomUser.objects.filter(email__startswith="carga")
        .order_by("email")
        .values_list("email", flat=True)
    )
    assert emails == [f"carga{i:03d}@psychosim.edu.co" for i in range(1, 6)]
    assert _members(Grupo.objects.get(codigo="DEMO1")) == 5


def test_es_idempotente():
    call_command("seed_load_students", "--count", "3", "--password", "Efimera-123456!")
    call_command("seed_load_students", "--count", "3", "--password", "Efimera-123456!")

    assert CustomUser.objects.filter(email__startswith="carga").count() == 3
    assert _members(Grupo.objects.get(codigo="DEMO1")) == 3


def test_se_niega_fuera_de_settings_test(settings):
    del settings.SIEP_TEST_ATTESTATION_NONCE

    with pytest.raises(CommandError, match="solo bajo psychosim.settings.test"):
        call_command("seed_load_students", "--count", "1", "--password", "x")


def test_rechaza_un_conteo_fuera_de_rango():
    with pytest.raises(CommandError, match="--count"):
        call_command("seed_load_students", "--count", "0", "--password", "x")
