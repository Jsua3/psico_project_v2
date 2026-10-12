import { routes } from './app.routes';
import { NotFoundComponent } from './features/public/not-found.component';

/** Plan visual F3-3: solo las superficies de juego ocultan la barra del portal (`data.chrome = 'hidden'`). */
describe('app.routes: cromo del portal', () => {
  it('jugar y simulador/:caseVersionId ocultan la barra; ninguna otra ruta del portal', () => {
    const portal = routes.find(route => route.path === 'portal')!;
    const hidden = (portal.children ?? []).filter(child => child.data?.['chrome'] === 'hidden').map(child => child.path);
    expect(hidden).toEqual(['jugar', 'simulador/:caseVersionId']);
  });
});

/**
 * Plan visual F3-6: una dirección que no existe muestra la 404 (no redirige en silencio al panel). Dentro del portal,
 * con la barra del portal; fuera, con la barra pública.
 */
// req: BLOQUE-H (estructura de página), RNF-004
describe('app.routes: página no encontrada', () => {
  it('el comodín de la raíz carga la 404 (fuera del portal) en vez de redirigir', async () => {
    const wildcard = routes.find(route => route.path === '**')!;
    expect(wildcard.redirectTo).toBeUndefined();
    expect(wildcard.data?.['fueraDelPortal']).toBe(true);
    const component = await (wildcard.loadComponent as () => Promise<unknown>)();
    expect(component).toBe(NotFoundComponent);
  });

  it('el portal tiene su propio comodín, el último de sus hijas, con la misma 404', async () => {
    const children = routes.find(route => route.path === 'portal')!.children ?? [];
    const wildcard = children.at(-1)!;
    expect(wildcard.path).toBe('**');
    const component = await (wildcard.loadComponent as () => Promise<unknown>)();
    expect(component).toBe(NotFoundComponent);
  });
});

/** La galería `/dev/ui` y el banco `/dev/barra` existen en desarrollo y en pruebas (ngDevMode) y nunca los tapa el comodín. */
describe('app.routes: rutas de desarrollo', () => {
  for (const path of ['dev/ui', 'dev/barra']) {
    it(`registra ${path} antes de la ruta comodín`, () => {
      const paths = routes.map(route => route.path);
      const index = paths.indexOf(path);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(paths.indexOf('**'));
    });
  }
});
