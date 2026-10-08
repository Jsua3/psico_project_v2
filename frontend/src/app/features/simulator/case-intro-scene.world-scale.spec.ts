import { readFileSync } from 'fs';
import { join } from 'path';

import { worldSprite } from './world-scale.util';

// Fin de línea normalizado: el checkout de Windows trae CRLF.
const source = readFileSync(join(__dirname, 'case-intro-scene.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

/** Ancho y alto declarados en el HTML de la imagen del escenario que carga `src`. */
function declaredSize(src: string): [number, number] {
  const line = source.split('\n').find(candidate => candidate.includes(`src="${src}"`));
  if (!line) throw new Error(`la intro no usa ${src}`);
  const size = line.match(/width="(\d+)" height="(\d+)"/);
  if (!size) throw new Error(`${src} no declara su tamaño`);
  return [Number(size[1]), Number(size[2])];
}

/** `top` del CSS de una pieza del escenario (`.intro-stage__door { left: …px; top: …px; }`). */
function declaredTop(piece: string): number {
  const rule = source.match(new RegExp(`\\.intro-stage__${piece} \\{ left: \\d+px; top: (\\d+)px; \\}`));
  if (!rule) throw new Error(`no encuentro la regla de .intro-stage__${piece}`);
  return Number(rule[1]);
}

describe('intro del caso: las piezas del escenario miden lo que dice la tabla del mundo (spec §13.1)', () => {
  it.each([
    ['/assets/game/doors/door_urgencias.png', 'doors', 'door_urgencias'],
    ['/assets/game/furniture/chair.png', 'furniture', 'chair'],
    ['/assets/game/furniture/plant.png', 'furniture', 'plant'],
  ] as const)('%s se declara con el tamaño de su PNG', (src, group, name) => {
    const spec = worldSprite(group, name);
    expect(declaredSize(src)).toEqual([spec.width, spec.height]);
  });

  it('las bases de la puerta, la silla y la planta quedan donde estaban (y = 128, 138 y 140 del escenario de 384×216)', () => {
    expect(declaredTop('door') + worldSprite('doors', 'door_urgencias').height).toBe(128);
    expect(declaredTop('chair') + worldSprite('furniture', 'chair').height).toBe(138);
    expect(declaredTop('plant') + worldSprite('furniture', 'plant').height).toBe(140);
  });
});
