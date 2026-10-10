#!/usr/bin/env node
// Herramienta de la limpieza del repositorio (NO forma parte del repo; vive en el scratchpad).
//
//   node limpieza.mjs plan                 → muestra el plan (sin tocar nada)
//   node limpieza.mjs delete <grupo>       → git rm de un grupo de borrado (sin commit)
//   node limpieza.mjs moves                → git mv de todos los movimientos (sin commit)
//   node limpieza.mjs rewrite              → reescribe enlaces/rutas y pone la nota (sin commit)
//   node limpieza.mjs check                → comprueba enlaces relativos de los .md del árbol actual
//   node limpieza.mjs check-base <sha>     → lo mismo sobre un commit (línea base)
//
// Se ejecuta con cwd = el worktree.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BASE_SHA = '9931599';
const git = (args, opts = {}) =>
  execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 29, ...opts });
const nfc = (s) => s.normalize('NFC');

// ───────────────────────── definición del plan ─────────────────────────
const trackedBase = git(['ls-tree', '-r', '-z', '--name-only', BASE_SHA]).split('\0').filter(Boolean).map(nfc);

const KEEP_PLANS = new Map([
  ['docs/superpowers/plans/2026-09-29-ui-mes-99-pendientes.md', 'docs/pendientes/deudas/2026-09-29-ui-mes-99-pendientes.md'],
  ['docs/superpowers/plans/2026-09-29-ui-semana-99-pendientes.md', 'docs/pendientes/deudas/2026-09-29-ui-semana-99-pendientes.md'],
  ['docs/superpowers/plans/2026-10-03-orientacion-jugabilidad-backlog.md', 'docs/pendientes/deudas/2026-10-03-orientacion-jugabilidad-backlog.md'],
  ['docs/superpowers/plans/e2e-full-case-pr.yml.draft', 'docs/pendientes/deudas/e2e-full-case-pr.yml.draft'],
]);

const KEEP_SPECS = new Map([
  ['docs/superpowers/specs/2026-07-10-consentimiento-contenido-sensible-design.md', 'docs/diseno/consentimiento-contenido-sensible.md'],
  ['docs/superpowers/specs/2026-10-02-personajes-unificados-design.md', 'docs/diseno/personajes-unificados.md'],
  ['docs/superpowers/specs/2026-10-03-orientacion-jugabilidad-diseno-final.md', 'docs/diseno/orientacion-jugabilidad.md'],
  ['docs/superpowers/specs/2026-07-09-arte-puertas-exit-design.md', 'docs/diseno/arte-puertas-exit.md'],
  ['docs/superpowers/specs/2026-10-03-bloque-c-dialogo-sintoma-propuesta.md', 'docs/pendientes/propuestas/bloque-c-dialogo-sintoma.md'],
  ['docs/superpowers/specs/2026-10-03-bloque-e-social-mapping-propuesta.md', 'docs/pendientes/propuestas/bloque-e-social-mapping.md'],
  ['docs/superpowers/specs/2026-10-03-bloque-f-verbal-tension-box-propuesta.md', 'docs/pendientes/propuestas/bloque-f-verbal-tension-box.md'],
  ['docs/superpowers/specs/2026-10-03-bloque-g-asistente-ia-propuesta.md', 'docs/pendientes/propuestas/bloque-g-asistente-ia.md'],
  ['docs/superpowers/specs/2026-10-03-bloque-j-escenario-hogar-consultorio-propuesta.md', 'docs/pendientes/propuestas/bloque-j-escenario-hogar-consultorio.md'],
  ['docs/superpowers/specs/2026-10-03-propuestas-c-e-f-base-comun.md', 'docs/pendientes/propuestas/propuestas-c-e-f-base-comun.md'],
  ['docs/superpowers/specs/2026-10-03-propuestas-c-e-f-resumen.md', 'docs/pendientes/propuestas/propuestas-c-e-f-resumen.md'],
]);

