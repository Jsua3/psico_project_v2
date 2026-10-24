import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { BibliotecaService } from '../modelo/biblioteca.service';
import type { CasoBorrador, Escena, SalaCaso } from '../modelo/caso';
import { SEPARACION_ESCENAS } from '../modelo/copiar';
import type { ColocacionPersonaje } from '../modelo/escenario';
import { centroDeZona, limitarAZona, zonaCaminable } from '../modelo/geometria';
import { nuevoId } from '../modelo/ids';
import { trazarEscenas } from '../modelo/trazado';
import { Historial } from './historial';

/** Dónde se guarda el caso en el navegador (una recarga no borra el trabajo). */
export const CLAVE_ALMACEN = 'sandbox-editor-casos/v1';

export type TipoElemento = 'mueble' | 'objeto' | 'personaje';

function leerGuardado(): CasoBorrador | null {
  try {
    const texto = localStorage.getItem(CLAVE_ALMACEN);
    if (!texto) return null;
    const datos = JSON.parse(texto) as Partial<CasoBorrador> | null;
    return datos && typeof datos === 'object' && typeof datos.id === 'string' && Array.isArray(datos.escenas)
      ? (datos as CasoBorrador)
      : null;
  } catch {
    return null; // navegador privado, almacenamiento bloqueado o contenido roto
  }
}

function lista(sala: SalaCaso, tipo: TipoElemento) {
  return tipo === 'mueble' ? sala.muebles : tipo === 'objeto' ? sala.objetos : sala.personajes;
}

/**
 * Estado del caso en borrador. Todo el sandbox lee y cambia el caso por aquí, y cada cambio
 * pasa por el historial para poder deshacerlo.
 */
@Injectable({ providedIn: 'root' })
export class CasoStore {
  private readonly router = inject(Router);
  private readonly biblioteca = inject(BibliotecaService);
  private readonly estado = signal<CasoBorrador | null>(null);
  private historial: Historial<CasoBorrador> | null = null;
  private readonly version = signal(0);

  readonly caso = this.estado.asReadonly();
  readonly puedeDeshacer = computed(() => (this.version(), this.historial?.puedeDeshacer ?? false));
  readonly puedeRehacer = computed(() => (this.version(), this.historial?.puedeRehacer ?? false));

