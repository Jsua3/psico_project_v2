/**
 * Luz de una sala por piezas, calculada en el cliente desde su estructura con aritmética entera.
 *
 *     calcularLuz(sala, momento?, abiertas?) -> { ambiente, brillo }
 *
 * `ambiente` se MULTIPLICA sobre la escena y `brillo` se SUMA. Es el espejo de `tools/escenarios/piezas_luz.py` y debe dar
 * los mismos píxeles: lo comprueba `scripts/world-art/salas-luz.test.mjs`. Por eso cada operación repite la de Python, en
 * su mismo orden y con división de piso; no hay que «simplificar» una fórmula sin volver a correr esa prueba.
 *
 * - 8 escalones de 0,07 entre 0,44 y 1,00, penumbra 0,79 (0,58 de noche), tramado Bayer 4×4.
 * - De día cada ventana proyecta un haz sobre el piso y un halo en su muro. De noche la luz sale de las lámparas.
 * - Varias luces se combinan con el máximo ANTES de cuantizar: al cruzarse no rompen los escalones.
 * - La puerta abierta del muro del fondo deja caer una cuña de luz de la sala vecina.
 *
 * Sin dependencias y con sintaxis borrable: lo cargan el navegador y las pruebas en Node.
 */
import { luzDePieza, vanoDePuerta } from './catalogo';
import type { SalaPorPiezas } from './catalogo';
import { ALTO, FONDO, MARGEN, SEAM, TOP, borde, laterales, limites } from './geometria';
import type { Momento } from './geometria';

/** 1,00 de luz. */
const U = 10000;
const MINIMO = 4400;
const PASO = 700;
const NIVELES = 8;
const PENUMBRA = 7900;
const PENUMBRA_NOCHE = 5800;
const EXTERIOR = 9300;
const EXTERIOR_NOCHE = 5100;
/** 1,0 en las mezclas. */
const UNO = 1024;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Hasta dónde llega la cuña de una puerta abierta: px de piso desde el muro y px a cada lado del eje de la puerta. */
const CUNA_FONDO = 54;
const CUNA_LADO = 100;

function piso(a: number, b: number): number {
  return Math.floor(a / b);
}

function raiz(n: number): number {
  return Math.floor(Math.sqrt(n));
}

function limitar(v: number, minimo: number, maximo: number): number {
  return v < minimo ? minimo : v > maximo ? maximo : v;
}

/** Sombras frías y luces neutras: (r, v, a) por escalón, redondeado. */
function tablaAmbiente(): number[][] {
  const filas: number[][] = [];
  for (let n = 0; n <= NIVELES; n++) {
    const v = MINIMO + PASO * n;
    filas.push([
      piso(255 * v * (72 + n) + 400000, 800000),
      piso(255 * v * (744 + 7 * n) + 4000000, 8000000),
      Math.min(255, piso(255 * v * (88 - n) + 400000, 800000)),
    ]);
  }
  return filas;
}

function tablaBrillo(color: readonly number[]): number[][] {
  return [0, 1, 2, 3].map(n => color.map(c => piso(c * 5 * n + 50, 100)));
}

export const TABLA_AMBIENTE: number[][] = tablaAmbiente();
export const TABLA_CALIDA: number[][] = tablaBrillo([255, 206, 140]);
export const TABLA_FRIA: number[][] = tablaBrillo([150, 200, 255]);

export interface CapasDeLuz {
  ancho: number;
  alto: number;
  /** RGBA, alfa 255. Se multiplica sobre la escena. */
  ambiente: Uint8ClampedArray;
  /** RGBA, alfa 255. Se suma sobre la escena. */
  brillo: Uint8ClampedArray;
}

export interface Rectangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PuertaAbrible {
  id: string;
  /** x del eje de la puerta en pantalla. */
  eje: number;
  vano: number;
}

/**
 * La luz de una sala en un momento, lista para abrir y cerrar puertas sin recalcularlo todo: guarda la luz de los emisores
 * (antes de las cuñas, los rincones y la cuantización) y rehace solo el rectángulo que cambia.
 */
export class LuzDeSala {
  readonly ancho: number;
  readonly alto = ALTO;
  readonly momento: Momento;

