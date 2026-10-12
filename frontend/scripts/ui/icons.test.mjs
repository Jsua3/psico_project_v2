import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { iconNamesIn, projectIconNames } from './icon-names.mjs';

/**
 * Subconjunto de Material Symbols (plan visual F1-3): la fuente servida solo trae los iconos que la app usa. Si un
 * nombre falta, el navegador pinta la ligadura como texto («play_arrow»), así que cada nombre REQUERIDO debe estar
 * en la lista que generó scripts/ui/subset-icons.py al construir el subconjunto.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FONTS = join(here, '..', '..', 'src', 'assets', 'fonts');

test('extrae los nombres de <mat-icon>, de ternarios, de propiedades *icon* y de funciones *icon*', () => {
  const files = [
    { path: 'src/app/x/x.component.ts', text: [
      "template: `<mat-icon>save</mat-icon><mat-icon aria-hidden=\"true\">{{ busy() ? 'hourglass_empty' : 'check' }}</mat-icon>",
      '<mat-icon>{{ tool.icon }}</mat-icon><mat-icon>{{ iconFor(kind) }}</mat-icon>`,',
      "readonly items = [{ label: 'A', icon: 'menu_book' }, { label: 'B', primaryIcon: 'home' }];",
      'iconFor(type: string): string {',
      "  if (type === 'x') return 'psychology';",
      "  return type === 'y' ? 'groups' : 'help';",
      '}',
      '// Una función de iconos pixel art que no se usa en <mat-icon>: sus claves no son de Material.',
      "patientIconKey(kind: string): string { return 'crisis'; }",
      "const notAnIcon = 'hola mundo';",
    ].join('\n') },
    { path: 'backend_django/apps/x/seed.py', text: '{"pos": (1, 2), "icon": "healing", "short": "PAP"}' },
  ];
  assert.deepEqual([...iconNamesIn(files)].sort(), ['check', 'groups', 'healing', 'help', 'home', 'hourglass_empty', 'menu_book', 'psychology', 'save']);
});

test('sigue las funciones que llaman a otras y los parámetros llamados *icon* (revisión de F1, C2)', () => {
  const files = [{ path: 'src/app/x/x.component.ts', text: [
    'template: `<mat-icon>{{ timelineIcon(entry) }}</mat-icon><mat-icon>{{ metric.icon }}</mat-icon>`,',
    'timelineIcon(entry: Entry): string {',
    '  if (entry.retry) return RETRY_ICON;',
    '  return this.iconFor(entry.type);',
    '}',
    'iconFor(type: string): string {',
    "  if (type === 'DECISION') return 'rule';",
    "  return type === 'TOOL' ? 'construction' : 'open_with';",
    '}',
    "readonly metrics = [this.metric('people', 'Estudiantes', 3), this.metric(\"emoji_events\", 'Mejor', 9)];",
    'private metric(icon: string, label: string, value: number) { return { icon, label, value }; }',
    "private other(label: string, icon = 'x') { return label; }",
    "readonly noIcon = this.other('hola');",
  ].join('\n') }];
  const names = iconNamesIn(files);
  for (const name of ['rule', 'construction', 'open_with', 'people', 'emoji_events']) assert.ok(names.has(name), name);
  assert.equal(names.has('hola'), false, 'el argumento de un parámetro que no es *icon* no cuenta');
});

test('cada icono requerido por el código, las semillas del backend y la lista curada está en el subconjunto', () => {
  const included = new Set(JSON.parse(readFileSync(join(here, 'material-symbols-rounded.icons.json'), 'utf8')));
  const missing = [...projectIconNames()].filter(name => !included.has(name)).sort();
  assert.deepEqual(missing, [], 'Faltan en el subconjunto: ejecuta scripts/ui/subset-icons.py (ver su cabecera)');
});

test('el subconjunto pesa mucho menos que la fuente completa (≈ 536 kB)', () => {
  const size = statSync(join(FONTS, 'material-symbols-rounded.woff2')).size;
  assert.ok(size < 160_000, `material-symbols-rounded.woff2 pesa ${size} B`);
});
