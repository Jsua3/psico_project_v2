import { expect } from '@playwright/test';
import type { Locator, Page, Request, Response } from '@playwright/test';
import { captureApiBodies, readJson, readText } from './api-bodies';
import { resetStudentConsent } from './consent';
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
  const body = await readText(response).catch(() => '<cuerpo no disponible>');
  throw new Error(`${context}: HTTP ${response.status()} ${response.url()} — ${body}`);
}

/** Clave y valor con que el juego recuerda que ya se mostró la ayuda de primera vez. */
const HELP_MEMORY_KEY = 'siep.ayuda.v1';
const HELP_MEMORY_SEEN = JSON.stringify({ v: 1, vistas: ['primero'] });

/**
 * La tarjeta «Cómo se juega» de primera vez aparece en cada contexto de
 * navegador nuevo (cada test de Playwright) y cubre parte del mundo. Se marca
 * como vista con addInitScript, antes de que cargue cualquier página, y también
 * en la página ya abierta. Los tests que SÍ prueban la ayuda de primera vez
 * llaman a loginStudent(page, { seedHelp: false }).
 */
export async function markFirstTimeHelpSeen(page: Page): Promise<void> {
  await page.addInitScript(([key, value]) => {
    try { window.localStorage.setItem(key, value); } catch { /* almacenamiento bloqueado */ }
  }, [HELP_MEMORY_KEY, HELP_MEMORY_SEEN]);
  await page.evaluate(([key, value]) => {
    try { window.localStorage.setItem(key, value); } catch { /* almacenamiento bloqueado */ }
  }, [HELP_MEMORY_KEY, HELP_MEMORY_SEEN]).catch(() => undefined);
}

export interface Login { email: string; password: string }

/** El formulario de ingreso con las credenciales dadas (la docente que ensaya, el administrador…); termina dentro del portal. */
export async function loginAs(page: Page, who: Login, options: { seedHelp?: boolean } = {}): Promise<void> {
  await captureApiBodies(page);
  if (options.seedHelp !== false) await markFirstTimeHelpSeen(page);
  if (!/\/login$/.test(new URL(page.url()).pathname)) await page.goto('/login');
  await page.locator('input[type="email"]').last().fill(who.email);
  await page.locator('input[type="password"]').last().fill(who.password);
  await page.getByRole('button', { name: /^ingresar$/i }).click();
  await page.waitForURL(/\/portal\//, { timeout: scaled(30_000) });
}

export async function loginStudent(page: Page, options: { seedHelp?: boolean } = {}): Promise<void> {
  await loginAs(page, { email: EMAIL, password: PASSWORD }, options);
}

/**
 * Descarta el intento abierto que dejó otra prueba: «Iniciar nuevo intento» en la tarjeta de reanudar nombra lo que se
 * pierde y pide confirmar (RN-07, plan visual F6-2); aquí se confirma en el cuadro de consecuencia.
 */
export async function startFreshAttempt(page: Page, startFresh: Locator): Promise<void> {
  await startFresh.click();
  const consequence = page.getByRole('alertdialog');
  await expect(consequence).toBeVisible({ timeout: scaled(15_000) });
  await consequence.getByRole('button', { name: /^iniciar nuevo intento$/i }).click();
  await expect(consequence).toHaveCount(0, { timeout: scaled(15_000) });
}

/**
 * La ficha del caso (plan visual F10-1, RF-16) va antes del juego y no crea el intento: «Comenzar» pasa a él. Desde la
 * ficha deja la página en el juego (`/portal/simulador/<id>`); si ya está en el juego, no hace nada.
 */
export async function leaveBrief(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/portal\/simulador\/\d+(\/ficha)?$/, { timeout: scaled(30_000) });
  if (!/\/ficha$/.test(new URL(page.url()).pathname)) return;
  await page.getByRole('button', { name: 'Comenzar', exact: true }).click();
  await page.waitForURL(/\/portal\/simulador\/\d+$/, { timeout: scaled(30_000) });
}

