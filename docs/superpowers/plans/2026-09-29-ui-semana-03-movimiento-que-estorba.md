# 03 — Quitar el movimiento que estorba — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `470a0a2` (rama `feat/personaje-v1-idle-walk`)
- **Severidad:** ALTA
- **Categoría:** Propósito y frecuencia · Curvas y duración (auditoría de animaciones)
- **Alcance estimado:** 8 archivos, solo CSS; 1 prueba nueva

**Goal:** Que los controles que se usan decenas de veces al día respondan al instante y sin adornos: fuera el destello de 520 ms de todos los botones, la entrada de 680 ms con desenfoque del dashboard, el levantamiento de filas y tarjetas al pasar el cursor, y la animación del aviso «E interactuar».

**Architecture:** Solo CSS. Se añade un token de curva `--psy-ease-out` a `:root` (lo reutiliza el plan 04). Donde hoy hay movimiento en hover se deja solo el cambio de color, borde o sombra, se limita el hover a dispositivos con puntero fino y se separa el `:focus-visible` del `:hover` para que el foco de teclado no mueva nada. Una prueba de «contrato de fuente» fija el resultado.

**Tech Stack:** SCSS global y estilos inline de componentes Angular 21, Jest 30.

**Spec:** Auditoría estética y técnica del 2026-09-29, sección «Movimiento › Interfaz (CSS)». Valores tomados del playbook de animación (Emil Kowalski): UI por debajo de 300 ms; press `scale(0.97)` con `transition: transform 160ms ease-out`; curva fuerte `cubic-bezier(0.23, 1, 0.32, 1)`; acciones de alta frecuencia sin animación; hover solo en `@media (hover: hover) and (pointer: fine)`. Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias.
- No tocar `frontend/src/app/features/simulator/game-world.component.ts`, `player-motion.util.ts` ni `player-motion.util.spec.ts`.
- Solo propiedades de movimiento, color y foco: NO cambiar estructura HTML.
- Si un fragmento «Actual» no coincide con el archivo, DETENERSE y reportar.
- Mensajes de commit en español con formato `tipo(ámbito): descripción`.

## Review Focus

- Mantener pulsado un botón `.psy-button` y soltarlo rápido: se hunde a `scale(0.97)` y vuelve sin que aparezca ningún destello blanco.
- Navegar con Tab por tarjetas del portal (acciones rápidas, intentos de trazabilidad, tarjetas de resumen): el foco muestra contorno y la tarjeta NO se desplaza.
- En una pantalla táctil (o DevTools con emulación táctil), tocar una tarjeta de grupo: no debe quedar «pegado» ningún estado de hover.
- Entrar al dashboard varias veces seguidas: aparece con un fundido breve, sin salto vertical ni desenfoque.
- Con `prefers-reduced-motion: reduce`, el fundido del dashboard queda en 1 ms por la regla global existente (no se toca aquí).

## Problema (fragmentos actuales)

**1. Destello de 520 ms en cada hover de botón** (`.psy-button` se usa ~168 veces). `frontend/src/styles/styles.scss:411-443`:

```scss
.psy-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: var(--psy-button-h);
  padding: 0 20px;
  border: 0;
  border-radius: var(--psy-pill);
  cursor: pointer;
  font-weight: 700;
  line-height: 1;
  overflow: hidden;
  transition: transform var(--psy-motion-fast), box-shadow var(--psy-motion-ui), background var(--psy-motion-ui);
}

.psy-button::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 -70%;
  width: 56%;
  transform: skewX(-16deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.42), transparent);
  transition: left 520ms ease;
}

.psy-button:hover::before {
  left: 118%;
}

.psy-button:active {
  transform: scale(.97);
}
```

**2. Entrada del dashboard de 680 ms con desplazamiento y desenfoque.** `frontend/src/styles/styles.scss:536-538` y `:559-562`:

```scss
.psy-reveal {
  animation: psy-page-rise var(--psy-motion-section) both;
}
```

```scss
@keyframes psy-page-rise {
  from { opacity: 0; transform: translateY(18px); filter: blur(10px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
```

Se usa en `frontend/src/app/features/dashboard/dashboard.component.html:1` (ruta por defecto del portal) y `frontend/src/app/features/reportes/reporte-grupo.component.ts:37`. Con `both`, el `transform` y el `filter` finales quedan aplicados a toda la página.

