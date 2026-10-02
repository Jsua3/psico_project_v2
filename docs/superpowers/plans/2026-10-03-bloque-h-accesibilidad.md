# Bloque H — Accesibilidad WCAG 2.2 AA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar las brechas del bloque H que tienen arreglo claro y prueba automática (contraste, foco visible, nombres accesibles y movimiento reducido en el diálogo) y dejar especificadas, sin tocar código, las que necesitan decisión o verificación con lector de pantalla (salida segura en diálogos e introducción, atajos de una tecla, mundo sin vista, anuncios).

**Architecture:** El proyecto ya prueba el contraste con «contratos de fuente» (`frontend/src/styles/contrast.contract.spec.ts` lee el código con `readFileSync` y calcula razones WCAG con una función local). Este plan extrae esa cuenta a un util puro con mezcla de alfa (`contrast.util.ts`, Task 1) y añade un contrato nuevo (`a11y-bloque-h.contract.spec.ts`) con un `describe` por tarea. Cada arreglo es un cambio de una línea o de un bloque pequeño en estilos o plantillas de componente, con tokens que ya existen (`--siep-muted`, `--psy-focus`); no hay CSS global nuevo. La única tarea con comportamiento (Task 7) lleva pruebas renderizadas con TestBed. Las tareas 10 a 15 están especificadas pero NO se ejecutan esta noche.

**Tech Stack:** Angular 21 (signals, `input()`), SCSS y estilos de componente, Jest 30 (ts-jest, jsdom), PowerShell para editar archivos CRLF.

**Spec:** [`docs/audits/2026-10-03-bloque-h-accesibilidad-brechas.md`](../../audits/2026-10-03-bloque-h-accesibilidad-brechas.md) (hallazgos H-01 a H-35), la sección «BLOQUE H» de [`docs/PLAN_MAESTRO_TOTAL.md`](../../PLAN_MAESTRO_TOTAL.md) y la hoja de ruta [`2026-10-02-brechas-plan-maestro-total.md`](../../audits/2026-10-02-brechas-plan-maestro-total.md).

## Global Constraints

- **No cambiar la semántica** de la salida segura (ETH-02: `PAUSED` es una pausa reanudable) ni la del consentimiento (ETH-01). Ninguna tarea [LISTA] toca `safeExit()`, `inputBlocked`, `handleGlobalInteraction` ni `game-world.component.ts` / `game-feel.util.ts`.
- Sin cambios de esquema de BD, sin dependencias nuevas, sin CSS global nuevo (`styles.scss` no se edita; solo se leen sus tokens).
- **CRLF:** todos los archivos del frontend que se tocan (también `.scss`, `.html` y specs) usan CRLF. Las expresiones regulares de las pruebas usan `\s*` entre líneas y no llevan saltos literales. Se edita con `Edit-Crlf` (abajo), que falla si el texto «Antes» no aparece exactamente una vez: eso sirve de comprobación de anclas. Si falla, DETENERSE y reportar.
- Otra sesión trabaja el bloque B en este worktree: `simulation-play.component.ts` y `simulation-hud.component.ts` pueden haber cambiado. No resolver diferencias a ojo: si un ancla no coincide, reportar.
- Comentarios, textos y mensajes de commit en español, formato `tipo(ámbito): descripción`.
- Pruebas desde `frontend/`: `npx jest --runInBand <ruta>`. Verificación final desde la raíz: `npm run test:frontend` y `npm run build:frontend`.

Ayudantes de PowerShell (pegarlos al inicio de la sesión; los comandos de cada tarea se lanzan desde la raíz del worktree):

```powershell
$base = git rev-parse HEAD   # para la comprobación final de LF sueltos
function Edit-Crlf {
  param([string]$Path, [string]$Old, [string]$New)
  $p = (Resolve-Path $Path).Path
  $text = [IO.File]::ReadAllText($p)
  $oldText = $Old -replace "`r?`n", "`r`n"
  $newText = $New -replace "`r?`n", "`r`n"
  $count = [regex]::Matches($text, [regex]::Escape($oldText)).Count
  if ($count -ne 1) { throw "Se esperaba 1 coincidencia y hay $count en $p" }
  [IO.File]::WriteAllText($p, $text.Replace($oldText, $newText), (New-Object Text.UTF8Encoding($false)))
}
function Convert-ToCrlf([string]$Path) {   # para archivos nuevos o ampliados con Write/Edit
  $p = (Resolve-Path $Path).Path
  $t = [IO.File]::ReadAllText($p) -replace "`r?`n", "`r`n"
  [IO.File]::WriteAllText($p, $t, (New-Object Text.UTF8Encoding($false)))
}
```

## Review Focus

