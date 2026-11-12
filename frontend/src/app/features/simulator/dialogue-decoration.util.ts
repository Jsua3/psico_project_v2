import {
  DialogueChoiceState, DialogueLineState, DialogueState, MapObjectState, SimulationWorldState,
} from '../../core/models/simulation.model';
import type { CopyContext } from './evidence-copy.util';
import { NodeEvidenceDef, unlockedExtraLines } from './evidence-gating.config';
import { ORIENTATION_COPY } from './orientation.config';

/**
 * Decoración de una conversación antes de mostrarla (extraída de
 * simulation-play.decorateDialogue, diseño F§7.6): filtra las decisiones que no
 * son de esta etapa, avisa UNA vez de lo que falta y marca las opciones de
 * herramienta que aún no se pueden usar. Nunca decide ni insinúa cuál opción es
 * la adecuada: solo mira ids, herramientas y evidencia.
 */
export interface DecorationCtx {
  nodeKey: string | null;
  /** Ids de las opciones de decisión activas; null o vacío = desconocido: no filtrar. */
  nodeOptionIds: readonly number[] | null;
  evidence: NodeEvidenceDef | null;
  world: SimulationWorldState | null;
  viewedNpcKeys: ReadonlySet<string>;
  copy: CopyContext;
  /** El aviso único de una conversación con decisiones (p. ej. «puedes conocer más»); null si no hay. */
  notice: string | null;
}

const isDecision = (choice: DialogueChoiceState): boolean => choice.decisionOptionId != null;

function activeIds(optionIds: readonly number[] | null | undefined): ReadonlySet<number> | null {
  return optionIds && optionIds.length ? new Set(optionIds) : null;
}

function hostsDecision(obj: MapObjectState): boolean {
  return !!obj.dialogue?.choices.some(isDecision);
}

/** Objetos del mundo cuya conversación aloja una de las decisiones activas (el anillo marca el objeto, nunca una opción). */
export function activeDecisionObjectKeys(
  world: { objects: readonly MapObjectState[] } | null, optionIds: readonly number[] | null,
): Set<string> {
  const ids = activeIds(optionIds);
  const keys = new Set<string>();
  if (!world || !ids) return keys;
  for (const obj of world.objects) {
    if (obj.dialogue?.choices.some(c => c.decisionOptionId != null && ids.has(c.decisionOptionId))) keys.add(obj.key);
  }
  return keys;
}

/** Objetos con decisiones, pero de otra etapa: se atenúan y al abrirlos solo informan. */
export function otherStageDecisionKeys(
  world: { objects: readonly MapObjectState[] } | null, optionIds: readonly number[] | null,
): Set<string> {
  const ids = activeIds(optionIds);
  const keys = new Set<string>();
  if (!world || !ids) return keys;
  for (const obj of world.objects) {
    if (hostsDecision(obj) && !obj.dialogue!.choices.some(c => c.decisionOptionId != null && ids.has(c.decisionOptionId))) {
      keys.add(obj.key);
    }
  }
  return keys;
}

export function decorateDialogueState(d: DialogueState, ctx: DecorationCtx): DialogueState {
  const ids = activeIds(ctx.nodeOptionIds);
  const hadDecision = d.choices.some(isDecision);

  // 1) Líneas que se desbloquean al reunir la evidencia (sin repetirlas si ya se añadieron).
  const present = new Set(d.lines.map(line => line.text));
  const extras = unlockedExtraLines(ctx.evidence, d.key, ctx.world, ctx.viewedNpcKeys).filter(text => !present.has(text));
  let lines: DialogueLineState[] = extras.length
    ? [...d.lines, ...extras.map((text, i) => ({
        order: d.lines.length + i + 1, speakerName: d.speakerName, text, emotion: 'positive',
      }))]
    : d.lines;

  // 2) Decisiones de otra etapa fuera; las opciones de herramienta se conservan siempre.
  let choices: DialogueChoiceState[] = d.choices;
  let stale = d.stale;
  if (ids) {
    choices = choices.filter(c => !isDecision(c) || ids.has(c.decisionOptionId!));
    if (hadDecision && !choices.some(isDecision)) {
      stale = true;
      if (!lines.some(line => line.text === ORIENTATION_COPY.notices.staleConversation)) {
        lines = [...lines, {
          order: lines.length + 1, speakerName: '', text: ORIENTATION_COPY.notices.staleConversation, emotion: 'neutral',
        }];
      }
    }
  }

  // 3) Un solo aviso para el conjunto de decisiones activas; ninguno por opción.
  const decisions = choices.filter(isDecision);
  const notice = decisions.length ? ctx.notice : null;

  // 4) Herramienta que el jugador aún no tiene.
  const inventory = ctx.world?.inventory ?? null;
  choices = choices.map(choice => {
    const { evidenceWarning: _legacy, ...clean } = choice;
    return inventory && clean.requiredToolCode
      ? { ...clean, toolMissing: !inventory.includes(clean.requiredToolCode) }
      : clean;
  });

  const { notice: _previous, ...rest } = d;
  return {
    ...rest, lines, choices,
    ...(stale ? { stale: true } : {}),
    ...(notice ? { notice } : {}),
  };
}