  private readonly izq: boolean;
  private readonly der: boolean;
  private readonly exterior: boolean;
  private readonly base: number;
  private readonly cx: number;
  /** Por fila: profundidad sobre el piso y unión de cada muro lateral con el piso. */
  private readonly n: Int32Array;
  private readonly jl: Int32Array;
  private readonly jr: Int32Array;
  /** Por píxel, antes de las cuñas de las puertas. */
  private readonly luz: Int32Array;
  private readonly calido: Int32Array;
  private readonly frio: Int32Array;
  /** Quedan píxeles bajo la base (la sombra corta del exterior, de día, sin ningún emisor): la primera cuña los sube todos. */
  private readonly bajoBase: boolean;
  private readonly puertas: PuertaAbrible[];
  private readonly ambiente: Uint8ClampedArray;
  private readonly brillo: Uint8ClampedArray;
  private readonly niveles: Uint8Array;
  private abiertas: PuertaAbrible[] = [];

  constructor(sala: SalaPorPiezas, momento?: Momento) {
    const est = sala.estructura;
    const w = est.ancho;
    const b = borde(w);   // rechaza un ancho fuera del catálogo
    const [izq, der] = laterales(sala.encuadre);
    const [xl, xr] = limites(sala.encuadre, w);
    this.ancho = w;
    this.momento = momento ?? est.momento ?? 'dia';
    this.izq = izq;
    this.der = der;
    this.exterior = est.exterior === true;
    this.cx = piso(w, 2);
    const dia = this.momento === 'dia';
    this.base = this.exterior ? (dia ? EXTERIOR : EXTERIOR_NOCHE) : dia ? PENUMBRA : PENUMBRA_NOCHE;

    this.n = new Int32Array(ALTO);
    this.jl = new Int32Array(ALTO);
    this.jr = new Int32Array(ALTO);
    for (let y = 0; y < ALTO; y++) {
      const n = limitar(y - SEAM, 0, FONDO);
      this.n[y] = n;
      this.jl[y] = b - piso(n * (b - MARGEN), FONDO);
      this.jr[y] = w - this.jl[y];
    }

    const total = w * ALTO;
    this.luz = new Int32Array(total).fill(this.base);
    this.calido = new Int32Array(total);
    this.frio = new Int32Array(total);
    this.ambiente = new Uint8ClampedArray(total * 4);
    this.brillo = new Uint8ClampedArray(total * 4);
    this.niveles = new Uint8Array(total);

    if (this.exterior && dia) this.sombraDeExterior(xl, xr);
    const sumo = this.emisores(sala, xl, xr);
    this.bajoBase = this.exterior && dia && !sumo;

    this.puertas = [];
    for (const puerta of sala.puertas ?? []) {
      const vano = vanoDePuerta(puerta.modelo);
      if (puerta.muro === 'fondo' && vano !== null) this.puertas.push({ id: puerta.id, eje: xl + puerta.pos, vano });
    }
    this.terminar(0, 0, w, ALTO);
  }

  capas(): CapasDeLuz {
    return { ancho: this.ancho, alto: ALTO, ambiente: this.ambiente, brillo: this.brillo };
  }

  /** Escalones por píxel, para las pruebas: nivel de ambiente (bits 0-3), cálido (bits 4-5) y frío (bits 6-7). */
  escalones(): Uint8Array {
    return this.niveles;
  }

  /**
   * Deja abiertas exactamente esas puertas (solo las del muro del fondo dan luz) y repinta lo necesario.
   * Devuelve el rectángulo de las capas que cambió, o null si no cambió nada.
   */
  abrir(ids: readonly string[]): Rectangulo | null {
    const nuevas = this.puertas.filter(p => ids.includes(p.id));
    const antes = this.abiertas;
    const iguales = nuevas.length === antes.length && nuevas.every(p => antes.includes(p));
    if (iguales) return null;
    this.abiertas = nuevas;
    // La primera cuña sube a la base TODO lo que estaba por debajo: ahí cambia la imagen entera, no solo la cuña.
    const todo = this.bajoBase && (nuevas.length === 0) !== (antes.length === 0);
    let x0 = this.ancho, x1 = 0;
    for (const p of [...antes, ...nuevas]) {
      x0 = Math.min(x0, p.eje - CUNA_LADO);
      x1 = Math.max(x1, p.eje + CUNA_LADO + 1);
    }
    const zona = todo
      ? { x: 0, y: 0, w: this.ancho, h: ALTO }
      : { x: Math.max(0, x0), y: SEAM, w: Math.min(this.ancho, x1) - Math.max(0, x0), h: CUNA_FONDO };
    this.terminar(zona.x, zona.y, zona.x + zona.w, zona.y + zona.h);
    return zona;
  }

  // ── emisores ──────────────────────────────────────────────────────────────────

  /** Rango de x, inclusive, del piso en la fila y. */
  private pisoDe(y: number): [number, number] {
    return [this.izq ? this.jl[y] : 0, this.der ? this.jr[y] : this.ancho - 1];
  }

