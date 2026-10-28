import type { Page } from '@playwright/test';

/**
 * Escáner de estilos computados (plan visual F9-2; RNF-04, WCAG 1.4.4 y 2.5.8): lo que se PINTA, no lo que dice el CSS.
 * Texto visible por debajo de 12 px (fuera del canvas) y objetivos interactivos por debajo de 24 px (mínimo AA) y de
 * 44 px (táctil). Los enlaces en línea dentro de un texto y lo oculto o recortado no cuentan. Un control con
 * `data-equivalente` (las piezas de una sala dibujadas a escala, que se manejan también desde la lista «En esta sala» y sus
 * botones, de 44 px) no cuenta contra el mínimo táctil de 44 px —WCAG 2.5.8, excepción «equivalente»—, pero SÍ contra el de 24 px.
 */
export interface UiScan {
  smallText: string[];
  smallTargets: string[];
  touchTargets: string[];
}

export async function scanUi(page: Page): Promise<UiScan> {
  return page.evaluate(() => {
    const isVisible = (element: Element): boolean => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };
    const label = (element: Element, extra: string): string => {
      const hint = element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('name')
        || (element.closest('label')?.textContent ?? '').trim().slice(0, 24);
      return `${element.tagName.toLowerCase()}.${String((element as HTMLElement).className ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.')} ${extra}${hint ? ` «${hint}»` : ''}`;
    };

    const smallText = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest('canvas, script, style, noscript, [aria-hidden="true"]') || !isVisible(parent)) continue;
      const size = Number.parseFloat(getComputedStyle(parent).fontSize);
      if (size < 12) smallText.add(label(parent, `${size}px «${text.slice(0, 24)}»`));
    }

    const smallTargets = new Set<string>();
    const touchTargets = new Set<string>();
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"]';
    for (const element of Array.from(document.querySelectorAll(selector))) {
      if (!isVisible(element) || element.closest('[aria-hidden="true"]')) continue;
      if (element.tagName === 'A' && getComputedStyle(element).display === 'inline') continue;
      let rect = element.getBoundingClientRect();
      // Una casilla o un radio pequeños se activan por su etiqueta: cuenta la mayor de las dos cajas.
      if (element instanceof HTMLInputElement && /^(checkbox|radio)$/.test(element.type)) {
        const labelBox = (element.labels?.[0] ?? element.closest('label'))?.getBoundingClientRect();
        if (labelBox && labelBox.width * labelBox.height > rect.width * rect.height) rect = labelBox;
      }
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width < 24 || height < 24) smallTargets.add(label(element, `${width}x${height}`));
      else if ((width < 44 || height < 44) && !element.hasAttribute('data-equivalente')) touchTargets.add(label(element, `${width}x${height}`));
    }
    return { smallText: Array.from(smallText), smallTargets: Array.from(smallTargets), touchTargets: Array.from(touchTargets) };
  });
}
