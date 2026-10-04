import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'shell.component.ts'), 'utf-8');

describe('acción principal del menú lateral (T15.4)', () => {
  it('el estudiante ve «Ir al simulador»: el menú no sabe si hay un intento activo', () => {
    expect(source).toMatch(/return \{ label: 'Ir al simulador', route: '\/portal\/simulador', icon: 'play_arrow' \};/);
    expect(source).not.toContain("label: 'Continuar simulación'");
  });

  it('docentes y administradores conservan su acción', () => {
    expect(source).toContain("label: 'Crear o editar caso', route: '/portal/casos'");
    expect(source).toContain("label: 'Revisar intentos', route: '/portal/docente/trazabilidad'");
  });
});
