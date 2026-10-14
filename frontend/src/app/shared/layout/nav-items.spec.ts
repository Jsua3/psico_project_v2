import { NAV_ITEMS, navItemsFor, rolesFor } from './nav-items';

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

  it('el estudiante ve Panel, Simulador y Mi personaje, y no pliega nada', () => {
    expect(visible('ESTUDIANTE')).toEqual(['Panel', 'Simulador', 'Mi personaje']);
    expect(folded('ESTUDIANTE')).toEqual([]);
  });

  it('el docente ve 6 destinos y pliega Rúbricas, Grupos y Reportes', () => {
    expect(visible('PROFESOR')).toEqual(['Panel', 'Simulador', 'Trazabilidad', 'Rúbricas', 'Grupos', 'Reportes']);
    expect(folded('PROFESOR')).toEqual(['Rúbricas', 'Grupos', 'Reportes']);
  });

  it('el administrador ve 7 destinos y pliega Mi personaje, Rúbricas y Usuarios', () => {
    expect(visible('ADMIN')).toEqual(['Panel', 'Simulador', 'Mi personaje', 'Trazabilidad', 'Rúbricas', 'Editar casos', 'Usuarios']);
    expect(folded('ADMIN')).toEqual(['Mi personaje', 'Rúbricas', 'Usuarios']);
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

  it('rolesFor devuelve EXACTAMENTE los roles que tenía cada guard de app.routes.ts antes de F3', () => {
    const before: Record<string, string[]> = {
      personaje: ['ESTUDIANTE', 'ADMIN'],
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
