import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

import { CasoStore } from '../estado/caso.store';
import type { CasoBorrador } from '../modelo/caso';
import { type ContextoIa, IaService } from './ia.service';
import { type Cambio, MENSAJE_PROPUESTA_INVALIDA, dependencias } from './propuestas';

interface Turno {
  quien: 'tu' | 'ia';
  texto: string;
}

const CLASIFICACION: Record<string, string> = { adecuada: 'adecuada', 'con-riesgo': 'con riesgo', inadecuada: 'inadecuada' };

/** Qué pantalla y qué elemento tiene a la vista el docente (el contexto que viaja a la IA). */
export function contextoDeRuta(url: string): ContextoIa {
  const partes = url.split('?')[0].split('/').filter(Boolean);
  if (partes[0] === 'editor' && partes[1] === 'escena') return { pantalla: 'guion', seleccion: partes[2] ?? null };
  if (partes[0] === 'editor' && partes[1] === 'sala') return { pantalla: 'sala', seleccion: partes[2] ?? null };
  if (partes[0] === 'editor' && partes[1] === 'finales') return { pantalla: 'finales', seleccion: null };
  if (partes[0] === 'editor') return { pantalla: 'mapa', seleccion: null };
  return { pantalla: partes[0] ?? 'inicio', seleccion: null };
}

/** Cómo se describe cada parte de una propuesta ante el docente. */
export function describirCambio(caso: CasoBorrador, c: Cambio, todos: Cambio[]): string {
  const escena = (id: string) =>
    caso.escenas.find((e) => e.id === id)?.titulo
    ?? (todos.find((x) => x.op === 'agregar-escena' && x.id === id) as { titulo?: string } | undefined)?.titulo
    ?? 'una escena';
  const sala = (id: string) => caso.salas.find((s) => s.id === id)?.nombre ?? 'una sala';
  const persona = (id: string) => caso.personajes.find((p) => p.id === id)?.nombre ?? 'un personaje';
  switch (c.op) {
    case 'agregar-escena': return `Escena nueva «${c.titulo}» en ${sala(c.salaId)}`;
    case 'agregar-linea': return `${persona(c.personajeId)} dice en «${escena(c.escenaId)}» (${c.expresion}): «${c.texto}»`;
    case 'agregar-respuesta': return `Respuesta ${CLASIFICACION[c.clasificacion]} en «${escena(c.escenaId)}»: «${c.texto}»`;
    case 'colocar-personaje': return `Colocar a ${persona(c.ref)} en ${sala(c.salaId)}`;
    case 'mover': return `Mover un elemento en ${sala(c.salaId)}`;
    case 'agregar-final': return `Final «${c.nombre}»: «${c.texto}»`;
  }
}

/**
 * Asistente de IA (tablero 29): el docente pide, la IA propone por partes y el docente marca
 * qué entra al caso. Nada se aplica sin «Aplicar lo marcado», y lo aplicado se deshace con Ctrl+Z.
 */
