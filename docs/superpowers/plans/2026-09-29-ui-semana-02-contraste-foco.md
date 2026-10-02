# 02 — Corregir contrastes y foco visible — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `470a0a2` (rama `feat/personaje-v1-idle-walk`)
- **Severidad:** ALTA (WCAG 1.4.3 y 1.4.11)
- **Categoría:** Accesibilidad / contraste
- **Alcance estimado:** 7 archivos, cambios pequeños de CSS y datos de color; 1 prueba nueva

**Goal:** Que todo texto y todo indicador de foco de las pantallas señaladas cumpla WCAG AA: 4,5:1 para texto normal y 3:1 para el anillo de foco.

**Architecture:** El foco global usa `outline: 3px solid var(--psy-focus)` con un azul pensado para fondos claros (4,58:1 sobre blanco, 1,46:1 sobre azul marino). En vez de reescribir reglas de foco, cada contenedor oscuro redefine la variable `--psy-focus`, que se hereda. Los colores de texto se corrigen en su origen (datos de la portada, tarjeta de reanudar, ayuda de controles). Una prueba de «contrato de fuente» calcula los ratios WCAG de los colores nuevos y fija los cambios, siguiendo el patrón ya usado en `frontend/src/app/features/simulator/scene-renderer.registry.spec.ts` (lee el código fuente con `readFileSync`).

**Tech Stack:** SCSS y estilos inline de componentes Angular 21, Jest 30.

**Spec:** Auditoría estética y técnica del 2026-09-29, problema de fondo 4 y tabla «Portada y login». Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias.
- No tocar `frontend/src/app/features/simulator/game-world.component.ts`, `player-motion.util.ts` ni `player-motion.util.spec.ts`.
- NO tocar las reglas `:hover`/`:focus-visible` combinadas de `.quick-action-card` (`quick-actions.component.ts`), `.attempt-card` y `.review-summary-card--action` (`instructor-trace.component.ts`): las reescribe el plan 03.
- Si un fragmento «Actual» no coincide con el archivo, DETENERSE y reportar.
- Ratios objetivo (fórmula WCAG 2.x): texto ≥ 4,5:1; anillo de foco ≥ 3:1 contra el fondo inmediato.
- Mensajes de commit en español con formato `tipo(ámbito): descripción`.

## Review Focus

- Navegar con Tab por la portada, el login y el portal: el anillo de foco debe verse en fondos oscuros (hero, cabecera, banda final, panel derecho del login) y en fondos claros (tarjeta del login, tarjetas del portal).
- La tarjeta «Continuar simulación formativa» aparece sobre el juego en modo oscuro (`body.game-mode`): su título, texto, cifras y botones deben leerse.
- El encabezado pequeño (`.psy-eyebrow`) de las tarjetas oscuras del simulador («Aviso de contenido», «Introducción», «Primera escena», «Intento en progreso») hoy es azul oscuro sobre azul marino.
- Los chips y números de colores de la portada con texto de 11–13 px.
- El checkbox «Recordar sesión» del login: hoy pierde el contorno de foco.

## Problema (fragmentos actuales)

**1. Tarjeta de reanudar ilegible (≈2,4:1).** Vidrio claro con texto blanco.

`frontend/src/app/features/simulator/simulation-play.component.ts:96`:

```html
          <article class="resume-card liquid-glass" cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
```

`frontend/src/app/features/simulator/simulation-play.component.ts:837-839`:

```css
    .resume-card {
      width: min(560px, 100%); padding: clamp(24px, 4vw, 36px); color: #e8f0f4; text-align: left;
    }
```

`.liquid-glass` (en `frontend/src/styles/styles.scss:220`) pone `background: rgba(255, 255, 255, 0.64)`.

**2. Encabezado pequeño azul sobre fondos oscuros del juego.** `frontend/src/styles/styles.scss:317-324`:

```scss
.psy-eyebrow {
  margin: 0 0 10px;
  color: var(--siep-blue-soft);
  font-size: .76rem;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
}
```

