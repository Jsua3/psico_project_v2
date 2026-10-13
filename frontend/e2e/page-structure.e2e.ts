import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { runAxe } from './support/quality-gates';
import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import type { TourRole } from './support/screen-tour';

/**
 * Estructura de página (plan visual F3-6) en el navegador real: un h1 y un solo <main> por pantalla en las rutas de
 * los tres roles (en el juego, el h1 es visualmente oculto), la 404, los enlaces de salto y H-19 (WCAG 2.4.11: el
 * foco nunca queda tapado por la barra fija).
 */

/**
 * Los h1 que ve un lector de pantalla. El motor de roles de Playwright no descarta lo `inert` (el acceso tiene dos
 * formularios y el que no se ve es inerte), y por especificación HTML lo inerte no se expone a la accesibilidad.
 */
const h1s = (page: Page) => page.locator('h1:not([inert] *):not([aria-hidden="true"] *)');

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
}

/** Reglas de estructura de Axe (best-practice): orden de títulos, destino de los saltos y puntos de referencia. */
const STRUCTURE_RULES = new Set([
  'heading-order', 'skip-link', 'page-has-heading-one', 'landmark-one-main', 'landmark-no-duplicate-main',
  'landmark-main-is-top-level', 'landmark-unique',
]);

/**
 * «Saltar al juego» apunta a #game-area, que no existe hasta aceptar el aviso de contenido (ETH-01): defecto heredado
 * del juego (Axe ya lo marcaba en F2), lo resuelve F6 con la estructura del juego. Se excluye SOLO ese destino.
 */
const PENDING_IN_F6 = (target: string) => target.includes('#game-area');

async function structureViolations(page: Page): Promise<string[]> {
  const result = await runAxe(page, { tags: ['best-practice'], resultTypes: ['violations'] });
  return result.violations
    .filter(violation => STRUCTURE_RULES.has(violation.id))
    .flatMap(violation => violation.nodes.map(node => `${violation.id}: ${node.target.join(' ')}`))
    .filter(entry => !PENDING_IN_F6(entry));
}

// req: BLOQUE-H (estructura de página), RNF-004
test.describe('@estructura un h1 y un <main> por pantalla', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const role of ['publico', 'estudiante', 'profesor', 'admin'] as const satisfies readonly TourRole[]) {
    test(`${role}: cada pantalla de su recorrido`, async ({ page }) => {
      test.setTimeout(240_000);
      if (role !== 'publico') await loginAs(page, role);
      for (const screen of TOUR_SCREENS.filter(entry => entry.role === role)) {
        await openScreen(page, screen);
        await expect.soft(h1s(page), `${role} · ${screen.id}: un h1`).toHaveCount(1);
        await expect.soft(h1s(page).first(), `${role} · ${screen.id}: h1 con texto`).not.toHaveText('');
        await expect.soft(page.getByRole('main'), `${role} · ${screen.id}: un <main>`).toHaveCount(1);
        expect.soft(await structureViolations(page), `${role} · ${screen.id}: estructura según Axe`).toEqual([]);
      }
    });
  }

  test('las anclas de la barra pública llevan a secciones que existen en la portada real', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    const hrefs = await page.locator('header.cromo .modulo-principal a.nav-enlace').evaluateAll(links => links.map(link => link.getAttribute('href')!));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) await expect(page.locator(href), href).toHaveCount(1);
  });

  test('portada y 404 (fuera del portal y dentro, con su barra)', async ({ page }) => {
    for (const path of ['/', '/no-existe']) {
      await page.goto(path);
      await settle(page);
      await expect(h1s(page), path).toHaveCount(1);
      await expect(page.getByRole('main'), path).toHaveCount(1);
    }
    await expect(h1s(page)).toHaveText('Página no encontrada');
    await expect(page.locator('header.cromo')).toBeVisible();

    await loginAs(page, 'estudiante');
    await page.goto('/portal/no-existe');
    await settle(page);
    await expect(page).toHaveURL(/\/portal\/no-existe$/); // no redirige en silencio
    await expect(h1s(page)).toHaveText('Página no encontrada');
    await expect(page.getByRole('main')).toHaveCount(1);
    await page.getByRole('link', { name: 'Volver al panel' }).click();
    await page.waitForURL(/\/portal\/dashboard$/);
  });

  test('sesión vencida: el acceso lo dice y, al entrar, vuelve a la ruta pedida', async ({ page }) => {
    await page.goto('/login?returnUrl=%2Fportal%2Fpersonaje&motivo=sesion-expirada');
    await expect(page.getByRole('status').filter({ hasText: 'Tu sesión expiró. Inicia sesión nuevamente.' })).toBeVisible();
    await page.locator('input[type="email"]').last().fill('estudiante@psychosim.edu.co');
    await page.locator('input[type="password"]').last().fill('Estudiante123!');
    await page.getByRole('button', { name: /^ingresar$/i }).click();
    await page.waitForURL(/\/portal\/personaje$/, { timeout: 30_000 });
  });
});

