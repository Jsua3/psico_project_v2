/**
 * Sombra proyectada de una figura (persona, mueble, objeto): su silueta —el alfa del cuadro que se está viendo— tendida
 * sobre el piso en la dirección contraria a la fuente de luz y con el largo que da esa fuente (regla 3 de
 * `.superpowers/contratos/calidad-visual.md`). Pura, sin dependencias y con aritmética entera, como el resto de `sala/`.
 *
 * Cómo se tiende: cada píxel opaco del cuadro tiene una columna respecto a los pies (`cx`) y una altura sobre ellos (`h`).
 * La altura se lleva sobre el piso a lo largo del rumbo, `h · largo / H` (H, la altura de la silueta), y la columna va
 * de través: si el rumbo es más vertical que horizontal (hacia la cámara o al fondo) la columna queda en x, como una
 * silueta volteada y cizallada; si es más horizontal (ventanas de los lados), la columna va en y a la mitad (el piso se ve
 * de canto), así la cabeza y los hombros se siguen leyendo en el contorno. Entre una altura y la siguiente se rellena el
 * tramo, para que una sombra más larga que la figura no quede rayada.
 *
 * Dos escalones, como la luz de la casa: el oscuro cerca de los pies y el claro lejos, con el tramado Bayer 4 × 4 en el paso.
 * La dirección (`rumbo`, en 1/64) y el `largo` son parámetros: los da la luz de la sala (`LuzDeSala.fuenteDeSombra`) y se
 * ajustan cuando P1 publique la regla exacta.
 */

/** 16 rumbos sobre el piso, en 1/64: 0 a la derecha, 4 hacia la cámara, 8 a la izquierda, 12 al fondo. */
export const RUMBOS_DE_SOMBRA: readonly (readonly [number, number])[] = [
  [64, 0], [59, 24], [45, 45], [24, 59], [0, 64], [-24, 59], [-45, 45], [-59, 24],
  [-64, 0], [-59, -24], [-45, -45], [-24, -59], [0, -64], [24, -59], [45, -45], [59, -24],
];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Umbral de opacidad del cuadro: lo que está por debajo no echa sombra (bordes suavizados, si los hubiera). */
const OPACO = 128;

/** El rumbo discreto más cercano a (dx, dy): el de mayor producto escalar. */
export function rumboDiscreto(dx: number, dy: number): [number, number] {
  let mejor = RUMBOS_DE_SOMBRA[0];
  let maximo = -Infinity;
  for (const r of RUMBOS_DE_SOMBRA) {
    const p = r[0] * dx + r[1] * dy;
    if (p > maximo) {
      maximo = p;
      mejor = r;
    }
  }
  return [mejor[0], mejor[1]];
}

export interface SiluetaTendida {
  ancho: number;
  alto: number;
  /** Dónde quedan los pies dentro de la máscara. */
  origenX: number;
  origenY: number;
  /** 0 nada, 1 escalón claro, 2 escalón oscuro. */
  mascara: Uint8Array;
}

/** Tiende la silueta del cuadro `alfa` (ancho × alto, con los pies en `piesX`, `piesY`) por `rumbo` con `largo` px. */
export function tenderSilueta(
  alfa: ArrayLike<number>, ancho: number, alto: number, piesX: number, piesY: number,
  rumbo: readonly [number, number], largo: number, voltear = false,
): SiluetaTendida {
  let arriba = piesY;
  for (let y = 0; y < alto && arriba === piesY; y++) {
    for (let x = 0; x < ancho; x++) if (alfa[y * ancho + x] >= OPACO) { arriba = y; break; }
  }
  const H = Math.max(1, piesY - arriba);
  const [rx, ry] = rumbo;
  const deCanto = Math.abs(rx) > Math.abs(ry);
  const den = H * 64;
  const tendido = (cx: number, h: number): [number, number] => {
    const ox = Math.floor((h * largo * rx) / den), oy = Math.floor((h * largo * ry) / den);
    return deCanto ? [ox, oy + Math.floor(cx / 2)] : [cx + ox, oy];
  };
  const nivel = (h: number, px: number, py: number): number => {
    const t = Math.floor((h * 16) / H);
    if (t < 6) return 2;
    if (t >= 10) return 1;
    return BAYER[(py & 3) * 4 + (px & 3)] < (10 - t) * 4 ? 2 : 1;
  };

  const puntos: number[] = [];   // x, y, h de cada celda marcada
  for (let y = 0; y < alto; y++) {
    const h = Math.max(0, piesY - y);
    for (let x = 0; x < ancho; x++) {
      if (alfa[y * ancho + x] < OPACO) continue;
      const cx = (voltear ? 2 * piesX - x : x) - piesX;
      const [ax, ay] = tendido(cx, h);
      if (h >= H) {
        puntos.push(ax, ay, h);
        continue;
      }
      const [bx, by] = tendido(cx, h + 1);
      const pasos = Math.max(1, Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 0; s < pasos; s++) {
        puntos.push(ax + Math.floor(((bx - ax) * s) / pasos), ay + Math.floor(((by - ay) * s) / pasos), h);
      }
    }
  }
  if (puntos.length === 0) return { ancho: 1, alto: 1, origenX: 0, origenY: 0, mascara: new Uint8Array(1) };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < puntos.length; i += 3) {
    x0 = Math.min(x0, puntos[i]); x1 = Math.max(x1, puntos[i]);
    y0 = Math.min(y0, puntos[i + 1]); y1 = Math.max(y1, puntos[i + 1]);
  }
  const w = x1 - x0 + 1, a = y1 - y0 + 1;
  const mascara = new Uint8Array(w * a);
  for (let i = 0; i < puntos.length; i += 3) {
    const px = puntos[i], py = puntos[i + 1];
    const j = (py - y0) * w + (px - x0);
    const n = nivel(puntos[i + 2], px, py);
    if (n > mascara[j]) mascara[j] = n;
  }
  return { ancho: w, alto: a, origenX: -x0, origenY: -y0, mascara };
}

/** RGBA de la silueta: `oscuro` en el escalón de los pies, `claro` en el de lejos, transparente fuera. */
export function pintarSilueta(
  s: SiluetaTendida, oscuro: readonly [number, number, number], claro: readonly [number, number, number],
): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(new ArrayBuffer(s.ancho * s.alto * 4));
  for (let i = 0; i < s.mascara.length; i++) {
    const n = s.mascara[i];
    if (!n) continue;
    const c = n === 2 ? oscuro : claro;
    rgba[i * 4] = c[0];
    rgba[i * 4 + 1] = c[1];
    rgba[i * 4 + 2] = c[2];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
