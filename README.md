# SIEP — Sistema de Entrenamiento Psicosocial

Plataforma web académica de la **Corporación Universitaria Empresarial Alexander Von Humboldt** (Programa de Psicología, Armenia, SNIES 101645).

Simulación formativa tipo **RPG clínico top-down**: el estudiante explora mapas de casos psicosociales (VBG, feminicidio, NNA, crisis, rutas de protección), dialoga con NPCs, toma decisiones clínicas y es evaluado por competencias.

## Estructura del monorepo

```
psico_project_v3/
  backend_django/    ← API Django 6.1 + DRF (Python 3.12-3.14)
  frontend/          ← App Angular 22 (Signals + Phaser 4 + Konva.js)
  docs/              ← Documentación del proyecto (índice en docs/README.md)
  deploy/            ← Volcado de la BD y scripts de actualización (Railway)
  scripts/           ← Scripts de entorno y de pruebas (npm run up, npm run test:*)
  tools/             ← Herramientas de arte (puertas y mobiliario)
  docker-compose.yml ← Servicio PostgreSQL 16 para desarrollo local
```

## Requisitos previos

- **Docker Desktop** (para la base de datos)
- **Python 3.12, 3.13 o 3.14** (en Windows: `py install 3.14`)
- **Node 24 LTS** (Angular 22 exige 22.22.3+, 24.15+ o 26+) / npm

## Arranque rápido

Desde la raíz del monorepo, un solo comando levanta **PostgreSQL + Django + Angular**:

```powershell
npm run up
```

El script:
1. Inicia PostgreSQL en Docker (`localhost:5433`, configurable con `SIEP_DB_PORT`) dentro del
   proyecto Compose `psico-project-v3`, verificando por labels que el contenedor y el volumen
   pertenecen a **este** checkout (nunca reutiliza ni toca bases de otros proyectos)
2. Crea `.venv` e instala dependencias Python si hace falta
3. Genera `local.py` de desarrollo si no existe
4. Verifica el esquema del simulador; si falta, **se detiene** (ver «Bootstrap explícito»)
5. Arranca el backend en `http://localhost:8091` (Swagger: `/swagger-ui.html`)
6. Arranca el frontend en `http://localhost:4200` (proxy automático a la API)

> Si el puerto 5433 está ocupado por la BD de otro checkout (p. ej. el contenedor
> `psychosim-db` del proyecto `psicologia_proyecto`), `npm run up` fallará con instrucciones:
> exporta `SIEP_DB_PORT` con un puerto libre o detén tú mismo el otro stack.

Para detener backend y frontend: `Ctrl+C`. La base de datos sigue en Docker; para pararla:

```powershell
npm run down
```

### Arranque manual (opcional)

```powershell
docker compose up -d db
cd backend_django && ./.venv/Scripts/python.exe manage.py runserver 8091
cd frontend && npm install && npm start
```

## Credenciales demo

| Rol | Email | Contraseña |
|---|---|---|
| ADMIN | `admin@psychosim.edu.co` | `Admin123!` |
| PROFESOR | `profesora@psychosim.edu.co` | `Profesor123!` |
| ESTUDIANTE | `estudiante@psychosim.edu.co` | `Estudiante123!` |

## Simulador (estudiante)

El estudiante **solo ve casos asignados a su grupo** por un docente. En una BD local vacía también faltan las tablas del simulador (el esquema original venía de Flyway/Spring).

### Bootstrap explícito (nunca automático)

`npm run up` **no** siembra bases de datos: si detecta que faltan tablas del simulador se
detiene e indica el comando protegido. El bootstrap solo procede tras verificar que el
contenedor y el volumen pertenecen a este checkout y que el DSN apunta a él:

```powershell
npm run db:bootstrap -- --yes
```

Eso crea el esquema, el caso `SIM-VBG-001`, el grupo demo `DEMO1` y asigna el caso al estudiante demo.

## Tests backend (BD desechable aislada)

La suite backend corre contra una base **desechable** (`psychosim_test`, proyecto Compose
`psico-project-v3-test`, datos en `tmpfs`, puerto `SIEP_TEST_DB_PORT` — 5544 por defecto),
nunca contra la BD de desarrollo. `psychosim.settings.test` falla en el arranque si el DSN
coincide con desarrollo/producción o si el nombre es `psychosim`:

