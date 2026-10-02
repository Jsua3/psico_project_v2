/**
 * Construye los cuadros etiquetados del maniquí (por vista y por cuadro) a
 * partir de su definición: grillas fijas + rig por cuadro.
 *
 * Salida: { [vista]: { idle: Frame[], walk: Frame[] } } con `part` = etiqueta
 * de la parte del cuerpo, `z` = profundidad y `far` = miembro lejano. Los
 * materiales (`mat`) los pone después la receta (vestir).
 */

import { createFrame, inside, isEmptyChar, mirrorFrame, parseGrid } from './kit-core.mjs';

/** Profundidad por etiqueta y tipo de vista (para sombras proyectadas). */
const Z = {
  // La pelvis comparte profundidad con los muslos: la unión no es un borde.
  front: { H: 5, e: 5, E: 5, N: 2.5, T: 3, P: 1, a: 4, b: 4, c: 4.2, A: 4, B: 4, C: 4.2, l: 1, m: 1, o: 0.9, L: 1, M: 1, O: 0.9 },
  // Perfil: todo lo lejano queda detrás de lo cercano (brazo lejano el más al fondo).
  side: { H: 5, e: 5.1, N: 2.5, T: 3, P: 1, a: 4, b: 4, c: 4.2, A: 0.5, B: 0.5, C: 0.55, l: 1, m: 1, o: 0.9, L: 0.7, M: 0.7, O: 0.65 },
};

const FAR_LABELS = new Set(['A', 'B', 'C', 'L', 'M', 'O']);

function stampGrid(frame, gridSpec, dx, dy, kind, opts = {}) {
  const rows = parseGrid(gridSpec.grid);
  const [ax, ay] = gridSpec.at;
  rows.forEach((row, r) => {
    let rowDy = dy;
    if (opts.lowerDy !== undefined && r >= opts.stretchRow) rowDy = opts.lowerDy;
    [...row].forEach((ch, c) => {
      if (isEmptyChar(ch)) return;
      put(frame, ax + c + dx, ay + r + rowDy, ch, kind);
    });
  });
  // Relleno del estiramiento (respiración): repite la fila de la cintura.
  if (opts.lowerDy !== undefined && opts.lowerDy - dy === 1) {
    const row = rows[opts.stretchRow];
    [...row].forEach((ch, c) => {
      if (!isEmptyChar(ch)) put(frame, ax + c + dx, ay + opts.stretchRow + dy, ch, kind);
    });
  }
}

function stampSprite(frame, sprite, left, top, label, kind, flipX = false) {
  const rows = parseGrid(sprite.grid);
  const w = rows[0].length;
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (!isEmptyChar(ch)) put(frame, left + (flipX ? w - 1 - c : c), top + r, label, kind);
    });
  });
}

/** Ancho de un sprite de grilla. */
function spriteWidth(sprite) {
  return parseGrid(sprite.grid)[0].length;
}

function put(frame, x, y, label, kind) {
  if (!inside(frame, x, y)) return;
  const i = y * frame.width + x;
  const z = Z[kind === 'side' ? 'side' : 'front'][label] ?? 0;
  // Gana lo que está delante: así el orden de estampado no importa.
  if (frame.part[i] !== null && frame.z[i] > z) return;
  frame.part[i] = label;
  frame.z[i] = z;
  frame.far[i] = kind === 'side' && FAR_LABELS.has(label) ? 1 : 0;
}

/** Izquierda del tramo de ancho `w` centrado en `cx` (en índices de píxel). */
function spanLeft(cx, w) {
  return Math.round(cx - (w - 1) / 2);
}

/**
 * Rasteriza un segmento por filas: en cada fila entre las dos articulaciones
 * pinta un tramo horizontal interpolando centro y ancho. Devuelve el tramo de
 * la última fila (para anclar mano o pie).
 */
function rasterSegment(frame, p0, p1, w0, w1, label, kind) {
  const [x0, y0] = p0;
  const [x1, y1] = p1;
  const ys = Math.round(y0);
  const ye = Math.round(y1);
  let last = null;
  for (let y = ys; y <= ye; y++) {
    const t = ye === ys ? 1 : (y - ys) / (ye - ys);
    const cx = x0 + (x1 - x0) * t;
    const w = Math.max(1, Math.round(w0 + (w1 - w0) * t));
    const left = spanLeft(cx, w);
    for (let x = left; x < left + w; x++) put(frame, x, y, label, kind);
    last = { left, right: left + w - 1, y };
  }
  return last;
}

/**
 * Miembro de dos segmentos + sprite final (mano o pie). Con `mirrored` el
 * sprite se refleja y se ancla por el borde derecho del tramo (lado derecho de
 * la pantalla en las vistas de frente/espalda).
 */
function limb(frame, joints, widths, labels, sprite, kind, spriteLabel, mirrored = false) {
  const [w0, w1] = widths[0];
  const [w2, w3] = widths[1];
  rasterSegment(frame, joints[0], joints[1], w0, w1, labels[0], kind);
  const end = rasterSegment(frame, joints[1], joints[2], w2, w3, labels[1], kind);
  if (!sprite || !end) return;
  const top = end.y + sprite.anchor[1];
  if (mirrored) {
    const left = end.right - (spriteWidth(sprite) - 1) - sprite.anchor[0];
    stampSprite(frame, sprite, left, top, spriteLabel, kind, true);
  } else {
    stampSprite(frame, sprite, end.left + sprite.anchor[0], top, spriteLabel, kind);
  }
}

