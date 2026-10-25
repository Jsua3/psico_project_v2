import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import universidadJson from '../../../public/assets/biblioteca/universidad/escenario.json';
import { CasoStore } from '../estado/caso.store';
import { BibliotecaService } from '../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import type { Escenario } from '../modelo/escenario';
import { PanelIaComponent } from './panel-ia.component';

const universidad = universidadJson as unknown as Escenario;

async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [PanelIaComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['consultorio'], 'Caso'));
  const fixture = TestBed.createComponent(PanelIaComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  const raiz = fixture.nativeElement as HTMLElement;
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  return { fixture, store, raiz, listo };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;

async function pedir(raiz: HTMLElement, listo: () => Promise<void>, texto: string) {
  const campo = raiz.querySelector<HTMLTextAreaElement>('textarea')!;
  campo.value = texto;
  campo.dispatchEvent(new Event('input'));
  raiz.querySelector('form')!.dispatchEvent(new Event('submit'));
  await listo();
  await new Promise((r) => setTimeout(r, 0));
  await listo();
}

describe('PanelIaComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sin conexión lo dice, responde con un ejemplo y la propuesta llega por partes con casillas', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { raiz, listo } = await montar();
    expect(raiz.textContent).toContain('La IA propone; tú decides. Todo lo generado queda marcado hasta que lo revises.');
    await pedir(raiz, listo, 'Escribe cómo saluda la psicóloga');
    expect(raiz.textContent).toContain('Modo sin conexión: respuestas de ejemplo');
    expect(raiz.querySelector('[role="log"]')!.textContent).toContain('Escribe cómo saluda la psicóloga');
    expect(raiz.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(1);
  });

  it('«Aplicar lo marcado» aplica solo las partes marcadas, con la marca de IA', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { store, raiz, listo } = await montar();
    await pedir(raiz, listo, 'Propón respuestas');
    const casillas = [...raiz.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    casillas[0].click(); // desmarca la primera parte (la línea)
    await listo();
    boton(raiz, 'Aplicar lo marcado').click();
    await listo();
    const escena = store.caso()!.escenas[0];
    expect(escena.lineas).toHaveLength(0);
    expect(escena.respuestas).toHaveLength(2);
    expect(escena.respuestas.every((r) => r.marcaIa)).toBe(true);
    expect(raiz.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  });

  it('«Descartar» no cambia el caso', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { store, raiz, listo } = await montar();
    const antes = store.caso();
    await pedir(raiz, listo, 'Propón algo');
    boton(raiz, 'Descartar').click();
    await listo();
    expect(store.caso()).toBe(antes);
  });
});
