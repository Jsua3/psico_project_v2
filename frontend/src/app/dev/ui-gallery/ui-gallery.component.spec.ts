import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiGalleryComponent } from './ui-gallery.component';

/** Galería de desarrollo (plan visual F0-4 y F2-9, VD-11): cada componente en sus estados y en las dos pieles. */
describe('UiGalleryComponent (/dev/ui)', () => {
  const render = async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiGalleryComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('tiene un único h1', async () => {
    const host = await render();
    const headings = host.querySelectorAll('h1');
    expect(headings.length).toBe(1);
    expect(headings[0].textContent).toContain('Galería de componentes');
  });

  it('repite la matriz en la piel portal y en la piel juego', async () => {
    const host = await render();
    const panels = [...host.querySelectorAll<HTMLElement>('.ui-gallery__skin')];
    expect(panels.map(panel => panel.dataset['skin'])).toEqual(['portal', 'game']);
    expect(host.textContent).not.toContain('Aún no hay componentes');
  });

  it('botones (F2-1): variantes, tamaños, motivo, carga, solo icono y enlaces en cada piel', async () => {
    const host = await render();
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      const buttons = [...panel.querySelectorAll('button[ui-button]')];
      for (const variant of ['primary', 'secondary', 'ghost', 'danger']) {
        expect(buttons.some(button => button.classList.contains(`ui-button--${variant}`))).toBe(true);
      }
      for (const size of ['sm', 'md', 'lg']) {
        expect(buttons.some(button => button.classList.contains(`ui-button--${size}`))).toBe(true);
      }
      expect(panel.querySelector('button[ui-button][aria-disabled="true"][aria-describedby]')).not.toBeNull();
      expect(panel.querySelector('button[ui-button][aria-busy="true"]')).not.toBeNull();
      expect(panel.querySelector('a[ui-button]')).not.toBeNull();
      expect(panel.querySelector('button[ui-icon-button][aria-label]')).not.toBeNull();
      expect(panel.querySelector('a[ui-link][target="_blank"]')).not.toBeNull();
    }
  });

  it('campos (F2-2): ayuda, error, requerido, deshabilitado, área, lista, contraseña, casillas e interruptor', async () => {
    const host = await render();
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      expect(panel.querySelectorAll('ui-field').length).toBeGreaterThanOrEqual(6);
      expect(panel.querySelector('.ui-control[aria-invalid="true"]')).not.toBeNull();
      expect(panel.querySelector('.ui-control[aria-required="true"]')).not.toBeNull();
      expect(panel.querySelector('.ui-control:disabled')).not.toBeNull();
      expect(panel.querySelector('textarea.ui-control')).not.toBeNull();
      expect(panel.querySelector('select.ui-control')).not.toBeNull();
      expect(panel.querySelector('.ui-field__reveal[aria-pressed]')).not.toBeNull();
      expect(panel.querySelector('label[ui-check] input[type="radio"]')).not.toBeNull();
      expect(panel.querySelector('input[role="switch"]')).not.toBeNull();
    }
  });

  it('contenido (F2-3): la cabecera lleva el único h1; tarjetas, cifras e insignias de cada tono', async () => {
    const host = await render();
    expect(host.querySelector('ui-page-header h1')?.textContent).toContain('Galería de componentes');
    const panels = host.querySelectorAll('.ui-gallery__skin');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      expect(panel.querySelector('ui-card:not(.ui-card--interactive)')).not.toBeNull();
      expect(panel.querySelector('a.ui-card--interactive')).not.toBeNull();
      expect(panel.querySelector('button.ui-card--interactive')).not.toBeNull();
      expect(panel.querySelectorAll('ui-stat').length).toBeGreaterThanOrEqual(2);
      for (const tone of ['neutral', 'info', 'success', 'warning', 'danger']) {
        expect(panel.querySelector(`ui-badge.ui-badge--${tone}`)).not.toBeNull();
      }
      expect(panel.querySelectorAll('ui-section').length).toBeGreaterThanOrEqual(3);
    }
  });
});
