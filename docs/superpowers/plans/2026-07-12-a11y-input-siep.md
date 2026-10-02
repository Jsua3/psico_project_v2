# A11Y-INPUT-01 — bloqueo de entrada y controles contextualizados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que los overlays del simulador bloqueen de forma uniforme las acciones de juego y reemplazar la lista invisible de interacciones remotas por un único control visible, contextual y accesible.

**Architecture:** `SimulationPlayComponent` será la única fuente de verdad de bloqueo mediante un `computed` derivado de los overlays que congelan el mundo. Las rutas de teclado y las mutaciones de interacción consultarán esa misma señal; Phaser seguirá recibiendo `worldMotionPaused`. El control accesible se deriva solo de `nearbyInteraction`, por lo que la UI no puede intentar una acción a distancia que el backend rechazaría.

**Tech Stack:** Angular signals y template control flow, Angular CDK A11y, Jest con TestBed, Playwright.

---

### Task 1: Contrato de bloqueo único de entradas

**Files:**

- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`

- [ ] **Step 1: Escribir pruebas rojas del bloqueo derivado y de teclado**

Añadir al spec un caso que active `dialogue`, otro que active `journalOpen` y otro que active `showContentWarning`; en cada uno afirmar que `inputBlocked()` es verdadero. Añadir una interacción cercana sintética y comprobar que `handleGlobalInteraction()` con `E` no llama `openInteraction` mientras el diálogo está abierto.

```ts
component.dialogue.set({ key: 'test', speakerName: 'Prueba', emotion: 'neutral', lines: [], choices: [] });
expect(component.inputBlocked()).toBe(true);

component.nearbyInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as MapObjectState);
const open = jest.spyOn(component, 'openInteraction');
component.handleGlobalInteraction(new KeyboardEvent('keydown', { key: 'e', cancelable: true }));
expect(open).not.toHaveBeenCalled();
```

- [ ] **Step 2: Ejecutar la prueba roja**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/simulation-play.consent-gate.spec.ts`

Expected: FAIL porque `inputBlocked` no existe y `E` aún puede pasar por el handler global.

- [ ] **Step 3: Implementar el estado y guardas mínimas**

En `SimulationPlayComponent`, definir el estado una sola vez y reutilizarlo en `worldMotionPaused`:

```ts
readonly inputBlocked = computed(() =>
  this.showResumePrompt() || this.showContentWarning() || this.showIntroVideo()
  || this.showCaseIntro() || this.dialogue() !== null || this.journalOpen()
  || (this.attempt()?.status ?? 'IN_PROGRESS') !== 'IN_PROGRESS');

readonly worldMotionPaused = computed(() => this.inputBlocked());
```

Mantener las rutas propias de cada overlay antes de la guarda general en `handleGlobalInteraction`; después de procesar `Escape` para cerrar journal o diálogo, impedir `E`, `Enter`, espacio y `J` si `inputBlocked()` es verdadero. Antes de iniciar una mutación, `openInteraction`, `openNpcDialogue`, `onDoorTrigger` y `tryOpenDoor` deben retornar cuando `inputBlocked()` o `busy()` sea verdadero. No bloquear el `textarea` de la bitácora: los targets editables siguen retornando antes de consumir su texto.

- [ ] **Step 4: Verificar verde**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/simulation-play.consent-gate.spec.ts`

Expected: PASS; ningún `E` durante un overlay llama la ruta de interacción.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts
git commit -m "fix(a11y): bloquear input del mundo durante overlays"
```

### Task 2: Sustituir controles invisibles por la acción cercana visible

**Files:**

- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts`
- Modify: `frontend/e2e/living-world.e2e.ts`

- [ ] **Step 1: Escribir pruebas rojas de control contextual**

En el spec de componente, añadir una prueba para el `computed` que expone el control solo si existe una interacción cercana, el intento está `IN_PROGRESS` y `inputBlocked()` es falso. En Playwright, tras entrar al mundo, afirmar que no existe `button.sr-only` y que al aparecer el prompt de proximidad hay un botón visible con texto de la acción y atajo `E`.

```ts
component.nearbyInteraction.set({ key: 'familia-crisis', type: 'PERSON' } as MapObjectState);
expect(component.contextualInteraction()).toEqual(expect.objectContaining({ key: 'familia-crisis' }));
component.dialogue.set(dialogueFixture);
expect(component.contextualInteraction()).toBeNull();
```

```ts
await expect(page.locator('button.sr-only')).toHaveCount(0);
await expect(page.getByRole('button', { name: /interactuar.*e/i })).toBeVisible();
```

- [ ] **Step 2: Ejecutar las pruebas rojas**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/simulation-play.consent-gate.spec.ts`

