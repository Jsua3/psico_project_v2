import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AbstractControl, FormBuilder, Validators } from '@angular/forms';

import { CaseEditorView } from '../../core/models/simulation.model';
import { UiDialog } from '../../shared/ui/dialog/ui-dialog';
import { CaseEditorSheetComponent, CaseEditorSheetHost, EditorPanel } from './case-editor-sheet.component';

/**
 * La hoja de formularios del editor de casos (plan F8-1): presenta el formulario que la pantalla le entrega y le
 * devuelve «guardar» y «cancelar». La pantalla es la dueña del formulario, de su validación y de guardar.
 */
const view = {
  caseVersionId: 7,
  nodes: [
    { id: 1, key: 'inicio', title: 'Inicio del caso' },
    { id: 2, key: 'cierre', title: 'Cierre' },
  ],
  decisions: [{ id: 40, text: 'Escucha activa y validación emocional de la persona consultante' }],
  tools: [{ id: 31, code: 'PAP', label: 'Primeros auxilios psicológicos' }],
} as unknown as CaseEditorView;

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('hoja de formularios del editor (F8-1)', () => {
  let fixture: ComponentFixture<CaseEditorSheetComponent>;
  let host: CaseEditorSheetHost & { save: ReturnType<typeof vi.fn>; closePanel: ReturnType<typeof vi.fn> };
  const fb = new FormBuilder();

  const root = () => fixture.nativeElement as HTMLElement;
  const fieldLabels = () => [...root().querySelectorAll('.ui-field__label, label.ui-check')].map(label => text(label).replace(/ \*$/, ''));
  const field = (label: string) => [...root().querySelectorAll('ui-field')].find(el => text(el.querySelector('.ui-field__label')).replace(/ \*$/, '') === label);
  const button = (label: string) => [...root().querySelectorAll<HTMLButtonElement>('button')]
    .find(candidate => text(candidate.querySelector('.ui-button__label')) === label);

  function makeHost(panel: EditorPanel, forms: Partial<CaseEditorSheetHost> = {}, busy = false): typeof host {
    const panelSignal = signal<EditorPanel>(panel);
    return {
      panel: panelSignal,
      editor: signal(view),
      busy: signal(busy),
      nodeForm: null,
      decisionForm: null,
      mapForm: null,
      objectForm: null,
      toolForm: null,
      hintForm: null,
      characterForm: null,
      panelTitle: () => ({
        'node-create': 'Nuevo nodo DAG', 'decision-create': 'Nueva decisión', 'map-create': 'Nuevo mapa',
        'object-create': 'Nuevo objeto del mapa', 'tool-create': 'Nueva herramienta clínica',
        'hint-create': 'Nueva ayuda', 'hint-edit': 'Editar ayuda', 'character-create': 'Nuevo personaje',
      } as Record<string, string>)[panel?.kind ?? ''] ?? '',
      fieldError: (control: AbstractControl, message: string) => (control.touched && control.invalid ? message : null),
      save: vi.fn(),
      closePanel: vi.fn(),
      ...forms,
    } as never;
  }

  async function render(panel: EditorPanel, forms: Partial<CaseEditorSheetHost> = {}, busy = false) {
    host = makeHost(panel, forms, busy);
    TestBed.configureTestingModule({
      imports: [CaseEditorSheetComponent],
      providers: [provideZonelessChangeDetection(), { provide: DIALOG_DATA, useValue: { host } }],
    });
    fixture = TestBed.createComponent(CaseEditorSheetComponent);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  const nodeForm = () => fb.group({
    nodeKey: ['', Validators.required], title: ['', Validators.required], narrative: ['', Validators.required],
    decisionPrompt: [''], warningMessage: [''], intensity: [''], startNode: [false], terminal: [false], sensitiveContent: [false],
    safeExitRequired: [false], positionX: [null], positionY: [null],
  });

  // El marco del diálogo se registra en el contenedor del CDK al construirse: creado dentro de un bloque condicional
  // (pasada de actualización) cambiaba `aria-labelledby` del contenedor ya comprobado y daba NG0100 en el navegador.
  // req: RNF-04, BLOQUE-H
  it('abierta con UiDialog.sheet de verdad, el contenedor queda nombrado por el título y no hay NG0100', async () => {
    host = makeHost({ kind: 'node-create' }, { nodeForm: nodeForm() });
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });

    const ref = TestBed.inject(UiDialog).sheet(CaseEditorSheetComponent, { side: 'end', data: { host } });
    await TestBed.inject(ApplicationRef).whenStable();

    const container = document.querySelector('.cdk-dialog-container')!;
    const labelledBy = container.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(text(document.getElementById(labelledBy!.split(' ')[0]))).toBe('Nuevo nodo DAG');
    ref.close();
  });

  // req: RNF-04, BLOQUE-H
  it('el nodo: título de la hoja y campos con su etiqueta, los obligatorios marcados', async () => {
    await render({ kind: 'node-create' }, { nodeForm: nodeForm() });

    expect(text(root().querySelector('h2'))).toBe('Nuevo nodo DAG');
    expect(fieldLabels()).toEqual([
      'Clave del nodo', 'Título', 'Narrativa', 'Enunciado de la decisión', 'Mensaje de advertencia', 'Intensidad de la escena',
      'Nodo inicial', 'Nodo terminal', 'Contenido sensible', 'Salida segura obligatoria',
      'Posición X', 'Posición Y',
    ]);
    expect(field('Título')!.querySelector('[aria-required="true"]')).not.toBeNull();
    expect(field('Mensaje de advertencia')!.querySelector('[aria-required="true"]')).toBeNull();
  });

  it('enviar el formulario llama a guardar de la pantalla; «Cancelar» a cerrar', async () => {
    await render({ kind: 'node-create' }, { nodeForm: nodeForm() });

    root().querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(host.save).toHaveBeenCalledTimes(1);

    button('Cancelar')!.click();
    expect(host.closePanel).toHaveBeenCalledTimes(1);
  });

  it('un campo obligatorio vacío y tocado muestra su error en el campo', async () => {
    const form = nodeForm();
    form.get('title')!.markAsTouched();
    await render({ kind: 'node-create' }, { nodeForm: form });

    expect(text(field('Título')!.querySelector('.ui-field__message'))).toBe('Escribe el título del nodo.');
    expect(field('Título')!.querySelector('[aria-invalid="true"]')).not.toBeNull();
    expect(text(field('Clave del nodo')!.querySelector('.ui-field__message'))).toBe('');
  });

  it('mientras se guarda, el botón principal muestra la carga y su texto pasa a «Guardando…»', async () => {
    await render({ kind: 'node-create' }, { nodeForm: nodeForm() }, true);

    const save = [...root().querySelectorAll<HTMLButtonElement>('button[type="submit"]')][0];
    expect(save.getAttribute('aria-busy')).toBe('true');
    expect(text(save)).toContain('Guardando…');
  });

  it('la decisión: los selectores de nodo muestran el título y la clave, y la clase de la respuesta con sus cuatro palabras', async () => {
    const form = fb.group({
      sourceNodeId: ['', Validators.required], targetNodeId: ['', Validators.required], optionKey: [''],
      text: ['', Validators.required], responseClass: ['RECOMMENDED', Validators.required], prohibitedConduct: [false],
      prohibitionReason: [''], immediateFeedback: [''],
      consequenceText: [''], feedbackText: [''], theoryBasis: [''],
    });
    await render({ kind: 'decision-create' }, { decisionForm: form });

    const origin = field('Nodo origen')!;
    expect([...origin.querySelectorAll('option')].map(text)).toEqual(['Inicio del caso (inicio)', 'Cierre (cierre)']);
    const responseClass = field('Clase de la respuesta')!;
    expect([...responseClass.querySelectorAll('option')].map(text)).toEqual(['Recomendada', 'Aceptable', 'Con riesgo', 'Contraindicada']);
    expect(responseClass.querySelector('[aria-required="true"]')).not.toBeNull();
    expect(field('Razón de prohibición')).toBeUndefined();

    // Con el gesto real (la casilla), no con `patchValue`: un cambio programático entre dos pasadas da NG0100.
    root().querySelector<HTMLInputElement>('input[formControlName="prohibitedConduct"]')!.click();
    fixture.detectChanges();
    expect(form.get('prohibitedConduct')!.value).toBe(true);
    expect(field('Razón de prohibición')).toBeDefined();
  });

  it('el objeto: tipos en español y vínculos con la decisión y la herramienta del caso', async () => {
    const form = fb.group({
      _mapId: [11], objectKey: ['', Validators.required], label: ['', Validators.required], objectType: ['PERSON', Validators.required],
      interactionPrompt: ['', Validators.required], interactionText: [''], x: [200], y: [300], width: [48], height: [48],
      colorHex: ['#4FA3A5'], shortCode: ['ACT'], icon: ['psychology'], decisionOptionId: [null], toolCode: [null],
      collision: [false], visible: [true],
    });
    await render({ kind: 'object-create', mapId: 11 }, { objectForm: form });

    expect([...field('Tipo')!.querySelectorAll('option')].map(text)).toEqual(
      ['Persona', 'Objeto', 'Ruta', 'Herramienta', 'Advertencia', 'Salida']);
    expect([...field('Decisión vinculada')!.querySelectorAll('option')].map(text)).toEqual(
      ['— Ninguna —', '40 — Escucha activa y validación…']);
    expect([...field('Herramienta vinculada')!.querySelectorAll('option')].map(text)).toEqual(
      ['— Ninguna —', 'PAP — Primeros auxilios psicológicos']);
  });

  // Antes la opción era `[value]="null"`: elegir «— Ninguna —» guardaba el texto "null" y `Number("null")` daba NaN.
  it('elegir «— Ninguna —» en un vínculo deja el valor en null (no el texto "null")', async () => {
    const form = fb.group({
      _mapId: [11], objectKey: ['a'], label: ['b'], objectType: ['PERSON'], interactionPrompt: ['c'], interactionText: [''],
      x: [1], y: [1], width: [48], height: [48], colorHex: ['#000000'], shortCode: ['A'], icon: ['psychology'],
      decisionOptionId: [40], toolCode: ['PAP'], collision: [false], visible: [true],
    });
    await render({ kind: 'object-edit', obj: { id: 21 } as never }, { objectForm: form });
    const select = field('Decisión vinculada')!.querySelector<HTMLSelectElement>('select')!;
    expect(select.selectedOptions[0].textContent).toContain('40 —');

    select.selectedIndex = 0;
    select.dispatchEvent(new Event('change'));

    expect(form.get('decisionOptionId')!.value).toBeNull();
  });

  it('crear un objeto pide el mapa (con sus títulos); editarlo no, porque el objeto ya está en uno', async () => {
    const objectForm = (mapId: number) => fb.group({
      _mapId: [mapId, Validators.required], objectKey: ['a'], label: ['b'], objectType: ['PERSON'], interactionPrompt: ['c'],
      interactionText: [''], x: [1], y: [1], width: [48], height: [48], colorHex: ['#000000'], shortCode: ['A'],
      icon: ['psychology'], decisionOptionId: [null], toolCode: [null], collision: [false], visible: [true],
    });
    const withMaps = { editor: signal({ ...view, maps: [{ id: 11, title: 'Sala de espera' }, { id: 12, title: 'Consultorio' }] } as unknown as CaseEditorView) };
    await render({ kind: 'object-create', mapId: 12 }, { objectForm: objectForm(12), ...withMaps });

    const map = field('Mapa')!;
    expect([...map.querySelectorAll('option')].map(text)).toEqual(['Sala de espera', 'Consultorio']);
    expect(map.querySelector<HTMLSelectElement>('select')!.selectedOptions[0].textContent).toContain('Consultorio');
    TestBed.resetTestingModule();

    await render({ kind: 'object-edit', obj: { id: 21 } as never }, { objectForm: objectForm(11), ...withMaps });
    expect(field('Mapa')).toBeUndefined();
  });

  it('el mapa y la herramienta presentan sus campos', async () => {
    const map = fb.group({
      nodeId: ['', Validators.required], mapKey: ['', Validators.required], title: ['', Validators.required],
      theme: ['clinical-soft'], width: [960], height: [540], spawnX: [145], spawnY: [430],
    });
    await render({ kind: 'map-create' }, { mapForm: map });
    expect(fieldLabels()).toEqual(['Nodo asociado', 'Clave del mapa', 'Título del mapa', 'Tema visual', 'Ancho', 'Alto', 'Aparece en X', 'Aparece en Y']);
    TestBed.resetTestingModule();

    const tool = fb.group({ toolCode: ['', Validators.required], label: ['', Validators.required], icon: ['psychology'], category: ['clinical'], description: ['', Validators.required] });
    await render({ kind: 'tool-create' }, { toolForm: tool });
    expect(fieldLabels()).toEqual(['Código', 'Etiqueta', 'Categoría', 'Icono Material', 'Descripción']);
  });

  // req: RF-06, RF-09, CU-04
  describe('el nodo: enunciado de la decisión y conclusión con contenido propio (F10-3)', () => {
    it('el enunciado es opcional, con su ayuda, y una escena que no es conclusión llama «Narrativa» a su texto', async () => {
      await render({ kind: 'node-create' }, { nodeForm: nodeForm() });

      const prompt = field('Enunciado de la decisión')!;
      expect(prompt.querySelector('textarea')).not.toBeNull();
      expect(prompt.querySelector('[aria-required="true"]')).toBeNull();
      expect(text(prompt.querySelector('.ui-field__message'))).toContain('La pregunta que lee la persona antes de elegir');
      expect(text(prompt.querySelector('.ui-field__message'))).toContain('Hasta 1.200 caracteres.');
      expect(prompt.querySelector('textarea')!.hasAttribute('maxlength')).toBe(false);
      expect(field('Narrativa')).toBeDefined();
      expect(field('Texto de la conclusión')).toBeUndefined();
    });

    it('al marcar «Nodo terminal» el texto pasa a ser «Texto de la conclusión» y dice que cada conclusión tiene el suyo', async () => {
      const form = nodeForm();
      await render({ kind: 'node-create' }, { nodeForm: form });

      // Con el gesto real (la casilla), no con `patchValue`: un cambio programático entre dos pasadas da NG0100.
      root().querySelector<HTMLInputElement>('input[formControlName="terminal"]')!.click();
      fixture.detectChanges();

      expect(form.get('terminal')!.value).toBe(true);
      expect(field('Narrativa')).toBeUndefined();
      const conclusion = field('Texto de la conclusión')!;
      expect(conclusion.querySelector('[aria-required="true"]')).not.toBeNull();
      expect(text(conclusion.querySelector('.ui-field__message'))).toContain('Cada conclusión tiene su propio texto');
      expect(text(field('Enunciado de la decisión')!.querySelector('.ui-field__message'))).toContain('Déjalo vacío si esta escena es una conclusión');
    });
  });

  // req: modelo de métricas
  describe('sin cifras de puntaje ni de estrés (editor vigente)', () => {
    const decisionForm = () => fb.group({
      sourceNodeId: [1, Validators.required], targetNodeId: [2, Validators.required], optionKey: [''],
      text: ['x', Validators.required], responseClass: ['RECOMMENDED', Validators.required], prohibitedConduct: [true],
      prohibitionReason: [''], immediateFeedback: [''], consequenceText: [''], feedbackText: [''], theoryBasis: [''],
    });

    it('la decisión no tiene ningún campo numérico ni nombra puntaje, estrés ni penalización, tampoco con la conducta marcada', async () => {
      await render({ kind: 'decision-create' }, { decisionForm: decisionForm() });

      expect(root().querySelectorAll('input[type="number"]')).toHaveLength(0);
      expect(root().querySelector('[formControlName="scoreDelta"], [formControlName="stressDelta"], [formControlName="prohibitedPenalty"]')).toBeNull();
      expect(text(root())).not.toMatch(/puntaje|estrés|penalización/i);
      // La razón sigue ahí cuando la conducta es contraindicada.
      expect(field('Razón de prohibición')).toBeDefined();
    });

    it('la escena ofrece una intensidad opcional: Baja, Media o Alta, y «Según la escena» no manda nada', async () => {
      await render({ kind: 'node-create' }, { nodeForm: nodeForm() });

      const intensity = field('Intensidad de la escena')!;
      expect([...intensity.querySelectorAll('option')].map(text)).toEqual(['Según la escena', 'Baja', 'Media', 'Alta']);
      expect(intensity.querySelector('[aria-required="true"]')).toBeNull();
      expect(text(intensity.querySelector('.ui-field__message'))).toContain('Una escena de intensidad Alta necesita su mensaje de advertencia');
    });
  });

  // req: RF-10, CU-04
  describe('la decisión: consecuencia, retroalimentación y fundamento teórico (F10-3)', () => {
    const decisionForm = () => fb.group({
      sourceNodeId: [1, Validators.required], targetNodeId: [2, Validators.required], optionKey: [''],
      text: ['x', Validators.required], responseClass: ['RECOMMENDED', Validators.required], prohibitedConduct: [false],
      prohibitionReason: [''], immediateFeedback: [''],
      consequenceText: [''], feedbackText: [''], theoryBasis: [''],
    });

    it('los tres textos van tras el mensaje inmediato, opcionales y con su ayuda, que dice el tope de 1.200 caracteres', async () => {
      await render({ kind: 'decision-create' }, { decisionForm: decisionForm() });

      expect(fieldLabels()).toEqual([
        'Nodo origen', 'Nodo destino', 'Texto de la decisión', 'Clase de la respuesta',
        'Retroalimentación inmediata', 'Consecuencia en la historia', 'Retroalimentación pedagógica', 'Fundamento teórico',
        'Conducta contraindicada (explica por qué)',
      ]);
      for (const label of ['Consecuencia en la historia', 'Retroalimentación pedagógica', 'Fundamento teórico']) {
        const textarea = field(label)!.querySelector('textarea')!;
        // Un `maxlength` recortaría en silencio lo que se pega (y su error nunca saldría): el tope se dice y se valida.
        expect(textarea.hasAttribute('maxlength'), label).toBe(false);
        expect(text(field(label)!.querySelector('.ui-field__message')), label).toContain('Hasta 1.200 caracteres.');
        expect(field(label)!.querySelector('[aria-required="true"]'), label).toBeNull();
      }
      expect(text(field('Consecuencia en la historia')!.querySelector('.ui-field__message'))).toContain('Lo que ve la persona justo después de elegir');
      expect(text(field('Retroalimentación pedagógica')!.querySelector('.ui-field__message'))).toContain('Por qué esta opción es adecuada o no');
      expect(text(field('Fundamento teórico')!.querySelector('.ui-field__message'))).toContain('El concepto o la referencia que respalda');
    });

    it('un texto de más de 1.200 caracteres (pegado) lo dice en su campo, sin recortarlo', async () => {
      const form = fb.group({
        sourceNodeId: [1, Validators.required], targetNodeId: [2, Validators.required], optionKey: [''],
        text: ['x', Validators.required], responseClass: ['RECOMMENDED', Validators.required], prohibitedConduct: [false],
        prohibitionReason: [''], immediateFeedback: [''],
        consequenceText: [''], feedbackText: ['a'.repeat(1201), Validators.maxLength(1200)], theoryBasis: [''],
      });
      form.get('feedbackText')!.markAsTouched();
      await render({ kind: 'decision-create' }, { decisionForm: form });

      expect(text(field('Retroalimentación pedagógica')!.querySelector('.ui-field__message'))).toBe('Admite hasta 1.200 caracteres.');
      expect(field('Retroalimentación pedagógica')!.querySelector('textarea')!.value).toHaveLength(1201);
    });

    it('lo que se escribe llega al formulario de la pantalla', async () => {
      const form = decisionForm();
      await render({ kind: 'decision-create' }, { decisionForm: form });

      const write = (label: string, value: string) => {
        const textarea = field(label)!.querySelector('textarea')!;
        textarea.value = value;
        textarea.dispatchEvent(new Event('input'));
      };
      write('Retroalimentación pedagógica', 'Validar sin juzgar sostiene la alianza.');
      write('Fundamento teórico', 'Rogers (1957).');

      expect(form.get('feedbackText')!.value).toBe('Validar sin juzgar sostiene la alianza.');
      expect(form.get('theoryBasis')!.value).toBe('Rogers (1957).');
    });
  });

  // req: RF-11, CU-04
  describe('la ayuda (F10-3)', () => {
    const hintForm = () => fb.group({ text: ['', [Validators.required, Validators.maxLength(280)]], hintOrder: [null as number | null] });
    const withMaps = { editor: signal({ ...view, maps: [{ id: 11, title: 'Sala de espera' }] } as unknown as CaseEditorView) };

    it('nombra la sala y pide el texto (obligatorio, hasta 280 caracteres) y, opcional, el orden', async () => {
      await render({ kind: 'hint-create', mapId: 11 }, { hintForm: hintForm(), ...withMaps });

      expect(text(root().querySelector('h2'))).toBe('Nueva ayuda');
      expect(text(root().querySelector('.cs-context'))).toBe('Sala «Sala de espera»');
      expect(fieldLabels()).toEqual(['Texto de la ayuda', 'Lugar entre las ayudas de la sala']);
      const body = field('Texto de la ayuda')!;
      expect(body.querySelector('[aria-required="true"]')).not.toBeNull();
      expect(body.querySelector('textarea')!.hasAttribute('maxlength')).toBe(false);
      expect(text(body.querySelector('.ui-field__message'))).toContain('Texto plano, hasta 280 caracteres');
      expect(field('Lugar entre las ayudas de la sala')!.querySelector('[aria-required="true"]')).toBeNull();
      expect(button('Guardar ayuda')).toBeDefined();
    });

    it('el lugar menor que 1 lo dice en su campo (antes invalidaba el formulario sin decir por qué)', async () => {
      const form = fb.group({ text: ['Una ayuda.', Validators.required], hintOrder: [0, Validators.min(1)] });
      form.get('hintOrder')!.markAsTouched();
      await render({ kind: 'hint-create', mapId: 11 }, { hintForm: form, ...withMaps });

      expect(text(field('Lugar entre las ayudas de la sala')!.querySelector('.ui-field__message'))).toBe('El lugar empieza en 1.');
      expect(field('Lugar entre las ayudas de la sala')!.querySelector('input')!.getAttribute('aria-invalid')).toBe('true');
    });

    it('al crear, vaciar el lugar la deja última; al editar, vaciarlo no la mueve (la ayuda lo dice)', async () => {
      await render({ kind: 'hint-create', mapId: 11 }, { hintForm: hintForm(), ...withMaps });
      expect(text(field('Lugar entre las ayudas de la sala')!.querySelector('.ui-field__message'))).toBe('Déjalo vacío para que sea la última.');
      TestBed.resetTestingModule();

      await render({ kind: 'hint-edit', hint: { id: 41, mapId: 11, order: 2, text: 'x' } }, { hintForm: hintForm(), ...withMaps });
      expect(text(field('Lugar entre las ayudas de la sala')!.querySelector('.ui-field__message'))).toBe('Déjalo vacío para no cambiarlo.');
    });

    it('sin texto, tocado, dice qué falta en el campo', async () => {
      const form = hintForm();
      form.get('text')!.markAsTouched();
      await render({ kind: 'hint-create', mapId: 11 }, { hintForm: form, ...withMaps });

      expect(text(field('Texto de la ayuda')!.querySelector('.ui-field__message'))).toBe('Escribe el texto de la ayuda.');
    });

    it('un texto de más de 280 caracteres (pegado) dice el tope en el campo', async () => {
      const form = hintForm();
      form.get('text')!.setValue('a'.repeat(281));
      form.get('text')!.markAsTouched();
      await render({ kind: 'hint-create', mapId: 11 }, { hintForm: form, ...withMaps });

      expect(text(field('Texto de la ayuda')!.querySelector('.ui-field__message'))).toBe('La ayuda admite hasta 280 caracteres.');
    });
  });

  // req: RF-07, CU-04
  describe('el personaje (F10-3)', () => {
    const characterForm = () => fb.group({
      characterKey: ['', Validators.required], displayName: ['', Validators.required], roleLabel: [''], portraitKey: [''],
      showInBrief: [true], displayOrder: [0],
    });

    it('pide clave y nombre, y opcionales el rol, el retrato, si sale en la ficha y el orden', async () => {
      await render({ kind: 'character-create' }, { characterForm: characterForm() });

      expect(fieldLabels()).toEqual([
        'Clave del personaje', 'Nombre', 'Rol', 'Retrato (clave del kit)', 'Aparece en la ficha del caso', 'Orden en la ficha',
      ]);
      expect(field('Clave del personaje')!.querySelector('[aria-required="true"]')).not.toBeNull();
      expect(field('Nombre')!.querySelector('[aria-required="true"]')).not.toBeNull();
      expect(field('Rol')!.querySelector('[aria-required="true"]')).toBeNull();
      expect(button('Guardar personaje')).toBeDefined();
    });
  });
});
