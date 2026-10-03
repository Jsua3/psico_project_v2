import { DialogueChoiceState, SimulationWorldState } from '../../core/models/simulation.model';

/**
 * Evidencia antes de decisión (Fase 9). Gating de PRESENTACIÓN: las opciones
 * siguen existiendo y el backend sigue siendo la autoridad del puntaje; aquí
 * solo se advierte que falta evidencia al intentar decidir y se desbloquean
 * líneas narrativas al explorar. Nunca se revela cuál opción es la correcta.
 *
 * Claves reales: npcs = keys de NpcConfig o PERSON del mapa;
 * tools = tool_code BD adquirido/revisado; usedTools = aplicación persistida;
 * inspected = object_key contra world.inspectedObjectKeys.
 */
export interface NodeEvidenceDef {
  npcs?: string[];
  tools?: string[];
  usedTools?: string[];
  inspected?: string[];
  missingMessage: string;
  unlockLines?: { dialogueKey: string; lines: string[] }[];
}

export const NODE_EVIDENCE: Record<string, NodeEvidenceDef> = {
  // ── Caso PDF: Violencia Familiar y Tentativa de Feminicidio ──
  'hospital-urgencias': {
    npcs: ['enfermera-urgencias'],
    usedTools: ['PAP'],
    missingMessage: 'Información insuficiente: reúne lo recomendado en Urgencias antes de decidir.',
    unlockLines: [{
      dialogueKey: 'familia-duelo',
      lines: ['(La abuela respira un poco más despacio y te sostiene la mirada.) Gracias por quedarse… nadie nos había explicado nada. Solo díganme la verdad cuando se pueda.'],
    }],
  },
  'hospital-accion-etica': {
    tools: ['SPIKES'],
    missingMessage: 'Información insuficiente: reúne lo recomendado en la Sala de escucha familiar antes de decidir.',
  },
  'hospital-cierre-bloque': {
    usedTools: ['RISK_METER'],
    missingMessage: 'Información insuficiente: reúne lo recomendado en el Consultorio antes de decidir.',
  },
  'comisaria-accion-final': {
    usedTools: ['RISK_METER'],
    missingMessage: 'Información insuficiente: reúne lo recomendado en el Consultorio antes de decidir.',
  },
};

export function nodeEvidence(nodeKey: string | undefined | null): NodeEvidenceDef | null {
  if (!nodeKey) return null;
  return NODE_EVIDENCE[nodeKey] ?? null;
}

function stringsFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function choiceEvidence(choice: DialogueChoiceState | null | undefined): NodeEvidenceDef | null {
  if (!choice) return null;
  const effect = (choice.effect ?? {}) as Record<string, unknown>;
  const tools = stringsFrom(effect['requiresTools']);
  const def: NodeEvidenceDef = {
    npcs: stringsFrom(effect['requiresNpcs']),
    tools,
    usedTools: choice.requiredToolCode ? [choice.requiredToolCode] : [],
    inspected: stringsFrom(effect['requiresInspected']),
    missingMessage: 'Información insuficiente: reúne lo recomendado antes de decidir.',
  };
  return (def.npcs?.length || def.tools?.length || def.usedTools?.length || def.inspected?.length) ? def : null;
}

export function mergeEvidence(...defs: Array<NodeEvidenceDef | null | undefined>): NodeEvidenceDef | null {
  const present = defs.filter((def): def is NodeEvidenceDef => !!def);
  if (!present.length) return null;
  const uniq = (values: string[]) => Array.from(new Set(values));
  return {
    npcs: uniq(present.flatMap(def => def.npcs ?? [])),
    tools: uniq(present.flatMap(def => def.tools ?? [])),
    usedTools: uniq(present.flatMap(def => def.usedTools ?? [])),
    inspected: uniq(present.flatMap(def => def.inspected ?? [])),
    missingMessage: present[0].missingMessage,
    unlockLines: present.flatMap(def => def.unlockLines ?? []),
  };
}

/** Subconjunto del mundo que usa la compuerta de evidencia (lo cumple SimulationWorldState completo). */
export type EvidenceWorld = Pick<SimulationWorldState, 'inventory' | 'inspectedObjectKeys' | 'usedToolKeys' | 'flags'>;

/** Una herramienta cuenta como usada si hay una aplicación persistida: 'PAP' o 'PAP@objetivo'. */
export function isToolUsed(usedToolKeys: readonly string[], code: string): boolean {
  return usedToolKeys.some(k => k === code || k.startsWith(`${code}@`));
}

export function toolUsed(world: Pick<SimulationWorldState, 'usedToolKeys'>, code: string): boolean {
  return isToolUsed(world.usedToolKeys, code);
}

/** Personas habladas: la señal del componente más lo que el servidor persistió en flags['viewedNpcKeys']. */
export function collectViewedNpcKeys(
  world: Pick<SimulationWorldState, 'flags'> | null | undefined,
  viewedNpcKeys: ReadonlySet<string>,
): Set<string> {
  const viewed = new Set(viewedNpcKeys);
  const fromWorld = world?.flags?.['viewedNpcKeys'];
  if (Array.isArray(fromWorld)) {
    fromWorld
      .filter((key): key is string => typeof key === 'string' && key.length > 0)
      .forEach(key => viewed.add(key));
  }
  return viewed;
}

/**
 * Lo que falta, estructurado. Distingue TENER de USAR una herramienta:
 * toolOwned = recogerla; toolUsed = aplicarla en una conversación.
 */
export interface MissingItem { kind: 'npc' | 'toolUsed' | 'toolOwned' | 'inspected'; key: string }

export function missingEvidenceItems(
  def: NodeEvidenceDef | null | undefined,
  world: EvidenceWorld | null,
  viewedNpcKeys: ReadonlySet<string>,
): MissingItem[] {
  if (!def || !world) return [];
  const missing: MissingItem[] = [];
  const viewed = collectViewedNpcKeys(world, viewedNpcKeys);
  for (const key of def.npcs ?? []) if (!viewed.has(key)) missing.push({ kind: 'npc', key });
  for (const key of def.usedTools ?? []) if (!isToolUsed(world.usedToolKeys, key)) missing.push({ kind: 'toolUsed', key });
  for (const key of def.tools ?? []) if (!world.inventory.includes(key)) missing.push({ kind: 'toolOwned', key });
  for (const key of def.inspected ?? []) if (!world.inspectedObjectKeys.includes(key)) missing.push({ kind: 'inspected', key });
  return missing;
}

/** Lista lo que falta ('npc:x' | 'tool:X' | 'inspected:y'); vacía = evidencia completa. */
export function missingEvidence(
  def: NodeEvidenceDef | null | undefined,
  world: SimulationWorldState | null,
  viewedNpcKeys: ReadonlySet<string>,
): string[] {
  return missingEvidenceItems(def, world, viewedNpcKeys).map(item =>
    item.kind === 'npc' ? `npc:${item.key}`
      : item.kind === 'inspected' ? `inspected:${item.key}`
        : `tool:${item.key}`);
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
