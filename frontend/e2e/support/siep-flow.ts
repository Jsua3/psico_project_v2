import { expect } from '@playwright/test';
import type { Locator, Page, Response } from '@playwright/test';

const EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co';
const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!';

export type MovementKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
type ApiData = Record<string, any>;

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

export async function moveUntilNearby(
  page: Page,
  key: MovementKey,
  label: RegExp,
  timeout = 20_000,
): Promise<Locator> {
  const action = nearbyAction(page, label);
  if (await action.isVisible().catch(() => false)) return action;

  await page.keyboard.down(key);
  try {
    await expect(action, `No se alcanzó la interacción ${label} moviendo ${key}`)
      .toBeVisible({ timeout });
  } finally {
    await page.keyboard.up(key);
  }
  return action;
}

export async function moveFor(page: Page, key: MovementKey, durationMs: number): Promise<void> {
  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(durationMs);
  } finally {
    await page.keyboard.up(key);
  }
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
  expect(response.ok(), `Falló ${response.request().method()} ${response.url()}: ${await response.text()}`).toBe(true);
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
  expect(response.ok(), `Falló la puerta ${label}: ${await response.text()}`).toBe(true);
  const data = (await response.json()).data as ApiData;
  expect(data.map?.key).toBe(expectedMapKey);
  await waitForWorldReady(page, expectedMapKey);
  return data;
}

export async function seekNpcDialogue(page: Page, npcName: RegExp): Promise<ApiData> {
  const dialogue = page.getByRole('dialog', { name: npcName });
  let npcResponse: Response | null = null;
  const capture = (response: Response) => {
    if (response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/npcs\/[^/]+$/.test(new URL(response.url()).pathname)) {
      npcResponse = response;
    }
  };
  page.on('response', capture);
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await page.keyboard.press('e');
      await page.waitForTimeout(300);
      if (npcResponse !== null) {
        const response = npcResponse as Response;
        expect(response.ok(), `Falló la interacción NPC: ${await response.text()}`).toBe(true);
        await expect(dialogue).toBeVisible({ timeout: 10_000 });
        return (await response.json()).data as ApiData;
      }
    }
    throw new Error(`No se alcanzó el NPC ${npcName} tras 40 intentos de interacción`);
  } finally {
    page.off('response', capture);
  }
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
  expect(response.ok(), `Falló la decisión ${optionText}: ${await response.text()}`).toBe(true);
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