`--siep-blue-soft` es `#0B5A8A`; las tarjetas oscuras del simulador son `#12182A`.

**3. Ayuda de controles del juego (2,8:1, 10,9 px).** `frontend/src/app/features/simulator/simulation-play.component.ts:585-592`:

```css
    .context-bar__hint {
      margin: 0;
      font-size: .68rem;
      font-weight: 700;
      letter-spacing: .04em;
      color: rgba(232,240,244,.34);
      white-space: nowrap;
    }
```

**4. Colores de la portada.** `frontend/src/app/features/public/landing.component.ts` usa como `accent` los valores `'#7c3aed'`, `'#14b8a6'`, `'#f97316'` y `'#3b82f6'` en `trainingCases`, `workflow` y `roles`. Se pintan como texto de chip sobre su propio tinte al 12 % y como fondo de los números blancos del flujo: teal 2,17:1, naranja 2,41:1, números blancos sobre teal 2,49:1.

**5. Titular con degradado (tramo central 2,36:1).** `frontend/src/app/features/public/landing.component.scss:28-33`:

```scss
.landing-accent {
  background: linear-gradient(135deg, var(--siep-lavender) 0%, var(--siep-primary) 50%, #a78bfa 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

**6. Cabecera de la portada.** Fondo que se desvanece a transparente, así que al desplazar el logo queda encima del contenido. `frontend/src/app/features/public/landing.component.scss:71`:

```scss
  background: linear-gradient(180deg, rgba(12, 18, 34, 0.92) 0%, rgba(12, 18, 34, 0.72) 70%, transparent 100%);
```

El enlace «Ingresar» de la cabecera no tiene variante y hereda el azul global de `a` (`#004876`) sobre azul marino. `frontend/src/app/features/public/landing.component.html:28`:

```html
      <a class="landing-btn landing-btn--sm" routerLink="/login">
```

**7. Variable inexistente.** `frontend/src/app/features/public/landing.component.scss:90` y `:180` usan `var(--siep-primary-glow)`, que no está definida (la sombra no se pinta). La que existe es `--landing-purple-glow` (línea 15).

**8. Foco sobre fondos oscuros.** `frontend/src/styles/styles.scss:49` define `--psy-focus: rgba(0, 72, 118, .72);` y `:674-678` lo aplica a todo `:focus-visible`. Solo `body.game-mode` tiene un color claro (`#C9B3FF`, línea ~685).

**9. Login.** `frontend/src/app/features/login/login.component.scss:278` pone `outline: none;` en `.auth-container input`, lo que elimina el contorno del checkbox «Recordar sesión».

**10. Anillos locales del portal por debajo de 3:1.**

`frontend/src/app/features/dashboard/dashboard.component.scss:319-322`:

```scss
.pixel-button:focus-visible {
  outline: 3px solid rgba(124, 77, 255, 0.45);
  outline-offset: 2px;
}
```

`frontend/src/app/features/simulator/instructor-trace.component.ts:1100-1106`:

```css
    input:focus-visible,
    textarea:focus-visible,
    .pixel-button:focus-visible {
      outline: 3px solid rgba(111, 76, 175, .28);
      outline-offset: 2px;
      border-color: #6f4caf;
    }
```

## Objetivo (valores exactos)

| Superficie | Nuevo valor | Ratio |
| --- | --- | --- |
| Tarjeta de reanudar | fondo `linear-gradient(180deg, rgba(18,24,42,.96), rgba(8,12,18,.98))`, texto `#fff` y `rgba(232,240,244,.72)` | 17,6:1 y 8,4:1 |
| `.psy-eyebrow` en modo juego | `#B69CFF` | 7,7:1 sobre `#12182A` |
| Ayuda de controles | `rgba(232,240,244,.72)`, `.75rem` | 8,9:1 |
| Acentos de la portada | `#6D28D9`, `#115E59`, `#9A3412`, `#1D4ED8` | ≥ 5,1:1 sobre su tinte; blanco sobre ellos ≥ 6,7:1 |
| Titular | degradado `#c4b5fd → #a78bfa` | 9,1:1 y 6,2:1 |
| Foco en fondos oscuros | `--psy-focus: #C9B3FF` | ≥ 9:1 sobre `#151d32`, `#0c1222`, `#1a1040` |
| Foco en el panel índigo del login | `--psy-focus: #FFFFFF` | ≥ 4,5:1 sobre `#5c6bc0` |
| Anillos locales del portal | `var(--psy-focus)` | 4,58:1 sobre blanco |

