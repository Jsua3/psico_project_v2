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

describe('login: nombres accesibles y roles', () => {
  // F3-4: el enlace fijo propio dejó paso a la barra pública compartida (app-public-bar, modo «acceso»), cuyo
  // «Volver al inicio» se nombra por su texto visible (WCAG 2.5.3; probado en DOM en public-bar.component.spec.ts).
  it('la cabecera del acceso es la barra pública compartida, fuera del <main>', () => {
    expect(html.indexOf('<app-public-bar mode="acceso" />')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('<app-public-bar mode="acceso" />')).toBeLessThan(html.indexOf('<main'));
    expect(html).not.toContain('siep-login__back');
  });

  it('el selector de perfil es un grupo de botones, no un radiogroup sin radios', () => {
    expect(html).toContain('<div class="auth-role-picker" role="group" aria-label="Seleccionar rol de acceso">');
    expect(html).not.toContain('radiogroup');
  });

  it('los tres campos del registro tienen nombre accesible propio', () => {
    for (const label of ['Nombre', 'Apellido', 'Correo institucional']) {
      expect(html).toContain(`placeholder="${label}" aria-label="${label}"`);
    }
  });
});
