import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import type { CasoBorrador } from '../../modelo/caso';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import { universidad } from '../../testing/universidad';
import { ProbarComponent } from './probar.component';

function casoDePrueba(): CasoBorrador {
  const caso = copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
  const [a, b] = caso.escenas;
  a.lineas = [{ id: 'l1', personajeId: 'estudiante-consultante', texto: 'No sé si entrar.', expresion: 'preocupada', marcaIa: false }];
  const valorar = caso.hitos[0].clave;
  a.respuestas = [
    { id: 'buena', texto: 'Te acompaño adentro.', clase: 'RECOMMENDED', razon: '', efectos: { hitos: [valorar] }, retroalimentacion: 'Acompañar da seguridad.', destinoId: b.id, marcaIa: false },
    { id: 'mala', texto: 'Vuelve otro día.', clase: 'CONTRAINDICATED', razon: 'La deja sola.', efectos: {}, retroalimentacion: 'La deja sola con el miedo.', destinoId: b.id, marcaIa: false },
    { id: 'propia', texto: 'Cuéntame más.', clase: 'ACCEPTABLE', razon: '', efectos: { persona: { bond: 1, activation: 1 } }, retroalimentacion: 'Invita a seguir.', destinoId: b.id, marcaIa: false },
  ];
  b.esFinal = true;
  return caso;
}

async function montar() {
  localStorage.clear();
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [ProbarComponent],
    providers: [provideRouter([]), { provide: BibliotecaService, useValue: { escenario: async () => universidad } }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  store.fijar(casoDePrueba());
  const fixture = TestBed.createComponent(ProbarComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  const raiz = fixture.nativeElement as HTMLElement;
  const listo = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  const boton = (texto: string) => [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texto);
  const elegir = async (texto: string) => {
    [...raiz.querySelectorAll<HTMLLabelElement>('label')].find((l) => l.textContent?.includes(texto))!.querySelector('input')!.click();
    await listo();
    boton('Elegir esta respuesta')!.click();
    await listo();
  };
  const autora = () => raiz.querySelector('aside.lateral')!;
  return { raiz, listo, boton, elegir, autora, store };
}

describe('ProbarComponent · la vista de autora', () => {
  it('al lado del juego dice cómo está la persona, en palabras, y qué hitos se van cumpliendo, sin cifras', async () => {
    const { autora, listo, elegir, store } = await montar();
    expect(autora().textContent).toContain('Solo en la prueba');
    expect(autora().textContent).toContain('el estudiante no ve esto');
    // al empezar: la persona parte cautelosa y tensa, y ningún hito está cumplido
    expect(autora().querySelector('.persona-ahora')!.textContent).toContain('La persona se muestra cautelosa y tensa.');
    const hitos = () => [...autora().querySelectorAll<HTMLElement>('li.hito-prueba')].map((li) => li.textContent!.replace(/\s+/g, ' ').replace(/^\s*[✓○]\s*/, '').trim());
    expect(hitos()).toEqual(store.caso()!.hitos.map((h) => `${h.nombre} · sin cumplir`));

    await elegir('Te acompaño adentro.');
    expect(autora().querySelector('.persona-ahora')!.textContent).toContain('La persona se muestra abierta y serena.');
    expect(hitos()[0]).toBe(`${store.caso()!.hitos[0].nombre} · cumplido`);
    expect(hitos().slice(1).every((t) => t.endsWith('sin cumplir'))).toBe(true);
    expect(autora().textContent).not.toMatch(/estr[eé]s|puntaje|puntos|\d\s?%|\b\d+\s+de\s+\d+\b/i);
    await listo();
  });

  it('muestra la clase de la respuesta y lo que le pasa a la persona solo en la vista de autora', async () => {
    const { raiz, autora, elegir } = await montar();
    await elegir('Vuelve otro día.');
    expect(autora().querySelector('.ultima')!.textContent).toContain('Contraindicada');
    expect(autora().querySelector('.ultima')!.textContent).toContain('la persona se cierra y se tensa');
    expect(autora().querySelector('.persona-ahora')!.textContent).toContain('La persona se muestra retraída y en crisis.');
    // lo que lee el estudiante no trae la clase de la respuesta
    const resultado = raiz.querySelector('[aria-label="Resultado de la respuesta"]')!;
    expect(resultado.textContent).toContain('La deja sola con el miedo.');
    expect(resultado.textContent).not.toContain('Contraindicada');
    expect(resultado.querySelector('.pildora')).toBeNull();
  });

  it('si la docente eligió a mano qué le pasa a la persona, la prueba lo usa', async () => {
    const { autora, elegir } = await montar();
    await elegir('Cuéntame más.');
    expect(autora().querySelector('.persona-ahora')!.textContent).toContain('La persona se muestra abierta y en crisis.');
  });

  it('«Empezar de nuevo» devuelve a la persona y a los hitos a como empezaron', async () => {
    const { autora, boton, listo, elegir, store } = await montar();
    await elegir('Te acompaño adentro.');
    boton('Continuar')!.click();
    await listo();
    expect(autora().querySelectorAll('li.hito-prueba')).toHaveLength(store.caso()!.hitos.length);
    [...autora().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Empezar de nuevo')!.click();
    await listo();
    expect(autora().querySelector('.persona-ahora')!.textContent).toContain('La persona se muestra cautelosa y tensa.');
    expect([...autora().querySelectorAll('li.hito-prueba')].every((li) => li.textContent!.includes('sin cumplir'))).toBe(true);
  });
});
