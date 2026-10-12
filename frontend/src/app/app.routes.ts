import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth/auth.guard';
import { rolesFor } from './shared/layout/nav-items';

/**
 * Rutas de solo desarrollo (plan visual F0-4): la condición va escrita aquí, envolviendo el `import()`,
 * para que el build de producción (ngDevMode = false) la pliegue y no emita el chunk; `npm run build`
 * lo comprueba con scripts/ui/check-dist-dev-only.mjs.
 */
const DEV_ONLY_ROUTES: Routes = (typeof ngDevMode === 'undefined' || ngDevMode)
  ? [{
      path: 'dev/ui',
      title: 'Galería de componentes',
      loadComponent: () => import('./dev/ui-gallery/ui-gallery.component').then(m => m.UiGalleryComponent),
    }, {
      path: 'dev/barra',
      title: 'Banco de la barra',
      loadComponent: () => import('./dev/glass-bar-bench/glass-bar-bench.component').then(m => m.GlassBarBenchComponent),
    }]
  : [];

export const routes: Routes = [
  {
    path: '',
    title: 'Inicio',
    loadComponent: () => import('./features/public/landing.component').then(m => m.LandingComponent)
  },
  {
    path: 'login',
    title: 'Iniciar sesión',
    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'portal',
    title: 'Portal',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/layout/shell.component').then(m => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        title: 'Panel',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'jugar',
        title: 'Sala de simulación',
        data: { chrome: 'hidden' },
        canActivate: [roleGuard('ESTUDIANTE', 'ADMIN')],
        loadComponent: () => import('./features/simulator/game-menu.component').then(m => m.GameMenuComponent)
      },
      {
        path: 'simulador',
        title: 'Catálogo de casos',
        loadComponent: () => import('./features/simulator/simulation-catalog.component').then(m => m.SimulationCatalogComponent)
      },
      {
        path: 'simulador/:caseVersionId',
        title: 'Simulación',
        data: { chrome: 'hidden' },
        canActivate: [roleGuard('ESTUDIANTE', 'ADMIN')],
        loadComponent: () => import('./features/simulator/simulation-play.component').then(m => m.SimulationPlayComponent)
      },
      {
        path: 'personaje',
        title: 'Mi personaje',
        canActivate: [roleGuard(...rolesFor('personaje'))],
        loadComponent: () => import('./features/character/character-editor.component').then(m => m.CharacterEditorComponent)
      },
      {
        path: 'casos',
        title: 'Gestión de casos',
        canActivate: [roleGuard(...rolesFor('casos'))],
        loadComponent: () => import('./features/simulator/case-authoring-hub.component').then(m => m.CaseAuthoringHubComponent)
      },
      {
        path: 'casos/:caseVersionId/editor',
        title: 'Editor de caso',
        canActivate: [roleGuard(...rolesFor('casos'))],
        loadComponent: () => import('./features/simulator/case-editor.component').then(m => m.CaseEditorComponent)
      },
      {
        path: 'docente/trazabilidad',
        title: 'Trazabilidad docente',
        canActivate: [roleGuard(...rolesFor('trazabilidad'))],
        loadComponent: () => import('./features/simulator/instructor-trace.component').then(m => m.InstructorTraceComponent)
      },
      {
        path: 'rubricas',
        title: 'Rúbricas',
        canActivate: [roleGuard(...rolesFor('rubricas'))],
        loadComponent: () => import('./features/admin/rubrics.component').then(m => m.RubricsComponent)
      },
      {
        path: 'grupos',
        title: 'Grupos',
        canActivate: [roleGuard(...rolesFor('grupos'))],
        loadComponent: () => import('./features/grupos/grupo-list.component').then(m => m.GrupoListComponent)
      },
      {
        path: 'reportes',
        title: 'Reportes',
        canActivate: [roleGuard(...rolesFor('reportes'))],
        loadComponent: () => import('./features/reportes/reporte-grupo.component').then(m => m.ReporteGrupoComponent)
      },
      {
        path: 'admin/usuarios',
        title: 'Usuarios',
        canActivate: [roleGuard(...rolesFor('usuarios'))],
        loadComponent: () => import('./features/admin/users.component').then(m => m.UsersComponent)
      },
      {
        path: '**',
        title: 'Página no encontrada',
        loadComponent: () => import('./features/public/not-found.component').then(m => m.NotFoundComponent)
      }
    ]
  },
  { path: 'dashboard', redirectTo: 'portal/dashboard', pathMatch: 'full' },
  { path: 'simulador', redirectTo: 'portal/simulador', pathMatch: 'full' },
  { path: 'casos', redirectTo: 'portal/casos', pathMatch: 'full' },
  { path: 'docente', redirectTo: 'portal/docente/trazabilidad', pathMatch: 'full' },
  { path: 'rubricas', redirectTo: 'portal/rubricas', pathMatch: 'full' },
  { path: 'grupos', redirectTo: 'portal/grupos', pathMatch: 'full' },
  { path: 'reportes', redirectTo: 'portal/reportes', pathMatch: 'full' },
  { path: 'usuarios', redirectTo: 'portal/admin/usuarios', pathMatch: 'full' },
  ...DEV_ONLY_ROUTES,
  // Plan visual F3-6: una dirección desconocida muestra la 404 (antes redirigía en silencio al panel).
  {
    path: '**',
    title: 'Página no encontrada',
    data: { fueraDelPortal: true },
    loadComponent: () => import('./features/public/not-found.component').then(m => m.NotFoundComponent)
  }
];
