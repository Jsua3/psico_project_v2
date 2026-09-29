import { test, expect, Page } from '@playwright/test';

/**
 * Tipografía autoalojada: Poppins y JetBrains Mono deben cargarse desde
 * /assets/fonts y no caer a la fuente del sistema.
 */

async function loadedFamilies(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter(face => face.status === 'loaded')
      .map(face => `${face.family.replace(/"/g, '')}:${face.weight}`);
  });
}

for (const path of ['/', '/login']) {
  test(`Poppins se carga desde el propio servidor en ${path}`, async ({ page }) => {
    const fontRequests: string[] = [];
    page.on('request', request => {
      if (request.resourceType() === 'font') fontRequests.push(request.url());
    });

    await page.goto(path);
    await page.evaluate(() => {
      const probe = document.createElement('p');
      probe.id = 'font-probe';
      probe.textContent = 'Sesión ¿Qué? ¡Ñandú! «Güelcome» — acción…';
      probe.style.fontWeight = '800';
      document.body.appendChild(probe);
    });

    const families = await loadedFamilies(page);
    expect(families).toContain('Poppins:400');
    expect(families).toContain('Poppins:800');

    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFont.replace(/"/g, '')).toMatch(/^Poppins\b/);

    const poppinsRequests = fontRequests.filter(url => url.includes('/assets/fonts/poppins-latin-'));
    expect(poppinsRequests.length).toBeGreaterThan(0);
    for (const url of fontRequests) {
      expect(new URL(url).host).toBe(new URL(page.url()).host);
    }
  });
}
