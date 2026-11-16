import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, input, output } from '@angular/core';

import { CasoStore } from '../../estado/caso.store';
import type { CasoBorrador } from '../../modelo/caso';
import {
  casillasDe, describirCondicion, escribirCondicion, leerCondicion, piezasDeSala, type Hecho, type PiezaElegible, type TipoHecho,
} from '../../modelo/requisitos';

// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
const AYUDA_POR_DEFECTO = 'Marca lo que el estudiante debe haber hecho en esta sala para ver esta respuesta. Si marcas varias cosas, tienen que cumplirse todas.';

/** Los tres grupos de casillas, en el orden en que se ofrecen. */
// BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
const GRUPOS: ReadonlyArray<{ clave: 'personas' | 'objetos' | 'herramientas'; titulo: string; verbo: string }> = [
  { clave: 'personas', titulo: 'Personas', verbo: 'habló con…' },
  { clave: 'objetos', titulo: 'Objetos', verbo: 'revisó…' },
  { clave: 'herramientas', titulo: 'Herramientas', verbo: 'usó…' },
];

/** Los nombres que el caso da a una pieza o a un hito, para decir un requisito en palabras. */
function nombreDe(caso: CasoBorrador | null, tipo: string, clave: string): string {
  if (!caso) return clave;
  if (tipo === 'milestone') return caso.hitos.find((h) => h.clave === clave)?.nombre ?? clave;
  if (tipo === 'talked') {
    for (const s of caso.salas) {
      const p = s.personajes.find((x) => x.clave === clave);
      if (p) return caso.personajes.find((x) => x.id === p.ref)?.nombre ?? clave;
    }
    return clave;
  }
  if (tipo === 'inspected') {
    for (const s of caso.salas) {
      const o = s.objetos.find((x) => x.clave === clave);
      if (o) return caso.catalogo.objetos.find((x) => x.id === o.ref)?.nombre ?? o.ref;
    }
    return clave;
  }
  return caso.herramientas?.find((h) => h.codigo === clave)?.nombre ?? clave;
}

/**
 * «Aparece si…»: elegir, con casillas, lo que el estudiante debe haber hecho en una sala (hablar con alguien, revisar algo, usar una
 * herramienta). Si el requisito trae algo que las casillas no saben mostrar (un hito, un «alguna de estas», un «no»…), lo dice en
 * palabras y lo deja tal cual; solo «Quitar el requisito» lo borra. Emite la condición ya escrita, y solo cuando la docente cambia algo.
 */
