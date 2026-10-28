import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { universidad } from '../../testing/universidad';
import { CasoStore } from '../../estado/caso.store';
import { BibliotecaService } from '../../modelo/biblioteca.service';
import type { CasoBorrador } from '../../modelo/caso';
import { copiarEscenarioAlCaso } from '../../modelo/copiar';
import type { Escenario } from '../../modelo/escenario';
import { ProbarComponent } from './probar.component';


function casoDePrueba(): CasoBorrador {
  const caso = copiarEscenarioAlCaso(universidad, ['sala-espera', 'consultorio'], 'Caso');
  const [a, b] = caso.escenas;
  a.lineas = [
    { id: 'l1', personajeId: 'estudiante-consultante', texto: 'No sé si entrar.', expresion: 'preocupada', marcaIa: false },
    { id: 'l2', personajeId: 'estudiante-consultante', texto: 'Me da miedo.', expresion: 'triste', marcaIa: false },
  ];
  a.respuestas = [
    { id: 'r1', texto: 'Te acompaño adentro.', clase: 'RECOMMENDED', razon: '', efectos: { hitos: caso.hitos.filter((h) => h.decisivo).map((h) => h.clave) }, retroalimentacion: 'Acompañar da seguridad.', destinoId: b.id, marcaIa: false },
    { id: 'r2', texto: 'Vuelve otro día.', clase: 'CONTRAINDICATED', razon: 'Puede hacer daño.', efectos: {}, retroalimentacion: 'La deja sola con el miedo.', destinoId: null, marcaIa: false },
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
    const opcion = [...raiz.querySelectorAll<HTMLLabelElement>('label')].find((l) => l.textContent?.includes(texto))!;
    opcion.querySelector('input')!.click();
    await listo();
    boton('Elegir esta respuesta')!.click();
    await listo();
  };
  return { raiz, listo, boton, elegir, store };
}

describe('ProbarComponent', () => {
  it('recorre desde el inicio, muestra la retroalimentación al elegir y llega a un final', async () => {
    const { raiz, listo, boton, elegir, store } = await montar();
    expect(raiz.textContent).toContain('Escena 1 de 2');
    expect(raiz.textContent).toContain('No sé si entrar.');
    boton('Siguiente')!.click();
    await listo();
    expect(raiz.textContent).toContain('Me da miedo.');
    await elegir('Te acompaño adentro.');
    const resultado = raiz.querySelector('[aria-label="Resultado de la respuesta"]')!;
    expect(resultado.textContent).not.toContain('Recomendada'); // la clase la ve solo la autora, al lado (el estudiante la lee al cierre)
    expect(resultado.textContent).toContain('Acompañar da seguridad.');
    boton('Continuar')!.click();
    await listo();
    expect(raiz.textContent).toContain('Intervención protectora');
    expect(store.probado()).toBe(true);
  });

  it('una respuesta sin destino muestra «Esta respuesta aún no lleva a ninguna escena» y permite volver', async () => {
    const { raiz, listo, boton, elegir } = await montar();
    boton('Siguiente')!.click();
    await listo();
    await elegir('Vuelve otro día.');
    expect(raiz.textContent).toContain('La deja sola con el miedo.'); // la retroalimentación se ve igual
    expect(raiz.textContent).toContain('Esta respuesta aún no lleva a ninguna escena');
    expect(boton('Continuar')).toBeUndefined();
    boton('Volver a elegir')!.click();
    await listo();
    expect(raiz.querySelector('fieldset')).not.toBeNull();
    expect(raiz.textContent).toContain('Escena 1 de 2');
  });

  it('cada línea nueva se anuncia y, al llegar a las respuestas, el foco no se pierde', async () => {
    const { raiz, listo, boton } = await montar();
    document.body.appendChild(raiz);
    expect(raiz.querySelector('.dialogo')!.getAttribute('aria-live')).toBe('polite');
    boton('Siguiente')!.click();
    await listo();
    await new Promise((r) => setTimeout(r, 0));
    expect(raiz.textContent).toContain('Me da miedo.');
    expect(raiz.querySelector('fieldset.respuestas')).not.toBeNull();
    expect(document.activeElement).toBe(raiz.querySelector('fieldset.respuestas'));
    raiz.remove();
  });

  it('si la respuesta elegida no está clasificada, lo dice en vez de romperse', async () => {
    const { raiz, listo, boton, elegir, store } = await montar();
    const caso = structuredClone(store.caso()!);
    caso.escenas[0].respuestas[0].clase = null;
    store.fijar(caso);
    await listo();
    boton('Siguiente')!.click();
    await listo();
    await elegir('Te acompaño adentro.');
    expect(raiz.querySelector('aside.lateral .ultima')!.textContent).toContain('Sin clasificar'); // la clase ya no la lee el estudiante: la ve la autora, al lado
    expect(raiz.querySelector('.resultado')!.textContent).toContain('Acompañar da seguridad.');
  });

  it('la prueba muestra la sala como quedó editada: fondo, muebles, objetos y personajes con su expresión', async () => {
    const { raiz, listo, store } = await montar();
    const caso = store.caso()!;
    const sala = caso.salas.find((s) => s.id === caso.escenas[0].salaId)!;
    sala.personajes[0] = { ...sala.personajes[0], expresion: 'triste' };
    store.fijar(structuredClone(caso));
    await listo();
    const piezas = raiz.querySelectorAll('.sala-vista [data-pieza]');
    expect(piezas.length).toBe(sala.muebles.length + sala.objetos.length + sala.personajes.length);
    expect(raiz.querySelector('.sala-vista img.fondo')).not.toBeNull();
    expect(raiz.querySelector('.sala-vista')!.getAttribute('aria-label')).toContain(sala.nombre);
    expect(raiz.querySelector('.en-la-sala')!.textContent).toContain('triste');
  });

  it('al mover un mueble en la sala, la prueba lo muestra en su nuevo lugar', async () => {
    const { raiz, listo, store } = await montar();
    const caso = structuredClone(store.caso()!);
    const sala = caso.salas.find((s) => s.id === caso.escenas[0].salaId)!;
    sala.muebles[0].x = 640;
    sala.muebles[0].y = 400;
    store.fijar(caso);
    await listo();
    const pieza = raiz.querySelector<HTMLElement>('.sala-vista [data-pieza="mueble-0"]')!;
    expect(pieza.style.left).toBe('640px');
    expect(pieza.style.top).toBe('400px');
  });
});
