import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import universidadJson from '../../../public/assets/biblioteca/universidad/escenario.json';
import { CasoStore } from '../estado/caso.store';
import { BibliotecaService } from '../modelo/biblioteca.service';
import { copiarEscenarioAlCaso } from '../modelo/copiar';
import type { Escenario } from '../modelo/escenario';
import { PanelIaComponent, describirCambio } from './panel-ia.component';
import type { Cambio } from './propuestas';

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
    expect(raiz.textContent).toContain('La IA propone; tú decides.');
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

  it('después de aplicar, «Deshacer lo aplicado» devuelve el caso a como estaba', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { store, raiz, listo } = await montar();
    const antes = store.caso();
    await pedir(raiz, listo, 'Propón respuestas');
    boton(raiz, 'Aplicar lo marcado').click();
    await listo();
    expect(raiz.querySelector('[role="log"]')!.textContent).not.toContain('Ctrl+Z');
    boton(raiz, 'Deshacer lo aplicado').click();
    await listo();
    expect(store.caso()).toEqual(antes);
  });

  it('«Deshacer lo aplicado» desaparece si la persona cambia algo después de aplicar', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { store, raiz, listo } = await montar();
    await pedir(raiz, listo, 'Propón respuestas');
    boton(raiz, 'Aplicar lo marcado').click();
    await listo();
    expect(boton(raiz, 'Deshacer lo aplicado')).toBeDefined();
    store.agregarEscena('consultorio');
    await listo();
    expect(boton(raiz, 'Deshacer lo aplicado')).toBeUndefined();
  });

  it('el aviso fijo no promete marcar lo que no se puede marcar', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { raiz } = await montar();
    expect(raiz.querySelector('.aviso-ia')!.textContent).not.toContain('Todo lo generado queda marcado');
    expect(raiz.querySelector('.aviso-ia')!.textContent).toContain('Las escenas, líneas, respuestas y finales que agregue quedan marcados');
  });

  it('al empezar otro caso, el asistente olvida la conversación y la propuesta', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const { store, raiz, listo } = await montar();
    await pedir(raiz, listo, 'Propón respuestas');
    expect(raiz.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0);
    store.reiniciar();
    await listo();
    expect(raiz.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(raiz.querySelector('[role="log"]')!.textContent!.trim()).toBe('');
  });
});

describe('describirCambio', () => {
  const montarCaso = () => {
    const caso = copiarEscenarioAlCaso(universidad, ['consultorio', 'sala-espera'], 'Caso');
    return caso;
  };

  it('«mover» dice qué elemento se mueve y hacia dónde', () => {
    const caso = montarCaso();
    const sala = caso.salas[0];
    const cambio: Cambio = { op: 'mover', salaId: sala.id, tipo: 'mueble', indice: 0, x: 600, y: 400 };
    const nombre = caso.catalogo.muebles.find((m) => m.id === sala.muebles[0].ref)!.nombre;
    const texto = describirCambio(caso, cambio, [cambio]);
    expect(texto).toContain(nombre);
    expect(texto).toContain(sala.nombre);
    expect(texto).toMatch(/derecha|izquierda|centro/);
  });

  it('una respuesta dice a qué escena lleva', () => {
    const caso = montarCaso();
    const cambio: Cambio = { op: 'agregar-respuesta', escenaId: caso.escenas[0].id, texto: 'Hola', clasificacion: 'adecuada', retroalimentacion: 'F', destino: caso.escenas[1].id };
    expect(describirCambio(caso, cambio, [cambio])).toContain(`lleva a «${caso.escenas[1].titulo}»`);
    const nueva: Cambio = { ...cambio, destino: 'nueva' };
    expect(describirCambio(caso, nueva, [nueva])).toContain('lleva a una escena nueva');
  });

  it('un final dice cuándo llega', () => {
    const caso = montarCaso();
    const porEscena: Cambio = { op: 'agregar-final', nombre: 'Cierre', texto: 'Fin', condicion: { tipo: 'llega-a-escena', escenaId: caso.escenas[1].id } };
    expect(describirCambio(caso, porEscena, [porEscena])).toContain(`llega si el estudiante pasa por «${caso.escenas[1].titulo}»`);
    const porRespuestas: Cambio = { op: 'agregar-final', nombre: 'Riesgo', texto: 'Fin', condicion: { tipo: 'inadecuadas-al-menos', cantidad: 2 } };
    expect(describirCambio(caso, porRespuestas, [porRespuestas])).toContain('llega si elige al menos 2 respuestas inadecuadas');
  });
});
