/**
 * Catálogo de las «salas por piezas»: la forma de una sala (`estructura`), la del manifiesto de piezas que publica
 * `tools/escenarios/piezas_catalogo.py` (esquema 2) y los datos de luz de cada pieza.
 *
 * Sin dependencias y con sintaxis borrable: lo cargan el navegador y las pruebas en Node.
 */
import type { Encuadre, Momento, Muro } from './geometria';

/** Raíz, en el navegador, de las rutas del manifiesto (que son relativas a `biblioteca/`). */
export const BIBLIOTECA_URL = '/assets/biblioteca/';
export const MANIFIESTO_DE_PIEZAS_URL = `${BIBLIOTECA_URL}piezas/manifiesto.json`;

export function urlDePieza(ruta: string): string {
  return `${BIBLIOTECA_URL}${ruta}`;
}

// ── la sala ─────────────────────────────────────────────────────────────────────

export interface PiezaDeSala {
  id?: string;
  tipo: string;
  modelo: string;
  /** Las piezas de muro van con `muro` y `pos`; las lámparas de pie y de mesa, con `x` e `y` sobre el piso. */
  muro?: Muro;
  pos?: number;
  x?: number;
  y?: number;
  /** px por encima del piso, para la lámpara que va encima de una mesa. */
  sobre?: number;
  encendida?: 'auto' | 'siempre' | 'nunca';
}

export interface PuertaDeSala {
  id: string;
  muro: Muro;
  pos: number;
  modelo: string;
  hacia?: string;
  par?: string;
  etiqueta?: string;
}

export interface TapeteDeSala {
  caja?: number[];
  /** Capa ya dibujada del tapete. Sin ella el tapete no se pinta: Pillow lo dibuja con polígonos que el cliente no repite. */
  ruta?: string;
  x?: number;
  y?: number;
}

export interface EstructuraDeSala {
  ancho: number;
  momento?: Momento;
  /** Al aire libre: sobre el muro se ve el cielo y la luz es la del día. */
  exterior?: boolean;
  acabados: { piso: string; variante?: string; muro: string; paleta: string };
  piezas?: PiezaDeSala[];
  tapetes?: TapeteDeSala[];
  /** Capas fijas de una sala convertida (una escalera, un mesón), ya dibujadas sobre el piso y el muro del fondo. */
  propios?: { ref?: string; ruta: string }[];
}

export interface SalaPorPiezas {
  encuadre: Encuadre;
  estructura: EstructuraDeSala;
  puertas?: PuertaDeSala[];
}

// ── el manifiesto ───────────────────────────────────────────────────────────────

/** Una tira de cuadros de una pieza: `ancho` y `alto` son los de UN cuadro y `apoyo` es su punto de apoyo dentro de él. */
export interface VistaDePieza {
  ruta: string;
  ancho: number;
  alto: number;
  apoyo: [number, number];
}

export interface FichaDePieza {
  nombre: string;
  ocupa: number;
  muros: string[];
  cuadros: number;
  franja: [number, number];
  estados?: string[];
  fps?: number;
  hojas?: string;
  luz?: Record<string, unknown>;
  vistas: {
    frente?: VistaDePieza;
    camara?: VistaDePieza;
    suelo?: VistaDePieza;
    /** Por ancho de sala («960», «1200»…): el muro lateral cambia de pendiente con el ancho. */
    lado?: Record<string, VistaDePieza>;
  };
}

export interface ImagenDeCatalogo {
  ruta: string;
  ancho: number;
  alto: number;
  nombre?: string;
}

export interface MuroDeCatalogo {
  nombre: string;
  fondo: ImagenDeCatalogo;
  lado: Record<string, { izquierda: ImagenDeCatalogo; derecha: ImagenDeCatalogo }>;
}

export interface MuebleDeCatalogo extends ImagenDeCatalogo {
  cuadros: number;
  fps?: number;
}

