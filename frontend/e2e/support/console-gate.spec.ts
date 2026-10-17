import {
  collectUnexpectedPageAndConsoleErrors,
  filterUnexpectedConsoleErrors,
  filterUnexpectedPageErrors,
} from './console-gate';
import type { Page } from '@playwright/test';

// req: RNF-05
describe('console-gate (TOO-7)', () => {
  it('filtra console.error reales e ignora avisos benignos o permitidos explícitamente', () => {
    const messages = [
      { type: () => 'log', text: () => 'info normal' },
      { type: () => 'error', text: () => 'Failed to load resource: favicon.ico' },
      { type: () => 'error', text: () => 'Error esperado en prueba 403' },
      { type: () => 'error', text: () => 'Uncaught TypeError: Cannot read properties of null' },
    ];

    const unexpected = filterUnexpectedConsoleErrors(messages, [/Error esperado en prueba 403/]);
    expect(unexpected).toEqual(['Uncaught TypeError: Cannot read properties of null']);
  });

  it('filtra pageErrors reales e ignora ResizeObserver benigno', () => {
    const errors = [
      new Error('ResizeObserver loop completed with undelivered notifications.'),
      new Error('ReferenceError: phaserScene is not defined'),
    ];

    expect(filterUnexpectedPageErrors(errors)).toEqual(['ReferenceError: phaserScene is not defined']);
  });

  it('collectUnexpectedPageAndConsoleErrors lee page.pageErrors() y page.consoleMessages()', async () => {
    const fakePage = {
      pageErrors: async () => [new Error('Boom page')],
      consoleMessages: async () => [
        { type: () => 'warning', text: () => 'aviso' },
        { type: () => 'error', text: () => 'Boom console' },
      ],
    } as unknown as Page;

    const report = await collectUnexpectedPageAndConsoleErrors(fakePage);
    expect(report).toEqual({
      pageErrors: ['Boom page'],
      consoleErrors: ['Boom console'],
    });
  });
});