```powershell
npm run test:backend          # levanta la BD de test, siembra y ejecuta pytest
npm run test:backend:down     # elimina SOLO los recursos del proyecto de test
npm run test:scripts          # tests de las guardas de entorno (node --test)
npm run test:e2e              # Playwright contra un stack aislado completo
                              # (BD desechable + Django :8093 + Angular :4315)
```

**CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) ejecuta estos mismos comandos
en cada PR y en cada push a `master` (scripts, `check:backend` + pytest, vitest + assets +
`ng build`; y, si todo eso pasa, la matriz API + Playwright sin `@full-case`). Los recorridos
completos del caso (`@full-case`, 4 viewports) van en
[`.github/workflows/e2e-full-case.yml`](.github/workflows/e2e-full-case.yml): cada noche sobre
`master` y a mano desde Actions, porque en el runner sin GPU tardan ~3-4x más que en local.
Localmente, `npm run test:e2e` sigue corriendo todo.

## Grupos — importar estudiantes por Excel

En **Portal → Grupos → Gestionar**, puedes cargar un archivo `.xlsx` con todos los estudiantes del grupo.

**Formato recomendado (plantilla institucional):**

| N° | Nombres | Apellidos | Correo institucional | Contraseña temporal |
|---|---|---|---|---|
| 1 | Sofía | García Pérez | sofia.garcia01@institucion.edu.co | DaTe9590! |

También acepta columnas en minúsculas (`nombre`, `apellido`, `email`, `password`). La columna **N°** es opcional y se ignora.

El sistema:
- crea cuentas `ESTUDIANTE` que no existan
- asigna al grupo los correos válidos
- reutiliza usuarios existentes con el mismo email
- reporta filas con error sin detener el resto

Usa **Descargar plantilla Excel** en la pantalla para obtener la plantilla en formato `.xlsx`. Solo se acepta `.xlsx`.

## Comandos útiles

Desde la raíz del monorepo (entrada única para CI local):

```powershell
npm run check:backend      # manage.py check
npm run test:backend       # pytest -q
npm run test:api:e2e       # matriz HTTP contra localhost:8091 (requiere npm run up)
npm run test:frontend      # Vitest Angular
npm run build:frontend     # build de producción
```

```powershell
# Tests backend (manual)
cd backend_django
./.venv/Scripts/python.exe -m pytest -q

# Tests frontend (manual)
cd frontend
npm test -- --watch=false

# Build de producción
cd frontend
npm run build
```

### Prueba e2e HTTP de la API

Con el stack levantado (`npm run up`) y usuarios demo en la BD:

```powershell
npm run test:api:e2e
```

Valida login real (ADMIN / PROFESOR / ESTUDIANTE), acceso sin token, token inválido y permisos por rol en endpoints críticos.

## API REST — rutas reales

Base URL: `http://localhost:8091/api` (Swagger: `http://localhost:8091/swagger-ui.html`).

El enunciado histórico del proyecto usaba prefijos en español (`/api/simulacion`, `/api/usuarios`, `/api/casos`). **El backend Django actual usa rutas en inglés**, alineadas con el frontend:

