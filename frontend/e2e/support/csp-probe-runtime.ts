import { appendFileSync, existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import type { Page } from '@playwright/test';

import {
  PROBE_MODES,
  findingFromGroup,
  formatViolationReport,
  fromBrowserEvent,
  fromConsoleMessage,
  groupViolations,
  parseServerLog,
} from './csp-probe';
import type { Finding, GroupedViolation, ProbeMode, RawBrowserViolation, Violation } from './csp-probe';
import { scaled } from './time-scale';

/**
 * La parte de la sonda de CSP que habla con el navegador y con el registro del servidor (plan 03, S2-3b y S2-4).
 * Lo puro (normalizar, agrupar, dar formato) vive en `csp-probe.ts`. El orquestador (`scripts/test-csp-probe.mjs`) exporta:
 *
 *   CSP_PROBE_MODE         enforce | report | report-strict (cómo sirve la política el servidor de la sonda)
 *   CSP_PROBE_SERVER_LOG   archivo donde el servidor escribe su registro (de ahí salen las líneas `csp_violation`)
 *   CSP_PROBE_FINDINGS     archivo (JSON por línea) donde cada flujo anota lo que halló; el orquestador lo resume
 */

export function probeMode(): ProbeMode {
  const value = process.env['CSP_PROBE_MODE'] ?? 'enforce';
  if (!PROBE_MODES.includes(value as ProbeMode)) {
    throw new Error(`CSP_PROBE_MODE debe ser uno de ${PROBE_MODES.join(', ')} (recibido: «${value}»)`);
  }
  return value as ProbeMode;
}

/** Lo que el orquestador pide demostrar con un control negativo (la política se empeoró a propósito). */
export function probeControl(): string {
  return process.env['CSP_PROBE_CONTROL'] ?? '';
}

export function recordFinding(finding: Finding): void {
  const file = process.env['CSP_PROBE_FINDINGS'];
  if (file) appendFileSync(file, `${JSON.stringify(finding)}\n`);
}

// ── Registro del servidor ────────────────────────────────────────────────────────────────────────

function serverLogPath(): string | null {
  const file = process.env['CSP_PROBE_SERVER_LOG'];
  return file && existsSync(file) ? file : null;
}

function serverLogSize(): number {
  const file = serverLogPath();
  return file ? statSync(file).size : 0;
}

function readServerLogFrom(offset: number): string {
  const file = serverLogPath();
  if (!file) return '';
  const size = statSync(file).size;
  if (size <= offset) return '';
  const buffer = Buffer.alloc(size - offset);
  const descriptor = openSync(file, 'r');
  try {
    readSync(descriptor, buffer, 0, buffer.length, offset);
  } finally {
    closeSync(descriptor);
  }
  return buffer.toString('utf8');
}

// ── Captura en el navegador ──────────────────────────────────────────────────────────────────────

export interface ProbeSession {
  readonly flow: string;
  readonly mode: ProbeMode;
  /** Diálogos nativos (alert, confirm, prompt) que la página abrió: un `alert` aquí es un script que se ejecutó. */
  readonly dialogs: string[];
  /** Lo que el navegador reportó con `securitypolicyviolation` desde que empezó la sesión. */
  browserViolations(): Violation[];
  consoleViolations(): Violation[];
  /** Espera a que el servidor reciba los informes pendientes del navegador. */
  settle(): Promise<void>;
  /** Las líneas `csp_violation` que el servidor registró desde que empezó la sesión. */
  serverViolations(): Violation[];
  /** Cierra el flujo: espera los informes, anota los hallazgos y devuelve el texto del fallo (vacío si no hay violaciones). */
  finish(): Promise<{ report: string; groups: GroupedViolation[] }>;
}

/**
 * Empieza a escuchar en `page`: el evento `securitypolicyviolation` de cada documento (se envía al proceso de la prueba al
 * momento, así no se pierde nada en una navegación), los mensajes de consola de CSP y los diálogos nativos.
 * Hay que llamarla ANTES de navegar: el guion de arranque solo se ejecuta en los documentos que se cargan después.
 */
export async function startProbe(page: Page, flow: string): Promise<ProbeSession> {
  const mode = probeMode();
  const browser: Violation[] = [];
  const fromConsole: Violation[] = [];
  const dialogs: string[] = [];
  const serverMark = serverLogSize();

  await page.exposeFunction('__siepCspViolation', (raw: RawBrowserViolation) => {
    browser.push(fromBrowserEvent(raw));
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      // La función expuesta se busca al ocurrir el evento (no al arrancar el guion): así no importa el orden de instalación.
      const report = (window as unknown as { __siepCspViolation?: (raw: unknown) => void }).__siepCspViolation;
      report?.({
        effectiveDirective: event.effectiveDirective,
        violatedDirective: event.violatedDirective,
        blockedURI: event.blockedURI,
        documentURI: event.documentURI,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
        columnNumber: event.columnNumber,
        disposition: event.disposition,
      });
    });
  });
  page.on('console', message => {
    const item = fromConsoleMessage(message.text(), page.url());
    if (item) fromConsole.push(item);
  });
  page.on('dialog', dialog => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss();
  });

  const settle = async (): Promise<void> => {
    // Chrome manda los informes de `report-uri` enseguida, pero por su cuenta: se espera a que el registro deje de crecer.
    const deadline = Date.now() + scaled(4_000);
    let last = serverLogSize();
    let stableSince = Date.now();
    await page.waitForTimeout(scaled(500)).catch(() => undefined);
    while (Date.now() < deadline) {
      const size = serverLogSize();
      if (size !== last) {
        last = size;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= scaled(500)) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  const serverViolations = (): Violation[] => parseServerLog(readServerLogFrom(serverMark));

  return {
    flow,
    mode,
    dialogs,
    browserViolations: () => [...browser],
    consoleViolations: () => [...fromConsole],
    settle,
    serverViolations,
    async finish() {
      await settle();
      const server = serverViolations();
      let groups = groupViolations(browser);
      const notes: string[] = [];
      if (groups.length === 0 && (fromConsole.length > 0 || server.length > 0)) {
        // El evento del navegador no llegó pero otro canal sí vio una violación: se muestra lo que ese canal vio.
        groups = groupViolations([...fromConsole, ...server]);
        notes.push('(el navegador no entregó el evento securitypolicyviolation: la lista sale de la consola y del servidor)');
      } else if (groups.length > 0) {
        notes.push(`consola: ${fromConsole.length} mensaje(s) de CSP · servidor: ${server.length} línea(s) csp_violation`);
      }
      for (const group of groups) recordFinding(findingFromGroup(flow, group));
      const report = groups.length > 0 ? formatViolationReport(flow, mode, groups, notes) : '';
      return { report, groups };
    },
  };
}

/** Corre un flujo con la sonda puesta: si el flujo falla se muestran sus violaciones junto al fallo; si no, falla con ellas. */
export async function runProbedFlow(page: Page, flow: string, body: (probe: ProbeSession) => Promise<void>): Promise<void> {
  const probe = await startProbe(page, flow);
  let failure: unknown;
  try {
    await body(probe);
  } catch (error) {
    failure = error;
  }
  const { report } = await probe.finish();
  if (failure !== undefined) {
    if (report) console.error(report);
    throw failure;
  }
  if (report) throw new Error(report);
}

// ── El canario: un script inyectado en la página ─────────────────────────────────────────────────

export interface CanaryResult {
  /** El `<script>` en línea que se añadió al DOM llegó a ejecutarse. */
  scriptRan: boolean;
  /** El atributo `onerror` en línea de una imagen llegó a ejecutarse. */
  handlerRan: boolean;
}

/**
 * Lo que haría un XSS de DOM: añadir al documento un `<script>` con código en línea y un elemento con un manejador
 * `on*=`. Con la política en vigor (nonce, sin 'unsafe-inline') ninguno de los dos se ejecuta y el navegador informa de
 * dos violaciones (`script-src-elem` y `script-src-attr`, recurso `inline`).
 */
export async function injectCanary(page: Page): Promise<CanaryResult> {
  await page.evaluate(() => {
    const target = window as unknown as Record<string, unknown>;
    target['__siepCanarioScript'] = 0;
    target['__siepCanarioHandler'] = 0;
    const script = document.createElement('script');
    script.textContent = 'window.__siepCanarioScript = 1;';
    document.body.appendChild(script);
    const image = document.createElement('img');
    image.setAttribute('onerror', 'window.__siepCanarioHandler = 1;');
    // Un data: vacío no es una imagen: dispara «error» sin una segunda violación (el esquema data: ya está en img-src).
    image.setAttribute('src', 'data:,');
    document.body.appendChild(image);
  });
  await page.waitForTimeout(scaled(400));
  return page.evaluate(() => {
    const target = window as unknown as Record<string, unknown>;
    return { scriptRan: target['__siepCanarioScript'] === 1, handlerRan: target['__siepCanarioHandler'] === 1 };
  });
}
