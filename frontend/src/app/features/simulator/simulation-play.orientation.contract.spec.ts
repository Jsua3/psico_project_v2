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
    expect(source).toMatch(/<div class="objective-card">\s*<app-scene-checklist-card/);
    expect(source).not.toMatch(/<div class="objective-card"[^>]*role=/);
  });

  it('ya no se muestra el objetivo antiguo ni su ayuda visual', () => {
    expect(source).not.toContain('getSceneObjective');
    expect(source).not.toContain('sceneObjective');
    expect(source).not.toContain('objective-card__body');
    expect(source).not.toContain('objective-card__ethic');
    expect(source).not.toMatch(/<strong>Objetivo<\/strong>/);
  });

  it('el aviso de contenido sensible de la etapa sigue visible, junto a la narrativa del panel lateral', () => {
    expect(source).toMatch(/class="right-panel__warning"/);
    expect(source).toContain('game.currentNode.warningMessage');
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

  it('la línea «Ahora: …» tiene su clase propia y la leyenda conserva .context-bar__hint', () => {
    expect(source).toMatch(/<p class="context-bar__now">\{\{ nowLine\(\) \}\}<\/p>/);
    expect(source).toMatch(/<p class="context-bar__hint">WASD mover/);
  });

  it('la leyenda de teclado solo se enciende con puntero fino y ancho >= 1150 px', () => {
    expect(rule('.context-bar__hint')).toMatch(/display: none;/);
    expect(source).toMatch(/@media \(hover: hover\) and \(pointer: fine\) and \(min-width: 1150px\) \{\s*\.context-bar__hint \{ display: block;/);
  });

  it('la <kbd> «E» del botón no se pinta en modo compacto', () => {
    expect(source).toMatch(/@if \(!compactMode\(\)\) \{ <kbd aria-hidden="true">E<\/kbd> \}/);
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
    expect(source).toMatch(/<footer class="bottom-zone" \[attr\.inert\]="inputBlocked\(\)/);
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
