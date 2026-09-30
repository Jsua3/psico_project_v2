import { readFileSync } from 'fs';
import { join } from 'path';

function source(relative: string): string {
  return readFileSync(join(__dirname, relative), 'utf-8');
}

describe('formularios: validar al enviar — Usuarios', () => {
  const users = source('users.component.ts');

  it('el botón solo se deshabilita mientras guarda', () => {
    expect(users).not.toContain('[disabled]="form.invalid || saving()"');
    expect(users).toMatch(/type="submit" \[disabled\]="saving\(\)"/);
  });

  it('cada campo explica su error', () => {
    for (const text of ['Escribe el nombre.', 'Escribe el apellido.', 'Escribe el correo.', 'Escribe un correo válido.', 'Elige un rol.', 'La contraseña es obligatoria al crear un usuario.', 'Usa al menos 8 caracteres.']) {
      expect(users).toContain(text);
    }
    expect(users).toContain('<mat-hint>Mínimo 8 caracteres.</mat-hint>');
  });

  it('la contraseña se valida con validadores según crear/editar', () => {
    expect(users).toContain('private setPasswordRules(creating: boolean): void {');
    expect(users).not.toContain("this.error.set('La contraseña es obligatoria al crear usuarios.');");
    expect(users).toContain('focusFirstInvalid(this.host.nativeElement);');
  });
});

describe('formularios: validar al enviar — Rúbricas', () => {
  const rubrics = source('rubrics.component.ts');

  it('el botón Guardar solo se deshabilita mientras guarda', () => {
    expect(rubrics).not.toContain('[disabled]="form.invalid || saving()"');
  });

  it('cada campo explica su error', () => {
    for (const text of ['Escribe el nombre de la rúbrica.', 'Escribe la versión.', 'Escribe el nombre del criterio.', 'El peso va de 0 a 100.', 'El orden empieza en 1.']) {
      expect(rubrics).toContain(text);
    }
    expect(rubrics).toContain('focusFirstInvalid(this.host.nativeElement);');
  });

  it('explica por qué Activar y Predeterminada están deshabilitados', () => {
    expect(rubrics).toContain('id="rubric-weight-hint"');
    expect(rubrics).toContain('Para activarla o hacerla predeterminada, la ponderación debe sumar 100 %.');
    expect((rubrics.match(/\[attr\.aria-describedby\]="totalWeight\(\) !== 100 \? 'rubric-weight-hint' : null"/g) ?? []).length).toBe(2);
  });
});

describe('formularios: validar al enviar — Grupos', () => {
  const grupos = source('../grupos/grupo-list.component.ts');

  it('el formulario de grupo valida al enviar', () => {
    expect(grupos).not.toContain('[disabled]="form.invalid || saving()"');
    expect(grupos).toContain('Escribe el nombre del grupo.');
    expect(grupos).toContain('Escribe el código del grupo.');
    expect(grupos).toContain('private invalidGroupForm(): boolean {');
  });
});
