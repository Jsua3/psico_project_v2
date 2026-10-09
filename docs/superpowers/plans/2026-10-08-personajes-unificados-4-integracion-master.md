# Personajes unificados — Plan 4: integración con master

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** Fusionar `feat/personajes-unificados` (planes 1–3: el kit de personajes por código y la escala entera del mundo) con `master` (Angular 22, Vitest 5, Phaser 4, el informe de jugabilidad de la PR #16 y Django 6.1) en una rama de integración nueva, con la suite completa verde y las reglas de producto de los dos lados vivas, sin tocar `master` ni empujar nada.

**Arquitectura:** una rama `integracion/personajes-unificados-master` en un worktree propio de árbol LF, creada desde la punta de la feat; un solo `git merge master` cuyos 26 bloques de conflicto y su modify/delete se resuelven con especificaciones deterministas (scripts que este plan trae completos: se ensayaron en una fusión de prueba y se reprodujeron paso a paso en otro worktree hasta dar el mismo árbol). Después, una tarea por cada choque semántico —retratos del diálogo, retrato lateral, escala del lienzo, atenuado de otras etapas, pista de teclado del lobby— cada una con su prueba escrita antes (RED→GREEN): las pruebas de master que asumían el mundo anterior se reescriben al mundo de la rama sin perder la regla de producto que cuidaban. Cierra una verificación completa (unitarias, kit, arte, build, backend, e2e con GPU), capturas con una PARADA para que el usuario las vea y la revisión final con un revisor de contexto limpio.

**Stack:** Angular 22.2.1 + TypeScript 6.0.3 (`ng test` → Vitest 5.0.3 mediante `@angular/build:unit-test`), Phaser 4.2.1, Node 24, Playwright 1.63, Django 6.1.1 (la rama no toca el backend), git 2.48 (`merge --remerge-diff`).

**Spec:** `docs/superpowers/specs/2026-10-02-personajes-unificados-design.md` (§1.1.2 escala entera, §7.3 retratos, §8.2 tamaños, §8.3 lienzo en píxeles físicos, §8.4 e2e). Del lado de master: `docs/audits/2026-10-04-informe-sesion-jugabilidad.md` y `docs/superpowers/specs/2026-10-03-orientacion-jugabilidad-diseno-final.md` (F§7.2, F§7.11, WAY-03, TOUCH-01). Planes previos: `2026-10-02-personajes-unificados-1-…`, `…-2-integracion…` y `2026-10-08-personajes-unificados-3-escala-del-mundo.md`.

## Datos medidos antes de escribir este plan (fusión de prueba, 2026-10-08)

- **Puntas:** feat `9dfcecb`, master `f39ab96`, base común `51d1409`. `git merge-tree --write-tree` dice: 11 archivos en conflicto —10 de contenido con **26 bloques** (`package.json` 1, `character-editor.component.ts` 1, `attempt-outcome.component.ts` 3, `dialogue-panel.component.ts` 1 y su spec 2, `game-menu.component.ts` 3 y su spec 1, `game-world.component.ts` 11, `portrait-resolver.util.ts` 1 y su spec 2) y 1 modify/delete (`avatar-figure.component.ts`, borrado por la rama y modificado por master)—.
- **Solapes:** master toca 220 archivos, la rama 835, ambos 18. Solo hay 8 solapes sin conflicto y son menores (`ci.yml`, `simulation.model.ts`, `premium-clinical-room.renderer.ts`, `world-editor`, `world-preview`, `simulation-play`). **La rama no toca el backend**; master sí (Django 6.1.1 y 21 archivos): del backend solo se verifica.
- **Tres cosas que ya están rotas en master, antes de integrar nada:** (1) su `ng test` **no compila** (`journal-panel.component.spec.ts:102` usa `jest.fn()` tras la migración a Vitest): la tarea 3 lo arregla de paso; (2) `npm audit --audit-level=high` falla por `source-map-js` (GHSA-68fv-2mgg-jv7q) en el `package-lock.json` de master, que la rama deja idéntico: fuera de alcance; (3) en un árbol CRLF (Windows con `core.autocrlf=true`) 12 pruebas de contrato de master fallan solo localmente: por eso la integración vive en un árbol LF.
- **El único rojo fuera del frontend, y lo causa la rama:** `npm run test:backend` sobre la fusión de prueba da 306 pruebas verdes y 1 roja: `test_visual_inventory_contract.py::test_clinical_emotion_authority_covers_seeded_tree_and_future_consequences_exactly` lee `frontend/src/assets/characters/v1/clinical-emotion-map.v1.json`, que la rama borró con el avatar viejo. Es un guardián útil (toda emoción que el backend puede emitir debe tener cara): la tarea 4 lo apunta al catálogo del kit.
- **Resultado de la fusión de prueba** con las resoluciones de este plan: `ng test` 163 archivos / 1927 pruebas en verde, `test:kit` 65, `kit:check` 0 errores, `test:visual-assets` 39, `test:world-art` 20, `test:scripts` 82, `ng build` ok, backend 307 verdes (con la tarea 4), e2e: 20 del CI + 4 `@full-case` + 9 `@orientation` (1 omitida por diseño) en verde con GPU.

## Global Constraints

- **Nada sale de la máquina sin permiso:** ni `git push`, ni merge a `master`, ni PR, ni borrar ramas ajenas («nunca sin preguntar»). `master` y `feat/personajes-unificados` no se modifican: toda la obra vive en `integracion/personajes-unificados-master`.
- `frontend/e2e/**` no se edita sin un sí explícito del usuario (spec §8.4): si un e2e de master falla por la integración, para y pregunta.
- Commits en español, con alcance `integracion-master`, terminados en `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Nunca `--no-verify`.
- **Árbol LF.** En el worktree de integración todo comando git, también los de solo lectura, va como `git -c core.autocrlf=false …` (los que escriben el árbol —`worktree add`, `merge`, `checkout`, `rm`, `reset`— lo exigen; los demás, para no llenar la salida de avisos de CRLF).
- **Solo Vitest** (`vi.*`): ningún `jest.*` en el código. Bajo el runner de Angular cada spec se empaqueta con lo que importa: `__dirname` de un módulo que no es spec no es el del archivo.
- **Escala entera, lienzo en píxeles físicos** (spec §1.1.2, §8.3): zoom de cámara entero; el lienzo mide el contenedor × `devicePixelRatio` (`pixelScaleConfig`, `fitGameToHost`, `watchHostSize`); ningún `Scale.FIT`. Retratos del kit de 32×32: **96 px (×3)** y **64 px (×2)** con la altura limitada (`max-height: 520px`).
- Angular 22: cada componente declara su `changeDetection` (hoy 31 `Eager` de la migración de master y 4 `OnPush`; la rama solo añade `kit-figure.component.ts`).
- Textos para el usuario en español.

## Review Focus

Modos de fallo de la integración que ninguna prueba heredada vigila. Cada línea tiene su prueba en la tarea dueña del código:

1. **Emoción de diálogo sin normalizar** (`anxious`, `relieved`, `sad`, `negative`, `calm` —que el backend solo normaliza a veces al sembrar— y `worried`, `receptive`, `closed`, de consecuencias futuras): debe salir la cara que master ya daba (preocupada, triste o neutral), no un neutral silencioso; y la Abuela y la Sobreviviente **nunca** sonríen aunque la emoción sea positiva. → tarea 4.
2. **Pantalla baja táctil (844×390):** el retrato lateral no se aplasta ni queda a fracciones —64×64, ×2—, y en escritorio mide 96×96. → tarea 5 (contrato de CSS) y tarea 10 (medido en el navegador).
3. **Abrir o cerrar un panel reencaja el lienzo** a píxeles físicos (T0.3: «tras cerrar un diálogo el canvas quedaba 17 % más pequeño») y el observador se suelta al destruir la escena. → tarea 6.
4. **Persona de otra etapa:** se ve atenuada (WAY-03) sin escalarse ni teñirse; la cercana o seleccionada vuelve a alfa 1; el marcador de reposo de una persona del kit no se vela con el 0,88. → tarea 7.
5. **Lobby con puntero grueso:** sin recordatorio de teclado (TOUCH-01), y con puntero fino el recordatorio es DOM —queda dentro del lienzo escalado, no como texto de Phaser fuera de cámara—. → tarea 8.

Una sexta cosa no es del usuario sino del proceso, y tiene herramienta propia: una resolución de conflictos puede **perder en silencio** una línea que compila (la pantalla de resultado perdió `this.kit.load()`). → la auditoría de la tarea 2 y la prueba de la tarea 3.

## Rulings tomados al escribir el plan

Cada uno está en el código de una tarea y se vuelve a anotar en el ledger al ejecutarla. Quien ejecute puede cambiarlos con otro `Ruling:`.

| # | Decisión | Por qué | Si está mal |
|---|---|---|---|
| R1 | Las **personas del kit de otras etapas se atenúan** (`DIMMED_ALPHA = 0,55`), pero ninguna persona del kit se escala ni se vela con el 0,88 de reposo | El spec §8.2 prohíbe tintes y escalas por preset, no el alfa; el informe de master (WAY-03) pide que lo de otras etapas «se vea pero no llame la atención» | Si el usuario prefiere personas siempre opacas, es una línea de `markerEmphasis` y su prueba |
| R2 | Retrato lateral **64 px (×2)** con `max-height: 520px`, en vez del `clamp(48px, 12vh, 64px)` de master | El retrato es 32×32: solo escalas enteras; con el ancho fijo de 96 px de la rama, el `clamp` lo aplastaría | Una línea de CSS y su prueba |
| R3 | Los **alias de emociones** de master y las de consecuencias futuras viven en el **catálogo del kit** (`character-kit/catalog.json`), no en código: `worried → preocupada`, `receptive` y `closed → neutral` (lo que master daba de hecho); y el guardián del backend se **apunta al catálogo** en vez de borrarse | Es lo que dice el spec §7.3 (el catálogo proyecta emoción → estado); cuesta regenerar `kit.json` y `manifest.json` (2 líneas, los PNG no cambian) | Si el equipo quiere otra cara para `closed`, es una línea del catálogo y un `kit:build` |
| R4 | **Se borran** las pruebas de master que fijan los PNG legados (`*_happy.png`…) y `roster-v1.contract.spec.ts` | Importan módulos que la rama retiró a propósito (avatar viejo); su regla de producto se conserva en pruebas nuevas del kit | — |
| R5 | La pista de teclado del lobby es **DOM** y sale de `lobbyKeyboardHint` | Con zoom entero, un texto de Phaser con `scrollFactor 0` se sale de la vista | — |
| R6 | **No** se trae `chore/gitattributes-eol` en esta integración | Es otra decisión (choca add/add con el `.gitattributes` de la rama); el árbol LF cubre la verificación | Se hace después, aparte |

---

## Estructura de archivos

Qué se crea o se toca y quién es su dueño. Las rutas de `frontend/…` van sin el prefijo cuando el comando se ejecuta desde `frontend/`.

| Archivo | Tarea | Qué pasa |
|---|---|---|
| (fuera del repo) `<scratch>/integ/**` | 1 | Las herramientas y las especificaciones de resolución que este plan trae completas |
| `frontend/package.json` (+ `package-lock.json` sin cambios respecto a master) | 2 | Scripts: `test`/`test:watch` de master (Vitest) y los de kit, arte y láminas de la rama |
| `game-world.component.ts` (11 bloques), `game-menu.component.ts` (3), `attempt-outcome.component.ts` (3), `dialogue-panel.component.ts` (1), `portrait-resolver.util.ts` (1), `character-editor.component.ts` (1) y los specs de los cuatro últimos | 2 | Resolución de conflictos; `avatar-figure.component.ts` se borra |
| `kit-phaser.spec.ts`, `kit-raster.spec.ts`, `pixel-canvas.spec.ts`, `journal-panel.component.spec.ts`, `attempt-outcome.component.spec.ts`, `game-world.interaction.spec.ts`, `portrait-resolver.util.spec.ts`, `kit/testing/kit-testing.ts`, `roster-v1.contract.spec.ts` (se borra) | 3 | Compilan bajo el runner de master |
| `attempt-outcome.component.ts` | 3 | Vuelve a cargar el kit (lo perdió la resolución) |
| `portrait-resolver.util.ts` (+ spec), `character-kit/catalog.json`, `scripts/character-kit/coverage.mjs` (+ test), `src/assets/characters/kit/kit.json` y `manifest.json`, `backend_django/apps/simulation/tests/test_visual_inventory_contract.py` | 4 | Sin sonrisa en el duelo; alias de emociones; el guardián del backend apunta al kit |
| `dialogue-panel.component.ts` (+ spec) | 5 | Retrato lateral 96 px / 64 px |
| `game-world.component.ts`, `game-world.scale.spec.ts`, `pixel-canvas.spec.ts` | 6 | `refreshScale` con `fitGameToHost`; pruebas del observador |
| `world-characters.util.ts` (+ spec), `game-world.component.ts`, `game-world.kit.contract.spec.ts`, `game-world.orientation.contract.spec.ts` | 7 | `markerEmphasis` con `dimmed` |
| `game-menu.component.ts` (+ spec) | 8 | Pista de teclado del lobby |
| `<scratch>/…` y `frontend/.capturas-integ/` (excluida de git) | 10 | Capturas |

---

## Convenciones de los comandos

- `ROOT` es el checkout principal (`D:/Sua_Files/IdeaProjects/psico_project_v3`); `WT` el worktree de integración (`$ROOT/.worktrees/integracion`); `I` la carpeta de herramientas (`<scratch>/integ`, donde `<scratch>` es el directorio temporal de la sesión, **nunca dentro del repo**). Cada llamada del shell empieza definiéndolas: no persisten.
- Los comandos de git se escriben `git -c core.autocrlf=false …`; abrevio con `g` donde la línea es larga: `g() { git -c core.autocrlf=false "$@"; }`.
- Las herramientas de edición (`edits.cjs`, `resolve.cjs`) trabajan con `\n`, respetan el fin de línea del archivo y **fallan** si no encuentran el texto, si lo encuentran dos veces o si el número de bloques de conflicto no coincide: nunca editan «a ciegas». Se ejecutan **desde `frontend/`** y sus rutas son relativas a `frontend/`.
- Los comandos de `ng test` van con `--watch=false`. Para afinar: `--include <ruta del spec>` (se puede repetir). Los colores del reporte se quitan con `sed 's/\x1b\[[0-9;]*m//g'`.
- En Git Bash, todo comando que levante Docker (`test:backend`, `test:e2e`) va con `MSYS_NO_PATHCONV=1`: sin él, `--tmpfs /var/lib/postgresql` se convierte en una ruta de Windows. Docker Desktop encendido para el backend y el e2e.
- Puertos del e2e en esta máquina: `SIEP_TEST_DB_PORT=5562` (otra sesión puede tener el 5544), API 8093, web 4315. Chromium: `E2E_CHROMIUM_PATH="C:/Users/Predator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"`. Con GPU: `E2E_CHROMIUM_ARGS="--ignore-gpu-blocklist --enable-gpu-rasterization --use-angle=d3d11 --enable-zero-copy"`.

---

### Task 1: Rama de integración en un worktree LF y herramientas

**Files:**
- Create (fuera del repo): `$I/install-plan-files.mjs` (a mano) y, con él, todos los archivos `**Archivo …**` de este plan en `$I/tools`, `$I/res`, `$I/edits` y `$I/capturas`.
- Create: worktree `$WT` y rama `integracion/personajes-unificados-master`.

**Interfaces:**
- Consumes: nada.
- Produces: `$WT` en `9dfcecb` (o el commit posterior que solo añade este plan) con árbol LF; `$I/tools/edits.cjs <spec.cjs>` (ediciones literales o por rango), `$I/tools/resolve.cjs <spec.cjs>` (bloques de conflicto de git) y `$I/tools/audit-drops.cjs <base> <rama> <master> <archivos…>` (líneas que un lado añadió y el resultado perdió).

- [ ] **Step 1: Comprueba el punto de partida**

Run (en el worktree de la feat, `.worktrees/personajes-unificados`):
```bash
git status --porcelain | grep -v '^??' ; git rev-parse --short HEAD ; git rev-parse --short master ; git merge-base HEAD master | cut -c1-7
git diff --stat 9dfcecb HEAD -- frontend backend_django scripts .github | tail -1
```
Expected: sin líneas de cambios sin confirmar; `master` = `f39ab96`; merge-base = `51d1409`; y el último comando no imprime nada (si HEAD es posterior a `9dfcecb`, solo ha añadido archivos de `docs/`). Si `master` avanzó, **para y avisa**: el plan se ensayó contra `f39ab96`.

- [ ] **Step 2: Crea el worktree y la rama, con el árbol en LF**

Run:
```bash
ROOT=D:/Sua_Files/IdeaProjects/psico_project_v3
git -C $ROOT -c core.autocrlf=false worktree add $ROOT/.worktrees/integracion -b integracion/personajes-unificados-master feat/personajes-unificados
git -C $ROOT/.worktrees/integracion -c core.autocrlf=false ls-files --eol frontend/src/app/features/simulator/game-world.component.ts
```
Expected: `Preparing worktree (new branch 'integracion/personajes-unificados-master')` y `i/lf    w/lf`. Si dice `w/crlf`, el worktree se creó sin `-c core.autocrlf=false`: bórralo (`git worktree remove`, mira antes qué hay) y repite.

- [ ] **Step 3: Crea el instalador de archivos del plan (lo único que se escribe a mano)**

Crea `$I/install-plan-files.mjs` con este contenido exacto:

```js
// node install-plan-files.mjs <plan.md> <carpeta>
// Instala los archivos que el plan trae completos: cada bloque de código precedido por una línea
// **Archivo `ruta/relativa`** se escribe en <carpeta>/<ruta/relativa>.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [plan, out] = process.argv.slice(2);
const text = readFileSync(plan, 'utf8').replace(/\r\n/g, '\n');
const re = /^\*\*Archivo `([^`]+)`\*\*\n\n(`{3,})[^\n]*\n([\s\S]*?)\n\2$/gm;
let n = 0;
for (const [, rel, , body] of text.matchAll(re)) {
  const file = path.join(out, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${body}\n`);
  n += 1;
  console.log(`instalado ${rel}`);
}
if (n === 0) throw new Error('el plan no trae ningún bloque «**Archivo `…`**»');
console.log(`${n} archivos en ${out}`);
```

- [ ] **Step 4: Instala las herramientas y las especificaciones**

Run (en `$WT`): `node "$I/install-plan-files.mjs" docs/superpowers/plans/2026-10-08-personajes-unificados-4-integracion-master.md "$I"`
Expected: una línea `instalado …` por archivo y al final `23 archivos en <I>` (3 en `tools/`, 3 en `res/`, 15 en `edits/` y 2 en `capturas/`). Comprueba: `ls "$I/tools" "$I/res" "$I/edits" "$I/capturas"`.

- [ ] **Step 5: Anota el arranque en el ledger**

Crea el ledger de esta ejecución (`# SDD ledger — plan: docs/superpowers/plans/2026-10-08-personajes-unificados-4-integracion-master.md`) con una línea `Task 1: complete` y los SHA de partida (feat, master, base). No hay commit: no se tocó el repo.


Las tres herramientas, completas:

**Archivo `tools/resolve.cjs`**

```js
// node resolve.cjs <spec.cjs>
// Resuelve los bloques de conflicto de git (<<<<<<< … ======= … >>>>>>>) de uno o más archivos.
//   module.exports = [{ file, hunks: [ 'ours' | 'theirs' | 'both' | '<texto>', … ] }]
// Un elemento de `hunks` por cada bloque, en el orden en que aparecen. `ours` es el lado de HEAD (la rama),
// `theirs` el de master. El texto se escribe con \n y se respeta el CRLF del archivo. Falla si el número de
// bloques no coincide con el de elementos, para no resolver a ciegas un conflicto que cambió.
const fs = require('fs');
const path = require('path');

const specs = require(path.resolve(process.argv[2]));
const BLOCK = /^<<<<<<< [^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> [^\n]*\n/gm;

for (const { file, hunks } of specs) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  const text = raw.replace(/\r\n/g, '\n');
  const found = [...text.matchAll(BLOCK)];
  if (found.length !== hunks.length) {
    throw new Error(`${file}: tiene ${found.length} bloques de conflicto y la resolución trae ${hunks.length}`);
  }
  let index = 0;
  const resolved = text.replace(BLOCK, (_all, ours, theirs) => {
    const choice = hunks[index++];
    if (choice === 'ours') return ours;
    if (choice === 'theirs') return theirs;
    if (choice === 'both') return ours + theirs;
    return choice.endsWith('\n') ? choice : `${choice}\n`;
  });
  if (/^(<<<<<<<|=======|>>>>>>>)/m.test(resolved)) throw new Error(`${file}: quedan marcas de conflicto`);
  fs.writeFileSync(file, crlf ? resolved.replace(/\n/g, '\r\n') : resolved);
  console.log(`resuelto ${file} (${found.length} bloque${found.length === 1 ? '' : 's'})`);
}
```

**Archivo `tools/edits.cjs`**

```js
// node edits.cjs <edits.cjs|json>
//   { file, find, replace, all? }            reemplazo literal (único salvo all)
//   { file, start, end, replace }            reemplaza desde `start` hasta el final de `end` (ambos incluidos, únicos)
// Trabaja con \n y respeta el CRLF del archivo.
const fs = require('fs');
const path = require('path');
const spec = process.argv[2];
const edits = spec.endsWith('.cjs') ? require(path.resolve(spec)) : JSON.parse(fs.readFileSync(spec, 'utf8'));
const once = (text, needle, file) => {
  const i = text.indexOf(needle);
  if (i < 0) throw new Error(`${file}: no encuentro\n${needle}`);
  if (text.indexOf(needle, i + 1) >= 0) throw new Error(`${file}: aparece más de una vez\n${needle}`);
  return i;
};
for (const e of edits) {
  const raw = fs.readFileSync(e.file, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  if (e.start !== undefined) {
    const a = once(text, e.start, e.file);
    const b = text.indexOf(e.end, a);
    if (b < 0) throw new Error(`${e.file}: no encuentro el final\n${e.end}`);
    text = text.slice(0, a) + e.replace + text.slice(b + e.end.length);
  } else if (e.all) {
    if (!text.includes(e.find)) throw new Error(`${e.file}: no encuentro\n${e.find}`);
    text = text.split(e.find).join(e.replace);
  } else {
    const i = once(text, e.find, e.file);
    text = text.slice(0, i) + e.replace + text.slice(i + e.find.length);
  }
  fs.writeFileSync(e.file, crlf ? text.replace(/\n/g, '\r\n') : text);
  console.log('editado', e.file);
}
```

**Archivo `tools/audit-drops.cjs`**

```js
// node audit-drops.cjs <BASE> <RAMA> <MASTER> <archivo...>      (se ejecuta en la raíz del repo / worktree)
// Auditoría de una fusión: lista las líneas que cada lado AÑADIÓ respecto a la base y que el resultado ya no tiene.
// Una resolución a mano puede perder en silencio algo que compila (p. ej. una línea de un constructor). Lo esperado
// (código viejo que el otro lado reemplazó) se reconoce a ojo; lo inesperado es un hallazgo.
const { execFileSync } = require('child_process');
const fs = require('fs');

const [base, branch, master, ...files] = process.argv.slice(2);
const git = args => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
const norm = line => line.replace(/\r$/, '').trim();
const trivial = line => line.length < 4 || /^[{}()[\];,]*$/.test(line) || /^\/\/|^\*|^\/\*/.test(line);

function added(from, to, file) {
  const diff = git(['diff', '-U0', `${from}`, `${to}`, '--', file]);
  return diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => norm(l.slice(1))).filter(l => !trivial(l));
}

