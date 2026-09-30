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
