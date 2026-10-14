import { readFileSync } from 'fs';
import { join } from 'path';

function source(relative: string): string {
  return readFileSync(join(__dirname, relative), 'utf-8');
}

describe('portal: feedback de acciones', () => {
  const users = source('users.component.ts');
  // La plantilla vive en su propio archivo desde F7-2: el contrato mira la clase y la plantilla juntas.
  const grupos = source('../grupos/grupo-list.component.ts') + source('../grupos/grupo-list.component.html');
  const rubrics = source('rubrics.component.ts') + source('rubrics.component.html');

  it('Usuarios avisa el éxito con un aviso que no se borra', () => {
    expect(users).toContain("this.notify.success(selected ? 'La información se guardó correctamente.' : 'Usuario creado correctamente.');");
    expect(users).not.toContain("this.message.set(selected ? 'La información se guardó correctamente.'");
  });

  it('Usuarios cierra el diálogo si falla el cambio de estado', () => {
    expect(users).toMatch(/error: \(err: unknown\) => \{\s*this\.statusConfirmTarget\.set\(null\);/);
  });

  it('Grupos ya no usa window.confirm ni el diálogo antiguo: confirma con el diálogo de la biblioteca', () => {
    expect(grupos).not.toMatch(/\bconfirm\(`/);
    expect(grupos).not.toContain('app-confirm-dialog');
    expect(grupos).not.toContain('pendingConfirm');
    expect(grupos).toContain('this.dialog.confirm(options)');
    expect(grupos).toContain("tone: 'danger'");
  });

  it('Usuarios avisa el resultado de descartar una solicitud', () => {
    expect(users).toContain("this.notify.success('Solicitud descartada.');");
    expect(users).not.toContain("this.message.set('Solicitud descartada.')");
    expect(users).toContain("apiErrorMessage(err, 'No fue posible actualizar la solicitud.')");
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
