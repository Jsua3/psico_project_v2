# 08 — Poda de assets, componentes y dependencias sin uso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `470a0a2` (rama `feat/personaje-v1-idle-walk`)
- **Severidad:** BAJA para el usuario, MEDIA para el despliegue (~8,4 MB publicados sin uso)
- **Categoría:** Técnica / mantenibilidad
- **Alcance estimado:** ~14 archivos borrados, 1 reescrito, 1 spec nuevo, `package.json` y `package-lock.json`

**Goal:** Quitar del proyecto lo que nadie usa: ~8,4 MB de imágenes sin referencias que se copian igual a cada build, cuatro componentes que no se montan en ninguna parte, la escena Phaser del login que nadie importa, configuración de login que apunta a archivos inexistentes y dos dependencias de gráficos que no se importan.

**Architecture:** Solo borrados y una reescritura mínima de `login-assets.config.ts` para dejar únicamente lo que `login.component.ts` consume. Cada borrado se justifica con una búsqueda de referencias en todo el repo (excluyendo `node_modules`, `dist`, `.angular` y `docs/`). Un spec nuevo impide que la configuración del login vuelva a apuntar a archivos inexistentes.

**Tech Stack:** Angular 21, Jest 30, npm.

**Spec:** Auditoría estética y técnica del 2026-09-29, sección «Técnica» (assets muertos, componentes sin montar, dependencias sin uso). Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- Solo se QUITAN dependencias (`chart.js`, `ng2-charts`); no se añade ninguna.
- No tocar `frontend/src/app/features/simulator/game-world.component.ts`, `player-motion.util.ts` ni `player-motion.util.spec.ts`.
- NO borrar `frontend/src/assets/characters/modular-legacy/`: es la fuente del pipeline `tools/character-assets/remaster_2x.py`.
- NO borrar `frontend/src/assets/images/institution/ascofapsi-logo.png` (logo institucional, 8 KB).
- Antes de borrar cada grupo, repetir su búsqueda de referencias. Si aparece alguna referencia nueva fuera de `docs/`, DETENERSE y reportar.
- Mensajes de commit en español con formato `tipo(ámbito): descripción`.

## Review Focus

- El login sigue mostrando su imagen (`assets/images/login/Login.jpeg`) y sus cuatro pilares S/E/D/A.
- La prueba e2e `no-chatbot.e2e.ts` sigue verde: comprueba que no existe `app-ai-assistant`, lo que se cumple con más razón tras borrarlo.
- El build no pierde ninguna imagen usada: portada, login, dashboard y juego se ven igual.
- `npm ci` en limpio funciona con el `package-lock.json` resultante.
- Ningún import roto: `npm run build:frontend` y `npm run test:frontend` en verde.

## Problema (con la evidencia de cada grupo)

**A. Imágenes sin referencias** (solo las cita la configuración vieja del login o nada):

| Archivo | Tamaño aprox. | Referencias fuera de `docs/` |
| --- | --- | --- |
| `frontend/src/assets/sprites/personaje/` (5 PNG: `base personaje.png`, `blink.png`, `idle_1.png`, `idle_2.png`, `idle_3.png`) | 4,4 MB | solo `login-assets.config.ts` (bloque `character`) |
| `frontend/src/assets/backgrounds/fondo_login_definitivo.png` | 1,7 MB | solo `login-assets.config.ts` |
| `frontend/src/assets/backgrounds/fondo_oficina.png.png` (idéntico byte a byte al anterior) | 1,7 MB | `login-assets.config.ts` y dos scripts de análisis del login viejo |
| `frontend/src/assets/panels/panel_inferior.png` | 0,1 MB | solo `login-assets.config.ts` |
| `frontend/src/assets/images/institution/psychology-program-hero.png` | 0,1 MB | ninguna |
| `frontend/src/assets/images/institution/psychology-program-hero3.png` | 0,5 MB | ninguna |
| `frontend/src/assets/images/institution/cip-banner.webp` | 0,2 MB | ninguna |

