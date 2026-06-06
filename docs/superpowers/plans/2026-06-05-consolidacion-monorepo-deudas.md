# Consolidación Monorepo SIEP + Deudas Prioritarias — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar el backend Django y el frontend Angular en un único repositorio git (`psico_project_v2`) y resolver las deudas prioritarias del PROMPT_MAESTRO.

**Architecture:** Monorepo con dos subdirectorios principales — `backend_django/` (existente) y `frontend/` (nuevo, contenido copiado de `Proyecto_psicologia/admin-panel/`). Un único `docker-compose.yml` en la raíz para levantar la BD. El workflow de desarrollo es idéntico al actual, solo cambia el directorio de trabajo.

**Tech Stack:** Python 3.12 / Django 5.1, Angular 21, PostgreSQL 16 (Docker), Node 18+, PowerShell (Windows)

---

## User Review Required

> [!IMPORTANT]
> Antes de ejecutar el Task 1 (copia de archivos), asegúrate de que la rama `integrate/case-editor-into-main` en `Proyecto_psicologia` ya fue mergeada a `main` (o que estás en la rama que quieres copiar). El plan asume que el estado del frontend en `D:\Sua_Files\IdeaProjects\psicologia_proyecto` corresponde a la rama actual activa del repo frontend.

> [!WARNING]
> La copia **no preserva historial git** del repo frontend. Toda la historia anterior del frontend vivirá en el repo `Jsua3/Proyecto_psicologia` (que permanece en GitHub). Si en el futuro necesitas ver un commit antiguo del frontend, deberás ir a ese repo.

> [!CAUTION]
> El Task 5 (hacer repos privados en GitHub) requiere acción manual del usuario en la web de GitHub. No se puede automatizar sin `gh` CLI.

---

## Open Questions

Ninguna — el usuario aprobó:
- Copiar archivos sin preservar historial
- Mantener `Proyecto_psicologia` en GitHub como archivo
- Consolidar en `psico_project_v2/frontend/`

---

## Proposed Changes

### Task 1: Copiar el frontend Angular al monorepo

#### [MODIFY] psico_project_v2/ (nuevo subdirectorio `frontend/`)

Copiar el contenido de `D:\Sua_Files\IdeaProjects\psicologia_proyecto\admin-panel\` a `D:\Sua_Files\IdeaProjects\psico_project_v2\frontend\`, excluyendo `node_modules/`, `dist/`, `.angular/`.

También copiar desde `psicologia_proyecto/`:
- `docker-compose.yml` → raíz de `psico_project_v2/`
- `.env.example` → raíz de `psico_project_v2/` (adaptar rutas si aplica)

---

### Task 2: Actualizar `.gitignore`

#### [MODIFY] [.gitignore](file:///d:/Sua_Files/IdeaProjects/psico_project_v2/.gitignore)

Añadir reglas para cubrir el subdirectorio `frontend/`.

---

### Task 3: Actualizar documentación

#### [MODIFY] [PROMPT_MAESTRO.md](file:///d:/Sua_Files/IdeaProjects/psico_project_v2/docs/PROMPT_MAESTRO.md)

- Actualizar §2 (estructura de directorios) para reflejar el monorepo
- Marcar deudas de landing page como resueltas
- Actualizar §11 (cómo correr) con rutas del monorepo
- Actualizar §13 (estado de ramas) 

#### [NEW] README.md en raíz de `psico_project_v2`

Guía de arranque rápida del monorepo.

---

### Task 4: Verificar que el frontend funciona en su nueva ubicación

Correr `npm install` + `ng build` desde `frontend/`.

---

### Task 5: Privacidad de repos GitHub (manual)

Instrucciones paso a paso para hacer los repos privados.

---

## Pasos Detallados

---

### Task 1: Copiar frontend al monorepo

**Files:**
- Create: `psico_project_v2/frontend/` (directorio)
- Create: `psico_project_v2/docker-compose.yml`
- Create: `psico_project_v2/.env.example`

- [ ] **Step 1.1: Copiar admin-panel al directorio frontend/**

```powershell
# Desde PowerShell — esto copia todo EXCEPTO node_modules, dist, .angular
$src = "D:\Sua_Files\IdeaProjects\psicologia_proyecto\admin-panel"
$dst = "D:\Sua_Files\IdeaProjects\psico_project_v2\frontend"

