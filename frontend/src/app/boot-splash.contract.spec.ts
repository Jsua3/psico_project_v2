import { readFileSync } from 'fs';
import { join } from 'path';

// La pantalla de arranque vive en index.html (marcado), assets/boot.css (estilos) y assets/boot.js (comportamiento):
// desde S2-4 (plan 03) index.html no lleva <style>, <script> ni atributos en línea, para que la CSP no necesite
// 'unsafe-inline' (la prueba index.csp.contract.spec.ts lo vigila).
const html = readFileSync(join(__dirname, '../index.html'), 'utf-8');
const css = readFileSync(join(__dirname, '../assets/boot.css'), 'utf-8');
const noscriptCss = readFileSync(join(__dirname, '../assets/boot-noscript.css'), 'utf-8');
const script = readFileSync(join(__dirname, '../assets/boot.js'), 'utf-8');

describe('index.html: pantalla de arranque', () => {
  it('vive dentro de <app-root> para que Angular la reemplace al arrancar', () => {
    expect(html).toMatch(/<app-root[^>]*>\s*<div class="siep-boot" role="status">/);
    expect(html).toContain('<p class="siep-boot__label">Cargando SIEP…</p>');
  });

  it('aparece con retraso para no destellar en cargas rápidas y respeta el movimiento reducido', () => {
    expect(css).toContain('animation: siep-boot-in 240ms ease-out 200ms both;');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.siep-boot__bar::after \{ animation: none;/);
  });

  it('enlaza su hoja de estilos externa en el <head>', () => {
    expect(html).toMatch(/<head>[\s\S]*<link rel="stylesheet" href="\/assets\/boot\.css">[\s\S]*<\/head>/);
  });

  it('ofrece recargar si el arranque se atasca y avisa sin JavaScript', () => {
    expect(html).toContain('<div class="siep-boot__slow" hidden>');
    // El botón ya no lleva onclick: el script externo le añade el oyente.
    expect(html).toContain('<button type="button" class="siep-boot__reload">Recargar</button>');
    expect(html).toContain('<script src="/assets/boot.js" defer></script>');
    expect(script).toContain("document.querySelector('.siep-boot .siep-boot__reload')");
    expect(script).toMatch(/addEventListener\('click', function \(\) \{\s*location\.reload\(\);/);
    expect(script).toMatch(/setTimeout\(function \(\) \{[\s\S]*?\.siep-boot__slow[\s\S]*?\}, 12000\);/);
    expect(html).toMatch(/<\/app-root>\s*<noscript>\s*<p[^>]*>\s*SIEP necesita JavaScript para funcionar/);
  });

  it('sin JavaScript oculta la pantalla de arranque (fija a pantalla completa) para que se lea el aviso de <noscript>', () => {
    // La hoja de <noscript> debe enlazarse DESPUÉS de boot.css: el orden de cascada la hace efectiva.
    expect(html).toMatch(
      /<head>[\s\S]*href="\/assets\/boot\.css"[\s\S]*<noscript>\s*<link rel="stylesheet" href="\/assets\/boot-noscript\.css">\s*<\/noscript>[\s\S]*<\/head>/,
    );
    expect(css).toMatch(/\.siep-boot \{/);
    expect(noscriptCss).toMatch(/\.siep-boot \{ display: none; \}/);
    // El aviso del cuerpo usa una clase de la hoja externa (antes llevaba un atributo style).
    expect(html).toContain('<p class="siep-noscript">');
    expect(css).toMatch(/\.siep-noscript \{/);
  });

  it('usa los colores de la marca', () => {
    for (const color of ['#F2F2F2', '#004876', '#5F6B76']) expect(css).toContain(color);
  });
});
