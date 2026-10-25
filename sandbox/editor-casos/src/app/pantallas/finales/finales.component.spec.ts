import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import universidadJson from '../../../../public/assets/biblioteca/universidad/escenario.json';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { FinalesComponent } from './finales.component';

const universidad = universidadJson as unknown as Escenario;

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
    expect(raiz.querySelector('[role="status"].solo-lector')!.textContent!.trim()).toBe('Final borrado. Puedes deshacerlo.');
  });

  it('agregar un final deja el foco en su nombre', async () => {
    const { raiz, listo } = await montar();
    boton(raiz, 'Agregar un final').click();
    await listo();
    expect(document.activeElement?.id).toBe('fn0');
  });
});
