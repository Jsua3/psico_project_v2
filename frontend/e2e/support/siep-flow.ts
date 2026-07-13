import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const EMAIL = process.env.E2E_STUDENT_EMAIL ?? 'estudiante@psychosim.edu.co';
const PASSWORD = process.env.E2E_STUDENT_PASSWORD ?? 'Estudiante123!';

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
