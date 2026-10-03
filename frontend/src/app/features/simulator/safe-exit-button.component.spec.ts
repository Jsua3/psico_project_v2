import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio } from '../../../styles/contrast.util';
import { SafeExitButtonComponent } from './safe-exit-button.component';

type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

/** Nombre accesible aproximado: texto del botón sin lo que está oculto a las tecnologías de apoyo. */
function accessibleName(button: HTMLElement): string {
  const explicit = button.getAttribute('aria-label');
  if (explicit) return explicit.trim();
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement) || node.getAttribute('aria-hidden') === 'true') return '';
    return Array.from(node.childNodes).map(walk).join('');
  };
  return walk(button).replace(/\s+/g, ' ').trim();
}

/** Texto que el estudiante ve: todo salvo lo oculto a la vista por la hoja de estilos base. */
function visibleLabel(button: HTMLElement): string {
  return (button.querySelector('.safe-exit-btn__label')?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const source = readFileSync(join(__dirname, 'safe-exit-button.component.ts'), 'utf-8');

describe('SafeExitButtonComponent (T1.1)', () => {
  let fixture: ComponentFixture<SafeExitButtonComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const button = () => host().querySelector('button') as HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SafeExitButtonComponent] });
    fixture = TestBed.createComponent(SafeExitButtonComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('muestra «Salida segura» y su nombre accesible es exactamente ese texto (WCAG 2.5.3)', () => {
    expect(visibleLabel(button())).toBe('Salida segura');
    expect(accessibleName(button())).toBe('Salida segura');
    // Ninguna decoración se cuela en el nombre: ni «Esc», ni «(Escape)», ni el ligado del icono.
    expect(accessibleName(button())).not.toMatch(/esc|exit_to_app/i);
  });

  it('es un botón de tipo button con un único nombre «Salida segura» (los e2e buscan /salida segura/i)', () => {
    const buttons = host().querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(button().type).toBe('button');
    expect(button().getAttribute('aria-label')).toBeNull();
  });

  it('emite pause exactamente una vez por activación', () => {
    const spy = jest.fn();
    fixture.componentInstance.pause.subscribe(spy);
    button().click();
    expect(spy).toHaveBeenCalledTimes(1);
    button().click();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('el modo compacto cambia la clase pero conserva texto y nombre', () => {
    expect(button().classList).not.toContain('safe-exit-btn--compact');
    writeInputSignal(fixture.componentInstance.compact, true);
    fixture.detectChanges();
    expect(button().classList).toContain('safe-exit-btn--compact');
    expect(visibleLabel(button())).toBe('Salida segura');
    expect(accessibleName(button())).toBe('Salida segura');
  });

  it('la pista Esc va oculta a las tecnologías de apoyo', () => {
    const kbd = host().querySelector('kbd');
    expect(kbd?.textContent?.trim()).toBe('Esc');
    expect(kbd?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('SafeExitButtonComponent: contratos de fuente (T1.1)', () => {
  it('el kbd Esc solo se muestra con puntero fino y hover', () => {
    // Por defecto no se pinta (táctil, lápiz): no hay tecla que pulsar.
    expect(source).toMatch(/\.safe-exit-btn__kbd \{[^}]*display: none;/);
    // Y solo la media query lo enciende.
    const query = source.match(/@media \(hover: hover\) and \(pointer: fine\) \{\s*([\s\S]*?)\n    \}/)?.[1] ?? '';
    expect(query).toMatch(/\.safe-exit-btn__kbd \{\s*display: inline-block;/);
    // El modo compacto nunca la enseña, tampoco con ratón.
    expect(source).toMatch(/\.safe-exit-btn--compact \.safe-exit-btn__kbd \{\s*display: none;/);
    expect(source.match(/display: inline-block;/g)).toHaveLength(1);
  });

  it('mide al menos 44 x 44 px, también compacto', () => {
    expect(source).toMatch(/\.safe-exit-btn \{[^}]*min-height: 44px;[^}]*min-width: 44px;/);
    const compactBlock = source.match(/\.safe-exit-btn--compact \{([^}]*)\}/)?.[1] ?? '';
    expect(compactBlock).not.toMatch(/min-height:\s*(\d+)px/);
  });

  it('no usa la clase close-btn (los e2e la pulsan para avanzar diálogos) ni backdrop-filter', () => {
    expect(source).not.toMatch(/class="[^"]*\bclose-btn\b|\.close-btn/);
    expect(source).not.toContain('backdrop-filter');
  });

  it('el anillo de foco #f1a79f llega a 3:1 sobre el fondo del juego y sobre el panel de diálogo', () => {
    const ring = source.match(/\.safe-exit-btn:focus-visible \{\s*outline: 2px solid (#[0-9A-Fa-f]{6});\s*outline-offset: 2px;/)?.[1] ?? '';
    expect(ring.toLowerCase()).toBe('#f1a79f');
    // Fondo del juego y peor caso del panel de diálogo (rgba(8,12,18,.95) sobre un píxel blanco del mapa).
    for (const surface of ['#0E1322', blend('#080C12', 0.95, '#FFFFFF')]) {
      expect(contrastRatio(ring, surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('el texto llega a 4,5:1 sobre su propio fondo (rojo translúcido sobre el panel más claro)', () => {
    const surface = blend('#E25A4F', 0.1, blend('#080C12', 0.95, '#FFFFFF'));
    expect(contrastRatio('#f1a79f', surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('con movimiento reducido no anima nada', () => {
    expect(source).not.toMatch(/animation:/);
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.safe-exit-btn \{ transition: none; \}/);
  });
});
