# 04 — Arreglar la respuesta de las opciones del diálogo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `470a0a2` (rama `feat/personaje-v1-idle-walk`)
- **Depende de:** plan 03 (usa el token `--psy-ease-out`)
- **Severidad:** MEDIA (feedback roto en la interacción central del juego)
- **Categoría:** Interrumpibilidad / física (auditoría de animaciones)
- **Alcance estimado:** 1 archivo, solo CSS; 1 prueba nueva

**Goal:** Que las opciones de respuesta del diálogo reaccionen: al pasar el cursor cambian de color, al presionar se hunden, y al elegir una, las demás se atenúan como pretende el código.

**Architecture:** La entrada escalonada de las opciones usa `animation: choice-in … both`. Con `fill-mode: both`, los valores finales del keyframe (`opacity: 1; transform: translateY(0)`) quedan fijados por la animación y ganan a cualquier regla normal. Por eso el hover (`translateY(-1px)`) y el atenuado de las no elegidas (`opacity: .45`) nunca se aplican. Cambiar a `backwards` conserva la entrada (el estado inicial se aplica durante el retraso del escalonado) y libera las propiedades al terminar.

**Tech Stack:** Estilos inline de un componente Angular 21, Jest 30.

**Spec:** Auditoría estética y técnica del 2026-09-29, sección «Movimiento › Interfaz (CSS)», fila `.choice-btn`. Valores del playbook: press `scale(0.97)` con `transition: transform 160ms ease-out`; hover solo en `@media (hover: hover) and (pointer: fine)`; hover de color con `ease`. Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- Ejecutar DESPUÉS del plan 03. Verificar antes de empezar: `grep -n "psy-ease-out" frontend/src/styles/styles.scss` debe devolver `--psy-ease-out: cubic-bezier(0.23, 1, 0.32, 1);`. Si no existe, DETENERSE.
- No tocar `frontend/src/app/features/simulator/game-world.component.ts`, `player-motion.util.ts` ni `player-motion.util.spec.ts`.
- Solo CSS dentro de `styles: [...]` de `dialogue-panel.component.ts`. NO cambiar el template ni la lógica (la pausa de 170 ms de `handleChoice` es una decisión documentada, `dialogue-panel.component.ts:529`).
- Si un fragmento «Actual» no coincide con el archivo, DETENERSE y reportar.
- Mensajes de commit en español con formato `tipo(ámbito): descripción`.

## Review Focus

- Elegir una opción con las teclas 1–9 (flujo más frecuente): la elegida se resalta y las demás bajan a 45 % de opacidad durante la pausa de confirmación.
- Pasar el cursor por las opciones: cambia el color y el borde, sin desplazamiento.
- Presionar con el mouse: la opción se hunde a 0,97 y vuelve.
- Entrada de las opciones: siguen apareciendo escalonadas (45 ms entre cada una), sin parpadeo inicial.
- Con `prefers-reduced-motion: reduce`: sin entrada escalonada ni hundimiento; el atenuado se conserva (es información, no movimiento).

## Problema

`frontend/src/app/features/simulator/dialogue-panel.component.ts:246-269` (actual):

```css
      transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
    }
    .choice-btn:hover {
      transform: translateY(-1px);
      border-color: rgba(182,156,255,.7);
      background: rgba(124,77,255,.16);
    }
    .choice-btn:focus-visible {
      outline: 3px solid rgba(182,156,255,.5);
      outline-offset: 3px;
    }
    /* Entrada escalonada de opciones (sutil, una sola vez). */
    .choice-btn {
      animation: choice-in 200ms cubic-bezier(.2,.8,.2,1) both;
      animation-delay: calc(var(--stagger, 0) * 45ms);
    }
    /* Confirmación: la card elegida se resalta y las demás ceden. */
    .choices--locked .choice-btn { pointer-events: none; }
    .choices--locked .choice-btn:not(.choice-btn--chosen) { opacity: .45; }
    .choice-btn--chosen {
      border-color: rgba(232,240,244,.85) !important;
      background: rgba(124,77,255,.3);
      animation: choice-confirm 170ms ease both;
    }
```

`:372-377` (actual):

```css
    @media (prefers-reduced-motion: reduce) {
      .dialogue-strip { animation: none; }
      .cursor { animation: none; }
      .choice-btn, .choice-btn--chosen { animation: none; }
      .choice-btn:hover { transform: none; }
    }
```

Consecuencias: `opacity: .45` y `translateY(-1px)` nunca se ven; no hay respuesta al presionar; el hover no está limitado a puntero fino (en táctil queda pegado).

## Objetivo

```css
    /* dentro de .choice-btn { … } */
      transition: border-color 150ms ease, background-color 150ms ease, opacity 150ms ease, transform 160ms var(--psy-ease-out);

    @media (hover: hover) and (pointer: fine) {
      .choice-btn:hover {
        border-color: rgba(182,156,255,.7);
        background: rgba(124,77,255,.16);
      }
    }
    .choice-btn:active { transform: scale(.97); }

    .choice-btn {
      animation: choice-in 200ms var(--psy-ease-out) backwards;
      animation-delay: calc(var(--stagger, 0) * 45ms);
    }
    .choice-btn--chosen { … animation: choice-confirm 170ms ease; }   /* sin fill */
```

## Convenciones del repo

- Prueba de contrato de fuente: patrón de `frontend/src/app/features/simulator/scene-renderer.registry.spec.ts` y `frontend/src/styles/motion.contract.spec.ts` (creado por el plan 03).
- Hover limitado ya presente en el repo: `frontend/src/styles/styles.scss` (`@media (hover: hover) and (pointer: fine) { .psy-button--primary:hover … }`).

