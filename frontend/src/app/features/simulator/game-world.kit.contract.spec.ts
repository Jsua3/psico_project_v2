import { readFileSync } from 'fs';
import { join } from 'path';

// Fin de línea normalizado: el checkout de Windows trae CRLF y `body()` busca el cierre con \n.
const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

/** Cuerpo de un método de la escena (hasta su llave de cierre a 2 espacios). */
function body(signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`no encuentro ${signature}`);
  return source.slice(start, source.indexOf('\n  }\n', start));
}

describe('game-world: el jugador sale del kit (spec §8.2)', () => {
  it('se resuelve con el punto único y su hoja se pide en preload', () => {
    expect(source).toContain('this.playerVisual = resolveCharacter(kit, playerCharacterRef(stored));');
    expect(source).toContain('queueCharacterSheets(this, this.playerVisual);');
    expect(source).not.toMatch(/resolvePlayerVisual|v1SheetKey|playerCastId|AVATAR_TEXTURE_KEY|avatarSpecs/);
  });

  it('el sprite va a escala 1, con los pies en (24,68) y sin espejo', () => {
    const create = body('private createPlayer(x: number, y: number) {');
    expect(create).toContain('.setOrigin(KIT_ORIGIN_X, KIT_ORIGIN_Y)');
    expect(create).not.toMatch(/setScale|setFlipX|registerLivingActor/);
  });

  it('la pose del jugador la pone el kit (4 filas reales)', () => {
    expect(body('private applyPlayerPose(')).toContain('playKitPose(this.playerSprite, this.playerVisual, direction, walking, this.callbacks.reduceMotion)');
    expect(source).not.toMatch(/playWalkAnimation|setIdleFrame|createAnimations\(/);
  });

  it('el paquete del kit llega antes que Phaser, y sin él el juego arranca igual', () => {
    expect(source).toMatch(/this\.kit\.load\(\)\.then\(bundle => bundle, \(\) => null\)\.then\(bundle => \{[\s\S]*?this\.startGame\(bundle\)/);
    expect(source).toMatch(/new DataDrivenWorldScene\(\{\s*reduceMotion,\s*kit,/);
  });
});
