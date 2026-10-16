import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { runAxe } from './support/quality-gates';
import { TOUR_SCREENS, loginAs, openScreen } from './support/screen-tour';
import type { SignedRole } from './support/screen-tour';
import { scanUi } from './support/ui-scan';
import { scaled } from './support/time-scale';

/**
 * Modos del sistema (plan visual F9-2, TOO-4; RNF-04, WCAG 1.4.1, 1.4.11, 2.3.3): la misma interfaz con movimiento
 * reducido, con colores forzados (alto contraste de Windows) y con contraste aumentado. Por cada modo, en pantallas
 * representativas de cada rol: Axe sin serious ni critical, sin texto < 12 px ni objetivos < 24 px, y lo propio del modo:
 *  - movimiento reducido: ninguna animación ni transición dura más que la red de seguridad de 1 ms (salvo el fundido de
 *    opacidad y la barra de vidrio, que declara su propia política), medido en los estilos computados —no en lo que
 *    casualmente corre— y por tanto igual en cada pantalla;
 *  - colores forzados: el primer control REAL de la pantalla conserva un contorno de foco visible;
 *  - contraste aumentado: el borde normal se resuelve como el borde fuerte.
 * Cada sonda tiene su prueba de control (`@a11y-modes sonda`): sin la preferencia, o con el contorno quitado, la misma
 * sonda tiene que ver lo contrario; si no, el modo «pasaría» sin medir nada.
 */
const SCREENS = new Set(['portada', 'acceso', 'panel', 'catalogo', 'rubricas', 'editor-caso']);
const MODES = [
  { name: 'movimiento reducido', options: { reducedMotion: 'reduce' as const } },
  { name: 'colores forzados', options: { forcedColors: 'active' as const } },
  { name: 'contraste aumentado', options: { contrast: 'more' as const } },
];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * El primer control de la pantalla que una persona usa: dentro de `main` (el enlace de «Saltar al contenido» vive
 * fuera de pantalla y trae su propio contorno, así que no sirve de muestra) y a la vista.
 */
const REAL_CONTROL = 'main :is(a[href], button, input:not([type="hidden"]), select, textarea, [role="tab"])';

/**
 * Animaciones y transiciones cuya duración supera 1,5 ms (la red de seguridad vale 1 ms); el fundido de opacidad se
 * admite. La barra de vidrio (`.cromo`) queda fuera A PROPÓSITO (decisión del usuario, 2026-10-16): su receta declara su
 * propia política con movimiento reducido —«se anula el DESPLAZAMIENTO, no el reloj» (`tokens/_glass-bar.scss`)—, así que
 * conserva fundidos de color de 200 ms y la transición de `gap` y de ancho de sus cápsulas.
 */
async function slowMotion(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const toMs = (value: string) => (value.trim().endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000);
    const found: string[] = [];
    for (const element of Array.from(document.querySelectorAll('*'))) {
      if (element.closest('.cromo')) continue;
      for (const pseudo of [null, '::before', '::after'] as const) {
        const style = pseudo ? getComputedStyle(element, pseudo) : getComputedStyle(element);
        const who = `${element.tagName.toLowerCase()}${pseudo ?? ''}`;
        const names = style.animationName.split(',').map(item => item.trim());
        const spans = style.animationDuration.split(',').map(toMs);
        names.forEach((name, index) => {
          const ms = spans[index % spans.length];
          if (name !== 'none' && ms > 1.5) found.push(`${who} animación ${name} ${ms.toFixed(0)} ms`);
        });
        const props = style.transitionProperty.split(',').map(item => item.trim());
        const times = style.transitionDuration.split(',').map(toMs);
        props.forEach((prop, index) => {
          const ms = times[index % times.length];
          if (prop !== 'none' && prop !== 'opacity' && ms > 1.5) found.push(`${who} transición ${prop} ${ms.toFixed(0)} ms`);
        });
      }
    }
    return found;
  });
}

/** Enfoca el primer control real y devuelve su contorno; `found: false` si la pantalla no ofrece ninguno. */
async function focusRing(page: Page): Promise<{ found: boolean; style: string; width: number; label: string }> {
  const target = page.locator(REAL_CONTROL).filter({ visible: true }).first();
  if (!(await target.count())) return { found: false, style: 'none', width: 0, label: '' };
  await target.focus();
  return target.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      found: true,
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      label: `${element.tagName.toLowerCase()} «${(element.textContent ?? element.getAttribute('aria-label') ?? '').trim().slice(0, 30)}»`,
    };
  });
}

/** ¿Se resuelven igual `--ds-border` y `--ds-border-strong`? Con «más contraste», sí. */
async function bordersMerged(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const colorOf = (token: string) => {
      const probe = document.createElement('div');
      probe.setAttribute('style', `position:absolute;visibility:hidden;border:2px solid var(${token})`);
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).borderTopColor;
      probe.remove();
      return color;
    };
    return colorOf('--ds-border') === colorOf('--ds-border-strong');
  });
}

