"""Corre el validador del taller sobre un lote de documentos, en su propio proceso (E4-3).

Se invoca por subproceso desde ``dsl_support.workshop_reports``: así las pruebas no importan el código
del taller. La línea de comandos del taller solo reconoce archivos de escenarios cuyos documentos traen
``escenas`` o ``versionDsl`` (una alteración puede borrar las dos), por eso el lote se pasa a
``validar_documento``, la misma función que usa el taller en su prueba de estrés.

Uso: ``taller_dsl_driver.py LOTE.json`` → imprime ``[{obtenido, reglasIncumplidas}, …]``.
"""
import importlib.util
import json
import sys
from pathlib import Path

TALLER = Path(__file__).resolve().parent / "taller_dsl"


def main(argv):
    spec = importlib.util.spec_from_file_location("validar_dsl", TALLER / "validar_dsl.py")
    workshop = importlib.util.module_from_spec(spec)
    sys.modules["validar_dsl"] = workshop  # los dataclasses y los registros del taller lo buscan por nombre
    spec.loader.exec_module(workshop)
    schema = json.loads((TALLER / "dsl-casos.schema.json").read_text(encoding="utf-8"))
    documents = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    reports = []
    for document in documents:
        report = workshop.validar_documento(document, schema, usar_jsonschema=False)
        reports.append({"obtenido": report["obtenido"], "reglasIncumplidas": report["reglasIncumplidas"]})
    sys.stdout.buffer.write(json.dumps(reports, ensure_ascii=False).encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