## Convenciones del repo

- Pruebas que leen el código fuente: `frontend/src/app/features/simulator/scene-renderer.registry.spec.ts:1,56` (`readFileSync(join(__dirname, '…'), 'utf-8')`).
- Jest: `npm test --prefix frontend -- --runInBand <ruta del spec>` desde la raíz.
- Las tarjetas oscuras del simulador usan este fondo (ejemplo a imitar, `simulation-play.component.ts:703-716`, `.case-intro-card`): `border: 1px solid rgba(182,156,255,.34); border-radius: 18px; background: linear-gradient(180deg, rgba(18,24,42,.96), rgba(8,12,18,.98));`.

---

### Task 1: Prueba de contrato de contraste

**Files:**
- Create: `frontend/src/styles/contrast.contract.spec.ts`

**Interfaces:**
- Produces: `contrast(a, b)` local al spec; las Tasks 2-5 añaden bloques `describe` al mismo archivo.

- [ ] **Step 1: Crear el spec con el cálculo WCAG y el primer bloque (simulador)**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('contraste: simulador', () => {
  const play = source('../app/features/simulator/simulation-play.component.ts');
  const styles = source('./styles.scss');

  it('la tarjeta de reanudar no usa el vidrio claro', () => {
    expect(play).not.toContain('resume-card liquid-glass');
    expect(play).toMatch(/\.resume-card \{[^}]*linear-gradient\(180deg, rgba\(18,24,42,\.96\), rgba\(8,12,18,\.98\)\)/);
  });

  it('el encabezado pequeño se aclara en modo juego', () => {
    expect(styles).toContain('body.game-mode .psy-eyebrow {');
    expect(styles).toMatch(/body\.game-mode \.psy-eyebrow \{\s*color: #B69CFF;/);
    expect(contrast('#B69CFF', '#12182A')).toBeGreaterThanOrEqual(4.5);
  });

  it('la ayuda de controles es legible', () => {
    expect(play).toMatch(/\.context-bar__hint \{[^}]*font-size: \.75rem;[^}]*color: rgba\(232,240,244,\.72\);/);
  });
});
```

- [ ] **Step 2: Ejecutar y confirmar que falla**

Run: `npm test --prefix frontend -- --runInBand src/styles/contrast.contract.spec.ts`
Expected: FAIL en los tres `it` (los valores aún no existen).

---

### Task 2: Simulador (tarjeta de reanudar, encabezado, ayuda de controles)

**Files:**
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts:96`, `:585-592`, `:837-839`
- Modify: `frontend/src/styles/styles.scss` (junto a `body.game-mode :focus-visible`, línea ~685)

- [ ] **Step 1: Quitar el vidrio claro**

En `simulation-play.component.ts:96`, reemplazar `class="resume-card liquid-glass"` por `class="resume-card"`.

- [ ] **Step 2: Fondo oscuro de la tarjeta**

Reemplazar el bloque `.resume-card { … }` de las líneas 837-839 por:

```css
    .resume-card {
      width: min(560px, 100%); padding: clamp(24px, 4vw, 36px); color: #e8f0f4; text-align: left;
      border: 1px solid rgba(182,156,255,.34);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(18,24,42,.96), rgba(8,12,18,.98));
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.04),
        0 28px 80px -36px rgba(124,77,255,.75);
    }
```

- [ ] **Step 3: Ayuda de controles legible**

Reemplazar el bloque `.context-bar__hint { … }` de las líneas 585-592 por:

```css
    .context-bar__hint {
      margin: 0;
      font-size: .75rem;
      font-weight: 700;
      letter-spacing: .04em;
      color: rgba(232,240,244,.72);
      white-space: nowrap;
    }
```

- [ ] **Step 4: Encabezado pequeño claro en modo juego**

En `frontend/src/styles/styles.scss`, inmediatamente DESPUÉS del bloque `body.game-mode :focus-visible { … }`, añadir:

```scss
/** Eyebrow sobre las tarjetas oscuras del simulador: #B69CFF = 7,7:1 sobre #12182A. */
body.game-mode .psy-eyebrow {
  color: #B69CFF;
}
```

- [ ] **Step 5: Correr la prueba**

Run: `npm test --prefix frontend -- --runInBand src/styles/contrast.contract.spec.ts`
Expected: PASS del bloque «contraste: simulador».

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/contrast.contract.spec.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/styles/styles.scss
git commit -m "fix(a11y): contraste de la tarjeta de reanudar y textos oscuros del simulador"
```

---

### Task 3: Portada (acentos, titular, cabecera, foco)

**Files:**
- Modify: `frontend/src/app/features/public/landing.component.ts` (valores `accent`)
- Modify: `frontend/src/app/features/public/landing.component.scss:28-33`, `:60-72`, `:90`, `:180`
- Modify: `frontend/src/app/features/public/landing.component.html:28`
- Test: `frontend/src/styles/contrast.contract.spec.ts`

- [ ] **Step 1: Añadir el bloque de prueba de la portada**

Al final de `contrast.contract.spec.ts`:

```ts
describe('contraste: portada', () => {
  const data = source('../app/features/public/landing.component.ts');
  const scss = source('../app/features/public/landing.component.scss');
  const html = source('../app/features/public/landing.component.html');
  const accents = ['#6D28D9', '#115E59', '#9A3412', '#1D4ED8'];

  it('no quedan acentos claros que fallan AA', () => {
    for (const old of ['#7c3aed', '#14b8a6', '#f97316', '#3b82f6']) {
      expect(data).not.toContain(`'${old}'`);
    }
    for (const accent of accents) expect(data).toContain(`'${accent}'`);
  });

  it('los acentos pasan AA como texto y como fondo de texto blanco', () => {
    for (const accent of accents) {
      expect(contrast(accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el titular no usa el tramo oscuro del degradado', () => {
    expect(scss).toContain('background: linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%);');
    expect(contrast('#a78bfa', '#151d32')).toBeGreaterThanOrEqual(4.5);
  });

  it('la cabecera tiene fondo sólido y el enlace Ingresar es visible', () => {
    expect(scss).not.toContain('rgba(12, 18, 34, 0.72) 70%, transparent 100%');
    expect(html).toContain('class="landing-btn landing-btn--sm landing-btn--outline" routerLink="/login"');
  });

  it('el foco es claro en las zonas oscuras y no hay variables inexistentes', () => {
    expect(scss).toMatch(/\.landing-nav,\s*\.landing-hero,\s*\.landing-cta__inner \{\s*--psy-focus: #C9B3FF;/);
    expect(scss).not.toContain('--siep-primary-glow');
    for (const bg of ['#151d32', '#0c1222', '#1a1040']) {
      expect(contrast('#C9B3FF', bg)).toBeGreaterThanOrEqual(3);
    }
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/styles/contrast.contract.spec.ts`
Expected: FAIL en el bloque «contraste: portada».

- [ ] **Step 2: Reemplazar los acentos en los datos**

En `landing.component.ts`, reemplazar TODAS las apariciones (en `trainingCases`, `workflow` y `roles`):
- `accent: '#7c3aed'` → `accent: '#6D28D9'`
- `accent: '#14b8a6'` → `accent: '#115E59'`
- `accent: '#f97316'` → `accent: '#9A3412'`
- `accent: '#3b82f6'` → `accent: '#1D4ED8'`

(Algunas líneas terminan en `,` y otras no; conservar la puntuación.)

- [ ] **Step 3: Degradado del titular**

En `landing.component.scss:29`, reemplazar:

```scss
  background: linear-gradient(135deg, var(--siep-lavender) 0%, var(--siep-primary) 50%, #a78bfa 100%);
```

por:

```scss
  background: linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%);
```

- [ ] **Step 4: Cabecera sólida**

En `landing.component.scss:71`, reemplazar la línea `background: linear-gradient(180deg, rgba(12, 18, 34, 0.92) 0%, rgba(12, 18, 34, 0.72) 70%, transparent 100%);` por:

```scss
  background: rgba(12, 18, 34, 0.94);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
```

- [ ] **Step 5: Enlace «Ingresar» visible**

En `landing.component.html:28`, reemplazar `<a class="landing-btn landing-btn--sm" routerLink="/login">` por:

```html
      <a class="landing-btn landing-btn--sm landing-btn--outline" routerLink="/login">
```

- [ ] **Step 6: Sombra con la variable correcta**

En `landing.component.scss`, en las líneas 90 y 180, reemplazar `var(--siep-primary-glow)` por `var(--landing-purple-glow)`.

- [ ] **Step 7: Foco claro en las zonas oscuras**

En `landing.component.scss`, justo después del bloque `:host { … }` (que termina en la línea 16), añadir:

```scss

/* Zonas oscuras: el foco global (azul) no se ve aquí; #C9B3FF ≥ 9:1. */
.landing-nav,
.landing-hero,
.landing-cta__inner {
  --psy-focus: #C9B3FF;
}
```

- [ ] **Step 8: Correr la prueba**

Run: `npm test --prefix frontend -- --runInBand src/styles/contrast.contract.spec.ts`
Expected: PASS de los dos bloques.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/styles/contrast.contract.spec.ts frontend/src/app/features/public
git commit -m "fix(a11y): contraste y foco visible en la portada"
```

---

### Task 4: Login (foco en fondos oscuros y checkbox)

**Files:**
- Modify: `frontend/src/app/features/login/login.component.scss`
- Test: `frontend/src/styles/contrast.contract.spec.ts`

- [ ] **Step 1: Añadir el bloque de prueba del login**

```ts
describe('contraste: login', () => {
  const scss = source('../app/features/login/login.component.scss');

  it('el foco se adapta a cada superficie', () => {
    expect(scss).toMatch(/\.siep-login \{\s*--psy-focus: #C9B3FF;\s*\}/);
    expect(scss).toMatch(/\.auth-container \.form-container \{\s*--psy-focus: rgba\(0, 72, 118, \.72\);\s*\}/);
    expect(scss).toMatch(/\.toggle-container \{\s*--psy-focus: #FFFFFF;\s*\}/);
    expect(contrast('#FFFFFF', '#5c6bc0')).toBeGreaterThanOrEqual(3);
  });

  it('el checkbox recupera su contorno de foco', () => {
    expect(scss).toMatch(/\.auth-remember input:focus-visible \{\s*outline: 3px solid var\(--psy-focus\);\s*outline-offset: 2px;\s*\}/);
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/styles/contrast.contract.spec.ts`
Expected: FAIL en «contraste: login».

- [ ] **Step 2: Añadir las reglas al final de `login.component.scss`**

(Añadirlas al final del archivo, DESPUÉS del bloque `@media (prefers-reduced-motion: reduce)`, para que no las anule ninguna regla anterior.)

```scss

/* Foco visible por superficie (el global azul solo sirve sobre claro). */
.siep-login {
  --psy-focus: #C9B3FF;
}

.auth-container .form-container {
  --psy-focus: rgba(0, 72, 118, .72);
}

.toggle-container {
  --psy-focus: #FFFFFF;
}

.auth-remember input:focus-visible {
  outline: 3px solid var(--psy-focus);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Correr la prueba y hacer commit**

Run: `npm test --prefix frontend -- --runInBand src/styles/contrast.contract.spec.ts`
Expected: PASS.

```bash
git add frontend/src/styles/contrast.contract.spec.ts frontend/src/app/features/login/login.component.scss
git commit -m "fix(a11y): foco visible en el login sobre fondos oscuros y en el checkbox"
```

---

### Task 5: Anillos de foco del portal

**Files:**
- Modify: `frontend/src/app/features/dashboard/dashboard.component.scss:319-322`
- Modify: `frontend/src/app/features/simulator/instructor-trace.component.ts:1100-1106`
- Test: `frontend/src/styles/contrast.contract.spec.ts`

- [ ] **Step 1: Añadir el bloque de prueba del portal**

```ts
describe('contraste: portal', () => {
  it('los anillos locales usan el foco global', () => {
    const dash = source('../app/features/dashboard/dashboard.component.scss');
    const trace = source('../app/features/simulator/instructor-trace.component.ts');
    expect(dash).not.toContain('outline: 3px solid rgba(124, 77, 255, 0.45);');
    expect(dash).toMatch(/\.pixel-button:focus-visible \{\s*outline: 3px solid var\(--psy-focus\);/);
    expect(trace).not.toContain('outline: 3px solid rgba(111, 76, 175, .28);');
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/styles/contrast.contract.spec.ts`
Expected: FAIL en «contraste: portal».

- [ ] **Step 2: Dashboard**

En `dashboard.component.scss:319-322`, reemplazar el bloque por:

```scss
.pixel-button:focus-visible {
  outline: 3px solid var(--psy-focus);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Trazabilidad**

En `instructor-trace.component.ts:1100-1106`, reemplazar el bloque por:

```css
    input:focus-visible,
    textarea:focus-visible,
    .pixel-button:focus-visible {
      outline: 3px solid var(--psy-focus);
      outline-offset: 2px;
      border-color: #6f4caf;
    }
```

- [ ] **Step 4: Pruebas y build**

Run: `npm test --prefix frontend -- --runInBand src/styles/contrast.contract.spec.ts`
Expected: PASS (5 bloques).

Run: `npm run test:frontend` y `npm run build:frontend`
Expected: todo en verde; sin avisos nuevos de presupuesto.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/contrast.contract.spec.ts frontend/src/app/features/dashboard/dashboard.component.scss frontend/src/app/features/simulator/instructor-trace.component.ts
git commit -m "fix(a11y): anillos de foco del portal con contraste suficiente"
```

## Límites

- NO cambiar la paleta general (violeta, índigo, morado, azul): eso es la decisión estructural del sistema de diseño.
- NO tocar `.quick-action-card`, `.attempt-card` ni `.review-summary-card--action` (plan 03).
- NO cambiar tamaños de letra salvo `.context-bar__hint`.
- NO quitar el `liquid-glass` de ningún otro elemento: solo el de la tarjeta de reanudar.

## Verificación

- **Mecánica:** `npm test --prefix frontend -- --runInBand src/styles/contrast.contract.spec.ts` en verde; `npm run test:frontend` y `npm run build:frontend` en verde.
- **Revisión visual** (`npm run up`, http://localhost:4200):
  - Portada: pulsar Tab desde el inicio. Cada enlace de la cabecera, cada botón del hero y el de la banda final muestra un contorno lila claro bien visible. Al desplazar, la cabecera tiene fondo propio y nada se ve debajo del logo. «Ingresar» se lee en blanco con borde.
  - Portada: los chips de «Casos de entrenamiento» y los círculos numerados de «Cómo funciona» se leen sin esfuerzo (tonos más oscuros).
  - Login: Tab por el panel derecho (contorno blanco), por los campos (contorno azul) y por «Recordar sesión» (contorno azul visible).
  - Simulador: abrir un caso con un intento en curso. La tarjeta «Continuar simulación formativa» es oscura con texto blanco; «Intento en progreso» se ve lila. La ayuda «WASD mover · E interactuar…» se lee.
  - Portal: Tab por los botones del dashboard y por los campos de la rúbrica en Trazabilidad: contorno azul visible.
  - Opcional: DevTools › Lighthouse › Accessibility sobre `/` y `/login`: sin avisos de «color contrast».
- **Hecho cuando:** el spec de contrato pasa y un recorrido completo solo con teclado permite ver siempre dónde está el foco.
