// Phaser toca canvas/WebGL al importarse y jsdom no lo soporta: la ruta del ensayo carga la pantalla del juego.
vi.mock('phaser', () => ({
  __esModule: true,
  default: { Scene: class {}, AUTO: 0, Scale: { FIT: 0, CENTER_BOTH: 0 }, Math: { Clamp: (v: number) => v }, Input: { Keyboard: { JustDown: () => false } }, Game: class {} },
}));

import { TestBed } from '@angular/core/testing';
import { SimulationPlayComponent } from './features/simulator/simulation-play.component';
import { Router } from '@angular/router';

import { routes } from './app.routes';
import { authGuard, passwordChangeGuard } from './core/auth/auth.guard';
import { AuthService } from './core/auth/auth.service';
import { canLeaveGuard } from './core/navigation/can-leave.guard';
import { ChangePasswordComponent } from './features/account/change-password.component';
import { rutasEditorCaso, rutasNuevoCaso } from './features/autoria/autoria.routes';
import { InvitationsComponent } from './features/invitations/invitations.component';
import { ReporteEstudianteComponent } from './features/reportes/reporte-estudiante.component';
import { caseUnlockedGuard } from './features/simulator/case-unlocked.guard';
import { NotFoundComponent } from './features/public/not-found.component';
import { ForbiddenComponent } from './features/public/forbidden.component';
import { OfflineComponent } from './features/public/offline.component';

/**
 * Plan visual F3-3: solo las superficies de juego ocultan la barra del portal (`data.chrome = 'hidden'`). P6: el editor
 * nuevo de casos trae su propia barra de vidrio (con el camino de vuelta a «Mis casos»), así que no lleva la del portal
 * (`data.chrome = 'propio'`): una sola barra en pantalla, y la página se desplaza como en el portal.
 */
describe('app.routes: cromo del portal', () => {
  const hijos = () => routes.find(route => route.path === 'portal')!.children ?? [];

  it('jugar, simulador/:caseVersionId y el ensayo del caso ocultan la barra; ninguna otra ruta del portal', () => {
    const hidden = hijos().filter(child => child.data?.['chrome'] === 'hidden').map(child => child.path);
    expect(hidden).toEqual(['jugar', 'simulador/:caseVersionId', 'casos/:caseVersionId/ensayo']);
  });

  it('la ruta del ensayo es de docentes y administradores, oculta la barra y usa la pantalla del juego', async () => {
    const ensayo = hijos().find(c => c.path === 'casos/:caseVersionId/ensayo')!;
    expect(ensayo.data).toMatchObject({ chrome: 'hidden', mode: 'rehearsal' });
    expect(await (ensayo.loadComponent as () => Promise<unknown>)()).toBe(SimulationPlayComponent);
    const pos = (path: string) => hijos().findIndex(c => c.path === path);
    expect(pos('casos/:caseVersionId/ensayo')).toBeLessThan(pos('casos/:caseVersionId/editor'));
  });

  it('crear un caso y el editor de casos traen su propia barra (chrome: propio)', () => {
    const propio = hijos().filter(child => child.data?.['chrome'] === 'propio').map(child => child.path);
    expect(propio).toEqual(['casos/nuevo', 'casos/:caseVersionId/editor']);
  });
});

/**
 * P6: el editor nuevo de casos vive en casos/:caseVersionId/editor y crear un caso en casos/nuevo; ambos para PROFESOR y
 * ADMIN (el servidor hace cumplir que un PROFESOR solo abra los suyos). El editor anterior se retiró (P6, tarea 8).
 */
