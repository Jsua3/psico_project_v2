import { expect, test } from '@playwright/test';

import { assertNoUnexpectedConsoleOrPageErrors } from './support/console-gate';

/**
 * La guardia de consola (TOO-7) que cierra los recorridos largos (`@full-case`, `@orientation`) solo vale si ve de
 * verdad lo que pasa en la página: aquí se le provoca un `console.error` y un error sin capturar, y se comprueba que
 * los detecta. Sin esto, una API de Playwright que cambie dejaría la guardia en silencio y todos esos recorridos
 * pasarían sin comprobar nada.
 */
test('@console-gate la guardia ve un console.error y un error sin capturar', async ({ page }) => {
  await page.goto('/login');
  await assertNoUnexpectedConsoleOrPageErrors(page); // la pantalla de entrada está limpia

  await page.evaluate(() => console.error('fallo provocado en consola'));
  await expect(assertNoUnexpectedConsoleOrPageErrors(page)).rejects.toThrow(/fallo provocado en consola/);
  await assertNoUnexpectedConsoleOrPageErrors(page, [/fallo provocado en consola/]); // lo permitido expresamente no cuenta

  // Un error que nadie captura llega al manejador global de la aplicación (`SiepErrorHandler`), que lo registra en la
  // consola: la guardia lo ve por ahí; el camino de `pageerror` lo cubre `support/console-gate.spec.ts`.
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('fallo provocado sin capturar');
    });
  });
  await expect(async () => {
    await expect(assertNoUnexpectedConsoleOrPageErrors(page)).rejects.toThrow(/fallo provocado sin capturar/);
  }).toPass();
});
