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

/**
 * Un apellido de prueba SIN cifras a partir de una marca de tiempo en base 36 (R1b): desde que el servidor exige que un
 * nombre solo lleve letras, espacios, apóstrofos, guiones y puntos, `apellido: stamp` da 400. Cada cifra pasa a una letra
 * (0→a … 9→j); el correo y el código del grupo siguen usando la marca original.
 */
export function nameStamp(stamp: string): string {
  return stamp.replace(/\d/g, digit => String.fromCharCode(97 + Number(digit)));
}
