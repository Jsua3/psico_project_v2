import Phaser from 'phaser';

/**
 * WebGL post-processing pipeline that adds a vignette (dark border) effect.
 * Registered on the main camera and driven by the current stress level.
 *
 * Safe fallback: the pipeline is only created when the renderer is WebGL;
 * Canvas-mode games skip pipeline registration entirely (the `instanceof`
 * check in game-world.component.ts guards this).
 */
export class VignettePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private _intensity: number = 0.4;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: 'VignettePipeline',
      fragShader: `
        precision mediump float;
        uniform sampler2D uMainSampler;
        uniform float uIntensity;
        varying vec2 outTexCoord;
        void main(void) {
          vec4 color = texture2D(uMainSampler, outTexCoord);
          vec2 uv = outTexCoord * (1.0 - outTexCoord.yx);
          float vig = uv.x * uv.y * 15.0;
          vig = pow(vig, uIntensity);
          gl_FragColor = vec4(color.rgb * vig, color.a);
        }
      `
    });
  }

  override onBoot(): void {
    this.set1f('uIntensity', this._intensity);
  }

  setIntensity(v: number): void {
    this._intensity = v;
    this.set1f('uIntensity', v);
  }

  /** Animates the vignette with a slow pulse — called during high-stress (>85) moments. */
  pulseForCrisis(time: number): void {
    const pulse = 0.3 + Math.sin(time * 0.003) * 0.15;
    this.setIntensity(pulse);
  }
}