let total = 0;
for (const file of files) {
  const merged = new Set(fs.readFileSync(file, 'utf8').split('\n').map(norm));
  for (const [side, ref] of [['rama', branch], ['master', master]]) {
    const lost = [...new Set(added(base, ref, file))].filter(l => !merged.has(l));
    if (lost.length) {
      console.log(`\n=== ${file} — líneas que añadió ${side} y no están en el resultado (${lost.length})`);
      for (const l of lost) console.log(`  ${l.slice(0, 170)}`);
      total += lost.length;
    }
  }
}
console.log(`\nauditoría: ${total} líneas añadidas por un lado y ausentes del resultado, en ${files.length} archivos`);
```

---

### Task 2: Fusionar master y resolver los conflictos (un solo commit de fusión)

**Files:**
- Modify: los 10 archivos con bloques de conflicto de la tabla de «Estructura de archivos»; Delete: `frontend/src/app/features/character/avatar-figure.component.ts`.
- Create (fuera del repo): `$I/res/res-1-simples.cjs`, `$I/res/res-2-medianos.cjs`, `$I/res/res-3-game-world.cjs` y `$I/edits/t2-seguimiento.cjs` (se instalaron en la tarea 1; su texto completo está abajo).

**Interfaces:**
- Consumes: `$I/tools/resolve.cjs`, `$I/tools/edits.cjs`, `$I/tools/audit-drops.cjs` (tarea 1).
- Produces: un commit de fusión con dos padres (`feat` y `master`) cuyo `ng build` es verde. **A propósito** quedan para las tareas 3–8: el atenuado de master (el énfasis queda como el de la rama), la pantalla de resultado sin `kit.load()`, `refreshScale` con el código de `Scale.FIT`, la pista de teclado del lobby estática y los specs sin portar.

**Las decisiones de cada bloque** (la razón de cada línea de los scripts de abajo):

| Archivo (bloques) | Se queda con | Por qué |
|---|---|---|
| `package.json` (1) | `"test": "ng test"` y `"test:watch": "ng test --watch"` de master + todos los scripts de la rama (`test:kit`, `test:world-art`, `test:visual-assets`, `kit:*`, `world-art:*`) | Runner nuevo de master; `test:character-assets` se va porque la rama borró su script |
| `portrait-resolver.util.ts` (1) y su spec (2) | El resolver del kit de la rama; `isSystemVoice`/`SYSTEM_VOICES` de master quedan (están fuera del conflicto) | El kit sustituye a los PNG legados (spec §7.3) |
| `character-editor.component.ts` (1) | El editor reescrito de la rama + el `ChangeDetectionStrategy` de la migración | — |
| `dialogue-panel.component.ts` (1) | El CSS del retrato de la rama (`width: 96px; height: 96px`, ×3) | El `clamp()` de master daría fracciones (la tarea 5 deja también el compacto exacto) |
| `dialogue-panel.component.spec.ts` (2) | Las importaciones de ambos lados (`KitService`, `fakeKitService`, `contrast.util`) y los proveedores con el `KitService` de pruebas | — |
| `attempt-outcome.component.ts` (3) | Importaciones de master (`A11yModule`, foco de la pausa…) + `KitFigureComponent`; campos del kit | La figura del avatar viejo ya no existe |
| `game-menu.component.ts` (3) y spec (1) | La pista DOM de la rama y las importaciones de ambos | Tarea 8 la conecta con `lobbyKeyboardHint` |
| `game-world.component.ts` (11) | Ver el script `res-3`: kit y zoom entero de la rama; toques de tecla, rótulos como objetos de escena (`createNpcLabels`), aviso de puerta con candado y `onScaleResize` de master; el énfasis del marcador **de la rama** (el atenuado vuelve en la tarea 7) | Cada bloque lleva su comentario |

- [ ] **Step 1: Empieza la fusión sin confirmarla**

Run (en `$WT`): `git -c core.autocrlf=false merge --no-commit --no-ff master 2>&1 | grep -E "CONFLICT|Automatic merge failed"`
Expected: 10 líneas `CONFLICT (content)` más `CONFLICT (modify/delete): …avatar-figure.component.ts deleted in HEAD and modified in master` y `Automatic merge failed`. Los archivos son los de la tabla de arriba; `git diff --name-only --diff-filter=U` debe listar los 11. Si aparece otro archivo, **para**: master cambió desde `f39ab96`.

- [ ] **Step 2: Resuelve los 26 bloques**

Run (en `$WT/frontend`):
```bash
for r in res-1-simples res-2-medianos res-3-game-world; do node "$I/tools/resolve.cjs" "$I/res/$r.cjs" || break; done
git -c core.autocrlf=false rm -q src/app/features/character/avatar-figure.component.ts
```
Expected, en este orden: `resuelto package.json (1 bloque)`, `…portrait-resolver.util.ts (1 bloque)`, `…portrait-resolver.util.spec.ts (2 bloques)`, `…character-editor.component.ts (1 bloque)`, `…dialogue-panel.component.ts (1 bloque)`, `…dialogue-panel.component.spec.ts (2 bloques)`, `…attempt-outcome.component.ts (3 bloques)`, `…game-menu.component.ts (3 bloques)`, `…game-menu.component.spec.ts (1 bloque)`, `…game-world.component.ts (11 bloques)`. Si algún archivo dice «tiene N bloques de conflicto y la resolución trae M», el conflicto cambió: no fuerces, para.

- [ ] **Step 3: Comprueba que no quedan marcas y instala las dependencias**

Run (en `$WT`): `grep -rln -E "^(<<<<<<<|=======|>>>>>>>)" frontend/src frontend/package.json; echo "marcas: $?"` → Expected: ningún archivo y `marcas: 1`.
Run: `npm ci --prefix frontend` → Expected: exit 0 (`added 315 packages`; el aviso «1 high severity vulnerability» es el de `source-map-js` de master, ver «Datos medidos»; no es de esta integración).

- [ ] **Step 4: Audita lo que la resolución dejó atrás**

Una resolución a mano puede perder en silencio algo que compila. Esta herramienta lista las líneas que cada lado **añadió** respecto a la base y que el resultado ya no tiene.

Run (en `$WT`):
```bash
node "$I/tools/audit-drops.cjs" 51d1409 9dfcecb master \
  frontend/package.json frontend/src/app/features/character/character-editor.component.ts \
  frontend/src/app/features/simulator/attempt-outcome.component.ts frontend/src/app/features/simulator/dialogue-panel.component.ts \
  frontend/src/app/features/simulator/game-menu.component.ts frontend/src/app/features/simulator/portrait-resolver.util.ts \
  frontend/src/app/features/simulator/game-world.component.ts frontend/src/app/features/simulator/dialogue-panel.component.spec.ts \
  frontend/src/app/features/simulator/game-menu.component.spec.ts frontend/src/app/features/simulator/portrait-resolver.util.spec.ts
```
Expected: `auditoría: 48 líneas añadidas por un lado y ausentes del resultado, en 10 archivos`, y **solo** estas pérdidas, todas esperadas (código viejo que el otro lado reemplazó):

| Archivo | Lado | Qué se pierde (esperado) | Quién lo repone |
|---|---|---|---|
| `attempt-outcome.component.ts` | rama | los `import`/`imports:` viejos (sustituidos por la unión) | — |
| | rama | **`this.kit.load().catch(() => undefined);` — NO esperado: es un hallazgo real** | tarea 3 |
| | master | `AvatarFigureComponent` y el `import` viejo | — |
| `dialogue-panel.component.ts` | master | el `clamp(96px, 18vh, 150px)` del retrato lateral | tareas 3–5 (96 px / 64 px) |
| `game-menu.component.ts` | master | el texto de Phaser de la pista de teclado | tarea 8 |
| `portrait-resolver.util.ts` | master | `USABLE_VARIANTS` y los alias `anxious`, `negative`, `sad`, `relieved`, `calm` | tarea 4 |
| `game-world.component.ts` | rama | el nombre/pista como hijos del contenedor y el aviso de puerta sin candado | — (los reemplazó `createNpcLabels` y el candado de master) |
| | master | `headY - 4` y `-28` (desplazamientos del nombre), `object.y - 90` (altura del aviso), `new ResizeObserver(() => this.refreshScale())` | — (reemplazados por `KIT_LABEL_OFFSET_Y`, `doorHintY` y `watchHostSize`) |
| | master | `m.setAlpha(sel \|\| near ? 1 : this.dimmedKeys.has(key) ? DIMMED_ALPHA : .88)` | tarea 7 |
| `*.spec.ts` | rama/master | `jest.fn()` y los tests de los PNG legados | tareas 3 y 4 |

Anota en el ledger cada pérdida de esa tabla como esperada; cualquier otra es un `Ruling:` o un arreglo.

- [ ] **Step 5: Quita el código muerto que deja la resolución**

`labelStyle` lo usaba el nombre del NPC de la rama; ahora el nombre y la pista salen de `createNpcLabels` (master) y nadie lo lee.

Run (en `$WT/frontend`): `node "$I/tools/edits.cjs" "$I/edits/t2-seguimiento.cjs"` → Expected: `editado src/app/features/simulator/game-world.component.ts`.

- [ ] **Step 6: Compila**

Run (en `$WT/frontend`): `npx ng build > /tmp/build-t2.txt 2>&1; echo "exit=$?"` → Expected: `exit=0`. (`ng test` aún no compila: las pruebas son la tarea 3.)

- [ ] **Step 7: Confirma la fusión**

Run (en `$WT`):
```bash
g() { git -c core.autocrlf=false "$@"; }
g add -u && g status --short | grep -vE '^(A|M|D|R) ' ; g commit -q -F - <<'EOF'
merge(integracion-master): integra master en personajes unificados

Fusión de master (f39ab96: Angular 22, Vitest, Phaser 4, jugabilidad PR #16,
Django 6.1) en feat/personajes-unificados (9dfcecb). 26 bloques de conflicto en
10 archivos y el modify/delete de avatar-figure.component.ts, resueltos con las
especificaciones del plan 4; `ng build` verde.

