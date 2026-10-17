import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BriefUpdateRequest, CharacterEditorState } from '../../core/models/simulation.model';
import { CaseBriefEditorComponent } from './case-brief-editor.component';

const character = (id: number, over: Partial<CharacterEditorState> = {}): CharacterEditorState => ({
  id, key: `personaje-${id}`, displayName: `Personaje ${id}`, roleLabel: '', portraitKey: '', showInBrief: true, displayOrder: id, ...over,
});

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * «Ficha» del editor (plan visual F10-3†; E3-3, E3-4, RF-07, RF-16, CU-04): el contexto y los objetivos de aprendizaje que
 * la persona lee antes de empezar, y el catálogo de personajes del caso. El contexto y los objetivos se guardan juntos;
 * los personajes los edita la hoja de la pantalla. Nada se envía si un campo no cumple los topes del servidor.
 */
// req: RF-07, RF-16, CU-04, RNF-04
describe('CaseBriefEditorComponent', () => {
  let fixture: ComponentFixture<CaseBriefEditorComponent>;
  let saved: BriefUpdateRequest[];
  let created: number;
  let edited: CharacterEditorState[];
  let removed: CharacterEditorState[];

  const root = () => fixture.nativeElement as HTMLElement;
  const field = (label: string) => [...root().querySelectorAll('ui-field')].find(el => text(el.querySelector('.ui-field__label')) === label);
  const textarea = (label: string) => field(label)!.querySelector<HTMLTextAreaElement>('textarea')!;
  const write = (label: string, value: string) => {
    const target = textarea(label);
    target.value = value;
    target.dispatchEvent(new Event('input'));
  };
  const button = (label: string) => [...root().querySelectorAll<HTMLButtonElement>('button')]
    .find(item => (item.getAttribute('aria-label') ?? text(item.querySelector('.ui-button__label'))) === label);
  const submit = async () => {
    root().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };
  const message = (label: string) => text(field(label)!.querySelector('.ui-field__message'));

  async function render(inputs: {
    context?: string; objectives?: string[]; characters?: CharacterEditorState[]; lockReason?: string | null; busy?: boolean;
  } = {}) {
    saved = [];
    created = 0;
    edited = [];
    removed = [];
    TestBed.configureTestingModule({ imports: [CaseBriefEditorComponent], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(CaseBriefEditorComponent);
    fixture.componentRef.setInput('context', inputs.context ?? '');
    fixture.componentRef.setInput('objectives', inputs.objectives ?? []);
    fixture.componentRef.setInput('characters', inputs.characters ?? []);
    fixture.componentRef.setInput('lockReason', inputs.lockReason ?? null);
    fixture.componentRef.setInput('busy', inputs.busy ?? false);
    fixture.componentInstance.saveBrief.subscribe(request => saved.push(request));
    fixture.componentInstance.characterCreate.subscribe(() => { created += 1; });
    fixture.componentInstance.characterEdit.subscribe(item => edited.push(item));
    fixture.componentInstance.characterRemove.subscribe(item => removed.push(item));
    await fixture.whenStable();
  }

  async function update(inputs: Record<string, unknown>) {
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('contexto y objetivos', () => {
    it('muestra el contexto y los objetivos del caso, uno por línea, con su ayuda', async () => {
      await render({ context: 'Una mujer llega a urgencias.', objectives: ['Identificar señales de riesgo.', 'Validar sin juzgar.'] });

      expect(textarea('Contexto del caso').value).toBe('Una mujer llega a urgencias.');
      expect(textarea('Objetivos de aprendizaje').value).toBe('Identificar señales de riesgo.\nValidar sin juzgar.');
      expect(message('Contexto del caso')).toContain('Lo que lee la persona antes de empezar');
      expect(message('Objetivos de aprendizaje')).toContain('Uno por línea');
    });

    it('guardar envía el contexto sin espacios sobrantes y los objetivos como lista, sin renglones vacíos', async () => {
      await render();

      write('Contexto del caso', '  Un caso de duelo.  ');
      write('Objetivos de aprendizaje', ' Escuchar con atención. \n\n  Nombrar la emoción.  \n');
      await submit();

      expect(saved).toEqual([{ context: 'Un caso de duelo.', learningObjectives: ['Escuchar con atención.', 'Nombrar la emoción.'] }]);
    });

    it('sin objetivos envía la lista vacía (así se borran los que había)', async () => {
      await render({ context: 'x', objectives: ['Uno.'] });

      write('Objetivos de aprendizaje', '');
      await submit();

      expect(saved).toEqual([{ context: 'x', learningObjectives: [] }]);
    });

    it('más de 12 objetivos o uno de más de 280 caracteres lo dicen en el campo y no se envía nada', async () => {
      await render();

      write('Objetivos de aprendizaje', Array.from({ length: 13 }, (_unused, index) => `Objetivo ${index + 1}`).join('\n'));
      await submit();
      expect(message('Objetivos de aprendizaje')).toBe('Un caso admite hasta 12 objetivos de aprendizaje.');
      expect(textarea('Objetivos de aprendizaje').getAttribute('aria-invalid')).toBe('true');

      write('Objetivos de aprendizaje', `${'a'.repeat(281)}\nOtro.`);
      await submit();
      expect(message('Objetivos de aprendizaje')).toBe('Cada objetivo admite hasta 280 caracteres.');
      expect(saved).toEqual([]);
    });

    it('tras un error el foco va al campo que lo tiene', async () => {
      await render();
      document.body.appendChild(root());
      write('Objetivos de aprendizaje', Array.from({ length: 13 }, () => 'x').join('\n'));

      await submit();
      await new Promise<void>(resolve => setTimeout(resolve));

      expect(document.activeElement).toBe(textarea('Objetivos de aprendizaje'));
      root().remove();
    });

    it('una versión que no es borrador no deja guardar y dice por qué', async () => {
      const reason = 'Esta versión no es un borrador y no se puede modificar: clónala para editarla.';
      await render({ context: 'x', lockReason: reason });

      const save = button('Guardar ficha')!;
      expect(save.getAttribute('aria-disabled')).toBe('true');
      expect(text(save.querySelector('[hidden]'))).toBe(reason);
      save.click();
      expect(saved).toEqual([]);
    });

    it('si llega la ficha de nuevo (otro guardado, recargar) y no se tocó, el formulario la sigue', async () => {
      await render({ context: 'Antes.', objectives: ['Uno.'] });

      await update({ context: 'Después.', objectives: ['Uno.', 'Dos.'] });

      expect(textarea('Contexto del caso').value).toBe('Después.');
      expect(textarea('Objetivos de aprendizaje').value).toBe('Uno.\nDos.');
    });

    it('si hay texto sin guardar, una ficha que llega por otro guardado no lo pisa', async () => {
      await render({ context: 'Antes.' });
      write('Contexto del caso', 'Lo que estoy escribiendo.');

      await update({ context: 'Otro cambio del servidor.' });

      expect(textarea('Contexto del caso').value).toBe('Lo que estoy escribiendo.');
    });

    it('cuando lo escrito llega guardado, el formulario queda limpio y vuelve a seguir al servidor', async () => {
      await render({ context: 'Antes.' });
      write('Contexto del caso', '  Guardado.  ');
      await submit();

      await update({ context: 'Guardado.' });
      expect(textarea('Contexto del caso').value).toBe('Guardado.');

      await update({ context: 'Cambió en el servidor.' });
      expect(textarea('Contexto del caso').value).toBe('Cambió en el servidor.');
    });
  });

  describe('personajes', () => {
    it('lista cada personaje con su rol, su retrato y si sale en la ficha, con palabras', async () => {
      await render({
        characters: [
          character(1, { displayName: 'Marta', roleLabel: 'Enfermera de urgencias', portraitKey: 'enfermera-urgencias' }),
          character(2, { displayName: 'Hombre del pasillo', showInBrief: false }),
        ],
      });

      const items = [...root().querySelectorAll('.cb-character')];
      expect(items.map(item => text(item.querySelector('.cb-character__name')))).toEqual(['Marta', 'Hombre del pasillo']);
      expect(text(items[0].querySelector('.cb-character__meta'))).toBe('Enfermera de urgencias · retrato enfermera-urgencias');
      expect(items.map(item => text(item.querySelector('ui-badge')))).toEqual(['En la ficha', 'Se descubre jugando']);
    });

    it('agregar, editar y quitar avisan qué se pidió', async () => {
      const second = character(2, { displayName: 'Sofía' });
      await render({ characters: [character(1, { displayName: 'Marta' }), second] });

      button('Agregar personaje')!.click();
      button('Editar a «Sofía»')!.click();
      button('Eliminar a «Sofía»')!.click();

      expect(created).toBe(1);
      expect(edited).toEqual([second]);
      expect(removed).toEqual([second]);
    });

    it('sin personajes lo dice y deja agregar el primero', async () => {
      await render();

      expect(text(root())).toContain('Aún no hay personajes');
      expect(root().querySelector('.cb-character')).toBeNull();
      button('Agregar personaje')!.click();
      expect(created).toBe(1);
    });

    it('una versión que no es borrador bloquea agregar, editar y quitar', async () => {
      const reason = 'Esta versión no es un borrador y no se puede modificar: clónala para editarla.';
      await render({ characters: [character(1, { displayName: 'Marta' })], lockReason: reason });

      for (const label of ['Agregar personaje', 'Editar a «Marta»', 'Eliminar a «Marta»']) {
        const target = button(label)!;
        expect(target.getAttribute('aria-disabled'), label).toBe('true');
        target.click();
      }
      expect([created, edited, removed]).toEqual([0, [], []]);
    });
  });
});
