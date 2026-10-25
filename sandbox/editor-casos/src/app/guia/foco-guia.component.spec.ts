import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FocoGuiaComponent } from './foco-guia.component';
import { GuiaService } from './guia.service';

describe('FocoGuiaComponent', () => {
  it('en el recorrido, el foco pasa a la burbuja para avanzar con el teclado', async () => {
    await TestBed.configureTestingModule({ imports: [FocoGuiaComponent], providers: [provideRouter([])] }).compileComponents();
    const destino = document.createElement('button');
    destino.setAttribute('data-accion', 'cambiar-expresion');
    destino.textContent = 'Algo';
    document.body.appendChild(destino);
    const fixture = TestBed.createComponent(FocoGuiaComponent);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    await TestBed.inject(GuiaService).mostrar('cambiar-expresion', 'recorrido');
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.textContent?.trim()).toBe('Siguiente');
    destino.remove();
    fixture.nativeElement.remove();
  });
});
