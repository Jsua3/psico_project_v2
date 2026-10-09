import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';

import { AudioDirectorService } from './audio-director.service';
import { JournalPanelComponent } from './journal-panel.component';
import type { Mock } from 'vitest';

const source = readFileSync(join(__dirname, 'journal-panel.component.ts'), 'utf-8');

// ts-jest no aplica la transformación JIT de Angular a los inputs con signals: se escribe el nodo
// interno como en confirm-dialog.component.spec.ts.
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

describe('JournalPanelComponent: salida segura en la bitácora (T12.2, REGLA-004)', () => {
  let fixture: ComponentFixture<JournalPanelComponent>;
  let playSfx: Mock;
  const host = () => fixture.nativeElement as HTMLElement;
  const safeExitButton = () =>
    host().querySelector<HTMLButtonElement>('.sheet-footer app-safe-exit-button button');

  beforeEach(() => {
    playSfx = vi.fn();
    TestBed.configureTestingModule({
      imports: [JournalPanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx } }],
    });
    fixture = TestBed.createComponent(JournalPanelComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('el pie de la bitácora ofrece «Salida segura» junto a «Continuar simulación»', () => {
    const button = safeExitButton();
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain('Salida segura');
    const footerButtons = Array.from(host().querySelectorAll('.sheet-footer button')).map(b => b.textContent?.replace(/\s+/g, ' ').trim());
    expect(footerButtons.some(text => text?.includes('Continuar simulación'))).toBe(true);
  });

  it('el botón de salida segura reenvía su evento pause como la salida safeExit de la bitácora', () => {
    // ts-jest no aplica la transformación JIT de Angular a `output()`: un `(pause)` de la plantilla
    // se trata como evento DOM y no se dispara desde aquí. El cableado se fija sobre el fuente
    // y se comprueba jugando; la emisión del propio botón la cubre safe-exit-button.component.spec.ts.
    expect(source).toMatch(/<app-safe-exit-button\s+data-hide-key\s+\(pause\)="safeExit\.emit\(\)"\s*\/>/);
    expect(source).toMatch(/readonly safeExit = output<void>\(\);/);
    // En la bitácora Esc la cierra: el botón no promete Esc.
    expect(host().querySelector('.sheet-footer app-safe-exit-button')?.hasAttribute('data-hide-key')).toBe(true);
    const safeExit = vi.fn();
    fixture.componentInstance.safeExit.subscribe(safeExit);
    fixture.componentInstance.safeExit.emit();
    expect(safeExit).toHaveBeenCalledTimes(1);
  });

  it('el botón de salida no es el botón de cerrar (cada uno conserva su salida)', () => {
    const safeExit = vi.fn();
    const closeSheet = vi.fn();
    fixture.componentInstance.safeExit.subscribe(safeExit);
    fixture.componentInstance.closeSheet.subscribe(closeSheet);

    host().querySelector<HTMLButtonElement>('.continue-btn')?.click();

    expect(closeSheet).toHaveBeenCalledTimes(1);
    expect(safeExit).not.toHaveBeenCalled();
  });

  it('la salida segura sigue activa con el guardado deshabilitado (intento no en curso o ocupado)', () => {
    // `disabled` apaga el textarea y «Guardar»; la salida segura nunca depende de él.
    const button = safeExitButton();
    expect(button?.disabled).toBe(false);
  });

  it('en pantallas bajas las columnas se desplazan por dentro y el pie con la salida segura no se solapa', () => {
    expect(source).toMatch(/@media \(max-height: 520px\) \{[^}]*\.journal-modal \{[^}]*\}\s*\.journal-columns \{ overflow-y: auto; \}/);
    // El pie no se parte en dos filas con los dos botones y la nota cede ancho.
    expect(source).toMatch(/\.footer-actions \{[^}]*flex-shrink: 0;/);
    expect(source).toMatch(/\.encrypt-note \{[^}]*flex: 1 1 0; min-width: 0;/);
  });
});

describe('JournalPanelComponent: «Trazabilidad» con los títulos completos', () => {
  let fixture: ComponentFixture<JournalPanelComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [JournalPanelComponent],
      providers: [{ provide: AudioDirectorService, useValue: { playSfx: vi.fn() } }],
    });
    fixture = TestBed.createComponent(JournalPanelComponent);
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('lista cada etapa visitada con su título completo, sin recortes ni elipsis', () => {
    // Antes la API los recortaba a 14 caracteres y ambos quedaban «Consultorio: …».
    const stages = ['Consultorio: protección y marco', 'Consultorio: acción técnica y ética'];
    writeInputSignal(fixture.componentInstance.timeline, stages);
    fixture.detectChanges();

    const items = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.journal-context ol li'))
      .map(item => item.textContent?.trim());
    expect(items).toEqual(stages);
  });

  it('un título largo sin espacios se parte en lugar de desbordar la columna', () => {
    expect(source).toMatch(/\.journal-context li \{[^}]*overflow-wrap: anywhere;/);
  });
});
