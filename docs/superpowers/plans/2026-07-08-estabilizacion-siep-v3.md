# Estabilización SIEP v3 — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar `psico_project_v3` en estado impecable: con historial git reconectado al repo v2, sin restos rotos de la era Spring, con arranque local a prueba de bases de datos viejas, documentación fiel al estado real y cero warnings de build.

**Architecture:** Seis tareas incrementales sobre el monorepo existente (Django 5.1 + Angular 21). La primera tarea recupera git (todo lo demás queda versionado como commits atómicos). Ninguna tarea toca el esquema de BD ni el contrato API; son correcciones de infraestructura, scripts y docs más dos fixes menores de frontend.

**Tech Stack:** Git 2.48 (Windows), Docker Compose (Postgres 16), Node 24 (scripts .mjs), Python 3.13 (`backend_django/.venv` — YA recreado y funcional), Angular CLI 21, pytest, Jest.

## Global Constraints

- **RNF-010:** no crear migraciones Django que alteren tablas de dominio; el esquema es de Flyway/bootstrap. Ninguna tarea de este plan toca el esquema.
- **No romper el flujo del estudiante ni los tests verdes.** Baseline actual verificado 2026-07-08: `manage.py check` limpio, pytest **177/177**, jest **203/203**, `ng build` OK, `npm run test:api:e2e` PASS.
- **No tocar** el backend Spring congelado (vive en el proyecto viejo `psicologia_proyecto`, fuera de esta carpeta).
- **Secretos fuera de git:** `.env`, `psychosim/settings/local.py`, `.venv/`, `node_modules/` ya están cubiertos por el `.gitignore` existente — verificar antes del primer commit, no confiar.
- **Nunca** hacer `git push --force` ni pushear a `origin/master` en este plan; el estado v3 se sube en una rama nueva (`integracion/v3-snapshot`) para que el equipo decida el merge.
- **Commits:** mensaje descriptivo en español, terminando con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Decisión de producto ya tomada (no tocar):** en la UI, "Grupos" y "Reportes" quedan solo para PROFESOR aunque el backend permita ADMIN. Es diseño intencional.
- Shell de referencia: **PowerShell** en Windows. Directorio raíz: `D:\Sua_Files\IdeaProjects\psico_project_v3`.
- El servidor Django de verificación se corre con `backend_django\.venv\Scripts\python.exe manage.py runserver 8091` y la BD con `docker compose up -d db` (el contenedor `psychosim-db` ya existe y se reutiliza).

---

### Task 1: Reconectar git al historial de `Jsua3/psico_project_v2`

La carpeta v3 no es repo git. Vamos a inicializarla, traer el historial completo del repo v2 y montar el estado actual encima como un commit nuevo en una rama de integración. Así no se pierde ni el historial viejo ni el trabajo nuevo del equipo.

**Hechos verificados (2026-07-08):** el remoto `https://github.com/Jsua3/psico_project_v2.git` responde, su rama por defecto es `master` (HEAD `5ed857f`), y la identidad git global ya está configurada (`Jsua3` / `jjsua_542@unihumboldt.edu.co`).

**Files:**
- Create: `.git/` (repo) — no se modifica ningún archivo del proyecto.

**Interfaces:**
- Consumes: nada.
- Produces: repo git con remoto `origin`, rama `integracion/v3-snapshot` conteniendo todo el historial v2 + 1 commit snapshot v3. Las tareas 2–6 hacen `git add`/`git commit` sobre esta rama.

