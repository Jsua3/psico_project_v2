import { expect } from '@playwright/test';
import type { Locator, Page, Response } from '@playwright/test';
import type { SiepInputMode } from './required-viewports';

const EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co';
const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!';

export type MovementKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
type ApiData = Record<string, any>;

async function requireOk(response: Response, context: string): Promise<void> {
  if (response.ok()) return;
  const body = await response.text().catch(() => '<cuerpo no disponible>');
  throw new Error(`${context}: HTTP ${response.status()} ${response.url()} — ${body}`);
}

export async function loginStudent(page: Page): Promise<void> {
  if (!/\/login$/.test(new URL(page.url()).pathname)) await page.goto('/login');
  await page.locator('input[type="email"]').last().fill(EMAIL);
  await page.locator('input[type="password"]').last().fill(PASSWORD);
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await page.waitForURL(/\/portal\//, { timeout: 30_000 });
}

export async function enterCaseAtContentWarning(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /entrar al caso/i }).click();
  await page.waitForURL(/\/portal\/simulador\/\d+/, { timeout: 30_000 });
  const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
  const resume = page.getByRole('button', {
    name: /continuar intento en progreso|reanudar intento en pausa/i,
  });
  await expect(consent.or(resume).first()).toBeVisible({ timeout: 30_000 });
  if (await resume.isVisible().catch(() => false)) await resume.click();
  await expect(consent).toBeVisible({ timeout: 30_000 });
  return consent;
}

export async function acceptContentWarning(page: Page, consent: Locator): Promise<Locator> {
  await consent.getByRole('button', { name: /^continuar$/i }).click();
  const introVideo = page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' });
  await expect(introVideo).toBeVisible({ timeout: 30_000 });
  return introVideo;
}

export async function finishCaseIntroduction(page: Page, introVideo: Locator): Promise<Locator> {
  await introVideo.getByRole('button', { name: /saltar video|continuar/i }).click();
  const caseIntro = page.getByRole('dialog').filter({ hasText: 'Contexto inicial del caso' });
  await expect(caseIntro).toBeVisible({ timeout: 30_000 });
  return caseIntro;
}

export async function waitForWorldReady(page: Page, expectedMapKey?: string): Promise<void> {
  const host = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
  await expect(host).toBeVisible({ timeout: 45_000 });
  if (expectedMapKey) {
    await expect(host).toHaveAttribute('data-rendered-map-key', expectedMapKey, { timeout: 45_000 });
    await expect(host).toHaveAttribute('data-rendered-scenario-key', expectedMapKey, { timeout: 45_000 });
  }
}

function nearbyAction(page: Page, label: RegExp): Locator {
  const primaryLabel = page.locator('strong').filter({ hasText: label });
  return page.locator('button.context-bar__interaction').filter({ has: primaryLabel });
}

export interface WorldInputDriver {
  readonly mode: SiepInputMode;
  moveUntilNearby(key: MovementKey, label: RegExp, timeout?: number): Promise<Locator>;
  moveFor(key: MovementKey, durationMs: number): Promise<void>;
  interact(): Promise<void>;
}

const TOUCH_NUDGE_EQUIVALENT_MS = 4 * 34;
const KEYBOARD_NUDGE_MS = 3 * 34;
const TOUCH_DIRECTION_LABEL: Record<MovementKey, RegExp> = {
  ArrowUp: /mover arriba/i,
  ArrowDown: /mover abajo/i,
  ArrowLeft: /mover izquierda/i,
  ArrowRight: /mover derecha/i,
};

