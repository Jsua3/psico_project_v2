# Despliegue de SIEP en Railway

Esta guía despliega **todo en un solo servicio**: el backend Django (gunicorn)
sirve la API en `/api/...` y también el frontend Angular (el resto de rutas), más
una base de datos **PostgreSQL**. Como todo vive en un mismo dominio, no hay CORS
ni proxys que configurar.

> **Importante sobre la base de datos.** Django crea y actualiza el esquema con sus migraciones: el contenedor corre
> `python manage.py migrate --noinput` antes de arrancar gunicorn. No hay volcado que restaurar (el de
> `deploy/db_seed.sql` se retiró en E0-10) ni cuentas demo: el primer administrador se crea con el comando
> `create_admin` (sección 4).

---

## 0. Requisitos previos

- Cuenta en https://railway.app (el plan gratuito/Trial sirve).
- El código subido a GitHub, en la rama que Railway despliega.
- Opcional (recomendado): [Railway CLI](https://docs.railway.com/guides/cli)
  `npm i -g @railway/cli` y `railway login`.

Artefactos del repo que usa el despliegue:
- `Dockerfile` (raíz): build de Angular + backend Django con gunicorn; al arrancar corre `migrate`.
- `railway.json`: le dice a Railway que use el Dockerfile.
- `backend_django/psychosim/settings/production.py`: settings de producción. No arranca con una llave de ejemplo, con
  `*` en `DJANGO_ALLOWED_HOSTS` ni con `SIEP_TRUSTED_PROXIES=0` en Railway.

---

## 1. Crear el proyecto y la base de datos

1. Entra a Railway → **New Project**.
2. Elige **Deploy PostgreSQL** (o **+ New → Database → PostgreSQL**).
   Railway crea el servicio Postgres y expone la variable `DATABASE_URL`.

## 2. Añadir el servicio del backend (app)

1. En el mismo proyecto: **+ New → GitHub Repo** y selecciona este repositorio.
2. Railway detecta el `Dockerfile` de la raíz y lo usará para construir.
   - Si te pregunta el *Root Directory*, déjalo en la raíz del repo (`/`).
3. En el servicio de la app, pestaña **Variables**, agrega:

   | Variable | Valor |
   |---|---|
   | `DJANGO_SETTINGS_MODULE` | `psychosim.settings.production` |
   | `DJANGO_SECRET_KEY` | una cadena aleatoria de **≥ 50 caracteres con ≥ 20 distintos** |
   | `REFLECTION_ENCRYPTION_KEY` | otra cadena aleatoria de **≥ 32 caracteres**, distinta de `DJANGO_SECRET_KEY` (cifra las reflexiones) |
   | `DJANGO_ALLOWED_HOSTS` | el dominio que te dé Railway, p. ej. `siep-production.up.railway.app` |
   | `DATABASE_URL` | **referencia** a la del Postgres (ver abajo) |
   | `JWT_SIGNING_KEY` | otra cadena aleatoria de **≥ 50 caracteres con ≥ 20 distintos**, distinta de las demás llaves (firma las sesiones) |
   | `REFLECTION_ACTIVE_KEY` | el id de una llave de `REFLECTION_KEYS` con la que se cifran las reflexiones nuevas (nunca `local-aes-gcm-v1`) |
   | `REFLECTION_KEYS` | pares `id=secreto` separados por comas; cada secreto **≥ 32 caracteres** y distinto de las demás llaves |
   | `SIEP_TRUSTED_PROXIES` | un entero: cuántos proxies hay delante de Django. En Railway, `1` hasta medirlo en el primer despliegue |

   Para `DATABASE_URL`: usa **Add Reference → Postgres → DATABASE_URL** (así queda
   enlazada automáticamente). Alternativamente pega el valor de
   `DATABASE_URL` que aparece en el servicio Postgres.

   > Genera secretos seguros, por ejemplo en tu terminal:
   > `python -c "import secrets; print(secrets.token_urlsafe(48))"`
   > Producción no arranca si una llave es demasiado corta o repetitiva, si es un valor de ejemplo del repositorio
   > (`cambia-esto…`, `dev-only…`, `django-insecure…`) o si las dos llaves son iguales. El error nombra la variable, nunca su valor.
   >
   > **Reflexiones ya cifradas:** hasta S5-1, `REFLECTION_ENCRYPTION_KEY` caía a `JWT_SECRET` si no se definía. Si este
   > despliegue ya guardó reflexiones sin definirla, fija `REFLECTION_ENCRYPTION_KEY` con el valor que tenía `JWT_SECRET`
   > (cumpliendo las reglas de arriba) o consulta antes de cambiarla: con otra llave, esas reflexiones no se descifran.
   >
   > **Variables de seguridad (R1b):** `JWT_SECRET` ya no se pide: está obsoleta y no firma nada.
   > - `JWT_SIGNING_KEY` firma las sesiones. Rotarla cierra todas; el primer despliegue con ella también las cierra una vez. Ver [rotacion-de-secretos.md](rotacion-de-secretos.md).
   > - `REFLECTION_KEYS` y `REFLECTION_ACTIVE_KEY` cifran las reflexiones con llaves versionadas. Rotarlas sin perder las bitácoras está en [rotacion-de-secretos.md](rotacion-de-secretos.md).
   > - `SIEP_TRUSTED_PROXIES` cuenta los proxies delante de Django. En Railway hay uno: `1`, hasta medirlo en el primer despliegue. Con `0` la aplicación no arranca en Railway.

4. (Opcional) Variables extra ya soportadas: `JWT_EXPIRATION_HOURS` (default 8),
   `GOOGLE_OAUTH_CLIENT_ID`, `DEFAULT_FROM_EMAIL`, `CORS_ALLOWED_ORIGINS`
   (solo si algún día sirves el frontend en otro dominio), `DJANGO_SECURE_SSL_REDIRECT`
   (`true` por defecto; solo `false` lo apaga), `SIEP_HSTS_SECONDS` (3600 por defecto; ver
   [HTTPS y HSTS](#https-y-hsts)) y `SIEP_CSP_ENFORCE` (apagada por defecto; ver
   [Política de contenido](#política-de-contenido-csp)).

## 3. Generar el dominio público

1. En el servicio de la app → **Settings → Networking → Generate Domain**.
2. Copia el dominio (p. ej. `siep-production.up.railway.app`) y confirma que está
   en `DJANGO_ALLOWED_HOSTS` (paso 2.3). Si lo cambias, la app se redepliega.

## 4. Crear el primer administrador (una sola vez)

Django crea el esquema solo: el contenedor corre `python manage.py migrate --noinput` antes de arrancar gunicorn (mira el
`CMD` del `Dockerfile`). No hay volcado que restaurar.

El primer ADMIN lo crea el comando `create_admin`. La clave no va en las variables del servicio ni en ningún archivo: se
fija en la terminal de quien despliega y el comando la lee de ahí.

```bash
# En tu terminal (PowerShell: $env:SIEP_ADMIN_PASSWORD = '...'). No la pongas en las variables de Railway.
export SIEP_ADMIN_PASSWORD='...'
railway run python backend_django/manage.py create_admin --email admin@tu-dominio.edu.co --nombre Nombre --apellido Apellido
unset SIEP_ADMIN_PASSWORD
```

- Sin `SIEP_ADMIN_PASSWORD`, el comando pide la clave dos veces en la terminal (solo si es interactiva). Nunca acepta la
  clave como argumento.
- La clave cumple las mismas reglas que cualquier otra: longitud, contraseñas comunes y no parecerse a la cuenta.
- La clave es **temporal**: caduca a los `SIEP_TEMP_PASSWORD_DAYS` días (7 por defecto). Entra antes de que venza y
  cámbiala en el primer acceso.
- Si el correo ya tiene cuenta, el comando falla y no toca la cuenta existente: para reponer su clave, usa `--reset` (abajo).

### Reponer al único administrador (`--reset`)

Si el único ADMIN **pierde su clave**, o su **temporal caducó antes de su primer acceso** (no hay recuperación por correo:
la repone un administrador), repónla con `--reset`:

```bash
export SIEP_ADMIN_PASSWORD='...'
railway run python backend_django/manage.py create_admin --reset --email admin@tu-dominio.edu.co
unset SIEP_ADMIN_PASSWORD
```

- La cuenta queda **activa**, con una clave **temporal nueva** (caduca igual que la de la primera vez) y sus sesiones
  anteriores quedan **cerradas**: un token viejo deja de servir.
- Solo repone cuentas de rol ADMIN. Si el correo no tiene cuenta, o es de un estudiante o de un docente, el comando falla
  y no toca nada: nunca convierte a nadie en administrador. Con `--reset` no hacen falta `--nombre` ni `--apellido`.
- La auditoría guarda solo el id de la cuenta, y el comando imprime solo ese id y que la clave es temporal.

> **A verificar en el primer despliegue.** `railway run` ejecuta el comando en tu máquina, con las variables del servicio.
> Si `DATABASE_URL` apunta a la red interna de Railway (`*.railway.internal`), esa dirección no se resuelve desde fuera y
> el comando no conecta. En ese caso hay dos salidas:
> - Abrir una terminal dentro del contenedor del servicio (el panel de Railway o `railway ssh`, si la versión instalada de
>   la CLI lo trae; consulta la documentación de la CLI) y ejecutar allí `python manage.py create_admin --reset …`, con
>   `SIEP_ADMIN_PASSWORD` fijada solo en esa sesión.
> - O exportar en tu terminal la URL pública de la base (`DATABASE_PUBLIC_URL` del servicio de PostgreSQL) como
>   `DATABASE_URL`, solo para ese comando.
>
> No pegues la clave ni la URL de la base en ningún chat ni en las variables del servicio.

## 5. Verificar

1. Abre `https://TU-DOMINIO/` → debe cargar el simulador (pantalla de login).
2. `https://TU-DOMINIO/api/auth/me` sin token → `401` (la API responde).
3. Entra con la cuenta de ADMIN que creaste en la sección 4. El primer acceso te pedirá cambiar la contraseña: hazlo. La
   temporal deja de servir en cuanto la cambias.

### HTTPS y HSTS

Django redirige a HTTPS por defecto (`DJANGO_SECURE_SSL_REDIRECT`: solo `false` lo apaga). Hay una excepción a propósito: **`/api/health` queda exento**, porque Railway lo sondea por HTTP plano con `Host: healthcheck.railway.app`; un `301` ahí impediría promover el despliegue. Mientras el sondeo sea por HTTP plano, no quites esa exención.

HSTS se controla con `SIEP_HSTS_SECONDS` (3600 por defecto; entero entre 0 y 63072000). Un valor que no sea un entero o que esté fuera de ese rango impide arrancar la aplicación, y el error no muestra el valor leído. `includeSubDomains` y `preload` **no** se activan hasta fijar el dominio definitivo (decisión SD-5).

**Escalera:** 3600 → 86400 → 604800 → 15552000. Sube un escalón solo después de:

1. comprobar la redirección: `curl -I http://TU-DOMINIO` debe responder `301` con `Location: https://…`;
2. comprobar la cabecera: `curl -I https://TU-DOMINIO` debe llevar `Strict-Transport-Security: max-age=<valor del escalón actual>`, sin `includeSubDomains` ni `preload` (con el primer escalón, `max-age=3600`);
3. una semana sin problemas con el escalón anterior.

Un navegador que recibió HSTS obliga a HTTPS en ese dominio hasta que venza su `max-age`, aunque el servidor deje de enviar la cabecera. Por eso la escalera sube despacio: si HTTPS falla con un valor alto, esos navegadores no llegan al sitio hasta que venza.

**Retroceso:** bajar `SIEP_HSTS_SECONDS` no deshace lo que ya guardó un navegador. Con `0` Django deja de enviar la cabecera (no envía `max-age=0`), así que hay que esperar a que venza el `max-age` que el navegador recibió.

### Política de contenido (CSP)

La CSP dice al navegador qué puede cargar y ejecutar la página; es la segunda capa contra un XSS (la primera es que Angular escapa lo que pinta). El diseño y sus motivos están en [`docs/seguridad/adr-s3-csp.md`](../seguridad/adr-s3-csp.md). Dos banderas, ambas opcionales:

| Variable | Por defecto | Qué hace |
|---|---|---|
| `SIEP_CSP_REPORT_ONLY` | `true` | Envía `Content-Security-Policy-Report-Only` con la política inicial: el navegador **informa** de lo que incumple y no bloquea nada. `false` es solo un interruptor de emergencia (no envía ninguna política). |
| `SIEP_CSP_ENFORCE` | `false` | `true` envía `Content-Security-Policy` (la política **en vigor**): el navegador **bloquea** lo que incumple. Los scripts y estilos solo corren con el nonce de la petición; no hay `'unsafe-inline'` en los scripts. Con ella encendida la cabecera de reporte se omite. |

Los incumplimientos llegan en los dos modos a `POST /api/security/csp-report` y dejan UNA línea `csp_violation` en el registro (directiva, esquema y host del recurso bloqueado, ruta de la página y si se bloqueó o solo se informó; nunca la consulta ni el contenido).

**Antes de encenderla** corre la sonda en local: `npm run test:csp` (construye el frontend de producción, lo sirve con Django como en el despliegue y recorre acceso, portal, juego, editor y reporte; falla con la lista de violaciones) y, con internet, `npm run test:csp -- --google` (usa un client id **falso** y comprueba que el script, el botón y la hoja de Google cargan; la política cambia con `GOOGLE_OAUTH_CLIENT_ID`: con él añade `style-src-attr 'unsafe-inline'`, que Google necesita para los atributos `style=` de su botón). Después:

1. Pon `SIEP_CSP_ENFORCE=true` y redespliega.
2. Comprueba la cabecera: `curl -sI https://TU-DOMINIO/login` debe llevar `Content-Security-Policy:` con `'nonce-…'` en `script-src` y `style-src`, y **no** `Content-Security-Policy-Report-Only`. Dos peticiones seguidas deben traer nonces distintos.
3. Entra, juega un caso y abre el editor con una cuenta real; vigila el registro durante unos días: cada línea `csp_violation` con `"disposition": "enforce"` es algo que la política bloqueó a una persona real.
4. **Botón de Google:** con `GOOGLE_OAUTH_CLIENT_ID` real, comprueba que el botón se pinta y que entrar con Google funciona. La sonda no puede hacerlo sin un client id real (ver el ADR); la política deja pasar solo lo que documenta Google (`accounts.google.com/gsi/…`).

**Retroceso:** quita `SIEP_CSP_ENFORCE` (o ponla en `false`) y redespliega: vuelve al modo reporte. No hay nada que esperar en los navegadores (a diferencia de HSTS, la CSP no se guarda).

**Si una imagen de fondo de un caso es de otro host** (lista blanca de S2-6), ese host debe añadirse a `img-src` de `CSP_ENFORCED_POLICY` (`psychosim/settings/base.py`), o el navegador la bloqueará.

---

## Notas y problemas comunes

- **Error 400 / DisallowedHost:** falta el dominio en `DJANGO_ALLOWED_HOSTS`.
- **500 al cargar / no conecta a la BD:** revisa que `DATABASE_URL` esté
  referenciada y mira en los registros del despliegue si el arranque llegó a aplicar las migraciones (`migrate`).
- **La página carga pero las llamadas fallan con 404 en `/api`:** asegúrate de
  que el servicio es el del `Dockerfile` de la raíz (no solo el frontend).
- **Recargar una ruta interna (p. ej. `/portal/...`) da 404:** ya está resuelto
  por el catch-all del SPA en `psychosim/urls.py`; si pasa, es que el build de
  Angular no se copió (revisa el log de build del Dockerfile).
- **Actualizaciones:** cada push a la rama conectada redepliega automáticamente.
  La BD NO se restaura en los redeploys: el arranque solo aplica las migraciones que falten.
- **Cambios de esquema:** no hay scripts SQL que aplicar a mano. Las migraciones de Django las aplica el arranque
  (`migrate --noinput`, antes de gunicorn). Los scripts que había en `deploy/upgrades/` ya no existen en el repositorio.
- **Reflexiones cifradas con otra llave:** si una base llega de otro entorno (por ejemplo, una restauración de respaldo),
  sus reflexiones se descifran solo con la llave con la que se cifraron (hasta S5-1, el `JWT_SECRET` local). Si la
  `REFLECTION_ENCRYPTION_KEY` de Railway es distinta (recomendado), las reflexiones nuevas funcionan con normalidad; las
  viejas podrían no descifrarse. No afecta al resto de la app.

---

## 6. Runbook de la jornada académica (E5-5: RNF-06, RNF-006)

Para sostener ≥ 99,5 % de disponibilidad mensual durante las prácticas supervisadas (40–120 estudiantes concurrentes):

1. **Congelamiento de despliegues (T − 24 h antes de la jornada):**
   - No fusionar cambios a la rama de despliegue durante las 24 horas previas ni durante la franja de clase.
   - Confirmar que el job nocturno `load` (`scripts/load/aula.mjs`) pasó con 40 estudiantes ($p95 \le 2\text{ s}$) y 120 estudiantes ($p95 \le 4\text{ s}$, tasa de error $\le 1\%$).
2. **Migraciones y esquema antes de la clase:**
   - El contenedor ejecuta `python manage.py migrate --noinput` automáticamente antes de arrancar `gunicorn` (`--worker-class gthread --workers 3 --threads 4`).
   - Si una versión nueva incluye migraciones, desplegarla y verificar `GET /api/health` (`200 {"success": true, "data": {"status": "ok", "db": "ok"}}`; con la base caída, `503` y `"degraded"`/`"error"`) **antes** del inicio de la ventana de congelamiento.
3. **Respaldo previo y verificación de restauración:**
   - Ejecutar un respaldo lógico con `pg_dump --no-owner --no-acl` antes de abrir la ventana de la cohorte.
   - Ensayar periódicamente el procedimiento (respaldo, restauración, conteos por tabla y descifrado de `ReflectionJournal`) sobre una base desechable, no sobre producción:
     ```bash
     node scripts/ops/backup-restore.mjs
     ```
4. **Monitoreo durante la jornada:**
   - Vigilar `GET /api/health` y los logs estructurados JSON (`request_id`, `duration_ms`, `status_code`).
   - Revisar la lista de seguridad de PostgreSQL de la sección [§7. Lista de seguridad de PostgreSQL para el despliegue](#7-lista-de-seguridad-de-postgresql-para-el-despliegue-92).

---

## 7. Lista de seguridad de PostgreSQL para el despliegue (§9.2)

Lista de verificación al aprovisionar o auditar la base de datos de producción (anotada por decisión ED-13):

1. **Row-Level Security (LS-4, ED-13):** la autorización vive hoy en la capa de servicio con matriz ejecutable (`shared/policies.py` y `shared/policy-matrix.json`); reabrir RLS si aparece un segundo cliente directo de la base o si la revisión de despliegue lo exige.
2. **Separación de roles:** el rol de ejecución de la aplicación no debe ser superusuario ni tener permisos DDL (únicamente `SELECT`, `INSERT`, `UPDATE`, `DELETE` sobre las tablas del esquema); usar credenciales separadas para el paso `migrate` previo a `gunicorn`.
3. **Red y transporte:** PostgreSQL sin puerto público expuesto a Internet, alcanzable únicamente desde la red interna del servicio; exigir TLS (`sslmode=require` o superior) si la base y la aplicación no comparten red privada aislada.
4. **Autenticación y secretos:** autenticación `scram-sha-256` y contraseñas de alta entropía fuera del repositorio (`DATABASE_URL` / `DB_PASSWORD`, además de `REFLECTION_ENCRYPTION_KEY` independiente de `DJANGO_SECRET_KEY`).
5. **Respaldos restaurables y cifrados en reposo (E5-5):** el volcado de producción debe guardarse cifrado en reposo; eso lo da el almacenamiento donde se guarde y **ningún script de este repositorio lo hace ni lo comprueba**. `node scripts/ops/backup-restore.mjs` solo ensaya el procedimiento sobre una base desechable (siembra, `pg_dump`, restauración, conteos por tabla y descifrado AES-GCM de una reflexión de prueba): no toca volcados de producción, así que cada restauración real se comprueba contando filas y descifrando una reflexión (`reflection_journals` guarda reflexiones clínicas y datos personales bajo Ley 1581).
6. **Versión y parches:** PostgreSQL 18 como línea base (`postgres:18-alpine`, ED-3 / E0-6) con política activa de parches menores.
7. **Registro operativo:** conexiones, desconexiones y fallos de autenticación habilitados en los registros del motor para correlación con `X-Request-Id`.

