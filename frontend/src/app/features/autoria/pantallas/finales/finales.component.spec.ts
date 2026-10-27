import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { universidad } from '../../testing/universidad';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { FinalesComponent } from './finales.component';


async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [FinalesComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso'));
  store.fijarModoFinales('propio');
  const fixture = TestBed.createComponent(FinalesComponent);
  document.body.appendChild(fixture.nativeElement);
  const listo = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
  };
  await listo();
  return { fixture, store, raiz: fixture.nativeElement as HTMLElement, listo };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;

describe('FinalesComponent', () => {
  afterEach(() => document.querySelectorAll('body > app-finales, body > [ng-version]').forEach((n) => n.remove()));

  it('borrar el único final lo anuncia y deja el foco en «Agregar un final»', async () => {
    const { raiz, listo } = await montar();
    boton(raiz, 'Agregar un final').click();
    await listo();
    raiz.querySelector<HTMLButtonElement>('[aria-label^="Borrar el final"]')!.click();
    await listo();
    expect(document.activeElement?.textContent?.trim()).toBe('Agregar un final');
    expect(raiz.querySelector('[role="status"].solo-lector')!.textContent!.trim()).toBe('Final borrado.');
  });

  it('agregar un final deja el foco en su nombre', async () => {
    const { raiz, listo } = await montar();
    boton(raiz, 'Agregar un final').click();
    await listo();
    expect(document.activeElement?.id).toBe('fn0');
  });

  it('un final nuevo llega cuando se cumple el primer hito decisivo del caso', async () => {
    const { store, raiz, listo } = await montar();
    boton(raiz, 'Agregar un final').click();
    await listo();
    const decisivo = store.caso()!.hitos.find((h) => h.decisivo)!;
    expect(store.caso()!.finales[0].condicion).toEqual({ milestone: decisivo.clave });
    expect(raiz.querySelector<HTMLSelectElement>('select[aria-label="Hito"]')!.value).toBe(decisivo.clave);
  });

  it('cambiar el tipo de condición arma la condición de ese tipo', async () => {
    const { store, raiz, listo } = await montar();
    boton(raiz, 'Agregar un final').click();
    await listo();
    const tipo = raiz.querySelector<HTMLSelectElement>('select[aria-label="Tipo de condición"]')!;
    tipo.value = 'contraindicadas';
    tipo.dispatchEvent(new Event('change'));
    await listo();
    expect(store.caso()!.finales[0].condicion).toEqual({ count: 'contraindicated', gte: 1 });
    const cuantas = raiz.querySelector<HTMLSelectElement>('select[aria-label="Cuántas"]')!;
    cuantas.value = '3';
    cuantas.dispatchEvent(new Event('change'));
    await listo();
    expect(store.caso()!.finales[0].condicion).toEqual({ count: 'contraindicated', gte: 3 });
    tipo.value = 'ninguna';
    tipo.dispatchEvent(new Event('change'));
    await listo();
    expect(store.caso()!.finales[0].condicion).toBeNull();
  });

  it('una condición combinada (de la IA o del servidor) se muestra en palabras y se conserva', async () => {
    const { store, raiz, listo } = await montar();
    const hito = store.caso()!.hitos[0];
    store.agregarFinal();
    store.editarFinal(store.caso()!.finales[0].id, { condicion: { all: [{ milestone: hito.clave }, { count: 'contraindicated', eq: 0 }] } });
    await listo();
    expect(raiz.querySelector('.condicion')!.textContent).toContain(`cumple «${hito.nombre}» y no elige ninguna respuesta contraindicada`);
    expect(store.caso()!.finales[0].condicion).toEqual({ all: [{ milestone: hito.clave }, { count: 'contraindicated', eq: 0 }] });
  });

  it('en modo automático explica en palabras los cuatro finales del modelo', async () => {
    const { store, raiz, listo } = await montar();
    store.fijarModoFinales('automatico');
    await listo();
    expect([...raiz.querySelectorAll('li.tarjeta strong')].map((n) => n.textContent)).toEqual([
      'Intervención con riesgo de revictimización', 'Intervención protectora', 'El riesgo sigue abierto', 'Intervención con brechas',
    ]);
  });
});
