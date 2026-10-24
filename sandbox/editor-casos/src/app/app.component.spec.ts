import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { CasoStore } from './estado/caso.store';
import type { CasoBorrador } from './modelo/caso';

const caso: CasoBorrador = {
  id: 'caso-1', titulo: 'Primera escucha en Bienestar', lugarId: 'universidad', salas: [], escenas: [],
  inicioId: null, modoFinales: 'automatico', finales: [], personajes: [],
  catalogo: { muebles: [], objetos: [], herramientas: [] },
};

function boton(raiz: HTMLElement, texto: string): HTMLButtonElement | undefined {
  return [...raiz.querySelectorAll('button')].find((b) => b.textContent?.includes(texto)) as HTMLButtonElement | undefined;
}

describe('AppComponent (marco)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [AppComponent], providers: [provideRouter(routes)] }).compileComponents();
  });

  it('muestra el nombre del caso en la cabecera', async () => {
    TestBed.inject(CasoStore).fijar(caso);
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('header').textContent).toContain('Primera escucha en Bienestar');
  });

  it('«Reiniciar el sandbox» pide confirmación en la página antes de borrar', async () => {
    const store = TestBed.inject(CasoStore);
    store.fijar(caso);
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const raiz = fixture.nativeElement as HTMLElement;

    boton(raiz, 'Reiniciar el sandbox')!.click();
    await fixture.whenStable();
    expect(store.caso()).not.toBeNull();
    expect(raiz.querySelector('[role="alertdialog"]')).not.toBeNull();

    boton(raiz, 'Sí, borrar todo')!.click();
    await fixture.whenStable();
    expect(store.caso()).toBeNull();
    expect(raiz.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('cancelar el reinicio no borra nada', async () => {
    const store = TestBed.inject(CasoStore);
    store.fijar(caso);
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const raiz = fixture.nativeElement as HTMLElement;
    boton(raiz, 'Reiniciar el sandbox')!.click();
    await fixture.whenStable();
    boton(raiz, 'Cancelar')!.click();
    await fixture.whenStable();
    expect(store.caso()).not.toBeNull();
  });
});
