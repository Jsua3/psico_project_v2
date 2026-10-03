/**
 * Motor del kit de personajes SIEP (método A: kit por código).
 *
 * Funciones puras, sin imports y con sintaxis borrable (sin `enum`, sin
 * `namespace`, sin propiedades de parámetro): lo importan la app Angular y los
 * scripts de Node 24 (type stripping), así el navegador y el CI producen los
 * mismos píxeles.
 *
 * Modelo:
 *   - Un CUADRO es una grilla W×H de celdas. Cada celda lleva la parte que la
 *     ocupa (`part`), la ranura de material de la receta (`mat`), la
 *     profundidad (`z`) y si es un miembro lejano en perfil (`far`).
 *   - La LUZ se calcula después de componer (y después de reflejar), siempre
 *     desde arriba-izquierda en pantalla. Por eso la vista derecha puede salir
 *     del espejo de la izquierda sin heredar una luz al revés.
 *   - Los DETALLES (ojos, mechones, cremallera) se pintan con tono explícito y
 *     el CONTORNO de 1 px se añade al final por fuera de la silueta.
 */

// ── Contrato de hojas ─────────────────────────────────────────────────────────

export type ViewId = 'down' | 'left' | 'right' | 'up';
export type ViewKind = 'front' | 'back' | 'side';
export type SheetId = 'idle' | 'walk';
export type PieceKind = 'hair' | 'face' | 'top' | 'layer' | 'bottom' | 'shoes' | 'accessory';
export type PortraitState = 'neutral' | 'preocupada' | 'triste' | 'alegre';

export const FRAME = Object.freeze({ width: 48, height: 72, pivotX: 24, pivotY: 68 });
/** Retrato de 32×32: se muestra a ×3 en una caja de 96 px (estilo tierno de poco detalle). */
export const PORTRAIT_FRAME = Object.freeze({ width: 32, height: 32 });
export const SHEETS: Readonly<Record<SheetId, { readonly frames: number; readonly fps: number }>> = Object.freeze({
  idle: Object.freeze({ frames: 4, fps: 4 }),
  walk: Object.freeze({ frames: 6, fps: 10 }),
});
export const SHEET_IDS: readonly SheetId[] = Object.freeze(['idle', 'walk']);
export const VIEW_ROWS: readonly ViewId[] = Object.freeze(['down', 'left', 'right', 'up']);
export const PORTRAIT_STATES: readonly PortraitState[] = Object.freeze(['neutral', 'preocupada', 'triste', 'alegre']);
export const OUTLINE = '#15131d';
export const TONE = Object.freeze({ HI: 0, BASE: 1, SHADE: 2, DEEP: 3 });

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Motion {
  upper: number;
  bob: number;
  waistY: number;
}

export interface Frame {
  width: number;
  height: number;
  part: (string | null)[];
  mat: (string | null)[];
  z: Float32Array;
  far: Uint8Array;
  /** Tono fijado a mano (detalles); -1 = lo decide la luz. */
  fixedTone: Int8Array;
  /** Color literal (`#rrggbb`) o clave de literal de la receta; null = rampa del material. */
  literal: (string | null)[];
  motion?: Motion;
}

export interface CellSpec {
  mat?: string;
  tone?: number;
  literal?: string;
}

export type OverlayMode = 'paint' | 'cover' | 'repaint';

export interface Overlay {
  anchor: string;
  at: [number, number];
  mode: OverlayMode;
  parts?: string[];
  complexions?: string[];
  sheets?: SheetId[];
  frames?: number[];
  legend: Record<string, CellSpec>;
  /** En el paquete: grilla normalizada (filas unidas con \n) codificada en RLE. */
  grid: string;
}

export interface EdgeRule {
  labels: string[];
  /** Fila de abajo (puños, suelas, caña) o de arriba (empeine) de cada columna de la etiqueta. */
  edge: 'bottom' | 'top';
  /** Filas que pinta desde el borde hacia dentro (por defecto 1). */
  depth?: number;
  mat?: string;
  tone?: number;
}

export interface Piece {
  id: string;
  kind: PieceKind;
  slots?: string[];
  part?: string;
  z?: number;
  volume?: boolean;
  asymmetric?: boolean;
  coverage?: Record<string, string>;
  edges?: EdgeRule[];
  views: Partial<Record<ViewId, Overlay[]>>;
  portrait?: Overlay[];
  expressions?: Partial<Record<PortraitState, Overlay[]>>;
}

