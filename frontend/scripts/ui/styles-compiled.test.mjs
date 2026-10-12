import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileStylesFile } from './sass-test-utils.mjs';

/** Pruebas sobre la hoja global COMPILADA (plan visual F1-3 a F1-6). Se compila una vez. */
const { css } = compileStylesFile('styles.scss');

test('tipografía: solo Poppins 400/600/800 y JetBrains Mono 400/700; sin Montserrat', () => {
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const family = /font-family:\s*["']?([^"';]+)["']?;/.exec(body)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(body)?.[1];
    return `${family}:${weight}`;
  }).filter(face => !face.startsWith('Material Symbols'));
  assert.deepEqual(faces.sort(), ['JetBrains Mono:400', 'JetBrains Mono:700', 'Poppins:400', 'Poppins:600', 'Poppins:800']);
  assert.doesNotMatch(css, /Montserrat/);
});

// ── F1-4: tema de Material con mat.theme atado a los tokens (ANG-10) ──────────────────────────────────────────
import { parseCss } from './ui-lint-lib.mjs';

const parsed = parseCss({ text: css, startLine: 1 });

test('Material: tokens de sistema (--mat-sys-*) atados a --ds-* y sin los miles de tokens por componente', () => {
  const componentTokens = parsed.decls.filter(d => d.prop.startsWith('--mat-') && !d.prop.startsWith('--mat-sys-'));
  assert.ok(componentTokens.length <= 30, `tokens por componente emitidos: ${componentTokens.length}`);
  const sys = new Map(parsed.decls.filter(d => d.prop.startsWith('--mat-sys-')).map(d => [`${d.selector}|${d.prop}`, d.value]));
  assert.equal(sys.get('html|--mat-sys-primary'), 'var(--ds-primary)');
  assert.equal(sys.get('html|--mat-sys-surface'), 'var(--ds-surface-1)');
  assert.equal(sys.get('[data-skin=game]|--mat-sys-primary'), 'var(--ds-primary)', 'la piel juego vuelve a atar Material a sus tokens');
});

test('Material: tarjetas y tablas sin !important', () => {
  const forced = parsed.decls.filter(d => /mat-mdc-(card|header-cell|row)/.test(d.selector) && /!important/.test(d.value));
  assert.deepEqual(forced.map(d => `${d.selector} { ${d.prop} }`), []);
});
