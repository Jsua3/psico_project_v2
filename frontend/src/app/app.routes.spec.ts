import { routes } from './app.routes';

/** Plan visual F3-3: solo las superficies de juego ocultan la barra del portal (`data.chrome = 'hidden'`). */
describe('app.routes: cromo del portal', () => {
  it('jugar y simulador/:caseVersionId ocultan la barra; ninguna otra ruta del portal', () => {
    const portal = routes.find(route => route.path === 'portal')!;
    const hidden = (portal.children ?? []).filter(child => child.data?.['chrome'] === 'hidden').map(child => child.path);
    expect(hidden).toEqual(['jugar', 'simulador/:caseVersionId']);
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
