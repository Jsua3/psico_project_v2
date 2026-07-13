# E2E-VERTICAL-02 — recorrido integral en cuatro viewports

**Fecha:** 2026-07-12
**Alcance:** el mismo recorrido completo y autoritativo de `SIM-VBG-001` en `1600×900`, `1366×768`, `390×844` y `412×915`, con teclado en escritorio y controles táctiles reales en móvil.

## Brecha demostrada

`@full-case` ya completa las seis decisiones, refresh, pausa, reanudación y resultado integral, pero solo usa el viewport Desktop Chrome por defecto y movimiento de teclado. `@quality` prueba los cuatro viewports y touch, aunque llega únicamente a estados parciales. El criterio de terminación exige que el recorrido vertical completo pase en las cuatro resoluciones.

## Task 1: Una matriz y un driver de movimiento compartidos

**Files:**

- Add: `frontend/e2e/support/required-viewports.ts`
- Modify: `frontend/e2e/vertical-quality.e2e.ts`
- Modify: `frontend/e2e/support/siep-flow.ts`

- [ ] Extraer la matriz obligatoria para que calidad y recorrido integral usen exactamente las mismas dimensiones y capacidad touch.
- [ ] Modelar `keyboard` y `touch` como modos explícitos, sin detectar móvil por user-agent ni tamaño implícito.
- [ ] Mantener `keyboard.down/up` para escritorio y convertir duración a nudges táctiles equivalentes (`4 × 34 ms` por tap) para móvil.
- [ ] Hacer que “mover hasta interacción” use taps visibles con timeout y que pausa/persistencia reutilicen el mismo driver.
- [ ] En móvil, acreditar el NPC mediante el botón visible `Interactuar`; no usar `page.keyboard` como atajo oculto.

## Task 2: Multiplicar el caso, no duplicar su lógica

**Files:**

- Modify: `frontend/e2e/full-case.e2e.ts`

- [ ] Ejecutar una variante `@full-case` por viewport mediante `test.use({ viewport, hasTouch })`.
- [ ] Conservar una sola definición del flujo H1–C3 y pasarle el modo de input.
- [ ] Usar controles táctiles reales para el desplazamiento y la interacción NPC en las dos variantes móviles.
- [ ] Mantener las afirmaciones autoritativas de intento, posición, evidencia, herramientas, estado clínico y resultado.
- [ ] Ejecutar Axe/geometría sobre la pantalla final de cada variante para cubrir el estado no presente en `@quality`.

## Task 3: Corregir únicamente hallazgos live demostrados

**Files:**

- Modify as required: `frontend/src/app/features/simulator/game-world.component.ts`
- Modify/add focused specs only when a production defect is confirmed.

- [ ] Correr primero una variante móvil y conservar el rojo exacto.
- [ ] Si `Interactuar` no alcanza NPCs, preservar prioridad de marcadores y añadir fallback al NPC cercano para el control táctil.
- [ ] Si aparece overflow, control inaccesible o ruta bloqueada, añadir la regresión focalizada antes del cambio de producción.
- [ ] No introducir esperas/retries para ocultar carreras ni relajar Axe, proximidad o autoridad backend.

## Task 4: Gates, coste y evidencia

**Files:**

- Modify: `docs/audits/2026-07-11-calidad-9-10-evidencia.md`

- [ ] Pasar `@full-case` 4/4 y `@quality` 4/4 en stack aislado.
- [ ] Pasar frontend completo, build de producción y E2E completo con el nuevo total.
- [ ] Confirmar cero listeners 5544/8093/4315, cero recursos Compose propios y cero `attemptToken=` en artefactos.
- [ ] Registrar duración aproximada y mantener Browser plugin/lector de pantalla/SME como límites explícitos.

## Acceptance

- Las seis decisiones y el resultado integral completan 4/4 viewports.
- Escritorio usa teclado; móvil usa taps sobre controles visibles para movimiento e interacción NPC.
- Refresh y pausa conservan el mismo intento y estado en cada variante.
- El resultado final de cada viewport no tiene hallazgos Axe `serious`/`critical` ni geometría bloqueante.
- Los gates globales salen con código 0 y el runner limpia todos sus recursos.