**B. Scripts de análisis del login viejo:** `frontend/scripts/analyze-desk-bounds.ps1` y `frontend/scripts/analyze-sprite-bounds.ps1` leen `backgrounds/fondo_oficina.png.png`; no los usa ningún `package.json` ni script.

**C. Escena Phaser del login sin importar:** `frontend/src/app/features/login/login-character.scene.ts` (exporta `createLoginCharacterScene`, sin llamadores).

**D. Configuración del login con rutas inexistentes.** `frontend/src/app/features/login/login-assets.config.ts:7-37` declara `LOGIN_ASSETS` con `icons` (`assets/icons/*.png`), `buttons` (`assets/buttons/*.png`) y `panels.loginCard` (`assets/panels/login_card.png`): esas carpetas y archivos no existen. `login.component.ts:19,50,52` solo usa `LOGIN_ASSETS.images.hero`, `LOGIN_PEDAGOGY_PILLARS` y `LOGIN_REMEMBER_EMAIL_KEY`. `LOGIN_PALETTE`, `LOGIN_CHARACTER_SPRITE_TRIM`, `LOGIN_BACKGROUND_DESK`, `LoginCharacterBreakpointProfile`, `LOGIN_CHARACTER_BREAKPOINTS`, `resolveLoginCharacterProfile`, `LOGIN_REFERENCE_MOCKUP`, `LOGIN_LAYOUT` y `loginLayoutCssVars` solo los usa la escena del grupo C. El campo `icon` de los pilares apunta a `LOGIN_ASSETS.icons.*` y la plantilla no lo lee (usa `short` y `color`).

**E. Componentes que no se montan** (ningún selector en plantillas ni import fuera de su propio archivo):
- `frontend/src/app/features/simulator/minimap.component.ts` y `minimap.component.spec.ts`
- `frontend/src/app/features/simulator/outcome-screen.component.ts`
- `frontend/src/app/features/simulator/ai-assistant/ai-assistant.component.ts` (y la carpeta `ai-assistant/`)
- `frontend/src/app/features/simulator/supervision-feedback.component.ts`

**F. Dependencias sin import:** `frontend/package.json` declara `"chart.js": "^4.4.3"` y `"ng2-charts": "^6.0.1"`; no hay ningún import en `frontend/src` (las gráficas del dashboard son SVG propio en `dashboard-charts.util.ts`).

## Convenciones del repo

- Jest: `npm test --prefix frontend -- --runInBand <ruta del spec>`; suite completa `npm run test:frontend`.
- Validadores de assets del personaje: `npm run test:character-assets --prefix frontend`.
- Specs que leen el disco: `frontend/src/app/features/simulator/case-pdf-rooms.spec.ts` (usa `fs` y `path`).

---

### Task 1: Configuración del login mínima y verificada

**Files:**
- Create: `frontend/src/app/features/login/login-assets.config.spec.ts`
- Modify (reescritura): `frontend/src/app/features/login/login-assets.config.ts`
- Delete: `frontend/src/app/features/login/login-character.scene.ts`

- [ ] **Step 1: Escribir la prueba**

```ts
import { existsSync } from 'fs';
import { join } from 'path';

import * as loginConfig from './login-assets.config';

const SRC = join(__dirname, '..', '..', '..');

describe('login-assets.config', () => {
  it('solo expone lo que usa el login', () => {
    expect(Object.keys(loginConfig).sort()).toEqual([
      'LOGIN_ASSETS',
      'LOGIN_PEDAGOGY_PILLARS',
      'LOGIN_REMEMBER_EMAIL_KEY',
    ]);
  });

  it('toda ruta de asset declarada existe en disco', () => {
    const paths = Object.values(loginConfig.LOGIN_ASSETS.images);
    for (const assetPath of paths) {
      expect(existsSync(join(SRC, assetPath))).toBe(true);
    }
  });

  it('los pilares no apuntan a íconos inexistentes', () => {
    for (const pillar of loginConfig.LOGIN_PEDAGOGY_PILLARS) {
      expect(Object.keys(pillar).sort()).toEqual(['color', 'description', 'key', 'short', 'title']);
    }
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/features/login/login-assets.config.spec.ts`
Expected: FAIL (hay más exports y los pilares tienen `icon`).

