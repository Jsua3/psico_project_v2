#!/usr/bin/env node
// Nombres de Material Symbols que la app necesita (plan visual F1-3). Fuentes:
//  1. contenido de <mat-icon>…</mat-icon> (nombre suelto o literales dentro de {{ }});
//  2. propiedades y asignaciones cuyo nombre contiene «icon» (icon: 'x', primaryIcon = 'x');
//  3. resultados de las funciones que se llaman dentro de un <mat-icon> ({{ iconForClass(…) }});
//  4. semillas y datos del backend ("icon": "x");
//  5. scripts/ui/icons-extra.json: iconos curados para lo que escriben los autores en «Icono Material».
// Uso: node scripts/ui/icon-names.mjs > nombres.json   (lo consume scripts/ui/subset-icons.py)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICON = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
// Literal en posición de RESULTADO (`return 'a'`, `? 'a' : 'b'`, `clave: 'a'`), no de comparación (`x === 'a'`).
const QUOTED = /(?:\breturn|[?:])\s*['"`]([a-z0-9]+(?:_[a-z0-9]+)*)['"`]/g;

function addQuoted(text, out) {
  for (const [, name] of text.matchAll(QUOTED)) out.add(name);
}

/** Cuerpo entre llaves que empieza en `open` (índice de «{»), con llaves anidadas. */
function bodyFrom(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

export function iconNamesIn(files) {
  const out = new Set();
  const sources = files.filter(({ path }) => !/\.spec\.ts$/.test(path));
  // Funciones llamadas dentro de un <mat-icon> (p. ej. {{ iconForClass(…) }}): sus resultados son iconos.
  const iconFunctions = new Set();
  for (const { path, text } of sources) {
    if (path.endsWith('.py') || path.endsWith('.json')) {
      for (const [, name] of text.matchAll(/["']icon["']\s*:\s*["']([a-z0-9_]+)["']/g)) out.add(name);
      continue;
    }
    for (const [, content] of text.matchAll(/<mat-icon\b[^>]*>([\s\S]*?)<\/mat-icon>/g)) {
      const bare = content.trim();
      if (ICON.test(bare)) out.add(bare);
      for (const [, expr] of content.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
        addQuoted(expr, out);
        for (const [, fn] of expr.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) iconFunctions.add(fn);
      }
    }
    if (path.endsWith('.ts')) {
      // Sin alias de tipo (`type PatientIconKind = 'crisis' | …`): son claves, no nombres de icono.
      for (const [, name] of text.matchAll(/(?<!\btype\s+)\b\w*[iI]con\w*\s*[:=]\s*['"]([a-z0-9]+(?:_[a-z0-9]+)*)['"]/g)) out.add(name);
    }
  }
  for (const { path, text } of sources) {
    if (!path.endsWith('.ts')) continue;
    const header = /\b([A-Za-z_]\w*)\s*\([^)]*\)\s*(?::\s*[\w<>[\]|' ]+)?\s*\{/g;
    let m;
    while ((m = header.exec(text))) {
      if (iconFunctions.has(m[1])) addQuoted(bodyFrom(text, m.index + m[0].length - 1), out);
    }
  }
  return out;
}

function walk(dir, accept, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.venv' || name === 'migrations' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, accept, out);
    else if (accept(name)) out.push(full);
  }
  return out;
}

const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(here, '..', '..');
const REPO = join(FRONTEND, '..');

/** Todos los nombres requeridos por el proyecto (código, semillas del backend y lista curada). */
export function projectIconNames() {
  const read = full => ({ path: relative(REPO, full).split(sep).join('/'), text: readFileSync(full, 'utf8') });
  const files = [
    ...walk(join(FRONTEND, 'src'), name => /\.(ts|html)$/.test(name)).map(read),
    ...walk(join(REPO, 'backend_django', 'apps'), name => /\.(py|json)$/.test(name)).map(read),
  ];
  const names = iconNamesIn(files);
  for (const name of JSON.parse(readFileSync(join(here, 'icons-extra.json'), 'utf8'))) names.add(name);
  return names;
}

if (process.argv[1] && process.argv[1].endsWith('icon-names.mjs')) {
  console.log(JSON.stringify([...projectIconNames()].sort(), null, 1));
}
