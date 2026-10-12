import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UiGlassBar } from './ui-glass-bar';

/**
 * ui-glass-bar (plan visual F3): el `<header>` de la barra de vidrio modular. Cablea los eventos del navegador a la
 * máquina y pinta `data-estado` y `data-modalidad`; los módulos los proyecta el consumidor como hijos directos de
 * la píldora (invariante 1 de la skill). Criterios E1, E3 y S1/S3 de medicion.md, en DOM.
 */
@Component({
  imports: [UiGlassBar],
  template: `
    @if (shown()) {
      <header ui-glass-bar label="Navegación principal">
        <a class="modulo modulo-logo" href="/inicio">SIEP</a>
        <div class="modulo modulo-principal">
          <a class="nav-enlace" href="/a">A</a>
          <a class="nav-enlace control-plegable" href="/b">B</a>
        </div>
        <div class="modulo modulo-cuenta"><span>Cuenta</span></div>
        <nav class="pestanas" aria-label="Pestañas">fijo</nav>
      </header>
    }
  `,
})
class Host {
  shown = signal(true);
}

function pointer(type: string, pointerType: string): Event {
  const event = new MouseEvent(type, { bubbles: type === 'pointerdown', cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}

function scrollTo(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
}

// req: BLOQUE-H (barra de navegación del plan visual F3)
describe('ui-glass-bar', () => {
  let fixture: ComponentFixture<Host>;
  const header = () => fixture.nativeElement.querySelector('header') as HTMLElement | null;

  beforeEach(async () => {
    scrollTo(0);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  afterEach(() => scrollTo(0));

  it('el anfitrión es header.cromo y sirve data-estado="inicial" y data-vidrio="pseudo"', () => {
    expect(header()!.classList).toContain('cromo');
    expect(header()!.dataset['estado']).toBe('inicial');
    expect(header()!.dataset['vidrio']).toBe('pseudo');
  });

  it('los tres módulos son hijos DIRECTOS de nav.bandeja y lo fijo es hijo directo del header (E1, E7)', () => {
    const bandeja = header()!.querySelector(':scope > nav.bandeja') as HTMLElement;
    expect(bandeja.getAttribute('aria-label')).toBe('Navegación principal');
    expect([...bandeja.querySelectorAll(':scope > .modulo')].map(el => el.classList[1])).toEqual(['modulo-logo', 'modulo-principal', 'modulo-cuenta']);
    expect(header()!.querySelector(':scope > nav.pestanas')).not.toBeNull();
  });

  it('al desplazarse más de 8 px pasa a «scroll» y vuelve a «inicial» arriba (S1)', async () => {
    scrollTo(400);
    await fixture.whenStable();
    expect(header()!.dataset['estado']).toBe('scroll');
    scrollTo(0);
    await fixture.whenStable();
    expect(header()!.dataset['estado']).toBe('inicial');
  });

  it('el ratón en la franja abre la atención; un pointerenter táctil no (S3, S11)', async () => {
    scrollTo(400);
    header()!.dispatchEvent(pointer('pointerenter', 'touch'));
    await fixture.whenStable();
    expect(header()!.dataset['estado']).toBe('scroll');
    header()!.dispatchEvent(pointer('pointerenter', 'mouse'));
    await fixture.whenStable();
    expect(header()!.dataset['estado']).toBe('atencion');
  });

  it('marca la modalidad: Tab → «teclado», pointerdown → «puntero»', async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    await fixture.whenStable();
    expect(header()!.dataset['modalidad']).toBe('teclado');
    document.body.dispatchEvent(pointer('pointerdown', 'mouse'));
    await fixture.whenStable();
    expect(header()!.dataset['modalidad']).toBe('puntero');
  });

  it('ningún nodo entra ni sale al cambiar de estado (E3)', async () => {
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver(records => changes.push(...records));
    observer.observe(header()!, { childList: true, subtree: true });
    scrollTo(400);
    header()!.dispatchEvent(pointer('pointerenter', 'mouse'));
    await fixture.whenStable();
    scrollTo(0);
    await fixture.whenStable();
    observer.disconnect();
    expect(changes.filter(record => record.type === 'childList')).toHaveLength(0);
  });

  it('cada plegable recibe su ancho natural como techo (--asb-ancho-natural): crecen en proporción, sin balanceo', async () => {
    const fold = header()!.querySelector('a.control-plegable') as HTMLElement;
    Object.defineProperty(fold, 'scrollWidth', { value: 90, configurable: true });
    fixture.componentInstance.shown.update(value => value); // nada cambia en la plantilla…
    scrollTo(400); // …pero el cambio de estado vuelve a pintar y a medir
    await fixture.whenStable();
    expect(fold.style.getPropertyValue('--asb-ancho-natural')).toBe('calc(90px + 1.5rem)');
  });

  it('un plegable sin caja (oculto en móvil, scrollWidth 0) conserva su techo anterior', async () => {
    const fold = header()!.querySelector('a.control-plegable') as HTMLElement;
    Object.defineProperty(fold, 'scrollWidth', { value: 90, configurable: true });
    scrollTo(400);
    await fixture.whenStable();
    Object.defineProperty(fold, 'scrollWidth', { value: 0, configurable: true });
    scrollTo(0);
    await fixture.whenStable();
    expect(fold.style.getPropertyValue('--asb-ancho-natural')).toBe('calc(90px + 1.5rem)');
  });

  it('el header y la píldora llevan .ds-motion (su reloj no colapsa con movimiento reducido; invariante 12)', () => {
    expect(header()!.classList).toContain('ds-motion');
    expect(header()!.querySelector('nav.bandeja')!.classList).toContain('ds-motion');
  });

  it('al destruirse suelta sus oyentes de window y document', async () => {
    const removedFromWindow = vi.spyOn(window, 'removeEventListener');
    const removedFromDocument = vi.spyOn(document, 'removeEventListener');
    fixture.componentInstance.shown.set(false);
    await fixture.whenStable();
    expect(removedFromWindow.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['scroll', 'keydown']));
    expect(removedFromDocument.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['pointerdown', 'keydown', 'click']));
    removedFromWindow.mockRestore();
    removedFromDocument.mockRestore();
  });
});
