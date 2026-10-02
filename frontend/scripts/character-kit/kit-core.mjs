/**
 * Núcleo del kit de personajes SIEP (método A: kit por código).
 *
 * Funciones puras, sin E/S: reciben mapas de etiquetas y datos del kit y
 * devuelven píxeles RGBA. El mismo núcleo sirve al generador (Node) y, más
 * adelante, a la composición del avatar en el navegador.
 *
 * Modelo:
 *   - Un CUADRO es una grilla W×H de celdas. Cada celda lleva la pieza que la
 *     ocupa: `part` (parte del cuerpo o de una pieza), `mat` (ranura de
 *     material de la receta), `z` (profundidad para sombras proyectadas) y
 *     `far` (miembro lejano en perfil: un tono más oscuro).
 *   - La LUZ se calcula después de componer (y después de reflejar), siempre
 *     desde arriba-izquierda en pantalla. Por eso la vista derecha puede salir
 *     del espejo de la izquierda sin heredar una luz al revés.
 *   - Los DETALLES (ojos, mechones, cremallera) se pintan encima con tono
 *     explícito y el CONTORNO de 1 px se añade al final por fuera de la silueta.
 */

export const TONE = Object.freeze({ HI: 0, BASE: 1, SHADE: 2, DEEP: 3 });

// ── Grillas de texto ──────────────────────────────────────────────────────────

/**
 * Convierte una grilla de texto en filas de caracteres. Ignora la indentación
 * común y las líneas vacías del borde; '.' y ' ' son celdas vacías.
 */
export function parseGrid(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const indent = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  const rows = lines.map(l => l.slice(indent).replace(/\s+$/, ''));
  const width = Math.max(...rows.map(r => r.length));
  return rows.map(r => r.padEnd(width, '.'));
}

export function isEmptyChar(ch) {
  return ch === '.' || ch === ' ' || ch === undefined;
}

// ── Cuadro compuesto ──────────────────────────────────────────────────────────

export function createFrame(width, height) {
  const n = width * height;
  return {
    width,
    height,
    part: new Array(n).fill(null),
    mat: new Array(n).fill(null),
    z: new Float32Array(n),
    far: new Uint8Array(n),
    /** Tono fijado a mano (detalles); -1 = lo decide la luz. */
    fixedTone: new Int8Array(n).fill(-1),
    /** Color literal (p. ej. blanco del ojo); null = rampa del material. */
    literal: new Array(n).fill(null),
  };
}

export function cloneFrame(frame) {
  return {
    width: frame.width,
    height: frame.height,
    motion: frame.motion,
    part: frame.part.slice(),
    mat: frame.mat.slice(),
    z: frame.z.slice(),
    far: frame.far.slice(),
    fixedTone: frame.fixedTone.slice(),
    literal: frame.literal.slice(),
  };
}

export function inside(frame, x, y) {
  return x >= 0 && y >= 0 && x < frame.width && y < frame.height;
}

export function setCell(frame, x, y, cell) {
  if (!inside(frame, x, y)) return;
  const i = y * frame.width + x;
  frame.part[i] = cell.part;
  frame.mat[i] = cell.mat ?? null;
  frame.z[i] = cell.z ?? 0;
  frame.far[i] = cell.far ? 1 : 0;
  frame.fixedTone[i] = cell.tone ?? -1;
  frame.literal[i] = cell.literal ?? null;
}

export function clearCell(frame, x, y) {
  if (!inside(frame, x, y)) return;
  const i = y * frame.width + x;
  frame.part[i] = null;
  frame.mat[i] = null;
  frame.z[i] = 0;
  frame.far[i] = 0;
  frame.fixedTone[i] = -1;
  frame.literal[i] = null;
}

/** Espejo horizontal alrededor de la columna del pivote (x ↔ 2·pivotX − x). */
export function mirrorFrame(frame, pivotX) {
  const out = createFrame(frame.width, frame.height);
  out.motion = frame.motion;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const mx = 2 * pivotX - x;
      if (mx < 0 || mx >= frame.width) continue;
      const src = y * frame.width + x;
      const dst = y * frame.width + mx;
      out.part[dst] = frame.part[src];
      out.mat[dst] = frame.mat[src];
      out.z[dst] = frame.z[src];
      out.far[dst] = frame.far[src];
      out.fixedTone[dst] = frame.fixedTone[src];
      out.literal[dst] = frame.literal[src];
    }
  }
  return out;
}

// ── Luz desde arriba-izquierda ────────────────────────────────────────────────

/**
 * Calcula el tono de cada celda ocupada.
 *
 *   1. Base en todo el cuerpo.
 *   2. Borde derecho → sombra (banda de `shadeWidth` px según la parte).
 *   3. Borde inferior → sombra.
 *   4. Borde izquierdo (y superior, si no es borde derecho) → luz.
 *   5. Sombra proyectada: si la celda de arriba o la de arriba-izquierda
 *      pertenece a algo que está DELANTE (más z), la celda queda en sombra;
 *      si además es el mismo material, en sombra profunda (separa la manga
 *      de la chaqueta, el cuello del mentón, el flequillo de la frente).
 *   6. Miembros lejanos (perfil): un tono más oscuro.
 *   7. Tonos fijados por detalles: mandan siempre.
 *
 * `rules.shadeWidth(part)` y `rules.highlight(part)` permiten ajustar por parte.
 */
