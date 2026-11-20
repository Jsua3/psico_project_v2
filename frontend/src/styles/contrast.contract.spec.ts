import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio } from './contrast.util';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('contraste: simulador', () => {
  const play = source('../app/features/simulator/simulation-play.component.ts');
  const styles = source('./styles.scss');

  it('la tarjeta de reanudar es la tarjeta oscura de las entradas del juego, sin el vidrio claro', () => {
    expect(play).not.toContain('resume-card');
    expect(play).not.toContain('liquid-glass');
    expect(play).toMatch(/\.case-intro-card \{[^}]*background: linear-gradient\(180deg, rgba\(18,24,42,\.96\), rgba\(8,12,18,\.98\)\)/);
  });

  // req: REGLA-010 (F6-1): el CSS del juego vive en `.game-container` o en sus componentes, nunca en `<body>`.
  it('el encabezado pequeño se aclara dentro del juego con el primario de la piel, sin reglas en body', () => {
    expect(styles).not.toContain('body.game-mode');
    expect(play).toMatch(/\.game-container \.psy-eyebrow \{\s*color: var\(--ds-primary\);/);
    // El primario de la piel juego (#B69CFF) sobre la superficie más clara del juego.
    expect(contrast('#B69CFF', '#12182A')).toBeGreaterThanOrEqual(4.5);
  });

  // Las teclas ya no son una leyenda en la barra (Tarea 9): viven en la sección «Teclas» de la ayuda, que pinta
  // `.help-section__text` dentro de `.help-screen` (texto claro al 92 % sobre fondo casi negro).
  it('la ayuda de controles (sección «Teclas» de la ayuda) es legible', () => {
    const help = source('../app/features/simulator/game-help.component.ts');
    expect(play).not.toContain('context-bar__hint');
    expect(help).toMatch(/\.help-screen \{[^}]*background: rgba\(8,12,18,\.97\);[^}]*color: rgba\(232,240,244,\.92\);/);
    const size = /\.help-section__text \{[^}]*font-size: ([\d.]+)rem;/.exec(help)?.[1] ?? '0';
    expect(parseFloat(size)).toBeGreaterThanOrEqual(0.75);
    const bg = '#080C12';
    expect(contrastRatio(blend('#E8F0F4', 0.92, bg), bg)).toBeGreaterThanOrEqual(7);
  });
});

