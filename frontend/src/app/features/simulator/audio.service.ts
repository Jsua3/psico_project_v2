import { Injectable } from '@angular/core';

/**
 * Lightweight game audio service — no external library needed.
 * Uses standard HTMLAudioElement with lazy caching.
 * Respects (prefers-reduced-motion: reduce) for users who also want no audio.
 *
 * Sound map uses Kenney UI Audio CC0 pack:
 *   /assets/game/kenney/ui-audio/Audio/
 */
export type GameSoundKey =
  | 'dialogue-open'
  | 'choice-hover'
  | 'choice-select'
  | 'choice-error'
  | 'tool-use'
  | 'journal-open'
  | 'journal-close'
  | 'scene-transition';

const BASE = '/assets/game/kenney/ui-audio/Audio/';

const SOUND_PATHS: Record<GameSoundKey, string> = {
  'dialogue-open':    BASE + 'switch2.ogg',
  'choice-hover':     BASE + 'rollover1.ogg',
  'choice-select':    BASE + 'click1.ogg',
  'choice-error':     BASE + 'mouserelease1.ogg',
  'tool-use':         BASE + 'switch3.ogg',
  'journal-open':     BASE + 'switch1.ogg',
  'journal-close':    BASE + 'mouserelease1.ogg',
  'scene-transition': BASE + 'switch4.ogg',
};

@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly cache = new Map<string, HTMLAudioElement>();
  /** Set to true to silence all game audio (e.g. user preference toggle) */
  muted = false;

  play(key: GameSoundKey): void {
    if (this.muted || typeof Audio === 'undefined') return;
    // Mirror the prefers-reduced-motion preference for audio too
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const path = SOUND_PATHS[key];
    let el = this.cache.get(path);
    if (!el) {
      el = new Audio(path);
      el.volume = 0.38;
      this.cache.set(path, el);
    }
    el.currentTime = 0;
    el.play().catch(() => { /* autoplay policy — silently ignore */ });
  }
}