// req: RF-12, RNF-002
describe('app.routes: editor de casos', () => {
  const children = routes.find(route => route.path === 'portal')!.children ?? [];
  const ruta = (path: string) => children.find(child => child.path === path)!;

  it('el editor y crear un caso cargan las rutas del editor nuevo, perezosas', async () => {
    const editor = await (ruta('casos/:caseVersionId/editor').loadChildren as () => Promise<unknown>)();
    expect(editor).toBe(rutasEditorCaso);
    const nuevo = await (ruta('casos/nuevo').loadChildren as () => Promise<unknown>)();
    expect(nuevo).toBe(rutasNuevoCaso);
    expect(ruta('casos/nuevo').loadComponent).toBeUndefined();
  });

  it('el editor anterior ya no existe: ninguna ruta lleva a casos/:caseVersionId/editor-anterior', () => {
    expect(children.map(child => child.path)).not.toContain('casos/:caseVersionId/editor-anterior');
  });

  it('las dos llevan la guardia de rol de «casos»: docentes y administradores pasan; el estudiante, no', () => {
    for (const path of ['casos/nuevo', 'casos/:caseVersionId/editor', 'casos/:caseVersionId/ensayo']) {
      const decide = (role: string) => {
        const auth = { getToken: () => 'x', isTokenMalformed: () => false, isTokenExpired: () => false, clearSession: () => undefined,
          hasRole: (...roles: string[]) => roles.includes(role) };
        const router = { createUrlTree: (commands: unknown[]) => ({ commands }) };
        TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }, { provide: Router, useValue: router }] });
        const result = TestBed.runInInjectionContext(() => (ruta(path).canActivate![0] as (...args: unknown[]) => unknown)({}, { url: '/portal/casos' }));
        TestBed.resetTestingModule();
        return result;
      };
      expect(decide('PROFESOR'), path).toBe(true);
      expect(decide('ADMIN'), path).toBe(true);
      expect(decide('ESTUDIANTE'), path).toEqual({ commands: ['/portal/sin-permiso'] });
    }
  });

  it('«casos/nuevo» va antes que la ruta de un caso y los dos antes del comodín', () => {
    const pos = (path: string) => children.findIndex(child => child.path === path);
    expect(pos('casos/nuevo')).toBeLessThan(pos('casos/:caseVersionId/editor'));
    expect(pos('casos/:caseVersionId/editor')).toBeLessThan(pos('**'));
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
 * Plan visual F4-3: «Sin conexión» se precarga con red (sin red ya está cargada; si aun así falla, no hay bucle: ver
 * offline-navigation.spec) y «Sin permiso»
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

/**
 * Plan visual F5-4: salir del editor de avatar con cambios sin guardar pregunta antes (canLeaveGuard → canLeave del
 * editor). F5-5: abrir por dirección un caso bloqueado vuelve al catálogo con el motivo.
 */
// req: BLOQUE-H, SIEP-RF-12 (gancho de interfaz)
describe('app.routes: editor de avatar', () => {
  // F5-5: abrir por dirección un caso bloqueado vuelve al catálogo con el motivo (después de la guardia de rol).
  it('«simulador/:caseVersionId» mira el desbloqueo tras el rol', () => {
    const children = routes.find(route => route.path === 'portal')!.children ?? [];
    const play = children.find(child => child.path === 'simulador/:caseVersionId')!;
    expect(play.canActivate).toHaveLength(2);
    expect(play.canActivate![1]).toBe(caseUnlockedGuard);
  });

  it('«personaje» lleva la guardia de cambios sin guardar', () => {
    const children = routes.find(route => route.path === 'portal')!.children ?? [];
    expect(children.find(child => child.path === 'personaje')!.canDeactivate).toEqual([canLeaveGuard]);
  });
});

/**
 * ED-5 (E2): el ADMIN no juega. Las órdenes de juego (`attempt.play`) son solo del ESTUDIANTE y el servidor responde 403
 * a PROFESOR y ADMIN; la sala y el caso tampoco se abren para ellos (antes la guardia dejaba pasar al ADMIN y cada
 * petición del juego terminaba en «No tienes permisos»).
 */
// req: ED-5, RNF-002
describe('app.routes: solo el estudiante juega', () => {
  const children = routes.find(route => route.path === 'portal')!.children ?? [];
  const guardFor = (path: string) => children.find(child => child.path === path)!.canActivate![0] as (...args: unknown[]) => unknown;

  for (const path of ['jugar', 'simulador/:caseVersionId']) {
    it(`«${path}»: el administrador y el docente van a «Sin permiso»; el estudiante pasa`, () => {
      const decide = (role: string) => {
        const auth = { getToken: () => 'x', isTokenMalformed: () => false, isTokenExpired: () => false, clearSession: () => undefined,
          hasRole: (...roles: string[]) => roles.includes(role) };
        const router = { createUrlTree: (commands: unknown[]) => ({ commands }) };
        TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }, { provide: Router, useValue: router }] });
        const result = TestBed.runInInjectionContext(() => guardFor(path)({}, { url: '/portal/jugar' }));
        TestBed.resetTestingModule();
        return result;
      };
      expect(decide('ESTUDIANTE')).toBe(true);
      expect(decide('ADMIN')).toEqual({ commands: ['/portal/sin-permiso'] });
      expect(decide('PROFESOR')).toEqual({ commands: ['/portal/sin-permiso'] });
    });
  }
});