export function computeTones(frame, rules = {}) {
  const { width, height } = frame;
  const tones = new Int8Array(width * height).fill(-1);
  const shadeWidth = rules.shadeWidth ?? (() => 1);
  const castDepth = rules.castDepth ?? (() => 1);
  const highlight = rules.highlight ?? (() => true);
  // Grupo de luz: segmentos del mismo miembro (brazo+antebrazo, muslo+pierna,
  // torso+pelvis) se iluminan como un solo volumen si comparten material.
  const group = rules.group ?? (part => part);
  const region = (i) => (frame.part[i] === null ? null : `${group(frame.part[i])}|${frame.mat[i]}`);
  const at = (x, y) => (inside(frame, x, y) ? y * width + x : -1);
  // Un vecino es BORDE de la forma si está vacío o detrás (menos z). Lo que
  // tapa por delante no corta el volumen: el torso sigue detrás del brazo.
  const isEdge = (i, x, y) => {
    const j = at(x, y);
    if (j < 0 || frame.part[j] === null) return true;
    if (region(j) === region(i)) return false;
    return frame.z[j] < frame.z[i];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (frame.part[i] === null) continue;
      const me = region(i);
      let tone = TONE.BASE;

      // 2. Banda de sombra en el borde derecho.
      const sw = shadeWidth(frame.part[i], frame.mat[i]);
      let rightEdge = false;
      for (let k = 1; k <= sw; k++) {
        if (isEdge(i, x + k, y)) { rightEdge = true; break; }
      }
      // 3. Borde inferior.
      const bottomEdge = isEdge(i, x, y + 1);
      // 4. Bordes iluminados.
      const leftEdge = isEdge(i, x - 1, y);
      const topEdge = isEdge(i, x, y - 1);

      if (rightEdge || bottomEdge) tone = TONE.SHADE;
      else if (highlight(frame.part[i], frame.mat[i]) && (leftEdge || topEdge)) tone = TONE.HI;

      // 5. Sombra proyectada por lo que está delante, arriba o arriba-izquierda
      //    (hasta `castDepth` px: en el retrato el mentón sombrea más cuello).
      const depth = castDepth(frame.part[i], frame.mat[i]);
      cast: for (let k = 1; k <= depth; k++) {
        for (const [dx, dy] of [[0, -k], [-k, -k]]) {
          const j = at(x + dx, y + dy);
          if (j < 0 || frame.part[j] === null) continue;
          if (region(j) === me) continue;
          if (frame.z[j] > frame.z[i]) {
            const sameMat = frame.mat[j] === frame.mat[i];
            tone = Math.max(tone, sameMat && k === 1 ? TONE.DEEP : TONE.SHADE);
            break cast;
          }
        }
      }

      // 6. Miembro lejano: un tono más oscuro.
      if (frame.far[i]) tone = Math.min(TONE.DEEP, tone + 1);

      // 7. Detalle con tono explícito.
      if (frame.fixedTone[i] >= 0) tone = frame.fixedTone[i];
      tones[i] = tone;
    }
  }
  return tones;
}

// ── Color, contorno y salida RGBA ─────────────────────────────────────────────

export function hexToRgb(hex) {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Pinta el cuadro: rampa del material según tono, contorno de 1 px por fuera
 * (vecindad 4) y alfa binario. Devuelve un Uint8Array RGBA.
 */
export function renderFrame(frame, tones, materials, outlineHex) {
  const { width, height } = frame;
  const rgba = new Uint8Array(width * height * 4);
  const outline = hexToRgb(outlineHex);
  for (let i = 0; i < width * height; i++) {
    if (frame.part[i] === null) continue;
    let hex = frame.literal[i];
    if (!hex) {
      const ramp = materials[frame.mat[i]];
      if (!ramp) throw new Error(`material sin rampa: ${frame.mat[i]} (parte ${frame.part[i]})`);
      hex = ramp[Math.max(0, Math.min(ramp.length - 1, tones[i]))];
    }
    const [r, g, b] = hexToRgb(hex);
    rgba.set([r, g, b, 255], i * 4);
  }
  // Contorno exterior: celdas vacías con algún vecino-4 ocupado.
  const filled = (x, y) => inside(frame, x, y) && frame.part[y * width + x] !== null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        rgba.set([...outline, 255], (y * width + x) * 4);
      }
    }
  }
  return rgba;
}

/** Copia un cuadro RGBA dentro de una hoja en la celda (col, row). */
export function blitFrame(sheet, sheetWidth, frameRgba, frameWidth, frameHeight, col, row) {
  for (let y = 0; y < frameHeight; y++) {
    const src = y * frameWidth * 4;
    const dst = ((row * frameHeight + y) * sheetWidth + col * frameWidth) * 4;
    sheet.set(frameRgba.subarray(src, src + frameWidth * 4), dst);
  }
}
