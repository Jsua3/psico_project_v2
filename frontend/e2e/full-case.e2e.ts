import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

import { assertQualityState } from './support/quality-gates';
import { REQUIRED_VIEWPORTS } from './support/required-viewports';
import {
  acceptContentWarning,
  chooseDecision,
  closeDialogue,
  createWorldInputDriver,
  enterCaseAtContentWarning,
  enterDoor,
  finishCaseIntroduction,
  interactNearby,
  loginStudent,
  moveAndPersistPosition,
  pauseWithPendingPosition,
  reloadAndResumeAttempt,
  seekNpcDialogue,
  useToolChoice,
  waitForWorldReady,
} from './support/siep-flow';

type RequiredViewport = (typeof REQUIRED_VIEWPORTS)[number];

async function completeFullCase(
  page: Page,
  testInfo: TestInfo,
  viewport: RequiredViewport,
): Promise<void> {
  // Holgura para el runner del CI (sin GPU): ahí el caso tarda ~3-4x más que en local.
  testInfo.setTimeout(600_000);
  const input = createWorldInputDriver(page, viewport.inputMode);

  await page.goto('/login');
  await loginStudent(page);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: 30_000 });

  const consent = await enterCaseAtContentWarning(page);
  const introVideo = await acceptContentWarning(page, consent);
  const caseIntro = await finishCaseIntroduction(page, introVideo);
  await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);

  // Hospital — evidencia de H1: PAP + familia inspeccionada + enfermera registrada.
  await input.moveUntilNearby('ArrowLeft', /kit pap/i);
  const pap = await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
  expect(pap.world.inventory).toContain('PAP');

  await input.moveUntilNearby('ArrowLeft', /familia en crisis/i);
  await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
  const papUse = await useToolChoice(
    page,
    /abuela de la niña/i,
    /aplicar pap a la familia en crisis/i,
  );
  expect(papUse.pertinent).toBe(true);
  expect(papUse.world.usedToolKeys).toContain('PAP@familia-crisis');
  await closeDialogue(page, /herramienta pertinente/i);

  await input.moveUntilNearby('ArrowRight', /sala de escucha familiar/i);
  await input.moveBy('ArrowLeft', 203);
  await input.moveBy('ArrowUp', 50);
  await seekNpcDialogue(page, /enfermera de urgencias/i, input);
  await closeDialogue(page, /enfermera de urgencias/i);

  // Rodear la camilla por el pasillo frontal antes de buscar la puerta.
  await input.moveBy('ArrowDown', 83);
  await input.moveUntilNearby('ArrowRight', /sala de escucha familiar/i);
  const escuchaEntry = await enterDoor(page, /sala de escucha familiar/i, 'hospital-sala-escucha');
  expect(escuchaEntry.player).toMatchObject({ x: 160, y: 452 });

  // H1 — contención con PAP.
  await input.moveUntilNearby('ArrowUp', /familia en crisis/i);
  await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-duelo$/);
  let decision = await chooseDecision(
    page,
    /abuela de la niña/i,
    /aplicar pap: contención emocional, acompañamiento en duelo/i,
  );
  expect(decision.currentNode.key).toBe('hospital-sala-escucha');
  await closeDialogue(page, /supervisión clínica/i);
  await waitForWorldReady(page);

  // Persistencia — refresh en progreso y pausa inmediata conservan el mismo intento.
  const attemptId = decision.attemptId as string;
  const beforeRefresh = await moveAndPersistPosition(page, input, 'ArrowRight', 36);
  const refreshed = await reloadAndResumeAttempt(page, 'IN_PROGRESS', 'hospital-sala-escucha');
  expect(refreshed.activeAttempt.attemptId).toBe(attemptId);
  expect(refreshed.activeAttempt.currentNode.key).toBe('hospital-sala-escucha');
  expect(refreshed.activeAttempt.clinicalState.papApplied).toBe(true);
  expect(refreshed.world.player).toEqual(beforeRefresh.player);
  expect(refreshed.world.inventory).toContain('PAP');
  expect(refreshed.world.usedToolKeys).toContain('PAP@familia-crisis');
  expect(refreshed.world.inspectedObjectKeys).toContain('familia-crisis');
  expect(refreshed.world.flags.viewedNpcKeys).toContain('enfermera-urgencias');

  const paused = await pauseWithPendingPosition(page, input, 'ArrowRight');
  expect(paused.pausedAttempt.attemptId).toBe(attemptId);
  expect(paused.pausedAttempt.status).toBe('PAUSED');
  expect(paused.pausedAttempt.currentNode.key).toBe('hospital-sala-escucha');
  expect(paused.pausedAttempt.clinicalState.papApplied).toBe(true);
  await expect(page.getByRole('alertdialog', { name: /pausa/i })).toBeVisible({ timeout: 30_000 });

  const resumed = await reloadAndResumeAttempt(page, 'PAUSED', 'hospital-sala-escucha');
  expect(resumed.activeAttempt.attemptId).toBe(attemptId);
  expect(resumed.resumedAttempt).toMatchObject({ attemptId, status: 'IN_PROGRESS' });
  expect(resumed.resumedAttempt?.clinicalState.papApplied).toBe(true);
  expect(resumed.world.player).toEqual(paused.positionWorld.player);
  expect(resumed.world.inventory).toContain('PAP');
  expect(resumed.world.usedToolKeys).toContain('PAP@familia-crisis');
  expect(resumed.world.inspectedObjectKeys).toContain('familia-crisis');
  expect(resumed.world.flags.viewedNpcKeys).toContain('enfermera-urgencias');

  // H2 — marco normativo hospitalario.
  await input.moveUntilNearby('ArrowRight', /bitácora/i);
  await input.moveBy('ArrowRight', 120);
  await input.moveUntilNearby('ArrowUp', /marco normativo/i);
  await interactNearby(page, /marco normativo/i, /\/interactions\/marco-normativo-hospital$/);
  decision = await chooseDecision(
    page,
    /marco normativo y técnico/i,
    /resolución 459 de 2012 \+ ley 1257 de 2008/i,
  );
  expect(decision.currentNode.key).toBe('hospital-accion-etica');
  await closeDialogue(page, /supervisión clínica/i);
  await waitForWorldReady(page);

  // H3 — protocolo EPICEE antes de la actuación integral.
  await input.moveUntilNearby('ArrowUp', /protocolo epicee/i);
  const spikes = await interactNearby(page, /protocolo epicee/i, /\/interactions\/tool-spikes$/);
  expect(spikes.world.inventory).toContain('SPIKES');
  await input.moveBy('ArrowDown', 50);
  await input.moveUntilNearby('ArrowRight', /psicóloga hospitalaria/i);
  await interactNearby(page, /psicóloga hospitalaria/i, /\/interactions\/psicologa-acompanante$/);
  decision = await chooseDecision(
    page,
    /psicóloga hospitalaria/i,
    /pap \+ escucha \+ epicee\/spikes \+ evaluación psicosocial familiar/i,
  );
  expect(decision.currentNode.key).toBe('hospital-cierre-bloque');
  await closeDialogue(page, /supervisión clínica/i);
  await waitForWorldReady(page);

  await input.moveUntilNearby('ArrowRight', /salida institucional/i);
  await enterDoor(page, /salida institucional/i, 'comisaria-recepcion');

  // Recepción — expediente antes del consultorio.
  await input.moveUntilNearby('ArrowRight', /consultorio/i);
  await input.moveBy('ArrowLeft', 60);
  await input.moveUntilNearby('ArrowUp', /expediente del caso/i);
  await interactNearby(page, /expediente del caso/i, /\/interactions\/expediente-caso$/);
  await closeDialogue(page, /expediente del caso/i);
  await input.moveBy('ArrowDown', 68);
  await input.moveUntilNearby('ArrowRight', /consultorio/i);
  await enterDoor(page, /consultorio/i, 'comisaria-consultorio');

  // C1 — valoración de riesgo y protección.
  await input.moveUntilNearby('ArrowRight', /valoración de riesgo/i);
  const riskTool = await interactNearby(page, /valoración de riesgo/i, /\/interactions\/tool-riesgo$/);
  expect(riskTool.world.inventory).toContain('RISK_METER');
  await input.moveUntilNearby('ArrowLeft', /sobreviviente/i);
  await interactNearby(page, /sobreviviente/i, /\/interactions\/sobreviviente-consulta$/);
  const structuredRiskUse = await useToolChoice(
    page,
    /sobreviviente \(22 años\)/i,
    /aplicar valoración estructurada de riesgo de feminicidio/i,
  );
  expect(structuredRiskUse.pertinent).toBe(true);
  expect(structuredRiskUse.world.usedToolKeys)
    .toContain('RISK_METER@sobreviviente-consulta');
  await closeDialogue(page, /herramienta pertinente/i);
  await interactNearby(page, /sobreviviente/i, /\/interactions\/sobreviviente-consulta$/);
  decision = await chooseDecision(
    page,
    /sobreviviente \(22 años\)/i,
    /valorar riesgo de feminicidio \+ medidas de protección \+ derechos/i,
  );
  expect(decision.currentNode.key).toBe('comisaria-consultorio');
  await closeDialogue(page, /supervisión clínica/i);
  await waitForWorldReady(page);

  // C2 — marco integral de Comisaría.
  await input.moveUntilNearby('ArrowRight', /ruta de protección/i);
  // Ruta en x=610 → se para en x≈536-551; +210 deja al jugador a 29-44 px del
  // marco (x=790). Con +180 quedaba en el borde de su radio de 74 px.
  await input.moveBy('ArrowRight', 210);
  await input.moveUntilNearby('ArrowUp', /marco normativo/i);
  await interactNearby(page, /marco normativo/i, /\/interactions\/marco-normativo-comisaria$/);
  decision = await chooseDecision(
    page,
    /marco normativo y técnico/i,
    /ley 2126 de 2021 \+ ley 1098 de 2006 \+ ley 1257 de 2008/i,
  );
  expect(decision.currentNode.key).toBe('comisaria-accion-final');
  await closeDialogue(page, /supervisión clínica/i);
  await waitForWorldReady(page);

  // C3 — cierre técnico y reporte integral. Tras C2 el jugador reaparece en
  // ~(670, 430), con la Ruta de protección (610, 436) aún en rango: si el
  // profesional (NPC que se mueve) se aleja justo antes del clic, la barra
  // contextual salta a la ruta. Apartarse a la derecha la deja fuera de rango.
  await input.moveBy('ArrowRight', 40);
  await input.moveUntilNearby('ArrowRight', /profesional psicosocial/i);
  await interactNearby(page, /profesional psicosocial/i, /\/interactions\/profesional-psicosocial$/);
  decision = await chooseDecision(
    page,
    /profesional psicosocial/i,
    /lo anterior \+ nivel de vulneración de derechos \+ valoración de feminicidio \+ rutas/i,
  );

  expect(decision.status).toBe('COMPLETED');
  expect(decision.currentNode.key).toBe('cierre-caso');
  expect(decision.completionReport.ending.key).toBe('integral');
  expect(decision.completionReport.ending.severityCounts).toMatchObject({
    recommended: 6,
    critical: 0,
  });
  expect(decision.completionReport.metrics.institutionalRouteActivated).toBe(true);

  const outcome = page.getByRole('alertdialog', { name: /intento finalizado/i });
  await expect(outcome).toBeVisible({ timeout: 30_000 });
  await expect(outcome.getByText('Recomendadas: 6')).toBeVisible();
  await expect(outcome.getByText(/métricas del caso/i)).toBeVisible();
  const scoreMetric = outcome.locator('.oc-metric').filter({ hasText: /puntaje total/i });
  await expect(scoreMetric.getByText(String(decision.completionReport.finalScore), { exact: true })).toBeVisible();
  await expect(outcome.getByText(/ruta institucional: activada/i)).toBeVisible();
  await expect(outcome.getByRole('button', { name: /reintentar caso/i })).toBeVisible();
  await expect(outcome.getByRole('link', { name: /volver al simulador/i })).toBeVisible();
  await assertQualityState(page, testInfo, `${viewport.name}-full-case-outcome`);
}

for (const viewport of REQUIRED_VIEWPORTS) {
  test.describe(`full-case-${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.inputMode === 'touch',
    });

    test(`@full-case completes all six recommended decisions (${viewport.name})`, async ({ page }, testInfo) =>
      completeFullCase(page, testInfo, viewport));
  });
}
