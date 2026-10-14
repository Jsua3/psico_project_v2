import { readFileSync } from 'fs';
import { join } from 'path';

import { NAV_ITEMS, navItemsFor, rolesFor } from './nav-items';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

/**
 * NAV_ITEMS es la ÚNICA fuente del menú y de los roles de los guards (plan visual F3-3, contrato F3 → F4…F8; gancho
 * de RF-02 y RNF-002). Estas pruebas fijan destinos, plegado (D3) y permisos: un cambio de permisos tiene que verse
 * aquí, no pasar desapercibido en una tabla de menú.
 */
// req: BLOQUE-H (navegación por rol del plan visual F3)
describe('NAV_ITEMS', () => {
  const visible = (role: 'ESTUDIANTE' | 'PROFESOR' | 'ADMIN') => navItemsFor(role).map(item => item.label);
  const folded = (role: 'ESTUDIANTE' | 'PROFESOR' | 'ADMIN') =>
    navItemsFor(role).filter(item => item.fold.includes(role)).map(item => item.label);

  // req: SIEP-RF-04 (E2-10: la bandeja de invitaciones del estudiante, decisión del usuario 2026-10-14)
  it('el estudiante ve Panel, Simulador, Invitaciones y Mi personaje, y no pliega nada', () => {
    expect(visible('ESTUDIANTE')).toEqual(['Panel', 'Simulador', 'Invitaciones', 'Mi personaje']);
    expect(folded('ESTUDIANTE')).toEqual([]);
  });

  it('el docente ve 6 destinos y pliega Rúbricas, Grupos y Reportes', () => {
    expect(visible('PROFESOR')).toEqual(['Panel', 'Simulador', 'Trazabilidad', 'Rúbricas', 'Grupos', 'Reportes']);
    expect(folded('PROFESOR')).toEqual(['Rúbricas', 'Grupos', 'Reportes']);
  });

  // req: ED-5 (E2: el ADMIN no juega; su avatar solo existía para jugar)
  it('el administrador ve 6 destinos, sin «Mi personaje», y pliega Rúbricas y Usuarios', () => {
    expect(visible('ADMIN')).toEqual(['Panel', 'Simulador', 'Trazabilidad', 'Rúbricas', 'Editar casos', 'Usuarios']);
    expect(folded('ADMIN')).toEqual(['Rúbricas', 'Usuarios']);
  });

  it('sin rol no hay destinos', () => {
    expect(navItemsFor(null)).toEqual([]);
    expect(navItemsFor(undefined)).toEqual([]);
  });

  it('el destino principal de cada rol nunca se pliega (antes era la «acción principal» del menú lateral, T15.4)', () => {
    const principal = { ESTUDIANTE: '/portal/simulador', PROFESOR: '/portal/docente/trazabilidad', ADMIN: '/portal/casos' } as const;
    for (const [role, route] of Object.entries(principal) as Array<[keyof typeof principal, string]>) {
      const item = navItemsFor(role).find(entry => entry.route === route);
      expect(item, `${role} → ${route}`).toBeDefined();
      expect(item!.fold).not.toContain(role);
    }
  });

  it('ningún destino promete «Continuar»: el menú no sabe si hay un intento activo (T15.4)', () => {
    expect(NAV_ITEMS.some(item => /continuar/i.test(item.label))).toBe(false);
  });

  it('rolesFor coincide con la matriz de políticas del servidor (E2-1): ningún destino se ofrece a un rol que el servidor niega', () => {
    // Qué fila de `shared/policy-matrix.json` gobierna cada destino. «casos» queda en ADMIN hasta F8 (el editor se
    // rehace contra /api/authoring), aunque el servidor ya deja autorar al PROFESOR: un subconjunto, nunca de más.
    const matrix = JSON.parse(readFileSync(join(REPO_ROOT, 'backend_django', 'shared', 'policy-matrix.json'), 'utf-8')) as {
      rows: Array<{ resource: string; action: string } & Record<string, string | null>>;
    };
    const policyOf: Record<string, [string, string]> = {
      panel: ['account', 'self'],
      simulador: ['catalog', 'read'],
      invitaciones: ['membership', 'respond'],
      personaje: ['attempt', 'play'],
      trazabilidad: ['attempt', 'review'],
      rubricas: ['rubric', 'read'],
      grupos: ['group', 'manage'],
      reportes: ['analytics', 'read'],
      casos: ['case', 'author'],
      usuarios: ['user', 'manage'],
    };
    for (const item of NAV_ITEMS) {
      const policy = policyOf[item.id];
      expect(policy, `${item.id} sin fila de política`).toBeDefined();
      const row = matrix.rows.find(entry => entry.resource === policy[0] && entry.action === policy[1])!;
      for (const role of item.roles) expect(row[role], `${item.id} para ${role}`).not.toBeNull();
    }
  });

  it('rolesFor devuelve los roles de cada guard de app.routes.ts (los de F3, salvo «personaje», que desde ED-5 es solo del estudiante)', () => {
    const before: Record<string, string[]> = {
      personaje: ['ESTUDIANTE'],
      invitaciones: ['ESTUDIANTE'],
      trazabilidad: ['PROFESOR', 'ADMIN'],
      rubricas: ['PROFESOR', 'ADMIN'],
      grupos: ['PROFESOR'],
      reportes: ['PROFESOR'],
      casos: ['ADMIN'],
      usuarios: ['ADMIN'],
    };
    for (const [id, roles] of Object.entries(before)) expect([...rolesFor(id)].sort(), id).toEqual([...roles].sort());
  });

  it('rolesFor de un destino desconocido es un error, no un permiso vacío que deje entrar a nadie por despiste', () => {
    expect(() => rolesFor('no-existe')).toThrowError(/no-existe/);
  });

  it('ids y rutas únicos; orden explícito', () => {
    expect(new Set(NAV_ITEMS.map(item => item.id)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map(item => item.route)).size).toBe(NAV_ITEMS.length);
    const orders = NAV_ITEMS.map(item => item.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
