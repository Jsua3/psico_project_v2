import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildLamina, parseArgs } from './laminas.mjs';

const images = html => (html.match(/<img /g) ?? []).length;

test('parseArgs entiende modos, escala y salida', () => {
  assert.deepEqual(parseArgs(['--piezas', 'hair:afro', '--escala', '3', '--salida', 'x.png']), { piezas: 'hair:afro', escala: 3, salida: 'x.png' });
  assert.deepEqual(parseArgs(['--elenco']), { elenco: true });
});

test('ficha de receta: 4 vistas, retratos, 16 cuadros de reposo y 24 de caminata', () => {
  const { name, html } = buildLamina({ receta: 'valentina' });
  assert.equal(name, 'receta-valentina');
  assert.equal(images(html), 4 + 1 + 16 + 24);
  assert.match(html, /image-rendering: pixelated/);
});

test('lámina de piezas: una fila por complexión con vistas, caminata de perfil y retrato', () => {
  const { name, html } = buildLamina({ piezas: 'hair:bob-flequillo' });
  assert.equal(name, 'piezas-hair-bob-flequillo');
  assert.equal(images(html), 4 + 6 + 1);
});

test('las escalas de las imágenes son enteras', () => {
  const { html } = buildLamina({ elenco: true });
  for (const [, w, h] of html.matchAll(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/g)) {
    assert.ok(Number.isInteger(Number(w)) && Number.isInteger(Number(h)), `${w}×${h}`);
  }
});

test('modo desconocido o pieza inexistente fallan con un mensaje claro', () => {
  assert.throws(() => buildLamina({}), /uso: laminas.mjs/);
  assert.throws(() => buildLamina({ piezas: 'hair:no-existe' }), /pieza desconocida: hair:no-existe/);
});
