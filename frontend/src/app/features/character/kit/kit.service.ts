import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { KitBundle } from './kit-engine';

export const KIT_BUNDLE_URL = '/assets/characters/kit/kit.json';

/**
 * Paquete del kit (spec §5.3), pedido una sola vez por sesión. Si la carga falla,
 * el siguiente `load()` vuelve a intentarlo; mientras tanto `bundle()` es null y
 * cada pantalla muestra su respaldo.
 */
@Injectable({ providedIn: 'root' })
export class KitService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<KitBundle | null>(null);
  readonly bundle = this.state.asReadonly();
  private request: Promise<KitBundle> | null = null;

  load(): Promise<KitBundle> {
    const ready = this.state();
    if (ready) return Promise.resolve(ready);
    this.request ??= firstValueFrom(this.http.get<KitBundle>(KIT_BUNDLE_URL)).then(
      bundle => {
        this.state.set(bundle);
        return bundle;
      },
      error => {
        this.request = null;
        throw error;
      },
    );
    return this.request;
  }
}
