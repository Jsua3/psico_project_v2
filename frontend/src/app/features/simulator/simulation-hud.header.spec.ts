import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SimulationAttemptState } from '../../core/models/simulation.model';
import { SimulationHudComponent } from './simulation-hud.component';

const hudSource = readFileSync(join(__dirname, 'simulation-hud.component.ts'), 'utf-8');

const ATTEMPT = {
  attemptId: 'a-1',
  caseTitle: 'Violencia familiar',
  stressIndex: 40,
  accumulatedScore: 12,
  currentNode: { key: 'hospital-urgencias', title: 'Urgencia vital y crisis' },
} as unknown as SimulationAttemptState;

type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

/** ts-jest no compila las entradas con `input()`: se escribe el valor en el nodo interno, como en el panel de diálogo. */
function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

function installMatchMedia(coarse: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

describe('HUD: cabecera (T7.1) y Ajustes (T7.2)', () => {
  let fixture: ComponentFixture<SimulationHudComponent>;
  let hud: SimulationHudComponent;
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');

  function mount(coarse = false, inputs: Record<string, unknown> = {}): HTMLElement {
    installMatchMedia(coarse);
    TestBed.configureTestingModule({ imports: [SimulationHudComponent], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(SimulationHudComponent);
    hud = fixture.componentInstance;
    const signals = hud as unknown as Record<string, () => unknown>;
    writeInputSignal(signals['attempt'], ATTEMPT);
    for (const [name, value] of Object.entries(inputs)) writeInputSignal(signals[name], value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const button = (root: HTMLElement, name: string): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

  function openSettings(root: HTMLElement): void {
    hud.settingsOpen.set(true);
    fixture.detectChanges();
    expect(root.querySelector('#game-settings-menu')).not.toBeNull();
  }

  const settingsRow = (root: HTMLElement, text: string): HTMLButtonElement | undefined =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('#game-settings-menu > button'))
      .find(b => (b.textContent ?? '').includes(text));

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    if (original) Object.defineProperty(window, 'matchMedia', original);
    else delete (window as { matchMedia?: unknown }).matchMedia;
  });

  describe('chip de etapa', () => {
    it('muestra la entrada stageLabel («Decisión k de 6») en el chip central', () => {
      const root = mount(false, { stageLabel: 'Decisión 2 de 6' });
      const chip = root.querySelector('.hud-zone--center .hud-stage-chip');
      expect(chip?.textContent?.trim()).toBe('Decisión 2 de 6');
    });

    it('sin stageLabel (null) no pinta ningún chip', () => {
      const root = mount(false, { stageLabel: null });
      expect(root.querySelector('.hud-stage-chip')).toBeNull();
    });

    it('el contador antiguo «Paso k (k/6)» ya no existe: ni bloque ni cálculo', () => {
      const root = mount(false, { stageLabel: 'Decisión 1 de 6', nearbyInteractionKey: 'puerta-sala-escucha' });
      expect(root.querySelector('.hud-step')).toBeNull();
      expect(root.textContent).not.toMatch(/Paso\s+\d/);
      expect(hudSource).not.toContain('sceneProgress');
      expect(hudSource).not.toContain('getSceneProgress');
      expect(hudSource).not.toContain('hud-step');
    });

    it('el nombre de la sala sigue visible junto al chip', () => {
      const root = mount(false, { stageLabel: 'Decisión 1 de 6', locationLabel: 'Urgencias' });
      expect(root.querySelector('.hud-scene')?.textContent).toContain('Urgencias');
    });
  });

  describe('botón de ayuda', () => {
    it('existe con el nombre accesible «Abrir cómo se juega» y emite openHelp', () => {
      const root = mount();
      const help = button(root, 'Abrir cómo se juega');
      expect(help).not.toBeNull();
      expect(help?.getAttribute('title')).toBe('Cómo se juega');
      expect(help?.querySelector('mat-icon')?.textContent?.trim()).toBe('help');
      const emitted = jest.fn();
      hud.openHelp.subscribe(emitted);
      help!.click();
      expect(emitted).toHaveBeenCalledTimes(1);
    });
  });

  describe('atajos de teclado en el nombre accesible', () => {
    it('con puntero fino la bitácora anuncia (J)', () => {
      const root = mount(false);
      expect(button(root, 'Abrir bitácora reflexiva (J)')).not.toBeNull();
      expect(button(root, 'Abrir bitácora reflexiva (J)')?.getAttribute('title')).toBe('Bitácora (J)');
    });

    it('con puntero grueso (táctil) no hay (J) en el nombre ni en el título', () => {
      const root = mount(true);
      const journal = button(root, 'Abrir bitácora reflexiva');
      expect(journal).not.toBeNull();
      expect(journal?.getAttribute('title')).toBe('Bitácora');
      expect(root.innerHTML).not.toContain('(J)');
    });

    it('en Ajustes la fila «Bitácora» solo muestra la tecla J con puntero fino', () => {
      const fine = mount(false);
      openSettings(fine);
      expect(settingsRow(fine, 'Bitácora')?.querySelector('strong')?.textContent?.trim()).toBe('J');
      TestBed.resetTestingModule();

      const coarse = mount(true);
      openSettings(coarse);
      expect(settingsRow(coarse, 'Bitácora')?.querySelector('strong')?.textContent?.trim()).toBe('');
    });
  });

  describe('«Volver al catálogo» frente a la salida segura', () => {
    it('usa el icono de casa, no el de salida', () => {
      const root = mount();
      const home = root.querySelector('a[aria-label="Volver al catálogo de simulaciones"]');
      expect(home).not.toBeNull();
      expect(home?.querySelector('mat-icon')?.textContent?.trim()).toBe('home');
      expect(root.textContent).not.toContain('logout');
      expect(root.textContent).not.toContain('exit_to_app');
    });
  });

  describe('filas nuevas de Ajustes', () => {
    it('«Cómo se juega» emite openHelp y cierra Ajustes', () => {
      const root = mount();
      openSettings(root);
      const emitted = jest.fn();
      hud.openHelp.subscribe(emitted);
      settingsRow(root, 'Cómo se juega')!.click();
      fixture.detectChanges();
      expect(emitted).toHaveBeenCalledTimes(1);
      expect(hud.settingsOpen()).toBe(false);
    });

    it('«Ver la ayuda otra vez» borra la clave siep.ayuda.v1 y avisa con helpReset', () => {
      localStorage.setItem('siep.ayuda.v1', JSON.stringify({ v: 1, vistas: ['primero'] }));
      localStorage.setItem('otra-clave', 'se conserva');
      const root = mount();
      openSettings(root);
      const reset = jest.fn();
      hud.helpReset.subscribe(reset);
      settingsRow(root, 'Ver la ayuda otra vez')!.click();
      fixture.detectChanges();
      expect(localStorage.getItem('siep.ayuda.v1')).toBeNull();
      expect(localStorage.getItem('otra-clave')).toBe('se conserva');
      expect(reset).toHaveBeenCalledTimes(1);
      // El menú sigue abierto y lo dice con una región viva (no depende solo del color o del icono).
      expect(root.querySelector('#game-settings-menu [role="status"]')?.textContent).toContain('volverá a mostrarse');
    });

    it('si el almacenamiento está bloqueado, borrar la ayuda no rompe nada', () => {
      const root = mount();
      openSettings(root);
      const removeItem = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('bloqueado', 'SecurityError');
      });
      const reset = jest.fn();
      hud.helpReset.subscribe(reset);
      expect(() => settingsRow(root, 'Ver la ayuda otra vez')!.click()).not.toThrow();
      expect(reset).toHaveBeenCalledTimes(1);
      removeItem.mockRestore();
    });

    it('las filas nuevas no añaden oyentes globales', () => {
      const add = jest.spyOn(document, 'addEventListener');
      const root = mount();
      openSettings(root);
      const keyboard = add.mock.calls.filter(([type]) => String(type).startsWith('key'));
      // Solo el de Escape de Ajustes (con filtro .escape) puede existir: ninguno genérico.
      for (const [type] of keyboard) expect(type).toBe('keydown');
      expect(hudSource).not.toMatch(/@HostListener\('document:keydown',/);
      expect(hudSource.match(/@HostListener\(/g)).toHaveLength(1);
      add.mockRestore();
    });
  });

  describe('contratos de fuente (CSS)', () => {
    /** Todos los `font-size` de texto del HUD (se omiten los iconos de Material: se miden en px de glifo). */
    function textSizesInPx(): { selector: string; px: number }[] {
      const styles = hudSource.slice(hudSource.indexOf('styles: [`'), hudSource.indexOf('`]\n})'));
      const out: { selector: string; px: number }[] = [];
      for (const chunk of styles.split('}')) {
        const [selector, body] = chunk.split('{');
        if (!body || /mat-icon|\.heart|@media|@keyframes/.test(selector)) continue;
        const match = body.match(/font-size:\s*([\d.]+)(rem|px)/);
        if (match) out.push({ selector: selector.trim(), px: match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1]) });
      }
      return out;
    }

    it('ningún texto del HUD baja de 12 px', () => {
      const sizes = textSizesInPx();
      expect(sizes.length).toBeGreaterThan(8);
      expect(sizes.filter(s => s.px < 12)).toEqual([]);
    });

    it('en compacto la cabecera mide 44 px', () => {
      expect(hudSource).toMatch(
        /@media \(max-height: 520px\), \(pointer: coarse\) and \(orientation: landscape\) \{[\s\S]*?\.hud-strip \{ height: 44px; \}/,
      );
    });

    it('con puntero grueso los botones de la cabecera y de Ajustes miden 44 px', () => {
      expect(hudSource).toMatch(/@media \(pointer: coarse\) \{[\s\S]*?\.hud-action \{[^}]*width: 44px;[^}]*height: 44px;/);
      expect(hudSource).toMatch(/@media \(pointer: coarse\) \{[\s\S]*?\.settings-menu__header button \{[^}]*width: 44px;[^}]*height: 44px;/);
      expect(hudSource).toMatch(/@media \(pointer: coarse\) \{[\s\S]*?\.settings-menu > button,\s*\.settings-menu > a \{[^}]*min-height: 44px;/);
    });

    it('la zona central no desborda sobre sus vecinos (HUD-10)', () => {
      expect(hudSource).toMatch(/\.hud-zone--center \{[^}]*min-width: 0;[^}]*overflow: hidden;/);
      expect(hudSource).toMatch(/\.hud-scene \{[^}]*min-width: 0;/);
    });

    it('el HUD adopta los umbrales únicos de estrés y no cifras propias', () => {
      expect(hudSource).toMatch(/from '\.\/stress-tier\.util'/);
      expect(hudSource).not.toMatch(/s >= (25|50|75)/);
    });
  });
});
