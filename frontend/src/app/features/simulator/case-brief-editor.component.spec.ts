import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BriefUpdateRequest, CharacterEditorState } from '../../core/models/simulation.model';
import { BriefForm, CaseBriefEditorComponent, buildBriefForm, parseObjectives } from './case-brief-editor.component';

const character = (id: number, over: Partial<CharacterEditorState> = {}): CharacterEditorState => ({
  id, key: `personaje-${id}`, displayName: `Personaje ${id}`, roleLabel: '', portraitKey: '', showInBrief: true, displayOrder: id, ...over,
});

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * «Ficha» del editor (plan visual F10-3†; E3-3, E3-4, RF-07, RF-16, CU-04): el contexto y los objetivos de aprendizaje que
 * la persona lee antes de empezar, y el catálogo de personajes del caso. El formulario es de la pantalla (una pestaña
 * inactiva se destruye y lo escrito no puede morir con ella); aquí se presenta, se valida contra los topes del servidor y
 * se avisa qué se guarda. Los personajes los edita la hoja de la pantalla.
 */
// req: RF-07, RF-16, CU-04, RNF-04
describe('CaseBriefEditorComponent', () => {
  let fixture: ComponentFixture<CaseBriefEditorComponent>;
  let form: BriefForm;
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
    fixture.detectChanges();
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
    form = buildBriefForm(inputs.context ?? '', inputs.objectives ?? []);
    TestBed.configureTestingModule({ imports: [CaseBriefEditorComponent], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(CaseBriefEditorComponent);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('characters', inputs.characters ?? []);
    fixture.componentRef.setInput('lockReason', inputs.lockReason ?? null);
    fixture.componentRef.setInput('busy', inputs.busy ?? false);
    fixture.componentInstance.saveBrief.subscribe(request => saved.push(request));
    fixture.componentInstance.characterCreate.subscribe(() => { created += 1; });
    fixture.componentInstance.characterEdit.subscribe(item => edited.push(item));
    fixture.componentInstance.characterRemove.subscribe(item => removed.push(item));
    await fixture.whenStable();
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('el formulario de la pantalla', () => {
    it('se construye con el contexto y los objetivos del caso, uno por línea', () => {
      const built = buildBriefForm('Una mujer llega a urgencias.', ['Identificar señales de riesgo.', 'Validar sin juzgar.']);
      expect(built.getRawValue()).toEqual({ context: 'Una mujer llega a urgencias.', objectives: 'Identificar señales de riesgo.\nValidar sin juzgar.' });
      expect(built.pristine).toBe(true);
    });

    it('los objetivos escritos se leen como lista: sin espacios sobrantes ni renglones vacíos', () => {
      expect(parseObjectives(' Escuchar con atención. \n\n  Nombrar la emoción.  \r\n')).toEqual(['Escuchar con atención.', 'Nombrar la emoción.']);
      expect(parseObjectives('')).toEqual([]);
    });

    it('un contexto de más de 4.000 caracteres es inválido (el aviso lo da el campo, no un tope silencioso)', () => {
      expect(buildBriefForm('a'.repeat(4000), []).controls.context.valid).toBe(true);
      expect(buildBriefForm('a'.repeat(4001), []).controls.context.valid).toBe(false);
    });
  });

  describe('contexto y objetivos', () => {
    it('muestra el contexto y los objetivos del formulario, con su ayuda y sin recortar lo que se pega', async () => {
      await render({ context: 'Una mujer llega a urgencias.', objectives: ['Identificar señales de riesgo.', 'Validar sin juzgar.'] });

      expect(textarea('Contexto del caso').value).toBe('Una mujer llega a urgencias.');
      expect(textarea('Objetivos de aprendizaje').value).toBe('Identificar señales de riesgo.\nValidar sin juzgar.');
      expect(message('Contexto del caso')).toContain('Lo que lee la persona antes de empezar');
      expect(message('Contexto del caso')).toContain('hasta 4.000 caracteres');
      expect(message('Objetivos de aprendizaje')).toContain('Uno por línea');
      expect(textarea('Contexto del caso').hasAttribute('maxlength'), 'un tope con atributo recortaría en silencio lo que se pega').toBe(false);
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

    it('el error de los objetivos se va al corregirlos, sin esperar al siguiente envío', async () => {
      await render();
      write('Objetivos de aprendizaje', Array.from({ length: 13 }, (_unused, index) => `Objetivo ${index + 1}`).join('\n'));
      await submit();
      expect(message('Objetivos de aprendizaje')).toBe('Un caso admite hasta 12 objetivos de aprendizaje.');

      write('Objetivos de aprendizaje', 'Uno solo.');
      fixture.detectChanges();

      expect(message('Objetivos de aprendizaje')).toContain('Uno por línea');
      expect(textarea('Objetivos de aprendizaje').getAttribute('aria-invalid')).toBeNull();
    });

    it('un contexto de más de 4.000 caracteres (pegado) lo dice en su campo y no se envía', async () => {
      await render();

      write('Contexto del caso', 'a'.repeat(4001));
      await submit();

      expect(message('Contexto del caso')).toBe('Admite hasta 4.000 caracteres.');
      expect(textarea('Contexto del caso').getAttribute('aria-invalid')).toBe('true');
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

    it('tras quitar un personaje el foco va a «Agregar personaje» (el botón que se pulsó desaparece)', async () => {
      const marta = character(1, { displayName: 'Marta' });
      await render({ characters: [marta, character(2, { displayName: 'Sofía' })] });
      document.body.appendChild(root());
      button('Eliminar a «Marta»')!.click();

      fixture.componentRef.setInput('characters', [character(2, { displayName: 'Sofía' })]);
      await fixture.whenStable();
      await new Promise<void>(resolve => setTimeout(resolve));

      expect(document.activeElement).toBe(button('Agregar personaje'));
      root().remove();
    });
  });
});
