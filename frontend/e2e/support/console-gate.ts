import type { ConsoleMessage, Page } from '@playwright/test';

export interface ConsoleFailureReport {
  readonly pageErrors: string[];
  readonly consoleErrors: string[];
}

const DEFAULT_IGNORED_CONSOLE_PATTERNS: readonly RegExp[] = [
  /favicon\.ico/i,
  /ResizeObserver loop/i,
];

/**
 * Ruido de consola conocido y MEDIDO en los recorridos largos (`@full-case`, `@orientation`): cada entrada dice por qué
 * no es un fallo de la aplicación. Lo que no esté aquí hace fallar la prueba; no se amplía sin una razón.
 *
 * Medida (2026-10-17, Chromium con GPU, `full-case` en sus cuatro viewports y la orientación en escritorio y táctil):
 * 0 mensajes de error y 0 errores de página. La lista parte vacía y así se queda mientras eso siga siendo cierto.
 */
export const KNOWN_CONSOLE_NOISE: ReadonlyArray<{ readonly pattern: RegExp; readonly reason: string }> = [];

export const KNOWN_CONSOLE_PATTERNS: readonly RegExp[] = KNOWN_CONSOLE_NOISE.map(entry => entry.pattern);

export function filterUnexpectedConsoleErrors(
  messages: ReadonlyArray<{ type(): string; text(): string }>,
  allowPatterns: readonly RegExp[] = [],
): string[] {
  const combined = [...DEFAULT_IGNORED_CONSOLE_PATTERNS, ...allowPatterns];
  return messages
    .filter(msg => msg.type() === 'error')
    .map(msg => msg.text().trim())
    .filter(text => text.length > 0 && !combined.some(pattern => pattern.test(text)));
}

export function filterUnexpectedPageErrors(
  errors: ReadonlyArray<Error | string>,
  allowPatterns: readonly RegExp[] = [],
): string[] {
  const combined = [...DEFAULT_IGNORED_CONSOLE_PATTERNS, ...allowPatterns];
  return errors
    .map(err => (err instanceof Error ? err.message || String(err) : String(err)).trim())
    .filter(text => text.length > 0 && !combined.some(pattern => pattern.test(text)));
}

export async function collectUnexpectedPageAndConsoleErrors(
  page: Page,
  allowPatterns: readonly RegExp[] = [],
): Promise<ConsoleFailureReport> {
  const rawPageErrors = typeof page.pageErrors === 'function' ? await page.pageErrors() : [];
  const rawConsoleMessages: ConsoleMessage[] =
    typeof page.consoleMessages === 'function' ? await page.consoleMessages() : [];

  return {
    pageErrors: filterUnexpectedPageErrors(rawPageErrors, allowPatterns),
    consoleErrors: filterUnexpectedConsoleErrors(rawConsoleMessages, allowPatterns),
  };
}

/**
 * Guardia de `pageerror` y `console.error` para E2E en Playwright (E5-8 · TOO-7).
 * Usa `page.pageErrors()` y `page.consoleMessages()` y lanza error si hay fallos inesperados.
 */
export async function assertNoUnexpectedConsoleOrPageErrors(
  page: Page,
  allowPatterns: readonly RegExp[] = [],
): Promise<void> {
  const report = await collectUnexpectedPageAndConsoleErrors(page, allowPatterns);
  if (report.pageErrors.length > 0) {
    throw new Error(`Errores no controlados en página (pageerror): ${report.pageErrors.join(' | ')}`);
  }
  if (report.consoleErrors.length > 0) {
    throw new Error(`Errores de consola no esperados: ${report.consoleErrors.join(' | ')}`);
  }
}

