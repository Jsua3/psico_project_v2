import {
  ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { rutaRetrato } from '../../modelo/biblioteca.service';
import type { Escena, Respuesta } from '../../modelo/caso';
import { type Recorrido, contextoDeRecorrido, evaluarFinal } from '../../modelo/finales';
import { ACTIVACION_EN_PALABRAS, VINCULO_EN_PALABRAS, fraseDeRespuesta } from '../../modelo/persona';
import { NOMBRE_CLASE, NOMBRE_EXPRESION } from '../../modelo/textos';
import { SalaVistaComponent } from '../sala/sala-vista.component';
import { RutasAutoria } from '../../rutas';

const CLASIFICACION: Record<NonNullable<Respuesta['clase']> | 'sin-clasificar', { nombre: string; simbolo: string; clase: string }> = {
  'sin-clasificar': { nombre: 'Sin clasificar', simbolo: '?', clase: 'pildora' },
  RECOMMENDED: { nombre: NOMBRE_CLASE.RECOMMENDED, simbolo: '✓', clase: 'pildora-adecuada' },
  ACCEPTABLE: { nombre: NOMBRE_CLASE.ACCEPTABLE, simbolo: '✓', clase: 'pildora-adecuada' },
  RISKY: { nombre: NOMBRE_CLASE.RISKY, simbolo: '▲', clase: 'pildora-riesgo' },
  CONTRAINDICATED: { nombre: NOMBRE_CLASE.CONTRAINDICATED, simbolo: '✕', clase: 'pildora-inadecuada' },
};

/**
 * Probar el caso como lo vería un estudiante (tablero 31): líneas una a una, respuestas sin
 * su clasificación, la retroalimentación al elegir y el final. Una columna «Solo en la
 * prueba» (la vista de autora) deja saltar a cualquier escena, ver el camino recorrido, cómo está la persona en palabras
 * y qué hitos se van cumpliendo, sin cifras. El estudiante real nunca ve esa columna.
 */
@Component({
  selector: 'app-probar',
  imports: [RouterLink, SalaVistaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.caso(); as caso) {
      <div class="pagina ancha">
        <h1>Probar como estudiante</h1>
        <div class="dos-columnas">
          <section aria-label="Vista del estudiante" class="juego">
            @if (final(); as f) {
              <div class="final" role="group" aria-labelledby="fin-t" tabindex="-1" #enfoque>
                <p class="texto-secundario">Fin del caso</p>
                <h2 id="fin-t">{{ f.nombre }}</h2>
                <p>{{ f.texto }}</p>
                <button type="button" class="boton boton-primario" (click)="reiniciar()">Empezar de nuevo</button>
              </div>
            } @else if (escena(); as e) {
              <div class="cabeza-juego">
                <span>Escena {{ numero(e) }} de {{ caso.escenas.length }}</span>
                <span class="salida" aria-hidden="true">Aquí el estudiante tendrá un botón para salir del caso cuando lo necesite</span>
              </div>
              @if (e.salaId) {
                <app-sala-vista class="sala" [caso]="caso" [salaId]="e.salaId" />
              } @else {
                <p class="texto-secundario">Esta escena todavía no tiene sala: el estudiante la vería sin escenario.</p>
              }
              @if (enLaSala(); as lista) {
                <p class="en-la-sala texto-secundario">En la sala: {{ lista }}.</p>
              }

              @if (resultado(); as r) {
                <div role="group" aria-label="Resultado de la respuesta" class="resultado" tabindex="-1" #enfoque>
                  <p>Elegiste:</p>
                  <p><strong>«{{ r.texto || 'Respuesta sin escribir' }}»</strong></p>
                  <p>{{ r.retroalimentacion || 'El docente todavía no escribió qué se lee después de esta respuesta.' }}</p>
                  @if (sinDestino()) {
                    <p class="aviso" role="status">Esta respuesta aún no lleva a ninguna escena. En el caso real, el estudiante se quedaría aquí.</p>
                    <button type="button" class="boton" (click)="volverAElegir()">Volver a elegir</button>
                  } @else {
                    <button type="button" class="boton boton-primario" (click)="continuar()">Continuar</button>
                  }
                </div>
              } @else {
                @if (lineaActual(); as l) {
                  <div class="dialogo" aria-live="polite">
                    <img class="pixel" [src]="retrato(l.personajeId, l.expresion)" alt="" width="96" height="96" />
                    <div>
                      <p><strong>{{ nombrePersonaje(l.personajeId) }}</strong> · {{ nombreExpresion[l.expresion] }}</p>
                      <p class="texto">{{ l.texto || '…' }}</p>
                    </div>
                  </div>
                }
                @if (quedanLineas()) {
                  <button type="button" class="boton boton-primario" (click)="siguienteLinea()" #enfoque>Siguiente</button>
                } @else if (e.respuestas.length) {
                  <fieldset class="respuestas" tabindex="-1" #enfoque>
                    <legend>¿Qué respondes?</legend>
                    <ul>
                      @for (r of e.respuestas; track r.id) {
                        <li>
                          <label>
                            <input type="radio" name="respuesta" [value]="r.id" [checked]="elegida() === r.id" (change)="elegida.set(r.id)" />
                            {{ r.texto || 'Respuesta sin escribir' }}
                          </label>
                        </li>
                      }
                    </ul>
                    <button type="button" class="boton boton-primario" [attr.aria-disabled]="!elegida()" (click)="elegir()">Elegir esta respuesta</button>
                  </fieldset>
                } @else if (e.esFinal) {
                  <button type="button" class="boton boton-primario" (click)="terminar()">Ver el final</button>
                } @else {
                  <p class="aviso" role="status">Esta escena no tiene respuestas ni es un final: el estudiante se quedaría aquí.</p>
                  <a class="boton" [routerLink]="rutas.a('/editor/escena', e.id)">Abrir su guion</a>
                }
              }
            } @else {
              <p>El caso no tiene escena de inicio. Elige una en el mapa.</p>
              <a class="boton" [routerLink]="rutas.a('/editor')">Ir al mapa</a>
            }
          </section>

          <aside aria-labelledby="hp" class="tarjeta lateral">
            <h2 id="hp">Solo en la prueba <span class="texto-secundario">· el estudiante no ve esto</span></h2>
            <label for="sx" class="etiqueta">Saltar a la escena</label>
            <div class="fila">
              <select id="sx" class="campo" #salto>
                @for (x of caso.escenas; track x.id; let i = $index) {
                  <option [value]="x.id" [selected]="x.id === actualId()">{{ i + 1 }} · {{ x.titulo }}</option>
                }
              </select>
              <button type="button" class="boton" (click)="saltar(salto.value)">Ir</button>
            </div>
            <p class="etiqueta">Camino recorrido</p>
            <p>{{ caminoTexto() }}</p>
            <button type="button" class="boton" (click)="reiniciar()">Empezar de nuevo</button>

            <h3 class="subtitulo">Cómo va la persona</h3>
            <p class="persona-ahora" role="status">La persona se muestra {{ vistaDeAutora().persona }}.</p>
            @if (resultado(); as r) {
              <p class="ultima">
                <span class="pildora" [class]="'pildora ' + clasificacion[r.clase ?? 'sin-clasificar'].clase">
                  <span aria-hidden="true">{{ clasificacion[r.clase ?? 'sin-clasificar'].simbolo }}</span> {{ clasificacion[r.clase ?? 'sin-clasificar'].nombre }}</span>
                @if (fraseDeLaUltima(r); as frase) { Con esa respuesta, la persona {{ frase }}. }
              </p>
            }
            <h3 class="subtitulo">Hitos del caso</h3>
            <ul class="hitos-prueba">
              @for (h of vistaDeAutora().hitos; track h.clave) {
                <li class="hito-prueba" [class.cumplido]="h.cumplido">
                  <span aria-hidden="true">{{ h.cumplido ? '✓' : '○' }}</span> {{ h.nombre }} · {{ h.cumplido ? 'cumplido' : 'sin cumplir' }}
                </li>
              } @empty {
                <li class="texto-secundario">Este caso todavía no tiene hitos.</li>
              }
            </ul>
          </aside>
        </div>
      </div>
    }
  `,
  styles: `
    .ancha { max-width: 1300px; }
    .dos-columnas { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 320px); gap: 16px; align-items: start; }
    /* «1fr» solo es minmax(auto, 1fr): la columna no bajaba del ancho mínimo de la vista del juego y la página desbordaba
       en un teléfono (390 px). Con minmax(0, 1fr), como en dos columnas, cabe en el ancho que haya. */
    @media (max-width: 1000px) { .dos-columnas { grid-template-columns: minmax(0, 1fr); } }
    .juego { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 16px; background: var(--juego-fondo); color: var(--juego-texto); min-width: 0; }
    .juego :focus-visible { outline-color: var(--juego-acento-claro); }
    .cabeza-juego { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: var(--autoria-texto-16); }
    .salida { padding: 2px 10px; border: 2px dashed var(--salida-segura); border-radius: 999px; font-size: var(--autoria-texto-14); color: var(--juego-salida); }
    .sala { width: 100%; }
    .en-la-sala { margin: 0; color: var(--juego-texto-suave); font-size: var(--autoria-texto-16); }
    .dialogo { display: flex; gap: 12px; padding: 12px; border-radius: 12px; background: var(--juego-hundido); }
    .dialogo img { border-radius: 8px; image-rendering: pixelated; background: var(--juego-fondo); flex: none; }
    .dialogo p { margin: 0 0 4px; }
    .texto { font-size: var(--autoria-texto-18); line-height: 28px; }
    .respuestas { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .respuestas legend { font-weight: 700; margin-bottom: 6px; }
    .respuestas ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .respuestas label { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 2px solid var(--texto-secundario); border-radius: 10px; cursor: pointer; }
    .respuestas label:has(input:checked) { border-color: var(--juego-acento-claro); background: var(--juego-elevado); }
    .respuestas input { width: 20px; height: 20px; margin-top: 3px; accent-color: var(--juego-acento); }
    .respuestas .boton, .resultado .boton, .final .boton { align-self: flex-start; }
    .juego .boton-primario { background: var(--juego-acento); border-color: var(--juego-acento); color: var(--juego-hundido); }
    .juego .boton { color: var(--juego-texto); background: transparent; border-color: var(--juego-borde); }
    .juego .boton-primario { color: var(--juego-hundido); background: var(--juego-acento); }
    .resultado, .final { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; background: var(--juego-hundido); }
    .resultado p, .final p { margin: 0; }
    .final h2 { margin: 0; color: var(--juego-texto); }
    /* Dentro de la vista del estudiante (fondo oscuro) los textos de apoyo y los títulos van con la tinta del juego, no con la del editor. */
    .juego .texto-secundario { color: var(--juego-texto-suave); }
    .aviso { color: var(--juego-aviso); }
    .lateral { display: flex; flex-direction: column; gap: 8px; }
    .lateral h2 { margin: 0; font-size: var(--autoria-texto-20); line-height: 28px; }
    .lateral p { margin: 0; font-size: var(--autoria-texto-16); }
    .lateral .boton { align-self: flex-start; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .subtitulo { margin: 8px 0 0; font-size: var(--autoria-texto-16); line-height: 24px; }
    .hitos-prueba { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: var(--autoria-texto-16); }
    .hito-prueba.cumplido { color: var(--adecuada); font-weight: 700; }
    .fila { display: flex; gap: 8px; }
    .campo { flex: 1; min-width: 0; min-height: 48px; padding: 0 12px; font: inherit; font-size: var(--autoria-texto-16); border: 2px solid var(--borde-control); border-radius: var(--radio-control); background: var(--superficie); }
  `,
})
export class ProbarComponent {
  protected readonly rutas = inject(RutasAutoria);
  protected readonly store = inject(CasoStore);
  private readonly injector = inject(Injector);
  protected readonly clasificacion = CLASIFICACION;
  protected readonly nombreExpresion = NOMBRE_EXPRESION;
  private readonly enfoque = viewChild<ElementRef<HTMLElement>>('enfoque');

  private readonly desde = inject(ActivatedRoute).snapshot.queryParamMap.get('desde');
  protected readonly actualId = signal<string | null>(null);
  protected readonly lineaIndice = signal(0);
  protected readonly elegida = signal<string | null>(null);
  protected readonly resultado = signal<Respuesta | null>(null);
  protected readonly final = signal<{ nombre: string; texto: string } | null>(null);
  private readonly recorrido = signal<Recorrido>([]);

  protected readonly escena = computed(() => this.store.caso()?.escenas.find((e) => e.id === this.actualId()) ?? null);
  protected readonly lineaActual = computed(() => this.escena()?.lineas[this.lineaIndice()] ?? null);
  protected readonly quedanLineas = computed(() => this.lineaIndice() < (this.escena()?.lineas.length ?? 0) - 1);
  protected readonly sinDestino = computed(() => {
    const r = this.resultado();
    return !!r && (!r.destinoId || !this.store.caso()?.escenas.some((e) => e.id === r.destinoId));
  });
  protected readonly enLaSala = computed(() => {
    const caso = this.store.caso();
    const sala = caso?.salas.find((s) => s.id === this.escena()?.salaId);
    if (!caso || !sala?.personajes.length) return '';
    return sala.personajes
      .map((p) => `${caso.personajes.find((x) => x.id === p.ref)?.nombre ?? p.ref} (${(NOMBRE_EXPRESION[p.expresion] ?? p.expresion).toLowerCase()})`)
      .join(', ');
  });
  protected readonly caminoTexto = computed(() => {
    const caso = this.store.caso();
    if (!caso) return '';
    const ids = [...this.recorrido().map((p) => p.escenaId), ...(this.actualId() ? [this.actualId()!] : [])];
    return ids.length ? `Escenas ${ids.map((id) => caso.escenas.findIndex((e) => e.id === id) + 1).join(' → ')}` : 'Todavía nada.';
  });

  /**
   * Lo que solo ve la autora: cómo está la persona (en palabras) y qué hitos se cumplieron, contando la respuesta que está a la vista
   * aunque aún no se haya pulsado «Continuar». Nunca una cifra.
   */
  protected readonly vistaDeAutora = computed(() => {
    const caso = this.store.caso();
    if (!caso) return { persona: '', hitos: [] as { clave: string; nombre: string; cumplido: boolean }[] };
    const porId = new Map(caso.escenas.flatMap((e) => e.respuestas.map((r) => [r.id, r] as const)));
    const elegidas = [...this.recorrido().map((p) => porId.get(p.respuestaId)), this.resultado() ?? undefined].filter((r): r is Respuesta => !!r);
    const ctx = contextoDeRecorrido(elegidas);
    return {
      persona: `${VINCULO_EN_PALABRAS[ctx.persona.bond]} y ${ACTIVACION_EN_PALABRAS[ctx.persona.activation]}`,
      hitos: caso.hitos.map((h) => ({ clave: h.clave, nombre: h.nombre, cumplido: ctx.hitos.has(h.clave) })),
    };
  });

  protected fraseDeLaUltima(r: Respuesta): string | null {
    return fraseDeRespuesta(r);
  }

  constructor() {
    this.reiniciar(this.desde);
  }

  protected numero(e: Escena): number {
    return (this.store.caso()?.escenas.indexOf(e) ?? 0) + 1;
  }

  protected nombrePersonaje(id: string): string {
    return this.store.caso()?.personajes.find((p) => p.id === id)?.nombre ?? '';
  }

  protected retrato(personajeId: string, expresion: string): string {
    const p = this.store.caso()?.personajes.find((x) => x.id === personajeId);
    return rutaRetrato(p?.recipeId ?? 'sin-receta', expresion);
  }

  private irA(id: string | null): void {
    this.actualId.set(id);
    this.lineaIndice.set(0);
    this.elegida.set(null);
    this.resultado.set(null);
    this.final.set(null);
    this.enfocar();
  }

  protected reiniciar(desde: string | null = null): void {
    const caso = this.store.caso();
    this.recorrido.set([]);
    this.irA(desde && caso?.escenas.some((e) => e.id === desde) ? desde : (caso?.inicioId ?? null));
  }

  protected saltar(id: string): void {
    this.irA(id);
  }

  protected siguienteLinea(): void {
    this.lineaIndice.update((i) => i + 1);
    // Al llegar a las respuestas el botón «Siguiente» desaparece: el foco pasa a ellas.
    this.enfocar();
  }

  protected elegir(): void {
    const e = this.escena();
    const r = e?.respuestas.find((x) => x.id === this.elegida());
    if (!e || !r) return;
    this.resultado.set(r);
    this.enfocar();
  }

  protected volverAElegir(): void {
    this.resultado.set(null);
    this.elegida.set(null);
  }

  protected continuar(): void {
    const e = this.escena();
    const r = this.resultado();
    if (!e || !r || this.sinDestino()) return;
    this.recorrido.update((c) => [...c, { escenaId: e.id, respuestaId: r.id }]);
    const destino = this.store.caso()!.escenas.find((x) => x.id === r.destinoId)!;
    this.irA(destino.id);
    if (destino.esFinal && !destino.lineas.length && !destino.respuestas.length) this.terminar();
  }

  protected terminar(): void {
    const caso = this.store.caso();
    const e = this.escena();
    if (!caso || !e) return;
    this.final.set(evaluarFinal(caso, this.recorrido()));
    this.store.marcarProbado();
    this.enfocar();
  }

  private enfocar(): void {
    afterNextRender(() => this.enfoque()?.nativeElement.focus(), { injector: this.injector });
  }
}
