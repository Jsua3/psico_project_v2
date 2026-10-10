## Stack, versiones, comandos y entorno de desarrollo

> Fuente: código del worktree `limpieza-repositorio` (master 9931599 + limpieza de docs). Manda el código; donde README o docs discrepan se marca «README dice / código hace». Nada se ejecutó: los recuentos son estáticos.

### Qué hace hoy
- Monorepo con API Django 6.1 + DRF (`backend_django/`), SPA Angular 22 con Phaser 4 (`frontend/`) y PostgreSQL. No corre Spring ni Flyway: el esquema lo crean comandos de Django con SQL a mano más `migrate` (`backend_django/apps/simulation/management/commands/bootstrap_dev_db.py:427-436`, `apps/users/management/commands/seed_demo_users.py:7-18`).
- Desarrollo: `npm run up` levanta PostgreSQL en Docker, Django (:8091) y Angular (:4200) con proxy de `/api` (`scripts/dev-up.mjs:285-299`, `frontend/proxy.conf.json:2-7`).
- Pruebas: cada runner crea su BD desechable (Compose + tmpfs) y la destruye al terminar; nunca usa la BD de desarrollo (`scripts/test-runner-support.mjs:565-617`).
- Producción: una sola imagen (Angular compilado + gunicorn) en Railway; Django sirve `/api/`, `/schema/`, `/swagger-ui.html` y el SPA en el mismo dominio (`Dockerfile:5-29`, `backend_django/psychosim/urls.py:64-68`).

### Cómo está construido
**Versiones exactas** (pines de `requirements.txt` y resolución de `frontend/package-lock.json`)

| Pieza | Versión | Evidencia |
|---|---|---|
| Python | 3.14 en CI e imagen; `npm run up` acepta 3.12-3.14 y prueba 3.14, 3.13, 3.12 | `.github/workflows/ci.yml:21`, `Dockerfile:14`, `scripts/dev-up.mjs:63-66,92-99` |
| Node | 24 (Angular 22.2.1 pide 22.22.3+, 24.15+ o 26+); sin `engines` ni `.nvmrc` | `ci.yml:20`, `Dockerfile:6`, `frontend/package-lock.json:1147` |
| Django, DRF, simplejwt | 6.1.1, 3.18.1, 5.5.1 | `backend_django/requirements.txt:3-5` |
| psycopg | 3.3.6 (`[binary]`) | `requirements.txt:7` |
| Resto backend | cors-headers 4.9.0, cryptography 50.0.2, drf-spectacular 0.30.0, bcrypt 5.0.0, google-auth 2.59.1, requests 2.34.2, gunicorn 26.2.0, whitenoise 6.12.0, dj-database-url 3.1.2 | `requirements.txt:6-17` |
| Pruebas backend | pytest 9.1.1, pytest-django 4.14.0, factory-boy 3.3.3 (`--reuse-db --nomigrations`) | `requirements.txt:19-21`, `backend_django/pytest.ini:6` |
| Angular (core, cdk, material, cli, build) | 22.2.1 | `frontend/package-lock.json:1139,506,1184,535,139` |
| Phaser, Konva, Howler | 4.2.1, 10.7.0, 2.2.4 (Konva solo en `world-editor.component.ts:34`) | `package-lock.json:5739,4974,4722` |
| RxJS, zone.js, TypeScript | 7.8.2, 0.16.3, 6.0.3 | `package-lock.json:6035,7140,6732` |
| Unitarias frontend | Vitest 5.0.3 + jsdom 30.1.2 vía `@angular/build:unit-test`; no hay Jest | `frontend/angular.json:50-56`, `package-lock.json:6902,4871` |
| E2E | Playwright 1.63.0, Chromium, `workers: 1` | `package-lock.json:3556`, `frontend/playwright.config.ts:23` |
| PostgreSQL | dev 16-alpine; pruebas 18-alpine; prod lo gestiona Railway, sin versión fijada (el volcado viene de 16.13) | `docker-compose.yml:11`, `docker-compose.test.yml:13`, `deploy/db_seed.sql:7` |

