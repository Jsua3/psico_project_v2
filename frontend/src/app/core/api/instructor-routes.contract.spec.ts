import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Las URL que usa `InstructorApi` existen en las rutas de Django (`urls_instructor.py`). Hallazgo de la revisión de F7:
 * el cliente llamaba `…/rubric-evaluation/` con barra final y el servidor solo enruta `…/rubric-evaluation`, así que la
 * calificación del docente devolvía 404 en la pila real y ninguna prueba contra mocks lo veía. Esta prueba compara
 * las plantillas de URL del cliente con las rutas declaradas del servidor, barra final incluida.
 */
// req: SIEP-CU-04
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const urlconf = readFileSync(join(REPO_ROOT, 'backend_django', 'apps', 'simulation', 'urls_instructor.py'), 'utf-8');
const clientSource = readFileSync(join(__dirname, 'instructor.api.ts'), 'utf-8');

/** `attempts/<uuid:attempt_id>/trace` → expresión que casa con `attempts/<un id>/trace`. */
const routePattern = (route: string) => new RegExp(`^${route.replace(/<[a-z]+:[a-z_]+>/g, '[^/]+')}$`);

describe('InstructorApi: las rutas del cliente existen en el servidor', () => {
  const routes = [...urlconf.matchAll(/path\("([^"]+)"/g)].map(match => match[1]);
  const used = [...clientSource.matchAll(/[`']\/api\/instructor\/([^`']+)[`']/g)].map(match => match[1].replace(/\$\{[^}]+\}/g, 'ID'));

  it('el servidor declara rutas y el cliente usa al menos las cuatro conocidas', () => {
    expect(routes.length).toBeGreaterThanOrEqual(4);
    expect(used.length).toBeGreaterThanOrEqual(4);
  });

  it.each(used)('«%s» casa con una ruta declarada (sin barra final de más ni de menos)', url => {
    expect(routes.some(route => routePattern(route).test(url)), `${url} no está en urls_instructor.py`).toBe(true);
  });
});
