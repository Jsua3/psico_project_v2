import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';

import { CasoStore } from '../../estado/caso.store';
import { CatalogoDePiezas, type CategoriaDePaleta } from '../../estado/catalogo-de-piezas';
import { primerHueco, proyectarAlSuelo } from '../../modelo/arrastre-en-muro';
import type { SalaCaso } from '../../modelo/caso';
import { largoMuro, zonaCaminable, type Muro } from '../../modelo/geometria';
import { anclaDeElemento, type FaltaDeSala } from '../../modelo/salas-a-documento';

@Component({
  selector: 'app-panel-de-estructura',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
    <div role="tablist" aria-label="Piezas de la sala" (keydown)="tecla($event)">
      @for (categoria of catalogo.paleta(); track categoria.clave; let i = $index) {
        <button type="button" role="tab" [attr.aria-selected]="indice() === i" [attr.tabindex]="indice() === i ? 0 : -1"
          (click)="indice.set(i)">{{ categoria.nombre }}</button>
      }
    </div>
    @if (catalogo.paleta()[indice()]; as categoria) {
      <div role="tabpanel">
        @for (modelo of categoria.modelos; track modelo.tipo + modelo.modelo) {
          <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
          <button type="button" [attr.data-modelo]="modelo.modelo" (click)="agregar(modelo)">Agregar {{ modelo.nombre }}</button>
        }
        @if (categoria.clave === 'objetos') { <ng-content /> }
      </div>
    }
    @if (puerta(); as puerta) {
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <label>Destino <select [value]="puerta.hacia ?? ''" (change)="destino(puerta.id, $any($event.target).value)">
        <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
        <option value="">Elige una sala</option>
        @for (destino of store.caso()?.salas ?? []; track destino.id) {
          <option [value]="destino.id">{{ destino.nombre }}</option>
        }
      </select></label>
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <label>Modelo <select [value]="puerta.modelo ?? ''" (change)="modeloPuerta(puerta.id, $any($event.target).value)">
        @for (modelo of modelosPuerta(); track modelo.modelo) { <option [value]="modelo.modelo">{{ modelo.nombre }}</option> }
      </select></label>
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <label><input type="checkbox" [checked]="puerta.sentidoUnico ?? false"
        (change)="sentido(puerta.id, $any($event.target).checked)" /> Una sola dirección</label>
      @if (faltaRegreso(puerta.id)) {
        <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
        <button type="button" (click)="regreso(puerta.id)">Crear la puerta de regreso</button>
      }
    }
    @if (sala().estructura; as estructura) {
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <label>Piso <select [value]="estructura.acabados.piso" (change)="piso($any($event.target).value)">
        @for (p of catalogo.acabados().pisos; track p.piso) { <option [value]="p.piso">{{ p.piso }}</option> }
      </select></label>
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <label>Variante <select [value]="estructura.acabados.variante" (change)="variante($any($event.target).value)">
        @for (v of variantes(); track v) { <option [value]="v">{{ v }}</option> }
      </select></label>
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <label>Acabado de muro <select [value]="estructura.acabados.muro" (change)="muro($any($event.target).value)">
        @for (m of catalogo.acabados().muros; track m.muro) { <option [value]="m.muro">{{ m.muro }}</option> }
      </select></label>
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <label>Paleta <select [value]="estructura.acabados.paleta" (change)="paleta($any($event.target).value)">
        @for (p of paletas(); track p) { <option [value]="p">{{ p }}</option> }
      </select></label>
      <!-- BORRADOR: texto nuevo, pendiente de la aprobación de Psicología -->
      <button type="button" role="switch" [attr.aria-checked]="estructura.momento === 'noche'" (click)="momento()">Día / Noche</button>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 8px; }
    [role=tablist] { display: flex; flex-wrap: wrap; }
    button, select { min-height: 44px; }
    label { display: flex; flex-direction: column; }
  `],
})
export class PanelDeEstructuraComponent {
  readonly sala = input.required<SalaCaso>();
  readonly agregada = output<string>();
  readonly puertaElegida = input<string | null>(null);
  readonly faltas = input<FaltaDeSala[]>([]);
  protected readonly catalogo = inject(CatalogoDePiezas);
  protected readonly store = inject(CasoStore);
  protected readonly indice = signal(0);

  protected puerta() { return this.sala().puertas.find(p => p.id === this.puertaElegida()); }
  protected modelosPuerta() { return this.catalogo.paleta().find(c => c.clave === 'puertas')?.modelos ?? []; }
  protected faltaRegreso(id: string): boolean {
    const p = this.sala().puertas.find(puerta => puerta.id === id);
    return !!p?.hacia && !p.sentidoUnico && this.faltas().some(f => f.regla === 'OCL-15'
      && f.elemento.tipo === 'puerta' && f.elemento.id === id && f.mensaje.toLowerCase().includes('regreso'));
  }
  protected destino(id: string, hacia: string): void { if (hacia) this.store.fijarDestinoDePuerta(this.sala().id, id, hacia); }
  protected modeloPuerta(id: string, modelo: string): void {
    if (this.modelosPuerta().some(m => m.modelo === modelo)) this.store.editarPuerta(this.sala().id, id, { modelo });
  }
  protected sentido(id: string, sentidoUnico: boolean): void { this.store.editarPuerta(this.sala().id, id, { sentidoUnico }); }
  protected regreso(id: string): void {
    this.store.crearPuertaDeRegreso(this.sala().id, id, clave => this.catalogo.manifiesto()?.piezas[clave] ?? null);
  }

  protected tecla(evento: KeyboardEvent): void {
    const paso = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0;
    if (!paso) return;
    evento.preventDefault();
    const botones = [...(evento.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role=tab]')];
    this.indice.set((this.indice() + paso + botones.length) % botones.length);
    botones[this.indice()]?.focus();
  }

  protected agregar(modelo: CategoriaDePaleta['modelos'][number]): void {
    const sala = this.sala(), estructura = sala.estructura;
    const fichas = this.catalogo.manifiesto()?.piezas;
    const ficha = fichas?.[`${modelo.tipo}/${modelo.modelo}`];
    if (!estructura || !ficha) return;
    if (modelo.muros.includes('suelo') && !modelo.muros.some(m => m !== 'suelo')) {
      const zona = zonaCaminable(sala.encuadre, estructura.ancho);
      const centro = proyectarAlSuelo({ x: zona.x + zona.ancho / 2, y: zona.y + zona.alto / 2 }, zona);
      const ocupada = (x: number) => (estructura.piezas ?? []).some(p => p.x === x && p.y === centro.y);
      let punto = centro;
      if (ocupada(centro.x)) {
        const candidatos: number[] = [];
        for (let x = centro.x + 48; x <= zona.x + zona.ancho; x += 48) candidatos.push(x);
        for (let x = centro.x - 48; x >= zona.x; x -= 48) candidatos.push(x);
        const libre = candidatos.find(x => !ocupada(x));
        if (libre !== undefined) punto = { ...centro, x: libre };
      }
      const id = this.store.agregarPiezaDeMuro(sala.id, modelo.tipo, modelo.modelo, punto);
      if (id) this.agregada.emit(anclaDeElemento(sala.id, { tipo: 'pieza', id }));
      return;
    }
    const muros: Muro[] = ['fondo', 'izquierda', 'derecha'];
    let lugar: { muro: Muro; pos: number } | null = null;
    for (const muro of muros) {
      if (!modelo.muros.includes(muro)) continue;
      const largo = largoMuro(muro, sala.encuadre, estructura.ancho);
      if (!largo) continue;
      const ocupadas = [
        ...(estructura.piezas ?? []).filter(p => p.muro === muro && p.pos !== undefined).map(p => {
          const f = fichas?.[`${p.tipo}/${p.modelo}`];
          return { ocupa: f?.ocupa ?? 0, franja: f?.franja ?? [0, 0] as [number, number], pos: p.pos!, esPuerta: false };
        }),
        ...sala.puertas.filter(p => p.muro === muro && p.pos !== undefined).map(p => {
          const f = fichas?.[`puerta/${p.modelo ?? ''}`];
          return { ocupa: f?.ocupa ?? 0, franja: f?.franja ?? [0, 0] as [number, number], pos: p.pos!, esPuerta: true };
        }),
      ];
      const pos = primerHueco(muro, { ...ficha, esPuerta: modelo.tipo === 'puerta' }, ocupadas, largo);
      if (pos !== null) { lugar = { muro, pos }; break; }
    }
    lugar ??= { muro: 'fondo', pos: Math.round(largoMuro('fondo', sala.encuadre, estructura.ancho) / 16) * 8 };
    const puerta = modelo.tipo === 'puerta';
    const id = puerta ? this.store.agregarPuerta(sala.id, modelo.modelo, lugar.muro, lugar.pos)
      : this.store.agregarPiezaDeMuro(sala.id, modelo.tipo, modelo.modelo, lugar);
    if (id) this.agregada.emit(anclaDeElemento(sala.id, { tipo: puerta ? 'puerta' : 'pieza', id }));
  }

  protected variantes(): string[] {
    return this.catalogo.acabados().pisos.find(p => p.piso === this.sala().estructura?.acabados.piso)?.variantes ?? [];
  }
  protected paletas(): string[] {
    return this.catalogo.acabados().muros.find(m => m.muro === this.sala().estructura?.acabados.muro)?.paletas ?? [];
  }
  protected piso(valor: string): void {
    const grupo = this.catalogo.acabados().pisos.find(p => p.piso === valor);
    if (grupo) this.cambiar(e => { e.piso = valor; e.variante = grupo.variantes[0]; });
  }
  protected variante(valor: string): void { if (this.variantes().includes(valor)) this.cambiar(e => { e.variante = valor; }); }
  protected muro(valor: string): void {
    const grupo = this.catalogo.acabados().muros.find(m => m.muro === valor);
    if (grupo) this.cambiar(e => { e.muro = valor; e.paleta = grupo.paletas[0]; });
  }
  protected paleta(valor: string): void { if (this.paletas().includes(valor)) this.cambiar(e => { e.paleta = valor; }); }
  private cambiar(cambio: (acabados: NonNullable<SalaCaso['estructura']>['acabados']) => void): void {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.store.cambiarEstructura(this.sala().id, 'Cambiaste los acabados', e => cambio(e.acabados));
  }
  protected momento(): void {
    // BORRADOR: texto nuevo, pendiente de la aprobación de Psicología
    this.store.cambiarEstructura(this.sala().id, 'Cambiaste el momento del día', e => {
      e.momento = e.momento === 'noche' ? 'dia' : 'noche';
    });
  }
}