**Comandos raíz** (`package.json:7-18`)

| `npm run` | Qué hace |
|---|---|
| `up` | `dev-up.mjs`: BD + venv + guarda de esquema + Django :8091 + Angular :4200 |
| `down` | `docker compose -p psico-project-v3 stop db`: para la BD, no borra el volumen |
| `db:bootstrap -- --yes` | siembra la BD de desarrollo (esquema, caso `SIM-VBG-001`, grupo `DEMO1`) tras las guardas |
| `install:all` | solo `npm install --prefix frontend`; no crea el venv |
| `check:backend` | `manage.py check` con `psychosim.settings.base` (`run-backend-support.mjs:3-5`) |
| `test:scripts` | `node --test "scripts/*.test.mjs"` (82 declaraciones `test(`) |
| `test:backend` / `:down` | BD desechable + `bootstrap_dev_db` + `pytest -q` / borra solo recursos del proyecto de test |
| `test:api:e2e` | `test-e2e.mjs --api-only`: BD y Django aislados + matriz de 16 comprobaciones (`api-e2e.mjs:195`) |
| `test:e2e` | matriz API + Angular propio + Playwright (`test-e2e.mjs`) |
| `test:frontend`, `build:frontend` | `ng test` (Vitest), `ng build` (producción por defecto) |

**Comandos `frontend/`** (`frontend/package.json:5-20`): `start` (`ng serve` 127.0.0.1:4200 + proxy), `build`, `watch`, `test`, `test:watch`, `test:visual-assets`, `test:kit`, `test:world-art`, `world-art:build|laminas`, `kit:types|build|check|laminas|retoque` (scripts `.mjs` del kit de personajes y del arte del mundo; no entran al runtime).

**Puertos**: BD dev 5433 (`SIEP_DB_PORT`, `docker-compose.yml:17`); BD test 5544 en 127.0.0.1 (`SIEP_TEST_DB_PORT`, `test-runner-support.mjs:380`); Django dev 8091; Angular dev 4200 (4300 en `.claude/launch.json:7-8`, vista previa); e2e: API 8093 y Angular 4315 (`scripts/test-e2e.mjs:295,300`); contenedor 8000 o `$PORT` (`Dockerfile:27-29`). CORS local: 4200 y 4201 (`settings/local.example.py:8-13`).

**Flujo de arranque** (`scripts/dev-up.mjs:285-299`)
1. Copia `settings/local.py` desde `local.example.py` si falta (`manage.py:8` y `wsgi.py:5` lo usan por defecto).
2. `docker compose -p psico-project-v3 up -d db`; verifica labels, `working_dir` y volumen propios y espera `pg_isready` hasta 30 s.
3. Crea `.venv` si falta y corre `pip install -r requirements.txt` en cada arranque.
4. Comprueba las tablas centinela `simulation_cases`, `grupo_case_version`, `simulation_rubric_assignments` y **se detiene** si falta alguna (`dev-up.mjs:140-182`).
5. `npm install` del frontend si no hay `node_modules`; lanza `manage.py runserver 8091` y `npm start`.

**Flujo de prueba**
- Backend y e2e (`test-backend.mjs:96-126`, `test-e2e.mjs:172-290`): derivan el proyecto `psico-project-v3-test-<sha256(ruta)[:10]>`, levantan `postgres:18-alpine`, siembran con `bootstrap_dev_db`, ejecutan y hacen `down --volumes` solo si los recursos son propios.
- CI (`ci.yml`): `secrets` (gitleaks 8.24.2, historial completo), `scripts`, `audit` (pip-audit y `npm audit --audit-level=high`), `backend`, `frontend` (vitest, assets, kit, world-art, build) y `e2e` (`needs: scripts, backend, frontend`; excluye `@full-case|@orientation`, `ci.yml:126,149`).
- `e2e-full-case.yml`: `@full-case` y `@orientation` en dos jobs paralelos, cron 07:00 UTC y manual, `E2E_TIME_SCALE=4`, 90 min (`e2e-full-case.yml:14,34,60,74,98`).