Expected: FAIL por falta de `contextualInteraction` y porque la lista `sr-only` aún genera botones ocultos.

- [ ] **Step 3: Implementar control contextual**

Eliminar por completo el `<section class="sr-only">` que itera `world().objects`. Añadir:

```ts
readonly contextualInteraction = computed(() => {
  const interaction = this.nearbyInteraction();
  return !this.inputBlocked() && !this.busy() && interaction ? interaction : null;
});
```

Dentro de `.context-bar`, cuando `contextualInteraction()` exista, renderizar un `button type="button"` visible que invoque `openInteraction(interaction)`, use `proximityLabel(interaction)` en el texto y anuncie el atajo `E`. Conservar el texto de orientación cuando no haya interacción. El botón debe usar `:focus-visible` consistente con `.safe-exit` y no depender de hover.

- [ ] **Step 4: Verificar verde**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/simulation-play.consent-gate.spec.ts`

Run: `npm run test:e2e -- living-world.e2e.ts`

Expected: PASS; no hay controles enfocables ocultos y la acción disponible coincide con la proximidad del mundo.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts frontend/e2e/living-world.e2e.ts
git commit -m "fix(a11y): exponer solo interacciones cercanas"
```

### Task 3: Foco modal y movimiento reducido coherentes

**Files:**

- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`
- Modify: `frontend/src/app/features/simulator/journal-panel.component.ts`
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts`
- Modify: `frontend/e2e/consent-gate.e2e.ts`

- [ ] **Step 1: Escribir pruebas rojas de foco y reduced motion**

Añadir una prueba Playwright que abra bitácora y dialogue, tabule varias veces y compruebe que el foco permanece dentro del overlay activo. Añadir una prueba de componente que active `reduceMotion` y compruebe que el valor se entrega al mundo mediante el binding existente.

- [ ] **Step 2: Ejecutar las pruebas rojas**

Run: `npm run test:e2e -- consent-gate.e2e.ts`

Expected: FAIL al permitir que Tab alcance acciones del fondo en journal o diálogo.

- [ ] **Step 3: Implementar aislamiento mínimo del foco**

Importar `A11yModule` donde falte y aplicar `cdkTrapFocus`, `cdkTrapFocusAutoCapture` y un control `cdkFocusInitial` a `resume-overlay`, `intro-video-overlay`, `case-intro-overlay`, `JournalPanelComponent` y `DialoguePanelComponent`. En el template padre, aplicar `[attr.inert]="inputBlocked() ? '' : null"` y `[attr.aria-hidden]="inputBlocked() ? 'true' : null"` únicamente a las zonas de mundo, HUD y acciones que no contienen el overlay activo; no aplicar `inert` al propio overlay ni al `textarea` del journal. La preferencia `reduceMotion` ya se propaga a Phaser; conservar los media queries para animaciones CSS y evitar introducir un segundo estado.

- [ ] **Step 4: Verificar verde**

Run: `npm run test:e2e -- consent-gate.e2e.ts`

Expected: PASS; Tab no escapa de los overlays y Escape conserva el comportamiento específico de consentimiento y salida segura.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/app/features/simulator/journal-panel.component.ts frontend/src/app/features/simulator/dialogue-panel.component.ts frontend/e2e/consent-gate.e2e.ts
git commit -m "fix(a11y): aislar foco y respetar movimiento reducido"
```

### Task 4: Regresión de A11Y-INPUT-01

**Files:**

- Modify: `docs/audits/2026-07-11-calidad-9-10-evidencia.md`

- [ ] **Step 1: Ejecutar gates de regresión**

Run:

```powershell
npm run test:frontend
npm run build:frontend
npm run test:e2e
```

Expected: salida verde, sin warnings conocidos, y Playwright cubre consentimiento, mundo, lobby, teclado y móvil.

- [ ] **Step 2: Registrar evidencia real**

Documentar los conteos obtenidos, el foco atrapado, la ausencia de botones ocultos y cualquier límite de Axe o viewport que aún no se haya ejecutado. No elevar la nota final de accesibilidad hasta ejecutar Axe y los cuatro viewports definidos por el diseño.

- [ ] **Step 3: Commit**

```powershell
git add docs/audits/2026-07-11-calidad-9-10-evidencia.md
git commit -m "docs(audit): registrar A11Y-INPUT-01"
```

## Revisión del plan

- Cubre el estado único de bloqueo, el reemplazo de controles invisibles, foco de overlays y la preservación de reduced motion del diseño.
- No cambia contratos de backend, datos clínicos, PAP, puertas ni persistencia; esos pertenecen a slices posteriores.
- Los nombres `inputBlocked` y `contextualInteraction` se definen en las tareas antes de usarse y cada cambio de comportamiento empieza por una prueba roja.