**3. Filas y tarjetas que se elevan en hover** (y también con el foco de teclado):

`frontend/src/app/shared/layout/shell.component.ts:196` y `:206-211`:

```css
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
```

```css
    a[mat-list-item]:hover {
      border-color: rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.14);
      box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.12);
      transform: translate(-1px, -1px);
    }
```

`frontend/src/app/shared/layout/shell.component.ts:248-255` (botón principal de la barra lateral, hover y foco en la misma regla):

```css
      transition: transform 160ms ease;
    }
    .sidebar-primary-action:hover,
    .sidebar-primary-action:focus-visible {
      transform: translate(-1px, -1px);
      outline: 2px solid rgba(255,255,255,.5);
      outline-offset: 2px;
    }
```

`frontend/src/app/shared/layout/shell.component.ts:296-300` (botones de abrir y cerrar el menú móvil):

```css
    .siep-menu-trigger:hover,
    .siep-close-trigger:hover {
      transform: translate(-1px, -1px);
      box-shadow: 6px 6px 0 rgba(0, 82, 130, 0.14);
    }
```

`frontend/src/app/features/dashboard/quick-actions.component.ts:101` y `:108-114`:

```css
      transition: transform 160ms ease, box-shadow 160ms ease;
```

```css
    .quick-action-card:hover,
    .quick-action-card:focus-visible {
      transform: translate(-1px, -1px);
      box-shadow: var(--dash-pixel-shadow);
      outline: 2px solid rgba(75, 0, 181, 0.35);
      outline-offset: 2px;
    }
```

`frontend/src/app/features/simulator/instructor-trace.component.ts:708` y `:711-718`:

```css
      transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
```

```css
    .attempt-card:hover,
    .attempt-card:focus-visible {
      transform: translate(-2px, -2px);
      box-shadow: 8px 8px 0 rgba(43, 77, 111, .2);
      border-color: #6f4caf;
      outline: 3px solid rgba(111, 76, 175, .22);
      outline-offset: 2px;
    }
```

`frontend/src/app/features/simulator/instructor-trace.component.ts:773-786`:

```css
    .review-summary-card--action {
      width: 100%;
      text-align: left;
      cursor: pointer;
      transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
    }

    .review-summary-card--action:hover,
    .review-summary-card--action:focus-visible {
      transform: translate(-2px, -2px);
      box-shadow: 8px 8px 0 rgba(43, 77, 111, .2);
      outline: 3px solid rgba(111, 76, 175, .22);
      outline-offset: 2px;
    }
```

`frontend/src/app/features/grupos/grupo-list.component.ts:410-411`:

```css
      transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
    }
    .group-card:hover { transform: translateY(-1px); border-color: rgba(0, 84, 134, .28); box-shadow: 0 12px 24px rgba(10, 38, 70, .08); }
```

`frontend/src/app/features/simulator/world-preview.component.ts:328-333`:

```css
      transition: transform var(--psy-motion-fast), box-shadow var(--psy-motion-ui), border-color var(--psy-motion-ui);
    }
    .interaction-card:hover, .interaction-card--selected {
      transform: translateY(-1px);
      border-color: rgba(79,124,172,.36);
      box-shadow: 0 18px 34px -28px rgba(47,95,143,.45);
    }
```

`frontend/src/app/features/dashboard/dashboard.component.scss:314-317` (el botón se hunde en hover en vez de al presionar):

```scss
.pixel-button:hover {
  transform: translate(1px, 1px);
  box-shadow: 3px 3px 0 rgba(0, 82, 130, 0.14);
}
```

**4. Aviso «E interactuar» con keyframe.** Aparece cada vez que el jugador entra al radio de un objeto (decenas de veces por sesión, disparado por teclado) y reinicia desde cero en cada entrada. `frontend/src/app/features/simulator/simulation-play.component.ts:557`:

```css
      animation: hint-rise 160ms ease both;
```

`:850-853`:

```css
    @keyframes hint-rise {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
```

`:922` (dentro de `@media (prefers-reduced-motion: reduce)`):

```css
      .right-panel, .context-bar__interaction, .overlay-backdrop { animation: none; }
```

## Objetivo (valores exactos)

