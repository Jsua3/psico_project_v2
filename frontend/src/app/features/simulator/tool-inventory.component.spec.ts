import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ClinicalToolState } from '../../core/models/simulation.model';
import { ToolInventoryComponent } from './tool-inventory.component';

const source = readFileSync(join(__dirname, 'tool-inventory.component.ts'), 'utf-8');

const TOOLS: ClinicalToolState[] = [
  { code: 'PAP', label: 'Primeros Auxilios Psicológicos', icon: 'healing', category: 'A', description: 'Apoyo inicial en crisis.', active: true },
  { code: 'SPIKES', label: 'Protocolo EPICEE', icon: 'campaign', category: 'B', description: 'Comunicar noticias difíciles.', active: true },
  { code: 'RISK_METER', label: 'Valoración de riesgo', icon: 'speed', category: 'C', description: 'Estimar el riesgo.', active: true },
  { code: 'SAFETY_ROUTE', label: 'Ruta de seguridad', icon: 'alt_route', category: 'D', description: 'Activar la ruta.', active: true },
  { code: 'REFLECTION_JOURNAL', label: 'Bitácora reflexiva', icon: 'menu_book', category: 'E', description: 'Escribir lo vivido.', active: true },
];

type InputSignalNodeLike<T> = { applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void };

/** ts-jest no compila las entradas con `input()`: se escribe el valor en el nodo interno. */
function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