const HISTORICOS = new Set([
  'docs/PROMPT_MAESTRO_MVP_JUEGO.md',
  'docs/qa-api-siep.md',
  'docs/superpowers/2026-06-05-cleanup-tier3-roadmap.md',
]);

// Fuentes de requisitos que PLAN_MAESTRO_TOTAL e informes citan por nombre: se conservan, en docs/historico/.
const HISTORICO_MOVES = new Map([
  ['docs/PLAN_MAESTRO_EJECUCION_V3.md', 'docs/historico/PLAN_MAESTRO_EJECUCION_V3.md'],
  ['docs/PROMPT_MIGRACION_DJANGO.md', 'docs/historico/PROMPT_MIGRACION_DJANGO.md'],
  ['docs/superpowers/2026-06-03-psychosocial-sim-roadmap.md', 'docs/historico/psychosocial-sim-roadmap.md'],
]);

// Programa premium del 13 de julio: nunca se ejecutó (decisión que el equipo puede revertir sola).
const PREMIUM = new Set([
  'docs/superpowers/plans/2026-07-13-audio-atmosphere-premium.md',
  'docs/superpowers/plans/2026-07-13-character-manifest-editor-premium.md',
  'docs/superpowers/plans/2026-07-13-checkpoint-performance-acceptance.md',
  'docs/superpowers/plans/2026-07-13-dialogue-hud-liquid-glass.md',
  'docs/superpowers/plans/2026-07-13-living-case-npc-consequences.md',
  'docs/superpowers/plans/2026-07-13-premium-gameplay-program.md',
  'docs/superpowers/plans/2026-07-13-world-runtime-motion-camera.md',
  'docs/superpowers/specs/2026-07-13-sim-vbg-001-premium-gameplay-design.md',
]);

const LANZADORES = new Set(['iniciar_siep.ps1', 'correr_siep.cmd', 'detener_siep.ps1', 'apagar_siep.cmd']);

export const GROUPS = [
  {
    id: 'auditorias-junio',
    titulo: 'Evidencia de auditorías cerradas de junio y la herramienta que la generaba',
    test: (f) => /^docs\/audit-[^/]+(\/|\.png$)/.test(f) || /^docs\/skins[1-4]\.png$/.test(f) || f.startsWith('tools/smoke-test/'),
  },
  { id: 'historicos', titulo: 'Prompt del MVP, informe QA de junio y roadmap Tier 3', test: (f) => HISTORICOS.has(f) },
  { id: 'informes-julio', titulo: 'Informes de julio de trabajos cerrados', test: (f) => /^docs\/audits\/2026-07-/.test(f) },
  { id: 'programa-premium', titulo: 'Programa premium del 13 de julio (diseño y 7 planes, nunca ejecutado)', test: (f) => PREMIUM.has(f) },
  { id: 'planes', titulo: 'Planes de implementación ejecutados o abandonados', test: (f) => f.startsWith('docs/superpowers/plans/') && !KEEP_PLANS.has(f) },
  { id: 'specs', titulo: 'Especificaciones de diseño ya implementadas', test: (f) => f.startsWith('docs/superpowers/specs/') && !KEEP_SPECS.has(f) },
  { id: 'huerfanos', titulo: 'Archivos huérfanos (proxy.django.json y CSV duplicados de Notion)', test: (f) => f === 'frontend/proxy.django.json' || (/^docs\/[^/]+_all\.csv$/.test(f)) },
  { id: 'lanzadores', titulo: 'Lanzadores .ps1/.cmd de la raíz', test: (f) => LANZADORES.has(f) },
  { id: 'prueba-valentina', titulo: 'Evidencia puntual prueba-valentina', test: (f) => f.startsWith('docs/visual/kit-personajes/prueba-valentina/') },
];

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const stripHash = (name) => name.replace(/ [0-9a-f]{32}(?=\.[A-Za-z]+$)/, '');

