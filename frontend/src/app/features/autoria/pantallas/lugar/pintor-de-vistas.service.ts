import { Injectable, Injector, inject } from '@angular/core';

import { planDeSala, rutasDelPlan } from '../../../simulator/sala/composicion';
import type { ManifiestoDePiezas, SalaPorPiezas } from '../../../simulator/sala/catalogo';
import { urlDePieza } from '../../../simulator/sala/catalogo';
import { componerSala, type Imagen } from '../../../simulator/sala/pintor';
import { AutoriaApiService } from '../../api/autoria-api.service';
import { rutaArte } from '../../modelo/biblioteca.service';
import type { Sala } from '../../modelo/escenario';

/** Píxeles de techo que se quitan arriba (el muro del fondo empieza en y = 84; quedan 28 de techo como marco). */
const TECHO_RECORTADO = 56;

/** Una sala tal como la trae la biblioteca: con `fondo` dibujado o, si es por piezas, con su `estructura` y sus puertas. */
export type SalaDeBiblioteca = Sala & { estructura?: SalaPorPiezas['estructura'] };

/**
 * Patrón Adapter (con caché): da a las pantallas de crear un caso UNA imagen por sala, venga como venga. Una sala con fondo
 * dibujado devuelve su archivo; una sala por piezas (el Hospital) se pinta aquí con el mismo plan y el mismo pintor del juego
 * (`planDeSala` + `componerSala`), más sus muebles de atrás hacia adelante, y se guarda como imagen en memoria. Así la
 * portada del Hospital y sus miniaturas son el cuarto real y no un hueco, sin dibujar arte nuevo ni duplicar la geometría.
 *
 * Si algo falla (sin lienzo, como en las pruebas; una pieza que no carga), devuelve `null` y la pantalla pinta su patrón.
 */
@Injectable({ providedIn: 'root' })
export class PintorDeVistas {
  /** La API se pide solo al componer: las salas con fondo dibujado (casi todas) no la necesitan. */
  private readonly injector = inject(Injector);
  private readonly vistas = new Map<string, Promise<string | null>>();
  private readonly imagenes = new Map<string, Promise<HTMLImageElement>>();

  /** La imagen de una sala: su fondo, o el cuarto compuesto por piezas. Una por sala y por sesión. */
  vista(lugarId: string, sala: SalaDeBiblioteca): Promise<string | null> {
    if (sala.fondo) return Promise.resolve(rutaArte(lugarId, sala.fondo) || null);
    if (!sala.estructura) return Promise.resolve(null);
    const clave = `${lugarId}/${sala.id}`;
    let vista = this.vistas.get(clave);
    if (!vista) {
      vista = this.componer(lugarId, sala).catch(() => null);
      this.vistas.set(clave, vista);
    }
    return vista;
  }

  private async componer(lugarId: string, sala: SalaDeBiblioteca): Promise<string | null> {
    const lienzo = typeof document === 'undefined' ? null : document.createElement('canvas');
    const ctx = lienzo?.getContext('2d', { willReadFrequently: true }) ?? null;
    if (!lienzo || !ctx || !sala.estructura) return null;
    const manifiesto = await this.injector.get(AutoriaApiService).manifiestoDePiezas();
    // Las puertas de la biblioteca traen su muro y su posición: el plan las coloca igual que el juego.
    const porPiezas = { encuadre: sala.encuadre, estructura: sala.estructura, puertas: sala.puertas } as unknown as SalaPorPiezas;
    const plan = planDeSala(porPiezas, manifiesto);
    const rutas = rutasDelPlan(plan);
    const cargadas = await Promise.all(rutas.map((r) => this.cargar(r)));
    const imagenes = new Map<string, Imagen>(rutas.map((r, i) => [r, aRgba(cargadas[i], ctx)]));
    const cuarto = componerSala(plan, imagenes, null);
    lienzo.width = plan.ancho;
    lienzo.height = plan.alto;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(cuarto.rgba), plan.ancho, plan.alto), 0, 0);
    await this.ponerMuebles(ctx, lugarId, sala, manifiesto);
    // El techo vacío (la franja oscura sobre el muro) pesa en una miniatura: se recorta y queda un filo de él como marco.
    const salida = document.createElement('canvas');
    salida.width = plan.ancho;
    salida.height = plan.alto - TECHO_RECORTADO;
    salida.getContext('2d')?.drawImage(lienzo, 0, -TECHO_RECORTADO);
    return await new Promise<string | null>((listo) => salida.toBlob((b) => listo(b ? URL.createObjectURL(b) : null), 'image/png'));
  }

  /** Los muebles van encima del cuarto, de atrás hacia adelante; cada uno en su primer cuadro y apoyado en su punto. */
  private async ponerMuebles(ctx: CanvasRenderingContext2D, lugarId: string, sala: SalaDeBiblioteca, m: ManifiestoDePiezas): Promise<void> {
    const muebles = [...(sala.muebles ?? [])].sort((a, b) => a.y - b.y);
    for (const c of muebles) {
      const ficha = m.muebles[`${lugarId}/${c.ref}`];
      if (!ficha) continue;
      try {
        const img = await this.cargar(ficha.ruta);
        const [ax, ay] = (ficha as { apoyo?: [number, number] }).apoyo ?? [ficha.ancho / 2, ficha.alto];
        ctx.save();
        if (c.espejo) { ctx.translate(2 * c.x, 0); ctx.scale(-1, 1); }
        ctx.drawImage(img, 0, 0, ficha.ancho, ficha.alto, Math.round(c.x - ax), Math.round(c.y - ay), ficha.ancho, ficha.alto);
        ctx.restore();
      } catch {
        // Un mueble que no carga no tumba la vista: el cuarto se ve igual sin él.
      }
    }
  }

  private cargar(ruta: string): Promise<HTMLImageElement> {
    let img = this.imagenes.get(ruta);
    if (!img) {
      img = new Promise<HTMLImageElement>((listo, falla) => {
        const i = new Image();
        i.onload = () => listo(i);
        i.onerror = () => falla(new Error(`No cargó ${ruta}`));
        i.src = urlDePieza(ruta);
      });
      this.imagenes.set(ruta, img);
    }
    return img;
  }
}

/** De una imagen del navegador al búfer RGBA que espera el pintor del juego. */
function aRgba(img: HTMLImageElement, ctx: CanvasRenderingContext2D): Imagen {
  const { naturalWidth: ancho, naturalHeight: alto } = img;
  ctx.canvas.width = ancho;
  ctx.canvas.height = alto;
  ctx.clearRect(0, 0, ancho, alto);
  ctx.drawImage(img, 0, 0);
  return { ancho, alto, rgba: ctx.getImageData(0, 0, ancho, alto).data };
}
