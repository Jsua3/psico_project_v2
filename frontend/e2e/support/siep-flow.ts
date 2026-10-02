import { expect } from '@playwright/test';
import type { Locator, Page, Response } from '@playwright/test';
import type { SiepInputMode } from './required-viewports';
import { scaled } from './time-scale';

// Plazos: toda espera se escribe en ms de una máquina de desarrollo y pasa
// por scaled() (E2E_TIME_SCALE). Las duraciones físicas del juego (pulsaciones,
// velocidad, tolerancias) NO se escalan: 102 ms de tecla son ~15 px en
// cualquier equipo; lo que cambia en el CI lento es cuánto hay que esperar.

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
  await page.waitForURL(/\/portal\//, { timeout: scaled(30_000) });
}

export async function enterCaseAtContentWarning(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /entrar al caso/i }).click();
  await page.waitForURL(/\/portal\/simulador\/\d+/, { timeout: scaled(30_000) });
  const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
  // Recorrido aislado: un intento activo que dejó otra prueba se descarta en
  // vez de heredar su sala y posición (un fallo previo no arrastra a este).
  const startFresh = page.getByRole('button', { name: /iniciar nuevo intento/i });
  await expect(consent.or(startFresh).first()).toBeVisible({ timeout: scaled(30_000) });
  if (await startFresh.isVisible().catch(() => false)) await startFresh.click();
  await expect(consent).toBeVisible({ timeout: scaled(30_000) });
  return consent;
}

export async function acceptContentWarning(page: Page, consent: Locator): Promise<Locator> {
  await consent.getByRole('button', { name: /^continuar$/i }).click();
  const introVideo = page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' });
  await expect(introVideo).toBeVisible({ timeout: scaled(30_000) });
  return introVideo;
}

export async function finishCaseIntroduction(page: Page, introVideo: Locator): Promise<Locator> {
  await introVideo.getByRole('button', { name: /saltar video|continuar/i }).click();
  const caseIntro = page.getByRole('dialog').filter({ hasText: 'Contexto inicial del caso' });
  await expect(caseIntro).toBeVisible({ timeout: scaled(30_000) });
  return caseIntro;
}

export async function waitForWorldReady(page: Page, expectedMapKey?: string): Promise<void> {
  const host = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
  await expect(host).toBeVisible({ timeout: scaled(45_000) });
  if (expectedMapKey) {
    await expect(host).toHaveAttribute('data-rendered-map-key', expectedMapKey, { timeout: scaled(45_000) });
    await expect(host).toHaveAttribute('data-rendered-scenario-key', expectedMapKey, { timeout: scaled(45_000) });
  }
}

/** Pies del jugador según data-player-x/y del host de Phaser (contrato del mundo). */
export async function readPlayerPosition(page: Page): Promise<{ x: number; y: number }> {
  const host = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
  const read = () => host.evaluate(el => [
    el.getAttribute('data-player-x'),
    el.getAttribute('data-player-y'),
  ]);
  let [x, y] = await read();
  if (x === null || y === null) {
    await expect(host).toHaveAttribute('data-player-x', /^-?\d+$/, { timeout: scaled(30_000) });
    [x, y] = await read();
  }
  return { x: Number(x), y: Number(y) };
}

function nearbyAction(page: Page, label: RegExp): Locator {
  const primaryLabel = page.locator('strong').filter({ hasText: label });
  return page.locator('button.context-bar__interaction').filter({ has: primaryLabel });
}

export interface WorldInputDriver {
  readonly mode: SiepInputMode;
  /** timeout: plazo base en ms (se escala con E2E_TIME_SCALE). */
  moveUntilNearby(key: MovementKey, label: RegExp, timeout?: number): Promise<Locator>;
  /**
   * Desplaza al jugador ~distancePx en la dirección de key, en lazo cerrado
   * sobre su posición real (data-player-x/y): no depende de los fps del
   * equipo ni de cuánto dura una pulsación. Si un obstáculo lo frena, se
   * detiene ahí, igual que caminar contra una pared.
   */
  moveBy(key: MovementKey, distancePx: number): Promise<void>;
  /** Un solo empujón corto (tecla ~180 ms o un toque), sin esperar a nada más. */
  nudge(key: MovementKey): Promise<void>;
  interact(): Promise<void>;
}