```scss
/* :root */
--psy-ease-out: cubic-bezier(0.23, 1, 0.32, 1);

/* .psy-button */
transition: transform 160ms var(--psy-ease-out), box-shadow 150ms ease, background-color 150ms ease;
/* sin ::before */

/* .psy-reveal */
animation: psy-page-fade 150ms var(--psy-ease-out) backwards;
@keyframes psy-page-fade { from { opacity: 0; } }
```

Hover sin `transform`, dentro de `@media (hover: hover) and (pointer: fine)`, con transiciones de 150 ms `ease` solo en color, borde y sombra. Foco: `outline: 3px solid var(--psy-focus); outline-offset: 2px;` sin moverse. Aviso «E»: sin animación.

## Convenciones del repo

- Tokens de movimiento en `frontend/src/styles/styles.scss:65-67` (`--psy-motion-fast/ui/section`). El token nuevo va inmediatamente debajo.
- Ejemplo de hover ya bien limitado: `frontend/src/styles/styles.scss:456-461` (`@media (hover: hover) and (pointer: fine) { .psy-button--primary:hover … }`).
- Pruebas de contrato de fuente: `frontend/src/app/features/simulator/scene-renderer.registry.spec.ts`.

---

### Task 1: Prueba de contrato de movimiento

**Files:**
- Create: `frontend/src/styles/motion.contract.spec.ts`

**Interfaces:**
- Produces: token CSS `--psy-ease-out` (lo consume el plan 04).

- [ ] **Step 1: Escribir la prueba**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

