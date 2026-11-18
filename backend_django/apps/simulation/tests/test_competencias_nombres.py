"""Las competencias que crean las semillas se llaman como el criterio que las usa, con sus tildes (P4, V4)."""
from django.contrib.auth import get_user_model

from apps.simulation.models import Competency, Rubric, RubricCriterion
from apps.simulation.services.competencies import link_unlinked_criteria, nombrar_competencias_crudas


def _criterio(db_user, codigo, titulo):
    rubrica = Rubric.objects.create(name=f"Rúbrica {codigo}", active=True, version="1.0", created_by=db_user)
    return RubricCriterion.objects.create(rubric=rubrica, competency=codigo, title=titulo, weight=100, max_score=100, display_order=1)


def _usuario():
    return get_user_model().objects.create_user(email="nombres@example.com", password="x", nombre="N", apellido="A", role="ADMIN")


def test_una_competencia_nueva_toma_el_titulo_del_criterio(db):
    criterio = _criterio(_usuario(), "CONTENCION_PRUEBA", "Contención emocional y manejo de crisis")
    link_unlinked_criteria(create=True)
    criterio.refresh_from_db()
    assert criterio.competency_ref.name == "Contención emocional y manejo de crisis"


def test_los_nombres_sacados_del_codigo_se_corrigen_y_los_escritos_no(db):
    usuario = _usuario()
    cruda = Competency.objects.create(code="ANALISIS_PRUEBA", name="Analisis prueba")
    escrita = Competency.objects.create(code="ETICA_PRUEBA", name="Ética escrita a mano")
    for competencia, titulo in ((cruda, "Análisis psicosocial y argumentación"), (escrita, "Otro título")):
        criterio = _criterio(usuario, competencia.code, titulo)
        RubricCriterion.objects.filter(pk=criterio.pk).update(competency_ref=competencia)
    assert nombrar_competencias_crudas() == 1
    assert nombrar_competencias_crudas() == 0  # idempotente
    cruda.refresh_from_db()
    escrita.refresh_from_db()
    assert cruda.name == "Análisis psicosocial y argumentación"
    assert escrita.name == "Ética escrita a mano"
