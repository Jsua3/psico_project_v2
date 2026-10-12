import { GLASS_BAR_GRACE_MS, GlassBarMachine, GlassBarSignals, GlassBarTimers } from './glass-bar-machine';

/**
 * Máquina de la barra de vidrio modular (plan visual F3; criterios S1–S11 de medicion.md de la skill). Se prueba
 * sin DOM: la máquina recibe posiciones de desplazamiento, tipos de puntero y teclas, y expone el estado derivado.
 */

/** Reloj manual: la gracia de 280 ms se avanza a mano, sin temporizadores reales. */
class ManualTimers implements GlassBarTimers {
  now = 0;
  private next = 1;
  private readonly pending = new Map<number, { at: number; fn: () => void }>();

  set(fn: () => void, ms: number): number {
    const id = this.next++;
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  }

  clear(id: unknown): void {
    this.pending.delete(id as number);
  }

  advance(ms: number): void {
    this.now += ms;
    for (const [id, entry] of [...this.pending]) {
      if (entry.at <= this.now) {
        this.pending.delete(id);
        entry.fn();
      }
    }
  }
}

function setup(opts: { fine?: boolean; desktop?: boolean } = {}) {
  const env = { fine: opts.fine ?? true, desktop: opts.desktop ?? true };
  const signals: GlassBarSignals = { isFinePointer: () => env.fine, isDesktop: () => env.desktop };
  const timers = new ManualTimers();
  const machine = new GlassBarMachine(signals, timers);
  return { machine, timers, env };
}

// req: BLOQUE-H (barra de navegación: estados, teclado y táctil del plan visual F3)
describe('GlassBarMachine: estados por desplazamiento (escritorio)', () => {
  it('nace en «inicial» y el umbral es de 8 px: 8 sigue en inicial, 9 pasa a «scroll» (S1)', () => {
    const { machine } = setup();
    expect(machine.state()).toBe('inicial');
    machine.sync(8);
    expect(machine.state()).toBe('inicial');
    machine.sync(9);
    expect(machine.state()).toBe('scroll');
  });

  it('el rebote elástico por encima del tope cuenta como 0 (scrollY negativo)', () => {
    const { machine } = setup();
    machine.sync(-40);
    expect(machine.state()).toBe('inicial');
  });

  it('en escritorio decide la posición, no la dirección: subir de 500 a 200 no reúne la barra (S2)', () => {
    const { machine } = setup();
    machine.sync(500);
    machine.sync(200);
    expect(machine.state()).toBe('scroll');
  });

  it('por debajo del escritorio la barra se queda en «inicial» aunque la página esté desplazada', () => {
    const { machine } = setup();
    machine.sync(500);
    machine.setDesktop(false);
    expect(machine.state()).toBe('inicial');
    machine.setDesktop(true);
    expect(machine.state()).toBe('scroll');
  });
});

describe('GlassBarMachine: atención con el ratón', () => {
  it('el ratón entra en la franja → «atencion» al instante (S3)', () => {
    const { machine } = setup();
    machine.sync(400);
    machine.pointerEnter('mouse');
    expect(machine.state()).toBe('atencion');
  });

  it('el ratón sale → vuelve a «scroll» a los 280 ms y no antes (S4)', () => {
    const { machine, timers } = setup();
    machine.sync(400);
    machine.pointerEnter('mouse');
    machine.pointerLeave('mouse');
    timers.advance(GLASS_BAR_GRACE_MS - 1);
    expect(machine.state()).toBe('atencion');
    timers.advance(1);
    expect(machine.state()).toBe('scroll');
  });

  it('volver antes de la gracia cancela la salida (S5)', () => {
    const { machine, timers } = setup();
    machine.sync(400);
    machine.pointerEnter('mouse');
    machine.pointerLeave('mouse');
    timers.advance(150);
    machine.pointerEnter('mouse');
    timers.advance(400);
    expect(machine.state()).toBe('atencion');
  });

  it('en el tope el cursor no cambia nada (S6)', () => {
    const { machine } = setup();
    machine.sync(0);
    machine.pointerEnter('mouse');
    expect(machine.state()).toBe('inicial');
  });

  it('un pointerenter de dedo o lápiz no abre la atención (S11, híbridos)', () => {
    const { machine } = setup();
    machine.sync(400);
    machine.pointerEnter('touch');
    machine.pointerEnter('pen');
    expect(machine.state()).toBe('scroll');
  });

  it('sin puntero fino (pantalla táctil) el ratón sintetizado tampoco abre', () => {
    const { machine } = setup({ fine: false });
    machine.sync(400);
    machine.pointerEnter('mouse');
    expect(machine.state()).toBe('scroll');
  });

  it('Escape suelta la atención (S9), salvo con el foco en un campo de texto', () => {
    const { machine } = setup();
    machine.sync(400);
    machine.pointerEnter('mouse');
    machine.keyDown('Escape', true);
    expect(machine.state()).toBe('atencion');
    machine.keyDown('Escape', false);
    expect(machine.state()).toBe('scroll');
  });
});

describe('GlassBarMachine: dedo', () => {
  it('con dedo, un toque en un hueco del módulo central alterna la atención; en un control, no', () => {
    const { machine } = setup();
    machine.sync(400);
    machine.pointerDown('touch');
    machine.tapStrip(true);
    expect(machine.state()).toBe('scroll');
    machine.tapStrip(false);
    expect(machine.state()).toBe('atencion');
    machine.tapStrip(false);
    expect(machine.state()).toBe('scroll');
  });

  it('con ratón, tocar el hueco no alterna (la atención es del cursor)', () => {
    const { machine } = setup();
    machine.sync(400);
    machine.pointerDown('mouse');
    machine.tapStrip(false);
    expect(machine.state()).toBe('scroll');
  });

  it('con dedo, desplazarse más de 24 px desde que se abrió suelta la atención', () => {
    const { machine } = setup();
    machine.sync(400);
    machine.pointerDown('touch');
    machine.tapStrip(false);
    machine.sync(424);
    expect(machine.state()).toBe('atencion');
    machine.sync(425);
    expect(machine.state()).toBe('scroll');
  });

  it('con dedo, pulsar fuera del módulo central suelta la atención', () => {
    const { machine } = setup();
    machine.sync(400);
    machine.pointerDown('touch');
    machine.tapStrip(false);
    machine.outsideClick(true);
    expect(machine.state()).toBe('atencion');
    machine.outsideClick(false);
    expect(machine.state()).toBe('scroll');
  });
});

describe('GlassBarMachine: modalidad de la última entrada', () => {
  it('nace sin modalidad (manda :focus-within); Tab marca «teclado» y un pointerdown marca «puntero»', () => {
    const { machine } = setup();
    expect(machine.modality()).toBeNull();
    machine.keyDown('Tab', false);
    expect(machine.modality()).toBe('teclado');
    machine.pointerDown('mouse');
    expect(machine.modality()).toBe('puntero');
  });

  it('otras teclas no cambian la modalidad', () => {
    const { machine } = setup();
    machine.pointerDown('mouse');
    machine.keyDown('a', false);
    machine.keyDown('ArrowDown', false);
    expect(machine.modality()).toBe('puntero');
  });
});

describe('GlassBarMachine: limpieza', () => {
  it('destroy() cancela la gracia pendiente', () => {
    const { machine, timers } = setup();
    machine.sync(400);
    machine.pointerEnter('mouse');
    machine.pointerLeave('mouse');
    machine.destroy();
    timers.advance(GLASS_BAR_GRACE_MS + 10);
    expect(machine.state()).toBe('atencion');
  });
});
