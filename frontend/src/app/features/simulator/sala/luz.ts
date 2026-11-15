/**
 * Luz de una sala por piezas, calculada en el cliente desde su estructura con aritmética entera.
 *
 *     calcularLuz(sala, catalogo, { momento, abiertas, cuerpos }) -> { ambiente, brillo }
 *
 * `ambiente` se MULTIPLICA sobre la escena y `brillo` se SUMA. Es el espejo de `tools/escenarios/piezas_luz.py` y debe dar
 * los mismos píxeles: lo comprueba `scripts/world-art/salas-luz.test.mjs`. Por eso cada operación repite la de Python, en
 * su mismo orden y con división de piso; no hay que «simplificar» una fórmula sin volver a correr esa prueba.
 *
 * - 8 escalones de 0,07 entre 0,44 y 1,00, penumbra 0,79 (0,58 de noche), tramado Bayer 4×4.
 * - De día cada ventana proyecta un haz sobre el piso y un halo en su muro. De noche la luz sale de las lámparas.
 * - Varias luces se combinan con el máximo ANTES de cuantizar: al cruzarse no rompen los escalones.
 * - La puerta abierta del muro del fondo deja caer una cuña de luz de la sala vecina.
 * - `cuerpos` son los muebles y las personas que hay en el piso: cada uno le tapa la luz a lo que tiene detrás. La ventana
 *   arroja la sombra en la dirección de su haz y la lámpara lejos de sí misma; a la sombra queda un cuarto de esa luz.
 *
 * Las reglas del porte están en `biblioteca/piezas/luz/LEEME.md`, con seis salas de referencia congeladas.
 * Sin dependencias y con sintaxis borrable: lo cargan el navegador y las pruebas en Node.
 */
import { encendidaForzada, luzDePieza, vanoDePuerta } from './catalogo';
import type { CatalogoDeLuz, FormaDeVentana, SalaPorPiezas } from './catalogo';
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
/** De la luz de una fuente, lo que se pierde a su sombra (3/4). */
const EN_SOMBRA = 768;
/** Dirección en que viaja la luz de una ventana, en 64avos de px: la del fondo y la de un muro lateral. */
const HAZ_FONDO = [45, 64];
const HAZ_LADO = [64, 22];
/** px que mide como mucho la sombra que arroja una lámpara. */
const SOMBRA_MAXIMA = 72;
/** Pisos que devuelven la luz, y cuánto de la luz de una fuente devuelven al brillo. */
const PULIDOS = ['vinilo', 'baldosa', 'damero'];
const REFLEJO = 600;
/** Escalones que baja la luz en el centro de una sombra de contacto. */
const CONTACTO = 2;
/** Hasta dónde llega, desde el muro, la franja que el piso pulido devuelve bajo una puerta abierta. */
const REFLEJO_PUERTA = 60;
/** Hasta dónde llega la cuña de una puerta abierta: px de piso desde el muro y px a cada lado del eje de la puerta. */
const CUNA_FONDO = 54;
const CUNA_LADO = 100;

/** Las constantes del motor, para comprobarlas contra las que publica el manifiesto (`luz`). */
export const CONSTANTES_DE_LUZ = {
  unidad: U, minimo: MINIMO, paso: PASO, niveles: NIVELES, uno: UNO,
  penumbra: { dia: PENUMBRA, noche: PENUMBRA_NOCHE, exteriorDia: EXTERIOR, exteriorNoche: EXTERIOR_NOCHE },
  bayer: [BAYER.slice(0, 4), BAYER.slice(4, 8), BAYER.slice(8, 12), BAYER.slice(12, 16)],
  enSombra: EN_SOMBRA, hazFondo: HAZ_FONDO, hazLado: HAZ_LADO, sombraMaxima: SOMBRA_MAXIMA,
  pulidos: PULIDOS, reflejo: REFLEJO, contacto: CONTACTO,
};

function piso(a: number, b: number): number {
  return Math.floor(a / b);
}

function raiz(n: number): number {
  return Math.floor(Math.sqrt(n));
}

function limitar(v: number, minimo: number, maximo: number): number {
  return v < minimo ? minimo : v > maximo ? maximo : v;
}

/**
 * Sombras frías y luces neutras: (r, v, a) por escalón, redondeado. De noche la sombra es más azul: el día y la noche se
 * distinguen por el tono general, no solo por lo que está encendido.
 */
