import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AuthoringApi } from '../../core/api/authoring.api';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { CaseAuthoringHubComponent } from './case-authoring-hub.component';

/**
 * Hub de edición de casos en el sistema de la biblioteca (plan visual F7-7): estados de la lista de a uno (esqueleto,
 * error con «Reintentar», vacío con su acción), creación con su error y su reintento, y el estado del caso con su
 * etiqueta humana («Borrador», nunca `DRAFT`).
 */
const borrador = {
  caseVersionId: 1, code: 'CASO-PSICO-001', title: 'Violencia familiar', description: 'Contexto del caso.',
  semanticVersion: '0.1.0', status: 'DRAFT', nodeCount: 6,
} as unknown as SimulationCaseSummary;
const publicado = {
  caseVersionId: 2, code: 'CASO-PSICO-002', title: 'Duelo y pérdida', description: 'Otro contexto.',
  semanticVersion: '1.0.0', status: 'PUBLISHED', nodeCount: 1,
} as unknown as SimulationCaseSummary;

describe('hub de edición de casos (F7-7)', () => {
  let fixture: ComponentFixture<CaseAuthoringHubComponent>;
  let api: { listAuthoringCases: ReturnType<typeof vi.fn>; createCase: ReturnType<typeof vi.fn> };

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const labelled = (label: string) => [...host().querySelectorAll('button, a')]
    .find(el => text(el.querySelector('.ui-button__label')) === label) as HTMLElement | undefined;
  const cards = () => [...host().querySelectorAll('.hub-card')];

  async function render(list?: () => Observable<SimulationCaseSummary[]>, { stable = true } = {}) {
    api = {
      listAuthoringCases: vi.fn(list ?? (() => of([borrador, publicado]))),
      createCase: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [CaseAuthoringHubComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthoringApi, useValue: api }],
    });
    fixture = TestBed.createComponent(CaseAuthoringHubComponent);
    if (stable) await fixture.whenStable();
    else fixture.detectChanges();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // req: RNF-04, BLOQUE-H
  describe('estados', () => {
    it('un solo h1 «Edición de casos», la región de estado siempre presente y la acción en la cabecera', async () => {
      await render();
      expect(host().querySelectorAll('h1')).toHaveLength(1);
      expect(text(host().querySelector('h1'))).toBe('Edición de casos');
      expect(host().querySelector('[role="status"].ds-sr-only')).not.toBeNull();
      expect(labelled('Agregar nuevo caso')).toBeDefined();
    });

    it('con casos: una tarjeta por caso con su estado en lenguaje humano y sus dos acciones', async () => {
      await render();
      expect(cards()).toHaveLength(2);
      expect(text(cards()[0].querySelector('ui-badge'))).toBe('Borrador');
      expect(text(cards()[1].querySelector('ui-badge'))).toBe('Publicado');
      expect(text(cards()[0])).toContain('Violencia familiar');
      expect(text(cards()[0])).toContain('6 nodos');
      expect(text(cards()[1])).toContain('1 nodo');
      expect(text(host())).not.toMatch(/\bDRAFT\b|\bPUBLISHED\b/);
      const edit = cards()[0].querySelector('a[href="/portal/casos/1/editor"]');
      const play = cards()[0].querySelector('a[href="/portal/simulador/1"]');
      expect(text(edit)).toContain('Abrir entorno de edición');
      expect(text(play)).toContain('Probar caso');
    });

    it('mientras carga: esqueleto con aria-busy, el estado leído y ninguna tarjeta', async () => {
      vi.useFakeTimers();
      const pending = new Subject<SimulationCaseSummary[]>();
      await render(() => pending, { stable: false });
      await vi.advanceTimersByTimeAsync(200);
      fixture.detectChanges();

      expect(host().querySelectorAll('ui-skeleton').length).toBeGreaterThan(0);
      expect(host().querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(cards()).toHaveLength(0);
      expect(text(host().querySelector('[role="status"].ds-sr-only'))).toBe('Cargando casos…');
    });

    it('si la lista falla: UN error con «Reintentar» que la vuelve a pedir, y NO el vacío', async () => {
      let calls = 0;
      await render(() => (++calls === 1 ? throwError(() => new Error('HTTP 500')) : of([borrador])));
      const errors = host().querySelectorAll('ui-error-state');
      expect(errors).toHaveLength(1);
      expect(text(errors[0])).toContain('No fue posible cargar los casos disponibles.');
      expect(host().querySelector('ui-empty-state')).toBeNull();

      (errors[0].querySelector('button') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(calls).toBe(2);
      expect(host().querySelector('ui-error-state')).toBeNull();
      expect(cards()).toHaveLength(1);
    });

    it('sin casos: vacío con la acción «Agregar nuevo caso», que abre el formulario de creación', async () => {
      await render(() => of([]));
      const empty = host().querySelector('ui-empty-state')!;
      expect(text(empty)).toContain('Aún no hay casos');
      const action = [...empty.querySelectorAll('button')].find(button => text(button.querySelector('.ui-button__label')) === 'Agregar nuevo caso')!;
      action.click();
      fixture.detectChanges();

      expect(host().querySelector('.hub-create form')).not.toBeNull();
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('creación', () => {
    async function open() {
      labelled('Agregar nuevo caso')!.click();
      fixture.detectChanges();
    }
    const field = (name: string) => host().querySelector(`.hub-create [formControlName="${name}"]`) as HTMLInputElement;
    const type = (el: HTMLInputElement, value: string) => {
      el.value = value;
      el.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const submit = () => {
      (host().querySelector('.hub-create button[type="submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
    };

    it('«Agregar nuevo caso» abre el formulario y el mismo botón pasa a «Cerrar»', async () => {
      await render();
      await open();

      expect(host().querySelector('.hub-create form')).not.toBeNull();
      expect(labelled('Cerrar')).toBeDefined();
      labelled('Cerrar')!.click();
      fixture.detectChanges();
      expect(host().querySelector('.hub-create')).toBeNull();
    });

    it('enviar sin título lo explica en línea, lleva el foco al campo y no llama al servidor', async () => {
      await render();
      document.body.appendChild(host());
      try {
        await open();
        field('code').focus();

        submit();

        expect(text(host().querySelector('.hub-create .ui-field__message--error'))).toBe('Escribe el título del caso.');
        expect(api.createCase).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(field('title'));
      } finally {
        host().remove();
      }
    });

    it('con título crea el caso y abre su editor', async () => {
      await render();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      api.createCase.mockReturnValue(of({ caseVersionId: 9 }));
      await open();
      type(field('title'), 'Caso nuevo');
      type(field('code'), 'CASO-9');

      submit();

      expect(api.createCase).toHaveBeenCalledWith({ title: 'Caso nuevo', code: 'CASO-9', description: null });
      expect(navigate).toHaveBeenCalledWith(['/portal/casos', 9, 'editor']);
    });

    it('si la creación falla: el error dice qué revisar, con «Reintentar» que la envía de nuevo con los mismos datos', async () => {
      await render();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      let calls = 0;
      api.createCase.mockImplementation(() => (++calls === 1 ? throwError(() => new Error('HTTP 409')) : of({ caseVersionId: 9 })));
      await open();
      type(field('title'), 'Caso nuevo');

      submit();
      const failure = host().querySelector('.hub-create ui-error-state')!;
      expect(text(failure)).toContain('No fue posible crear el caso. Revisa que el código no exista y vuelve a intentar.');
      expect(field('title').value).toBe('Caso nuevo');

      (failure.querySelector('button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(api.createCase).toHaveBeenCalledTimes(2);
      expect(navigate).toHaveBeenCalledWith(['/portal/casos', 9, 'editor']);
    });

    it('mientras crea, el botón dice «Creando…», queda ocupado y no se envía dos veces', async () => {
      await render();
      const pending = new Subject<{ caseVersionId: number }>();
      api.createCase.mockReturnValue(pending);
      await open();
      type(field('title'), 'Caso nuevo');

      submit();
      const save = host().querySelector('.hub-create button[type="submit"]') as HTMLButtonElement;
      expect(text(save.querySelector('.ui-button__label'))).toBe('Creando…');
      expect(save.getAttribute('aria-busy')).toBe('true');
      save.click();
      expect(api.createCase).toHaveBeenCalledTimes(1);
    });
  });

  // req: RNF-04, BLOQUE-H
  describe('estructura', () => {
    it('ninguna región repite el nombre de otra y no quedan restos de Material', async () => {
      await render();
      const names = [...host().querySelectorAll('section[aria-labelledby], [role="region"][aria-label]')].map(el => {
        const labelledBy = el.getAttribute('aria-labelledby');
        return labelledBy ? text(host().querySelector(`#${labelledBy}`)) : el.getAttribute('aria-label');
      });
      expect(new Set(names).size).toBe(names.length);
      expect(host().querySelector('mat-progress-bar, mat-card, .psy-button, .state-message')).toBeNull();
    });
  });
});
