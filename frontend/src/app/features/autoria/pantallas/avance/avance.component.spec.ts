import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, throwError } from 'rxjs';

import { AuthoringApi } from '../../../../core/api/authoring.api';
import { casoCopiadoDeLugar } from '../../testing/caso-api';
import { rutasDePrueba } from '../../testing/rutas';
import { ServidorFalso } from '../../testing/servidor-falso';
import { universidad } from '../../testing/universidad';

const DESCRIPCION = 'Una estudiante llega a Bienestar y dice que ya no puede más con lo que pasa en casa.';

async function montar() {
  TestBed.resetTestingModule();
  const servidor = new ServidorFalso(casoCopiadoDeLugar(universidad, ['consultorio', 'pasillo']), universidad);
  await TestBed.configureTestingModule({
    providers: [provideRouter(rutasDePrueba), { provide: AuthoringApi, useValue: servidor.autoria }],
  }).compileComponents();
  const g = servidor.generaciones;
  const id = (await firstValueFrom(servidor.autoria.startGeneration({ lugarId: 'universidad', descripcion: DESCRIPCION }))).id;
  const harness = await RouterTestingHarness.create();
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
  const raiz = () => harness.routeNativeElement as HTMLElement;
  /** Deja correr el servicio y repinta hasta que se cumpla lo que la prueba espera. */
  const hasta = async (condicion: () => boolean) => {
    for (let i = 0; i < 100 && !condicion(); i++) {
      await new Promise((r) => setTimeout(r, 0));
      harness.fixture.detectChanges();
    }
    expect(condicion()).toBe(true);
  };
  const ir = async () => {
    await harness.navigateByUrl(`/portal/casos/nuevo/generando/${id}`);
    harness.fixture.detectChanges();
    navegar.mockClear(); // no cuenta la navegación de la propia prueba
  };
  return { servidor, g, id, harness, raiz, hasta, ir, navegar };
}

const boton = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(texto));
const etapa = (raiz: HTMLElement, texto: string) =>
  [...raiz.querySelectorAll<HTMLElement>('li.etapa')].find((li) => li.querySelector('.texto')!.textContent!.includes(texto));
const anuncio = (raiz: HTMLElement) => raiz.querySelector('[role="status"]')!.textContent!.trim();