const KEYBOARD_NUDGE_MS = 3 * 34;
const SINGLE_NUDGE_MS = 180;
/** Velocidad de caminata del juego (PLAYER_SPEED, px/s): solo dimensiona pulsaciones. */
const PLAYER_SPEED_PX_S = 150;
const MOVE_TOLERANCE_PX = 4;
/** Un toque táctil avanza ~20 px (4 sub-pasos): se para a medio toque del objetivo. */
const MOVE_TOUCH_TOLERANCE_PX = 10;
const MOVE_MIN_HOLD_MS = 40;
const MOVE_MAX_HOLD_MS = 250;
/** Pulsaciones máximas (ya a MOVE_MAX_HOLD_MS) sin avance antes de darse por bloqueado. */
const MOVE_STALL_LIMIT = 3;
const TOUCH_DIRECTION_LABEL: Record<MovementKey, RegExp> = {
  ArrowUp: /mover arriba/i,
  ArrowDown: /mover abajo/i,
  ArrowLeft: /mover izquierda/i,
  ArrowRight: /mover derecha/i,
};

export function createWorldInputDriver(page: Page, mode: SiepInputMode): WorldInputDriver {
  const touchControl = (key: MovementKey) =>
    page.getByRole('button', { name: TOUCH_DIRECTION_LABEL[key] });
  // force: el control ya se comprobó visible; sin force cada toque espera dos
  // frames de "estabilidad", carísimo con el WebGL por software del CI.
  const tap = (control: Locator) => control.tap({ force: true });

  const axisOf = (key: MovementKey) =>
    (key === 'ArrowLeft' || key === 'ArrowRight' ? 'x' : 'y') as 'x' | 'y';
  const signOf = (key: MovementKey) => (key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1);

  const moveBy = async (key: MovementKey, distancePx: number): Promise<void> => {
    const axis = axisOf(key);
    const sign = signOf(key);
    const start = (await readPlayerPosition(page))[axis];
    const target = start + sign * distancePx;
    let current = start;
    let holdFloorMs = MOVE_MIN_HOLD_MS;
    let stalls = 0;
    const control = mode === 'touch' ? touchControl(key) : null;
    if (control) await expect(control).toBeVisible();
    const tolerance = control ? MOVE_TOUCH_TOLERANCE_PX : MOVE_TOLERANCE_PX;

    while ((target - current) * sign > tolerance) {
      if (control) {
        await tap(control);
      } else {
        // Pulsación proporcional a lo que falta; con fps bajos una pulsación
        // corta puede caer entera entre dos frames, así que el piso crece
        // mientras no haya avance.
        const remainingMs = (((target - current) * sign) / PLAYER_SPEED_PX_S) * 1000;
        const holdMs = Math.min(MOVE_MAX_HOLD_MS, Math.max(holdFloorMs, remainingMs * 0.75));
        await page.keyboard.down(key);
        try {
          await page.waitForTimeout(holdMs);
        } finally {
          await page.keyboard.up(key);
        }
      }
      const next = (await readPlayerPosition(page))[axis];
      if (next === current) {
        if (control || holdFloorMs >= MOVE_MAX_HOLD_MS) stalls += 1;
        holdFloorMs = Math.min(MOVE_MAX_HOLD_MS, holdFloorMs * 2);
        if (stalls >= MOVE_STALL_LIMIT) break;
      } else {
        stalls = 0;
      }
      current = next;
    }
  };

  const moveUntilNearby = async (
    key: MovementKey,
    label: RegExp,
    timeout = 20_000,
  ): Promise<Locator> => {
    const action = nearbyAction(page, label);
    if (await action.isVisible().catch(() => false)) return action;

    // Empujones cortos (~15 px, muy por debajo del radio de interacción de
    // 74 px) comprobando proximidad con la tecla liberada: si se mantiene
    // pulsada mientras Playwright resuelve el locator, el personaje puede
    // sobrepasar un marcador y el botón contextual cambiar de objetivo antes
    // del clic. Sin lecturas de posición por ciclo: cada ida y vuelta al
    // navegador es cara en el CI sin GPU.
    const control = mode === 'touch' ? touchControl(key) : null;
    if (control) await expect(control).toBeVisible();
    const deadline = Date.now() + scaled(timeout);
    while (Date.now() < deadline && !(await action.isVisible().catch(() => false))) {
      if (control) {
        await tap(control);
        continue;
      }
      await page.keyboard.down(key);
      try {
        await page.waitForTimeout(KEYBOARD_NUDGE_MS);
      } finally {
        await page.keyboard.up(key);
      }
    }
    if (!(await action.isVisible().catch(() => false))) {
      const at = await readPlayerPosition(page).catch(() => null);
      const where = at ? ` (jugador en x=${at.x}, y=${at.y})` : '';
      const how = mode === 'keyboard' ? `moviendo ${key}` : `con el control ${key}`;
      await expect(action, `No se alcanzó la interacción ${label} ${how}${where}`)
        .toBeVisible({ timeout: scaled(1_000) });
    }
    return action;
  };

  const nudge = async (key: MovementKey): Promise<void> => {
    if (mode === 'touch') {
      const control = touchControl(key);
      await expect(control).toBeVisible();
      await tap(control);
      return;
    }
    await page.keyboard.down(key);
    try {
      await page.waitForTimeout(SINGLE_NUDGE_MS);
    } finally {
      await page.keyboard.up(key);
    }
  };

  return {
    mode,
    moveBy,
    moveUntilNearby,
    nudge,
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

const isWorldStatePatch = (response: Response) =>
  response.request().method() === 'PATCH'
    && /\/api\/simulation\/attempts\/[^/]+\/world-state$/.test(new URL(response.url()).pathname);

/**
 * Camina y devuelve el guardado que persistió la posición FINAL. El debounce
 * de guardado (550 ms sin moverse) puede disparar guardados intermedios si
 * el recorrido se hace en varios pasos, así que el primer PATCH no basta.
 */
export async function moveAndPersistPosition(
  page: Page,
  input: WorldInputDriver,
  key: MovementKey,
  distancePx: number,
): Promise<ApiData> {
  const saves: Response[] = [];
  const collect = (response: Response) => {
    if (isWorldStatePatch(response)) saves.push(response);
  };
  page.on('response', collect);
  try {
    await input.moveBy(key, distancePx);
    const final = await readPlayerPosition(page);
    const deadline = Date.now() + scaled(30_000);
    while (Date.now() < deadline) {
      for (const response of saves) {
        await requireOk(response, 'Falló la persistencia de posición');
        const data = (await response.json()).data as ApiData;
        if (data?.player?.x === final.x && data?.player?.y === final.y) return data;
      }
      await page.waitForTimeout(100);
    }
    throw new Error(`No se persistió la posición final (${final.x}, ${final.y})`);
  } finally {
    page.off('response', collect);
  }
}

/**
 * Pausa con una posición recién movida y aún pendiente de guardar: la pausa
 * debe hacer flush de esa posición antes del safe-exit. Un solo empujón y
 * clic inmediato, para que el debounce no guarde antes por su cuenta.
 */
export async function pauseWithPendingPosition(
  page: Page,
  input: WorldInputDriver,
  key: MovementKey,
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
    { timeout: scaled(30_000) },
  );
  const pausePromise = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/safe-exit$/.test(new URL(response.url()).pathname),
    { timeout: scaled(30_000) },
  );
  try {
    await input.nudge(key);
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
    { timeout: scaled(30_000) },
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
  await expect(resumeButton).toBeVisible({ timeout: scaled(30_000) });

  let resumePromise: Promise<Response> | null = null;
  if (expectedStatus === 'PAUSED') {
    resumePromise = page.waitForResponse(response =>
      response.request().method() === 'POST'
        && /\/api\/simulation\/attempts\/[^/]+\/resume$/.test(new URL(response.url()).pathname),
      { timeout: scaled(30_000) },
    );
  }
  // Se instala después de completar la navegación para no capturar el GET
  // que la pantalla anterior pudo iniciar y que reload cancela sin body.
  const worldPromise = page.waitForResponse(response =>
    response.request().method() === 'GET'
      && /\/api\/simulation\/attempts\/[^/]+\/world$/.test(new URL(response.url()).pathname),
    { timeout: scaled(45_000) },
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
    { timeout: scaled(30_000) },
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
    { timeout: scaled(30_000) },
  );
  await action.click();
  const response = await responsePromise;
  await requireOk(response, `Falló la puerta ${label}`);
  const data = (await response.json()).data as ApiData;
  expect(data.map?.key).toBe(expectedMapKey);
  await waitForWorldReady(page, expectedMapKey);
  return data;
}

/** Plazo base para que un NPC que deambula quede a rango de interacción. */
const NPC_SEEK_BUDGET_MS = 20_000;
/** Ventana base tras cada interacción para ver salir la petición del NPC. */
const NPC_REQUEST_WINDOW_MS = 500;
/**
 * Plazo base para recorrer un diálogo hasta sus opciones o su cierre. Era un
 * tope de 20 pasos: en el CI sin GPU cada clic espera dos frames estables y
 * los 20 pasos se agotaban con el diálogo aún en su primera línea.
 */
const DIALOGUE_BUDGET_MS = 15_000;

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
    { timeout: scaled(30_000) },
  );
  const responsePromise = page.waitForResponse(response =>
    isNpcRequest(response.request().method(), response.url()),
    { timeout: scaled(30_000) },
  );

  const finishNpcInteraction = async (): Promise<ApiData> => {
    const response = await responsePromise;
    await requireOk(response, 'Falló la interacción NPC');
    await expect(dialogue).toBeVisible({ timeout: scaled(10_000) });
    return (await response.json()).data as ApiData;
  };

  // Por plazo y no por número de intentos: el NPC deambula en tiempo de
  // juego, y en el CI lento cada intento (tecla/toque + espera) cuesta más.
  const budgetMs = scaled(NPC_SEEK_BUDGET_MS);
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await dialogue.isVisible().catch(() => false)) {
      return finishNpcInteraction();
    }

    await input.interact();
    const observed = await Promise.race([
      responsePromise.then(() => 'response' as const),
      requestPromise.then(() => 'request' as const),
      page.waitForTimeout(scaled(NPC_REQUEST_WINDOW_MS)).then(() => 'none' as const),
    ]);
    if (observed !== 'none') return finishNpcInteraction();
  }

  throw new Error(`No se alcanzó el NPC ${npcName} en ${budgetMs / 1000} s de intentos de interacción`);
}