Quedan para las tareas siguientes, cada una con su prueba escrita antes: portar
los specs a Vitest, retratos del diálogo, retrato lateral en pantallas bajas,
escala del lienzo, atenuado de otras etapas y pista de teclado del lobby. Aquí
se pierde a propósito el atenuado de master (el énfasis queda como el de la rama)
y la pantalla de resultado no carga el kit (la tarea 3 lo restituye con prueba).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
g log -1 --format='%h %s' ; g log -1 --format=%P | wc -w
```
Expected: el `grep` no imprime nada (nada sin resolver ni sin seguimiento), el commit sale como `merge(integracion-master): …` y `2` padres. **Revisión barata de la resolución:** `g show --remerge-diff --stat HEAD` debe mostrar solo los 11 archivos (21 inserciones, 513 borrados).

**Archivo `res/res-1-simples.cjs`**

```js
// Conflictos pequeños de la fusión con master (rutas relativas a frontend/).
module.exports = [
  {
    // Scripts: el runner nuevo de master (ng test) y todo lo de la rama; `test:character-assets` se va
    // porque su script (character-manifest-lib.test.mjs) lo borró el plan 2.
    file: 'package.json',
    hunks: [[
      '    "test": "ng test",',
      '    "test:watch": "ng test --watch",',
      '    "test:visual-assets": "node --test scripts/visual-asset-manifest-lib.test.mjs",',
      '    "test:kit": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \\"scripts/character-kit/*.test.mjs\\"",',
      '    "test:world-art": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \\"scripts/world-art/*.test.mjs\\"",',
      '    "world-art:build": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/world-art/build.mjs",',
      '    "world-art:laminas": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/world-art/laminas.mjs",',
      '    "kit:types": "tsc -p tsconfig.kit.json",',
      '    "kit:build": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/character-kit/build.mjs",',
      '    "kit:check": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/character-kit/check.mjs && tsc -p tsconfig.kit.json",',
      '    "kit:laminas": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/character-kit/laminas.mjs",',
      '    "kit:retoque": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/character-kit/retoque.mjs"',
    ].join('\n')],
  },
  // El resolver de retratos del kit (rama); `isSystemVoice` de master está fuera del conflicto y se queda.
  { file: 'src/app/features/simulator/portrait-resolver.util.ts', hunks: ['ours'] },
  {
    file: 'src/app/features/simulator/portrait-resolver.util.spec.ts',
    hunks: [
      [
        "import { testKitBundle } from '../character/kit/testing/kit-testing';",
        "import { isSystemVoice, resolvePortraitAsset } from './portrait-resolver.util';",
        '',
        'const bundle = testKitBundle();',
        'const png = (path: string) => `/assets/characters/kit/${path}.png`;',
      ].join('\n'),
      'ours',
    ],
  },
  {
    // Nuestro editor reescrito + el `ChangeDetectionStrategy.Eager` que la migración de Angular 22 de master
    // le pone a los componentes que no lo declaraban.
    file: 'src/app/features/character/character-editor.component.ts',
    hunks: ["import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';"],
  },
];
```

**Archivo `res/res-2-medianos.cjs`**

```js
// Conflictos medianos de la fusión con master (rutas relativas a frontend/).
module.exports = [
  {
    // El retrato del kit mide 96×96 (×3): sirve el mismo propósito que el `clamp` de master (TOUCH-01) sin
    // escalarlo a una fracción.
    file: 'src/app/features/simulator/dialogue-panel.component.ts',
    hunks: ['ours'],
  },
  {
    file: 'src/app/features/simulator/dialogue-panel.component.spec.ts',
    hunks: [
      [
        "import { KitService } from '../character/kit/kit.service';",
        "import { fakeKitService } from '../character/kit/testing/kit-testing';",
        "import { blend, contrastRatio } from '../../../styles/contrast.util';",
      ].join('\n'),
      [
        '      providers: [',
        '        { provide: AudioDirectorService, useValue: { playSfx: vi.fn() } },',
        '        { provide: KitService, useValue: fakeKitService() },',
        '      ],',
      ].join('\n'),
    ],
  },
  {
    file: 'src/app/features/simulator/attempt-outcome.component.ts',
    hunks: [
      [
        "import { A11yModule } from '@angular/cdk/a11y';",
        "import { NgTemplateOutlet } from '@angular/common';",
        "import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, ChangeDetectionStrategy } from '@angular/core';",
      ].join('\n'),
      '  imports: [A11yModule, NgTemplateOutlet, RouterLink, KitFigureComponent],',
      [
        '  private readonly kit = inject(KitService);',
        '  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);',
        '  private readonly injector = inject(Injector);',
        '  /** Retrato neutral del jugador (spec §8.2: ×3, 96 px). */',
        '  readonly playerVisual = computed(() => {',
        '    const bundle = this.kit.bundle();',
        "    return bundle ? resolveCharacter(bundle, { kind: 'jugador', avatar: toAvatarV2(this.avatarStore.avatar()) }) : null;",
        '  });',
      ].join('\n'),
    ],
  },
  {
    file: 'src/app/features/simulator/game-menu.component.ts',
    hunks: [
      [
        "import { cameraBounds, integerZoom } from './pixel-scale.util';",
        "import { pixelScaleConfig, watchHostSize } from './pixel-canvas';",
        "import { GameHelpComponent } from './game-help.component';",
        "import { HelpModality } from './game-help.content';",
        "import { SAFE_EXIT_ALWAYS_REACHABLE } from './orientation.config';",
        "import { COARSE_POINTER_QUERY, matchesMedia } from './pointer-modality.util';",
      ].join('\n'),
      // La pista de teclado de master era un texto de Phaser con scrollFactor 0: con el zoom entero se saldría
      // de la vista (plan 2). Aquí la pista es DOM; se conserva `lobbyKeyboardHint` de master (ver edits).
      'ours',
      [
        '  private detachHostWatch?: () => void;',
        '  private booting = false;',
        '  private destroyed = false;',
        '  // number explícito (no ReturnType<typeof window.setTimeout>): con @types/node en el',
        '  // programa de tipos de los specs, ese ReturnType resuelve a NodeJS.Timeout aunque la',
        '  // llamada real a window.setTimeout en el navegador siga devolviendo number.',
        '  private enterTimer?: number;',
      ].join('\n'),
    ],
  },
  {
    file: 'src/app/features/simulator/game-menu.component.spec.ts',
    hunks: [
      [
        "import { KitService } from '../character/kit/kit.service';",
        "import { fakeKitService } from '../character/kit/testing/kit-testing';",
        "import { GameHelpComponent } from './game-help.component';",
        "import { GameMenuComponent, lobbyKeyboardHint } from './game-menu.component';",
        "import { ORIENTATION_COPY, SAFE_EXIT_ALWAYS_REACHABLE } from './orientation.config';",
        "import type { Mock } from 'vitest';",
      ].join('\n'),
    ],
  },
];
```

**Archivo `res/res-3-game-world.cjs`**

```js
// Los 11 conflictos de game-world.component.ts en la fusión con master (rutas relativas a frontend/).
module.exports = [
  {
    file: 'src/app/features/simulator/game-world.component.ts',
    hunks: [
      // 1. imports de @angular/core: la unión de los dos lados.
      "import { Component, ElementRef, NgZone, OnChanges, OnDestroy, SimpleChanges, ViewChild, computed, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';",
      // 2. create(): el kit y el zoom entero de la rama; los toques de tecla y los rótulos de master. Sin la
      //    composición del avatar legado (cast, v1, modular), que la rama borró.
      [
        '    this.playerKitReady = this.playerVisual !== null && ensureCharacterAnims(this, this.playerVisual);',
        '    for (const kind of PATIENT_ICON_KINDS) addRgbaTexture(this, patientIconKey(kind), patientIconImage(kind));',
        '    // Un toque corto (keydown y keyup en el mismo cuadro, habitual con pocos fps) deja `JustDown` en falso',
        '    // y la pulsación se perdía junto a una persona (T0.2): el evento `down` de la tecla sí llega siempre.',
        "    this.keys['E']?.on('down', () => { this.tappedKeys.e = true; });",
        "    this.keys['SPACE']?.on('down', () => { this.tappedKeys.space = true; });",
        "    this.keys['ENTER']?.on('down', () => { this.tappedKeys.enter = true; });",
        '    // Al cambiar el tamaño o el dpr del lienzo: nuevo zoom entero y rótulos de ≥ 12 px de pantalla.',
        "    this.scale.on('resize', () => this.refitCamera());",
        "    this.scale.on('resize', this.onScaleResize, this);",
        '    this.onScaleResize();',
      ].join('\n'),
      // 3 y 4. el reinicio de la sala: las dos cosas.
      '    this.toneVignette = undefined;\n    this.resetOrientationVisuals();',
      '    this.toneVignette = undefined;\n    this.resetOrientationVisuals();',
      // 5. NPC: el cuerpo del kit de la rama, con el nombre y la pista de master (objetos de la escena sobre
      //    todos los actores, no hijos del contenedor).
      [
        '      const visual = this.actorVisual(npcCharacterRef(npc));',
        '      // Sombra de contacto en dos pasos: asienta al NPC en el piso.',
        '      const shadowSoft = this.add.ellipse(0, 0, 30, 9, 0x000000, .15);',
        '      const shadow = this.add.ellipse(0, 0, 20, 6, 0x000000, .27);',
        '      const figure: Phaser.GameObjects.GameObject = visual',
        "        ? this.add.sprite(0, 0, kitSheetKey(visual, 'idle'), kitFrameIndex('idle', npc.facing ?? 'down')).setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)",
        '        : this.add.circle(0, -20, 10, 0x4fa3a5, 1);',
        '      // Nombre y pista: objetos de la escena sobre los actores (no hijos del contenedor); nacen ocultos.',
        '      const { label, hint } = this.createNpcLabels(npc, pos, KIT_LABEL_OFFSET_Y);',
        '      const parts: Phaser.GameObjects.GameObject[] = [shadowSoft, shadow, figure];',
        '      const icon = visual?.recipeId === PATIENT_RECIPE_ID ? this.patientIcon(0) : null;',
        '      if (icon) parts.push(icon);',
        '      const container = this.add.container(pos.x, pos.y, parts);',
        '      this.setFeetOffset(container, 0);   // pies = origen del contenedor',
      ].join('\n'),
      // 6. campos del NPC: los del kit y la distancia del rótulo.
      [
        "      bag['__labelOffsetY'] = KIT_LABEL_OFFSET_Y;",
        "      bag['__patientIcon'] = icon;",
        '      if (visual && figure instanceof Phaser.GameObjects.Sprite) {',
        "        bag['__npcSprite'] = figure;",
        "        bag['__npcVisual'] = visual;",
        '      }',
        "      this.applyNpcFacing(container, npc.facing ?? 'down');",
        '      this.registerNpcMover(npc, pos);',
      ].join('\n'),
      // 7. marcador: los campos del kit y del pixel art de la rama; el rótulo opcional de master.
      [
        '    const bag = marker as unknown as Record<string, unknown>;',
        "    bag['__kitSprite'] = personVisual !== null;",
        "    bag['__pixelSprite'] = pixelSprite;",
        "    bag['__pulse'] = pulse;",
        '    if (personVisual?.recipeId === PATIENT_RECIPE_ID) {',
        '      const icon = this.patientIcon(16);',
        '      if (icon) {',
        '        marker.add(icon);',
        "        bag['__patientIcon'] = icon;",
        '      }',
        '    }',
        '    if (label) this.markerLabels.set(object.key, label);',
      ].join('\n'),
      // 8. aviso de la puerta: el de master (ancho al texto, candado, escala de rótulos) a la altura que da
      //    el arte de la puerta (F8), no el «-90» del arte viejo.
      [
        '      // Ancho a la medida del texto + relleno + hueco del candado (a la izquierda, solo si está bloqueada).',
        '      const hintWidth = Math.ceil(hintTx.width) + 38;',
        '      const hintBg = this.add.rectangle(0, 0, hintWidth, 22, 0x0e141a, .88).setStrokeStyle(1, 0x4fa3a5, .5);',
        '      const lock = this.buildDoorLock(hintWidth, hintTx.width);',
        '      // Sobre el borde alto de la puerta: su alto sale del arte, ya no hay una escala que adivinar.',
        '      const hintY = doorHintY(object.y, doorSprite?.displayHeight ?? DOOR_FALLBACK_HEIGHT);',
        '      const hint = this.add.container(object.x, hintY, [hintBg, lock, hintTx])',
        '        .setDepth(DEPTH.UI).setVisible(false).setScale(this.labelScale);',
        '      const bag = hint as unknown as Record<string, unknown>;',
        "      bag['__doorBg'] = hintBg;",
        "      bag['__doorLock'] = lock;",
        "      bag['__doorX'] = object.x;",
        "      bag['__doorHalfWidth'] = hintWidth / 2;",
        '      this.placeDoorHint(hint);',
      ].join('\n'),
      // 9. énfasis del marcador: aquí queda el de la rama (`markerEmphasis` sin atenuado); el atenuado de las otras
      //    etapas de master (`DIMMED_ALPHA`, T9.9) vuelve en la tarea 7, con su prueba escrita antes.
      'ours',
      // 10. CSS del lienzo: el de la rama (píxeles físicos) y el comentario de los controles táctiles de master.
      [
        '    /* El lienzo mide el contenedor × devicePixelRatio y Phaser lo devuelve al tamaño',
        '       CSS del contenedor (scale.zoom = 1/dpr): nada lo estira a escalas fraccionarias. */',
        '    :host ::ng-deep .phaser-host canvas { display: block; }',
        '    /* Cruceta abajo a la izquierda y «Interactuar» abajo a la derecha. El lienzo ocupa todo el contenedor',
        '       (ya no hay bandas negras de encaje 16:9): la sala centrada deja márgenes a los lados. El',
        '       contenedor no recibe toques; solo los controles. */',
      ].join('\n'),
      // 11. el lienzo sigue al contenedor y al dpr (watchHostSize), no a Scale.FIT.
      [
        '      // Lienzo en píxeles físicos: sigue al contenedor (panel derecho, rotación, bottom',
        '      // sheet) y al devicePixelRatio (zoom del navegador, cambio de monitor).',
        '      this.detachHostWatch = watchHostSize(this.phaserGame, this.gameHost!.nativeElement);',
      ].join('\n'),
    ],
  },
];
```

**Archivo `edits/t2-seguimiento.cjs`**

```js
// Tarea 2: lo que la propia resolución deja muerto. Rutas relativas a frontend/.
module.exports = [
  // `labelStyle` lo usaba el nombre del NPC de la rama; ahora el nombre y la pista salen de `createNpcLabels` (master)
  // y nadie lo lee. (`DIMMED_ALPHA` queda sin uso hasta la tarea 7, que devuelve el atenuado de otras etapas.)
  {
    file: 'src/app/features/simulator/game-world.component.ts',
    find: [
      '    const labelStyle = {',
      "      fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#e8f0f4',",
      "      backgroundColor: 'rgba(8,12,18,.72)', padding: { x: 3, y: 2 }, align: 'center',",
      '    };',
      '',
    ].join('\n'),
    replace: '',
  },
];
```

---

### Task 3: Portar las pruebas al runner de master y restituir lo que la resolución perdió

**Files:**
- Modify: `frontend/src/app/features/character/kit/kit-phaser.spec.ts`, `kit-raster.spec.ts`, `kit/testing/kit-testing.ts`, `frontend/src/app/features/simulator/pixel-canvas.spec.ts`, `journal-panel.component.spec.ts`, `attempt-outcome.component.spec.ts`, `game-world.interaction.spec.ts`, `portrait-resolver.util.spec.ts`
- Delete: `frontend/src/app/features/character/roster-v1.contract.spec.ts`
- Modify: `frontend/src/app/features/simulator/attempt-outcome.component.ts`
- Create (fuera del repo, ya instalados): `$I/edits/t3-compila.cjs`, `$I/edits/t3-kit-prueba.cjs`, `$I/edits/t3-kit-codigo.cjs`

**Interfaces:**
- Consumes: el commit de fusión de la tarea 2.
- Produces: `ng test` **compila**. `fakeKitService(bundle?)` y `testKitBundle()` (en `kit/testing/kit-testing.ts`) funcionan desde cualquier spec: el paquete se busca subiendo hasta `src/assets/characters/kit/kit.json`. La pantalla de resultado vuelve a pedir el kit en su constructor único.

- [ ] **Step 1: Mira que la suite no compila (RED)**

Run (en `$WT/frontend`): `npx ng test --watch=false 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "ERROR|error" | sed -E 's/^\s+//' | cut -c1-110 | sort | uniq -c | sort -rn | head -20`
Expected: `Application bundle generation failed` con, entre otros, `TS2304: Cannot find name 'jest'` ×16, `Cannot find name 'P'` ×16, `PORTRAIT_DIR` ×2, `readdirSync`, `join`, `existsSync`, `TS2554: Expected 2 arguments, but got 3` ×10, `TS2345 … 'string' is not assignable to … 'KitBundle'` ×7, `TS2353 … 'frameIndex' does not exist in type 'NpcConfig'` y `TS2307: Cannot find module` para `../simulator/v1-avatar.util`, `../simulator/baked-cast.util` y `../character/avatar-figure.component`. Los errores caen en ocho specs: `portrait-resolver.util.spec.ts` (38), `kit-phaser.spec.ts` (7), `roster-v1.contract.spec.ts` (5), `kit-raster.spec.ts` (5), `pixel-canvas.spec.ts` (3), `attempt-outcome.component.spec.ts` (2), `journal-panel.component.spec.ts` (1) y `game-world.interaction.spec.ts` (1).

- [ ] **Step 2: Porta lo mecánico**

- `jest.*` → `vi.*` en cuatro specs (los tres de la rama y `journal-panel.component.spec.ts`, que es **de master** y no compila en `f39ab96`).
- `roster-v1.contract.spec.ts` se borra: importa los módulos del avatar viejo que la rama retiró a propósito (R4).
- `t3-compila.cjs`: la figura del kit en el doble de la pantalla de resultado y su `KitService`; `recipeId` en el NPC de prueba (sin `frameIndex`); las pruebas del resolver viejo de master (PNG legados `*_happy.png`) se sustituyen por «todo retrato devuelto existe» en el kit, y `kit-testing.ts` busca el paquete subiendo desde `__dirname`, porque bajo el runner de Angular `__dirname` de un módulo que no es spec no es el suyo (con ts-jest sí lo era).

Run (en `$WT/frontend`):
```bash
sed -i 's/\bjest\./vi./g' src/app/features/character/kit/kit-phaser.spec.ts src/app/features/character/kit/kit-raster.spec.ts \
  src/app/features/simulator/pixel-canvas.spec.ts src/app/features/simulator/journal-panel.component.spec.ts
git -c core.autocrlf=false rm -q src/app/features/character/roster-v1.contract.spec.ts
node "$I/tools/edits.cjs" "$I/edits/t3-compila.cjs"
grep -rn "jest\." src --include=*.ts | grep -vE ":\s*[0-9]+:\s*//" | cut -c1-140
```
Expected: nueve líneas `editado …` (`attempt-outcome.component.spec.ts` ×3, `game-world.interaction.spec.ts` ×1, `portrait-resolver.util.spec.ts` ×3, `kit-testing.ts` ×2) y el `grep` final **sin salida** (los `jest.` que quedan son comentarios de otros specs).

- [ ] **Step 3: Corre la suite entera**

Run (en `$WT/frontend`): `npx ng test --watch=false 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ *(Test Files|Tests) |^ FAIL" | cut -c1-230`
Expected: compila, y `Test Files  4 failed | 159 passed (163)`, `Tests  5 failed | 1914 passed (1919)`. Los cinco que fallan son, todos, pruebas **de master** que asumen el mundo anterior y cada una tiene dueña:

| Prueba que falla | La arregla |
|---|---|
| `dialogue-panel.component.spec.ts` › «la Abuela con emoción positive no recibe el retrato sonriente» (espera el PNG legado) | tarea 5 |
| `dialogue-panel.component.spec.ts` › «el retrato lateral mide clamp(96px, 18vh, 150px)…» | tarea 5 |
| `game-menu.component.spec.ts` › «la escena de Phaser solo pinta ese texto si lobbyKeyboardHint lo devuelve» | tarea 8 |
| `game-world.interaction.spec.ts` › «un objeto atenuado baja a alfa .55, sin anillo…» (recibe 0,88) | tarea 7 |
| `game-world.scale.spec.ts` › «el ResizeObserver del contenedor usa refreshScale y no un refresh() a secas» | tarea 6 |

