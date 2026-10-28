import type { Page } from '@playwright/test';
import type { Routes } from '@angular/router';

import { resetStudentConsent } from './consent';

/**
 * Recorrido de pantallas por rol: la misma lista alimenta las capturas de línea base (F0-1,
 * `scripts/ui/capture-baseline.e2e.ts`) y la línea base de Axe (F0-9, `e2e/a11y-baseline.e2e.ts`).
 * Solo importa TIPOS de Playwright: el spec de cobertura corre también en Vitest.
 */

export type TourRole = 'publico' | 'estudiante' | 'profesor' | 'admin';
export type SignedRole = Exclude<TourRole, 'publico'>;

export interface TourScreen {
  /** Nombre corto y estable: forma parte del nombre de archivo de la captura. */
  id: string;
  role: TourRole;
  /** Patrón de la ruta de Angular que cubre (`portal/simulador/:caseVersionId`). */
  routePattern: string;
  /** Ruta fija; si la ruta lleva un id se calcula con `resolvePath`. */
  path?: string;
  resolvePath?: (page: Page) => Promise<string>;
  /** Acciones tras cargar la ruta (abrir un panel) y espera de la señal propia de la pantalla. */
  ready?: (page: Page) => Promise<void>;
}

/** Credenciales de la semilla `bootstrap_dev_db` (BD desechable del e2e); el entorno puede sustituirlas. */
const CREDENTIALS: Record<SignedRole, { email: string; password: string }> = {
  estudiante: {
    email: process.env['E2E_STUDENT_EMAIL'] ?? 'estudiante@psychosim.edu.co',
    password: process.env['E2E_STUDENT_PASSWORD'] ?? 'Estudiante123!',
  },
  profesor: {
    email: process.env['E2E_PROFESOR_EMAIL'] ?? 'profesora@psychosim.edu.co',
    password: process.env['E2E_PROFESOR_PASSWORD'] ?? 'Profesor123!',
  },
  admin: {
    email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@psychosim.edu.co',
    password: process.env['E2E_ADMIN_PASSWORD'] ?? 'Admin123!',
  },
};

const HELP_MEMORY_KEY = 'siep.ayuda.v1';
const HELP_MEMORY_SEEN = JSON.stringify({ v: 1, vistas: ['primero'] });

