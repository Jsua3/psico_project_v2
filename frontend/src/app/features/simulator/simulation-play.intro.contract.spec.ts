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

  it('«Simulación formativa con datos ficticios» conserva su estilo de chip con clase propia', () => {
    expect(source).toContain('<span class="case-intro-card__chip">Simulación formativa con datos ficticios</span>');
    expect(source).toMatch(/\.case-intro-card__chip\s*\{[^}]*border-radius:\s*999px[^}]*background:\s*rgba\(108,192,199,\.1\)/);
    // Un selector por etiqueta del encabezado alcanzaría también al texto del botón de silenciar.
    expect(source).not.toMatch(/\.case-intro-card__header span\s*\{/);
  });

  it('la etiqueta del botón de música no hereda el estilo del texto de apoyo del pie', () => {
    expect(source).toContain('.case-intro-card__actions > span {');
    expect(source).not.toContain('.case-intro-card__actions span {');
  });
});

describe('simulation-play: salida segura alcanzable desde cada superposición (REGLA-004)', () => {
  const introScene = source.slice(source.indexOf('id="intro-scene-title"'), source.indexOf('id="case-intro-title"'));
  const caseIntro = source.slice(source.indexOf('id="case-intro-title"'), source.indexOf('<header class="top-bar"'));

  it('las dos tarjetas de la introducción ofrecen «Salida segura» a la izquierda de «Continuar»', () => {
    const intoPause = /<app-safe-exit-button \(pause\)="pauseFromOverlay\(\)" \/>\s*<button cdkFocusInitial class="psy-button psy-button--primary" type="button" \(click\)="continueFrom(IntroScene|CaseIntro)\(\)">/;
    expect(introScene).toMatch(intoPause);
    expect(caseIntro).toMatch(intoPause);
  });

  it('el foco inicial de las tarjetas sigue en «Continuar», no en la salida', () => {
    expect(introScene.match(/cdkFocusInitial/g)).toHaveLength(1);
    expect(caseIntro.match(/cdkFocusInitial/g)).toHaveLength(1);
  });

  it('los dos paneles de diálogo y la bitácora conectan su salida segura al método nuevo', () => {
    const panels = source.match(/<app-dialogue-panel[^>]*?\/>/g) ?? [];
    expect(panels).toHaveLength(2);
    for (const panel of panels) expect(panel).toContain('(safeExit)="pauseFromOverlay()"');
    expect(source).toMatch(/<app-journal-panel[^>]*\(safeExit\)="pauseFromOverlay\(\)"/);
  });

  it('los dos paneles de diálogo reciben el token que libera la opción elegida tras un fallo', () => {
    const panels = source.match(/<app-dialogue-panel[^>]*?\/>/g) ?? [];
    expect(panels).toHaveLength(2);
    for (const panel of panels) expect(panel).toContain('[releaseToken]="dialogueReleaseToken()"');
  });

  it('el botón del pie acepta el toque con una petición en curso y su nombre no dice «(Escape)»', () => {
    const footerButton = source.match(/<button class="safe-exit"[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(footerButton).toContain('(click)="pauseFromOverlay()"');
    expect(footerButton).not.toContain('[disabled]');
    expect(footerButton).toContain("'Pausando…'");
    expect(source).not.toContain('Salida segura (Escape)');
  });

  it('el botón del pie no pisa su nombre con un aria-label: el texto visible es el nombre (WCAG 2.5.3)', () => {
    const footerButton = source.match(/<button class="safe-exit"[\s\S]*?<\/button>/)?.[0] ?? '';
    // Con aria-label «Salida segura» y la tecla «Esc» visible, axe 4.14 marca label-content-name-mismatch.
    expect(footerButton).not.toContain('aria-label');
    // El texto que da el nombre sigue ahí, y la tecla queda fuera del árbol de accesibilidad.
    expect(footerButton).toContain("<strong>{{ pausing() ? 'Pausando…' : 'Salida segura' }}</strong>");
    expect(footerButton).toContain('<kbd aria-hidden="true">Esc</kbd>');
  });

  it('la pausa pedida tiene un acuse visible que no depende del pie (oculto bajo una superposición)', () => {
    const notice = source.match(/@if \(pausing\(\)\) \{[\s\S]*?\n      \}\n/)?.[0] ?? '';
    expect(notice).toContain('class="pausing-notice"');
    expect(notice).toContain('Pausando el caso…');
    // El acuse es estático: sin temporizadores ni animación (nada esencial se cierra solo).
    expect(source).not.toMatch(/\.pausing-notice\s*\{[^}]*animation/);
  });

  it('el aviso de contenido no promete una salida que el estudiante no tiene a mano', () => {
    expect(source).toContain('con el botón «Salida segura»');
    expect(source).not.toContain('Durante el caso tendrás disponible la salida segura');
  });

  it('el aviso de contenido sigue tragándose Esc (ETH-01): su rama no llama a pauseFromOverlay', () => {
    const branch = source.match(/if \(this\.showContentWarning\(\)\) \{[\s\S]*?\n    \}\n/)?.[0] ?? '';
    expect(branch).toContain("event.key === 'Escape'");
    expect(branch).not.toContain('pauseFromOverlay');
  });
});
