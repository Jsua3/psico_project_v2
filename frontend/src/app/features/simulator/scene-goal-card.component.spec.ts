import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { SimulationService } from '../../core/api/simulation.service';
import type { GuiaEscena } from './caso/guia';
import { DRAFT_COPY } from './draft-copy';
import type { HintAttemptRef } from './scene-hint.component';
import { SceneGoalCardComponent } from './scene-goal-card.component';

const GUIA: GuiaEscena = {
  objetivo: 'Contener a la familia',
  enEstaSala: [
    { key: 'npc:enfermera', label: 'Enfermera', tipo: 'persona', visto: true },
    { key: 'familia', label: 'Familia', tipo: 'persona', visto: false },
    { key: 'carpeta', label: 'Historia clínica', tipo: 'objeto', visto: true },
  ],
  quedaPorConocer: true,
};

/**
 * La ficha del objetivo (4.2): plegada muestra el objetivo; abierta lista «En esta sala» con la marca en palabras y ofrece
 * «Pedir una pista». Se pinta con el componente aislado y un `SimulationService` falso para la pista.
 */
describe('SceneGoalCardComponent', () => {
  function montar(entrada: { guia: GuiaEscena; hintAttempt?: HintAttemptRef | null; compact?: boolean }) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: SimulationService, useValue: { getHints: vi.fn(() => of({ available: 2, shown: [] })), revealNextHint: vi.fn() } },
        { provide: LiveRegionAnnouncer, useValue: { announce: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(SceneGoalCardComponent);
    fixture.componentRef.setInput('guia', entrada.guia);
    fixture.componentRef.setInput('hintAttempt', entrada.hintAttempt ?? null);
    if (entrada.compact !== undefined) fixture.componentRef.setInput('compact', entrada.compact);
    let abiertas = 0;
    fixture.componentInstance.opened.subscribe(() => abiertas++);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const toggle = () => host.querySelector<HTMLButtonElement>('button.goal-card__toggle')!;
    return {
      fixture, host, el: host,
      toggle,
      abrir: () => { toggle().click(); fixture.detectChanges(); },
      abiertas: () => abiertas,
    };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('plegada muestra el objetivo y lo publica en data-goal', () => {
    const { host, el } = montar({ guia: GUIA });
    expect(el.querySelector('button')!.textContent).toContain('Contener a la familia');
    expect(el.querySelector('button')!.getAttribute('aria-expanded')).toBe('false');
    expect(host.getAttribute('data-goal')).toBe('Contener a la familia');
  });

  it('sin objetivo usa el texto de respaldo y data-goal queda vacío', () => {
    const { host, el } = montar({ guia: { ...GUIA, objetivo: '' } });
    expect(el.textContent).toContain('Explora la sala y conversa con las personas.');
    expect(host.getAttribute('data-goal')).toBe('');
  });

  it('abierta lista «En esta sala» con la marca en palabras y avisa que se abrió', () => {
    const { el, abrir, abiertas } = montar({ guia: GUIA });
    abrir();
    const filas = [...el.querySelectorAll('li')].map(li => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(filas).toEqual(['Enfermera · ya hablaste', 'Familia · aún no', 'Historia clínica · ya revisaste']);
    expect(el.textContent).toContain('En esta sala');
    expect(abiertas()).toBe(1);
  });

  it('abierta ofrece «Pedir una pista» con el intento', () => {
    const { el, abrir } = montar({ guia: GUIA, hintAttempt: { attemptId: 'a1', attemptToken: 't' } });
    abrir();
    expect(el.querySelector('app-scene-hint button')!.textContent).toContain('Pedir una pista');
  });

  it('sin intento no hay botón de pista', () => {
    const { el, abrir } = montar({ guia: GUIA, hintAttempt: null });
    abrir();
    expect(el.querySelector('app-scene-hint')).toBeNull();
  });

  it('se abre y se cierra con su botón, y avisa «opened» solo al abrir', () => {
    const { toggle, abrir, abiertas, fixture } = montar({ guia: GUIA });
    abrir();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    toggle().click();
    fixture.detectChanges();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(abiertas()).toBe(1);
  });

  it('Esc no la cierra: la cadena de Esc del juego no cambia', () => {
    const { toggle, abrir, fixture } = montar({ guia: GUIA });
    abrir();
    toggle().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('arranca plegada también en compacto y no usa región viva propia', () => {
    const { toggle, host } = montar({ guia: GUIA, compact: true });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[aria-live], [role="status"]')).toBeNull();
  });

  it('los rótulos salen de DRAFT_COPY y ninguno insinúa qué responder', () => {
    expect(DRAFT_COPY.goalCardTitle.text).toBe('Objetivo de la escena');
    expect(DRAFT_COPY.goalCardFallback.text).toBe('Explora la sala y conversa con las personas.');
    expect(DRAFT_COPY.roomListTitle.text).toBe('En esta sala');
    expect(DRAFT_COPY.hintAskLabel.text).toBe('Pedir una pista');
  });
});
