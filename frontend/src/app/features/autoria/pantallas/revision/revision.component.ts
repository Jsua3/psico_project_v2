import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { GuiaService } from '../../guia/guia.service';
import { type Falta, puedeEnviar, sugerencias } from '../../modelo/revision';
import { RutasAutoria } from '../../rutas';

/**
 * Enviar a revisión (tablero 32): qué falta resolver (bloquea), sugerencias (no bloquean),
 * lo que ya está listo y el envío a Psicología, que en el sandbox solo se simula.
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
          <span class="pildora">{{ enviado() ? 'En revisión (simulado)' : 'Borrador' }}</span>
        </section>

        <section aria-labelledby="fl" class="bloque">
          <h2 id="fl">Por resolver ({{ estado().faltas.length }})</h2>
          @if (estado().faltas.length) {
            <ul class="lista">
              @for (f of estado().faltas; track $index) {
                <li class="tarjeta falta">
                  <p>{{ f.mensaje }}</p>
                  <button type="button" class="boton" [attr.aria-label]="'Llévame ahí: ' + f.mensaje" (click)="llevar(f)">Llévame ahí</button>
                </li>
              }
            </ul>
          } @else {
            <p>Nada por resolver.</p>
          }
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

        <section aria-labelledby="ms" class="tarjeta envio" data-accion="enviar-revision">
          <label id="ms" for="mp" class="etiqueta">Mensaje para Psicología (opcional)</label>
          <textarea id="mp" class="campo" rows="3" aria-describedby="mph" [value]="mensaje()" (input)="mensaje.set($any($event.target).value)"></textarea>
          <p id="mph" class="texto-secundario">Por ejemplo, qué quieres que revisen con más cuidado.</p>
          <button type="button" class="boton boton-primario" [attr.aria-disabled]="!estado().ok" aria-describedby="eph" (click)="enviar()">Enviar a Psicología</button>
          <p role="status" id="eph" [class.listo]="enviado()">
            @if (enviado()) {
              Listo. En el programa real, aquí el caso pasaría a revisión de Psicología.
            } @else if (!estado().ok) {
              Resuelve {{ estado().faltas.length === 1 ? 'la cosa' : 'las ' + estado().faltas.length + ' cosas' }} de arriba para poder enviar el caso.
            }
          </p>
        </section>
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
    .hechos { margin: 0; padding-left: 4px; list-style: none; display: flex; flex-direction: column; gap: 4px; }
    .hechos span { color: var(--adecuada); font-weight: 700; }
    .envio { display: flex; flex-direction: column; gap: 6px; }
    .envio p { margin: 0; font-size: var(--autoria-texto-16); }
    .envio .boton { align-self: flex-start; }
    .etiqueta { font-weight: 700; font-size: var(--autoria-texto-16); }
    .campo { padding: 8px 12px; font: inherit; font-size: var(--autoria-texto-16); border: 2px solid var(--borde-control); border-radius: var(--radio-control); resize: vertical; }
    .listo { padding: 10px 12px; border-radius: var(--radio-control); background: var(--adecuada-tinte); color: var(--adecuada); font-weight: 700; }
  `,
})
export class RevisionComponent {
  protected readonly rutas = inject(RutasAutoria);
  protected readonly store = inject(CasoStore);
  private readonly router = inject(Router);
  private readonly guia = inject(GuiaService);
  protected readonly mensaje = signal('');
  protected readonly enviado = signal(false);

  protected readonly estado = computed(() => {
    const caso = this.store.caso();
    return caso ? puedeEnviar(caso) : { ok: false, faltas: [] as Falta[] };
  });
  protected readonly sugeridas = computed(() => {
    const caso = this.store.caso();
    return caso ? sugerencias(caso, this.store.probado()) : [];
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

  protected async llevar(f: Falta): Promise<void> {
    if (f.ir.accionId) await this.guia.mostrar(f.ir.accionId, 'foco');
    const destino = this.rutas.a(f.ir.ruta);
    if (this.router.url.split('?')[0] !== destino) await this.router.navigateByUrl(destino);
  }

  protected enviar(): void {
    if (!this.estado().ok) return;
    this.enviado.set(true);
  }
}