# Crear destino
New-Item -ItemType Directory -Path $dst -Force

# Copiar con exclusiones
robocopy $src $dst /E /XD node_modules dist .angular /XF "*.log" /NP
```

Expected: salida de robocopy indicando archivos copiados, con `0x01` o `0x03` (éxito con archivos).

- [ ] **Step 1.2: Copiar docker-compose.yml**

```powershell
Copy-Item "D:\Sua_Files\IdeaProjects\psicologia_proyecto\docker-compose.yml" `
          "D:\Sua_Files\IdeaProjects\psico_project_v2\docker-compose.yml"
```

- [ ] **Step 1.3: Copiar y adaptar .env.example**

```powershell
Copy-Item "D:\Sua_Files\IdeaProjects\psicologia_proyecto\.env.example" `
          "D:\Sua_Files\IdeaProjects\psico_project_v2\.env.example"
```

- [ ] **Step 1.4: Verificar que los archivos clave están presentes**

```powershell
$required = @(
    "D:\Sua_Files\IdeaProjects\psico_project_v2\frontend\angular.json",
    "D:\Sua_Files\IdeaProjects\psico_project_v2\frontend\package.json",
    "D:\Sua_Files\IdeaProjects\psico_project_v2\frontend\src\app\app.component.ts",
    "D:\Sua_Files\IdeaProjects\psico_project_v2\frontend\src\app\features\public\landing.component.ts",
    "D:\Sua_Files\IdeaProjects\psico_project_v2\docker-compose.yml"
)
$required | ForEach-Object { 
    if (Test-Path $_) { Write-Host "✅ $_" } else { Write-Host "❌ FALTA: $_" }
}
```

Expected: todos los ✅.

- [ ] **Step 1.5: Commit del frontend copiado**

```powershell
cd D:\Sua_Files\IdeaProjects\psico_project_v2
git add frontend/ docker-compose.yml .env.example
git commit -m "feat(monorepo): add Angular frontend from Proyecto_psicologia/admin-panel

Consolidates both repos into a single monorepo.
- frontend/ = admin-panel/ content (excl. node_modules, dist, .angular)
- docker-compose.yml: PostgreSQL service for local dev
- .env.example: environment variables template

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Actualizar .gitignore

**Files:**
- Modify: `D:\Sua_Files\IdeaProjects\psico_project_v2\.gitignore`

- [ ] **Step 2.1: Ver el .gitignore actual**

```powershell
Get-Content D:\Sua_Files\IdeaProjects\psico_project_v2\.gitignore
```

- [ ] **Step 2.2: Agregar reglas para el frontend**

Añadir al final del `.gitignore` existente:

```gitignore
# ── Frontend Angular ──────────────────────────────────────
frontend/node_modules/
frontend/dist/
frontend/.angular/
frontend/.env
frontend/qa-screenshots/

# Docker / env
.env
*.env
```

- [ ] **Step 2.3: Commit del .gitignore actualizado**

```powershell
cd D:\Sua_Files\IdeaProjects\psico_project_v2
git add .gitignore
git commit -m "chore: extend .gitignore to cover frontend/ (Angular monorepo)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Actualizar PROMPT_MAESTRO y crear README

**Files:**
- Modify: `D:\Sua_Files\IdeaProjects\psico_project_v2\docs\PROMPT_MAESTRO.md`
- Create: `D:\Sua_Files\IdeaProjects\psico_project_v2\README.md`

- [ ] **Step 3.1: Actualizar §2 del PROMPT_MAESTRO (estructura de directorios)**

Reemplazar la sección "Cross-repo — estructura real" para reflejar el monorepo. Nueva estructura:

```
psico_project_v2/          ← MONOREPO — único repo activo
  backend_django/           ← código Python activo
    psychosim/settings/
    apps/
    shared/
    .venv/
  frontend/                 ← Angular 21 (antes en Proyecto_psicologia/admin-panel/)
    src/app/
      core/
      features/
      shared/layout/
    src/assets/
      game/maps/
      game/scenarios/
      images/institution/
    proxy.conf.json          ← apunta a Django :8091
    proxy.django.json
    proxy.spring.json
  docker-compose.yml         ← servicio `db` PostgreSQL :5433
  .env.example               ← plantilla de secretos
  docs/
    PROMPT_MAESTRO.md        ← este archivo
    superpowers/specs/
    superpowers/plans/

