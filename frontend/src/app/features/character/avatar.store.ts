import { Injectable, Optional, signal } from '@angular/core';
import { AvatarConfig } from './avatar.model';
import { defaultAvatar, parseAvatar, serializeAvatar } from './avatar-config.util';

/** Clave compartida de persistencia del avatar (la lee también el runtime Phaser). */
export const AVATAR_STORAGE_KEY = 'psychosim_avatar';
const KEY = AVATAR_STORAGE_KEY;

@Injectable({ providedIn: 'root' })
export class AvatarStore {
  private readonly store: Storage | null;
  private readonly _avatar = signal<AvatarConfig>(defaultAvatar());
  readonly avatar = this._avatar.asReadonly();

  /**
   * `storage` is optional and only used by unit tests (passed directly).
   * Under Angular DI there is no `Storage` provider, so `@Optional()` makes the
   * injector pass `null` instead of throwing NG0201; we then fall back to
   * `window.localStorage`.
   */
  constructor(@Optional() storage?: Storage) {
    this.store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    this.loadSaved();
  }

  loadSaved(): void {
    this._avatar.set(parseAvatar(this.safeGet()));
  }

  update(patch: Partial<AvatarConfig>): void {
    this._avatar.update(a => ({ ...a, ...patch }));
  }

  save(): void {
    try { this.store?.setItem(KEY, serializeAvatar(this._avatar())); } catch { /* cuota/privado: no-op */ }
  }

  reset(): void {
    this._avatar.set(defaultAvatar());
  }

  private safeGet(): string | null {
    try { return this.store?.getItem(KEY) ?? null; } catch { return null; }
  }
}
