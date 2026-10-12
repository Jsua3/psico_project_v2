import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { UiIconButton } from './ui-icon-button';

/**
 * ui-icon-button (plan visual F2-1; «Cumple en esta fase»: un botón de solo icono exige su nombre accesible). El
 * `label` es obligatorio: en una plantilla falta y no compila (NG8008 con plantillas estrictas); en tiempo de
 * ejecución, leerlo sin valor lanza NG0950.
 */
// req: RNF-004 (etiquetas y alternativas textuales)
@Component({
  imports: [UiIconButton],
  template: `<button ui-icon-button icon="close" label="Cerrar el aviso" [disabledReason]="reason()"
    (click)="clicks = clicks + 1"></button>`,
})
class Host {
  reason = signal<string | null>(null);
  clicks = 0;
}

describe('ui-icon-button', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const button = () => fixture.debugElement.query(By.css('button[ui-icon-button]')).nativeElement as HTMLButtonElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('su nombre accesible es el label y el icono es decorativo', () => {
    expect(button().getAttribute('aria-label')).toBe('Cerrar el aviso');
    const icon = button().querySelector('mat-icon')!;
    expect(icon.textContent?.trim()).toBe('close');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(button().classList).toContain('ui-icon-button');
    expect(button().classList).toContain('ui-icon-button--ghost');
    expect(button().type).toBe('button');
  });

  it('con motivo: aria-disabled, enfocable, motivo en aria-describedby y sin click para el consumidor', async () => {
    host.reason.set('No hay nada que deshacer');
    await fixture.whenStable();
    expect(button().getAttribute('aria-disabled')).toBe('true');
    button().focus();
    expect(document.activeElement).toBe(button());
    expect(document.getElementById(button().getAttribute('aria-describedby')!)?.textContent?.trim()).toBe('No hay nada que deshacer');
    button().click();
    expect(host.clicks).toBe(0);
  });

  it('sin label no se puede pintar (NG0950)', () => {
    const bare = TestBed.createComponent(UiIconButton);
    bare.componentRef.setInput('icon', 'close');
    expect(() => bare.detectChanges()).toThrowError(/NG0950/);
  });
});
