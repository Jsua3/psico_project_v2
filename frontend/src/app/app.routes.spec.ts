import { routes } from './app.routes';

/** La galería `/dev/ui` existe en desarrollo y en pruebas (ngDevMode) y nunca la tapa el comodín. */
describe('app.routes: rutas de desarrollo', () => {
  it('registra dev/ui antes de la ruta comodín', () => {
    const paths = routes.map(route => route.path);
    const gallery = paths.indexOf('dev/ui');
    expect(gallery).toBeGreaterThanOrEqual(0);
    expect(gallery).toBeLessThan(paths.indexOf('**'));
  });
});
