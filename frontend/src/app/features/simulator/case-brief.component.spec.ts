import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';
import { CaseAccess, CaseBrief } from '../../core/models/simulation.model';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { CaseBriefComponent } from './case-brief.component';

function brief(partial: Partial<CaseBrief> = {}): CaseBrief {
  return {
    caseVersionId: 7,
    title: 'Primer contacto en urgencias',
    context: 'Una joven llega a urgencias acompañada de su abuela después de un episodio de violencia.',
    characters: [
      { id: 1, displayName: 'Enfermera de urgencias', roleLabel: 'Personal de salud', portraitKey: 'enfermera-urgencias' },
      { id: 2, displayName: 'Abuela de la niña', roleLabel: 'Familiar acompañante', portraitKey: 'familia-duelo' },
    ],
    learningObjectives: ['Reconocer señales de riesgo en el primer contacto.', 'Practicar una escucha que no revictimiza.'],
    hasSensitiveContent: true,
    access: { allowed: true },
    ...partial,
  };
}

const failure = (status: number, code?: string) => throwError(() => ({ status, error: code ? { code } : null }));

interface Api {
  getCaseBrief: (caseVersionId: number) => Observable<CaseBrief>;
  startAttempt?: (caseVersionId: number, forceNew?: boolean) => Observable<unknown>;
}

/**
 * La ficha del caso antes de empezar (plan visual F10-1; RF-16, CU-07; contrato C8). Es una lectura: nunca crea el
 * intento (RN-07). «Comenzar» pasa al juego, que es donde está el aviso de contenido (ETH-01); el acceso que el
 * servidor decide (ventana, secuencia, asignación) se dice con palabras y deshabilita «Comenzar» con su motivo.
 */