export function createWorldInputDriver(page: Page, mode: SiepInputMode): WorldInputDriver {
  const touchControl = (key: MovementKey) =>
    page.getByRole('button', { name: TOUCH_DIRECTION_LABEL[key] });

  const moveFor = async (key: MovementKey, durationMs: number): Promise<void> => {
    if (mode === 'keyboard') {
      await page.keyboard.down(key);
      try {
        await page.waitForTimeout(durationMs);
      } finally {
        await page.keyboard.up(key);
      }
      return;
    }

    const control = touchControl(key);
    await expect(control).toBeVisible();
    const taps = Math.max(1, Math.round(durationMs / TOUCH_NUDGE_EQUIVALENT_MS));
    for (let step = 0; step < taps; step += 1) await control.tap();
  };

  const moveUntilNearby = async (
    key: MovementKey,
    label: RegExp,
    timeout = 20_000,
  ): Promise<Locator> => {
    const action = nearbyAction(page, label);
    if (await action.isVisible().catch(() => false)) return action;

    if (mode === 'keyboard') {
      // Comprueba proximidad solo con la tecla liberada. Si se mantiene pulsada
      // mientras Playwright resuelve el locator, el personaje puede sobrepasar
      // un marcador y el botón contextual cambiar de objetivo antes del clic.
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline && !(await action.isVisible().catch(() => false))) {
        await page.keyboard.down(key);
        try {
          await page.waitForTimeout(KEYBOARD_NUDGE_MS);
        } finally {
          await page.keyboard.up(key);
        }
      }
      await expect(action, `No se alcanzó la interacción ${label} moviendo ${key}`)
        .toBeVisible({ timeout: 1_000 });
      return action;
    }

    const control = touchControl(key);
    await expect(control).toBeVisible();
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline && !(await action.isVisible().catch(() => false))) {
      await control.tap();
    }
    await expect(action, `No se alcanzó la interacción ${label} con el control ${key}`)
      .toBeVisible({ timeout: 1_000 });
    return action;
  };

  return {
    mode,
    moveFor,
    moveUntilNearby,
    interact: async () => {
      if (mode === 'keyboard') {
        await page.keyboard.press('e');
        return;
      }
      const control = page.locator('app-game-world .touch-interact');
      await expect(control).toBeVisible();
      await control.tap();
    },
  };
}

export async function moveAndPersistPosition(
  page: Page,
  input: WorldInputDriver,
  key: MovementKey,
  durationMs: number,
): Promise<ApiData> {
  const responsePromise = page.waitForResponse(response =>
    response.request().method() === 'PATCH'
      && /\/api\/simulation\/attempts\/[^/]+\/world-state$/.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
  await input.moveFor(key, durationMs);
  const response = await responsePromise;
  await requireOk(response, 'Falló la persistencia de posición');
  return (await response.json()).data as ApiData;
}

export async function pauseWithPendingPosition(
  page: Page,
  input: WorldInputDriver,
  key: MovementKey,
  durationMs: number,
): Promise<{ positionWorld: ApiData; pausedAttempt: ApiData }> {
  const requestOrder: string[] = [];
  const captureOrder = (request: { method(): string; url(): string }) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'PATCH' && /\/world-state$/.test(path)) requestOrder.push('position');
    if (request.method() === 'POST' && /\/safe-exit$/.test(path)) requestOrder.push('pause');
  };
  page.on('request', captureOrder);
  const positionPromise = page.waitForResponse(response =>
    response.request().method() === 'PATCH'
      && /\/api\/simulation\/attempts\/[^/]+\/world-state$/.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
  const pausePromise = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/safe-exit$/.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
  try {
    await input.moveFor(key, durationMs);
    await page.getByRole('button', { name: /salida segura/i }).click();
    const positionResponse = await positionPromise;
    const pauseResponse = await pausePromise;
    await requireOk(positionResponse, 'Falló el flush previo a pausa');
    await requireOk(pauseResponse, 'Falló la pausa segura');
    expect(requestOrder).toEqual(['position', 'pause']);
    return {
      positionWorld: (await positionResponse.json()).data as ApiData,
      pausedAttempt: (await pauseResponse.json()).data as ApiData,
    };
  } finally {
    page.off('request', captureOrder);
  }
}

