import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import type { CaseLifecycle, ValidationIssue } from '../../../../core/models/simulation.model';
import { UiStat } from '../../../../shared/ui/stat/ui-stat';
import { CaseReviewPanelComponent } from '../../../simulator/case-review-panel.component';
import { UiDialog } from '../../../../shared/ui/dialog/ui-dialog';
import { AutoriaApiService } from '../../api/autoria-api.service';
import { CasoStore } from '../../estado/caso.store';
import { GuiaService } from '../../guia/guia.service';
import { PanelPendientesComponent } from '../../marco/panel-pendientes.component';
import { ProgresoDelCaso } from '../../marco/progreso.service';
import type { Etapa } from '../../modelo/pendientes';
import { type Falta, avisosDeLectura, faltasDelServidor, puedeEnviar, sugerencias } from '../../modelo/revision';
import { RutasAutoria, rutaDelEditor } from '../../rutas';
import { RUTA_ENSAYO, alPulsarProbar } from '../../ensayo';

/** Cómo se nombra el estado del caso ante el docente. */
const NOMBRE_ESTADO: Record<string, string> = {
  DRAFT: 'Borrador', IN_REVIEW: 'En revisión', PUBLISHED: 'Publicado', ARCHIVED: 'Archivado',
};

/** Las etapas que resume esta pantalla, en el orden del hilo (la etapa «Enviar» es esta misma pantalla). */
const ETAPAS_DE_ENVIO: ReadonlyArray<{ etapa: Etapa; nombre: string }> = [
  { etapa: 'datos', nombre: 'Datos del caso' }, { etapa: 'lugar', nombre: 'Lugar y salas' },
  { etapa: 'historia', nombre: 'Historia' }, { etapa: 'evaluacion', nombre: 'Evaluación' },
];

/** Cómo se nombra el motivo con el que Psicología devuelve un caso. */
const NOMBRE_MOTIVO: Record<string, string> = { FORMA: 'Forma', CONTENIDO: 'Contenido' };

/** Lo que dice el docente cuando el envío no pasó por una razón que no es un bloqueo de la compuerta. */
const OTRA_PERSONA_CAMBIO_EL_CASO = 'Otra persona cambió el caso mientras lo revisabas, así que no se envió. Recarga el caso (el aviso de arriba tiene el botón) y vuelve a enviarlo.';
const NO_SE_PUDO_ENVIAR = 'No se pudo enviar el caso. No se cambió nada: vuelve a intentarlo en un momento.';

/**
 * Enviar a revisión (tablero 32): qué falta resolver (lo mismo que mide la compuerta de publicación, en lenguaje del docente
 * y con «Llévame ahí» a lo concreto), sugerencias (no bloquean), lo que ya está listo y el envío a Psicología. Una vez enviado,
 * el caso queda «En revisión»: se puede ver, pero no editar.
 */
