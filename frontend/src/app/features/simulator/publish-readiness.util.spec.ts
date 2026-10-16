import { CaseEditorView, PublicationChecklistItem } from '../../core/models/simulation.model';
import { checklistItemName, publishReadiness } from './publish-readiness.util';

/**
 * «Publicar» en el editor de casos (plan F8-1): solo el administrador publica (matriz de políticas, `case.publish`) y,
 * si no se puede, el botón dice POR QUÉ con lo que falta de la lista de publicación (E2-7), no un botón mudo.
 */
const item = (code: string, label: string, fulfilled: boolean, required = true): PublicationChecklistItem => ({
  code, label, required, fulfilled, draft: false,
});

const FULL: PublicationChecklistItem[] = [
  item('contentOriginal', 'Contenido original — sin copiar personajes, mapas ni narrativa comercial.', true),
  item('ethicsReviewed', 'Revisión ética — caso validado por experto o comité.', true),
  item('safetyProtocols', 'Protocolos de seguridad — ruta VBG, NNA y salida segura incluidos.', true),
  item('noStigmatizing', 'Sin lenguaje estigmatizante ni estereotipos clínicos.', true),
  item('triggerWarnings', 'Advertencias de contenido sensible configuradas en nodos.', true),
  item('accessibilityOk', 'Accesibilidad — fallback accesible y controles táctiles probados.', true),
  item('scopeEducational', 'El caso declara su alcance educativo: es un ejercicio formativo.', false, false),
];

function view(over: Partial<CaseEditorView> = {}, items: PublicationChecklistItem[] = FULL): CaseEditorView {
  const required = items.filter(i => i.required);
  const done = required.every(i => i.fulfilled);
  return {
    caseVersionId: 7, revision: 3, title: 'Caso', semanticVersion: '1.0.0', status: 'DRAFT',
    nodes: [], decisions: [], maps: [], objects: [], tools: [], rubrics: [],
    checklistCompletion: done ? 100 : 50, publishable: done,
    checklist: { items, contentReview: { fulfilled: false }, strict: false },
    ...over,
  } as CaseEditorView;
}

const missing = (...codes: string[]) => FULL.map(i => (codes.includes(i.code) ? { ...i, fulfilled: false } : i));

// req: RF-05, CU-01, REGLA-011
describe('checklistItemName: el nombre corto de un ítem de la lista', () => {
  it('corta el texto en la raya larga y quita el punto final', () => {
    expect(checklistItemName('Contenido original — sin copiar personajes, mapas ni narrativa comercial.')).toBe('Contenido original');
    expect(checklistItemName('Accesibilidad — fallback accesible y controles táctiles probados.')).toBe('Accesibilidad');
  });

  it('un ítem sin raya conserva su texto sin el punto final; los dos puntos también cortan', () => {
    expect(checklistItemName('Sin lenguaje estigmatizante ni estereotipos clínicos.')).toBe('Sin lenguaje estigmatizante ni estereotipos clínicos');
    expect(checklistItemName('El caso declara su alcance educativo: es un ejercicio formativo.')).toBe('El caso declara su alcance educativo');
  });
});

// req: RF-05, CU-01, REGLA-011
describe('publishReadiness: ¿se puede publicar y, si no, por qué?', () => {
  it('solo el administrador publica: al docente no se le ofrece el botón (ni siquiera con la lista completa)', () => {
    expect(publishReadiness(view(), 'PROFESOR')).toEqual({ allowed: false, reason: null });
    expect(publishReadiness(view(), 'ESTUDIANTE')).toEqual({ allowed: false, reason: null });
    expect(publishReadiness(view(), undefined)).toEqual({ allowed: false, reason: null });
  });

  it('con la lista completa y el caso en borrador, el administrador puede publicar', () => {
    expect(publishReadiness(view(), 'ADMIN')).toEqual({ allowed: true, reason: null });
  });

  it('un caso en revisión también se puede publicar (el servidor lo admite con la bandera estricta apagada)', () => {
    expect(publishReadiness(view({ status: 'IN_REVIEW' }), 'ADMIN')).toEqual({ allowed: true, reason: null });
  });

  it('dice qué falta con el nombre corto de cada ítem obligatorio sin cumplir', () => {
    const result = publishReadiness(view({}, missing('contentOriginal', 'ethicsReviewed')), 'ADMIN');
    expect(result).toEqual({ allowed: true, reason: 'Falta: Contenido original y Revisión ética.' });
  });

  it('con un solo ítem pendiente no hay conjunción', () => {
    expect(publishReadiness(view({}, missing('accessibilityOk')), 'ADMIN').reason).toBe('Falta: Accesibilidad.');
  });

  it('un ítem opcional sin cumplir no bloquea la publicación', () => {
    expect(publishReadiness(view({}, FULL), 'ADMIN').reason).toBeNull();
  });

  it('con más de tres pendientes los resume: «…, … y 2 más»', () => {
    const result = publishReadiness(view({}, missing('contentOriginal', 'ethicsReviewed', 'safetyProtocols', 'noStigmatizing', 'triggerWarnings')), 'ADMIN');
    expect(result.reason).toBe('Falta: Contenido original, Revisión ética, Protocolos de seguridad y 2 más.');
  });

  it('un caso ya publicado o archivado se explica por su estado, no por la lista', () => {
    expect(publishReadiness(view({ status: 'PUBLISHED' }), 'ADMIN').reason)
      .toBe('Este caso ya está publicado: clona la versión para cambiarla.');
    expect(publishReadiness(view({ status: 'ARCHIVED' }), 'ADMIN').reason)
      .toBe('Esta versión está archivada y no se puede publicar.');
  });

  it('si el servidor dice que no es publicable y la lista no muestra nada pendiente, el motivo es general', () => {
    const result = publishReadiness(view({ publishable: false, checklistCompletion: 83 }, FULL), 'ADMIN');
    expect(result.reason).toBe('Falta completar la lista de publicación.');
  });
});
