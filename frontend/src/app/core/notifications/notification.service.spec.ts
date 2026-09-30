import { firstValueFrom } from 'rxjs';

import { MAX_NOTIFICATIONS, NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new NotificationService();
  });

  afterEach(() => jest.useRealTimers());

  async function texts(): Promise<string[]> {
    return (await firstValueFrom(service.messages$)).map(m => m.text);
  }

  it('los avisos de éxito se cierran a los 5 s', async () => {
    service.success('Guardado');
    jest.advanceTimersByTime(4999);
    expect(await texts()).toEqual(['Guardado']);
    jest.advanceTimersByTime(1);
    expect(await texts()).toEqual([]);
  });

  it('las advertencias duran 8 s', async () => {
    service.warning('Cuidado');
    jest.advanceTimersByTime(7999);
    expect(await texts()).toEqual(['Cuidado']);
    jest.advanceTimersByTime(1);
    expect(await texts()).toEqual([]);
  });

  it('los errores no se cierran solos', async () => {
    service.error('Falló');
    jest.advanceTimersByTime(60_000);
    expect(await texts()).toEqual(['Falló']);
  });

  it('pausar conserva el tiempo restante y reanudar lo retoma', async () => {
    service.success('Guardado');
    const [{ id }] = await firstValueFrom(service.messages$);
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(3000);
    service.pause(id);
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(10_000);
    expect(await texts()).toEqual(['Guardado']);
    service.resume(id);
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(1999);
    expect(await texts()).toEqual(['Guardado']);
    jest.advanceTimersByTime(1);
    expect(await texts()).toEqual([]);
  });

  it(`no mantiene más de ${MAX_NOTIFICATIONS} avisos: descarta el más antiguo`, async () => {
    for (let i = 1; i <= MAX_NOTIFICATIONS + 1; i++) service.error(`E${i}`);
    expect(await texts()).toEqual(['E2', 'E3', 'E4', 'E5']);
  });

  it('al superar el tope libera el temporizador del aviso descartado', async () => {
    for (let i = 1; i <= MAX_NOTIFICATIONS + 1; i++) service.success(`S${i}`);
    expect(await texts()).toEqual(['S2', 'S3', 'S4', 'S5']);
    expect(jest.getTimerCount()).toBe(MAX_NOTIFICATIONS);
  });

  describe('deduplicación', () => {
    it('dos errores iguales dejan un solo aviso', async () => {
      service.error('Sin conexión con el servidor.');
      service.error('Sin conexión con el servidor.');
      expect(await texts()).toEqual(['Sin conexión con el servidor.']);
    });

    it('cuatro peticiones paralelas con el mismo error dejan un solo aviso', async () => {
      for (let i = 0; i < 4; i++) service.error('Sin conexión con el servidor.');
      expect(await texts()).toEqual(['Sin conexión con el servidor.']);
    });

    it('un error y un éxito con el mismo texto dejan dos', async () => {
      service.error('Listo');
      service.success('Listo');
      const messages = await firstValueFrom(service.messages$);
      expect(messages.map(m => m.type)).toEqual(['error', 'success']);
    });

    it('el mismo tipo con otro texto no se descarta', async () => {
      service.error('Uno');
      service.error('Dos');
      expect(await texts()).toEqual(['Uno', 'Dos']);
    });

    it('aplica a todos los tipos y a show() directo', async () => {
      service.warning('W');
      service.warning('W');
      service.info('I');
      service.info('I');
      service.show('success', 'S');
      service.show('success', 'S');
      expect(await texts()).toEqual(['W', 'I', 'S']);
    });

    it('un aviso cerrado deja de contar para la deduplicación', async () => {
      service.error('Falló');
      const [{ id }] = await firstValueFrom(service.messages$);
      service.dismiss(id);
      service.error('Falló');
      expect(await texts()).toEqual(['Falló']);
    });

    it('un aviso que se cerró solo deja de contar', async () => {
      service.success('Guardado');
      jest.advanceTimersByTime(5000);
      service.success('Guardado');
      expect(await texts()).toEqual(['Guardado']);
    });

    it('el duplicado descartado no deja temporizadores', async () => {
      service.success('Guardado');
      service.success('Guardado');
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  it('dismiss cancela el temporizador pendiente', async () => {
    service.success('Guardado');
    const [{ id }] = await firstValueFrom(service.messages$);
    expect(jest.getTimerCount()).toBe(1);
    service.dismiss(id);
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(5000);
    expect(await texts()).toEqual([]);
  });

  it('clear vacía la lista y cancela todos los temporizadores', async () => {
    service.success('Uno');
    service.warning('Dos');
    service.info('Tres');
    expect(jest.getTimerCount()).toBe(3);
    service.clear();
    expect(await texts()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