Si falla otra, es un hallazgo: diagnostícala (superpowers:systematic-debugging) antes de seguir. Una falla que además salga con «0 pruebas» en su archivo suele ser el ayudante `kit-testing.ts` (revisa que se aplicó `t3-compila.cjs`).

- [ ] **Step 4: La resolución perdió una línea y nada lo notaba — escribe la prueba primero**

La auditoría de la tarea 2 marcó `this.kit.load().catch(() => undefined);`: la rama la tenía en el constructor de `attempt-outcome.component.ts`, master añadió otro constructor (foco de la pausa) y la resolución se quedó solo con el de master. Compila, pero sin el kit el jugador del encabezado de la pantalla de resultado no se dibuja.

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t3-kit-prueba.cjs"
npx ng test --watch=false --include src/app/features/simulator/attempt-outcome.component.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "AssertionError|Test Files|Tests "
```
Expected (RED): `AssertionError: expected "load" to be called 1 times, but got 0 times`; `Tests  1 failed | 23 passed (24)`.

- [ ] **Step 5: Restituye la línea (GREEN)**

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t3-kit-codigo.cjs"
npx ng test --watch=false --include src/app/features/simulator/attempt-outcome.component.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "FAIL|Test Files|Tests "
```
Expected: `Test Files  1 passed (1)`, `Tests  24 passed (24)`.

- [ ] **Step 6: Commit**

```bash
g() { git -c core.autocrlf=false "$@"; }
g add -u frontend && g commit -q -F - <<'EOF'
test(integracion-master): porta los specs a Vitest y la pantalla de resultado vuelve a cargar el kit

- jest.* → vi.* en kit-phaser, kit-raster, pixel-canvas y journal-panel (este último es
  de master: su `ng test` no compilaba en f39ab96).
- roster-v1.contract.spec.ts se borra: importa los módulos del avatar viejo que la rama retiró.
- Specs de master que apuntaban al mundo anterior: figura del kit en el doble de la pantalla de
  resultado, NpcConfig con recipeId (sin frameIndex) y retratos del kit en vez de los PNG legados.
- kit-testing.ts busca el kit subiendo desde __dirname: bajo el runner de Angular __dirname de un
  módulo que no es spec no es el suyo.
- La resolución perdió `this.kit.load()` de la pantalla de resultado (compilaba, nada lo avisaba):
  prueba primero (RED) y restituida.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
g log -1 --format='%h %s'
```
Expected: `test(integracion-master): porta los specs a Vitest y la pantalla de resultado vuelve a cargar el kit`.

**Archivo `edits/t3-compila.cjs`**

```js
// Tarea 3: lo mínimo para que la suite compile bajo el runner de master. Rutas relativas a frontend/.
const SIM = 'src/app/features/simulator';
const OUTCOME_SPEC = `${SIM}/attempt-outcome.component.spec.ts`;
const RESOLVER_SPEC = `${SIM}/portrait-resolver.util.spec.ts`;
const INTERACTION_SPEC = `${SIM}/game-world.interaction.spec.ts`;
const KIT_TESTING = 'src/app/features/character/kit/testing/kit-testing.ts';

module.exports = [
  // La pantalla de resultado dibuja al jugador con la figura del kit; el avatar viejo (AvatarFigureComponent) se borró.
  {
    file: OUTCOME_SPEC,
    find: "import { AvatarFigureComponent } from '../character/avatar-figure.component';\n",
    replace: "import { KitFigureComponent } from '../character/kit/kit-figure.component';\n",
  },
  {
    file: OUTCOME_SPEC,
    start: '/** El avatar real exige entradas `input.required` que ts-jest no registra: se sustituye por un doble. */',
    end: '  @Input() portrait = false;\n}\n',
    replace: [
      '/** La figura real exige entradas `input.required` que el TestBed no registra: se sustituye por un doble. */',
      "@Component({ selector: 'app-kit-figure', standalone: true, changeDetection: ChangeDetectionStrategy.Eager,",
      " template: '' })",
      'class KitFigureStubComponent {',
      '  @Input() visual: unknown;',
      '  @Input() portrait: unknown;',
      '  @Input() scale: unknown;',
      '}',
      '',
    ].join('\n'),
  },
  {
    file: OUTCOME_SPEC,
    find: "      providers: [provideRouter([]), { provide: AvatarStore, useFactory: () => new AvatarStore() }],\n    });\n    TestBed.overrideComponent(AttemptOutcomeComponent, {\n      remove: { imports: [AvatarFigureComponent] },\n      add: { imports: [AvatarFigureStubComponent] },",
    replace: [
      '      providers: [',
      '        provideRouter([]),',
      '        { provide: AvatarStore, useFactory: () => new AvatarStore() },',
      '        { provide: KitService, useValue: fakeKitService() },',
      '      ],',
      '    });',
      '    TestBed.overrideComponent(AttemptOutcomeComponent, {',
      '      remove: { imports: [KitFigureComponent] },',
      '      add: { imports: [KitFigureStubComponent] },',
    ].join('\n'),
  },
  // NpcConfig ya no tiene `frameIndex` (el cuadro de Kenney): el personaje sale de su receta.
  {
    file: INTERACTION_SPEC,
    find: "portrait: '', frameIndex: 0, dialogue:",
    replace: "portrait: '', recipeId: 'psicologa-hospitalaria', dialogue:",
  },
  // Las pruebas del resolver viejo de master (retratos legados `*_happy.png`) no compilan: su `P`, `PORTRAIT_DIR` y
  // `readdirSync` los quitó la resolución. Pasan al kit: «todo retrato devuelto existe» (aquí) y, con su prueba
  // escrita antes, los alias y la regla sin sonrisa (tarea 4).
  {
    file: RESOLVER_SPEC,
    find: "import { testKitBundle } from '../character/kit/testing/kit-testing';",
    replace: "import { existsSync } from 'fs';\nimport { join } from 'path';\n\nimport { testKitBundle } from '../character/kit/testing/kit-testing';",
  },
  {
    file: RESOLVER_SPEC,
    find: "const png = (path: string) => `/assets/characters/kit/${path}.png`;\n",
    replace: "const png = (path: string) => `/assets/characters/kit/${path}.png`;\nconst KIT_DIR = join(__dirname, '../../../assets/characters/kit');\n",
  },
  {
    file: RESOLVER_SPEC,
    start: "describe('resolvePortraitAsset: solo assets que existen y sin sonrisa en el duelo (T4.6, F§7.11)', () => {",
    end: "    expect(resolvePortraitAsset(null, 'positive', 'Psicóloga hospitalaria')).toBe(`${P}/psicologa-hospitalaria_happy.png`);\n  });\n});\n",
    replace: [
      "describe('resolvePortraitAsset: solo retratos que existen y sin sonrisa en el duelo (T4.6, F§7.11)', () => {",
      "  const GRIEVING = ['Abuela de la niña', 'Sobreviviente (22 años)'];",
      '  const EMOTIONS = [',
      "    'neutral', 'vulnerable', 'concerned', 'danger', 'positive', 'anxious', 'negative',",
      "    'sad', 'relieved', 'calm', 'worried', 'receptive', 'closed', 'happy', 'alerta', '', 'algo-raro', null, undefined,",
      '  ];',
      '',
      "  it('todo retrato devuelto existe en frontend/src/assets/characters/kit/', () => {",
      "    for (const speakerName of [...GRIEVING, 'Psicóloga hospitalaria', 'Funcionaria de recepción']) {",
      '      for (const emotion of EMOTIONS) {',
      '        const asset = resolvePortraitAsset(bundle, { speakerName, emotion });',
      '        expect(asset).not.toBeNull();',
      "        expect(existsSync(join(KIT_DIR, asset!.replace('/assets/characters/kit/', '')))).toBe(true);",
      '      }',
      '    }',
      '  });',
      '});',
      '',
    ].join('\n'),
  },
  // El ayudante de specs del kit buscaba el paquete con una ruta relativa a su propio `__dirname`. Bajo el runner de
  // Vitest de Angular cada spec se empaqueta con lo que importa: `__dirname` de un módulo que no es spec es el del spec
  // que lo importa (o la raíz de la compilación si cae en un trozo compartido), y la ruta se rompía según quién lo importara.
  {
    file: KIT_TESTING,
    find: [
      "import { readFileSync } from 'fs';",
      "import { join } from 'path';",
    ].join('\n'),
    replace: [
      "import { existsSync, readFileSync } from 'fs';",
      "import { dirname, join } from 'path';",
    ].join('\n'),
  },
  {
    file: KIT_TESTING,
    find: [
      'let cached: KitBundle | null = null;',
      '',
      'export function testKitBundle(): KitBundle {',
      "  cached ??= JSON.parse(readFileSync(join(__dirname, '../../../../../assets/characters/kit/kit.json'), 'utf8')) as KitBundle;",
      '  return cached;',
      '}',
    ].join('\n'),
    replace: [
      "const KIT_RELATIVE = ['src', 'assets', 'characters', 'kit'];",
      '',
      '/**',
      ' * Carpeta del kit, buscada subiendo desde `from`. Bajo el runner de Vitest de Angular `__dirname` no es el',
      ' * de este archivo (es el del spec que lo importa, o la raíz de la compilación si el módulo cae en un trozo',
      ' * compartido), así que una ruta relativa a él se rompe según quién lo importe.',
      ' */',
      'function findKitDir(from: string): string {',
      '  let dir = from;',
      '  for (let i = 0; i < 12; i++) {',
      "    if (existsSync(join(dir, ...KIT_RELATIVE, 'kit.json'))) return join(dir, ...KIT_RELATIVE);",
      '    dir = dirname(dir);',
      '  }',
      "  throw new Error(`No se encontró ${KIT_RELATIVE.join('/')}/kit.json subiendo desde ${from}`);",
      '}',
      '',
      'let cached: KitBundle | null = null;',
      '',
      'export function testKitBundle(): KitBundle {',
      "  cached ??= JSON.parse(readFileSync(join(findKitDir(__dirname), 'kit.json'), 'utf8')) as KitBundle;",
      '  return cached;',
      '}',
    ].join('\n'),
  },
];
```

**Archivo `edits/t3-kit-prueba.cjs`**

```js
// Tarea 3 (prueba primero): la pantalla de resultado pide el kit al crearse. La resolución de la fusión se quedó con el
// constructor de master (foco de la pausa) y perdió el de la rama (`this.kit.load()`); compilaba y nada lo notaba.
// Rutas relativas a frontend/.
module.exports = [
  {
    file: 'src/app/features/simulator/attempt-outcome.component.spec.ts',
    find: "  it('la pausa habla de reanudar y el cierre terminal no finge pausa (ETH-02 A)', () => {",
    replace: [
      "  it('al crearse pide el kit: sin él el jugador del encabezado no se dibuja', () => {",
      '    TestBed.resetTestingModule();',
      '    const kit = fakeKitService();',
      "    const load = vi.spyOn(kit, 'load');",
      '    TestBed.configureTestingModule({',
      '      imports: [AttemptOutcomeComponent],',
      '      providers: [',
      '        provideRouter([]),',
      '        { provide: AvatarStore, useFactory: () => new AvatarStore() },',
      '        { provide: KitService, useValue: kit },',
      '      ],',
      '    });',
      '    TestBed.createComponent(AttemptOutcomeComponent);',
      '    expect(load).toHaveBeenCalledTimes(1);',
      '  });',
      '',
      "  it('la pausa habla de reanudar y el cierre terminal no finge pausa (ETH-02 A)', () => {",
    ].join('\n'),
  },
];
```

**Archivo `edits/t3-kit-codigo.cjs`**

```js
// Tarea 3 (código): el constructor único de la pantalla de resultado carga el kit y luego deja el foco de la pausa
// de master. Rutas relativas a frontend/.
module.exports = [
  {
    file: 'src/app/features/simulator/attempt-outcome.component.ts',
    find: '  constructor() {\n    // Al entrar en pausa el foco va a «Reanudar este intento» (cdkFocusInitial): lo primero es poder volver.',
    replace: '  constructor() {\n    this.kit.load().catch(() => undefined);\n    // Al entrar en pausa el foco va a «Reanudar este intento» (cdkFocusInitial): lo primero es poder volver.',
  },
];
```

---

### Task 4: Retratos y emociones — sin sonrisa en el duelo, los alias de master y el guardián del backend

**Files:**
- Modify: `frontend/src/app/features/simulator/portrait-resolver.util.ts`, `portrait-resolver.util.spec.ts`
- Modify: `frontend/character-kit/catalog.json`, `frontend/scripts/character-kit/coverage.mjs`, `coverage.test.mjs`
- Regenerate: `frontend/src/assets/characters/kit/kit.json`, `manifest.json` (con `npm run kit:build`; los PNG no cambian)
- Modify: `backend_django/apps/simulation/tests/test_visual_inventory_contract.py`
- Create (fuera del repo, ya instalados): `$I/edits/t4-pruebas.cjs`, `t4-resolver.cjs`, `t4-catalogo.cjs`

**Interfaces:**
- Consumes: `resolvePortraitAsset(bundle: KitBundle | null, keys: DialoguePortraitKeys): string | null` del resolver del kit; `portraitStateFor(bundle, emotion)` y `visualPortrait(visual, state)`.
- Produces: el mismo `resolvePortraitAsset`, ahora con `NO_SMILE_RECIPES = {'abuela-familia', 'sobreviviente'}` (si el estado es `alegre` para ellas, se da `neutral`); el catálogo con `anxious`, `worried → preocupada`, `negative`, `sad → triste` y `relieved`, `calm`, `receptive`, `closed → neutral`; y un guardián del backend que exige que **toda emoción que el backend puede emitir** esté en `catalog.emotionToPortrait` del kit.

**Qué había en master y qué pasó con ello.**
1. Su resolver (PNG legados) cuidaba dos reglas del informe de jugabilidad (F§7.11): la Abuela y la Sobreviviente no sonríen, y `anxious/negative/sad/relieved/calm` caen en una cara. Con el kit las cuatro caras existen para todos —la primera regla ya no la da la falta de assets— y el catálogo solo conocía cinco emociones. El backend normaliza algunas al sembrar (`anxious → concerned`, `relieved → positive`) pero un diálogo creado en el editor puede traer cualquiera: sin alias saldría un neutral silencioso (Review Focus 1).
2. **Hallazgo de `npm run test:backend` sobre la fusión de prueba, el único rojo fuera del frontend:** `test_visual_inventory_contract.py::test_clinical_emotion_authority_covers_seeded_tree_and_future_consequences_exactly` lee `frontend/src/assets/characters/v1/clinical-emotion-map.v1.json`, que la rama borró con el avatar viejo (`FileNotFoundError`). Esa prueba es un **guardián útil**: exige que el mapa de emociones del frontend cubra todo lo que el guion, la proyección del árbol (`neutral/positive/concerned/danger`) o una consecuencia futura (`receptive/calm/worried/closed`) pueden producir. No se borra: se apunta al catálogo del kit (la autoridad de emoción → cara, spec §7.3). Se pierde la comparación exacta con las categorías clínicas viejas (`relieved/relief/steady/rupture`), que ya no existen. Tres emociones del guardián (`worried`, `receptive`, `closed`) no estaban ni en el catálogo ni en los alias de master, que las dejaba caer en neutral; aquí `worried → preocupada` (como la proyección del seed: `worried → concerned`) y `receptive`, `closed → neutral` (lo que master daba de hecho).

- [ ] **Step 1: Escribe las pruebas primero**

`t4-pruebas.cjs`: al spec del resolver, tres pruebas (alias y emociones futuras, sin sonrisa, la Psicóloga conserva la suya); al test de cobertura del kit, una que exige los ocho alias y que el chequeo avise si falta uno; y el guardián del backend apuntado al catálogo del kit.

Antes de la primera corrida del backend (`test-backend.mjs` exige `backend_django/.venv` y un worktree nuevo no lo trae; se quita en la tarea 11), enlaza el venv del checkout principal (corregido tras la ejecución: el plan lo ponía en la tarea 9):
```powershell
New-Item -ItemType Junction -Path 'D:\Sua_Files\IdeaProjects\psico_project_v3\.worktrees\integracion\backend_django\.venv' -Target 'D:\Sua_Files\IdeaProjects\psico_project_v3\backend_django\.venv'
```

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t4-pruebas.cjs"
npx ng test --watch=false --include src/app/features/simulator/portrait-resolver.util.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|AssertionError|Test Files|Tests " | cut -c1-200
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/character-kit/coverage.test.mjs 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ℹ (pass|fail)|falta la emoción"
cd .. && SIEP_TEST_DB_PORT=5563 MSYS_NO_PATHCONV=1 node scripts/test-backend.mjs apps/simulation/tests/test_visual_inventory_contract.py 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^E  |[0-9]+ (passed|failed)" | head -8
```
Expected (RED), tres suites: vitest `Tests  2 failed | 11 passed (13)` —«alias de F§7.11 y emociones de consecuencias futuras…» y «positive y happy nunca sonríen a la Abuela ni a la Sobreviviente…» (`expected '…/abuela-familia/portrait-alegre.png' not to match /portrait-alegre/`)—; node:test `ℹ pass 8`, `ℹ fail 1` con `AssertionError … falta la emoción anxious`; backend `AssertionError: assert {'anxious', …} == set()` con `Extra items in the left set:` (`worried`, `negative`, `closed`, `receptive`, `sad`…) y `1 failed, 2 passed`.

- [ ] **Step 2: La regla «sin sonrisa» (GREEN a medias)**

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t4-resolver.cjs"
npx ng test --watch=false --include src/app/features/simulator/portrait-resolver.util.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|Test Files|Tests " | cut -c1-200
```
Expected: dos `editado …portrait-resolver.util.ts`; `Tests  1 failed | 12 passed (13)`: solo queda la de los alias.

- [ ] **Step 3: Los alias en el catálogo, y el kit regenerado**

