import { CaseAccess } from '../../core/models/simulation.model';
import { accessNotice } from './case-access.util';

// req: RN-04, RF-15, RF-16
describe('accessNotice (por qué un caso asignado todavía no se puede iniciar)', () => {
  it('un acceso permitido no lleva aviso', () => {
    expect(accessNotice({ allowed: true })).toBeNull();
    expect(accessNotice({ allowed: true, closesAt: '2026-11-01T23:59:00' })).toBeNull();
  });

  it('«aún no abre» dice cuándo abre, con la fecha y la hora en español', () => {
    const notice = accessNotice({ allowed: false, reason: 'NOT_YET_OPEN', opensAt: '2026-10-20T08:00:00' })!;
    expect(notice.title).toBe('Aún no abre');
    expect(notice.detail).toMatch(/20 de oct/);
    expect(notice.detail).toMatch(/8:00/);
    expect(notice.tone).toBe('info');
    expect(notice.icon).toBe('schedule');
  });

  it('«aún no abre» sin fecha no inventa una', () => {
    const notice = accessNotice({ allowed: false, reason: 'NOT_YET_OPEN' })!;
    expect(notice.detail).not.toMatch(/\d/);
    expect(notice.detail).toContain('docente');
  });

  it('«ya cerró» dice cuándo cerró y que un intento en curso se puede terminar (decisión 12)', () => {
    const notice = accessNotice({ allowed: false, reason: 'CLOSED', closesAt: '2026-10-05T23:59:00' })!;
    expect(notice.title).toBe('Ya cerró');
    expect(notice.detail).toMatch(/5 de oct/);
    expect(notice.detail).toContain('uno en curso se puede terminar');
    expect(notice.tone).toBe('warning');
    expect(notice.icon).toBe('block');
  });

  it('un caso que va después de otro dice que hay que completar el anterior', () => {
    const notice = accessNotice({ allowed: false, reason: 'LOCKED_BY_SEQUENCE' })!;
    expect(notice.title).toBe('Bloqueado por la secuencia');
    expect(notice.detail).toContain('caso anterior');
    expect(notice.icon).toBe('lock');
  });

  it('un caso no asignado lo dice y manda a esperar a la asignación del docente', () => {
    const notice = accessNotice({ allowed: false, reason: 'NOT_ASSIGNED' })!;
    expect(notice.title).toBe('Este caso no está asignado a tu cuenta');
    expect(notice.detail).toContain('docente');
    expect(notice.icon).toBe('lock');
  });

  it('un motivo que el cliente no conoce se dice con palabras neutras, sin mostrar el código', () => {
    const notice = accessNotice({ allowed: false, reason: 'OTRO_MOTIVO' } as unknown as CaseAccess)!;
    expect(notice.title).toBe('Este caso no está disponible ahora');
    expect(`${notice.title} ${notice.detail}`).not.toContain('OTRO_MOTIVO');
  });

  it('negado sin motivo también es «no disponible» (el servidor es quien decide)', () => {
    expect(accessNotice({ allowed: false })!.title).toBe('Este caso no está disponible ahora');
  });
});
