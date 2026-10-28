import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AuthoringApi } from '../../core/api/authoring.api';
import { SimulationCaseSummary } from '../../core/models/simulation.model';
import { CaseAuthoringHubComponent } from './case-authoring-hub.component';

/**
 * Hub de edición de casos en el sistema de la biblioteca (plan visual F7-7): estados de la lista de a uno (esqueleto,
 * error con «Reintentar», vacío con su acción) y el estado del caso con su etiqueta humana («Borrador», nunca `DRAFT`).
 * P6: todo caso nuevo empieza eligiendo un lugar (`casos/nuevo`); ya no hay formulario de caso en blanco.
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
  let api: { listAuthoringCases: ReturnType<typeof vi.fn> };

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const labelled = (label: string) => [...host().querySelectorAll('button, a')]
    .find(el => text(el.querySelector('.ui-button__label')) === label) as HTMLElement | undefined;
  const cards = () => [...host().querySelectorAll('.hub-card')];

  async function render(list?: () => Observable<SimulationCaseSummary[]>, { stable = true } = {}) {
    api = {
      listAuthoringCases: vi.fn(list ?? (() => of([borrador, publicado]))),
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
      const crear = labelled('Crear un caso nuevo')!;
      expect(crear.getAttribute('href')).toBe('/portal/casos/nuevo');
    });

    it('ya no hay formulario de caso en blanco: ni botón «Agregar nuevo caso» ni campos de título', async () => {
      await render();
      expect(labelled('Agregar nuevo caso')).toBeUndefined();
      expect(host().querySelector('form, [formControlName]')).toBeNull();
    });

    // F8-0 abrió «Editar casos» al docente (E2-4): el antetítulo ya no puede decir «Modalidad administrador».
    it('el antetítulo no dice «administrador»: el docente también autora sus casos', async () => {
      await render();
      expect(text(host().querySelector('.ui-page-header__eyebrow'))).toBe('Autoría de casos');
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
      expect(text(edit)).toContain('Abrir entorno de edición');
      // ED-5: el hub es del administrador y el administrador no juega: probar el caso es la «Vista previa» del editor,
      // no un enlace a la sala (que lo mandaba a «Sin permiso» desde su propia pantalla).
      expect(cards()[0].querySelector('a[href^="/portal/simulador"]')).toBeNull();
      expect(text(cards()[0])).not.toContain('Probar caso');
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

    it('sin casos: vacío con la acción «Crear un caso nuevo», que lleva a elegir un lugar', async () => {
      await render(() => of([]));
      const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const empty = host().querySelector('ui-empty-state')!;
      expect(text(empty)).toContain('Aún no hay casos');
      expect(text(empty)).toContain('eliges un lugar');
      const action = [...empty.querySelectorAll('button')].find(button => text(button.querySelector('.ui-button__label')) === 'Crear un caso nuevo')!;
      action.click();
      expect(navegar).toHaveBeenCalledWith(['/portal/casos/nuevo']);
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
