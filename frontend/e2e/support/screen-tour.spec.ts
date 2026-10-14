import { routes } from '../../src/app/app.routes';
import { TOUR_SCREENS, portalRoutePatterns } from './screen-tour';

/**
 * El recorrido de pantallas (capturas de F0-1 y línea base de Axe de F0-9) solo sirve si no se salta
 * ninguna pantalla: cada ruta del portal debe tener al menos una parada.
 */
describe('screen-tour: cobertura de rutas', () => {
  it('cada ruta hija de /portal tiene al menos una pantalla en el recorrido', () => {
    const patterns = portalRoutePatterns(routes);
    expect(patterns.length).toBeGreaterThan(5);
    const covered = new Set(TOUR_SCREENS.map(screen => screen.routePattern));
    const missing = patterns.filter(pattern => !covered.has(`portal/${pattern}`));
    expect(missing).toEqual([]);
  });

  it('incluye la portada y el acceso como pantallas públicas', () => {
    const publicPatterns = TOUR_SCREENS.filter(screen => screen.role === 'publico').map(screen => screen.routePattern);
    expect(publicPatterns).toEqual(expect.arrayContaining(['', 'login']));
  });

  it('no repite identificadores (cada captura tiene un nombre único por rol)', () => {
    const keys = TOUR_SCREENS.map(screen => `${screen.role}__${screen.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