**Flujo de despliegue**: Railway construye el `Dockerfile` (`railway.json:3-6`): Node 24 `npm ci` + `ng build` copiado a `frontend_dist`; Python 3.14, gunicorn 3 workers, timeout 120, `DJANGO_SETTINGS_MODULE=psychosim.settings.production` (`Dockerfile:6-29`). El CI no despliega: cada push a la rama conectada redepliega (`docs/operacion/despliegue-railway.md:120-121`); la BD se restaura a mano con `deploy/db_seed.sql` y los cambios de esquema con `deploy/upgrades/*.sql` (3 scripts).

### Reglas que aplica
- **BD de desarrollo propia por checkout**: el contenedor debe tener `com.docker.compose.project=psico-project-v3` y `working_dir` igual al checkout; los volúmenes llevan el prefijo del proyecto o son tmpfs; ante duda falla sin tocar nada (`scripts/dev-environment-guard.mjs:38-80`). La guarda rechaza un contenedor creado desde otro directorio (p. ej. otro worktree).
- **Sin bootstrap automático**: `npm run up` solo arranca o se detiene (`dev-environment-guard.mjs:196-198`, `dev-up.mjs:169-182`). `db:bootstrap` exige `--yes`, contenedor propio, puerto publicado igual a `DB_PORT` y sin `DATABASE_URL`; limpia `DATABASE_URL` y `PG*` del entorno hijo (`scripts/db-bootstrap.mjs:56-61,90-112`, `dev-environment-guard.mjs:87-142`).
- **BD de prueba**: nombre distinto de `psychosim`, host loopback, DSN distinto del de desarrollo y sin `DATABASE_URL`, validado en Node (`dev-environment-guard.mjs:164-189`) y de nuevo en `settings/test.py:55-74`; usuario `psychosim_test`, contraseña y nonce aleatorios por ejecución (`test-runner-support.mjs:375-394`); `settings.test` falla sin las 6 variables `SIEP_TEST_*` (`settings/test.py:33-47`).
- **Atestación e2e**: el Django de test añade `X-SIEP-Test-Environment: isolated`, `X-SIEP-Test-Run` (nonce) y `Cache-Control: no-store` (`backend_django/shared/test_attestation.py:16-18`); el runner y la matriz lo verifican, y la matriz rechaza https, credenciales en la URL, hosts no loopback y el target 8091 (`test-runner-support.mjs:124-174`, `test-e2e.mjs:123-148`).
- **Producción**: `DEBUG=False`; exige `DJANGO_SECRET_KEY` (rechaza el valor por defecto), `JWT_SECRET`, `DJANGO_ALLOWED_HOSTS` o `RAILWAY_PUBLIC_DOMAIN`, y `DB_PASSWORD` solo sin `DATABASE_URL`; cookies `Secure`; `SECURE_SSL_REDIRECT` apagado por defecto (`settings/production.py:21-78`).
- **Defaults de `base.py`**: `DB_*` apuntan a `localhost:5433/psychosim`; zona `America/Bogota`, `USE_TZ=False`; JWT de 8 h (`JWT_EXPIRATION_HOURS`); BCrypt primero (`base.py:62-88,101-108,163-168`). El JWT se firma HS256 con el `SECRET_KEY` de Django: `SIMPLE_JWT` no fija `SIGNING_KEY`; `JWT_SECRET` solo alimenta `REFLECTION_ENCRYPTION_KEY` (AES-GCM, clave SHA-256) (`base.py:112-116`, `crypto_service.py:15-17`).
- **Asistente de IA apagado**: sin `AI_ASSISTANT_ENABLED` explícito la vista responde 404 (`base.py:128-130`, `apps/simulation/views/ai_assistant.py:33`).
- **Presupuestos de build**: `ng build` falla con más de 1,4 MB iniciales o estilos de componente de más de 22 kB (`frontend/angular.json:31-32`). Sin `provideZoneChangeDetection` la app es zoneless por defecto en Angular 22.2.1 (`app.config.ts:28-38`; `node_modules/@angular/core/fesm2022/core.mjs:1585-1645`), aunque `zone.js` sigue como polyfill (`angular.json:21`).
- **Higiene de dependencias**: Dependabot semanal (pip, npm, docker, compose, actions) y gitleaks con `.github/gitleaks.toml`; secretos y avisos altos/críticos hacen fallar el CI (`.github/dependabot.yml`, `ci.yml:24-78`).