const NOTION_DIRS = new Map([
  ['Requisitos de Negocio (Simulador)', 'negocio'],
  ['Requisitos Funcionales (Simulador)', 'funcionales'],
  ['Requisitos No Funcionales (Simulador)', 'no-funcionales'],
  ['Técnicas de Elicitación Aplicadas', 'elicitacion'],
].map(([k, v]) => [nfc(k), v]));
const NOTION_CSV = new Map([
  ['Requisitos de Negocio (Simulador)', ['negocio', 'requisitos-de-negocio.csv']],
  ['Requisitos Funcionales (Simulador)', ['funcionales', 'requisitos-funcionales.csv']],
  ['Requisitos No Funcionales (Simulador)', ['no-funcionales', 'requisitos-no-funcionales.csv']],
  ['Técnicas de Elicitación Aplicadas', ['elicitacion', 'tecnicas-de-elicitacion.csv']],
].map(([k, v]) => [nfc(k), v]));

/** destino (archivo) de un archivo que se mueve, o null si no se mueve */
function destinoDe(f) {
  if (KEEP_SPECS.has(f)) return KEEP_SPECS.get(f);
  if (KEEP_PLANS.has(f)) return KEEP_PLANS.get(f);
  if (HISTORICO_MOVES.has(f)) return HISTORICO_MOVES.get(f);
  if (f === 'docs/audits/2026-10-04-estrategia-stack-esquema-y-despliegue.md') return 'docs/arquitectura/estrategia-stack-esquema-y-despliegue.md';
  if (f.startsWith('docs/audits/')) return 'docs/informes/' + f.slice('docs/audits/'.length);
  if (f === 'DEPLOY_RAILWAY.md') return 'docs/operacion/despliegue-railway.md';
  // Notion: carpetas con .md
  let m = /^docs\/([^/]+)\/([^/]+)$/.exec(f);
  if (m && NOTION_DIRS.has(nfc(m[1]))) {
    const sub = NOTION_DIRS.get(nfc(m[1]));
    const base = stripHash(m[2]);
    const dest = sub === 'elicitacion' ? slug(base.replace(/\.md$/, '')) + '.md' : base;
    return `docs/requisitos/${sub}/${dest}`;
  }
  // Notion: CSV sueltos en docs/ (los _all.csv se borran antes)
  m = /^docs\/([^/]+)\.csv$/.exec(f);
  if (m) {
    const key = nfc(stripHash(m[1] + '.csv').replace(/\.csv$/, ''));
    if (NOTION_CSV.has(key)) { const [sub, name] = NOTION_CSV.get(key); return `docs/requisitos/${sub}/${name}`; }
  }
  return null;
}

// ───────────────────────── plan calculado ─────────────────────────
const deleteGroups = new Map(GROUPS.map((g) => [g.id, []]));
const deletedOf = new Map(); // ruta -> grupo
for (const f of trackedBase) {
  for (const g of GROUPS) {
    if (g.test(f)) { deleteGroups.get(g.id).push(f); deletedOf.set(f, g.id); break; }
  }
}
const fileMoves = new Map(); // viejo -> nuevo
for (const f of trackedBase) {
  if (deletedOf.has(f)) continue;
  const d = destinoDe(f);
  if (d && d !== f) fileMoves.set(f, d);
}
const reverseMoves = new Map([...fileMoves].map(([o, n]) => [n, o]));
const deletedSet = new Set(deletedOf.keys());

// ───────────────────────── utilidades ─────────────────────────
const TEXT_EXT = new Set(['.md', '.mjs', '.js', '.ts', '.json', '.yml', '.yaml', '.toml', '.txt', '.py', '.draft', '.csv', '.html', '.scss', '.css', '.sql', '.cmd', '.ps1', '.example', '.gitignore', '.gitleaksignore']);
const isTextPath = (p) => TEXT_EXT.has(path.posix.extname(p).toLowerCase()) || /(^|\/)\.(gitignore|gitleaksignore|dockerignore|gitattributes)$/.test(p) || path.posix.basename(p) === 'Dockerfile';
const LINK_RE = /(!?)\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g;
const SKIP_TARGET = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;