export type Ramp = readonly [string, string, string, string];

export interface RecipePieces {
  hair: string;
  face: string;
  top: string;
  layer?: string;
  bottom: string;
  shoes: string;
  accessories?: string[];
}

export interface Recipe {
  id?: string;
  displayName?: string;
  kind?: 'jugable' | 'npc' | 'figurante';
  complexion: string;
  pieces: RecipePieces;
  colors: Record<string, string>;
  literals?: Record<string, string>;
  portraits?: PortraitState[];
  provenance?: { source: string; license: string };
}

/** Cambios de una variante sobre una receta (p. ej. el jugable «con bata»). */
export interface RecipeVariant {
  pieces?: Partial<RecipePieces>;
  colors?: Record<string, string>;
}

/** Receta con la variante aplicada encima; no modifica la original. */
export function applyRecipeVariant(recipe: Recipe, variant: RecipeVariant): Recipe {
  return {
    ...recipe,
    pieces: { ...recipe.pieces, ...(variant.pieces ?? {}) },
    colors: { ...recipe.colors, ...(variant.colors ?? {}) },
  };
}

export interface EncodedFrame {
  labels: string;
  motion: Motion;
}

export interface BundleView {
  kind: ViewKind;
  idle: EncodedFrame[];
  walk: EncodedFrame[];
}

export interface BundleBust {
  grid: string;
  z: Record<string, number>;
}

export interface OutfitVariant {
  id: string;
  colors: Record<string, string>;
}

export interface Outfit {
  id: string;
  label: string;
  top: string;
  layer?: string;
  bottom: string;
  shoes: string;
  variants: OutfitVariant[];
}

export interface EditorOptions {
  complexions: string[];
  skins: string[];
  hair: string[];
  hairColors: string[];
  face: string;
  accessories: string[];
  outfits: Outfit[];
}

/** Correspondencias de todo el juego → receta, y opciones del editor (`character-kit/catalog.json`). */
export interface Catalog {
  schemaVersion: 1;
  defaultRecipe: string;
  playables: string[];
  actors: Record<string, string>;
  scenarioNpcs: Record<string, string>;
  speakers: Record<string, string>;
  voices: string[];
  portraitKeys: Record<string, string>;
  guides: Record<string, string>;
  templates: Record<string, string>;
  extras: string;
  emotionToPortrait: Record<string, PortraitState>;
  /** Variantes que el build genera de cada jugable (decisión 17: «bata»). */
  playableVariants: Record<string, RecipeVariant>;
  editor: EditorOptions;
}

export interface KitBundle {
  schemaVersion: 1;
  complexions: Record<string, Record<ViewId, BundleView>>;
  busts: Record<string, BundleBust>;
  pieces: Record<string, Piece>;
  ramps: Record<string, Ramp>;
  literals: Record<string, string>;
  recipes: Record<string, Recipe>;
  catalog: Catalog;
}

export interface RgbaImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export interface ComposedCharacter {
  idle: RgbaImage;
  walk: RgbaImage;
  portraits: Partial<Record<PortraitState, RgbaImage>>;
  /** Solo con `keepDressed`: cuadros vestidos por hoja, vista y cuadro (para el validador). */
  dressed?: Record<SheetId, Record<ViewId, Frame[]>>;
}

export interface LightRules {
  group?: (part: string) => string;
  shadeWidth?: (part: string, mat: string | null) => number;
  castDepth?: (part: string, mat: string | null) => number;
  highlight?: (part: string, mat: string | null) => boolean;
}

// ── Grillas de texto y RLE ────────────────────────────────────────────────────

/**
 * Convierte una grilla de texto en filas de caracteres. Ignora la indentación
 * común, los \r y las líneas vacías del borde; '.' y ' ' son celdas vacías.
 */
export function parseGrid(text: string): string[] {
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length && lines[0].trim() === '') lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  const indent = Math.min(...lines.filter(l => l.trim()).map(l => (l.match(/^ */) ?? [''])[0].length));
  const rows = lines.map(l => l.slice(indent).replace(/\s+$/, ''));
  const width = Math.max(...rows.map(r => r.length));
  return rows.map(r => r.padEnd(width, '.'));
}