// req: RF-16, CU-07, RNF-04, BLOQUE-H
describe('CaseBriefComponent', () => {
  let fixture: ComponentFixture<CaseBriefComponent>;
  let navigate: ReturnType<typeof vi.fn>;
  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  // Lo que oye un lector de pantalla: sin los iconos ni el motivo oculto del botón deshabilitado.
  const spoken = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    copy.querySelectorAll('[aria-hidden="true"], [hidden]').forEach(node => node.remove());
    return text(copy);
  };
  const button = (name: string) => [...host().querySelectorAll('button, a')].find(el => spoken(el) === name) as HTMLElement | undefined;

  async function render(api: Partial<Api> = {}, access?: CaseAccess) {
    const service: Api = {
      getCaseBrief: () => of(brief(access ? { access } : {})),
      startAttempt: vi.fn(() => of({})),
      ...api,
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        { provide: SimulationService, useValue: service },
        { provide: KitService, useValue: fakeKitService() },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ caseVersionId: '7' }) } } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
    fixture = TestBed.createComponent(CaseBriefComponent);
    await fixture.whenStable();
    return service;
  }

  it('muestra la ficha sin crear intento: título, contexto, objetivos y personajes', async () => {
    const service = await render();
    expect(host().querySelectorAll('h1')).toHaveLength(1);
    expect(text(host().querySelector('h1'))).toBe('Primer contacto en urgencias');
    expect(text(host())).toContain('Una joven llega a urgencias');
    expect([...host().querySelectorAll('.brief-objective')].map(text)).toEqual([
      'Reconocer señales de riesgo en el primer contacto.', 'Practicar una escucha que no revictimiza.',
    ]);
    expect([...host().querySelectorAll('.brief-character h3')].map(text)).toEqual(['Enfermera de urgencias', 'Abuela de la niña']);
    expect(service.startAttempt).not.toHaveBeenCalled();
  });

  it('las secciones tienen nombre propio (h2) para recorrerlas con el lector de pantalla', async () => {
    await render();
    expect([...host().querySelectorAll('h2')].map(text)).toEqual(['Contexto', 'Objetivos de aprendizaje', 'Personajes']);
  });

  it('cada personaje trae su retrato del kit (decorativo: el nombre y el rol ya lo dicen) y su rol en palabras', async () => {
    await render();
    const portraits = [...host().querySelectorAll('.brief-character app-kit-figure')];
    expect(portraits).toHaveLength(2);
    expect(portraits.map(el => el.querySelector('.kit-figure')?.getAttribute('aria-hidden'))).toEqual(['true', 'true']);
    expect([...host().querySelectorAll('.brief-character__role')].map(text)).toEqual(['Personal de salud', 'Familiar acompañante']);
  });

  it('un personaje sin receta en el kit no rompe la ficha: se queda con su nombre y su rol', async () => {
    const service: Api = {
      getCaseBrief: () => of(brief({
        characters: [{ id: 9, displayName: 'Vecina', roleLabel: 'Testigo', portraitKey: 'no-existe' }],
      })),
    };
    await render(service);
    expect(text(host().querySelector('.brief-character h3'))).toBe('Vecina');
    expect(host().querySelector('.brief-character app-kit-figure')).toBeNull();
  });

  it('«Comenzar» pasa al juego del caso, donde está el aviso de contenido; no inicia el intento él mismo', async () => {
    const service = await render();
    button('Comenzar')!.click();
    expect(navigate).toHaveBeenCalledWith(['/portal/simulador', 7]);
    expect(service.startAttempt).not.toHaveBeenCalled();
  });

  it('la acción principal vive en una barra pegada al pie para verse sin desplazar la ficha (1366×768)', async () => {
    await render();
    const bar = host().querySelector('.brief-actions--pegajosa')!;
    expect(bar.querySelector('button')?.textContent).toContain('Comenzar');
    expect(bar.textContent).toContain('Volver al catálogo');
    // La barra es el último bloque de la ficha, después del contexto y del aviso de contenido.
    expect(host().querySelector('.brief-sensitive')!.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getComputedStyle(bar).position).toBe('sticky');
  });

  it('«Volver al catálogo» regresa sin dejar nada abierto', async () => {
    const service = await render();
    button('Volver al catálogo')!.click();
    expect(navigate).toHaveBeenCalledWith(['/portal/simulador']);
    expect(service.startAttempt).not.toHaveBeenCalled();
  });

  it('con contenido sensible lo avisa antes de entrar y recuerda que se puede salir en cualquier momento', async () => {
    await render();
    const note = host().querySelector('.brief-sensitive')!;
    expect(text(note)).toContain('Antes de entrar verás un aviso');
    expect(text(note)).toContain('Salida segura');
  });

  it('sin contenido sensible no pinta ese aviso', async () => {
    await render({ getCaseBrief: () => of(brief({ hasSensitiveContent: false })) });
    expect(host().querySelector('.brief-sensitive')).toBeNull();
  });

  it('sin objetivos ni personajes no pinta secciones vacías: queda el contexto y se dice que falta lo demás', async () => {
    await render({ getCaseBrief: () => of(brief({ characters: [], learningObjectives: [] })) });
    expect([...host().querySelectorAll('h2')].map(text)).toEqual(['Contexto']);
    expect(text(host().querySelector('.brief-pending'))).toContain('Tu docente aún no ha redactado');
    expect(button('Comenzar')!.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('un caso que aún no abre deja «Comenzar» deshabilitado con su motivo, que dice cuándo abre', async () => {
    await render({}, { allowed: false, reason: 'NOT_YET_OPEN', opensAt: '2026-10-20T08:00:00' });
    const start = button('Comenzar')!;
    expect(start.getAttribute('aria-disabled')).toBe('true');
    const reason = document.getElementById(start.getAttribute('aria-describedby')!.split(' ').find(id => document.getElementById(id))!);
    expect(text(reason)).toMatch(/20 de oct/);
    expect(text(host().querySelector('.brief-access'))).toContain('Aún no abre');
    start.click();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('un caso cerrado o bloqueado por la secuencia también explica por qué no se puede comenzar', async () => {
    await render({}, { allowed: false, reason: 'CLOSED', closesAt: '2026-10-05T23:59:00' });
    expect(text(host().querySelector('.brief-access'))).toContain('Ya cerró');
    expect(button('Comenzar')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('403 de «no asignado»: lo dice sin mostrar nada del caso y deja volver al catálogo', async () => {
    await render({ getCaseBrief: () => failure(403, 'ACCESS_NOT_ASSIGNED') });
    expect(text(host())).toContain('Este caso no está asignado a tu cuenta');
    expect(host().querySelector('.brief-character')).toBeNull();
    expect(button('Comenzar')).toBeUndefined();
    button('Volver al catálogo')!.click();
    expect(navigate).toHaveBeenCalledWith(['/portal/simulador']);
  });

  it('404: el caso no existe o no está publicado, y no es un error de red', async () => {
    await render({ getCaseBrief: () => failure(404, 'NOT_FOUND') });
    expect(text(host())).toContain('No encontramos este caso');
    expect([...host().querySelectorAll('ui-error-state button')].map(text)).not.toContain('Reintentar');
    expect(button('Volver al catálogo')).toBeDefined();
  });

  it('error del servidor: «Reintentar» vuelve a pedir la ficha y, si responde, la pinta', async () => {
    let calls = 0;
    await render({ getCaseBrief: () => (++calls === 1 ? failure(500) : of(brief())) });
    const retry = [...host().querySelectorAll('ui-error-state button')].find(el => text(el).includes('Reintentar')) as HTMLElement;
    expect(retry).toBeDefined();
    expect(host().querySelector('.brief-character')).toBeNull();
    retry.click();
    await fixture.whenStable();
    expect(calls).toBe(2);
    expect(text(host().querySelector('h1'))).toBe('Primer contacto en urgencias');
    expect(host().querySelector('ui-error-state')).toBeNull();
  });
});
