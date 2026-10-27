import { readFileSync } from 'fs';
import { join } from 'path';

import { responseClassWord } from '../outcome-text.util';

/**
 * El selector de destino de una opción de diálogo dice la clase de cada decisión en palabras («Con riesgo → cierre: …»),
 * no el código antiguo de la clasificación («RISKY»). La clase efectiva llega en `availableDecisions[].responseClass`.
 */
const source = readFileSync(join(__dirname, 'world-editor.component.ts'), 'utf-8');

describe('editor del mundo: la clase de cada decisión se lee en palabras', () => {
  it('la opción del selector usa la palabra de la clase y no imprime la clasificación antigua', () => {
    expect(source).toContain('{{ classWord(dec.responseClass) }} → {{ dec.targetNodeKey }}');
    expect(source).not.toContain('{{ dec.classification }}');
  });

  it('las cuatro clases salen con sus palabras de siempre', () => {
    expect(['RECOMMENDED', 'ACCEPTABLE', 'RISKY', 'CONTRAINDICATED'].map(responseClassWord))
      .toEqual(['Recomendada', 'Aceptable', 'Con riesgo', 'Contraindicada']);
  });
});
