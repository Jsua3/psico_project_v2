import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio } from './contrast.util';

function source(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), 'utf-8');
}

describe('bloque H: portada', () => {
  const scss = source('../app/features/public/landing.component.scss');

  it('el botón primario no baja de 4,5:1 con texto blanco en ningún tramo del degradado', () => {
    // Antes: #8b5cf6 → #7c3aed; el inicio daba 4,23:1.
    expect(scss).not.toContain('#8b5cf6');
    expect(scss).toMatch(/\.landing-btn--primary \{[^}]*background: linear-gradient\(135deg, #7c3aed 0%, #6d28d9 100%\);/);
    for (const stop of ['#7c3aed', '#6d28d9']) {
      expect(contrastRatio('#FFFFFF', stop)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('bloque H: login (contraste)', () => {
  const scss = source('../app/features/login/login.component.scss');
  const muted = source('./styles.scss').match(/--siep-muted:\s*(#[0-9A-Fa-f]{6});/)?.[1] ?? '';

  it('el divisor y el estado de Google usan el token --siep-muted (≥ 4,5:1 sobre blanco)', () => {
    // Antes: rgba(120,120,140,.85) = 3,31:1 y rgba(120,120,140,.95) = 3,92:1.
    expect(muted).toBe('#5F6B76');
    expect(scss).toMatch(/\.auth-divider \{[^}]*color: var\(--siep-muted\);/);
    expect(scss).toMatch(/\.auth-google__status \{[^}]*color: var\(--siep-muted\);/);
    expect(contrastRatio(muted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('el placeholder tiene color propio y llega a 4,5:1 sobre el campo gris', () => {
    // Sin regla, Chrome pinta #757575: 4,19:1 sobre #f3f4f6.
    expect(scss).toMatch(/\.auth-container input::placeholder \{\s*color: var\(--siep-muted\);\s*opacity: 1;\s*\}/);
    expect(contrastRatio(muted, '#F3F4F6')).toBeGreaterThanOrEqual(4.5);
  });

  it('el texto pequeño del panel índigo es blanco puro (4,86:1 incluso en el tramo más claro)', () => {
    // Antes: rgba(255,255,255,.82) = 3,85:1 sobre #5c6bc0.
    expect(scss).toMatch(/\.toggle-brand small \{[^}]*color: #fff;/);
    expect(contrastRatio('#FFFFFF', '#5C6BC0')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('bloque H: juego (foco y texto del diálogo)', () => {
  const dialogue = source('../app/features/simulator/dialogue-panel.component.ts');
  const play = source('../app/features/simulator/simulation-play.component.ts');
  const GAME_BG = '#0E1322';
  // Peor caso del panel de diálogo: rgba(8,12,18,.95) sobre un píxel blanco del mapa.
  const DIALOGUE_BG = blend('#080C12', 0.95, '#FFFFFF');

  it('el anillo de las opciones del diálogo llega a 3:1', () => {
    // Antes: rgba(182,156,255,.5) = 2,89:1.
    const ring = dialogue.match(/\.choice-btn:focus-visible \{\s*outline: 3px solid (#[0-9A-Fa-f]{6});\s*outline-offset: 3px;\s*\}/)?.[1] ?? '';
    expect(ring).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(contrastRatio(ring, DIALOGUE_BG)).toBeGreaterThanOrEqual(3);
  });

  it('el anillo del botón de salida segura llega a 3:1', () => {
    // Antes: rgba(226,90,79,.6) = 2,55:1.
    const ring = play.match(/\.safe-exit:focus-visible \{ outline: 2px solid (#[0-9A-Fa-f]{6}); outline-offset: 2px; \}/)?.[1] ?? '';
    expect(ring).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(contrastRatio(ring, GAME_BG)).toBeGreaterThanOrEqual(3);
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
  const dag = source('../app/features/simulator/dag-editor.component.ts');

  it('el buscador de Grupos dibuja el anillo en su contenedor cuando el campo tiene el foco', () => {
    // El input conserva `outline: 0`; sin :focus-within no quedaba ningún indicador.
    expect(grupos).toMatch(/\.search-box:focus-within \{\s*outline: 3px solid var\(--psy-focus\);\s*outline-offset: 2px;\s*\}/);
    // --psy-focus = rgba(0, 72, 118, .72)
    for (const surface of ['#F2F2F2', '#FFFFFF']) {
      expect(contrastRatio(blend('#004876', 0.72, surface), surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('los nodos del DAG muestran el foco con el trazo y ya no se apagan', () => {
    expect(dag).not.toContain('.dag-node-group:focus { outline: none; }');
    expect(dag).toContain('.dag-node-group:focus-visible .dag-node-rect { stroke: #004876; stroke-width: 4; }');
    expect(contrastRatio('#004876', '#F6F9FB')).toBeGreaterThanOrEqual(3);
  });

  it('el grafo es un grupo (no una imagen) y sus nodos responden a Espacio además de Enter', () => {
    expect(dag).toContain('role="group" aria-label="Grafo DAG del caso"');
    expect(dag).not.toContain('role="img" aria-label="Grafo DAG del caso"');
    expect(dag).toMatch(/\(keydown\.enter\)="selectNode\(ln\.node\)"\s*\(keydown\.space\)="\$event\.preventDefault\(\); selectNode\(ln\.node\)">/);
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
    expect(hud).toContain('<div class="hud-step">');
    expect(hud).toContain('<div class="hud-patient" role="group" aria-label="Estado de la paciente">');
    expect(hud).toMatch(/<div class="hud-score" role="group" \[attr\.aria-label\]="'Seguimiento formativo: '/);
    expect(play).toContain('<div class="case-intro-card__body" tabindex="0" role="region" aria-label="Contexto narrativo del caso">');
  });
});
