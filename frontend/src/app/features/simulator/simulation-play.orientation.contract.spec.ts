import { readFileSync } from 'fs';
import { join } from 'path';

import { blend, contrastRatio } from '../../../styles/contrast.util';

/**
 * Contratos de fuente de la integración de la orientación en `simulation-play.component.ts` (T9, T10, T8.4):
 * lo que la plantilla y el CSS tienen que seguir diciendo aunque Jest no renderice la plantilla.
 * Las regex usan `\s*` entre líneas (el checkout es LF).
 */
const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

/** Cuerpo de la primera regla cuyo selector es exactamente `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No se encontró la regla ${selector}`);
  return match[2];
}

/** La franja del aviso sensible vive en su propio componente (T10): sus reglas se leen de allí. */
const noticeSource = readFileSync(join(__dirname, 'sensitive-notice.component.ts'), 'utf-8');
function noticeRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = noticeSource.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`No se encontró la regla ${selector} en el aviso sensible`);
  return match[2];
}

const worldTag = source.match(/<app-game-world[\s\S]*?\/>/)?.[0] ?? '';

describe('ficha del objetivo (T9.1)', () => {
  it('el envoltorio .objective-card contiene la ficha y no tiene role="status" (la ficha no trae región viva: anuncia el LiveRegionAnnouncer)', () => {
    expect(source).toMatch(/<div class="objective-card">\s*(<!--[^>]*-->\s*)?<div class="objective-card__scroll">\s*<app-scene-goal-card/);
    expect(source).not.toMatch(/<div class="objective-card"[^>]*role=/);
  });

  it('ya no se muestra el objetivo antiguo ni su ayuda visual', () => {
    expect(source).not.toContain('getSceneObjective');
    expect(source).not.toContain('sceneObjective');
    expect(source).not.toContain('objective-card__body');
    expect(source).not.toContain('objective-card__ethic');
    expect(source).not.toMatch(/<strong>Objetivo<\/strong>/);
  });

  it('el aviso de contenido sensible vive FUERA de la tarjeta plegable: franja bajo la cabecera, en todos los dispositivos (L-01)', () => {
    expect(source).toMatch(
      /<app-simulation-hud[\s\S]*?\/>\s*(<!--[\s\S]*?-->\s*)?<app-sensitive-notice \[text\]="sensitiveNotice\(\)" \[sceneKey\]="attempt\(\)\?\.currentNode\?\.key \?\? null"[^>]*\/>\s*<\/header>/,
    );
    expect(source).toContain('node.warningMessage');
    // Ya no está dentro de .objective-card (que se pliega a su chip) ni en el panel lateral: un único sitio.
    expect(source).not.toContain('objective-card__notice');
    expect(source).not.toContain('right-panel__warning');
    expect(source).not.toMatch(/<div class="objective-card">[\s\S]*?sensitiveNotice\(\)[\s\S]*?<app-scene-goal-card/);
  });

  it('el pliegue de la tarjeta (chip, «Ocultar pasos», compacto, móvil vertical) ya no toca el aviso ético', () => {
    // Antes, `.objective-card:has([data-collapsed=true]) .objective-card__notice { display: none }` lo ocultaba al plegar.
    const foldRules = source.match(/[^\n{}]*data-collapsed='true'[^{}]*\{[^}]*\}/g) ?? [];
    expect(foldRules.length).toBeGreaterThan(0);
    for (const foldRule of foldRules) {
      expect(foldRule).not.toMatch(/sensitive|notice/);
    }
    expect(noticeSource).not.toMatch(/\.sensitive-strip[^{]*\{[^}]*display:\s*none/);
    // El pliegue propio del aviso deja el texto en el DOM (clase sr-only), nunca lo quita.
    expect(noticeSource).toContain("[class.sr-only]=\"!unfolded()\"");
  });

  it('el aviso es legible (>= 12 px, también en compacto), con contraste alto y sin desenfoque', () => {
    const size = /font-size:\s*([\d.]+)rem/.exec(noticeRule('.sensitive-strip'))?.[1];
    expect(Number(size) * 16).toBeGreaterThanOrEqual(12);
    const compact = noticeSource.slice(noticeSource.lastIndexOf('@media (max-height: 520px), (pointer: coarse) and (orientation: landscape)'));
    const compactSize = /\.sensitive-strip \{[^}]*font-size:\s*([\d.]+)rem/.exec(compact)?.[1];
    expect(Number(compactSize) * 16).toBeGreaterThanOrEqual(12);
    expect(noticeRule('.sensitive-strip')).toContain('color: #f3dfb5;');
    expect(noticeRule('.sensitive-strip')).toContain('background: rgba(8,12,18,.94);');
    expect(noticeRule('.sensitive-strip')).not.toMatch(/backdrop-filter/);
    // Fondo y color de la franja: razón de contraste >= 7:1 (AAA) sobre el peor fondo (opaco al 94 % sobre blanco).
    expect(contrastRatio('#f3dfb5', blend('#080c12', 0.94, '#ffffff'))).toBeGreaterThanOrEqual(7);
  });

  it('la franja ocupa su propio sitio en la cabecera (no es una capa flotante): no tapa al personaje ni los controles', () => {
    expect(noticeRule('.sensitive-strip')).not.toMatch(/position:\s*(absolute|fixed)/);
    expect(source).toMatch(/<header class="top-bar"[^>]*>\s*<app-simulation-hud/);
  });

  it('la tarjeta desplegada tiene tope de alto y se desplaza por dentro: no baja sobre el kit ni la Familia en crisis', () => {
    expect(rule('.objective-card')).toContain('max-height: min(calc(100% - 20px), 66%);');
    expect(rule('.objective-card')).toMatch(/display: flex;\s*flex-direction: column;\s*overflow: hidden;/);
    expect(rule('.objective-card__scroll')).toMatch(/min-height: 0;\s*overflow-y: auto;/);
  });

  it('en compacto la tarjeta desplegada deja libre la cruz táctil y se sostiene a la derecha de ella', () => {
    const compact = source.slice(source.lastIndexOf('@media (max-height: 520px), (pointer: coarse) and (orientation: landscape)'));
    expect(compact).toMatch(
      /\.objective-card:not\(:has\(app-scene-goal-card\[data-collapsed='true'\]\)\) \{\s*left: 176px; right: auto; width: min\(640px, calc\(100% - 190px\)\);\s*flex-direction: row;/,
    );
  });

  it('la ficha recibe la guía, el intento y el pliegue compacto (cardFolded), y refresca la sala al abrirse', () => {
    expect(source).toMatch(/<app-scene-goal-card \[guia\]="guide\(\)" \[hintAttempt\]="hintAttempt\(\)" \[compact\]="cardFolded\(\)"\s*\(opened\)="refreshGuide\(\)" \(consentRequired\)="requireConsentAgain\(\)"/);
    expect(source).toContain('readonly cardFolded = computed(() => this.compactMode() || this.narrowScreen());');
  });

  it('el envoltorio conserva fondo casi opaco y sin desenfoque (contrato de la tarjeta)', () => {
    expect(rule('.objective-card')).toContain('background: rgba(8,12,18,.88);');
    expect(rule('.objective-card')).not.toMatch(/backdrop-filter/);
  });
});

describe('el HUD recibe el título de la escena (T9.2)', () => {
  it('stageLabel es el título del nodo: sin contador de decisiones ni respaldo por escenarios', () => {
    expect(source).toMatch(/readonly stageLabel = computed<string \| null>\(\(\) => this\.attempt\(\)\?\.currentNode\.title \?\? null\);/);
    expect(source).not.toContain('fallbackStageLabel');
  });

  it('el HUD recibe stageLabel y no el contador «Escenario k de n» ni progressLabel', () => {
    expect(source).toMatch(/<app-simulation-hud[\s\S]*?\[stageLabel\]="stageLabel\(\)"/);
    expect(source).not.toContain('[progressLabel]');
    expect(source).not.toContain('[nearbyInteractionKey]');
    expect(source).not.toMatch(/progressLabel\(\)\s*:\s*string/);
  });

  it('el encabezado del panel lateral usa el mismo rótulo', () => {
    expect(source).toMatch(/<p class="right-panel__kicker">\{\{ stageLabel\(\) \}\}<\/p>/);
  });
});

describe('barra contextual (T9.3, T9.5)', () => {
  it('el botón principal conserva button.context-bar__interaction con su <strong> y el nombre «Interactuar: …»', () => {
    expect(source).toMatch(/<button type="button" class="context-bar__interaction"/);
    expect(source).toMatch(/<strong>\{\{ action\.verb\.text \}\}<\/strong>/);
    expect(source).toContain('`Interactuar: ${verb.text}');
    expect(source).not.toContain('atajo E');
  });

  it('el botón secundario usa context-bar__interaction--secondary y también lleva <strong>', () => {
    expect(source).toMatch(/class="context-bar__interaction context-bar__interaction--secondary"[\s\S]*?<strong>\{\{ also\.verb\.text \}\}<\/strong>/);
  });

  it('el secundario conserva «También:» en su nombre accesible aunque el modo compacto lo oculte a la vista', () => {
    expect(source).toContain(`[attr.aria-label]="'También: ' + also.verb.text"`);
  });

  it('en reposo la barra solo trae la nota «No hay nada a tu alcance» (clase propia); ni línea «Ahora:» ni leyenda de teclas', () => {
    expect(source).toMatch(/@if \(nothingNearbyNote\(\); as note\) \{\s*<p class="context-bar__now">\{\{ note \}\}<\/p>/);
    expect(source).not.toContain('nowLine');
    expect(source).not.toContain('context-bar__hint');
    expect(source).not.toContain('WASD mover');
  });

  it('la <kbd> «E» del botón no se pinta en modo compacto ni sin puntero fino', () => {
    // La tecla que se rotula sale del ajuste «Atajos de una tecla» (F6-10): E con ellos activos, Enter sin ellos.
    expect(source).toMatch(/@if \(!compactMode\(\)\) \{ <kbd aria-hidden="true">\{\{ shortcuts\.enabled\(\) \? 'E' : 'Enter' \}\}<\/kbd> \}/);
    expect(source).toMatch(/@media not all and \(hover: hover\) and \(pointer: fine\) \{\s*\.context-bar__interaction kbd \{ display: none; \}/);
  });

  it('una puerta bloqueada también marca candado cuando es el botón secundario', () => {
    expect(source).toMatch(/context-bar__interaction--secondary"[\s\S]*?\[class\.context-bar__interaction--locked\]="also\.verb\.locked"[\s\S]*?@if \(also\.verb\.locked\) \{ <mat-icon class="context-bar__lock"/);
  });

  it('el pie tiene altura fija: el mundo no cambia de tamaño al acercarte a algo', () => {
    expect(rule('.bottom-zone')).toMatch(/height: 64px;/);
    expect(rule('.bottom-zone')).not.toMatch(/min-height/);
  });

  // req: RNF-04, BLOQUE-H
  it('las acciones de la barra de contexto miden 44 px con cualquier puntero', () => {
    expect(rule('.context-bar__interaction')).toMatch(/min-height: 44px;/);
  });

  it('el botón no hace crecer el pie: una línea con puntos suspensivos', () => {
    expect(rule('.context-bar__copy strong')).toMatch(/white-space: nowrap;/);
    expect(rule('.context-bar__copy strong')).toMatch(/text-overflow: ellipsis;/);
    expect(rule('.context-bar__interaction')).toMatch(/max-height: 100%;/);
  });
});

describe('«Ir a…» (F6-11, VD-19)', () => {
  // req: BLOQUE-H H-06, RNF-04
  it('abierta, el resto del juego queda inerte y Esc la cierra antes que la ayuda, la bitácora, el diálogo y la pausa', () => {
    expect(source).toMatch(/this\.showCaseIntro\(\) \|\| this\.dialogue\(\) !== null \|\| this\.journalOpen\(\) \|\| this\.placesOpen\(\)/);
    const chain = source.slice(source.indexOf('if (this.placesOpen())  {'));
    expect(chain.indexOf('if (this.placesOpen())')).toBeLessThan(chain.indexOf('if (this.helpOpen())'));
    expect(source).toMatch(/<app-world-places-list \[places\]="placeOptions\(\)" \[pausing\]="pausing\(\)"\s*\(choose\)="choosePlace\(\$event\)" \(closed\)="closePlaces\(\)" \(safeExit\)="pauseFromOverlay\(\)" \/>/);
  });

  it('solo se ofrecen personas, puertas y lo examinado (misma regla que el hover) y la llegada se anuncia', () => {
    expect(source).toContain('selectPlaces(this.gameWorld?.places() ?? [], examined)');
    expect(source).toContain('new Set(this.world()?.inspectedObjectKeys ?? [])');
    expect(source).toMatch(/onWalkEnded\(event: \{ key: string; label: string; outcome: 'arrived' \| 'blocked' \}\): void \{/);
    expect(source).toContain('DRAFT_COPY.placesArrived');
  });

  it('al cerrarla el foco vuelve a su acceso de la cabecera', () => {
    expect(source).toMatch(/afterNextRender\(\(\) => document\.querySelector<HTMLElement>\('\[data-hud-places\]'\)\?\.focus\(\)/);
  });
});

describe('texto de la pantalla de juego (F6-3)', () => {
  // req: RNF-04, BLOQUE-H
  it('ningún texto del componente baja de 12 px, ni en las entradas ni en el pie ni en el panel de escena', () => {
    const styles = source.slice(source.indexOf('styles: [`'));
    const small: string[] = [];
    for (const chunk of styles.split('}')) {
      const [selector, body] = chunk.split('{');
      if (!body) continue;
      for (const match of body.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)) {
        const px = match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1]);
        if (px < 12) small.push(selector.trim().split('\n').pop() + ' → ' + match[0]);
      }
    }
    expect(small).toEqual([]);
  });

  it('el foco del pie es el anillo global del juego, sin anillo local con literales', () => {
    expect(source).not.toMatch(/\.context-bar__interaction:focus-visible/);
  });
});

describe('enlaces con el mundo (T9.5, T9.9)', () => {
  it('el mundo recibe atenuados, puertas y modo compacto, y sus dos salidas nuevas están enlazadas', () => {
    expect(worldTag).not.toContain('nextTargetKey');
    expect(worldTag).toContain('[dimmedKeys]="dimmedKeys()"');
    expect(worldTag).toContain('[doorStates]="doorStates()"');
    expect(worldTag).toContain('[compact]="compactMode()"');
    expect(worldTag).toContain('(proximityAlso)="nearbyAlso.set($event)"');
    expect(worldTag).toContain('(nothingNearby)="showNothingNearby()"');
  });

  it('el panel lateral releer el tamaño del mundo cuando termina su animación', () => {
    expect(source).toMatch(/<aside class="right-panel"[^>]*\(animationend\)="refreshWorldScale\(\)"/);
  });
});

describe('ayuda (T9.8)', () => {
  it('la tarjeta de primera vez y la pantalla de ayuda están enlazadas, con la promesa de salida segura condicionada', () => {
    expect(source).toMatch(/<app-game-help view="card"[^>]*\[safeExitPromise\]="safeExitPromise"[\s\S]*?\(dismissed\)="markHelpCardSeen\(\)" \(openFull\)="openHelp\(\)"/);
    expect(source).toMatch(/<app-game-help view="screen"[^>]*\[safeExitPromise\]="safeExitPromise"[\s\S]*?\(closed\)="helpOpen\.set\(false\)"/);
    expect(source).toContain('readonly safeExitPromise = SAFE_EXIT_ALWAYS_REACHABLE;');
  });

  it('el HUD abre la ayuda y reactiva la tarjeta', () => {
    expect(source).toMatch(/\(openHelp\)="openHelp\(\)" \(helpReset\)="resetHelpCard\(\)"/);
  });

  it('la pantalla de ayuda deja libres la cabecera y el pie (no se pone inert)', () => {
    expect(rule('.help-layer')).toMatch(/top: 52px;/);
    expect(rule('.help-layer')).toMatch(/pointer-events: none;/);
    expect(source).toMatch(/<footer class="bottom-zone"[^>]*\[attr\.inert\]="inputBlocked\(\)/);
  });
});

describe('el cliente ya no recibe ni usa la clasificación de las opciones (T8.4)', () => {
  const model = readFileSync(join(__dirname, '../../core/models/simulation.model.ts'), 'utf-8');
  const block = (name: string) => model.match(new RegExp(`export interface ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';

  it('SimulationDecisionOption solo trae id y texto', () => {
    expect(block('SimulationDecisionOption')).toContain('id: number;');
    expect(block('SimulationDecisionOption')).not.toMatch(/classification|prohibitedConduct/);
  });

  it('DialogueChoiceState no lleva ayudas visuales de «recomendada» ni «prohibida»', () => {
    expect(block('DialogueChoiceState')).not.toMatch(/isRecommended|isProhibited/);
  });

  it('la pantalla de juego no los asigna', () => {
    expect(source).not.toMatch(/isRecommended|isProhibited/);
  });

  it('el reporte de finalización trae retries (opcional, aparte de las decisiones registradas)', () => {
    expect(block('AttemptCompletionReport')).toMatch(/retries\?: number;/);
  });

  it('el resultado y la pausa reciben los recursos de apoyo que ya muestra la bitácora', () => {
    expect(source).toMatch(/<app-attempt-outcome[^>]*\[supportResources\]="supportResources\(\)"/);
    expect(source).toMatch(/<app-journal-panel[\s\S]*?\[resources\]="supportResources\(\)"/);
  });

});

describe('modo compacto (T10)', () => {
  const COMPACT = '@media (max-height: 520px), (pointer: coarse) and (orientation: landscape) {';
  // Hay dos bloques con esta condición (la tarjeta de ayuda y el principal): el principal es el último.
  const start = source.lastIndexOf(COMPACT);
  const compactCss = start >= 0 ? source.slice(start, source.indexOf('\n    }\n', start) + 7) : '';

  it('la condición del CSS es la de la lógica (compactMode)', () => {
    expect(source).toContain("const COMPACT_QUERY = '(max-height: 520px), (pointer: coarse) and (orientation: landscape)';");
    expect(start).toBeGreaterThan(-1);
  });

  it('va después del bloque móvil: un móvil horizontal de 667x375 cumple los dos y manda el compacto', () => {
    expect(source.indexOf('@media (max-width: 760px) {')).toBeGreaterThan(-1);
    expect(source.indexOf('@media (max-width: 760px) {')).toBeLessThan(start);
  });

  it('el pie es de una sola fila y altura fija de 56 px, sin teclas ni leyenda (la leyenda ya no existe)', () => {
    expect(compactCss).toMatch(/\.bottom-zone \{[^}]*flex-wrap: nowrap;[^}]*height: 56px;/);
    expect(compactCss).not.toContain('context-bar__hint');
    // «Salida segura» es el componente compartido (F6-6): en compacto va en su variante densa, sin la pista de tecla.
    expect(source).toMatch(/<app-safe-exit-button \[compact\]="compactMode\(\)" \[pausing\]="pausing\(\)" \(pause\)="pauseFromOverlay\(\)" \/>/);
  });

  it('los controles del pie miden al menos 44 px', () => {
    // «Salida segura» mide 44 px en el propio componente, también compacto (su spec lo fija).
    expect(readFileSync(join(__dirname, 'safe-exit-button.component.ts'), 'utf-8'))
      .toMatch(/\.safe-exit-btn \{[^}]*min-height: 44px;/);
    expect(compactCss).toMatch(/\.context-bar__interaction \{[^}]*min-height: 44px;/);
  });

  it('el panel de decisión es una hoja flotante: una columna, sin resumen de etapa y sin reencuadrar el mundo', () => {
    expect(compactCss).toMatch(/\.game-container\[data-mode='dialogue-right'\] \.main-zone \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(compactCss).toMatch(/\.right-panel \{[^}]*position: fixed;[^}]*bottom: 0;/);
    expect(compactCss).toMatch(/\.game-container\[data-mode='dialogue-right'\] \.right-panel__scene \{ display: none; \}/);
  });

  it('la introducción y el contexto tienen cabecera compacta, pie fijo y degradado que avisa del desplazamiento', () => {
    expect(compactCss).toMatch(/\.case-intro-card__header \{[^}]*grid-template-areas: 'eyebrow extra' 'title extra';/);
    expect(compactCss).toMatch(/\.case-intro-card__actions::before \{[^}]*linear-gradient\(/);
    expect(compactCss).toMatch(/\.case-intro-card__actions \{ position: relative; \}/);
  });

  it('ningún nombre accesible promete teclas que no existen en táctil', () => {
    expect(source).not.toMatch(/aria-label="[^"]*\((Esc|Escape|J|E)\)/);
    expect(source).not.toMatch(/\[attr\.aria-label\]="[^"]*\((Esc|Escape|J|E)\)/);
  });
});
