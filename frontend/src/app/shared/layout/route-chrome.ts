import { Router } from '@angular/router';

export type RouteChrome = 'full' | 'hidden';

/**
 * `chrome` del árbol de rutas activo: la ruta más profunda que diga `data: { chrome: 'hidden' }` oculta la barra del
 * portal (el juego y la sala ocupan la ventana). Una sola fuente para el shell y para quien decide por pantalla
 * (la colocación de los avisos, F6-1).
 */
export function readRouteChrome(router: Router): RouteChrome {
  let route = router.routerState.snapshot.root;
  let chrome: RouteChrome = 'full';
  for (;;) {
    if (route.data?.['chrome'] === 'hidden') chrome = 'hidden';
    if (!route.firstChild) return chrome;
    route = route.firstChild;
  }
}
