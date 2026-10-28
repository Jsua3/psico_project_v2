import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import type { CaseLifecycle, ValidationIssue } from '../../../../core/models/simulation.model';
import { CasoStore } from '../../estado/caso.store';
import { GuiaService } from '../../guia/guia.service';
import { type Falta, faltasDelServidor, puedeEnviar, sugerencias } from '../../modelo/revision';
import { RutasAutoria } from '../../rutas';

/** Cómo se nombra el estado del caso ante el docente. */
const NOMBRE_ESTADO: Record<string, string> = {
  DRAFT: 'Borrador', IN_REVIEW: 'En revisión', PUBLISHED: 'Publicado', ARCHIVED: 'Archivado',
};

/** Lo que dice el docente cuando el envío no pasó por una razón que no es un bloqueo de la compuerta. */
const NO_SE_PUDO_ENVIAR = 'No se pudo enviar el caso. No se cambió nada: vuelve a intentarlo en un momento.';

/**
 * Enviar a revisión (tablero 32): qué falta resolver (lo mismo que mide la compuerta de publicación, en lenguaje del docente
 * y con «Llévame ahí» a lo concreto), sugerencias (no bloquean), lo que ya está listo y el envío a Psicología. Una vez enviado,
 * el caso queda «En revisión»: se puede ver, pero no editar.
 */