  /** Luz de día al aire libre: el muro echa una sombra corta sobre el suelo y el alero sobre el muro. */
  private sombraDeExterior(xl: number, xr: number): void {
    const w = this.ancho;
    for (let y = SEAM; y < ALTO; y++) {
      const n = this.n[y];
      if (n >= 34) break;
      const tope = 7200 + piso(2100 * limitar(n - 14, 0, 20), 20);
      const [xa, xb] = this.pisoDe(y);
      for (let x = xa, i = y * w + xa; x <= xb; x++, i++) if (this.luz[i] > tope) this.luz[i] = tope;
    }
    for (let y = TOP; y < Math.min(SEAM, TOP + 18); y++) {
      for (let x = xl, i = y * w + xl; x < xr; x++, i++) this.luz[i] = 7900;
    }
  }

  /** Suma la luz de cada pieza que emite en este momento. Devuelve si alguna sumó. */
  private emisores(sala: SalaPorPiezas, xl: number, xr: number): boolean {
    const w = this.ancho;
    const ganancia = U - this.base;
    let sumo = false;
    // sumar(mancha, fuerza, tono, peso, color) de Python: devuelve cómo aplicar una mancha de 0 a 1024 en un píxel.
    const sumar = (fuerza: number, tono: 'calido' | 'frio', peso = UNO, color = UNO) => {
      if (!sumo) {
        // np.maximum(L, base + …) recorre toda la imagen: donde la mancha es 0, deja al menos la base.
        for (let i = 0; i < this.luz.length; i++) if (this.luz[i] < this.base) this.luz[i] = this.base;
        sumo = true;
      }
      const k = piso(piso(ganancia * fuerza, 100) * peso, UNO);
      const tonos = tono === 'calido' ? this.calido : this.frio;
      return (i: number, mancha: number) => {
        const l = this.base + piso(k * mancha, UNO);
        if (l > this.luz[i]) this.luz[i] = l;
        const t = piso(piso(mancha * fuerza, 100) * color, UNO);
        if (t > tonos[i]) tonos[i] = t;
      };
    };
    const enMuro = (x: number, y: number, radio: number, pintar: (i: number, dx: number, dy: number) => void, ancho = 0, alto = 0) => {
      // Recorre el muro del fondo alrededor del rectángulo (x, y, ancho, alto), hasta `radio` px de él.
      const ya = Math.max(TOP, y - radio), yb = Math.min(SEAM - 1, y + alto + radio);
      const xa = Math.max(xl, x - radio), xb = Math.min(xr - 1, x + ancho + radio);
      for (let py = ya; py <= yb; py++) {
        const dy = Math.max(y - py, py - (y + alto), 0);
        for (let px = xa; px <= xb; px++) pintar(py * w + px, Math.max(x - px, px - (x + ancho), 0), dy);
      }
    };

    for (const pieza of sala.estructura.piezas ?? []) {
      const luz = luzDePieza(pieza.tipo, pieza.modelo);
      const modo = pieza.encendida ?? 'auto';
      if (!luz || modo === 'nunca') continue;
      const propia = luz.momento === this.momento;
      if (!propia && modo !== 'siempre') continue;
      const fuerza = piso(luz.fuerza * (propia ? 100 : 60), 100);

      if (luz.forma === 'haz') {
        const ancho = luz.ancho ?? 0, alto = luz.alto ?? 0;
        if (this.exterior || pieza.pos === undefined) continue;
        if (pieza.muro === 'fondo') {
          const x0 = xl + pieza.pos - piso(ancho, 2);
          this.hazDelFondo(x0, ancho, sumar(fuerza, luz.tono));
          const halo = sumar(fuerza, luz.tono, piso(UNO * 2, 3), piso(UNO, 2));
          enMuro(x0, SEAM - (luz.antepecho ?? 0) - alto, 46, (i, dx, dy) => {
            const v = UNO - piso(raiz(dx * dx + dy * dy) * UNO, 46);
            if (v > 0) halo(i, v);
          }, ancho, alto);
        } else if ((pieza.muro === 'izquierda' && this.izq) || (pieza.muro === 'derecha' && this.der)) {
          this.hazDelLado(pieza.muro, SEAM + pieza.pos, ancho, sumar(fuerza, luz.tono));
        }
        continue;
      }

      let x: number, y: number;
      if (pieza.x !== undefined && pieza.y !== undefined) {
        x = pieza.x;
        y = pieza.y;
      } else if (pieza.muro === 'fondo' && pieza.pos !== undefined) {
        x = xl + pieza.pos;
        y = SEAM + (luz.forma === 'tubo' ? 120 : 64);
      } else {
        continue;
      }
      const [rx, ry] = luz.radio ?? [1, 1];
      this.pozo(x, y, rx, ry, sumar(fuerza, luz.tono, UNO, piso(UNO * 9, 10)));
      if (luz.forma === 'tubo') {
        const banda = sumar(fuerza, luz.tono, piso(UNO * 8, 10), piso(UNO, 2));
        for (let py = TOP; py < SEAM; py++) {
          for (let px = Math.max(xl, x - 190); px < Math.min(xr, x + 191); px++) {
            const v = UNO - piso(Math.abs(px - x) * UNO, 190);
            if (v > 0) banda(py * w + px, v);
          }
        }
      } else {
        const halo = sumar(fuerza, luz.tono, piso(UNO, 2), piso(UNO * 4, 10));
        enMuro(x, SEAM - 36, 96, (i, dx, dy) => {
          const v = UNO - piso(raiz(dx * dx + dy * dy) * UNO, 96);
          if (v > 0) halo(i, v);
        });
      }
    }
    return sumo;
  }