describe('contraste: avisos', () => {
  const toast = source('../app/shared/ui/toast/ui-toast-host.scss');

  // F6-1: el anfitrión de avisos vive en la capa superior, fuera de `.game-container`: hereda los tokens del portal
  // (tarjeta blanca y anillo #004876) también dentro del juego, así que el anillo claro del juego no le aplica.
  it('los avisos van sobre la tarjeta blanca del portal también en el juego: su anillo supera 3:1', () => {
    expect(toast).toMatch(/\.ui-toast \{[^}]*background: var\(--ds-surface-1\);/);
    expect(contrast('#004876', '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(contrast('#C9B3FF', '#FFFFFF')).toBeLessThan(3);
  });

  it('el foco del botón de cerrar sale del anillo global: el anfitrión no declara contornos propios', () => {
    expect(toast).not.toMatch(/outline\s*:/);
  });
});

describe('contraste: portada', () => {
  const data = source('../app/features/public/landing.component.ts');
  const scss = source('../app/features/public/landing.component.scss');
  const html = source('../app/features/public/landing.component.html');
  const accents = ['#6D28D9', '#115E59', '#9A3412', '#1D4ED8'];

  it('no quedan acentos claros que fallan AA (F4-1: ya no hay acentos por tarjeta, solo tokens)', () => {
    for (const color of ['#7c3aed', '#14b8a6', '#f97316', '#3b82f6', ...accents]) {
      expect(data).not.toContain(`'${color}'`);
    }
    expect(data).not.toMatch(/\baccent:/);
  });

  it('los acentos pasan AA como texto y como fondo de texto blanco', () => {
    for (const accent of accents) {
      expect(contrast(accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el titular no usa degradado: su palabra destacada es el violeta sólido de marca en cada modo (rediseño 2026-11-20)', () => {
    // Un texto con background-clip: text desaparece con colores forzados (§2.3 del plan visual). La tinta de acento es
    // --l-acento-tinta: oscuro = primary-hover de la piel juego (#C9B3FF); claro = accent-sim de la piel portal (#5B3FD1).
    expect(scss).not.toContain('background-clip');
    expect(scss).toMatch(/\.landing-accent \{\s*color: var\(--l-acento-tinta\);/);
    // Los tokens viven en el lenguaje común de las pantallas públicas (styles/components/_publico.scss).
    const publico = source('./components/_publico.scss');
    expect(publico).toMatch(/--l-acento-tinta: var\(--ds-primary-hover\);/);
    expect(publico).toMatch(/\.publico\[data-skin='portal'\] \{\s*color-scheme: light;\s*--l-acento-tinta: var\(--ds-accent-sim\);/);
    expect(contrast('#C9B3FF', '#0E1322')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#C9B3FF', '#151B2E')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#5B3FD1', '#F5F7FA')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#5B3FD1', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('la cabecera es la barra pública (velo de la barra, no un degradado que se desvanece) y «Ingresar» está en ella', () => {
    // F3-4: «Ingresar» vive en app-public-bar (ui-button en el módulo de cuenta; probado en public-bar.component.spec.ts).
    expect(scss).not.toContain('rgba(12, 18, 34, 0.72) 70%, transparent 100%');
    expect(html).toContain('<app-public-bar [anchors]="anchors" />');
    expect(source('../app/shared/layout/public-bar.component.ts')).toContain('<a ui-button size="md" routerLink="/login">Ingresar</a>');
  });

  it('el foco es claro en las zonas oscuras y no hay variables inexistentes', () => {
    // Revisión de F1 (C1): el token que mueve el anillo es --ds-focus (+ halo), no el alias --psy-focus.
    // F3-4: la cabecera oscura dejó paso a la barra de vidrio clara (anillo global). F4-1: el único tramo oscuro es el
    // héroe, en la piel juego, que trae su propio anillo (#C9B3FF): ya no hace falta el parche --ds-focus-on-dark.
    // Rediseño 2026-11-20: la piel (y con ella el anillo) la pone el tema en el contenedor de la página: juego (#C9B3FF)
    // en oscuro, portal (#004876) en claro.
    expect(html).toContain('<div class="landing publico" [attr.data-skin]="tema.piel()">');
    expect(contrast('#004876', '#F5F7FA')).toBeGreaterThanOrEqual(3);
    expect(scss).not.toContain('--ds-focus-on-dark');
    expect(scss).not.toContain('.landing-nav');
    expect(scss).not.toContain('--siep-primary-glow');
    expect(contrast('#C9B3FF', '#0E1322')).toBeGreaterThanOrEqual(3);
    expect(contrast('#C9B3FF', '#151B2E')).toBeGreaterThanOrEqual(3);
  });
});

describe('contraste: login', () => {
  const scss = source('../app/features/login/login.component.scss');
  const html = source('../app/features/login/login.component.html');

  // Rediseño Metafrónesis 2026-11-20: toda la página sigue al tema (claro = piel portal, oscuro = piel juego). Se mide en
  // los DOS modos sobre el peor fondo: la tarjeta (superficie al 94 % + la luz de arriba) encima del resplandor de marca
  // de la página (acento al 20 %, _publico.scss); la pista del control segmentado es texto-1 al 7 % sobre la tarjeta.
  const MODOS = {
    oscuro: { pagina: '#0E1322', superficie: '#151B2E', texto1: '#E8ECF8', texto2: '#A9B3CC', acento: '#B69CFF', tinta: '#C9B3FF', foco: '#C9B3FF', borde: '#6070A0', luz: 0.05 },
    claro: { pagina: '#F5F7FA', superficie: '#FFFFFF', texto1: '#14202E', texto2: '#4A5A6A', acento: '#5B3FD1', tinta: '#5B3FD1', foco: '#004876', borde: '#6F8296', luz: 0.035 },
  };
  type Modo = typeof MODOS.oscuro;
  const tarjeta = (m: Modo) => blend(m.texto1, m.luz, blend(m.superficie, 0.94, blend(m.acento, 0.2, m.pagina)));

  it('el foco se adapta al modo: el tema pone la piel en el contenedor y cada piel trae su anillo (rediseño Metafrónesis 2026-11-20)', () => {
    // Antes (F4-2): tarjeta en la piel portal (#004876) y panel fijo en la piel juego (data-skin="game", #C9B3FF), sin
    // parches de --ds-focus por zona. Ahora la piel es la del tema, en el contenedor de la página (REGLA-010), y el anillo
    // de cada piel llega a 3:1 sobre el peor fondo de su modo.
    expect(scss).not.toContain('--ds-focus');
    expect(html).toContain('<div class="acceso publico" [attr.data-skin]="tema.piel()">');
    expect(html).not.toContain('data-skin="game"');
    for (const m of Object.values(MODOS)) expect(contrast(m.foco, tarjeta(m))).toBeGreaterThanOrEqual(3);
    expect(contrast('#004876', '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(contrast('#C9B3FF', '#0E1322')).toBeGreaterThanOrEqual(3);
  });

  it('el checkbox conserva su contorno de foco (nada lo apaga; lo pinta el anillo global)', () => {
    // Antes el acceso quitaba los contornos y una regla propia los devolvía; F4-2 ya no los quita. Rediseño 2026-11-20:
    // la casilla dice lo que hace («Recordar mi correo»: guarda el correo, no la sesión).
    expect(scss).not.toMatch(/outline:\s*(none|0)\b/);
    expect(html).toContain('<label ui-check><input type="checkbox" formControlName="remember" /> Recordar mi correo</label>');
    expect(source('./base/_focus.scss')).toMatch(/:focus-visible \{\s*@include ds-focus-ring;/);
    expect(source('./mixins/_focus.scss')).toMatch(/@mixin ds-focus-ring[^{]*\{[^}]*outline:/);
  });

  it('en los dos modos: texto secundario y enlaces ≥ 4,5:1, y el perfil elegido y el borde del campo ≥ 3:1 (rediseño Metafrónesis 2026-11-20)', () => {
    for (const m of Object.values(MODOS)) {
      const fondo = tarjeta(m);
      const pista = blend(m.texto1, 0.07, fondo);
      expect(contrast(m.texto2, fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(m.tinta, fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(m.texto2, pista)).toBeGreaterThanOrEqual(4.5);
      // El borde fuerte del campo, contra la tarjeta (fuera) y contra su relleno (dentro): H-28 y WCAG 1.4.11.
      expect(contrast(m.borde, fondo)).toBeGreaterThanOrEqual(3);
      expect(contrast(m.borde, blend(m.texto1, 0.04, m.superficie))).toBeGreaterThanOrEqual(3);
    }
    // El filo del pulgar del control segmentado: texto secundario en oscuro (el borde fuerte daría 2,5:1) y borde fuerte
    // en claro; así el estado elegido no depende solo de la sombra ni del peso de la letra.
    expect(scss).toMatch(/\.acceso \{[^}]*--acceso-pulgar-filo: var\(--ds-text-2\);/);
    expect(scss).toMatch(/\.acceso\[data-skin='portal'\] \{[^}]*--acceso-pulgar-filo: var\(--ds-border-strong\);/);
    expect(scss).toMatch(/\.acceso__roles::before \{\s*background: var\(--acceso-pulgar\);\s*box-shadow:\s*inset 0 0 0 1px var\(--acceso-pulgar-filo\)/);
    expect(contrast(MODOS.oscuro.texto2, blend(MODOS.oscuro.texto1, 0.07, tarjeta(MODOS.oscuro)))).toBeGreaterThanOrEqual(3);
    expect(contrast(MODOS.claro.borde, blend(MODOS.claro.texto1, 0.07, tarjeta(MODOS.claro)))).toBeGreaterThanOrEqual(3);
  });
});

describe('contraste: portal', () => {
  it('los anillos locales usan el foco global', () => {
    const dash = source('../app/features/dashboard/dashboard.component.scss');
    const trace = source('../app/features/simulator/instructor-trace.component.ts') + source('../app/features/simulator/instructor-trace.component.scss');
    expect(dash).not.toContain('outline: 3px solid rgba(124, 77, 255, 0.45);');
    // F7-1: el panel ya no trae botones propios (`.pixel-button` con su anillo local): sus enlaces son `ui-button` y
    // `a[ui-card]` y heredan el anillo global; ninguna regla local lo reasigna ni lo apaga.
    expect(dash).not.toContain('.pixel-button');
    expect(dash).not.toMatch(/outline\s*:/);
    expect(source('./base/_focus.scss')).toMatch(/:focus-visible \{\s*@include ds-focus-ring;/);
    expect(trace).not.toContain('outline: 3px solid rgba(111, 76, 175, .28);');
  });
});

describe('contraste: navegación lateral', () => {
  // F3-3: el menú lateral morado desapareció (VD-1). La barra de vidrio es clara: hereda el anillo global y su
  // texto usa los tokens propios de la barra. El velo es el 72 % del fondo de la página sobre lo que pase debajo.
  const shell = source('../app/shared/layout/shell.component.ts');
  const barTokens = source('./tokens/_glass-bar.scss');
  const page = '#F5F7FA';
  const veilOver = (under: string) => blend(page, 0.72, under);
  const underneath = [page, '#FFFFFF', '#004876', '#14202E']; // fondo, tarjeta, primario y el texto más oscuro

  it('la barra no redefine el foco: vale el anillo global azul marino de la piel portal', () => {
    expect(shell).not.toMatch(/--ds-focus\s*:/);
  });

  it('el anillo global (#004876) supera 3:1 sobre el velo de la barra con cualquier contenido debajo', () => {
    underneath.forEach(under => expect(contrastRatio('#004876', veilOver(under)), under).toBeGreaterThanOrEqual(3));
  });

  it('el texto tenue de la barra supera 4,5:1 sobre el velo encima del fondo y de las superficies claras', () => {
    const tenue = barTokens.match(/--asb-cromo-tinta-tenue:\s*(#[0-9A-Fa-f]{6});/)?.[1] ?? '';
    expect(tenue).toBe('#3D4B59');
    [page, '#FFFFFF', '#E6F0F7'].forEach(under => expect(contrastRatio(tenue, veilOver(under)), under).toBeGreaterThanOrEqual(4.5));
  });
});

describe('contraste: botón táctil «Interactuar» en reposo', () => {
  const world = source('../app/features/simulator/game-world.component.ts');
  const styles = source('./styles.scss');

  /** Color del texto en reposo en anchos >= 700 px (la primera regla, fuera de la media query de < 700 px). */
  const idleColor = /\.touch-interact--idle \{ color: (#[0-9a-fA-F]{6});/.exec(world)?.[1] ?? '';

  it('en reposo (>= 700 px) el texto es oscuro sobre el vidrio claro y llega a AA incluso sobre un mundo negro', () => {
    expect(idleColor).not.toBe('');
    // Vidrio de .psy-button--glass: blanco al 52 %. El peor fondo es el que tiene un mundo negro debajo.
    expect(styles).toMatch(/\.psy-button--glass \{\s*background: rgba\(255,255,255,\.52\);/);
    const worstGlass = blend('#FFFFFF', 0.52, '#000000');
    expect(contrastRatio(idleColor, worstGlass)).toBeGreaterThanOrEqual(4.5);
  });

  it('el color de antes (claro al 78 %) no llegaba: 2,3:1 sobre el vidrio medido', () => {
    expect(contrastRatio(blend('#E8F0F4', 0.78, '#8B8E95'), '#8B8E95')).toBeLessThan(3);
  });

  it('el reposo se marca también por forma (borde discontinuo), no solo por tono', () => {
    expect(world).toMatch(/\.touch-interact--idle \{ color: #[0-9a-fA-F]{6}; border-style: dashed; \}/);
  });

  it('en anchos < 700 px el texto en reposo es claro sobre el fondo oscuro translúcido, con la misma marca por forma', () => {
    expect(world).toMatch(/\.touch-interact \{ background: rgba\(8,12,18,\.6\);[^}]*color: #e8f0f4; \}/);
    expect(world).toMatch(/\.touch-interact--idle \{ color: rgba\(232,240,244,\.8\); border-style: dashed; \}/);
  });
});