1. **LF sueltos:** tras cada edición, `[IO.File]::ReadAllText($ruta) -match '(?<!\r)\n'` debe dar `False` (la Task 9 lo comprueba para todo lo tocado).
2. **`untracked` en el diálogo (Task 7):** cambiar «Movimiento reducido» con un diálogo abierto no debe reiniciarlo (la tercera prueba de la tarea lo fija). Sin `untracked`, el `effect` del constructor leería el interruptor y volvería a la línea 0.
3. **Anillo de la salida segura (Task 5):** solo cambia el color del anillo (`#F1A79F`, el mismo tono del texto del botón); no se tocan texto, tamaño ni disponibilidad del botón.
4. **Token `--siep-muted` en el login (Task 3):** `landing.component.scss` lo redefine en `:host` (#6B6478), pero el login no; el contrato lee el valor de `styles.scss`. Si alguien lo redefiniera en el login, el contraste medido dejaría de valer.
5. **`role="group"` del selector de perfil (Task 4):** no cambia Tab ni el clic; el e2e usa `input[type="email"]` y botones por nombre, sin selectores por `radiogroup`.
6. **Foco del DAG (Task 6):** no debe confundirse con «nodo seleccionado» (trazo #2F5F8F de 3 px); el foco usa #004876 de 4 px.
7. **Buscador de Grupos (Task 6):** el anillo va en `.search-box` (contenedor con borde), no en el `input`, que conserva `outline: 0`.
8. **Nada de las tareas 2 a 8 toca la lógica de salida segura**; si un diff lo hace, está mal.

## Mapa de tareas

| Task | Hallazgos | Estado |
|---|---|---|
| 1. Util de contraste | (base) | **[LISTA PARA EJECUTAR ESTA NOCHE]** |
| 2. Portada: botón primario | H-24 | **[LISTA PARA EJECUTAR ESTA NOCHE]** |
| 3. Login: contraste | H-25, H-26, H-27 | **[LISTA PARA EJECUTAR ESTA NOCHE]** |
| 4. Login: nombres accesibles | H-29 (nombre), H-30, H-31 | **[LISTA PARA EJECUTAR ESTA NOCHE]** |
| 5. Juego: foco y texto del diálogo | H-14, H-15 | **[LISTA PARA EJECUTAR ESTA NOCHE]** |
| 6. Foco en Grupos y en el editor DAG | H-17, H-18 | **[LISTA PARA EJECUTAR ESTA NOCHE]** |
| 7. Diálogo y movimiento reducido | H-13 | **[LISTA PARA EJECUTAR ESTA NOCHE]** |
| 8. Semántica de portada y HUD | H-11, H-32, H-33 | **[LISTA PARA EJECUTAR ESTA NOCHE]** |
| 9. Verificación completa | todas las anteriores | **[LISTA PARA EJECUTAR ESTA NOCHE]** |
| 10. Salida segura siempre alcanzable | H-01, H-02, H-03 | **[REQUIERE DECISIÓN]** |
| 11. Atajos de una sola tecla | H-07 | **[REQUIERE DECISIÓN]** |
| 12. Alternativa no visual del mundo | H-06 | **[REQUIERE DECISIÓN]** |
| 13. Anuncios de estrés y regiones vivas | H-08, H-09, H-10 | **[REQUIERE VERIFICACIÓN MANUAL]** |
| 14. Campos del login con borde y etiqueta | H-28, H-29 | **[REQUIERE DECISIÓN]** |
| 15. Puertas axe, foco no oculto y cierre | H-04, H-05, H-19, H-20, H-21 | **[REQUIERE VERIFICACIÓN MANUAL]** |

---

### Task 1: Util puro de contraste con mezcla de alfa — **[LISTA PARA EJECUTAR ESTA NOCHE]**

**Files:**
- Create: `frontend/src/styles/contrast.util.ts`
- Test: `frontend/src/styles/contrast.util.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `hexToRgb(hex: string): [number, number, number]`, `rgbToHex(rgb): string`, `relativeLuminance(hex: string): number`, `contrastRatio(a: string, b: string): number` (colores opacos), `blend(fg: string, alpha: number, bg: string): string` (hex opaco en minúsculas).

- [ ] **Step 1: Write the failing test**

```typescript
import { blend, contrastRatio, hexToRgb, relativeLuminance } from './contrast.util';

describe('contrast.util', () => {
  it('lee #RGB y #RRGGBB sin distinguir mayúsculas y rechaza lo demás', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#5C6bC0')).toEqual([92, 107, 192]);
    expect(() => hexToRgb('rojo')).toThrow('Color hexadecimal no válido');
    expect(() => hexToRgb('#12345')).toThrow('Color hexadecimal no válido');
  });

  it('negro sobre blanco es 21:1 y el orden de los colores no cambia la razón', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBe(0);
  });

  it('reproduce razones de referencia medidas con la fórmula WCAG 2.x', () => {
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2); // el gris mínimo AA sobre blanco
    expect(contrastRatio('#757575', '#F3F4F6')).toBeCloseTo(4.19, 2); // placeholder por defecto de Chrome sobre el campo del login
    expect(contrastRatio('#FFFFFF', '#7C3AED')).toBeCloseTo(5.7, 2); // texto blanco sobre el violeta del botón
  });

  it('mezcla un color translúcido sobre su fondo y devuelve un hex opaco en minúsculas', () => {
    expect(blend('#000000', 0.5, '#FFFFFF')).toBe('#808080');
    expect(blend('#FF0000', 0, '#0000FF')).toBe('#0000ff');
    expect(blend('#FFFFFF', 2, '#000000')).toBe('#ffffff');
    // rgba(255,255,255,.82) sobre #5c6bc0: lo que medía el texto pequeño del panel índigo del login
    expect(contrastRatio(blend('#FFFFFF', 0.82, '#5C6BC0'), '#5C6BC0')).toBeCloseTo(3.85, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `frontend/`): `npx jest --runInBand src/styles/contrast.util.spec.ts`
Expected: FAIL — `Cannot find module './contrast.util'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
export type Rgb = [number, number, number];

/** '#RGB' o '#RRGGBB' → [r, g, b] (0-255). Lanza si el formato no es válido. */
export function hexToRgb(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Color hexadecimal no válido: ${hex}`);
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/** Luminancia relativa de WCAG 2.x (0 = negro, 1 = blanco). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG 2.x entre dos colores opacos (de 1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Color opaco que resulta de pintar `fg` con opacidad `alpha` (0-1) sobre `bg`.
 * Para texto o anillos con rgba(): medir `contrastRatio(blend(fg, alpha, fondo), fondo)`.
 * Sobre un mapa o sobre un degradado, usar el peor fondo posible.
 */
export function blend(fg: string, alpha: number, bg: string): string {
  const a = Math.min(1, Math.max(0, alpha));
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return rgbToHex(f.map((c, i) => c * a + b[i] * (1 - a)) as Rgb);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (desde `frontend/`): `npx jest --runInBand src/styles/contrast.util.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Normalizar a CRLF y commit**

```powershell
Convert-ToCrlf frontend\src\styles\contrast.util.ts
Convert-ToCrlf frontend\src\styles\contrast.util.spec.ts
git add frontend/src/styles/contrast.util.ts frontend/src/styles/contrast.util.spec.ts
git commit -m "feat(a11y): util puro de razón de contraste WCAG con mezcla de alfa"
```

---

### Task 2: Portada — botón primario con texto blanco legible — **[LISTA PARA EJECUTAR ESTA NOCHE]**

**Files:**
- Modify: `frontend/src/app/features/public/landing.component.scss` (`.landing-btn--primary`, línea 187)
- Create: `frontend/src/styles/a11y-bloque-h.contract.spec.ts` (las Tasks 3, 5, 6, 7 y 8 le añaden un `describe` cada una)

**Interfaces:**
- Consumes: `contrastRatio` (Task 1).
- Produces: el archivo de contrato del bloque H.

**Valores (H-24):** texto blanco de 14,4 px en negrita (no es «grande»; mínimo 4,5:1).

| | Degradado del botón | Blanco sobre el inicio | Blanco sobre el final |
|---|---|---|---|
| Antes | `#8b5cf6 → #7c3aed` | **4,23:1** | 5,70:1 |
| Después | `#7c3aed → #6d28d9` | 5,70:1 | 7,10:1 |

- [ ] **Step 1: Write the failing test** — crear el archivo con este contenido:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

import { contrastRatio } from './contrast.util';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

describe('bloque H: portada', () => {
  const scss = source('../app/features/public/landing.component.scss');

  it('el botón primario no baja de 4,5:1 con texto blanco en ningún tramo del degradado', () => {
    // Antes: #8b5cf6 → #7c3aed; el inicio daba 4,23:1.
    expect(scss).not.toContain('#8b5cf6');
    expect(scss).toMatch(/\.landing-btn--primary \{[^}]*background: linear-gradient\(135deg, #7c3aed 0%, #6d28d9 100%\);/);
    for (const stop of ['#7c3aed', '#6d28d9']) {
      expect(contrastRatio('#FFFFFF', stop)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `frontend/`): `npx jest --runInBand src/styles/a11y-bloque-h.contract.spec.ts`
Expected: FAIL — 1 prueba (el degradado aún contiene `#8b5cf6`).

- [ ] **Step 3: Write minimal implementation**

```powershell
Edit-Crlf -Path frontend\src\app\features\public\landing.component.scss `
  -Old 'background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);' `
  -New 'background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);'
```

(El `:hover` y la sombra `--landing-purple-glow` no cambian.)

- [ ] **Step 4: Run test to verify it passes**

Run (desde `frontend/`): `npx jest --runInBand src/styles/a11y-bloque-h.contract.spec.ts src/styles/contrast.contract.spec.ts`
Expected: PASS (el contrato existente de la portada sigue en verde).

- [ ] **Step 5: Commit**

```powershell
Convert-ToCrlf frontend\src\styles\a11y-bloque-h.contract.spec.ts
git add frontend/src/app/features/public/landing.component.scss frontend/src/styles/a11y-bloque-h.contract.spec.ts
git commit -m "fix(a11y): botón primario de la portada con contraste suficiente"
```

---

### Task 3: Login — contraste del placeholder, el divisor y el texto pequeño — **[LISTA PARA EJECUTAR ESTA NOCHE]**

**Files:**
- Modify: `frontend/src/app/features/login/login.component.scss` (líneas ~293, 387, 423, 591)
- Test: `frontend/src/styles/a11y-bloque-h.contract.spec.ts` (ampliar)

**Interfaces:** Consumes `contrastRatio` (Task 1) y el token `--siep-muted: #5F6B76` de `styles.scss:29`. Produces: nada nuevo.

**Valores (H-25, H-26, H-27):**

| Elemento | Antes | Después |
|---|---|---|
| `::placeholder` de los campos (fondo #F3F4F6) | sin regla; Chrome #757575 = **4,19:1** | `var(--siep-muted)` #5F6B76 = 4,95:1, `opacity: 1` |
| «o» del divisor (fondo #FFFFFF) | `rgba(120, 120, 140, 0.85)` = **3,31:1** | `var(--siep-muted)` = 5,45:1 |
| «Conectando con Google…» (fondo #FFFFFF) | `rgba(120, 120, 140, 0.95)` = **3,92:1** | `var(--siep-muted)` = 5,45:1 |
| `.toggle-brand small` (sobre #5C6BC0, tramo claro) | `rgba(255, 255, 255, 0.82)` = **3,85:1** (4,38:1 en su posición) | `#fff` = 4,86:1 en todo el gradiente |

- [ ] **Step 1: Write the failing test** — añadir al final de `a11y-bloque-h.contract.spec.ts`:

```typescript
describe('bloque H: login (contraste)', () => {
  const scss = source('../app/features/login/login.component.scss');
  const muted = source('./styles.scss').match(/--siep-muted:\s*(#[0-9A-Fa-f]{6});/)?.[1] ?? '';

  it('el divisor y el estado de Google usan el token --siep-muted (≥ 4,5:1 sobre blanco)', () => {
    // Antes: rgba(120,120,140,.85) = 3,31:1 y rgba(120,120,140,.95) = 3,92:1.
    expect(muted).toBe('#5F6B76');
    expect(scss).toMatch(/\.auth-divider \{[^}]*color: var\(--siep-muted\);/);
    expect(scss).toMatch(/\.auth-google__status \{[^}]*color: var\(--siep-muted\);/);
    expect(contrastRatio(muted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('el placeholder tiene color propio y llega a 4,5:1 sobre el campo gris', () => {
    // Sin regla, Chrome pinta #757575: 4,19:1 sobre #f3f4f6.
    expect(scss).toMatch(/\.auth-container input::placeholder \{\s*color: var\(--siep-muted\);\s*opacity: 1;\s*\}/);
    expect(contrastRatio(muted, '#F3F4F6')).toBeGreaterThanOrEqual(4.5);
  });

  it('el texto pequeño del panel índigo es blanco puro (4,86:1 incluso en el tramo más claro)', () => {
    // Antes: rgba(255,255,255,.82) = 3,85:1 sobre #5c6bc0.
    expect(scss).toMatch(/\.toggle-brand small \{[^}]*color: #fff;/);
    expect(contrastRatio('#FFFFFF', '#5C6BC0')).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `frontend/`): `npx jest --runInBand src/styles/a11y-bloque-h.contract.spec.ts`
Expected: FAIL — 3 pruebas nuevas; la de la portada sigue en verde.

- [ ] **Step 3: Write minimal implementation**

```powershell
$scss = 'frontend\src\app\features\login\login.component.scss'
Edit-Crlf -Path $scss -Old 'color: rgba(120, 120, 140, 0.85);' -New 'color: var(--siep-muted);'
Edit-Crlf -Path $scss -Old 'color: rgba(120, 120, 140, 0.95);' -New 'color: var(--siep-muted);'
Edit-Crlf -Path $scss -Old 'color: rgba(255, 255, 255, 0.82);' -New 'color: #fff;'
Edit-Crlf -Path $scss -Old '.auth-password-wrap {' -New @'
.auth-container input::placeholder {
  color: var(--siep-muted);
  opacity: 1;
}

.auth-password-wrap {
'@
```

(La primera línea cae en `.auth-divider`, la segunda en `.auth-google__status` y la tercera en `.toggle-brand small`. Las líneas `rgba(120, 120, 140, 0.3)` de `.auth-divider::before/::after` son decorativas y no se tocan.)

- [ ] **Step 4: Run test to verify it passes**

Run (desde `frontend/`): `npx jest --runInBand src/styles/a11y-bloque-h.contract.spec.ts src/styles/contrast.contract.spec.ts src/app/features/login`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
Convert-ToCrlf frontend\src\styles\a11y-bloque-h.contract.spec.ts
git add frontend/src/app/features/login/login.component.scss frontend/src/styles/a11y-bloque-h.contract.spec.ts
git commit -m "fix(a11y): contraste del placeholder, el divisor y el texto pequeño del login"
```

---

### Task 4: Login — nombres accesibles y rol del selector de perfil — **[LISTA PARA EJECUTAR ESTA NOCHE]**

**Files:**
- Modify: `frontend/src/app/features/login/login.component.html` (líneas 5, 32, 37, 42, 80)
- Test: `frontend/src/app/features/login/login.a11y.spec.ts` (ampliar; ya define `html` y `scss` arriba)

**Interfaces:** Consumes `brand.institution` (ya usado en la línea 7 de la plantilla). Produces: nada.

**Hallazgos:** H-31 (2.5.3: el nombre del enlace debe contener el texto visible), H-30 (4.1.2: `radiogroup` sin radios), H-29 (nombre accesible de los tres campos del registro; la etiqueta visible es la Task 14).

- [ ] **Step 1: Write the failing test** — añadir al final de `login.a11y.spec.ts`:

```typescript
describe('login: nombres accesibles y roles', () => {
  it('el enlace «Volver al inicio» conserva en su nombre el texto visible', () => {
    expect(html).toContain(`[attr.aria-label]="'Volver al inicio, ' + brand.institution"`);
    expect(html).toContain('<span>{{ brand.institution }}</span>');
    expect(html).not.toContain('aria-label="Volver al inicio"');
  });

  it('el selector de perfil es un grupo de botones, no un radiogroup sin radios', () => {
    expect(html).toContain('<div class="auth-role-picker" role="group" aria-label="Seleccionar rol de acceso">');
    expect(html).not.toContain('radiogroup');
  });

  it('los tres campos del registro tienen nombre accesible propio', () => {
    for (const label of ['Nombre', 'Apellido', 'Correo institucional']) {
      expect(html).toContain(`placeholder="${label}" aria-label="${label}"`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/login/login.a11y.spec.ts`
Expected: FAIL — las 3 pruebas nuevas; las 2 existentes siguen en verde.

- [ ] **Step 3: Write minimal implementation**

```powershell
$html = 'frontend\src\app\features\login\login.component.html'
Edit-Crlf -Path $html -Old 'class="siep-login__back" aria-label="Volver al inicio">' `
  -New "class=`"siep-login__back`" [attr.aria-label]=`"'Volver al inicio, ' + brand.institution`">"
Edit-Crlf -Path $html -Old 'role="radiogroup" aria-label="Seleccionar rol de acceso"' `
  -New 'role="group" aria-label="Seleccionar rol de acceso"'
Edit-Crlf -Path $html -Old 'placeholder="Nombre" formControlName="nombre"' `
  -New 'placeholder="Nombre" aria-label="Nombre" formControlName="nombre"'
Edit-Crlf -Path $html -Old 'placeholder="Apellido" formControlName="apellido"' `
  -New 'placeholder="Apellido" aria-label="Apellido" formControlName="apellido"'
Edit-Crlf -Path $html -Old 'placeholder="Correo institucional" formControlName="email"' `
  -New 'placeholder="Correo institucional" aria-label="Correo institucional" formControlName="email"'
```

Resultado esperado en la plantilla: `<a href="/" routerLink="/" class="siep-login__back" [attr.aria-label]="'Volver al inicio, ' + brand.institution">`.

- [ ] **Step 4: Run test to verify it passes**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/login`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
Convert-ToCrlf frontend\src\app\features\login\login.a11y.spec.ts
git add frontend/src/app/features/login/login.component.html frontend/src/app/features/login/login.a11y.spec.ts
git commit -m "fix(a11y): nombres accesibles y rol del selector de perfil en el login"
```

---

### Task 5: Juego — anillos de foco y texto del diálogo con contraste suficiente — **[LISTA PARA EJECUTAR ESTA NOCHE]**

**Files:**
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts` (líneas 184, 190, 257)
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts` (línea 527, `.safe-exit:focus-visible`)
- Test: `frontend/src/styles/a11y-bloque-h.contract.spec.ts` (ampliar)

**Interfaces:** Consumes `blend` y `contrastRatio` (Task 1). Produces: nada.

**Valores (H-14, H-15).** Fondos de medida: panel de diálogo `rgba(8,12,18,.95)` en el peor caso (sobre un píxel blanco del mapa) = `#14181E`; pie del juego `#0E1322`.

| Elemento | Antes | Después |
|---|---|---|
| Anillo de las opciones (mínimo 3:1) | `rgba(182,156,255,.5)` = **2,89:1** | `#C9B3FF` = 9,65:1 |
| Anillo de «Salida segura» (mínimo 3:1) | `rgba(226,90,79,.6)` sobre #0E1322 = **2,55:1** | `#F1A79F` = 9,49:1 |
| Hablante de advertencia (mínimo 4,5:1) | `#a85062` = **3,38:1** | `#d9798e` = 6,00:1 |
| Etiqueta de emoción «alerta» (mínimo 4,5:1) | `#E25A4F` con `opacity: .75` = **3,29:1** | `opacity: 1` → 4,93:1 |

Los otros tonos de la etiqueta de emoción (`#B69CFF`, `#6EC67A`, `#F5B84B`) dan 7,79, 8,50 y 10,04:1 sobre `#14181E`.

- [ ] **Step 1: Write the failing test** — primero ampliar el import del contrato (`import { contrastRatio } from './contrast.util';` → `import { blend, contrastRatio } from './contrast.util';`):

```powershell
Edit-Crlf -Path frontend\src\styles\a11y-bloque-h.contract.spec.ts `
  -Old "import { contrastRatio } from './contrast.util';" `
  -New "import { blend, contrastRatio } from './contrast.util';"
```

y añadir al final del archivo:

```typescript
describe('bloque H: juego (foco y texto del diálogo)', () => {
  const dialogue = source('../app/features/simulator/dialogue-panel.component.ts');
  const play = source('../app/features/simulator/simulation-play.component.ts');
  const GAME_BG = '#0E1322';
  // Peor caso del panel de diálogo: rgba(8,12,18,.95) sobre un píxel blanco del mapa.
  const DIALOGUE_BG = blend('#080C12', 0.95, '#FFFFFF');

  it('el anillo de las opciones del diálogo llega a 3:1', () => {
    // Antes: rgba(182,156,255,.5) = 2,89:1.
    expect(dialogue).toMatch(/\.choice-btn:focus-visible \{\s*outline: 3px solid #C9B3FF;\s*outline-offset: 3px;\s*\}/);
    expect(contrastRatio('#C9B3FF', DIALOGUE_BG)).toBeGreaterThanOrEqual(3);
  });

  it('el anillo del botón de salida segura llega a 3:1', () => {
    // Antes: rgba(226,90,79,.6) = 2,55:1.
    expect(play).toMatch(/\.safe-exit:focus-visible \{ outline: 2px solid #f1a79f; outline-offset: 2px; \}/);
    expect(contrastRatio('#F1A79F', GAME_BG)).toBeGreaterThanOrEqual(3);
  });

  it('el nombre del hablante de una advertencia llega a 4,5:1', () => {
    // Antes: #a85062 = 3,38:1.
    expect(dialogue).toContain('.strip--warning .speaker-name { color: #d9798e; }');
    expect(contrastRatio('#D9798E', DIALOGUE_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('la etiqueta de emoción no atenúa su color y cada tono llega a 4,5:1', () => {
    // Antes: opacity .75 dejaba el rojo de «alerta» en 3,29:1.
    expect(dialogue).toMatch(/\.emotion-tag \{[^}]*opacity: 1;/);
    for (const tone of ['#B69CFF', '#6EC67A', '#F5B84B', '#E25A4F']) {
      expect(contrastRatio(tone, DIALOGUE_BG)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `frontend/`): `npx jest --runInBand src/styles/a11y-bloque-h.contract.spec.ts`
Expected: FAIL — las 4 pruebas nuevas.

- [ ] **Step 3: Write minimal implementation**

```powershell
$dlg = 'frontend\src\app\features\simulator\dialogue-panel.component.ts'
Edit-Crlf -Path $dlg -Old 'outline: 3px solid rgba(182,156,255,.5);' -New 'outline: 3px solid #C9B3FF;'
Edit-Crlf -Path $dlg -Old '.strip--warning .speaker-name { color: #a85062; }' -New '.strip--warning .speaker-name { color: #d9798e; }'
Edit-Crlf -Path $dlg -Old 'opacity: .75;' -New 'opacity: 1;'
Edit-Crlf -Path frontend\src\app\features\simulator\simulation-play.component.ts `
  -Old '.safe-exit:focus-visible { outline: 2px solid rgba(226,90,79,.6); outline-offset: 2px; }' `
  -New '.safe-exit:focus-visible { outline: 2px solid #f1a79f; outline-offset: 2px; }'
```

(`opacity: .75;` aparece una sola vez en `dialogue-panel.component.ts`, en `.emotion-tag`.)

- [ ] **Step 4: Run test to verify it passes**

Run (desde `frontend/`): `npx jest --runInBand src/styles/a11y-bloque-h.contract.spec.ts src/app/features/simulator/dialogue-panel.component.spec.ts src/app/features/simulator/dialogue-panel.motion.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
Convert-ToCrlf frontend\src\styles\a11y-bloque-h.contract.spec.ts
git add frontend/src/app/features/simulator/dialogue-panel.component.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/styles/a11y-bloque-h.contract.spec.ts
git commit -m "fix(a11y): anillos de foco y texto del diálogo con contraste suficiente en el juego"
```

---

### Task 6: Foco visible en el buscador de Grupos y en el editor DAG — **[LISTA PARA EJECUTAR ESTA NOCHE]**

**Files:**
- Modify: `frontend/src/app/features/grupos/grupo-list.component.ts` (estilos, junto a `.search-box--compact`, línea ~419)
- Modify: `frontend/src/app/features/simulator/dag-editor.component.ts` (líneas 60, 108, 259)
- Test: `frontend/src/styles/a11y-bloque-h.contract.spec.ts` (ampliar)

**Interfaces:** Consumes `blend` y `contrastRatio`. Produces: nada.

**Valores (H-17, H-18):** el anillo de Grupos usa `--psy-focus` = `rgba(0, 72, 118, .72)`: 4,27:1 sobre #F2F2F2 y 4,58:1 sobre blanco. El trazo de foco del DAG es #004876 sobre el fondo #F6F9FB del lienzo = 9,08:1.

- [ ] **Step 1: Write the failing test** — añadir al final de `a11y-bloque-h.contract.spec.ts`:

```typescript
describe('bloque H: foco visible en Grupos y en el editor DAG', () => {
  const grupos = source('../app/features/grupos/grupo-list.component.ts');
  const dag = source('../app/features/simulator/dag-editor.component.ts');

  it('el buscador de Grupos dibuja el anillo en su contenedor cuando el campo tiene el foco', () => {
    // El input conserva `outline: 0`; sin :focus-within no quedaba ningún indicador.
    expect(grupos).toMatch(/\.search-box:focus-within \{\s*outline: 3px solid var\(--psy-focus\);\s*outline-offset: 2px;\s*\}/);
    // --psy-focus = rgba(0, 72, 118, .72)
    for (const surface of ['#F2F2F2', '#FFFFFF']) {
      expect(contrastRatio(blend('#004876', 0.72, surface), surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('los nodos del DAG muestran el foco con el trazo y ya no se apagan', () => {
    expect(dag).not.toContain('.dag-node-group:focus { outline: none; }');
    expect(dag).toContain('.dag-node-group:focus-visible .dag-node-rect { stroke: #004876; stroke-width: 4; }');
    expect(contrastRatio('#004876', '#F6F9FB')).toBeGreaterThanOrEqual(3);
  });

  it('el grafo es un grupo (no una imagen) y sus nodos responden a Espacio además de Enter', () => {
    expect(dag).toContain('role="group" aria-label="Grafo DAG del caso"');
    expect(dag).not.toContain('role="img" aria-label="Grafo DAG del caso"');
    expect(dag).toMatch(/\(keydown\.enter\)="selectNode\(ln\.node\)"\s*\(keydown\.space\)="\$event\.preventDefault\(\); selectNode\(ln\.node\)">/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `frontend/`): `npx jest --runInBand src/styles/a11y-bloque-h.contract.spec.ts`
Expected: FAIL — las 3 pruebas nuevas.

- [ ] **Step 3: Write minimal implementation**

```powershell
Edit-Crlf -Path frontend\src\app\features\grupos\grupo-list.component.ts `
  -Old '.search-box--compact { min-height: 42px; margin: 0 0 10px; }' -New @'
.search-box:focus-within {
      outline: 3px solid var(--psy-focus);
      outline-offset: 2px;
    }
    .search-box--compact { min-height: 42px; margin: 0 0 10px; }
'@

$dag = 'frontend\src\app\features\simulator\dag-editor.component.ts'
Edit-Crlf -Path $dag -Old '.dag-node-group:focus { outline: none; }' `
  -New '.dag-node-group:focus-visible .dag-node-rect { stroke: #004876; stroke-width: 4; }'
Edit-Crlf -Path $dag -Old 'class="dag-svg" role="img" aria-label="Grafo DAG del caso">' `
  -New 'class="dag-svg" role="group" aria-label="Grafo DAG del caso">'
Edit-Crlf -Path $dag -Old '(keydown.enter)="selectNode(ln.node)">' -New @'
(keydown.enter)="selectNode(ln.node)"
                 (keydown.space)="$event.preventDefault(); selectNode(ln.node)">
'@
```

(La primera línea de cada bloque hereda la sangría original; las demás llevan 4 espacios en los estilos de Grupos y 17 en la plantilla del DAG. La regla del trazo gana a `.dag-node--selected .dag-node-rect` por especificidad.)

- [ ] **Step 4: Run test to verify it passes**

Run (desde `frontend/`): `npx jest --runInBand src/styles/a11y-bloque-h.contract.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
Convert-ToCrlf frontend\src\styles\a11y-bloque-h.contract.spec.ts
git add frontend/src/app/features/grupos/grupo-list.component.ts frontend/src/app/features/simulator/dag-editor.component.ts frontend/src/styles/a11y-bloque-h.contract.spec.ts
git commit -m "fix(a11y): foco visible en el buscador de Grupos y en el editor DAG"
```

---

### Task 7: El panel de diálogo respeta el interruptor «Movimiento reducido» — **[LISTA PARA EJECUTAR ESTA NOCHE]**

**Files:**
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.ts` (import línea 3, entrada junto a `mode`, `startTypewriter`)
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts` (las dos etiquetas `<app-dialogue-panel>`, líneas 281 y 322)
- Test: `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts` (ampliar) y `frontend/src/styles/a11y-bloque-h.contract.spec.ts` (ampliar)

**Interfaces:**
- Consumes: la señal `reduceMotion` de `SimulationPlayComponent` (línea 920: `matchMedia` + interruptor del HUD).
- Produces: `DialoguePanelComponent.reduceMotion = input(false)`; con `true`, cada línea aparece completa al instante (sin máquina de escribir), `isTypingComplete()` queda en `true` y el foco entra al primer control, igual que al terminar de escribir.

**Hallazgo H-13:** el panel no recibe `reduceMotion` (confirmado, sin `input`); la máquina de escribir corre siempre a 22 car/s y solo la media query CSS respeta la preferencia del sistema. El plan premium del 2026-07-13 ya fija «con movimiento reducido la línea aparece sin animar caracteres».

- [ ] **Step 1: Write the failing tests**

(a) En `dialogue-panel.component.spec.ts`, dentro de `describe('DialoguePanelComponent - integración renderizada'…)`, insertar tres pruebas ANTES de la que empieza con `it('hereda hablante, emoción y retrato del árbol…` (la primera fija el caso reducido, la segunda es un control del caso normal y la tercera fija que `untracked` evita el reinicio):

```powershell
Edit-Crlf -Path frontend\src\app\features\simulator\dialogue-panel.component.spec.ts `
  -Old "it('hereda hablante, emoción y retrato del árbol cuando la línea trae cadenas vacías', () => {" -New @'
it('con movimiento reducido la línea aparece completa, sin máquina de escribir, y el foco entra al diálogo', () => {
    writeInputSignal(component.reduceMotion, true);
    render(MULTI_LINE_DIALOGUE);

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(component.displayedText()).toBe('Primera');
    expect(component.isTypingComplete()).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);

    component.advanceLine();
    expect(component.displayedText()).toBe('Segunda');
    expect(component.isTypingComplete()).toBe(true);
  });

  it('sin movimiento reducido la línea sigue apareciendo letra a letra', () => {
    render(MULTI_LINE_DIALOGUE);
    expect(component.displayedText()).toBe('');
    expect(component.isTypingComplete()).toBe(false);
  });

  it('cambiar el interruptor con el diálogo abierto no lo reinicia', () => {
    render(MULTI_LINE_DIALOGUE);
    component.skipTypewriter();
    component.advanceLine();
    expect(component.lineIndex()).toBe(1);

    writeInputSignal(component.reduceMotion, true);
    TestBed.flushEffects();

    expect(component.lineIndex()).toBe(1);
    expect(component.activeLine()?.text).toBe('Segunda');
  });

  it('hereda hablante, emoción y retrato del árbol cuando la línea trae cadenas vacías', () => {
'@
```

(b) Añadir al final de `a11y-bloque-h.contract.spec.ts`:

```typescript
describe('bloque H: el diálogo recibe el interruptor de movimiento reducido', () => {
  it('las dos instancias del panel en la partida reciben reduceMotion', () => {
    const tags = source('../app/features/simulator/simulation-play.component.ts').match(/<app-dialogue-panel[^>]*?\/>/g) ?? [];
    expect(tags).toHaveLength(2);
    for (const tag of tags) expect(tag).toContain('[reduceMotion]="reduceMotion()"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/simulator/dialogue-panel.component.spec.ts src/styles/a11y-bloque-h.contract.spec.ts`
Expected: FAIL — la primera y la tercera prueba nuevas del diálogo (`reduceMotion` no existe) y la del cableado; la segunda («sin movimiento reducido…») ya pasa y sirve de control.

- [ ] **Step 3: Write minimal implementation**

```powershell
$dlg = 'frontend\src\app\features\simulator\dialogue-panel.component.ts'
Edit-Crlf -Path $dlg -Old "output, signal } from '@angular/core';" -New "output, signal, untracked } from '@angular/core';"
Edit-Crlf -Path $dlg -Old "readonly mode        = input<'cinematic' | 'side'>('cinematic');" -New @'
readonly mode        = input<'cinematic' | 'side'>('cinematic');
  /** Movimiento reducido del juego (interruptor del HUD o preferencia del sistema): la línea aparece completa, sin máquina de escribir. */
  readonly reduceMotion = input(false);
'@
Edit-Crlf -Path $dlg -Old 'private startTypewriter(text: string) {' -New @'
private startTypewriter(text: string) {
    // `untracked`: el efecto del constructor llama aquí y no debe reiniciar el diálogo cuando cambia el interruptor.
    if (untracked(() => this.reduceMotion())) {
      this.displayedText.set(text);
      this.isTypingComplete.set(true);
      this.requestDialogueFocus();
      return;
    }
'@

$play = 'frontend\src\app\features\simulator\simulation-play.component.ts'
Edit-Crlf -Path $play -Old '<app-dialogue-panel class="dialogue-side" mode="side"' `
  -New '<app-dialogue-panel class="dialogue-side" mode="side" [reduceMotion]="reduceMotion()"'
Edit-Crlf -Path $play -Old '<app-dialogue-panel class="dialogue-cinematic" [dialogue]="dialogue()"' `
  -New '<app-dialogue-panel class="dialogue-cinematic" [reduceMotion]="reduceMotion()" [dialogue]="dialogue()"'
```

Después de la inserción, `startTypewriter` queda así (el resto del método no cambia):

```typescript
  private startTypewriter(text: string) {
    // `untracked`: el efecto del constructor llama aquí y no debe reiniciar el diálogo cuando cambia el interruptor.
    if (untracked(() => this.reduceMotion())) {
      this.displayedText.set(text);
      this.isTypingComplete.set(true);
      this.requestDialogueFocus();
      return;
    }
    this.displayedText.set('');
    this.isTypingComplete.set(false);
    this.requestDialogueFocus();
    let pos = 0;
    // …
```

- [ ] **Step 4: Run tests to verify they pass**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/simulator/dialogue-panel.component.spec.ts src/app/features/simulator/dialogue-panel.motion.spec.ts src/app/features/simulator/simulation-play.consent-gate.spec.ts src/styles/a11y-bloque-h.contract.spec.ts`
Expected: PASS.

Si la primera prueba del diálogo falla porque `displayedText()` está vacío justo después de `render(...)`, el `effect` aún no corrió: añadir un segundo `fixture.detectChanges()` en la prueba; no cambiar la implementación (la prueba de control y la del reinicio no dependen de ese orden).

- [ ] **Step 5: Commit**

```powershell
Convert-ToCrlf frontend\src\styles\a11y-bloque-h.contract.spec.ts
Convert-ToCrlf frontend\src\app\features\simulator\dialogue-panel.component.spec.ts
git add frontend/src/app/features/simulator/dialogue-panel.component.ts frontend/src/app/features/simulator/dialogue-panel.component.spec.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/styles/a11y-bloque-h.contract.spec.ts
git commit -m "fix(a11y): el diálogo respeta el interruptor de movimiento reducido"
```

---

### Task 8: Semántica menor de la portada y del HUD — **[LISTA PARA EJECUTAR ESTA NOCHE]**

**Files:**
- Modify: `frontend/src/app/features/public/landing.component.html` (líneas 16, 22, 98-99)
- Modify: `frontend/src/app/features/simulator/simulation-hud.component.ts` (líneas 49, 80, 100)
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts` (línea 196)
- Create: `frontend/src/app/features/public/landing.a11y.spec.ts`
- Test: `frontend/src/styles/a11y-bloque-h.contract.spec.ts` (ampliar)

**Interfaces:** Consumes la señal `menuOpen` del componente de la portada. Produces: nada.

**Hallazgos:** H-32 (menú móvil sin `aria-expanded`/`aria-controls`, con etiqueta fija «Abrir menú»), H-33 (tres botones `disabled` de maqueta se leen como «no disponible»), H-11 (`aria-label` en `div` sin rol: el nombre no se expone de forma fiable).

- [ ] **Step 1: Write the failing tests**

(a) Crear `landing.a11y.spec.ts`:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(__dirname, 'landing.component.html'), 'utf-8');

describe('portada: semántica del menú móvil y de la maqueta', () => {
  it('el botón del menú anuncia si está abierto y controla la navegación', () => {
    expect(html).toMatch(/class="landing-nav__toggle"\s*type="button"\s*aria-label="Menú de navegación"\s*aria-controls="landing-nav-links"\s*\[attr\.aria-expanded\]="menuOpen\(\)"/);
    expect(html).toContain('<nav id="landing-nav-links" class="landing-nav__links"');
    expect(html).not.toContain('aria-label="Abrir menú"');
  });

  it('la maqueta de decisiones es decorativa: sus botones deshabilitados no se leen', () => {
    expect(html).toContain('<p class="landing-preview-pixel__decisions-label" aria-hidden="true">Decisiones disponibles</p>');
    expect(html).toContain('<div class="landing-preview-pixel__decisions" aria-hidden="true">');
  });
});
```

(b) Añadir al final de `a11y-bloque-h.contract.spec.ts`:

```typescript
describe('bloque H: semántica del HUD y de la tarjeta de contexto', () => {
  const hud = source('../app/features/simulator/simulation-hud.component.ts');
  const play = source('../app/features/simulator/simulation-play.component.ts');

  it('ningún aria-label cuelga de un div sin rol', () => {
    expect(hud).toContain('<div class="hud-step">');
    expect(hud).toContain('<div class="hud-patient" role="group" aria-label="Estado de la paciente">');
    expect(hud).toMatch(/<div class="hud-score" role="group" \[attr\.aria-label\]="'Seguimiento formativo: '/);
    expect(play).toContain('<div class="case-intro-card__body" tabindex="0" role="region" aria-label="Contexto narrativo del caso">');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/public/landing.a11y.spec.ts src/styles/a11y-bloque-h.contract.spec.ts`
Expected: FAIL — las 2 pruebas de la portada y la del HUD.

- [ ] **Step 3: Write minimal implementation**

```powershell
$lh = 'frontend\src\app\features\public\landing.component.html'
Edit-Crlf -Path $lh -Old 'aria-label="Abrir menú"' -New @'
aria-label="Menú de navegación"
      aria-controls="landing-nav-links"
      [attr.aria-expanded]="menuOpen()"
'@
Edit-Crlf -Path $lh -Old '<nav class="landing-nav__links" [class.landing-nav__links--open]="menuOpen()">' `
  -New '<nav id="landing-nav-links" class="landing-nav__links" [class.landing-nav__links--open]="menuOpen()">'
Edit-Crlf -Path $lh -Old '<p class="landing-preview-pixel__decisions-label">Decisiones disponibles</p>' `
  -New '<p class="landing-preview-pixel__decisions-label" aria-hidden="true">Decisiones disponibles</p>'
Edit-Crlf -Path $lh -Old '<div class="landing-preview-pixel__decisions">' `
  -New '<div class="landing-preview-pixel__decisions" aria-hidden="true">'

$hud = 'frontend\src\app\features\simulator\simulation-hud.component.ts'
Edit-Crlf -Path $hud -Old '<div class="hud-step" aria-label="{{ progress.stepLabel }}">' -New '<div class="hud-step">'
Edit-Crlf -Path $hud -Old '<div class="hud-patient" aria-label="Estado de la paciente">' `
  -New '<div class="hud-patient" role="group" aria-label="Estado de la paciente">'
Edit-Crlf -Path $hud -Old '<div class="hud-score" [attr.aria-label]=' -New '<div class="hud-score" role="group" [attr.aria-label]='

Edit-Crlf -Path frontend\src\app\features\simulator\simulation-play.component.ts `
  -Old '<div class="case-intro-card__body" tabindex="0" aria-label=' `
  -New '<div class="case-intro-card__body" tabindex="0" role="region" aria-label='
```

(`.hud-step` ya contiene su texto, así que el `aria-label` duplicaba el contenido; los demás pasan a `role="group"`/`region` para que la etiqueta se exponga. El botón del menú no cambia de aspecto: solo se añaden atributos.)

- [ ] **Step 4: Run tests to verify they pass**

Run (desde `frontend/`): `npx jest --runInBand src/app/features/public src/styles/a11y-bloque-h.contract.spec.ts src/app/features/simulator/simulation-hud.settings.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
Convert-ToCrlf frontend\src\app\features\public\landing.a11y.spec.ts
Convert-ToCrlf frontend\src\styles\a11y-bloque-h.contract.spec.ts
git add frontend/src/app/features/public frontend/src/app/features/simulator/simulation-hud.component.ts frontend/src/app/features/simulator/simulation-play.component.ts frontend/src/styles/a11y-bloque-h.contract.spec.ts
git commit -m "fix(a11y): semántica del menú móvil de la portada y del HUD"
```

---

### Task 9: Verificación completa y nota en la hoja de ruta — **[LISTA PARA EJECUTAR ESTA NOCHE]**

**Files:**
- Modify (condicional): `docs/audits/2026-10-02-brechas-plan-maestro-total.md` (fila H)

- [ ] **Step 1: Sin LF sueltos en lo tocado**

```powershell
git diff --name-only $base HEAD -- frontend | ForEach-Object {
  if ([IO.File]::ReadAllText((Resolve-Path $_).Path) -match '(?<!\r)\n') { "LF suelto: $_" }
}
```
Expected: sin salida.

- [ ] **Step 2: Suites completas**

Run (desde la raíz): `npm run test:frontend` y `npm run build:frontend`
Expected: todas las suites en verde (incluidos `contrast.contract.spec.ts` y `login.a11y.spec.ts`) y build sin errores ni advertencias nuevas.

- [ ] **Step 3: Nota en la hoja de ruta**

Solo si `git status --short docs/audits/2026-10-02-brechas-plan-maestro-total.md` no muestra el archivo como modificado por otra sesión, sustituir en la fila **H** las celdas «Qué falta» y «Qué necesita» por:

- Qué falta: `Auditoría hecha ([2026-10-03-bloque-h-accesibilidad-brechas.md](2026-10-03-bloque-h-accesibilidad-brechas.md)): 35 hallazgos; 15 cerrados por las tareas 2 a 8 del plan [2026-10-03-bloque-h-accesibilidad.md](../superpowers/plans/2026-10-03-bloque-h-accesibilidad.md). Quedan la salida segura en diálogos e introducción (REGLA-004), los atajos de una tecla, el mundo sin vista y los anuncios.`
- Qué necesita: `Decisión de producto y de Psicología (preguntas 1 a 10 del informe) y una sesión con NVDA y VoiceOver.`

Si el archivo está modificado por otra sesión, no tocarlo y dejar este texto en el informe de la sesión.

- [ ] **Step 4: Revisión visual (a la mañana, con `npm run up`)**

- Portada: el botón «Ingresar al sistema» se ve violeta uniforme; el menú móvil (ancho < 720 px) anuncia «expandido» al abrirlo.
- Login: el placeholder es gris oscuro legible; con `isDev` y Google activo, «o» y el estado se leen; el panel índigo en modo registro tiene el texto pequeño en blanco.
- Juego: Tab hasta una opción del diálogo y hasta «Salida segura»: anillo lila claro y rosado claro bien visibles. Con «Movimiento reducido» activado (Ajustes), un diálogo muestra la línea completa al instante.
- Grupos: Tab hasta el buscador: aparece el anillo azul en el contenedor.

- [ ] **Step 5: Commit (solo si se tocó la hoja de ruta)**

```powershell
git add docs/audits/2026-10-02-brechas-plan-maestro-total.md
git commit -m "docs(plan-maestro): bloque H auditado y primeras brechas cerradas"
```

---

> Las tareas 10 a 15 **no se ejecutan esta noche**: necesitan una decisión de producto o de Psicología, o una sesión con lector de pantalla. Se dejan con el detalle que se puede dar sin inventar.

### Task 10: Salida segura siempre alcanzable — **[REQUIERE DECISIÓN]**

**Hallazgos:** H-01, H-02, H-03 (REGLA-004, RNF-010). Recorrido completo en la sección 4 del informe.

**Por qué no es automática:** con un diálogo de decisión abierto no existe ningún control pulsable para cerrar ni para pausar (`dialogue-panel.component.ts:101-107`), durante la introducción animada y la «Primera escena» no hay salida alguna (`simulation-play.component.ts:1113-1127`) y el botón del pie queda `inert` o tapado (`:212`, `:289`, `:730`, `:823-833`). Arreglarlo cambia el flujo de un momento clínicamente sensible; la semántica de `PAUSED` (ETH-02) y de ETH-01 no cambia, pero qué se ofrece y cuándo es decisión de Psicología (preguntas 1 y 2 del informe).

**Diseño propuesto (a confirmar):** una acción «Pausa segura» visible dentro de cada superposición, sin tocar `safeExit()` (su prueba de `simulation-play.consent-gate.spec.ts:403-413` sigue valiendo).
- `DialoguePanelComponent.safeExit = output<void>()` y un botón de 44 px en `.strip-body`, visible también con opciones (modos lateral y cinemático).
- `JournalPanelComponent.safeExit = output<void>()` y un botón en `.sheet-footer` (`:95-103`).
- Tarjetas de introducción: botón secundario en `.case-intro-card__actions` (`:171-179`, `:202-207`).
- `SimulationPlayComponent.pauseFromOverlay(): void`: retorna si `busy()`, si el intento no está `IN_PROGRESS` o si `showResumePrompt()`/`showContentWarning()` (ETH-01 intacto); si no, `audioDirector.playSfx('ui_cancel')`, `busy.set(true)` y `withSyncedPosition(() => pauseCurrentAttempt())` (ese flujo ya limpia el diálogo). La bitácora se cierra antes con `journalOpen.set(false)`.
- Esc en la introducción: dentro de la rama `showIntroScene() || showCaseIntro()` de `handleGlobalInteraction`, antes del chequeo de `BUTTON`/`A`, `if (event.key === 'Escape') { event.preventDefault(); this.pauseFromOverlay(); return; }`. Al reanudar, las banderas de introducción siguen activas: la introducción reaparece (pregunta 2).

**Pruebas a escribir primero (rojas):** (1) `pauseFromOverlay()` con un diálogo abierto llama a `sim.safeExit` una vez y tras sincronizar la posición; (2) Esc con `showCaseIntro()` pausa y Esc con `showContentWarning()` NO (la prueba existente `:191-202` se mantiene); (3) renderizado: con opciones el panel muestra un botón «Pausa segura» que emite `safeExit`; (4) la bitácora lo emite y se cierra; (5) e2e a 390×844 táctil: con opciones abiertas, tocar «Pausa segura» deja el intento `PAUSED` (`frontend/e2e/**` es de otra sesión: coordinar); (6) el anillo de foco del botón nuevo cumple 3:1.

### Task 11: Atajos de una sola tecla (2.1.4) — **[REQUIERE DECISIÓN]**

**Hallazgo:** H-07. `J`, `E` y `WASD` actúan sobre `window` sin importar el foco (`simulation-play.component.ts:1148-1159`, `keyboard-focus.util.ts:78-82`, `game-world.component.ts:382-384`).

**Opciones:** (A) atajos solo con el foco en el juego: `.phaser-host` con `tabindex="0"` y manejadores en el host, como el lobby (`game-menu.component.ts:249-252`); exige devolver el foco al host al cerrar overlays. (B) Ajuste «Atajos de una tecla» en el menú de Ajustes (`simulation-hud.component.ts:119-153`), guardado en `localStorage`: apagado, se ignoran `J`, `E` y `WASD` (siguen flechas, Espacio, Enter y los botones visibles). (C) Modificador (Alt+J, Alt+E). Recomendación: B, porque no cambia el foco ni la memoria muscular; decidir el valor por defecto (pregunta 3).

**Pruebas:** `handleGlobalInteraction` con el ajuste apagado ignora `j` y `e` (unitaria); `game-world` con el ajuste apagado no mueve con `WASD` (requiere editar `game-world.component.ts`, hoy fuera de alcance); el ajuste se persiste y se anuncia con `announce()`.

### Task 12: Alternativa no visual del mundo — **[REQUIERE DECISIÓN]**

**Hallazgo:** H-06. El mapa solo se recorre caminando y las interacciones solo existen por proximidad: A11Y-INPUT-01 (`2026-07-12-a11y-input-siep.md`) quitó la lista remota porque el backend rechaza acciones a distancia.

**Idea:** un panel «Alrededor» (accesible, visible, no `sr-only` enfocable) con las personas y objetos de la sala actual y un botón «Ir a …» que reutiliza el movimiento guiado (`updateGuide`, rejilla de colisiones) hasta el radio de interacción; al llegar, aparece el botón contextual de siempre. Sin acción remota y sin teletransporte. Preguntas abiertas (4 del informe): qué se lista sin revelar evidencia, y qué significa para la evaluación que se omita la exploración espacial.

**Pruebas (cuando se decida):** util puro `reachableTargets(world, scenarioConfig)`; caminata automática hasta el radio con colisiones; e2e solo con teclado (sin WASD) que llega a una persona y abre su diálogo; sesión manual con NVDA.

### Task 13: Anuncios de estrés, progreso y regiones vivas — **[REQUIERE VERIFICACIÓN MANUAL]**

**Hallazgos:** H-08, H-09, H-10.

- [ ] **Step 1 (manual, primero):** con NVDA + Firefox/Chrome y VoiceOver + Safari, comprobar qué regiones anuncian de verdad: `.room-banner` y `.transition-note` (`simulation-play.component.ts:87,90`), la línea del diálogo (`dialogue-panel.component.ts:60`), la carga (`game-world.component.ts:2370`) y la barra de contexto (`:303`). Anotar cuáles callan y cuáles se repiten (`door-notice` se anuncia dos veces).
- [ ] **Step 2 (tras la decisión 5):** util puro `stressAnnouncement(previous: number, next: number): string | null` con los niveles del HUD (calma < 25, moderada < 50, elevada < 75, crítica ≥ 75; `stressTier` en `simulation-hud.component.ts:465-471`) que devuelva texto solo al cambiar de nivel; spec con los umbrales y con valores no numéricos. Cablear con un `effect` sobre `attempt().stressIndex` que llame a `announce()` (`:1981`).
- [ ] **Step 3:** regiones ya presentes y vaciadas, un solo anuncio por emisión (las notas de `ui-mes-99` ya avisan de que `LiveAnnouncer` pierde el primero si llegan dos en el mismo tick) y `aria-live` limitado a la interacción en la barra de contexto.

### Task 14: Campos del login con borde y etiqueta visible — **[REQUIERE DECISIÓN]**

**Hallazgos:** H-28 (1.4.11) y la parte visible de H-29 (3.3.2). Cambia la identidad visual del login (pregunta 7).

**Propuesta:** `.auth-container input` con `border: 1.5px solid #767676` (4,54:1 sobre blanco; el foco ya cambia el borde al color del rol, `login.component.scss:287-291`) y, en el registro, etiquetas persistentes con el patrón del inicio de sesión (`<label class="auth-field"><span>…</span><input …></label>`, `login.component.html:107-116`).

**Pruebas:** el contrato mide `contrastRatio('#767676', '#FFFFFF') ≥ 3` y comprueba el borde en la regla; `login.a11y.spec.ts` comprueba que los tres campos del registro están dentro de un `<label class="auth-field">`.

### Task 15: Puertas axe, foco no oculto y cierre — **[REQUIERE VERIFICACIÓN MANUAL]**

**Hallazgos:** H-04, H-05, H-19, H-20, H-21.

- [ ] **Step 1 (H-20):** en local, sin tocar CI, añadir `'wcag22aa'` a `WCAG_TAGS` (`frontend/e2e/support/quality-gates.ts:8`) y correr `vertical-quality.e2e.ts` en `desktop-1366` y `mobile-390` para listar fallos (`target-size`). Corregir lo que salga antes de dejar la etiqueta en CI. Añadir estados: portada `/`, registro del login, diálogo con opciones abiertas, aviso de reanudar y pausa. `frontend/e2e/**` es de otra sesión: coordinar.
- [ ] **Step 2 (H-19):** `scroll-margin-top` en los enfocables bajo `.landing-nav` (72 px) y bajo la barra del portal (~104 px); comprobar con Tab y Mayús+Tab con la página desplazada.
- [ ] **Step 3 (H-05):** al aparecer la pantalla de pausa o cierre, mover el foco a su título (`tabindex="-1"`) y añadir `aria-modal="true"` y `aria-describedby` (`attempt-outcome.component.ts:21-23`); lo mismo con `aria-modal` en el aviso de reanudar (`simulation-play.component.ts:96`). Prueba renderizada de foco; el anuncio se confirma con lector.
- [ ] **Step 4 (H-04):** con red limitada (DevTools), pulsar «Salida segura» durante una petición colgada; si no hay salida, separar `busy` de la pausa o poner un plazo.
- [ ] **Step 5 (H-21):** medir `target-size` en el login (checkbox y `.auth-link-btn`) con axe 2.2.
- [ ] **Step 6:** recorrer la lista de la sección 6 del informe con NVDA, VoiceOver y TalkBack, y anotar los resultados en el informe.
