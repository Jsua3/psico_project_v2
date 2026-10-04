import { SimulationWorldState } from '../../core/models/simulation.model';
import {
  NODE_EVIDENCE, choiceEvidence, collectViewedNpcKeys, isToolUsed, mergeEvidence, missingEvidence,
  missingEvidenceItems, nodeEvidence, toolUsed, unlockedExtraLines,
} from './evidence-gating.config';

function worldWith(partial: Partial<SimulationWorldState>): SimulationWorldState {
  return {
    attemptId: 'a', status: 'IN_PROGRESS',
    map: { id: 1, key: 'urgencias-crisis', title: '', width: 960, height: 540, theme: '', spawnX: 0, spawnY: 0, ambient: {} },
    player: { x: 0, y: 0 }, objects: [], collisions: [], tools: [],
    inventory: [], inspectedObjectKeys: [], viewedDialogueKeys: [], usedToolKeys: [], flags: {},
    ...partial,
  };
}

describe('evidence-gating.config', () => {
  it('toolUsed no confunde inventario con aplicación y reconoce el uso persistido', () => {
    expect(toolUsed(worldWith({ inventory: ['PAP'] }), 'PAP')).toBe(false);
    expect(toolUsed(worldWith({ usedToolKeys: ['PAP'] }), 'PAP')).toBe(true);
    expect(toolUsed(worldWith({ usedToolKeys: ['PAP@escucha-segura'] }), 'PAP')).toBe(true);
    expect(toolUsed(worldWith({ usedToolKeys: ['RISK_METER'] }), 'PAP')).toBe(false);
  });

  it('urgencias (caso PDF) exige enfermera + PAP; reporta exactamente lo que falta', () => {
    const def = nodeEvidence('hospital-urgencias')!;
    expect(missingEvidence(def, worldWith({}), new Set()))
      .toEqual(['npc:enfermera-urgencias', 'tool:PAP']);
    expect(missingEvidence(def, worldWith({ inventory: ['PAP'] }), new Set(['enfermera-urgencias'])))
      .toEqual(['tool:PAP']);
    expect(missingEvidence(def, worldWith({
      inventory: ['PAP'],
      usedToolKeys: ['PAP@familia-crisis'],
    }), new Set(['enfermera-urgencias'])))
      .toEqual([]);
  });

  it('C1 y C3 exigen que la valoración haya sido aplicada, no solo recogida', () => {
    for (const nodeKey of ['hospital-cierre-bloque', 'comisaria-accion-final']) {
      const def = nodeEvidence(nodeKey)!;
      expect(missingEvidence(def, worldWith({ inventory: ['RISK_METER'] }), new Set()))
        .toEqual(['tool:RISK_METER']);
      expect(missingEvidence(def, worldWith({
        inventory: ['RISK_METER'],
        usedToolKeys: ['RISK_METER@sobreviviente-consulta'],
      }), new Set())).toEqual([]);
    }
  });

  it('las líneas extra solo se desbloquean con la evidencia completa y el diálogo correcto', () => {
    const def = nodeEvidence('hospital-urgencias')!;
    const ready = worldWith({ inventory: ['PAP'], usedToolKeys: ['PAP@familia-crisis'] });
    expect(unlockedExtraLines(def, 'familia-duelo', worldWith({}), new Set())).toEqual([]);
    expect(unlockedExtraLines(def, 'otro-dialogo', ready, new Set(['enfermera-urgencias']))).toEqual([]);
    expect(unlockedExtraLines(def, 'familia-duelo', ready, new Set(['enfermera-urgencias'])).length).toBeGreaterThan(0);
  });

  it('nodos sin definición no bloquean nada', () => {
    expect(nodeEvidence('cierre-caso')).toBeNull();
    expect(missingEvidence(null, worldWith({}), new Set())).toEqual([]);
  });

  it('toda herramienta exigida usa tool_code reales de la BD (mayúsculas)', () => {
    const real = ['PAP', 'SPIKES', 'RISK_METER', 'SAFETY_ROUTE', 'REFLECTION_JOURNAL'];
    for (const def of Object.values(NODE_EVIDENCE)) {
      for (const tool of [...(def.tools ?? []), ...(def.usedTools ?? [])]) expect(real).toContain(tool);
    }
  });

  it('acepta requisitos de evidencia configurados por respuesta autorada', () => {
    const def = choiceEvidence({
      key: 'c1',
      text: 'Responder despues de explorar',
      decisionOptionId: 10,
      requiredToolCode: 'PAP',
      effect: {
        requiresNpcs: ['enfermera-urgencias'],
        requiresTools: ['RISK_METER'],
        requiresInspected: ['historia-clinica'],
      },
    })!;
    expect(missingEvidence(def, worldWith({}), new Set())).toEqual([
      'npc:enfermera-urgencias',
      'tool:PAP',
      'tool:RISK_METER',
      'inspected:historia-clinica',
    ]);
    const merged = mergeEvidence(nodeEvidence('hospital-urgencias'), def)!;
    expect(merged.tools).toEqual(['RISK_METER']);
    expect(merged.usedTools).toEqual(['PAP']);
  });
});

