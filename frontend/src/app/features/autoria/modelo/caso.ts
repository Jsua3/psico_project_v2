/**
 * Tipos de un caso en borrador: lo que el docente ve y edita. Los nombres son los del editor; las equivalencias con
 * la API de autoría (nodo, mapa, opción, reglas…) viven en `desde-api.ts` y `hacia-api.ts`.
 *
 * Los ids son los del servidor, como texto (`String(id)`), salvo los de lo que aún no se guardó (`escena-ab12…`).
 */
import type { FormativeLevel, Intensity, ResponseClass, RiskLevel } from '../../../core/models/simulation.model';
import type { Colocacion, ColocacionPersonaje, Escenario, Expresion, Puerta, Sala } from './escenario';

/** En el caso, una puerta hacia una sala que no se eligió queda sin destino. */
export type PuertaCaso = Omit<Puerta, 'hacia'> & { hacia: string | null };

/**
 * Un mueble u objeto colocado en una sala del caso. `clave` es la del objeto en el mapa (la que lo identifica al
 * guardar la sala); una pieza recién agregada aún no la tiene.
 */
export type ColocacionCaso = Colocacion & { clave?: string };
export type ColocacionPersonajeCaso = ColocacionPersonaje & { clave?: string };

/** Sala del caso: conserva de dónde salió (si salió de un lugar) para poder «Volver a la sala original». */
export type SalaCaso = Omit<Sala, 'puertas' | 'muebles' | 'objetos' | 'personajes'> & {
  muebles: ColocacionCaso[];
  objetos: ColocacionCaso[];
  personajes: ColocacionPersonajeCaso[];
  puertas: PuertaCaso[];
  /** El lugar y la sala de la biblioteca de los que se copió; `null` en una sala creada a mano o de un caso sin lugar. */
  origen: { lugarId: string; salaId: string } | null;
};

/**
 * La clase de una respuesta, la única etiqueta que el docente y el reporte comparten:
 * recomendada, aceptable, con riesgo o contraindicada.
 */
export type ClaseRespuesta = ResponseClass;

/** Qué tan intensa es una escena: una escena alta pide un aviso para el estudiante. */
export type IntensidadEscena = Intensity;

/** El nivel de riesgo del caso. */
export type NivelRiesgo = RiskLevel;

/** Un hito del caso: un paso profesional que el estudiante debe dar. Los decisivos deciden el final. */
export interface Hito {
  /** Letras, números y «_» (la biblioteca los trae con guiones; al copiarlos pasan a «_»). */
  clave: string;
  nombre: string;
  descripcion: string;
  decisivo: boolean;
}

/**
 * Lo que una respuesta mueve en el caso. `persona` son pasos de −1 a +1 por eje (vínculo y activación de la persona
 * usuaria); sin `persona`, el servidor usa el paso de la clase. `competencias` son códigos del catálogo.
 */
export interface EfectosRespuesta {
  persona?: { bond?: number; activation?: number };
  hitos?: string[];
  competencias?: string[] | Record<string, FormativeLevel | null>;
}

export interface Linea {
  id: string;
  personajeId: string;
  texto: string;
  expresion: Expresion;
  /**
   * La emoción tal como la guardó el servidor (un caso viejo trae «concerned», «danger»…). Se lee como el retrato que
   * le corresponde (`expresion`), pero se conserva para no reescribirla si la línea se guarda sin cambiar la expresión.
   */
  emocionDeOrigen?: string;
  marcaIa: boolean;
}

export interface Respuesta {
  id: string;
  texto: string;
  /** `null` mientras el docente no la clasifica (el servidor exige una clase al guardarla). */
  clase: ClaseRespuesta | null;
  /** Por qué es contraindicada; obligatoria solo en esa clase. */
  razon: string;
  retroalimentacion: string;
  efectos: EfectosRespuesta;
  destinoId: string | null;
  marcaIa: boolean;
}

export interface Escena {
  id: string;
  titulo: string;
  /** Lo que se cuenta de la escena antes de que la persona decida (la narración del nodo). */
  narracion: string;
  /** La sala de la escena; `null` si la escena no tiene mapa (un final sin sala, el inicio de un caso en blanco). */
  salaId: string | null;
  lineas: Linea[];
  respuestas: Respuesta[];
  esFinal: boolean;
  posicion: { x: number; y: number };
  /** `MEDIUM` por defecto; `HIGH` pide `advertencia`. */
  intensidad: IntensidadEscena;
  /** El aviso que el estudiante lee antes de una escena de intensidad alta; `null` si no hay. */
  advertencia: string | null;
  /** La escena la creó la IA y el docente aún no la acepta. */
  marcaIa?: boolean;
}

/** Lo que cuenta una condición: cuántas respuestas de esa clase eligió la persona. */
export type ConteoClase = 'recommended' | 'acceptable' | 'risky' | 'contraindicated';

/** Cómo termina una persona usuaria: su vínculo y su activación. */
export type VinculoPersona = 'WITHDRAWN' | 'GUARDED' | 'OPEN';
export type ActivacionPersona = 'CALM' | 'TENSE' | 'CRISIS';

/** Un comparador numérico; si hay varios, se cumplen todos. */
export interface Comparadores {
  gte?: number;
  gt?: number;
  lte?: number;
  lt?: number;
  eq?: number;
}

/**
 * Cuándo se muestra un final: el vocabulario del servidor (`casedef/conditions`). Un árbol de condiciones:
 * todas, alguna, ninguna, un hito cumplido, cuántas respuestas de una clase, o cómo quedó la persona.
 */
export type CondicionFinal =
  | { all: CondicionFinal[] }
  | { any: CondicionFinal[] }
  | { not: CondicionFinal }
  | { milestone: string }
  | ({ count: ConteoClase } & Comparadores)
  | { persona: { bond?: VinculoPersona; activation?: ActivacionPersona } };

export type TonoFinal = 'critical' | 'positive' | 'warning' | 'neutral';

export interface Final {
  /** La clave del final en el caso (letras, números y «_»). */
  id: string;
  nombre: string;
  texto: string;
  tono: TonoFinal;
  /** `null` en el final por defecto (el último): aplica cuando ningún otro se cumple. */
  condicion: CondicionFinal | null;
  marcaIa: boolean;
}

export interface CasoBorrador {
  id: string;
  /** La revisión del caso que se está viendo (viaja en cada cambio); 0 en un caso que aún no está en el servidor. */
  revision: number;
  titulo: string;
  /** El lugar de la biblioteca del que se copió; `null` en un caso sin lugar (se edita sin catálogo). */
  lugarId: string | null;
  salas: SalaCaso[];
  escenas: Escena[];
  inicioId: string | null;
  hitos: Hito[];
  nivelRiesgo: NivelRiesgo | null;
  /** `automatico`: los cuatro finales del modelo; `propio`: los del docente (`finales`). */
  modoFinales: 'automatico' | 'propio';
  finales: Final[];
  /** Personajes y catálogo del lugar, copiados al crear el caso (el caso no depende de la biblioteca). */
  personajes: Escenario['personajes'];
  catalogo: Escenario['catalogo'];
}
