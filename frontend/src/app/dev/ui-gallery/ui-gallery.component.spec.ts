import { TestBed } from '@angular/core/testing';

import { UiGalleryComponent } from './ui-gallery.component';

/** Galería de desarrollo (plan visual F0-4, VD-11): solo en desarrollo; los componentes llegan en F2. */
describe('UiGalleryComponent (/dev/ui)', () => {
  it('tiene un único h1 y explica que aún no hay componentes', async () => {
    const fixture = TestBed.createComponent(UiGalleryComponent);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const headings = host.querySelectorAll('h1');
    expect(headings.length).toBe(1);
    expect(headings[0].textContent).toContain('Galería de componentes');
    expect(host.textContent).toContain('Aún no hay componentes');
  });
});
