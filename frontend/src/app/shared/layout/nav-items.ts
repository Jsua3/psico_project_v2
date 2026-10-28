/**
 * Navegación del portal (plan visual F3-3; contrato F3 → F4…F8 de §3.3). ÚNICA fuente del menú y de los roles de
 * los guards de `app.routes.ts` (gancho de RF-02 y RNF-002: hoy el menú y los permisos se calculaban por separado).
 *
 * `fold` dice para qué roles el destino es secundario: en la barra de vidrio se pliega al desplazarse y vuelve con
 * el cursor o con Tab (decisión D3 del plan: el docente pliega Rúbricas, Grupos y Reportes; el administrador,
 * Rúbricas y Usuarios; el estudiante, nada). El destino principal de cada rol nunca se pliega. Desde E2 (ED-5) el
 * administrador no juega: «Mi personaje» es solo del estudiante. Los roles de cada destino son un subconjunto de la
 * matriz de políticas del servidor (`backend_django/shared/policy-matrix.json`; nav-items.spec lo comprueba).
 */
export type UserRole = 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE';

export interface NavItem {
  id: string;
  label: string;
  route: string;
  icon: string;
  roles: readonly UserRole[];
  fold: readonly UserRole[];
  order: number;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'panel', label: 'Panel', route: '/portal/dashboard', icon: 'dashboard', roles: ['ESTUDIANTE', 'PROFESOR', 'ADMIN'], fold: [], order: 10 },
  { id: 'simulador', label: 'Simulador', route: '/portal/simulador', icon: 'play_circle', roles: ['ESTUDIANTE', 'PROFESOR', 'ADMIN'], fold: [], order: 20 },
  // E2-10 (C5): la bandeja de invitaciones a grupos del estudiante (decisión del usuario, 2026-10-14).
  { id: 'invitaciones', label: 'Invitaciones', route: '/portal/invitaciones', icon: 'group_add', roles: ['ESTUDIANTE'], fold: [], order: 25 },
  { id: 'personaje', label: 'Mi personaje', route: '/portal/personaje', icon: 'face', roles: ['ESTUDIANTE'], fold: [], order: 30 },
  { id: 'trazabilidad', label: 'Trazabilidad', route: '/portal/docente/trazabilidad', icon: 'timeline', roles: ['PROFESOR', 'ADMIN'], fold: [], order: 40 },
  { id: 'rubricas', label: 'Rúbricas', route: '/portal/rubricas', icon: 'grading', roles: ['PROFESOR', 'ADMIN'], fold: ['PROFESOR', 'ADMIN'], order: 50 },
  { id: 'grupos', label: 'Grupos', route: '/portal/grupos', icon: 'groups', roles: ['PROFESOR'], fold: ['PROFESOR'], order: 60 },
  { id: 'reportes', label: 'Reportes', route: '/portal/reportes', icon: 'analytics', roles: ['PROFESOR'], fold: ['PROFESOR'], order: 70 },
  // E2-4 y P6: el profesor y el administrador entran a «Mis casos» (lista, crear desde un lugar y el editor nuevo); el profesor solo
  // ve y edita lo suyo (lo hace cumplir el servidor); aprobar y publicar siguen siendo del ADMIN.
  { id: 'casos', label: 'Editar casos', route: '/portal/casos', icon: 'edit_square', roles: ['PROFESOR', 'ADMIN'], fold: ['PROFESOR'], order: 80 },
  { id: 'usuarios', label: 'Usuarios', route: '/portal/admin/usuarios', icon: 'manage_accounts', roles: ['ADMIN'], fold: ['ADMIN'], order: 90 },
];

/** Destinos del rol, en orden. Sin rol (sesión aún sin usuario): ninguno. */
export function navItemsFor(role: UserRole | string | null | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter(item => item.roles.includes(role as UserRole)).sort((a, b) => a.order - b.order);
}

/** Roles con acceso a un destino, para `roleGuard(...rolesFor(id))`. Un id desconocido es un error de programación. */
export function rolesFor(id: string): UserRole[] {
  const item = NAV_ITEMS.find(entry => entry.id === id);
  if (!item) throw new Error(`Destino de navegación desconocido: «${id}»`);
  return [...item.roles];
}
