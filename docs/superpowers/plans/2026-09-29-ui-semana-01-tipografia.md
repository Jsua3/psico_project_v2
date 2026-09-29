# 01 — Cargar de verdad Poppins y JetBrains Mono — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `470a0a2` (rama `feat/personaje-v1-idle-walk`)
- **Severidad:** ALTA (afecta a todas las pantallas)
- **Categoría:** Consistencia visual / tipografía
- **Alcance estimado:** 8 fuentes nuevas + 2 licencias, 3 archivos editados, 1 prueba e2e nueva

**Goal:** Que la app se vea en Poppins (texto) y JetBrains Mono (código y cifras monoespaciadas) en cualquier equipo, en vez de caer a Segoe UI o a la fuente del sistema.

**Architecture:** Hoy todo el CSS declara `font-family: 'Poppins', …` y `'JetBrains Mono', …`, pero no existe ningún `@font-face` ni `<link>` que las cargue: el navegador usa la siguiente fuente de la lista. Se autoalojan los archivos woff2 (subset latin) en `frontend/src/assets/fonts/`, junto a la fuente de íconos que ya se autoaloja igual, y se declaran con `@font-face` en `styles.scss`. No se cambia ninguna regla `font-family` existente salvo dos que fuerzan la fuente del sistema.

**Tech Stack:** Angular 21 (CSS global en `frontend/src/styles/styles.scss`), Playwright para la prueba e2e.

**Spec:** Auditoría estética y técnica del 2026-09-29, problema de fondo 2 («Cuatro identidades visuales sin un sistema común»). Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias npm ni pip. Las fuentes se descargan como archivos estáticos.
- No tocar `frontend/src/app/features/simulator/game-world.component.ts`, `player-motion.util.ts` ni `player-motion.util.spec.ts` (otra línea de trabajo los está modificando).
- Si un fragmento «Actual» no coincide con el archivo (drift desde `470a0a2`), DETENERSE y reportar; no improvisar.
- Versiones fijadas: `@fontsource/poppins@5.3.0` y `@fontsource/jetbrains-mono@5.3.0` (licencia SIL OFL 1.1).
- Mensajes de commit en español con formato `tipo(ámbito): descripción`.

## Review Focus

- Una página abierta sin conexión a internet: las fuentes deben venir del propio servidor (`/assets/fonts/…`), nunca de un CDN en tiempo de ejecución.
- Caracteres del español (á é í ó ú ñ ü ¿ ¡ « » — …): deben verse en Poppins, no en la fuente de respaldo. El subset latin los cubre; la prueba e2e renderiza un texto con ellos.
- Pesos intermedios 650 y 750 que usa el código: el navegador los resuelve a 700 y 800. No hace falta un archivo por cada uno.
- El texto dentro del lienzo de Phaser (Arial y monospace) queda fuera de este plan. No debe cambiar.
- El presupuesto de build `initial` (warning 850 kB) no debe empeorar: las fuentes son assets, no entran en el bundle.

## Problema

`frontend/src/styles/styles.scss:76-86` (actual):

```scss
html {
  scroll-behavior: smooth;
  background: var(--psy-bg);
  font-family: 'Poppins', 'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

body {
  min-height: 100%;
  margin: 0;
  font-family: 'Poppins', 'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

`frontend/src/index.html` solo precarga la fuente de íconos:

```html
  <link rel="preload" href="/assets/fonts/material-symbols-rounded.woff2" as="font" type="font/woff2" crossorigin>
```

`frontend/src/assets/fonts/` contiene únicamente `material-symbols-rounded.woff2`. Comprobado en el navegador: `document.fonts` solo lista «Material Symbols Rounded». Además, dos reglas fuerzan la fuente del sistema aunque Poppins estuviera disponible:

`frontend/src/styles/styles.scss:5-16` (actual):

```scss
$psychology-theme: mat.define-theme((
  color: (
    theme-type: light,
    primary: mat.$azure-palette,
    tertiary: mat.$cyan-palette
  ),
  typography: (
    brand-family: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    plain-family: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
  ),
  density: (scale: 0)
));
```

`frontend/src/app/features/login/login.component.scss:20` (actual, dentro de `.siep-login { … }`):

```scss
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

Pesos en uso en el código: 400, 500, 600, 650, 700, 750, 800 y 900.

## Objetivo

- `frontend/src/assets/fonts/` contiene `poppins-latin-{400,500,600,700,800,900}-normal.woff2`, `jetbrains-mono-latin-{400,700}-normal.woff2`, `LICENSE-poppins.txt` y `LICENSE-jetbrains-mono.txt`.
- `styles.scss` declara un `@font-face` por archivo, con `font-display: swap`.
- `index.html` precarga Poppins 400 (cuerpo) y 800 (títulos).
- El tema de Material y el login usan Poppins.

## Convenciones del repo