El catálogo es la fuente (spec §7.3: emoción → estado de retrato); `coverage.mjs` exige que cada emoción que lista proyecte a un estado válido.

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t4-catalogo.cjs"
npm run kit:check 2>&1 | grep -E "desactualizado|errores"
npm run kit:build 2>&1 | tail -1 | cut -c1-120
npm run kit:check 2>&1 | grep -E "errores"
```
Expected: `editado character-kit/catalog.json` y `…coverage.mjs`; el primer `kit:check` **falla** con `kit.json está desactualizado: ejecuta npm run kit:build`, `manifest.json está desactualizado…` y `kit:check: 2 errores` (el guardián de bytes del kit funciona: nadie edita el catálogo sin regenerar); `kit:build` termina con `kit.json: 128.7 KB · 26 personajes · 155 archivos en …`; el segundo `kit:check` da `kit:check: 0 errores`.

- [ ] **Step 4: Todo en verde**

Run (en `$WT/frontend`):
```bash
npx ng test --watch=false --include src/app/features/simulator/portrait-resolver.util.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|Test Files|Tests "
npm run test:kit 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ℹ (tests|pass|fail)"
cd .. && SIEP_TEST_DB_PORT=5563 MSYS_NO_PATHCONV=1 node scripts/test-backend.mjs apps/simulation/tests/test_visual_inventory_contract.py 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "[0-9]+ (passed|failed)"
git -c core.autocrlf=false status --short
```
Expected: `Tests  13 passed (13)`; `ℹ tests 65`, `ℹ pass 65`, `ℹ fail 0`; `3 passed`; y `git status` lista exactamente 8 archivos: `backend_django/apps/simulation/tests/test_visual_inventory_contract.py`, `frontend/character-kit/catalog.json`, `frontend/scripts/character-kit/coverage.mjs`, `…/coverage.test.mjs`, `frontend/src/app/features/simulator/portrait-resolver.util.spec.ts`, `…portrait-resolver.util.ts`, `frontend/src/assets/characters/kit/kit.json` y `…/manifest.json` (ningún PNG).

- [ ] **Step 5: Commit**

```bash
g() { git -c core.autocrlf=false "$@"; }
g add -u frontend backend_django && g commit -q -F - <<'EOF'
fix(integracion-master): retratos y emociones — sin sonrisa en el duelo, alias de master y guardián del backend

El resolver de retratos del kit sustituye al de master (PNG legados). Dos reglas del
informe de jugabilidad (F§7.11) vivían en aquel: la Abuela y la Sobreviviente no sonríen
(con el kit las cuatro caras existen para todos, ya no lo da la falta de assets) y
anxious/negative/sad/relieved/calm proyectan a una cara aunque el backend normalice
algunas al sembrar. Pruebas primero (RED): vitest y node:test del kit.

El catálogo del kit gana ocho emociones (anxious, worried, negative, sad, relieved, calm,
receptive, closed); coverage.mjs las exige; kit.json y manifest.json se regeneran con
kit:build (los PNG no cambian).

La prueba del backend que comprobaba que el mapa de emociones del frontend cubre todo lo que
el guion, el árbol o una consecuencia futura pueden emitir leía un JSON que la rama borró
(characters/v1/clinical-emotion-map.v1.json): se apunta al catálogo del kit.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
g log -1 --format='%h %s'
```

**Archivo `edits/t4-pruebas.cjs`**

```js
// Tarea 4 (pruebas primero): retratos del diálogo y el guardián del backend. Rutas relativas a frontend/.
const RESOLVER_SPEC = 'src/app/features/simulator/portrait-resolver.util.spec.ts';
const COVERAGE_TEST = 'scripts/character-kit/coverage.test.mjs';
const BACKEND_TEST = '../backend_django/apps/simulation/tests/test_visual_inventory_contract.py';

module.exports = [
  // Las dos reglas de producto de master (informe de jugabilidad, F§7.11) que el resolver del kit aún no cumple.
  {
    file: RESOLVER_SPEC,
    find: [
      "        expect(existsSync(join(KIT_DIR, asset!.replace('/assets/characters/kit/', '')))).toBe(true);",
      '      }',
      '    }',
      '  });',
      '});',
      '',
    ].join('\n'),
    replace: [
      "        expect(existsSync(join(KIT_DIR, asset!.replace('/assets/characters/kit/', '')))).toBe(true);",
      '      }',
      '    }',
      '  });',
      '',
      "  it('alias de F§7.11 y emociones de consecuencias futuras: anxious y worried → preocupada, negative y sad → triste, el resto → neutral', () => {",
      "    const faces = (emotion: string) => resolvePortraitAsset(bundle, { speakerName: 'Psicóloga hospitalaria', emotion });",
      "    expect(faces('anxious')).toBe(png('psicologa-hospitalaria/portrait-preocupada'));",
      "    expect(faces('worried')).toBe(png('psicologa-hospitalaria/portrait-preocupada'));",
      "    expect(faces('negative')).toBe(png('psicologa-hospitalaria/portrait-triste'));",
      "    expect(faces('sad')).toBe(png('psicologa-hospitalaria/portrait-triste'));",
      "    for (const calm of ['relieved', 'calm', 'receptive', 'closed']) {",
      "      expect(faces(calm)).toBe(png('psicologa-hospitalaria/portrait-neutral'));",
      '    }',
      '  });',
      '',
      "  it('positive y happy nunca sonríen a la Abuela ni a la Sobreviviente (sin sonrisa en el duelo)', () => {",
      '    for (const speakerName of GRIEVING) {',
      '      for (const emotion of EMOTIONS) {',
      '        expect(resolvePortraitAsset(bundle, { speakerName, emotion })).not.toMatch(/portrait-alegre/);',
      '      }',
      '    }',
      "    expect(resolvePortraitAsset(bundle, { speakerName: 'Abuela de la niña', emotion: 'positive' }))",
      "      .toBe(png('abuela-familia/portrait-neutral'));",
      "    expect(resolvePortraitAsset(bundle, { speakerName: 'Sobreviviente (22 años)', emotion: 'happy' }))",
      "      .toBe(png('sobreviviente/portrait-neutral'));",
      '  });',
      '',
      "  it('la sonrisa de la Psicóloga hospitalaria (positive → alegre) se conserva', () => {",
      "    expect(resolvePortraitAsset(bundle, { speakerName: 'Psicóloga hospitalaria', emotion: 'positive' }))",
      "      .toBe(png('psicologa-hospitalaria/portrait-alegre'));",
      '  });',
      '});',
      '',
    ].join('\n'),
  },
  // El catálogo del kit proyecta a un retrato las emociones que el diálogo puede traer, también las que el
  // resolver de master ya aliaba aunque el backend las normalice al sembrar (anxious → concerned, relieved → positive)
  // y las de consecuencias futuras (receptive, closed, worried).
  {
    file: COVERAGE_TEST,
    find: "test('todo lo que el catálogo nombra existe', () => {",
    replace: [
      "test('el catálogo proyecta a un retrato las emociones que master ya aliaba (F§7.11) y las de consecuencias futuras, y el chequeo las exige', () => {",
      '  const bundle = buildBundle();',
      "  for (const emotion of ['anxious', 'worried', 'negative', 'sad', 'relieved', 'calm', 'receptive', 'closed']) {",
      '    assert.ok(bundle.catalog.emotionToPortrait[emotion], `falta la emoción ${emotion}`);',
      '  }',
      '  delete bundle.catalog.emotionToPortrait.anxious;',
      "  assert.deepEqual(checkCatalogRecipes(bundle), ['catálogo: la emoción anxious no proyecta a un estado de retrato']);",
      '});',
      '',
      "test('todo lo que el catálogo nombra existe', () => {",
    ].join('\n'),
  },
  // El guardián del backend (master) comprobaba que el mapa de emociones del frontend (`characters/v1/
  // clinical-emotion-map.v1.json`, que la rama borró con el avatar viejo) cubriera TODA emoción que el guion, la
  // proyección del árbol o una consecuencia futura pueden producir. Se apunta al catálogo del kit: lo que falte
  // caería en neutral sin que nadie lo notara. Se pierde la comparación exacta contra las categorías clínicas
  // viejas (neutral/relieved/concerned/relief/steady/rupture), que ya no existen.
  {
    file: BACKEND_TEST,
    find: [
      'CLINICAL_EMOTION_MAP_PATH = (',
      '    REPO_ROOT',
      '    / "frontend"',
      '    / "src"',
      '    / "assets"',
      '    / "characters"',
      '    / "v1"',
      '    / "clinical-emotion-map.v1.json"',
      ')',
      '',
    ].join('\n'),
    replace: [
      'KIT_PATH = REPO_ROOT / "frontend" / "src" / "assets" / "characters" / "kit" / "kit.json"',
      'PORTRAIT_STATES = {"neutral", "alegre", "preocupada", "triste"}',
      '',
    ].join('\n'),
  },
  {
    file: BACKEND_TEST,
    start: 'EXPECTED_CLINICAL_EMOTION_MAP = {',
    end: '    "closed": "rupture",\n}\n',
    replace: '',
  },
  {
    file: BACKEND_TEST,
    start: 'def test_clinical_emotion_authority_covers_seeded_tree_and_future_consequences_exactly():',
    end: '    assert set(EXPECTED_CLINICAL_EMOTION_MAP) == expected_emotions\n',
    replace: [
      'def test_every_emotion_the_backend_can_emit_has_a_portrait_in_the_kit():',
      '    projection = _read_json(KIT_PATH)["catalog"]["emotionToPortrait"]',
      '    expected_emotions = (',
      '        _seeded_line_emotions()',
      '        | TREE_PROJECTION_EMOTIONS',
      '        | FUTURE_CONSEQUENCE_EMOTIONS',
      '    )',
      '',
      '    assert expected_emotions - set(projection) == set()',
      '    assert set(projection.values()) <= PORTRAIT_STATES',
      '',
    ].join('\n'),
  },
];
```

**Archivo `edits/t4-resolver.cjs`**

```js
// Tarea 4 (código): la Abuela y la Sobreviviente no sonríen aunque la emoción sea positiva. Rutas relativas a frontend/.
const RESOLVER = 'src/app/features/simulator/portrait-resolver.util.ts';

module.exports = [
  // Con el kit las cuatro caras existen para todos, así que la regla (master, PR #16: «sin sonrisa en el duelo») ya no
  // la da la falta de assets: se declara.
  {
    file: RESOLVER,
    find: 'export interface DialoguePortraitKeys {',
    replace: [
      '/** Recetas que no sonríen en este caso (límite de producto del informe de jugabilidad: sin sonrisa en el duelo). */',
      "const NO_SMILE_RECIPES: ReadonlySet<string> = new Set(['abuela-familia', 'sobreviviente']);",
      '',
      'export interface DialoguePortraitKeys {',
    ].join('\n'),
  },
  {
    file: RESOLVER,
    find: '  const source = visualPortrait(visual, portraitStateFor(bundle, keys.emotion));',
    replace: [
      '  const state = portraitStateFor(bundle, keys.emotion);',
      "  const source = visualPortrait(visual, state === 'alegre' && NO_SMILE_RECIPES.has(recipeId) ? 'neutral' : state);",
    ].join('\n'),
  },
];
```

**Archivo `edits/t4-catalogo.cjs`**

```js
// Tarea 4 (código): el catálogo del kit proyecta a los cuatro estados de retrato todas las emociones que el
// backend puede emitir y las que master ya aliaba (lo desconocido sigue siendo neutral). Rutas relativas a frontend/.
module.exports = [
  {
    file: 'character-kit/catalog.json',
    find: [
      '    "concerned": "preocupada",',
      '    "danger": "triste",',
      '    "positive": "alegre"',
    ].join('\n'),
    replace: [
      '    "concerned": "preocupada",',
      '    "anxious": "preocupada",',
      '    "worried": "preocupada",',
      '    "danger": "triste",',
      '    "negative": "triste",',
      '    "sad": "triste",',
      '    "relieved": "neutral",',
      '    "calm": "neutral",',
      '    "receptive": "neutral",',
      '    "closed": "neutral",',
      '    "positive": "alegre"',
    ].join('\n'),
  },
  {
    file: 'scripts/character-kit/coverage.mjs',
    find: "const EMOTIONS = ['neutral', 'vulnerable', 'concerned', 'danger', 'positive'];",
    replace: "const EMOTIONS = ['neutral', 'vulnerable', 'concerned', 'anxious', 'worried', 'danger', 'negative', 'sad', 'relieved', 'calm', 'receptive', 'closed', 'positive'];",
  },
];
```

---

### Task 5: Retrato lateral del diálogo — 96 px (×3) y 64 px (×2) en pantallas bajas

**Files:**
- Modify: `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts`, `dialogue-panel.component.ts`
- Create (fuera del repo, ya instalados): `$I/edits/t5-pruebas.cjs`, `$I/edits/t5-codigo.cjs`

**Interfaces:**
- Consumes: `fakeKitService()` (tarea 3) y `KitService`.
- Produces: `.dialogue-strip--side .portrait-img { width: 96px; height: 96px; }` y, dentro de `@media (max-height: 520px)`, `.dialogue-strip--side .portrait-img { width: 64px; height: 64px; }`.

**Qué había en master.** TOUCH-01 redujo el retrato lateral a `clamp(96px, 18vh, 150px)` para que no ocupara ~350 px, y el modo compacto a `clamp(48px, 12vh, 64px)`. El retrato del kit es de 32×32: solo vale un múltiplo entero (spec §1.1.2). El 96 de la rama ya cumple la intención de TOUCH-01 (es el mínimo del `clamp` de master). En compacto, el `height: clamp(…)` de master con el `width: 96px` fijo de la rama **lo aplastaría** (96×48): ninguna prueba heredada lo ve, solo el ojo. R2: 64×64, el máximo del rango de master, ×2 exacto.

- [ ] **Step 1: Mira fallar las dos pruebas de master (RED previo)**

Run (en `$WT/frontend`): `npx ng test --watch=false --include src/app/features/simulator/dialogue-panel.component.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|Test Files|Tests " | cut -c1-230`
Expected: `Tests  2 failed | 65 passed (67)`: «la Abuela con emoción positive no recibe el retrato sonriente» (el `src` es `undefined`: sin `KitService` el panel no resuelve el retrato) y «el retrato lateral mide clamp(96px, 18vh, 150px)…».

- [ ] **Step 2: Reescribe las pruebas al kit (RED de lo nuevo)**

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t5-pruebas.cjs"
npx ng test --watch=false --include src/app/features/simulator/dialogue-panel.component.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|AssertionError|Test Files|Tests " | cut -c1-230
```
Expected: tres `editado …dialogue-panel.component.spec.ts`; `Tests  1 failed | 66 passed (67)`: «el retrato lateral mide 96 px (×3) y 64 px (×2) en pantallas bajas…» con `AssertionError: expected 'import { CommonModule }…' to match /@media \(max-height: 520px\)…/`. (La de la Abuela ya pasa: el panel nunca tuvo el defecto, lo tenía el doble de la prueba.)

- [ ] **Step 3: El CSS compacto (GREEN)**

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t5-codigo.cjs"
npx ng test --watch=false --include src/app/features/simulator/dialogue-panel.component.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|Test Files|Tests "
```
Expected: `Test Files  1 passed (1)`, `Tests  67 passed (67)`.

- [ ] **Step 4: Commit**

```bash
g() { git -c core.autocrlf=false "$@"; }
g add -u frontend && g commit -q -F - <<'EOF'
fix(integracion-master): retrato lateral del diálogo — 96 px (×3) y 64 px (×2) en pantallas bajas

Las pruebas T4.6 y T4.4 de master asumían los PNG legados y `clamp(96px, 18vh, 150px)`
(TOUCH-01). El retrato del kit es de 32×32: solo escalas enteras (spec §1.1.2). El modo compacto
de master (`clamp(48px, 12vh, 64px)` con el ancho fijo de 96 px de la rama) lo habría aplastado:
pasa a 64×64. La prueba nueva (RED) fija ambos tamaños; la T4.6 usa el KitService de pruebas.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
g log -1 --format='%h %s'
```

**Archivo `edits/t5-pruebas.cjs`**

```js
// Tarea 5 (pruebas primero): el panel de diálogo con el retrato del kit. Rutas relativas a frontend/.
const SPEC = 'src/app/features/simulator/dialogue-panel.component.spec.ts';

module.exports = [
  // T4.6 de master: el retrato de la Abuela sale del kit (antes del PNG legado `madre-vbg_neutral.png`), y el panel
  // necesita el KitService para resolverlo (sin él `.portrait-img` ni se pinta).
  {
    file: SPEC,
    start: "describe('DialoguePanelComponent - emociones y retrato (T4.6)', () => {",
    end: "      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],\n",
    replace: [
      "describe('DialoguePanelComponent - emociones y retrato (T4.6)', () => {",
      '  let fixture: ComponentFixture<DialoguePanelComponent>;',
      '  let component: DialoguePanelComponent;',
      '  const host = () => fixture.nativeElement as HTMLElement;',
      '',
      '  beforeEach(async () => {',
      '    await TestBed.configureTestingModule({',
      '      imports: [DialoguePanelComponent],',
      '      providers: [',
      '        { provide: AudioDirectorService, useValue: { playSfx: vi.fn() } },',
      '        { provide: KitService, useValue: fakeKitService() },',
      '      ],',
      '',
    ].join('\n'),
  },
  {
    file: SPEC,
    find: "    expect(host().querySelector('.portrait-img')?.getAttribute('src')).toBe('/assets/characters/portraits/madre-vbg_neutral.png');",
    replace: "    expect(host().querySelector('.portrait-img')?.getAttribute('src')).toBe('/assets/characters/kit/abuela-familia/portrait-neutral.png');",
  },
  // T4.4 de master: el retrato lateral era `clamp(96px, 18vh, 150px)` para no ocupar ~350 px (TOUCH-01). El retrato del
  // kit mide 32×32: solo escalas enteras (spec §1.1.2), 96 px (×3) y, con la altura limitada, 64 px (×2) en vez de
  // `clamp(48px, 12vh, 64px)`, que lo dejaría a fracciones (y aplastado, con el ancho fijo de 96 px).
  {
    file: SPEC,
    find: [
      "  it('el retrato lateral mide clamp(96px, 18vh, 150px) y el panel lateral es lo único que se desplaza', () => {",
      "    expect(source).toMatch(/\\.dialogue-strip--side \\.portrait-img \\{\\s*width: auto;\\s*max-width: 100%;\\s*height: clamp\\(96px, 18vh, 150px\\);/);",
    ].join('\n'),
    replace: [
      "  it('el retrato lateral mide 96 px (×3) y 64 px (×2) en pantallas bajas, y el panel lateral es lo único que se desplaza', () => {",
      "    expect(source).toMatch(/\\.dialogue-strip--side \\.portrait-img \\{ width: 96px; height: 96px; \\}/);",
      "    expect(source).toMatch(/@media \\(max-height: 520px\\) \\{[\\s\\S]*?\\.dialogue-strip--side \\.portrait-img \\{ width: 64px; height: 64px; \\}/);",
      "    expect(source).not.toContain('clamp(48px, 12vh, 64px)');",
    ].join('\n'),
  },
];
```

