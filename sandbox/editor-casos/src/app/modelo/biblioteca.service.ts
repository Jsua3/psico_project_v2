import { Injectable } from '@angular/core';

import type { Escenario } from './escenario';

export interface LugarResumen {
  id: string;
  nombre: string;
  completo: boolean;
  salas: number;
}

/** Lugares que el sandbox anuncia aunque todavía no estén en la biblioteca. */
const PRONTO: readonly LugarResumen[] = [
  { id: 'casa', nombre: 'Casa', completo: false, salas: 0 },
  { id: 'comisaria-familia', nombre: 'Comisaría de familia', completo: false, salas: 0 },
];

const LUGARES_LISTOS = ['universidad'] as const;

/** Ruta de una imagen de un lugar (las rutas del escenario son relativas a su carpeta). */
export function rutaArte(lugarId: string, relativa: string): string {
  return `assets/biblioteca/${lugarId}/${relativa}`;
}

/** Ruta del retrato de un personaje del kit con una expresión. */
export function rutaRetrato(recipeId: string, expresion: string): string {
  return `assets/kit/${recipeId}/portrait-${expresion}.png`;
}

/** Lee la biblioteca de escenarios de P1, servida como assets del sandbox. */
@Injectable({ providedIn: 'root' })
export class BibliotecaService {
  private readonly cache = new Map<string, Promise<Escenario>>();

  async lugares(): Promise<LugarResumen[]> {
    const listos = await Promise.all(
      LUGARES_LISTOS.map(async (id) => {
        const e = await this.escenario(id);
        return { id: e.id, nombre: e.nombre, completo: e.completo, salas: e.salas.length };
      }),
    );
    return [...listos, ...PRONTO];
  }

  escenario(id: string): Promise<Escenario> {
    let pendiente = this.cache.get(id);
    if (!pendiente) {
      pendiente = fetch(`assets/biblioteca/${id}/escenario.json`).then(async (r) => {
        if (!r.ok) throw new Error(`No se pudo leer el lugar «${id}».`);
        return (await r.json()) as Escenario;
      });
      pendiente.catch(() => this.cache.delete(id));
      this.cache.set(id, pendiente);
    }
    return pendiente;
  }
}
