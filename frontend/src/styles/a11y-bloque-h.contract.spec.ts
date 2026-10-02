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
    expect(dialogue).toMatch(/\.choice-btn:focus-visible \{\s*outline: 3px solid #C9B3FF;\s*outline-offset: 3px;\s*\}/);
    expect(contrastRatio('#C9B3FF', DIALOGUE_BG)).toBeGreaterThanOrEqual(3);
  });

  it('el anillo del botón de salida segura llega a 3:1', () => {
    // Antes: rgba(226,90,79,.6) = 2,55:1.
    expect(play).toMatch(/\.safe-exit:focus-visible \{ outline: 2px solid #f1a79f; outline-offset: 2px; \}/);
    expect(contrastRatio('#F1A79F', GAME_BG)).toBeGreaterThanOrEqual(3);
  });

  it('el nombre del hablante de una advertencia llega a 4,5:1', () => {
    // Antes: #a85062 = 3,38:1.
    expect(dialogue).toContain('.strip--warning .speaker-name { color: #d9798e; }');
    expect(contrastRatio('#D9798E', DIALOGUE_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('la etiqueta de emoción no atenúa su color y cada tono llega a 4,5:1', () => {
    // Antes: opacity .75 dejaba el rojo de «alerta» en 3,29:1.
    expect(dialogue).toMatch(/\.emotion-tag \{[^}]*opacity: 1;/);
    for (const tone of ['#B69CFF', '#6EC67A', '#F5B84B', '#E25A4F']) {
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
