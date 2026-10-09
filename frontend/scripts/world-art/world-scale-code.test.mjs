/**
 * Escalas enteras en el código del mundo (F8, spec §1.1.2): ningún sprite se dibuja con una escala
 * fraccionaria ni con las constantes de la calibración anterior (~46 px/m). Los specs quedan fuera:
 * los contratos citan lo prohibido para negarlo.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { FRONTEND_ROOT } from './build.mjs';

export const SCALE_PATTERNS = Object.freeze([
  [/\b(FURNITURE_MAX_H|DOOR_SPRITE_SCALE|TOOL_SPRITE_SCALE)\b/, 'constante de la calibración anterior (~46 px/m)'],
  [/\.setScale\(\s*\d+\.\d+/, 'escala fraccionaria en un sprite'],
]);

function appSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...appSources(full));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

export function scaleFindings(root = FRONTEND_ROOT) {
  const findings = [];
  const app = path.join(root, 'src', 'app');
  if (!existsSync(app)) return findings;
  for (const file of appSources(app)) {
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      for (const [pattern, what] of SCALE_PATTERNS) {
        if (pattern.test(line)) findings.push(`${path.relative(root, file).replace(/\\/g, '/')}:${index + 1}: ${what}`);
      }
    });
  }
  return findings;
}

test('el código del mundo no escala sprites a fracciones ni usa la calibración anterior', () => {
  assert.deepEqual(scaleFindings(), []);
});

test('el detector ve una escala fraccionaria y una constante vieja, y no mira los specs', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'world-scale-code-'));
  try {
    const app = path.join(root, 'src', 'app');
    mkdirSync(app, { recursive: true });
    writeFileSync(path.join(app, 'x.ts'), 'const a = 1;\nsprite.setScale(2.5);\nconst k = DOOR_SPRITE_SCALE;\nimage.setScale(2);\n');
    writeFileSync(path.join(app, 'x.spec.ts'), "expect(source).not.toContain('.setScale(2.5)');\n");
    assert.deepEqual(scaleFindings(root), [
      'src/app/x.ts:2: escala fraccionaria en un sprite',
      'src/app/x.ts:3: constante de la calibración anterior (~46 px/m)',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
