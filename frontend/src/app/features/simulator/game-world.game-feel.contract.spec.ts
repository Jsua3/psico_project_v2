import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: game feel del bloque B', () => {
  it('el componente recibe el estrés y lo pasa a la escena en el arranque y en cada cambio', () => {
    expect(source).toContain('readonly stressLevel = input(0);');
    expect(source).toContain("if (changes['stressLevel']) this.scene?.setStressLevel(this.stressLevel());");
    expect(source).toMatch(/this\.scene = new DataDrivenWorldScene\(\{[\s\S]*?\}\);\s*this\.scene\.setStressLevel\(this\.stressLevel\(\)\);/);
  });

  it('las dos rutas de render pintan la viñeta de crisis y el destello pendiente, también en salas con luz pintada', () => {
    expect(source.match(/\n {4}this\.applyCrisisVignette\(\);/g) ?? []).toHaveLength(2);
    expect(source.match(/\n {4}this\.playPendingRoomFlash\(\);/g) ?? []).toHaveLength(2);
  });

  it('el destello se decide solo donde se cambia de sala de verdad', () => {
    // setWorld: otro mapa (decisión o puerta). Un refresco del mismo mapa no borra uno pendiente.
    expect(source).toMatch(/setWorld\(world: SimulationWorldState\) \{\s*this\.pendingRoomFlash = roomEntryFlash\(this\.world\?\.map\.key \?\? null, world\.map\.key, this\.callbacks\.reduceMotion\)\s*\?\? this\.pendingRoomFlash;/);
    // transitionToRoom: el jugador cruza una salida del ScenarioConfig.
    expect(source).toMatch(/if \(!roomConfig\) return;\s*this\.pendingRoomFlash = roomEntryFlash\(this\.currentRoomKey \|\| null, targetRoomKey, this\.callbacks\.reduceMotion\)\s*\?\? this\.pendingRoomFlash;/);
  });

  it('la crisis la decide la utilidad pura y nunca deja dos pulsos vivos', () => {
    expect(source).toMatch(/private applyCrisisState\(\): void \{[\s\S]*?this\.crisisPulse\?\.stop\(\);[\s\S]*?crisisVignetteState\(this\.stressLevel, this\.callbacks\.reduceMotion\)/);
    expect(source).toMatch(/this\.crisisPulse = this\.tweens\.add\(\{[\s\S]*?yoyo: true,[\s\S]*?repeat: -1/);
    expect(source).toContain('setDepth(DEPTH.LIGHTING + 1)');
  });

  it('activar movimiento reducido reaplica la crisis y el destello pendiente se consume una sola vez', () => {
    expect(source).toMatch(/setReduceMotion\(reduced: boolean\) \{\s*this\.callbacks\.reduceMotion = reduced;\s*this\.applyCrisisState\(\);\s*\}/);
    expect(source).toMatch(/private playPendingRoomFlash\(\): void \{\s*const flash = this\.pendingRoomFlash;\s*this\.pendingRoomFlash = null;/);
  });

  it('la sala única con renderer registrado también pinta la crisis y el destello', () => {
    expect(source).toMatch(/\n {6}this\.buildGuide\(\);\s*this\.applyCrisisVignette\(\);\s*this\.playPendingRoomFlash\(\);\s*this\.playIntroFade\(\);\s*this\.callbacks\.onReady\(\);\s*return;/);
  });

  it('la viñeta de crisis se pinta en el rectángulo visible, compensando el zoom de la cámara', () => {
    expect(source).toMatch(/private applyCrisisVignette\(\): void \{[\s\S]*?const frame = vignetteFrame\(cam\.width, cam\.height, cam\.zoom\);[\s\S]*?g\.strokeRect\(frame\.x \+ i, frame\.y \+ i, frame\.width - i \* 2, frame\.height - i \* 2\);/);
  });

  it('un destello ya decidido no se dispara si entre tanto se activó el movimiento reducido', () => {
    expect(source).toContain('if (flash && !this.callbacks.reduceMotion) this.cameras.main.flash(flash.durationMs, ...flash.rgb);');
  });

  it('la sacudida por decisión la decide decisionShake y solo con la escena lista', () => {
    expect(source).toMatch(/playDecisionImpact\(feedback: Pick<SimulationFeedback, 'classification' \| 'prohibitedConduct'> \| null\): void \{\s*const shake = decisionShake\(feedback, this\.callbacks\.reduceMotion\);\s*if \(shake && this\.ready\) this\.cameras\.main\.shake\(shake\.durationMs, shake\.intensity\);/);
    expect(source).toMatch(/\n  playDecisionImpact\(feedback: SimulationFeedback \| null\) \{ this\.scene\?\.playDecisionImpact\(feedback\); \}/);
  });
});
