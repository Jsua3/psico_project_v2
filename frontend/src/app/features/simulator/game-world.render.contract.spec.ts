import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: render a escala entera (spec §8.3)', () => {
  it('el lienzo trabaja en píxeles físicos y sigue al contenedor', () => {
    expect(source).toContain('scale: pixelScaleConfig(this.gameHost!.nativeElement)');
    expect(source).toContain('this.detachHostWatch = watchHostSize(this.phaserGame, this.gameHost!.nativeElement);');
    expect(source).not.toMatch(/Phaser\.Scale\.FIT|hostResizeObserver/);
  });

  it('la cámara usa el zoom entero y se recalcula al cambiar el lienzo', () => {
    expect(source).toMatch(/private applyPixelCamera\(roomWidth: number, roomHeight: number\): void \{[\s\S]*?integerZoom\(cam\.width, cam\.height, roomWidth, roomHeight\)[\s\S]*?cameraBounds\(/);
    expect(source).toContain("this.scale.on('resize', () => this.refitCamera());");
    expect(source).not.toMatch(/cameraZoom/);
    expect(source.match(/\.setZoom\(/g) ?? []).toHaveLength(1);
  });

  it('la viñeta de tono va al suelo; solo la de crisis queda por encima', () => {
    expect(source).toContain("this.addVignette('tone', tint, 0.12, 0.3, DEPTH.LIGHTING_FLOOR);");
    expect(source.match(/DEPTH\.LIGHTING\b/g) ?? []).toHaveLength(1);
    expect(source).toContain("DEPTH.LIGHTING + 1)");
  });
});
