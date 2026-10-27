import type { CasoBorrador, CondicionFinal, ConteoClase, Final, Respuesta, TonoFinal } from './caso';
import { type ContextoCondicion, evaluarCondicion } from './condiciones';

/** Los cuatro finales del modelo, en el orden en que se evalúan: gana el primero que se cumple. */
export type FinalAutomatico = 'critica' | 'protectora' | 'riesgo_persistente' | 'con_brechas';

export const ORDEN_AUTOMATICOS: readonly FinalAutomatico[] = ['critica', 'protectora', 'riesgo_persistente', 'con_brechas'];

/**
 * Nombre y texto de los cuatro finales del modelo (los mismos que el servidor, `services/endings.py`).
 * Borrador: los nombres y los textos están por confirmar con Psicología.
 */
export const FINALES_AUTOMATICOS: Record<FinalAutomatico, { nombre: string; texto: string; tono: TonoFinal }> = {
  critica: {
    nombre: 'Intervención con riesgo de revictimización',
    texto: 'Alguna de tus respuestas pudo hacerle daño a la persona usuaria, o quedaron sin darse pasos de protección que el caso exigía. Revisa tu recorrido con tu docente.',
    tono: 'critical',
  },
  protectora: {
    nombre: 'Intervención protectora',
    texto: 'Cuidaste a la persona usuaria y diste los pasos de protección que el caso pedía. Repasa tu recorrido para ver qué te funcionó.',
    tono: 'positive',
  },
  riesgo_persistente: {
    nombre: 'El riesgo sigue abierto',
    texto: 'Quedó pendiente alguno de los pasos de protección, o varias de tus respuestas dejaron a la persona usuaria en riesgo. Revisa con tu docente qué faltó.',
    tono: 'warning',
  },
  con_brechas: {
    nombre: 'Intervención con brechas',
    texto: 'Hiciste parte del trabajo, pero quedaron respuestas por mejorar. Repasa tu recorrido y piensa qué harías distinto.',
    tono: 'neutral',
  },
};

/**
 * La condición de cada final de plantilla sobre los hitos decisivos del caso (la misma regla que
 * `casedef/legacy.py::template_endings_when`). `con_brechas` no tiene: es el final por defecto.
 */
export function condicionesDePlantilla(decisivos: string[]): Record<FinalAutomatico, CondicionFinal | null> {
  const deben: CondicionFinal[] = decisivos.map((milestone) => ({ milestone }));
  const critica: CondicionFinal[] = [{ count: 'contraindicated', gte: 2 }];
  if (deben.length) critica.push({ all: [{ count: 'contraindicated', gte: 1 }, { not: { all: deben } }] });
  return {
    critica: { any: critica },
    protectora: { all: [{ count: 'contraindicated', eq: 0 }, { count: 'risky', lte: 1 }, ...deben] },
    riesgo_persistente: { any: [...deben.map((item): CondicionFinal => ({ not: item })), { count: 'risky', gte: 3 }] },
    con_brechas: null,
  };
}

/** Los cuatro finales de plantilla del caso, en el orden en que se evalúan. */
export function finalesDePlantilla(caso: Pick<CasoBorrador, 'hitos'>): Final[] {
  const condiciones = condicionesDePlantilla(caso.hitos.filter((h) => h.decisivo).map((h) => h.clave));
  return ORDEN_AUTOMATICOS.map((id) => ({
    id, nombre: FINALES_AUTOMATICOS[id].nombre, texto: FINALES_AUTOMATICOS[id].texto, tono: FINALES_AUTOMATICOS[id].tono,
    condicion: condiciones[id], marcaIa: false,
  }));
}

export type Recorrido = { escenaId: string; respuestaId: string }[];

const PASO_POR_CLASE: Record<NonNullable<Respuesta['clase']>, [number, number]> = {
  RECOMMENDED: [1, -1], ACCEPTABLE: [0, 0], RISKY: [-1, 0], CONTRAINDICATED: [-1, 1],
};
const VINCULOS = ['WITHDRAWN', 'GUARDED', 'OPEN'];
const ACTIVACIONES = ['CALM', 'TENSE', 'CRISIS'];
const acotar = (lista: string[], actual: string, paso: number) =>
  lista[Math.max(0, Math.min(lista.length - 1, lista.indexOf(actual) + paso))];

/** Lo que el recorrido de la persona (sus respuestas, en orden) deja para las condiciones. */
export function contextoDeRecorrido(elegidas: Respuesta[]): ContextoCondicion {
  const conteos: Record<ConteoClase, number> = { recommended: 0, acceptable: 0, risky: 0, contraindicated: 0 };
  const hitos = new Set<string>();
  let bond = 'GUARDED';
  let activation = 'TENSE';
  for (const r of elegidas) {
    if (r.clase) {
      conteos[r.clase.toLowerCase() as ConteoClase]++;
      const declarado = r.efectos.persona;
      const [dBond, dActivation] = declarado ? [declarado.bond ?? 0, declarado.activation ?? 0] : PASO_POR_CLASE[r.clase];
      bond = acotar(VINCULOS, bond, dBond);
      activation = acotar(ACTIVACIONES, activation, dActivation);
    }
    for (const h of r.efectos.hitos ?? []) hitos.add(h);
  }
  return { conteos, hitos, persona: { bond, activation } };
}

/**
 * El final que vería el estudiante. `recorrido` son las respuestas que eligió, en orden. En modo propio gana el primer
 * final del docente cuya condición se cumple (el que no tiene condición aplica siempre); si ninguno se cumple, o el modo
 * es automático, gana el primero de los cuatro del modelo que se cumple.
 */
export function evaluarFinal(caso: CasoBorrador, recorrido: Recorrido): { nombre: string; texto: string } {
  const respuestas = new Map(caso.escenas.flatMap((e) => e.respuestas.map((r) => [r.id, r] as const)));
  const elegidas = recorrido.map((p) => respuestas.get(p.respuestaId)).filter((r): r is Respuesta => !!r);
  const ctx = contextoDeRecorrido(elegidas);
  const aplica = (f: Final) => f.condicion === null || evaluarCondicion(f.condicion, ctx);
  const propio = caso.modoFinales === 'propio' ? caso.finales.find(aplica) : undefined;
  const final = propio ?? finalesDePlantilla(caso).find(aplica)!;
  return { nombre: final.nombre, texto: final.texto };
}