describe('evidence-gating.config: lo que falta, estructurado', () => {
  it('missingEvidenceItems distingue TENER (toolOwned) de USAR (toolUsed) y conserva el orden', () => {
    const def = nodeEvidence('hospital-urgencias')!;
    expect(missingEvidenceItems(def, worldWith({}), new Set())).toEqual([
      { kind: 'npc', key: 'enfermera-urgencias' },
      { kind: 'toolUsed', key: 'PAP' },
    ]);
    // tener la herramienta no basta para la compuerta de «usar»
    expect(missingEvidenceItems(def, worldWith({ inventory: ['PAP'] }), new Set(['enfermera-urgencias'])))
      .toEqual([{ kind: 'toolUsed', key: 'PAP' }]);
    const spikes = nodeEvidence('hospital-accion-etica')!;
    expect(missingEvidenceItems(spikes, worldWith({}), new Set())).toEqual([{ kind: 'toolOwned', key: 'SPIKES' }]);
    expect(missingEvidenceItems(spikes, worldWith({ inventory: ['SPIKES'] }), new Set())).toEqual([]);
  });

  it('missingEvidenceItems incluye lo revisado y respeta el mundo nulo o la definición nula', () => {
    const def = { inspected: ['expediente-caso'], missingMessage: '' };
    expect(missingEvidenceItems(def, worldWith({}), new Set())).toEqual([{ kind: 'inspected', key: 'expediente-caso' }]);
    expect(missingEvidenceItems(def, worldWith({ inspectedObjectKeys: ['expediente-caso'] }), new Set())).toEqual([]);
    expect(missingEvidenceItems(null, worldWith({}), new Set())).toEqual([]);
    expect(missingEvidenceItems(def, null, new Set())).toEqual([]);
  });

  it('las personas habladas salen de la señal del componente y de flags.viewedNpcKeys del servidor', () => {
    const def = nodeEvidence('hospital-urgencias')!;
    const persisted = worldWith({ usedToolKeys: ['PAP'], flags: { viewedNpcKeys: ['enfermera-urgencias', 7, ''] } });
    expect(missingEvidenceItems(def, persisted, new Set())).toEqual([]);
    expect([...collectViewedNpcKeys(persisted, new Set(['otra']))].sort()).toEqual(['enfermera-urgencias', 'otra']);
    expect([...collectViewedNpcKeys(null, new Set(['a']))]).toEqual(['a']);
  });

  it('missingEvidence se conserva idéntico (cadenas npc:/tool:/inspected:) sobre la nueva base', () => {
    const def = { npcs: ['n'], usedTools: ['U'], tools: ['T'], inspected: ['i'], missingMessage: '' };
    expect(missingEvidence(def, worldWith({}), new Set())).toEqual(['npc:n', 'tool:U', 'tool:T', 'inspected:i']);
  });

  it('isToolUsed reconoce el uso persistido con o sin objetivo', () => {
    expect(isToolUsed(['PAP'], 'PAP')).toBe(true);
    expect(isToolUsed(['PAP@familia-crisis'], 'PAP')).toBe(true);
    expect(isToolUsed(['PAPA@x'], 'PAP')).toBe(false);
    expect(isToolUsed([], 'PAP')).toBe(false);
  });

  it('los mensajes de respaldo llevan tilde y no nombran técnicas (límite de producto 1)', () => {
    const fallback = choiceEvidence({
      key: 'c', text: 't', decisionOptionId: 1, requiredToolCode: 'PAP', effect: {},
    })!;
    expect(fallback.missingMessage).toMatch(/^Información insuficiente:/);
    for (const def of [...Object.values(NODE_EVIDENCE), fallback]) {
      expect(def.missingMessage).toMatch(/^Información insuficiente: /);
      expect(def.missingMessage).not.toMatch(/PAP|SPIKES|EPICEE|RISK_METER|Primeros Auxilios|valoraci[oó]n/i);
      expect(def.missingMessage).not.toMatch(/\binformacion\b/i);
    }
  });
});
