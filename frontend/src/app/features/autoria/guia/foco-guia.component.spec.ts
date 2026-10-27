import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FocoGuiaComponent } from './foco-guia.component';
import { GuiaService } from './guia.service';

describe('FocoGuiaComponent', () => {
  it('en el recorrido el anillo y el foco siguen al elemento de cada paso, y Alt+flechas avanzan sin ratón', async () => {
    await TestBed.configureTestingModule({ imports: [FocoGuiaComponent], providers: [provideRouter([{ path: '**', children: [] }])] }).compileComponents();
    const main = document.createElement('main');
    main.innerHTML = `
      <ul id="lista" data-accion="cambiar-expresion" tabindex="0"></ul>
      <section class="columna-detalles"><button id="uno">Uno</button></section>
      <div class="escenario"><button id="retrato" data-elemento="personaje-0">Cara</button></div>`;
    document.body.appendChild(main);
    const fixture = TestBed.createComponent(FocoGuiaComponent);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const guia = TestBed.inject(GuiaService);
    const listo = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 0));
    };

    await guia.mostrar('cambiar-expresion', 'recorrido');
    await listo();
    expect(guia.elemento()!.id).toBe('lista');
    expect(document.activeElement!.id).toBe('lista');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(guia.activa()!.paso).toBe(1);
    expect(guia.elemento()!.className).toContain('columna-detalles');
    expect(document.activeElement).toBe(guia.elemento());

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(guia.elemento()!.id).toBe('retrato');
    expect(document.activeElement!.id).toBe('retrato');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
    await listo();
    expect(guia.activa()!.paso).toBe(1);
    expect(guia.elemento()!.className).toContain('columna-detalles');
    expect(fixture.nativeElement.textContent).toContain('Alt');

    guia.cerrar();
    main.remove();
    fixture.nativeElement.remove();
  });
});
