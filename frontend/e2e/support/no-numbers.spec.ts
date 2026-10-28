import { classValuesIn, measuresIn, measuresInText, retiredKeysIn, shapeOf } from './no-numbers';
import type { RecordedResponse } from './no-numbers';

function record(body: unknown, where = 'GET /api/simulation/attempts/x'): RecordedResponse {
  return { where, status: 200, body };
}

describe('no-numbers (ninguna cifra al estudiante, vista desde el navegador)', () => {
  it('deja pasar identificadores, duraciones, posiciones y contadores de hechos', () => {
    const body = {
      data: {
        attemptId: 'a', caseVersionId: 3, ordinal: 1, schemaVersion: 3, totalDurationSeconds: 90,
        player: { x: 10, y: 20 }, counts: { recommended: 6, acceptable: 0, risky: 0, contraindicated: 0, retries: 1 },
        flagged: true,
      },
    };

    expect(measuresIn([record(body)])).toEqual([]);
    expect(retiredKeysIn([record(body)])).toEqual([]);
  });

  it('marca un número que cuelga de una clave que no es de la lista blanca, en cualquier nivel', () => {
    const body = { data: { completionReport: { summary: { points: 72 } }, list: [{ trust: 0.5 }] } };

    expect(measuresIn([record(body)]).map(({ key, value }) => [key, value])).toEqual([['points', 72], ['trust', 0.5]]);
  });

  it('marca las claves del modelo numérico viejo aunque su valor no sea un número', () => {
    const body = { data: { metrics: null, nested: [{ finalScore: 'x' }] } };

    expect(retiredKeysIn([record(body)]).map(({ key }) => key)).toEqual(['metrics', 'finalScore']);
  });

  it('no cuenta un booleano ni un texto como una medida', () => {
    expect(measuresIn([record({ ok: true, label: '72' })])).toEqual([]);
  });

  it('no repite el mismo hallazgo de la misma ruta', () => {
    const records = [record({ score: 1 }), record({ score: 1 })];

    expect(measuresIn(records)).toHaveLength(1);
  });

  it('shapeOf sustituye los identificadores de la ruta', () => {
    expect(shapeOf('GET /api/simulation/attempts/1f0c7a52-3b59-4a73-9c3f-0a1b2c3d4e5f/hints'))
      .toBe('GET /api/simulation/attempts/{id}/hints');
    expect(shapeOf('GET /api/simulation/cases/12/brief')).toBe('GET /api/simulation/cases/{n}/brief');
  });

  it('classValuesIn encuentra un código de clase como valor y no como parte de un texto', () => {
    const records = [
      record({ data: { options: [{ text: 'Valorar el riesgo', class: 'RISKY' }] } }, 'GET /api/simulation/attempts/x/world'),
      record({ data: { retry: { allowed: true, message: 'Puedes volver a elegir en esta escena.' } } }),
    ];

    expect(classValuesIn(records)).toEqual(['GET /api/simulation/attempts/x/world → RISKY']);
  });

  describe('measuresInText', () => {
    it('detecta lo que un estudiante no debe leer', () => {
      expect(measuresInText('Puntaje total 72')).toHaveLength(1);
      expect(measuresInText('Estrés: 35 %')).toHaveLength(2);
      expect(measuresInText('Sacaste 8/10')).toEqual(['fracción de nota: «8/10»']);
      expect(measuresInText('Sumaste 40 pts')).toHaveLength(1);
      expect(measuresInText('Tu desempeño')).toHaveLength(1);
    });

    it('deja pasar números que no son medidas', () => {
      expect(measuresInText('Ley 1257 de 2008 + Decisión 2 de 6 · 00:30')).toEqual([]);
      expect(measuresInText('Reconsideradas: 1')).toEqual([]);
    });
  });
});
