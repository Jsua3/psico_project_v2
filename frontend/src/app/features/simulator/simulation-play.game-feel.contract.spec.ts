import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'simulation-play.component.ts'), 'utf-8');

describe('simulation-play: game feel del bloque B', () => {
  it('el mundo recibe el estrés del intento', () => {
    expect(source).toContain('[stressLevel]="attempt()?.stressIndex ?? 0"');
  });

  it('la decisión sacude la cámara cuando llega la supervisión', () => {
    expect(source).toMatch(/window\.setTimeout\(\(\) => \{\s*this\.gameWorld\?\.playDecisionImpact\(updated\.feedback!\);\s*this\.dialogue\.set\(this\.buildSupervisionDialogue\(updated\.feedback!\)\);\s*\}, 400\);/);
  });
});