---

### Task 1: Prueba de contrato de las opciones

**Files:**
- Create: `frontend/src/app/features/simulator/dialogue-panel.motion.spec.ts`

- [ ] **Step 1: Escribir la prueba**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'dialogue-panel.component.ts'), 'utf-8');

describe('opciones del diálogo: movimiento', () => {
  it('la entrada escalonada no congela opacity ni transform al terminar', () => {
    expect(source).toContain('animation: choice-in 200ms var(--psy-ease-out) backwards;');
    expect(source).not.toMatch(/animation: choice-in[^;]*\bboth;/);
    expect(source).not.toMatch(/animation: choice-confirm[^;]*\bboth;/);
  });

  it('responde al presionar y el hover solo existe con puntero fino', () => {
    expect(source).toMatch(/\.choice-btn:active \{\s*transform: scale\(\.97\);\s*\}/);
    expect(source).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.choice-btn:hover \{/);
    expect(source).not.toMatch(/\.choice-btn:hover \{\s*transform: translateY\(-1px\);/);
  });

  it('transiciona solo propiedades explícitas', () => {
    expect(source).toContain(
      'transition: border-color 150ms ease, background-color 150ms ease, opacity 150ms ease, transform 160ms var(--psy-ease-out);',
    );
  });

  it('con movimiento reducido quita entrada y hundimiento, pero no el atenuado', () => {
    expect(source).toMatch(/\.choice-btn:active \{ transform: none; \}/);
    expect(source).not.toContain('.choice-btn:hover { transform: none; }');
    expect(source).toContain('.choices--locked .choice-btn:not(.choice-btn--chosen) { opacity: .45; }');
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/dialogue-panel.motion.spec.ts`
Expected: FAIL en los cuatro `it`.

---

### Task 2: Corregir el CSS de `.choice-btn`

**Files:**
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts:246-269` y `:372-377`

- [ ] **Step 1: Transiciones explícitas**

Dentro del primer bloque `.choice-btn { … }` (termina en la línea 247), reemplazar:

```css
      transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
```

por:

```css
      transition: border-color 150ms ease, background-color 150ms ease, opacity 150ms ease, transform 160ms var(--psy-ease-out);
```

- [ ] **Step 2: Hover limitado y press**

Reemplazar:

```css
    .choice-btn:hover {
      transform: translateY(-1px);
      border-color: rgba(182,156,255,.7);
      background: rgba(124,77,255,.16);
    }
```

por:

```css
    @media (hover: hover) and (pointer: fine) {
      .choice-btn:hover {
        border-color: rgba(182,156,255,.7);
        background: rgba(124,77,255,.16);
      }
    }
    .choice-btn:active {
      transform: scale(.97);
    }
```

- [ ] **Step 3: Entrada sin congelar propiedades**

Reemplazar:

```css
      animation: choice-in 200ms cubic-bezier(.2,.8,.2,1) both;
```

por:

```css
      animation: choice-in 200ms var(--psy-ease-out) backwards;
```

- [ ] **Step 4: Confirmación sin fill**

Dentro de `.choice-btn--chosen { … }`, reemplazar:

```css
      animation: choice-confirm 170ms ease both;
```

por:

```css
      animation: choice-confirm 170ms ease;
```

(El keyframe `choice-confirm` empieza y termina en `scale(1)`, así que no necesita fill.)

- [ ] **Step 5: Movimiento reducido**

En el bloque `@media (prefers-reduced-motion: reduce)` del componente, reemplazar:

```css
      .choice-btn:hover { transform: none; }
```

por:

```css
      .choice-btn:active { transform: none; }
```

- [ ] **Step 6: Pruebas**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/dialogue-panel.motion.spec.ts src/app/features/simulator/dialogue-panel.component.spec.ts`
Expected: PASS en ambos.

Run: `npm run build:frontend`
Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/simulator/dialogue-panel.component.ts frontend/src/app/features/simulator/dialogue-panel.motion.spec.ts
git commit -m "fix(motion): las opciones del diálogo responden a hover, press y selección"
```

## Límites

- NO cambiar el escalonado (45 ms), la duración de entrada (200 ms), la pausa de confirmación (170 ms) ni el typewriter.
- NO tocar `.choice-btn:focus-visible`.
- NO tocar el template ni el TypeScript del componente.

## Verificación

- **Mecánica:** los dos specs del diálogo en verde; `npm run build:frontend` OK.
- **Revisión de sensación** (`npm run up`, http://localhost:4200, entrar a un caso y hablar con un personaje hasta llegar a opciones):
  - Las opciones entran escalonadas como antes.
  - Cursor sobre una opción: cambia fondo y borde, sin moverse.
  - Clic sostenido: la opción se hunde levemente; al soltar vuelve.
  - Pulsar la tecla 2: la opción 2 se resalta y las demás se atenúan claramente durante la breve pausa, antes de avanzar.
  - DevTools › Animations al 10 %: al terminar `choice-in`, la opacidad de las opciones no elegidas sí cambia a 0,45 al confirmar (antes quedaba en 1).
  - DevTools › Rendering › «prefers-reduced-motion: reduce»: sin entrada escalonada ni hundimiento; el atenuado sigue.
- **Hecho cuando:** el spec pasa y, al elegir con teclado, se ve qué opción se eligió y cuáles quedaron descartadas.
