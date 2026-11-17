import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { PlanoDelLugarComponent, type PuertaRota } from '../../../simulator/plano/plano-del-lugar.component';
import { normalizarLayout, type PlanoDelLugar } from '../../../simulator/plano/plano';
import { AutoriaApiService } from '../../api/autoria-api.service';
import { CatalogoDePiezas } from '../../estado/catalogo-de-piezas';
import { CasoStore } from '../../estado/caso.store';
import { faltasPorSala } from '../../modelo/salas-a-documento';
import { RutasAutoria } from '../../rutas';

type Estado = { tipo: 'cargando' } | { tipo: 'listo'; plano: PlanoDelLugar | null } | { tipo: 'error' };

/**
 * El plano del caso (P4, Tarea 11): todas las salas por piezas del caso con sus puertas, como lo dibuja el juego, pero
 * con todas a la vista y sin «estás aquí». Las puertas sin regreso (OCL-15) salen en rojo con su texto; un clic (o Enter
 * en la lista) en una sala abre su editor. El plano lo arma el servidor con lo guardado: se pide cuando no queda nada
 * por guardar.
 */
@Component({
  selector: 'app-plano-caso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlanoDelLugarComponent, RouterLink],
  template: `
    <header class="cabeza">
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <h1>Plano del caso</h1>
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <p class="texto-secundario">Las salas por piezas del caso y sus puertas. Elige una sala para abrir su editor.</p>
      <a class="boton" [routerLink]="rutas.a('/editor')">Volver al caso</a>
    </header>
    @switch (estado().tipo) {
      @case ('cargando') {
        <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
        <p role="status">Cargando el plano…</p>
      }
      @case ('error') {
        <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
        <p role="alert">No se pudo cargar el plano. <button type="button" class="boton" (click)="cargar()">Reintentar</button></p>
      }
      @case ('listo') {
        @if (plano(); as plano) {
          <app-plano-del-lugar class="tarjeta" [plano]="plano" modo="completo" [visitadas]="todas()" [rotas]="rotas()"
            [elegible]="true" (salaElegida)="abrir($event)" />
        } @else {
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <p role="status">Este caso no tiene salas por piezas: el plano aparece cuando las tiene.</p>
        }
      }
    }
  `,
  styles: [`
    :host { display: grid; gap: 16px; }
    .cabeza { display: grid; gap: 8px; justify-items: start; }
    .cabeza h1, .cabeza p { margin: 0; }
    app-plano-del-lugar { padding: 16px; }
  `],
})
export class PlanoCasoComponent {
  protected readonly rutas = inject(RutasAutoria);
  private readonly store = inject(CasoStore);
  private readonly api = inject(AutoriaApiService);
  private readonly catalogoPiezas = inject(CatalogoDePiezas);
  private readonly router = inject(Router);
  protected readonly estado = signal<Estado>({ tipo: 'cargando' });
  protected readonly plano = computed(() => { const e = this.estado(); return e.tipo === 'listo' ? e.plano : null; });
  /** Todas las salas «vistas»: así el plano escribe todos los nombres (la docente no descubre nada). */
  protected readonly todas = computed(() => new Set(this.plano()?.salas.map(s => s.clave) ?? []));
  /** Las puertas sin regreso del borrador (OCL-15), en el muro y la posición de la puerta. */
  protected readonly rotas = computed<PuertaRota[]>(() => {
    const caso = this.store.caso(), reglas = this.catalogoPiezas.reglas();
    if (!caso || !reglas) return [];
    const rotas: PuertaRota[] = [];
    for (const [salaId, faltas] of faltasPorSala(caso, reglas)) {
      const sala = caso.salas.find(s => s.id === salaId);
      for (const f of faltas) {
        if (f.regla !== 'OCL-15' || f.elemento.tipo !== 'puerta') continue;
        const puerta = sala?.puertas.find(p => p.id === f.elemento.id);
        if (puerta?.muro !== undefined && puerta.pos !== undefined) rotas.push({ sala: salaId, muro: puerta.muro, pos: puerta.pos, texto: f.mensaje });
      }
    }
    return rotas;
  });
  private pedido = 0;

  constructor() {
    let id: string | null = null;
    effect(() => {
      const caso = this.store.caso();
      if (caso && caso.id !== id) { id = caso.id; void this.cargar(); }
    });
  }

  protected async cargar(): Promise<void> {
    const caso = this.store.caso();
    if (!caso) return;
    const pedido = ++this.pedido;
    this.estado.set({ tipo: 'cargando' });
    try {
      // El plano sale de lo guardado: primero se espera a que no quede nada en cola.
      await this.store.sincronizado();
      const crudo = await firstValueFrom(this.api.api.casePlan(Number(caso.id)));
      if (pedido === this.pedido) this.estado.set({ tipo: 'listo', plano: normalizarLayout(crudo) });
    } catch {
      if (pedido === this.pedido) this.estado.set({ tipo: 'error' });
    }
  }

  protected abrir(salaId: string): void {
    void this.router.navigateByUrl(this.rutas.a('/editor/sala', salaId));
  }
}