export function isEmptyChar(ch: string | undefined): boolean {
  return ch === '.' || ch === ' ' || ch === undefined;
}

/** RLE: `<cuenta><carácter>` por tramo. Los caracteres no pueden ser dígitos. */
export function encodeRle(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch >= '0' && ch <= '9') throw new Error(`RLE: dígito «${ch}» en la posición ${i}`);
    let j = i + 1;
    while (j < text.length && text[j] === ch) j++;
    out += `${j - i}${ch}`;
    i = j;
  }
  return out;
}

export function decodeRle(rle: string): string {
  const re = /(\d+)(\D)/g;
  let out = '';
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rle)) !== null) {
    if (m.index !== consumed) throw new Error(`RLE inválido en la posición ${consumed}`);
    out += m[2].repeat(Number(m[1]));
    consumed = re.lastIndex;
  }
  if (consumed !== rle.length) throw new Error(`RLE inválido en la posición ${consumed}`);
  return out;
}

/** Filas de una grilla del paquete (RLE de filas unidas con \n). */
export function gridRows(encoded: string): string[] {
  return decodeRle(encoded).split('\n');
}

// ── Cuadro ────────────────────────────────────────────────────────────────────

export function createFrame(width: number, height: number): Frame {
  const n = width * height;
  return {
    width,
    height,
    part: new Array<string | null>(n).fill(null),
    mat: new Array<string | null>(n).fill(null),
    z: new Float32Array(n),
    far: new Uint8Array(n),
    fixedTone: new Int8Array(n).fill(-1),
    literal: new Array<string | null>(n).fill(null),
  };
}

