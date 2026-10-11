# Trazabilidad viva: requisito → pruebas y código

Hoy **ninguna prueba cita un ID de requisito** y en el código solo aparece `RF-027`. Esta carpeta propone una convención mínima de marcadores y trae el generador que regenera la matriz de trazabilidad desde ellos, más un **plan de marcado inicial** con las pruebas que el contraste de la línea base ya identificó. Es una propuesta: no modifica pruebas ni código.

## Estado

| Dato | Valor |
|---|---|
| Marcadores `req` en pruebas hoy | 0 |
| Marcadores `req` en código hoy | 0 |
| Pruebas que los evaluadores del contraste señalaron como respaldo | 300 (66 con nombre verificado; 233 por rango de líneas; 1 sin ruta) |
| Huecos de prueba declarados («no existe la prueba de…») | 10 |
| Archivos de prueba señalados que no existen | 0 |

Los dos archivos generados: [`trazabilidad.md`](trazabilidad.md) (una fila por ID de la línea base) y [`plan-de-marcado.md`](plan-de-marcado.md) (qué marcar, y los huecos).

## Convención de marcadores

| Capa | Marcador | Ejemplo |
|---|---|---|
| pytest (backend) | `@pytest.mark.req("ID", ...)` | `@pytest.mark.req("RN-07", "RN-06")` |
| Jest / Vitest (frontend) | ID entre corchetes o como prefijo del título | `it('[RF-15] el lobby solo lista casos asignados', ...)` · `describe('RN-08 · retroalimentación al final', ...)` |
| Playwright y e2e de scripts | igual que el frontend | `test('[RF-19] pausa y reanuda el mismo intento', ...)` |
| Código de producción | comentario `req:` en el punto donde se implementa | `# req: RN-08` · `// req: RF-16` |

**IDs válidos:** los de la línea base sin prefijo (`RF-17`, `RN-08`), las extensiones (`SIEP-RN-01`, `SIEP-RF-04`) y los de las propuestas (`SIEP-RF-C-03`). Un ID que no exista en `docs/requisitos/` es un error del marcador.

**Reglas**

1. Se marca con el requisito que la prueba **demuestra**, no con los que roza. Una prueba puede llevar varios IDs.
2. Una prueba que fija un comportamiento hoy en conflicto (p. ej. que `forceNew` cierre intentos como `REPLACED`) se marca con el ID que contradice (`RN-07`): la matriz la cruza con el veredicto y la deja a la vista para cambiarla junto con el comportamiento.
3. El marcador va al lado de la prueba, no en un archivo aparte, para que viaje con ella al renombrarla o moverla.
4. Para pytest se registra el marcador una sola vez en `backend_django/pytest.ini` (`markers = req(ids): requisitos que demuestra la prueba`); sin registro funciona pero emite una advertencia.

## Regenerar la matriz

Desde `docs/requisitos/trazabilidad/herramientas/`:

```bash
python -I generar_trazabilidad.py --raiz ../../../.. \
    --veredictos ../../contraste-pn3/datos/veredictos.json --salida .. --fecha AAAA-MM-DD
```

Escanea `backend_django/**/test_*.py`, `frontend/src/**/*.spec.ts`, `frontend/e2e/`, `scripts/*.test.mjs` y `scripts/api-e2e.mjs` en busca de marcadores, y el código de `backend_django/` y `frontend/src/` en busca de `req:`. Une el resultado con el veredicto de cada ID y marca los «cumple» sin prueba. `plan-de-marcado.md` sale de los campos `pruebas_existentes` del contraste y comprueba que cada archivo exista.

## Plan de adopción (tres pasos pequeños)

1. **Registrar el marcador** de pytest en `pytest.ini` (una línea) y decidir la forma exacta del título en Jest.
2. **PR mecánico de marcado**: aplicar a las 300 pruebas de `plan-de-marcado.md` el marcador sugerido. Sin efecto en el comportamiento; 66 tienen nombre verificado y 233 señalan un rango de líneas que hay que mapear a la prueba concreta.
3. **Compuerta opcional en CI**: ejecutar el generador y fallar si hay un ID desconocido o, para las olas de cierre de brechas, si un requisito cambia a «cumple» sin prueba marcada.

Los 10 **huecos** del plan de marcado son la lista de partida de pruebas nuevas al cerrar las brechas (con TDD); varios coinciden con la ola 0 de [`../contraste-pn3/conflictos-y-decisiones.md`](../contraste-pn3/conflictos-y-decisiones.md) (p. ej. «no hay prueba de profesor ajeno para student-report, dashboard ni reportes»).

## Qué no hace

- No exige que cada requisito tenga prueba: informa dónde falta.
- No verifica que la prueba demuestre lo que el marcador dice; eso es revisión (y el contraste con dos lentes ya lo hizo para los «cumple» y «conflicto»).
- No sustituye la matriz de cumplimiento de [`../contraste-pn3/`](../contraste-pn3): la complementa con la evidencia de pruebas.