function dirHasFiles(treeSet, p) {
  const pref = p.replace(/\/+$/, '') + '/';
  for (const f of treeSet) if (f.startsWith(pref)) return true;
  return false;
}
const encodeTarget = (t) => t.split('/').map((s) => (/[ ()%]/.test(s) ? encodeURI(s).replace(/\(/g, '%28').replace(/\)/g, '%29') : s)).join('/');
function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

// ───────────────────────── plan (dry-run) ─────────────────────────
function cmdPlan() {
  const sizeOf = (f) => Number(git(['cat-file', '-s', `${BASE_SHA}:${f}`]).trim());
  let totalDel = 0; let totalBytes = 0;
  console.log('=== BORRADOS por grupo');
  for (const g of GROUPS) {
    const list = deleteGroups.get(g.id);
    const bytes = list.reduce((a, f) => a + sizeOf(f), 0);
    totalDel += list.length; totalBytes += bytes;
    console.log(`${String(list.length).padStart(4)} archivos  ${(bytes / 1048576).toFixed(2).padStart(7)} MB  ${g.id}  — ${g.titulo}`);
  }
  console.log(`TOTAL borrados: ${totalDel} archivos, ${(totalBytes / 1048576).toFixed(2)} MB (de ${trackedBase.length})`);
  console.log(`\n=== MOVIDOS: ${fileMoves.size}`);
  const byDest = new Map();
  for (const [o, n] of fileMoves) { const d = path.posix.dirname(n); byDest.set(d, (byDest.get(d) || 0) + 1); }
  for (const [d, c] of [...byDest].sort()) console.log(`${String(c).padStart(4)}  → ${d}/`);
  const clash = [...fileMoves.values()].filter((n) => trackedBase.includes(n));
  console.log(`conflictos de destino existente: ${clash.length}`, clash.slice(0, 5));
  const dup = [...new Set([...fileMoves.values()].filter((n, i, a) => a.indexOf(n) !== i))];
  console.log(`destinos duplicados: ${dup.length}`, dup.slice(0, 5));
  console.log('\n=== MOVIDOS (detalle fuera de informes/)');
  for (const [o, n] of fileMoves) if (!n.startsWith('docs/informes/')) console.log(`  ${o}\n     → ${n}`);
  console.log('\n=== SE QUEDAN en docs/ (raíz de docs):');
  for (const f of trackedBase) if (/^docs\/[^/]+$/.test(f) && !deletedSet.has(f) && !fileMoves.has(f)) console.log('  ' + f);
  console.log('\n=== SE QUEDAN sin cambio en carpetas de primer nivel de docs/:');
  const tops = new Map();
  for (const f of trackedBase) { if (deletedSet.has(f) || fileMoves.has(f)) continue; const m = /^docs\/([^/]+)\//.exec(f); if (m) tops.set(m[1], (tops.get(m[1]) || 0) + 1); }
  for (const [d, c] of [...tops].sort()) console.log(`${String(c).padStart(4)}  docs/${d}/`);
}

// ───────────────────────── comprobador de enlaces ─────────────────────────
function checkTree(fileList, readFile, label) {
  const set = new Set(fileList);
  const broken = [];
  for (const f of fileList) {
    if (!f.toLowerCase().endsWith('.md')) continue;
    const txt = readFile(f);
    if (txt == null) continue;
    let m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(txt))) {
      const raw = m[3];
      if (SKIP_TARGET.test(raw)) continue;
      const t = safeDecode(raw.split('#')[0].split('?')[0]);
      if (!t) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(f), t));
      if (resolved.startsWith('..')) { broken.push([f, raw, '(fuera del repo)']); continue; }
      if (!set.has(nfc(resolved)) && !dirHasFiles(set, nfc(resolved))) broken.push([f, raw, resolved]);
    }
  }
  console.log(`=== enlaces rotos (${label}): ${broken.length}`);
  for (const [f, raw, r] of broken) console.log(`  ${f}\n      → ${raw}${r ? '   [' + r + ']' : ''}`);
  return broken;
}
function cmdCheck() {
  const list = git(['ls-files', '-z']).split('\0').filter(Boolean).map(nfc);
  checkTree(list, (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return null; } }, 'árbol actual');
}
function cmdCheckBase(sha) {
  const list = git(['ls-tree', '-r', '-z', '--name-only', sha]).split('\0').filter(Boolean).map(nfc);
  checkTree(list, (f) => { try { return git(['show', `${sha}:${f}`]); } catch { return null; } }, `commit ${sha}`);
}