export function cloneFrame(frame: Frame): Frame {
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

export function inside(frame: Frame, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < frame.width && y < frame.height;
}

/** Espejo horizontal alrededor de la columna del pivote (x ↔ 2·pivotX − x). */
export function mirrorFrame(frame: Frame, pivotX: number): Frame {
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

// ── Mapas de etiquetas del maniquí ────────────────────────────────────────────

/** Profundidad por etiqueta (sombras proyectadas). Las vistas de espalda usan `front`. */
export const LABEL_Z: Readonly<Record<'front' | 'side', Readonly<Record<string, number>>>> = Object.freeze({
  // La pelvis comparte profundidad con los muslos: la unión no es un borde.
  front: Object.freeze({ H: 5, e: 5, E: 5, N: 2.5, T: 3, P: 1, a: 4, b: 4, c: 4.2, A: 4, B: 4, C: 4.2, l: 1, m: 1, o: 0.9, L: 1, M: 1, O: 0.9 }),
  // Perfil: todo lo lejano queda detrás de lo cercano (brazo lejano el más al fondo).
  side: Object.freeze({ H: 5, e: 5.1, N: 2.5, T: 3, P: 1, a: 4, b: 4, c: 4.2, A: 0.5, B: 0.5, C: 0.55, l: 1, m: 1, o: 0.9, L: 0.7, M: 0.7, O: 0.65 }),
});

/** Miembros lejanos en perfil: un tono más oscuro. */
export const FAR_LABELS: ReadonlySet<string> = new Set(['A', 'B', 'C', 'L', 'M', 'O']);

export function labelZ(kind: ViewKind, label: string): number {
  return LABEL_Z[kind === 'side' ? 'side' : 'front'][label] ?? 0;
}

export function encodeLabelFrame(frame: Frame): EncodedFrame {
  if (!frame.motion) throw new Error('cuadro del maniquí sin movimiento');
  return { labels: encodeRle(frame.part.map(p => p ?? '.').join('')), motion: frame.motion };
}

export function decodeLabelFrame(encoded: EncodedFrame, kind: ViewKind, width: number, height: number): Frame {
  const labels = decodeRle(encoded.labels);
  if (labels.length !== width * height) throw new Error(`mapa de etiquetas de ${labels.length} celdas; se esperaban ${width * height}`);
  const frame = createFrame(width, height);
  frame.motion = { ...encoded.motion };
  for (let i = 0; i < labels.length; i++) {
    const ch = labels[i];
    if (ch === '.') continue;
    frame.part[i] = ch;
    frame.z[i] = labelZ(kind, ch);
    frame.far[i] = kind === 'side' && FAR_LABELS.has(ch) ? 1 : 0;
  }
  return frame;
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
 *      si además es el mismo material, en sombra profunda.
 *   6. Miembros lejanos (perfil): un tono más oscuro.
 *   7. Tonos fijados por detalles: mandan siempre.
 */
export function computeTones(frame: Frame, rules: LightRules = {}): Int8Array {
  const { width, height } = frame;
  const tones = new Int8Array(width * height).fill(-1);
  const shadeWidth = rules.shadeWidth ?? (() => 1);
  const castDepth = rules.castDepth ?? (() => 1);
  const highlight = rules.highlight ?? (() => true);
  // Grupo de luz: segmentos del mismo miembro se iluminan como un solo volumen
  // si comparten material.
  const group = rules.group ?? ((part: string) => part);
  const region = (i: number): string | null => {
    const part = frame.part[i];
    return part === null ? null : `${group(part)}|${frame.mat[i]}`;
  };
  const at = (x: number, y: number): number => (inside(frame, x, y) ? y * width + x : -1);
  // Un vecino es BORDE de la forma si está vacío o detrás (menos z). Lo que
  // tapa por delante no corta el volumen: el torso sigue detrás del brazo.
  const isEdge = (i: number, x: number, y: number): boolean => {
    const j = at(x, y);
    if (j < 0 || frame.part[j] === null) return true;
    if (region(j) === region(i)) return false;
    return frame.z[j] < frame.z[i];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const part = frame.part[i];
      if (part === null) continue;
      const mat = frame.mat[i];
      const me = region(i);
      let tone: number = TONE.BASE;

      const sw = shadeWidth(part, mat);
      let rightEdge = false;
      for (let k = 1; k <= sw; k++) {
        if (isEdge(i, x + k, y)) { rightEdge = true; break; }
      }
      const bottomEdge = isEdge(i, x, y + 1);
      const leftEdge = isEdge(i, x - 1, y);
      const topEdge = isEdge(i, x, y - 1);

      if (rightEdge || bottomEdge) tone = TONE.SHADE;
      else if (highlight(part, mat) && (leftEdge || topEdge)) tone = TONE.HI;

      const depth = castDepth(part, mat);
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

      if (frame.far[i]) tone = Math.min(TONE.DEEP, tone + 1);
      if (frame.fixedTone[i] >= 0) tone = frame.fixedTone[i];
      tones[i] = tone;
    }
  }
  return tones;
}

// ── Color, contorno y salida RGBA ─────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Pinta el cuadro: rampa del material según tono, contorno de 1 px por fuera
 * (vecindad 4) y alfa binario. Los literales ya deben venir resueltos a `#rrggbb`.
 */
export function renderFrame(frame: Frame, tones: Int8Array, materials: Record<string, Ramp>, outlineHex: string): Uint8Array {
  const { width, height } = frame;
  const rgba = new Uint8Array(width * height * 4);
  const outline = hexToRgb(outlineHex);
  for (let i = 0; i < width * height; i++) {
    if (frame.part[i] === null) continue;
    let hex = frame.literal[i];
    if (!hex) {
      const mat = frame.mat[i];
      const ramp = mat === null ? undefined : materials[mat];
      if (!ramp) throw new Error(`material sin rampa: ${mat} (parte ${frame.part[i]})`);
      hex = ramp[Math.max(0, Math.min(ramp.length - 1, tones[i]))];
    }
    const [r, g, b] = hexToRgb(hex);
    rgba.set([r, g, b, 255], i * 4);
  }
  const filled = (x: number, y: number): boolean => inside(frame, x, y) && frame.part[y * width + x] !== null;
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
export function blitFrame(sheet: Uint8Array, sheetWidth: number, frameRgba: Uint8Array, frameWidth: number, frameHeight: number, col: number, row: number): void {
  for (let y = 0; y < frameHeight; y++) {
    const src = y * frameWidth * 4;
    const dst = ((row * frameHeight + y) * sheetWidth + col * frameWidth) * 4;
    sheet.set(frameRgba.subarray(src, src + frameWidth * 4), dst);
  }
}

// ── Vestir ────────────────────────────────────────────────────────────────────

/** Partes que son piel salvo que una pieza las cubra. */
export const SKIN_LABELS: readonly string[] = Object.freeze(['H', 'e', 'E', 'N', 'c', 'C']);

/** Orden de aplicación: cobertura, bordes y superposiciones van en este orden. */
export const KIND_ORDER: readonly PieceKind[] = Object.freeze(['bottom', 'shoes', 'top', 'layer', 'face', 'accessory', 'hair']);

/** Capa de cada material: lo de más arriba proyecta sombra sobre lo de abajo. */
export const MAT_LAYER: Readonly<Record<string, number>> = Object.freeze({
  skin: 0, sole: 0.03, shoes: 0.04, inner: 0.05, bottom: 0.1, top: 0.2, accent: 0.25, layer: 0.3, hair: 0,
});

const LIGHT_GROUP: Readonly<Record<string, string>> = Object.freeze({
  a: 'armL', b: 'armL', A: 'armR', B: 'armR', l: 'legL', m: 'legL', L: 'legR', M: 'legR', T: 'trunk', P: 'trunk',
});

export const LIGHT_RULES: LightRules = Object.freeze({
  group: (part: string) => LIGHT_GROUP[part] ?? part,
  shadeWidth: (part: string) => (part === 'H' || part === 'T' || part === 'P' || part === 'hair' ? 2 : 1),
});

/** Luz del retrato: formas grandes, bandas de sombra más anchas y sombra del mentón. */
const PORTRAIT_SHADE: Readonly<Record<string, number>> = Object.freeze({ H: 2, hair: 2, T: 2, N: 1 });
const PORTRAIT_CAST: Readonly<Record<string, number>> = Object.freeze({ N: 1, H: 1, T: 1 });
export const PORTRAIT_LIGHT_RULES: LightRules = Object.freeze({
  group: (part: string) => part,
  shadeWidth: (part: string) => PORTRAIT_SHADE[part] ?? 1,
  castDepth: (part: string) => PORTRAIT_CAST[part] ?? 1,
});

/** Superposición lista para aplicar: filas decodificadas y, si viene de un espejo, su eje. */
export interface ResolvedOverlay {
  anchor: string;
  at: [number, number];
  mode: OverlayMode;
  parts?: string[];
  legend: Record<string, CellSpec>;
  rows: string[];
  mirrored: boolean;
  pivotX: number;
}

export interface OverlayContext {
  pivotX: number;
  complexion: string;
  sheet: SheetId;
  frame: number;
}

function overlayApplies(o: Overlay, complexion: string, sheet: SheetId | null, frame: number | null): boolean {
  if (o.complexions && !o.complexions.includes(complexion)) return false;
  if (sheet !== null && o.sheets && !o.sheets.includes(sheet)) return false;
  if (frame !== null && o.frames && !o.frames.includes(frame)) return false;
  return true;
}

function resolveOverlay(o: Overlay, mirrored: boolean, pivotX: number): ResolvedOverlay {
  return { anchor: o.anchor, at: o.at, mode: o.mode, parts: o.parts, legend: o.legend, rows: gridRows(o.grid), mirrored, pivotX };
}

/** Superposiciones de una pieza para una vista; `right` sin dibujo propio = espejo de `left`. */
export function overlaysFor(piece: Piece, view: ViewId, ctx: OverlayContext): ResolvedOverlay[] {
  const own = piece.views[view];
  const mirrored = !own && view === 'right';
  const list = own ?? (mirrored ? piece.views.left : undefined) ?? [];
  return list
    .filter(o => overlayApplies(o, ctx.complexion, ctx.sheet, ctx.frame))
    .map(o => resolveOverlay(o, mirrored, ctx.pivotX));
}

/** Superposiciones del retrato de una pieza; un rostro usa la expresión del estado si la tiene. */
export function portraitOverlays(piece: Piece, complexion: string, state: PortraitState): ResolvedOverlay[] {
  const list = (piece.kind === 'face' ? piece.expressions?.[state] : undefined) ?? piece.portrait ?? [];
  return list.filter(o => overlayApplies(o, complexion, null, null)).map(o => resolveOverlay(o, false, 0));
}

/**
 * Filas de destino de una fila de reposo, según cómo se movió su ancla en este
 * cuadro (`frame.motion`):
 *   - cabeza y lo que cuelga de ella: `upper` (bob + respiración);
 *   - torso: por encima de la cintura `upper`, desde la cintura `bob`; si la
 *     respiración abrió un hueco, la fila de la cintura se repite;
 *   - pelvis y el resto: `bob`.
 * Sin `motion` (retrato) no hay desplazamiento.
 */
export function targetRows(frame: Frame, anchor: string, restY: number): number[] {
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

function applyEdges(frame: Frame, rule: EdgeRule): void {
  const depth = rule.depth ?? 1;
  const fromBottom = rule.edge === 'bottom';
  for (const label of rule.labels) {
    for (let x = 0; x < frame.width; x++) {
      let painted = 0;
      for (let k = 0; k < frame.height && painted < depth; k++) {
        const y = fromBottom ? frame.height - 1 - k : k;
        const i = y * frame.width + x;
        if (frame.part[i] !== label) {
          if (painted > 0) break;
          continue;
        }
        if (rule.mat) frame.mat[i] = rule.mat;
        if (rule.tone !== undefined) frame.fixedTone[i] = rule.tone;
        painted++;
      }
    }
  }
}

function zOfPart(frame: Frame, label: string): number {
  const i = frame.part.indexOf(label);
  return i < 0 ? 0 : frame.z[i];
}

function paintCell(frame: Frame, x: number, y: number, spec: CellSpec, overlay: ResolvedOverlay, allowed: ReadonlySet<string>, coverZ: number, piece: Piece): void {
  if (!inside(frame, x, y)) return;
  const i = y * frame.width + x;
  if (overlay.mode === 'cover') {
    // Crea o reemplaza la celda con la identidad de la pieza, salvo que lo que
    // ya hay esté delante (más z): un faldón no tapa la mano que cuelga encima.
    if (frame.part[i] !== null && frame.z[i] > coverZ) return;
    frame.part[i] = piece.part ?? overlay.anchor;
    frame.z[i] = coverZ;
    frame.far[i] = 0;
    frame.fixedTone[i] = -1;
    frame.literal[i] = null;
  } else {
    const part = frame.part[i];
    if (part === null || !allowed.has(part)) return;
    if (overlay.mode === 'repaint') {
      frame.fixedTone[i] = -1;
      frame.literal[i] = null;
    }
  }
  if (spec.mat) frame.mat[i] = spec.mat;
  if (spec.tone !== undefined) frame.fixedTone[i] = spec.tone;
  if (spec.literal) frame.literal[i] = spec.literal;
}

function applyOverlay(frame: Frame, overlay: ResolvedOverlay, piece: Piece): void {
  const [ax, ay] = overlay.at;
  const allowed = new Set(overlay.parts ?? [overlay.anchor]);
  // Lo que se crea en modo cover hereda la profundidad del ancla (o la de la pieza).
  const coverZ = piece.z ?? zOfPart(frame, overlay.anchor);
  overlay.rows.forEach((row, r) => {
    const ys = targetRows(frame, overlay.anchor, ay + r);
    [...row].forEach((ch, c) => {
      if (isEmptyChar(ch)) return;
      const spec = overlay.legend[ch];
      if (!spec) throw new Error(`pieza ${piece.kind}:${piece.id}: símbolo sin leyenda «${ch}»`);
      let x = ax + c;
      if (overlay.mirrored) x = 2 * overlay.pivotX - x;
      for (const y of ys) paintCell(frame, x, y, spec, overlay, allowed, coverZ, piece);
    });
  });
}

/** Ordena las piezas por `KIND_ORDER` (estable dentro del mismo tipo). */
export function sortPieces(pieces: Piece[]): Piece[] {
  return pieces
    .map((piece, index) => ({ piece, index }))
    .sort((p, q) => KIND_ORDER.indexOf(p.piece.kind) - KIND_ORDER.indexOf(q.piece.kind) || p.index - q.index)
    .map(({ piece }) => piece);
}

/**
 * Viste un cuadro etiquetado: cobertura por región, bordes (puños, suelas),
 * superposiciones ancladas y capa de material. Las piezas se aplican en
 * `KIND_ORDER`; las superposiciones se autoran sobre el cuadro de reposo y se
 * desplazan con `frame.motion`.
 */
export function dressFrame(labelFrame: Frame, pieces: Piece[], overlaysOf: (piece: Piece) => ResolvedOverlay[]): Frame {
  const frame = cloneFrame(labelFrame);
  const ordered = sortPieces(pieces);

  const coverage: Record<string, string> = {};
  for (const label of SKIN_LABELS) coverage[label] = 'skin';
  for (const piece of ordered) Object.assign(coverage, piece.coverage ?? {});
  for (let i = 0; i < frame.part.length; i++) {
    const label = frame.part[i];
    if (label === null) continue;
    const mat = coverage[label];
    if (!mat) throw new Error(`región «${label}» sin material`);
    frame.mat[i] = mat;
  }

  for (const piece of ordered) for (const rule of piece.edges ?? []) applyEdges(frame, rule);

  for (const piece of ordered) {
    for (const overlay of overlaysOf(piece)) applyOverlay(frame, overlay, piece);
  }

  for (let i = 0; i < frame.part.length; i++) {
    const mat = frame.mat[i];
    if (frame.part[i] !== null && mat !== null) frame.z[i] += MAT_LAYER[mat] ?? 0;
  }
  return frame;
}

/** Cuadro vestido → RGBA con luz, rampas, literales y contorno. */
export function paintFrame(dressed: Frame, materials: Record<string, Ramp>, literals: Record<string, string>, rules: LightRules = LIGHT_RULES): Uint8Array {
  const tones = computeTones(dressed, rules);
  const resolved = cloneFrame(dressed);
  for (let i = 0; i < resolved.literal.length; i++) {
    const key = resolved.literal[i];
    if (key && !key.startsWith('#')) {
      const hex = literals[key];
      if (!hex) throw new Error(`color literal sin definir: ${key}`);
      resolved.literal[i] = hex;
    }
  }
  return renderFrame(resolved, tones, materials, OUTLINE);
}

// ── Componer un personaje desde el paquete ────────────────────────────────────

const RECIPE_KINDS: readonly (keyof RecipePieces)[] = ['hair', 'face', 'top', 'layer', 'bottom', 'shoes'];

function recipeLabel(recipe: Recipe): string {
  return recipe.id ? `receta ${recipe.id}` : 'avatar';
}

/** Piezas de la receta, ya ordenadas por `KIND_ORDER`. */
export function resolvePieces(bundle: KitBundle, recipe: Recipe): Piece[] {
  const keys: string[] = [];
  for (const kind of RECIPE_KINDS) {
    const id = recipe.pieces[kind];
    if (typeof id === 'string') keys.push(`${kind}:${id}`);
  }
  for (const id of recipe.pieces.accessories ?? []) keys.push(`accessory:${id}`);
  return sortPieces(keys.map(key => {
    const piece = bundle.pieces[key];
    if (!piece) throw new Error(`${recipeLabel(recipe)}: pieza desconocida ${key}`);
    return piece;
  }));
}

/**
 * Ranuras de color que usan las piezas (más la piel), con la primera pieza que
 * usa cada una. Sirve para fallar pronto y con nombre cuando a una receta le
 * falta un color.
 */
export function requiredSlots(pieces: Piece[]): Map<string, string> {
  const slots = new Map<string, string>([['skin', 'cuerpo']]);
  const add = (mat: string | undefined, owner: string): void => {
    if (mat && !slots.has(mat)) slots.set(mat, owner);
  };
  for (const piece of pieces) {
    const owner = `${piece.kind}:${piece.id}`;
    for (const mat of Object.values(piece.coverage ?? {})) add(mat, owner);
    for (const rule of piece.edges ?? []) add(rule.mat, owner);
    const lists = [...Object.values(piece.views), piece.portrait, ...Object.values(piece.expressions ?? {})];
    for (const list of lists) {
      for (const overlay of list ?? []) for (const spec of Object.values(overlay.legend)) add(spec.mat, owner);
    }
  }
  return slots;
}

export function resolveMaterials(bundle: KitBundle, recipe: Recipe): Record<string, Ramp> {
  const out: Record<string, Ramp> = {};
  for (const [slot, rampId] of Object.entries(recipe.colors)) {
    const ramp = bundle.ramps[rampId];
    if (!ramp) throw new Error(`${recipeLabel(recipe)}: rampa desconocida ${rampId} (ranura ${slot})`);
    out[slot] = ramp;
  }
  return out;
}

function composeSheet(bundle: KitBundle, recipe: Recipe, pieces: Piece[], materials: Record<string, Ramp>, literals: Record<string, string>, sheet: SheetId, keep: Record<ViewId, Frame[]> | null): RgbaImage {
  const views = bundle.complexions[recipe.complexion];
  const frames = SHEETS[sheet].frames;
  const width = frames * FRAME.width;
  const height = VIEW_ROWS.length * FRAME.height;
  const rgba = new Uint8Array(width * height * 4);
  VIEW_ROWS.forEach((view, row) => {
    const bundleView = views[view];
    const encoded = bundleView[sheet];
    if (encoded.length !== frames) throw new Error(`complexión ${recipe.complexion}: ${view}/${sheet} tiene ${encoded.length} cuadros; se esperaban ${frames}`);
    encoded.forEach((enc, col) => {
      const labels = decodeLabelFrame(enc, bundleView.kind, FRAME.width, FRAME.height);
      const ctx: OverlayContext = { pivotX: FRAME.pivotX, complexion: recipe.complexion, sheet, frame: col };
      const dressed = dressFrame(labels, pieces, piece => overlaysFor(piece, view, ctx));
      const painted = paintFrame(dressed, materials, literals, LIGHT_RULES);
      blitFrame(rgba, width, painted, FRAME.width, FRAME.height, col, row);
      if (keep) keep[view].push(dressed);
    });
  });
  return { width, height, rgba };
}

/** Retrato 32×32 con el mismo método: busto etiquetado + piezas + luz del retrato. */
export function composePortrait(bundle: KitBundle, recipe: Recipe, state: PortraitState): RgbaImage {
  const bust = bundle.busts[recipe.complexion];
  if (!bust) throw new Error(`${recipeLabel(recipe)}: complexión sin busto ${recipe.complexion}`);
  const { width, height } = PORTRAIT_FRAME;
  const frame = createFrame(width, height);
  gridRows(bust.grid).forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (isEmptyChar(ch)) return;
      const i = y * width + x;
      frame.part[i] = ch;
      frame.z[i] = bust.z[ch] ?? 0;
    });
  });
  const pieces = resolvePieces(bundle, recipe);
  const dressed = dressFrame(frame, pieces, piece => portraitOverlays(piece, recipe.complexion, state));
  const literals = { ...bundle.literals, ...(recipe.literals ?? {}) };
  return { width, height, rgba: paintFrame(dressed, resolveMaterials(bundle, recipe), literals, PORTRAIT_LIGHT_RULES) };
}

