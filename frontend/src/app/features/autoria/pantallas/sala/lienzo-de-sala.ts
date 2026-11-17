import type { SalaPorPiezas } from '../../../simulator/sala/catalogo';
import { VIEW_ROWS, type ViewId } from '../../../character/kit/kit-engine';
import { rutaArte, rutaSpriteKit } from '../../modelo/biblioteca.service';
import type { CasoBorrador, SalaCaso } from '../../modelo/caso';

/** La vista del kit para cada orientación de la biblioteca: idle.png tiene una fila por vista, en el orden de VIEW_ROWS. */
const VISTA_DE: Readonly<Record<string, ViewId>> = {
  abajo: 'down', 'abajo-izquierda': 'down-left', izquierda: 'left', 'arriba-izquierda': 'up-left',
  arriba: 'up', 'arriba-derecha': 'up-right', derecha: 'right', 'abajo-derecha': 'down-right',
};

/** La fila de idle.png para una orientación; sin orientación conocida, de frente (abajo). */
export function filaDeMirando(mirando: string | undefined): number {
  return VIEW_ROWS.indexOf(VISTA_DE[mirando ?? ''] ?? 'down');
}

export interface ActorDelLienzo {
  clave: string;
  url: string;
  cuadroAncho: number;
  cuadroAlto: number;
  fila: number;
  x: number;
  y: number;
  espejo: boolean;
}

export function salaParaLienzo(sala: SalaCaso): SalaPorPiezas | null {
  if (!sala.estructura) return null;
  return {
    encuadre: sala.encuadre,
    estructura: sala.estructura,
    puertas: sala.puertas.filter((p) => p.muro !== undefined).map((p) => ({
      id: p.id, muro: p.muro!, pos: p.pos ?? 0, modelo: p.modelo ?? '', etiqueta: p.etiqueta,
    })),
  };
}

/** El catálogo y las recetas pertenecen al caso, no a la sala; se pasan cuando están disponibles. */
export function actoresDeSala(sala: SalaCaso, caso?: Pick<CasoBorrador, 'catalogo' | 'personajes' | 'lugarId'>): ActorDelLienzo[] {
  const muebles = sala.muebles.flatMap((m, i) => {
    const ficha = caso?.catalogo.muebles.find((c) => c.id === m.ref);
    return ficha ? [{ clave: `mueble-${i}`, url: rutaArte(caso?.lugarId ?? null, ficha.arte),
      cuadroAncho: ficha.ancho, cuadroAlto: ficha.alto, fila: 0, x: m.x, y: m.y, espejo: !!m.espejo }] : [];
  });
  const objetos = sala.objetos.flatMap((o, i) => {
    const ficha = caso?.catalogo.objetos.find((c) => c.id === o.ref);
    return ficha ? [{ clave: `objeto-${i}`, url: rutaArte(caso?.lugarId ?? null, ficha.arte),
      cuadroAncho: 0, cuadroAlto: 0, fila: 0, x: o.x, y: o.y, espejo: !!o.espejo }] : [];
  });
  const personas = sala.personajes.map((p, i) => ({
    clave: `personaje-${i}`, url: rutaSpriteKit(caso?.personajes.find((c) => c.id === p.ref)?.recipeId ?? p.ref),
    cuadroAncho: 48, cuadroAlto: 72, fila: filaDeMirando(p.mirando), x: p.x, y: p.y, espejo: false,
  }));
  return [...muebles, ...objetos, ...personas];
}
