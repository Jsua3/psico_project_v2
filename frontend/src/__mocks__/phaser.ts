/* eslint-disable @typescript-eslint/no-explicit-any */
// Minimal Phaser stub for Jest/jsdom environments.
// The real Phaser tries to access canvas APIs on module load, which crashes jsdom.

const noop = () => {};
const noopClass = class {
  constructor(..._args: any[]) {}
};

const Phaser: any = {
  Game: noopClass,
  Scene: noopClass,
  GameObjects: {
    GameObject: noopClass,
    Container: noopClass,
    Image: noopClass,
    Sprite: noopClass,
    Text: noopClass,
    Graphics: noopClass,
    Rectangle: noopClass,
    Zone: noopClass,
  },
  Physics: {
    Arcade: {
      Sprite: noopClass,
      StaticBody: noopClass,
    },
  },
  Math: {
    Vector2: noopClass,
    Clamp: (v: number) => v,
  },
  Cameras: { Scene2D: { Camera: noopClass } },
  Input: { Keyboard: { KeyCodes: {}, JustDown: noop, JustUp: noop } },
  Scale: { FIT: 'FIT', CENTER_BOTH: 'CENTER_BOTH', NO_ZOOM: 'NO_ZOOM' },
  Renderer: {
    WebGL: {
      Pipelines: {
        PostFXPipeline: noopClass,
        PreFXPipeline: noopClass,
      },
      WebGLRenderer: noopClass,
    },
    Canvas: {
      CanvasRenderer: noopClass,
    },
  },
  AUTO: 'AUTO',
  CANVAS: 'CANVAS',
  WEBGL: 'WEBGL',
  Events: {
    EventEmitter: noopClass,
  },
  Tilemaps: {
    Tilemap: noopClass,
    Tileset: noopClass,
  },
  Tweens: {
    TweenManager: noopClass,
  },
  Time: {
    TimerEvent: noopClass,
  },
};

export default Phaser;
module.exports = Phaser;