/**
 * E2-9 (RN-10): una cuenta aprobada entra con una contraseña temporal y el servidor le niega todo (403
 * `PASSWORD_CHANGE_REQUIRED`) salvo `/api/auth/**`. «Cambia tu contraseña» vive FUERA del portal (sin barra ni
 * destinos que el servidor negaría) y el portal no se abre hasta cambiarla.
 */
// req: RN-10
describe('app.routes: cambio de contraseña obligatorio', () => {
  it('«cambiar-contrasena» es de nivel superior, pide sesión y carga su pantalla', async () => {
    const route = routes.find(entry => entry.path === 'cambiar-contrasena')!;
    expect(route.canActivate).toEqual([authGuard]);
    expect(await (route.loadComponent as () => Promise<unknown>)()).toBe(ChangePasswordComponent);
    expect(routes.indexOf(route)).toBeLessThan(routes.findIndex(entry => entry.path === '**'));
  });

  it('el portal exige sesión y, después, que no haya un cambio de contraseña pendiente', () => {
    const portal = routes.find(route => route.path === 'portal')!;
    expect(portal.canActivate).toEqual([authGuard, passwordChangeGuard]);
  });
});

/** E2-10 (C5): la bandeja de invitaciones del estudiante es una ruta propia del portal (decisión del usuario). */
// req: SIEP-RF-04, D-14
describe('app.routes: bandeja de invitaciones', () => {
  it('«invitaciones» es hija del portal, guardada por los roles de su destino del menú, y carga la bandeja', async () => {
    const children = routes.find(route => route.path === 'portal')!.children ?? [];
    const inbox = children.find(child => child.path === 'invitaciones')!;
    expect(inbox).toBeDefined();
    expect(inbox.canActivate).toHaveLength(1);
    expect(await (inbox.loadComponent as () => Promise<unknown>)()).toBe(InvitationsComponent);
    expect(children.indexOf(inbox)).toBeLessThan(children.findIndex(child => child.path === '**'));
  });
});

/** F10-7† (C3): el reporte de un estudiante es una ruta del portal con los roles de Reportes, antes del comodín. */
// req: RF-26, CU-15
describe('app.routes: reporte de un estudiante', () => {
  it('«reportes/estudiante/:estudianteId» es hija del portal, guardada por los roles de Reportes, y carga el reporte', async () => {
    const children = routes.find(route => route.path === 'portal')!.children ?? [];
    const report = children.find(child => child.path === 'reportes/estudiante/:estudianteId')!;
    expect(report).toBeDefined();
    expect(report.canActivate).toHaveLength(1);
    expect(report.title).toBe('Reporte del estudiante');
    expect(await (report.loadComponent as () => Promise<unknown>)()).toBe(ReporteEstudianteComponent);
    expect(children.indexOf(report)).toBeLessThan(children.findIndex(child => child.path === '**'));
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
