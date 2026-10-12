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
