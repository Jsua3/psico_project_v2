import {
  InterventionRuleSet, PatientState, PatientStateDelta, SimulationFeedback,
} from '../../core/models/simulation.model';

/** Estado inicial documentado en el contrato PatientState (Plan 3). */
export const PATIENT_INITIAL_STATE: PatientState = {
  emotionalState: 40, trustLevel: 20, openness: 15, crisisLevel: 60,
};

/** Espejo de assets/game/scenarios/intervention-rules.json (fallback offline). */
export const DEFAULT_INTERVENTION_RULES: InterventionRuleSet = {
  byClassification: {
    ADEQUATE:   { trustLevel: 13, emotionalState: 10, crisisLevel: -10, openness: 7 },
    RISKY:      { trustLevel: -7, crisisLevel: 9, openness: -3 },
    INADEQUATE: { trustLevel: -5, crisisLevel: 12, emotionalState: -6 },
  },
  prohibited: { trustLevel: -28, crisisLevel: 23, emotionalState: -18, openness: -17 },
};

const clamp = (v: number): number => Math.max(0, Math.min(100, Math.round(v)));

export function applyPatientDelta(state: PatientState, delta: PatientStateDelta): PatientState {
  return {
    emotionalState: clamp(state.emotionalState + (delta.emotionalState ?? 0)),
    trustLevel: clamp(state.trustLevel + (delta.trustLevel ?? 0)),
    openness: clamp(state.openness + (delta.openness ?? 0)),
    crisisLevel: clamp(state.crisisLevel + (delta.crisisLevel ?? 0)),
  };
}

/** Conducta prohibida pisa la clasificación (contrato InterventionRuleSet). */
export function applyFeedbackToPatient(
  state: PatientState,
  rules: InterventionRuleSet,
  feedback: Pick<SimulationFeedback, 'classification' | 'prohibitedConduct'>,
): PatientState {
  const delta = feedback.prohibitedConduct
    ? rules.prohibited
    : rules.byClassification[feedback.classification];
  return applyPatientDelta(state, delta ?? {});
}

function isDelta(x: unknown): x is PatientStateDelta {
  if (!x || typeof x !== 'object') return false;
  return Object.entries(x as Record<string, unknown>).every(
    ([k, v]) => ['emotionalState', 'trustLevel', 'openness', 'crisisLevel'].includes(k) && typeof v === 'number');
}

export function parseInterventionRules(raw: unknown): InterventionRuleSet {
  const r = raw as InterventionRuleSet | null;
  const by = r?.byClassification;
  if (by && isDelta(by.ADEQUATE) && isDelta(by.RISKY) && isDelta(by.INADEQUATE) && isDelta(r.prohibited)) {
    return r;
  }
  return DEFAULT_INTERVENTION_RULES;
}