@Component({
  selector: 'app-panel-ia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside aria-labelledby="iat" class="panel">
      <div class="cabeza">
        <h2 id="iat">Asistente de IA</h2>
        <button type="button" class="boton cuadrado" aria-label="Cerrar el asistente" (click)="cerrar.emit()">✕</button>
      </div>
      <p class="aviso-ia"><strong>La IA propone; tú decides.</strong> Todo lo generado queda marcado hasta que lo revises.</p>

      @if (ia.estado() === 'sin-conexion') {
        <div class="estado">
          <span class="pildora">Modo sin conexión: respuestas de ejemplo</span>
          <p class="texto-secundario">Puedes seguir editando; el asistente responde con ejemplos fijos para que pruebes cómo funciona.</p>
          <button type="button" class="boton" (click)="ia.comprobar()">Reintentar la conexión</button>
        </div>
      } @else if (ia.estado() === 'limite') {
        <p class="estado" role="status">Llegaste al límite de ayuda de la IA por hoy. Puedes seguir editando a mano.</p>
      }

      <div role="log" aria-label="Conversación con el asistente" aria-live="polite" class="conversacion">
        @for (t of turnos(); track $index) {
          <p class="turno" [class.mio]="t.quien === 'tu'"><strong>{{ t.quien === 'tu' ? 'Tú:' : 'Asistente:' }}</strong> {{ t.texto }}</p>
        }
        @if (pensando()) {
          <p role="status" class="pensando">Pensando… <button type="button" class="boton boton-texto" (click)="detener()">Detener</button></p>
        }
      </div>

      @if (propuesta(); as p) {
        <section aria-labelledby="pia" class="tarjeta propuesta marca-ia">
          <h3 id="pia">Propuesta <span class="pildora">Sugerido por la IA</span></h3>
          <ul class="partes">
            @for (c of p.cambios; track $index; let i = $index) {
              <li>
                <label>
                  <input type="checkbox" [checked]="p.seleccion[i]" (change)="alternar(i)" />
                  <span>{{ descripcion(c, p.cambios) }}</span>
                </label>
              </li>
            }
          </ul>
          <div class="acciones">
            <button type="button" class="boton boton-primario" [attr.aria-disabled]="!hayMarcadas()" (click)="aplicar()">Aplicar lo marcado</button>
            <button type="button" class="boton" (click)="descartar()">Descartar</button>
          </div>
        </section>
      }

      <form (submit)="enviar($event)" class="pedir">
        <label for="iaq" class="etiqueta">Pídele algo al asistente</label>
        <textarea id="iaq" #campo rows="3" class="campo" placeholder="Por ejemplo: «Escribe la respuesta inadecuada con más cuidado»"
                  [value]="borrador()" (input)="borrador.set($any($event.target).value)"
                  (keydown.control.enter)="enviar($event)"></textarea>
        <button type="submit" class="boton boton-secundario" [attr.aria-disabled]="pensando() || !borrador().trim()">Enviar</button>
        <p class="texto-secundario nota">Solo se envía el contenido del caso, que es ficticio, y tu petición. Nunca datos de estudiantes.</p>
      </form>
    </aside>
  `,
  styles: `
    :host { display: block; }
    .panel { display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--superficie); border-left: 1px solid var(--linea); min-height: 100%; box-sizing: border-box; }
    .cabeza { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    h2 { margin: 0; font-size: 22px; line-height: 30px; }
    h3 { margin: 0 0 8px; font-size: 18px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .cuadrado { width: 48px; padding: 0; }
    .aviso-ia { margin: 0; padding: 10px 12px; border-radius: var(--radio-control); background: var(--fondo); font-size: 16px; line-height: 24px; }
    .estado { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; margin: 0; }
    .estado p { margin: 0; font-size: 16px; }
    .conversacion { display: flex; flex-direction: column; gap: 8px; max-height: 40vh; overflow: auto; }
    .turno { margin: 0; font-size: 16px; line-height: 24px; }
    .turno.mio { padding: 8px 10px; border-radius: var(--radio-control); background: var(--primario-tinte); }
    .pensando { margin: 0; display: flex; gap: 8px; align-items: center; }
    .partes { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .partes label { display: flex; gap: 10px; align-items: flex-start; font-size: 16px; line-height: 24px; cursor: pointer; }
    .partes input { width: 22px; height: 22px; margin-top: 1px; flex: none; accent-color: var(--primario); }
    .pedir { display: flex; flex-direction: column; gap: 6px; }
    .pedir .boton { align-self: flex-start; }
    .etiqueta { font-weight: 700; font-size: 16px; }
    .campo { padding: 8px 12px; font: inherit; font-size: 16px; border: 2px solid var(--borde-control); border-radius: var(--radio-control); resize: vertical; }
    .nota { margin: 0; font-size: 16px; line-height: 24px; }
  `,
})
export class PanelIaComponent {
  readonly cerrar = output<void>();

  protected readonly ia = inject(IaService);
  private readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  private readonly campo = viewChild<ElementRef<HTMLTextAreaElement>>('campo');

  protected readonly turnos = signal<Turno[]>([]);
  protected readonly borrador = signal('');
  protected readonly pensando = signal(false);
  protected readonly propuesta = signal<{ cambios: Cambio[]; seleccion: boolean[] } | null>(null);
  private controlador: AbortController | null = null;

  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects)),
    { initialValue: this.router.url },
  );
  protected readonly hayMarcadas = computed(() => this.propuesta()?.seleccion.some(Boolean) ?? false);

  constructor() {
    void this.ia.comprobar();
  }

  protected descripcion(c: Cambio, todos: Cambio[]): string {
    const caso = this.store.caso();
    return caso ? describirCambio(caso, c, todos) : '';
  }

  /** Marcar una parte marca la escena nueva que necesita; desmarcar una escena desmarca lo que depende de ella. */
  protected alternar(i: number): void {
    const p = this.propuesta();
    if (!p) return;
    const deps = dependencias(p.cambios);
    const seleccion = [...p.seleccion];
    seleccion[i] = !seleccion[i];
    if (seleccion[i]) {
      for (const j of deps[i]) seleccion[j] = true;
    } else {
      deps.forEach((d, k) => { if (d.includes(i)) seleccion[k] = false; });
    }
    this.propuesta.set({ ...p, seleccion });
  }

  protected async enviar(evento: Event): Promise<void> {
    evento.preventDefault();
    const peticion = this.borrador().trim();
    const caso = this.store.caso();
    if (!peticion || this.pensando()) return;
    if (!caso) {
      this.turnos.update((t) => [...t, { quien: 'tu', texto: peticion }, { quien: 'ia', texto: 'Primero crea un caso eligiendo un lugar; después te ayudo con él.' }]);
      this.borrador.set('');
      return;
    }
    this.turnos.update((t) => [...t, { quien: 'tu', texto: peticion }]);
    this.borrador.set('');
    this.propuesta.set(null);
    this.pensando.set(true);
    this.controlador = new AbortController();
    try {
      const r = await this.ia.proponer(caso, peticion, contextoDeRuta(this.url()), this.controlador.signal);
      this.turnos.update((t) => [...t, { quien: 'ia', texto: r.mensaje }]);
      if (r.cambios && r.cambios.length) this.propuesta.set({ cambios: r.cambios, seleccion: r.cambios.map(() => true) });
    } catch {
      this.turnos.update((t) => [...t, { quien: 'ia', texto: 'Detuviste la petición.' }]);
    } finally {
      this.pensando.set(false);
      this.controlador = null;
    }
  }

  protected detener(): void {
    this.controlador?.abort();
  }

  protected aplicar(): void {
    const p = this.propuesta();
    if (!p || !p.seleccion.some(Boolean)) return;
    try {
      this.store.aplicarPropuesta(p.cambios, p.seleccion);
      const n = p.seleccion.filter(Boolean).length;
      this.turnos.update((t) => [...t, { quien: 'ia', texto: `Agregué ${n} ${n === 1 ? 'parte' : 'partes'} al caso, marcadas «Sugerido por la IA» hasta que las aceptes. Ctrl+Z lo deshace.` }]);
    } catch {
      this.turnos.update((t) => [...t, { quien: 'ia', texto: MENSAJE_PROPUESTA_INVALIDA }]);
    }
    this.propuesta.set(null);
    this.campo()?.nativeElement.focus();
  }

  protected descartar(): void {
    this.propuesta.set(null);
    this.turnos.update((t) => [...t, { quien: 'ia', texto: 'Descarté la propuesta. El caso no cambió.' }]);
    this.campo()?.nativeElement.focus();
  }
}
