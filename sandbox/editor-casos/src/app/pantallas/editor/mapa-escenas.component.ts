import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, signal, viewChild,
} from '@angular/core';

import { rutaArte } from '../../modelo/biblioteca.service';
import { NOMBRE_AVISO, type Aviso } from '../../modelo/caminos';
import type { CasoBorrador, Escena } from '../../modelo/caso';
import { ALTO_ESCENA, ANCHO_ESCENA } from '../../modelo/trazado';

export type AccionEscena =
  | { tipo: 'duplicar' | 'conectar' | 'borrar'; escenaId: string }
  | { tipo: 'final'; escenaId: string; esFinal: boolean }
  | { tipo: 'mover'; escenaId: string; x: number; y: number };

interface Flecha {
  id: string;
  origen: string;
  destino: string;
  texto: string;
  d: string;
  medio: { x: number; y: number };
  deElegida: boolean;
}

const MARGEN = 32;
const PASO_MOVER = 24;

/**
 * Mapa de escenas (tablero 25): cada escena es una tarjeta, cada respuesta una flecha.
 * Al pasar el cursor o enfocar una escena se ve su sala. Las acciones están en el clic
 * derecho, en Mayús+F10 o la tecla de menú, y en el botón «Acciones».
 */
@Component({
  selector: 'app-mapa-escenas',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="barra">
      <p id="mapa-ayuda" class="texto-secundario">
        Mapa del caso: {{ caso().escenas.length }} escenas. Con el foco en una escena, las flechas van a la escena conectada;
        <kbd>Enter</kbd> abre su guion; <kbd>Mayús</kbd>+<kbd>F10</kbd> abre las acciones.
      </p>
      <div class="acciones">
        <button type="button" class="boton" data-accion="conectar-escenas marcar-final" [cdkMenuTriggerFor]="menu" #trigger="cdkMenuTriggerFor"
                [attr.aria-label]="elegidaEscena() ? 'Acciones de la escena ' + elegidaEscena()!.titulo : 'Acciones de la escena'"
                [attr.aria-disabled]="!elegidaEscena()">Acciones</button>
        <div role="group" aria-label="Zoom del mapa" class="acciones">
          <button type="button" class="boton cuadrado" aria-label="Alejar" (click)="zoomar(-0.1)">−</button>
          <span class="zoom">{{ porcentaje() }} %</span>
          <button type="button" class="boton cuadrado" aria-label="Acercar" (click)="zoomar(0.1)">+</button>
          <button type="button" class="boton" (click)="verTodo()">Ver todo el mapa</button>
        </div>
      </div>
    </div>

    <div class="marco" #marco (wheel)="rueda($event)" (keydown.escape)="vista.set(null)">
      <div class="plano" role="group" aria-label="Mapa del caso" aria-describedby="mapa-ayuda"
           [style.width.px]="limites().ancho * zoom()" [style.height.px]="limites().alto * zoom()">
        <div class="escala" [style.transform]="'scale(' + zoom() + ')'" [style.width.px]="limites().ancho" [style.height.px]="limites().alto">
          <svg class="flechas" [attr.width]="limites().ancho" [attr.height]="limites().alto" aria-hidden="false">
            <defs>
              <marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#6B7C84" />
              </marker>
              <marker id="punta-elegida" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#0B5563" />
              </marker>
            </defs>
            @for (f of flechas(); track f.id) {
              <path class="flecha" [class.de-elegida]="f.deElegida" [attr.d]="f.d" tabindex="0"
                    [attr.marker-end]="f.deElegida ? 'url(#punta-elegida)' : 'url(#punta)'"
                    [attr.aria-label]="'Respuesta: ' + (f.texto || 'sin escribir')"
                    (mouseenter)="flechaActiva.set(f.id)" (mouseleave)="flechaActiva.set(null)"
                    (focus)="flechaActiva.set(f.id)" (blur)="flechaActiva.set(null)" />
            }
          </svg>

          @for (e of caso().escenas; track e.id; let i = $index) {
            <button type="button" class="escena" [attr.data-escena]="e.id"
                    [class.elegida]="elegida() === e.id" [class.final]="e.esFinal" [class.con-aviso]="avisosDe(e.id).length" [class.marca-ia]="e.marcaIa"
                    [style.left.px]="pos(e).x" [style.top.px]="pos(e).y" [attr.tabindex]="tabParada() === e.id ? 0 : -1"
                    [attr.aria-pressed]="elegida() === e.id"
                    (click)="elegir(e.id)" (dblclick)="abrirGuion.emit(e.id)"
                    (contextmenu)="menuContextual($event, e.id)" (keydown)="tecla($event, e)"
                    (mouseenter)="vista.set(e.id)" (mouseleave)="vista.set(null)" (focus)="vista.set(e.id)" (blur)="vista.set(null)">
              <!-- El nombre de la tarjeta es su propio texto (lo que se ve) más un final que solo oye el lector. -->
              <span class="etiquetas">
                @if (caso().inicioId === e.id) { <span class="pildora pildora-primaria">Inicio</span> }
                @if (e.esFinal) { <span class="pildora pildora-adecuada">Final</span> }
                @if (e.marcaIa) { <span class="pildora">Sugerido por la IA</span> }
                @if (avisosDe(e.id).length === 1) {
                  <span class="pildora aviso">⚠ {{ nombreAviso[avisosDe(e.id)[0].tipo] }}</span>
                } @else if (avisosDe(e.id).length > 1) {
                  <span class="pildora aviso">⚠ {{ avisosDe(e.id).length }} avisos</span>
                }
              </span>
              <span class="titulo">{{ i + 1 }} · {{ e.titulo }}</span>
              <span class="sala texto-secundario">{{ nombreSala(e.salaId) }}</span>
              <span class="solo-lector">{{ detalle(e, i) }}</span>
            </button>
          }

          @if (vistaEscena(); as v) {
            <div class="vista tarjeta" role="tooltip" [attr.id]="'vista-' + v.escena.id"
                 [style.left.px]="pos(v.escena).x" [style.top.px]="pos(v.escena).y + altoEscena + 8">
              <img class="pixel" [src]="v.fondo" alt="" width="960" height="528" />
              <strong>{{ v.sala }}</strong>
              <span class="texto-secundario">{{ v.resumen }}</span>
            </div>
          }

          @if (flechaElegida(); as f) {
            <div class="tarjeta-flecha" role="status" [style.left.px]="f.medio.x" [style.top.px]="f.medio.y">
              {{ f.texto || 'Respuesta sin escribir' }}
            </div>
          }
        </div>
      </div>

    </div>

    <svg class="minivista" viewBox="0 0 160 90" role="img" aria-label="Minivista del mapa">
      @for (e of caso().escenas; track e.id) {
        <rect [attr.x]="mini(e).x" [attr.y]="mini(e).y" [attr.width]="mini(e).w" [attr.height]="mini(e).h"
              [attr.fill]="elegida() === e.id ? '#0B5563' : '#CBD5D8'" />
      }
    </svg>

    @if (moviendo(); as m) {
      <div role="group" aria-label="Moviendo una escena" class="tarjeta moviendo">
        <p role="status"><strong>Moviendo: {{ tituloDe(m.escenaId) }}</strong></p>
        <p class="texto-secundario">Usa las flechas del teclado o estos botones. <kbd>Enter</kbd> o «Listo» confirma; <kbd>Esc</kbd> cancela.</p>
        <div class="acciones">
          <button type="button" class="boton cuadrado" aria-label="Mover a la izquierda" (click)="empujar(-PASO, 0)">←</button>
          <button type="button" class="boton cuadrado" aria-label="Mover hacia arriba" (click)="empujar(0, -PASO)">↑</button>
          <button type="button" class="boton cuadrado" aria-label="Mover hacia abajo" (click)="empujar(0, PASO)">↓</button>
          <button type="button" class="boton cuadrado" aria-label="Mover a la derecha" (click)="empujar(PASO, 0)">→</button>
          <button type="button" class="boton boton-primario" (click)="terminarMover(true)">Listo</button>
          <button type="button" class="boton" (click)="terminarMover(false)">Dejar donde estaba</button>
        </div>
      </div>
    }

    <ng-template #menu>
      <div cdkMenu class="menu" aria-label="Acciones de la escena">
        <button cdkMenuItem class="item" (cdkMenuItemTriggered)="abrirGuion.emit(elegida()!)">Abrir guion <kbd>Enter</kbd></button>
        <button cdkMenuItem class="item" (cdkMenuItemTriggered)="abrirSala.emit(elegidaEscena()!.salaId)">Abrir sala</button>
        <button cdkMenuItem class="item" (cdkMenuItemTriggered)="empezarMover()">Mover</button>
        <button cdkMenuItem class="item" (cdkMenuItemTriggered)="accion.emit({ tipo: 'duplicar', escenaId: elegida()! })">Duplicar</button>
        <button cdkMenuItem class="item" (cdkMenuItemTriggered)="accion.emit({ tipo: 'conectar', escenaId: elegida()! })">Conectar con…</button>
        <button cdkMenuItem class="item" (cdkMenuItemTriggered)="accion.emit({ tipo: 'final', escenaId: elegida()!, esFinal: !elegidaEscena()!.esFinal })">
          {{ elegidaEscena()?.esFinal ? 'Quitar la marca de final' : 'Marcar como final' }}
        </button>
        <hr role="separator" />
        <button cdkMenuItem class="item peligro" (cdkMenuItemTriggered)="accion.emit({ tipo: 'borrar', escenaId: elegida()! })">Borrar <kbd>Supr</kbd></button>
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; position: relative; min-width: 0; }
    .barra { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; }
    .barra p { margin: 0; font-size: 16px; line-height: 24px; flex: 1 1 320px; }
    .cuadrado { width: 48px; padding: 0; }
    .zoom { min-width: 56px; text-align: center; font-size: 16px; }
    .marco { position: relative; overflow: auto; height: 460px; border: 1px solid var(--linea); border-radius: 12px; background: var(--fondo-hundido); }
    .plano { position: relative; }
    .escala { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    .flechas { position: absolute; inset: 0; overflow: visible; }
    .flecha { fill: none; stroke: #6b7c84; stroke-width: 2.5; cursor: pointer; }
    .flecha.de-elegida { stroke: #0b5563; stroke-width: 3.5; }
    .flecha:focus-visible { outline: none; stroke: #1f5fa8; stroke-width: 5; }
    .escena {
      position: absolute; width: ${ANCHO_ESCENA}px; height: ${ALTO_ESCENA}px; display: flex; flex-direction: column; align-items: flex-start;
      gap: 2px; padding: 8px 10px; text-align: left; font: inherit; color: var(--tinta); background: var(--superficie);
      border: 2px solid var(--borde-control); border-radius: 12px; cursor: pointer; overflow: hidden;
    }
    .escena.elegida { border: 3px solid var(--primario); box-shadow: 0 0 0 3px var(--primario-tinte); }
    .escena.final { border-style: double; border-width: 4px; }
    .escena.con-aviso { border-color: var(--aviso); }
    .escena.marca-ia { border-style: dashed; }
    .etiquetas { display: flex; flex-wrap: wrap; gap: 4px; min-height: 26px; }
    .etiquetas .pildora { min-height: 24px; padding: 0 8px; font-size: 14px; }
    .etiquetas { flex-wrap: nowrap; overflow: hidden; max-width: 100%; }
    .titulo, .sala { max-width: 100%; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-box-orient: vertical; }
    .titulo { -webkit-line-clamp: 2; }
    .sala { -webkit-line-clamp: 1; }
    .aviso { border-color: var(--aviso); color: #7a3606; background: #fdf0e6; }
    .titulo { font-weight: 700; font-size: 16px; line-height: 22px; }
    .sala { font-size: 14px; line-height: 20px; }
    .tarjeta-flecha {
      position: absolute; transform: translate(-50%, -120%); max-width: 260px; padding: 6px 10px; font-size: 16px; line-height: 22px;
      background: var(--tinta); color: #fff; border-radius: 8px; pointer-events: none;
    }
    .vista { position: absolute; width: 260px; display: flex; flex-direction: column; gap: 4px; z-index: 3; pointer-events: none; box-shadow: 0 8px 24px rgba(20,35,42,.18); }
    .vista img { width: 100%; height: auto; border-radius: 8px; }
    .vista span { font-size: 16px; }
    .minivista { position: absolute; right: 16px; bottom: 16px; width: 160px; height: 90px; background: var(--superficie); border: 1px solid var(--linea); border-radius: 8px; }
    .moviendo { display: flex; flex-direction: column; gap: 8px; }
    .moviendo p { margin: 0; }
    .menu { display: flex; flex-direction: column; min-width: 240px; padding: 6px; background: var(--superficie); border: 1px solid var(--linea); border-radius: 12px; box-shadow: 0 8px 24px rgba(20,35,42,.18); }
    .item { display: flex; justify-content: space-between; gap: 16px; min-height: 44px; padding: 0 12px; font: inherit; font-size: 16px; text-align: left; border: 0; background: none; border-radius: 8px; cursor: pointer; color: var(--tinta); align-items: center; }
    .item:hover, .item:focus { background: var(--primario-tinte); }
    .item.peligro { color: var(--peligro); }
    hr { width: 100%; border: 0; border-top: 1px solid var(--linea); margin: 4px 0; }
  `,
})
export class MapaEscenasComponent {
  readonly caso = input.required<CasoBorrador>();
  readonly avisos = input<Aviso[]>([]);
  /** Escena elegida desde fuera (por ejemplo, «Llévame ahí»). */
  readonly elegidaInicial = input<string | null>(null);

  readonly abrirGuion = output<string>();
  readonly abrirSala = output<string>();
  readonly seleccion = output<string>();
  readonly accion = output<AccionEscena>();

  protected readonly PASO = PASO_MOVER;
  protected readonly altoEscena = ALTO_ESCENA;
  protected readonly nombreAviso = NOMBRE_AVISO;
  protected readonly elegida = signal<string | null>(null);
  protected readonly vista = signal<string | null>(null);
  protected readonly flechaActiva = signal<string | null>(null);
  protected readonly zoom = signal(1);
  protected readonly moviendo = signal<{ escenaId: string; x: number; y: number } | null>(null);
  private readonly trigger = viewChild.required<CdkMenuTrigger>('trigger');
  private readonly marco = viewChild.required<ElementRef<HTMLElement>>('marco');
  private readonly raiz: HTMLElement;

  protected readonly porcentaje = computed(() => Math.round(this.zoom() * 100));
  protected readonly elegidaEscena = computed(() => this.caso().escenas.find((e) => e.id === this.elegida()) ?? null);
  protected readonly tabParada = computed(() => this.elegida() ?? this.caso().inicioId ?? this.caso().escenas[0]?.id ?? null);

  protected readonly limites = computed(() => {
    const es = this.caso().escenas.map((e) => this.pos(e));
    const ancho = Math.max(640, ...es.map((p) => p.x + ANCHO_ESCENA + MARGEN));
    const alto = Math.max(360, ...es.map((p) => p.y + ALTO_ESCENA + MARGEN));
    return { ancho, alto };
  });

  protected readonly flechas = computed<Flecha[]>(() => {
    const caso = this.caso();
    const porId = new Map(caso.escenas.map((e) => [e.id, e]));
    const lista: Flecha[] = [];
    for (const e of caso.escenas) {
      const a = this.pos(e);
      for (const r of e.respuestas) {
        const destino = r.destinoId ? porId.get(r.destinoId) : undefined;
        if (!destino) continue;
        const b = this.pos(destino);
        let d: string;
        let medio: { x: number; y: number };
        if (destino.id === e.id) {
          const x = a.x + ANCHO_ESCENA - 30, y = a.y;
          d = `M${x},${y} C${x + 10},${y - 50} ${x + 60},${y - 30} ${x + 30},${y + 4}`;
          medio = { x: x + 30, y: y - 30 };
        } else {
          const x1 = a.x + ANCHO_ESCENA, y1 = a.y + ALTO_ESCENA / 2;
          const x2 = b.x, y2 = b.y + ALTO_ESCENA / 2;
          const c = Math.max(40, Math.abs(x2 - x1) / 2);
          d = `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2 - 2},${y2}`;
          medio = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
        }
        lista.push({ id: r.id, origen: e.id, destino: destino.id, texto: r.texto, d, medio, deElegida: e.id === this.elegida() });
      }
    }
    return lista;
  });

  protected readonly flechaElegida = computed(() => this.flechas().find((f) => f.id === this.flechaActiva()) ?? null);

  protected readonly vistaEscena = computed(() => {
    const e = this.caso().escenas.find((x) => x.id === this.vista());
    const sala = e ? this.caso().salas.find((s) => s.id === e.salaId) : undefined;
    if (!e || !sala) return null;
    const personajes = sala.personajes.length;
    const muebles = sala.muebles.length;
    return {
      escena: e,
      fondo: rutaArte(this.caso().lugarId, sala.fondo),
      sala: sala.nombre,
      resumen: `${personajes} ${personajes === 1 ? 'personaje' : 'personajes'} · ${muebles} ${muebles === 1 ? 'mueble' : 'muebles'}`,
    };
  });

  constructor(host: ElementRef<HTMLElement>) {
    this.raiz = host.nativeElement;
    effect(() => {
      const id = this.elegidaInicial();
      if (id) this.elegirYEnfocar(id);
    });
  }

  protected pos(e: Escena): { x: number; y: number } {
    const m = this.moviendo();
    const base = m && m.escenaId === e.id ? { x: m.x, y: m.y } : e.posicion;
    return { x: base.x + MARGEN, y: base.y + MARGEN };
  }

  protected mini(e: Escena) {
    const { ancho, alto } = this.limites();
    const p = this.pos(e);
    return { x: (p.x / ancho) * 160, y: (p.y / alto) * 90, w: Math.max(4, (ANCHO_ESCENA / ancho) * 160), h: Math.max(3, (ALTO_ESCENA / alto) * 90) };
  }

  protected avisosDe(id: string): Aviso[] {
    return this.avisos().filter((a) => a.escenaId === id);
  }

  protected nombreSala(id: string): string {
    return this.caso().salas.find((s) => s.id === id)?.nombre ?? '';
  }

  protected tituloDe(id: string): string {
    const i = this.caso().escenas.findIndex((e) => e.id === id);
    return i >= 0 ? `${i + 1} · ${this.caso().escenas[i].titulo}` : '';
  }

  /** Lo que el lector de pantalla oye después del texto visible de la tarjeta. */
  protected detalle(e: Escena, i: number): string {
    const partes = [`escena ${i + 1} de ${this.caso().escenas.length}`];
    if (e.marcaIa) partes.push('sin revisar');
    const avisos = this.avisosDe(e.id);
    if (avisos.length > 1) partes.push(`avisos: ${avisos.map((a) => NOMBRE_AVISO[a.tipo].toLowerCase()).join(', ')}`);
    return `, ${partes.join(', ')}`;
  }

  protected elegir(id: string): void {
    this.elegida.set(id);
    this.seleccion.emit(id);
  }

  elegirYEnfocar(id: string): void {
    this.elegir(id);
    queueMicrotask(() => this.raiz.querySelector<HTMLElement>(`[data-escena="${id}"]`)?.focus());
  }

  protected menuContextual(evento: MouseEvent, id: string): void {
    evento.preventDefault();
    this.abrirMenu(id);
  }

  private abrirMenu(id: string): void {
    this.elegir(id);
    const trigger = this.trigger();
    trigger.open();
    // El CDK cierra el menú si el foco no está en él: se lleva al primer elemento, como el teclado.
    this.enfocarMenu(trigger, 0);
  }

  private enfocarMenu(trigger: CdkMenuTrigger, intento: number): void {
    const menu = trigger.getMenu();
    if (menu) {
      menu.focusFirstItem('keyboard');
    } else if (intento < 5) {
      queueMicrotask(() => this.enfocarMenu(trigger, intento + 1));
    }
  }

  protected tecla(evento: KeyboardEvent, e: Escena): void {
    if (this.moviendo()) {
      this.teclaMover(evento);
      return;
    }
    if (evento.key === 'ContextMenu' || (evento.key === 'F10' && evento.shiftKey)) {
      evento.preventDefault();
      this.abrirMenu(e.id);
      return;
    }
    const caso = this.caso();
    let destino: string | undefined;
    switch (evento.key) {
      case 'Enter':
        evento.preventDefault();
        this.abrirGuion.emit(e.id);
        return;
      case 'Delete':
        evento.preventDefault();
        this.accion.emit({ tipo: 'borrar', escenaId: e.id });
        return;
      case 'ArrowRight':
        destino = e.respuestas.find((r) => r.destinoId && r.destinoId !== e.id)?.destinoId ?? undefined;
        break;
      case 'ArrowLeft':
        destino = caso.escenas.find((x) => x.respuestas.some((r) => r.destinoId === e.id) && x.id !== e.id)?.id;
        break;
      case 'ArrowDown':
        destino = caso.escenas[caso.escenas.indexOf(e) + 1]?.id;
        break;
      case 'ArrowUp':
        destino = caso.escenas[caso.escenas.indexOf(e) - 1]?.id;
        break;
      default:
        return;
    }
    evento.preventDefault();
    if (destino) this.elegirYEnfocar(destino);
  }

  // ── Mover con teclado o botones ───────────────────────────────────────────

  protected empezarMover(): void {
    const e = this.elegidaEscena();
    if (!e) return;
    this.moviendo.set({ escenaId: e.id, x: e.posicion.x, y: e.posicion.y });
    queueMicrotask(() => this.raiz.querySelector<HTMLElement>(`[data-escena="${e.id}"]`)?.focus());
  }

  protected empujar(dx: number, dy: number): void {
    this.moviendo.update((m) => (m ? { ...m, x: Math.max(0, m.x + dx), y: Math.max(0, m.y + dy) } : m));
  }

  private teclaMover(evento: KeyboardEvent): void {
    const pasos: Record<string, [number, number]> = {
      ArrowLeft: [-PASO_MOVER, 0], ArrowRight: [PASO_MOVER, 0], ArrowUp: [0, -PASO_MOVER], ArrowDown: [0, PASO_MOVER],
    };
    if (pasos[evento.key]) {
      evento.preventDefault();
      this.empujar(...pasos[evento.key]);
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      this.terminarMover(true);
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      this.terminarMover(false);
    }
  }

  protected terminarMover(confirmar: boolean): void {
    const m = this.moviendo();
    this.moviendo.set(null);
    if (m && confirmar) this.accion.emit({ tipo: 'mover', escenaId: m.escenaId, x: m.x, y: m.y });
    if (m) this.elegirYEnfocar(m.escenaId);
  }

  // ── Zoom ─────────────────────────────────────────────────────────────────

  protected zoomar(delta: number): void {
    this.zoom.update((z) => Math.min(1.5, Math.max(0.4, Math.round((z + delta) * 10) / 10)));
  }

  protected rueda(evento: WheelEvent): void {
    if (!evento.ctrlKey) return;
    evento.preventDefault();
    this.zoomar(evento.deltaY > 0 ? -0.1 : 0.1);
  }

  protected verTodo(): void {
    const marco = this.marco().nativeElement;
    const { ancho, alto } = this.limites();
    const z = Math.min(1.5, Math.max(0.4, Math.min(marco.clientWidth / ancho, marco.clientHeight / alto)));
    this.zoom.set(Math.floor(z * 10) / 10 || 1);
  }
}