| Módulo (enunciado histórico) | Ruta real Django | Notas |
|---|---|---|
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/access-request` | JWT con claims `userId` + `role` |
| Usuarios (admin) | `GET/POST /api/admin/users`, `PUT /api/admin/users/:id` | No existe `/api/usuarios` |
| Solicitudes de acceso | `GET /api/admin/access-requests`, `PATCH /api/admin/access-requests/:id/status` | Público: `POST /api/auth/access-request` |
| Grupos | `GET/POST /api/grupos`, `POST /api/grupos/:id/estudiantes` | |
| Importar estudiantes | `POST /api/grupos/:id/estudiantes/import` | No `/api/grupos/:id/importar-estudiantes` |
| Asignar casos a grupo | `GET/POST/DELETE /api/grupos/:id/casos` | Requiere `grupo_case_version` |
| Casos (authoring) | `GET/POST /api/admin/cases` (sin slash final), `.../api/admin/cases/:id/...` | No existe `/api/casos` público |
| Simulación estudiante | `GET /api/simulation/cases`, `POST /api/simulation/attempts`, `.../decisions`, `.../reflections` | No `/api/simulacion/...` |
| Instructor / trazabilidad | `GET /api/instructor/attempts/recent`, `GET /api/instructor/attempts/:id/trace`, `.../rubric-evaluation` | Solo PROFESOR/ADMIN |
| Reportes | `GET /api/reportes/dashboard`, `GET /api/reportes/grupo/:id`, `.../export` | Estudiante → 403 |

## Documentación

El índice completo está en [`docs/README.md`](docs/README.md). Lo más consultado:

- [`docs/PROMPT_MAESTRO.md`](docs/PROMPT_MAESTRO.md): el documento maestro único y vigente (producto, stack, arquitectura, funcionamiento, reglas, seguridad, calidad y estado).
- [`docs/arquitectura/estrategia-stack-esquema-y-despliegue.md`](docs/arquitectura/estrategia-stack-esquema-y-despliegue.md): actualización del stack, dueño del esquema de la BD y despliegue.
- [`docs/operacion/despliegue-railway.md`](docs/operacion/despliegue-railway.md): despliegue en Railway.
- [`docs/requisitos/`](docs/requisitos): requisitos de negocio, funcionales y no funcionales, y técnicas de elicitación.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Backend | Python 3.14 (3.12+), Django 6.1, DRF 3.18, JWT, psycopg 3 |
| Frontend | Angular 22 (Signals), Phaser 4, Konva.js, Angular Material, Vitest |
| Base de datos | PostgreSQL 16 en desarrollo, 18 en pruebas (esquema heredado de Flyway; ver `docs/arquitectura/estrategia-stack-esquema-y-despliegue.md`) |
| Auth | JWT (simplejwt) — claims `userId` + `role` |
| Cifrado | AES-GCM para bitácoras de reflexión |

## Solución de problemas (Windows)

### El venv del backend no arranca / `npm run up` falla en `ensureVenv()`

Si `backend_django\.venv\Scripts\python.exe` da "El sistema no puede
encontrar la ruta especificada", el venv fue creado con el **Python de la
Microsoft Store** (alias `WindowsApps`), que genera venvs rotos. Recrear con
la instalación real:

```powershell
Remove-Item backend_django\.venv -Recurse -Force
& C:\Python313\python.exe -m venv backend_django\.venv
backend_django\.venv\Scripts\python.exe -m pip install -r backend_django\requirements.txt
```

### Errores `relation "..." does not exist` con una BD existente

El contenedor `psychosim-db` puede venir con un volumen de una versión
anterior del proyecto. `npm run up` detecta el esquema incompleto y corre el
bootstrap solo; si necesitas forzarlo a mano (es idempotente, pero re-siembra
el caso demo y elimina sus intentos):

```powershell
cd backend_django
.\.venv\Scripts\python.exe manage.py bootstrap_dev_db
```

<!-- BORRADOR: advertencia para desarrolladores, pendiente de revisión. -->
> **Solo desarrollo.** `bootstrap_dev_db`, `seed_demo_users` y `seed_demo_access` se niegan a correr con los ajustes de producción o con `DATABASE_URL` definido. Las cuentas que ya existen no se modifican: `seed_caso_pdf` ya no restablece la clave, el rol ni el estado del admin demo, y fuera de desarrollo no crea la cuenta demo (lo mismo `seed_default_rubric`). Solo `seed_demo_access --reset` repone cuentas, a propósito. La excepción `SIEP_ALLOW_DEMO_SEED=true` es solo para una base de pruebas desechable.

### Pruebas del frontend que fallan solo en tu máquina (fin de línea CRLF)

`.gitattributes` fija el fin de línea del repositorio: todo el texto va en LF,
salvo los scripts de Windows (`*.cmd`, `*.ps1`), que van en CRLF. No hace falta
tocar `core.autocrlf`: el `eol` del archivo prevalece. Los clones y worktrees
nuevos ya salen bien.

Si tu checkout es **anterior** a ese archivo, el árbol de trabajo sigue en CRLF
aunque `git status` salga limpio, y unas 12 pruebas de contrato (las que leen
fuentes `.ts`/`.scss` con `readFileSync` y buscan `\n`) fallan solo en local.
Para reescribirlo en LF:

> **Guarda tu trabajo antes.** `git reset --hard` descarta todo lo que no esté
> en un commit. Haz commit (puede ser uno WIP) y confirma que `git status`
> sale limpio.

```bash
git pull   # o fusiona/rebasa master: tu rama necesita el .gitattributes
git rm -r -q --cached .
git reset --hard
```

Comprueba el resultado con `git ls-files --eol`: todo el texto debe mostrar
`i/lf w/lf`, salvo los 4 scripts `.cmd`/`.ps1` (`i/lf w/crlf`). La alternativa
sin riesgo es un worktree nuevo (`git worktree add`) en lugar de reescribir el
actual.
