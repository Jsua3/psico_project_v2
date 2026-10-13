import { routes } from './app.routes';
import { NotFoundComponent } from './features/public/not-found.component';
import { ForbiddenComponent } from './features/public/forbidden.component';
import { OfflineComponent } from './features/public/offline.component';

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

/**
 * Plan visual F4-3: «Sin conexión» se carga SIN código perezoso (sin red, un loadComponent no llegaría) y «Sin permiso»
 * vive en el portal, antes de su comodín.
 */
// req: BLOQUE-H (estados)
describe('app.routes: páginas de estado', () => {
  it('«sin-conexion» es de nivel superior, fuera del portal, sin guardias y marcada para precargarse con red', async () => {
    // Importarla directa la dejaba lista sin red pero sumaba ~80 kB al bundle inicial; precargada (PreloadMarkedRoutes)
    // queda lista igual sin crecer el arranque.
    const offline = routes.find(route => route.path === 'sin-conexion')!;
    expect(offline.data).toEqual({ precargar: true });
    expect(await (offline.loadComponent as () => Promise<unknown>)()).toBe(OfflineComponent);
    expect(offline.canActivate).toBeUndefined();
    expect(routes.indexOf(offline)).toBeLessThan(routes.findIndex(route => route.path === '**'));
  });

  it('«sin-permiso» es hija del portal (perezosa: con red), antes de su comodín', async () => {
    const children = routes.find(route => route.path === 'portal')!.children ?? [];
    const forbidden = children.find(child => child.path === 'sin-permiso')!;
    expect(await (forbidden.loadComponent as () => Promise<unknown>)()).toBe(ForbiddenComponent);
    expect(children.indexOf(forbidden)).toBeLessThan(children.findIndex(child => child.path === '**'));
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
