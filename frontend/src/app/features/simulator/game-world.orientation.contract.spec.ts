import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

/** Cuerpo de un método de la escena: desde su firma hasta la siguiente declaración al mismo nivel. */
function bodyOf(signature: RegExp, until: RegExp): string {
  const start = source.search(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start);
  const end = rest.slice(1).search(until);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

describe('game-world: contrato público de orientación (F§6.4)', () => {
  it('entradas nuevas con su tipo y valor por defecto', () => {
    expect(source).toContain('readonly nextTargetKey = input<string | null>(null);');
    expect(source).toContain("readonly doorStates = input<Record<string, 'open' | 'locked'>>({});");
    expect(source).toContain('readonly dimmedKeys = input<ReadonlySet<string>>(new Set<string>());');
    expect(source).toContain('readonly compact = input(false);');
  });

  it('salidas nuevas y la existente', () => {
    expect(source).toContain('readonly proximity = output<MapObjectState | null>();');
    expect(source).toContain('readonly proximityAlso = output<MapObjectState | null>();');
    expect(source).toContain('readonly nothingNearby = output<void>();');
    expect(source).toMatch(/onProximityAlso: i => this\.zone\.run\(\(\) => this\.proximityAlso\.emit\(i\)\),/);
    expect(source).toMatch(/onNothingNearby: \(\) => this\.zone\.run\(\(\) => this\.nothingNearby\.emit\(\)\),/);
  });

  it('un cambio de destino, puertas o atenuados llega a la escena por una sola vía', () => {
    expect(source).toMatch(/if \(changes\['nextTargetKey'\] \|\| changes\['doorStates'\] \|\| changes\['dimmedKeys'\]\) this\.pushOrientation\(\);/);
    expect(source).toMatch(/this\.scene\?\.setOrientation\(\{\s*nextTargetKey: this\.nextTargetKey\(\),\s*doorStates: this\.doorStates\(\),\s*dimmedKeys: this\.dimmedKeys\(\),\s*\}\);/);
  });

  it('se conservan isAnyNpcInRange y nearbyInteractionChannel', () => {
    expect(source).toMatch(/private isAnyNpcInRange\(\): boolean \{/);
    const util = readFileSync(join(__dirname, 'interaction-priority.util.ts'), 'utf-8');
    expect(util).toContain('export function nearbyInteractionChannel(');
  });

  it('interactNearest despacha por clave: personas por npc:, marcadores como siempre, y avisa si no hay nada', () => {
    const body = bodyOf(/\n  interactNearest\(\) \{\n    const key/, /\n  \/\*\*/);
    expect(body).toMatch(/key\.startsWith\(NPC_KEY_PREFIX\)/);
    expect(body).toContain('this.callbacks.onNpcInteract(npc)');
    expect(body).toContain('this.callbacks.onInteract(obj)');
    expect(body).toContain('this.callbacks.onNothingNearby()');
    expect(body).not.toMatch(/playSfx|sound\.play|ui_cancel/);
  });
});

describe('game-world: nada nuevo por cuadro (F§7.2, 59 FPS)', () => {
  const frameBody = bodyOf(/\n  private updateNearestInteraction\(suppressSound = false\) \{/, /\n  \/\*\*\n   \* Lo que se le entrega a Angular/);

  it('la proximidad reutiliza listas y piezas: ni copias, ni mapas, ni objetos nuevos por cuadro', () => {
    expect(frameBody).not.toMatch(/\.map\(|\.filter\(|\.sort\(|\.slice\(|\.concat\(|\[\.\.\.|\{ \.\.\./);
    expect(frameBody).not.toMatch(/new (Map|Set|Array)\b/);
    expect(frameBody).toContain('list.length = 0;');
    expect(frameBody).toContain('pickNearby(list, this.nearestKey, this.pick)');
    expect(frameBody).toContain('this.revealScratch');
  });

  it('los avisos y el repintado solo ocurren cuando algo cambió', () => {
    expect(frameBody).toMatch(/if \(primaryChanged \|\| alsoChanged \|\| revealChanged\) this\.refreshMarkerStates\(\);/);
    expect(frameBody).toMatch(/if \(primaryChanged\) \{[\s\S]*?this\.callbacks\.onProximity\(/);
    expect(frameBody).toMatch(/if \(alsoChanged\) \{[\s\S]*?this\.callbacks\.onProximityAlso\(/);
  });

  it('el anillo, los rótulos y los atenuados no usan tweens ni se actualizan desde update()', () => {
    for (const body of [
      bodyOf(/\n  private syncTargetRing\(\): void \{/, /\n  \/\*\* Reinicia/),
      bodyOf(/\n  private refreshMarkerStates\(\) \{/, /\n  \/\*\* El canvas cambió/),
      bodyOf(/\n  setOrientation\(next: \{/, /\n  \/\*\* Puntero táctil/),
    ]) {
      expect(body).not.toMatch(/tweens\.add|this\.tweens/);
    }
    const update = bodyOf(/\n  override update\(time: number, delta: number\) \{/, /\n  setWorld\(/);
    expect(update).not.toMatch(/refreshMarkerStates|syncTargetRing|applyDoorStates|setOrientation|labelScale/);
    expect(update).toContain('this.updateNearestInteraction();');
    expect(update).not.toContain('updateNpcHints');
  });

  // req: BLOQUE-H (H-12)
  it('con el foco en una región con scroll las flechas la desplazan y el jugador no camina', () => {
    expect(source).toMatch(/const typing = isTextEntryTarget\(focus\) \|\| isScrollRegionTarget\(focus\);/);
    expect(source).toMatch(/left:  !typing && \(this\.cursors\.left\.isDown/);
  });

  it('la pulsación corta de E, Espacio y Enter no se pierde (T0.2) y respeta las mismas reglas de foco', () => {
    expect(source).toMatch(/this\.keys\['E'\]\?\.on\('down', \(\) => \{ this\.tappedKeys\.e = true; \}\);/);
    expect(source).toMatch(/this\.keys\['SPACE'\]\?\.on\('down', \(\) => \{ this\.tappedKeys\.space = true; \}\);/);
    expect(source).toMatch(/this\.keys\['ENTER'\]\?\.on\('down', \(\) => \{ this\.tappedKeys\.enter = true; \}\);/);
    expect(source).toMatch(/const tapped = resolveInteractPress\(focus, this\.tappedKeys\);/);
    expect(source).toMatch(/this\.interactPending = !typing && \(this\.interactPending \|\| pressed \|\| tapped\);/);
  });
});

describe('game-world: ratón (F6-7, VD-5)', () => {
  // req: BLOQUE-H, RNF-04
  it('el hover va por eventos del puntero, no por cuadro: update() no sabe nada de él', () => {
    expect(source).toMatch(/this\.input\.on\('pointermove', this\.handlePointerMove, this\);/);
    const update = bodyOf(/\n  override update\(time: number, delta: number\) \{/, /\n  setWorld\(/);
    expect(update).not.toMatch(/hover|Hover|pickHoverTarget|handlePointerMove/);
  });

  it('con dedo o con una capa abierta no se resalta nada y el contorno solo sale de lo elegible', () => {
    const handler = bodyOf(/\n  private handlePointerMove\(pointer: Phaser\.Input\.Pointer\): void \{/, /\n  private setHover\(/);
    expect(handler).toContain('pointer.wasTouch || this.motionPaused');
    expect(handler).toContain('pickHoverTarget(');
    expect(handler).toContain('this.examinedKeys');
  });

  it('el hover no lee clasificación ni datos clínicos de lo que señala', () => {
    const hover = bodyOf(/\n  \/\*\* Lo ya examinado llega de Angular/, /\n  focus\(key: string\) \{/);
    expect(hover).not.toMatch(/classification|prohibitedConduct|isRecommended|isProhibited|decisionOptionId|effect\b/);
  });

  it('el mundo no pide nada al servidor al pasar el puntero (solo callbacks de la propia escena)', () => {
    const hover = bodyOf(/\n  \/\*\* Lo ya examinado llega de Angular/, /\n  focus\(key: string\) \{/);
    expect(hover).not.toMatch(/http|fetch|simulation\.|onInteract|onNpcInteract/);
  });
});

describe('game-world: señales iguales para todos (límite 1 de producto)', () => {
  it('el anillo y los rótulos nacen de la clave del destino y de la distancia, nunca de lo clínico', () => {
    const forbidden = /classification|prohibitedConduct|isRecommended|isProhibited|decisionOptionId/;
    for (const body of [
      bodyOf(/\n  private updateNearestInteraction\(suppressSound = false\) \{/, /\n  \/\*\*\n   \* Lo que se le entrega a Angular/),
      bodyOf(/\n  private syncTargetRing\(\): void \{/, /\n  \/\*\* Reinicia/),
      bodyOf(/\n  private refreshMarkerStates\(\) \{/, /\n  \/\*\* El canvas cambió/),
    ]) {
      expect(body).not.toMatch(forbidden);
    }
  });

  it('el anillo es único (un trazo claro y su halo), con colores fijos', () => {
    expect(source).toContain('const RING_COLOR = 0xcdbcff;');
    expect(source).toContain('const RING_HALO_COLOR = 0x0b0f1a;');
    // El atenuado de las otras etapas vive en markerEmphasis (world-characters.util): el componente no repite el valor.
    expect(readFileSync(join(__dirname, 'world-characters.util.ts'), 'utf-8')).toContain('export const DIMMED_ALPHA = 0.55;');
    expect(source).not.toContain('const DIMMED_ALPHA');
  });

  it('en táctil la pista de una persona y el rótulo de una puerta no mencionan la tecla E', () => {
    expect(source).toMatch(/private npcHintGlyph\(\): string \{\s*return this\.touchPointer\(\) \? '▲' : '▲ E';\s*\}/);
    expect(source).toMatch(/private doorHintText\(label: string\): string \{\s*return this\.touchPointer\(\) \? `\$\{label\} →` : `E  \$\{label\} →`;\s*\}/);
    expect(source).not.toContain("'▲ E', {");
  });
});
