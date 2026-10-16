export interface ReporteGrupo {
  grupoId: number;
  caseVersionId: number | null;
  simulacion: ReporteSimulacionGrupo | null;
}

export interface ReporteSimulacionGrupo {
  totalIntentos: number;
  intentosCompletados: number;
  intentosEnProgreso: number;
  intentosSalidaSegura: number;
  puntajePromedio: number;
  decisionesAdecuadas: number;
  decisionesRiesgosas: number;
  decisionesInadecuadas: number;
  bitacorasRegistradas: number;
  rubricasAplicadas: number;
  estudiantes: EstudianteSimulacionReporte[];
}

export interface EstudianteSimulacionReporte {
  id: number;
  nombre: string;
  totalIntentos: number;
  intentosCompletados: number;
  intentosEnProgreso: number;
  intentosSalidaSegura: number;
  puntajePromedio: number;
  decisionesAdecuadas: number;
  decisionesRiesgosas: number;
  decisionesInadecuadas: number;
  bitacorasRegistradas: number;
  rubricasAplicadas: number;
  estado: string;
}

export interface Dashboard {
  estudiantesActivos: number;
  simulacionesCompletadasHoy: number;
  puntajePromedioGlobal: number;
  simulacionesCompletadas: number;
  simulacionesEnProgreso: number;
  puntajePromedioSimulacion: number;
  decisionesAdecuadas: number;
  decisionesRiesgosas: number;
  decisionesInadecuadas: number;
  decisionesProhibidas: number;
  ultimosIntentos: SimulacionResumen[];
  intentosRecientes: IntentoReciente[];
}

export interface SimulacionResumen {
  id: string;
  casoTitulo: string;
  estudiante: string;
  puntaje: number;
  estado: string;
}

export interface IntentoReciente {
  id: string;
  casoTitulo: string;
  estudiante: string;
  puntaje: number;
  estado: string;
}

// ─── Reporte de un estudiante (F10-7†: C3, E1-10) ─────────────────────────────────────────────────────────

/** Un intento del estudiante para su docente: `ordinal` es su n.º de intento en el CASO (todas las versiones). */
export interface IntentoEstudianteReporte {
  attemptId: string;
  caseVersionId: number;
  caseTitle: string;
  status: string;
  startedAt: string | null;
  /** Tiempo con la persona jugando (E1-5). */
  activeSeconds: number;
  /** De la hora de inicio a la de cierre; `null` si el intento sigue abierto. */
  clockSeconds: number | null;
  ordinal: number;
}

/** «Mostrando `shown` de `total`»: cuántos intentos trae la respuesta de cuántos hay con ese filtro. */
export interface CoberturaReporte {
  shown: number;
  total: number;
}

export interface ReporteEstudiante {
  /** `displayName` puede faltar: según la política de identificación (decisión 21) solo viaja el alias (`ref`). */
  student: { ref: string; displayName?: string };
  attempts: IntentoEstudianteReporte[];
  coverage: CoberturaReporte;
}
