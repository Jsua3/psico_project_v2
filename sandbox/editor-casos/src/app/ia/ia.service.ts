import { Injectable, signal } from '@angular/core';

import { revisarCaminos } from '../modelo/caminos';
import type { CasoBorrador } from '../modelo/caso';
import { type Cambio, MENSAJE_PROPUESTA_INVALIDA, ejemploLocal, validarPropuesta } from './propuestas';

export type EstadoIa = 'conectado' | 'sin-conexion' | 'limite';

export interface ContextoIa {
  pantalla: string;
  seleccion: string | null;
}

export interface RespuestaIa {
  mensaje: string;
  /** Cambios ya validados contra el caso (vacío si solo explica; null si no hay propuesta usable). */
  cambios: Cambio[] | null;
  modo: 'conectado' | 'sin-conexion';
  invalida: boolean;
  error?: boolean;
}

export interface AccionGuia {
  id: string;
  nombre: string;
  pantalla: string;
}

const MENSAJE_FALLO = 'La IA no respondió. Inténtalo de nuevo en un momento.';

function esJson(r: Response): boolean {
  return (r.headers.get('content-type') ?? '').includes('application/json');
}

/**
 * Habla con el servidor local de IA (/api/ia, puerto 4311 por el proxy). Si el servidor no
 * está o no tiene key, el sandbox sigue funcionando con ejemplos fijos («sin conexión»).
 */
@Injectable({ providedIn: 'root' })
export class IaService {
  private readonly estadoActual = signal<EstadoIa>('sin-conexion');
  readonly estado = this.estadoActual.asReadonly();

  /** Pregunta al servidor si hay IA real. */
  async comprobar(): Promise<EstadoIa> {
    try {
      const r = await fetch('/api/ia/estado');
      const modo = r.ok && esJson(r) ? ((await r.json()) as { modo?: string }).modo : undefined;
      this.estadoActual.set(modo === 'conectado' ? 'conectado' : 'sin-conexion');
    } catch {
      this.estadoActual.set('sin-conexion');
    }
    return this.estadoActual();
  }

  async proponer(caso: CasoBorrador, peticion: string, contexto: ContextoIa, senal?: AbortSignal): Promise<RespuestaIa> {
    const sinConexion = (): RespuestaIa => {
      this.estadoActual.set('sin-conexion');
      const ejemplo = ejemploLocal(caso, contexto.seleccion);
      return { ...ejemplo, modo: 'sin-conexion', invalida: false };
    };
    let r: Response;
    try {
      r = await fetch('/api/ia/proponer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caso, peticion, contexto, avisos: revisarCaminos(caso) }),
        signal: senal,
      });
    } catch (error) {
      if (senal?.aborted) throw error;
      return sinConexion();
    }
    if (!esJson(r)) return sinConexion(); // el proxy no encontró el servidor de IA
    const cuerpo = (await r.json()) as { mensaje?: string; cambios?: unknown; modo?: string };
    if (r.status === 429) {
      this.estadoActual.set('limite');
      return { mensaje: cuerpo.mensaje ?? 'Llegaste al límite de ayuda de la IA por hoy.', cambios: [], modo: 'conectado', invalida: false };
    }
    if (!r.ok) {
      return { mensaje: cuerpo.mensaje ?? MENSAJE_FALLO, cambios: [], modo: 'conectado', invalida: false, error: true };
    }
    const modo = cuerpo.modo === 'conectado' ? 'conectado' : 'sin-conexion';
    this.estadoActual.set(modo);
    const validacion = validarPropuesta(caso, cuerpo.cambios);
    if (!validacion.ok) {
      return { mensaje: MENSAJE_PROPUESTA_INVALIDA, cambios: null, modo, invalida: true };
    }
    return { mensaje: cuerpo.mensaje || 'Aquí tienes mi propuesta.', cambios: validacion.cambios, modo, invalida: false };
  }

  /** La guía con IA: qué acción responde la pregunta. null si no hay IA o no respondió. */
  async guia(pregunta: string, acciones: AccionGuia[]): Promise<{ accionId: string | null; modo: 'resaltar' | 'foco' | 'recorrido'; mensaje: string } | null> {
    try {
      const r = await fetch('/api/ia/guia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pregunta, acciones }),
      });
      if (!r.ok || !esJson(r)) return null;
      const cuerpo = (await r.json()) as { accionId: string | null; modo: 'resaltar' | 'foco' | 'recorrido'; mensaje: string; conexion?: string };
      if (cuerpo.conexion !== 'conectado') return null; // sin IA: el buscador lo hace mejor
      return cuerpo;
    } catch {
      return null;
    }
  }
}