async function waitForCanvas(page: Page): Promise<void> {
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function firstEditorPath(page: Page): Promise<string> {
  await page.goto('/portal/casos');
  const link = page.locator('a[href*="/portal/casos/"][href$="/editor"]').first();
  await link.waitFor({ state: 'visible', timeout: 30_000 });
  return (await link.getAttribute('href')) ?? '/portal/casos';
}

/** El botón «Entrar al caso» vive en la sala (lobby) y lleva a la ficha del caso (F10-1), igual que en `enterCaseAtContentWarning`. */
async function studentBriefPath(page: Page): Promise<string> {
  await page.goto('/portal/jugar');
  await waitForCanvas(page);
  // El consentimiento vive en el servidor (S3-2b) y la pantalla «caso-aviso» ES el aviso: se parte de «sin consentimiento».
  await resetStudentConsent(page);
  await page.getByRole('button', { name: /entrar al caso/i }).first().click({ timeout: 30_000 });
  await page.waitForURL(/\/portal\/simulador\/\d+\/ficha$/, { timeout: 30_000 });
  return new URL(page.url()).pathname;
}

/** El juego del caso: la ficha sin su cola. */
async function studentCasePath(page: Page): Promise<string> {
  return (await studentBriefPath(page)).replace(/\/ficha$/, '');
}

/**
 * El reporte del primer estudiante activo de un grupo de la docente (plan visual F10-7†): la ruta lleva el id del
 * estudiante, que se averigua por la API como lo haría el enlace de la tabla del reporte del grupo. Sin estudiantes en
 * sus grupos, el recorrido igual pasa por la pantalla (muestra su error de «no encontrado»).
 */
async function firstStudentReportPath(page: Page): Promise<string> {
  const login = await page.request.post('/api/auth/login', { data: CREDENTIALS.profesor });
  const token = (await login.json()).data?.token as string | undefined;
  const headers = { Authorization: `Bearer ${token}` };
  const groups = ((await (await page.request.get('/api/grupos', { headers })).json()).data ?? []) as Array<{ id: number }>;
  for (const group of groups) {
    const rows = ((await (await page.request.get(`/api/grupos/${group.id}/estudiantes`, { headers })).json()).data ?? []) as Array<{ id: number; membershipStatus?: string }>;
    const student = rows.find(row => row.membershipStatus === undefined || row.membershipStatus === 'ACTIVE');
    if (student) return `/portal/reportes/estudiante/${student.id}?grupo=${group.id}`;
  }
  return '/portal/reportes/estudiante/1';
}

export const TOUR_SCREENS: readonly TourScreen[] = [
  { id: 'portada', role: 'publico', routePattern: '', path: '/' },
  { id: 'acceso', role: 'publico', routePattern: 'login', path: '/login' },
  { id: 'no-encontrada', role: 'publico', routePattern: '**', path: '/no-existe' },
  { id: 'sin-conexion', role: 'publico', routePattern: 'sin-conexion', path: '/sin-conexion?desde=%2Fportal%2Fdashboard' },
  {
    id: 'acceso-solicitud', role: 'publico', routePattern: 'login', path: '/login',
    ready: async page => {
      // F4-2: el formulario de solicitud se abre desde «Solicitar acceso» (ya no hay panel deslizante).
      await page.getByRole('button', { name: 'Solicitar acceso' }).click({ timeout: 15_000 });
      await page.getByRole('heading', { name: /solicitar acceso/i }).waitFor({ state: 'visible', timeout: 15_000 });
    },
  },

  { id: 'panel', role: 'estudiante', routePattern: 'portal/dashboard', path: '/portal/dashboard' },
  { id: 'catalogo', role: 'estudiante', routePattern: 'portal/simulador', path: '/portal/simulador' },
  { id: 'sala', role: 'estudiante', routePattern: 'portal/jugar', path: '/portal/jugar', ready: waitForCanvas },
  { id: 'personaje', role: 'estudiante', routePattern: 'portal/personaje', path: '/portal/personaje' },
  // Plan visual F7b-5 (E2-10, C5): la bandeja de invitaciones a grupos.
  { id: 'invitaciones', role: 'estudiante', routePattern: 'portal/invitaciones', path: '/portal/invitaciones' },
  // Plan visual F7b-2 (E2-9): «Cambia tu contraseña», fuera del portal (con una sesión normal no es obligatoria).
  { id: 'cambiar-contrasena', role: 'estudiante', routePattern: 'cambiar-contrasena', path: '/cambiar-contrasena' },
  // Plan visual F3-6: una dirección desconocida muestra la 404 (dentro del portal, con su barra).
  { id: 'no-encontrada', role: 'estudiante', routePattern: 'portal/**', path: '/portal/no-existe' },
  // Plan visual F4-3: lo que ve el estudiante al pedir una sección de otro rol.
  { id: 'sin-permiso', role: 'estudiante', routePattern: 'portal/sin-permiso', path: '/portal/sin-permiso?desde=%2Fportal%2Frubricas' },
  // Plan visual F10-1† (C8, RF-16): la ficha del caso, a donde lleva la puerta de la sala y «Iniciar simulación».
  {
    id: 'caso-ficha', role: 'estudiante', routePattern: 'portal/simulador/:caseVersionId/ficha', resolvePath: studentBriefPath,
    ready: async page => {
      await page.getByRole('button', { name: 'Comenzar', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    },
  },
  {
    id: 'caso-aviso', role: 'estudiante', routePattern: 'portal/simulador/:caseVersionId', resolvePath: studentCasePath,
    ready: async page => {
      await page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 30_000 });
    },
  },

  { id: 'panel', role: 'profesor', routePattern: 'portal/dashboard', path: '/portal/dashboard' },
  { id: 'catalogo', role: 'profesor', routePattern: 'portal/simulador', path: '/portal/simulador' },
  { id: 'trazabilidad', role: 'profesor', routePattern: 'portal/docente/trazabilidad', path: '/portal/docente/trazabilidad' },
  { id: 'rubricas', role: 'profesor', routePattern: 'portal/rubricas', path: '/portal/rubricas' },
  { id: 'grupos', role: 'profesor', routePattern: 'portal/grupos', path: '/portal/grupos' },
  { id: 'reportes', role: 'profesor', routePattern: 'portal/reportes', path: '/portal/reportes' },
  // Plan visual F10-7† (C3): los intentos de un estudiante, a donde lleva el enlace de la tabla del reporte del grupo.
  {
    id: 'reporte-estudiante', role: 'profesor', routePattern: 'portal/reportes/estudiante/:estudianteId', resolvePath: firstStudentReportPath,
    ready: async page => { await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 15_000 }); },
  },

  // ED-5 (E2): el administrador no juega; la sala y «Mi personaje» ya no son suyos.
  { id: 'panel', role: 'admin', routePattern: 'portal/dashboard', path: '/portal/dashboard' },
  { id: 'catalogo', role: 'admin', routePattern: 'portal/simulador', path: '/portal/simulador' },
  { id: 'casos', role: 'admin', routePattern: 'portal/casos', path: '/portal/casos' },
  { id: 'editor-caso', role: 'admin', routePattern: 'portal/casos/:caseVersionId/editor', resolvePath: firstEditorPath },
  { id: 'casos-nuevo', role: 'admin', routePattern: 'portal/casos/nuevo', path: '/portal/casos/nuevo' },
  { id: 'trazabilidad', role: 'admin', routePattern: 'portal/docente/trazabilidad', path: '/portal/docente/trazabilidad' },
  { id: 'rubricas', role: 'admin', routePattern: 'portal/rubricas', path: '/portal/rubricas' },
  { id: 'usuarios', role: 'admin', routePattern: 'portal/admin/usuarios', path: '/portal/admin/usuarios' },
];

