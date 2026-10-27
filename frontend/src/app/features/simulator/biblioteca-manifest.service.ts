import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { BIBLIOTECA_MANIFEST_URL, BibliotecaManifest, isBibliotecaManifest } from './object-sprite.util';

/**
 * Manifiesto del arte de la biblioteca (`/assets/biblioteca/manifiesto.json`), pedido una sola vez por sesión de
 * juego. Si no carga o no es de esta versión, `load()` devuelve `null` y el juego sigue sin animaciones de cercanía
 * (cada objeto queda en su reposo); el siguiente `load()` vuelve a intentarlo.
 */
@Injectable({ providedIn: 'root' })
export class BibliotecaManifestService {
  private readonly http = inject(HttpClient);
  private ready: BibliotecaManifest | null = null;
  private request: Promise<BibliotecaManifest | null> | null = null;

  load(): Promise<BibliotecaManifest | null> {
    if (this.ready) return Promise.resolve(this.ready);
    this.request ??= firstValueFrom(this.http.get<unknown>(BIBLIOTECA_MANIFEST_URL))
      .then(manifest => {
        if (!isBibliotecaManifest(manifest)) throw new Error('manifiesto.json no es de esta versión');
        this.ready = manifest;
        return manifest;
      })
      .catch(() => {
        this.request = null;
        return null;
      });
    return this.request;
  }
}
