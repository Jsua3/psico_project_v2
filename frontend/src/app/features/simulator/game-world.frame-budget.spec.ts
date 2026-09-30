import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: trabajo por cuadro', () => {
  it('cada reconstrucción de sala mata los tweens antes de destruir los objetos', () => {
    const rebuilds = source.match(/this\.children\.removeAll\(true\);/g) ?? [];
    const guarded = source.match(/this\.tweens\.killAll\(\);\s*this\.children\.removeAll\(true\);/g) ?? [];
    expect(rebuilds.length).toBe(2);
    expect(guarded.length).toBe(rebuilds.length);
  });
});