function tablaAmbiente(noche = false): number[][] {
  const filas: number[][] = [];
  for (let n = 0; n <= NIVELES; n++) {
    const v = MINIMO + PASO * n;
    filas.push(noche
      ? [
        piso(255 * v * (64 + 2 * n) + 400000, 800000),
        piso(255 * v * (704 + 12 * n) + 4000000, 8000000),
        Math.min(255, piso(255 * v * (928 - 16 * n) + 4000000, 8000000)),
      ]
      : [
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
export const TABLA_AMBIENTE_NOCHE: number[][] = tablaAmbiente(true);
export type TonoDeReflejo = 'neutro' | 'calido' | 'frio';
/** Color que SUMA un píxel brillante según la luz que le llega: [tono][escalón de 0 a 3]. */
export const TABLA_REFLEJO: Record<TonoDeReflejo, number[][]> = {
  neutro: [[0, 0, 0], [24, 24, 22], [48, 48, 44], [76, 76, 70]],
  calido: [[0, 0, 0], [28, 23, 14], [54, 45, 28], [86, 72, 44]],
  frio: [[0, 0, 0], [16, 23, 30], [32, 46, 58], [52, 72, 92]],
};
/** Escalones de luz por debajo de los cuales nada brilla. */
const UMBRAL_REFLEJO = 4;

/** Lo que suma un píxel del mapa de brillo (gris 255 vidrio, 170 metal, 85 barniz): el metal necesita un escalón más y el barniz dos. */
export function colorDeReflejo(k: number, tono: TonoDeReflejo, gris: number): number[] {
  return TABLA_REFLEJO[tono][limitar(k - (3 - piso(gris, 85)), 0, 3)];
}

export const TABLA_CALIDA: number[][] = tablaBrillo([255, 206, 140]);
export const TABLA_FRIA: number[][] = tablaBrillo([150, 200, 255]);

export interface CapasDeLuz {
  ancho: number;
  alto: number;
  /** RGBA, alfa 255. Se multiplica sobre la escena. */
  ambiente: Uint8ClampedArray<ArrayBuffer>;
  /** RGBA, alfa 255. Se suma sobre la escena. */
  brillo: Uint8ClampedArray<ArrayBuffer>;
}

/** Un mueble o una persona sobre el piso: su huella en px de sala y su altura. Le tapa la luz a lo que tiene detrás. */
export interface Cuerpo {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  alto: number;
}

/** Huella y altura de algo apoyado en (x, y), el centro de su base, a partir del tamaño de su sprite. */
export function cuerpo(x: number, y: number, ancho: number, alto: number, persona = false): Cuerpo {
  if (persona) return { x0: x - 9, x1: x + 9, y0: y - 10, y1: y, alto: 60 };
  const fondo = Math.max(8, Math.min(16, piso(ancho, 5)));
  return { x0: x - piso(ancho, 2) + 2, x1: x + piso(ancho, 2) - 2, y0: y - fondo, y1: y, alto: Math.max(8, alto - piso(fondo, 2)) };
}

export interface OpcionesDeLuz {
  /** Por omisión, el de la estructura. */
  momento?: Momento;
  /** Muebles y personas que arrojan sombra. */
  cuerpos?: readonly Cuerpo[];
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

type Aplicar = (i: number, mancha: number) => void;

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
  /** Quedan píxeles bajo la base (las sombras del exterior, de día, sin ningún emisor): la primera cuña los sube todos. */
  private readonly bajoBase: boolean;
  private readonly puertas: PuertaAbrible[];
  private readonly ambiente: Uint8ClampedArray<ArrayBuffer>;
  private readonly brillo: Uint8ClampedArray<ArrayBuffer>;
  private readonly niveles: Uint8Array;
  private abiertas: PuertaAbrible[] = [];
  /** Para rehacer un trozo: la sala, su catálogo, los extremos del muro del fondo y los cuerpos quietos. */
  private readonly sala: SalaPorPiezas;
  private readonly catalogo: CatalogoDeLuz;
  private readonly xl: number;
  private readonly xr: number;
  private readonly fijos: readonly Cuerpo[];
  /** El cuerpo que se mueve (quien juega), si lo hay. */
  private movil: Cuerpo | null = null;
  /** Dónde los cuerpos tapan la luz del emisor que se está sumando. */
  private tapada: Uint8Array | null;
  /** Rectángulo [x0, x1) × [y0, y1) al que se limitan los emisores: la sala entera, salvo al rehacer un trozo. */
  private recorte: { x0: number; y0: number; x1: number; y1: number };
  /** El piso devuelve la luz (vinilo, baldosa, damero). */
  private readonly pulido: boolean;
  /** Por píxel: cuánto bajan la luz las sombras de contacto de los cuerpos quietos. La de quien camina se suma al terminar. */
  private readonly contacto: Int32Array;

  constructor(sala: SalaPorPiezas, catalogo: CatalogoDeLuz, opciones: OpcionesDeLuz = {}) {
    const est = sala.estructura;
    const cuerpos = opciones.cuerpos ?? [];
    const w = est.ancho;
    const b = borde(w);   // rechaza un ancho fuera del catálogo
    const [izq, der] = laterales(sala.encuadre);
    const [xl, xr] = limites(sala.encuadre, w);
    this.sala = sala;
    this.catalogo = catalogo;
    this.xl = xl;
    this.xr = xr;
    this.fijos = cuerpos;
    this.recorte = { x0: 0, y0: 0, x1: w, y1: ALTO };
    this.ancho = w;
    this.momento = opciones.momento ?? est.momento ?? 'dia';
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
    this.pulido = PULIDOS.includes(est.acabados?.piso);
    this.contacto = new Int32Array(total);
    for (const c of cuerpos) {
      for (let y = Math.max(SEAM, c.y1 - 2 - 40); y < Math.min(ALTO, c.y1 + 40); y++) {
        const [pa, pb] = [izq ? this.jl[y] : 0, der ? this.jr[y] : w - 1];
        for (let x = Math.max(pa, c.x0 - 40); x <= Math.min(pb, c.x1 + 40); x++) this.contacto[y * w + x] += this.contactoDe(c, x, y);
      }
    }

    // Solo hace falta si hay cuerpos; `moverCuerpo` la crea si llega uno después.
    this.tapada = cuerpos.length > 0 ? new Uint8Array(total) : null;
    const sumo = this.luces(cuerpos);
    this.bajoBase = this.exterior && dia && !sumo;

    this.puertas = [];
    for (const puerta of sala.puertas ?? []) {
      const vano = vanoDePuerta(catalogo, puerta.modelo);
      if (puerta.muro === 'fondo' && vano !== null) this.puertas.push({ id: puerta.id, eje: xl + puerta.pos, vano });
    }
    this.terminar(0, 0, w, ALTO);
  }

  capas(): CapasDeLuz {
    return { ancho: this.ancho, alto: ALTO, ambiente: this.ambiente, brillo: this.brillo };
  }

  /**
   * Cuánta luz le llega en (x, y) a lo que brilla (k de 0 a 3) y de qué tono: se mide sobre la luz de las fuentes, antes de
   * las cuñas de las puertas, de las sombras de contacto y de rincón, y sin tramado (`piezas_luz.reflejos` de Python).
   * De día en penumbra da 1; en un haz o bajo una lámpara, 3; de noche sin lámpara, 0: el brillo se apaga con la luz.
   */
  reflejoEn(x: number, y: number): { k: number; tono: TonoDeReflejo } {
    const px = limitar(Math.trunc(x), 0, this.ancho - 1), py = limitar(Math.trunc(y), 0, ALTO - 1);
    const i = py * this.ancho + px;
    const k = limitar(piso(this.luz[i] - MINIMO, PASO) - UMBRAL_REFLEJO, 0, 3);
    const c = this.calido[i], f = this.frio[i];
    return { k, tono: f > c && f >= 128 ? 'frio' : c >= 128 ? 'calido' : 'neutro' };
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
      : { x: Math.max(0, x0), y: SEAM, w: Math.min(this.ancho, x1) - Math.max(0, x0), h: Math.max(CUNA_FONDO, this.pulido ? REFLEJO_PUERTA : 0) };
    this.terminar(zona.x, zona.y, zona.x + zona.w, zona.y + zona.h);
    return zona;
  }

  /**
   * Pone (o mueve, o quita con null) el cuerpo de quien juega y rehace la luz solo donde su sombra puede caer: antes y
   * ahora. Devuelve el rectángulo de las capas que cambió, o null si no cambió nada. Da lo mismo que calcular la sala
   * entera con ese cuerpo entre los demás.
   */
  moverCuerpo(cuerpo: Cuerpo | null): Rectangulo | null {
    const antes = this.movil;
    if (antes === cuerpo || (antes && cuerpo && antes.x0 === cuerpo.x0 && antes.x1 === cuerpo.x1 && antes.y0 === cuerpo.y0
      && antes.y1 === cuerpo.y1 && antes.alto === cuerpo.alto)) return null;
    this.movil = cuerpo;
    const zonas = [antes, cuerpo].filter((c): c is Cuerpo => c !== null).map(c => this.alcanceDeSombra(c));
    const zona = {
      x0: Math.min(...zonas.map(z => z.x0)), y0: Math.min(...zonas.map(z => z.y0)),
      x1: Math.max(...zonas.map(z => z.x1)), y1: Math.max(...zonas.map(z => z.y1)),
    };
    if (zona.x1 <= zona.x0 || zona.y1 <= zona.y0) return null;
    this.tapada ??= new Uint8Array(this.ancho * ALTO);
    // De vuelta al principio dentro del trozo, y las mismas luces que en el constructor, solo ahí.
    for (let y = zona.y0; y < zona.y1; y++) {
      for (let x = zona.x0, i = y * this.ancho + zona.x0; x < zona.x1; x++, i++) {
        this.luz[i] = this.base;
        this.calido[i] = 0;
        this.frio[i] = 0;
      }
    }
    this.recorte = zona;
    this.luces(cuerpo ? [...this.fijos, cuerpo] : this.fijos);
    this.recorte = { x0: 0, y0: 0, x1: this.ancho, y1: ALTO };
    this.terminar(zona.x0, zona.y0, zona.x1, zona.y1);
    return { x: zona.x0, y: zona.y0, w: zona.x1 - zona.x0, h: zona.y1 - zona.y0 };
  }

  /** Hasta dónde puede caer la sombra de un cuerpo: su huella más el largo máximo de sombra de cualquier fuente, en el piso. */
  private alcanceDeSombra(c: Cuerpo): { x0: number; y0: number; x1: number; y1: number } {
    const largo = Math.max(SOMBRA_MAXIMA, c.alto) + 8;
    return {
      x0: Math.max(0, c.x0 - largo), x1: Math.min(this.ancho, c.x1 + largo + 1),
      y0: Math.max(SEAM, c.y0 - largo), y1: Math.min(ALTO, c.y1 + largo + 1),
    };
  }

  // ── emisores ──────────────────────────────────────────────────────────────────

  /** La sombra corta del exterior y la luz de cada emisor, dentro del recorte. Devuelve si algún emisor sumó. */
  private luces(cuerpos: readonly Cuerpo[]): boolean {
    if (this.exterior && this.momento === 'dia') this.sombraDeExterior(cuerpos);
    return this.emisores(cuerpos);
  }

  /** Rango de x, inclusive, del piso en la fila y. */
  private pisoDe(y: number): [number, number] {
    return [this.izq ? this.jl[y] : 0, this.der ? this.jr[y] : this.ancho - 1];
  }

  /** Borra la máscara de sombras dentro del recorte. */
  private limpiarTapada(): void {
    const t = this.tapada, r = this.recorte;
    if (!t) return;
    for (let y = r.y0; y < r.y1; y++) t.fill(0, y * this.ancho + r.x0, y * this.ancho + r.x1);
  }

  /** Luz de día al aire libre: el muro echa una sombra corta sobre el suelo, el alero sobre el muro y el sol a cada cuerpo. */
  private sombraDeExterior(cuerpos: readonly Cuerpo[]): void {
    const w = this.ancho, r = this.recorte, tapada = this.tapada;
    for (let y = Math.max(SEAM, r.y0); y < r.y1; y++) {
      const n = this.n[y];
      if (n >= 34) break;
      const tope = 7200 + piso(2100 * limitar(n - 14, 0, 20), 20);
      const [xa, xb] = this.pisoDe(y);
      for (let x = Math.max(xa, r.x0), i = y * w + x; x <= Math.min(xb, r.x1 - 1); x++, i++) if (this.luz[i] > tope) this.luz[i] = tope;
    }
    for (let y = Math.max(TOP, r.y0); y < Math.min(SEAM, TOP + 18, r.y1); y++) {
      for (let x = Math.max(this.xl, r.x0), i = y * w + x; x < Math.min(this.xr, r.x1); x++, i++) this.luz[i] = 7900;
    }
    // La sombra que el sol le saca a cada cuerpo baja la luz dos escalones.
    if (!tapada || cuerpos.length === 0) return;
    this.limpiarTapada();
    if (this.sombra(cuerpos, HAZ_FONDO[0], HAZ_FONDO[1], cuerpos.map(c => piso(c.alto * 5, 8)), tapada)) {
      for (let y = Math.max(SEAM, r.y0); y < r.y1; y++) {
        for (let x = r.x0, i = y * w + x; x < r.x1; x++, i++) if (tapada[i]) this.luz[i] -= 2 * PASO;
      }
    }
  }

  /**
   * Marca en `mascara` dónde algún cuerpo tapa la luz que viaja en la dirección (dx, dy)/64: un punto p queda a la sombra
   * de un cuerpo si p − t·(dx, dy)/64 cae en su huella para algún t entre 0 y su largo de sombra. Todo se compara
   * multiplicado por |dx|·|dy|, así no hay ninguna división. Devuelve si marcó algo. No borra lo ya marcado.
   */
  private sombra(cuerpos: readonly Cuerpo[], dx: number, dy: number, largos: readonly number[], mascara: Uint8Array): boolean {
    const w = this.ancho, r = this.recorte;
    const ax = Math.abs(dx) || 1, ay = Math.abs(dy) || 1;
    let alguna = false;
    cuerpos.forEach((c, k) => {
      const largo = largos[k];
      if (largo <= 0) return;
      // Caja que contiene la huella barrida a lo largo de la sombra, dentro del recorte.
      const correX = Math.ceil((largo * Math.abs(dx)) / 64) + 1, correY = Math.ceil((largo * Math.abs(dy)) / 64) + 1;
      const xa = Math.max(r.x0, dx < 0 ? c.x0 - correX : c.x0), xb = Math.min(r.x1 - 1, dx > 0 ? c.x1 + correX : c.x1);
      const ya = Math.max(SEAM, r.y0, dy < 0 ? c.y0 - correY : c.y0), yb = Math.min(r.y1 - 1, dy > 0 ? c.y1 + correY : c.y1);
      for (let y = ya; y <= yb; y++) {
        const [pa, pb] = this.pisoDe(y);
        for (let x = Math.max(xa, pa); x <= Math.min(xb, pb); x++) {
          let lo = 0, hi = largo * ax * ay, dentro = true;
          if (dx > 0) {
            lo = Math.max(lo, 64 * (x - c.x1) * ay);
            hi = Math.min(hi, 64 * (x - c.x0) * ay);
          } else if (dx < 0) {
            lo = Math.max(lo, 64 * (c.x0 - x) * ay);
            hi = Math.min(hi, 64 * (c.x1 - x) * ay);
          } else {
            dentro = x >= c.x0 && x <= c.x1;
          }
          if (dy > 0) {
            lo = Math.max(lo, 64 * (y - c.y1) * ax);
            hi = Math.min(hi, 64 * (y - c.y0) * ax);
          } else if (dy < 0) {
            lo = Math.max(lo, 64 * (c.y0 - y) * ax);
            hi = Math.min(hi, 64 * (c.y1 - y) * ax);
          } else {
            dentro = dentro && y >= c.y0 && y <= c.y1;
          }
          if (dentro && lo <= hi) {
            mascara[y * w + x] = 1;
            alguna = true;
          }
        }
      }
    });
    return alguna;
  }

  /** Sombras que arroja una lámpara puesta en (x, y) a `altura` px del piso: cada cuerpo, lejos de ella. */
  private sombraDeLampara(cuerpos: readonly Cuerpo[], x: number, y: number, altura: number, mascara: Uint8Array): void {
    for (const c of cuerpos) {
      if (c.x0 - 8 <= x && x <= c.x1 + 8 && c.y0 - 8 <= y && y <= c.y1 + 8) continue;   // la lámpara está encima de ese mueble
      const ddx = piso(c.x0 + c.x1, 2) - x, ddy = piso(c.y0 + c.y1, 2) - y;
      const n = raiz(ddx * ddx + ddy * ddy);
      if (n < 4) continue;
      const largo = Math.min(piso(c.alto * n, Math.max(altura - c.alto, 16)), SOMBRA_MAXIMA);
      this.sombra([c], piso(ddx * 64, n), piso(ddy * 64, n), [largo], mascara);
    }
  }

  /** Suma la luz de cada pieza que emite en este momento. Devuelve si alguna sumó. */
  private emisores(cuerpos: readonly Cuerpo[]): boolean {
    const w = this.ancho, r = this.recorte, xl = this.xl, xr = this.xr;
    const tapada = cuerpos.length > 0 ? this.tapada : null;
    const ganancia = U - this.base;
    let sumo = false;
    // sumar(mancha, fuerza, tono, peso, color) de Python: devuelve cómo aplicar una mancha de 0 a 1024 en un píxel.
    const sumar = (fuerza: number, tono: 'calido' | 'frio', peso = UNO, color = UNO): Aplicar => {
      if (!sumo) {
        // np.maximum(L, base + …) recorre toda la imagen: donde la mancha es 0, deja al menos la base.
        for (let y = r.y0; y < r.y1; y++) {
          for (let i = y * w + r.x0; i < y * w + r.x1; i++) if (this.luz[i] < this.base) this.luz[i] = this.base;
        }
        sumo = true;
      }
      const k = piso(piso(ganancia * fuerza, 100) * peso, UNO);
      const tonos = tono === 'calido' ? this.calido : this.frio;
      return (i, mancha) => {
        const l = this.base + piso(k * mancha, UNO);
        if (l > this.luz[i]) this.luz[i] = l;
        const t = piso(piso(mancha * fuerza, 100) * color, UNO);
        if (t > tonos[i]) tonos[i] = t;
      };
    };
    // A la sombra de un cuerpo queda un cuarto de la luz de esa fuente.
    const conSombra = (aplicar: Aplicar): Aplicar => !tapada
      ? aplicar
      : (i, mancha) => aplicar(i, tapada[i] ? mancha - piso(mancha * EN_SOMBRA, UNO) : mancha);
    // Recorre el muro del fondo alrededor del rectángulo (x, y, ancho, alto), hasta `radio` px de él.
    const enMuro = (x: number, y: number, radio: number, pintar: (i: number, dx: number, dy: number) => void, ancho = 0, alto = 0) => {
      const ya = Math.max(TOP, r.y0, y - radio), yb = Math.min(SEAM - 1, r.y1 - 1, y + alto + radio);
      const xa = Math.max(xl, r.x0, x - radio), xb = Math.min(xr - 1, r.x1 - 1, x + ancho + radio);
      for (let py = ya; py <= yb; py++) {
        const dy = Math.max(y - py, py - (y + alto), 0);
        for (let px = xa; px <= xb; px++) pintar(py * w + px, Math.max(x - px, px - (x + ancho), 0), dy);
      }
    };

    for (const pieza of this.sala.estructura.piezas ?? []) {
      const luz = luzDePieza(this.catalogo, pieza.tipo, pieza.modelo);
      const forzada = encendidaForzada(pieza);
      if (!luz || forzada === false) continue;
      const propia = luz.momento === this.momento;
      if (!propia && forzada !== true) continue;
      const fuerza = piso(luz.fuerza * (propia ? 100 : 60), 100);

      if (luz.forma === 'haz') {
        const ancho = luz.ancho, alto = luz.alto;
        if (this.exterior || pieza.pos === undefined) continue;
        if (pieza.muro === 'fondo') {
          const x0 = xl + pieza.pos - piso(ancho, 2);
          if (tapada) {
            this.limpiarTapada();
            this.sombra(cuerpos, HAZ_FONDO[0], HAZ_FONDO[1], cuerpos.map(c => piso(c.alto * 5, 8)), tapada);
          }
          this.hazDelFondo(x0, ancho, luz.parteluces, conSombra(sumar(fuerza, luz.tono)));
          const halo = sumar(fuerza, luz.tono, piso(UNO * 2, 3), piso(UNO, 2));
          enMuro(x0, SEAM - luz.antepecho - alto, 46, (i, dx, dy) => {
            const v = UNO - piso(raiz(dx * dx + dy * dy) * UNO, 46);
            if (v > 0) halo(i, v);
          }, ancho, alto);
          if (this.pulido) this.reflejoDelPiso(x0, x0 + ancho, 90, fuerza, luz.tono === 'calido' ? this.calido : this.frio);
        } else if ((pieza.muro === 'izquierda' && this.izq) || (pieza.muro === 'derecha' && this.der)) {
          if (tapada) {
            this.limpiarTapada();
            const sentido = pieza.muro === 'izquierda' ? HAZ_LADO[0] : -HAZ_LADO[0];
            this.sombra(cuerpos, sentido, HAZ_LADO[1], cuerpos.map(c => piso(c.alto * 3, 4)), tapada);
          }
          this.hazDelLado(pieza.muro, SEAM + pieza.pos, ancho, luz.parteluces, conSombra(sumar(fuerza, luz.tono)));
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
      const [rx, ry] = luz.radio;
      const enPozo = sumar(fuerza, luz.tono, UNO, piso(UNO * 9, 10));
      if (tapada && luz.forma === 'pozo') {
        // El tubo de techo no arroja sombra.
        this.limpiarTapada();
        this.sombraDeLampara(cuerpos, x, y, luz.altura + (pieza.sobre ?? 0), tapada);
        this.pozo(x, y, rx, ry, conSombra(enPozo));
      } else {
        this.pozo(x, y, rx, ry, enPozo);
      }
      if (this.pulido && pieza.muro === 'fondo' && pieza.x === undefined) {
        const medio = luz.forma === 'tubo' ? 26 : 14;
        this.reflejoDelPiso(x - medio, x + medio, 70, fuerza, luz.tono === 'calido' ? this.calido : this.frio);
      }
      if (luz.forma === 'tubo') {
        const banda = sumar(fuerza, luz.tono, piso(UNO * 8, 10), piso(UNO, 2));
        for (let py = Math.max(TOP, r.y0); py < Math.min(SEAM, r.y1); py++) {
          for (let px = Math.max(xl, r.x0, x - 190); px < Math.min(xr, r.x1, x + 191); px++) {
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

  /**
   * Ventana del muro del fondo: el haz que cae sobre el piso, con la forma de la ventana: cada parteluz vertical es una
   * línea a lo largo del haz, cada travesaño una línea que lo cruza y las lamas de la persiana, rayas en su tramo.
   */
  private hazDelFondo(x0: number, ancho: number, forma: FormaDeVentana, aplicar: Aplicar): void {
    const w = this.ancho, cx = this.cx, r = this.recorte;
    const n0 = piso(15 * FONDO, 1000), n1 = piso(740 * FONDO, 1000);   // profundidad donde empieza y termina el haz
    const verticales = forma.verticales ?? [], horizontales = forma.horizontales ?? [];
    const lamas = forma.lamas ? [n0 + piso((n1 - n0) * forma.lamas[0], UNO), n0 + piso((n1 - n0) * forma.lamas[1], UNO), forma.lamas[2]] : null;
    for (let y = Math.max(SEAM, r.y0); y < r.y1; y++) {
      const n = this.n[y];
      const esc = 16 * FONDO + 3 * n;
      const xi = cx + piso((x0 - 8 - cx) * esc, 16 * FONDO) + piso(170 * n, FONDO);
      const xd = cx + piso((x0 + ancho + 8 - cx) * esc, 16 * FONDO) + piso(250 * n, FONDO);
      const t = piso(n * 1000, FONDO);
      const enFondo = Math.min(piso((t - 15) * 700, 1000), piso((740 - t) * 500, 1000));
      if (enFondo <= 0) continue;
      const gruesoV = 6 + piso(10 * t, 1000), gruesoH = 5 + piso(4 * t, 1000);
      // Lo que cruza toda la fila (travesaños y lamas) se decide una vez por fila; cada uno oscurece de nuevo.
      let veces = 0;
      for (const f of horizontales) if (Math.abs(n - (n0 + piso((n1 - n0) * f, UNO))) * 2 < gruesoH) veces += 1;
      if (lamas && n >= lamas[0] && n <= lamas[1] && (n - lamas[0]) % lamas[2] < piso(lamas[2], 2)) veces += 1;
      const [xa, xb] = this.pisoDe(y);
      for (let x = Math.max(xa, r.x0, xi + 1); x <= Math.min(xb, r.x1 - 1, xd - 1); x++) {
        let luz = Math.min(Math.min(x - xi, xd - x, enFondo) * 64, UNO);
        for (const f of verticales) if (Math.abs(x - (xi + piso((xd - xi) * f, UNO))) * 2 < gruesoV) luz = piso(luz * 35, 100);
        for (let k = 0; k < veces; k++) luz = piso(luz * 35, 100);
        aplicar(y * w + x, luz);
      }
    }
  }

  /** Ventana de un muro lateral: la luz cruza el piso y baja hacia la cámara mientras se aleja del muro, con su forma. */
  private hazDelLado(lado: 'izquierda' | 'derecha', yc: number, ancho: number, forma: FormaDeVentana, aplicar: Aplicar): void {
    const w = this.ancho, r = this.recorte;
    const medio = piso(ancho, 2) + 4;
    const verticales = forma.verticales ?? [], horizontales = forma.horizontales ?? [];
    const lamas = forma.lamas ? [40 + piso(300 * forma.lamas[0], UNO), 40 + piso(300 * forma.lamas[1], UNO), forma.lamas[2]] : null;
    for (let y = Math.max(SEAM, r.y0); y < r.y1; y++) {
      const [xa, xb] = this.pisoDe(y);
      for (let x = Math.max(xa, r.x0); x <= Math.min(xb, r.x1 - 1); x++) {
        const dist = lado === 'izquierda' ? x - this.jl[y] : this.jr[y] - x;
        const centro = yc + piso(dist * 35, 100);
        const dentro = Math.min(medio - Math.abs(y - centro), dist);
        if (dentro <= 0) continue;
        const alcance = limitar(piso((460 - dist) * UNO, 180), 0, UNO);
        let v = piso(Math.min(dentro * 64, UNO) * alcance, UNO);
        const a = y - (centro - medio);                                // posición a lo ancho del haz
        for (const f of verticales) if (Math.abs(a - piso(2 * medio * f, UNO)) * 2 < 5) v = piso(v * 35, 100);
        for (const f of horizontales) if (Math.abs(dist - (40 + piso(300 * f, UNO))) * 2 < 7) v = piso(v * 35, 100);
        if (lamas && dist >= lamas[0] && dist <= lamas[1] && (dist - lamas[0]) % lamas[2] < piso(lamas[2], 2)) v = piso(v * 35, 100);
        if (v > 0) aplicar(y * w + x, v);
      }
    }
  }

  /**
   * Franja que un piso pulido devuelve bajo algo del muro del fondo que da luz (entre xa y xb): nace al pie del muro, sigue
   * la perspectiva del piso y se apaga a los `largo` px. Suma al tono (al brillo), no a la luz.
   */
  private reflejoDelPiso(xa: number, xb: number, largo: number, fuerza: number, tonos: Int32Array): void {
    const w = this.ancho, cx = this.cx, r = this.recorte;
    for (let y = Math.max(SEAM, r.y0); y < r.y1; y++) {
      const n = this.n[y];
      if (n < 3) continue;
      const caida = limitar(piso((largo - n) * UNO, largo), 0, UNO);
      if (caida <= 0) break;
      const esc = 16 * FONDO + 3 * n;
      const xi = cx + piso((xa - cx) * esc, 16 * FONDO), xd = cx + piso((xb - cx) * esc, 16 * FONDO);
      const [pa, pb] = this.pisoDe(y);
      for (let x = Math.max(pa, r.x0, xi); x <= Math.min(pb, r.x1 - 1, xd); x++) {
        const m = piso(limitar(Math.min(x - xi, xd - x) * 256 + 256, 0, UNO) * caida, UNO);
        const v = piso(piso(m * fuerza, 100) * REFLEJO, UNO);
        const i = y * w + x;
        if (v > tonos[i]) tonos[i] = v;
      }
    }
  }

  /** Cuánto baja la luz (en diezmilésimas) la sombra de contacto de un cuerpo en (x, y): plena al centro, deshecha al borde. */
  private contactoDe(c: Cuerpo, x: number, y: number): number {
    const cx = piso(c.x0 + c.x1, 2), cy = c.y1 - 2;
    const rx = piso(c.x1 - c.x0, 2) + 5, ry = Math.max(4, piso(c.y1 - c.y0, 2) + 3);
    if (Math.abs(x - cx) > rx || Math.abs(y - cy) > ry) return 0;
    const ex = piso(Math.abs(x - cx) * UNO, rx), ey = piso(Math.abs(y - cy) * UNO, ry);
    const m = Math.min(limitar(UNO - raiz(ex * ex + ey * ey), 0, UNO) * 2, UNO);
    return piso(CONTACTO * PASO * m, UNO);
  }

  /** Pozo de luz de una lámpara sobre el piso: una elipse que cae como p·(3 − p)/2. */
  private pozo(cx: number, cy: number, rx: number, ry: number, aplicar: Aplicar): void {
    const w = this.ancho, r = this.recorte;
    for (let y = Math.max(SEAM, r.y0, cy - ry); y <= Math.min(r.y1 - 1, cy + ry); y++) {
      const ey = piso(Math.abs(y - cy) * UNO, ry);
      const [xa, xb] = this.pisoDe(y);
      for (let x = Math.max(xa, r.x0, cx - rx); x <= Math.min(xb, r.x1 - 1, cx + rx); x++) {
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
    const tablaAmbiente = dia ? TABLA_AMBIENTE : TABLA_AMBIENTE_NOCHE;

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
          // El piso pulido devuelve también la luz de la puerta abierta.
          if (this.pulido && enPiso && n >= 3 && n < REFLEJO_PUERTA) {
            const caida = piso((REFLEJO_PUERTA - n) * UNO, REFLEJO_PUERTA);
            const esc = 16 * FONDO + 3 * n;
            for (const puerta of abiertas) {
              const vano = piso(puerta.vano, 2) - 6;
              const xi = cx + piso((puerta.eje - vano - cx) * esc, 16 * FONDO), xd = cx + piso((puerta.eje + vano - cx) * esc, 16 * FONDO);
              if (x < xi || x > xd) continue;
              const m = piso(limitar(Math.min(x - xi, xd - x) * 256 + 256, 0, UNO) * caida, UNO);
              calido = Math.max(calido, piso(m * REFLEJO, UNO));
            }
          }
        }

        // Sombras de contacto de los cuerpos quietos y de quien camina.
        if (enPiso) {
          l -= this.contacto[i];
          if (this.movil) l -= this.contactoDe(this.movil, x, y);
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
        const am = tablaAmbiente[nivel], ca = TABLA_CALIDA[escCalido], fr = TABLA_FRIA[escFrio];
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
export function prepararLuz(sala: SalaPorPiezas, catalogo: CatalogoDeLuz, opciones: OpcionesDeLuz = {}): LuzDeSala {
  return new LuzDeSala(sala, catalogo, opciones);
}

/** Las dos capas de luz de la sala, con las puertas `abiertas` (ids) dejando pasar la luz de la sala vecina. */
export function calcularLuz(
  sala: SalaPorPiezas, catalogo: CatalogoDeLuz, opciones: OpcionesDeLuz & { abiertas?: readonly string[] } = {},
): CapasDeLuz {
  const luz = new LuzDeSala(sala, catalogo, opciones);
  luz.abrir(opciones.abiertas ?? []);
  return luz.capas();
}
