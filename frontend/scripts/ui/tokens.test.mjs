import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileScss, propsFor } from './sass-test-utils.mjs';

/**
 * Tokens del lenguaje visual (plan visual §2.3, F1-1): una sola fuente de valores en src/styles/tokens y
 * src/styles/skins, emitida como propiedades personalizadas. Se prueba la SALIDA compilada.
 */
const ROOT = ':root';

const PORTAL_COLORS = {
  '--ds-surface-page': '#F5F7FA', '--ds-surface-1': '#FFFFFF', '--ds-surface-2': '#EEF2F6',
  '--ds-border': '#D5DDE6', '--ds-border-strong': '#6F8296',
  '--ds-text-1': '#14202E', '--ds-text-2': '#4A5A6A', '--ds-text-3': '#7A8794',
  '--ds-primary': '#004876', '--ds-primary-hover': '#003B63', '--ds-primary-active': '#002F50',
  '--ds-primary-subtle': '#E6F0F7', '--ds-on-primary': '#FFFFFF',
  '--ds-accent-sim': '#5B3FD1', '--ds-danger': '#A12C3B', '--ds-success': '#1E7A4F',
  '--ds-warning-text': '#7A4F00', '--ds-warning-bg': '#FFF4D6', '--ds-info': '#0B5A8A',
  '--ds-focus': '#004876', '--ds-focus-halo': '#FFFFFF',
};

function rootTokens() {
  return propsFor(compileScss("@use 'skins';").decls, ROOT);
}

test('la piel portal (:root) define los colores de §2.3 con sus valores exactos', () => {
  const props = rootTokens();
  for (const [name, value] of Object.entries(PORTAL_COLORS)) {
    assert.equal(props.get(name)?.toUpperCase(), value, name);
  }
});

test('escalas de espacio (rem), radios y capas', () => {
  const props = rootTokens();
  const space = ['0.25rem', '0.5rem', '0.75rem', '1rem', '1.5rem', '2rem', '3rem', '4rem'];
  space.forEach((value, i) => assert.equal(props.get(`--ds-space-${i + 1}`), value, `--ds-space-${i + 1}`));
  for (const [name, value] of Object.entries({ sm: '6px', md: '10px', lg: '16px', xl: '24px', pill: '999px' })) {
    assert.equal(props.get(`--ds-radius-${name}`), value, `--ds-radius-${name}`);
  }
  const z = { base: '0', elevado: '10', pegajoso: '20', cabecera: '40', desplegable: '60', cubierta: '80', modal: '100', aviso: '120', maximo: '1000' };
  for (const [name, value] of Object.entries(z)) assert.equal(props.get(`--ds-z-${name}`), value, `--ds-z-${name}`);
});

test('elevación en cuatro niveles; e0 es solo borde (sin sombra)', () => {
  const props = rootTokens();
  assert.equal(props.get('--ds-shadow-e0'), 'none');
  for (const level of ['e1', 'e2', 'e3']) assert.ok(props.get(`--ds-shadow-${level}`), `--ds-shadow-${level}`);
  // VD-3: nada de sombras duras «Npx Npx 0».
  for (const level of ['e1', 'e2', 'e3']) assert.doesNotMatch(props.get(`--ds-shadow-${level}`), /\d+px \d+px 0(?![.\d])/);
});

test('los espacios de nombres heredados resuelven por alias a los tokens nuevos', () => {
  const { decls } = compileScss("@use 'skins'; @use 'aliases';");
  const props = propsFor(decls, ROOT);
  const expected = {
    '--siep-blue': 'var(--ds-primary)', '--psy-blue-deep': 'var(--ds-primary)',
    '--siep-bg': 'var(--ds-surface-page)', '--psy-surface': 'var(--ds-surface-1)',
    '--psy-ink': 'var(--ds-text-1)', '--psy-muted': 'var(--ds-text-2)', '--psy-border': 'var(--ds-border)',
    '--psy-focus': 'var(--ds-focus)', '--psy-radius': 'var(--ds-radius-lg)', '--psy-space-4': 'var(--ds-space-4)',
    '--psy-shadow-card': 'var(--ds-shadow-e1)', '--psy-z-nav': 'var(--ds-z-cubierta)',
  };
  for (const [name, value] of Object.entries(expected)) assert.equal(props.get(name), value, name);
});
