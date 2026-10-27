import type { CasoBorrador, Escena, SalaCaso } from './caso';
import type { Escenario } from './escenario';
import { nuevoId } from './ids';

/** Separación horizontal entre las escenas iniciales en el mapa de escenas. */
export const SEPARACION_ESCENAS = 240;

/**
 * Elegir un lugar copia su escenario dentro del caso (diseño 5.1): la biblioteca no se
 * modifica y el caso queda independiente. Crea una escena por sala elegida, en ese orden;
 * la primera es el inicio. Una puerta hacia una sala no elegida queda sin destino.
 */
export function copiarEscenarioAlCaso(e: Escenario, salaIds: string[], titulo: string): CasoBorrador {
  const elegidas = new Set(salaIds);
  const salas: SalaCaso[] = salaIds.map((id) => {
    const sala = e.salas.find((s) => s.id === id);
    if (!sala) throw new Error(`La sala «${id}» no existe en «${e.nombre}».`);
    const copia = structuredClone(sala);
    return {
      ...copia,
      puertas: copia.puertas.map((p) => ({ ...p, hacia: elegidas.has(p.hacia) ? p.hacia : null })),
      origen: { lugarId: e.id, salaId: sala.id },
    };
  });

  const escenas: Escena[] = salas.map((sala, i) => ({
    id: nuevoId('escena'),
    titulo: sala.nombre,
    salaId: sala.id,
    lineas: [],
    respuestas: [],
    esFinal: false,
    posicion: { x: i * SEPARACION_ESCENAS, y: 0 },
  }));

  return {
    id: nuevoId('caso'),
    titulo,
    lugarId: e.id,
    salas,
    escenas,
    inicioId: escenas[0]?.id ?? null,
    modoFinales: 'automatico',
    finales: [],
    personajes: structuredClone(e.personajes),
    catalogo: structuredClone(e.catalogo),
  };
}
