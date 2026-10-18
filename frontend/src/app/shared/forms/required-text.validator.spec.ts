import { FormControl } from '@angular/forms';

import { requiredText } from './required-text.validator';

/**
 * Un texto obligatorio que solo trae espacios no es un texto: el servidor lo recorta a vacío y responde 400. El validador
 * lo rechaza en el campo, con el mismo error `required` que el campo vacío (así se dice con el mismo mensaje).
 */
describe('requiredText', () => {
  const run = (value: unknown) => requiredText(new FormControl(value));

  it('acepta un texto con algo escrito, también con espacios alrededor', () => {
    expect(run('Mira cómo respira.')).toBeNull();
    expect(run('  a  ')).toBeNull();
  });

  it('rechaza lo vacío, lo que solo trae espacios o saltos de línea y lo que no se escribió', () => {
    expect(run('')).toEqual({ required: true });
    expect(run('   ')).toEqual({ required: true });
    expect(run('\n\t ')).toEqual({ required: true });
    expect(run(null)).toEqual({ required: true });
    expect(run(undefined)).toEqual({ required: true });
  });
});