describe('ToolInventoryComponent: dock de herramientas (T7.3)', () => {
  let fixture: ComponentFixture<ToolInventoryComponent>;
  let dock: ToolInventoryComponent;
  let root: HTMLElement;

  function mount(inventory: string[] = ['PAP'], selected: string | null = null): void {
    TestBed.configureTestingModule({ imports: [ToolInventoryComponent] });
    fixture = TestBed.createComponent(ToolInventoryComponent);
    dock = fixture.componentInstance;
    writeInputSignal(dock.tools, TOOLS);
    writeInputSignal(dock.inventory, inventory);
    writeInputSignal(dock.selectedToolCode, selected);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  }

  const cards = (): HTMLButtonElement[] => Array.from(root.querySelectorAll<HTMLButtonElement>('button.tool-card'));
  const card = (code: string): HTMLButtonElement => cards()[TOOLS.findIndex(t => t.code === code)];

  afterEach(() => TestBed.resetTestingModule());

  describe('contador', () => {
    it('el aria-label de la barra dice «Herramientas {n} de {m}»', () => {
      mount(['PAP']);
      expect(root.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toMatch(/^Herramientas 1 de 5\./);
    });

    it('cambia al conseguir otra herramienta', () => {
      mount(['PAP']);
      writeInputSignal(dock.inventory, ['PAP', 'SPIKES', 'RISK_METER']);
      fixture.detectChanges();
      expect(root.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toMatch(/^Herramientas 3 de 5\./);
      expect(root.querySelector('.tool-count strong')?.textContent?.trim()).toBe('3 de 5');
    });

    it('sin herramientas en el mundo dice 0 de 0 sin romper', () => {
      mount([]);
      writeInputSignal(dock.tools, []);
      fixture.detectChanges();
      expect(root.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toMatch(/^Herramientas 0 de 0\./);
    });

    it('el contador visible no es parte del orden de lectura (la barra ya lo anuncia)', () => {
      mount();
      expect(root.querySelector('.tool-count')?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('sin insignias numéricas', () => {
    it('no hay insignias 1-5: no existe ningún atajo de teclado para las herramientas', () => {
      mount(['PAP', 'SPIKES']);
      expect(root.querySelector('.tool-key')).toBeNull();
      expect(source).not.toContain('tool-key');
      expect(root.textContent).not.toMatch(/(^|\s)[1-5](\s|$)/);
    });
  });

  describe('ranuras bloqueadas', () => {
    it('usan aria-disabled y siguen siendo enfocables (nunca disabled)', () => {
      mount(['PAP']);
      const locked = card('SPIKES');
      expect(locked.getAttribute('aria-disabled')).toBe('true');
      expect(locked.disabled).toBe(false);
      expect(locked.hasAttribute('disabled')).toBe(false);
      expect(locked.tabIndex).toBeGreaterThanOrEqual(0);
      locked.focus();
      expect(document.activeElement).toBe(locked);
    });

    it('las poseídas no llevan aria-disabled', () => {
      mount(['PAP']);
      expect(card('PAP').hasAttribute('aria-disabled')).toBe(false);
    });

    it('el title de una bloqueada trae el nombre completo y cómo se consigue', () => {
      mount(['PAP']);
      const title = card('SPIKES').getAttribute('title') ?? '';
      expect(title).toContain('Protocolo EPICEE');
      expect(title).toContain('Se consigue explorando las salas del caso.');
    });

    it('el title de una poseída trae el nombre completo y para qué sirve', () => {
      mount(['PAP']);
      expect(card('PAP').getAttribute('title')).toBe('Primeros Auxilios Psicológicos — Apoyo inicial en crisis.');
    });

    it('el nombre accesible empieza por el texto visible (2.5.3) y dice el estado', () => {
      mount(['PAP']);
      const locked = card('SPIKES');
      expect(locked.getAttribute('aria-label')).toMatch(/^Protocolo EPICEE: /);
      expect(locked.getAttribute('aria-label')).toContain('No disponible');
      expect(locked.getAttribute('aria-label')).toContain('Se consigue explorando las salas del caso.');
      expect(card('PAP').getAttribute('aria-label')).toMatch(/^Primeros Auxilios Psicológicos: .*Disponible\.$/);
    });

    it('tocar una bloqueada no emite select y explica por qué en una región viva', () => {
      mount(['PAP']);
      const selected = jest.fn();
      dock.select.subscribe(selected);
      card('SPIKES').click();
      fixture.detectChanges();
      expect(selected).not.toHaveBeenCalled();
      const notice = root.querySelector('[role="status"]');
      expect(notice?.textContent).toContain('Protocolo EPICEE');
      expect(notice?.textContent).toContain('Se consigue explorando las salas del caso.');
    });

    it('el aviso desaparece al conseguir la herramienta y al elegir otra', () => {
      mount(['PAP']);
      card('SPIKES').click();
      fixture.detectChanges();
      expect(root.querySelector('[role="status"]')?.textContent?.trim()).not.toBe('');

      writeInputSignal(dock.inventory, ['PAP', 'SPIKES']);
      fixture.detectChanges();
      expect(root.querySelector('[role="status"]')?.textContent?.trim()).toBe('');

      card('RISK_METER').click();
      fixture.detectChanges();
      expect(root.querySelector('[role="status"]')?.textContent?.trim()).not.toBe('');
      card('PAP').click();
      fixture.detectChanges();
      expect(root.querySelector('[role="status"]')?.textContent?.trim()).toBe('');
    });

    it('sin aviso la región viva existe vacía (para que el siguiente texto se anuncie)', () => {
      mount(['PAP']);
      const notice = root.querySelector('[role="status"]');
      expect(notice).not.toBeNull();
      expect(notice?.textContent?.trim()).toBe('');
    });
  });

  describe('ranuras poseídas', () => {
    it('al activarlas emiten el código de la herramienta', () => {
      mount(['PAP']);
      const selected = jest.fn();
      dock.select.subscribe(selected);
      card('PAP').click();
      expect(selected).toHaveBeenCalledWith('PAP');
    });

    it('marcan la seleccionada', () => {
      mount(['PAP'], 'PAP');
      expect(card('PAP').classList).toContain('tool-card--selected');
      expect(card('SPIKES').classList).not.toContain('tool-card--selected');
    });
  });

  describe('contratos de fuente (CSS)', () => {
    const styles = source.slice(source.indexOf('styles: [`'));

    it('ningún texto del dock baja de 12 px (los iconos de Material no cuentan)', () => {
      const sizes: { selector: string; px: number }[] = [];
      for (const chunk of styles.split('}')) {
        const [selector, body] = chunk.split('{');
        if (!body || /mat-icon|\.tool-lock|@keyframes|@media/.test(selector)) continue;
        const match = body.match(/font-size:\s*([\d.]+)(rem|px)/);
        if (match) sizes.push({ selector: selector.trim(), px: match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1]) });
      }
      expect(sizes.length).toBeGreaterThanOrEqual(2);
      expect(sizes.filter(s => s.px < 12)).toEqual([]);
    });

    it('con puntero grueso cada ranura mide al menos 44 px', () => {
      expect(styles).toMatch(/@media \(pointer: coarse\) \{[\s\S]*?\.tool-card \{[^}]*min-height: 44px;/);
    });

    it('en compacto las ranuras son iconos de 44x44 y el nombre queda en title y aria-label', () => {
      expect(styles).toMatch(
        /@media \(max-height: 520px\), \(pointer: coarse\) and \(orientation: landscape\) \{[\s\S]*?\.tool-card \{[^}]*width: 44px;[^}]*height: 44px;/,
      );
      expect(styles).toMatch(/\.tool-name \{ display: none; \}/);
    });

    it('el dock no usa `disabled` ni oculta las bloqueadas al lector', () => {
      expect(source).not.toMatch(/\[disabled\]/);
    });
  });
});
