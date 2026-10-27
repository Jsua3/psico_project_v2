import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';

import { IaService } from '../ia/ia.service';
import { ACCIONES, type Accion, buscarAcciones } from './acciones';
import { GuiaService } from './guia.service';

/**
 * Buscador de acciones (Ctrl+K) y pregunta a la guía. Sin IA o sin conexión, el buscador
 * lleva al mismo lugar: el docente escribe con sus palabras («cara») y elige.
 */
@Component({
  selector: 'app-buscador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fondo" (click)="cerrar.emit()"></div>
    <div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="bq-titulo" (keydown)="tecla($event)">
      <h2 id="bq-titulo">{{ modo() === 'preguntar' ? 'Pregúntale a la guía' : 'Buscar una acción' }}</h2>
      <label for="bq" class="etiqueta">{{ modo() === 'preguntar' ? '¿Dónde está o cómo se hace?' : '¿Qué quieres hacer?' }}</label>
      <input id="bq" #campo type="text" role="combobox" class="campo" autocomplete="off"
             aria-autocomplete="list" aria-controls="bq-lista" [attr.aria-expanded]="resultados().length > 0"
             [attr.aria-activedescendant]="resultados().length ? 'bq-' + activo() : null"
             [value]="consulta()" (input)="escribir($any($event.target).value)"
             [placeholder]="modo() === 'preguntar' ? 'Por ejemplo: ¿dónde cambio la cara de un personaje?' : 'Por ejemplo: cara, final, mover'" />
      <p role="status" class="texto-secundario estado">{{ estado() }}</p>
      @if (modo() === 'preguntar') {
        <div class="acciones">
          <button type="button" class="boton boton-guia" [attr.aria-disabled]="!consulta().trim() || preguntando()" (click)="preguntar()">
            {{ preguntando() ? 'Buscando…' : 'Preguntar' }}
          </button>
        </div>
      }
      <ul id="bq-lista" role="listbox" aria-label="Resultados" class="lista">
        @for (a of resultados(); track a.id; let i = $index) {
          <li role="option" [id]="'bq-' + i" [attr.aria-selected]="i === activo()" (click)="elegir(a)" (mousemove)="activo.set(i)">
            <strong>{{ a.nombre }}</strong>
            <span class="texto-secundario">En: {{ a.pantalla }}{{ a.pasos ? ' · recorrido de ' + a.pasos.length + ' pasos' : '' }}</span>
          </li>
        }
      </ul>
      <div class="acciones pie">
        <span class="texto-secundario"><kbd>↑</kbd> <kbd>↓</kbd> para moverte, <kbd>Enter</kbd> para ir, <kbd>Esc</kbd> para cerrar.</span>
        <button type="button" class="boton" (click)="cerrar.emit()">Cerrar</button>
      </div>
    </div>
  `,
  styles: `
    .fondo { position: fixed; inset: 0; z-index: var(--autoria-capa-40); background: var(--velo); }
    .dialogo {
      position: fixed; z-index: var(--autoria-capa-41); top: 10vh; left: 50%; transform: translateX(-50%); width: min(640px, calc(100vw - 32px));
      max-height: 80vh; overflow: auto; box-sizing: border-box; padding: 20px; background: var(--superficie); border-radius: 16px;
      display: flex; flex-direction: column; gap: 10px; box-shadow: var(--sombra-buscador);
    }
    h2 { margin: 0; font-size: var(--autoria-texto-22); line-height: 30px; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo { min-height: 48px; padding: 0 12px; font: inherit; font-size: var(--autoria-texto-18); border: 2px solid var(--borde-control); border-radius: var(--radio-control); }
    .estado { margin: 0; font-size: var(--autoria-texto-16); }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .lista li { display: flex; flex-direction: column; gap: 2px; min-height: 48px; padding: 8px 12px; border-radius: 10px; cursor: pointer; justify-content: center; }
    .lista li span { font-size: var(--autoria-texto-16); }
    .lista li[aria-selected='true'] { background: var(--guia-tinte); outline: 2px solid var(--guia); }
    .boton-guia { background: var(--guia); border-color: var(--guia); color: var(--sobre-primario); }
    .pie { justify-content: space-between; align-items: center; }
    .pie span { font-size: var(--autoria-texto-16); }
  `,
})
export class BuscadorComponent {
  readonly modo = input<'buscar' | 'preguntar'>('buscar');
  readonly cerrar = output<void>();

  private readonly guia = inject(GuiaService);
  private readonly ia = inject(IaService);
  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  protected readonly consulta = signal('');
  protected readonly activo = signal(0);
  protected readonly preguntando = signal(false);
  protected readonly aviso = signal('');

  protected readonly resultados = computed(() => buscarAcciones(this.consulta()).slice(0, 8));
  protected readonly estado = computed(() => {
    if (this.aviso()) return this.aviso();
    const q = this.consulta().trim();
    const n = this.resultados().length;
    if (!q) return `${ACCIONES.length} acciones. Escribe para filtrar.`;
    return n ? `${n} ${n === 1 ? 'resultado' : 'resultados'} para «${q}»` : `Nada coincide con «${q}». Prueba con otras palabras.`;
  });

  constructor() {
    effect(() => {
      const el = this.campo()?.nativeElement;
      if (el) queueMicrotask(() => el.focus());
    });
  }

  protected escribir(valor: string): void {
    this.consulta.set(valor);
    this.activo.set(0);
    this.aviso.set('');
  }

  protected tecla(e: KeyboardEvent): void {
    const n = this.resultados().length;
    if (e.key === 'Tab') {
      const dialogo = e.currentTarget as HTMLElement;
      const foco = [...dialogo.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')];
      const primero = foco[0];
      const ultimo = foco[foco.length - 1];
      if (primero && ultimo) {
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cerrar.emit();
    } else if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      this.activo.update((i) => (i + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      this.activo.update((i) => (i - 1 + n) % n);
    } else if (e.key === 'Enter' && (e.target as HTMLElement).id === 'bq') {
      e.preventDefault();
      if (this.modo() === 'preguntar' && this.consulta().trim()) void this.preguntar();
      else if (n) this.elegir(this.resultados()[this.activo()]);
    }
  }

  protected elegir(a: Accion): void {
    this.cerrar.emit();
    void this.guia.mostrar(a.id, a.pasos ? 'recorrido' : 'foco');
  }

  /** Con IA, la guía elige la acción; sin IA (o si no sabe), se usa el mejor resultado del buscador. */
  protected async preguntar(): Promise<void> {
    const pregunta = this.consulta().trim();
    if (!pregunta || this.preguntando()) return;
    this.preguntando.set(true);
    try {
      const respuesta = await this.ia.guia(pregunta, ACCIONES.map((a) => ({ id: a.id, nombre: a.nombre, pantalla: a.pantalla })));
      if (respuesta?.accionId) {
        this.cerrar.emit();
        await this.guia.mostrar(respuesta.accionId, respuesta.modo);
        return;
      }
      const mejor = this.resultados()[0];
      if (mejor) this.elegir(mejor);
      else this.aviso.set('No encontré esa acción. Prueba con otras palabras.');
    } finally {
      this.preguntando.set(false);
    }
  }
}