- [ ] **Step 2: Repetir la búsqueda de referencias**

Run (Git Bash, desde la raíz):

```bash
grep -rn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.angular --exclude-dir=docs -e "login-character.scene" -e "LOGIN_PALETTE" -e "LOGIN_CHARACTER_SPRITE_TRIM" -e "LOGIN_BACKGROUND_DESK" -e "LOGIN_CHARACTER_BREAKPOINTS" -e "resolveLoginCharacterProfile" -e "LOGIN_REFERENCE_MOCKUP" -e "LOGIN_LAYOUT" -e "loginLayoutCssVars" -e "LoginCharacterBreakpointProfile" .
```

Expected: solo coincidencias dentro de `frontend/src/app/features/login/login-assets.config.ts` y `frontend/src/app/features/login/login-character.scene.ts`. Si aparece otra, DETENERSE.

- [ ] **Step 3: Borrar la escena y reescribir la configuración**

Borrar `frontend/src/app/features/login/login-character.scene.ts`.

Reemplazar TODO el contenido de `frontend/src/app/features/login/login-assets.config.ts` por:

```ts
/**
 * Assets y constantes del login SIEP.
 */

/** Rutas relativas al `base href` (producción y `ng serve`). */
export const LOGIN_ASSETS = {
  images: {
    hero: 'assets/images/login/Login.jpeg'
  }
} as const;

export const LOGIN_REMEMBER_EMAIL_KEY = 'siep_login_email';

export interface LoginPedagogyPillar {
  key: string;
  title: string;
  description: string;
  color: string;
  short: string;
}

export const LOGIN_PEDAGOGY_PILLARS: LoginPedagogyPillar[] = [
  {
    key: 'simula',
    title: 'SIMULA',
    description: 'Entornos reales para practicar sin riesgos.',
    color: '#b24bff',
    short: 'S'
  },
  {
    key: 'evalua',
    title: 'EVALÚA',
    description: 'Mide tu progreso y toma decisiones informadas.',
    color: '#4cc9ff',
    short: 'E'
  },
  {
    key: 'decide',
    title: 'DECIDE',
    description: 'Desarrolla criterio y toma mejores decisiones.',
    color: '#f5c451',
    short: 'D'
  },
  {
    key: 'aprende',
    title: 'APRENDE',
    description: 'Fortalece competencias para transformar.',
    color: '#5ce38a',
    short: 'A'
  }
];
```

- [ ] **Step 4: Ejecutar y confirmar que pasa**

Run: `npm test --prefix frontend -- --runInBand src/app/features/login/login-assets.config.spec.ts`
Expected: PASS (3 pruebas).

Run: `npm run build:frontend`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/app/features/login
git commit -m "chore(login): quitar la escena Phaser sin uso y la configuración que apuntaba a archivos inexistentes"
```

---

### Task 2: Borrar imágenes y scripts sin uso

**Files:**
- Delete: los archivos de los grupos A y B de la tabla del Problema.

- [ ] **Step 1: Repetir la búsqueda de referencias**

```bash
grep -rn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.angular --exclude-dir=docs --exclude-dir=.git -e "sprites/personaje" -e "fondo_login_definitivo" -e "fondo_oficina" -e "panel_inferior" -e "psychology-program-hero" -e "cip-banner" .
```

Expected: solo coincidencias en `frontend/scripts/analyze-desk-bounds.ps1` y `frontend/scripts/analyze-sprite-bounds.ps1` (que también se borran). Si aparece cualquier otra, DETENERSE.

- [ ] **Step 2: Borrar**

```bash
git rm -r "frontend/src/assets/sprites/personaje"
git rm frontend/src/assets/backgrounds/fondo_login_definitivo.png "frontend/src/assets/backgrounds/fondo_oficina.png.png"
git rm frontend/src/assets/panels/panel_inferior.png
git rm frontend/src/assets/images/institution/psychology-program-hero.png frontend/src/assets/images/institution/psychology-program-hero3.png frontend/src/assets/images/institution/cip-banner.webp
git rm frontend/scripts/analyze-desk-bounds.ps1 frontend/scripts/analyze-sprite-bounds.ps1
```

- [ ] **Step 3: Verificar**

Run: `npm run build:frontend`
Expected: build OK.

Run: `npm run test:character-assets --prefix frontend`
Expected: PASS, con el mismo número de pruebas que antes del cambio (ejecutarlo también ANTES del Step 2 para tener la referencia). Estos validadores no leen las carpetas borradas.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(assets): borrar 8,4 MB de imágenes y scripts sin referencias"
```

