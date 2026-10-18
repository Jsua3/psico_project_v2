# Rotación de secretos

Este documento explica cómo cambiar («rotar») cada secreto de SIEP: para qué sirve, qué se rompe al cambiarlo, en qué orden
hacerlo y cómo comprobar que funcionó. Está escrito para quien opera la plataforma, no necesariamente para quien programa.

## Antes de empezar

- Los valores nuevos se guardan **solo** en el panel de variables de la plataforma de despliegue (ver
  [despliegue-railway.md](despliegue-railway.md)). Nunca en el repositorio, en un chat ni como argumento de un comando.
- Cambiar una variable no surte efecto hasta **reiniciar** el servicio.
- Antes de rotar `JWT_SIGNING_KEY`, avisa: todas las personas tendrán que volver a entrar.

## Tabla de secretos

| Variable | Para qué sirve | Qué se rompe al rotarla | Orden para rotarla | Cómo verificar |
|---|---|---|---|---|
| `JWT_SIGNING_KEY` | Firma los tokens de sesión, es decir, quién puede entrar. | **Se cierran todas las sesiones**: cada persona vuelve a entrar. No se pierde ningún dato. | 1) Generar un valor nuevo. 2) Pegarlo en la variable. 3) Reiniciar. | `GET /api/health` responde `status: ok`; entrar de nuevo funciona; un token anterior responde 401. |
| `DJANGO_SECRET_KEY` | Sal de los contadores del limitador de peticiones y base del alias con que se muestra cada estudiante (`Estudiante-xxxxxx`) en trazas y listados. **No firma sesiones.** | Los contadores del limitador empiezan de cero y **cambian los alias** de los estudiantes en trazas y listados. Las sesiones siguen valiendo. | 1) Generar un valor nuevo. 2) Pegarlo en la variable. 3) Reiniciar. | `GET /api/health` responde `status: ok`; las sesiones siguen activas. |
| `REFLECTION_KEYS` y `REFLECTION_ACTIVE_KEY` | Cifran las reflexiones de los estudiantes, con llaves versionadas. | Nada, si se sigue el procedimiento. Si se retira la llave vieja antes de pasar las filas, esas reflexiones quedan **ilegibles**. | Procedimiento de cuatro pasos («Rotar las llaves de las reflexiones»). | `rotate_reflection_key --dry-run` muestra `leidas=0 fallidas=0`. |
| `REFLECTION_ENCRYPTION_KEY` | Llave heredada de las reflexiones (`local-aes-gcm-v1`). Producción sigue exigiéndola. | Si cambia antes de pasar las filas heredadas, esas reflexiones quedan **ilegibles**. | Solo después de que `rotate_reflection_key` deje `leidas=0`; luego, como las demás. | Igual que la fila anterior. |
| `DB_PASSWORD` o `DATABASE_URL` | Contraseña del usuario de PostgreSQL. | Entre cambiar la clave en la base y actualizar la variable, las conexiones nuevas fallan. | «Rotar la contraseña de la base de datos». | `GET /api/health` responde `db: ok`. |
| `EMAIL_HOST_USER` y `EMAIL_HOST_PASSWORD` | Credenciales del servidor de correo: avisos, invitaciones y contraseñas temporales. | Los correos no salen mientras no coincidan. | 1) Cambiar la clave en el proveedor de correo. 2) Actualizar la variable. 3) Reiniciar. | Tras reiniciar, revisar en los registros que el siguiente aviso no da error de SMTP. |
| `GOOGLE_OAUTH_CLIENT_ID` | Identificador **público** del cliente de Google. No es un secreto; se documenta igual. | El inicio de sesión con Google deja de funcionar si no coincide con el cliente configurado en Google. | Solo si cambia el cliente en Google: 1) Actualizar la variable. 2) Reiniciar. | Entrar con Google. |
| Cuentas de demostración | Acceso de demostración. Solo existen en desarrollo. | Nada en producción: las siembras se niegan con los ajustes de producción. | Desactivarlas si existieran («Cuentas de demostración»). | No debe haber cuentas de demostración activas. |
| `JWT_SECRET` | **Obsoleto**: ya no firma nada y la aplicación no lo exige. | Nada. | No hace falta rotarla. | Puede borrarse de la plataforma. |

