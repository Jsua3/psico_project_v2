import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';

export interface Grupo {
  id: number;
  nombre: string;
  codigo: string;
  totalEstudiantes: number;
}

interface ApiResponse<T> { data: T; message?: string | null; success?: boolean; }

@Injectable({ providedIn: 'root' })
export class GrupoService {
  private http = inject(HttpClient);
  private readonly API = '/api/grupos';

  listar() {
    return this.http.get<ApiResponse<Grupo[]>>(this.API).pipe(map(r => r.data));
  }

  crear(nombre: string, codigo: string) {
    return this.http.post<ApiResponse<Grupo>>(this.API, { nombre, codigo }).pipe(map(r => r.data));
  }

  agregarEstudiante(grupoId: number, email: string) {
    return this.http.post<ApiResponse<Grupo>>(`${this.API}/${grupoId}/estudiantes`, { email })
      .pipe(map(r => r.data));
  }
}
