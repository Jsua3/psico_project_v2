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