## Reglas que conviene tener claras

- **Rotar `JWT_SIGNING_KEY` cierra todas las sesiones.** Es la herramienta si la llave de firma se ha filtrado.
- **Cerrar las sesiones de una sola persona** (por ejemplo, una cuenta comprometida): un ADMIN usa
  `POST /api/admin/users/<id>/revoke-sessions`. Solo afecta a esa persona.
- **Cambiar la contraseña de una cuenta, o su rol, o desactivarla**, también cierra sus sesiones: lo hace el sistema solo.
- **`DJANGO_SECRET_KEY` no firma sesiones.** Rotarla no cierra ninguna sesión: solo reinicia los contadores del limitador y
  cambia los alias de los estudiantes.

## Rotar las llaves de las reflexiones

1. **Añadir** la llave nueva sin quitar la vieja: en `REFLECTION_KEYS`, `<id nuevo>=<secreto nuevo>` a continuación de las
   existentes, y `REFLECTION_ACTIVE_KEY=<id nuevo>`. Reiniciar. Desde ese momento las reflexiones nuevas se cifran con la
   llave nueva, y las viejas siguen legibles. Producción no arranca si la activa no está en `REFLECTION_KEYS`.
2. **Pasar las filas viejas** a la llave nueva. Primero en simulación y luego de verdad; cada ejecución es reanudable y el
   comando sale con error si alguna fila no se pudo rotar (su resumen da los ids de esas filas, nunca su texto):

   ```
   python manage.py rotate_reflection_key --dry-run
   python manage.py rotate_reflection_key
   ```

3. **Comprobar** que no queda nada pendiente: repetir `python manage.py rotate_reflection_key --dry-run` hasta que el resumen
   diga `leidas=0 fallidas=0`.
4. **Solo entonces** retirar la llave vieja de `REFLECTION_KEYS`. Si se retira antes, las filas que aún la usan quedan
   ilegibles.

## Rotar la contraseña de la base de datos

1. Generar la contraseña nueva (ver «Generar valores»).
2. Cambiarla en la plataforma para el usuario de la base y actualizar `DATABASE_URL` (o `DB_PASSWORD`). Hazlo de corrido:
   entre los dos pasos el servicio no puede abrir conexiones nuevas.
3. Reiniciar el servicio y comprobar `GET /api/health` (`db: ok`).

## Orden si rotas varios secretos a la vez

Primero la contraseña de la base (ventana corta), después las llaves de reflexiones (tres pasos, sin prisa), después
`DJANGO_SECRET_KEY` y el correo. `JWT_SIGNING_KEY` va al final, para que las personas entren una sola vez con todo ya cambiado.

## Generar valores sin dejarlos en el historial

Desde una terminal con Python 3:

- Windows (PowerShell o Git Bash):

  ```
  python -c "import secrets; print(secrets.token_urlsafe(48))" | clip
  ```

- Linux:

  ```
  python3 -c "import secrets; print(secrets.token_urlsafe(48))" | xclip -selection clipboard
  ```

El valor queda en el portapapeles: pégalo en el panel de variables. `token_urlsafe(48)` da 64 caracteres, más de los 50 que
exige producción. Las llaves deben ser **distintas entre sí**: genera cada una por separado.

## Si un secreto se filtra

1. Rótalo de inmediato, según la tabla.
2. Si era `JWT_SIGNING_KEY`, la rotación ya cierra las sesiones: avisa a las personas de que deben volver a entrar.
3. Revisa la auditoría del periodo en que pudo estar expuesto con `GET /api/admin/audit` (un ADMIN). Busca accesos y cambios
   que no reconozcas.
4. Anota el incidente en `docs/seguridad/incidentes.md` (**próximamente**: ese archivo se escribe después).

## Cuentas de demostración

Las siembras de demostración (`seed_demo_users` y `seed_demo_access`) son solo para desarrollo: se niegan con los ajustes de
producción (`shared/dev_only.py`). Sus contraseñas están en el código del repositorio, así que son **públicas**. Si una cuenta
de demostración llegara a la plataforma, desactívala desde la administración y no la uses. Comprobación: no debe haber
cuentas de demostración activas en producción.
