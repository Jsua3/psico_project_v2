/**
 * La guía de la escena sale del documento y del mundo: el objetivo que escribió la docente, lo que hay en la sala y
 * si algo queda por conocer. Un objeto sin revisar nunca se nombra (VD-19 de `world-places.util.ts`: no se anuncia
 * evidencia por descubrir), pero sí cuenta para «queda por conocer». Módulo puro: sin Angular ni Phaser.
 */
import type { PlaceCandidate } from '../world-places.util';

export interface EntradaGuia {
  goal: string;
  lugares: readonly PlaceCandidate[];
  /** Claves de los objetos y las personas del mapa ya inspeccionados. */
  inspeccionados: readonly string[];
  /** Claves de persona sin el prefijo `npc:` con las que ya se habló. */
  hablados: ReadonlySet<string>;
}

export interface ElementoSala {
  key: string;
  label: string;
  tipo: 'persona' | 'objeto';
  visto: boolean;
}

export interface GuiaEscena {
  objetivo: string;
  enEstaSala: readonly ElementoSala[];
  quedaPorConocer: boolean;
}

const PREFIJO_NPC = 'npc:';

export function armarGuia(e: EntradaGuia): GuiaEscena {
  const inspeccionados = new Set(e.inspeccionados);
  const vistas = new Set<string>();
  const personas: ElementoSala[] = [];
  const objetos: ElementoSala[] = [];

  for (const lugar of e.lugares) {
    const label = lugar.label.trim();
    if (lugar.kind === 'door' || label === '' || vistas.has(lugar.key)) continue;
    vistas.add(lugar.key);

    if (lugar.kind === 'person') {
      const visto = lugar.key.startsWith(PREFIJO_NPC)
        ? e.hablados.has(lugar.key.slice(PREFIJO_NPC.length))
        : e.hablados.has(lugar.key) || inspeccionados.has(lugar.key);
      personas.push({ key: lugar.key, label, tipo: 'persona', visto });
    } else {
      objetos.push({ key: lugar.key, label, tipo: 'objeto', visto: inspeccionados.has(lugar.key) });
    }
  }

  const todos = [...personas, ...objetos];
  return {
    objetivo: e.goal.trim(),
    enEstaSala: todos.filter(el => el.tipo === 'persona' || el.visto),
    quedaPorConocer: todos.some(el => !el.visto),
  };
}

/** Los ids de `despues` que no estaban en `antes`; en la primera carga (`antes` nulo) nada es nuevo. */
export function opcionesNuevas(antes: readonly number[] | null, despues: readonly number[]): number[] {
  if (antes === null) return [];
  const previas = new Set(antes);
  return despues.filter(id => !previas.has(id));
}
