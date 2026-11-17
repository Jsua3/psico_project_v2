import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { type EscenarioReaccion, type FinReaccion, ReactionDirectorComponent } from './reaction-director.component';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { KitService } from '../character/kit/kit.service';

const ANTES = { bond: 'GUARDED', activation: 'TENSE', label: 'La persona se muestra cautelosa y tensa' } as const;
const DESPUES = { bond: 'OPEN', activation: 'CALM', label: 'La persona se abre y está serena' } as const;
const REACCION = { line: 'Gracias por quedarse.', emotion: 'triste', gesture: 'se-acerca', objectKey: 'familia-duelo' };
const ENTRADA = { reaction: REACCION, personaAntes: ANTES, personaDespues: DESPUES, reduceMotion: false };
const QUIEN = { nombre: 'Familia en crisis', visual: null };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function montar(opts: { reduceMotion: boolean }) {
  const llamadas: string[] = [];
  const escenario: EscenarioReaccion & { llamadas: string[] } = {
    llamadas,
    frameActors: k => { llamadas.push(`frameActors:${k}`); },
    releaseFrame: () => { llamadas.push('releaseFrame'); },
    playGesture: (k, g) => { llamadas.push(`playGesture:${k}:${g}`); return Promise.resolve(); },
    setPersonaState: t => { llamadas.push(`setPersonaState:${t}`); },
  };
  const announcer = { announce: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: LiveRegionAnnouncer, useValue: announcer },
      { provide: KitService, useValue: fakeKitService() },
    ],
  });
  const fixture = TestBed.createComponent(ReactionDirectorComponent);
  fixture.componentRef.setInput('escenario', escenario);
  fixture.componentRef.setInput('reduceMotion', opts.reduceMotion);
  const director = fixture.componentInstance;
  const terminado: FinReaccion[] = [];
  director.finished.subscribe(m => terminado.push(m));
  const teclear = (key: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init });
    document.dispatchEvent(e);
    return e;
  };
  return { director, escenario, announcer, terminado, teclear, fixture };
}

it('recorre encuadre, gesto, cara, frase y etiqueta y termina soltando el encuadre', async () => {
  const { director, escenario, announcer, terminado } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  await vi.runAllTimersAsync();
  expect(escenario.llamadas).toEqual(['frameActors:familia-duelo', 'playGesture:familia-duelo:se-acerca', 'setPersonaState:La persona se abre y está serena', 'releaseFrame']);
  expect(announcer.announce).toHaveBeenCalledWith('Familia en crisis: Gracias por quedarse.', 'polite');
  expect(announcer.announce).toHaveBeenCalledTimes(1);
  expect(terminado).toEqual(['completa']);
});

it('con movimiento reducido no encuadra ni gesticula, pero la frase y la etiqueta cambian', async () => {
  const { director, escenario } = montar({ reduceMotion: true });
  director.play(ENTRADA, QUIEN);
  await vi.runAllTimersAsync();
  expect(escenario.llamadas.some(c => c.startsWith('frameActors') || c.startsWith('playGesture'))).toBe(false);
  expect(escenario.llamadas).toContain('setPersonaState:La persona se abre y está serena');
});

it('Enter salta al final una sola vez y deja el estado final', () => {
  const { director, escenario, terminado, teclear, announcer } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  const primero = teclear('Enter');
  teclear('Enter', { repeat: true });
  teclear(' ');
  expect(primero.defaultPrevented).toBe(true);
  expect(terminado).toEqual(['saltada']);
  expect(escenario.llamadas.at(-1)).toBe('releaseFrame');
  expect(escenario.llamadas).toContain('setPersonaState:La persona se abre y está serena');
  expect(announcer.announce).toHaveBeenCalledTimes(1);
});

it('una tecla repetida mantenida durante la secuencia no salta ni pasa a otros oyentes', () => {
  const { director, terminado, teclear } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  expect(teclear('Enter', { repeat: true }).defaultPrevented).toBe(true);
  expect(terminado).toEqual([]);
});

it('Esc no lo consume: sigue a la cadena de la salida segura', () => {
  const { director, teclear } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  expect(teclear('Escape').defaultPrevented).toBe(false);
});

it('cancel corta sin emitir completa y suelta el encuadre', async () => {
  const { director, escenario, terminado } = montar({ reduceMotion: false });
  director.play(ENTRADA, QUIEN);
  director.cancel();
  await vi.runAllTimersAsync();
  expect(terminado).toEqual(['cancelada']);
  expect(escenario.llamadas.at(-1)).toBe('releaseFrame');
  expect(escenario.llamadas).not.toContain('setPersonaState:La persona se abre y está serena');
  expect(director.activa()).toBe(false);
});

it('cancel sin secuencia activa no emite nada', () => {
  const { director, terminado } = montar({ reduceMotion: false });
  director.cancel();
  expect(terminado).toEqual([]);
});

it('fuera de la secuencia no consume ninguna tecla', () => {
  const { teclear } = montar({ reduceMotion: false });
  expect(teclear('Enter').defaultPrevented).toBe(false);
});

it('pinta la franja con el nombre, la frase y la pista oculta a lectores mientras está activa', async () => {
  const { director, fixture } = montar({ reduceMotion: true });
  director.play(ENTRADA, QUIEN);
  await vi.advanceTimersByTimeAsync(10);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  expect(el.textContent).toContain('Familia en crisis');
  expect(el.textContent).toContain('Gracias por quedarse.');
  expect(el.querySelector('.reaction-hint')?.getAttribute('aria-hidden')).toBe('true');
  director.cancel();
  fixture.detectChanges();
  expect(el.querySelector('.reaction-strip')).toBeNull();
});

it('la franja trae «Salida segura» (REGLA-004): pulsarla pide la pausa y, pedida, dice «Pausando…»', async () => {
  const { director, fixture } = montar({ reduceMotion: true });
  const pausas: number[] = [];
  director.safeExit.subscribe(() => pausas.push(1));
  director.play(ENTRADA, QUIEN);
  await vi.advanceTimersByTimeAsync(10);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const boton = el.querySelector<HTMLButtonElement>('.reaction-dock .safe-exit-btn');
  expect(boton?.textContent).toContain('Salida segura');
  boton!.click();
  expect(pausas).toEqual([1]);
  fixture.componentRef.setInput('pausing', true);
  fixture.detectChanges();
  expect(el.querySelector('.reaction-dock .safe-exit-btn')?.textContent).toContain('Pausando…');
  director.cancel();
  fixture.detectChanges();
  expect(el.querySelector('.safe-exit-btn')).toBeNull();
});

it('sin nombre se anuncia solo la frase, sin los dos puntos sueltos', async () => {
  const { director, announcer } = montar({ reduceMotion: true });
  director.play(ENTRADA, { nombre: '', visual: null });
  await vi.runAllTimersAsync();
  expect(announcer.announce).toHaveBeenCalledWith('Gracias por quedarse.', 'polite');
});