/**
 * Hojas `idle` (192×288) y `walk` (288×288), filas abajo/izquierda/derecha/arriba,
 * y los retratos de `recipe.portraits` (por defecto, solo el neutral).
 */
export function composeCharacter(bundle: KitBundle, recipe: Recipe, options: { keepDressed?: boolean } = {}): ComposedCharacter {
  if (!bundle.complexions[recipe.complexion]) throw new Error(`${recipeLabel(recipe)}: complexión desconocida ${recipe.complexion}`);
  const pieces = resolvePieces(bundle, recipe);
  const materials = resolveMaterials(bundle, recipe);
  for (const [slot, owner] of requiredSlots(pieces)) {
    if (!materials[slot]) throw new Error(`${recipeLabel(recipe)}: falta el color de la ranura «${slot}» (la usa ${owner})`);
  }
  const literals = { ...bundle.literals, ...(recipe.literals ?? {}) };
  const keepFor = (): Record<ViewId, Frame[]> | null => (options.keepDressed ? { down: [], left: [], right: [], up: [] } : null);
  const keepIdle = keepFor();
  const keepWalk = keepFor();
  const result: ComposedCharacter = {
    idle: composeSheet(bundle, recipe, pieces, materials, literals, 'idle', keepIdle),
    walk: composeSheet(bundle, recipe, pieces, materials, literals, 'walk', keepWalk),
    portraits: {},
  };
  for (const state of recipe.portraits ?? ['neutral']) {
    result.portraits[state] = composePortrait(bundle, recipe, state);
  }
  if (keepIdle && keepWalk) result.dressed = { idle: keepIdle, walk: keepWalk };
  return result;
}
