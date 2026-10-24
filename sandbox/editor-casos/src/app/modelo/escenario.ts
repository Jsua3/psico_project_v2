/**
 * Tipos de un escenario de la biblioteca: espejo, campo por campo, del contrato de P1
 * (`biblioteca/esquema/escenario.schema.json`, esquema 1).
 */

export type Encuadre = 'tres-paredes' | 'dos-paredes-izquierda' | 'dos-paredes-derecha' | 'una-pared';
export type Expresion = 'neutral' | 'alegre' | 'preocupada' | 'triste';
export type Mirando = 'izquierda' | 'derecha';
export type TipoObjeto =
  | 'PERSON' | 'OBJECT' | 'ROUTE' | 'TOOL' | 'WARNING' | 'EXIT'
  | 'PROP' | 'TOOL_TARGET' | 'TRIGGER' | 'NOTE' | 'RESOURCE';

export const EXPRESIONES: readonly Expresion[] = ['neutral', 'alegre', 'preocupada', 'triste'];

export interface Punto {
  x: number;
  y: number;
}

/** Un mueble u objeto colocado en una sala; `x, y` es su punto de apoyo en el suelo. */
export interface Colocacion extends Punto {
  ref: string;
  espejo?: boolean;
}

export interface ColocacionPersonaje extends Punto {
  ref: string;
  mirando: Mirando;
  expresion: Expresion;
}

export interface Puerta extends Punto {
  id: string;
  hacia: string;
  etiqueta: string;
}

export interface Sala {
  id: string;
  nombre: string;
  descripcion: string;
  encuadre: Encuadre;
  fondo: string;
  entrada: Punto;
  muebles: Colocacion[];
  objetos: Colocacion[];
  personajes: ColocacionPersonaje[];
  puertas: Puerta[];
}

export interface Recorrido {
  id: string;
  nombre: string;
  descripcion: string;
  salas: string[];
}

export interface MuebleCatalogo {
  id: string;
  nombre: string;
  arte: string;
  ancho: number;
  alto: number;
  colision: boolean;
}

export interface ObjetoCatalogo {
  id: string;
  nombre: string;
  tipo: TipoObjeto;
  arte: string;
  textoInteraccion: string;
}

export interface HerramientaCatalogo {
  id: string;
  nombre: string;
  descripcion: string;
  arte: string;
}

export interface Personaje {
  id: string;
  nombre: string;
  rol: string;
  recipeId: string;
}

export interface Escenario {
  esquema: 1;
  id: string;
  nombre: string;
  descripcion: string;
  temas: string[];
  completo: boolean;
  arteProvisional: boolean;
  salas: Sala[];
  recorridosSugeridos: Recorrido[];
  catalogo: {
    muebles: MuebleCatalogo[];
    objetos: ObjetoCatalogo[];
    herramientas: HerramientaCatalogo[];
  };
  personajes: Personaje[];
}
