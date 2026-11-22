import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { LiveRegionAnnouncer } from '../../../core/a11y/live-announcer.service';
import { InstructorApi } from '../../../core/api/instructor.api';
import { NotificationService } from '../../../core/notifications/notification.service';
import {
  FormativeLevel, RubricCriterionView, RubricEvaluationView, RubricLevelOption,
} from '../../../core/models/simulation.model';
import { RubricaIntentoComponent } from './rubrica-intento.component';

/**
 * La valoración de un intento (bloque B5b): el formulario de rúbrica que vivía en `instructor-trace`, extraído con el
 * MISMO comportamiento. Aquí están TODOS los casos de rúbrica que tenía `instructor-trace.component.spec.ts` (por
 * niveles, valoración formativa RN-09 y el grupo con nombre), con los mismos datos y las mismas expectativas; solo
 * cambian los selectores de clase (`.tr-*` → `.ri-*`). Lo que es de la pantalla (recargar la traza, la región de
 * estado, el perfil del sistema) sigue en la prueba de `instructor-trace`.
 */
const criterion = (id: number, title: string, competency = 'ETICA_PROFESIONAL'): RubricCriterionView => ({
  id, competency, title, description: `Descripción de ${title}`, weight: 50, displayOrder: id,
});

const LEVELS: RubricLevelOption[] = [
  { value: 'EN_INICIO', label: 'En inicio', descriptor: 'Aún no muestra la conducta esperada.' },
  { value: 'EN_PROCESO', label: 'En proceso', descriptor: 'La muestra a veces y con apoyo.' },
  { value: 'LOGRADO', label: 'Logrado', descriptor: 'La muestra de forma sostenida.' },
  { value: 'DESTACADO', label: 'Destacado', descriptor: 'La muestra y además la fundamenta.' },
];

function rubricFixture(overrides: Partial<RubricEvaluationView> = {}): RubricEvaluationView {
  return {
    attemptId: 'a-1', rubricId: 7, rubricName: 'Rúbrica básica de desempeño', description: 'Evalúa el desempeño formativo.',
    criteria: [criterion(1, 'Ética profesional'), criterion(2, 'Ruta de atención', 'RUTA_DE_ATENCION')], scores: [], levels: LEVELS,
    overallLevel: null, comment: '', ...overrides,
  };
}

