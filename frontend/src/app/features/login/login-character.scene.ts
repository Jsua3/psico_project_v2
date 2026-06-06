import type Phaser from 'phaser';
import {
  LOGIN_ASSETS,
  LOGIN_CHARACTER_SPRITE_TRIM,
  LOGIN_LAYOUT,
  resolveLoginCharacterProfile
} from './login-assets.config';

export const LOGIN_CHARACTER_SCENE_KEY = 'SiepLoginCharacter';

const IDLE_KEYS = ['idle-1', 'idle-2', 'idle-3'] as const;
const TRIM = LOGIN_CHARACTER_SPRITE_TRIM;

export function createLoginCharacterScene(PhaserNS: typeof Phaser): typeof Phaser.Scene {
  const assets = LOGIN_ASSETS.character;
  const { idleFrameRate, blinkDelayMinMs, blinkDelayMaxMs, blinkFrameMs } =
    LOGIN_LAYOUT.character;

  return class SiepLoginCharacterScene extends PhaserNS.Scene {
    private character?: Phaser.GameObjects.Sprite;
    private blinkTimer?: Phaser.Time.TimerEvent;

    constructor() {
      super(LOGIN_CHARACTER_SCENE_KEY);
    }

    preload() {
      this.load.image(IDLE_KEYS[0], assets.idle[0]);
      this.load.image(IDLE_KEYS[1], assets.idle[1]);
      this.load.image(IDLE_KEYS[2], assets.idle[2]);
      this.load.image('blink', assets.blink);
    }

    create() {
      this.clearCharacterInstances();

      this.character = this.add
        .sprite(0, 0, IDLE_KEYS[0])
        .setOrigin(0.5, 1)
        .setName('siep-login-character');

      this.applyTrim(this.character);
      this.fitCharacter();

      if (!this.anims.exists('siep-idle')) {
        this.anims.create({
          key: 'siep-idle',
          frames: IDLE_KEYS.map(key => ({ key })),
          frameRate: idleFrameRate,
          repeat: -1
        });
      }

      this.character.play('siep-idle');
      this.scheduleBlink();
      this.scale.on(PhaserNS.Scale.Events.RESIZE, this.fitCharacter, this);
    }

    shutdown() {
      this.blinkTimer?.remove(false);
      this.blinkTimer = undefined;
      this.scale.off(PhaserNS.Scale.Events.RESIZE, this.fitCharacter, this);
      this.character?.destroy();
      this.character = undefined;
    }

    private clearCharacterInstances() {
      this.blinkTimer?.remove(false);
      this.blinkTimer = undefined;

      for (const child of [...this.children.list]) {
        if (child instanceof PhaserNS.GameObjects.Sprite) {
          child.destroy();
        }
      }
      this.character = undefined;
    }

    private getProfile() {
      const width =
        typeof window !== 'undefined' ? window.innerWidth : 1366;
      return resolveLoginCharacterProfile(width);
    }

    private applyTrim(sprite: Phaser.GameObjects.Sprite) {
      sprite.setCrop(TRIM.leftPx, TRIM.topPx, TRIM.widthPx, TRIM.heightPx);
    }

    private targetScale(profile: ReturnType<typeof resolveLoginCharacterProfile>) {
      const hScale = (this.scale.height * profile.scaleHeightFactor) / TRIM.heightPx;
      const wScale = (this.scale.width * profile.scaleWidthFactor) / TRIM.widthPx;
      return Math.min(hScale, wScale);
    }

    fitCharacter() {
      if (!this.character) return;

      const profile = this.getProfile();
      this.character
        .setPosition(
          this.scale.width * profile.anchorX,
          this.scale.height * profile.anchorY
        )
        .setScale(this.targetScale(profile));
      this.applyTrim(this.character);
    }

    private scheduleBlink() {
      this.blinkTimer?.remove(false);
      this.blinkTimer = this.time.delayedCall(
        PhaserNS.Math.Between(blinkDelayMinMs, blinkDelayMaxMs),
        () => {
          if (!this.character) return;
          this.character.stop();
          this.character.setTexture('blink');
          this.applyTrim(this.character);
          this.fitCharacter();

          this.time.delayedCall(blinkFrameMs, () => {
            if (!this.character) return;
            this.character.play('siep-idle');
            this.applyTrim(this.character);
            this.scheduleBlink();
          });
        }
      );
    }
  };
}
