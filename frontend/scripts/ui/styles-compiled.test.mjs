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

// ── F1-5: un solo anillo de foco y objetivos táctiles base ────────────────────────────────────────────────────
// req: RNF-04, RNF-004 (foco visible ≥ 3:1; WCAG 2.4.7 y 2.4.11)
test('foco: una sola regla raíz :focus-visible de 3 px con halo y sin border-radius', () => {
  const rootRules = parsed.rules.filter(r => r.selector.trim() === ':focus-visible' && r.ats.length === 0);
  assert.equal(rootRules.length, 1, 'reglas :focus-visible raíz');
  const ring = new Map(parsed.decls.filter(d => d.selector.trim() === ':focus-visible' && d.ats.length === 0).map(d => [d.prop, d.value]));
  assert.equal(ring.get('outline'), '3px solid var(--ds-focus)');
  assert.equal(ring.get('outline-offset'), '2px');
  assert.equal(ring.get('box-shadow'), '0 0 0 2px var(--ds-focus-halo)');
  assert.equal(ring.has('border-radius'), false, 'el radio de 2 px recortaba las píldoras');
});

test('objetivos táctiles: 44 px y mínimo estricto de 24 px (WCAG 2.5.8) como tokens', () => {
  const root = new Map(parsed.decls.filter(d => d.selector.trim() === ':root' && d.ats.length === 0).map(d => [d.prop, d.value]));
  assert.equal(root.get('--ds-target-min'), '2.75rem');
  assert.equal(root.get('--ds-target-min-strict'), '1.5rem');
});
