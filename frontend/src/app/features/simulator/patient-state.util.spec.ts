import {
  DEFAULT_INTERVENTION_RULES, PATIENT_INITIAL_STATE,
  applyFeedbackToPatient, applyPatientDelta, parseInterventionRules,
} from './patient-state.util';

describe('patient-state.util', () => {
  it('estado inicial documentado del contrato PatientState', () => {
    expect(PATIENT_INITIAL_STATE).toEqual({ emotionalState: 40, trustLevel: 20, openness: 15, crisisLevel: 60 });
  });

  it('aplica deltas por clasificación y clampa a [0,100]', () => {
    const next = applyFeedbackToPatient(PATIENT_INITIAL_STATE, DEFAULT_INTERVENTION_RULES,
      { classification: 'ADEQUATE', prohibitedConduct: false });
    expect(next).toEqual({ emotionalState: 50, trustLevel: 33, openness: 22, crisisLevel: 50 });
    let s = PATIENT_INITIAL_STATE;
    for (let i = 0; i < 10; i++) {
      s = applyFeedbackToPatient(s, DEFAULT_INTERVENTION_RULES, { classification: 'ADEQUATE', prohibitedConduct: false });
    }
    expect(s.trustLevel).toBeLessThanOrEqual(100);
    expect(s.crisisLevel).toBeGreaterThanOrEqual(0);
  });

  it('prohibida pisa la clasificación (deltas de "prohibited")', () => {
    const next = applyFeedbackToPatient(PATIENT_INITIAL_STATE, DEFAULT_INTERVENTION_RULES,
      { classification: 'INADEQUATE', prohibitedConduct: true });
    expect(next.trustLevel).toBe(0);          // 20 - 28 clampado
    expect(next.crisisLevel).toBe(83);        // 60 + 23
  });

  it('applyPatientDelta tolera deltas parciales', () => {
    expect(applyPatientDelta(PATIENT_INITIAL_STATE, { openness: 5 }).openness).toBe(20);
  });

  it('parseInterventionRules valida y cae al default ante basura', () => {
    expect(parseInterventionRules(null)).toEqual(DEFAULT_INTERVENTION_RULES);
    expect(parseInterventionRules({ nope: 1 })).toEqual(DEFAULT_INTERVENTION_RULES);
    const ok = parseInterventionRules(JSON.parse(JSON.stringify(DEFAULT_INTERVENTION_RULES)));
    expect(ok.byClassification.ADEQUATE.trustLevel).toBe(13);
  });
});