describe('AvanceComponent', () => {
  it('anuncia cada etapa en la región viva y marca su estado con texto y símbolo', async () => {
    const { g, raiz, hasta, ir } = await montar();
    g.retener('skeleton');
    await ir();
    await hasta(() => anuncio(raiz()) === 'Armando el esqueleto');

    expect(raiz().querySelector('h1')!.textContent).toContain('Estamos armando tu caso');
    expect(etapa(raiz(), 'Armando el esqueleto')!.textContent).toMatch(/….*En curso/s);
    expect(etapa(raiz(), 'Revisando las reglas')!.textContent).toMatch(/○.*Pendiente/s);
    expect(raiz().textContent).toContain('Puedes cerrar esta página: el avance se guarda y podrás retomarlo.');

    g.retener('scene', 'recepcion');
    g.retener('scene', 'consulta');
    g.liberar('skeleton');
    await hasta(() => anuncio(raiz()) === 'Escribiendo la escena 1 de 4: Recepción');
    expect(etapa(raiz(), 'Armando el esqueleto')!.textContent).toMatch(/✓.*Hecha/s);
    expect(etapa(raiz(), 'Escribiendo la escena 1 de 4: Recepción')!.textContent).toMatch(/….*En curso/s);
    expect(etapa(raiz(), 'Escena 4 de 4: Cierre')!.textContent).toMatch(/○.*Pendiente/s);

    g.liberar('scene', 'recepcion');
    g.liberar('scene', 'consulta');
    await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
    expect(anuncio(raiz())).toBe('');
  });

  it('un error reintentable muestra el mensaje y «Reintentar esta parte», que la retoma', async () => {
    const { g, raiz, hasta, ir } = await montar();
    g.fallar('scene', 502, 'AI_PROVIDER_ERROR', 'malformed', 4);
    await ir();
    await hasta(() => !!raiz().querySelector('[role="alert"]'));

    const alerta = raiz().querySelector('[role="alert"]')!;
    expect(alerta.textContent).toContain('La IA respondió algo que no pudimos usar. Vuelve a intentarlo.');
    expect(etapa(raiz(), 'Recepción')!.textContent).toMatch(/!.*Con error/s);
    expect(boton(raiz(), 'Cancelar y empezar de nuevo')).toBeTruthy();

    boton(raiz(), 'Reintentar esta parte')!.click();
    await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
    expect(raiz().querySelector('[role="alert"]')).toBeNull();
  });

  it('primera lectura fallida: no dice «En curso» y «Reintentar esta parte» vuelve a pedir y avanza', async () => {
    const { raiz, hasta, ir } = await montar();
    const api = TestBed.inject(AuthoringApi);
    const real = api.generation.bind(api);
    let lecturas = 0;
    vi.spyOn(api, 'generation').mockImplementation((i: string) =>
      ++lecturas <= 2 ? throwError(() => new HttpErrorResponse({ status: 500 })) : real(i));
    await ir();
    await hasta(() => !!boton(raiz(), 'Reintentar esta parte'));

    expect(etapa(raiz(), 'Armando el esqueleto')!.textContent).toMatch(/!.*Con error/s);
    expect(etapa(raiz(), 'Armando el esqueleto')!.textContent).not.toContain('En curso');

    boton(raiz(), 'Reintentar esta parte')!.click();
    await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
    expect(raiz().querySelector('[role="alert"]')).toBeNull();
  });

  it('el tope de llamadas no ofrece reintentar, solo empezar de nuevo', async () => {
    const { g, raiz, hasta, ir } = await montar();
    g.fallar('scene', 429, 'GENERATION_CALLS_EXHAUSTED', undefined, 2);
    await ir();
    await hasta(() => !!raiz().querySelector('[role="alert"]'));

    expect(raiz().querySelector('[role="alert"]')!.textContent).toContain('Este caso ya usó todos sus intentos con la IA.');
    expect(boton(raiz(), 'Reintentar esta parte')).toBeUndefined();
    expect(boton(raiz(), 'Cancelar y empezar de nuevo')).toBeTruthy();
  });

  it('«Cancelar y empezar de nuevo» cancela la generación y vuelve al paso 2 con el mismo lugar', async () => {
    const { g, raiz, hasta, ir, navegar } = await montar();
    g.fallar('skeleton', 422, 'AI_REFUSED');
    await ir();
    await hasta(() => !!boton(raiz(), 'Cancelar y empezar de nuevo'));
    navegar.mockResolvedValue(true);

    boton(raiz(), 'Cancelar y empezar de nuevo')!.click();
    await hasta(() => navegar.mock.calls.length > 0);
    expect(navegar).toHaveBeenCalledWith('/portal/casos/nuevo/salas?lugar=universidad');
    expect(g.llamadas.some((l) => l.metodo === 'cancelGeneration')).toBe(true);
  });

  it('si cancelar falla, lo dice y no se queda en blanco', async () => {
    const { g, raiz, hasta, ir, navegar } = await montar();
    g.fallar('skeleton', 422, 'AI_REFUSED');
    await ir();
    await hasta(() => !!boton(raiz(), 'Cancelar y empezar de nuevo'));
    navegar.mockResolvedValue(true);
    vi.spyOn(TestBed.inject(AuthoringApi), 'cancelGeneration').mockImplementation(() => {
      throw new Error('sin red');
    });

    boton(raiz(), 'Cancelar y empezar de nuevo')!.click();
    await hasta(() => raiz().textContent!.includes('No pudimos cancelar el caso. Vuelve a intentarlo.'));
    expect(navegar).not.toHaveBeenCalled();
    expect(boton(raiz(), 'Cancelar y empezar de nuevo')).toBeTruthy();
  });

  it('listo enfoca el título, no navega solo y «Abrir mi caso» abre el editor del caso creado', async () => {
    const { raiz, hasta, ir, navegar } = await montar();
    await ir();
    await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
    navegar.mockResolvedValue(true);

    const h1 = raiz().querySelector('h1')!;
    expect(h1.textContent).toContain('Tu caso está listo como borrador');
    expect(raiz().textContent).toContain('Lo marcado «Sugerido por la IA» espera tu revisión.');
    await hasta(() => document.activeElement === h1);
    expect(etapa(raiz(), 'Revisando las reglas')!.textContent).toMatch(/✓.*Hecha/s);
    // Sin navegación automática (P4): pasados los 2 s sigue en la pantalla.
    await new Promise((r) => setTimeout(r, 2100));
    expect(navegar).not.toHaveBeenCalled();

    boton(raiz(), 'Abrir mi caso')!.click();
    expect(navegar).toHaveBeenCalledTimes(1);
    expect(navegar.mock.calls[0][0]).toMatch(/^\/portal\/casos\/\d+\/editor$/);
  });

  it('fallo enfoca el título y ofrece empezar de nuevo', async () => {
    const { g, raiz, hasta, ir, navegar } = await montar();
    g.resultadoDelEnsamblado('failed');
    await ir();
    await hasta(() => !!boton(raiz(), 'Empezar de nuevo'));
    navegar.mockResolvedValue(true);

    const h1 = raiz().querySelector('h1')!;
    expect(h1.textContent).toContain('No pudimos armar un caso que se pueda abrir');
    expect(raiz().textContent).toContain('La IA dejó partes que no cumplen las reglas del documento. Prueba a describir el caso de otra forma.');
    await hasta(() => document.activeElement === h1);
    expect(boton(raiz(), 'Abrir mi caso')).toBeUndefined();

    boton(raiz(), 'Empezar de nuevo')!.click();
    await hasta(() => navegar.mock.calls.length > 0);
    expect(navegar).toHaveBeenCalledWith('/portal/casos/nuevo/salas?lugar=universidad');
  });

  describe('el contrato final de C1', () => {
    it('un 404 a mitad del avance (apagada) muestra el mensaje del servidor y una salida, sin «Reintentar»', async () => {
      const { raiz, hasta, ir } = await montar();
      const api = TestBed.inject(AuthoringApi);
      vi.spyOn(api, 'generationScene').mockImplementation(() => throwError(() => new HttpErrorResponse({
        status: 404, error: { success: false, code: 'NOT_FOUND', message: 'La generación con IA no está disponible.' },
      })));
      await ir();
      await hasta(() => !!raiz().querySelector('[role="alert"]'));

      expect(raiz().querySelector('[role="alert"]')!.textContent).toContain('La generación con IA no está disponible.');
      expect(boton(raiz(), 'Reintentar esta parte')).toBeUndefined();
      const salida = [...raiz().querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent!.includes('Volver a crear un caso'))!;
      expect(salida.getAttribute('href')).toBe('/portal/casos/nuevo/salas?lugar=universidad');
      expect(TestBed.inject(Router).url).toContain('/generando/');
    });

    it('una generación que no existe: h1 enfocado, el mensaje, enlace «Volver a crear un caso» y nada de «Reintentar»', async () => {
      const { harness, raiz, hasta } = await montar();
      await harness.navigateByUrl('/portal/casos/nuevo/generando/no-existe');
      harness.fixture.detectChanges();
      await hasta(() => !!raiz().querySelector('[role="alert"]'));

      const h1 = raiz().querySelector('h1')!;
      expect(raiz().querySelector('[role="alert"]')!.textContent).toContain('La generación no existe.');
      await hasta(() => document.activeElement === h1);
      expect(boton(raiz(), 'Reintentar esta parte')).toBeUndefined();
      expect(boton(raiz(), 'Cancelar y empezar de nuevo')).toBeUndefined();
      const salida = [...raiz().querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent!.includes('Volver a crear un caso'))!;
      expect(salida.getAttribute('href')).toBe('/portal/casos/nuevo/salas');
      expect(raiz().querySelector('ol.etapas')).toBeNull();
    });

    it('una escena vencida al retomar se ofrece con el mensaje que trae y «Reintentar esta parte» la pide', async () => {
      const { g, id, raiz, hasta, ir } = await montar();
      const api = TestBed.inject(AuthoringApi);
      await firstValueFrom(api.generationSkeleton(id));
      g.retener('scene', 'recepcion');
      void firstValueFrom(api.generationScene(id, 'recepcion'));
      g.avanzarReloj(150);
      await ir();
      await hasta(() => !!boton(raiz(), 'Reintentar esta parte'));

      expect(raiz().querySelector('[role="alert"]')!.textContent).toContain('La IA tardó demasiado en responder. Vuelve a intentarlo.');
      expect(etapa(raiz(), 'Recepción')!.textContent).toMatch(/!.*Con error/s);
      boton(raiz(), 'Reintentar esta parte')!.click();
      await hasta(() => !!boton(raiz(), 'Abrir mi caso'));
      g.liberar('scene', 'recepcion');
    });
  });

  it('al salir de la pantalla deja de pedir etapas', async () => {
    const { g, harness, raiz, hasta, ir } = await montar();
    g.retener('skeleton');
    await ir();
    await hasta(() => anuncio(raiz()) === 'Armando el esqueleto');
    await harness.navigateByUrl('/portal/casos/nuevo');
    g.liberar('skeleton');
    await new Promise((r) => setTimeout(r, 20));
    expect(g.llamadas.filter((l) => l.metodo === 'generationScene')).toHaveLength(0);
  });
});
