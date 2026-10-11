# -*- coding: utf-8 -*-
"""Comprobación de las pruebas: ¿detectan una regla rota?

Una suite que siempre pasa no prueba nada. Este script rompe el validador a
propósito, de una regla a la vez y de dos formas:

  * «siempre-cumple»: la regla deja pasar cualquier documento;
  * «siempre-falla»:  la regla señala un error en cualquier documento.

Después ejecuta ``test_validar_dsl.py`` y cuenta cuántas pruebas fallan. Si alguna
rotura no hace fallar ninguna prueba, esa regla no está realmente protegida.

Uso (desde esta carpeta):

    C:/Python313/python.exe -I -B probar_las_pruebas.py

Código de salida: 0 si toda rotura fue detectada; 1 si alguna pasó inadvertida.
"""
import functools
import io
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import validar_dsl as v  # noqa: E402
import test_validar_dsl  # noqa: E402,F401  (se carga una vez; las pruebas leen v.REGLAS en cada llamada)


def correr_pruebas():
    suite = unittest.defaultTestLoader.loadTestsFromName("test_validar_dsl")
    resultado = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(suite)
    return len(resultado.failures) + len(resultado.errors), resultado.testsRun


def siempre_cumple(doc):
    return v.Resultado(1)


def siempre_falla(doc):
    return v.Resultado(1, [v._h("Caso X", "caso", "regla rota a propósito")])


def principal():
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8")
        except Exception:  # noqa: BLE001
            pass
    fallan, corridas = correr_pruebas()
    print(f"Línea base, sin romper nada: {corridas} pruebas, {fallan} fallan.")
    if fallan:
        print("La línea base ya falla: corrija las pruebas antes de usar este script.")
        return 1
    print()
    print(f"{'Regla':<8} {'Rotura':<15} {'Pruebas que fallan':>18}  Detectada")
    print(f"{'-' * 8} {'-' * 15} {'-' * 18}  {'-' * 9}")
    sin_detectar = 0
    for entrada in v.REGLAS:
        original = entrada["funcion"]
        for modo, reemplazo in (("siempre-cumple", siempre_cumple), ("siempre-falla", siempre_falla)):
            entrada["funcion"] = functools.wraps(original)(lambda doc, f=reemplazo: f(doc))
            fallan, _ = correr_pruebas()
            detectada = fallan > 0
            sin_detectar += not detectada
            print(f"{entrada['id']:<8} {modo:<15} {fallan:>18}  {'sí' if detectada else 'NO'}")
        entrada["funcion"] = original
    fallan, corridas = correr_pruebas()
    print()
    print(f"Validador restaurado: {corridas} pruebas, {fallan} fallan.")
    total = len(v.REGLAS) * 2
    print(f"Roturas detectadas: {total - sin_detectar} de {total}.")
    return 1 if sin_detectar or fallan else 0


if __name__ == "__main__":
    sys.exit(principal())