export async function reloadAndResumeAttempt(
  page: Page,
  expectedStatus: 'IN_PROGRESS' | 'PAUSED',
  expectedMapKey: string,
): Promise<{ activeAttempt: ApiData; resumedAttempt: ApiData | null; world: ApiData }> {
  const activePromise = page.waitForResponse(response =>
    response.request().method() === 'GET'
      && /\/api\/simulation\/cases\/\d+\/active-attempt$/.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
  await page.reload();
  const activeResponse = await activePromise;
  await requireOk(activeResponse, 'Falló active-attempt tras recarga');
  const activeAttempt = (await activeResponse.json()).data as ApiData;
  expect(activeAttempt.status).toBe(expectedStatus);

  const buttonName = expectedStatus === 'PAUSED'
    ? /reanudar intento en pausa/i
    : /continuar intento en progreso/i;
  const resumeButton = page.getByRole('button', { name: buttonName });
  await expect(resumeButton).toBeVisible({ timeout: 30_000 });

  let resumePromise: Promise<Response> | null = null;
  if (expectedStatus === 'PAUSED') {
    resumePromise = page.waitForResponse(response =>
      response.request().method() === 'POST'
        && /\/api\/simulation\/attempts\/[^/]+\/resume$/.test(new URL(response.url()).pathname),
      { timeout: 30_000 },
    );
  }
  // Se instala después de completar la navegación para no capturar el GET
  // que la pantalla anterior pudo iniciar y que reload cancela sin body.
  const worldPromise = page.waitForResponse(response =>
    response.request().method() === 'GET'
      && /\/api\/simulation\/attempts\/[^/]+\/world$/.test(new URL(response.url()).pathname),
    { timeout: 45_000 },
  );
  await resumeButton.click();

  let resumedAttempt: ApiData | null = null;
  if (resumePromise) {
    const resumeResponse = await resumePromise;
    await requireOk(resumeResponse, 'Falló resume tras recarga');
    resumedAttempt = (await resumeResponse.json()).data as ApiData;
  }

  const worldResponse = await worldPromise;
  await requireOk(worldResponse, 'Falló world tras reanudar');
  const world = (await worldResponse.json()).data as ApiData;
  await waitForWorldReady(page, expectedMapKey);
  return { activeAttempt, resumedAttempt, world };
}

export async function interactNearby(
  page: Page,
  label: RegExp,
  responseUrl: RegExp,
): Promise<ApiData> {
  const action = nearbyAction(page, label);
  await expect(action, `Interacción visible requerida: ${label}`).toBeVisible();
  const responsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST' && responseUrl.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
  await action.click();
  const response = await responsePromise;
  await requireOk(response, `Falló la interacción ${label}`);
  return (await response.json()).data as ApiData;
}

export async function enterDoor(
  page: Page,
  label: RegExp,
  expectedMapKey: string,
): Promise<ApiData> {
  const action = nearbyAction(page, label);
  await expect(action, `Puerta visible requerida: ${label}`).toBeVisible();
  const responsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/enter-room$/.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
  await action.click();
  const response = await responsePromise;
  await requireOk(response, `Falló la puerta ${label}`);
  const data = (await response.json()).data as ApiData;
  expect(data.map?.key).toBe(expectedMapKey);
  await waitForWorldReady(page, expectedMapKey);
  return data;
}

export async function seekNpcDialogue(
  page: Page,
  npcName: RegExp,
  input: WorldInputDriver,
): Promise<ApiData> {
  const dialogue = page.getByRole('dialog', { name: npcName });
  const isNpcRequest = (method: string, url: string) =>
    method === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/npcs\/[^/]+$/.test(new URL(url).pathname);
  const requestPromise = page.waitForRequest(request =>
    isNpcRequest(request.method(), request.url()),
    { timeout: 30_000 },
  );
  const responsePromise = page.waitForResponse(response =>
    isNpcRequest(response.request().method(), response.url()),
    { timeout: 30_000 },
  );

  const finishNpcInteraction = async (): Promise<ApiData> => {
    const response = await responsePromise;
    await requireOk(response, 'Falló la interacción NPC');
    await expect(dialogue).toBeVisible({ timeout: 10_000 });
    return (await response.json()).data as ApiData;
  };

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await dialogue.isVisible().catch(() => false)) {
      return finishNpcInteraction();
    }

    await input.interact();
    const observed = await Promise.race([
      responsePromise.then(() => 'response' as const),
      requestPromise.then(() => 'request' as const),
      page.waitForTimeout(500).then(() => 'none' as const),
    ]);
    if (observed !== 'none') return finishNpcInteraction();
  }

  throw new Error(`No se alcanzó el NPC ${npcName} tras 40 intentos de interacción`);
}

async function visible(locator: Locator): Promise<boolean> {
  return locator.isVisible().catch(() => false);
}

async function clickCurrentDialogueAction(dialogue: Locator): Promise<boolean> {
  const action = dialogue.locator('button.close-btn:visible');
  if (!(await visible(action))) return false;
  return action.click({ timeout: 1_000 }).then(() => true).catch(() => false);
}