async function visible(locator: Locator): Promise<boolean> {
  return locator.isVisible().catch(() => false);
}

async function clickCurrentDialogueAction(dialogue: Locator): Promise<boolean> {
  const action = dialogue.locator('button.close-btn:visible');
  if (!(await visible(action))) return false;
  return action.click({ timeout: scaled(1_000) }).then(() => true).catch(() => false);
}

export async function advanceDialogueToChoices(page: Page, dialogueName: RegExp): Promise<Locator> {
  const dialogue = page.getByRole('dialog', { name: dialogueName });
  await expect(dialogue).toBeVisible({ timeout: scaled(30_000) });
  const choices = dialogue.getByRole('group', { name: /opciones de intervención/i });

  const budgetMs = scaled(DIALOGUE_BUDGET_MS);
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await visible(choices)) return dialogue;
    if (await clickCurrentDialogueAction(dialogue)) continue;
    await page.waitForTimeout(50);
  }

  throw new Error(`El diálogo ${dialogueName} no expuso sus opciones en ${budgetMs / 1000} s`);
}

export async function closeDialogue(page: Page, dialogueName: RegExp): Promise<void> {
  const dialogue = page.getByRole('dialog', { name: dialogueName });
  await expect(dialogue).toBeVisible({ timeout: scaled(30_000) });

  const budgetMs = scaled(DIALOGUE_BUDGET_MS);
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await clickCurrentDialogueAction(dialogue)) {
      if (await dialogue.isHidden().catch(() => false)) {
        return;
      }
      const close = dialogue.getByRole('button', { name: /cerrar diálogo/i });
      if (!(await visible(close))) continue;
    }
    if (await dialogue.isHidden().catch(() => false)) {
      await expect(dialogue).toBeHidden({ timeout: scaled(10_000) });
      return;
    }
    await page.waitForTimeout(50);
  }

  throw new Error(`El diálogo ${dialogueName} no llegó a su cierre en ${budgetMs / 1000} s`);
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
    { timeout: scaled(30_000) },
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
    { timeout: scaled(30_000) },
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
    // Tope de distancia, no de tiempo: cada toque avanza ~20 px con
    // cualquier fps, así que 20 toques son ~400 px también en el CI lento.
    for (let step = 0; step < 20 && !(await familyAction.isVisible()); step += 1) {
      await moveLeft.tap();
    }
  } else {
    if (await familyAction.isVisible()) {
      await page.keyboard.down('ArrowRight');
      try {
        await expect(familyAction).toBeHidden({ timeout: scaled(15_000) });
      } finally {
        await page.keyboard.up('ArrowRight');
      }
    }
    await page.keyboard.down('ArrowLeft');
    try {
      await expect(familyAction).toBeVisible({ timeout: scaled(30_000) });
    } finally {
      await page.keyboard.up('ArrowLeft');
    }
  }

  await expect(familyAction).toBeVisible({ timeout: scaled(30_000) });
  const interactionResponse = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/interactions\/familia-crisis$/.test(response.url()),
    { timeout: scaled(30_000) },
  );
  if (touch) await familyAction.tap();
  else await familyAction.click();
  expect((await interactionResponse).ok()).toBe(true);

  const dialogue = page.getByRole('dialog', { name: /diálogo con abuela de la niña/i });
  await expect(dialogue).toBeVisible({ timeout: scaled(30_000) });
  return dialogue;
}