/** Rutas hijas de `portal` con componente (sin la vacía ni las redirecciones). */
export function portalRoutePatterns(routeList: Routes): string[] {
  const portal = routeList.find(route => route.path === 'portal');
  return (portal?.children ?? [])
    .filter(child => child.path && !child.redirectTo)
    .map(child => child.path as string);
}

export async function loginAs(page: Page, role: SignedRole): Promise<void> {
  const { email, password } = CREDENTIALS[role];
  await page.addInitScript(([key, value]) => {
    try { window.localStorage.setItem(key, value); } catch { /* almacenamiento bloqueado */ }
  }, [HELP_MEMORY_KEY, HELP_MEMORY_SEEN]);
  await page.goto('/login');
  await page.locator('input[type="email"]').last().fill(email);
  await page.locator('input[type="password"]').last().fill(password);
  await page.getByRole('button', { name: /^ingresar$/i }).click({ timeout: 15_000 });
  await page.waitForURL(/\/portal\//, { timeout: 30_000 });
}

/** Navega a la pantalla y espera a que esté quieta: red, fuentes, señal propia y animaciones finitas. */
export async function openScreen(page: Page, screen: TourScreen): Promise<string> {
  const path = screen.resolvePath ? await screen.resolvePath(page) : (screen.path ?? '/');
  await page.goto(path);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  if (screen.ready) await screen.ready(page);
  await page.waitForFunction(() => document.getAnimations().every(animation => {
    const timing = animation.effect?.getComputedTiming();
    return animation.playState !== 'running' || timing === undefined || timing.iterations === Infinity;
  }), undefined, { timeout: 10_000 }).catch(() => undefined);
  return path;
}
