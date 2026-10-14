import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Mock } from 'vitest';

import { LiveRegionAnnouncer } from '../../core/a11y/live-announcer.service';
import { SimulationAttemptState } from '../../core/models/simulation.model';
import { DRAFT_COPY } from './draft-copy';
import { SimulationHudComponent } from './simulation-hud.component';
import { STRESS_TIER_LABELS } from './stress-tier.util';

/**
 * Anuncio del nivel de estrés (plan visual F6-12; H-08, WCAG 4.1.3; VD-20, redacción en BORRADOR de Psicología):
 * solo al CRUZAR 30, 60 y 85 —no con cada punto—, con cortesía, sin alarmar y con el rótulo que el medidor ya trae.
 * Al cargar un intento que ya viene con estrés no se anuncia: nada cruzó.
 */
// req: BLOQUE-H (H-08), RNF-04
describe('HUD: anuncio del nivel de estrés (F6-12)', () => {
  let fixture: ComponentFixture<SimulationHudComponent>;
  let announce: Mock;

  const attemptWith = (stressIndex: number, attemptId = 'a-1') => ({
    attemptId, caseTitle: 'Violencia familiar', stressIndex, accumulatedScore: 0,
    currentNode: { key: 'hospital-urgencias', title: 'Urgencia vital y crisis' },
  }) as unknown as SimulationAttemptState;

  function mountAt(stress: number, attemptId = 'a-1'): void {
    announce = vi.fn();
    TestBed.configureTestingModule({
      imports: [SimulationHudComponent],
      providers: [provideRouter([]), { provide: LiveRegionAnnouncer, useValue: { announce } }],
    });
    fixture = TestBed.createComponent(SimulationHudComponent);
    fixture.componentRef.setInput('attempt', attemptWith(stress, attemptId));
    fixture.detectChanges();
  }

  function setStress(stress: number, attemptId = 'a-1'): void {
    fixture.componentRef.setInput('attempt', attemptWith(stress, attemptId));
    fixture.detectChanges();
  }

  const said = () => announce.mock.calls.map(([text]) => text as string);

  afterEach(() => TestBed.resetTestingModule());

  it('al cargar con el estrés ya en curso no anuncia nada: nada cruzó', () => {
    mountAt(70);
    expect(announce).not.toHaveBeenCalled();
  });

  it('anuncia al cruzar 30, 60 y 85 hacia arriba, una vez cada umbral, con el rótulo del medidor', () => {
    mountAt(0);
    setStress(29);
    expect(announce).not.toHaveBeenCalled();

    setStress(30);
    setStress(59);
    setStress(60);
    setStress(84);
    setStress(85);

    expect(said()).toEqual([
      `${DRAFT_COPY.stressAnnouncementPrefix.text} ${STRESS_TIER_LABELS.moderate}`,
      `${DRAFT_COPY.stressAnnouncementPrefix.text} ${STRESS_TIER_LABELS.high}`,
      `${DRAFT_COPY.stressAnnouncementPrefix.text} ${STRESS_TIER_LABELS.critical}`,
    ]);
  });

  it('no repite dentro del mismo nivel: cada punto de estrés no es un anuncio', () => {
    mountAt(0);
    for (const stress of [30, 33, 41, 48, 55, 59]) setStress(stress);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('bajar de nivel (una herramienta de contención) también se anuncia, sin repetir el de arriba', () => {
    mountAt(70);
    setStress(55);
    setStress(40);
    setStress(20);
    expect(said()).toEqual([
      `${DRAFT_COPY.stressAnnouncementPrefix.text} ${STRESS_TIER_LABELS.moderate}`,
      `${DRAFT_COPY.stressAnnouncementPrefix.text} ${STRESS_TIER_LABELS.calm}`,
    ]);
  });

  it('siempre con cortesía: ni el nivel crítico usa assertive (no se alarma a quien juega)', () => {
    mountAt(0);
    setStress(90);
    expect(announce.mock.calls.every(([, politeness]) => politeness === 'polite')).toBe(true);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('un intento nuevo empieza de cero: su primer valor no es un cruce', () => {
    mountAt(70, 'a-1');
    setStress(0, 'a-2');
    expect(announce).not.toHaveBeenCalled();
    setStress(31, 'a-2');
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('el borrador nombra su decisión y a quien debe fijarlo (Psicología)', () => {
    expect(DRAFT_COPY.stressAnnouncementPrefix).toMatchObject({ decision: 'VD-20', owner: 'Psicología' });
  });
});
