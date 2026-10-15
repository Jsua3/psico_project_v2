"""E3-9 · Cada texto de competencia que ya usan las rúbricas entra al catálogo y se enlaza.

0022 creó ``competencies`` y ``rubric_criteria.competency_id`` vacíos. Aquí, por cada texto
``competency`` distinto de los criterios existentes (comparado por su código normalizado: sin
tildes, mayúsculas, ``_`` en lugar de espacios y símbolos) se crea **una** competencia y se
enlazan **todos** los criterios que lo usan, de todas las rúbricas (incluidas la sembrada y las
de cada versión). El texto libre no se toca. Es idempotente: solo enlaza criterios sin
competencia y reutiliza las que ya existen. El criterio sin texto queda sin enlazar.
"""
import re
import unicodedata

from django.db import migrations

CODE_MAX = 100


def normalize_code(text):
    plain = unicodedata.normalize("NFKD", text or "")
    plain = "".join(ch for ch in plain if not unicodedata.combining(ch))
    code = re.sub(r"[^A-Z0-9]+", "_", plain.upper()).strip("_")
    return code[:CODE_MAX].strip("_")


def link_competencies(apps, schema_editor):
    Competency = apps.get_model("simulation", "Competency")
    RubricCriterion = apps.get_model("simulation", "RubricCriterion")

    by_code = {c.code: c for c in Competency.objects.all()}
    next_order = len(by_code)
    for criterion in RubricCriterion.objects.filter(competency_ref__isnull=True).order_by("id"):
        code = normalize_code(criterion.competency)
        if not code:
            continue
        competency = by_code.get(code)
        if competency is None:
            competency = Competency.objects.create(
                code=code, name=code.replace("_", " ").capitalize(), sort_order=next_order,
            )
            by_code[code] = competency
            next_order += 1
        RubricCriterion.objects.filter(pk=criterion.pk).update(competency_ref=competency)


class Migration(migrations.Migration):

    dependencies = [
        ("simulation", "0022_competencies"),
    ]

    operations = [
        migrations.RunPython(link_competencies, migrations.RunPython.noop),
    ]
