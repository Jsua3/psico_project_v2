/** Tipos de un caso en borrador dentro del sandbox. */
import type { Escenario, Expresion, Puerta, Sala } from './escenario';

/** En el caso, una puerta hacia una sala que no se eligió queda sin destino. */
export type PuertaCaso = Omit<Puerta, 'hacia'> & { hacia: string | null };

/** Sala copiada al caso: conserva de dónde salió para poder «Volver a la sala original». */
export type SalaCaso = Omit<Sala, 'puertas'> & {
  puertas: PuertaCaso[];
  origen: { lugarId: string; salaId: string };
};

export type Clasificacion = 'adecuada' | 'con-riesgo' | 'inadecuada';

export interface Linea {
  id: string;
  personajeId: string;
  texto: string;
  expresion: Expresion;
  marcaIa: boolean;
}

export interface Respuesta {
  id: string;
  texto: string;
  clasificacion: Clasificacion | null;
  retroalimentacion: string;
  destinoId: string | null;
  marcaIa: boolean;
}

export interface Escena {
  id: string;
  titulo: string;
  salaId: string;
  lineas: Linea[];
  respuestas: Respuesta[];
  esFinal: boolean;
  posicion: { x: number; y: number };
  /** La escena la creó la IA y el docente aún no la acepta. */
  marcaIa?: boolean;
}

export type CondicionFinal =
  | { tipo: 'llega-a-escena'; escenaId: string }
  | { tipo: 'inadecuadas-al-menos'; cantidad: number };

export interface Final {
  id: string;
  nombre: string;
  texto: string;
  condicion: CondicionFinal;
  marcaIa: boolean;
}

export interface CasoBorrador {
  id: string;
  titulo: string;
  lugarId: string;
  salas: SalaCaso[];
  escenas: Escena[];
  inicioId: string | null;
  modoFinales: 'automatico' | 'propio';
  finales: Final[];
  /** Personajes y catálogo del lugar, copiados al crear el caso (el caso no depende de la biblioteca). */
  personajes: Escenario['personajes'];
  catalogo: Escenario['catalogo'];
}