export async function advanceDialogueToChoices(page: Page, dialogueName: RegExp): Promise<Locator> {
  const dialogue = page.getByRole('dialog', { name: dialogueName });
  await expect(dialogue).toBeVisible({ timeout: 30_000 });
  const choices = dialogue.getByRole('group', { name: /opciones de intervención/i });

  for (let step = 0; step < 20; step += 1) {
    if (await visible(choices)) return dialogue;
    if (await clickCurrentDialogueAction(dialogue)) continue;
    await page.waitForTimeout(50);
  }

  throw new Error(`El diálogo ${dialogueName} no expuso sus opciones`);
}

export async function closeDialogue(page: Page, dialogueName: RegExp): Promise<void> {
  const dialogue = page.getByRole('dialog', { name: dialogueName });
  await expect(dialogue).toBeVisible({ timeout: 30_000 });

  for (let step = 0; step < 20; step += 1) {
    if (await clickCurrentDialogueAction(dialogue)) {
      if (await dialogue.isHidden().catch(() => false)) {
        return;
      }
      const close = dialogue.getByRole('button', { name: /cerrar diálogo/i });
      if (!(await visible(close))) continue;
    }
    if (await dialogue.isHidden().catch(() => false)) {
      await expect(dialogue).toBeHidden({ timeout: 10_000 });
      return;
    }
    await page.waitForTimeout(50);
  }

  throw new Error(`El diálogo ${dialogueName} no llegó a su cierre`);
}

export async function chooseDecision(
  page: Page,
  dialogueName: RegExp,
  optionText: RegExp,
): Promise<ApiData> {
  const dialogue = await advanceDialogueToChoices(page, dialogueName);
  const option = dialogue.getByRole('button', { name: optionText });
  await expect(option).toBeVisible();
  await expect(option).not.toHaveAccessibleName(/información incompleta/i);

  const responsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/decisions$/.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
  await option.click();
  const response = await responsePromise;
  await requireOk(response, `Falló la decisión ${optionText}`);
  return (await response.json()).data as ApiData;
}

export async function useToolChoice(
  page: Page,
  dialogueName: RegExp,
  optionText: RegExp,
): Promise<ApiData> {
  const dialogue = await advanceDialogueToChoices(page, dialogueName);
  const option = dialogue.getByRole('button', { name: optionText });
  await expect(option).toBeVisible();

  const responsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/tools\/use$/.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
  await option.click();
  const response = await responsePromise;
  await requireOk(response, `Falló la aplicación ${optionText}`);
  return (await response.json()).data as ApiData;
}

export async function openFamilyDialogue(page: Page, touch: boolean): Promise<Locator> {
  const familyAction = page.getByRole('button', { name: /interactuar:.*familia en crisis/i });
  if (touch) {
    const moveRight = page.getByRole('button', { name: /mover derecha/i });
    const moveLeft = page.getByRole('button', { name: /mover izquierda/i });
    await expect(moveRight).toBeVisible();
    await expect(moveLeft).toBeVisible();
    await moveRight.tap();
    await moveLeft.tap();
    for (let step = 0; step < 20 && !(await familyAction.isVisible()); step += 1) {
      await moveLeft.tap();
    }
  } else {
    if (await familyAction.isVisible()) {
      await page.keyboard.down('ArrowRight');
      try {
        await expect(familyAction).toBeHidden({ timeout: 15_000 });
      } finally {
        await page.keyboard.up('ArrowRight');
      }
    }
    await page.keyboard.down('ArrowLeft');
    try {
      await expect(familyAction).toBeVisible({ timeout: 30_000 });
    } finally {
      await page.keyboard.up('ArrowLeft');
    }
  }

  await expect(familyAction).toBeVisible({ timeout: 30_000 });
  const interactionResponse = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/interactions\/familia-crisis$/.test(response.url()),
    { timeout: 30_000 },
  );
  if (touch) await familyAction.tap();
  else await familyAction.click();
  expect((await interactionResponse).ok()).toBe(true);

  const dialogue = page.getByRole('dialog', { name: /diálogo con abuela de la niña/i });
  await expect(dialogue).toBeVisible({ timeout: 30_000 });
  return dialogue;
}
