import { readFileSync } from 'fs';
import { join } from 'path';

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

const worldTag = source.match(/<app-game-world[\s\S]*?\/>/)?.[0] ?? '';

describe('tarjeta «Qué hacer» (T9.1)', () => {
  it('el envoltorio .objective-card contiene la tarjeta y no tiene role="status" (la tarjeta ya trae su región viva)', () => {
    expect(source).toMatch(/<div class="objective-card">\s*(<!--[^>]*-->\s*)?<div class="objective-card__scroll">\s*<app-scene-checklist-card/);
    expect(source).not.toMatch(/<div class="objective-card"[^>]*role=/);
  });

  it('ya no se muestra el objetivo antiguo ni su ayuda visual', () => {
    expect(source).not.toContain('getSceneObjective');
    expect(source).not.toContain('sceneObjective');
    expect(source).not.toContain('objective-card__body');
    expect(source).not.toContain('objective-card__ethic');
    expect(source).not.toMatch(/<strong>Objetivo<\/strong>/);
  });

  it('el aviso de contenido sensible del nodo vive dentro del envoltorio, bajo la lista, en todos los dispositivos', () => {
    expect(source).toMatch(
      /<app-scene-checklist-card[^>]*\/>\s*<\/div>\s*@if \(sensitiveNotice\(\); as notice\) \{[^}]*<p class="objective-card__notice">\{\{ notice \}\}<\/p>\s*\}\s*<\/div>/,
    );
    expect(source).toContain('node.warningMessage');
  });

  it('el panel lateral solo repite el aviso si la etapa no tiene tarjeta (un único sitio)', () => {
    expect(source).toMatch(/@if \(!sceneLog\(\) && sensitiveNotice\(\); as notice\) \{\s*<p class="right-panel__warning">/);
  });

  it('el aviso es legible (>= 12 px) y con la tarjeta plegada a su chip no ocupa sitio', () => {
    const size = /font-size:\s*([\d.]+)rem/.exec(rule('.objective-card__notice'))?.[1];
    expect(Number(size) * 16).toBeGreaterThanOrEqual(12);
    expect(source).toMatch(
      /\.objective-card:has\(app-scene-checklist-card\[data-collapsed='true'\]\) \.objective-card__notice \{ display: none; \}/,
    );
    expect(rule('.objective-card__notice')).toContain('color: #f3dfb5;');
    expect(rule('.objective-card__notice')).not.toMatch(/backdrop-filter/);
  });

  it('la tarjeta desplegada tiene tope de alto y se desplaza por dentro: no baja sobre el kit ni la Familia en crisis', () => {
    expect(rule('.objective-card')).toContain('max-height: min(calc(100% - 20px), 66%);');
    expect(rule('.objective-card')).toMatch(/display: flex;\s*flex-direction: column;\s*overflow: hidden;/);
    expect(rule('.objective-card__scroll')).toMatch(/min-height: 0;\s*overflow-y: auto;/);
    // El aviso queda fuera de la zona que se desplaza: siempre a la vista.
    expect(rule('.objective-card__notice')).toContain('flex: none;');
  });

  it('en compacto la tarjeta desplegada deja libre la cruz táctil y pone el aviso al lado de la lista', () => {
    const compact = source.slice(source.lastIndexOf('@media (max-height: 520px), (pointer: coarse) and (orientation: landscape)'));
    expect(compact).toMatch(
      /\.objective-card:not\(:has\(app-scene-checklist-card\[data-collapsed='true'\]\)\) \{\s*left: 176px; right: auto; width: min\(640px, calc\(100% - 190px\)\);\s*flex-direction: row;/,
    );
    expect(compact).toMatch(/\.objective-card__notice \{\s*flex: 0 0 min\(38%, 220px\);[^}]*border-left:/);
  });

  it('la tarjeta arranca plegada en compacto y en móvil vertical (cardFolded)', () => {
    expect(source).toMatch(/<app-scene-checklist-card \[state\]="log" \[compact\]="cardFolded\(\)"/);
    expect(source).toContain('readonly cardFolded = computed(() => this.compactMode() || this.narrowScreen());');
  });

  it('el envoltorio conserva fondo casi opaco y sin desenfoque (contrato de la tarjeta)', () => {
    expect(rule('.objective-card')).toContain('background: rgba(8,12,18,.88);');
    expect(rule('.objective-card')).not.toMatch(/backdrop-filter/);
  });
});

describe('contador único (T9.2)', () => {
  it('el HUD recibe stageLabel y no el contador «Escenario k de n» ni progressLabel', () => {
    expect(source).toMatch(/<app-simulation-hud[\s\S]*?\[stageLabel\]="stageLabel\(\)"/);
    expect(source).not.toContain('[progressLabel]');
    expect(source).not.toContain('[nearbyInteractionKey]');
    expect(source).not.toMatch(/progressLabel\(\)\s*:\s*string/);
  });

  it('el encabezado del panel lateral usa el mismo contador', () => {
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

  it('la línea «Ahora: …» tiene su clase propia y la leyenda conserva .context-bar__hint', () => {
    expect(source).toMatch(/<p class="context-bar__now">\{\{ nowLine\(\) \}\}<\/p>/);
    expect(source).toMatch(/<p class="context-bar__hint" aria-hidden="true">WASD mover/);
  });

  it('la leyenda de teclado solo se enciende con puntero fino y ancho >= 1150 px', () => {
    expect(rule('.context-bar__hint')).toMatch(/display: none;/);
    expect(source).toMatch(/@media \(hover: hover\) and \(pointer: fine\) and \(min-width: 1150px\) \{\s*\.context-bar__hint \{ display: block;/);
  });

  it('la <kbd> «E» del botón no se pinta en modo compacto ni sin puntero fino', () => {
    expect(source).toMatch(/@if \(!compactMode\(\)\) \{ <kbd aria-hidden="true">E<\/kbd> \}/);
    expect(source).toMatch(/@media not all and \(hover: hover\) and \(pointer: fine\) \{\s*\.context-bar__interaction kbd \{ display: none; \}/);
  });

  it('una puerta bloqueada también marca candado cuando es el botón secundario', () => {
    expect(source).toMatch(/context-bar__interaction--secondary"[\s\S]*?\[class\.context-bar__interaction--locked\]="also\.verb\.locked"[\s\S]*?@if \(also\.verb\.locked\) \{ <mat-icon class="context-bar__lock"/);
  });

  it('el pie tiene altura fija: el mundo no cambia de tamaño al acercarte a algo', () => {
    expect(rule('.bottom-zone')).toMatch(/height: 64px;/);
    expect(rule('.bottom-zone')).not.toMatch(/min-height/);
  });

  it('el botón no hace crecer el pie: una línea con puntos suspensivos', () => {
    expect(rule('.context-bar__copy strong')).toMatch(/white-space: nowrap;/);
    expect(rule('.context-bar__copy strong')).toMatch(/text-overflow: ellipsis;/);
    expect(rule('.context-bar__interaction')).toMatch(/max-height: 100%;/);
  });
});

describe('enlaces con el mundo (T9.5, T9.9)', () => {
  it('el mundo recibe destino, atenuados, puertas y modo compacto, y sus dos salidas nuevas están enlazadas', () => {
    expect(worldTag).toContain('[nextTargetKey]="nextTargetKey()"');
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

  it('la vista previa de autor cierra el diálogo con su salida segura (no hay intento que pausar)', () => {
    const preview = readFileSync(join(__dirname, 'world-preview.component.ts'), 'utf-8');
    expect(preview).toMatch(/<app-dialogue-panel[^>]*\(safeExit\)="closeDialogue\(\)"/);
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

  it('el pie es de una sola fila y altura fija de 56 px, sin teclas ni leyenda', () => {
    expect(compactCss).toMatch(/\.bottom-zone \{[^}]*flex-wrap: nowrap;[^}]*height: 56px;/);
    expect(compactCss).toMatch(/\.safe-exit__copy kbd, \.context-bar__hint \{ display: none; \}/);
  });

  it('los controles del pie miden al menos 44 px', () => {
    expect(compactCss).toMatch(/\.safe-exit \{[^}]*min-height: 44px;/);
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
