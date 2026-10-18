import { randomBytes } from 'node:crypto';

import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

/**
 * Desde S1-5 la cuenta que crea (o a la que le fija la clave) un ADMIN nace con contraseña TEMPORAL: toda orden de la API
 * responde 403 `PASSWORD_CHANGE_REQUIRED` hasta que la persona fija la suya (`/api/auth/change-password`). Las pruebas que
 * crean estudiantes o docentes por `POST /api/admin/users` y luego los usan por API llaman a esta función justo después de
 * crearlos: entra con la temporal, la cambia por una propia (generada en ejecución, no un literal) y devuelve la nueva.
 */
export async function setOwnPassword(request: APIRequestContext, email: string, temporary: string): Promise<string> {
  const own = `Propia-${randomBytes(6).toString('hex')}-Zq9!`;
  const login = await request.post('/api/auth/login', { data: { email, password: temporary } });
  expect(login.status(), `login por API de ${email} con la contraseña temporal`).toBe(200);
  const token = (await login.json()).data.token as string;
  const changed = await request.post('/api/auth/change-password', {
    headers: { Authorization: `Bearer ${token}` },
    data: { currentPassword: temporary, newPassword: own },
  });
  expect(changed.status(), `cambiar la contraseña temporal de ${email}: ${await changed.text()}`).toBe(200);
  return own;
}