@Component({
  selector: 'app-revision',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.caso(); as caso) {
      <div class="pagina">
        <div>
          <h1>Enviar a revisión</h1>
          <p class="texto-secundario">Psicología revisa el caso antes de publicarlo. Mientras esté en revisión se puede ver, pero no editar.</p>
        </div>

        <section aria-label="El caso" class="tarjeta resumen">
          <h2>{{ caso.titulo }}</h2>
          <p class="texto-secundario">Universidad · {{ caso.escenas.length }} {{ caso.escenas.length === 1 ? 'escena' : 'escenas' }} · {{ textoFinales() }}</p>
          <span class="pildora estado">{{ nombreEstado() }}</span>
        </section>

        @if (store.soloLectura()) {
          <p role="status" class="listo">El caso está en revisión de Psicología. Se puede ver, pero no editar.</p>
        } @else {
          <section aria-labelledby="fl" class="bloque por-resolver">
            <h2 id="fl">Por resolver ({{ faltas().length }})</h2>
            @if (consultando()) {
              <p class="texto-secundario" role="status">Comprobando el caso…</p>
            }
            @if (faltas().length) {
              <ul class="lista">
                @for (f of faltas(); track $index) {
                  <li class="tarjeta falta">
                    <p>{{ f.mensaje }}</p>
                    <button type="button" class="boton" [attr.aria-label]="'Llévame ahí: ' + f.mensaje" (click)="llevar(f)">Llévame ahí</button>
                  </li>
                }
              </ul>
            } @else if (!consultando()) {
              <p>Nada por resolver.</p>
            }
            @if (noSeComprobo()) {
              <p class="aviso" role="note">No se pudo comprobar el caso con Psicología: revisa tu conexión. Lo de arriba es lo que se ve desde aquí.</p>
            }
            <button type="button" class="boton boton-texto comprobar" (click)="comprobar()">Comprobar de nuevo</button>
          </section>

          @if (sugeridas().length) {
            <section aria-labelledby="sg" class="bloque">
              <h2 id="sg">Sugerencias ({{ sugeridas().length }}) <span class="texto-secundario">· no impiden enviar</span></h2>
              <ul class="lista">
                @for (s of sugeridas(); track $index) {
                  <li class="tarjeta falta">
                    <p>{{ s.mensaje }}</p>
                    <a class="boton" [routerLink]="rutas.a(s.ir.ruta)">{{ s.ir.ruta === '/probar' ? 'Probar ahora' : 'Ir a revisarlo' }}</a>
                  </li>
                }
              </ul>
            </section>
          }

          <section aria-labelledby="ok" class="bloque">
            <h2 id="ok">Ya está listo ({{ listo().length }})</h2>
            <ul class="hechos">
              @for (l of listo(); track l) { <li><span aria-hidden="true">✓</span> {{ l }}</li> }
            </ul>
          </section>

          @if (caso.lista; as lista) {
            @if (lista.items.length) {
              <section aria-labelledby="lv" class="tarjeta bloque" id="lista-verificacion" tabindex="-1">
                <h2 id="lv">Lista de verificación</h2>
                <p class="texto-secundario">Marca lo que ya revisaste del caso. Los ítems obligatorios hay que marcarlos para poder enviarlo a Psicología.</p>
                <ul class="lista">
                  @for (i of lista.items; track i.codigo) {
                    <li class="item-lista">
                      <label class="casilla">
                        <input type="checkbox" [attr.data-codigo]="i.codigo" [checked]="i.cumplido" (change)="marcarItem(i.codigo, $any($event.target).checked)" />
                        {{ i.texto }}
                      </label>
                      <span class="etiquetas">
                        <span class="pildora">{{ i.obligatorio ? 'Obligatorio' : 'Opcional' }}</span>
                        @if (i.enBorrador) { <span class="pildora">Texto pendiente de validar con Psicología</span> }
                        @if (i.respaldo) { <span class="texto-secundario">{{ i.respaldo }}</span> }
                      </span>
                      @if (i.respaldado === false) {
                        <p class="nota">Marcarla no basta: todavía no existe en el caso lo que la respalda.</p>
                      }
                    </li>
                  }
                </ul>
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
            <textarea id="mp" class="campo" rows="3" aria-describedby="mph" [value]="mensaje()" (input)="mensaje.set($any($event.target).value)"></textarea>
            <p id="mph" class="texto-secundario">Por ejemplo, qué quieres que revisen con más cuidado.</p>
            <button type="button" class="boton boton-primario" [attr.aria-disabled]="!puedeEnviarAhora()" aria-describedby="eph" (click)="enviar()">Enviar a Psicología</button>
            <p role="status" id="eph" [class.error]="!!falloEnvio()">
              @if (falloEnvio(); as fallo) {
                {{ fallo }}
              } @else if (enviando()) {
                Enviando el caso a Psicología…
              } @else if (!puedeEnviarAhora() && faltas().length) {
                Resuelve {{ faltas().length === 1 ? 'la cosa' : 'las ' + faltas().length + ' cosas' }} de arriba para poder enviar el caso.
              } @else if (!puedeEnviarAhora() && !consultando()) {
                En este momento no puedes enviar este caso a revisión.
              }
            </p>
          </section>
        }
        <p role="status" class="solo-lector">{{ anuncio() }}</p>
      </div>
    }
  `,
  styles: `
    .pagina > div > p { margin: 4px 0 0; }
    .resumen { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .resumen h2, .resumen p { margin: 0; }
    .bloque { display: flex; flex-direction: column; gap: 8px; }
    .bloque h2 { margin: 0; font-size: var(--autoria-texto-22); line-height: 30px; }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .falta { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; }
    .falta p { margin: 0; flex: 1 1 360px; }
    .comprobar { align-self: flex-start; }
    .aviso { margin: 0; color: var(--aviso-texto); font-weight: 700; }
    #lista-verificacion { display: flex; flex-direction: column; gap: 8px; }
    #lista-verificacion p { margin: 0; }
    .item-lista { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; border-bottom: 1px solid var(--linea); }
    .casilla { display: inline-flex; align-items: center; gap: 8px; min-height: 48px; font-size: var(--autoria-texto-16); }
    .casilla input { width: 20px; height: 20px; flex: none; accent-color: var(--primario); }
    .etiquetas { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding-left: 28px; }
    .item-lista .nota { padding-left: 28px; color: var(--aviso-texto); font-weight: 700; font-size: var(--autoria-texto-16); }
    .hechos { margin: 0; padding-left: 4px; list-style: none; display: flex; flex-direction: column; gap: 4px; }
    .hechos span { color: var(--adecuada); font-weight: 700; }
    .envio { display: flex; flex-direction: column; gap: 6px; }
    .envio p { margin: 0; font-size: var(--autoria-texto-16); }
    .envio .boton { align-self: flex-start; }
    .envio .error { color: var(--peligro); font-weight: 700; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo { padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16); border: 2px solid var(--borde-control); border-radius: var(--radio-control); resize: vertical; }
    .listo { margin: 0; padding: 10px 12px; border-radius: var(--radio-control); background: var(--adecuada-tinte); color: var(--adecuada); font-weight: 700; }
  `,
})
export class RevisionComponent {
  protected readonly rutas = inject(RutasAutoria);
  protected readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  private readonly guia = inject(GuiaService);
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

  constructor() {
    void this.comprobar();
  }

  /** El estado del caso: el que el servidor acaba de decir o, si no, el del borrador que se está viendo. */
  protected readonly nombreEstado = computed(() => NOMBRE_ESTADO[this.store.caso()?.estado ?? this.ciclo()?.state ?? 'DRAFT'] ?? 'Borrador');

  /** Lo que falta, de dos fuentes: lo que el editor ve en el borrador y lo que dice la compuerta del servidor (sin repetir). */
  protected readonly faltas = computed<Falta[]>(() => {
    const caso = this.store.caso();
    if (!caso) return [];
    const locales = puedeEnviar(caso).faltas;
    const delServidor: ValidationIssue[] = [...this.hallazgos(), ...this.bloqueosDelEnvio()];
    // El motivo que el servidor da para no dejar enviar, si no es uno de los hallazgos de arriba (por ejemplo, la lista de verificación).
    const motivo = this.ciclo()?.blockedReason;
    if (motivo && motivo.code !== 'VALIDATION_ERRORS') delServidor.push({ code: motivo.code, severity: 'error', message: motivo.message });
    const unicos = new Map(delServidor.map((h) => [`${h.code}|${h.message}`, h]));
    return [
      ...locales,
      ...faltasDelServidor([...unicos.values()], caso, { respuestaDeOpcion: (clave) => this.store.respuestaDeOpcion(clave), faltasLocales: locales }),
    ];
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
    return sugerencias(caso, this.store.probado()).filter((s) => !s.codigo || !codigosEnFaltas.has(s.codigo));
  });
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
    if (this.store.probado()) hechos.push('Ya lo probaste como estudiante.');
    return hechos;
  });

  /** Marca o desmarca un ítem de la lista de verificación (se guarda con la revisión vigente) y vuelve a preguntar qué falta. */
  protected marcarItem(codigo: string, cumplido: boolean): void {
    this.store.marcarItemLista(codigo, cumplido);
    void this.comprobar();
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
        this.falloEnvio.set(NO_SE_PUDO_ENVIAR);
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
