import { expect, test } from '@playwright/test';

import {
  acceptContentWarning,
  chooseDecision,
  closeDialogue,
  enterCaseAtContentWarning,
  enterDoor,
  finishCaseIntroduction,
  interactNearby,
  loginStudent,
  moveAndPersistPosition,
  moveFor,
  moveUntilNearby,
  pauseWithPendingPosition,
  reloadAndResumeAttempt,
  seekNpcDialogue,
  useToolChoice,
  waitForWorldReady,
} from './support/siep-flow';

test('@full-case completes all six recommended decisions through the rendered world', async ({ page }) => {
  test.setTimeout(240_000);

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
  await moveUntilNearby(page, 'ArrowLeft', /kit pap/i);
  const pap = await interactNearby(page, /kit pap/i, /\/interactions\/tool-pap$/);
  expect(pap.world.inventory).toContain('PAP');

  await moveUntilNearby(page, 'ArrowLeft', /familia en crisis/i);
  await interactNearby(page, /familia en crisis/i, /\/interactions\/familia-crisis$/);
  const papUse = await useToolChoice(
    page,
    /abuela de la niña/i,
    /aplicar pap a la familia en crisis/i,
  );
  expect(papUse.pertinent).toBe(true);
  expect(papUse.world.usedToolKeys).toContain('PAP@familia-crisis');
  await closeDialogue(page, /herramienta pertinente/i);

  await moveUntilNearby(page, 'ArrowRight', /sala de escucha familiar/i);
  await moveFor(page, 'ArrowLeft', 1_350);
  await moveFor(page, 'ArrowUp', 330);
  await seekNpcDialogue(page, /enfermera de urgencias/i);
  await closeDialogue(page, /enfermera de urgencias/i);

  // Rodear la camilla por el pasillo frontal antes de buscar la puerta.
  await moveFor(page, 'ArrowDown', 550);
  await moveUntilNearby(page, 'ArrowRight', /sala de escucha familiar/i);
  const escuchaEntry = await enterDoor(page, /sala de escucha familiar/i, 'hospital-sala-escucha');
  expect(escuchaEntry.player).toMatchObject({ x: 160, y: 452 });

  // H1 — contención con PAP.
  await moveUntilNearby(page, 'ArrowUp', /familia en crisis/i);
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
  const beforeRefresh = await moveAndPersistPosition(page, 'ArrowRight', 240);
  const refreshed = await reloadAndResumeAttempt(page, 'IN_PROGRESS', 'hospital-sala-escucha');
  expect(refreshed.activeAttempt.attemptId).toBe(attemptId);
  expect(refreshed.activeAttempt.currentNode.key).toBe('hospital-sala-escucha');
  expect(refreshed.activeAttempt.clinicalState.papApplied).toBe(true);
  expect(refreshed.world.player).toEqual(beforeRefresh.player);
  expect(refreshed.world.inventory).toContain('PAP');
  expect(refreshed.world.usedToolKeys).toContain('PAP@familia-crisis');
  expect(refreshed.world.inspectedObjectKeys).toContain('familia-crisis');
  expect(refreshed.world.flags.viewedNpcKeys).toContain('enfermera-urgencias');

  const paused = await pauseWithPendingPosition(page, 'ArrowRight', 180);
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
  await moveUntilNearby(page, 'ArrowRight', /bitácora/i);
  await moveFor(page, 'ArrowRight', 800);
  await moveUntilNearby(page, 'ArrowUp', /marco normativo/i);
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
  await moveUntilNearby(page, 'ArrowUp', /protocolo epicee/i);
  const spikes = await interactNearby(page, /protocolo epicee/i, /\/interactions\/tool-spikes$/);
  expect(spikes.world.inventory).toContain('SPIKES');
  await moveFor(page, 'ArrowDown', 330);
  await moveUntilNearby(page, 'ArrowRight', /psicóloga hospitalaria/i);
  await interactNearby(page, /psicóloga hospitalaria/i, /\/interactions\/psicologa-acompanante$/);
  decision = await chooseDecision(
    page,
    /psicóloga hospitalaria/i,
    /pap \+ escucha \+ epicee\/spikes \+ evaluación psicosocial familiar/i,
  );
  expect(decision.currentNode.key).toBe('hospital-cierre-bloque');
  await closeDialogue(page, /supervisión clínica/i);
  await waitForWorldReady(page);

  await moveUntilNearby(page, 'ArrowRight', /salida institucional/i);
  await enterDoor(page, /salida institucional/i, 'comisaria-recepcion');

  // Recepción — expediente antes del consultorio.
  await moveUntilNearby(page, 'ArrowRight', /consultorio/i);
  await moveFor(page, 'ArrowLeft', 400);
  await moveUntilNearby(page, 'ArrowUp', /expediente del caso/i);
  await interactNearby(page, /expediente del caso/i, /\/interactions\/expediente-caso$/);
  await closeDialogue(page, /expediente del caso/i);
  await moveFor(page, 'ArrowDown', 450);
  await moveUntilNearby(page, 'ArrowRight', /consultorio/i);
  await enterDoor(page, /consultorio/i, 'comisaria-consultorio');

  // C1 — valoración de riesgo y protección.
  await moveUntilNearby(page, 'ArrowRight', /valoración de riesgo/i);
  const riskTool = await interactNearby(page, /valoración de riesgo/i, /\/interactions\/tool-riesgo$/);
  expect(riskTool.world.inventory).toContain('RISK_METER');
  await moveUntilNearby(page, 'ArrowLeft', /sobreviviente/i);
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
  await moveUntilNearby(page, 'ArrowRight', /ruta de protección/i);
  await moveFor(page, 'ArrowRight', 1_200);
  await moveUntilNearby(page, 'ArrowUp', /marco normativo/i);
  await interactNearby(page, /marco normativo/i, /\/interactions\/marco-normativo-comisaria$/);
  decision = await chooseDecision(
    page,
    /marco normativo y técnico/i,
    /ley 2126 de 2021 \+ ley 1098 de 2006 \+ ley 1257 de 2008/i,
  );
  expect(decision.currentNode.key).toBe('comisaria-accion-final');
  await closeDialogue(page, /supervisión clínica/i);
  await waitForWorldReady(page);

  // C3 — cierre técnico y reporte integral.
  await moveUntilNearby(page, 'ArrowRight', /profesional psicosocial/i);
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
});
