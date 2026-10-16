import { PatientState } from '../../core/models/simulation.model';

/** Estado inicial documentado en el contrato PatientState (Plan 3); el servidor manda el vigente tras cada decisión. */
export const PATIENT_INITIAL_STATE: PatientState = {
  emotionalState: 40, trustLevel: 20, openness: 15, crisisLevel: 60,
};
