# E2E-PERSISTENCE-02 — plan de pausa, recarga y reanudación autoritativa

**Fecha:** 2026-07-12
**Alcance:** un intento UI de `SIM-VBG-001` después de H1 y antes de continuar H2–C3.

## Brecha demostrada

El diseño exige que refresh y pausa conserven intento, posición, evidencia, uso pertinente y consecuencias. El flujo E2E integral aún no recarga ni pausa. Además, `safeExit()` llama al endpoint de pausa sin vaciar primero la posición pendiente del debounce de 550 ms, de modo que una salida inmediata puede reanudar al estudiante en una coordenada anterior.

## Task 1: Sincronizar posición antes de pausar

**Files:**

- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`

- [x] Añadir una regresión roja que deje `lastPosition` pendiente y pruebe que `safeExit` no se invoca antes del `PATCH world-state`.
- [x] Encadenar la pausa mediante `withSyncedPosition` y revalidar intento/estado antes del POST.
- [x] Conservar el comportamiento de salida segura si no existe posición pendiente.
- [x] Mantener errores honestos y liberar `busy` en todas las salidas.

## Task 2: Crear helpers de persistencia observada

**Files:**

- Modify: `frontend/e2e/support/siep-flow.ts`

- [x] Observar respuestas por método y ruta sin mutar estado directamente.
- [x] Recargar, detectar el prompt de intento activo y reanudar según `IN_PROGRESS` o `PAUSED` mediante controles visibles.
- [x] Capturar `active-attempt`, `resume` y `world` para comparar el mismo `attemptId` y el estado autoritativo.
- [x] Esperar mapa/escenario Phaser exactos antes de devolver control al recorrido.

## Task 3: Insertar refresh y pausa dentro del caso integral

**Files:**

- Modify: `frontend/e2e/full-case.e2e.ts`

- [x] Después de H1, persistir una posición observable y recargar en estado `IN_PROGRESS`.
- [x] Afirmar mismo intento, nodo H2, posición, PAP en inventario, `PAP@familia-crisis`, familia/NPC vistos y `clinicalState.papApplied=true`.
- [x] Mover de nuevo y activar Salida segura antes del debounce; afirmar orden PATCH → pausa y estado `PAUSED`.
- [x] Recargar en pausa, reanudar el mismo intento por UI y volver a afirmar posición, evidencia y consecuencias antes de completar H2–C3.

## Task 4: Gates y evidencia

**Files:**

- Modify: `docs/audits/2026-07-11-calidad-9-10-evidencia.md`

- [x] Ejecutar rojo→verde focalizado, frontend completo, build, `@full-case`, `@quality` y E2E completo.
- [x] Verificar backend completo si el recorrido descubre un contrato servidor insuficiente (no hubo cambios ni brecha backend; se conservó el gate previo de 220 pruebas).
- [x] Confirmar cero listeners/recursos Compose propios y cero `attemptToken=` en artefactos.
- [x] Registrar exactamente qué estado sobrevivió y mantener fuera de alcance SME/lector de pantalla.

## Acceptance

- La pausa nunca adelanta al guardado de una posición pendiente.
- Refresh en progreso y refresh en pausa restauran el mismo `attemptId`.
- Posición, mapa, inventario, usos target, inspecciones, NPC vistos, nodo y estado clínico coinciden con las respuestas previas.
- El intento reanudado completa las seis decisiones con final integral y sin override.
- Todos los gates salen con código 0 y el runner no deja recursos propios.
