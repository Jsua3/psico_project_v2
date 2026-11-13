import { describe, expect, it } from 'vitest';

import { shortDate, summarize } from './case-review.util';

/**
 * Ayudas del panel «Revisión» (plan visual F10-6†): el titular de la validación y las fechas de la última revisión.
 * La fecha de la constancia llega como «AAAA-MM-DD» (un `date` del servidor, sin hora ni zona): se lee como el día
 * que es, nunca corrida por la zona horaria (`new Date('2026-10-10')` es medianoche UTC y en Bogotá cae el 9).
 * Las pruebas corren en la zona de Bogotá en cualquier equipo: la fija `vitest-base.config.mts` antes de crear los hilos
 * (dentro de la prueba, `process.env['TZ'] = …` no cambia la zona de un hilo de trabajo).
 */
// req: RF-12, RF-13, CU-05
describe('case-review.util', () => {
  describe('shortDate', () => {
    it('las pruebas corren en la zona de Bogotá (la fija vitest-base.config.mts)', () => {
      // Bogotá es UTC−5 todo el año (sin horario de verano). Si esto falla, las fechas de estas pruebas
      // dependen otra vez de la zona del equipo: en el CI (UTC) «9 de oct» saldría «10 de oct».
      expect(new Date('2026-10-10T02:00:00Z').getTimezoneOffset()).toBe(300);
      expect(new Date('2026-01-15T12:00:00Z').getTimezoneOffset()).toBe(300);
    });

    it('un día sin hora («2026-10-10») es ese día en Bogotá, no el anterior', () => {
      expect(shortDate('2026-10-10')).toMatch(/^10 de oct\.? de 2026$/);
      expect(shortDate('2026-01-01')).toMatch(/^1 de ene\.? de 2026$/);
    });

    it('una fecha con hora y zona se lleva a la hora local', () => {
      // 2026-10-10 02:00 UTC = 2026-10-09 21:00 en Bogotá.
      expect(shortDate('2026-10-10T02:00:00+00:00')).toMatch(/^9 de oct\.? de 2026$/);
      expect(shortDate('2026-10-10T15:30:00+00:00')).toMatch(/^10 de oct\.? de 2026$/);
    });

    it('sin fecha lo dice; un texto que no es fecha se muestra tal cual', () => {
      expect(shortDate(null)).toBe('una fecha sin registrar');
      expect(shortDate(undefined)).toBe('una fecha sin registrar');
      expect(shortDate('no es una fecha')).toBe('no es una fecha');
    });
  });

  describe('summarize (el titular de «Qué falta para publicar»)', () => {
    const issue = (severity: 'error' | 'warning') => ({ code: 'WORLD.X', severity, message: 'm' });

    it.each([
      [[], 'Sin errores de validación'],
      [[issue('error')], 'Falta 1 cosa por corregir'],
      [[issue('error'), issue('error')], 'Faltan 2 cosas por corregir'],
      [[issue('error'), issue('warning')], 'Falta 1 cosa por corregir · 1 aviso'],
      [[issue('warning'), issue('warning')], 'Sin errores de validación · 2 avisos'],
    ])('%j → «%s»', (issues, expected) => {
      expect(summarize({ canPublish: issues.every(item => item.severity !== 'error'), issues })).toBe(expected);
    });

    it('sin validación no dice nada', () => {
      expect(summarize(null)).toBe('');
    });
  });
});