export async function enterCaseAtContentWarning(page: Page): Promise<Locator> {
  // El consentimiento vive en el servidor (S3-2b): el de una prueba anterior haría que el aviso no saliera. Se parte de «sin
  // consentimiento» ANTES de abrir el caso, o la pantalla de juego ya lo habría leído.
  await resetStudentConsent(page);
  await page.getByRole('button', { name: /entrar al caso/i }).click();
  await page.waitForURL(/\/portal\/simulador\/\d+/, { timeout: scaled(30_000) });
  await leaveBrief(page);
  const consent = page.getByRole('dialog').filter({ hasText: 'Antes de entrar al caso' });
  // Recorrido aislado: un intento activo que dejó otra prueba se descarta en
  // vez de heredar su sala y posición (un fallo previo no arrastra a este).
  const startFresh = page.getByRole('button', { name: /iniciar nuevo intento/i });
  await expect(consent.or(startFresh).first()).toBeVisible({ timeout: scaled(30_000) });
  if (await startFresh.isVisible().catch(() => false)) await startFreshAttempt(page, startFresh);
  await expect(consent).toBeVisible({ timeout: scaled(30_000) });
  return consent;
}

export async function acceptContentWarning(page: Page, consent: Locator): Promise<Locator> {
  await consent.getByRole('button', { name: /^continuar$/i }).click();
  const card = page.getByRole('dialog').filter({ hasText: 'Antes de comenzar' });
  await expect(card).toBeVisible({ timeout: scaled(30_000) });
  return card;
}

/**
 * La tarjeta «Antes de comenzar» nombra el caso, la escena y la sala (no un texto fijo): se comprueba que trae el nombre de un
 * caso y se devuelve sin pulsar nada; quien llama pulsa «Continuar» en lo que recibe.
 */
export async function finishCaseIntroduction(page: Page, card: Locator): Promise<Locator> {
  await expect(card).toBeVisible({ timeout: scaled(30_000) });
  await expect(card).toContainText(/Caso:\s*\S/);
  return card;
}

/**
 * Login → lobby → aviso de contenido → introducción → contexto → mundo listo,
 * con un intento nuevo. `seedHelp: false` deja que aparezca la ayuda de primera vez.
 */
export async function enterWorld(page: Page, options: { seedHelp?: boolean } = {}): Promise<void> {
  await page.goto('/login');
  await loginStudent(page, options);
  await page.goto('/portal/jugar');
  await expect(page.locator('app-game-menu canvas')).toBeVisible({ timeout: scaled(30_000) });
  const consent = await enterCaseAtContentWarning(page);
  const introVideo = await acceptContentWarning(page, consent);
  const caseIntro = await finishCaseIntroduction(page, introVideo);
  await caseIntro.getByRole('button', { name: /^continuar$/i }).click();
  await waitForWorldReady(page);
}

/** Tamaño real del canvas de Phaser en pantalla (AC-5: debe recuperarse al cerrar un diálogo). */
export async function canvasSize(page: Page): Promise<{ width: number; height: number }> {
  const box = await page.locator('app-game-world canvas').boundingBox();
  if (!box) throw new Error('El canvas del mundo no está en pantalla');
  return { width: box.width, height: box.height };
}

/** La ficha del objetivo de la escena: el host lleva `data-goal` (el objetivo visible) y su botón la abre y la cierra. */
export function goalCard(page: Page): Locator {
  return page.locator('app-scene-goal-card');
}

/**
 * Anota cada valor que toma `data-reaction` en el documento (el gesto dura ~400 ms: una espera por sondeo puede perderlo).
 * Instálalo ANTES de elegir; devuelve una función que lee los valores vistos hasta ahora.
 */
export async function watchReaction(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __reacciones: string[] }).__reacciones = seen;
    new MutationObserver(records => {
      for (const record of records) {
        const value = (record.target as Element).getAttribute('data-reaction');
        if (value) seen.push(value);
      }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-reaction'], subtree: true });
  });
  return () => page.evaluate(() => [...((window as unknown as { __reacciones?: string[] }).__reacciones ?? [])]);
}

/**
 * V7: la respuesta del personaje espera «Continuar» y un cambio de lugar espera «Ir a <lugar>». Quien sigue la historia
 * (el ayudante que espera el mundo o la consecuencia) los pulsa, como haría una persona. No hace nada si no están.
 */
