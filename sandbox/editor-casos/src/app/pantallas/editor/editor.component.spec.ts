import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import universidadJson from '../../../../public/assets/biblioteca/universidad/escenario.json';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { EditorComponent } from './editor.component';

const universidad = universidadJson as unknown as Escenario;

async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [EditorComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['pasillo', 'sala-espera', 'consultorio'], 'Caso'));
  const fixture = TestBed.createComponent(EditorComponent);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
  };
  return { fixture, store, raiz: fixture.nativeElement as HTMLElement, listo };
}

const tarjeta = (raiz: HTMLElement, i: number) => raiz.querySelectorAll<HTMLButtonElement>('button.escena')[i];
const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;
const item = (texto: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) => m.textContent!.replace(/s+/g, ' ').trim().startsWith(texto))!;

describe('EditorComponent · diálogos', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((o) => (o.innerHTML = ''));
    document.querySelectorAll('app-root, [ng-version]').forEach((n) => n.remove());
  });

  it('«Conectar con…» lleva el foco al diálogo y «No conectar» lo devuelve a la escena', async () => {
    const { raiz, listo } = await montar();
    tarjeta(raiz, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await listo();
    item('Conectar con').click();
    await listo();
    expect(document.activeElement?.id).toBe('cct');
    boton(raiz, 'No conectar').click();
    await listo();
    expect(document.activeElement).toBe(tarjeta(raiz, 0));
  });

  it('Supr lleva el foco a la pregunta de borrar y, al borrar, el foco queda en una escena', async () => {
    const { raiz, listo } = await montar();
    tarjeta(raiz, 1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await listo();
    expect(document.activeElement?.id).toBe('bt');
    boton(raiz, 'Borrar la escena').click();
    await listo();
    expect(document.activeElement?.classList.contains('escena')).toBe(true);
  });

  it('en «Conectar con…» la barra espaciadora elige una opción', async () => {
    const { raiz, listo } = await montar();
    tarjeta(raiz, 0).dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
    await listo();
    item('Conectar con').click();
    await listo();
    const opcion = raiz.querySelector<HTMLElement>('[role="option"]')!;
    opcion.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await listo();
    expect(opcion.getAttribute('aria-selected')).toBe('true');
  });
});
