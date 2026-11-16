import { RUTA_ENSAYO, abrirEnsayo, alPulsarProbar } from './ensayo';

function diferido() {
  let resolver!: () => void;
  const promise = new Promise<void>((r) => { resolver = r; });
  return { promise, resolver };
}

function tienda(guardado: Promise<void>) {
  return { caso: () => ({ id: '41' }), sincronizado: () => guardado } as unknown as Parameters<typeof abrirEnsayo>[0];
}

describe('ensayo · abrir el juego real en otra pestaña', () => {
  it('RUTA_ENSAYO arma la ruta del ensayo, con «desde» solo si se pide', () => {
    expect(RUTA_ENSAYO('41')).toBe('/portal/casos/41/ensayo');
    expect(RUTA_ENSAYO('41', 12)).toBe('/portal/casos/41/ensayo?desde=12');
  });

  it('abre la pestaña en el mismo clic y le pone la dirección después de guardar lo pendiente', async () => { // Foco 1
    const pestana = { opener: {}, location: { href: '' }, closed: false };
    const abrir = vi.fn(() => pestana as unknown as Window);
    const guardado = diferido();
    const p = abrirEnsayo(tienda(guardado.promise), 12, abrir);
    expect(abrir).toHaveBeenCalledWith('about:blank', '_blank');
    expect(pestana.location.href).toBe('');
    guardado.resolver();
    await p;
    expect(pestana.location.href).toBe('/portal/casos/41/ensayo?desde=12');
    expect(pestana.opener).toBeNull();
  });

  it('si el navegador bloquea la pestaña, navega en la misma tras guardar', async () => {
    const abrir = vi.fn(() => null);
    const navegar = vi.fn();
    const guardado = diferido();
    const p = abrirEnsayo(tienda(guardado.promise), undefined, abrir, navegar);
    expect(navegar).not.toHaveBeenCalled();
    guardado.resolver();
    await p;
    expect(navegar).toHaveBeenCalledWith('/portal/casos/41/ensayo');
  });

  it('si la docente cerró la pestaña vacía mientras se guardaba, no hace nada más', async () => {
    const pestana = { opener: {}, location: { href: '' }, closed: false };
    const guardado = diferido();
    const p = abrirEnsayo(tienda(guardado.promise), 3, () => pestana as unknown as Window);
    pestana.closed = true;
    guardado.resolver();
    await p;
    expect(pestana.location.href).toBe('');
  });

  describe('alPulsarProbar · solo el clic primario sin modificadores se intercepta', () => {
    const clic = (init: Partial<MouseEvent> = {}) => {
      const evento = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), ...init };
      return evento as unknown as MouseEvent & { preventDefault: ReturnType<typeof vi.fn> };
    };
    const guardado = () => Promise.resolve();

    it('el clic primario (y Enter, que llega como ese mismo clic) abre una sola pestaña', async () => {
      const abrir = vi.fn(() => ({ opener: {}, location: { href: '' }, closed: false }) as unknown as Window);
      const evento = clic();
      await alPulsarProbar(evento, tienda(guardado()), 5, abrir);
      expect(evento.preventDefault).toHaveBeenCalledOnce();
      expect(abrir).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['Ctrl', { ctrlKey: true }], ['Meta', { metaKey: true }], ['Mayús', { shiftKey: true }], ['Alt', { altKey: true }],
      ['el botón del medio', { button: 1 }], ['el botón derecho', { button: 2 }],
    ])('con %s sigue el enlace normal del navegador', async (_nombre, init) => {
      const abrir = vi.fn();
      const evento = clic(init as Partial<MouseEvent>);
      await alPulsarProbar(evento, tienda(guardado()), 5, abrir);
      expect(evento.preventDefault).not.toHaveBeenCalled();
      expect(abrir).not.toHaveBeenCalled();
    });
  });
});
