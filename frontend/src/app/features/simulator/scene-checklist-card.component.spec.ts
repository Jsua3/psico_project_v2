import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio, hexToRgb, rgbToHex } from '../../../styles/contrast.util';
import { ENTITY_NAMES, ORIENTATION_COPY, ROUTE_ORDER, RoomGroup } from './orientation.config';
import { SceneChecklistCardComponent } from './scene-checklist-card.component';
import { MapObjectState } from '../../core/models/simulation.model';
import { OptionalEntry, SceneLogGroup, SceneLogState, SceneLogStep, deriveSceneLog } from './scene-checklist.util';
import { STAGE_ROUTES } from './stage-route.config';

type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

/** Texto accesible aproximado: contenido sin lo oculto a las tecnologías de apoyo (aria-hidden). */
function accessibleText(element: HTMLElement): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement) || node.getAttribute('aria-hidden') === 'true') return '';
    return Array.from(node.childNodes).map(walk).join('');
  };
  return walk(element).replace(/\s+/g, ' ').trim();
}

/** Texto que ve el estudiante: el accesible menos lo que solo leen las tecnologías de apoyo. */
function visibleText(element: HTMLElement): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    if (node.getAttribute('aria-hidden') === 'true' || node.classList.contains('visually-hidden')) return '';
    return Array.from(node.childNodes).map(walk).join('');
  };
  return walk(element).replace(/\s+/g, ' ').trim();
}

function step(partial: Pick<SceneLogStep, 'id' | 'label' | 'state'> & Partial<SceneLogStep>): SceneLogStep {
  return {
    kind: 'talk', weight: 'prep', place: null, roomLabel: null, here: true, note: null,
    targetKey: partial.id, room: 'urgencias', doneText: `Anotado: ${partial.label}`,
    ...partial,
  };
}

const PLACE = 'a la izquierda, al frente';

/** Etapa 1 al empezar (F§5.2): el primer paso es recoger el material de apoyo. */
function stageOne(overrides: Partial<SceneLogState> = {}, steps?: SceneLogStep[]): SceneLogState {
  const group: SceneLogGroup = {
    room: 'urgencias', header: null, current: true, collapsed: false,
    steps: steps ?? [
      step({ id: 'u1-recoger', kind: 'collect', state: 'next', place: PLACE, targetKey: 'tool-pap',
        label: 'Recoge el material de apoyo de la sala' }),
      step({ id: 'u1-familia', weight: 'route', state: 'pending', targetKey: 'familia-crisis',
        label: 'Habla con la Familia en crisis' }),
      step({ id: 'u1-usar', kind: 'use', state: 'locked', targetKey: 'familia-crisis',
        label: 'Usa el material de apoyo en esa conversación', note: 'Primero recoge el material de apoyo de la sala.' }),
      step({ id: 'u1-enfermera', state: 'pending', targetKey: 'npc:enfermera-urgencias',
        label: 'Habla con la Enfermera de urgencias' }),
      step({ id: 'u1-puerta', kind: 'door', weight: 'route', state: 'pending', targetKey: 'puerta-sala-escucha',
        label: 'Pasa a la Sala de escucha familiar' }),
      step({ id: 'u1-decidir', kind: 'decide', weight: 'decision', state: 'pending', room: 'sala-escucha',
        targetKey: 'familia-duelo', here: false, roomLabel: 'en la Sala de escucha familiar',
        label: 'Toma tu primera decisión con la Familia en crisis' }),
    ],
  };
  return {
    number: 1, total: 6, title: 'Urgencia vital y crisis',
    intro: 'Estás en Urgencias. Reúne lo que necesites aquí y pasa a la Sala de escucha familiar: ahí tomarás tu primera decisión.',
    next: { stepId: 'u1-recoger', targetKey: 'tool-pap', room: 'urgencias', isHere: true, hopDoorKey: null },
    nextLine: `Ahora: Recoge el material de apoyo de la sala · ${PLACE}`,
    groups: [group],
    optional: [
      { key: 'medico-guardia', label: 'Médico de guardia', seen: false, kind: 'person', mark: 'aún no' },
      { key: 'zona-restringida', label: 'Acceso a quirófano', seen: true, kind: 'object', mark: 'ya revisaste' },
    ],
    prepDone: 0, prepTotal: 3,
    footer: 'Recomendado antes de decidir: 0 de 3 hechos. Puedes decidir cuando quieras.',
    ...overrides,
  };
}

/** Etapa 1 con el primer paso hecho: «Siguiente» salta a hablar con la familia. */
function stageOneAfterCollect(): SceneLogState {
  const base = stageOne();
  const steps = base.groups[0].steps.map(s => {
    if (s.id === 'u1-recoger') return { ...s, state: 'done' as const, place: null };
    if (s.id === 'u1-familia') return { ...s, state: 'next' as const, place: 'en el extremo izquierdo, al frente' };
    if (s.id === 'u1-usar') return { ...s, state: 'pending' as const, note: 'Aparece como opción dentro de la conversación.' };
    return s;
  });
  return stageOne({
    next: { stepId: 'u1-familia', targetKey: 'familia-crisis', room: 'urgencias', isHere: true, hopDoorKey: null },
    prepDone: 1,
    footer: 'Recomendado antes de decidir: 1 de 3 hechos. Puedes decidir cuando quieras.',
  }, steps);
}

