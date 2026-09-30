import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(__dirname, '../index.html'), 'utf-8');

describe('index.html: pantalla de arranque', () => {
  it('vive dentro de <app-root> para que Angular la reemplace al arrancar', () => {
    expect(html).toMatch(/<app-root>\s*<div class="siep-boot" role="status">/);
    expect(html).toContain('<p class="siep-boot__label">Cargando SIEP…</p>');
  });

  it('aparece con retraso para no destellar en cargas rápidas y respeta el movimiento reducido', () => {
    expect(html).toContain('animation: siep-boot-in 240ms ease-out 200ms both;');
    expect(html).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.siep-boot__bar::after \{ animation: none;/);
  });

  it('ofrece recargar si el arranque se atasca y avisa sin JavaScript', () => {
    expect(html).toContain('<div class="siep-boot__slow" hidden>');
    expect(html).toContain('<button type="button" class="siep-boot__reload" onclick="location.reload()">Recargar</button>');
    expect(html).toMatch(/setTimeout\(function \(\) \{[\s\S]*?\.siep-boot__slow[\s\S]*?\}, 12000\);/);
    expect(html).toMatch(/<\/app-root>\s*<noscript>\s*<p[^>]*>\s*SIEP necesita JavaScript para funcionar/);
  });

  it('sin JavaScript oculta la pantalla de arranque (fija a pantalla completa) para que se lea el aviso de <noscript>', () => {
    // El <noscript><style> del <head> debe ir DESPUÉS de la regla .siep-boot { del <style> principal: el orden de cascada lo hace efectivo.
    expect(html).toMatch(/<head>[\s\S]*\.siep-boot \{[\s\S]*<noscript>\s*<style>\s*\.siep-boot \{ display: none; \}\s*<\/style>\s*<\/noscript>[\s\S]*<\/head>/);
  });

  it('usa los colores de la marca', () => {
    for (const color of ['#F2F2F2', '#004876', '#5F6B76']) expect(html).toContain(color);
  });
});
