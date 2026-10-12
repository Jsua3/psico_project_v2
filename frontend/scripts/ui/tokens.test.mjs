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
  '--ds-accent-sim': '#5B3FD1', '--ds-danger': '#A12C3B', '--ds-danger-hover': '#8A2532', '--ds-success': '#1E7A4F',
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

// ── F1-2: pieles portal y juego, contraste derivado de los tokens, contraste forzado y reducido ─────────────
import { contrastRatio } from '../../src/styles/contrast.util.ts';

const GAME = "[data-skin='game']";
const GAME_COLORS = {
  '--ds-surface-page': '#0E1322', '--ds-surface-1': '#151B2E', '--ds-surface-2': '#1D2540',
  '--ds-border': '#3A456B', '--ds-border-strong': '#6070A0',
  '--ds-text-1': '#E8ECF8', '--ds-text-2': '#A9B3CC', '--ds-text-3': '#6E7894',
  '--ds-primary': '#B69CFF', '--ds-primary-hover': '#C9B3FF', '--ds-primary-active': '#A58AF5',
  '--ds-primary-subtle': '#1D2540', '--ds-on-primary': '#0E1322',
  '--ds-accent-sim': '#B69CFF', '--ds-danger': '#FF8A93', '--ds-danger-hover': '#FFA3AA', '--ds-success': '#7DE0A8',
  '--ds-warning-text': '#F2C46D', '--ds-warning-bg': '#2B2410', '--ds-info': '#7FB7E6',
  '--ds-focus': '#C9B3FF', '--ds-focus-halo': '#0E1322',
};

function skinTokens(selector, media = null) {
  return propsFor(compileScss("@use 'skins';").decls, selector, media);
}

test('la piel juego redefine todos los colores en [data-skin="game"] y declara color-scheme oscuro', () => {
  const game = skinTokens(GAME);
  for (const [name, value] of Object.entries(GAME_COLORS)) assert.equal(game.get(name)?.toUpperCase(), value, name);
  assert.equal(game.get('color-scheme'), 'dark');
  assert.equal(skinTokens(ROOT).get('color-scheme'), 'light');
});

// req: RNF-04, RNF-004 (contraste derivado de los tokens, en las dos pieles)
for (const [skin, selector] of [['portal', ROOT], ['juego', GAME]]) {
  test(`contraste de la piel ${skin}: texto ≥ 4,5:1 y componentes y foco ≥ 3:1 sobre sus superficies`, () => {
    const t = skinTokens(selector);
    const surfaces = ['--ds-surface-page', '--ds-surface-1', '--ds-surface-2'].map(name => t.get(name));
    const atLeast = (fg, bg, min, label) => assert.ok(contrastRatio(fg, bg) >= min, `${label}: ${contrastRatio(fg, bg).toFixed(2)} < ${min}`);
    for (const bg of surfaces) {
      atLeast(t.get('--ds-text-1'), bg, 4.5, `text-1 sobre ${bg}`);
      atLeast(t.get('--ds-text-2'), bg, 4.5, `text-2 sobre ${bg}`);
      atLeast(t.get('--ds-border-strong'), bg, 3, `border-strong sobre ${bg}`);
      atLeast(t.get('--ds-focus'), bg, 3, `focus sobre ${bg}`);
    }
    const s1 = t.get('--ds-surface-1');
    for (const name of ['--ds-primary', '--ds-danger', '--ds-success', '--ds-info', '--ds-accent-sim']) atLeast(t.get(name), s1, 4.5, `${name} sobre surface-1`);
    atLeast(t.get('--ds-on-primary'), t.get('--ds-primary'), 4.5, 'on-primary sobre primary');
    // F2-1: el botón de peligro lleva el texto de on-primary en reposo y en hover.
    atLeast(t.get('--ds-on-primary'), t.get('--ds-danger'), 4.5, 'on-primary sobre danger');
    atLeast(t.get('--ds-on-primary'), t.get('--ds-danger-hover'), 4.5, 'on-primary sobre danger-hover');
    atLeast(t.get('--ds-warning-text'), t.get('--ds-warning-bg'), 4.5, 'warning-text sobre warning-bg');
  });
}

test('contraste forzado: superficies Canvas, texto CanvasText, enlace LinkText y foco Highlight', () => {
  const forced = skinTokens('[data-skin]', 'forced-colors: active');
  assert.equal(forced.get('--ds-surface-1'), 'Canvas');
  assert.equal(forced.get('--ds-text-1'), 'CanvasText');
  assert.equal(forced.get('--ds-primary'), 'LinkText');
  assert.equal(forced.get('--ds-focus'), 'Highlight');
  assert.equal(forced.get('--ds-shadow-e1'), 'none');
  assert.equal(propsFor(compileScss("@use 'skins';").decls, ROOT, 'forced-colors: active').get('--ds-focus'), 'Highlight');
});

test('más contraste sube el borde y transparencia reducida quita velo y desenfoque', () => {
  assert.equal(skinTokens('[data-skin]', 'prefers-contrast: more').get('--ds-border'), 'var(--ds-border-strong)');
  const reduced = skinTokens('[data-skin]', 'prefers-reduced-transparency: reduce');
  assert.equal(reduced.get('--ds-veil'), 'var(--ds-surface-1)');
  assert.equal(reduced.get('--ds-glass-blur'), 'none');
});

// ── F1-3: escala tipográfica por tokens (rem; nunca menos de 12 px) ──────────────────────────────────────────
// req: RNF-04 (textos legibles: ningún token de tamaño < 0,75 rem)
test('escala tipográfica de §2.3 en rem, con interlineado, tracking y peso por rol', () => {
  const t = rootTokens();
  const scale = {
    display: ['3.25rem', '3.5rem', '-0.03em', '800'],
    h1: ['2.25rem', '2.625rem', '-0.02em', '800'],
    h2: ['1.75rem', '2.125rem', '-0.015em', '800'],
    h3: ['1.375rem', '1.75rem', '-0.01em', '600'],
    lead: ['1.125rem', '1.75rem', '0', '400'],
    body: ['1rem', '1.5rem', '0', '400'],
    'body-s': ['0.875rem', '1.25rem', '0.005em', '400'],
    caption: ['0.75rem', '1rem', '0.01em', '600'],
    mono: ['0.8125rem', '1.25rem', '0', '400'],
  };
  for (const [role, [size, line, track, weight]] of Object.entries(scale)) {
    assert.deepEqual(
      ['size', 'line', 'track', 'weight'].map(part => t.get(`--ds-type-${role}-${part}`)),
      [size, line, track, weight], role);
    assert.ok(Number.parseFloat(size) >= 0.75, `${role} < 0,75 rem`);
  }
  assert.match(t.get('--ds-font-sans'), /^'Poppins'/);
  assert.match(t.get('--ds-font-mono'), /^'JetBrains Mono'/);
});

test('los alias heredados solo viven en :root: las clases del portal dentro del juego conservan sus valores hasta F6', () => {
  // Declararlos también en [data-skin] pintó el «Continuar» heredado (.psy-button--primary, texto blanco) en
  // lavanda dentro del juego: 1,9:1 (e2e @quality). Las clases heredadas pasan a la piel juego en F6-1/F6-4,
  // junto con su texto (--ds-on-primary).
  const { decls } = compileScss("@use 'skins'; @use 'aliases';");
  assert.equal(propsFor(decls, ROOT).get('--psy-ink'), 'var(--ds-text-1)');
  assert.equal(propsFor(decls, '[data-skin]').has('--psy-ink'), false);
});