- [ ] **Step 1: Inicializar el repo con la rama master y conectar el remoto**

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3
git init -b master
git remote add origin https://github.com/Jsua3/psico_project_v2.git
git fetch origin
```

Esperado: `git fetch` lista las ramas remotas (al menos `origin/master`) sin errores. El fetch NO toca los archivos de trabajo.

- [ ] **Step 2: Apuntar la rama local al historial remoto sin tocar los archivos**

```powershell
git reset --mixed origin/master
```

Esperado: sin salida de error. Esto pone `master` local sobre el último commit de v2 y el índice sobre ese árbol, **dejando intactos los archivos de v3 en disco**. `git status` mostrará ahora la diferencia "v3 vs v2" como cambios sin stagear (modificados, nuevos y borrados).

- [ ] **Step 3: Verificar que el .gitignore protege secretos y artefactos**

```powershell
git status --porcelain | Select-String -Pattern '\.venv|node_modules|local\.py|^\s*\?\? \.env$|staticfiles|frontend/dist|\.angular'
```

Esperado: **sin resultados**. Si aparece cualquier línea, detenerse y añadir la ruta faltante a `.gitignore` antes de continuar (el `.gitignore` actual ya cubre todo esto; este paso es el cinturón de seguridad).

- [ ] **Step 4: Crear la rama de integración y commitear el snapshot v3**

```powershell
git checkout -b integracion/v3-snapshot
git add -A
git status --short | Measure-Object -Line
git commit -m @'
feat: snapshot integral del estado v3 sobre historial v2

Monta el estado actual de psico_project_v3 (trabajo del equipo:
editor de casos, mundo jugable multi-sala, rúbricas, reportes,
landing, HUD liquid-glass) como un commit sobre origin/master de
psico_project_v2, recuperando el control de versiones perdido al
copiar la carpeta.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

Esperado: el commit se crea; `git log --oneline -3` muestra el snapshot arriba y debajo los últimos commits de v2.

- [ ] **Step 5: Verificar la integridad del árbol commiteado**

```powershell
git status
git log --oneline -5
```

Esperado: `working tree clean` (o solo rutas ignoradas), y el historial v2 visible bajo el commit snapshot.

- [ ] **Step 6: Pushear la rama de integración (NO master)**

```powershell
git push -u origin integracion/v3-snapshot
```

Esperado: rama creada en GitHub. **No** se toca `origin/master`; el merge lo decide el equipo (ver "Seguimientos manuales").

---

### Task 2: Eliminar los servicios Spring muertos de `docker-compose.yml`

Los servicios `backend` y `frontend` del compose referencian `docker/backend.Dockerfile` y `docker/frontend.Dockerfile` **que no existen** y variables `SPRING_*` de la era Java. Solo el servicio `db` es real. El despliegue productivo usa el `Dockerfile` raíz (Railway) y no pasa por compose.

**Files:**
- Modify: `docker-compose.yml` (reemplazo completo)

**Interfaces:**
- Consumes: rama git de Task 1.
- Produces: compose válido con un único servicio `db` (mismo nombre de contenedor `psychosim-db`, mismo puerto 5433, mismo volumen — cero impacto en datos).

- [ ] **Step 1: Reemplazar el contenido completo de `docker-compose.yml` por:**

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: psychosim-db
    environment:
      POSTGRES_DB: psychosim
      POSTGRES_USER: psychosim
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-psychosim_secret}
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U psychosim"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

- [ ] **Step 2: Validar la sintaxis y que la BD sigue operativa**

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3
docker compose config --quiet; "config exit: $LASTEXITCODE"
docker compose up -d db
docker exec psychosim-db pg_isready -U psychosim
```

Esperado: `config exit: 0`, contenedor `psychosim-db` corriendo (se reutiliza el existente), `accepting connections`.

- [ ] **Step 3: Commit**

```powershell
git add docker-compose.yml
git commit -m @'
fix: retirar servicios Spring inexistentes del docker-compose

