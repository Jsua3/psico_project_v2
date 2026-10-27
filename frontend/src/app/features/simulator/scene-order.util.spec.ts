import { NodeEditorState } from '../../core/models/simulation.model';
import { moveScene, sceneKind, sceneKindLabel, sortScenes } from './scene-order.util';

const node = (id: number, over: Partial<NodeEditorState> = {}): NodeEditorState => ({
  id, key: `escena-${id}`, title: `Escena ${id}`, narrative: '', supportResources: [], requiredTools: [],
  sensitiveContent: false, safeExitRequired: false, warningMessage: null, terminal: false, startNode: false,
  positionX: null, positionY: null, intensity: 'MEDIUM', decisionPrompt: '', displayOrder: 0, ...over,
});

const ids = (nodes: NodeEditorState[]) => nodes.map(item => item.id);

/**
 * El orden informativo de las escenas (plan visual F10-3†; E3-6, RF-08): el editor las lista por el lugar que el servidor
 * guarda y, a igual lugar, por id (los nodos nuevos nacen en 0); mover una escena devuelve los ids de TODAS en el orden
 * nuevo, que es lo que el servidor pide.
 */
// req: RF-08, RF-09, CU-04
describe('orden de las escenas', () => {
  describe('sortScenes', () => {
    it('ordena por el lugar guardado', () => {
      const list = [node(1, { displayOrder: 2 }), node(2, { displayOrder: 0 }), node(3, { displayOrder: 1 })];
      expect(ids(sortScenes(list))).toEqual([2, 3, 1]);
    });

    it('a igual lugar ordena por id: los nodos nuevos (lugar 0) no desordenan a los que ya tenían uno distinto', () => {
      const list = [node(5), node(4), node(3, { displayOrder: 0 })];
      expect(ids(sortScenes(list))).toEqual([3, 4, 5]);
    });

    it('no modifica la lista recibida', () => {
      const list = [node(2, { displayOrder: 1 }), node(1, { displayOrder: 0 })];
      sortScenes(list);
      expect(ids(list)).toEqual([2, 1]);
    });
  });

  describe('moveScene', () => {
    const list = [node(10, { displayOrder: 0 }), node(11, { displayOrder: 1 }), node(12, { displayOrder: 2 })];

    it('sube una escena un lugar y devuelve los ids de todas en el orden nuevo', () => {
      expect(moveScene(list, 11, 'up')).toEqual([11, 10, 12]);
    });

    it('baja una escena un lugar', () => {
      expect(moveScene(list, 11, 'down')).toEqual([10, 12, 11]);
    });

    it('la primera no sube y la última no baja: devuelve null', () => {
      expect(moveScene(list, 10, 'up')).toBeNull();
      expect(moveScene(list, 12, 'down')).toBeNull();
    });

    it('una escena que no está en la lista no se mueve', () => {
      expect(moveScene(list, 99, 'up')).toBeNull();
    });

    it('parte del orden que se ve, no del de llegada de la lista', () => {
      const arrived = [node(3, { displayOrder: 2 }), node(1, { displayOrder: 0 }), node(2, { displayOrder: 1 })];
      expect(moveScene(arrived, 3, 'up')).toEqual([1, 3, 2]);
    });
  });

  describe('sceneKind', () => {
    it('distingue el inicio, la conclusión y una escena corriente, con palabras', () => {
      expect(sceneKind(node(1, { startNode: true }))).toBe('start');
      expect(sceneKind(node(2, { terminal: true }))).toBe('conclusion');
      expect(sceneKind(node(3))).toBe('scene');
      expect([sceneKind(node(1, { startNode: true })), sceneKind(node(2, { terminal: true })), sceneKind(node(3))].map(sceneKindLabel))
        .toEqual(['Inicio', 'Conclusión', 'Escena']);
    });

    it('si es a la vez inicio y terminal gana el inicio (por dónde se entra al caso)', () => {
      expect(sceneKind(node(1, { startNode: true, terminal: true }))).toBe('start');
    });
  });
});