# Repo archivado (solo referencia histórica):
Jsua3/Proyecto_psicologia  ← ARCHIVADO — historial git del frontend pre-monorepo
  backend/                  ← Spring Boot Java — CONGELADO, es respaldo, NO tocar
```

- [ ] **Step 3.2: Actualizar §15 (deudas) del PROMPT_MAESTRO**

Actualizar las deudas prioritarias:

```markdown
| Prioridad | Ítem | Estado |
|---|---|---|
| ✅ Resuelta | **Landing page** — implementada completamente en `frontend/src/app/features/public/` | HECHO |
| ✅ Resuelta | **Monorepo** — frontend consolidado en `psico_project_v2/frontend/` | HECHO |
| 🔴 Alta | **Repos privados** — `Jsua3/psico_project_v2` y `Jsua3/Proyecto_psicologia` deben hacerse privados en GitHub. | PENDIENTE (manual) |
| 🟡 Media | **Reconciliar `main` local del frontend** (16 commits "living-world" sin pushear). Ahora se gestiona desde el monorepo. | PENDIENTE |
| 🟡 Media | **T3.3** (retiro Spring): diferido; retomar cuando Django esté en producción. | DIFERIDO |
| 🟢 Baja | Carpetas huérfanas `apps/casos/` y `apps/sesiones/` en disco. | BAJA |
| 🟢 Baja | Warnings NG8107 en `dialogue-panel.component.ts` (no bloquean build). | BAJA |
```

- [ ] **Step 3.3: Actualizar §11 (Cómo correr) del PROMPT_MAESTRO**

```markdown
## 11. Cómo correr (Windows — monorepo)

```powershell
# 1. Levantar BD (desde raíz del monorepo)
cd D:/Sua_Files/IdeaProjects/psico_project_v2
docker compose up -d db
# → Postgres en localhost:5433, BD psychosim

# 2. Backend Django
cd D:/Sua_Files/IdeaProjects/psico_project_v2/backend_django
./.venv/Scripts/python.exe -m pytest -q
./.venv/Scripts/python.exe manage.py runserver 8091

# 3. Frontend Angular
cd D:/Sua_Files/IdeaProjects/psico_project_v2/frontend
npm install          # primera vez
npm start            # ng serve → http://localhost:4200
npm run build        # build de producción
npm test -- --watch=false   # jest unit tests
```
```

- [ ] **Step 3.4: Crear README.md en la raíz del monorepo**

```markdown
# SIEP — Sistema de Entrenamiento Psicosocial

Monorepo del proyecto SIEP. Plataforma web académica de la **Corporación Universitaria Empresarial Alexander Von Humboldt** (Programa de Psicología, Armenia).

## Estructura

```
psico_project_v2/
  backend_django/   ← API Django 5.1 + DRF
  frontend/         ← App Angular 21
  docker-compose.yml
  docs/PROMPT_MAESTRO.md   ← fuente de verdad del proyecto
```

## Arranque rápido

### Requisitos previos
- Docker Desktop
- Python 3.12 + virtualenv (en `backend_django/.venv/`)
- Node 18+ / npm

### 1. Base de datos
```powershell
docker compose up -d db
```

### 2. Backend Django
```powershell
cd backend_django
.\.venv\Scripts\python.exe manage.py runserver 8091
```

### 3. Frontend Angular
```powershell
cd frontend
npm install
npm start
```

Abrir http://localhost:4200

