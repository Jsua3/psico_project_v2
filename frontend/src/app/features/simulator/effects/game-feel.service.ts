import { Injectable } from '@angular/core';
import Phaser from 'phaser';

/**
 * Undertale-tier game-feel helpers: camera shake, flash, and fade transitions.
 *
 * Usage:
 *   1. Call `init(scene)` from within the Phaser scene's `create()`.
 *   2. Call individual helpers from scene or Angular code as needed.
 *   3. Call `destroy()` in Angular's `ngOnDestroy` to release the scene reference.
 *
 * The service is `providedIn: 'root'` so it is a singleton injected by Angular DI
 * into `GameWorldComponent`. The Phaser scene reference is set imperatively via `init()`.
 */
@Injectable({ providedIn: 'root' })
export class GameFeelService {
  private scene?: Phaser.Scene;

  init(scene: Phaser.Scene): void {
    this.scene = scene;
  }

  /**
   * Quick camera shake — good for impactful decisions or errors.
   * @param intensity  World-space shake amount (default 0.003 — subtle).
   * @param duration   Duration in ms (default 200).
   */
  shakeCamera(intensity = 0.003, duration = 200): void {
    this.scene?.cameras.main.shake(duration, intensity);
  }

  /**
   * Single-frame color flash — used when a decision lands.
   * @param color     RGB color as 0xRRGGBB (default white).
   * @param duration  Flash fade duration in ms (default 150).
   */
  flashTransition(color = 0xffffff, duration = 150): void {
    if (!this.scene || duration <= 0) return;
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;
    this.scene.cameras.main.flash(duration, r, g, b);
  }

  /**
   * Smooth fade-out → callback → fade-in. Awaitable from async methods.
   * Used for room transitions.
   * @param onMidpoint  Called when the screen is fully black (safe to swap content).
   */
  async fadeTransition(onMidpoint: () => void): Promise<void> {
    const fadePromise = new Promise<void>(resolve => {
      if (!this.scene) { onMidpoint(); resolve(); return; }
      this.scene.cameras.main.fadeOut(300, 0, 0, 0, (_: unknown, progress: number) => {
        if (progress === 1) {
          onMidpoint();
          this.scene?.cameras.main.fadeIn(300, 0, 0, 0);
          resolve();
        }
      });
    });
    const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, 700));
    return Promise.race([fadePromise, timeoutPromise]);
  }

  /**
   * Squish-and-stretch tween on a sprite — good for pickup/confirm feedback.
   * @param sprite    The sprite to squish.
   * @param duration  Total animation duration in ms (default 120).
   */
  squishSprite(sprite: Phaser.GameObjects.Sprite, duration = 120): void {
    if (!this.scene || !sprite) return;
    this.scene?.tweens.add({
      targets: sprite,
      scaleX: 0.85,
      scaleY: 1.15,
      duration: duration / 2,
      yoyo: true,
      ease: 'Bounce.Out',
    });
  }

  /** Release the Phaser scene reference. Call from `ngOnDestroy`. */
  destroy(): void {
    this.scene = undefined;
  }
}
