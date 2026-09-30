import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AvatarStore } from '../character/avatar.store';
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

const source = readFileSync(join(__dirname, 'case-intro-scene.component.ts'), 'utf-8');

describe('CaseIntroSceneComponent', () => {
  let fixture: ComponentFixture<CaseIntroSceneComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const actor = () => host().querySelector('.intro-actor') as HTMLElement;
  const layerImages = () =>
    Array.from(host().querySelectorAll<HTMLElement>('.intro-actor__layer')).map(layer => layer.style.backgroundImage);

  function create(options: { reduceMotion?: boolean; castId?: string } = {}): void {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CaseIntroSceneComponent],
      // `new AvatarStore()` evita la reflexión JIT de su parámetro opcional `Storage`
      // (NG0202 en ts-jest); recurre al localStorage de jsdom.
      providers: [{ provide: AvatarStore, useFactory: () => new AvatarStore() }],
    });
    if (options.castId !== undefined) TestBed.inject(AvatarStore).update({ castId: options.castId });
    fixture = TestBed.createComponent(CaseIntroSceneComponent);
    if (options.reduceMotion) writeInputSignal(fixture.componentInstance.reduceMotion, true);
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('el personaje elegido entra caminando con su hoja de caminata, en pixel art', () => {
    create();
    expect(actor().classList).toContain('intro-actor--walking');
    expect(actor().classList).toContain('intro-actor--pixel');
    expect(layerImages()).toHaveLength(1);
    expect(layerImages()[0]).toContain('/assets/characters/v1/valentina/base/walk.png');
    // El primer cuadro ya está puesto antes del primer requestAnimationFrame (fila derecha).
    expect(actor().style.getPropertyValue('--frame-y')).toBe('-144px');
  });

  it('al terminar de caminar se queda de frente con la hoja de reposo', () => {
    create();
    actor().dispatchEvent(new Event('animationend'));
    fixture.detectChanges();
    expect(actor().classList).not.toContain('intro-actor--walking');
    expect(layerImages()[0]).toContain('/assets/characters/v1/valentina/base/idle.png');
    expect(actor().style.getPropertyValue('--frame-y')).toBe('0px');
  });

  it('con movimiento reducido empieza quieto, de frente y en su sitio', () => {
    create({ reduceMotion: true });
    expect(actor().classList).not.toContain('intro-actor--walking');
    expect(layerImages()[0]).toContain('/assets/characters/v1/valentina/base/idle.png');
    expect(actor().style.getPropertyValue('--frame-x')).toBe('0px');
  });

  it('baja la hoja de reposo mientras camina, para no dejar al personaje en blanco al cambiar de hoja', () => {
    const requested: string[] = [];
    const RealImage = window.Image;
    class FakeImage {
      set src(value: string) { requested.push(value); }
    }
    window.Image = FakeImage as unknown as typeof Image;
    try {
      create();
    } finally {
      window.Image = RealImage;
    }
    expect(requested).toEqual(['/assets/characters/v1/valentina/base/idle.png']);
  });

  it('un personaje del elenco horneado usa su hoja propia, reducida con suavizado', () => {
    create({ castId: 'paula' });
    expect(actor().classList).not.toContain('intro-actor--pixel');
    expect(layerImages()[0]).toContain('/assets/characters/cast/paula.png');
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
