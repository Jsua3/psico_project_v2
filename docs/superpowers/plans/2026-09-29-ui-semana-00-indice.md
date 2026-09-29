# Arreglos de interfaz de «esta semana» — índice

Planes derivados de la auditoría estética y técnica del frontend del 2026-09-29 (informe: https://claude.ai/artifact/RYudmDy2HJT3ZSdrHJFVeX), sección «Prioridades › Esta semana». Cada plan es autocontenido: trae el código actual, el resultado exacto, las pruebas y la verificación.

- **Commit base de todos los planes:** `470a0a2` (rama `feat/personaje-v1-idle-walk`).
- **Cómo ejecutarlos:** con `superpowers:subagent-driven-development` (un subagente por tarea y revisión entre tareas) o `superpowers:executing-plans`.
- **Regla común:** si el código no coincide con un fragmento «Actual» (drift), el ejecutor se detiene y reporta.
- **Archivos intocables en todos los planes:** `game-world.component.ts`, `player-motion.util.ts` y `player-motion.util.spec.ts`, que otra línea de trabajo tenía modificados el 2026-09-29.

## Planes

| # | Plan | Severidad | Esfuerzo | Estado | Depende de |
| --- | --- | --- | --- | --- | --- |
| 01 | [Cargar de verdad Poppins y JetBrains Mono](2026-09-29-ui-semana-01-tipografia.md) | ALTA | S | TODO | — |
| 02 | [Corregir contrastes y foco visible](2026-09-29-ui-semana-02-contraste-foco.md) | ALTA | S | TODO | — |
| 03 | [Quitar el movimiento que estorba](2026-09-29-ui-semana-03-movimiento-que-estorba.md) | ALTA | S | TODO | — |
| 04 | [Arreglar la respuesta de las opciones del diálogo](2026-09-29-ui-semana-04-opciones-dialogo.md) | MEDIA | XS | TODO | 03 (token `--psy-ease-out`) |
| 05 | [Datos honestos en el dashboard](2026-09-29-ui-semana-05-dashboard-honesto.md) | ALTA | M | TODO | — |
| 06 | [Navegación accesible](2026-09-29-ui-semana-06-navegacion-accesible.md) | ALTA | M | TODO | — |
| 07 | [La vista previa del editor muestra al personaje elegido](2026-09-29-ui-semana-07-vista-previa-personaje.md) | MEDIA | S | TODO | — |
| 08 | [Poda de assets, componentes y dependencias sin uso](2026-09-29-ui-semana-08-poda.md) | BAJA/MEDIA | S | TODO | — |

## Orden recomendado

1. **01 Tipografía:** cambia el aspecto de todo, así que conviene que el resto se revise ya con la fuente real.
2. **02 Contraste y foco** y **03 Movimiento:** puro CSS y de bajo riesgo. Pueden ir en cualquier orden entre sí porque tocan reglas distintas de los mismos archivos (el 02 no toca las tarjetas que reescribe el 03).
3. **04 Diálogo:** solo después del 03.
4. **06 Navegación accesible.**
5. **07 Editor de personaje.**
6. **05 Dashboard:** el único que toca backend; conviene revisarlo con más calma.
7. **08 Poda:** al final, cuando el resto ya está verde, para que cualquier fallo de build se atribuya sin dudas.

## Pruebas que añaden los planes

| Plan | Pruebas nuevas |
| --- | --- |
| 01 | `frontend/e2e/fonts.e2e.ts` |
| 02 | `frontend/src/styles/contrast.contract.spec.ts` (calcula ratios WCAG) |
| 03 | `frontend/src/styles/motion.contract.spec.ts` |
| 04 | `frontend/src/app/features/simulator/dialogue-panel.motion.spec.ts` |
| 05 | `backend_django/apps/simulation/tests/test_attempt_duration.py`, `frontend/src/app/features/dashboard/dashboard-metrics.util.spec.ts` (+ ampliación de `test_game.py`) |
| 06 | `core/title/siep-title.strategy.spec.ts`, `app.component.spec.ts`, `login.a11y.spec.ts`, `shell.a11y.spec.ts`, `confirm-dialog.component.spec.ts` |
| 07 | `editor-preview.util.spec.ts`, `character-editor.preview.spec.ts` |
| 08 | `login-assets.config.spec.ts` |

Las pruebas que leen el código fuente siguen el patrón que ya existe en `frontend/src/app/features/simulator/scene-renderer.registry.spec.ts`. Sus expresiones usan `\s*`, así que funcionan con finales de línea CRLF (checkout de Windows con `autocrlf=true`) y LF (CI).

## Validación hecha al escribir los planes

- Todos los fragmentos «Actual» se comprobaron contra el código de `470a0a2`.
- Para los planes 03 y 04 se simularon los cambios en memoria: sus pruebas de contrato fallan con el código actual y pasan con el resultado del plan.
- Las URL de fuentes del plan 01 (`@fontsource/poppins@5.3.0` y `@fontsource/jetbrains-mono@5.3.0` en jsDelivr) responden 200 con `font/woff2`.
- Los contrastes del plan 02 se calcularon con la fórmula WCAG 2.x.

## Fuera de esta semana (a propósito)

- **Subset de Material Symbols (535 KB):** requiere validar primero la herramienta de subset de ligaduras; queda como trabajo aparte.
- **`frontend/src/assets/characters/modular-legacy/`:** no se borra porque es la fuente de `tools/character-assets/remaster_2x.py`.
- **Prioridades del mes y estructurales:** feedback de errores en el portal, rendimiento del juego, flujo del juego, introducción, arranque, escala entera del mundo y sistema de diseño. Se planifican cuando se cierre esta tanda.
