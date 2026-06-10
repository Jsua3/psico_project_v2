import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AvatarConfig } from './avatar.model';

export type AvatarPreviewPose = 'front' | 'side';

export interface AvatarSpriteLayer {
  key: string;
  assetPath: string;
  backgroundImage: string;
  zIndex: number;
}

const MODULAR_ASSET_BASE = '/assets/characters/modular';

function layer(key: string, assetPath: string, zIndex: number): AvatarSpriteLayer {
  return {
    key,
    assetPath,
    backgroundImage: `url("${assetPath}")`,
    zIndex,
  };
}

function faceId(config: AvatarConfig): 'neutral' | 'calm' | 'worried' {
  if (config.mouth === 'sonrisa') return 'calm';
  if (config.mouth === 'seria') return 'worried';
  return 'neutral';
}

export function avatarFramePosition(pose: AvatarPreviewPose): string {
  return pose === 'side' ? '0% 50%' : '0% 0%';
}

export function resolveAvatarSpriteLayers(config: AvatarConfig): AvatarSpriteLayer[] {
  const face = faceId(config);
  const layers: AvatarSpriteLayer[] = [
    layer('body', `${MODULAR_ASSET_BASE}/body/body_orientadora_purple.png`, 10),
  ];

  // Primer corte estable: solo el pelo corto negro queda aprobado visualmente.
  // Otros peinados siguen en el modelo, pero no se renderizan hasta tener arte limpio.
  if (config.hairStyle !== 'ninguno') {
    layers.push(layer('hair-back-short-black', `${MODULAR_ASSET_BASE}/hair/hair_short_black_back.png`, 20));
  }

  layers.push(layer(`face-${face}`, `${MODULAR_ASSET_BASE}/face/face_${face}.png`, 30));

  if (config.hairStyle !== 'ninguno') {
    layers.push(layer('hair-front-short-black', `${MODULAR_ASSET_BASE}/hair/hair_short_black_front.png`, 40));
  }

  return layers;
}

@Component({
  selector: 'app-avatar-figure',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="avatar-pixel" [class.avatar-pixel--portrait]="portrait()" role="img"
      [attr.aria-label]="'Avatar pixel art del estudiante'">
      <span class="avatar-shadow" aria-hidden="true"></span>
      @for (layer of layers(); track layer.key) {
        <span class="avatar-layer" aria-hidden="true"
          [attr.data-layer]="layer.key"
          [style.z-index]="layer.zIndex"
          [style.background-image]="layer.backgroundImage"
          [style.background-position]="framePosition()"></span>
      }
    </div>
  `,
  styles: [`
    :host {
      display: inline-block;
      line-height: 0;
    }

    .avatar-pixel {
      position: relative;
      width: 100%;
      height: 100%;
      min-width: 32px;
      min-height: 48px;
      overflow: visible;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }

    .avatar-layer {
      position: absolute;
      inset: 0;
      background-repeat: no-repeat;
      background-size: 300% 300%;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }

    .avatar-shadow {
      position: absolute;
      left: 50%;
      bottom: 2%;
      z-index: 0;
      width: 46%;
      height: 6%;
      border-radius: 50%;
      background: rgba(0, 0, 0, .34);
      filter: blur(1px);
      transform: translateX(-50%);
    }

    .avatar-pixel--portrait {
      overflow: hidden;
    }

    .avatar-pixel--portrait .avatar-layer {
      inset: auto;
      top: -24%;
      left: 0;
      width: 100%;
      height: 150%;
    }

    .avatar-pixel--portrait .avatar-shadow {
      display: none;
    }
  `]
})
export class AvatarFigureComponent {
  readonly config = input.required<AvatarConfig>();
  readonly pose = input<AvatarPreviewPose>('front');
  readonly portrait = input(false);

  readonly layers = computed(() => resolveAvatarSpriteLayers(this.config()));
  readonly framePosition = computed(() => avatarFramePosition(this.pose()));
}
