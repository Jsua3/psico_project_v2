import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

describe('simulation-play: game feel del bloque B', () => {
  it('el mundo recibe el estrés del intento', () => {
    expect(source).toContain('[stressLevel]="attempt()?.stressIndex ?? 0"');
  });

  it('la sacudida y el destello esperan a que el fundido de escena deje ver el mundo', () => {
    expect(source).toContain('this.pendingDecisionImpact = updated.feedback ?? null;');
    expect(source).toMatch(/window\.setTimeout\(\(\) => \{\s*this\.fadeActive\.set\(false\);\s*this\.scheduleRevealEffects\(\);\s*\}, WORLD_REVEAL_DELAY_MS\);/);
    expect(source).toContain('const WORLD_REVEAL_DELAY_MS = 80;');
    expect(source).toMatch(/private scheduleRevealEffects\(\): void \{\s*window\.setTimeout\(\(\) => this\.playRevealEffects\(\), SCENE_FADE_MS\);\s*\}/);
    expect(source).toMatch(/private playRevealEffects\(\): void \{\s*const impact = this\.pendingDecisionImpact;\s*this\.pendingDecisionImpact = null;\s*this\.gameWorld\?\.playRevealEffects\(impact\);\s*\}/);
  });

  it('la espera coincide con la transición CSS del fundido de escena', () => {
    expect(source).toContain('const SCENE_FADE_MS = 320;');
    expect(source).toMatch(/\.scene-fade \{[^}]*transition: opacity 320ms ease;/);
  });

  it('la supervisión se abre como antes, sin esperar a la sacudida', () => {
    expect(source).toContain('window.setTimeout(() => this.dialogue.set(this.buildSupervisionDialogue(updated.feedback!)), SUPERVISION_DELAY_MS);');
    expect(source).toContain('const SUPERVISION_DELAY_MS = 400;');
  });

  it('la espera del fundido tiene su propia constante y no reutiliza la transición CSS', () => {
    expect(source).toContain('const FADE_OUT_MS = 340;');
    expect(source).toContain('window.setTimeout(callback, FADE_OUT_MS);');
    expect(source).not.toContain('window.setTimeout(callback, SCENE_FADE_MS);');
  });
});