@Component({
  selector: 'app-selector-condicion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="condicion" [id]="idBase()" tabindex="-1" [attr.aria-describedby]="idBase() + '-ayuda'">
      <legend>{{ leyenda() }}</legend>
      <p [id]="idBase() + '-ayuda'" class="texto-secundario nota">{{ ayuda() }}</p>
      @if (lectura().forma === 'otra') {
        <p [id]="idBase() + '-otra'" class="texto-secundario nota">
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          Este requisito tiene partes que el editor no sabe mostrar: {{ enPalabras() }}. Se conserva tal cual.
        </p>
        <button type="button" class="boton boton-texto peligro" [id]="idBase() + '-quitar'" (click)="quitar()">Quitar el requisito</button>
      } @else {
        @for (g of grupos; track g.clave) {
          @if (piezas()[g.clave].length > 0) {
            <div role="group" class="grupo" [attr.aria-labelledby]="idBase() + '-g-' + g.clave">
              <p [id]="idBase() + '-g-' + g.clave" class="grupo-titulo">{{ g.titulo }} · {{ g.verbo }}</p>
              @for (p of piezas()[g.clave]; track p.tipo + p.clave) {
                <label class="casilla">
                  <input type="checkbox" [id]="idBase() + '-' + p.tipo + '-' + p.clave" [checked]="marcada(p)"
                         [attr.aria-describedby]="p.aviso ? idBase() + '-aviso-' + p.clave : null"
                         (change)="alternar(p, $any($event.target).checked)" />
                  {{ p.nombre }}
                </label>
                @if (p.aviso) {
                  <p [id]="idBase() + '-aviso-' + p.clave" class="texto-secundario nota aviso"><span aria-hidden="true">▲</span> {{ p.aviso }}</p>
                }
              }
            </div>
          }
        }
        @if (sinPiezas()) {
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <p class="texto-secundario nota">Esta sala todavía no tiene personas, objetos ni herramientas que puedas elegir.</p>
        }
        @if (lectura().forma === 'ninguna') {
          <p class="texto-secundario nota estado">{{ vacio() }}</p>
        }
      }
    </fieldset>
  `,
  styles: `
    .condicion { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 12px; border: 2px solid var(--borde-control); border-radius: var(--radio-control); }
    legend { font-weight: 700; font-size: var(--autoria-texto-16); padding: 0 4px; }
    .grupo { display: flex; flex-direction: column; gap: 4px; }
    .grupo-titulo { margin: 0; font-weight: 700; font-size: var(--autoria-texto-16); }
    .casilla { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: var(--autoria-texto-16); }
    .nota { margin: 0; font-size: var(--autoria-texto-16); line-height: 24px; }
    .aviso { padding-left: 32px; }
    .peligro { color: var(--peligro); align-self: flex-start; }
  `,
})
export class SelectorCondicionComponent {
  /** La condición del documento, tal cual (`{}` o ausente = siempre). */
  readonly condicion = input<Record<string, unknown> | undefined>(undefined);
  readonly salaId = input<string | null>(null);
  readonly leyenda = input.required<string>();
  readonly vacio = input.required<string>();
  readonly idBase = input.required<string>();
  readonly ayuda = input<string>(AYUDA_POR_DEFECTO);
  /** La condición nueva, ya escrita con `escribirCondicion`. */
  readonly cambio = output<Record<string, unknown>>();

  private readonly store = inject(CasoStore);
  private readonly injector = inject(Injector);
  protected readonly grupos = GRUPOS;

  protected readonly piezas = computed(() => {
    const caso = this.store.caso();
    const sala = this.salaId();
    return caso && sala ? piezasDeSala(caso, sala) : { personas: [], objetos: [], herramientas: [] };
  });
  protected readonly sinPiezas = computed(() => {
    const p = this.piezas();
    return p.personas.length + p.objetos.length + p.herramientas.length === 0;
  });
  protected readonly lectura = computed(() => leerCondicion(this.condicion(), casillasDe(this.piezas())));
  protected readonly enPalabras = computed(() => {
    const l = this.lectura();
    const caso = this.store.caso();
    return l.forma === 'otra' ? describirCondicion(l.crudo, (tipo, clave) => nombreDe(caso, tipo, clave)) : '';
  });

  protected marcada(p: PiezaElegible): boolean {
    const l = this.lectura();
    return l.forma === 'todas' && l.hechos.some((h) => h.tipo === p.tipo && h.clave === p.clave);
  }

  protected alternar(p: PiezaElegible, marcada: boolean): void {
    const l = this.lectura();
    const actuales: Hecho[] = l.forma === 'todas' ? l.hechos : [];
    const sin = actuales.filter((h) => !(h.tipo === (p.tipo as TipoHecho) && h.clave === p.clave));
    const hechos = marcada ? [...sin, { tipo: p.tipo, clave: p.clave }] : sin;
    this.cambio.emit(escribirCondicion(hechos.length > 0 ? { forma: 'todas', hechos } : { forma: 'ninguna' }));
  }

  protected quitar(): void {
    this.cambio.emit({});
    // El botón desaparece: el foco pasa al grupo, que ahora muestra las casillas.
    afterNextRender(() => document.getElementById(this.idBase())?.focus(), { injector: this.injector });
  }
}