for (const mode of MODES) {
  test.describe(`@a11y-modes ${mode.name}`, () => {
    test.use({ ...mode.options, viewport: { width: 1280, height: 800 } });

    for (const role of ['publico', 'profesor', 'admin'] as const) {
      // req: RNF-04, WCAG 1.4.11, WCAG 2.3.3
      test(`${role}: pantallas representativas sin violaciones serias ni objetivos pequeños`, async ({ page }) => {
        test.setTimeout(scaled(6 * 60_000));
        if (role !== 'publico') await loginAs(page, role as SignedRole);
        const problems: string[] = [];
        let controlsSeen = 0;
        for (const screen of TOUR_SCREENS.filter(item => item.role === role && SCREENS.has(item.id))) {
          await openScreen(page, screen);
          await page.waitForTimeout(300);
          const axe = await runAxe(page, { tags: TAGS, resultTypes: ['violations'] });
          for (const violation of axe.violations) {
            if (violation.impact === 'serious' || violation.impact === 'critical') {
              problems.push(`${role}/${screen.id}: ${violation.id} [${violation.impact}] ×${violation.nodes.length}`);
            }
          }
          const scan = await scanUi(page);
          problems.push(...scan.smallText.map(item => `${role}/${screen.id}: texto < 12 px · ${item}`));
          problems.push(...scan.smallTargets.map(item => `${role}/${screen.id}: objetivo < 24 px · ${item}`));

          if (mode.options.reducedMotion) {
            const slow = await slowMotion(page);
            if (slow.length) problems.push(`${role}/${screen.id}: movimiento con duración en movimiento reducido · ${slow.slice(0, 4).join(', ')}`);
          }
          if (mode.options.forcedColors) {
            const ring = await focusRing(page);
            // Una pantalla sin controles dentro de main (un listado vacío) no mide nada; el rol entero sí tiene que medir.
            if (ring.found) {
              controlsSeen++;
              if (ring.style === 'none' || ring.width < 1) problems.push(`${role}/${screen.id}: sin contorno de foco con colores forzados · ${ring.label}`);
            }
          }
          if (mode.options.contrast && !(await bordersMerged(page))) {
            problems.push(`${role}/${screen.id}: con más contraste el borde normal no se resuelve como el fuerte`);
          }
        }
        expect(problems.slice(0, 40), 'cifras fuera de criterio').toEqual([]);
        if (mode.options.forcedColors) expect(controlsSeen, 'las pantallas representativas ofrecen controles que medir').toBeGreaterThan(0);
      });
    }
  });
}

// ─── Pruebas de control: cada sonda tiene que poder ver lo contrario cuando falta la preferencia ─────────────────
test.describe('@a11y-modes sonda movimiento reducido', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });

  // req: RNF-04, WCAG 2.3.3
  test('con la preferencia no queda movimiento con duración; sin ella la misma sonda lo ve', async ({ page }) => {
    await loginAs(page, 'admin');
    await openScreen(page, TOUR_SCREENS.find(item => item.id === 'panel')!);
    expect(await slowMotion(page), 'con movimiento reducido').toEqual([]);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(100);
    expect((await slowMotion(page)).length, 'sin la preferencia la sonda tiene que ver transiciones').toBeGreaterThan(0);
  });
});

test.describe('@a11y-modes sonda colores forzados', () => {
  test.use({ forcedColors: 'active', viewport: { width: 1280, height: 800 } });

  // req: RNF-04, WCAG 1.4.11
  test('el contorno del primer control real se ve y la sonda detecta que se lo quiten', async ({ page }) => {
    await openScreen(page, TOUR_SCREENS.find(item => item.id === 'acceso')!);
    const ring = await focusRing(page);
    expect(ring.found, 'la pantalla de acceso ofrece un control dentro de main').toBe(true);
    expect(ring.style, ring.label).not.toBe('none');
    expect(ring.width, ring.label).toBeGreaterThanOrEqual(1);

    await page.addStyleTag({ content: `${REAL_CONTROL} { outline: none !important; }` });
    const removed = await focusRing(page);
    expect(removed.style === 'none' || removed.width < 1, 'con el contorno quitado la sonda debe verlo').toBe(true);
  });
});

test.describe('@a11y-modes sonda contraste aumentado', () => {
  test.use({ contrast: 'more', viewport: { width: 1280, height: 800 } });

  // req: RNF-04, WCAG 1.4.11
  test('con más contraste el borde normal es el fuerte; sin la preferencia, no', async ({ page }) => {
    await openScreen(page, TOUR_SCREENS.find(item => item.id === 'acceso')!);
    expect(await bordersMerged(page), 'con más contraste').toBe(true);

    await page.emulateMedia({ contrast: 'no-preference' });
    await page.waitForTimeout(100);
    expect(await bordersMerged(page), 'sin la preferencia el borde fuerte se distingue del normal').toBe(false);
  });
});
