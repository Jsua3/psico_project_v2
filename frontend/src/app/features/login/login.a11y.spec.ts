import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(__dirname, 'login.component.html'), 'utf-8');
const scss = readFileSync(join(__dirname, 'login.component.scss'), 'utf-8');

describe('login: accesibilidad de los paneles', () => {
  it('el formulario y el panel que no se ven son inertes', () => {
    expect(html).toContain('<div class="form-container sign-up" [attr.inert]="showRegister() ? null : \'\'">');
    expect(html).toContain('<div class="form-container sign-in" [attr.inert]="showRegister() ? \'\' : null">');
    expect(html).toContain('<div class="toggle-panel toggle-left" [attr.inert]="showRegister() ? null : \'\'">');
    expect(html).toContain('<div class="toggle-panel toggle-right" [attr.inert]="showRegister() ? \'\' : null">');
  });

  it('solo los formularios tienen h1; los paneles usan h2', () => {
    expect((html.match(/<h1\b/g) ?? []).length).toBe(2);
    expect(html).toContain('<h2>¡Bienvenido de nuevo!</h2>');
    expect(html).toContain('<h2>¿Nuevo en {{ brand.shortName }}?</h2>');
    expect(scss).toContain('.toggle-panel h2 {');
    expect(scss).not.toContain('.toggle-panel h1 {');
  });
});