  constructor() {
    this.empezarCon(leerGuardado());
    effect(() => {
      const caso = this.estado();
      if (caso === null) return; // borrar es explícito: reiniciar()
      try {
        localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(caso));
      } catch {
        // Sin almacenamiento el sandbox sigue funcionando; solo no sobrevive a una recarga.
      }
    });
  }

  private empezarCon(caso: CasoBorrador | null): void {
    this.historial = caso ? new Historial(caso) : null;
    this.estado.set(caso);
    this.version.update((v) => v + 1);
  }

  /** Aplica un cambio sobre una copia del caso y lo deja en el historial. */
  protected cambiar(fn: (caso: CasoBorrador) => void): void {
    const actual = this.estado();
    if (!actual || !this.historial) return;
    const nuevo = structuredClone(actual);
    fn(nuevo);
    this.historial.hacer(nuevo);
    this.estado.set(nuevo);
    this.version.update((v) => v + 1);
  }

  private sala(caso: CasoBorrador, salaId: string): SalaCaso {
    const sala = caso.salas.find((s) => s.id === salaId);
    if (!sala) throw new Error(`La sala «${salaId}» no está en el caso.`);
    return sala;
  }

  /** Vuelve a leer el caso guardado en el navegador. */
  cargarDeLocal(): void {
    this.empezarCon(leerGuardado());
  }

  /** Reemplaza el caso en curso (el historial empieza de cero). */
  fijar(caso: CasoBorrador): void {
    this.empezarCon(caso);
  }

  /** Guarda un caso recién creado desde un lugar y abre el editor. */
  crearCaso(caso: CasoBorrador): void {
    this.fijar(caso);
    void this.router.navigateByUrl('/editor');
  }

  /** Borra el caso y lo guardado: el sandbox vuelve a empezar. */
  reiniciar(): void {
    this.empezarCon(null);
    try {
      localStorage.removeItem(CLAVE_ALMACEN);
    } catch {
      // nada que borrar
    }
  }

  deshacer(): void {
    const previo = this.historial?.deshacer();
    if (previo) {
      this.estado.set(previo);
      this.version.update((v) => v + 1);
    }
  }

  rehacer(): void {
    const siguiente = this.historial?.rehacer();
    if (siguiente) {
      this.estado.set(siguiente);
      this.version.update((v) => v + 1);
    }
  }

  // ── Sala ────────────────────────────────────────────────────────────────

  moverElemento(salaId: string, tipo: TipoElemento, indice: number, x: number, y: number): void {
    this.cambiar((caso) => {
      const sala = this.sala(caso, salaId);
      const elemento = lista(sala, tipo)[indice];
      if (!elemento) return;
      const medio = tipo === 'mueble' ? (caso.catalogo.muebles.find((m) => m.id === elemento.ref)?.ancho ?? 0) / 2 : 0;
      Object.assign(elemento, limitarAZona(zonaCaminable(sala.encuadre), x, y, medio));
    });
  }

  quitarElemento(salaId: string, tipo: TipoElemento, indice: number): void {
    this.cambiar((caso) => {
      lista(this.sala(caso, salaId), tipo).splice(indice, 1);
    });
  }

  /** Agrega una pieza del catálogo (o un personaje del lugar) en el centro de la zona caminable. */
  agregarElemento(salaId: string, tipo: TipoElemento, ref: string): void {
    this.cambiar((caso) => {
      const sala = this.sala(caso, salaId);
      const { x, y } = centroDeZona(zonaCaminable(sala.encuadre));
      if (tipo === 'mueble') sala.muebles.push({ ref, x, y, espejo: false });
      else if (tipo === 'objeto') sala.objetos.push({ ref, x, y });
      else sala.personajes.push({ ref, x, y, mirando: 'izquierda', expresion: 'neutral' });
    });
  }

  editarPersonajeEnSala(
    salaId: string,
    indice: number,
    cambios: Partial<Pick<ColocacionPersonaje, 'mirando' | 'expresion'>>,
  ): void {
    this.cambiar((caso) => {
      const personaje = this.sala(caso, salaId).personajes[indice];
      if (personaje) Object.assign(personaje, cambios);
    });
  }

  /** Gira un mueble (espejo). */
  voltearMueble(salaId: string, indice: number): void {
    this.cambiar((caso) => {
      const mueble = this.sala(caso, salaId).muebles[indice];
      if (mueble) mueble.espejo = !mueble.espejo;
    });
  }

  // ── Escenas y caminos ─────────────────────────────────────────────────────

  private escena(caso: CasoBorrador, id: string): Escena {
    const e = caso.escenas.find((x) => x.id === id);
    if (!e) throw new Error(`La escena «${id}» no está en el caso.`);
    return e;
  }

  private nuevaEscena(caso: CasoBorrador, salaId: string, despuesDe?: string): Escena {
    const sala = this.sala(caso, salaId);
    const ref = despuesDe ? caso.escenas.find((e) => e.id === despuesDe) : undefined;
    const masDerecha = Math.max(0, ...caso.escenas.map((e) => e.posicion.x));
    const escena: Escena = {
      id: nuevoId('escena'),
      titulo: `Escena nueva en ${sala.nombre.charAt(0).toLowerCase()}${sala.nombre.slice(1)}`,
      salaId,
      lineas: [],
      respuestas: [],
      esFinal: false,
      posicion: ref ? { x: ref.posicion.x + SEPARACION_ESCENAS, y: ref.posicion.y + 120 } : { x: masDerecha + SEPARACION_ESCENAS, y: 0 },
    };
    caso.escenas.push(escena);
    if (!caso.inicioId) caso.inicioId = escena.id;
    return escena;
  }

  /** Agrega una escena en una sala del caso y devuelve su id. */
  agregarEscena(salaId: string, despuesDe?: string): string {
    let id = '';
    this.cambiar((caso) => {
      id = this.nuevaEscena(caso, salaId, despuesDe).id;
    });
    return id;
  }

  duplicarEscena(id: string): string {
    let nuevoIdEscena = '';
    this.cambiar((caso) => {
      const original = this.escena(caso, id);
      const copia: Escena = structuredClone(original);
      copia.id = nuevoId('escena');
      copia.titulo = `${original.titulo} (copia)`;
      copia.posicion = { x: original.posicion.x + 40, y: original.posicion.y + 40 };
      copia.lineas = copia.lineas.map((l) => ({ ...l, id: nuevoId('linea') }));
      copia.respuestas = copia.respuestas.map((r) => ({
        ...r,
        id: nuevoId('respuesta'),
        destinoId: r.destinoId === original.id ? copia.id : r.destinoId,
      }));
      caso.escenas.splice(caso.escenas.indexOf(original) + 1, 0, copia);
      nuevoIdEscena = copia.id;
    });
    return nuevoIdEscena;
  }

  /** Borra una escena: las respuestas que llevaban a ella quedan sin destino. */
  borrarEscena(id: string): void {
    this.cambiar((caso) => {
      caso.escenas = caso.escenas.filter((e) => e.id !== id);
      for (const e of caso.escenas) {
        for (const r of e.respuestas) if (r.destinoId === id) r.destinoId = null;
      }
      if (caso.inicioId === id) caso.inicioId = caso.escenas[0]?.id ?? null;
    });
  }

  moverEscena(id: string, x: number, y: number): void {
    this.cambiar((caso) => {
      this.escena(caso, id).posicion = { x: Math.round(x), y: Math.round(y) };
    });
  }

  /** Cambia a dónde lleva una respuesta (null: a ninguna escena). */
  conectar(respuestaId: string, destinoId: string | null): void {
    this.cambiar((caso) => {
      for (const e of caso.escenas) {
        const r = e.respuestas.find((x) => x.id === respuestaId);
        if (r) r.destinoId = destinoId;
      }
    });
  }

  /**
   * «Conectar con…» del mapa: agrega a la escena una respuesta (por escribir) que lleva a otra
   * escena, o a una escena nueva en la misma sala. Devuelve el id de la escena de destino.
   */
  conectarEscena(origenId: string, destino: string | 'nueva'): string {
    let destinoId = destino;
    this.cambiar((caso) => {
      const origen = this.escena(caso, origenId);
      if (destino === 'nueva') destinoId = this.nuevaEscena(caso, origen.salaId, origen.id).id;
      origen.respuestas.push({
        id: nuevoId('respuesta'), texto: '', clasificacion: 'adecuada', retroalimentacion: '', destinoId, marcaIa: false,
      });
    });
    return destinoId;
  }

  marcarFinal(id: string, esFinal: boolean): void {
    this.cambiar((caso) => {
      this.escena(caso, id).esFinal = esFinal;
    });
  }

  /** Reordena el mapa con un trazado de izquierda a derecha. */
  ordenarAutomaticamente(): void {
    this.cambiar((caso) => {
      const posiciones = trazarEscenas(caso);
      for (const e of caso.escenas) e.posicion = posiciones.get(e.id) ?? e.posicion;
    });
  }

  /** Deja la sala como viene en la biblioteca. Se puede deshacer. */
  async volverSalaOriginal(salaId: string): Promise<void> {
    const caso = this.estado();
    if (!caso) return;
    const { lugarId, salaId: origenId } = this.sala(caso, salaId).origen;
    const escenario = await this.biblioteca.escenario(lugarId);
    const original = escenario.salas.find((s) => s.id === origenId);
    if (!original) return;
    this.cambiar((c) => {
      const sala = this.sala(c, salaId);
      const enCaso = new Set(c.salas.map((s) => s.id));
      const copia = structuredClone(original);
      sala.muebles = copia.muebles;
      sala.objetos = copia.objetos;
      sala.personajes = copia.personajes;
      sala.entrada = copia.entrada;
      sala.puertas = copia.puertas.map((p) => ({ ...p, hacia: enCaso.has(p.hacia) ? p.hacia : null }));
    });
  }
}