// req: BLOQUE-H (enlaces de salto), RNF-004
test.describe('@estructura enlaces de salto', () => {
  test('escritorio: el primer Tab muestra «Saltar al contenido principal» y lleva al <main>; el segundo, a la navegación', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, 'profesor');
    await page.goto('/portal/dashboard');
    await settle(page);
    await page.keyboard.press('Tab');
    const toMain = page.getByRole('link', { name: 'Saltar al contenido principal' });
    await expect(toMain).toBeFocused();
    await expect(toMain).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();

    await page.reload();
    await settle(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const toNav = page.getByRole('link', { name: 'Saltar a la navegación' });
    await expect(toNav).toBeFocused();
    await expect(toNav).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('header.cromo .modulo-principal').getByRole('link', { name: 'Panel', exact: true })).toBeFocused();
  });

  test('teléfono: «Saltar a la navegación» lleva a la primera pestaña de abajo', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, 'estudiante');
    await page.goto('/portal/simulador');
    await settle(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Saltar a la navegación' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('header.cromo nav.modulo-inferior').getByRole('link', { name: 'Panel', exact: true })).toBeFocused();
  });
});

/**
 * Caja del foco frente a las barras fijas. null si el foco está en la barra, en un enlace de salto o en el cuerpo.
 * `tapa` = borde inferior de lo que hay arriba (píldora y módulos, que caen 6 px al desplazarse); `suelo` = borde
 * superior de la barra inferior visible (móvil) o el alto del viewport.
 */
async function focusAgainstBars(page: Page): Promise<{ what: string; top: number; bottom: number; tapa: number; suelo: number } | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el.closest('header.cromo, .psy-skip-link')) return null;
    const box = el.getBoundingClientRect();
    if (!box.width && !box.height) return null;
    const tapa = Math.max(...[...document.querySelectorAll('header.cromo .bandeja, header.cromo .modulo')]
      .map(node => node.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0)
      .map(rect => rect.bottom));
    const bottomBar = document.querySelector<HTMLElement>('header.cromo nav.modulo-inferior:not([hidden])');
    const bottomRect = bottomBar?.getBoundingClientRect();
    const suelo = bottomRect && bottomRect.height > 0 ? bottomRect.top : window.innerHeight;
    return { what: `${el.tagName.toLowerCase()} «${(el.textContent ?? '').trim().slice(0, 40)}»`, top: box.top, bottom: box.bottom, tapa, suelo };
  });
}

/**
 * html lleva scroll-behavior: smooth: el desplazamiento por foco se anima. Se mide cuando se queda quieto, y nunca
 * antes de 250 ms (con la máquina cargada la animación tarda en empezar y tres fotogramas quietos no bastan).
 */