**Archivo `edits/t5-codigo.cjs`**

```js
// Tarea 5 (código): el retrato lateral en pantallas bajas (modo compacto de master, T10). Rutas relativas a frontend/.
module.exports = [
  {
    file: 'src/app/features/simulator/dialogue-panel.component.ts',
    find: '      .dialogue-strip--side .portrait-img { height: clamp(48px, 12vh, 64px); }',
    replace: '      .dialogue-strip--side .portrait-img { width: 64px; height: 64px; }',
  },
];
```

---

### Task 6: Escala del lienzo — `refreshScale` reencaja en píxeles físicos y se prueba el observador

**Files:**
- Modify: `frontend/src/app/features/simulator/game-world.scale.spec.ts`, `pixel-canvas.spec.ts`, `game-world.component.ts`
- Create (fuera del repo, ya instalados): `$I/edits/t6-pruebas.cjs`, `$I/edits/t6-codigo.cjs`

**Interfaces:**
- Consumes: `fitGameToHost(game, host): boolean` y `watchHostSize(game, host): () => void` de `pixel-canvas.ts` (rama, plan 3).
- Produces: `GameWorldComponent.refreshScale(): void` = `if (this.phaserGame && host) fitGameToHost(this.phaserGame, host)`, con `host = this.gameHost?.nativeElement`.

**Qué había en master.** `refreshScale()` (lo llama `simulation-play` al abrir o cerrar un panel) hacía `scale.getParentBounds(); scale.refresh()` porque `Scale.FIT` solo reencajaba si antes se releía el contenedor (T0.3: sin eso, «tras cerrar un diálogo el canvas quedaba 17 % más pequeño»). El lienzo de la rama es `Scale.NONE` en píxeles físicos: `refresh()` lo desordenaría, y `fitGameToHost` ya mide el contenedor en cada llamada antes de reencajar. Tras la fusión el código de `Scale.FIT` seguía ahí, silencioso.

- [ ] **Step 1: Mira fallar la prueba de master (RED previo)**

Run (en `$WT/frontend`): `npx ng test --watch=false --include src/app/features/simulator/game-world.scale.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|Test Files|Tests " | cut -c1-230`
Expected: `Tests  1 failed | 9 passed (10)`: «el ResizeObserver del contenedor usa refreshScale y no un refresh() a secas» (ya no hay `new ResizeObserver(() => this.refreshScale())`: lo reemplazó `watchHostSize`). Las otras dos de T5.4 siguen pasando **porque el código de `Scale.FIT` aún está**: no prueban nada del lienzo nuevo.

- [ ] **Step 2: Reescribe T5.4 al lienzo en píxeles físicos y prueba `watchHostSize`**

