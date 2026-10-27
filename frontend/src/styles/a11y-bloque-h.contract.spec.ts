import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio } from './contrast.util';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

describe('bloque H: portada', () => {
  const scss = source('../app/features/public/landing.component.scss');

  it('el botón primario no baja de 4,5:1 en ninguna de las dos pieles (ya no hay degradado propio)', () => {
    // Antes: un degradado propio (#8b5cf6 → #7c3aed; el inicio daba 4,23:1). F4-1: los llamados a la acción son
    // ui-button, con el primario y su texto de cada piel: juego (héroe) y portal (cierre).
    expect(scss).not.toContain('#8b5cf6');
    expect(scss).not.toContain('landing-btn');
    expect(scss).not.toContain('linear-gradient');
    expect(contrastRatio('#0E1322', '#B69CFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', '#004876')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('bloque H: login (contraste)', () => {
  const scss = source('../app/features/login/login.component.scss');
  // --siep-muted es alias de --ds-text-2 (F1-1); el valor sale del mapa de la piel portal.
  const alias = source('./_aliases.scss').match(/--siep-muted:\s*var\(--ds-([a-z0-9-]+)\);/)?.[1] ?? '';
  const muted = source('./tokens/_color.scss').match(new RegExp(`\\n\\s*${alias}:\\s*(#[0-9A-Fa-f]{6}),`))?.[1] ?? '';

  it('el divisor y el estado de Google usan el texto secundario del lenguaje (≥ 4,5:1 sobre blanco)', () => {
    // Antes: rgba(120,120,140,.85) = 3,31:1 y rgba(120,120,140,.95) = 3,92:1. F4-2: tokens --ds-* directos
    // (--siep-muted era alias de --ds-text-2).
    expect(alias).toBe('text-2');
    expect(muted).toBe('#4A5A6A');
    expect(scss).toMatch(/\.acceso__divider \{[^}]*color: var\(--ds-text-2\);/);
    expect(scss).toMatch(/\.acceso__google-status \{[^}]*color: var\(--ds-text-2\);/);
    expect(contrastRatio(muted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('el placeholder tiene color propio y llega a 4,5:1, y el borde del campo a 3:1 (H-28)', () => {
    // Sin regla, Chrome pinta #757575: 4,19:1 sobre #f3f4f6. F4-2: los campos son ui-field + uiControl, que fija el
    // placeholder en --ds-text-2 sobre --ds-surface-1 y el borde en --ds-border-strong.
    const field = source('../app/shared/ui/field/ui-field.scss');
    const html = source('../app/features/login/login.component.html');
    expect(field).toMatch(/&::placeholder \{\s*color: var\(--ds-text-2\);\s*opacity: 1;/);
    expect(field).toContain('border: 1px solid var(--ds-border-strong);');
    expect((html.match(/<input uiControl /g) ?? []).length).toBe(5);
    expect(contrastRatio(muted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#6F8296', '#FFFFFF')).toBeGreaterThanOrEqual(3);
  });

  it('el texto pequeño del panel del simulador llega a 4,5:1 (F4-2: piel juego en vez del panel índigo)', () => {
    // Antes: rgba(255,255,255,.82) = 3,85:1 sobre #5c6bc0 (panel índigo, retirado).
    const html = source('../app/features/login/login.component.html');
    expect(html).toMatch(/<aside class="acceso__panel" data-skin="game"/);
    expect(scss).toMatch(/\.acceso__panel p \{[^}]*color: var\(--ds-text-2\);/);
    expect(contrastRatio('#A9B3CC', '#0E1322')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('bloque H: juego (foco y texto del diálogo)', () => {
  const dialogue = source('../app/features/simulator/dialogue-panel.component.ts');
  const play = source('../app/features/simulator/simulation-play.component.ts');
  const GAME_BG = '#0E1322';
  // Peor caso del panel de diálogo: rgba(8,12,18,.95) sobre un píxel blanco del mapa.
  const DIALOGUE_BG = blend('#080C12', 0.95, '#FFFFFF');

  it('el anillo de las opciones del diálogo es el global de la piel del juego y llega a 3:1', () => {
    // Antes: rgba(182,156,255,.5) = 2,89:1 y luego un anillo local literal que anulaba el global (F6-4).
    expect(dialogue).not.toMatch(/\.choice-btn:focus-visible \{[^}]*outline:\s*\d+px solid/);
    const gameRing = [...source('tokens/_color.scss').matchAll(/focus: (#[0-9A-Fa-f]{6}),/g)].map(match => match[1])[1];
    expect(gameRing).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(contrastRatio(gameRing, DIALOGUE_BG)).toBeGreaterThanOrEqual(3);
  });

  it('el botón de salida segura no pinta un anillo propio y el global de la piel llega a 3:1', () => {
    // Antes: rgba(226,90,79,.6) = 2,55:1 y luego un anillo local #f1a79f de 2 px que anulaba el global (F6-6).
    expect(source('../app/features/simulator/safe-exit-button.component.ts')).not.toContain(':focus-visible');
    expect(play).not.toMatch(/\.safe-exit[\w-]*:focus-visible/);
    // El foco de la piel juego es el segundo «focus:» de los tokens de color (el primero es el del portal).
    const focusTokens = [...source('tokens/_color.scss').matchAll(/focus: (#[0-9A-Fa-f]{6}),/g)].map(match => match[1]);
    const gameRing = focusTokens[1];
    expect(gameRing).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(contrastRatio(gameRing, GAME_BG)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(gameRing, DIALOGUE_BG)).toBeGreaterThanOrEqual(3);
  });

  it('el nombre del hablante de una advertencia llega a 4,5:1', () => {
    // Antes: #a85062 = 3,38:1.
    const speaker = dialogue.match(/\.strip--warning \.speaker-name \{ color: (#[0-9A-Fa-f]{6}); \}/)?.[1] ?? '';
    expect(speaker).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(contrastRatio(speaker, DIALOGUE_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('la etiqueta de emoción no atenúa su color y cada tono llega a 4,5:1', () => {
    // Antes: opacity .75 dejaba el rojo de «alerta» en 3,29:1.
    expect(dialogue).toMatch(/\.emotion-tag \{[^}]*opacity: 1;/);
    // Los cuatro tonos se leen de `emotionColor()` en el fuente; no se reescriben aquí.
    const tones = [
      dialogue.match(/case 'positive': return '(#[0-9A-Fa-f]{6})';/)?.[1] ?? '',
      dialogue.match(/case 'concerned': return '(#[0-9A-Fa-f]{6})';/)?.[1] ?? '',
      dialogue.match(/case 'danger': return '(#[0-9A-Fa-f]{6})';/)?.[1] ?? '',
      dialogue.match(/default: return '(#[0-9A-Fa-f]{6})';/)?.[1] ?? '',
    ];
    for (const tone of tones) {
      expect(tone).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(contrastRatio(tone, DIALOGUE_BG)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('bloque H: foco visible en Grupos y en el editor DAG', () => {
  const grupos = source('../app/features/grupos/grupo-list.component.ts');
  const groupsHtml = source('../app/features/grupos/grupo-list.component.html');
  const groupsScss = source('../app/features/grupos/grupo-list.component.scss');
  const dag = source('../app/features/simulator/dag-editor.component.ts');
  const dagHtml = source('../app/features/simulator/dag-editor.component.html');
  const dagScss = source('../app/features/simulator/dag-editor.component.scss');

  it('el buscador de Grupos es un campo de la biblioteca: el anillo es el global y la pantalla no apaga contornos', () => {
    // Antes el input conservaba `outline: 0` y un `.search-box:focus-within` dibujaba el anillo en su contenedor.
    // Desde F7-2 el buscador es un `ui-field` con `uiControl`: el foco lo pinta el anillo global.
    expect(grupos).not.toContain('.search-box');
    expect(groupsHtml).toContain('<input uiControl type="search"');
    expect(groupsScss).not.toMatch(/outline\s*:/);
    expect(source('./base/_focus.scss')).toMatch(/:focus-visible \{\s*@include ds-focus-ring;/);
    // --ds-focus = #004876 sobre las superficies del portal
    for (const surface of ['#F2F2F2', '#FFFFFF']) {
      expect(contrastRatio('#004876', surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('los nodos del DAG muestran el foco con el trazo del token de foco y ya no se apagan', () => {
    // Desde F8-3 el trazo sale de `--ds-focus` (#004876 en el portal) y el lienzo es `--ds-surface-2` (#EEF2F6).
    expect(dagScss).not.toMatch(/\.dag-node:focus \{[^}]*outline: none/);
    expect(dagScss).toMatch(/&:focus-visible \.dag-node__box \{[^}]*stroke: var\(--ds-focus\)/);
    expect(contrastRatio('#004876', '#EEF2F6')).toBeGreaterThanOrEqual(3);
  });

  it('el grafo es un grupo (no una imagen) y sus nodos responden a Espacio además de Enter', () => {
    expect(dagHtml).toContain('role="group" aria-label="Grafo DAG del caso"');
    expect(dagHtml).not.toContain('role="img" aria-label="Grafo DAG del caso"');
    // El teclado del grafo es un solo manejador sobre el lienzo: Enter y Espacio abren el detalle del nodo enfocado.
    expect(dagHtml).toContain('(keydown)="onKeydown($event)"');
    expect(dag).toMatch(/case 'Enter':\s*case ' ':/);
  });
});

describe('bloque H: el diálogo recibe el interruptor de movimiento reducido', () => {
  it('las dos instancias del panel en la partida reciben reduceMotion', () => {
    const tags = source('../app/features/simulator/simulation-play.component.ts').match(/<app-dialogue-panel[^>]*?\/>/g) ?? [];
    expect(tags).toHaveLength(2);
    for (const tag of tags) expect(tag).toContain('[reduceMotion]="reduceMotion()"');
  });

  it('la vista previa de autor pasa el movimiento reducido al mundo y al diálogo', () => {
    const preview = source('../app/features/simulator/world-preview.component.ts');
    expect(preview).toMatch(/<app-game-world[^>]*\[reduceMotion\]="reduceMotion\(\)"/);
    expect(preview).toMatch(/<app-dialogue-panel[^>]*\[reduceMotion\]="reduceMotion\(\)"/);
  });
});

describe('bloque H: semántica del HUD y de la tarjeta de contexto', () => {
  const hud = source('../app/features/simulator/simulation-hud.component.ts');
  const play = source('../app/features/simulator/simulation-play.component.ts');

  it('los cuatro aria-label del HUD y de la tarjeta de contexto que colgaban de un div sin rol ya tienen rol o se quitaron', () => {
    // El bloque «Paso k (k/6)» salió del HUD (T7.1): el único contador es el chip «Decisión k de 6».
    expect(hud).not.toContain('class="hud-step"');
    // La persona va en palabras (grupo con su frase como nombre) y el HUD ya no tiene medidor ni marcador de seguimiento.
    expect(hud).toMatch(/<div class="hud-persona"[^>]* role="group" \[attr\.aria-label\]="game\.persona\.label">/);
    expect(hud).not.toContain('hud-patient');
    expect(hud).not.toContain('Seguimiento formativo');
    expect(play).toContain('<div class="case-intro-card__body" tabindex="0" role="region" aria-label="Contexto narrativo del caso">');
  });
});
