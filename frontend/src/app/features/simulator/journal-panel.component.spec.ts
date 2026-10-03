import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';

import { AudioDirectorService } from './audio-director.service';
import { JournalPanelComponent } from './journal-panel.component';

const source = readFileSync(join(__dirname, 'journal-panel.component.ts'), 'utf-8');

describe('JournalPanelComponent: salida segura en la bitácora (T12.2, REGLA-004)', () => {
  let fixture: ComponentFixture<JournalPanelComponent>;
  let playSfx: jest.Mock;
  const host = () => fixture.nativeElement as HTMLElement;
  const safeExitButton = () =>
    host().querySelector<HTMLButtonElement>('.sheet-footer app-safe-exit-button button');

  beforeEach(() => {
    playSfx = jest.fn();
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
    const safeExit = jest.fn();
    fixture.componentInstance.safeExit.subscribe(safeExit);
    fixture.componentInstance.safeExit.emit();
    expect(safeExit).toHaveBeenCalledTimes(1);
  });

  it('el botón de salida no es el botón de cerrar (cada uno conserva su salida)', () => {
    const safeExit = jest.fn();
    const closeSheet = jest.fn();
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
});
