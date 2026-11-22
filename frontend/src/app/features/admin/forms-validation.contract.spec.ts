import { readFileSync } from 'fs';
import { join } from 'path';

function source(relative: string): string {
  return readFileSync(join(__dirname, relative), 'utf-8');
}

describe('formularios: validar al enviar — Usuarios', () => {
  // Desde F7-6 el formulario vive en una hoja (`user-form-sheet`); la pantalla es dueña de su validación y de guardar.
  const users = source('users.component.ts');
  const sheet = source('user-form-sheet.component.ts');

  it('el botón solo se bloquea mientras guarda (y lo dice con «Guardando…»)', () => {
    expect(users + sheet).not.toContain('[disabled]="form.invalid || saving()"');
    expect(sheet).toContain('type="submit" icon="save" [loading]="host.saving()"');
  });

  it('cada campo explica su error', () => {
    for (const text of ['Escribe el nombre.', 'Escribe el apellido.', 'Escribe el correo.', 'Escribe un correo válido.', 'Elige un rol.', 'La contraseña es obligatoria al crear un usuario.', 'Usa al menos 10 caracteres.']) {
      expect(sheet).toContain(text);
    }
    expect(sheet).toContain('hint="Mínimo 10 caracteres."');
  });

  it('la contraseña se valida con validadores según crear/editar', () => {
    expect(users).toContain('private setPasswordRules(creating: boolean): void {');
    expect(users).not.toContain("this.error.set('La contraseña es obligatoria al crear usuarios.');");
    expect(users).toContain('focusFirstInvalid(this.sheetElement() ?? this.host.nativeElement);');
  });
});

describe('formularios: validar al enviar — Rúbricas', () => {
  // R1: el formulario vive en el editor de una rúbrica (`rubrica-editor.component.*`); la biblioteca lo aloja. El
  // contrato mira las clases y las plantillas de los dos juntas.
  const rubrics = source('rubrics.component.ts') + source('rubrics.component.html')
    + source('rubrica-editor.component.ts') + source('rubrica-editor.component.html');

  it('el botón Guardar solo se deshabilita mientras guarda', () => {
    expect(rubrics).not.toContain('[disabled]="form.invalid || saving()"');
  });

  it('cada campo explica su error', () => {
    for (const text of ['Escribe el nombre de la rúbrica.', 'Escribe la versión.', 'Escribe el nombre del criterio.', 'El peso va de 0 a 100.']) {
      expect(rubrics).toContain(text);
    }
    // R1: el campo «Orden» ya no existe (el orden es la posición del criterio).
    expect(rubrics).not.toContain('formControlName="displayOrder"');
    expect(rubrics).toContain('focusFirstInvalid(this.host.nativeElement);');
  });

  it('explica por qué Activar y Predeterminada no se pueden usar: pista visible y motivo en cada botón (F7-5)', () => {
    expect(rubrics).toContain('id="rubric-weight-hint"');
    expect(rubrics).toContain('Para activarla o hacerla predeterminada, la ponderación debe sumar 100 %.');
    expect(rubrics).toContain("'La ponderación debe sumar 100 %.'");
    expect((rubrics.match(/\[disabledReason\]="activateReason\(\)"/g) ?? []).length).toBe(2);
    // Los botones ya no se apagan con `disabled` sin decir por qué.
    expect(rubrics).not.toMatch(/\[disabled\]="!selected\(\)/);
  });
});

describe('formularios: validar al enviar — Grupos', () => {
  // La plantilla vive en su propio archivo desde F7-2: el contrato mira la clase y la plantilla juntas.
  const grupos = source('../grupos/grupo-list.component.ts') + source('../grupos/grupo-list.component.html');

  it('el formulario de grupo valida al enviar', () => {
    expect(grupos).not.toContain('[disabled]="form.invalid || saving()"');
    expect(grupos).toContain('Escribe el nombre del grupo.');
    expect(grupos).toContain('Escribe el código del grupo.');
    // Desde B5c recibe el formulario de la hoja (para enfocar su primer campo inválido): basta con que el método exista.
    expect(grupos).toMatch(/private invalidGroupForm\([^)]*\): boolean \{/);
  });
});
