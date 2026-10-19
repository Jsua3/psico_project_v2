import { HttpErrorResponse } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { SimulationService } from '../../core/api/simulation.service';

/**
 * Registro del consentimiento al aviso de contenido (ETH-01; plan visual F6-2). Desde S3-2b (F10-8†) el consentimiento
 * se registra en el SERVIDOR (`ServerConsentRecorder`, evidencia: ETH-01, SIEP-RF-05) detrás de esta misma interfaz: la
 * pantalla de juego no se rehízo. `SessionConsentRecorder` (solo la pestaña) sigue existiendo para las pruebas.
 *
 * La regla que no se negocia: un almacenamiento o una red que falla NUNCA da el consentimiento por registrado, y una
 * lectura que falla es «sin consentimiento» (se vuelve a pedir). Sin consentimiento no hay mundo, HUD ni audio.
 */
export interface ConsentRecorder {
  /** ¿Hay consentimiento registrado para esta clave? Síncrona. Una lectura que falla es «no». */
  isGiven(key: string): boolean;
  /**
   * Registra el consentimiento. Se cumple cuando QUEDÓ guardado (el servidor respondió; el local, leyéndolo de vuelta) y
   * se rechaza si no se pudo: quien lo pide muestra el error con «Reintentar» y no arranca nada.
   */
  record(key: string): PromiseLike<void>;
  /**
   * OPCIONAL (S3-2b). Pregunta al servidor si la persona ya aceptó el aviso vigente de esa versión del caso, para llenar
   * lo que `isGiven` consulta de forma síncrona (otro navegador, otra sesión). NUNCA se rechaza: una lectura que falla
   * deja todo como estaba, o sea, se pide el aviso.
   */
  prime?(caseVersionId: number): PromiseLike<void>;
  /**
   * OPCIONAL (S3-2b). El servidor respondió 403 `CONSENT_REQUIRED` (consentimiento retirado en otra pestaña, o aviso de
   * otra versión): lo que se sabía de ese caso deja de valer y `isGiven` vuelve a ser «no» hasta aceptar de nuevo.
   */
  forget?(key: string): void;
}

/**
 * La versión del aviso de contenido que ESTE cliente muestra (S3-2b). La vigente la manda el servidor
 * (`SIEP_CONTENT_NOTICE_VERSION`): al aceptar se envía esta y, si no coincide, el servidor responde 409
 * `NOTICE_VERSION_STALE` y no se registra nada. Repite el valor por defecto del servidor
 * (`backend_django/psychosim/settings/base.py`): una prueba de contrato las compara, así que se cambian juntas. Es un
 * BORRADOR hasta que Psicología apruebe el texto del aviso.
 */
export const CONTENT_NOTICE_VERSION = '2026-10-borrador';

const KEY_PREFIX = 'siep_case_consent_';
const KEY_PATTERN = /^siep_case_consent_([1-9]\d*)_(.+)$/;

/** La clave de `sessionStorage` del consentimiento de un intento. La pantalla de juego la arma así desde siempre. */
export function consentStorageKey(caseVersionId: number, attemptId: string): string {
  return `${KEY_PREFIX}${caseVersionId}_${attemptId}`;
}

/** Inversa de {@link consentStorageKey}: de qué versión del caso y de qué intento es la clave, o `null` si no es de un intento. */
export function parseConsentStorageKey(key: string): { caseVersionId: number; attemptId: string } | null {
  const match = KEY_PATTERN.exec(key);
  return match ? { caseVersionId: Number(match[1]), attemptId: match[2] } : null;
}

/** Valor de la marca por intento que deja el registro en la pestaña. */
const GIVEN = 'given';
/** Código estable del 409 con el que el servidor dice que el aviso enviado no es el vigente. */
const NOTICE_VERSION_STALE = 'NOTICE_VERSION_STALE';

/**
 * El servidor tiene un aviso de otra versión (409 `NOTICE_VERSION_STALE`): no se registra el consentimiento a un aviso que
 * la persona no leyó. La pantalla de juego dice que hay una versión nueva y que se recargue la página.
 */
export class ConsentNoticeStaleError extends Error {
  constructor(readonly currentNoticeVersion: string | null) {
    super('El aviso de contenido cambió de versión en el servidor.');
    this.name = 'ConsentNoticeStaleError';
  }
}

/** Implementación local: `sessionStorage`, con cada acceso protegido (modo privado, política, cuota). */
export class SessionConsentRecorder implements ConsentRecorder {
  isGiven(key: string): boolean {
    try {
      return sessionStorage.getItem(key) === GIVEN;
    } catch {
      return false;
    }
  }

  async record(key: string): Promise<void> {
    sessionStorage.setItem(key, GIVEN);
    // Una escritura que se pierde en silencio (cuota, almacenamiento de solo lectura) no cuenta como registrada.
    if (sessionStorage.getItem(key) !== GIVEN) throw new Error('El consentimiento no quedó registrado.');
  }
}

