# Despliegue de SIEP en Railway

Esta guía despliega **todo en un solo servicio**: el backend Django (gunicorn)
sirve la API en `/api/...` y también el frontend Angular (el resto de rutas), más
una base de datos **PostgreSQL**. Como todo vive en un mismo dominio, no hay CORS
ni proxys que configurar.

> **Importante sobre la base de datos.** El esquema de tablas originalmente lo
> creaba Flyway (el backend Spring antiguo, que ya no se despliega). Por eso el
> repo incluye un volcado completo en [`deploy/db_seed.sql`](../../deploy/db_seed.sql)
> (esquema + datos + usuarios demo + caso `SIM-VBG-001`). En Railway **se restaura
> ese volcado** sobre el Postgres nuevo. No uses `migrate` desde cero: muchas
> tablas son `managed=False` y Django no las crea.

---

## 0. Requisitos previos

- Cuenta en https://railway.app (el plan gratuito/Trial sirve).
- El código subido a GitHub (rama actual: `codex/actualizacion-completa-simulador`).
- Opcional (recomendado): [Railway CLI](https://docs.railway.com/guides/cli)
  `npm i -g @railway/cli` y `railway login`.

Artefactos que ya dejé listos en el repo:
- `Dockerfile` (raíz): build de Angular + backend Django con gunicorn.
- `railway.json`: le dice a Railway que use el Dockerfile.
- `backend_django/psychosim/settings/production.py`: settings de producción.
- `deploy/db_seed.sql`: volcado de la BD para restaurar.

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

4. (Opcional) Variables extra ya soportadas: `JWT_EXPIRATION_HOURS` (default 8),
   `GOOGLE_OAUTH_CLIENT_ID`, `DEFAULT_FROM_EMAIL`, `CORS_ALLOWED_ORIGINS`
   (solo si algún día sirves el frontend en otro dominio), `DJANGO_SECURE_SSL_REDIRECT`
   (`true` por defecto; solo `false` lo apaga) y `SIEP_HSTS_SECONDS` (3600 por defecto; ver
   [HTTPS y HSTS](#https-y-hsts)).

## 3. Generar el dominio público

1. En el servicio de la app → **Settings → Networking → Generate Domain**.
2. Copia el dominio (p. ej. `siep-production.up.railway.app`) y confirma que está
   en `DJANGO_ALLOWED_HOSTS` (paso 2.3). Si lo cambias, la app se redepliega.

## 4. Restaurar la base de datos (una sola vez)

Con el Postgres ya creado, carga el esquema + datos del volcado.

**Opción A — Railway CLI (recomendada):**
```bash
railway login
railway link            # elige el proyecto
# Conéctate a la BD y restaura el volcado:
railway connect Postgres   # abre psql contra el Postgres del proyecto
# (dentro de psql)  \i deploy/db_seed.sql       ← si corres desde la raíz del repo
```
o, sin entrar a psql interactivo:
```bash
railway run -s Postgres bash -c 'psql "$DATABASE_URL" -f deploy/db_seed.sql'
```

**Opción B — psql local apuntando a Railway:**
1. En el servicio Postgres → **Variables**, copia `DATABASE_PUBLIC_URL`
   (la URL pública, no la interna).
2. En tu PC (con `psql` instalado):
   ```bash
   psql "PEGA_AQUI_DATABASE_PUBLIC_URL" -f deploy/db_seed.sql
   ```

El volcado usa `DROP ... IF EXISTS` antes de crear, así que es seguro re-ejecutarlo.

## 5. Verificar

1. Abre `https://TU-DOMINIO/` → debe cargar el simulador (pantalla de login).
2. `https://TU-DOMINIO/api/auth/me` sin token → `401` (la API responde).
3. Inicia sesión con un usuario demo del volcado:
   - Admin: `admin@psychosim.edu.co` / `Admin123!`
   - Docente: `profesora@psychosim.edu.co` / `Profesor123!`
   - Estudiante: `estudiante@psychosim.edu.co` / `Estudiante123!`

   > Cámbialas cuanto antes (o crea usuarios nuevos) si el despliegue es público.

### HTTPS y HSTS

Django redirige a HTTPS por defecto (`DJANGO_SECURE_SSL_REDIRECT`: solo `false` lo apaga). Hay una excepción a propósito: **`/api/health` queda exento**, porque Railway lo sondea por HTTP plano con `Host: healthcheck.railway.app`; un `301` ahí impediría promover el despliegue. Mientras el sondeo sea por HTTP plano, no quites esa exención.

HSTS se controla con `SIEP_HSTS_SECONDS` (3600 por defecto; entero entre 0 y 63072000). Un valor que no sea un entero o que esté fuera de ese rango impide arrancar la aplicación, y el error no muestra el valor leído. `includeSubDomains` y `preload` **no** se activan hasta fijar el dominio definitivo (decisión SD-5).

**Escalera:** 3600 → 86400 → 604800 → 15552000. Sube un escalón solo después de:

1. comprobar la redirección: `curl -I http://TU-DOMINIO` debe responder `301` con `Location: https://…`;
2. comprobar la cabecera: `curl -I https://TU-DOMINIO` debe llevar `Strict-Transport-Security: max-age=<valor del escalón actual>`, sin `includeSubDomains` ni `preload` (con el primer escalón, `max-age=3600`);
3. una semana sin problemas con el escalón anterior.

Un navegador que recibió HSTS obliga a HTTPS en ese dominio hasta que venza su `max-age`, aunque el servidor deje de enviar la cabecera. Por eso la escalera sube despacio: si HTTPS falla con un valor alto, esos navegadores no llegan al sitio hasta que venza.

**Retroceso:** bajar `SIEP_HSTS_SECONDS` no deshace lo que ya guardó un navegador. Con `0` Django deja de enviar la cabecera (no envía `max-age=0`), así que hay que esperar a que venza el `max-age` que el navegador recibió.

---

## Notas y problemas comunes

- **Error 400 / DisallowedHost:** falta el dominio en `DJANGO_ALLOWED_HOSTS`.
- **500 al cargar / no conecta a la BD:** revisa que `DATABASE_URL` esté
  referenciada y que restauraste `deploy/db_seed.sql`.
- **La página carga pero las llamadas fallan con 404 en `/api`:** asegúrate de
  que el servicio es el del `Dockerfile` de la raíz (no solo el frontend).
- **Recargar una ruta interna (p. ej. `/portal/...`) da 404:** ya está resuelto
  por el catch-all del SPA en `psychosim/urls.py`; si pasa, es que el build de
  Angular no se copió (revisa el log de build del Dockerfile).
- **Actualizaciones:** cada push a la rama conectada redepliega automáticamente.
  La BD NO se toca en redeploys; solo restauras el volcado la primera vez.
- **Cambios de esquema sobre una BD ya restaurada:** aplica, en orden, los
  scripts de [`deploy/upgrades/`](../../deploy/upgrades) posteriores a tu restauración
  (todos son idempotentes):
  ```bash
  psql "$DATABASE_URL" -f deploy/upgrades/2026-09-29-attempt-status-paused.sql
  psql "$DATABASE_URL" -f deploy/upgrades/2026-10-01-ambient-npcs-caso-pdf.sql
  psql "$DATABASE_URL" -f deploy/upgrades/2026-10-01-attempt-status-replaced.sql
  ```
  Sin el de 2026-09-29, la "pausa segura" falla con 500 porque el CHECK viejo
  de `simulation_attempts_v2.status` no admite `PAUSED`. Sin
  `2026-10-01-ambient-npcs-caso-pdf.sql`, hablar con los NPC ambientales del
  caso (enfermera, médico, trabajadora social…) responde 400 y el diálogo no se
  abre: el backend exige su posición en `scene_maps.ambient_json.ambientNpcs`.
  Sin `2026-10-01-attempt-status-replaced.sql`, empezar un intento nuevo sobre
  uno activo ("forceNew") falla con 500 porque el CHECK no admite `REPLACED`;
  ese script además reclasifica como `REPLACED` los intentos reemplazados que se
  guardaron como salida segura. Como cada push redepliega, aplica los scripts
  **antes** de hacer push del código que los necesita.
- **Reflexiones cifradas:** los datos de reflexión del volcado se cifraron con la
  llave de reflexiones local (hasta S5-1, el `JWT_SECRET` local). Si la
  `REFLECTION_ENCRYPTION_KEY` de Railway es distinta (recomendado), las reflexiones
  nuevas funcionan con normalidad; las viejas del volcado podrían no descifrarse.
  No afecta al resto de la app.

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

