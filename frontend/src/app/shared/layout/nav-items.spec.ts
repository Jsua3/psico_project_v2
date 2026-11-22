import { readFileSync } from 'fs';
import { join } from 'path';

import { NAV_ITEMS, navItemsFor, ordenPara, rolesFor } from './nav-items';

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

  // req: SIEP-RF-04 (E2-10: la bandeja del estudiante; rediseño 2026-11-21, DISENO §3.2: se llama «Grupos»)
  it('el estudiante ve Inicio, Casos, Mi personaje y Grupos, y no pliega nada', () => {
    expect(visible('ESTUDIANTE')).toEqual(['Inicio', 'Casos', 'Mi personaje', 'Grupos']);
    expect(folded('ESTUDIANTE')).toEqual([]);
  });

  // req: RF-05, CU-01 (E2-4: el profesor autora con propiedad). ED-5: el docente no juega, «Simulador» sale de su menú.
  it('el docente ve Inicio, Revisión, Casos, Grupos, Reportes y Rúbricas, y pliega Reportes y Rúbricas', () => {
    expect(visible('PROFESOR')).toEqual(['Inicio', 'Revisión', 'Casos', 'Grupos', 'Reportes', 'Rúbricas']);
    expect(folded('PROFESOR')).toEqual(['Reportes', 'Rúbricas']);
  });

  // req: ED-5 (E2: el ADMIN no juega). DISENO §3.2: «Usuarios» es su tarea principal y deja de plegarse.
  it('el administrador ve Inicio, Usuarios, Casos, Revisión y Rúbricas; pliega Revisión y Rúbricas, nunca Usuarios', () => {
    expect(visible('ADMIN')).toEqual(['Inicio', 'Usuarios', 'Casos', 'Revisión', 'Rúbricas']);
    expect(folded('ADMIN')).toEqual(['Revisión', 'Rúbricas']);
    expect(navItemsFor('ADMIN').find(item => item.id === 'usuarios')!.fold).toEqual([]);
  });

  it('las etiquetas no usan la jerga de antes (Panel, Simulador, Trazabilidad, Invitaciones, Editar casos)', () => {
    for (const viejo of ['Panel', 'Simulador', 'Trazabilidad', 'Invitaciones', 'Editar casos']) {
      expect(NAV_ITEMS.some(item => item.label === viejo), viejo).toBe(false);
    }
  });

  it('«Mi personaje» trae una etiqueta corta para la pestaña del teléfono; ninguna etiqueta corta es más larga que la suya', () => {
    expect(NAV_ITEMS.find(item => item.id === 'personaje')!.etiquetaCorta).toBe('Personaje');
    for (const item of NAV_ITEMS.filter(entry => entry.etiquetaCorta)) {
      expect(item.etiquetaCorta!.length, item.id).toBeLessThan(item.label.length);
    }
  });

  it('sin rol no hay destinos', () => {
    expect(navItemsFor(null)).toEqual([]);
    expect(navItemsFor(undefined)).toEqual([]);
  });

  it('el destino principal de cada rol nunca se pliega (antes era la «acción principal» del menú lateral, T15.4)', () => {
    const principal = { ESTUDIANTE: '/portal/simulador', PROFESOR: '/portal/docente/trazabilidad', ADMIN: '/portal/admin/usuarios' } as const;
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
    // Qué fila de `shared/policy-matrix.json` gobierna cada destino. «casos» es del PROFESOR (autoría con propiedad,
    // E2-4) y del ADMIN: un subconjunto de la matriz, nunca de más.
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

  it('rolesFor devuelve los roles de cada guard de app.routes.ts (los de F3, salvo «personaje» —ED-5: solo del estudiante— y «casos» —E2-4: también del docente—)', () => {
    const before: Record<string, string[]> = {
      personaje: ['ESTUDIANTE'],
      invitaciones: ['ESTUDIANTE'],
      trazabilidad: ['PROFESOR', 'ADMIN'],
      rubricas: ['PROFESOR', 'ADMIN'],
      grupos: ['PROFESOR'],
      reportes: ['PROFESOR'],
      casos: ['PROFESOR', 'ADMIN'],
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

  it('dentro de cada rol no hay dos destinos en la misma posición (el orden nunca depende del azar del sort)', () => {
    for (const role of ['ESTUDIANTE', 'PROFESOR', 'ADMIN'] as const) {
      const posiciones = navItemsFor(role).map(item => ordenPara(item, role));
      expect(new Set(posiciones).size, role).toBe(posiciones.length);
    }
  });
});