export interface ManifiestoDePiezas {
  esquema: 2;
  piezas: Record<string, FichaDePieza>;
  pisos: Record<string, ImagenDeCatalogo>;
  muros: Record<string, MuroDeCatalogo>;
  muebles: Record<string, MuebleDeCatalogo>;
  propios: string[];
  lugares: string[];
}

function esTabla(x: unknown): boolean {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/** ¿Es un manifiesto de piezas que este código sabe leer? Cualquier otra cosa cuenta como «sin manifiesto». */
export function esManifiestoDePiezas(x: unknown): x is ManifiestoDePiezas {
  const m = x as Partial<ManifiestoDePiezas> | null;
  return !!m && typeof m === 'object' && m.esquema === 2 && esTabla(m.piezas) && esTabla(m.pisos) && esTabla(m.muros);
}

// ── la luz de cada pieza ────────────────────────────────────────────────────────

export interface LuzDePieza {
  /** `haz`: ventana que proyecta sobre el piso. `pozo`: lámpara cálida. `tubo`: luz fría y pareja. */
  forma: 'haz' | 'pozo' | 'tubo';
  /** Cuándo emite por sí sola: las ventanas de día y las lámparas de noche. */
  momento: Momento;
  tono: 'calido' | 'frio';
  /** De 0 a 100. */
  fuerza: number;
  /** Del haz: el vidrio de la ventana (ancho, altura del antepecho y alto), en px del muro. */
  ancho?: number;
  antepecho?: number;
  alto?: number;
  /** Del pozo y del tubo: radios de la mancha sobre el piso. */
  radio?: [number, number];
}

/**
 * La luz de cada pieza, copiada de `piezas_muro.PIEZAS`. El manifiesto publica `luz`, pero sin el antepecho ni el alto del
 * vidrio; `scripts/world-art/salas-catalogo.test.mjs` exige que esta tabla coincida con Python y con el manifiesto.
 */
const LUZ: Record<string, LuzDePieza> = {
  'ventana/corrediza': { forma: 'haz', momento: 'dia', tono: 'calido', fuerza: 100, ancho: 96, antepecho: 70, alto: 60 },
  'ventana/persiana': { forma: 'haz', momento: 'dia', tono: 'calido', fuerza: 60, ancho: 88, antepecho: 70, alto: 60 },
  'ventana/alta': { forma: 'haz', momento: 'dia', tono: 'calido', fuerza: 70, ancho: 120, antepecho: 100, alto: 32 },
  'ventana/ventanal': { forma: 'haz', momento: 'dia', tono: 'calido', fuerza: 100, ancho: 168, antepecho: 42, alto: 88 },
  'lampara/tubo': { forma: 'tubo', momento: 'noche', tono: 'frio', fuerza: 100, radio: [250, 120] },
  'lampara/colgante': { forma: 'pozo', momento: 'noche', tono: 'calido', fuerza: 100, radio: [150, 58] },
  'lampara/pie': { forma: 'pozo', momento: 'noche', tono: 'calido', fuerza: 100, radio: [124, 48] },
  'lampara/mesa': { forma: 'pozo', momento: 'noche', tono: 'calido', fuerza: 100, radio: [92, 38] },
};

/** Ancho del vano de cada modelo de puerta (`piezas_puertas.MODELOS`): lo usa la cuña de luz de la puerta abierta. */
const VANOS: Record<string, number> = {
  madera: 56,
  'madera-ventanilla': 56,
  vidrio: 56,
  corrediza: 136,
  urgencias: 86,
  metalica: 58,
  paso: 72,
};

export function luzDePieza(tipo: string, modelo: string): LuzDePieza | null {
  const clave = `${tipo}/${modelo}`;
  return Object.hasOwn(LUZ, clave) ? LUZ[clave] : null;
}

export function piezasConLuz(): string[] {
  return Object.keys(LUZ);
}

export function vanoDePuerta(modelo: string): number | null {
  return Object.hasOwn(VANOS, modelo) ? VANOS[modelo] : null;
}