### Credenciales demo
| Rol | Email | Contraseña |
|---|---|---|
| ADMIN | admin@psychosim.edu.co | Admin123! |
| PROFESOR | profesora@psychosim.edu.co | Profesor123! |
| ESTUDIANTE | estudiante@psychosim.edu.co | Estudiante123! |

## Documentación

Ver [`docs/PROMPT_MAESTRO.md`](docs/PROMPT_MAESTRO.md) para la arquitectura completa, endpoints, componentes y decisiones de diseño.
```

- [ ] **Step 3.5: Commit de documentación**

```powershell
cd D:\Sua_Files\IdeaProjects\psico_project_v2
git add docs/PROMPT_MAESTRO.md README.md
git commit -m "docs: update PROMPT_MAESTRO for monorepo + add root README

- §2: updated directory tree to reflect monorepo structure
- §11: updated 'how to run' with monorepo paths
- §15: mark landing page debt as resolved; add monorepo debt as done
- README.md: new quick-start guide for the monorepo

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Verificar que el frontend funciona desde su nueva ubicación

- [ ] **Step 4.1: Instalar dependencias del frontend**

```powershell
cd D:\Sua_Files\IdeaProjects\psico_project_v2\frontend
npm install
```

Expected: `added N packages` sin errores de peer dependencies bloqueantes.

- [ ] **Step 4.2: Verificar que ng build pasa**

```powershell
cd D:\Sua_Files\IdeaProjects\psico_project_v2\frontend
npx ng build --configuration=development 2>&1 | tail -20
```

Expected: `Build at: ... - Hash: ... - Time: ...ms` sin errores (warnings OK).

- [ ] **Step 4.3: Correr jest tests**

```powershell
cd D:\Sua_Files\IdeaProjects\psico_project_v2\frontend
npm test -- --watch=false 2>&1 | tail -10
```

Expected: `Tests: X passed, X total` (target: 64/64 como antes).

- [ ] **Step 4.4: Commit de verificación (si se requirieron ajustes)**

Solo si se necesitaron cambios de configuración (ej. rutas en `angular.json`):

```powershell
git add frontend/angular.json  # o los archivos ajustados
git commit -m "fix(frontend): adjust paths after monorepo consolidation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Hacer los repos privados en GitHub (manual)

> [!IMPORTANT]
> Esta tarea requiere acción manual del usuario. No se puede automatizar sin `gh` CLI instalado.

- [ ] **Step 5.1: Hacer privado `psico_project_v2`**

1. Ir a https://github.com/Jsua3/psico_project_v2/settings
2. Scroll hasta **"Danger Zone"**
3. Click **"Change repository visibility"**
4. Seleccionar **"Make private"**
5. Escribir el nombre del repo para confirmar
6. Click **"I understand..."**

- [ ] **Step 5.2: Hacer privado `Proyecto_psicologia`**

1. Ir a https://github.com/Jsua3/Proyecto_psicologia/settings
2. Repetir el mismo proceso

- [ ] **Step 5.3: Verificar**

```powershell
# Verificar que los repos responden con 404 (privados) desde sin autenticación
# O simplemente verificar en GitHub que el badge "Private" aparece en los repos
```

---

### Task 6: Push del monorepo a GitHub

- [ ] **Step 6.1: Push todos los commits**

```powershell
cd D:\Sua_Files\IdeaProjects\psico_project_v2
git push origin master
```

Expected: `master -> master` actualizado.

---

## Verification Plan

### Automated Tests
```powershell
# Backend
cd D:\Sua_Files\IdeaProjects\psico_project_v2\backend_django
.\.venv\Scripts\python.exe -m pytest -q
# Expected: 107+ tests passed

# Frontend
cd D:\Sua_Files\IdeaProjects\psico_project_v2\frontend
npm test -- --watch=false
# Expected: 64/64 tests passed

# Angular build
npx ng build --configuration=development
# Expected: build successful
```

### Manual Verification
- Levantar BD con `docker compose up -d db` desde la raíz del monorepo ✓
- `npm start` desde `frontend/` → aplicación en http://localhost:4200 ✓
- Login con `admin@psychosim.edu.co / Admin123!` funciona ✓
- Repos en GitHub muestran badge "Private" ✓
