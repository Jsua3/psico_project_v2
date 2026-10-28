import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { universidad } from '../../testing/universidad';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { GuionComponent } from './guion.component';


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
  it('los recursos de apoyo de la escena se escriben uno por línea y respaldan la casilla «protocolos de seguridad»', async () => {
    const { store, id, raiz, listo } = await montar();
    const campo = raiz.querySelector<HTMLTextAreaElement>('#recursos-escena')!;
    expect(campo.labels?.[0].textContent).toContain('Recursos de apoyo para el estudiante');
    campo.value = 'Línea de atención de Bienestar\n\n  Consultorio de psicología, piso 2  \n';
    campo.dispatchEvent(new Event('change'));
    await listo();
    expect(store.caso()!.escenas.find((e) => e.id === id)!.recursosApoyo).toEqual(['Línea de atención de Bienestar', 'Consultorio de psicología, piso 2']);
    expect(campo.value).toBe('Línea de atención de Bienestar\nConsultorio de psicología, piso 2');
  });

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

  const enCuerpo = async (fixture: { nativeElement: HTMLElement }, listo: () => Promise<void>) => {
    document.body.appendChild(fixture.nativeElement);
    await listo();
    await new Promise((r) => setTimeout(r, 0));
  };
  const anunciado = (raiz: HTMLElement) => raiz.querySelector('[role="status"].solo-lector')!.textContent!.trim();

  it('borrar una línea lo anuncia y deja el foco en la línea que quedó en su lugar', async () => {
    const { fixture, raiz, listo } = await montar();
    await enCuerpo(fixture, listo);
    boton(raiz, 'Agregar una línea').click();
    await listo();
    boton(raiz, 'Agregar una línea').click();
    await listo();
    raiz.querySelector<HTMLButtonElement>('[aria-label="Borrar la línea 1"]')!.click();
    await listo();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.id).toBe('lt0');
    expect(anunciado(raiz)).toBe('Línea 1 borrada.');
    fixture.nativeElement.remove();
  });

  it('borrar la única respuesta deja el foco en «Agregar una respuesta»', async () => {
    const { fixture, raiz, listo } = await montar();
    await enCuerpo(fixture, listo);
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    boton(raiz, 'Borrar la respuesta 1').click();
    await listo();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.textContent?.trim()).toBe('Agregar una respuesta');
    expect(anunciado(raiz)).toBe('Respuesta 1 borrada.');
    fixture.nativeElement.remove();
  });

  it('aceptar una línea de la IA lo anuncia y deja el foco en su texto', async () => {
    const { fixture, store, id, raiz, listo } = await montar();
    const caso = structuredClone(store.caso()!);
    caso.escenas.find((e) => e.id === id)!.lineas.push({ id: 'l-ia', personajeId: caso.personajes[0].id, texto: 'Hola', expresion: 'neutral', marcaIa: true });
    store.fijar(caso);
    await enCuerpo(fixture, listo);
    boton(raiz, 'Aceptar línea').click();
    await listo();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.id).toBe('lt0');
    expect(anunciado(raiz)).toBe('Línea 1 aceptada.');
    fixture.nativeElement.remove();
  });

  it('una respuesta nueva no trae ninguna clasificación marcada y pide elegirla', async () => {
    const { raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    const radios = [...raiz.querySelectorAll<HTMLInputElement>('li.respuesta fieldset.clasificacion input[type="radio"]')];
    expect(radios.length).toBe(4);
    expect(radios.some((r) => r.checked)).toBe(false);
    expect(raiz.querySelector('li.respuesta')!.textContent).toContain('Elige cómo clasificas esta respuesta.');
    radios[0].click();
    await listo();
    expect(raiz.querySelector('li.respuesta')!.textContent).not.toContain('Elige cómo clasificas esta respuesta.');
  });

  it('una respuesta clasificada que aún no lleva a ninguna escena dice que queda en el borrador', async () => {
    const { raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    raiz.querySelectorAll<HTMLInputElement>('li.respuesta input[type="radio"]')[0].click();
    await listo();
    expect(raiz.querySelector('li.respuesta')!.textContent).toContain('Todavía no lleva a ninguna escena: solo está en esta pantalla');
  });

  it('ofrece las cuatro clases de respuesta y guarda la que se elige', async () => {
    const { store, id, raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    const opciones = [...raiz.querySelectorAll<HTMLLabelElement>('fieldset.clasificacion label')].map((l) => l.textContent!.replace(/[✓▲✕]/g, '').trim());
    expect(opciones).toEqual(['Recomendada', 'Aceptable', 'Con riesgo', 'Contraindicada']);
    raiz.querySelector<HTMLInputElement>('fieldset.clasificacion input[value="RISKY"]')!.click();
    await listo();
    expect(store.caso()!.escenas.find((e) => e.id === id)!.respuestas[0].clase).toBe('RISKY');
    expect(raiz.querySelector('textarea[id^="rz"]')).toBeNull();
  });

  it('una respuesta contraindicada pide la razón y la guarda', async () => {
    const { store, id, raiz, listo } = await montar();
    boton(raiz, 'Agregar una respuesta').click();
    await listo();
    raiz.querySelector<HTMLInputElement>('fieldset.clasificacion input[value="CONTRAINDICATED"]')!.click();
    await listo();
    const razon = raiz.querySelector<HTMLTextAreaElement>('textarea[id^="rz"]')!;
    expect(raiz.textContent).toContain('Explica por qué esta respuesta puede hacerle daño a la persona.');
    razon.value = 'Apura a la persona.';
    razon.dispatchEvent(new Event('change'));
    await listo();
    expect(store.caso()!.escenas.find((e) => e.id === id)!.respuestas[0]).toMatchObject({ clase: 'CONTRAINDICATED', razon: 'Apura a la persona.' });
    expect(raiz.textContent).not.toContain('Explica por qué esta respuesta');
  });
});
