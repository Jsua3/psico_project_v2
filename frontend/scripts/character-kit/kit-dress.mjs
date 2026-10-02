/**
 * Vestir un cuadro del maniquí con una receta: cobertura por región, bordes
 * (puños, suelas), superposiciones ancladas a cabeza/torso/pelvis y luz.
 * Puro: recibe cuadros etiquetados y piezas ya cargadas.
 */

import { cloneFrame, computeTones, inside, isEmptyChar, parseGrid, renderFrame } from './kit-core.mjs';

/** Partes que son piel salvo que una pieza las cubra. */
const SKIN_LABELS = ['H', 'e', 'E', 'N', 'c', 'C'];

/** Capa de cada material: lo de más arriba proyecta sombra sobre lo de abajo. */
const MAT_LAYER = { skin: 0, sole: 0.03, shoes: 0.04, inner: 0.05, bottom: 0.1, top: 0.2, accent: 0.25, hair: 0 };

const LIGHT_GROUP = { a: 'armL', b: 'armL', A: 'armR', B: 'armR', l: 'legL', m: 'legL', L: 'legR', M: 'legR', T: 'trunk', P: 'trunk' };

export const LIGHT_RULES = {
  group: (part) => LIGHT_GROUP[part] ?? part,
  shadeWidth: (part) => (part === 'H' || part === 'T' || part === 'P' || part === 'hair' ? 2 : 1),
};

/** Superposiciones de una pieza para una vista; `right` sin dibujo propio = espejo de `left`. */
export function overlaysFor(piece, view, pivotX) {
  const own = piece.views?.[view];
  if (own) return own.map(o => ({ ...o, rows: parseGrid(o.grid), mirrored: false }));
  if (view === 'right' && piece.views?.left) {
    return piece.views.left.map(o => ({ ...o, rows: parseGrid(o.grid), mirrored: true, pivotX }));
  }
  return [];
}

function applyEdges(frame, rule) {
  for (const label of rule.labels) {
    for (let x = 0; x < frame.width; x++) {
      for (let y = frame.height - 1; y >= 0; y--) {
        const i = y * frame.width + x;
        if (frame.part[i] !== label) continue;
        if (rule.mat) frame.mat[i] = rule.mat;
        if (rule.tone !== undefined) frame.fixedTone[i] = rule.tone;
        break;
      }
    }
  }
}

function zOfPart(frame, label) {
  const i = frame.part.indexOf(label);
  return i < 0 ? 0 : frame.z[i];
}

/**
 * Filas de destino de una fila de reposo, según cómo se movió su ancla en este
 * cuadro (`frame.motion`, lo escribe el constructor del maniquí):
 *   - cabeza y lo que cuelga de ella: `upper` (bob + respiración);
 *   - torso: por encima de la cintura `upper`, desde la cintura `bob`; si la
 *     respiración abrió un hueco, la fila de la cintura se repite (igual que el
 *     maniquí) para que la abertura de la chaqueta se estire con el cuerpo;
 *   - pelvis y el resto: `bob`.
 * Sin `motion` (retrato) no hay desplazamiento.
 */
export function targetRows(frame, anchor, restY) {
  const m = frame.motion;
  if (!m) return [restY];
  if (anchor === 'H') return [restY + m.upper];
  if (anchor === 'T') {
    if (restY < m.waistY) return [restY + m.upper];
    if (restY === m.waistY && m.bob - m.upper === 1) return [restY + m.upper, restY + m.bob];
    return [restY + m.bob];
  }
  return [restY + m.bob];
}

function applyOverlay(frame, overlay, piece) {
  const [ax, ay] = overlay.at;
  const allowed = new Set(overlay.parts ?? [overlay.anchor]);
  // Lo que se crea en modo cover hereda la profundidad del ancla (o la de la pieza).
  const coverZ = piece.z ?? zOfPart(frame, overlay.anchor);
  overlay.rows.forEach((row, r) => {
    const ys = targetRows(frame, overlay.anchor, ay + r);
    [...row].forEach((ch, c) => {
      if (isEmptyChar(ch)) return;
      const spec = overlay.legend[ch];
      if (!spec) throw new Error(`pieza ${piece.id}: símbolo sin leyenda «${ch}»`);
      let x = ax + c;
      if (overlay.mirrored) x = 2 * overlay.pivotX - x;
      for (const y of ys) paintCell(frame, x, y, spec, overlay, allowed, coverZ, piece);
    });
  });
}

