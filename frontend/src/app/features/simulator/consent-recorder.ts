import { InjectionToken } from '@angular/core';

/**
 * Registro del consentimiento al aviso de contenido (ETH-01; plan visual F6-2). Hoy el consentimiento vive en el
 * navegador (`sessionStorage`, por intento); el registro en servidor (`ConsentRecord`, F10-8†) solo cambiará la
 * implementación detrás de esta interfaz: la pantalla de juego no se rehace.
 *
 * La regla que no se negocia: un almacenamiento que falla NUNCA da el consentimiento por registrado, y una lectura
 * que falla es «sin consentimiento» (se vuelve a pedir). Sin consentimiento no hay mundo, HUD ni audio.
 */
export interface ConsentRecorder {
  /** ¿Hay consentimiento registrado para esta clave? Una lectura que falla es «no». */
  isGiven(key: string): boolean;
  /**
   * Registra el consentimiento. Se cumple cuando QUEDÓ guardado (se verifica leyéndolo de vuelta) y se rechaza si no
   * se pudo: quien lo pide muestra el error con «Reintentar» y no arranca nada.
   */
  record(key: string): PromiseLike<void>;
}

/** Implementación local: `sessionStorage`, con cada acceso protegido (modo privado, política, cuota). */
export class SessionConsentRecorder implements ConsentRecorder {
  isGiven(key: string): boolean {
    try {
      return sessionStorage.getItem(key) === 'given';
    } catch {
      return false;
    }
  }

  async record(key: string): Promise<void> {
    sessionStorage.setItem(key, 'given');
    // Una escritura que se pierde en silencio (cuota, almacenamiento de solo lectura) no cuenta como registrada.
    if (sessionStorage.getItem(key) !== 'given') throw new Error('El consentimiento no quedó registrado.');
  }
}

export const CONSENT_RECORDER = new InjectionToken<ConsentRecorder>('CONSENT_RECORDER', {
  providedIn: 'root',
  factory: () => new SessionConsentRecorder(),
});
