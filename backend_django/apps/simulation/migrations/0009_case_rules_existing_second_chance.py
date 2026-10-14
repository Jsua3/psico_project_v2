"""E1-7 · Las versiones que ya existen conservan la segunda oportunidad (ED-7).

``case_versions.rules`` nace vacío y una versión sin ``secondChance`` la tiene apagada: así
nacen los casos nuevos. Pero las versiones que ya estaban publicadas (y los borradores en
curso) siempre la tuvieron: aquí se les escribe ``secondChance: true`` para que no cambie
su comportamiento. Una versión que ya declara la clave no se toca.
"""
import json

from django.db import migrations


def with_second_chance(raw):
    """El JSON de reglas con ``secondChance: true`` si no declaraba la clave."""
    try:
        rules = json.loads(raw) if raw and str(raw).strip() else {}
    except (TypeError, ValueError):
        rules = {}
    if not isinstance(rules, dict):
        rules = {}
    rules.setdefault("secondChance", True)
    return json.dumps(rules)


def enable_second_chance_on_existing_versions(apps, schema_editor):
    CaseVersion = apps.get_model("simulation", "CaseVersion")
    for version in CaseVersion.objects.all().iterator(chunk_size=200):
        updated = with_second_chance(version.rules)
        if updated != version.rules:
            CaseVersion.objects.filter(pk=version.pk).update(rules=updated)


class Migration(migrations.Migration):

    dependencies = [
        ("simulation", "0008_case_rules_and_option_texts"),
    ]

    operations = [
        migrations.RunPython(enable_second_chance_on_existing_versions, migrations.RunPython.noop),
    ]