`t6-pruebas.cjs`: «`refreshScale` vuelve a medir el contenedor y reencaja a su tamaño nuevo» (un contenedor cuyo tamaño cambia y un lienzo falso), «no falla antes de que Phaser exista ni sin contenedor», el contrato de código (`watchHostSize` + `fitGameToHost`, sin `Scale.FIT` ni `scale.refresh()`) y, en `pixel-canvas.spec.ts`, la prueba que `watchHostSize` no tenía: reencaja con el `ResizeObserver` y con `resize` de la ventana, y deja de observar al soltarlo.

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t6-pruebas.cjs"
npx ng test --watch=false --include src/app/features/simulator/game-world.scale.spec.ts --include src/app/features/simulator/pixel-canvas.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|AssertionError|TypeError|Test Files|Tests " | cut -c1-230
```
Expected: cuatro `editado …` (el spec de escala ×1, `pixel-canvas.spec.ts` ×3); tres fallos de `game-world.scale.spec.ts` (RED): `TypeError: scale.getParentBounds is not a function`, «no falla antes de que Phaser exista ni sin contenedor» (lanza ese mismo `TypeError`) y el contrato de código (`expected '…' to match /refreshScale\(\): void \{\s*const host = …`). La prueba nueva de `watchHostSize` **pasa** (el código ya existía; es la prueba que le faltaba).

- [ ] **Step 3: `refreshScale` con `fitGameToHost` (GREEN)**

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t6-codigo.cjs"
npx ng test --watch=false --include src/app/features/simulator/game-world.scale.spec.ts --include src/app/features/simulator/pixel-canvas.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|Test Files|Tests "
```
Expected: dos `editado …game-world.component.ts`; `Test Files  2 passed (2)`, `Tests  13 passed (13)`.

- [ ] **Step 4: Commit**

```bash
g() { git -c core.autocrlf=false "$@"; }
g add -u frontend && g commit -q -F - <<'EOF'
fix(integracion-master): refreshScale reencaja el lienzo en píxeles físicos (T0.3) y se prueba el observador

Master reencajaba con Scale.FIT (`getParentBounds()` + `refresh()`); el lienzo de la rama es
`Scale.NONE` en píxeles físicos y `refresh()` lo habría desordenado. `refreshScale()` (la llama
simulation-play al abrir o cerrar un panel) vuelve a medir el contenedor con `fitGameToHost`.
Las pruebas de T5.4 se reescriben al modelo nuevo (RED primero) y `watchHostSize`, que no tenía
prueba, gana la suya (reencaja con el contenedor y la ventana; suelta el observador).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
g log -1 --format='%h %s'
```

**Archivo `edits/t6-pruebas.cjs`**

```js
// Tarea 6 (pruebas primero): escala del lienzo. Master reencajaba con Scale.FIT (`getParentBounds()` + `refresh()`);
// la rama lo reemplazó por un lienzo en píxeles físicos (`fitGameToHost` / `watchHostSize`). Rutas relativas a frontend/.
const SIM = 'src/app/features/simulator';
const SCALE_SPEC = `${SIM}/game-world.scale.spec.ts`;
const CANVAS_SPEC = `${SIM}/pixel-canvas.spec.ts`;

module.exports = [
  {
    file: SCALE_SPEC,
    start: '/**\n * T0.3: `ScaleManager.refresh()`',
    end: "    expect(source).toMatch(/refreshScale\\(\\): void \\{\\s*const scale = this\\.phaserGame\\?\\.scale;\\s*if \\(!scale\\) return;\\s*scale\\.getParentBounds\\(\\);\\s*scale\\.refresh\\(\\);\\s*\\}/);\n  });\n",
    replace: [
      '/**',
      ' * T0.3: tras cerrar un diálogo el canvas quedaba 17 % más pequeño porque se reencajaba con el tamaño viejo del',
      ' * contenedor. Con el lienzo en píxeles físicos (spec §8.3) `fitGameToHost` mide el contenedor en cada llamada',
      ' * antes de reencajar, y `watchHostSize` (ResizeObserver + resize de la ventana) lo llama solo.',
      ' */',
      "describe('game-world: escala del canvas (T5.4)', () => {",
      '  /** Un contenedor cuyo tamaño CSS se puede cambiar y el lienzo de Phaser que lo refleja. */',
      '  function canvasAndHost(width: number, height: number) {',
      '    const rect = { width, height };',
      '    const host = { getBoundingClientRect: () => rect } as unknown as HTMLElement;',
      '    const scale = {',
      '      width, height, zoom: 1,',
      '      resize: vi.fn((w: number, h: number) => { scale.width = w; scale.height = h; }),',
      '      setZoom: vi.fn((z: number) => { scale.zoom = z; }),',
      '    };',
      '    return { rect, host, scale };',
      '  }',
      '',
      '  function componentWith(game: unknown, host?: HTMLElement): GameWorldComponent {',
      '    const component = Object.create(GameWorldComponent.prototype) as { phaserGame?: unknown; gameHost?: unknown };',
      '    component.phaserGame = game;',
      '    component.gameHost = host ? { nativeElement: host } : undefined;',
      '    return component as unknown as GameWorldComponent;',
      '  }',
      '',
      "  it('refreshScale vuelve a medir el contenedor y reencaja el lienzo a su tamaño nuevo', () => {",
      '    const { rect, host, scale } = canvasAndHost(800, 450);',
      '    const component = componentWith({ scale }, host);',
      '    component.refreshScale();',
      '    expect(scale.resize).not.toHaveBeenCalled();',
      '    rect.width = 640;',
      '    rect.height = 360;',
      '    component.refreshScale();',
      '    expect(scale.resize).toHaveBeenCalledWith(640, 360);',
      '    expect(scale.width).toBe(640);',
      '  });',
      '',
      "  it('refreshScale no falla antes de que Phaser exista ni sin contenedor', () => {",
      '    expect(() => componentWith(undefined).refreshScale()).not.toThrow();',
      '    expect(() => componentWith({ scale: {} }).refreshScale()).not.toThrow();',
      '  });',
      '',
      "  it('el contenedor se sigue con watchHostSize y refreshScale reencaja con fitGameToHost, sin Scale.FIT', () => {",
      '    expect(source).toMatch(/this\\.detachHostWatch = watchHostSize\\(this\\.phaserGame, this\\.gameHost!\\.nativeElement\\);/);',
      '    expect(source).toMatch(/refreshScale\\(\\): void \\{\\s*const host = this\\.gameHost\\?\\.nativeElement;\\s*if \\(this\\.phaserGame && host\\) fitGameToHost\\(this\\.phaserGame, host\\);\\s*\\}/);',
      '    expect(source).not.toMatch(/scale\\??\\.refresh\\(\\)/);',
      "    expect(source).not.toContain('Phaser.Scale.FIT');",
      '  });',
      '',
    ].join('\n'),
  },
  // El observador del contenedor vive en pixel-canvas: su prueba también (reencaja, y deja de observar al soltarlo).
  {
    file: CANVAS_SPEC,
    find: "import { fitGameToHost, pixelScaleConfig } from './pixel-canvas';",
    replace: "import { fitGameToHost, pixelScaleConfig, watchHostSize } from './pixel-canvas';",
  },
  {
    file: CANVAS_SPEC,
    find: '  afterEach(() => setDpr(1));\n',
    replace: '  afterEach(() => {\n    setDpr(1);\n    vi.unstubAllGlobals();\n  });\n',
  },
  {
    file: CANVAS_SPEC,
    find: "    expect(scale.setZoom).toHaveBeenLastCalledWith(0.5);\n  });\n});\n",
    replace: [
      '    expect(scale.setZoom).toHaveBeenLastCalledWith(0.5);',
      '  });',
      '',
      "  it('watchHostSize reencaja al cambiar el contenedor o la ventana y deja de observar al soltarlo', () => {",
      '    setDpr(1);',
      '    const refits: Array<() => void> = [];',
      '    const observeSpy = vi.fn();',
      '    const disconnectSpy = vi.fn();',
      "    vi.stubGlobal('ResizeObserver', class {",
      '      observe = observeSpy;',
      '      disconnect = disconnectSpy;',
      '      constructor(callback: () => void) { refits.push(callback); }',
      '    });',
      '    const size = { width: 800, height: 450 };',
      '    const el = { getBoundingClientRect: () => size } as unknown as HTMLElement;',
      '    const { game, scale } = fakeGame(800, 450, 1);',
      '',
      '    const stop = watchHostSize(game, el);',
      '    expect(observeSpy).toHaveBeenCalledWith(el);',
      '',
      '    size.width = 1000; // se abre o se cierra un panel: cambia el contenedor',
      '    refits[0]();',
      '    expect(scale.resize).toHaveBeenLastCalledWith(1000, 450);',
      '',
      '    size.height = 500; // cambia la ventana o el zoom del navegador',
      "    window.dispatchEvent(new Event('resize'));",
      '    expect(scale.resize).toHaveBeenLastCalledWith(1000, 500);',
      '',
      '    stop();',
      '    expect(disconnectSpy).toHaveBeenCalledTimes(1);',
      '    size.width = 1200;',
      "    window.dispatchEvent(new Event('resize'));",
      '    expect(scale.resize).toHaveBeenCalledTimes(2); // soltado: ya no reencaja',
      '  });',
      '});',
      '',
    ].join('\n'),
  },
];
```

**Archivo `edits/t6-codigo.cjs`**

```js
// Tarea 6 (código): `refreshScale()` (lo llama simulation-play al abrir o cerrar un panel) vuelve a medir el contenedor
// y reencaja el lienzo sin esperar al observador. Rutas relativas a frontend/.
const WORLD = 'src/app/features/simulator/game-world.component.ts';

module.exports = [
  { file: WORLD, find: "import { pixelScaleConfig, watchHostSize } from './pixel-canvas';", replace: "import { fitGameToHost, pixelScaleConfig, watchHostSize } from './pixel-canvas';" },
  {
    file: WORLD,
    find: [
      '  refreshScale(): void {',
      '    const scale = this.phaserGame?.scale;',
      '    if (!scale) return;',
      '    scale.getParentBounds();',
      '    scale.refresh();',
      '  }',
    ].join('\n'),
    replace: [
      '  refreshScale(): void {',
      '    const host = this.gameHost?.nativeElement;',
      '    if (this.phaserGame && host) fitGameToHost(this.phaserGame, host);',
      '  }',
    ].join('\n'),
  },
];
```

---

### Task 7: Lo de otras etapas vuelve a atenuarse (T9.9 / WAY-03), también las personas del kit

**Files:**
- Modify: `frontend/src/app/features/simulator/world-characters.util.spec.ts`, `world-characters.util.ts`, `game-world.component.ts`, `game-world.kit.contract.spec.ts`, `game-world.orientation.contract.spec.ts`
- Create (fuera del repo, ya instalados): `$I/edits/t7-pruebas.cjs`, `$I/edits/t7-codigo.cjs`

**Interfaces:**
- Consumes: `dimmedKeys: ReadonlySet<string>` (master, input del componente) y `markerEmphasis` de la rama.
- Produces: `export const DIMMED_ALPHA = 0.55` y `markerEmphasis(state: { selected; near; kitSprite; pixelSprite; dimmed?: boolean }): { scale; alpha }` con: cerca o seleccionado → alfa 1; si no, de otra etapa → `DIMMED_ALPHA`; si no, 0,88 (1 para una persona del kit); el kit y los sprites de pixel art nunca se escalan.

**Qué había en master y qué eligió la rama.** Master (T9.9, WAY-03: «los objetos de decisión de otras etapas siguen activos con opciones viejas») atenúa lo de otras etapas con `m.setAlpha(sel || near ? 1 : this.dimmedKeys.has(key) ? DIMMED_ALPHA : .88)`. La rama sacó el énfasis a `markerEmphasis` y dijo que una persona del kit «nunca se escala ni se atenúa» (spec §8.2: sin tintes ni escalas por preset). La resolución del bloque 9 de la tarea 2 se quedó con la rama y **no conoce `dimmedKeys`**: la prueba de master «un objeto atenuado baja a alfa .55» lo delata (recibe 0,88). R1: el spec prohíbe tintes y escalas, no el alfa; una persona de otra etapa debe verse atenuada igual que una herramienta de otra etapa, pero el marcador de reposo de una persona del kit sigue sin velarse con el 0,88.

- [ ] **Step 1: Mira fallar la prueba de master (RED previo)**

Run (en `$WT/frontend`): `npx ng test --watch=false --include src/app/features/simulator/game-world.interaction.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|AssertionError|Test Files|Tests " | cut -c1-230`
Expected: `AssertionError: expected 0.88 to be 0.55`, `Tests  1 failed | 27 passed (28)` («un objeto atenuado baja a alfa .55, sin anillo, y su rótulo solo aparece muy cerca»).

- [ ] **Step 2: Escribe las pruebas de `markerEmphasis` y ajusta los contratos de código**

`t7-pruebas.cjs`: dos pruebas en `world-characters.util.spec.ts` (un marcador de otra etapa baja a `DIMMED_ALPHA` salvo cerca o seleccionado; la persona del kit de otra etapa también, pero nunca se escala), el contrato `game-world.kit.contract.spec.ts` (el componente pasa `dimmed: this.dimmedKeys.has(key)`) y el de orientación (el valor vive en `world-characters.util.ts`, el componente no lo repite).

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t7-pruebas.cjs"
npx ng test --watch=false --include src/app/features/simulator/world-characters.util.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "ERROR" | cut -c1-200 | sort | uniq -c
```
Expected: cuatro `editado …`; RED de compilación: `TS2305: Module '"./world-characters.util"' has no exported member 'DIMMED_ALPHA'` y `TS2353: Object literal may only specify known properties, and 'dimmed' does not exist in type …` (varias veces). Es un RED legítimo: la API no existe.

- [ ] **Step 3: `markerEmphasis` y el componente (GREEN)**

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t7-codigo.cjs"
npx ng test --watch=false --include src/app/features/simulator/world-characters.util.spec.ts --include src/app/features/simulator/game-world.kit.contract.spec.ts --include src/app/features/simulator/game-world.orientation.contract.spec.ts --include src/app/features/simulator/game-world.interaction.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|ERROR|Test Files|Tests "
```
Expected: tres `editado …` (`world-characters.util.ts`, `game-world.component.ts` ×2); `Test Files  4 passed (4)`, `Tests  71 passed (71)`, incluida la prueba de master «un objeto atenuado baja a alfa .55».

- [ ] **Step 4: Commit**

```bash
g() { git -c core.autocrlf=false "$@"; }
g add -u frontend && g commit -q -F - <<'EOF'
fix(integracion-master): lo de otras etapas vuelve a atenuarse (T9.9 / WAY-03) también en las personas del kit

La resolución del marcador se quedó con el énfasis de la rama, que no conocía `dimmedKeys`: las
decisiones de otras etapas dejaron de verse atenuadas (falló la prueba de master «un objeto atenuado
baja a alfa .55»). `markerEmphasis` recibe `dimmed` y `DIMMED_ALPHA` vive en world-characters.util.
La persona del kit sigue sin escalarse ni velarse con el 0,88 de reposo (spec §8.2), pero la de otra
etapa se atenúa como cualquier marcador: es lo que pide el informe de jugabilidad.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
g log -1 --format='%h %s'
```

**Archivo `edits/t7-pruebas.cjs`**

```js
// Tarea 7 (pruebas primero): el atenuado de las decisiones de otras etapas (master, T9.9 / WAY-03) y el énfasis de los
// marcadores de la rama (spec §8.2). Rutas relativas a frontend/.
const SIM = 'src/app/features/simulator';
const UTIL_SPEC = `${SIM}/world-characters.util.spec.ts`;
const KIT_CONTRACT = `${SIM}/game-world.kit.contract.spec.ts`;
const ORIENTATION_SPEC = `${SIM}/game-world.orientation.contract.spec.ts`;

module.exports = [
  {
    file: UTIL_SPEC,
    find: '  KIT_BODY_HEIGHT,\n',
    replace: '  DIMMED_ALPHA,\n  KIT_BODY_HEIGHT,\n',
  },
  {
    file: UTIL_SPEC,
    find: [
      '        expect(markerEmphasis({ selected, near, kitSprite: true, pixelSprite: false })).toEqual({ scale: 1, alpha: 1 });',
      '      }',
      '    }',
      '  });',
      '});',
      '',
    ].join('\n'),
    replace: [
      '        expect(markerEmphasis({ selected, near, kitSprite: true, pixelSprite: false })).toEqual({ scale: 1, alpha: 1 });',
      '      }',
      '    }',
      '  });',
      '',
      "  it('un marcador de otra etapa (T9.9, F§7.2) se atenúa a DIMMED_ALPHA salvo cerca o seleccionado', () => {",
      '    expect(DIMMED_ALPHA).toBe(0.55);',
      '    expect(markerEmphasis({ selected: false, near: false, dimmed: true, ...vector }).alpha).toBe(DIMMED_ALPHA);',
      '    expect(markerEmphasis({ selected: false, near: true, dimmed: true, ...vector }).alpha).toBe(1);',
      '    expect(markerEmphasis({ selected: true, near: false, dimmed: true, ...vector }).alpha).toBe(1);',
      '    expect(markerEmphasis({ selected: false, near: false, dimmed: false, ...vector }).alpha).toBe(0.88);',
      '  });',
      '',
      "  it('la persona del kit de otra etapa se atenúa igual (WAY-03) pero nunca se escala', () => {",
      '    const person = { kitSprite: true, pixelSprite: false };',
      '    expect(markerEmphasis({ selected: false, near: false, dimmed: true, ...person })).toEqual({ scale: 1, alpha: DIMMED_ALPHA });',
      '    expect(markerEmphasis({ selected: false, near: true, dimmed: true, ...person })).toEqual({ scale: 1, alpha: 1 });',
      '    expect(markerEmphasis({ selected: true, near: true, dimmed: true, ...person })).toEqual({ scale: 1, alpha: 1 });',
      '  });',
      '});',
      '',
    ].join('\n'),
  },
  // El componente pasa `dimmed` al énfasis (contrato de código fuente de la rama, ampliado).
  {
    file: KIT_CONTRACT,
    find: "    expect(refresh).toContain(\"markerEmphasis({ selected: sel, near, kitSprite: bag['__kitSprite'] === true, pixelSprite: bag['__pixelSprite'] === true })\");",
    replace: [
      '    expect(refresh).toContain("markerEmphasis({");',
      "    expect(refresh).toContain(\"kitSprite: bag['__kitSprite'] === true, pixelSprite: bag['__pixelSprite'] === true\");",
      "    expect(refresh).toContain('dimmed: this.dimmedKeys.has(key)');",
    ].join('\n'),
  },
  // El valor del atenuado vive en world-characters.util (markerEmphasis): el componente ya no lo repite.
  {
    file: ORIENTATION_SPEC,
    find: "    expect(source).toContain('const DIMMED_ALPHA = 0.55;');",
    replace: [
      '    // El atenuado de las otras etapas vive en markerEmphasis (world-characters.util): el componente no repite el valor.',
      "    expect(readFileSync(join(__dirname, 'world-characters.util.ts'), 'utf-8')).toContain('export const DIMMED_ALPHA = 0.55;');",
      "    expect(source).not.toContain('const DIMMED_ALPHA');",
    ].join('\n'),
  },
];
```

**Archivo `edits/t7-codigo.cjs`**

```js
// Tarea 7 (código): `markerEmphasis` atenúa lo de otras etapas; el componente le pasa `dimmedKeys`. Rutas relativas a frontend/.
const WORLD = 'src/app/features/simulator/game-world.component.ts';
const CHARS = 'src/app/features/simulator/world-characters.util.ts';

module.exports = [
  {
    file: CHARS,
    start: '/**\n * Énfasis de un marcador según la cercanía y la selección.',
    end: '  return { scale, alpha: state.selected || state.near ? 1 : 0.88 };\n}\n',
    replace: [
      '/** Alfa de un marcador de otra etapa del proceso (T9.9 de master, F§7.2): se ve, pero no es lo que toca ahora. */',
      'export const DIMMED_ALPHA = 0.55;',
      '',
      '/**',
      ' * Énfasis de un marcador según la cercanía, la selección y si es de otra etapa. Una persona dibujada con el',
      ' * kit nunca se escala (spec §8.2: sprites a escala 1, nada los deforma) ni se vela con el 0,88 de reposo; su',
      ' * señal es el nombre y el anillo. Los marcadores con otro sprite de pixel art tampoco se escalan. Lo de otra',
      ' * etapa se atenúa a `DIMMED_ALPHA`, también las personas (WAY-03), salvo cerca o seleccionado.',
      ' */',
      'export function markerEmphasis(',
      '  state: { selected: boolean; near: boolean; kitSprite: boolean; pixelSprite: boolean; dimmed?: boolean },',
      '): { scale: number; alpha: number } {',
      '  const lit = state.selected || state.near;',
      '  const alpha = lit ? 1 : state.dimmed ? DIMMED_ALPHA : state.kitSprite ? 1 : 0.88;',
      '  if (state.kitSprite) return { scale: 1, alpha };',
      '  // Un marcador con sprite de pixel art (puerta, herramienta, objeto) se aclara pero no se escala:',
      '  // a ×1,08 sus píxeles saldrían desiguales (spec §1.1.2).',
      '  const scale = state.pixelSprite ? 1 : state.selected ? 1.12 : state.near ? 1.08 : 1;',
      '  return { scale, alpha };',
      '}',
      '',
    ].join('\n'),
  },
  {
    file: WORLD,
    find: '/** Transparencia de los objetos de decisión de otras etapas (F§7.2): se ven, pero no llaman la atención. */\nconst DIMMED_ALPHA = 0.55;\n',
    replace: '',
  },
  {
    file: WORLD,
    find: "      const emphasis = markerEmphasis({ selected: sel, near, kitSprite: bag['__kitSprite'] === true, pixelSprite: bag['__pixelSprite'] === true });",
    replace: [
      '      const emphasis = markerEmphasis({',
      "        selected: sel, near, kitSprite: bag['__kitSprite'] === true, pixelSprite: bag['__pixelSprite'] === true,",
      '        dimmed: this.dimmedKeys.has(key),',
      '      });',
    ].join('\n'),
  },
];
```

---

### Task 8: La pista de teclado del lobby es DOM y sale de `lobbyKeyboardHint`

**Files:**
- Modify: `frontend/src/app/features/simulator/game-menu.component.spec.ts`, `game-menu.component.ts`
- Create (fuera del repo, ya instalados): `$I/edits/t8-pruebas.cjs`, `$I/edits/t8-codigo.cjs`

**Interfaces:**
- Consumes: `lobbyKeyboardHint(coarsePointer: boolean): string | null` (master, ya en `game-menu.component.ts`) y `coarsePointer = signal(matchesMedia(COARSE_POINTER_QUERY))`.
- Produces: `GameMenuComponent.keyboardHint = computed(() => lobbyKeyboardHint(this.coarsePointer()))` y la plantilla `@if (keyboardHint(); as hint) { <p class="lobby-help" aria-hidden="true">{{ hint }}</p> }`.

**Qué había en master y qué eligió la rama.** Master (T7.4) pinta la pista con `this.add.text(12, 12, …).setScrollFactor(0)` de Phaser y **no la pinta con puntero grueso** (TOUCH-01: sin teclado, el recordatorio es ruido). Con el zoom entero de la cámara un texto de Phaser con `scrollFactor 0` se sale de la vista, así que la rama ya lo había pasado al DOM, con un texto fijo —también en táctil—. La resolución del bloque 2 de `game-menu.component.ts` se quedó con la pista de la rama y perdió la regla del puntero grueso.

- [ ] **Step 1: Mira fallar la prueba de master (RED previo)**

Run (en `$WT/frontend`): `npx ng test --watch=false --include src/app/features/simulator/game-menu.component.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|Test Files|Tests " | cut -c1-230`
Expected: `Tests  1 failed | 16 passed (17)`: «la escena de Phaser solo pinta ese texto si lobbyKeyboardHint lo devuelve».

- [ ] **Step 2: Reescribe la prueba al DOM y añade la que monta el lobby con ambos punteros**

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t8-pruebas.cjs"
npx ng test --watch=false --include src/app/features/simulator/game-menu.component.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|AssertionError|Test Files|Tests " | cut -c1-230
```
Expected: `editado …game-menu.component.spec.ts`; `Tests  2 failed | 16 passed (18)`: el contrato de código (`expected 'import { CommonModule }…' to match /readonly keyboardHint = computed…/`) y «con puntero fino el lobby pinta el recordatorio de teclado y con puntero grueso no pinta nada» (`expected '← → / A D mover · E entrar' to be null`: el texto fijo sale también en táctil).

- [ ] **Step 3: La pista sale de `lobbyKeyboardHint` (GREEN)**

Run (en `$WT/frontend`):
```bash
node "$I/tools/edits.cjs" "$I/edits/t8-codigo.cjs"
npx ng test --watch=false --include src/app/features/simulator/game-menu.component.spec.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ FAIL|Test Files|Tests "
```
Expected: dos `editado …game-menu.component.ts`; `Test Files  1 passed (1)`, `Tests  18 passed (18)`.

- [ ] **Step 4: Commit**

```bash
g() { git -c core.autocrlf=false "$@"; }
g add -u frontend && g commit -q -F - <<'EOF'
fix(integracion-master): la pista de teclado del lobby es DOM y sale de lobbyKeyboardHint

Master la pintaba con texto de Phaser y sin ella con puntero grueso (TOUCH-01); con el zoom entero de
la cámara un texto de Phaser con scrollFactor 0 se sale de la vista, así que la rama ya la tenía en
el DOM (estática). Ahora el DOM la toma de `lobbyKeyboardHint(coarsePointer)`: con puntero grueso no
hay pista de teclado. Las pruebas T7.4 de master se reescriben al DOM (RED primero) y se añade una que
monta el lobby con ambos punteros.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
g log -1 --format='%h %s'
```

**Archivo `edits/t8-pruebas.cjs`**

```js
// Tarea 8 (pruebas primero): la pista de teclado del lobby. Master la pintaba con texto de Phaser y sin ella con
// puntero grueso (TOUCH-01); la rama la pasó a DOM porque, con el zoom entero de la cámara, un texto de Phaser con
// scrollFactor 0 se sale de la vista. Rutas relativas a frontend/.
const MENU_SPEC = 'src/app/features/simulator/game-menu.component.spec.ts';

module.exports = [
  {
    file: MENU_SPEC,
    find: [
      "    it('la escena de Phaser solo pinta ese texto si lobbyKeyboardHint lo devuelve', () => {",
      "      expect(source).toMatch(/const keyboardHint = lobbyKeyboardHint\\(matchesMedia\\(COARSE_POINTER_QUERY\\)\\);\\s*if \\(keyboardHint\\) \\{/);",
      "      expect(source).not.toMatch(/add\\.text\\(12, 12, '← →/);",
      '    });',
    ].join('\n'),
    replace: [
      "    it('la pista del lobby es DOM (no texto de Phaser) y solo sale si lobbyKeyboardHint la devuelve', () => {",
      "      expect(source).toMatch(/readonly keyboardHint = computed\\(\\(\\) => lobbyKeyboardHint\\(this\\.coarsePointer\\(\\)\\)\\);/);",
      "      expect(source).toContain('@if (keyboardHint(); as hint) { <p class=\"lobby-help\" aria-hidden=\"true\">{{ hint }}</p> }');",
      "      expect(source).not.toMatch(/add\\.text\\(12, 12, '← →/);",
      '    });',
      '',
      "    it('con puntero fino el lobby pinta el recordatorio de teclado y con puntero grueso no pinta nada', () => {",
      '      for (const [coarse, expected] of [[true, null], [false, lobbyKeyboardHint(false)]] as const) {',
      '        const { fixture, root } = mount(coarse);',
      '        fixture.detectChanges();',
      "        expect(root.querySelector('.lobby-help')?.textContent?.trim() ?? null).toBe(expected);",
      '        TestBed.resetTestingModule();',
      '      }',
      '    });',
    ].join('\n'),
  },
];
```

**Archivo `edits/t8-codigo.cjs`**

```js
// Tarea 8 (código): la pista de teclado del lobby (DOM) sale de `lobbyKeyboardHint` de master. Rutas relativas a frontend/.
const MENU = 'src/app/features/simulator/game-menu.component.ts';

module.exports = [
  {
    file: MENU,
    find: '      <p class="lobby-help" aria-hidden="true">← → / A D  mover · E entrar</p>',
    replace: '      @if (keyboardHint(); as hint) { <p class="lobby-help" aria-hidden="true">{{ hint }}</p> }',
  },
  {
    file: MENU,
    find: '  readonly coarsePointer = signal(matchesMedia(COARSE_POINTER_QUERY));\n',
    replace: '  readonly coarsePointer = signal(matchesMedia(COARSE_POINTER_QUERY));\n  readonly keyboardHint = computed(() => lobbyKeyboardHint(this.coarsePointer()));\n',
  },
];
```

---

### Task 9: Verificación completa en el árbol LF

**Files:** ninguno (solo se ejecuta y se anota en el ledger).

**Interfaces:**
- Consumes: la rama tras la tarea 8.
- Produces: la evidencia de que cada comando del CI de `frontend`, `scripts` y `backend` pasa sobre el árbol integrado, con los números que ya se midieron en la fusión de prueba.

**Por qué en un árbol LF.** Con `core.autocrlf=true` el árbol de trabajo de Windows queda en CRLF y unas 12 pruebas de contrato de master (las que buscan texto multilínea en el código fuente) fallan solo localmente. El worktree de la tarea 1 se creó en LF; si alguna vez ves esas pruebas rojas aquí, comprueba `git ls-files --eol` antes de culpar a la integración.

- [ ] **Step 1: La suite unitaria completa**

Run (en `$WT/frontend`): `npx ng test --watch=false 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ *(Test Files|Tests) |^ FAIL"`
Expected: `Test Files  163 passed (163)` y `Tests  1927 passed (1927)`, sin `FAIL`. Cualquier rojo se diagnostica (superpowers:systematic-debugging) y se arregla con prueba primero; no se anota como «flaky» sin repetir.

- [ ] **Step 2: Kit, arte del mundo, manifiesto visual y scripts**

Run (en `$WT`):
```bash
for s in test:kit kit:check test:visual-assets test:world-art; do echo "== $s"; npm run $s --prefix frontend 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ℹ (tests|pass|fail)|kit:check:"; done
echo "== test:scripts"; npm run test:scripts 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ℹ (tests|pass|fail)"
```
Expected: `test:kit` 65 pruebas, 65 pasan; `kit:check: 0 errores`; `test:visual-assets` 39/39; `test:world-art` 20/20; `test:scripts` 82/82. Ninguna con `fail` distinto de 0.

- [ ] **Step 3: Build de producción**

Run (en `$WT`): `npm run build:frontend > /tmp/build-t9.txt 2>&1; echo "exit=$?"; sed 's/\x1b\[[0-9;]*m//g' /tmp/build-t9.txt | grep -E "Initial total|bundle generation|ERROR|WARNING"`
Expected: `exit=0`, `Initial total | 487.27 kB`, `Application bundle generation complete`, sin `ERROR` ni `WARNING`.

- [ ] **Step 4: Las auditorías que ninguna prueba hace**

Run (en `$WT/frontend`):
```bash
echo "jest. fuera de comentarios:"; grep -rn "jest\." src --include=*.ts | grep -vE ":\s*[0-9]+:\s*//" | wc -l
echo "Scale.FIT / refresh() de Scale en el componente:"; grep -nE "Scale\.FIT|scale\??\.refresh\(\)|getParentBounds" src/app/features/simulator/game-world.component.ts | wc -l
echo "componentes sin changeDetection:"; grep -rL "changeDetection" src --include=*.component.ts | wc -l
echo "componentes / Eager / OnPush:"; find src -name '*.component.ts' | wc -l; grep -rl 'ChangeDetectionStrategy.Eager' src --include=*.component.ts | wc -l; grep -rl 'ChangeDetectionStrategy.OnPush' src --include=*.component.ts | wc -l
echo "marcas de conflicto:"; grep -rln -E "^(<<<<<<<|>>>>>>>)" src scripts character-kit package.json | wc -l
echo "módulos borrados por la rama que algo aún importe (los specs de contrato los nombran en negativo):"; grep -rln -E "avatar-figure.component|actor-render-plan|avatar-render-plan|baked-cast.util|v1-avatar.util|phaser-avatar-renderer|character-motion.util" src --include=*.ts --exclude=*.spec.ts | wc -l
```
Expected, en este orden: `0`, `0`, `0`, `35` / `31` / `4`, `0`, `0`.

- [ ] **Step 5: El backend (es el de master: la rama no lo toca)**

Docker Desktop encendido. El venv del checkout principal ya quedó enlazado en la tarea 4; si falta, vuelve a crear la unión con el comando de ese paso. Run (en `$WT`):
```bash
npm run check:backend 2>&1 | tail -3
SIEP_TEST_DB_PORT=5563 MSYS_NO_PATHCONV=1 npm run test:backend 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -6
```
Expected: `System check identified no issues (0 silenced).` y `307 passed` (≈ 45 s). Sin la tarea 4 serían 306 y 1 roja (`test_clinical_emotion_authority_…`, `FileNotFoundError` por el JSON que la rama borró).

- [ ] **Step 6: Anota y deja el árbol limpio**

Run (en `$WT`): `git -c core.autocrlf=false status --short | head` → Expected: sin salida. Anota en el ledger `Task 9: complete (…)` con cada número de los pasos 1–5.

---

### Task 10: Verificación en el navegador y PARADA para que el usuario vea el juego

**Files:**
- Create (fuera de git): `frontend/.capturas-integ/integracion.config.ts` y `integracion.e2e.ts` (ya instalados en `$I/capturas/`; se copian a esa carpeta, que se excluye de git).
- No se toca `frontend/e2e/**` (spec §8.4). Si un e2e de master falla por la integración, **para y pregunta**.

**Interfaces:**
- Consumes: el e2e de master (`npm run test:e2e`), sus ayudantes (`enterWorld`, `openFamilyDialogue`, `loginStudent` de `e2e/support/siep-flow.ts`) y la rama tras la tarea 9.
- Produces: seis capturas (lobby, primera sala y diálogo, en escritorio 1366×768 y táctil horizontal 844×390) y la medida real del retrato del diálogo y del lienzo en el navegador; la respuesta del usuario a la PARADA.

**Cuándo los tests unitarios no alcanzan.** El CSS de un retrato, el reencaje del lienzo y la colocación de los controles táctiles solo existen de verdad con un Chromium con WebGL. Esta tarea mide en el navegador lo que las tareas 5, 6 y 8 fijaron por contrato de código y deja que el usuario vea el resultado.

- [ ] **Step 1: El e2e que corre el CI**

Docker Desktop encendido. Run (en `$WT`):
```bash
SIEP_TEST_DB_PORT=5562 E2E_CHROMIUM_PATH="C:/Users/Predator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe" MSYS_NO_PATHCONV=1 \
  npm run test:e2e -- --grep-invert "@full-case|@orientation" --reporter=list 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^\s+[0-9]+ (passed|failed|flaky|skipped)"
```
Expected: `20 passed (≈1.4m)`. (La unión de `backend_django/.venv` de la tarea 9 es necesaria; sin ella, `No existe backend_django/.venv`.)

- [ ] **Step 2: Los recorridos de orientación y el caso completo, con GPU**

El Chromium sin cabeza dibuja WebGL por software (~21 fps con zoom ×2 a 1920×945) y los ayudantes del e2e, pensados para ≥ 30 fps, fallan de forma intermitente: con GPU corren a ~136 fps. Run (en `$WT`):
```bash
SIEP_TEST_DB_PORT=5562 E2E_CHROMIUM_PATH="C:/Users/Predator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe" \
  E2E_CHROMIUM_ARGS="--ignore-gpu-blocklist --enable-gpu-rasterization --use-angle=d3d11 --enable-zero-copy" MSYS_NO_PATHCONV=1 \
  npm run test:e2e -- --grep "@full-case|@orientation" --reporter=list 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^\s+[0-9]+ (passed|failed|flaky|skipped)"
```
Expected: `1 skipped` y `13 passed (≈8m)`: los cuatro `@full-case` (1600, 1366, 390, 412) y nueve `@orientation`. La omitida es de master: `guided-first-minute.e2e.ts:117` hace `test.skip(viewport.inputMode === 'touch', …)` en el recorrido guiado de 844×390.

**Si algo falla**, la regla de la línea base honesta: repítelo una vez; si persiste, corre **el mismo comando** en el checkout principal (`D:/Sua_Files/IdeaProjects/psico_project_v3`, que está en `master` y comparte `node_modules` y venv) y compara. Solo es de la integración lo que pasa en master y falla aquí. Un fallo de este tipo (`No se alcanzó a la enfermera en 45 s`, `pauseWithPendingPosition`) con el Chromium sin GPU es la navegación lenta conocida, no un hallazgo.

- [ ] **Step 3: Las capturas y las medidas**

Run (en `$WT/frontend`):
```bash
echo "frontend/.capturas-integ/" >> "$(git -C "$WT" rev-parse --git-common-dir)/info/exclude"
mkdir -p .capturas-integ && cp "$I/capturas/integracion.config.ts" "$I/capturas/integracion.e2e.ts" .capturas-integ/
git -c core.autocrlf=false check-ignore .capturas-integ/integracion.e2e.ts
cd .. && CAPTURAS_OUT="$I/../capturas-integ" SIEP_TEST_DB_PORT=5562 \
  E2E_CHROMIUM_PATH="C:/Users/Predator/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe" \
  E2E_CHROMIUM_ARGS="--ignore-gpu-blocklist --enable-gpu-rasterization --use-angle=d3d11 --enable-zero-copy" MSYS_NO_PATHCONV=1 \
  node scripts/test-e2e.mjs --config=.capturas-integ/integracion.config.ts --reporter=list 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^\s+(ok|[0-9]+\))|passed|failed|\{\"vp\""
```
(La línea con `echo … >> …/info/exclude` es el único efecto fuera del worktree: una exclusión local, no versionada, que se quita en la tarea 11.)

Expected: `.capturas-integ/integracion.e2e.ts` impreso por `check-ignore`; `4 passed`; y en las líneas JSON, `"physical":true` en todos los lienzos y el retrato del diálogo medido en el navegador: **96×96** en `desktop-1366` y **64×64** en `touch-844x390`. La prueba además exige `.lobby-help` ×1 en escritorio y ×0 en táctil. Si el retrato sale de otra medida, el contrato de CSS de la tarea 5 no basta: diagnostícalo.

- [ ] **Step 4: Mira las seis imágenes tú primero**

Abre con la herramienta de lectura de imágenes `$I/../capturas-integ/{lobby,sala,dialogo}-{desktop-1366,touch-844x390}.png` y revisa, una por una, lo que ninguna prueba juzga:

| Imagen | Qué debe verse |
|---|---|
| `lobby-desktop-1366` | Personaje del kit de frente, sin estirar; la pista `← → / A D mover · E entrar` arriba a la izquierda; «Entrar al caso (E)» |
| `lobby-touch-844x390` | Lo mismo sin pista de teclado y con «Entrar al caso» |
| `sala-*` | Personas del kit nítidas y a su tamaño (no borrosas, no a fracciones), los nombres («Familia en crisis», «Kit PAP») legibles y dentro del lienzo, la puerta con su aviso, «Salida segura» a la vista |
| `sala-touch-844x390` | Cruceta y «Acércate a algo» sobre el lienzo completo (ya no hay bandas negras 16:9): que no tapen al jugador ni la puerta al arrancar |
| `dialogo-desktop-1366` | Retrato de la Abuela a 96 px, **sin sonrisa**, junto al panel de «Qué hacer» y la «Salida segura» |
| `dialogo-touch-844x390` | Retrato a 64 px **sin aplastar**; «Volver al mapa», «Salida segura» y «Saltar» a la vista sin desplazarse |

Anota en el ledger lo que veas, también lo que no te guste, con un `Ruling:` si decides algo.

- [ ] **Step 5: PARADA — que el usuario lo vea y lo apruebe**

Envía las seis imágenes con `SendUserFile` (`display: render`) y pregunta con `AskUserQuestion`: «¿Apruebas lo que se ve de la integración?» con las opciones «Aprobar (Recomendado)» y «Quiero cambiar algo», y la lista de arriba en el cuerpo de la pregunta. Dile también, en una línea, qué decisiones visuales encierra este plan: las personas de otras etapas se ven atenuadas (R1) y el retrato compacto mide 64 px (R2). **No sigas a la tarea 11 sin su respuesta.** Si pide un cambio de aspecto, es una tarea nueva con su prueba primero (R1 y R2 son una línea de código cada una); si pide revertir una decisión, anótala como `Ruling:`.


**Archivo `capturas/integracion.config.ts`**

```ts
import { join, resolve } from 'node:path';

import base from '../playwright.config';

/**
 * Capturas de la integración: lobby, primera sala y diálogo con retrato, en escritorio y en táctil horizontal.
 * No se versiona: la carpeta está excluida en .git/info/exclude. Chromium con GPU: variables E2E_CHROMIUM_PATH y
 * E2E_CHROMIUM_ARGS (la config base ya las lee).
 */
export default {
  ...base,
  testDir: __dirname,
  testMatch: 'integracion.e2e.ts',
  outputDir: join(process.env['CAPTURAS_OUT'] ?? resolve(__dirname, 'salida'), 'playwright-integracion'),
};
```

**Archivo `capturas/integracion.e2e.ts`**

```ts
import { resolve } from 'node:path';

import { Page, expect, test } from '@playwright/test';

import { enterWorld, loginStudent, openFamilyDialogue } from '../e2e/support/siep-flow';

const OUT = process.env['CAPTURAS_OUT'] ?? resolve(__dirname, 'salida');

/** `portrait`: lado esperado del retrato del diálogo (96 = ×3 en escritorio; 64 = ×2 con la altura limitada). */
const VIEWPORTS = [
  { name: 'desktop-1366', width: 1366, height: 768, touch: false, portrait: 96 },
  { name: 'touch-844x390', width: 844, height: 390, touch: true, portrait: 64 },
] as const;

/** Lienzo en píxeles físicos: su tamaño interno = su tamaño CSS × dpr (±1 px de redondeo). */
async function canvasCheck(page: Page, selector: string) {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    return {
      width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height, dpr,
      physical: Math.abs(canvas.width - Math.round(rect.width * dpr)) <= 1 && Math.abs(canvas.height - Math.round(rect.height * dpr)) <= 1,
    };
  });
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch });

    test('lobby', async ({ page }) => {
      await loginStudent(page);
      await page.goto('/portal/jugar');
      await expect(page.locator('app-game-menu canvas')).toBeVisible();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/lobby-${vp.name}.png` });
      const lobby = await canvasCheck(page, 'app-game-menu canvas');
      console.log(JSON.stringify({ vp: vp.name, lobby }));
      expect(lobby.physical).toBe(true);
      // Pista de teclado del lobby (TOUCH-01): con puntero fino sí, con táctil no.
      await expect(page.locator('.lobby-help')).toHaveCount(vp.touch ? 0 : 1);
    });

    test('primera sala y diálogo con retrato', async ({ page }) => {
      test.setTimeout(240_000);
      await enterWorld(page);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/sala-${vp.name}.png` });
      const world = await canvasCheck(page, 'app-game-world canvas');
      expect(world.physical).toBe(true);

      const dialogue = await openFamilyDialogue(page, vp.touch);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/dialogo-${vp.name}.png` });
      const portrait = await dialogue.locator('.portrait-img').boundingBox();
      console.log(JSON.stringify({ vp: vp.name, world, portrait }));
      expect(Math.round(portrait?.width ?? 0)).toBe(vp.portrait);
      expect(Math.round(portrait?.height ?? 0)).toBe(vp.portrait);
    });
  });
}
```

---

### Task 11: Revisión final, un pase de arreglos y cierre

**Files:** los que pida la revisión (con prueba primero); si nada, ninguno. Se borran las herramientas y los worktrees **propios** de esta ejecución.

**Interfaces:**
- Consumes: la rama tras la tarea 10 (con la PARADA aprobada).
- Produces: el informe final para el usuario, con «Rulings I made» y «Deferred minors», y el menú de cierre de superpowers:finishing-a-development-branch. **No** empuja, **no** fusiona, **no** abre PR.

- [ ] **Step 1: El paquete de revisión**

La revisión es de lo que esta integración **decidió**, no de los 220 archivos de master: (a) la resolución de los conflictos y (b) los seis commits de reconciliación. `git show --remerge-diff` enseña solo lo que la resolución cambió respecto a la fusión automática.

Run (en `$WT`; `REV` = una carpeta del workspace del ledger):
```bash
g() { git -c core.autocrlf=false "$@"; }
MERGE=$(g log --merges --format=%h -1)
g show --remerge-diff $MERGE > "$REV/resolucion.diff"
g diff $MERGE..HEAD > "$REV/reconciliacion.diff"
g diff --stat $MERGE..HEAD | tail -1
wc -l "$REV/resolucion.diff" "$REV/reconciliacion.diff"
```
Expected: `resolucion.diff` de unas 900 líneas (11 archivos: 21 inserciones y 513 borrados) y `reconciliacion.diff`: 6 commits, 27 archivos, 264 inserciones y 209 borrados (los specs, las fuentes tocadas, el catálogo del kit regenerado y la prueba del backend). Añade al paquete la tabla de la auditoría de la tarea 2 y las líneas `Ruling:` del ledger.

- [ ] **Step 2: Despacha un revisor de contexto limpio, en el modelo más capaz**

Con el agente `general-purpose` y `model: opus`. Entrégale: el paquete, las rutas de este plan y del spec, la sección **Review Focus** de este plan pegada tal cual, y la pregunta concreta de cada línea: «¿hay una prueba que falle si esto se rompe?». Pídele además, expresamente: (1) que busque en `resolucion.diff` líneas que un lado añadió y el resultado perdió que la tabla de la tarea 2 no explique; (2) que revise que ninguna prueba reescrita (tareas 4–8) quedó «verde por vacío» —que cada una fallaba antes del cambio de código—; (3) que mire, en los tres CSS compactos que no tienen prueba, si algo se solapa a 844×390; (4) que no proponga fusionar ni empujar.

- [ ] **Step 3: Re-gradúa y un solo pase de arreglos**

Sigue «Final Review» de superpowers:executing-plans: lo Crítico e Importante entra en **un** pase de arreglos, cada uno con su prueba escrita antes (RED→GREEN) y la suite completa en verde al terminar (tarea 9, pasos 1–3). Lo Menor va al ledger como `Final: minor (deferred): …` y a «Deferred minors». Un hallazgo que decidas no arreglar es un `Final: Ruling:` con su coste.

- [ ] **Step 4: Limpia lo propio**

Borra la carpeta `$I`, la de capturas (`$I/../capturas-integ`) y `frontend/.capturas-integ/` (y su línea en `.git/info/exclude`). Quita también la unión `backend_django/.venv` de `$WT` (`(Get-Item <ruta>).Delete()`): así nadie que borre el worktree más adelante arrastra el venv del checkout principal; si hace falta volver a correr el e2e, se recrea con el comando de la tarea 9. **Mira antes de borrar** cualquier worktree: solo los que creó esta ejecución y solo si el árbol no tiene nada sin guardar. Un `.venv` enlazado con una unión (`junction`) se quita **primero** con `(Get-Item <ruta>).Delete()` en PowerShell, nunca con `rm -rf` ni `git worktree remove --force`, que seguirían el enlace y borrarían el venv del checkout principal. El worktree `$WT` y la rama `integracion/personajes-unificados-master` se **quedan**: de ahí saldrá el PR cuando el usuario lo pida.

- [ ] **Step 5: El informe y el menú de cierre**

El informe final lleva, en este orden: qué se hizo (una frase por tarea), la evidencia (los números de las tareas 9 y 10), **Rulings I made** (todas las líneas `Ruling:` del ledger, con lo que cuestan si están mal), **Deferred minors**, lo que hay en master y no es de esta integración (`ng test` roto por `journal-panel`, `npm audit` por `source-map-js`), y una frase explícita: «no se empujó ni se fusionó nada». Termina con superpowers:finishing-a-development-branch: presenta **exactamente** las tres opciones (fusionar a `master` en local / empujar y abrir PR / dejar la rama como está) y espera la respuesta; la integración es decisión del usuario.

- [ ] **Step 6: Memoria del proyecto**

Actualiza `siep-personajes-unificados.md` y el índice `MEMORY.md` de la memoria del proyecto: plan 4 ejecutado, rama, SHA de la punta, qué decisiones quedan abiertas.

---

## Fuera del alcance (y por qué)

- **`npm audit` por `source-map-js`** (GHSA-68fv-2mgg-jv7q, severidad alta): está en el `package-lock.json` de master, que esta integración deja idéntico. Arreglarlo es un `npm audit fix` en master.
- **`chore/gitattributes-eol`** (el arreglo definitivo del CRLF): choca add/add con el `.gitattributes` de la rama (`kit/** -text`); resolver ese choque es otra decisión. El árbol LF de la tarea 1 cubre la verificación.
- **Decisión pendiente del plan 3** sobre `devicePixelRatio` en la introducción: ninguna tarea de este plan la toma.
- **Empujar, fusionar, abrir el PR:** el usuario.

## Mapa de cobertura (autorrevisión)

| Requisito | Dónde |
|---|---|
| Fusión sin tocar `master` ni la feat; árbol LF | Global Constraints, tareas 1–2 |
| 26 bloques + modify/delete resueltos de forma reproducible | Tarea 2 (`res-1…3`), comprobada con `--remerge-diff` |
| Nada perdido en silencio | Auditoría de la tarea 2 → prueba de la tarea 3 |
| Pruebas de master portadas, no borradas sin reemplazo | Tareas 3–8 (cada borrada tiene regla de producto en pruebas nuevas, R4) |
| Retratos: sin sonrisa en el duelo y alias | Tarea 4 (Review Focus 1) |
| Retrato lateral entero en escritorio y compacto | Tarea 5 (Review Focus 2), medido en la tarea 10 |
| Lienzo en píxeles físicos reencajado y observador soltado | Tarea 6 (Review Focus 3) |
| Atenuado de otras etapas + kit sin escalar | Tarea 7 (Review Focus 4) |
| Pista de teclado del lobby | Tarea 8 (Review Focus 5) |
| Suite completa, kit, arte, build, backend | Tarea 9 |
| Navegador: e2e del CI, `@orientation`, `@full-case`, capturas y PARADA | Tarea 10 |
| Revisión limpia, un pase de arreglos, sin push | Tarea 11 |