@Component({
  selector: 'app-revision',
  imports: [RouterLink, CaseReviewPanelComponent, UiStat],
  host: { '(document:visibilitychange)': 'alCambiarVisibilidad()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.caso(); as caso) {
      <div class="pagina">
        <div>
          <h1>Enviar a revisión</h1>
          <p class="texto-secundario">Psicología revisa el caso antes de publicarlo. Mientras esté en revisión se puede ver, pero no editar.</p>
        </div>

        @if (devuelto(); as d) {
          <section aria-labelledby="dv" class="tarjeta bloque devuelto" data-accion="devuelto-por-psicologia">
            <h2 id="dv">Psicología devolvió el caso</h2>
            <p>Motivo: {{ d.motivo }}.</p>
            @if (d.nota) { <p>Nota: {{ d.nota }}</p> }
          </section>
        }

        <section aria-label="El caso" class="tarjeta resumen">
          <div class="resumen__texto">
            <h2>{{ caso.titulo }}</h2>
            @if (lugar(); as nombre) { <p class="texto-secundario">{{ nombre }} · {{ textoFinales() }}</p> } @else { <p class="texto-secundario">{{ textoFinales() }}</p> }
          </div>
          <span class="pildora estado">{{ nombreEstado() }}</span>
          <div class="cifras">
            <ui-stat label="Escenas" [value]="caso.escenas.length" />
            <ui-stat label="Respuestas" [value]="cuantasRespuestas()" />
            <ui-stat label="Finales posibles" [value]="cuantosFinales()" />
          </div>
          <p class="linea-estado" data-linea-estado [attr.data-tono]="tonoDeEstado()">{{ lineaDeEstado() }}</p>
        </section>

        @if (store.soloLectura()) {
          <p role="status" class="listo">{{ textoSoloLectura() }}</p>
          <section aria-labelledby="dc" class="tarjeta bloque" data-accion="decision-caso">
            <h2 id="dc">Estado y decisión del caso</h2>
            <app-case-review-panel [caseVersionId]="casoId()" [revision]="caso.revision" [editable]="false" />
            @if (puedeCrearVersion()) {
              <div class="version-nueva">
                <p class="texto-secundario">Un caso publicado o archivado no se cambia: se crea una versión nueva, que sí se puede editar.</p>
                <button type="button" class="boton" [attr.aria-disabled]="creandoVersion()" aria-describedby="vnp" (click)="crearVersion()">Crear una versión nueva</button>
                <p role="status" id="vnp" [class.error]="!!falloVersion()">
                  @if (falloVersion(); as fallo) { {{ fallo }} } @else if (creandoVersion()) { Creando la versión nueva… }
                </p>
              </div>
            }
          </section>
        } @else {
          <div class="dos-columnas">
              <section aria-labelledby="fl" class="tarjeta bloque por-resolver">
                <h2 id="fl">Por resolver ({{ faltas().length }})</h2>
                @if (consultando()) {
                  <p class="texto-secundario" role="status">Comprobando el caso…</p>
                }
                <!-- Un resumen por etapa, no la lista entera: la lista completa vive en la hoja «Pendientes», una sola vez. -->
                <ul class="etapas" aria-label="Estado de cada etapa">
                  @for (e of etapas(); track e.etapa) {
                    <li class="etapa" [attr.data-etapa]="e.etapa" [attr.data-listo]="e.total === 0">
                      <span class="marca" aria-hidden="true">{{ e.total === 0 ? '✓' : '▲' }}</span>
                      <span class="etapa__nombre">{{ e.nombre }}</span>
                      <span class="etapa__estado" [class.pendiente]="e.total > 0">{{ e.texto }}</span>
                      @if (e.total > 0) {
                        <button type="button" class="boton boton-texto etapa__ver" [attr.aria-label]="'Ver los pendientes de ' + e.nombre" (click)="abrirPendientes($event)">Ver pendientes</button>
                      }
                    </li>
                  }
                </ul>
                <div class="probado" data-probado [attr.data-listo]="!!caso.probadoHastaElFinal">
                  <span class="marca" aria-hidden="true">{{ caso.probadoHastaElFinal ? '✓' : '○' }}</span>
                  <span class="probado__texto">{{ caso.probadoHastaElFinal ? 'Lo probaste hasta un final.' : 'Aún no lo has probado hasta un final.' }}</span>
                  <a class="boton boton-texto" [attr.href]="rutaEnsayo()" target="_blank" rel="noopener" data-accion="probar" (click)="probar($event)" (auxclick)="probar($event)">Probar</a>
                </div>
                @if (faltasDelServidor().length) {
                  <p class="texto-secundario sub">Además, Psicología pide:</p>
                  <ul class="lista">
                    @for (f of faltasDelServidor(); track $index) {
                      <li class="falta">
                        <p>{{ f.mensaje }}</p>
                        <button type="button" class="boton" [attr.aria-label]="'Llévame ahí: ' + f.mensaje" (click)="llevar(f)">Llévame ahí</button>
                      </li>
                    }
                  </ul>
                }
                @if (faltasDeLista().length) {
                  <p class="texto-secundario sub">De la lista de verificación:</p>
                  <ul class="lista">
                    @for (f of faltasDeLista(); track $index) {
                      <li class="falta">
                        <p>{{ f.mensaje }}</p>
                        <button type="button" class="boton" [attr.aria-label]="'Llévame ahí: ' + f.mensaje" (click)="llevar(f)">Llévame ahí</button>
                      </li>
                    }
                  </ul>
                }
                @if (faltas().length === 0 && !consultando()) {
                  <p class="texto-secundario">Nada por resolver.</p>
                }
                @if (noSeComprobo()) {
                  <p class="aviso" role="note">No se pudo comprobar el caso con Psicología: revisa tu conexión. Lo de arriba es lo que se ve desde aquí.</p>
                }
                <button type="button" class="boton boton-texto comprobar" (click)="comprobar()">Comprobar de nuevo</button>
              </section>

              @if (sugeridas().length) {
                <details class="tarjeta bloque plegable">
                  <summary>Sugerencias ({{ sugeridas().length }}) <span class="texto-secundario">· no impiden enviar</span></summary>
                  <ul class="lista">
                    @for (s of sugeridas(); track $index) {
                      <li class="falta">
                        <p>{{ s.mensaje }}</p>
                        @if (s.ir.accionId === 'probar') {
                          <button type="button" class="boton" [attr.aria-label]="'Llévame ahí: ' + s.mensaje" (click)="llevar(s)">Llévame ahí</button>
                        } @else {
                          <a class="boton" [routerLink]="rutas.a(s.ir.ruta)">Ir a revisarlo</a>
                        }
                      </li>
                    }
                  </ul>
                </details>
              }

              @if (listo().length) {
                <details class="tarjeta bloque plegable" aria-label="Lo que ya está listo">
                  <summary>Ya está listo ({{ listo().length }})</summary>
                  <ul class="hechos">
                    @for (l of listo(); track l) { <li><span aria-hidden="true">✓</span> {{ l }}</li> }
                  </ul>
                </details>
              }

              @if (caso.lista; as lista) {
                @if (lista.items.length) {
                  <section aria-labelledby="lv" class="tarjeta bloque" id="lista-verificacion" tabindex="-1">
                    <h2 id="lv">Lista de verificación</h2>
                    <p class="texto-secundario">Lo declaras tú: marca lo que ya revisaste del caso. Los ítems obligatorios hay que marcarlos para poder enviarlo a Psicología.</p>
                    <ul class="lista">
                      @for (i of casillas(); track i.codigo) {
                        <li class="item-lista">
                          <label class="casilla">
                            <input type="checkbox" [attr.data-codigo]="i.codigo" [checked]="i.cumplido" (change)="marcarItem(i.codigo, $any($event.target).checked)" />
                            <span>{{ i.texto }}</span>
                          </label>
                          <span class="etiquetas">
                            <span class="pildora">{{ i.obligatorio ? 'Obligatorio' : 'Opcional' }}</span>
                            @if (i.quien === 'constancia') { <span class="pildora">Psicología lo confirma al aprobar</span> }
                            @if (i.enBorrador) { <span class="pildora">Texto pendiente de validar con Psicología</span> }
                          </span>
                        </li>
                      }
                    </ul>
                    @if (deSistema().length) {
                      <p class="texto-secundario sub">Lo comprueba el sistema: no se marca, se cumple solo cuando el caso lo tiene.</p>
                      <ul class="lista filas-estado" aria-label="Comprobaciones del sistema">
                        @for (i of deSistema(); track i.codigo) {
                          <li class="item-estado" [attr.data-codigo]="i.codigo" [attr.data-listo]="i.respaldado === true">
                            <span class="marca" aria-hidden="true">{{ i.respaldado ? '✓' : '○' }}</span>
                            <span class="item-estado__texto">{{ i.texto }}</span>
                            <span class="pildora">{{ i.respaldado ? 'Hecho' : 'Falta' }}</span>
                            @if (i.respaldo) { <span class="texto-secundario item-estado__respaldo">{{ i.respaldo }}</span> }
                          </li>
                        }
                      </ul>
                    }
                    <p class="texto-secundario constancia">
                      @if (lista.constanciaRegistrada) {
                        Constancia de Psicología registrada.
                      } @else {
                        Pendiente: la constancia la registra Psicología al aprobar el caso; no es una casilla tuya.
                      }
                    </p>
                  </section>
                }
              }

              <section aria-labelledby="ms" class="tarjeta envio" data-accion="enviar-revision">
                <label id="ms" for="mp" class="etiqueta">Mensaje para Psicología (opcional)</label>
                <textarea id="mp" class="campo" rows="2" aria-describedby="mph" [value]="mensaje()" (input)="mensaje.set($any($event.target).value)"></textarea>
                <p id="mph" class="texto-secundario">Por ejemplo, qué quieres que revisen con más cuidado.</p>
                <button type="button" class="boton boton-primario" [attr.aria-disabled]="!puedeEnviarAhora()" aria-describedby="eph" (click)="enviar()">Enviar a Psicología</button>
                <p role="status" id="eph" [class.error]="!!falloEnvio()">
                  @if (falloEnvio(); as fallo) {
                    {{ fallo }}
                  } @else if (enviando()) {
                    Enviando el caso a Psicología…
                  } @else if (!puedeEnviarAhora() && faltas().length) {
                    Resuelve {{ faltas().length === 1 ? 'la cosa' : 'las ' + faltas().length + ' cosas' }} de «Por resolver» para poder enviar el caso.
                  } @else if (!puedeEnviarAhora() && !consultando()) {
                    En este momento no puedes enviar este caso a revisión.
                  }
                </p>
              </section>
          </div>
        }
        <p role="status" class="solo-lector">{{ anuncio() }}</p>
      </div>
    }
  `,
  styles: `
    .pagina > div > p { margin: 4px 0 0; }
    .resumen { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; }
    .resumen__texto { min-inline-size: 0; }
    .resumen h2, .resumen p { margin: 0; overflow-wrap: anywhere; }
    .resumen .linea-estado { grid-column: 1 / -1; font-weight: 700; padding: 6px 12px; border-radius: var(--radio-control); background: var(--fondo-hundido); }
    .resumen .linea-estado[data-tono='aviso'] { background: var(--aviso-tinte); color: var(--aviso-texto); }
    .resumen .linea-estado[data-tono='ok'] { background: var(--adecuada-tinte); color: var(--adecuada); }
    .cifras { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px 32px; }
    .probado { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0 12px; min-block-size: 56px; padding-block: 4px; border-block-start: 1px solid var(--linea); }
    .probado[data-listo='false'] .marca { color: var(--aviso-texto); }
    .probado__texto { min-inline-size: 0; overflow-wrap: anywhere; font-weight: 700; }
    /* En una columna (móvil) el orden es el de lectura: lo que falta, la lista y, al final, enviar. En pantalla ancha, la lista
       ocupa la columna de la derecha y «enviar» se queda bajo lo que falta, a su izquierda. */
    .dos-columnas { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (min-width: 64rem) {
      .dos-columnas { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 24px; row-gap: 0; }
      .dos-columnas > * { grid-column: 1; margin-block-end: 16px; }
      .dos-columnas > #lista-verificacion { grid-column: 2; grid-row: 1 / span 6; }
    }
    .bloque { display: flex; flex-direction: column; gap: 8px; min-inline-size: 0; }
    .bloque h2 { margin: 0; font-size: var(--autoria-texto-22); line-height: 30px; }
    .sub { margin: 4px 0 0; font-weight: 700; }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .etapas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .etapa { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0 12px; min-block-size: 52px; padding-block: 2px; border-block-end: 1px solid var(--linea); }
    .etapa:last-child { border-block-end: 0; }
    .marca { inline-size: 1.5rem; text-align: center; font-weight: 700; color: var(--adecuada); }
    .etapa[data-listo='false'] .marca { color: var(--aviso-texto); }
    .etapa__nombre { font-weight: 700; min-inline-size: 0; overflow-wrap: anywhere; }
    .etapa__estado { grid-column: 2; color: var(--texto-secundario); font-size: var(--autoria-texto-16); }
    .etapa__estado.pendiente { color: var(--aviso-texto); font-weight: 700; }
    .etapa__ver { grid-column: 3; grid-row: 1 / span 2; white-space: nowrap; }
    .falta { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; padding: 8px 12px; border: 1px solid var(--linea); border-radius: var(--radio-control); }
    .falta p { margin: 0; flex: 1 1 14rem; min-inline-size: 0; overflow-wrap: anywhere; }
    .comprobar { align-self: flex-start; }
    .aviso { margin: 0; color: var(--aviso-texto); font-weight: 700; }
    .plegable summary { min-block-size: 44px; display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: var(--autoria-texto-18); cursor: pointer; }
    .plegable[open] summary { margin-block-end: 8px; }
    .plegable summary:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; border-radius: var(--radio-control); }
    #lista-verificacion p { margin: 0; }
    .item-lista { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; border-block-end: 1px solid var(--linea); }
    .casilla { display: flex; align-items: flex-start; gap: 10px; min-block-size: 44px; padding-block: 8px; font-size: var(--autoria-texto-16); overflow-wrap: anywhere; }
    .casilla input { inline-size: 24px; block-size: 24px; flex: none; accent-color: var(--primario); }
    .etiquetas { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding-inline-start: 34px; }
    .filas-estado { gap: 0; }
    .item-estado { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 2px 10px; padding-block: 8px; border-block-end: 1px solid var(--linea); }
    .item-estado[data-listo='false'] .marca { color: var(--aviso-texto); }
    .item-estado__texto { min-inline-size: 0; overflow-wrap: anywhere; }
    .item-estado__respaldo { grid-column: 2 / -1; font-size: var(--autoria-texto-14); }
    .hechos { margin: 0; padding-left: 4px; list-style: none; display: flex; flex-direction: column; gap: 4px; }
    .hechos span { color: var(--adecuada); font-weight: 700; }
    .envio { display: flex; flex-direction: column; gap: 6px; min-inline-size: 0; }
    .envio p { margin: 0; font-size: var(--autoria-texto-16); }
    .envio .boton { align-self: flex-start; }
    .envio .error { color: var(--peligro); font-weight: 700; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo { padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16); resize: vertical; inline-size: 100%; box-sizing: border-box; min-inline-size: 0; }
    .campo:focus-visible { outline: 2px solid var(--foco); outline-offset: 2px; }
    .devuelto { border-color: var(--aviso-texto); }
    .devuelto p { margin: 0; overflow-wrap: anywhere; }
    .version-nueva { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .version-nueva p { margin: 0; }
    .version-nueva .error { color: var(--peligro); font-weight: 700; }
    .listo { margin: 0; padding: 10px 12px; border-radius: var(--radio-control); background: var(--adecuada-tinte); color: var(--adecuada); font-weight: 700; }
    @media (max-width: 40rem) {
      .probado { grid-template-columns: auto minmax(0, 1fr); }
      .probado .boton { grid-column: 2; justify-self: start; }
      .etapa { grid-template-columns: auto minmax(0, 1fr); }
      .etapa__ver { grid-column: 2; grid-row: auto; justify-self: start; }
    }
    @media (forced-colors: active) {
      .tarjeta, .falta { border: 1px solid CanvasText; }
    }
  `,
})
export class RevisionComponent {
  protected readonly rutas = inject(RutasAutoria);
  protected readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  private readonly guia = inject(GuiaService);
  private readonly autoria = inject(AutoriaApiService);
  private readonly progreso = inject(ProgresoDelCaso);
  private readonly dialogo = inject(UiDialog);
  protected readonly mensaje = signal('');
  protected readonly anuncio = signal('');
  protected readonly enviando = signal(false);
  protected readonly falloEnvio = signal<string | null>(null);

  /** Lo que la compuerta del servidor dijo la última vez que se le preguntó. */
  private readonly hallazgos = signal<ValidationIssue[]>([]);
  private readonly ciclo = signal<CaseLifecycle | null>(null);
  /** Bloqueos que el servidor devolvió al intentar enviar (por si cambiaron desde que se le preguntó). */
  private readonly bloqueosDelEnvio = signal<ValidationIssue[]>([]);
  protected readonly consultando = signal(false);
  protected readonly noSeComprobo = signal(false);
  protected readonly creandoVersion = signal(false);
  protected readonly falloVersion = signal<string | null>(null);

  constructor() {
    void this.comprobar();
    void this.store.releerProbado();
    // Lo que comprueba el sistema no es una casilla de la docente, pero el servidor cuenta la lista por lo marcado: aquí se
    // pone al día solo (marcado = el dato existe). Lo que respalda la constancia SÍ es casilla: sin ella la docente no podría
    // completar la lista antes de que Psicología apruebe. Cada ítem se intenta una vez, para no repetir un guardado que falla.
    const intentados = new Set<string>();
    effect(() => {
      const caso = this.store.caso();
      if (!caso?.lista || this.store.soloLectura()) return;
      untracked(() => {
        let cambio = false;
        for (const i of caso.lista!.items) {
          if (i.quien !== 'system' || (i.respaldado === true) === i.cumplido || intentados.has(i.codigo)) continue;
          intentados.add(i.codigo);
          this.store.marcarItemLista(i.codigo, i.respaldado === true);
          cambio = true;
        }
        if (cambio) void this.comprobar();
      });
    });
    // Una decisión tomada en el panel (aprobar, devolver, archivar) cambia el caso en el servidor: se vuelve a leer para
    // que el editor, la revisión vigente y las acciones permitidas sean las nuevas.
    this.autoria.api.caseChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      if (String(id) === this.store.caso()?.id) void this.recargar();
    });
  }

  /** El caso abierto como número, que es como lo piden el panel y el servidor. */
  protected readonly casoId = computed(() => Number(this.store.caso()?.id ?? 0));

  /** Lo que se le dice a quien ve el caso cuando ya no es un borrador. */
  protected readonly textoSoloLectura = computed(() => {
    switch (this.store.caso()?.estado) {
      case 'PUBLISHED': return 'El caso está publicado. Se puede ver, pero no editar.';
      case 'ARCHIVED': return 'El caso está archivado. Se puede ver, pero no editar.';
      default: return 'El caso está en revisión de Psicología. Se puede ver, pero no editar.';
    }
  });

  /** La última decisión, si fue devolver el caso a borrador: quien lo autora tiene que poder leer por qué volvió. */
  protected readonly devuelto = computed(() => {
    const revision = this.ciclo()?.review;
    if (this.store.soloLectura() || revision?.decision !== 'REJECTED') return null;
    return { motivo: NOMBRE_MOTIVO[revision.reason ?? ''] ?? 'Sin motivo', nota: revision.note?.trim() ?? '' };
  });

  /** Crear una versión nueva solo se ofrece cuando el servidor la permite (un caso publicado o archivado). */
  protected readonly puedeCrearVersion = computed(() => this.ciclo()?.allowedTransitions.includes('clone') === true);

  /** El estado del caso: el que el servidor acaba de decir o, si no, el del borrador que se está viendo. */
  protected readonly nombreEstado = computed(() => NOMBRE_ESTADO[this.store.caso()?.estado ?? this.ciclo()?.state ?? 'DRAFT'] ?? 'Borrador');

  /** Lo que el editor ve por su cuenta en el borrador (lo mismo que cuenta la hoja «Pendientes»). */
  private readonly faltasLocales = computed<Falta[]>(() => {
    const caso = this.store.caso();
    return caso ? puedeEnviar(caso).faltas : [];
  });

  /** Lo que falta, de dos fuentes: lo que el editor ve en el borrador y lo que dice la compuerta del servidor (sin repetir). */
  protected readonly faltas = computed<Falta[]>(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const locales = this.faltasLocales();
    const delServidor: ValidationIssue[] = [...this.hallazgos(), ...this.bloqueosDelEnvio()];
    // El motivo que el servidor da para no dejar enviar, si no es uno de los hallazgos de arriba (por ejemplo, la lista de verificación).
    const motivo = this.ciclo()?.blockedReason;
    if (motivo && motivo.code !== 'VALIDATION_ERRORS') delServidor.push({ code: motivo.code, severity: 'error', message: motivo.message });
    const unicos = new Map(delServidor.map((h) => [`${h.code}|${h.message}`, h]));
    return [
      ...locales,
      ...faltasDelServidor([...unicos.values()], caso, {
        respuestaDeOpcion: (clave) => this.store.respuestaDeOpcion(clave),
        respuestasGuardadas: (escenaId) => this.store.respuestasGuardadasDe(escenaId),
        faltasLocales: locales,
      }),
    ];
  });

  /** Lo de la lista de verificación que impide enviar (viene del editor o del servidor): se muestra junto a la lista. */
  protected readonly faltasDeLista = computed(() => this.faltas().filter((f) => f.codigo === 'CHECKLIST_INCOMPLETE'));

  /** Lo que solo dice el servidor (no está en la hoja «Pendientes», que se arma con lo que ve el editor): se lista aquí. */
  protected readonly faltasDelServidor = computed(() => {
    const locales = new Set(this.faltasLocales());
    return this.faltas().filter((f) => !locales.has(f) && f.codigo !== 'CHECKLIST_INCOMPLETE');
  });

  /**
   * Un resumen por etapa de lo que el editor ve (por corregir y por escribir): la lista completa vive una sola vez, en la
   * hoja «Pendientes», que se abre desde aquí. La etapa «Enviar» no sale: es esta pantalla.
   */
  protected readonly etapas = computed(() => {
    const pendientes = this.progreso.pendientes().filter((p) => p.tipo !== 'sugerencia');
    return ETAPAS_DE_ENVIO.map(({ etapa, nombre }) => {
      const corregir = pendientes.filter((p) => p.etapa === etapa && p.tipo === 'por-corregir').length;
      const escribir = pendientes.filter((p) => p.etapa === etapa && p.tipo === 'por-escribir').length;
      const partes = [corregir ? `${corregir} por corregir` : '', escribir ? `${escribir} por escribir` : ''].filter(Boolean);
      return { etapa, nombre, total: corregir + escribir, texto: partes.length ? partes.join(' · ') : 'Listo' };
    });
  });

  /** La línea de estado del caso: en qué punto del ciclo está y qué sigue, en una frase. */
  protected readonly lineaDeEstado = computed(() => {
    switch (this.store.caso()?.estado ?? this.ciclo()?.state ?? 'DRAFT') {
      case 'IN_REVIEW': return 'Enviado a Psicología. Esperando su decisión.';
      case 'PUBLISHED': return 'Publicado: los estudiantes ya pueden jugarlo.';
      case 'ARCHIVED': return 'Archivado: ya no aparece para los estudiantes.';
      default: {
        if (this.devuelto()) return 'Psicología lo devolvió: corrige lo que pide y vuelve a enviarlo.';
        const n = this.faltas().length;
        return n === 0 ? 'Borrador listo para enviar.' : `Borrador: faltan ${n} ${n === 1 ? 'cosa' : 'cosas'} para poder enviarlo.`;
      }
    }
  });

  /**
   * Los ítems de la lista que la docente puede marcar: sus declaraciones y los que respalda la constancia (los declara al
   * enviar; Psicología los confirma al aprobar). Todos, con un servidor que no dice quién respalda.
   */
  protected readonly casillas = computed(() => (this.store.caso()?.lista?.items ?? []).filter((i) => i.quien !== 'system'));
  /** Los que no se marcan: los comprueba el sistema con los datos del caso. */
  protected readonly deSistema = computed(() => (this.store.caso()?.lista?.items ?? []).filter((i) => i.quien === 'system'));

  /** El tono de la línea de estado: aviso si quedan cosas por resolver, bien si está listo; el resto es neutro. */
  protected readonly tonoDeEstado = computed(() => {
    if (this.store.soloLectura()) return 'neutro';
    return this.faltas().length > 0 ? 'aviso' : this.consultando() ? 'neutro' : 'ok';
  });

  protected readonly puedeEnviarAhora = computed(
    () => this.faltas().length === 0 && !this.consultando() && !this.enviando() && !this.store.soloLectura()
      && (this.ciclo()?.allowedTransitions ?? ['submit']).includes('submit'),
  );

  protected readonly sugeridas = computed(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    // Un aviso del editor que la compuerta ya convirtió en falta no se repite como sugerencia.
    const codigosEnFaltas = new Set(this.faltas().map((f) => f.codigo).filter(Boolean));
    // Los textos largos los avisa el servidor (también en un caso escrito a mano): se suman como sugerencias, con su escena.
    // «Probar» no es una sugerencia suelta: tiene su fila, con su botón, junto a lo que falta (`data-probado`).
    return [...sugerencias(caso).filter((s) => s.ir.accionId !== 'probar' && (!s.codigo || !codigosEnFaltas.has(s.codigo))), ...avisosDeLectura(this.hallazgos())];
  });
  protected readonly cuantasRespuestas = computed(() => (this.store.caso()?.escenas ?? []).reduce((n, e) => n + e.respuestas.length, 0));
  /** Los finales que el caso puede dar: los cuatro del modelo, o los que escribió la docente. */
  protected readonly cuantosFinales = computed(() => {
    const caso = this.store.caso();
    return !caso ? 0 : caso.modoFinales === 'automatico' ? 4 : caso.finales.length;
  });
  /**
   * «Probar» abre el borrador en el juego real: con clic normal en esta pestaña; con Ctrl o clic central, en otra ya al día
   * (`alPulsarProbar`). El clic central no llega como `click` sino como `auxclick`: por eso se escuchan los dos.
   */
  protected readonly rutaEnsayo = computed(() => RUTA_ENSAYO(this.store.caso()?.id ?? ''));
  protected probar(evento: MouseEvent): void {
    void alPulsarProbar(evento, this.store);
  }
  /** El nombre del lugar del caso; nada si el caso no tiene lugar. */
  protected readonly lugar = computed(() => (this.store.caso(), this.store.nombreDelLugar()));
  protected readonly textoFinales = computed(() => {
    const caso = this.store.caso();
    if (!caso) return '';
    if (caso.modoFinales === 'automatico') return 'finales que se calculan solos';
    const n = caso.finales.length;
    return `${n} ${n === 1 ? 'final escrito' : 'finales escritos'} por ti`;
  });
  protected readonly listo = computed(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const hechos: string[] = [];
    if (caso.titulo.trim() && caso.lugarId) hechos.push('El caso tiene nombre y lugar.');
    if (caso.inicioId) hechos.push('Tiene una escena de inicio.');
    const respuestas = caso.escenas.flatMap((e) => e.respuestas);
    if (respuestas.length && respuestas.every((r) => r.texto.trim() && r.retroalimentacion.trim())) {
      hechos.push('Todas las respuestas tienen texto, clasificación y lo que lee el estudiante después.');
    }
    if (caso.escenas.some((e) => e.esFinal)) hechos.push('Hay al menos una escena final.');
    if (caso.modoFinales === 'propio' && caso.finales.length && caso.finales.every((f) => f.nombre.trim() && f.texto.trim())) {
      hechos.push(`Los ${caso.finales.length} finales tienen nombre y texto.`);
    }
    if (caso.probadoHastaElFinal) hechos.push('Ya lo probaste como estudiante.');
    return hechos;
  });

  /** La hoja «Pendientes» de la barra, desde aquí: la única lista completa de lo que falta. */
  protected abrirPendientes(evento: Event): void {
    this.dialogo.sheet(PanelPendientesComponent, { side: 'end', origen: evento.currentTarget as Element | null });
  }

  /** El ensayo corre en otra pestaña: al volver a esta, se pregunta si ya llegó a un final. */
  protected alCambiarVisibilidad(): void {
    if (document.visibilityState === 'visible') void this.store.releerProbado();
  }

  /** Marca o desmarca un ítem de la lista de verificación (se guarda con la revisión vigente) y vuelve a preguntar qué falta. */
  protected marcarItem(codigo: string, cumplido: boolean): void {
    this.store.marcarItemLista(codigo, cumplido);
    void this.comprobar();
  }

  /** Vuelve a leer el caso y lo que el servidor dice de él, después de una decisión tomada fuera de esta pantalla. */
  private async recargar(): Promise<void> {
    const id = this.casoId();
    if (!id) return;
    await this.store.cargar(id, true);
    await this.comprobar();
  }

  /** Clona la versión y abre la copia en el editor: un caso publicado o archivado no se cambia, se versiona. */
  protected async crearVersion(): Promise<void> {
    if (this.creandoVersion()) return;
    this.creandoVersion.set(true);
    this.falloVersion.set(null);
    try {
      const vista = await firstValueFrom(this.autoria.api.cloneCaseVersion(this.casoId()));
      await this.router.navigateByUrl(rutaDelEditor('/editor', String(vista.caseVersionId)));
    } catch {
      this.falloVersion.set('No se pudo crear la versión nueva. No se cambió nada: vuelve a intentarlo en un momento.');
    } finally {
      this.creandoVersion.set(false);
    }
  }

  /** Le pregunta a la compuerta del servidor qué impide enviar y qué estado tiene el caso. Sin red, deja lo que se ve en el borrador. */
  protected async comprobar(): Promise<void> {
    this.consultando.set(true);
    this.noSeComprobo.set(false);
    this.bloqueosDelEnvio.set([]);
    try {
      const { hallazgos, ciclo } = await this.store.revisarConServidor();
      this.hallazgos.set(hallazgos);
      this.ciclo.set(ciclo);
    } catch {
      // Un caso que aún no está guardado no tiene qué preguntarle al servidor; uno que sí, avisa que no pudo.
      this.noSeComprobo.set(this.store.caso()?.revision !== 0);
    } finally {
      this.consultando.set(false);
    }
  }

  /** «Llévame ahí»: abre la pantalla de lo que falta y, si es algo concreto (una respuesta, un hito, un final…), le da el foco. */
  protected async llevar(f: Falta): Promise<void> {
    if (f.ir.accionId) await this.guia.mostrar(f.ir.accionId, 'foco');
    const destino = this.rutas.a(f.ir.ruta);
    if (this.router.url.split('?')[0] !== destino) await this.router.navigateByUrl(destino);
    if (f.ir.ancla) await this.enfocar(f.ir.ancla);
  }

  /** Espera a que la pantalla de destino dibuje el elemento (hasta ~1,5 s) y le pasa el foco. */
  private async enfocar(id: string): Promise<void> {
    for (let intento = 0; intento < 60; intento++) {
      const el = document.getElementById(id);
      if (el) {
        if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
        el.scrollIntoView?.({ block: 'center' });
        el.focus();
        return;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  protected async enviar(): Promise<void> {
    if (!this.puedeEnviarAhora()) return;
    this.enviando.set(true);
    this.falloEnvio.set(null);
    try {
      const ciclo = await this.store.enviarARevision(this.mensaje());
      this.ciclo.set(ciclo);
      this.anuncio.set('El caso está en revisión de Psicología.');
    } catch (error) {
      const bloqueos = error instanceof HttpErrorResponse ? this.bloqueosDe(error) : null;
      if (bloqueos) {
        this.bloqueosDelEnvio.set(bloqueos);
        this.falloEnvio.set('Psicología no puede recibir el caso todavía: resuelve lo de arriba.');
      } else {
        this.falloEnvio.set(this.store.conflicto() ? OTRA_PERSONA_CAMBIO_EL_CASO : NO_SE_PUDO_ENVIAR);
      }
    } finally {
      this.enviando.set(false);
    }
  }

  /** Los bloqueos que trae el rechazo de la compuerta (cada bloqueo y, dentro, sus hallazgos), como hallazgos. */
  private bloqueosDe(error: HttpErrorResponse): ValidationIssue[] | null {
    const bloqueos = (error.error as { blockers?: Array<{ code: string; message: string; issues?: ValidationIssue[] }> } | null)?.blockers;
    if (error.status !== 409 || !Array.isArray(bloqueos)) return null;
    return bloqueos.flatMap((b) => (b.issues?.length ? b.issues : [{ code: b.code, severity: 'error' as const, message: b.message }]));
  }
}