backend/frontend referenciaban docker/*.Dockerfile que no existen
(era Java congelada). Solo el servicio db es real; el deploy usa el
Dockerfile raiz via Railway.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 3: Endurecer el chequeo de esquema en `scripts/dev-up.mjs`

`simulationSchemaReady()` solo comprueba `simulation_cases`, así que una BD con esquema viejo (como el volumen legacy `psicologia_proyecto_postgres_data` que usa este contenedor) "pasa" el check, el bootstrap se salta y el sistema falla en runtime con `relation "grupo_case_version" does not exist`. Se amplía el check a las tres tablas jalonadoras del esquema: la fundacional, la de asignación de casos a grupos y la más reciente (`simulation_rubric_assignments`, creada por la migración `simulation/0004`).

**Nota de diseño:** NO se cambia a "ejecutar bootstrap siempre" porque `seed_caso_pdf` (invocado por `bootstrap_dev_db`) **elimina los intentos existentes** de la versión demo al re-sembrar — sería destructivo en cada arranque.

**Files:**
- Modify: `scripts/dev-up.mjs:124-136` (función `simulationSchemaReady`)

**Interfaces:**
- Consumes: rama git; `manage.py shell` del venv ya funcional.
- Produces: `simulationSchemaReady(): boolean` con la misma firma y mismo call-site (`ensureDevDatabase()` no cambia).

- [ ] **Step 1: Reemplazar la función `simulationSchemaReady()` (líneas 124–136) por:**

```js
// Tablas jalonadoras del esquema del simulador, de la más antigua a la más
// reciente (simulation_rubric_assignments la crea la migración simulation/0004).
// Si falta cualquiera, la BD viene de una versión anterior y hay que correr
// el bootstrap (idempotente) para completar el esquema.
const REQUIRED_SIM_TABLES = [
  'simulation_cases',
  'grupo_case_version',
  'simulation_rubric_assignments',
];

function simulationSchemaReady() {
  const regclassList = REQUIRED_SIM_TABLES
    .map((t) => `to_regclass('public.${t}')`)
    .join(', ');
  const result = spawnSync(
    venvPython(),
    [
      'manage.py',
      'shell',
      '-c',
      `from django.db import connection; c=connection.cursor(); c.execute("SELECT ${regclassList}"); raise SystemExit(0 if all(c.fetchone()) else 1)`,
    ],
    { cwd: BACKEND, stdio: 'pipe', shell: isWin },
  );
  return result.status === 0;
}
```

- [ ] **Step 2: Verificación positiva — con la BD actual (esquema completo) el check pasa**

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3\backend_django
.\.venv\Scripts\python.exe manage.py shell -c "from django.db import connection; c=connection.cursor(); c.execute(\"SELECT to_regclass('public.simulation_cases'), to_regclass('public.grupo_case_version'), to_regclass('public.simulation_rubric_assignments')\"); raise SystemExit(0 if all(c.fetchone()) else 1)"; "exit: $LASTEXITCODE"
```

Esperado: `exit: 0`.

- [ ] **Step 3: Verificación negativa — una tabla inexistente hace fallar el check**

```powershell
.\.venv\Scripts\python.exe manage.py shell -c "from django.db import connection; c=connection.cursor(); c.execute(\"SELECT to_regclass('public.tabla_que_no_existe')\"); raise SystemExit(0 if all(c.fetchone()) else 1)"; "exit: $LASTEXITCODE"
```

Esperado: `exit: 1` (así se comportará dev-up ante una BD vieja: detecta y corre `bootstrap_dev_db`).

- [ ] **Step 4: Verificación de integración — `npm run up` arranca sin re-sembrar**

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3
npm run up
```

Esperado: en la salida NO aparece `Inicializando esquema del simulador` (el esquema ya está completo); backend y frontend arrancan. Cortar con `Ctrl+C` tras confirmar.

- [ ] **Step 5: Commit**

```powershell
git add scripts/dev-up.mjs
git commit -m @'
fix: detectar esquema de simulador incompleto en dev-up

El check solo miraba simulation_cases, por lo que una BD del
proyecto v2 pasaba la verificacion sin tener grupo_case_version ni
simulation_rubric_assignments y el sistema fallaba en runtime.
Ahora se exigen las tres tablas jalonadoras antes de saltarse el
bootstrap.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 4: Actualizar README y PROMPT_MAESTRO al estado real

El README describe la estructura como `psico_project_v2/` y no documenta los dos problemas de entorno Windows que ya mordieron dos veces (venv roto por el Python de la Microsoft Store; BD legacy con esquema viejo). `PROMPT_MAESTRO.md` (fuente de verdad) no registra la auditoría ni la reconexión de git.

**Files:**
- Modify: `README.md:10` (nombre de carpeta) y final del archivo (nueva sección)
- Modify: `docs/PROMPT_MAESTRO.md` (sección 18, tabla de historial)

**Interfaces:**
- Consumes: nada de código; hechos verificados en la auditoría 2026-07-08.
- Produces: docs fieles; ningún consumidor de código.

- [ ] **Step 1: En `README.md`, reemplazar la línea 10** (`psico_project_v2/` dentro del bloque de estructura) **por:**

```
psico_project_v3/
```

- [ ] **Step 2: Añadir al final de `README.md` esta sección:**

```markdown
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
```

- [ ] **Step 3: En `docs/PROMPT_MAESTRO.md`, sección 18 (tabla "Historial (compacto)"), añadir al final de la tabla esta fila:**

```markdown
| 2026-07-08 | **Auditoría integral v3 + estabilización.** Entorno local reparado (venv recreado con `C:\Python313` — el alias Python de MS Store genera venvs rotos; esquema de BD legacy reconciliado con `migrate --fake` selectivo + `bootstrap_dev_db`). Git reconectado: historial de `Jsua3/psico_project_v2` + snapshot v3 en rama `integracion/v3-snapshot`. `docker-compose.yml` limpiado (servicios Spring muertos), check de esquema de `dev-up.mjs` endurecido (3 tablas jalonadoras), fix NG8102, docs actualizadas. Verificado: pytest 177/177, jest 203/203, ng build, `npm run test:api:e2e` PASS, smoke completo login→juego. |
```

- [ ] **Step 4: Verificar y commitear**

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3
git diff --stat
git add README.md docs/PROMPT_MAESTRO.md
git commit -m @'
docs: actualizar README y PROMPT_MAESTRO al estado v3 real

Estructura v2 -> v3, seccion de troubleshooting Windows (venv de MS
Store, BD legacy) y registro de la auditoria 2026-07-08 en el
historial del PROMPT_MAESTRO.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

Esperado: `git diff --stat` muestra solo los 2 archivos; commit limpio.

---

### Task 5: Arreglos menores de frontend y configuración

Tres limpiezas: el warning NG8102 del build, un comentario engañoso en `.env.example` y un spec con nombre que sugiere un servicio inexistente.

**Files:**
- Modify: `frontend/src/app/features/simulator/instructor-trace.component.ts:311`
- Modify: `.env.example:36`
- Rename: `frontend/src/app/core/api/simulation-catalog.service.spec.ts` → `frontend/src/app/core/api/simulation.service.catalog.spec.ts`

**Interfaces:**
- Consumes: `item.phaseDurations` ya está garantizado como array — el propio componente lo normaliza al construir el item (línea 1737: `phaseDurations: trace.phaseDurations ?? []`) y el modelo lo tipa `PhaseDuration[]` no-nullable (`core/models/simulation.model.ts:78`). Por eso quitar el `?? []` de la línea 311 es seguro.
- Produces: build sin NG8102; misma suite jest (el rename no cambia la recolección: Jest toma cualquier `*.spec.ts`).

- [ ] **Step 1: En `instructor-trace.component.ts` línea 311, cambiar**

```
@if ((item.phaseDurations ?? []).length) {
```

**por:**

```
@if (item.phaseDurations.length) {
```

- [ ] **Step 2: En `.env.example`, reemplazar la línea 36**

```
# Redirección HTTPS (pon "false" solo si hay un proxy TLS externo que ya lo maneja)
```

**por:**

```
# Redirección HTTPS: por defecto Django NO redirige (Railway ya termina TLS en el borde). Pon "true" solo si no hay proxy TLS delante.
```

- [ ] **Step 3: Renombrar el spec engañoso (no existe `SimulationCatalogService`; el archivo testea `SimulationService.getCatalog`)**

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3
git mv frontend/src/app/core/api/simulation-catalog.service.spec.ts frontend/src/app/core/api/simulation.service.catalog.spec.ts
```

- [ ] **Step 4: Verificar — jest completo y build sin NG8102**

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3\frontend
npm test -- --watch=false --runInBand
npm run build
```

Esperado: **203/203 tests** en verde (36 suites, mismo total: el rename no pierde specs) y build **sin** el warning `NG8102` (buscar "NG8102" en la salida: cero coincidencias).

- [ ] **Step 5: Commit**

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3
git add -A
git commit -m @'
chore: fix NG8102, comentario SSL de .env.example y rename de spec

- instructor-trace: phaseDurations ya se normaliza al construir el
  item; el ?? [] del template era codigo muerto (warning NG8102).
- .env.example decia que el redirect SSL por defecto era true;
  production.py usa false (Railway termina TLS).
- simulation-catalog.service.spec.ts testea SimulationService, no un
  servicio propio; renombrado para reflejarlo.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 6: Verificación integral final y push

Correr todas las puertas de calidad del proyecto contra el árbol final y subir la rama.

**Files:**
- Ninguno nuevo (solo verificación y push).

**Interfaces:**
- Consumes: todo lo anterior commiteado en `integracion/v3-snapshot`.
- Produces: rama remota actualizada y verificada; evidencia para el PR del equipo.

- [ ] **Step 1: Puertas estáticas**

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3
npm run check:backend
npm run test:backend
npm run test:frontend
npm run build:frontend
```

Esperado: check sin issues; **pytest 177/177**; **jest 203/203**; build OK sin NG8102.

- [ ] **Step 2: Matriz e2e HTTP contra el stack vivo**

Con la BD arriba (`docker compose up -d db`), arrancar el backend en una terminal aparte:

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3\backend_django
.\.venv\Scripts\python.exe manage.py runserver 8091
```

Y en otra terminal:

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3
npm run test:api:e2e
```

Esperado: `Matriz API e2e: PASS` (16 checks: logins de los 3 roles, 401/403 correctos).

- [ ] **Step 3: Smoke de juego en navegador**

Con backend y frontend arriba (`npm run up` o el frontend con `npm start --prefix frontend`), en el navegador: login `estudiante@psychosim.edu.co` / `Estudiante123!` → Simulador → "Iniciar simulación" → confirmar que el canvas Phaser carga con HUD (corazones de estrés, herramientas, botón "Salida segura").

Esperado: sin errores en la consola del navegador; sin llamadas API fallidas en la pestaña Network.

- [ ] **Step 4: Push final**

```powershell
Set-Location D:\Sua_Files\IdeaProjects\psico_project_v3
git push origin integracion/v3-snapshot
git log --oneline origin/master..integracion/v3-snapshot
```

Esperado: la rama remota queda con ~6 commits nuevos sobre `origin/master` (snapshot + 5 fixes).

---

## Seguimientos manuales (fuera del alcance de este plan — requieren decisión humana o acceso GitHub)

1. **🔴 Hacer privados los repos** `Jsua3/psico_project_v2` y `Jsua3/Proyecto_psicologia` (GitHub → Settings → Danger Zone → Change visibility). Es la deuda de mayor prioridad del PROMPT_MAESTRO: el proyecto maneja contenido clínico sensible.
2. **Merge de `integracion/v3-snapshot` → `master`:** abrir PR en GitHub para que el equipo revise el snapshot y lo integre. Tras el merge, considerar renombrar el repo a `psico_project_v3` para alinear con la carpeta.
3. **16 commits "living-world" sin reconciliar** (deuda del PROMPT_MAESTRO §15): estaban en el clon local viejo del repo `Jsua3/Proyecto_psicologia`. Antes de invertir tiempo, verificar si el código de v3 ya los superó (camera-follow, audio, multi-sala y NPCs ya existen en v3).
4. **Asistente de IA (RF-027):** funciona en modo degradado ("no configurado"). Para activarlo, definir `AI_ASSISTANT_API_KEY` (y opcionalmente `AI_ASSISTANT_PROVIDER=anthropic` + `AI_ASSISTANT_MODEL`) en el entorno del backend.
5. **Contraste WCAG:** axe-core reporta violaciones "serious" de contraste en landing/login. Requiere pasada de diseño (paleta institucional); no automatizar a ciegas.
6. **T3.3 (retiro del Spring congelado):** sigue DIFERIDO hasta validar Django en producción, según PROMPT_MAESTRO §14.
