import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { User } from '../models/user.model';

export type UserRole = User['role'];

export interface AdminUser extends User {
  activo: boolean;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  role: UserRole;
  activo: boolean;
}

export interface UpdateUserRequest {
  email: string;
  password?: string;
  nombre: string;
  apellido: string;
  role: UserRole;
}

interface ApiResponse<T> {
  message: string | null;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly http = inject(HttpClient);
  private readonly API = '/api/admin/users';

  list() {
    return this.http.get<ApiResponse<AdminUser[]>>(this.API).pipe(map(response => response.data));
  }

  create(request: CreateUserRequest) {
    return this.http.post<ApiResponse<AdminUser>>(this.API, request).pipe(map(response => response.data));
  }

  update(id: number, request: UpdateUserRequest) {
    return this.http.put<ApiResponse<AdminUser>>(`${this.API}/${id}`, request).pipe(map(response => response.data));
  }

  updateStatus(id: number, activo: boolean) {
    return this.http.patch<ApiResponse<AdminUser>>(`${this.API}/${id}/status`, { activo })
      .pipe(map(response => response.data));
  }
}
