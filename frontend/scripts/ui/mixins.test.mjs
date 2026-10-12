import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileScss, propsFor } from './sass-test-utils.mjs';

/**
 * Mixins del lenguaje visual (plan visual F1-7; contrato F1 → F2 de §3.3): ds-hover, ds-press, ds-focus-ring,
 * ds-glass y ds-disabled. Se prueba el CSS que generan, no su texto.
 */
const use = body => compileScss(`@use 'mixins' as m;\n${body}`);

test('ds-hover: el :hover solo existe con puntero fino (nunca en táctil)', () => {
  const { decls, rules } = use('.x { @include m.ds-hover { background: var(--ds-primary-subtle); } }');
  assert.equal(propsFor(decls, '.x:hover', 'hover: hover').get('background'), 'var(--ds-primary-subtle)');
  assert.ok(rules.filter(r => r.selector.includes(':hover')).every(r => r.ats.some(at => at.includes('(hover: hover) and (pointer: fine)'))));
});

test('ds-press: responde al presionar con scale .97 en 100 ms ease-out, sin reglas propias de movimiento reducido', () => {
  const { decls, css } = use('.x { @include m.ds-press; }');
  assert.equal(propsFor(decls, '.x').get('transition'), 'scale var(--ds-dur-press) var(--ds-ease-out)');
  assert.equal(propsFor(decls, '.x:active').get('scale'), '0.97');
  assert.doesNotMatch(css, /prefers-reduced-motion/, 'lo resuelven los tokens: --ds-dur-press vale 0,01 ms');
});

test('ds-focus-ring: el mismo anillo que la regla raíz de foco', () => {
  const { decls } = use('.x:focus-visible { @include m.ds-focus-ring; }');
  const ring = propsFor(decls, '.x:focus-visible');
  assert.equal(ring.get('outline'), '3px solid var(--ds-focus)');
  assert.equal(ring.get('outline-offset'), '2px');
  assert.equal(ring.get('box-shadow'), '0 0 0 2px var(--ds-focus-halo)');
});

test('ds-glass: el vidrio vive en ::before (nunca en el elemento) y cae a sólido sin backdrop-filter', () => {
  const { decls } = use('.bar { @include m.ds-glass; }');
  const element = propsFor(decls, '.bar');
  assert.equal(element.has('backdrop-filter'), false, 'vidrio sobre vidrio: invariante 4 de la barra de vidrio');
  const veil = propsFor(decls, '.bar::before');
  assert.equal(veil.get('backdrop-filter'), 'var(--ds-glass-blur)');
  assert.equal(veil.get('-webkit-backdrop-filter'), 'var(--ds-glass-blur)');
  assert.equal(veil.get('background'), 'var(--ds-veil)');
  assert.equal(veil.get('pointer-events'), 'none');
  assert.equal(propsFor(decls, '.bar::before', 'not').get('background'), 'var(--ds-surface-1)');
});

test('ds-disabled: aria-disabled o :disabled, cursor not-allowed y sin pointer-events: none (el motivo debe poder leerse)', () => {
  const { decls } = use('.btn { @include m.ds-disabled; }');
  const disabled = new Map([...propsFor(decls, ".btn[aria-disabled='true']")]);
  assert.equal(disabled.get('cursor'), 'not-allowed');
  assert.equal(disabled.get('color'), 'var(--ds-text-3)');
  assert.equal(propsFor(decls, '.btn:disabled').get('cursor'), 'not-allowed');
  assert.ok(!decls.some(d => d.prop === 'pointer-events'), 'sin pointer-events: none');
});