function paintCell(frame, x, y, spec, overlay, allowed, coverZ, piece) {
  if (!inside(frame, x, y)) return;
  const i = y * frame.width + x;
  if (overlay.mode === 'paint') {
    if (!allowed.has(frame.part[i])) return;
  } else {
    // cover: crea o reemplaza la celda con la identidad de la pieza.
    frame.part[i] = piece.part ?? overlay.anchor;
    frame.z[i] = coverZ;
    frame.far[i] = 0;
    frame.fixedTone[i] = -1;
    frame.literal[i] = null;
  }
  if (spec.mat) frame.mat[i] = spec.mat;
  if (spec.tone !== undefined) frame.fixedTone[i] = spec.tone;
  if (spec.literal) frame.literal[i] = spec.literal;
}

/** Superposiciones del retrato de una pieza (una sola vista, de frente). */
export function portraitOverlays(piece) {
  return (piece.portrait ?? []).map(o => ({ ...o, rows: parseGrid(o.grid), mirrored: false }));
}

/**
 * Viste un cuadro etiquetado. Las superposiciones se autoran sobre el cuadro
 * de reposo y se desplazan con `frame.motion` (ver `targetRows`).
 * `overlaysOf(pieza)` elige qué superposiciones aplicar (vista del sprite o retrato).
 */
export function dressFrame(labelFrame, pieces, overlaysOf) {
  const frame = cloneFrame(labelFrame);
  const ordered = Object.values(pieces);

  // 1. Cobertura por región.
  const coverage = {};
  for (const label of SKIN_LABELS) coverage[label] = 'skin';
  for (const piece of ordered) Object.assign(coverage, piece.coverage ?? {});
  for (let i = 0; i < frame.part.length; i++) {
    const label = frame.part[i];
    if (label === null) continue;
    const mat = coverage[label];
    if (!mat) throw new Error(`región «${label}» sin material`);
    frame.mat[i] = mat;
  }

  // 2. Bordes (puños, suelas).
  for (const piece of ordered) for (const rule of piece.edges ?? []) applyEdges(frame, rule);

  // 3. Superposiciones ancladas: primero ropa, luego rostro, al final pelo.
  const order = ['bottom', 'shoes', 'top', 'face', 'hair'];
  const sorted = [...ordered].sort((p, q) => order.indexOf(p.kind) - order.indexOf(q.kind));
  for (const piece of sorted) {
    for (const overlay of overlaysOf(piece)) applyOverlay(frame, overlay, piece);
  }

  // 4. Capa de material: la ropa de encima proyecta sombra sobre la de abajo.
  for (let i = 0; i < frame.part.length; i++) {
    if (frame.part[i] !== null) frame.z[i] += MAT_LAYER[frame.mat[i]] ?? 0;
  }
  return frame;
}

/** Luz del retrato: formas grandes, bandas de sombra más anchas y sombra del mentón. */
export const PORTRAIT_LIGHT_RULES = {
  group: (part) => part,
  shadeWidth: (part) => ({ H: 4, hair: 4, T: 5, N: 3 }[part] ?? 1),
  castDepth: (part) => ({ N: 4, H: 2, T: 2 }[part] ?? 1),
};

/** Cuadro vestido → RGBA con luz, rampas de la receta y contorno. */
export function paintFrame(dressed, materials, outlineHex, literals = {}, rules = LIGHT_RULES) {
  const tones = computeTones(dressed, rules);
  const resolved = cloneLiterals(dressed, literals);
  return renderFrame(resolved, tones, materials, outlineHex);
}

function cloneLiterals(frame, literals) {
  const out = cloneFrame(frame);
  for (let i = 0; i < out.literal.length; i++) {
    const key = out.literal[i];
    if (key && !key.startsWith('#')) {
      if (!literals[key]) throw new Error(`color literal sin definir: ${key}`);
      out.literal[i] = literals[key];
    }
  }
  return out;
}
