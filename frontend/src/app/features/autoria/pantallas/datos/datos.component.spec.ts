import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthoringApi } from '../../../../core/api/authoring.api';
import { CasoStore } from '../../estado/caso.store';
import { casoCopiadoDeLugar } from '../../testing/caso-api';
import { ServidorFalso } from '../../testing/servidor-falso';
import { universidad } from '../../testing/universidad';
import { DatosComponent } from './datos.component';

const CASO = 41;

async function montar(opciones: { estado?: string; contexto?: string; objetivos?: string[] } = {}) {
  localStorage.clear();
  TestBed.resetTestingModule();
  const datos = casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo'], { caseVersionId: CASO, revision: 3 });
  datos.editor.context = opciones.contexto ?? 'Una estudiante llega a Bienestar.';
  datos.editor.learningObjectives = opciones.objetivos ?? ['Valorar el riesgo.', 'Validar sin juzgar.'];
  if (opciones.estado) datos.editor.status = opciones.estado;
  const servidor = new ServidorFalso(datos, universidad);
  await TestBed.configureTestingModule({
    imports: [DatosComponent],
    providers: [provideRouter([]), { provide: AuthoringApi, useValue: servidor.autoria }],
  }).compileComponents();
  const store = TestBed.inject(CasoStore);
  await store.cargar(CASO);
  servidor.llamadas.length = 0;
  const fixture = TestBed.createComponent(DatosComponent);
  document.body.appendChild(fixture.nativeElement);
  const listo = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await listo();
  const raiz = fixture.nativeElement as HTMLElement;
  const contexto = () => raiz.querySelector<HTMLTextAreaElement>('#d-contexto')!;
  const objetivos = () => raiz.querySelector<HTMLTextAreaElement>('#d-objetivos')!;
  const guardar = () => [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Guardar los datos del caso')!;
  const escribir = async (campo: HTMLTextAreaElement, valor: string, soltar = false) => {
    campo.value = valor;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    if (soltar) campo.dispatchEvent(new Event('change', { bubbles: true }));
    await listo();
  };
  const enviar = async () => {
    raiz.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await listo();
  };
  return { fixture, store, servidor, raiz, listo, contexto, objetivos, guardar, escribir, enviar };
}

describe('DatosComponent · el contexto y los objetivos del caso', () => {
  afterEach(() => document.querySelectorAll('body > app-datos, body > [ng-version]').forEach((n) => n.remove()));

  it('muestra el nombre del caso (solo para leer), el contexto y los objetivos, uno por renglón', async () => {
    const { raiz, contexto, objetivos } = await montar();
    expect(raiz.querySelector('h1')!.textContent).toContain('Datos del caso');
    const nombre = raiz.querySelector<HTMLInputElement>('#d-nombre')!;
    expect(nombre.value).toBe('Primera escucha en Bienestar');
    expect(nombre.readOnly).toBe(true);
    expect(contexto().value).toBe('Una estudiante llega a Bienestar.');
    expect(objetivos().value).toBe('Valorar el riesgo.\nValidar sin juzgar.');
    for (const [id, texto] of [['d-nombre', 'Nombre del caso'], ['d-contexto', 'Contexto que lee el estudiante'], ['d-objetivos', 'Objetivos de aprendizaje']]) {
      expect(raiz.querySelector(`label[for="${id}"]`)!.textContent).toContain(texto);
    }
  });

  it('cuenta los caracteres del contexto y dice el tope', async () => {
    const { raiz, contexto, escribir } = await montar();
    await escribir(contexto(), 'Hola');
    expect(raiz.querySelector('#d-contexto-cuenta')!.textContent).toContain('4 de 4.000 caracteres');
  });

  it('«Guardar los datos del caso» manda el contexto y los objetivos al caso y lo dice', async () => {
    const { raiz, servidor, store, contexto, objetivos, guardar, escribir, enviar } = await montar();
    await escribir(contexto(), '  Un contexto nuevo.  ');
    await escribir(objetivos(), 'Primero.\n\n  Segundo.  \n');
    await enviar();
    expect(guardar().getAttribute('aria-disabled')).not.toBe('true');
    expect(servidor.metodos).toEqual(['updateBrief']);
    expect(servidor.llamadas[0].args[0]).toEqual({ context: 'Un contexto nuevo.', learningObjectives: ['Primero.', 'Segundo.'] });
    expect(store.caso()!.contexto).toBe('Un contexto nuevo.');
    expect(raiz.querySelector('[data-estado-datos]')!.textContent).toContain('Los datos del caso se guardaron.');
    expect(store.error()).toBeNull();
  });

  it('al salir de un campo con algo cambiado se guarda solo, sin quitarle el foco a nadie', async () => {
    const { servidor, contexto, escribir } = await montar();
    await escribir(contexto(), 'Cambio al salir del campo.', true);
    expect(servidor.llamadasA('updateBrief')).toHaveLength(1);
    expect((servidor.llamadas[0].args[0] as { context: string }).context).toBe('Cambio al salir del campo.');
  });

  it('si no cambió nada, salir del campo no guarda', async () => {
    const { servidor, contexto, escribir } = await montar();
    await escribir(contexto(), contexto().value, true);
    expect(servidor.metodos).toEqual([]);
  });

  it('un contexto de más de 4.000 caracteres no se guarda: lo dice en el campo, lo marca y le da el foco', async () => {
    const { raiz, servidor, contexto, escribir, enviar } = await montar();
    await escribir(contexto(), 'a'.repeat(4001));
    await enviar();
    expect(servidor.metodos).toEqual([]);
    expect(contexto().getAttribute('aria-invalid')).toBe('true');
    expect(raiz.querySelector('#d-contexto-error')!.textContent).toContain('El contexto admite hasta 4.000 caracteres (ahora tiene 4.001).');
    expect(contexto().getAttribute('aria-describedby')).toContain('d-contexto-error');
    expect(document.activeElement).toBe(contexto());
  });

  it('más de 12 objetivos, o uno de más de 280 caracteres, no se guardan', async () => {
    const { raiz, servidor, objetivos, escribir, enviar } = await montar();
    await escribir(objetivos(), Array.from({ length: 13 }, (_, i) => `Objetivo ${i + 1}`).join('\n'));
    await enviar();
    expect(raiz.querySelector('#d-objetivos-error')!.textContent).toContain('Un caso admite hasta 12 objetivos de aprendizaje.');
    await escribir(objetivos(), `Corto.\n${'a'.repeat(281)}`);
    await enviar();
    expect(raiz.querySelector('#d-objetivos-error')!.textContent).toContain('El objetivo 2 admite hasta 280 caracteres.');
    expect(servidor.metodos).toEqual([]);
    expect(document.activeElement).toBe(objetivos());
  });

  it('el texto con etiquetas o enlaces no se guarda', async () => {
    const { raiz, servidor, contexto, escribir, enviar } = await montar();
    await escribir(contexto(), 'Entra a <b>Bienestar</b>');
    await enviar();
    expect(raiz.querySelector('#d-contexto-error')!.textContent).toContain('Escribe texto plano, sin etiquetas ni formato.');
    await escribir(contexto(), 'Mira https://ejemplo.org');
    await enviar();
    expect(raiz.querySelector('#d-contexto-error')!.textContent).toContain('Escribe texto plano, sin enlaces.');
    expect(servidor.metodos).toEqual([]);
  });

  it('salir de un campo con un error no guarda nada', async () => {
    const { servidor, contexto, escribir } = await montar();
    await escribir(contexto(), 'a'.repeat(4001), true);
    expect(servidor.metodos).toEqual([]);
  });

  it('si el sistema no acepta el texto, el campo conserva lo escrito y avisa que no se guardó', async () => {
    const { raiz, servidor, store, contexto, escribir, enviar } = await montar();
    servidor.fallar('updateBrief', 400, 'No.', { campo: 'context' });
    await escribir(contexto(), 'Texto que el sistema rechaza.');
    await enviar();
    expect(store.error()).toMatch(/No se pudo guardar los datos del caso/);
    expect(raiz.querySelector('[data-estado-datos]')!.textContent).toContain('No se pudo guardar');
    expect(contexto().value).toBe('Texto que el sistema rechaza.');
  });

  it('un caso en revisión se lee pero no se cambia: campos de solo lectura, botón sin efecto y una nota que lo explica', async () => {
    const { raiz, servidor, contexto, objetivos, guardar, enviar } = await montar({ estado: 'IN_REVIEW' });
    expect(contexto().readOnly).toBe(true);
    expect(objetivos().readOnly).toBe(true);
    expect(contexto().value).toBe('Una estudiante llega a Bienestar.');
    expect(guardar().getAttribute('aria-disabled')).toBe('true');
    expect(raiz.textContent).toContain('El caso ya no es un borrador: se puede leer, pero no cambiar.');
    await enviar();
    guardar().click();
    expect(servidor.metodos).toEqual([]);
  });

  it('al recargar el caso, los campos vuelven a lo que tiene guardado', async () => {
    const { store, servidor, contexto, escribir, listo } = await montar();
    servidor.otraSesionEscribe();
    await escribir(contexto(), 'Lo que escribí y no se guardó.');
    await store.cargar(CASO, true);
    await listo();
    expect(contexto().value).toBe('Una estudiante llega a Bienestar.');
  });

  it('un caso sin contexto ni objetivos muestra los campos vacíos', async () => {
    const { contexto, objetivos } = await montar({ contexto: '', objetivos: [] });
    expect(contexto().value).toBe('');
    expect(objetivos().value).toBe('');
  });
});