---

### Task 3: Borrar componentes que no se montan

**Files:**
- Delete: grupo E del Problema.

- [ ] **Step 1: Repetir la búsqueda de referencias**

```bash
grep -rn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.angular --exclude-dir=docs -e "minimap.component" -e "MinimapComponent" -e "app-minimap" -e "outcome-screen.component" -e "OutcomeScreenComponent" -e "app-outcome-screen" -e "ai-assistant.component" -e "AiAssistantComponent" -e "supervision-feedback.component" -e "SupervisionFeedbackComponent" -e "app-supervision-feedback" frontend
```

Expected: solo coincidencias dentro de los propios archivos a borrar y la línea `await expect(page.locator('app-ai-assistant')).toHaveCount(0);` de `frontend/e2e/no-chatbot.e2e.ts` (que se conserva). Si aparece otra, DETENERSE.

- [ ] **Step 2: Borrar**

```bash
git rm frontend/src/app/features/simulator/minimap.component.ts frontend/src/app/features/simulator/minimap.component.spec.ts
git rm frontend/src/app/features/simulator/outcome-screen.component.ts
git rm -r frontend/src/app/features/simulator/ai-assistant
git rm frontend/src/app/features/simulator/supervision-feedback.component.ts
```

- [ ] **Step 3: Verificar**

Run: `npm run build:frontend`
Expected: build OK, sin imports rotos.

Run: `npm run test:frontend`
Expected: todas las suites en verde (una suite menos: `minimap.component.spec.ts`).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(simulator): borrar cuatro componentes que no se montan en ninguna parte"
```

---

### Task 4: Quitar dependencias de gráficos sin uso

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`

- [ ] **Step 1: Confirmar que no hay imports**

```bash
grep -rn -e "chart.js" -e "ng2-charts" frontend/src frontend/angular.json frontend/tsconfig.json frontend/tsconfig.app.json
```

Expected: sin resultados. Si hay alguno, DETENERSE.

- [ ] **Step 2: Desinstalar**

Run (desde la raíz): `npm uninstall chart.js ng2-charts --prefix frontend`
Expected: `package.json` sin esas dos entradas; `package-lock.json` actualizado.

- [ ] **Step 3: Verificar**

Run: `npm run build:frontend` y `npm run test:frontend`
Expected: ambos en verde.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): quitar chart.js y ng2-charts, que no se importan"
```

## Límites

- NO borrar nada de `frontend/src/assets/characters/` (incluido `modular-legacy/`) ni de `frontend/src/assets/game/`.
- NO borrar `frontend/src/assets/game/maps/generate-rooms.mjs` en este plan (es una herramienta; moverla fuera de `assets/` es otro cambio).
- NO tocar servicios ni modelos que usaban los componentes borrados; si quedan sin uso, se tratan aparte.
- NO reescribir `login.component.ts`: sus tres imports siguen existiendo con el mismo nombre.

## Verificación

- **Mecánica:** `npm run build:frontend`, `npm run test:frontend` y `npm run test:e2e -- no-chatbot.e2e.ts` en verde. `du -sh frontend/src/assets` baja unos 8 MB respecto de antes.
- **Revisión visual** (`npm run up`, http://localhost:4200): portada, login (imagen del panel y pilares S/E/D/A), dashboard, catálogo, editor de personaje y una sala del juego se ven igual que antes. En DevTools › Network no aparece ningún 404.
- **Hecho cuando:** todas las búsquedas de referencias quedan vacías y el build publica unos 8 MB menos.
