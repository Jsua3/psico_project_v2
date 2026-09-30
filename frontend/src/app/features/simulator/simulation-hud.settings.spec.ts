import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SimulationHudComponent } from './simulation-hud.component';

const hudSource = readFileSync(join(__dirname, 'simulation-hud.component.ts'), 'utf-8');
const playSource = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

function pressEscape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event;
}

describe('HUD: menú de Ajustes', () => {
  let fixture: ComponentFixture<SimulationHudComponent>;
  let hud: SimulationHudComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SimulationHudComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(SimulationHudComponent);
    fixture.detectChanges();
    hud = fixture.componentInstance;
  });

  afterEach(() => TestBed.resetTestingModule());

  it('Esc cierra Ajustes y consume la tecla para que no dispare la salida segura', () => {
    hud.settingsOpen.set(true);
    const event = pressEscape();
    expect(hud.settingsOpen()).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it('con Ajustes cerrado, Esc queda libre para el juego', () => {
    const event = pressEscape();
    expect(event.defaultPrevented).toBe(false);
  });

  it('un toque dentro del HUD no cierra Ajustes; uno fuera sí', () => {
    hud.settingsOpen.set(true);
    (fixture.nativeElement as HTMLElement).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(hud.settingsOpen()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(hud.settingsOpen()).toBe(false);
  });

  it('el engranaje anuncia si el menú está abierto y recibe el foco al cerrar', () => {
    expect(hudSource).toContain('#settingsTrigger');
    expect(hudSource).toContain('[attr.aria-expanded]="settingsOpen()"');
    expect(hudSource).toContain('[attr.aria-controls]="settingsOpen() ? \'game-settings-menu\' : null"');
    expect(hudSource).toContain('id="game-settings-menu"');
    expect(hudSource).toContain('aria-label="Cerrar ajustes" (click)="closeSettings()"');
    expect(hudSource).toMatch(/if \(restoreFocus\) this\.settingsTrigger\(\)\?\.nativeElement\.focus\(\);/);
  });

  it('el manejador global de la partida respeta las teclas ya consumidas', () => {
    expect(playSource).toMatch(/handleGlobalInteraction\(event: KeyboardEvent\) \{[\s\S]{0,400}?if \(event\.defaultPrevented\) return;/);
  });
});
