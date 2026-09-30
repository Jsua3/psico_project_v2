import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'game-world.component.ts'), 'utf-8');

describe('game-world: controles táctiles', () => {
  it('aparecen por tipo de puntero, no por ancho de ventana', () => {
    expect(source).toContain('@media (pointer: coarse) { .touch-controls { display: grid; } }');
    expect(source).not.toContain('@media (max-width: 900px) { .touch-controls');
  });

  it('cada flecha camina mientras se mantiene y el teclado conserva el paso único', () => {
    for (const dir of ['up', 'left', 'right', 'down']) {
      expect(source).toContain(`(pointerdown)="holdDirection($event, '${dir}')"`);
      expect(source).toContain(`(click)="keyboardNudge($event, '${dir}')"`);
    }
    expect(source.match(/\(pointerup\)="releaseDirection\(\)"/g) ?? []).toHaveLength(4);
    expect(source.match(/\(pointercancel\)="releaseDirection\(\)"/g) ?? []).toHaveLength(4);
    expect(source.match(/\(lostpointercapture\)="releaseDirection\(\)"/g) ?? []).toHaveLength(4);
  });

  it('el paso va antes de la captura del puntero y una captura fallida no lo pierde', () => {
    // Con un pointerId ya inactivo setPointerCapture lanza: si iba primero, el toque se perdía.
    expect(source).toMatch(
      /holdDirection\(event: PointerEvent, direction: PlayerDirection\) \{[\s\S]*?this\.scene\?\.nudge\(direction\);[\s\S]*?this\.scene\?\.setHeldDirection\(direction\);[\s\S]*?try \{\s*\(event\.currentTarget as HTMLElement \| null\)\?\.setPointerCapture\?\.\(event\.pointerId\);\s*\} catch \{/,
    );
  });

  it('la escena suma la dirección mantenida a la entrada de movimiento', () => {
    expect(source).toMatch(/const input: PlayerMotionInput = heldInput\(\{/);
    expect(source).toMatch(/\}, this\.heldDirection, this\.time\.now - this\.heldSince\);/);
  });

  it('un overlay que congela el mundo suelta la dirección mantenida', () => {
    expect(source).toMatch(/setMotionPaused\(paused: boolean\) \{\s*this\.motionPaused = paused;\s*if \(paused\) this\.setHeldDirection\(null\);/);
  });
});
