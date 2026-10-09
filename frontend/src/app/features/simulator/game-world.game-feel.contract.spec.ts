import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: game feel del bloque B', () => {
  it('el componente recibe el estrés y lo pasa a la escena en el arranque y en cada cambio', () => {
    expect(source).toContain('readonly stressLevel = input(0);');
    expect(source).toContain("if (changes['stressLevel']) this.scene?.setStressLevel(this.stressLevel());");
    expect(source).toMatch(/this\.scene = new DataDrivenWorldScene\(\{[\s\S]*?\}\);\s*this\.scene\.setStressLevel\(this\.stressLevel\(\)\);/);
  });

  it('las dos rutas de render pintan la viñeta de crisis, también en salas con luz pintada', () => {
    // renderWorld (sala clásica), renderRoom y refitCamera (el lienzo cambió: se redibuja al nuevo rectángulo).
    expect(source.match(/\n {4}this\.applyCrisisVignette\(\);/g) ?? []).toHaveLength(3);
    expect(source).toMatch(/private refitCamera\(\): void \{[\s\S]*?this\.crisisVignette\?\.destroy\(\);\s*this\.applyCrisisVignette\(\);/);
  });

  it('el destello se decide solo donde se cambia de sala de verdad', () => {
    // setWorld: otro mapa (decisión o puerta). Un refresco del mismo mapa no borra uno pendiente.
    expect(source).toMatch(/setWorld\(world: SimulationWorldState\) \{\s*this\.pendingRoomFlash = roomEntryFlash\(this\.world\?\.map\.key \?\? null, world\.map\.key, this\.callbacks\.reduceMotion\)\s*\?\? this\.pendingRoomFlash;/);
    // transitionToRoom: el jugador cruza una salida del ScenarioConfig.
    expect(source).toMatch(/if \(!roomConfig\) return;\s*this\.pendingRoomFlash = roomEntryFlash\(this\.currentRoomKey \|\| null, targetRoomKey, this\.callbacks\.reduceMotion\)\s*\?\? this\.pendingRoomFlash;/);
  });

  it('la crisis la decide la utilidad pura, se congela con el mundo en pausa y nunca deja dos pulsos vivos', () => {
    expect(source).toMatch(/private applyCrisisState\(\): void \{[\s\S]*?crisisVignetteState\(this\.stressLevel, this\.callbacks\.reduceMotion \|\| this\.motionPaused\)[\s\S]*?this\.crisisPulse\?\.stop\(\);[\s\S]*?this\.crisisPulse = this\.tweens\.add\(\{[\s\S]*?yoyo: true,[\s\S]*?repeat: -1/);
    expect(source).toMatch(/setMotionPaused\(paused: boolean\) \{[\s\S]{0,260}this\.applyCrisisState\(\);\s*\}/);
    expect(source).toContain('setDepth(DEPTH.LIGHTING + 1)');
  });

  it('activar movimiento reducido reaplica la crisis y el destello pendiente se consume una sola vez', () => {
    expect(source).toMatch(/setReduceMotion\(reduced: boolean\) \{\s*this\.callbacks\.reduceMotion = reduced;\s*this\.applyCrisisState\(\);\s*\}/);
    expect(source).toMatch(/\n  playPendingRoomFlash\(\): void \{\s*const flash = this\.pendingRoomFlash;\s*this\.pendingRoomFlash = null;/);
  });

  it('la sala única con renderer registrado también pinta la crisis', () => {
    expect(source).toMatch(/\n {6}this\.buildGuide\(\);\s*this\.applyCrisisVignette\(\);\s*this\.playIntroFade\(\);\s*this\.callbacks\.onReady\(\);\s*return;/);
  });

  it('ningún render dispara el destello: espera a que la sala se vea', () => {
    // Dos llamadas dentro de la escena: el fin del fundido de cámara de la salida cliente y
    // `playRevealEffects` (el destello solo si no hay sacudida).
    expect(source.match(/this\.playPendingRoomFlash\(\)/g) ?? []).toHaveLength(2);
    expect(source).toMatch(/this\.cameras\.main\.fadeIn\(180, 0, 0, 0\);[\s\S]{0,200}this\.cameras\.main\.once\('camerafadeincomplete', \(\) => this\.playPendingRoomFlash\(\)\);/);
    // Angular lo pide al retirar su fundido de escena.
    expect(source).toMatch(/\n  playRevealEffects\(feedback: SimulationFeedback \| null\) \{ this\.scene\?\.playRevealEffects\(feedback\); \}/);
  });

  it('las dos viñetas se pintan en el rectángulo visible, compensando el zoom de la cámara', () => {
    expect(source).toMatch(/private strokeVignetteBand\([\s\S]*?const frame = vignetteFrame\(cam\.width, cam\.height, cam\.zoom\);[\s\S]*?g\.strokeRect\(frame\.x \+ i, frame\.y \+ i, frame\.width - i \* 2, frame\.height - i \* 2\);/);
    expect(source).toContain('this.strokeVignetteBand(g, tint, 0.12, 0.3);');
    expect(source).toContain('this.strokeVignetteBand(g, CRISIS_VIGNETTE_TINT, 0.18, 1);');
    // No se cuenta `g.strokeRect(` en todo el archivo: los planos de las salas legacy
    // (zonas restringidas de hospital y comisaría) también lo usan sin ser viñetas.
  });

  it('un destello ya decidido no se dispara con movimiento reducido ni con la escena destruida, y es suave', () => {
    expect(source).toContain('if (!flash || this.callbacks.reduceMotion || !this.ready || !this.cameras?.main) return;');
    expect(source).toMatch(/cam\.flashEffect\.alpha = flash\.peakAlpha;\s*cam\.flash\(flash\.durationMs, \.\.\.flash\.rgb\);/);
  });

  it('la sacudida por decisión la decide decisionShake y solo con la escena lista', () => {
    expect(source).toMatch(/playDecisionImpact\(feedback: Pick<SimulationFeedback, 'classification' \| 'prohibitedConduct'> \| null\): void \{\s*const shake = decisionShake\(feedback, this\.callbacks\.reduceMotion\);\s*if \(shake && this\.ready && this\.cameras\?\.main\) this\.cameras\.main\.shake\(shake\.durationMs, shake\.intensity\);/);
    expect(source).toMatch(/playRevealEffects\(feedback: Pick<SimulationFeedback, 'classification' \| 'prohibitedConduct'> \| null\): void \{\s*if \(decisionShake\(feedback, this\.callbacks\.reduceMotion\)\) \{\s*this\.pendingRoomFlash = null;\s*this\.playDecisionImpact\(feedback\);\s*\} else \{\s*this\.playPendingRoomFlash\(\);\s*\}\s*\}/);
  });
});
