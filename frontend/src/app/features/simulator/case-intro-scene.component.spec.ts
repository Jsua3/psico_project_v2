import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AvatarStore } from '../character/avatar.store';
import { PlayableId } from '../character/kit/avatar-v2';
import { KitService } from '../character/kit/kit.service';
import { fakeKitService } from '../character/kit/testing/kit-testing';
import { CaseIntroSceneComponent } from './case-intro-scene.component';

type InputSignalNodeLike<T> = {
  applyValueToInputSignal(node: InputSignalNodeLike<T>, value: T): void;
};

function writeInputSignal<T>(inputSignal: () => T, value: T): void {
  const carrier = inputSignal as unknown as { [key: symbol]: InputSignalNodeLike<T> };
  const node = Object.getOwnPropertySymbols(inputSignal)
    .map(symbol => carrier[symbol])
    .find(candidate => typeof candidate?.applyValueToInputSignal === 'function');
  if (!node) throw new Error('No se encontró el nodo interno del input signal');
  node.applyValueToInputSignal(node, value);
}

const source = readFileSync(join(__dirname, 'case-intro-scene.component.ts'), 'utf-8').replace(/\r\n/g, '\n');

/** El kit todavía no llegó: `bundle()` es null y `load()` sigue pendiente. */
function pendingKitService(): KitService {
  return { bundle: signal(null).asReadonly(), load: () => new Promise(() => undefined) } as unknown as KitService;
}

describe('CaseIntroSceneComponent', () => {
  let fixture: ComponentFixture<CaseIntroSceneComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const actor = () => host().querySelector('.intro-actor') as HTMLElement;
  const layerImages = () =>
    Array.from(host().querySelectorAll<HTMLElement>('.intro-actor__layer')).map(layer => layer.style.backgroundImage);

  function create(options: { reduceMotion?: boolean; recipeId?: PlayableId; kit?: KitService } = {}): void {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CaseIntroSceneComponent],
      // `new AvatarStore()` evita la reflexión JIT de su parámetro opcional `Storage`
      // (NG0202 en ts-jest); recurre al localStorage de jsdom.
      providers: [
        { provide: AvatarStore, useFactory: () => new AvatarStore() },
        { provide: KitService, useValue: options.kit ?? fakeKitService() },
      ],
    });
    if (options.recipeId !== undefined) {
      TestBed.inject(AvatarStore).set({ schemaVersion: 2, mode: 'elenco', recipeId: options.recipeId, bata: false });
    }
    fixture = TestBed.createComponent(CaseIntroSceneComponent);
    if (options.reduceMotion) writeInputSignal(fixture.componentInstance.reduceMotion, true);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('el personaje elegido entra caminando con su hoja de caminata del kit, a tamaño nativo', () => {
    create();
    expect(actor().classList).toContain('intro-actor--walking');
    expect(layerImages()).toHaveLength(1);
    expect(layerImages()[0]).toContain('/assets/characters/kit/valentina/walk.png');
    expect(host().querySelector<HTMLElement>('.intro-actor__layer')!.style.backgroundSize).toBe('288px 288px');
    // El primer cuadro ya está puesto antes del primer requestAnimationFrame (fila derecha).
    expect(actor().style.getPropertyValue('--frame-y')).toBe('-144px');
  });

  it('al terminar de caminar se queda de frente con la hoja de reposo', () => {
    create();
    actor().dispatchEvent(new Event('animationend'));
    fixture.detectChanges();
    expect(actor().classList).not.toContain('intro-actor--walking');
    expect(layerImages()[0]).toContain('/assets/characters/kit/valentina/idle.png');
    expect(actor().style.getPropertyValue('--frame-y')).toBe('0px');
  });

  it('con movimiento reducido empieza quieto, de frente y en su sitio', () => {
    create({ reduceMotion: true });
    expect(actor().classList).not.toContain('intro-actor--walking');
    expect(layerImages()[0]).toContain('/assets/characters/kit/valentina/idle.png');
    expect(actor().style.getPropertyValue('--frame-x')).toBe('0px');
  });

  it('baja la hoja de reposo mientras camina, para no dejar al personaje en blanco al cambiar de hoja', async () => {
    const requested: string[] = [];
    const RealImage = window.Image;
    class FakeImage {
      set src(value: string) { requested.push(value); }
    }
    window.Image = FakeImage as unknown as typeof Image;
    try {
      create();
      await Promise.resolve(); // la precarga espera a `kit.load()`
    } finally {
      window.Image = RealImage;
    }
    expect(requested).toEqual(['/assets/characters/kit/valentina/idle.png']);
  });

  it('otro jugable del elenco entra con sus propias hojas del kit', () => {
    create({ recipeId: 'paula' });
    expect(layerImages()).toHaveLength(1);
    expect(layerImages()[0]).toContain('/assets/characters/kit/paula/walk.png');
  });

  it('mientras el kit no llega no hay hoja que dibujar, y la escena no falla', () => {
    create({ kit: pendingKitService() });
    expect(layerImages()).toEqual(['none']);
    expect(actor().style.getPropertyValue('--frame-x')).toBe('0px');
  });

  it('la hoja se dibuja siempre en pixel art (ya no hay hojas suavizadas)', () => {
    expect(source).toMatch(/\.intro-actor__layer \{[^}]*image-rendering: pixelated;/);
    expect(source).not.toContain('intro-actor--pixel');
  });

  it('describe la escena a los lectores de pantalla', () => {
    create();
    expect(host().querySelector('[role="img"]')?.getAttribute('aria-label'))
      .toBe('Tu personaje entra de noche al servicio de urgencias del hospital.');
  });

  it('el rótulo queda por debajo del cuadro del personaje: a 1× no le tapa los pies', () => {
    const rule = (selector: string) =>
      source.match(new RegExp(`${selector.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';
    const value = (css: string, property: string) =>
      parseFloat(css.match(new RegExp(`(?:^|[\\s;])${property}: ([\\d.]+)`))?.[1] ?? 'NaN');
    const caption = rule('.intro-scene__caption');
    expect(caption).toContain('bottom: 4px;');
    expect(caption).toContain('padding: 2px 8px;');
    expect(caption).toContain('line-height: 1.2;');

    // El rótulo no escala con el escenario: a 1× su borde superior debe quedar bajo el cuadro del actor.
    const actor = rule('.intro-actor');
    const actorBottom = value(actor, 'top') + value(actor, 'height');
    const captionHeight = value(caption, 'font-size') * 16 * value(caption, 'line-height') + 2 * 2;
    const frameInnerHeight = 216 - 2; // 216 de escenario menos el borde de 1px por lado (border-box)
    const captionTop = frameInnerHeight - value(caption, 'bottom') - captionHeight;
    expect(actorBottom).toBe(188);
    expect(captionTop).toBeGreaterThanOrEqual(actorBottom + 1);
  });

  it('anima los cuadros fuera de la zona de Angular', () => {
    expect(source).toMatch(/this\.zone\.runOutsideAngular\(\(\) => \{\s*this\.frameId = requestAnimationFrame/);
  });
});