/**
 * Implementación en el servidor (S3-2b): `GET/POST/DELETE /api/simulation/cases/{caseVersionId}/consent`.
 *
 * - `isGiven` sigue siendo síncrona: consulta lo último que el SERVIDOR dijo de esa versión del caso (al leer con `prime`,
 *   al aceptar, al retirar o al responder 403) y, solo si no lo sabe (la red del GET falló), la marca de la pestaña por
 *   intento, para no pedir el aviso dos veces en la misma sesión.
 * - `record` se cumple SOLO cuando el servidor responde 200 o 201; nada se marca antes ni si algo falla.
 * - El consentimiento es de la persona y de la versión del caso, no de un intento: otro intento del mismo caso lo comparte.
 */
export class ServerConsentRecorder implements ConsentRecorder {
  /** Lo último que el servidor dijo, por versión del caso: aceptado (`true`) o no (`false`). Ausente: no se sabe. */
  private readonly known = new Map<number, boolean>();

  constructor(private readonly api: Pick<SimulationService, 'getConsent' | 'acceptConsent' | 'withdrawConsent'>) {}

  isGiven(key: string): boolean {
    const parsed = parseConsentStorageKey(key);
    if (!parsed) return false;
    return this.known.get(parsed.caseVersionId) ?? this.hasMark(key);
  }

  async prime(caseVersionId: number): Promise<void> {
    try {
      const state = await firstValueFrom(this.api.getConsent(caseVersionId));
      // Solo un `true` estricto es «aceptado»: una respuesta rara es «sin consentimiento».
      this.known.set(caseVersionId, state.accepted === true);
    } catch {
      // Una lectura que falla no es un error de pantalla: no se sabe nada y se pide el aviso.
    }
  }

  async record(key: string): Promise<void> {
    const parsed = parseConsentStorageKey(key);
    if (!parsed) throw new Error('La clave del consentimiento no es de un intento.');
    try {
      await firstValueFrom(this.api.acceptConsent(parsed.caseVersionId, CONTENT_NOTICE_VERSION));
    } catch (cause) {
      const stale = staleNoticeVersionOf(cause);
      if (stale !== undefined) throw new ConsentNoticeStaleError(stale);
      throw new Error('No se pudo registrar el consentimiento en el servidor.', { cause });
    }
    // Recién con la respuesta del servidor: la memoria manda; la marca de la pestaña es un respaldo de mejor esfuerzo.
    this.known.set(parsed.caseVersionId, true);
    this.writeMark(key);
  }

  forget(key: string): void {
    const parsed = parseConsentStorageKey(key);
    if (!parsed) return;
    this.known.set(parsed.caseVersionId, false);
    this.removeMark(key);
  }

  /** Retira el consentimiento de esa versión del caso en el servidor (idempotente). La interfaz para pedirlo no existe todavía. */
  async withdraw(caseVersionId: number): Promise<void> {
    try {
      await firstValueFrom(this.api.withdrawConsent(caseVersionId));
    } catch (cause) {
      throw new Error('No se pudo retirar el consentimiento en el servidor.', { cause });
    }
    this.known.set(caseVersionId, false);
    this.removeMarksOf(caseVersionId);
  }

  private hasMark(key: string): boolean {
    try {
      return sessionStorage.getItem(key) === GIVEN;
    } catch {
      return false;
    }
  }

  private writeMark(key: string): void {
    try {
      sessionStorage.setItem(key, GIVEN);
    } catch {
      // Sin almacenamiento la marca no se guarda: el registro del servidor ya vale. Solo se pierde el respaldo.
    }
  }

  private removeMark(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Lo que se sabe en memoria ya es «no»; una marca que no se pudo borrar no se lee mientras tanto.
    }
  }

  /** Las marcas de todos los intentos de esa versión del caso (el `_` final evita tomar el caso 77 por el 7). */
  private removeMarksOf(caseVersionId: number): void {
    try {
      const prefix = `${KEY_PREFIX}${caseVersionId}_`;
      const marks: string[] = [];
      for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith(prefix)) marks.push(key);
      }
      for (const key of marks) sessionStorage.removeItem(key);
    } catch {
      // Ídem: la memoria ya dice «no».
    }
  }
}

/** Si el error es el 409 `NOTICE_VERSION_STALE`, la versión vigente que trae (o `null` si no la trae); si no, `undefined`. */
function staleNoticeVersionOf(cause: unknown): string | null | undefined {
  if (!(cause instanceof HttpErrorResponse) || cause.status !== 409) return undefined;
  const body = cause.error as { code?: unknown; noticeVersion?: unknown } | null;
  if (body?.code !== NOTICE_VERSION_STALE) return undefined;
  return typeof body.noticeVersion === 'string' ? body.noticeVersion : null;
}

export const CONSENT_RECORDER = new InjectionToken<ConsentRecorder>('CONSENT_RECORDER', {
  providedIn: 'root',
  factory: () => new ServerConsentRecorder(inject(SimulationService)),
});