describe('movimiento: botones y páginas', () => {
  const styles = source('./styles.scss');

  it('define la curva ease-out fuerte como token', () => {
    expect(styles).toContain('--psy-ease-out: cubic-bezier(0.23, 1, 0.32, 1);');
  });

  it('los botones no tienen destello en hover y responden en 160 ms', () => {
    expect(styles).not.toContain('.psy-button::before');
    expect(styles).not.toContain('.psy-button:hover::before');
    expect(styles).toContain(
      'transition: transform 160ms var(--psy-ease-out), box-shadow 150ms ease, background-color 150ms ease;',
    );
    expect(styles).toMatch(/\.psy-button:active \{\s*transform: scale\(\.97\);/);
  });

  it('la entrada de página es un fundido corto sin desplazamiento ni desenfoque', () => {
    expect(styles).toContain('animation: psy-page-fade 150ms var(--psy-ease-out) backwards;');
    expect(styles).toMatch(/@keyframes psy-page-fade \{\s*from \{ opacity: 0; \}\s*\}/);
    expect(styles).not.toContain('psy-page-rise');
  });
});

describe('movimiento: hover sin desplazamiento en el portal', () => {
  const files: Record<string, string> = {
    shell: source('../app/shared/layout/shell.component.ts'),
    quickActions: source('../app/features/dashboard/quick-actions.component.ts'),
    trace: source('../app/features/simulator/instructor-trace.component.ts'),
    grupos: source('../app/features/grupos/grupo-list.component.ts'),
    preview: source('../app/features/simulator/world-preview.component.ts'),
    dashboard: source('../app/features/dashboard/dashboard.component.scss'),
  };

  it('ninguna tarjeta ni fila se mueve en hover', () => {
    expect(files['shell']).not.toContain('transform: translate(-1px, -1px);');
    expect(files['quickActions']).not.toContain('transform: translate(-1px, -1px);');
    expect(files['trace']).not.toContain('transform: translate(-2px, -2px);');
    expect(files['grupos']).not.toContain('.group-card:hover { transform: translateY(-1px);');
    expect(files['preview']).not.toMatch(/\.interaction-card:hover, \.interaction-card--selected \{\s*transform/);
  });

  it('el foco de teclado de las tarjetas no comparte regla con el hover', () => {
    expect(files['quickActions']).not.toMatch(/\.quick-action-card:hover,\s*\.quick-action-card:focus-visible/);
    expect(files['trace']).not.toMatch(/\.attempt-card:hover,\s*\.attempt-card:focus-visible/);
    expect(files['trace']).not.toMatch(/\.review-summary-card--action:hover,\s*\.review-summary-card--action:focus-visible/);
  });

  it('el botón pixel se hunde al presionar, no al pasar el cursor', () => {
    expect(files['dashboard']).toMatch(/\.pixel-button:active \{\s*transform: translate\(2px, 2px\);/);
    expect(files['dashboard']).not.toMatch(/\.pixel-button:hover \{\s*transform/);
  });
});

describe('movimiento: juego', () => {
  it('el aviso de interacción aparece sin animación', () => {
    const play = source('../app/features/simulator/simulation-play.component.ts');
    expect(play).not.toContain('hint-rise');
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm test --prefix frontend -- --runInBand src/styles/motion.contract.spec.ts`
Expected: FAIL en todos los `it`.

---

### Task 2: Botones y entrada de página (`styles.scss`)

**Files:**
- Modify: `frontend/src/styles/styles.scss:65-67`, `:411-443`, `:536-538`, `:559-562`

- [ ] **Step 1: Token de curva**

Debajo de `--psy-motion-section: 680ms cubic-bezier(.2,.8,.2,1);` añadir:

```scss
  --psy-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
```

- [ ] **Step 2: Botón sin destello**

En `.psy-button { … }`, reemplazar la línea `transition: transform var(--psy-motion-fast), box-shadow var(--psy-motion-ui), background var(--psy-motion-ui);` por:

```scss
  transition: transform 160ms var(--psy-ease-out), box-shadow 150ms ease, background-color 150ms ease;
```

Borrar completos los bloques `.psy-button::before { … }` y `.psy-button:hover::before { … }`. Dejar intacto `.psy-button:active { transform: scale(.97); }` y dejar `overflow: hidden;` (lo usan los botones con íconos).

- [ ] **Step 3: Entrada de página**

Reemplazar:

```scss
.psy-reveal {
  animation: psy-page-rise var(--psy-motion-section) both;
}
```

por:

```scss
.psy-reveal {
  animation: psy-page-fade 150ms var(--psy-ease-out) backwards;
}
```

Reemplazar el bloque `@keyframes psy-page-rise { … }` por:

```scss
@keyframes psy-page-fade {
  from { opacity: 0; }
}
```

- [ ] **Step 4: Correr la prueba**

Run: `npm test --prefix frontend -- --runInBand src/styles/motion.contract.spec.ts`
Expected: PASS del bloque «botones y páginas».

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/motion.contract.spec.ts frontend/src/styles/styles.scss
git commit -m "fix(motion): botones sin destello y entrada de página de 150 ms"
```

---

### Task 3: Hover sin desplazamiento en el portal

**Files:**
- Modify: `frontend/src/app/shared/layout/shell.component.ts:196`, `:206-211`, `:248-255`, `:296-300`
- Modify: `frontend/src/app/features/dashboard/quick-actions.component.ts:101`, `:108-114`
- Modify: `frontend/src/app/features/simulator/instructor-trace.component.ts:708`, `:711-718`, `:777`, `:780-786`
- Modify: `frontend/src/app/features/grupos/grupo-list.component.ts:410-411`
- Modify: `frontend/src/app/features/simulator/world-preview.component.ts:328-333`
- Modify: `frontend/src/app/features/dashboard/dashboard.component.scss:314-317`

- [ ] **Step 1: Navegación lateral (`shell.component.ts`)**

Línea 196, reemplazar la `transition` por:

```css
      transition: box-shadow 150ms ease, border-color 150ms ease, background-color 150ms ease;
```

Reemplazar el bloque `a[mat-list-item]:hover { … }` (206-211) por:

```css
    @media (hover: hover) and (pointer: fine) {
      a[mat-list-item]:hover {
        border-color: rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.14);
        box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.12);
      }
    }
```

En el mismo archivo, reemplazar (líneas 248-255):

```css
      transition: transform 160ms ease;
    }
    .sidebar-primary-action:hover,
    .sidebar-primary-action:focus-visible {
      transform: translate(-1px, -1px);
      outline: 2px solid rgba(255,255,255,.5);
      outline-offset: 2px;
    }
```

por (el foco es blanco porque la barra lateral es morada):

```css
      transition: box-shadow 150ms ease;
    }
    @media (hover: hover) and (pointer: fine) {
      .sidebar-primary-action:hover {
        box-shadow: 5px 5px 0 rgba(0,0,0,.2);
      }
    }
    .sidebar-primary-action:focus-visible {
      outline: 3px solid #FFFFFF;
      outline-offset: 2px;
    }
```

Y reemplazar (líneas 296-300):

```css
    .siep-menu-trigger:hover,
    .siep-close-trigger:hover {
      transform: translate(-1px, -1px);
      box-shadow: 6px 6px 0 rgba(0, 82, 130, 0.14);
    }
```

por:

```css
    @media (hover: hover) and (pointer: fine) {
      .siep-menu-trigger:hover,
      .siep-close-trigger:hover {
        box-shadow: 6px 6px 0 rgba(0, 82, 130, 0.14);
      }
    }
```

(La `transition` de `.siep-menu-trigger, .siep-close-trigger` se deja como está: la usa `.is-hidden`.)

- [ ] **Step 2: Acciones rápidas (`quick-actions.component.ts`)**

Línea 101, reemplazar la `transition` por:

```css
      transition: box-shadow 150ms ease, border-color 150ms ease;
```

Reemplazar el bloque combinado `.quick-action-card:hover, .quick-action-card:focus-visible { … }` (108-114) por:

```css
    @media (hover: hover) and (pointer: fine) {
      .quick-action-card:hover {
        box-shadow: var(--dash-pixel-shadow);
      }
    }

    .quick-action-card:focus-visible {
      outline: 3px solid var(--psy-focus);
      outline-offset: 2px;
    }
```

- [ ] **Step 3: Trazabilidad (`instructor-trace.component.ts`)**

Línea 708 (`.attempt-card`), reemplazar la `transition` por:

```css
      transition: box-shadow 150ms ease, border-color 150ms ease;
```

Reemplazar el bloque combinado `.attempt-card:hover, .attempt-card:focus-visible { … }` (711-718) por:

```css
    @media (hover: hover) and (pointer: fine) {
      .attempt-card:hover {
        box-shadow: 8px 8px 0 rgba(43, 77, 111, .2);
        border-color: #6f4caf;
      }
    }

    .attempt-card:focus-visible {
      border-color: #6f4caf;
      outline: 3px solid var(--psy-focus);
      outline-offset: 2px;
    }
```

Dentro de `.review-summary-card--action { … }` (línea 777), reemplazar la `transition` por:

```css
      transition: box-shadow 150ms ease, border-color 150ms ease;
```

Reemplazar el bloque combinado `.review-summary-card--action:hover, .review-summary-card--action:focus-visible { … }` (780-786) por:

```css
    @media (hover: hover) and (pointer: fine) {
      .review-summary-card--action:hover {
        box-shadow: 8px 8px 0 rgba(43, 77, 111, .2);
      }
    }

    .review-summary-card--action:focus-visible {
      outline: 3px solid var(--psy-focus);
      outline-offset: 2px;
    }
```

- [ ] **Step 4: Grupos (`grupo-list.component.ts:410-411`)**

Reemplazar:

```css
      transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
    }
    .group-card:hover { transform: translateY(-1px); border-color: rgba(0, 84, 134, .28); box-shadow: 0 12px 24px rgba(10, 38, 70, .08); }
```

por:

```css
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    @media (hover: hover) and (pointer: fine) {
      .group-card:hover { border-color: rgba(0, 84, 134, .28); box-shadow: 0 12px 24px rgba(10, 38, 70, .08); }
    }
```

- [ ] **Step 5: Vista previa del mundo (`world-preview.component.ts:328-333`)**

Reemplazar:

```css
      transition: transform var(--psy-motion-fast), box-shadow var(--psy-motion-ui), border-color var(--psy-motion-ui);
    }
    .interaction-card:hover, .interaction-card--selected {
      transform: translateY(-1px);
      border-color: rgba(79,124,172,.36);
      box-shadow: 0 18px 34px -28px rgba(47,95,143,.45);
    }
```

por:

```css
      transition: box-shadow 150ms ease, border-color 150ms ease;
    }
    .interaction-card--selected {
      border-color: rgba(79,124,172,.36);
      box-shadow: 0 18px 34px -28px rgba(47,95,143,.45);
    }
    @media (hover: hover) and (pointer: fine) {
      .interaction-card:hover {
        border-color: rgba(79,124,172,.36);
        box-shadow: 0 18px 34px -28px rgba(47,95,143,.45);
      }
    }
```

- [ ] **Step 6: Botón pixel del dashboard (`dashboard.component.scss:314-317`)**

Reemplazar:

```scss
.pixel-button:hover {
  transform: translate(1px, 1px);
  box-shadow: 3px 3px 0 rgba(0, 82, 130, 0.14);
}
```

por:

```scss
@media (hover: hover) and (pointer: fine) {
  .pixel-button:hover {
    box-shadow: 3px 3px 0 rgba(0, 82, 130, 0.14);
  }
}

.pixel-button:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 rgba(0, 82, 130, 0.14);
}
```

(La `transition: transform 140ms ease, box-shadow 140ms ease;` de `.pixel-button` se deja como está.)

- [ ] **Step 7: Correr la prueba**

Run: `npm test --prefix frontend -- --runInBand src/styles/motion.contract.spec.ts`
Expected: PASS del bloque «hover sin desplazamiento en el portal».

- [ ] **Step 8: Commit**

```bash
git add frontend/src/styles/motion.contract.spec.ts frontend/src/app/shared/layout/shell.component.ts frontend/src/app/features/dashboard frontend/src/app/features/simulator/instructor-trace.component.ts frontend/src/app/features/grupos/grupo-list.component.ts frontend/src/app/features/simulator/world-preview.component.ts
git commit -m "fix(motion): hover sin desplazamiento y foco separado en tarjetas del portal"
```

---

### Task 4: Aviso «E interactuar» sin animación

**Files:**
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts:557`, `:850-853`, `:922`

- [ ] **Step 1: Quitar la animación**

Borrar la línea 557 (`      animation: hint-rise 160ms ease both;`) del bloque `.context-bar__interaction { … }`.

Borrar el bloque `@keyframes hint-rise { … }` (850-853).

En la línea 922, reemplazar:

```css
      .right-panel, .context-bar__interaction, .overlay-backdrop { animation: none; }
```

por:

```css
      .right-panel, .overlay-backdrop { animation: none; }
```

- [ ] **Step 2: Pruebas y build**

Run: `npm test --prefix frontend -- --runInBand src/styles/motion.contract.spec.ts`
Expected: PASS (3 bloques).

Run: `npm run test:frontend` y `npm run build:frontend`
Expected: todo en verde.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/motion.contract.spec.ts frontend/src/app/features/simulator/simulation-play.component.ts
git commit -m "fix(motion): el aviso de interacción aparece sin animación"
```

## Límites

- NO tocar el menú móvil del shell (`.siep-mobile-nav`), la bitácora ni el diálogo: son otros planes.
- NO cambiar `--psy-motion-fast/ui/section` (otros componentes los usan); solo se añade `--psy-ease-out`.
- NO tocar la regla global de `prefers-reduced-motion` (`styles.scss:611-620`).
- NO quitar hovers de color ni sombras: solo el desplazamiento.

## Verificación

- **Mecánica:** `npm test --prefix frontend -- --runInBand src/styles/motion.contract.spec.ts`, `npm run test:frontend` y `npm run build:frontend` en verde.
- **Revisión de sensación** (`npm run up`, http://localhost:4200):
  - Pasar el cursor por varios botones del portal: no hay barrido de luz; solo cambia el color. Al presionar, el botón se hunde levemente (0,97) y vuelve.
  - Entrar al dashboard: aparece con un fundido corto; nada sube desde abajo ni está borroso.
  - Recorrer la lista de intentos de Trazabilidad y las tarjetas de Grupos con el cursor: ninguna se mueve. Con Tab: contorno azul, sin movimiento.
  - Botones del dashboard: al pasar el cursor solo cambia la sombra; al presionar, se hunden.
  - En el juego, caminar hasta un objeto y alejarse varias veces: el aviso «E» aparece y desaparece al instante, sin parpadeo.
  - DevTools › Animations al 10 %: al entrar al dashboard solo se ve un cambio de opacidad de 150 ms.
  - DevTools › Rendering › «Emulate CSS media feature pointer: coarse» (o emulación de móvil): tocar tarjetas no deja estados de hover pegados.
- **Hecho cuando:** la prueba de contrato pasa y ningún control de uso frecuente se desplaza al pasar el cursor.