export async function seguirLaHistoria(page: Page): Promise<boolean> {
  let pulso = false;
  const continuar = page.locator('app-reaction-director button.reaction-continue');
  // Dos veces como mucho: si la frase aún no se veía, el primero la muestra y el segundo cierra la franja.
  for (let vez = 0; vez < 2 && (await continuar.isVisible().catch(() => false)); vez += 1) {
    await continuar.click({ timeout: scaled(5_000) }).catch(() => undefined);
    pulso = true;
  }
  const ir = page.locator('.cambio-de-lugar__ir');
  if (await ir.isVisible().catch(() => false)) {
    await ir.click({ timeout: scaled(5_000) }).catch(() => undefined);
    pulso = true;
  }
  return pulso;
}

/**
 * V7: espera la nota de consecuencia tras una decisión. La franja de la reacción ya no se va sola: se pulsa «Continuar»
 * como haría una persona. Devuelve si la nota llegó a verse dentro del plazo.
 */
export async function esperarConsecuencia(page: Page, plazoMs = scaled(30_000)): Promise<boolean> {
  const nota = page.getByRole('dialog', { name: /consecuencia/i });
  const hasta = Date.now() + plazoMs;
  while (Date.now() < hasta) {
    if (await nota.isVisible().catch(() => false)) return true;
    await seguirLaHistoria(page);
    await page.waitForTimeout(100);
  }
  return nota.isVisible().catch(() => false);
}

