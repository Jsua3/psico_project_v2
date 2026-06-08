import Phaser from 'phaser';

/**
 * WebGL post-processing pipeline that adds a vignette (dark border) effect.
 * Registered on the main camera and driven by the current stress level.
 *
 * Phaser 3.60+ PostFXPipeline lifecycle:
 *  - setIntensity() / pulseForCrisis(): pure-JS value stores — no GL calls,
 *    safe to call at any time (game update loop, Angular change detection, etc.)
 *  - onDraw(): the ONLY correct place to push uniforms to the GPU.
 *    Phaser calls this during the PostFX render pass; at that point this.bind()
 *    activates the shader program and sets this.currentShader, after which
 *    set1f() is safe.
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

  /** Cache the new intensity — no GL calls here; uniform is pushed in onDraw(). */
  setIntensity(v: number): void {
    this._intensity = Math.max(0, Math.min(1, v));
  }

  /** Animate the vignette with a slow pulse during high-stress moments. */
  pulseForCrisis(time: number): void {
    this._intensity = 0.3 + Math.sin(time * 0.003) * 0.15;
  }

  /**
   * Called by Phaser's renderer once per PostFX pass.
   * Bind activates the shader (setting this.currentShader), making set1f safe.
   * bindAndDraw attaches the source render-target texture and issues the draw call.
   */
  override onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    this.bind();                              // activates shader → this.currentShader set
    this.set1f('uIntensity', this._intensity);
    this.bindAndDraw(renderTarget);           // binds uMainSampler + fullscreen triangle draw
  }
}