### Límites y deuda conocida
- README dice / código hace, `README.md:135-136,155-163`: `test:api:e2e` «contra localhost:8091 (requiere npm run up)»; el código levanta un stack aislado en :8093 y rechaza 8091 (`package.json:15`, `test-runner-support.mjs:162-164`). `test:backend # pytest -q` además levanta, siembra y destruye la BD (`test-backend.mjs:101-126`).
- `README.md:218-223` afirma que `npm run up` «corre el bootstrap solo»; el código se detiene (`dev-up.mjs:170-181`) y el propio `README.md:76-77` lo dice.
- `README.md:89` nombra el proyecto `psico-project-v3-test`; el real es `psico-project-v3-test-<hash>`; `SIEP_TEST_DB_PASSWORD` de `.env.example:20` se ignora (`test-runner-support.mjs:23-27,375-390`).
- `README.md:237-253` y `.gitattributes:19-21` hablan de 4 scripts `.cmd/.ps1` en CRLF; ya no existe ninguno (commit 8370163; glob `**/*.{ps1,cmd,bat,sh}` vacío).
- `README.md:101-107` omite los jobs `secrets` y `audit`, el grupo `@orientation` y los pasos kit/world-art (`ci.yml:24,60,115-117,149`); su arranque manual (`README.md:54-60`) omite `local.py` (`manage.py:8`) y que Django lee `DB_PORT`, no `SIEP_DB_PORT` (`base.py:77`).
- `docs/PROMPT_MAESTRO.md:71,93,97,107` sigue en Django 5.1/DRF 3.15, Angular 21, Phaser 3 y Flyway dueño del esquema. Comentarios viejos: `requirements.txt:2` (Python 3.13), `playwright.config.ts:9` y `dependabot.yml:3` (Jest), `base.py:3-4,158` (Spring/Flyway), `despliegue-railway.md:20` (rama `codex/...`).
- `.env`: nada lo carga salvo Compose (sin dotenv). Copiar `POSTGRES_PASSWORD` crea la BD con una clave que Django no recibe (`docker-compose.yml:15`, `base.py:75`); si se exportan `DATABASE_URL` o `DJANGO_SETTINGS_MODULE=...production` del ejemplo, las guardas rechazan bootstrap y pruebas.
- La BD de dev se publica en todas las interfaces con clave por defecto del repo (`docker-compose.yml:15-17`), a diferencia de la de test (`docker-compose.test.yml:21`).
- Producción sin paso de migraciones ni healthcheck (`Dockerfile:29`, `railway.json:7-10`); el esquema vive en SQL de comandos y la migración inicial de `users` es no-op (`apps/users/migrations/0001_initial.py:8`).
- `/schema/` y Swagger son públicos (AllowAny) también en producción y cargan Swagger UI de un CDN `@latest` (`urls.py:64-65`; `drf_spectacular/settings.py:59,83`).
- Paridad dispar: PG 16 en dev, 18 en pruebas, desconocido en prod. Restos: `@angular/platform-browser-dynamic` declarado y deprecado sin uso (`package-lock.json:1226`); `/media` proxeado sin ruta (`proxy.conf.json:8`); `validate-premium-visual-assets.mjs` sin script npm; full-case en PR sigue en borrador (`docs/pendientes/deudas/e2e-full-case-pr.yml.draft`).
