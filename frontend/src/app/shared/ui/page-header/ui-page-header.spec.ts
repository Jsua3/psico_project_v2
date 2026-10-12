import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UiPageActions, UiPageHeader } from './ui-page-header';

/**
 * ui-page-header (plan visual F2-3 y contrato F3 → F4…F8): la cabecera de cada pantalla y su ÚNICO h1. El antetítulo
 * y la descripción son párrafos (no títulos); las acciones van al final, en el orden en que se declaran.
 */
// req: RNF-004 (un único h1 por pantalla, §2.9)
@Component({
  imports: [UiPageHeader, UiPageActions],
  template: `
    <ui-page-header eyebrow="Docencia" title="Grupos" description="Crea grupos y comparte su código con tus estudiantes.">
      <button uiPageActions type="button">Nuevo grupo</button>
    </ui-page-header>
  `,
})
class Host {}

describe('ui-page-header', () => {
  it('pinta un único h1 con el título y deja antetítulo y descripción como párrafos', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const header = (fixture.nativeElement as HTMLElement).querySelector('ui-page-header')!;
    const headings = header.querySelectorAll('h1, h2, h3, h4, h5, h6');
    expect(headings.length).toBe(1);
    expect(headings[0].tagName).toBe('H1');
    expect(headings[0].textContent?.trim()).toBe('Grupos');
    expect(header.querySelector('p.ui-page-header__eyebrow')?.textContent?.trim()).toBe('Docencia');
    expect(header.querySelector('p.ui-page-header__description')?.textContent?.trim()).toBe('Crea grupos y comparte su código con tus estudiantes.');
    expect(header.querySelector('.ui-page-header__actions button')?.textContent?.trim()).toBe('Nuevo grupo');
    expect(header.hasAttribute('title')).toBe(false);
  });

  it('sin antetítulo ni descripción no deja párrafos vacíos', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(UiPageHeader);
    fixture.componentRef.setInput('title', 'Reportes');
    await fixture.whenStable();
    const header = fixture.nativeElement as HTMLElement;
    expect(header.querySelectorAll('p').length).toBe(0);
    expect(header.querySelector('h1')?.textContent?.trim()).toBe('Reportes');
  });
});
