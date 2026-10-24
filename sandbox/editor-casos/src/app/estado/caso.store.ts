import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import type { CasoBorrador } from '../modelo/caso';

/** Dónde se guarda el caso en el navegador (una recarga no borra el trabajo). */
export const CLAVE_ALMACEN = 'sandbox-editor-casos/v1';

function leerGuardado(): CasoBorrador | null {
  try {
    const texto = localStorage.getItem(CLAVE_ALMACEN);
    if (!texto) return null;
    const datos = JSON.parse(texto) as Partial<CasoBorrador> | null;
    return datos && typeof datos === 'object' && typeof datos.id === 'string' && Array.isArray(datos.escenas)
      ? (datos as CasoBorrador)
      : null;
  } catch {
    return null; // navegador privado, almacenamiento bloqueado o contenido roto
  }
}

/** Estado del caso en borrador. Todo el sandbox lee y cambia el caso por aquí. */
@Injectable({ providedIn: 'root' })
export class CasoStore {
  private readonly router = inject(Router);
  private readonly estado = signal<CasoBorrador | null>(leerGuardado());

  readonly caso = this.estado.asReadonly();

  constructor() {
    effect(() => {
      const caso = this.estado();
      if (caso === null) return; // borrar es explícito: reiniciar()
      try {
        localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(caso));
      } catch {
        // Sin almacenamiento el sandbox sigue funcionando; solo no sobrevive a una recarga.
      }
    });
  }

  /** Vuelve a leer el caso guardado en el navegador. */
  cargarDeLocal(): void {
    this.estado.set(leerGuardado());
  }

  /** Reemplaza el caso en curso. */
  fijar(caso: CasoBorrador): void {
    this.estado.set(caso);
  }

  /** Guarda un caso recién creado desde un lugar y abre el editor. */
  crearCaso(caso: CasoBorrador): void {
    this.fijar(caso);
    void this.router.navigateByUrl('/editor');
  }

  /** Borra el caso y lo guardado: el sandbox vuelve a empezar. */
  reiniciar(): void {
    this.estado.set(null);
    try {
      localStorage.removeItem(CLAVE_ALMACEN);
    } catch {
      // nada que borrar
    }
  }
}
