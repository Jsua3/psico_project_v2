import { PATIENT_INITIAL_STATE } from './patient-state.util';

describe('patient-state.util', () => {
  it('estado inicial documentado del contrato PatientState', () => {
    expect(PATIENT_INITIAL_STATE).toEqual({ emotionalState: 40, trustLevel: 20, openness: 15, crisisLevel: 60 });
  });
});