// ───────────────────────── borrar / mover ─────────────────────────
function cmdDelete(id) {
  const list = deleteGroups.get(id);
  if (!list) throw new Error('grupo desconocido: ' + id);
  if (!list.length) { console.log('grupo vacío'); return; }
  execFileSync('git', ['rm', '-q', '--pathspec-from-file=-', '--pathspec-file-nul'], { cwd: ROOT, input: list.join('\0'), stdio: ['pipe', 'inherit', 'inherit'] });
  console.log(`git rm: ${list.length} archivos (${id})`);
}
function cmdMoves() {
  let n = 0;
  for (const [o, d] of fileMoves) {
    fs.mkdirSync(path.join(ROOT, path.posix.dirname(d)), { recursive: true });
    execFileSync('git', ['mv', '--', o, d], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
    n++;
  }
  console.log(`git mv: ${n} archivos`);
}

// ───────────────────────── reescritura ─────────────────────────
const NOTE_MARK = 'Nota de la limpieza del repositorio';
const NO_NOTE = new Set(['README.md', 'docs/PROMPT_MAESTRO.md']); // llevan edición manual
function noteText() {
  return `> **${NOTE_MARK} (2026-10-10):** las menciones a documentos retirados (planes ya ejecutados, informes y especificaciones superados) se conservan como texto, sin enlace. Se recuperan del historial: \`git show ${BASE_SHA}:<ruta>\`.\n`;
}
function cmdRewrite() {
  const current = git(['ls-files', '-z']).split('\0').filter(Boolean).map(nfc);
  const baseSet = new Set(trackedBase);
  // pares (ruta vieja completa → nueva) ordenados de más larga a más corta
  const pairs = [...fileMoves].sort((a, b) => b[0].length - a[0].length);
  let touched = 0; let strippedTotal = 0; let relinked = 0; let mentionsReplaced = 0;
  const notes = [];
  const unresolved = [];
  for (const f of current) {
    if (!isTextPath(f)) continue;
    if (/\.(ps1|cmd)$/i.test(f)) continue;
    const abs = path.join(ROOT, f);
    let txt;
    try { txt = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const original = txt;
    const oldF = reverseMoves.get(f) ?? f;
    let stripped = 0;
    let retiredMention = 0;

    if (f.toLowerCase().endsWith('.md')) {
      txt = txt.replace(LINK_RE, (full, bang, text, target, title) => {
        if (SKIP_TARGET.test(target)) return full;
        const [pathPart, ...rest] = target.split('#');
        const frag = rest.length ? '#' + rest.join('#') : '';
        const noQuery = pathPart.split('?')[0];
        if (!noQuery) return full;
        const decoded = safeDecode(noQuery);
        const resolvedOld = nfc(path.posix.normalize(path.posix.join(path.posix.dirname(oldF), decoded)));
        if (resolvedOld.startsWith('..')) return full;
        // ¿destino borrado? (archivo o carpeta entera)
        const isDir = !baseSet.has(resolvedOld) && dirHasFiles(baseSet, resolvedOld);
        let gone = deletedSet.has(resolvedOld);
        if (isDir) {
          const pref = resolvedOld.replace(/\/+$/, '') + '/';
          const inside = trackedBase.filter((x) => x.startsWith(pref));
          gone = inside.length > 0 && inside.every((x) => deletedSet.has(x));
        }
        if (gone) {
          stripped++;
          return bang ? `_(imagen retirada: ${text || decoded})_` : text;
        }
        // destino movido
        let newTarget = resolvedOld;
        if (fileMoves.has(resolvedOld)) newTarget = fileMoves.get(resolvedOld);
        else if (isDir) {
          // carpeta cuyos archivos se mueven todos al mismo directorio nuevo
          const pref = resolvedOld.replace(/\/+$/, '') + '/';
          const inside = trackedBase.filter((x) => x.startsWith(pref) && !deletedSet.has(x));
          const dests = new Set(inside.map((x) => path.posix.dirname(fileMoves.get(x) ?? x)));
          if (inside.length && inside.every((x) => fileMoves.has(x)) && dests.size === 1) newTarget = [...dests][0];
        }
        const newDir = path.posix.dirname(f);
        let rel = path.posix.relative(newDir, newTarget);
        if (!rel) rel = '.';
        const oldRelNorm = path.posix.normalize(decoded);
        if (newTarget === resolvedOld && f === oldF) return full; // nada cambió
        if (rel === oldRelNorm) return full;
        const out = (decoded.startsWith('./') && !rel.startsWith('.') ? './' : '') + encodeTarget(rel) + frag;
        relinked++;
        return `${bang}[${text}](${out}${title ?? ''})`;
      });
    }

    // menciones con ruta completa: movidos → nueva ruta
    for (const [o, n] of pairs) {
      if (txt.includes(o)) {
        const parts = txt.split(o).length - 1;
        txt = txt.split(o).join(n);
        mentionsReplaced += parts;
      }
    }
    // nombres de archivo sueltos (texto visible de enlaces y citas): el nombre viejo pasa al nuevo
    for (const [o, n] of pairs) {
      const ob = path.posix.basename(o); const nb = path.posix.basename(n);
      if (ob === nb || ob.length < 20) continue;
      if (txt.includes(ob)) txt = txt.split(ob).join(nb);
      const mm = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(ob);
      if (mm) { const ell = '…-' + mm[1]; if (txt.includes(ell)) txt = txt.split(ell).join(nb); }
    }
    // menciones con ruta completa de borrados (se avisan con la nota)
    for (const d of deletedSet) {
      if (d.length > 24 && txt.includes(d)) retiredMention++;
    }

    if ((stripped + retiredMention) > 0 && !txt.includes(NOTE_MARK) && f.toLowerCase().endsWith('.md') && !f.startsWith('docs/diseñosistemas_docs/') && !NO_NOTE.has(f)) {
      const lines = txt.split('\n');
      const h1 = lines.findIndex((l) => /^#\s/.test(l));
      if (h1 >= 0 && lines[0] !== '---') {
        lines.splice(h1 + 1, 0, '', noteText().trimEnd());
        txt = lines.join('\n');
        notes.push(f);
      } else unresolved.push(`${f}: sin H1 para la nota`);
    } else if ((stripped + retiredMention) > 0) {
      unresolved.push(`${f}: menciones a retirados (${stripped} enlaces, ${retiredMention} rutas) sin nota`);
    }
    strippedTotal += stripped;
    if (txt !== original) { fs.writeFileSync(abs, txt, 'utf8'); touched++; }
  }
  console.log(`archivos tocados: ${touched}; enlaces recalculados: ${relinked}; enlaces a retirados quitados: ${strippedTotal}; rutas reemplazadas: ${mentionsReplaced}`);
  console.log(`notas añadidas: ${notes.length}`); notes.forEach((n) => console.log('   ' + n));
  if (unresolved.length) { console.log('PENDIENTES MANUALES:'); unresolved.forEach((u) => console.log('   ' + u)); }
}

// ───────────────────────── main ─────────────────────────
const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case 'plan': cmdPlan(); break;
  case 'delete': cmdDelete(arg); break;
  case 'moves': cmdMoves(); break;
  case 'rewrite': cmdRewrite(); break;
  case 'check': cmdCheck(); break;
  case 'check-base': cmdCheckBase(arg || BASE_SHA); break;
  default: console.log('uso: plan | delete <grupo> | moves | rewrite | check | check-base [sha]');
}
