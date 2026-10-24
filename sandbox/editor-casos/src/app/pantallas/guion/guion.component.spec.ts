import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import universidadJson from '../../../../public/assets/biblioteca/universidad/escenario.json';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { GuionComponent } from './guion.component';

const universidad = universidadJson as unknown as Escenario;

async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [GuionComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso'));
  const id = store.caso()!.escenas[1].id;
  const fixture = TestBed.createComponent(GuionComponent);
  fixture.componentRef.setInput('escenaId', id);
  await fixture.whenStable();
  fixture.detectChanges();
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  return { fixture, store, id, raiz: fixture.nativeElement as HTMLElement, listo };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto)!;

describe('GuionComponent', () => {
  it('escribir una línea la guarda con su personaje y expresión', async () => {
    const { store, id, raiz, listo } = await montar();
    boton(raiz, 'Agregar una línea').click();
    await listo();
    const texto = raiz.querySelector<HTMLTextAreaElement>('textarea[id^="lt"]')!;
    texto.value = 'Hola, cuéntame qué te trae por aquí.';
    texto.dispatchEvent(new Event('change'));
    const expresion = raiz.querySelector<HTMLSelectElement>('select[id^="le"]')!;
    expresion.value = 'alegre';
    expresion.dispatchEvent(new Event('change'));
    await listo();
    const linea = store.caso()!.escenas.find((e) => e.id === id)!.lineas[0];
    expect(linea).toMatchObject({ texto: 'Hola, cuéntame qué te trae por aquí.', expresion: 'alegre', personajeId: 'psicologa-bienestar' });
    expect(raiz.querySelector('img.retrato')!.getAttribute('src')).toContain('psicologa-hospitalaria/portrait-alegre.png');
  });

  it('elegir «Una escena nueva» no crea nada hasta pulsar «Crear la escena nueva»', async () => {
    const { store, id, raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    const llevaA = raiz.querySelector<HTMLSelectElement>('select[id^="rl"]')!;
    llevaA.value = 'nueva';
    llevaA.dispatchEvent(new Event('change'));
    await listo();
    expect(store.caso()!.escenas).toHaveLength(2);
    boton(raiz, 'Crear la escena nueva').click();
    await listo();
    const caso = store.caso()!;
    expect(caso.escenas).toHaveLength(3);
    expect(caso.escenas.find((e) => e.id === id)!.respuestas[0].destinoId).toBe(caso.escenas[2].id);
    expect(raiz.textContent).toContain('conectada a la respuesta 1');
  });

  it('lo sugerido por la IA se acepta elemento por elemento', async () => {
    const { store, id, raiz, listo } = await montar();
    const caso = store.caso()!;
    store.fijar({
      ...caso,
      escenas: caso.escenas.map((e) => (e.id !== id ? e : {
        ...e, lineas: [{ id: 'l1', personajeId: 'estudiante-consultante', texto: 'Hola', expresion: 'triste', marcaIa: true }],
      })),
    });
    await listo();
    expect(raiz.textContent).toContain('Sugerido por la IA');
    boton(raiz, 'Aceptar línea').click();
    await listo();
    expect(store.caso()!.escenas.find((e) => e.id === id)!.lineas[0].marcaIa).toBe(false);
    expect(raiz.textContent).not.toContain('Sugerido por la IA');
  });
});
