import { CaseEditorView } from '../../core/models/simulation.model';
import { describeEditorChanges } from './editor-changes.util';

/**
 * La comparación del 409 (RNF-08, REGLA-011): lo que la otra sesión cambió, dicho por colección, para que quien edita
 * decida entre «Recargar» y «Reintentar» sabiendo qué hay del otro lado.
 */
const view = (over: Partial<CaseEditorView> = {}): CaseEditorView => ({
  caseVersionId: 7, revision: 3, title: 'Caso', semanticVersion: '1.0.0', status: 'DRAFT',
  nodes: [], decisions: [], maps: [], objects: [], tools: [], rubrics: [],
  checklistCompletion: 0, publishable: false,
  checklist: { items: [], contentReview: { fulfilled: false }, strict: false },
  ...over,
} as CaseEditorView);

const node = (id: number, title = `Nodo ${id}`) => ({ id, key: `n-${id}`, title }) as never;
const decision = (id: number, text = `Decisión ${id}`) => ({ id, text }) as never;

// req: RNF-08, REGLA-011
describe('describeEditorChanges: qué cambió entre mi pantalla y el servidor', () => {
  it('cuenta lo nuevo, lo quitado y lo modificado, con el género de cada colección', () => {
    const mine = view({ nodes: [node(1), node(2), node(3, 'Viejo')], decisions: [decision(1)] });
    const current = view({
      nodes: [node(1), node(3, 'Nuevo título'), node(4)],
      decisions: [decision(1), decision(2), decision(3)],
    });

    expect(describeEditorChanges(mine, current)).toEqual([
      'Nodos: 1 nuevo, 1 quitado, 1 modificado.',
      'Decisiones: 2 nuevas.',
    ]);
  });

  it('usa el plural cuando hay más de uno y respeta el orden nodos, decisiones, mapas, objetos, herramientas', () => {
    const mine = view();
    const current = view({
      tools: [{ id: 1, label: 'A' }, { id: 2, label: 'B' }] as never,
      maps: [{ id: 1, title: 'M' }] as never,
      objects: [{ id: 1, label: 'O' }, { id: 2, label: 'P' }] as never,
    });

    expect(describeEditorChanges(mine, current)).toEqual([
      'Mapas: 1 nuevo.',
      'Objetos: 2 nuevos.',
      'Herramientas: 2 nuevas.',
    ]);
  });

  it('sin diferencias en las colecciones, lo dice con la revisión de cada lado', () => {
    const mine = view({ revision: 5, nodes: [node(1)] });
    const current = view({ revision: 7, nodes: [node(1)] });

    expect(describeEditorChanges(mine, current)).toEqual([
      'La otra sesión guardó cambios que esta pantalla no muestra (de la revisión 5 a la 7).',
    ]);
  });

  it('sin el editor vigente (cuerpo recortado del servidor) no inventa diferencias', () => {
    expect(describeEditorChanges(view(), null)).toEqual([]);
  });

  it('un cambio en el título del caso se nombra', () => {
    const mine = view({ title: 'Caso A' });
    const current = view({ title: 'Caso B', revision: 4 });

    expect(describeEditorChanges(mine, current)[0]).toBe('El título del caso cambió: «Caso B».');
  });
});