export async function waitForWorldReady(page: Page, expectedMapKey?: string): Promise<void> {
  const host = page.locator('app-game-world .phaser-host[data-world-ready="true"]');
  await seguirLaHistoria(page);
  await expect(host).toBeVisible({ timeout: scaled(45_000) });
  if (expectedMapKey) {
    // Si la sala nueva espera «Ir a…» (o la franja, «Continuar»), se pulsa mientras se espera su clave.
    await expect.poll(async () => {
      await seguirLaHistoria(page);
      return host.getAttribute('data-rendered-map-key').catch(() => null);
    }, { timeout: scaled(45_000), message: `el mundo ${expectedMapKey} no quedó listo` }).toBe(expectedMapKey);
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

/**
 * Botón de la barra contextual cuyo verbo+nombre casa con label. La barra tiene
 * un principal y, con dos candidatos a la vez, un secundario («También: …») que
 * también es `button.context-bar__interaction`: el nombre decide cuál es, y
 * `.first()` evita el modo estricto si dos coincidieran.
 */
export function nearbyAction(page: Page, label: RegExp): Locator {
  const named = page.locator('strong').filter({ hasText: label });
  return page.locator('button.context-bar__interaction').filter({ has: named }).first();
}

/** Solo el botón PRINCIPAL de la barra (el que actúa con la tecla E). */
export function primaryNearbyAction(page: Page): Locator {
  return page.locator('button.context-bar__interaction:not(.context-bar__interaction--secondary)');
}

export interface WorldInputDriver {
  readonly mode: SiepInputMode;
  /**
   * Camina hasta que la barra contextual ofrece una interacción cuyo verbo y
   * nombre casan con label (el principal o el secundario). `key` puede ser un
   * rumbo de varias teclas: se pulsan en ciclo (['ArrowRight', 'ArrowRight',
   * 'ArrowUp'] avanza dos tramos a la derecha por cada uno hacia arriba), de modo
   * que se llega a un destino en diagonal sin conocer su posición en píxeles.
   * timeout: plazo base en ms (se escala con E2E_TIME_SCALE).
   */
  moveUntilNearby(key: MovementKey | readonly MovementKey[], label: RegExp, timeout?: number): Promise<Locator>;
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
    heading: MovementKey | readonly MovementKey[],
    label: RegExp,
    timeout = 20_000,
  ): Promise<Locator> => {
    const keys: readonly MovementKey[] = typeof heading === 'string' ? [heading] : heading;
    const action = nearbyAction(page, label);
    if (await action.isVisible().catch(() => false)) return action;

    // Empujones cortos (~15 px, muy por debajo del radio de interacción de
    // 74 px) comprobando proximidad con la tecla liberada: si se mantiene
    // pulsada mientras Playwright resuelve el locator, el personaje puede
    // sobrepasar un marcador y el botón contextual cambiar de objetivo antes
    // del clic. Sin lecturas de posición por ciclo: cada ida y vuelta al
    // navegador es cara en el CI sin GPU.
    if (mode === 'touch') {
      for (const key of new Set(keys)) await expect(touchControl(key)).toBeVisible();
    }
    const deadline = Date.now() + scaled(timeout);
    for (let pulse = 0; Date.now() < deadline && !(await action.isVisible().catch(() => false)); pulse += 1) {
      const key = keys[pulse % keys.length];
      if (mode === 'touch') {
        await tap(touchControl(key));
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
      const how = mode === 'keyboard' ? `moviendo ${keys.join('/')}` : `con el control ${keys.join('/')}`;
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

const EXPLORE_BUDGET_MS = 45_000;
/** Largo de cada empujón del barrido: muy por debajo del radio de interacción (72-74 px). */
const EXPLORE_STEP_PX = 36;
/** Separación entre pasillos del barrido (menos que el doble del radio de interacción). */
const EXPLORE_LANE_PX = 56;
const OPPOSITE_KEY: Record<MovementKey, MovementKey> = {
  ArrowUp: 'ArrowDown',
  ArrowDown: 'ArrowUp',
  ArrowLeft: 'ArrowRight',
  ArrowRight: 'ArrowLeft',
};

/**
 * Busca una interacción por su nombre SIN conocer dónde está: barre la sala en
 * pasillos (a un lado hasta chocar, un pasillo hacia arriba, de vuelta) en lazo
 * cerrado con data-player-x/y y se detiene en cuanto la barra ofrece label. Si
 * una persona o un objeto de la ruta no se alcanza dentro del plazo, falla: es
 * también la prueba de alcanzabilidad real.
 */
export async function exploreUntilNearby(
  page: Page,
  input: WorldInputDriver,
  label: RegExp,
  timeout = EXPLORE_BUDGET_MS,
): Promise<Locator> {
  const action = nearbyAction(page, label);
  const found = () => action.isVisible().catch(() => false);
  if (await found()) return action;

  const advanced = async (key: MovementKey, distancePx: number): Promise<boolean> => {
    const before = await readPlayerPosition(page);
    await input.moveBy(key, distancePx);
    const after = await readPlayerPosition(page);
    return Math.abs(after.x - before.x) + Math.abs(after.y - before.y) >= 4;
  };

  const budgetMs = scaled(timeout);
  const deadline = Date.now() + budgetMs;
  let horizontal: MovementKey = 'ArrowRight';
  let vertical: MovementKey = 'ArrowUp';
  let stuckLanes = 0;
  while (Date.now() < deadline && stuckLanes < 4) {
    // Un pasillo: se avanza hasta chocar con una pared o un mueble.
    let steps = 0;
    while (Date.now() < deadline && !(await found())) {
      if (!(await advanced(horizontal, EXPLORE_STEP_PX))) break;
      steps += 1;
    }
    if (await found()) return action;
    // Sin avanzar nada es una pared: se invierte el sentido. Si antes se avanzó, era un
    // mueble a mitad del pasillo y se rodea cambiando de pasillo en el MISMO sentido.
    if (steps === 0) horizontal = OPPOSITE_KEY[horizontal];
    if (await advanced(vertical, EXPLORE_LANE_PX)) {
      stuckLanes = 0;
    } else {
      // Tope arriba/abajo: el barrido sigue hacia el otro lado.
      vertical = OPPOSITE_KEY[vertical];
      stuckLanes += (await advanced(vertical, EXPLORE_LANE_PX)) ? 0 : 1;
    }
    if (await found()) return action;
  }
  const at = await readPlayerPosition(page).catch(() => null);
  const where = at ? ` (jugador en x=${at.x}, y=${at.y})` : '';
  await expect(action, `No se alcanzó ${label} explorando la sala durante ${budgetMs / 1000} s${where}`)
    .toBeVisible({ timeout: scaled(1_000) });
  return action;
}

/** Plazo base del rumbo aproximado de reachNearby antes de pasar al barrido de la sala. */
const HEADING_BUDGET_MS = 10_000;

/**
 * Llega a una interacción por su nombre: primero con un rumbo aproximado
 * (moveUntilNearby en diagonal, rápido) y, si el jugador se pasa de largo o choca
 * con algo antes de que la barra la ofrezca, barriendo la sala (exploreUntilNearby).
 * Así el recorrido no depende de en qué punto exacto reaparece el jugador.
 */
export async function reachNearby(
  page: Page,
  input: WorldInputDriver,
  heading: MovementKey | readonly MovementKey[],
  label: RegExp,
): Promise<Locator> {
  try {
    return await input.moveUntilNearby(heading, label, HEADING_BUDGET_MS);
  } catch {
    return exploreUntilNearby(page, input, label);
  }
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
        const data = (await readJson(response)).data as ApiData;
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
 *
 * En el runner lento (E2E_TIME_SCALE=4) el empujón y el clic pueden tardar más
 * que el debounce (550 ms) y el juego guarda una vez por su cuenta antes del
 * flush: `['position', 'position', 'pause']`. Lo que se exige es lo que importa
 * (REGLA-004): al menos un guardado, todos ANTES de la pausa, y el ÚLTIMO lleva
 * la posición que la pausa deja guardada.
 */
export async function pauseWithPendingPosition(
  page: Page,
  input: WorldInputDriver,
  key: MovementKey,
): Promise<{ positionWorld: ApiData; pausedAttempt: ApiData }> {
  const requestOrder: string[] = [];
  const positionRequests: Request[] = [];
  const captureOrder = (request: Request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'PATCH' && /\/world-state$/.test(path)) {
      requestOrder.push('position');
      positionRequests.push(request);
    }
    if (request.method() === 'POST' && /\/safe-exit$/.test(path)) requestOrder.push('pause');
  };
  page.on('request', captureOrder);
  const pausePromise = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && /\/api\/simulation\/attempts\/[^/]+\/safe-exit$/.test(new URL(response.url()).pathname),
    { timeout: scaled(30_000) },
  );
  try {
    await input.nudge(key);
    await page.getByRole('button', { name: /salida segura/i }).click();
    const pauseResponse = await pausePromise;
    const saves = requestOrder.indexOf('pause');
    expect(saves, `la pausa sale después de guardar la posición: ${requestOrder.join(', ')}`).toBeGreaterThanOrEqual(1);
    expect(requestOrder, 'ningún guardado de posición después de la pausa').toEqual([...Array(saves).fill('position'), 'pause']);
    const positionResponse = await positionRequests[saves - 1].response();
    if (!positionResponse) throw new Error('El guardado previo a la pausa no tuvo respuesta');
    await requireOk(positionResponse, 'Falló el flush previo a pausa');
    await requireOk(pauseResponse, 'Falló la pausa segura');
    return {
      positionWorld: (await readJson(positionResponse)).data as ApiData,
      pausedAttempt: (await readJson(pauseResponse)).data as ApiData,
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
  const activeAttempt = (await readJson(activeResponse)).data as ApiData;
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
    resumedAttempt = (await readJson(resumeResponse)).data as ApiData;
  }

  const worldResponse = await worldPromise;
  await requireOk(worldResponse, 'Falló world tras reanudar');
  const world = (await readJson(worldResponse)).data as ApiData;
  await waitForWorldReady(page, expectedMapKey);
  return { activeAttempt, resumedAttempt, world };
}

/**
 * Espera a que el jugador deje de moverse (misma posición en dos lecturas separadas por
 * quietMs). Con el toque, un empujón puede seguir caminando unos cuadros tras soltar y la
 * barra contextual cambia de botón mientras tanto: pulsar en ese instante reintenta el clic
 * sobre un botón que se desmonta. Si el jugador nunca se detiene falla con un mensaje claro
 * (un movimiento atascado es un defecto real del producto, no se oculta).
 */
export async function waitUntilPlayerStill(page: Page, quietMs = 300, timeout = 6_000): Promise<void> {
  const deadline = Date.now() + scaled(timeout);
  let previous = await readPlayerPosition(page);
  while (Date.now() < deadline) {
    await page.waitForTimeout(quietMs);
    const current = await readPlayerPosition(page);
    if (current.x === previous.x && current.y === previous.y) return;
    previous = current;
  }
  throw new Error(`El jugador no se detiene (último punto x=${previous.x}, y=${previous.y})`);
}

export async function interactNearby(
  page: Page,
  label: RegExp,
  responseUrl: RegExp,
): Promise<ApiData> {
  await waitUntilPlayerStill(page);
  const action = nearbyAction(page, label);
  await expect(action, `Interacción visible requerida: ${label}`).toBeVisible();
  const responsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST' && responseUrl.test(new URL(response.url()).pathname),
    { timeout: scaled(30_000) },
  );
  await action.click();
  const response = await responsePromise;
  await requireOk(response, `Falló la interacción ${label}`);
  return (await readJson(response)).data as ApiData;
}

export async function enterDoor(
  page: Page,
  label: RegExp,
  expectedMapKey: string,
): Promise<ApiData> {
  await waitUntilPlayerStill(page);
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
  const data = (await readJson(response)).data as ApiData;
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
    return (await readJson(response)).data as ApiData;
  };

  // Por plazo y no por número de intentos: el NPC deambula en tiempo de
  // juego, y en el CI lento cada intento (tecla/toque + espera) cuesta más.
  const budgetMs = scaled(NPC_SEEK_BUDGET_MS);
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await dialogue.isVisible().catch(() => false)) {
      return finishNpcInteraction();
    }

    // E (o el botón táctil) actúa sobre el candidato PRINCIPAL. Con dos personas a la vez
    // (la enfermera y el médico de guardia) la buscada puede ser la secundaria («También: …»):
    // entonces se pulsa su propio botón en vez de abrir la conversación de la otra.
    const named = nearbyAction(page, npcName);
    const namedIsSecondary = await named.evaluate(
      el => el.classList.contains('context-bar__interaction--secondary'),
      undefined,
      { timeout: scaled(500) },
    ).catch(() => false);
    if (namedIsSecondary) await named.click({ timeout: scaled(2_000) }).catch(() => undefined);
    else await input.interact();
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

export async function closeDialogue(page: Page, dialogueName: RegExp, opciones: { irAlLugar?: boolean } = {}): Promise<void> {
  const dialogue = page.getByRole('dialog', { name: dialogueName });
  // V7: la consecuencia llega tras «Continuar» en la franja de la reacción, que ya no se va sola.
  await expect.poll(async () => (await dialogue.isVisible().catch(() => false)) || (await seguirLaHistoria(page) && false),
    { timeout: scaled(30_000), message: `el diálogo ${dialogueName} no apareció` }).toBe(true);
  // Al cerrar la consecuencia se pide el mundo de la escena siguiente; si es otra sala, sale «Ir a <lugar>» y se pulsa.
  const esConsecuencia = dialogueName.test('Consecuencia') && opciones.irAlLugar !== false;
  const mundo = esConsecuencia
    ? page.waitForResponse(r => r.request().method() === 'GET' && /\/api\/simulation\/attempts\/[^/]+\/world$/.test(new URL(r.url()).pathname),
      { timeout: scaled(10_000) }).catch(() => null)
    : null;
  const cerrado = async () => {
    if (!mundo || !(await mundo)) return;
    const ir = page.locator('.cambio-de-lugar__ir');
    await ir.waitFor({ state: 'visible', timeout: scaled(1_500) }).then(() => ir.click()).catch(() => undefined);
  };

  const budgetMs = scaled(DIALOGUE_BUDGET_MS);
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await clickCurrentDialogueAction(dialogue)) {
      if (await dialogue.isHidden().catch(() => false)) {
        await cerrado();
        return;
      }
      // «Continuar» (antes «Cerrar diálogo (Esc)»): el último botón de cada diálogo.
      const close = dialogue.getByRole('button', { name: /continuar|cerrar diálogo/i });
      if (!(await visible(close))) continue;
    }
    if (await dialogue.isHidden().catch(() => false)) {
      await expect(dialogue).toBeHidden({ timeout: scaled(10_000) });
      await cerrado();
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
  // C2: con FEEDBACK_AT_CLOSE_ONLY el estado del intento viene dentro de `attempt`; el resto del e2e lee el estado
  // plano, así que se aplana aquí conservando `consequence`, `retry` y `reaction`.
  const body = (await readJson(response)).data as ApiData;
  return body.attempt ? { ...body.attempt, consequence: body.consequence ?? null, retry: body.retry ?? null, reaction: body.reaction ?? null } : body;
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
  return (await readJson(response)).data as ApiData;
}

export async function openFamilyDialogue(page: Page, touch: boolean): Promise<Locator> {
  // En táctil el nombre «Interactuar: Hablar con …» lo llevan DOS botones (la
  // barra y .touch-interact): se acota a la barra contextual.
  const familyAction = nearbyAction(page, /familia en crisis/i);
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