describe('valoración de un intento (rubrica-intento, B5b)', () => {
  let fixture: ComponentFixture<RubricaIntentoComponent>;
  let api: { saveRubric: ReturnType<typeof vi.fn> };
  let notify: Record<'success' | 'error' | 'warning' | 'info', ReturnType<typeof vi.fn>>;
  let saved: ReturnType<typeof vi.fn<() => void>>;

  const host = () => fixture.nativeElement as HTMLElement;
  const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const criteriaCards = () => [...host().querySelectorAll('.ri-criterio')];
  const levelSelect = (index: number) => criteriaCards()[index].querySelector('select') as HTMLSelectElement;
  /** Elige un nivel en el selector de un criterio, como lo haría el docente. */
  const pick = (index: number, level: FormativeLevel | '') => {
    const select = levelSelect(index);
    select.value = level;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const fillLevels = (first: FormativeLevel = 'LOGRADO', second: FormativeLevel = 'EN_PROCESO') => {
    pick(0, first);
    pick(1, second);
  };
  const saveButton = () => [...host().querySelectorAll('button')]
    .find(button => text(button.querySelector('.ui-button__label')).startsWith('Guardar evaluación')) as HTMLButtonElement;

  async function render(
    evaluacion: RubricEvaluationView | null = rubricFixture(),
    save: () => Observable<RubricEvaluationView> = () => of(rubricFixture({ overallLevel: 'LOGRADO' })),
  ) {
    api = { saveRubric: vi.fn(save) };
    notify = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
    saved = vi.fn<() => void>();
    TestBed.configureTestingModule({
      imports: [RubricaIntentoComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: InstructorApi, useValue: api },
        { provide: NotificationService, useValue: notify },
      ],
    });
    fixture = TestBed.createComponent(RubricaIntentoComponent);
    fixture.componentRef.setInput('attemptId', 'a-1');
    fixture.componentRef.setInput('evaluacion', evaluacion);
    fixture.componentInstance.guardada.subscribe(() => saved());
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  // req: SIEP-CU-04, RNF-04
  describe('rúbrica por niveles', () => {
    it('cada criterio pide un nivel con un selector (sin campo numérico) y cada nivel trae su nombre', async () => {
      await render();
      expect(criteriaCards()).toHaveLength(2);
      expect(host().querySelectorAll('input[type="number"], [min], [max], [step]')).toHaveLength(0);
      for (const index of [0, 1]) {
        expect([...levelSelect(index).options].map(text)).toEqual(['Sin calificar', 'En inicio', 'En proceso', 'Logrado', 'Destacado']);
        expect(text(criteriaCards()[index].querySelector('label'))).toBe('Nivel logrado');
      }
      expect(text(host())).not.toMatch(/total de|Calificación|Rango/);
    });

    it('el descriptor de cada nivel está a la vista y la ayuda del criterio dice el del nivel elegido', async () => {
      await render();
      const descriptors = [...host().querySelectorAll('.ri-niveles__lista > div')]
        .map(item => `${text(item.querySelector('dt'))} ${text(item.querySelector('dd'))}`);
      expect(descriptors).toEqual([
        'En inicio Aún no muestra la conducta esperada.', 'En proceso La muestra a veces y con apoyo.',
        'Logrado La muestra de forma sostenida.', 'Destacado La muestra y además la fundamenta.',
      ]);
      expect(text(criteriaCards()[0].querySelector('.ui-field__message'))).toBe('Elige el nivel que mejor describe la evidencia de este criterio.');

      pick(0, 'LOGRADO');
      expect(text(criteriaCards()[0].querySelector('.ui-field__message'))).toBe('La muestra de forma sostenida.');
    });

    it('guardar sin elegir un nivel en cada criterio no envía nada, lo dice sin la palabra «puntaje» y marca el criterio', async () => {
      await render();
      pick(0, 'LOGRADO');
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.saveRubric).not.toHaveBeenCalled();
      expect(text(host().querySelector('.ri__mensaje'))).toBe('Elige un nivel en cada criterio para guardar la valoración.');
      expect(text(host().querySelector('.ri__mensaje'))).not.toMatch(/puntaje/i);
      expect(text(criteriaCards()[1].querySelector('.ui-field__message--error'))).toBe('Elige un nivel para este criterio.');
      expect(levelSelect(1).getAttribute('aria-invalid')).toBe('true');
      expect(criteriaCards()[0].querySelector('.ui-field__message--error')).toBeNull();
    });

    it('elegir el nivel que faltaba quita el error de ESE criterio', async () => {
      await render();
      saveButton().click();
      fixture.detectChanges();
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(2);

      pick(0, 'EN_INICIO');
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(1);
      pick(1, 'DESTACADO');
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(0);
      expect(host().querySelector('.ri__mensaje--error')).toBeNull();
    });

    it('la falta de un nivel se anuncia a quien usa lector de pantalla', async () => {
      await render();
      const announce = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
      saveButton().click();
      expect(announce).toHaveBeenCalledWith('Elige un nivel en cada criterio para guardar la valoración.', 'polite');
    });

    it('guardar envía por cada criterio {criterionId, level, comment}: nunca un número', async () => {
      await render();
      fillLevels('DESTACADO', 'EN_INICIO');
      const comments = host().querySelectorAll<HTMLTextAreaElement>('.ri-criterio textarea');
      comments[0].value = 'Validó sin juzgar.';
      comments[0].dispatchEvent(new Event('input'));
      saveButton().click();
      await fixture.whenStable();

      expect(api.saveRubric).toHaveBeenCalledTimes(1);
      const [attemptId, rubricId, , scores] = api.saveRubric.mock.calls[0];
      expect(attemptId).toBe('a-1');
      expect(rubricId).toBe(7);
      expect(scores).toEqual([
        { criterionId: 1, level: 'DESTACADO', comment: 'Validó sin juzgar.' },
        { criterionId: 2, level: 'EN_INICIO', comment: '' },
      ]);
      for (const score of scores as object[]) expect(score).not.toHaveProperty('score');
    });

    it('los niveles ya guardados parten elegidos en el formulario', async () => {
      await render(rubricFixture({
        scores: [
          { criterionId: 1, level: 'LOGRADO', comment: 'Bien.', evidence: {} },
          { criterionId: 2, level: 'EN_PROCESO', comment: null, evidence: {} },
        ],
        overallLevel: 'EN_PROCESO',
      }));
      expect(levelSelect(0).value).toBe('LOGRADO');
      expect(levelSelect(1).value).toBe('EN_PROCESO');
      expect(text(criteriaCards()[0].querySelector('ui-badge'))).toBe('Logrado');
      expect(text(criteriaCards()[1].querySelector('ui-badge'))).toBe('En proceso');
      expect((criteriaCards()[0].querySelector('textarea') as HTMLTextAreaElement).value).toBe('Bien.');
    });

    it('una rúbrica sin criterios no envía una lista vacía: pide un nivel o una retroalimentación', async () => {
      await render(rubricFixture({ criteria: [] }));
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(api.saveRubric).not.toHaveBeenCalled();
      expect(text(host().querySelector('.ri__mensaje'))).toBe('Elige un nivel o escribe una retroalimentación para guardar.');

      const comment = host().querySelector<HTMLTextAreaElement>('.ri__general textarea')!;
      comment.value = 'Buen trabajo.';
      comment.dispatchEvent(new Event('input'));
      saveButton().click();
      await fixture.whenStable();
      expect(api.saveRubric).toHaveBeenCalledTimes(1);
      expect(api.saveRubric.mock.calls[0][2]).toBe('Buen trabajo.');
      expect(api.saveRubric.mock.calls[0][3]).toEqual([]);
    });

    it('si el servidor no manda los niveles con su descriptor, ofrece igual los cuatro nombres', async () => {
      await render(rubricFixture({ levels: undefined }));
      expect([...levelSelect(0).options].map(text)).toEqual(['Sin calificar', 'En inicio', 'En proceso', 'Logrado', 'Destacado']);
    });

    // Antes: «avisa con un aviso y refresca la traza». Refrescar es de la pantalla: aquí se comprueba que la
    // valoración avisa a la pantalla (`guardada`); la recarga sigue probada en `instructor-trace.component.spec.ts`.
    it('al guardar con éxito avisa con un aviso y le dice a la pantalla que recargue la traza', async () => {
      await render();
      fillLevels();
      saveButton().click();
      await fixture.whenStable();

      expect(notify.success).toHaveBeenCalledWith('Evaluación guardada correctamente.');
      expect(saved).toHaveBeenCalledTimes(1);
    });

    it('si el servidor rechaza el guardado, lo dice en línea junto al botón y no con un aviso de éxito', async () => {
      await render(rubricFixture(), () => throwError(() => new HttpErrorResponse({ status: 500 })));
      const announce = vi.spyOn(TestBed.inject(LiveRegionAnnouncer), 'announce');
      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(host().querySelector('.ri__mensaje'))).toContain('No fue posible guardar la evaluación');
      expect(host().querySelector('.ri__pie')?.contains(host().querySelector('.ri__mensaje'))).toBe(true);
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('No fue posible guardar la evaluación'), 'assertive');
      expect(notify.success).not.toHaveBeenCalled();
      expect(saved).not.toHaveBeenCalled();
    });
  });

  // req: RN-09
  describe('valoración formativa (RN-09)', () => {
    it('rotula el total como «Valoración formativa» con el nivel que envía el servidor y ningún número', async () => {
      await render(rubricFixture({
        overallLevel: 'LOGRADO',
        scores: [{ criterionId: 1, level: 'LOGRADO', comment: null, evidence: {} }],
      }));
      const valuation = host().querySelector('.ri-valoracion')!;
      expect(text(valuation)).toContain('Valoración formativa');
      expect(text(valuation)).toContain('Logrado');
      expect(text(valuation)).not.toMatch(/\d/);
    });

    it('sin evaluación aún: «Pendiente»; nunca una suma local de lo que se elige', async () => {
      await render();
      expect(text(host().querySelector('.ri-valoracion'))).toContain('Pendiente');
      fillLevels('DESTACADO', 'DESTACADO');
      expect(text(host().querySelector('.ri-valoracion'))).toContain('Pendiente');
      expect(text(host().querySelector('.ri-valoracion'))).not.toMatch(/\d/);
    });
  });

  // req: SIEP-CU-04, RNF-04 (revisión de F7)
  it('cada criterio es un grupo con nombre: sus campos «Calificación» no quedan sueltos', async () => {
    await render();
    const group = criteriaCards()[1];
    expect(group.getAttribute('role')).toBe('group');
    const labelledBy = group.getAttribute('aria-labelledby')!;
    expect(text(host().querySelector('#' + labelledBy))).toBe('Ruta de atención');
    // `article` no admite role="group" (Axe: aria-allowed-role, 16 nodos en la línea base de F7): el grupo va sobre un
    // elemento que sí lo admite (ni `li`, que tampoco lo admite).
    expect(group.tagName).not.toBe('ARTICLE');
    expect(group.tagName).not.toBe('LI');
  });

  // Nuevo en B5b: lo que la pantalla necesita del formulario extraído.
  describe('contrato con la pantalla (B5b)', () => {
    it('hayCambios() es falso al abrir, verdadero tras elegir o escribir, y vuelve a falso al guardar', async () => {
      await render();
      const form = fixture.componentInstance;
      expect(form.hayCambios()).toBe(false);
      pick(0, 'LOGRADO');
      expect(form.hayCambios()).toBe(true);
      pick(0, '');
      expect(form.hayCambios()).toBe(false);

      const general = host().querySelector<HTMLTextAreaElement>('.ri__general textarea')!;
      general.value = 'Muy bien.';
      general.dispatchEvent(new Event('input'));
      expect(form.hayCambios()).toBe(true);

      fillLevels();
      saveButton().click();
      await fixture.whenStable();
      expect(form.hayCambios()).toBe(false);
    });

    it('al llegar otra valoración (otro intento) el formulario parte de lo guardado y sin avisos', async () => {
      await render();
      saveButton().click();
      fixture.detectChanges();
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(2);

      fixture.componentRef.setInput('attemptId', 'a-2');
      fixture.componentRef.setInput('evaluacion', rubricFixture({
        attemptId: 'a-2', scores: [{ criterionId: 1, level: 'DESTACADO', comment: 'Otro.', evidence: {} }],
      }));
      fixture.detectChanges();
      expect(host().querySelectorAll('.ui-field__message--error')).toHaveLength(0);
      expect(host().querySelector('.ri__mensaje')).toBeNull();
      expect(levelSelect(0).value).toBe('DESTACADO');
      expect(fixture.componentInstance.hayCambios()).toBe(false);
    });

    it('«Guardar evaluación» va en el pie fijo, que dice cuánto falta y que el estudiante la verá', async () => {
      await render();
      const pie = host().querySelector('.ri__pie')!;
      expect(pie.contains(saveButton())).toBe(true);
      expect(text(pie)).toContain('0 de 2 criterios con nivel');
      expect(text(pie)).toContain('tu estudiante la verá en el cierre del caso');
      pick(0, 'LOGRADO');
      expect(text(pie)).toContain('1 de 2 criterios con nivel');
    });

    it('sin valoración no pinta nada (la pantalla dice por qué)', async () => {
      await render(null);
      expect(text(host())).toBe('');
      expect(fixture.componentInstance.hayCambios()).toBe(false);
    });
  });
});
