import { Component, Input, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { SiepParticleLayerComponent } from '../../shared/ui/siep-particle-layer.component';
import { LandingComponent } from './landing.component';

/** La capa de partículas pinta en un canvas con observadores que jsdom no tiene: aquí basta su sitio. */
@Component({ selector: 'app-siep-particle-layer', template: '' })
class ParticlesStub {
  @Input() density = 'medium';
  @Input() interactive = false;
  @Input() mode = 'background';
}

/**
 * Portada (plan visual F4-1), en DOM: una identidad con dos pieles (VD-2: el héroe presenta el simulador en la piel
 * juego; el resto, piel portal), una maqueta que no finge ser interactiva, tarjetas honestas sobre qué casos existen
 * (T15.4) y sin estilos en línea. Sustituye a landing.a11y.spec y landing.honesty.spec, que leían la plantilla.
 */
// req: BLOQUE-H (portada), RNF-04
describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: UiDialog, useValue: { sheet: vi.fn() } }],
    });
    TestBed.overrideComponent(LandingComponent, { remove: { imports: [SiepParticleLayerComponent] }, add: { imports: [ParticlesStub] } });
    fixture = TestBed.createComponent(LandingComponent);
    await fixture.whenStable();
  });

  it('la cabecera es la barra pública compartida, con las anclas de esta página', () => {
    expect(host().querySelector('app-public-bar header.cromo')).not.toBeNull();
    expect(host().querySelectorAll('header.cromo .modulo-principal a.nav-enlace').length).toBeGreaterThan(0);
  });

  it('el héroe presenta el simulador en la piel juego; nada más de la página la lleva (VD-2)', () => {
    const skinned = [...host().querySelectorAll('[data-skin]')];
    expect(skinned).toHaveLength(1);
    expect(skinned[0].matches('section.landing-hero')).toBe(true);
    expect(skinned[0].getAttribute('data-skin')).toBe('game');
  });

  it('la maqueta es una vista previa honesta: sin botones ni «disabled» falsos, y las decisiones son una lista de ejemplo', () => {
    const preview = host().querySelector('aside.landing-preview')!;
    expect(preview.getAttribute('aria-label')).toBe('Vista previa del simulador');
    expect(text(preview)).toContain('Vista previa');
    expect(preview.querySelectorAll('button, [disabled], a')).toHaveLength(0);
    const decisions = preview.querySelector('ul.landing-preview__decisions')!;
    expect(text(host().querySelector(`#${decisions.getAttribute('aria-labelledby')}`))).toBe('Ejemplo de decisiones');
    expect([...decisions.querySelectorAll('li > span')].map(text)).toEqual([
      'Activar ruta institucional', 'Solicitar más contexto', 'Registrar observación ética',
    ]);
    expect(decisions.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('solo «Violencia basada en género» está disponible; las demás dicen «Próximamente» y ninguna tarjeta finge ser pulsable (T15.4)', () => {
    const cards = [...host().querySelectorAll('#casos article.landing-case-card')];
    expect(cards.map(card => text(card.querySelector('h3')))).toEqual(['Violencia basada en género', 'Desplazamiento forzado', 'Conflicto comunitario']);
    expect(cards.map(card => text(card.querySelector('ui-badge')))).toEqual(['Disponible · caso sensible', 'Próximamente', 'Próximamente']);
    expect(cards.map(card => card.classList.contains('landing-case-card--soon'))).toEqual([false, true, true]);
    for (const card of cards) expect(card.querySelectorAll('a, button')).toHaveLength(0);
    expect(host().textContent).not.toMatch(/intrafamiliar/i);
  });

  it('«Ingresa para ver los casos» lleva al acceso, no a su propia sección', () => {
    const link = host().querySelector<HTMLAnchorElement>('#casos .landing-link')!;
    expect(link.getAttribute('href')).toBe('/login');
  });

  it('sin estilos en línea (los acentos por tarjeta eran [style.*]) y sin texto con degradado', () => {
    expect(host().querySelectorAll('[style]')).toHaveLength(0);
    expect(host().querySelectorAll('.landing-accent--dark')).toHaveLength(0);
  });

  it('el pie es contentinfo: va fuera del <main> (H-34)', () => {
    const footer = host().querySelector('footer')!;
    expect(footer.closest('main')).toBeNull();
    expect(host().querySelector('main#main-content')).not.toBeNull();
  });
});
