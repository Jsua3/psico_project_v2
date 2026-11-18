import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Fronteras entre las APIs por rol (Interface Segregation, P-05): quién puede depender de
 * `AuthoringApi` e `InstructorApi`. Si un componente nuevo necesita una de ellas, esta lista
 * obliga a decidirlo de forma explícita en lugar de inyectar «el servicio completo».
 */
const APP_DIR = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') ? [full] : [];
  });
}

const FILES = sourceFiles(APP_DIR).map(f => ({ path: relative(APP_DIR, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf-8') }));
const injecting = (api: string) => FILES.filter(f => f.text.includes(`inject(${api})`)).map(f => f.path).sort();

describe('fronteras de las APIs por rol', () => {
  it('solo el editor y sus vistas inyectan AuthoringApi', () => {
    expect(injecting('AuthoringApi')).toEqual([
      // El editor nuevo (P6) llega a la API solo por su fachada; ni el store ni las pantallas la inyectan.
      'features/autoria/api/autoria-api.service.ts',
      'features/simulator/case-authoring-hub.component.ts',
      'features/simulator/case-review-panel.component.ts',
      // Bloque B: el panel de autora del ensayo es autoría de la docente (lee los hitos declarados del editor, una vez).
      'features/simulator/rehearsal-panel.component.ts',
    ]);
  });

  it('solo el panel del instructor y el dashboard inyectan InstructorApi', () => {
    expect(injecting('InstructorApi')).toEqual([
      'features/dashboard/dashboard.component.ts',
      'features/simulator/instructor-trace.component.ts',
    ]);
  });

  it.each([
    'features/autoria/api/autoria-api.service.ts',
    'features/simulator/case-authoring-hub.component.ts',
    'features/simulator/case-review-panel.component.ts',
    'features/simulator/instructor-trace.component.ts',
  ])('%s depende solo de su API y no del servicio del jugador', path => {
    const file = FILES.find(f => f.path === path)!;
    expect(file.text).not.toContain('inject(SimulationService)');
  });

  it('el servicio del jugador no importa las APIs de autoría ni de instructor', () => {
    const player = FILES.find(f => f.path === 'core/api/simulation.service.ts')!;
    expect(player.text).not.toMatch(/authoring\.api|instructor\.api/);
  });

  it('las tres APIs comparten el sobre { data } desde un único archivo', () => {
    for (const name of ['simulation.service.ts', 'authoring.api.ts', 'instructor.api.ts']) {
      const file = FILES.find(f => f.path === `core/api/${name}`)!;
      expect(file.text).toContain("from './api-response'");
      expect(file.text).not.toMatch(/interface ApiResponse/);
    }
  });
});