  /** Ventana del muro del fondo: el haz que cae sobre el piso, con la sombra del parteluz en el centro. */
  private hazDelFondo(x0: number, ancho: number, aplicar: (i: number, mancha: number) => void): void {
    const w = this.ancho, cx = this.cx;
    for (let y = SEAM; y < ALTO; y++) {
      const n = this.n[y];
      const esc = 16 * FONDO + 3 * n;
      const xi = cx + piso((x0 - 8 - cx) * esc, 16 * FONDO) + piso(170 * n, FONDO);
      const xd = cx + piso((x0 + ancho + 8 - cx) * esc, 16 * FONDO) + piso(250 * n, FONDO);
      const t = piso(n * 1000, FONDO);
      const enFondo = Math.min(piso((t - 15) * 700, 1000), piso((740 - t) * 500, 1000));
      if (enFondo <= 0) continue;
      const parteluz = 6 + piso(10 * t, 1000);
      const [xa, xb] = this.pisoDe(y);
      for (let x = Math.max(xa, xi + 1); x <= Math.min(xb, xd - 1); x++) {
        let luz = Math.min(Math.min(x - xi, xd - x, enFondo) * 64, UNO);
        if (Math.abs(2 * x - (xi + xd)) < parteluz) luz = piso(luz * 35, 100);
        aplicar(y * w + x, luz);
      }
    }
  }

  /** Ventana de un muro lateral: la luz cruza el piso y baja hacia la cámara mientras se aleja del muro. */
  private hazDelLado(lado: 'izquierda' | 'derecha', yc: number, ancho: number, aplicar: (i: number, mancha: number) => void): void {
    const w = this.ancho;
    const medio = piso(ancho, 2) + 4;
    for (let y = SEAM; y < ALTO; y++) {
      const [xa, xb] = this.pisoDe(y);
      for (let x = xa; x <= xb; x++) {
        const dist = lado === 'izquierda' ? x - this.jl[y] : this.jr[y] - x;
        const dentro = Math.min(medio - Math.abs(y - (yc + piso(dist * 35, 100))), dist);
        if (dentro <= 0) continue;
        const alcance = limitar(piso((460 - dist) * UNO, 180), 0, UNO);
        const v = piso(Math.min(dentro * 64, UNO) * alcance, UNO);
        if (v > 0) aplicar(y * w + x, v);
      }
    }
  }

  /** Pozo de luz de una lámpara sobre el piso: una elipse que cae como p·(3 − p)/2. */
  private pozo(cx: number, cy: number, rx: number, ry: number, aplicar: (i: number, mancha: number) => void): void {
    const w = this.ancho;
    for (let y = Math.max(SEAM, cy - ry); y <= Math.min(ALTO - 1, cy + ry); y++) {
      const ey = piso(Math.abs(y - cy) * UNO, ry);
      const [xa, xb] = this.pisoDe(y);
      for (let x = Math.max(xa, cx - rx); x <= Math.min(xb, cx + rx); x++) {
        const ex = piso(Math.abs(x - cx) * UNO, rx);
        const p = UNO - raiz(ex * ex + ey * ey);
        if (p > 0) aplicar(y * w + x, piso(p * (3 * UNO - p), 2 * UNO));
      }
    }
  }

  // ── cuñas, rincones, viñeta y cuantización ────────────────────────────────────

