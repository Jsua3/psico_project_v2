import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { UiDialog } from '../ui/dialog/ui-dialog';
import { BottomTab, BottomTabsComponent, MoreSheetComponent } from './bottom-tabs.component';

@Component({ template: '' })
class Screen {}

@Component({
  imports: [BottomTabsComponent],
  template: `<nav app-bottom-tabs [tabs]="tabs()" [more]="more()"></nav>`,
})
class Host {
  tabs = signal<BottomTab[]>([
    { id: 'panel', label: 'Panel', icon: 'dashboard', route: '/portal/dashboard' },
    { id: 'simulador', label: 'Simulador', icon: 'play_circle', route: '/portal/simulador' },
  ]);
  more = signal<BottomTab[]>([]);
}

/**
 * Pestañas inferiores del móvil (plan visual F3-5; references/movil.md §3.3 de la skill): como mucho cinco; si el
 * rol tiene destinos secundarios, la última es «Más» y abre una hoja con ellos (diálogo con trampa y retorno del
 * foco). Objetivos ≥ 44 px y el activo con aria-current.
 */
// req: BLOQUE-H (navegación móvil del plan visual F3-5)
describe('app-bottom-tabs', () => {
  let fixture: ComponentFixture<Host>;
  const sheet = vi.fn();
  const nav = () => fixture.nativeElement.querySelector('nav') as HTMLElement;
  const tabs = () => [...nav().querySelectorAll<HTMLElement>('.pestana')];
  const label = (tab: HTMLElement) => tab.querySelector('.pestana__rotulo')!.textContent!.trim();
  const icon = (tab: HTMLElement) => tab.querySelector('mat-icon')!.textContent!.trim();

  beforeEach(async () => {
    sheet.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Screen }]),
        { provide: UiDialog, useValue: { sheet } },
      ],
    });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('es la navegación principal nombrada y lleva la clase de la barra inferior', () => {
    expect(nav().getAttribute('aria-label')).toBe('Navegación principal');
    expect(nav().classList).toContain('modulo-inferior');
  });

  it('pinta un enlace por destino, con icono decorativo y rótulo; sin secundarios no hay «Más»', () => {
    expect(tabs().map(label)).toEqual(['Panel', 'Simulador']);
    expect(tabs().map(icon)).toEqual(['dashboard', 'play_circle']);
    for (const tab of tabs()) expect(tab.querySelector('mat-icon')!.getAttribute('aria-hidden')).toBe('true');
    expect(nav().querySelector('button.pestana')).toBeNull();
  });

  it('el destino activo lleva aria-current="page"', async () => {
    await TestBed.inject(Router).navigateByUrl('/portal/simulador');
    await fixture.whenStable();
    expect(tabs().filter(tab => tab.getAttribute('aria-current') === 'page').map(label)).toEqual(['Simulador']);
  });

  it('con secundarios, la última pestaña es «Más» y abre una hoja inferior con ellos', async () => {
    fixture.componentInstance.more.set([{ id: 'rubricas', label: 'Rúbricas', icon: 'grading', route: '/portal/rubricas' }]);
    await fixture.whenStable();
    const more = nav().querySelector<HTMLButtonElement>('button.pestana')!;
    expect(label(more)).toBe('Más');
    expect(icon(more)).toBe('menu');
    expect(more.getAttribute('aria-haspopup')).toBe('dialog');
    more.click();
    expect(sheet).toHaveBeenCalledWith(MoreSheetComponent, expect.objectContaining({
      side: 'bottom', data: [{ id: 'rubricas', label: 'Rúbricas', icon: 'grading', route: '/portal/rubricas' }],
    }));
  });

  it('nunca pasa de cinco pestañas: si hay más destinos que caben, los últimos van a «Más»', async () => {
    fixture.componentInstance.tabs.set(['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id, label: id.toUpperCase(), icon: 'dashboard', route: `/${id}` })));
    await fixture.whenStable();
    expect(tabs()).toHaveLength(5);
    expect(label(tabs()[4])).toBe('Más');
    tabs()[4].click();
    expect(sheet.mock.calls[0][1].data.map((tab: BottomTab) => tab.id)).toEqual(['e', 'f']);
  });
});
