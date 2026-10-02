import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'shell.component.ts'), 'utf-8');

describe('shell: menú móvil accesible', () => {
  it('el panel cerrado es inerte y está identificado', () => {
    expect(source).toMatch(/class="siep-mobile-nav"[^>]*id="siep-mobile-nav"/);
    expect(source).toContain('[attr.inert]="menuOpen ? null : \'\'"');
    expect(source).toContain('aria-label="Navegación móvil SIEP"');
  });

  it('el botón anuncia su estado y a qué controla', () => {
    expect(source).toContain('aria-controls="siep-mobile-nav"');
    expect(source).toContain('[attr.aria-expanded]="menuOpen"');
    expect(source).toContain('aria-label="Abrir menú de navegación"');
    expect(source).toContain('aria-label="Cerrar menú de navegación"');
  });

  it('Esc cierra el menú y devuelve el foco al botón', () => {
    expect(source).toContain("@HostListener('document:keydown.escape')");
    expect(source).toMatch(/onEscape\(\): void \{\s*if \(!this\.menuOpen\) return;\s*this\.closeMenu\(\);\s*this\.menuTrigger\?\.nativeElement\.focus\(\);/);
  });

  it('el foco se reintenta hasta que el botón vuelve a ser visible', () => {
    // Con el menú abierto el botón está en visibility:hidden; un focus() inmediato no surte efecto.
    expect(source).toMatch(/this\.menuTrigger\?\.nativeElement\.focus\(\);\s*this\.retryTriggerFocus\(\);/);
    expect(source).toContain('requestAnimationFrame(() => {');
  });
});
