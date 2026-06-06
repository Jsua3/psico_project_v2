export interface User {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  role: 'ADMIN' | 'PROFESOR' | 'ESTUDIANTE';
  activo?: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}
