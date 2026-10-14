import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiDataStateValue } from '../state/ui-data-state';
import { UiErrorState } from '../state/ui-error-state';
import { UiTable, UiTableEmpty, UiTableError, UiTableRow, UiTableTable } from './ui-table';

/**
 * ui-table (plan visual F2-8): marco de tabla nativa con densidad, cabecera pegajosa, fila con hover (puntero fino)
 * y selección (aria-selected), carga, vacío y error DENTRO del marco (uno solo a la vez, uiDataState) e indicio de
 * desplazamiento horizontal solo cuando hay desborde (y entonces la región se puede enfocar para desplazarla con
 * el teclado, WCAG 2.1.1).
 */
// req: RNF-004 (tablas con nombre, desplazables con teclado)
@Component({
  imports: [UiTable, UiTableTable, UiTableRow, UiTableEmpty, UiTableError],
  template: `
    <ui-table label="Intentos del grupo" [density]="density()" [state]="state()">
      <table ui-table>
        <thead><tr><th scope="col">Estudiante</th><th scope="col">Estado</th></tr></thead>
        <tbody>
          <tr uiRow [selected]="selected() === 1"><td>Ana</td><td>Completado</td></tr>
          <tr uiRow [selected]="selected() === 2"><td>Luis</td><td>En curso</td></tr>
        </tbody>
      </table>
      <p uiTableEmpty>Aún no hay intentos.</p>
      <p uiTableError>No se pudieron cargar los intentos.</p>
    </ui-table>
  `,
})
class Host {
  density = signal<'comfortable' | 'compact'>('comfortable');
  state = signal<UiDataStateValue>('ready');
  selected = signal<number | null>(null);
}

describe('ui-table', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const root = () => (fixture.nativeElement as HTMLElement).querySelector('ui-table') as HTMLElement;
  const region = () => root().querySelector<HTMLElement>('.ui-table__scroll')!;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('la región desplazable se nombra con el label y la tabla queda dentro', () => {
    expect(region().getAttribute('role')).toBe('region');
    expect(region().getAttribute('aria-label')).toBe('Intentos del grupo');
    expect(region().querySelector('table.ui-table__table')).not.toBeNull();
  });

  it('la densidad es una clase del marco', async () => {
    expect(root().classList).toContain('ui-table--comfortable');
    host.density.set('compact');
    await fixture.whenStable();
    expect(root().classList).toContain('ui-table--compact');
  });

  it('la fila seleccionada lleva aria-selected', async () => {
    host.selected.set(2);
    await fixture.whenStable();
    const rows = [...root().querySelectorAll<HTMLElement>('tr[uiRow]')];
    expect(rows.map(row => row.getAttribute('aria-selected'))).toEqual([null, 'true']);
    expect(rows[1].classList).toContain('ui-table__row--selected');
  });

  it('carga, vacío y error se muestran dentro del marco y de a uno; la tabla se oculta mientras', async () => {
    const visible = () => ({
      table: !region().querySelector('table')!.closest('[hidden]'),
      skeleton: !!root().querySelector('ui-skeleton'),
      empty: !root().querySelector('[uiTableEmpty]')!.closest('[hidden]'),
      error: !root().querySelector('[uiTableError]')!.closest('[hidden]'),
    });
    expect(visible()).toEqual({ table: true, skeleton: false, empty: false, error: false });

    host.state.set('pending');
    await fixture.whenStable();
    expect(visible()).toEqual({ table: true, skeleton: false, empty: false, error: false });
    expect(region().getAttribute('aria-busy')).toBe('true');

    host.state.set('loading');
    await fixture.whenStable();
    expect(visible()).toEqual({ table: false, skeleton: true, empty: false, error: false });
    expect(region().getAttribute('aria-busy')).toBe('true');

    host.state.set('empty');
    await fixture.whenStable();
    expect(visible()).toEqual({ table: false, skeleton: false, empty: true, error: false });
    expect(region().hasAttribute('aria-busy')).toBe(false);

    host.state.set('error');
    await fixture.whenStable();
    expect(visible()).toEqual({ table: false, skeleton: false, empty: false, error: true });
  });

  it('sin desborde no hay indicio ni parada de tabulación; con desborde, sí, y sigue al desplazamiento', async () => {
    const scroller = region();
    expect(scroller.hasAttribute('tabindex')).toBe(false);
    expect(root().classList).not.toContain('ui-table--overflow-end');

    Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 1000 });
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 400 });
    scroller.scrollLeft = 0;
    scroller.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    expect(scroller.getAttribute('tabindex')).toBe('0');
    expect(root().classList).toContain('ui-table--overflow-end');
    expect(root().classList).not.toContain('ui-table--overflow-start');

    scroller.scrollLeft = 600;
    scroller.dispatchEvent(new Event('scroll'));
    await fixture.whenStable();
    expect(root().classList).toContain('ui-table--overflow-start');
    expect(root().classList).not.toContain('ui-table--overflow-end');
  });
});

// Revisión de F2 (I2): en la tabla el error no se desmonta (se oculta); tras un reintento fallido el foco va a su título.
@Component({
  imports: [UiTable, UiTableTable, UiTableError, UiErrorState],
  template: `
    <ui-table label="Intentos" [state]="state()">
      <table ui-table><tbody><tr><td>Ana</td></tr></tbody></table>
      <ui-error-state uiTableError kind="network" (retry)="state.set('loading')" />
    </ui-table>
  `,
})
class RetryHost {
  state = signal<UiDataStateValue>('error');
}

describe('ui-table: foco tras un reintento fallido', () => {
  it('vuelve al título del error cuando el reintento falla', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(RetryHost);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const retry = root.querySelector<HTMLButtonElement>('ui-error-state button')!;
    retry.focus();
    retry.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.state()).toBe('loading');
    fixture.componentInstance.state.set('error');
    await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelector('.ui-error-state__title'));
    root.remove();
  });
});
