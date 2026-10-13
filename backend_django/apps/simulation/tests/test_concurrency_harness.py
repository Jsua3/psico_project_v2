"""E0-9 · El arnés de concurrencia: hilos con commits reales, sin ``flush``.

``transactional_db`` trunca las tablas al terminar y borraría la siembra que el
resto de la suite necesita; aquí cada prueba crea sus filas, las limpia y
demuestra que la siembra sigue en pie. Lo usan E1-1 y E1-3 (un solo intento
abierto, órdenes idempotentes) y E2-6 (edición con revisión desfasada).
"""
import uuid

import pytest
from django.db import IntegrityError

from apps.grupos.models import Grupo
from apps.simulation.models import CaseVersion
from apps.users.models import CustomUser
from shared.testing import Outcome, run_concurrently

pytestmark = pytest.mark.req("RNF-08")


def test_run_concurrently_devuelve_el_resultado_o_el_error_de_cada_hilo():
    def ok():
        return 7

    def boom():
        raise ValueError("falló")

    outcomes = run_concurrently(ok, boom)

    assert outcomes[0] == Outcome(value=7)
    assert isinstance(outcomes[1].error, ValueError)


def test_dos_hilos_con_el_mismo_codigo_de_grupo_solo_uno_gana(real_commits):
    profesor = CustomUser.objects.get(email="profesora@psychosim.edu.co")
    codigo = f"CONC-{uuid.uuid4().hex[:8]}"

    def crear():
        return Grupo.objects.create(nombre="Concurrente", codigo=codigo, profesor=profesor)

    try:
        outcomes = run_concurrently(crear, crear)
        ganadores = [o for o in outcomes if o.error is None]
        perdedores = [o for o in outcomes if o.error is not None]

        assert len(ganadores) == 1
        assert len(perdedores) == 1
        assert isinstance(perdedores[0].error, IntegrityError)
        assert Grupo.objects.filter(codigo=codigo).count() == 1
    finally:
        Grupo.objects.filter(codigo=codigo).delete()

    # Sin flush: la siembra de la suite sigue intacta.
    assert CaseVersion.objects.filter(simulation_case__code="SIM-VBG-001", status="PUBLISHED").exists()
    assert not Grupo.objects.filter(codigo=codigo).exists()