const add = (p, dx, dy) => [p[0] + dx, p[1] + dy];
const mirrorX = (p, pivotX) => [2 * pivotX - p[0], p[1]];

function buildFrontFrame(m, view, sheet, f) {
  const { width, height, pivotX } = m.frame;
  const frame = createFrame(width, height);
  const kind = 'front';
  const walk = sheet === 'walk';
  const bob = walk ? m.sheets.walk.bob[f] : 0;
  const breath = walk ? 0 : m.sheets.idle.breath[f];
  const upper = bob + breath;

  stampGrid(frame, view.head, 0, upper, kind);
  stampGrid(frame, view.neck, 0, upper, kind);
  stampGrid(frame, view.torso, 0, upper, kind, { stretchRow: view.torso.stretchRow, lowerDy: bob });
  stampGrid(frame, view.pelvis, 0, bob, kind);

  const n = view.legPhases.length;
  for (const side of ['left', 'right']) {
    const isLeft = side === 'left';
    const phaseIndex = walk ? (isLeft ? f : (f + n / 2) % n) : 2;
    const leg = view.legPhases[phaseIndex];
    const armDy = walk ? view.armPhases[phaseIndex] : 0;
    const flip = (p) => (isLeft ? p : mirrorX(p, pivotX));

    const rest = view.armRest;
    const arm = [
      flip(add(rest.shoulder, 0, upper)),
      flip(add(rest.elbow, 0, upper)),
      flip(add(rest.wrist, 0, upper + armDy)),
    ];
    const armLabels = isLeft ? ['a', 'b'] : ['A', 'B'];
    limb(frame, arm, [m.widths.upperArm, m.widths.forearm], armLabels, view.hand, kind, isLeft ? 'c' : 'C', !isLeft);

    const hip = flip([view.hip[0], view.hip[1] + bob]);
    const knee = flip(leg.knee);
    const ankle = flip(leg.ankle);
    const foot = view.feet[leg.foot];
    const legLabels = isLeft ? ['l', 'm'] : ['L', 'M'];
    limb(frame, [hip, knee, ankle], [m.widths.thighFront, m.widths.shinFront], legLabels, foot, kind, isLeft ? 'o' : 'O', !isLeft);
  }
  frame.motion = { upper, bob, waistY: view.torso.at[1] + view.torso.stretchRow };
  return frame;
}

function buildSideFrame(m, view, sheet, f) {
  const { width, height } = m.frame;
  const frame = createFrame(width, height);
  const kind = 'side';
  const walk = sheet === 'walk';
  const bob = walk ? m.sheets.walk.bob[f] : 0;
  const breath = walk ? 0 : m.sheets.idle.breath[f];
  const upper = bob + breath;

  stampGrid(frame, view.head, 0, upper, kind);
  stampGrid(frame, view.ear, 0, upper, kind);
  stampGrid(frame, view.neck, 0, upper, kind);
  stampGrid(frame, view.torso, 0, upper, kind, { stretchRow: view.torso.stretchRow, lowerDy: bob });
  stampGrid(frame, view.pelvis, 0, bob, kind);

  const n = view.legPhases.length;
  for (const near of [true, false]) {
    const phaseIndex = walk ? (near ? f : (f + n / 2) % n) : 2;
    const dx = near ? 0 : view.farOffset;

    const armPhase = view.armPhases[phaseIndex];
    const shoulder = add(view.armRest.shoulder, dx, upper);
    const arm = [shoulder, add(shoulder, ...armPhase.elbow), add(shoulder, ...armPhase.wrist)];
    limb(frame, arm, [m.widths.upperArm, m.widths.forearm], near ? ['a', 'b'] : ['A', 'B'], view.hand, kind, near ? 'c' : 'C');

    const leg = view.legPhases[phaseIndex];
    const hip = [view.hip[0] + dx, view.hip[1] + bob];
    const ankle = [leg.ankle[0] + dx, leg.ankle[1]];
    // Rodilla: punto medio empujado hacia delante (−x) según la flexión.
    const knee = [(hip[0] + ankle[0]) / 2 - leg.bend, (hip[1] + ankle[1]) / 2];
    const foot = view.feet[leg.foot];
    limb(frame, [hip, knee, ankle], [m.widths.thighSide, m.widths.shinSide], near ? ['l', 'm'] : ['L', 'M'], foot, kind, near ? 'o' : 'O');
  }
  frame.motion = { upper, bob, waistY: view.torso.at[1] + view.torso.stretchRow };
  return frame;
}

/**
 * Cuadros etiquetados del maniquí para las 4 vistas. `right` es el espejo de
 * `left` (la luz se calcula más tarde, ya reflejada).
 */
export function buildMannequin(m) {
  const out = {};
  for (const [name, view] of Object.entries(m.views)) {
    const build = view.kind === 'side' ? buildSideFrame : buildFrontFrame;
    out[name] = {};
    for (const [sheet, spec] of Object.entries(m.sheets)) {
      out[name][sheet] = Array.from({ length: spec.frames }, (_, f) => build(m, view, sheet, f));
    }
  }
  out.right = {};
  for (const [sheet, frames] of Object.entries(out.left)) {
    out.right[sheet] = frames.map(fr => mirrorFrame(fr, m.frame.pivotX));
  }
  return out;
}

/** Desplazamiento vertical de una parte respecto del cuadro de referencia (idle 0). */
export function partTop(frame, label) {
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (frame.part[y * frame.width + x] === label) return y;
    }
  }
  return null;
}
