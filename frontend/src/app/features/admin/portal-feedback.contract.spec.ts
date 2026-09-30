import { readFileSync } from 'fs';
import { join } from 'path';

function source(relative: string): string {
  return readFileSync(join(__dirname, relative), 'utf-8');
}

describe('portal: feedback de acciones', () => {
  const users = source('users.component.ts');
  const grupos = source('../grupos/grupo-list.component.ts');
  const rubrics = source('rubrics.component.ts');

  it('Usuarios avisa el éxito con un aviso que no se borra', () => {
    expect(users).toContain("this.notify.success(selected ? 'La información se guardó correctamente.' : 'Usuario creado correctamente.');");
    expect(users).not.toContain("this.message.set(selected ? 'La información se guardó correctamente.'");
  });

  it('Usuarios cierra el diálogo si falla el cambio de estado', () => {
    expect(users).toMatch(/error: \(err: unknown\) => \{\s*this\.statusConfirmTarget\.set\(null\);/);
  });

  it('Grupos ya no usa window.confirm', () => {
    expect(grupos).not.toMatch(/\bconfirm\(`/);
    expect(grupos).toContain('<app-confirm-dialog');
  });

  it('Grupos avisa crear, editar, borrar, copiar y asignar', () => {
    for (const text of ['Grupo creado.', 'Grupo actualizado.', 'Grupo eliminado.', 'Caso asignado al grupo.', 'Caso retirado del grupo.']) {
      expect(grupos).toContain(`this.notify.success('${text}')`);
    }
    expect(grupos).toContain('this.notify.success(`Código ${grupo.codigo} copiado al portapapeles.`)');
  });

  it('Rúbricas avisa el resultado de sus acciones', () => {
    expect(rubrics).toContain("this.notify.success('Rúbrica guardada.')");
    expect(rubrics).toContain("this.notify.success('Rúbrica asignada a la simulación.')");
  });
});
