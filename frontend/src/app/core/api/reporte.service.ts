import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Dashboard, ReporteEstudiante, ReporteGrupo } from '../models/sesion.model';

interface ApiResponse<T> { data: T; }

@Injectable({ providedIn: 'root' })
export class ReporteService {
  private http = inject(HttpClient);
  private readonly API = '/api/reportes';

  getDashboard() {
    return this.http.get<ApiResponse<Dashboard>>(`${this.API}/dashboard`).pipe(map(r => r.data));
  }

  getReporteGrupo(grupoId: number, caseVersionId?: number | null) {
    let params = new HttpParams();
    if (caseVersionId != null) params = params.set('caseVersionId', caseVersionId);
    return this.http.get<ApiResponse<ReporteGrupo>>(`${this.API}/grupo/${grupoId}`, { params })
      .pipe(map(r => r.data));
  }

  /** C3 (E1-10): los intentos de un estudiante con su tiempo y la cobertura «X de N»; solo viajan los filtros pedidos. */
  getReporteEstudiante(estudianteId: number, options: { caseVersionId?: number | null; limit?: number } = {}) {
    let params = new HttpParams();
    if (options.caseVersionId != null) params = params.set('caseVersionId', options.caseVersionId);
    if (options.limit != null) params = params.set('limit', options.limit);
    return this.http.get<ApiResponse<ReporteEstudiante>>(`${this.API}/estudiante/${estudianteId}`, { params })
      .pipe(map(r => r.data));
  }

  exportarCsv(grupoId: number, caseVersionId?: number | null) {
    let params = new HttpParams();
    if (caseVersionId != null) params = params.set('caseVersionId', caseVersionId);
    return this.http.get(`${this.API}/grupo/${grupoId}/export`, {
      params,
      responseType: 'blob'
    });
  }
}