async function scrollSettled(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => {
    const start = performance.now();
    const deadline = start + 2_000;
    let last = Number.NaN;
    let still = 0;
    const tick = () => {
      const y = window.scrollY;
      still = y === last ? still + 1 : 0;
      last = y;
      if ((still >= 3 && performance.now() - start >= 250) || performance.now() > deadline) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}

async function tabAndCheck(page: Page, key: 'Tab' | 'Shift+Tab', steps: number): Promise<void> {
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press(key);
    await scrollSettled(page);
    const result = await focusAgainstBars(page);
    if (!result) continue;
    expect.soft(result.top, `${key} ${i + 1}: ${result.what} no queda bajo la barra de arriba`).toBeGreaterThanOrEqual(result.tapa - 1);
    expect.soft(result.bottom, `${key} ${i + 1}: ${result.what} no queda bajo la barra de abajo`).toBeLessThanOrEqual(result.suelo + 1);
  }
}

// req: BLOQUE-H (H-19, WCAG 2.4.11 foco no tapado)
test.describe('@estructura H-19: el foco nunca queda bajo la barra fija', () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`portada ${viewport.width}×${viewport.height}: Tab hacia abajo y Mayús+Tab de vuelta`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await page.goto('/');
      await settle(page);
      await tabAndCheck(page, 'Tab', 30);
      await tabAndCheck(page, 'Shift+Tab', 30);
    });
  }

  /**
   * El caso que de verdad tapa: un destino DENTRO de la ventana pero bajo una barra. Chrome lo da por visible y no
   * se desplaza, salvo que scroll-padding le diga cuánto ocupa la barra. Se deja el destino a 12 px del borde (bajo
   * la barra de arriba) o a 12 px del pie (bajo la de abajo en el teléfono) y se le da el foco con Tab.
   */
  for (const { viewport, edge } of [
    { viewport: { width: 1440, height: 900 }, edge: 'arriba' as const },
    { viewport: { width: 390, height: 844 }, edge: 'arriba' as const },
    { viewport: { width: 390, height: 844 }, edge: 'abajo' as const },
  ]) {
    test(`portada ${viewport.width}×${viewport.height}: un destino tapado ${edge} sale de debajo al recibir el foco`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await settle(page);
      const placed = await page.evaluate(where => {
        const tabbable = [...document.querySelectorAll<HTMLElement>('main a[href], main button:not([disabled]), main [tabindex="0"]')]
          .filter(el => el.getBoundingClientRect().height > 0);
        const html = document.documentElement;
        const maxScroll = html.scrollHeight - window.innerHeight;
        for (let i = 1; i < tabbable.length; i += 1) {
          const box = tabbable[i].getBoundingClientRect();
          const docTop = box.top + window.scrollY;
          const y = where === 'arriba' ? docTop - 12 : docTop + box.height + 12 - window.innerHeight;
          if (y < 100 || y > maxScroll) continue;
          html.style.scrollBehavior = 'auto';
          window.scrollTo(0, y);
          html.style.removeProperty('scroll-behavior');
          tabbable[i - 1].focus({ preventScroll: true });
          return true;
        }
        return false;
      }, edge);
      expect(placed, 'hay un destino que se puede dejar bajo la barra').toBe(true);
      // El anterior pudo quedar fuera de la ventana: lo que importa es el destino que recibe el foco. El desplazamiento
      // es suave y con la máquina cargada tarda en empezar: se espera a que el destino TERMINE fuera de la barra (sin
      // scroll-padding Chrome no se desplaza nunca y la espera vence).
      await page.keyboard.press('Tab');
      expect(await focusAgainstBars(page), 'el foco quedó en un destino de la página').not.toBeNull();
      await expect.poll(async () => {
        const result = (await focusAgainstBars(page))!;
        return edge === 'arriba' ? result.top - (result.tapa - 1) : (result.suelo + 1) - result.bottom;
      }, { message: `el destino enfocado no queda bajo la barra de ${edge}`, timeout: 3_000 }).toBeGreaterThanOrEqual(0);
    });
  }

  test('panel del docente 1440×900: Mayús+Tab desde el final', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, 'profesor');
    await page.goto('/portal/dashboard');
    await settle(page);
    // Sin foco, Mayús+Tab empieza por el último elemento enfocable (al final de la página).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await tabAndCheck(page, 'Shift+Tab', 25);
  });
});
