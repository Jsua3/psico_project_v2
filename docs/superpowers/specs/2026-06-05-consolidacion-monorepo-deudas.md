# SIEP — Consolidación Monorepo + Deudas Prioritarias
**Fecha:** 2026-06-05  
**Tipo:** Spec de diseño  
**Autor:** Claude Sonnet 4.6 + Jsua3

---

## Contexto

El proyecto SIEP vive actualmente en **dos repositorios git separados**:

| Repo | Ruta local | Descripción |
|---|---|---|
| `Jsua3/psico_project_v2` | `D:/Sua_Files/IdeaProjects/psico_project_v2/` | Backend Django 5.1 + docs |
| `Jsua3/Proyecto_psicologia` | `D:/Sua_Files/IdeaProjects/psicologia_proyecto/` | Frontend Angular 21 + Spring FROZEN |

**Objetivo:** Consolidar en un único repositorio (`psico_project_v2`) y resolver las deudas prioritarias identificadas en el PROMPT_MAESTRO.

---

## Alcance — 3 sub-proyectos independientes

### Sub-proyecto 1: Consolidación monorepo
Copiar el código del frontend Angular (y artefactos relevantes del repo `psicologia_proyecto`) a `psico_project_v2/`, estructurando como monorepo Django + Angular.

**Decisiones:**
- Sin preservación de historial git (clean copy + nuevo commit)
- El repo `Proyecto_psicologia` permanece en GitHub como archivo
- Estructura destino: `psico_project_v2/frontend/` ← contenido de `admin-panel/`
- El `docker-compose.yml` (solo el servicio `db`) se mueve también
- `.env.example` se adapta al monorepo
- El Spring backend (`backend/`) NO se copia — permanece en el repo original congelado

### Sub-proyecto 2: Landing page institucional
La landing en `features/public/landing.component` **ya existe y está implementada** (234 líneas de HTML, SCSS separado, TS separado). La deuda era perceptual: el PROMPT_MAESTRO la marcaba como básica pero ya fue completada antes del merge de integración.

**Acción:** Verificar que el componente funciona correctamente en el monorepo consolidado y actualizar el PROMPT_MAESTRO para marcar esta deuda como resuelta.

### Sub-proyecto 3: Privacidad de repos en GitHub
Los repos `Jsua3/psico_project_v2` y `Jsua3/Proyecto_psicologia` están marcados como `"private": false`. Deben hacerse privados manualmente en GitHub Settings (esto no se puede hacer vía git CLI sin gh CLI instalado).

**Acción:** Instrucciones precisas al usuario para hacerlo + verificación.

---

## Estructura monorepo objetivo

```
psico_project_v2/
  backend_django/           ← código Python activo (sin cambios)
  frontend/                 ← NUEVO — contenido de admin-panel/
    angular.json
    package.json
    package-lock.json
    proxy.conf.json
    proxy.django.json
    proxy.spring.json
    jest.config.js
    setup-jest.ts
    tsconfig*.json
    playwright.config.ts
    src/
      app/
      assets/
      ...
  docker-compose.yml        ← NUEVO — copiado de psicologia_proyecto/
  .env.example              ← NUEVO/ACTUALIZADO — adaptado al monorepo
  docs/
    PROMPT_MAESTRO.md       ← ACTUALIZADO — deudas al día
    superpowers/specs/      ← este archivo
    superpowers/plans/
  .gitignore                ← ACTUALIZADO — cubrir frontend/node_modules, frontend/dist, etc.
  README.md                 ← NUEVO — guía de arranque del monorepo
```

**Lo que NO se copia:**
- `node_modules/` (regenerar con npm install)
- `dist/` (regenerar con ng build)
- `.angular/` (caché Angular CLI)
- `backend/` (Spring FROZEN — permanece en repo original)
- `client/` (JavaFX muerto — ya eliminado por chore/cleanup)
- `qa-fase-*` fotos y screenshots (ruido)
- `.git/` del repo origen

---

## Invariantes respetados

- Spring backend CONGELADO: no se toca, no se mueve, no se elimina del repo origen
- RNF-010: no se tocan migraciones ni esquema
- El contrato HTTP Django ↔ Angular permanece idéntico
- `proxy.conf.json` apunta a Django `:8091` (sin cambios)

---

## Criterio de éxito

- [ ] `psico_project_v2/frontend/` tiene el código Angular funcional
- [ ] `npm install` y `ng serve` funcionan desde `frontend/`
- [ ] `docker compose up -d db` funciona desde raíz del monorepo
- [ ] `.gitignore` cubre correctamente ambos proyectos
- [ ] PROMPT_MAESTRO actualizado: deudas al día, rutas al día
- [ ] README.md documenta cómo arrancar el monorepo completo
- [ ] Los repos en GitHub son privados

---

## Notas de seguridad

- No copiar ningún `.env` real (solo `.env.example`)
- `.gitignore` debe cubrir `frontend/.env`, `frontend/node_modules/`, `frontend/dist/`, `frontend/.angular/`