  /** Cuánta luz de la sala vecina deja caer una puerta abierta en (x, y), de 0 a 1024. */
  private cuna(puerta: PuertaAbrible, x: number, n: number): number {
    const medio = piso(puerta.vano, 2) - 6 + piso(n * 30, 100);
    const dentro = Math.min(medio - Math.abs(x - puerta.eje - piso(n * 12, 100)), CUNA_FONDO - n);
    return limitar(dentro * 64, 0, UNO);
  }

  /** Pasa a las capas el rectángulo [x0, x1) × [y0, y1): cuñas de las puertas abiertas, rincones, viñeta y escalones. */
  private terminar(x0: number, y0: number, x1: number, y1: number): void {
    const w = this.ancho, base = this.base, cx = this.cx;
    const abiertas = this.abiertas;
    const dia = this.momento === 'dia';
    const kCuna = piso(piso((U - base) * 100, 100) * (dia ? piso(UNO * 2, 3) : piso(UNO * 4, 10)), UNO);
    const colorCuna = piso(UNO * 4, 10);
    const radioX = piso(600 * w, 960);
    const vinetaMax = this.exterior ? 100 : 200;

    for (let y = y0; y < y1; y++) {
      const n = this.n[y];
      const [xa, xb] = this.pisoDe(y);
      const enPisoY = y >= SEAM;
      const ey = piso(Math.abs(y - 310) * 1000, 360);
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        const enPiso = enPisoY && x >= xa && x <= xb;
        let l = this.luz[i], calido = this.calido[i];
        const frio = this.frio[i];

        if (abiertas.length > 0) {
          if (l < base) l = base;
          if (enPiso && n < CUNA_FONDO) {
            for (const puerta of abiertas) {
              const mancha = this.cuna(puerta, x, n);
              if (mancha <= 0) continue;
              l = Math.max(l, base + piso(kCuna * mancha, UNO));
              calido = Math.max(calido, piso(piso(mancha * 100, 100) * colorCuna, UNO));
            }
          }
        }

        // Sombras de rincón al pie de los muros.
        if (enPiso) {
          if (n < 18) l = piso(l * (800 + piso(200 * n, 18)), 1000);
          if (this.izq && x - this.jl[y] < 16) l = piso(l * (820 + piso(180 * limitar(x - this.jl[y], 0, 16), 16)), 1000);
          if (this.der && this.jr[y] - x < 16) l = piso(l * (820 + piso(180 * limitar(this.jr[y] - x, 0, 16), 16)), 1000);
        }
        // Viñeta.
        const ex = piso(Math.abs(x - cx) * 1000, radioX);
        const vineta = limitar((raiz(ex * ex + ey * ey) - 620) * 2, 0, 1000);
        l = piso(l * (1000 - piso(vinetaMax * vineta, 1000)), 1000);

        // Escalones con tramado.
        const umbral = BAYER[(y & 3) * 4 + (x & 3)];
        const q = limitar(l - MINIMO, 0, PASO * NIVELES);
        const nivel = limitar(piso(q, PASO) + ((q % PASO) * 16 > umbral * PASO ? 1 : 0), 0, NIVELES);
        const a = calido * 3, f = frio * 3;
        const escCalido = limitar(piso(a, UNO) + ((a % UNO) * 16 > umbral * UNO ? 1 : 0), 0, 3);
        const escFrio = limitar(piso(f, UNO) + ((f % UNO) * 16 > umbral * UNO ? 1 : 0), 0, 3);

        this.niveles[i] = nivel | (escCalido << 4) | (escFrio << 6);
        const o = i * 4;
        const am = TABLA_AMBIENTE[nivel], ca = TABLA_CALIDA[escCalido], fr = TABLA_FRIA[escFrio];
        this.ambiente[o] = am[0];
        this.ambiente[o + 1] = am[1];
        this.ambiente[o + 2] = am[2];
        this.ambiente[o + 3] = 255;
        this.brillo[o] = ca[0] + fr[0];
        this.brillo[o + 1] = ca[1] + fr[1];
        this.brillo[o + 2] = ca[2] + fr[2];
        this.brillo[o + 3] = 255;
      }
    }
  }
}

/** La luz de la sala lista para abrir y cerrar puertas. Lanza si el ancho no es del catálogo. */
export function prepararLuz(sala: SalaPorPiezas, momento?: Momento): LuzDeSala {
  return new LuzDeSala(sala, momento);
}

/** Las dos capas de luz de la sala, con las puertas `abiertas` (ids) dejando pasar la luz de la sala vecina. */
export function calcularLuz(sala: SalaPorPiezas, momento?: Momento, abiertas: readonly string[] = []): CapasDeLuz {
  const luz = new LuzDeSala(sala, momento);
  luz.abrir(abiertas);
  return luz.capas();
}
