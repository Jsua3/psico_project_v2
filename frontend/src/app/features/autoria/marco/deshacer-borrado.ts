import { DestroyRef, Injectable, inject, signal } from '@angular/core';

import { CasoStore } from '../estado/caso.store';
import type { Comentario, Linea } from '../modelo/caso';

/** Cuánto se ofrece «Deshacer» después de borrar (EDITOR.md §4.6). */
export const PLAZO_DESHACER_MS = 8000;

export interface AvisoDeshacer {
  /** Qué se borró, en palabras de la docente («Borraste una línea de Laura»). */
  texto: string;
}

/**
 * «Deshacer» de los borrados del guion que nada del caso referencia: una línea, una frase al acercarse y una pista
 * (EDITOR.md §4.6, revisado tras Codex, hallazgo 5). El borrado va al store EN EL ACTO —así el modelo, los pendientes, la
 * vista del estudiante y el servidor nunca difieren de la pantalla— y durante 8 s se ofrece «Deshacer», que VUELVE A CREAR
 * el elemento con la API pública del store (la línea con `agregarLinea` + `editarLinea` + `moverLinea` hasta su sitio; las
 * frases y las pistas con su lista anterior). Que lo recreado tenga otro identificador no rompe nada: nada apunta a ellos.
 *
 * Reemplaza al borrado diferido de la primera versión, que ocultaba el elemento sin decírselo al store: mientras duraba el
 * plazo, la validación, el riel y la mini simulación leían algo que la pantalla ya no mostraba, y el borrado dependía de que
 * `pagehide` alcanzara a encolarlo. Las respuestas y las escenas no pasan por aquí: piden confirmación (las referencian otras
 * partes del caso y rehacerlas a mano no es fiel).
 *
 * Un solo «Deshacer» a la vez: borrar otra cosa reemplaza el aviso (como en iOS y en Gmail). Cerrar la pestaña no pierde
 * nada: el borrado ya está en la cola de siempre y el aviso simplemente deja de ofrecerse.
 */
@Injectable({ providedIn: 'root' })
export class DeshacerBorrado {
  private readonly store = inject(CasoStore);
  private readonly avisoActual = signal<AvisoDeshacer | null>(null);
  /** El aviso con «Deshacer» que pinta el marco, o `null`. */
  readonly aviso = this.avisoActual.asReadonly();
  private restaurar: (() => void) | null = null;
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.descartar());
  }

  /** Borra una línea del guion y ofrece recrearla igual (personaje, expresión, texto y posición). */
  linea(escenaId: string, lineaId: string): void {
    const escena = this.store.caso()?.escenas.find((e) => e.id === escenaId);
    const posicion = escena?.lineas.findIndex((l) => l.id === lineaId) ?? -1;
    if (!escena || posicion < 0) return;
    const { id: _id, ...campos } = structuredClone(escena.lineas[posicion]);
    const nombre = this.store.caso()?.personajes.find((p) => p.id === campos.personajeId)?.nombre;
    this.store.borrarLinea(escenaId, lineaId);
    this.ofrecer(nombre ? `Borraste una línea de ${nombre}` : 'Borraste una línea', () => this.recrearLinea(escenaId, posicion, campos));
  }

  /** Borra una frase al acercarse (por su posición) y ofrece volver a la lista anterior. */
  comentario(escenaId: string, indice: number): void {
    const antes = this.store.caso()?.escenas.find((e) => e.id === escenaId)?.comentarios;
    if (!antes || indice < 0 || indice >= antes.length) return;
    const copia: Comentario[] = structuredClone(antes);
    this.store.fijarComentarios(escenaId, copia.filter((_, i) => i !== indice));
    this.ofrecer('Borraste una frase al acercarse', () => this.store.fijarComentarios(escenaId, copia));
  }

  /** Borra una pista (por su posición) y ofrece volver a la lista anterior, en su orden. */
  pista(escenaId: string, indice: number): void {
    const antes = this.store.caso()?.escenas.find((e) => e.id === escenaId)?.pistas?.map((p) => p.texto);
    if (!antes || indice < 0 || indice >= antes.length) return;
    this.store.fijarPistas(escenaId, antes.filter((_, i) => i !== indice));
    this.ofrecer('Borraste una pista', () => this.store.fijarPistas(escenaId, antes));
  }

  /** Vuelve a crear lo último que se borró (si el plazo no venció) y retira el aviso. */
  deshacer(): void {
    const accion = this.restaurar;
    this.descartar();
    accion?.();
  }

  /** Retira el aviso sin deshacer: el borrado se queda. */
  descartar(): void {
    if (this.temporizador !== null) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.restaurar = null;
    this.avisoActual.set(null);
  }

  private ofrecer(texto: string, restaurar: () => void): void {
    this.descartar();
    this.restaurar = restaurar;
    this.avisoActual.set({ texto });
    this.temporizador = setTimeout(() => this.descartar(), PLAZO_DESHACER_MS);
  }

  /** La línea nueva nace al final: se le ponen sus campos y se sube hasta la posición que tenía. */
  private recrearLinea(escenaId: string, posicion: number, campos: Omit<Linea, 'id'>): void {
    if (!this.store.caso()?.escenas.some((e) => e.id === escenaId)) return; // la escena ya no está: no hay dónde volver
    const id = this.store.agregarLinea(escenaId);
    const definidos = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined)) as Partial<Omit<Linea, 'id'>>;
    this.store.editarLinea(escenaId, id, definidos);
    const lugar = () => this.store.caso()?.escenas.find((e) => e.id === escenaId)?.lineas.findIndex((l) => l.id === id) ?? -1;
    for (let actual = lugar(); actual > posicion; actual = lugar()) {
      this.store.moverLinea(escenaId, id, -1);
      if (lugar() === actual) break; // no se movió: no insistir
    }
  }
}
