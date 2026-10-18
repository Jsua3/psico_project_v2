"""Apoyo de las pruebas del DSL: el taller copiado, sus escenarios y las alteraciones al azar.

``mutated`` repite el método de ``estres_aleatorio.py`` del taller (una a tres alteraciones por
documento: borrar una clave, poner un valor de otro tipo o duplicar un elemento, con una semilla fija)
sin importarlo: el mutador se reescribe aquí para no acoplar las pruebas al código del taller.
``workshop_reports`` invoca el validador del taller **por subproceso**, una sola vez para todo un lote.
"""
import copy
import json
import random
import subprocess
import sys
import tempfile
from pathlib import Path

TALLER = Path(__file__).resolve().parent / "taller_dsl"
SEED = 20261010
VALUES = [
    None, "", "   ", "X", "E01", "OP01", "H99", "D01", "P01", 0, 1, -3, 2.5, True, False, [], {},
    ["E01", "E01"], {"id": "E01"}, "2026-10-09T15:00:00-05:00", "PUBLICADO", "BORRADOR",
    "COMPLETADO", "EN_CURSO", "RUB-01",
]


def schema():
    return json.loads((TALLER / "dsl-casos.schema.json").read_text(encoding="utf-8"))


def scenarios():
    """``[(id, esperado, documento)]`` del archivo de escenarios del taller."""
    data = json.loads((TALLER / "simulador_psicologia_social.json").read_text(encoding="utf-8"))
    return [(s["id"], s.get("tipo", "valido"), s["caso"]) for s in data["escenarios"]]


def example(*, with_execution):
    """El ejemplo mínimo del taller (sin la clave ``$schema``), con o sin ``ejecucion``."""
    document = json.loads((TALLER / "ejemplo-minimo.json").read_text(encoding="utf-8"))
    document.pop("$schema", None)
    if not with_execution:
        document.pop("ejecucion", None)
    return document


def _paths(node, route=()):
    yield route
    if isinstance(node, dict):
        for key, value in node.items():
            yield from _paths(value, route + (key,))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _paths(value, route + (index,))


def _alter(document, rnd):
    route = rnd.choice([r for r in _paths(document) if r])
    parent = document
    for step in route[:-1]:
        parent = parent[step]
    last = route[-1]
    action = rnd.choice(["borrar", "valor", "valor", "duplicar"])
    if action == "borrar":
        if isinstance(parent, dict):
            del parent[last]
        else:
            parent.pop(last)
    elif action == "valor":
        parent[last] = copy.deepcopy(rnd.choice(VALUES))
    elif isinstance(parent, list):
        parent.append(copy.deepcopy(parent[last]))
    elif isinstance(parent[last], list) and parent[last]:
        parent[last].append(copy.deepcopy(parent[last][0]))


def mutated(count, seed=SEED, *, keep_execution=True):
    """``count`` documentos alterados al azar a partir de los escenarios del taller."""
    rnd = random.Random(seed)
    bases = [document for _, _, document in scenarios()]
    documents = []
    for _ in range(count):
        document = copy.deepcopy(rnd.choice(bases))
        if not keep_execution:
            document.pop("ejecucion", None)
        for _ in range(rnd.choice([1, 1, 2, 3])):
            try:
                _alter(document, rnd)
            except (KeyError, IndexError, TypeError):
                pass
        documents.append(document)
    return documents


def workshop_reports(documents):
    """El informe del validador del taller para cada documento: ``[{obtenido, reglasIncumplidas}]``.

    Una sola invocación por subproceso para todo el lote (``taller_dsl_driver.py``), sin importar el
    código del taller en el proceso de la prueba.
    """
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "lote.json"
        path.write_text(json.dumps(documents, ensure_ascii=False), encoding="utf-8")
        done = subprocess.run(
            [sys.executable, "-I", "-B", str(Path(__file__).resolve().parent / "taller_dsl_driver.py"), str(path)],
            capture_output=True, timeout=600,
        )
    if done.returncode != 0:
        raise RuntimeError(done.stderr.decode("utf-8", "replace")[-1500:])
    return json.loads(done.stdout.decode("utf-8"))


def route_text(route):
    """``('escenas', 1, 'decision')`` → ``'escenas[1].decision'`` (como el taller)."""
    text = ""
    for step in route:
        text += f"[{step}]" if isinstance(step, int) else ("." if text else "") + str(step)
    return text or "(raíz)"
