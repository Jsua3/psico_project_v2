import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

describe('simulation-play: introducción', () => {
  it('la intro es una escena animada en código, no un video', () => {
    expect(source).toContain('<app-case-intro-scene [reduceMotion]="reduceMotion()" />');
    expect(source).not.toContain('<video');
    expect(source).not.toContain('fondoHabitacion');
    expect(existsSync(join(__dirname, '../../../assets/video/fondoHabitacion.mp4'))).toBe(false);
  });

  it('conserva el contrato de los e2e: «Antes de comenzar» con un botón «Continuar»', () => {
    expect(source).toContain('<h2 id="intro-scene-title">Antes de comenzar</h2>');
    expect(source).toMatch(/\(click\)="continueFromIntroScene\(\)">\s*Continuar\s*<\/button>/);
    expect(source).not.toContain('Saltar video');
  });

  it('ninguna tarjeta nombra la pista interna y ambas permiten silenciar la música', () => {
    expect(source).not.toContain('está sonando');
    expect(source).not.toContain('PsicoLament');
    const toggles = source.match(/class="intro-music-toggle" \[attr\.aria-pressed\]="musicMuted\(\)" \(click\)="toggleMusicMute\(\)"/g) ?? [];
    expect(toggles).toHaveLength(2);
  });

  it('los anuncios de música llevan tilde', () => {
    expect(source).toContain("'Música silenciada.'");
    expect(source).toContain("'Música activada.'");
  });

  it('en pantallas angostas la escena se recorta en vez de ensanchar la tarjeta', () => {
    // Con la pista «auto» del grid el escenario (384 px) ensancharía la columna y no habría recorte.
    expect(source).toMatch(/\.case-intro-card__media\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('la etiqueta del botón de música no hereda el estilo del texto de apoyo del pie', () => {
    expect(source).toContain('.case-intro-card__actions > span {');
    expect(source).not.toContain('.case-intro-card__actions span {');
  });
});
