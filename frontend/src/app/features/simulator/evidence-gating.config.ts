import { SimulationWorldState } from '../../core/models/simulation.model';

/**
 * Evidencia antes de decisión (Fase 9). Gating de PRESENTACIÓN: las opciones
 * siguen existiendo y el backend sigue siendo la autoridad del puntaje; aquí
 * solo se marca la decisión con información incompleta y se desbloquean líneas
 * narrativas al explorar. Nunca se revela cuál opción es la correcta.
 *
 * Claves reales: npcs = keys de NpcConfig (registro local de sesión);
 * tools = tool_code BD ('PAP', 'RISK_METER'…) contra world.usedToolKeys;
 * inspected = object_key contra world.inspectedObjectKeys.
 */
export interface NodeEvidenceDef {
  npcs?: string[];
  tools?: string[];
  inspected?: string[];
  missingMessage: string;
  unlockLines?: { dialogueKey: string; lines: string[] }[];
}

export const NODE_EVIDENCE: Record<string, NodeEvidenceDef> = {
  // ── Caso PDF: Violencia Familiar y Tentativa de Feminicidio ──
  'hospital-urgencias': {
    npcs: ['enfermera-urgencias'],
    tools: ['PAP'],
    missingMessage: 'Información insuficiente: habla con la enfermera de urgencias y aplica Primeros Auxilios Psicológicos antes de definir el foco de la intervención.',
    unlockLines: [{
      dialogueKey: 'familia-duelo',
      lines: ['(La madre respira un poco más despacio y te sostiene la mirada.) Gracias por quedarse… nadie nos había explicado nada. Solo díganme la verdad cuando se pueda.'],
    }],
  },
  'hospital-accion-etica': {
    tools: ['SPIKES'],
    missingMessage: 'Información insuficiente: revisa el protocolo EPICEE/SPIKES del estante antes de definir la actuación técnica y ética.',
  },
  'hospital-cierre-bloque': {
    tools: ['RISK_METER'],
    missingMessage: 'Información insuficiente: aplica el instrumento de valoración de riesgo antes de definir la prioridad psicosocial.',
  },
  'comisaria-accion-final': {
    tools: ['RISK_METER'],
    missingMessage: 'Información insuficiente: usa el instrumento de valoración estructurada antes de cerrar la actuación.',
  },
};

export function nodeEvidence(nodeKey: string | undefined | null): NodeEvidenceDef | null {
  if (!nodeKey) return null;
  return NODE_EVIDENCE[nodeKey] ?? null;
}

export function toolUsed(world: SimulationWorldState, code: string): boolean {
  return world.usedToolKeys.some(k => k === code || k.startsWith(`${code}@`));
}

/** Lista lo que falta ('npc:x' | 'tool:X' | 'inspected:y'); vacía = evidencia completa. */
export function missingEvidence(
  def: NodeEvidenceDef | null | undefined,
  world: SimulationWorldState | null,
  viewedNpcKeys: ReadonlySet<string>,
): string[] {
  if (!def || !world) return [];
  const missing: string[] = [];
  for (const npc of def.npcs ?? []) if (!viewedNpcKeys.has(npc)) missing.push(`npc:${npc}`);
  for (const tool of def.tools ?? []) if (!toolUsed(world, tool)) missing.push(`tool:${tool}`);
  for (const key of def.inspected ?? []) if (!world.inspectedObjectKeys.includes(key)) missing.push(`inspected:${key}`);
  return missing;
}

/** Líneas narrativas desbloqueadas para un diálogo cuando la evidencia está completa. */
export function unlockedExtraLines(
  def: NodeEvidenceDef | null | undefined,
  dialogueKey: string,
  world: SimulationWorldState | null,
  viewedNpcKeys: ReadonlySet<string>,
): string[] {
  if (!def?.unlockLines || missingEvidence(def, world, viewedNpcKeys).length) return [];
  return def.unlockLines.filter(u => u.dialogueKey === dialogueKey).flatMap(u => u.lines);
}