const source = readFileSync(join(__dirname, 'scene-checklist-card.component.ts'), 'utf-8');
const css = source.slice(source.indexOf('styles: ['));
const template = source.slice(source.indexOf('template: `'), source.indexOf('styles: ['));

/** Cuerpo de la PRIMERA regla cuyo selector es exactamente `selector`. */
function ruleBody(selector: string, from = css): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = from.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No se encontró la regla ${selector}`);
  return match[2];
}

describe('SceneChecklistCardComponent (T3.1)', () => {
  let fixture: ComponentFixture<SceneChecklistCardComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(host().querySelectorAll<HTMLElement>('li.step'));
  const rowById = (id: string) => host().querySelector<HTMLElement>(`li.step[data-step-id="${id}"]`) as HTMLElement;
  const toggle = () => host().querySelector<HTMLButtonElement>('[data-checklist-toggle]') as HTMLButtonElement;
  const note = () => host().querySelector<HTMLElement>('[aria-live]') as HTMLElement;

  function create(inputs: Partial<{
    state: SceneLogState | null; compact: boolean; reduceMotion: boolean; notice: string | null;
  }> = {}): void {
    fixture?.destroy();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SceneChecklistCardComponent] });
    fixture = TestBed.createComponent(SceneChecklistCardComponent);
    const component = fixture.componentInstance;
    writeInputSignal(component.state, inputs.state === undefined ? stageOne() : inputs.state);
    if (inputs.compact !== undefined) writeInputSignal(component.compact, inputs.compact);
    if (inputs.reduceMotion !== undefined) writeInputSignal(component.reduceMotion, inputs.reduceMotion);
    if (inputs.notice !== undefined) writeInputSignal(component.notice, inputs.notice);
    fixture.detectChanges();
  }

  function update<T>(input: () => T, value: T): void {
    writeInputSignal(input, value);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  describe('estructura y semántica', () => {
    it('es una región «Qué hacer» con un <ol> y una fila por paso', () => {
      create();
      const section = host().querySelector('section.checklist') as HTMLElement;
      expect(section).not.toBeNull();
      expect(section.getAttribute('aria-label')).toBe('Qué hacer');
      expect(host().querySelectorAll('ol')).toHaveLength(1);
      expect(rows()).toHaveLength(6);
      expect(host().querySelector('h2')?.textContent?.trim()).toBe('Qué hacer');
    });

    it('cada fila empieza con el texto oculto de su estado (F§5.1)', () => {
      create();
      const prefix = (id: string) => rowById(id).querySelector('.step__body .visually-hidden')?.textContent?.trim();
      expect(prefix('u1-recoger')).toBe('Siguiente:');
      expect(prefix('u1-familia')).toBe('Pendiente:');
      expect(prefix('u1-usar')).toBe('Bloqueado hasta:');
      update(fixture.componentInstance.state, stageOneAfterCollect());
      expect(prefix('u1-recoger')).toBe('Hecho:');
      expect(prefix('u1-familia')).toBe('Siguiente:');
      // El texto accesible de la fila arranca con ese estado y sigue con la frase.
      expect(accessibleText(rowById('u1-recoger'))).toMatch(/^Hecho: Recoge el material de apoyo de la sala/);
    });

    it('el estado se ve por la forma de la marca, no solo por el color: cuatro dibujos distintos', () => {
      create();
      update(fixture.componentInstance.state, stageOneAfterCollect());
      const shapes = (id: string) => rowById(id).querySelector('.step__mark svg')?.innerHTML.replace(/\s+/g, ' ') ?? '';
      const done = shapes('u1-recoger');
      const next = shapes('u1-familia');
      const pending = shapes('u1-enfermera');
      expect(done).toContain('<path');
      expect(next).toContain('fill="currentColor"');
      expect(pending).not.toContain('<path');
      const locked = (() => {
        create();
        return shapes('u1-usar');
      })();
      expect(locked).toContain('<rect');
      expect(new Set([done, next, pending, locked]).size).toBe(4);
      // Las marcas son decoración: el estado ya está en el texto oculto.
      for (const mark of Array.from(host().querySelectorAll('.step__mark'))) {
        expect(mark.getAttribute('aria-hidden')).toBe('true');
      }
    });

    it('solo el paso siguiente lleva aria-current="step"', () => {
      create();
      const current = host().querySelectorAll('[aria-current]');
      expect(current).toHaveLength(1);
      expect(current[0].getAttribute('aria-current')).toBe('step');
      expect(current[0].getAttribute('data-step-id')).toBe('u1-recoger');
    });

    it('las filas NO son botones ni contienen controles (no deben chocar con getByRole("button", { name: /familia en crisis/i }))', () => {
      create();
      for (const row of rows()) {
        expect(row.querySelector('button, a, input, [role="button"], [tabindex]')).toBeNull();
      }
      const names = Array.from(host().querySelectorAll('button')).map(accessibleText);
      expect(names.some(name => /familia en crisis/i.test(name))).toBe(false);
      expect(names).toEqual(['Ocultar pasos']);
    });

    it('expone data-next-step y data-next-room para los e2e', () => {
      create();
      const section = host().querySelector('section') as HTMLElement;
      expect(section.getAttribute('data-next-step')).toBe('u1-recoger');
      expect(section.getAttribute('data-next-room')).toBe('urgencias');
      update(fixture.componentInstance.state, stageOneAfterCollect());
      expect(section.getAttribute('data-next-step')).toBe('u1-familia');
      update(fixture.componentInstance.state, stageOne({ next: null }));
      expect(section.hasAttribute('data-next-step')).toBe(false);
      expect(section.hasAttribute('data-next-room')).toBe(false);
    });

    it('un paso de otra sala se rotula con su sala y el lugar solo se dice del siguiente', () => {
      create();
      const where = (id: string) => rowById(id).querySelector('.step__where')?.textContent?.trim() ?? null;
      expect(where('u1-recoger')).toBe('· a la izquierda, al frente');
      expect(where('u1-familia')).toBeNull();
      expect(where('u1-decidir')).toBe('· en la Sala de escucha familiar');
      // Si el siguiente está en otra sala se dice la sala; con sala y lugar, primero la sala.
      const far = stageOne({}, [
        step({ id: 'x', state: 'next', label: 'Habla con la Enfermera de urgencias', roomLabel: 'en Urgencias', place: 'en el centro, al fondo' }),
      ]);
      update(fixture.componentInstance.state, far);
      expect(rowById('x').querySelector('.step__where')?.textContent?.trim()).toBe('· en Urgencias · en el centro, al fondo');
    });

    it('el paso bloqueado muestra el motivo en su propia línea y las aclaraciones solo mientras no está hecho', () => {
      create();
      const reason = rowById('u1-usar').querySelector('.step__note--reason');
      expect(reason?.textContent?.trim()).toBe('Primero recoge el material de apoyo de la sala.');
      update(fixture.componentInstance.state, stageOneAfterCollect());
      expect(rowById('u1-usar').querySelector('.step__note')?.textContent?.trim())
        .toBe('Aparece como opción dentro de la conversación.');
      expect(rowById('u1-usar').querySelector('.step__note--reason')).toBeNull();
      const done = stageOne({}, [
        step({ id: 'd', state: 'done', label: 'Hecho', note: 'No debe verse' }),
      ]);
      update(fixture.componentInstance.state, done);
      expect(host().querySelector('.step__note')).toBeNull();
    });

    it('muestra etapa, introducción, contador «Decisión k de 6» y el pie, sin nada de victoria', () => {
      create();
      const text = visibleText(host());
      expect(text).toContain('Urgencia vital y crisis');
      expect(text).toContain('Estás en Urgencias. Reúne lo que necesites aquí');
      expect(host().querySelector('.checklist__counter')?.textContent?.trim()).toBe('Decisión 1 de 6');
      expect(host().querySelector('.checklist__footer')?.textContent?.trim())
        .toBe('Recomendado antes de decidir: 0 de 3 hechos. Puedes decidir cuando quieras.');
      expect(text).not.toMatch(/completad|logro|puntos?\b|¡|correct|adecuad/i);
    });

    it('sin número de etapa (caso sin ruta autorada) no pinta el contador', () => {
      create({ state: stageOne({ number: 0 }) });
      expect(host().querySelector('.checklist__counter')).toBeNull();
      expect(host().querySelector('section')?.hasAttribute('data-stage')).toBe(false);
    });

    it('sin estado no pinta nada', () => {
      create({ state: null });
      expect(host().querySelector('section')).toBeNull();
      expect(host().textContent?.trim()).toBe('');
      expect(host().getAttribute('data-collapsed')).toBeNull();
    });
  });

  describe('tramos de sala', () => {
    const twoRooms = (): SceneLogState => {
      const hospital: SceneLogGroup = {
        room: 'sala-escucha', header: 'Hospital · Sala de escucha familiar', current: true, collapsed: false,
        steps: [step({ id: 'a', state: 'next', label: 'Sal hacia la Comisaría de Familia', room: 'sala-escucha', kind: 'door' })],
      };
      const comisaria: SceneLogGroup = {
        room: 'recepcion', header: 'Comisaría de Familia · Recepción', current: false, collapsed: false,
        steps: [step({ id: 'b', state: 'pending', label: 'Revisa el Expediente del caso', room: 'recepcion', here: false, roomLabel: 'en la Recepción' })],
      };
      return stageOne({ groups: [hospital, comisaria] });
    };

    it('con varias salas, cada tramo lleva su encabezado y la sala actual dice «estás aquí»', () => {
      create({ state: twoRooms() });
      const headers = Array.from(host().querySelectorAll('.checklist__room')).map(h => h.textContent?.trim());
      expect(headers).toEqual([
        'Hospital · Sala de escucha familiar · estás aquí',
        'Comisaría de Familia · Recepción',
      ]);
      expect(host().querySelectorAll('ol')).toHaveLength(2);
    });

    it('no repite «estás aquí» si el encabezado ya lo trae', () => {
      const state = twoRooms();
      state.groups[0].header = 'Hospital · Sala de escucha familiar · estás aquí';
      create({ state });
      expect(host().querySelector('.checklist__room')?.textContent?.trim())
        .toBe('Hospital · Sala de escucha familiar · estás aquí');
    });

    it('un tramo ya hecho y sin el jugador se pliega en un <details> cerrado', () => {
      const state = twoRooms();
      state.groups[1] = { ...state.groups[1], collapsed: true };
      create({ state });
      const details = host().querySelector('details.checklist__group--collapsed') as HTMLDetailsElement;
      expect(details).not.toBeNull();
      expect(details.open).toBe(false);
      expect(details.querySelector('summary')?.textContent?.trim()).toBe('Comisaría de Familia · Recepción');
      expect(details.querySelectorAll('li.step')).toHaveLength(1);
    });
  });

  describe('nota (región viva)', () => {
    it('hay una sola región aria-live="polite" y lleva el aviso', () => {
      create({ notice: 'Obtuviste: Kit PAP. Ya está en tu barra de herramientas.' });
      const regions = host().querySelectorAll('[aria-live]');
      expect(regions).toHaveLength(1);
      expect(note().getAttribute('aria-live')).toBe('polite');
      expect(note().textContent?.trim()).toBe('Obtuviste: Kit PAP. Ya está en tu barra de herramientas.');
      expect(note().classList).not.toContain('visually-hidden');
    });

    it('sin aviso la región sigue en el DOM (para anunciar el siguiente) pero no se ve', () => {
      create({ notice: null });
      expect(note()).not.toBeNull();
      expect(note().classList).toContain('visually-hidden');
      update(fixture.componentInstance.notice, 'Anotado: hablaste con la Enfermera de urgencias.');
      expect(note().classList).not.toContain('visually-hidden');
      expect(note().textContent?.trim()).toBe('Anotado: hablaste con la Enfermera de urgencias.');
    });

    it('plegada, la región viva sigue anunciando pero queda oculta a la vista', () => {
      create({ notice: 'Decisión 1 registrada' });
      toggle().click();
      fixture.detectChanges();
      expect(note()).not.toBeNull();
      expect(note().classList).toContain('visually-hidden');
      expect(note().textContent?.trim()).toBe('Decisión 1 registrada');
    });

    it('el aviso es el mismo elemento al cambiar de texto (no se recrea: se anuncia el cambio)', () => {
      create({ notice: 'Uno' });
      const first = note();
      update(fixture.componentInstance.notice, 'Dos');
      expect(note()).toBe(first);
    });
  });

  describe('«También en esta sala»', () => {
    it('es un <details> cerrado con el recuento y marcas de texto, sin marcar ninguno como siguiente', () => {
      create();
      const details = host().querySelector('details.checklist__optional') as HTMLDetailsElement;
      expect(details.open).toBe(false);
      expect(details.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('También en esta sala (2)');
      const items = Array.from(details.querySelectorAll('li')).map(li => li.textContent?.replace(/\s+/g, ' ').trim());
      expect(items).toEqual(['Médico de guardia · aún no', 'Acceso a quirófano · ya revisaste']);
      const list = details.querySelector('.checklist__optional-list') as HTMLElement;
      expect(list.querySelector('[aria-current], .step, svg, button')).toBeNull();
      expect(list.textContent).not.toMatch(/Siguiente|Pendiente|Hecho|Bloqueado/);
      expect(details.querySelector('summary svg')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('sin entradas no hay sección', () => {
      create({ state: stageOne({ optional: [] }) });
      expect(host().querySelector('details.checklist__optional')).toBeNull();
    });

    it('sin marca ya calculada la deduce de seen y kind, y calla si no sabe si es persona u objeto', () => {
      const entries: OptionalEntry[] = [
        { key: 'a', label: 'A', seen: false },
        { key: 'b', label: 'B', seen: true, kind: 'person' },
        { key: 'c', label: 'C', seen: true, kind: 'object' },
        { key: 'd', label: 'D', seen: true },
        { key: 'e', label: 'E', seen: null },
      ];
      create({ state: stageOne({ optional: entries }) });
      const items = Array.from(host().querySelectorAll('.checklist__optional-item'))
        .map(li => li.textContent?.replace(/\s+/g, ' ').trim());
      expect(items).toEqual(['A · aún no', 'B · ya hablaste', 'C · ya revisaste', 'D', 'E']);
    });

    it('el <details> es nativo (teclado y lectores sin código extra): summary enfocable de al menos 32 px', () => {
      expect(ruleBody('.checklist__summary')).toMatch(/min-height:\s*32px;/);
      expect(template).toContain('<summary');
    });
  });

  describe('plegar y desplegar', () => {
    it('desplegada por defecto: «Ocultar pasos» con aria-expanded="true"', () => {
      create();
      expect(accessibleText(toggle())).toBe('Ocultar pasos');
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(host().getAttribute('data-collapsed')).toBe('false');
    });

    it('plegar oculta la lista, deja título, contador y «Mostrar pasos» y emite expandedChange(false)', () => {
      create();
      const changes: boolean[] = [];
      fixture.componentInstance.expandedChange.subscribe(value => changes.push(value));
      toggle().click();
      fixture.detectChanges();
      expect(changes).toEqual([false]);
      expect(rows()).toHaveLength(0);
      expect(host().querySelector('ol')).toBeNull();
      expect(accessibleText(toggle())).toBe('Mostrar pasos');
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(host().querySelector('.checklist__counter')?.textContent?.trim()).toBe('Decisión 1 de 6');
      expect(host().getAttribute('data-collapsed')).toBe('true');
      toggle().click();
      fixture.detectChanges();
      expect(changes).toEqual([false, true]);
      expect(rows()).toHaveLength(6);
    });

    it('plegada conserva data-next-step (los e2e lo leen aunque la lista no se vea)', () => {
      create();
      toggle().click();
      fixture.detectChanges();
      expect(host().querySelector('section')?.getAttribute('data-next-step')).toBe('u1-recoger');
    });

    it('el nombre accesible de los botones es su texto visible (WCAG 2.5.3)', () => {
      create();
      expect(accessibleText(toggle())).toBe(visibleText(toggle()));
      create({ compact: true });
      const chip = toggle();
      const visible = visibleText(chip);
      expect(visible).toBe('Qué hacer · 6');
      expect(accessibleText(chip).startsWith(visible)).toBe(true);
    });

    it('el foco de teclado no se pierde al plegar y desplegar', () => {
      create();
      toggle().focus();
      expect(document.activeElement).toBe(toggle());
      toggle().click();
      fixture.detectChanges();
      TestBed.inject(ApplicationRef).tick();
      expect(host().contains(document.activeElement)).toBe(true);
    });
  });

  describe('compacto', () => {
    it('arranca plegada en un chip «Qué hacer · {n}» con los pasos pendientes', () => {
      create({ compact: true });
      expect(host().querySelector('.checklist__chip')).not.toBeNull();
      expect(visibleText(toggle())).toBe('Qué hacer · 6');
      expect(accessibleText(toggle())).toBe('Qué hacer · 6 pasos pendientes');
      expect(rows()).toHaveLength(0);
      expect(host().querySelector('h2')).toBeNull();
      expect(host().getAttribute('data-collapsed')).toBe('true');
    });

    it('el chip cuenta solo lo que falta: con un paso hecho, 5; con todo hecho, sin número', () => {
      create({ compact: true, state: stageOneAfterCollect() });
      expect(visibleText(toggle())).toBe('Qué hacer · 5');
      const allDone = stageOne({}, [step({ id: 'z', state: 'done', label: 'Hecho' })]);
      update(fixture.componentInstance.state, allDone);
      expect(visibleText(toggle())).toBe('Qué hacer');
      expect(accessibleText(toggle())).toBe('Qué hacer');
      const one = stageOne({}, [step({ id: 'z', state: 'next', label: 'Uno' })]);
      update(fixture.componentInstance.state, one);
      expect(accessibleText(toggle())).toBe('Qué hacer · 1 paso pendiente');
    });

    it('al tocar el chip se despliega, emite true y ofrece «Ocultar pasos»', () => {
      create({ compact: true });
      const changes: boolean[] = [];
      fixture.componentInstance.expandedChange.subscribe(value => changes.push(value));
      toggle().click();
      fixture.detectChanges();
      expect(changes).toEqual([true]);
      expect(rows()).toHaveLength(6);
      expect(accessibleText(toggle())).toBe('Ocultar pasos');
      toggle().click();
      fixture.detectChanges();
      expect(visibleText(toggle())).toBe('Qué hacer · 6');
    });

    it('desplegada, la lista se desplaza dentro de la tarjeta y se alcanza con teclado', () => {
      create({ compact: true });
      toggle().click();
      fixture.detectChanges();
      const scroller = host().querySelector('.checklist__scroll') as HTMLElement;
      expect(scroller.classList).toContain('checklist__scroll--limited');
      expect(scroller.getAttribute('tabindex')).toBe('0');
      expect(scroller.getAttribute('role')).toBe('region');
      expect(scroller.getAttribute('aria-label')).toBe('Pasos de la etapa');
      // Fuera de compacto no hay región extra que enfocar.
      create({ compact: false });
      const normal = host().querySelector('.checklist__scroll') as HTMLElement;
      expect(normal.hasAttribute('tabindex')).toBe(false);
      expect(normal.hasAttribute('role')).toBe(false);
    });

    it('al abrir o cambiar de paso acerca el siguiente a la vista dentro de la lista (sin tocar la página)', () => {
      create({ compact: true });
      toggle().click();
      fixture.detectChanges();
      const scroller = host().querySelector('.checklist__scroll') as HTMLElement;
      let scrollTop = 0;
      Object.defineProperty(scroller, 'scrollTop', { get: () => scrollTop, set: (value: number) => { scrollTop = value; }, configurable: true });
      const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
      const spy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        if (this === scroller) return rect(0, 100);
        if (this.matches('li.step[aria-current="step"]')) return rect(150, 170);
        return rect(0, 0);
      });
      update(fixture.componentInstance.state, stageOneAfterCollect());
      TestBed.inject(ApplicationRef).tick();
      expect(scrollTop).toBe(70);
      spy.mockRestore();
    });

    it('una etapa nueva no abre sola la tarjeta compacta: marca un punto en el chip', () => {
      create({ compact: true });
      expect(host().querySelector('.checklist__dot')).toBeNull();
      update(fixture.componentInstance.state, stageOne({ number: 2, title: 'Marco normativo en salud' }));
      expect(rows()).toHaveLength(0);
      expect(host().querySelector('.checklist__dot')).not.toBeNull();
      expect(accessibleText(toggle())).toContain('Nueva etapa');
      expect(host().querySelector('.checklist__dot')?.getAttribute('aria-hidden')).toBe('true');
      toggle().click();
      fixture.detectChanges();
      expect(host().querySelector('.checklist__dot')).toBeNull();
      toggle().click();
      fixture.detectChanges();
      expect(host().querySelector('.checklist__dot')).toBeNull();
    });

    it('el primer estado no cuenta como etapa nueva (no reaparece al recargar)', () => {
      create({ compact: true, state: null });
      update(fixture.componentInstance.state, stageOne({ number: 3 }));
      expect(host().querySelector('.checklist__dot')).toBeNull();
    });

    it('cambiar de modalidad vuelve al valor por defecto de la nueva', () => {
      create({ compact: false });
      expect(rows()).toHaveLength(6);
      update(fixture.componentInstance.compact, true);
      expect(rows()).toHaveLength(0);
      update(fixture.componentInstance.compact, false);
      expect(rows()).toHaveLength(6);
    });
  });

  describe('etapa nueva fuera de compacto', () => {
    it('reabre la tarjeta aunque el estudiante la hubiera plegado', () => {
      create();
      toggle().click();
      fixture.detectChanges();
      expect(rows()).toHaveLength(0);
      update(fixture.componentInstance.state, stageOne({ number: 2, title: 'Marco normativo en salud' }));
      expect(rows()).toHaveLength(6);
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
    });

    it('recalcular la misma etapa no reabre una tarjeta plegada', () => {
      create();
      toggle().click();
      fixture.detectChanges();
      update(fixture.componentInstance.state, stageOneAfterCollect());
      expect(rows()).toHaveLength(0);
    });
  });

  describe('movimiento reducido', () => {
    it('marca la tarjeta como estática (sin transiciones)', () => {
      create({ reduceMotion: true });
      expect(host().querySelector('section')?.classList).toContain('checklist--static');
      create({ reduceMotion: false });
      expect(host().querySelector('section')?.classList).not.toContain('checklist--static');
    });
  });
});

describe('scene-checklist-card: contratos de fuente', () => {
  it('sin temporizadores, sin animación, sin desenfoque ni teclado global', () => {
    expect(source).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
    expect(source).not.toMatch(/animation\s*:|@keyframes|backdrop-filter/);
    expect(source).not.toMatch(/HostListener|keydown|keyup|Escape|stopPropagation|preventDefault/);
  });

  it('movimiento reducido: la única transición (borde y fondo de los controles) se apaga con la clase y con la preferencia del sistema', () => {
    expect(css).toMatch(/transition: border-color 150ms ease, background-color 150ms ease;/);
    expect(css).toMatch(/\.checklist--static \.checklist__toggle,\s*\.checklist--static \.checklist__chip \{ transition: none; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.checklist__toggle,\s*\.checklist__chip \{ transition: none; \}/);
    expect(css.match(/transition\s*:/g)).toHaveLength(3);
  });

  it('una sola región aria-live y ningún role="status" ni "alert" aparte', () => {
    expect(template.match(/aria-live/g)).toHaveLength(1);
    expect(template).not.toMatch(/role="(status|alert|log)"/);
  });

  it('ningún <button> ni enlace dentro de las filas de pasos', () => {
    const steps = template.slice(template.indexOf('<ng-template #stepsTpl'));
    expect(steps).toContain('<ol');
    expect(steps).not.toMatch(/<button|<a\s|role="button"|\(click\)|tabindex/);
  });

  it('no usa la clase close-btn (los e2e la pulsan para avanzar diálogos)', () => {
    expect(source).not.toContain('close-btn');
  });

  it('no lee la clasificación de las opciones ni nada sobre ellas', () => {
    expect(source).not.toMatch(/classification|prohibitedConduct|isRecommended|isProhibited|decisionOption/);
  });

  it('la tarjeta no pinta superficie propia: el envoltorio .objective-card pone borde y fondo', () => {
    const body = ruleBody('.checklist');
    expect(body).not.toMatch(/background|border|box-shadow|backdrop|position/);
    expect(ruleBody(':host')).not.toMatch(/position|background|border/);
  });

  it('el título y los textos informativos no bajan de 12 px (0,75 rem)', () => {
    const sizes = Array.from(css.matchAll(/font-size:\s*([\d.]+)rem/g)).map(match => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(5);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(0.75);
  });

  it('los controles miden 32 px (mínimo AA 24) con zona de toque ampliada y anillo de foco', () => {
    const body = ruleBody('.checklist__toggle,\n    .checklist__chip');
    expect(body).toMatch(/min-height:\s*32px;/);
    expect(body).toMatch(/min-width:\s*44px;/);
    expect(css).toMatch(/\.checklist__chip::after \{ content: ''; position: absolute; inset: -6px -2px; \}/);
    expect(css).toMatch(/\.checklist__toggle:focus-visible,[^{]*\{ outline: 2px solid #c9b3ff; outline-offset: 2px; \}/);
  });

  it('el estado no depende del color: cada estado tiene su propia forma en la plantilla', () => {
    const marks = template.slice(template.indexOf('@switch (step.state)'), template.indexOf('<span class="step__body">'));
    expect(marks).toContain("@case ('done')");
    expect(marks).toContain("@case ('next')");
    expect(marks).toContain("@case ('locked')");
    expect(marks).toContain('@default');
    expect(marks).toContain('<rect');
  });

  it('los textos ocultos de estado vienen de ORIENTATION_COPY (una sola fuente)', () => {
    expect(source).toContain('ORIENTATION_COPY.card');
    expect(ORIENTATION_COPY.card.stateText).toEqual({
      done: 'Hecho:', next: 'Siguiente:', pending: 'Pendiente:', locked: 'Bloqueado hasta:',
    });
  });
});

describe('scene-checklist-card: contraste sobre el envoltorio .objective-card (AA)', () => {
  const play = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');
  const wrapper = ruleBody('.objective-card', play);
  const rgba = (value: string): { hex: string; alpha: number } => {
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex) return { hex: `#${hex[1]}`, alpha: 1 };
    const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
    if (!m) throw new Error(`Color no reconocido: ${value}`);
    return { hex: rgbToHex([Number(m[1]), Number(m[2]), Number(m[3])]), alpha: m[4] === undefined ? 1 : Number(m[4]) };
  };
  const colorOf = (selector: string, property = 'color'): string => {
    const body = ruleBody(selector);
    const match = body.match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`));
    if (!match) throw new Error(`${selector} no declara ${property}`);
    return match[1].trim();
  };

  // Peor caso: el envoltorio (alfa del CSS real) sobre un mapa blanco.
  const background = rgba(wrapper.match(/background:\s*([^;]+);/)?.[1].trim() ?? '');
  const surface = blend(background.hex, background.alpha, '#ffffff');
  const onSurface = (value: string, over = surface): string => {
    const c = rgba(value);
    return blend(c.hex, c.alpha, over);
  };

  it('el envoltorio sigue siendo casi opaco (la tarjeta depende de ese fondo para el contraste)', () => {
    expect(background.alpha).toBeGreaterThanOrEqual(0.85);
    expect(hexToRgb(background.hex).every(channel => channel < 40)).toBe(true);
  });

  it.each([
    ['.checklist', 'color'],
    ['.checklist__counter', 'color'],
    ['.step', 'color'],
    ['.step--done', 'color'],
    ['.step--locked', 'color'],
    ['.step__where', 'color'],
    ['.step__note', 'color'],
    ['.checklist__stage', 'color'],
    ['.checklist__intro', 'color'],
    ['.checklist__footer', 'color'],
    ['.checklist__optional-item', 'color'],
    ['.checklist__mark', 'color'],
    ['.checklist__summary', 'color'],
    ['.checklist__title', 'color'],
    ['.checklist__room', 'color'],
    ['.checklist__note', 'color'],
  ])('%s: texto con contraste AA sobre la tarjeta', (selector, property) => {
    const text = onSurface(colorOf(selector, property));
    expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('el paso siguiente: texto claro sobre su resalte lavanda', () => {
    const highlight = onSurface('rgba(124,77,255,.16)');
    expect(ruleBody('.step--next')).toContain('background: rgba(124,77,255,.16);');
    expect(contrastRatio(onSurface(colorOf('.step--next'), highlight), highlight)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(onSurface(colorOf('.step--next .step__where'), highlight), highlight)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(onSurface(colorOf('.step--next .step__mark'), highlight), highlight)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['.step__mark', 'color'],
    ['.step--done .step__mark', 'color'],
    ['.step--pending .step__mark', 'color'],
    ['.step--locked .step__mark', 'color'],
  ])('%s: la marca de estado llega a 3:1 (1.4.11)', (selector, property) => {
    expect(contrastRatio(onSurface(colorOf(selector, property)), surface)).toBeGreaterThanOrEqual(3);
  });

  it('el borde de los controles llega a 3:1 y el anillo de foco también', () => {
    expect(contrastRatio(onSurface('rgba(182,156,255,.7)'), surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio('#c9b3ff', surface)).toBeGreaterThanOrEqual(3);
  });
});

describe('SceneChecklistCardComponent con datos reales de deriveSceneLog', () => {
  const MAP_KEY: Record<RoomGroup, string> = {
    'urgencias': 'hospital-urgencias',
    'sala-escucha': 'hospital-sala-escucha',
    'recepcion': 'comisaria-recepcion',
    'consultorio': 'comisaria-consultorio',
  };

  function mapObject(key: string, room: RoomGroup): MapObjectState {
    const entity = ENTITY_NAMES[key];
    const type = /^(puerta|salida)-/.test(key) ? 'EXIT' : key.startsWith('tool-') ? 'TOOL' : entity.person ? 'PERSON' : 'OBJECT';
    return {
      key, label: entity.name, type, x: 300 + (key.length % 7) * 70, y: 330 + (key.length % 3) * 40, width: 32, height: 32,
      color: '#fff', icon: 'x', shortCode: 'X', collision: false, interactionPrompt: '', interactionText: '',
      decisionOptionId: null, toolCode: null, dialogue: null, metadata: {},
    };
  }

  const objectsIn = (room: RoomGroup): MapObjectState[] =>
    Object.keys(ENTITY_NAMES).filter(key => ENTITY_NAMES[key].room === room).map(key => mapObject(key, room));
  const allObjectKeys = Object.keys(ENTITY_NAMES).filter(key => !key.startsWith('tool-'));
  const personKeys = Object.keys(ENTITY_NAMES).filter(key => ENTITY_NAMES[key].person);

  it('para cada etapa, sala y avance posible la tarjeta se pinta íntegra, sin controles en las filas ni claves internas', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SceneChecklistCardComponent] });
    const fixture = TestBed.createComponent(SceneChecklistCardComponent);
    const host = fixture.nativeElement as HTMLElement;
    const stateTexts = Object.values(ORIENTATION_COPY.card.stateText);
    let rendered = 0;

    for (const nodeKey of Object.keys(STAGE_ROUTES)) {
      for (const room of ROUTE_ORDER) {
        for (const progress of [0, 1] as const) {
          const input = {
            nodeKey, nodeTitle: null, nodeNarrative: null, nodeOptionIds: null,
            mapKey: MAP_KEY[room], objects: objectsIn(room),
            inventory: progress ? ['PAP', 'SPIKES', 'RISK_METER'] : [],
            inspected: progress ? allObjectKeys : [], usedToolKeys: progress ? ['PAP', 'RISK_METER'] : [],
            viewedNpcKeys: new Set<string>(progress ? personKeys : []),
            visitedRooms: new Set<RoomGroup>(progress ? ROUTE_ORDER : []),
            scenarioNpcs: personKeys.filter(key => ENTITY_NAMES[key].room === room)
              .map(key => ({ key, displayName: ENTITY_NAMES[key].name, x: 400, y: 380 })),
            terminal: false,
          };
          const state = deriveSceneLog(input);
          if (!state) continue;
          for (const compact of [false, true]) {
            writeInputSignal(fixture.componentInstance.compact, compact);
            writeInputSignal(fixture.componentInstance.state, state);
            fixture.detectChanges();
            if (compact) (host.querySelector('[data-checklist-toggle]') as HTMLElement).click();
            fixture.detectChanges();
            const text = visibleText(host);
            const steps = state.groups.flatMap(group => group.steps);
            const liRows = Array.from(host.querySelectorAll<HTMLElement>('li.step'));
            // Con los grupos plegados las filas siguen en el DOM (dentro de <details>); se cuentan todas.
            expect(liRows).toHaveLength(steps.length);
            for (const row of liRows) {
              expect(row.querySelector('button, a, input, [role="button"], [tabindex]')).toBeNull();
              expect(stateTexts).toContain(row.querySelector('.step__body .visually-hidden')?.textContent?.trim());
            }
            expect(host.querySelectorAll('[aria-current="step"]')).toHaveLength(state.next ? 1 : 0);
            expect(host.querySelector('section')?.getAttribute('data-next-step')).toBe(state.next?.stepId ?? null);
            expect(text).not.toMatch(/\b[a-z]+(-[a-z]+)+\b|npc:|PAP@|\b(PAP|SPIKES|EPICEE|RISK_METER)\b|undefined|null|\[object/);
            expect(text).not.toMatch(/completad|logro|puntos?\b|¡|correct|adecuad/i);
            rendered += 1;
            if (compact) (host.querySelector('[data-checklist-toggle]') as HTMLElement).click();
          }
        }
      }
    }
    expect(rendered).toBeGreaterThan(40);
    fixture.destroy();
  });

  it('una sala con tramos a pie muestra su encabezado una sola vez y «estás aquí» solo en la actual', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [SceneChecklistCardComponent] });
    const fixture = TestBed.createComponent(SceneChecklistCardComponent);
    const state = deriveSceneLog({
      nodeKey: 'hospital-cierre-bloque', nodeTitle: null, nodeNarrative: null, nodeOptionIds: null,
      mapKey: MAP_KEY['sala-escucha'], objects: objectsIn('sala-escucha'),
      inventory: [], inspected: [], usedToolKeys: [], viewedNpcKeys: new Set(),
      visitedRooms: new Set<RoomGroup>(['urgencias', 'sala-escucha']), scenarioNpcs: [], terminal: false,
    }) as SceneLogState;
    writeInputSignal(fixture.componentInstance.state, state);
    fixture.detectChanges();
    const headers = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.checklist__room'))
      .map(h => h.textContent?.trim());
    expect(headers.length).toBeGreaterThan(1);
    expect(headers.filter(h => h?.includes('estás aquí'))).toHaveLength(1);
    expect(headers[0]).toBe('Hospital · Sala de escucha familiar · estás aquí');
    fixture.destroy();
  });
});
