import { SessionConsentRecorder } from './consent-recorder';

/**
 * Registro local del consentimiento (plan visual F6-2; ETH-01): detrás de una interfaz (`ConsentRecorder`) para que el
 * registro en servidor (F10-8†) solo cambie la implementación. Lo esencial: un almacenamiento que falla NUNCA da el
 * consentimiento por registrado, y una lectura que falla es «sin consentimiento» (se vuelve a pedir).
 */
// req: ETH-01, SIEP-RF-05 (parte de interfaz)
describe('SessionConsentRecorder', () => {
  const KEY = 'siep_case_consent_7_attempt-1';

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('registra y lo lee de vuelta', async () => {
    const recorder = new SessionConsentRecorder();
    expect(recorder.isGiven(KEY)).toBe(false);
    await recorder.record(KEY);
    expect(recorder.isGiven(KEY)).toBe(true);
  });

  it('una lectura que lanza se trata como «sin consentimiento»', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('almacenamiento bloqueado'); });
    expect(new SessionConsentRecorder().isGiven(KEY)).toBe(false);
  });

  it('una escritura que lanza rechaza y no deja nada registrado', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cuota agotada'); });
    const recorder = new SessionConsentRecorder();
    await expect(recorder.record(KEY)).rejects.toThrow();
    expect(recorder.isGiven(KEY)).toBe(false);
  });

  it('una escritura que se pierde en silencio (no queda al leerla) también rechaza', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
    await expect(new SessionConsentRecorder().record(KEY)).rejects.toThrow();
  });

  it('un almacenamiento al que ni se puede acceder rechaza sin lanzar fuera de la promesa', async () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('SecurityError'); });
    const recorder = new SessionConsentRecorder();
    expect(recorder.isGiven(KEY)).toBe(false);
    await expect(recorder.record(KEY)).rejects.toThrow();
  });
});