- La fuente de íconos ya se autoaloja así (`frontend/src/styles/styles.scss:124-135`): `src: url('/assets/fonts/material-symbols-rounded.woff2') format('woff2');` con ruta absoluta `/assets/...`. Imitar ese formato.
- Pruebas e2e: `frontend/e2e/*.e2e.ts`, Playwright, `baseURL` por entorno. Ejemplo de estilo: `frontend/e2e/lobby.e2e.ts`. Se ejecutan con `npm run test:e2e -- <filtro>` desde la raíz (levanta un stack aislado).

---

### Task 1: Prueba e2e que exige Poppins cargada

**Files:**
- Create: `frontend/e2e/fonts.e2e.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada que usen otras tareas.

- [ ] **Step 1: Escribir la prueba**

```ts
import { test, expect, Page } from '@playwright/test';

/**
 * Tipografía autoalojada: Poppins y JetBrains Mono deben cargarse desde
 * /assets/fonts y no caer a la fuente del sistema.
 */

async function loadedFamilies(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter(face => face.status === 'loaded')
      .map(face => `${face.family.replace(/"/g, '')}:${face.weight}`);
  });
}

for (const path of ['/', '/login']) {
  test(`Poppins se carga desde el propio servidor en ${path}`, async ({ page }) => {
    const fontRequests: string[] = [];
    page.on('request', request => {
      if (request.resourceType() === 'font') fontRequests.push(request.url());
    });

    await page.goto(path);
    await page.evaluate(() => {
      const probe = document.createElement('p');
      probe.id = 'font-probe';
      probe.textContent = 'Sesión ¿Qué? ¡Ñandú! «Güelcome» — acción…';
      probe.style.fontWeight = '800';
      document.body.appendChild(probe);
    });

    const families = await loadedFamilies(page);
    expect(families).toContain('Poppins:400');
    expect(families).toContain('Poppins:800');

    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFont.replace(/"/g, '')).toMatch(/^Poppins\b/);

    const poppinsRequests = fontRequests.filter(url => url.includes('/assets/fonts/poppins-latin-'));
    expect(poppinsRequests.length).toBeGreaterThan(0);
    for (const url of fontRequests) {
      expect(new URL(url).host).toBe(new URL(page.url()).host);
    }
  });
}
```

- [ ] **Step 2: Ejecutarla y confirmar que falla**

Run (desde la raíz): `npm run test:e2e -- fonts.e2e.ts`
Expected: FAIL en `expect(families).toContain('Poppins:400')`, porque hoy solo se carga «Material Symbols Rounded».

- [ ] **Step 3: Commit de la prueba roja no se hace.** Continuar con la Task 2 y hacer un solo commit al final de ella.

---

### Task 2: Descargar las fuentes y declararlas

**Files:**
- Create: `frontend/src/assets/fonts/poppins-latin-400-normal.woff2` (y 500, 600, 700, 800, 900)
- Create: `frontend/src/assets/fonts/jetbrains-mono-latin-400-normal.woff2` y `…-700-normal.woff2`
- Create: `frontend/src/assets/fonts/LICENSE-poppins.txt`, `frontend/src/assets/fonts/LICENSE-jetbrains-mono.txt`
- Modify: `frontend/src/styles/styles.scss:5-16` y la zona de `@font-face` (líneas 121-135)
- Modify: `frontend/src/index.html`
- Modify: `frontend/src/app/features/login/login.component.scss:20`

**Interfaces:**
- Consumes: la prueba de la Task 1.
- Produces: familias CSS `'Poppins'` (400–900) y `'JetBrains Mono'` (400, 700) disponibles globalmente.

- [ ] **Step 1: Descargar los archivos (versiones fijadas)**

Desde la raíz del repo (funciona en PowerShell con `curl.exe` y en Git Bash con `curl`):

```bash
curl -L -o frontend/src/assets/fonts/poppins-latin-400-normal.woff2 https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.3.0/files/poppins-latin-400-normal.woff2
curl -L -o frontend/src/assets/fonts/poppins-latin-500-normal.woff2 https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.3.0/files/poppins-latin-500-normal.woff2
curl -L -o frontend/src/assets/fonts/poppins-latin-600-normal.woff2 https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.3.0/files/poppins-latin-600-normal.woff2
curl -L -o frontend/src/assets/fonts/poppins-latin-700-normal.woff2 https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.3.0/files/poppins-latin-700-normal.woff2
curl -L -o frontend/src/assets/fonts/poppins-latin-800-normal.woff2 https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.3.0/files/poppins-latin-800-normal.woff2
curl -L -o frontend/src/assets/fonts/poppins-latin-900-normal.woff2 https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.3.0/files/poppins-latin-900-normal.woff2
curl -L -o frontend/src/assets/fonts/jetbrains-mono-latin-400-normal.woff2 https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.3.0/files/jetbrains-mono-latin-400-normal.woff2
curl -L -o frontend/src/assets/fonts/jetbrains-mono-latin-700-normal.woff2 https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.3.0/files/jetbrains-mono-latin-700-normal.woff2
curl -L -o frontend/src/assets/fonts/LICENSE-poppins.txt https://cdn.jsdelivr.net/npm/@fontsource/poppins@5.3.0/LICENSE
curl -L -o frontend/src/assets/fonts/LICENSE-jetbrains-mono.txt https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono@5.3.0/LICENSE
```

- [ ] **Step 2: Validar que son woff2 reales**

Run: `node -e "const fs=require('fs');for(const f of fs.readdirSync('frontend/src/assets/fonts').filter(n=>n.endsWith('.woff2'))){const b=fs.readFileSync('frontend/src/assets/fonts/'+f);console.log(f,b.length,b.subarray(0,4).toString())}"`
Expected: 9 líneas; cada archivo empieza con `wOF2`. Tamaños aproximados: Poppins entre 7 y 9 KB, JetBrains Mono ~21 KB. Si alguno no empieza con `wOF2` o pesa menos de 5 KB, DETENERSE (la descarga falló).

- [ ] **Step 3: Declarar las fuentes en `styles.scss`**

Justo ANTES del comentario `/* ─── Icon font: Material Symbols Rounded ───…` (línea ~121), insertar:

```scss
/* ─── Texto: Poppins y JetBrains Mono ─────────────────────────────────────── */
/* Autoalojadas (sin CDN en tiempo de ejecución). Origen: @fontsource/poppins@5.3.0
   y @fontsource/jetbrains-mono@5.3.0, SIL OFL 1.1 (licencias en assets/fonts/).
   Solo subset latin: cubre el español. Los pesos 650 y 750 del código se
   resuelven a 700 y 800. */
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/assets/fonts/poppins-latin-400-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url('/assets/fonts/poppins-latin-500-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('/assets/fonts/poppins-latin-600-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/assets/fonts/poppins-latin-700-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url('/assets/fonts/poppins-latin-800-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url('/assets/fonts/poppins-latin-900-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/assets/fonts/jetbrains-mono-latin-400-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/assets/fonts/jetbrains-mono-latin-700-normal.woff2') format('woff2');
}

```

- [ ] **Step 4: Tema de Material con Poppins**

En `frontend/src/styles/styles.scss:11-14`, reemplazar el bloque `typography` por:

```scss
  typography: (
    brand-family: "'Poppins', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    plain-family: "'Poppins', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  ),
```

- [ ] **Step 5: Login con Poppins**

En `frontend/src/app/features/login/login.component.scss:20`, reemplazar:

```scss
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

por:

```scss
  font-family: 'Poppins', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

- [ ] **Step 6: Precargar los dos pesos críticos**

En `frontend/src/index.html`, debajo de la línea que precarga `material-symbols-rounded.woff2`, añadir:

```html
  <link rel="preload" href="/assets/fonts/poppins-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/poppins-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
```

- [ ] **Step 7: Ejecutar la prueba e2e**

Run: `npm run test:e2e -- fonts.e2e.ts`
Expected: PASS (2 pruebas: `/` y `/login`).

- [ ] **Step 8: Build y pruebas unitarias**

Run: `npm run build:frontend`
Expected: build OK, sin nuevos avisos de presupuesto. `frontend/dist/…/browser/assets/fonts/` contiene los 8 woff2 nuevos.

Run: `npm run test:frontend`
Expected: todas las suites en verde (no se tocó lógica).

- [ ] **Step 9: Commit**

```bash
git add frontend/e2e/fonts.e2e.ts frontend/src/assets/fonts frontend/src/styles/styles.scss frontend/src/index.html frontend/src/app/features/login/login.component.scss
git commit -m "fix(ui): autoalojar Poppins y JetBrains Mono (antes nunca se cargaban)"
```

## Límites

- NO cambiar ninguna otra regla `font-family` del proyecto; las ~50 declaraciones con `'Poppins'` o `'JetBrains Mono'` empiezan a funcionar solas.
- NO tocar el texto del lienzo de Phaser (`fontFamily: 'Arial, sans-serif'` y `'monospace'` en `game-world.component.ts`, `game-menu.component.ts`, `case-pdf-rooms.renderer.ts`). Eso pertenece a la decisión estructural de fuente pixel del juego.
- NO reducir ni reemplazar `material-symbols-rounded.woff2` en este plan (el subset de íconos es un trabajo aparte que requiere validar la herramienta).
- NO usar Google Fonts ni ningún CDN en tiempo de ejecución.

## Verificación

- **Mecánica:** `npm run test:e2e -- fonts.e2e.ts` en verde; `npm run build:frontend` sin avisos nuevos; `npm run test:frontend` en verde.
- **Revisión visual:** `npm run up`, abrir http://localhost:4200.
  - En DevTools › Network, filtro «Font»: aparecen `poppins-latin-400-normal.woff2` y `…-800-…` con estado 200 y origen `localhost`.
  - En DevTools › Elements, seleccionar el titular de la portada › pestaña Computed › «Rendered Fonts»: debe decir «Poppins — Network resource».
  - Comparar portada, login y dashboard antes y después: los títulos se ven más redondeados y geométricos; ninguna letra con tilde cambia de fuente dentro de una palabra.
  - Con DevTools › Network › «Offline» tras la primera carga, recargar: el texto sigue en Poppins (caché del propio servidor, sin CDN).
- **Hecho cuando:** la prueba e2e pasa y «Rendered Fonts» muestra Poppins en portada, login y portal.
