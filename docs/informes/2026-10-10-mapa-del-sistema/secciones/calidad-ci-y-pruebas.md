## Calidad: pruebas, CI y compuertas

### Qué hace hoy

SIEP tiene seis familias de pruebas y un CI en GitHub Actions que ejecuta los mismos `npm run test:*` que en local (`.github/workflows/ci.yml:1-3`). Los conteos son estáticos (declaraciones, sin ejecutar; `parametrize` e `it.each` multiplican).

| Familia | Archivos | Casos | Cómo correrla (raíz del repo) |
|---|---|---|---|
| Scripts de entorno (`node:test`) | 4 `scripts/*.test.mjs` | 82 | `npm run test:scripts` |
| Backend (pytest + PostgreSQL desechable) | 52 `test_*.py` | 533 funciones (+59 `parametrize`) | `npm run check:backend`, `npm run test:backend [args de pytest]`, `npm run test:backend:down` |
| Frontend unitario (Vitest vía `ng test`) | 178 en `src/**` + 1 en `e2e/support` | ~1.950 | `npm run test:frontend` |
| Activos y kit de personajes (`node:test`) | 13 en `frontend/scripts/**` | 114 | en `frontend/`: `test:visual-assets`, `test:kit`, `kit:check`, `test:world-art` |
| Matriz API HTTP (3 roles) | `scripts/api-e2e.mjs` | 16 comprobaciones | `npm run test:api:e2e` (stack aislado, `--api-only`) |
| E2E Playwright (Chromium, 1 worker) | 10 `frontend/e2e/*.e2e.ts` | 35 instancias, 1 con `skip` | `npm run test:e2e [-- --grep @etiqueta]` |

Distribución: 404 de los 533 casos backend son de `apps/simulation`; 1.493 de los ~1.950 casos frontend están en `features/simulator`. Variables útiles: `SIEP_TEST_DB_PORT` (5544), `SIEP_E2E_API_PORT` (8093), `SIEP_E2E_WEB_PORT` (4315), `E2E_TIME_SCALE`, `E2E_CHROMIUM_PATH`/`E2E_CHROMIUM_ARGS`.

**Jobs del CI** (en PR, push a `master` y manual; `ci.yml:6-10`):
- `secrets`: gitleaks 8.24.2 con suma verificada, historial completo (`fetch-depth: 0`), config `.github/gitleaks.toml` (`ci.yml:29-47`).
- `scripts`: `npm run test:scripts` (`ci.yml:58`).
- `audit`: `pip-audit -r backend_django/requirements.txt` y `npm audit --audit-level=high` (`ci.yml:74,78`).
- `backend`: venv, `check:backend` (usa `settings.base`) y `test:backend` (`ci.yml:94-99`; `scripts/run-backend-support.mjs:3`).
- `frontend`: `npm ci`, Vitest, pruebas de la librería del manifiesto visual, `test:kit`, `kit:check`, `test:world-art` y `build` de producción (`ci.yml:112-118`).
- `e2e`: solo si pasan `scripts`, `backend` y `frontend`; corre matriz API + Playwright con `--grep-invert "@full-case|@orientation"` = 21 pruebas (`ci.yml:126,149`).
- Nocturno `e2e-full-case.yml` (cron 07:00 UTC y manual): `@full-case` (4 viewports) y `@orientation` (9 efectivas) en jobs paralelos con `E2E_TIME_SCALE=4` y 90 min de tope (`e2e-full-case.yml:14,34,56,60,74,96`).
- Dependabot semanal (lunes) para pip, npm, docker, docker-compose y github-actions (`.github/dependabot.yml:7-49`).

**Flujos que cubre el e2e** (`frontend/e2e`): consentimiento previo a medios sensibles, foco atrapado y rechazo sin POST (`consent-gate.e2e.ts:47-111`); caso completo con 6 decisiones recomendadas, refresh, pausa y reanudación, final «integral» y resultado, en 1600x900, 1366x768, 390x844 y 412x915 (`full-case.e2e.ts:28-243`); Axe + geometría en 9 estados por viewport (`vertical-quality.e2e.ts:21-70`); salida segura en cada estado jugable y bajo fundido con servidor lento, en 1366x768 y 844x390 (`safe-exit.e2e.ts:25-36,128-136`); primer minuto y etapa 1 guiada (`guided-first-minute.e2e.ts:46,112`); mundo vivo y diálogo con foco (`living-world.e2e.ts:51-152`); lobby con kit de personajes (`lobby.e2e.ts:26-68`); tipografía autoalojada (`fonts.e2e.ts:17-45`); ausencia del chatbot (`no-chatbot.e2e.ts:29-31`); guardado del editor de mundo contra la API (`world-editor.e2e.ts:5-19`).

### Cómo está construido

- Raíz: `package.json:11-18` (puntos de entrada), `scripts/test-backend.mjs` y `scripts/test-e2e.mjs` (orquestan BD, backend, Angular y Playwright), `scripts/test-runner-support.mjs` y `scripts/dev-environment-guard.mjs` (guardas puras, probadas en `scripts/*.test.mjs`), `docker-compose.test.yml` (Postgres 18 en `tmpfs`, `:13-23`).
- Backend: `backend_django/pytest.ini:6` (`--reuse-db --nomigrations`), `conftest.py` (solo `sys.path`/settings), `psychosim/settings/test.py`, `shared/test_attestation.py`. El esquema y el caso `SIM-VBG-001` los siembra `manage.py bootstrap_dev_db` antes de pytest (`test-backend.mjs:110-123`). Las fixtures (`estudiante`, `cl`, `case_version_id`) viven en módulos de prueba y se importan entre ellos (`test_world_authority.py:20`, `test_reemplazo_vs_salida_segura.py:22-30`).
- Frontend unitario: `angular.json:49-58` (`@angular/build:unit-test`, runner vitest, `isolate`), `tsconfig.spec.json`. 64 de 178 specs leen código fuente o CSS con `readFileSync` (contratos por regex) y 48 usan `TestBed`.
- E2E: `playwright.config.ts` (`workers: 1`, plazos × `E2E_TIME_SCALE`), `e2e/support/siep-flow.ts` (conductor de entrada/mundo), `quality-gates.ts` (Axe + geometría), `required-viewports.ts`, `guided-viewports.ts`, `time-scale.ts`.
- Activos: `frontend/scripts/character-kit/{check,build,measure,coverage}.mjs` y `frontend/scripts/world-art/*.mjs`.

### Reglas que aplica

**Compuertas que hacen fallar el PR**
- Cualquier hallazgo de gitleaks que no esté en 4 regex de `gitleaks.toml:15-23` o 3 huellas de `.gitleaksignore:7,8,11`.
- Cualquier aviso de `pip-audit` (sin umbral de severidad) y avisos `high`/`critical` de `npm audit` (`ci.yml:74,78`).
- Presupuestos de `ng build`: inicial error a 1,4 MB, estilo de componente error a 22 kB (`angular.json:31-32`).
- Axe falla solo con impacto `serious`/`critical` y etiquetas WCAG 2.0/2.1 A y AA (`quality-gates.ts:8-9,78-80`). La geometría falla con desbordamiento horizontal > 2 px, canvas u overlays fuera del viewport o controles de overlay tapados (`quality-gates.ts:102-170`).
- `kit:check`: PNG publicados idénticos a la salida del build, colores dentro de `palette.v2.json`, rampas de 4 tonos decrecientes, medidas del personaje y cobertura de claves del catálogo (`check.mjs:36-117`).
- `test:world-art`: sprites con el tamaño de `WORLD_SPRITES`, alfa binario, ≤ 40 colores, y sin escalas fraccionarias ni constantes antiguas en `src/app` (`world-art.test.mjs:1-17`, `world-scale-code.test.mjs:12-17`).

**Aislamiento del entorno de pruebas**
- `settings.test` exige 6 variables y se niega a arrancar con `DATABASE_URL`, BD llamada `psychosim`, host no loopback o DSN igual al de desarrollo (`settings/test.py:33-74`); la espejea `assessTestDatabaseTarget` (`dev-environment-guard.mjs:164-189`).
- Cada checkout deriva su proyecto Compose por hash de ruta; contraseña y nonce aleatorios por corrida; el runner prueba por labels y volúmenes que el recurso es propio antes de levantar o ejecutar `down --volumes` (`test-runner-support.mjs:23-27,374-394,451-617`).
- Atestación: backend y Angular de prueba devuelven `X-SIEP-Test-Environment: isolated` y el nonce de la corrida; el runner lo verifica antes de correr nada (`shared/test_attestation.py:14-19`, `test-e2e.mjs:123-148`). La matriz API solo acepta `http://127.0.0.1:<puerto>/api`, nunca el puerto 8091 de desarrollo (`test-runner-support.mjs:124-174`).
- Puertos BD/API/web distintos y variables `DATABASE_URL`/`PG*`/`SIEP_TEST_DB_*` filtradas del proceso del frontend (`test-runner-support.mjs:259-286`). Aislamiento por prueba = rollback de `django_db`; `transactional_db` está prohibido (`settings/test.py:9-10`).
- `E2E_TIME_SCALE` debe ser ≥ 1 y solo escala plazos, nunca duraciones físicas del juego (`time-scale.ts:13-28`).

**Reglas de producto que una prueba fija (por ID citado en el código)**
- ETH-01 (nada de media sensible ni mundo antes de aceptar): `consent-gate.e2e.ts:47-74`, `living-world.e2e.ts:76`.
- ETH-02 / REGLA-004 (salida segura = pausa reanudable, siempre alcanzable, un único botón operable, `forceNew` ≠ salida segura): `test_safe_pause.py:1-11`, `test_reemplazo_vs_salida_segura.py:1-14`, `safe-exit.e2e.ts:26-36,65-105`.
- REGLA-005 (versión publicada inmutable; el clon copia cada campo salvo huecos declarados): `test_clone_version_contract.py:1-16`.
- GAME-01 (backend autoritativo del mundo; matriz negativa sin mutación): `test_world_authority.py:1-14`.
- RF-027 (asistente de IA apagado por defecto, 404 con sobre habitual) y su ausencia en la UI: `test_ai_assistant.py:1-9`, `no-chatbot.e2e.ts:29-31`.
- Límite de producto «no revelar la opción adecuada»: opciones solo con id y texto (`test_game.py:508`) y ningún archivo de orientación lee `classification`/`prohibitedConduct` (`no-classification-leak.spec.ts:10,57-69`).
- Contrato modelo ↔ despliegue: los CHECK de `deploy/db_seed.sql` admiten cada valor de los `TextChoices` (`test_deploy_schema_contract.py:31-48`); el script de upgrade corre contra Postgres real (`test_upgrade_attempt_replaced.py:1-11`).
- Datos ya guardados siguen legibles: vectores fijos de `cryptography` y `bcrypt` que no deben regenerarse (`test_dependency_compat.py:1-9`).
- Fronteras de APIs por rol en el frontend (`api-boundaries.contract.spec.ts:23-61`) y portada que solo ofrece como disponible el caso jugable (`landing.honesty.spec.ts:7-34`).
- Matriz API: sin token/token inválido 401; ESTUDIANTE 403 en `/reportes/dashboard`, `/admin/cases` e `/instructor/...`; PROFESOR 403 en `/admin/cases`; ADMIN 200 (`api-e2e.mjs:104-188`).

**Trazabilidad por ID:** los tests citan REGLA-004/005, ETH-01/02, RF-027, ENV-01, AC-1…AC-9 (tabla en `docs/diseno/orientacion-jugabilidad.md:838-852`), GAME-01 y la serie ADSI (P-xx, A-xx, L-xx) en docstrings y comentarios. Ninguna prueba cita RNF-nnn ni RQ-NEG-nnn y no existe matriz requisito→prueba en `docs/requisitos`.

### Límites y deuda conocida

- Sin cobertura medida: no hay `pytest-cov` (`requirements.txt:19-21`) ni opción de cobertura en `angular.json:49-58`; el CI no corre linter ni formateador (no hay configuración de eslint, prettier ni ruff en el repo).
- `psychosim.settings.production` y `manage.py check --deploy` no se ejercitan en ningún test ni job; el `check` del CI usa `settings.base`.
- Sin e2e para docente y admin: `/portal/dashboard`, `grupos`, `reportes`, `docente/trazabilidad`, `rubricas` y `admin/usuarios` (`app.routes.ts:23-89`) solo tienen pruebas HTTP y de componente; los guards `authGuard`/`roleGuard` no tienen spec (`core/auth/auth.guard.ts:6,30`). La matriz API cubre 7 endpoints y solo mira el código de estado.
- AC-11 se cubre a medias: Axe no incluye `wcag22aa` (`quality-gates.ts:8`) y el e2e exige 24 px de objetivo táctil, no 44 (`safe-exit.e2e.ts:38`). AC-4 solo tiene prueba unitaria (`game-help.content.spec.ts:184`); AC-8 es manual.
- El recorrido táctil 844x390 de la etapa 1 está omitido (`guided-first-minute.e2e.ts:117`); el comentario «8 pruebas» de `e2e-full-case.yml:73` está desfasado (son 10, 9 efectivas). `test_completion_report_contract.py:370` salta en silencio si el caso base pierde herramientas.
- Los tests de recorrido completo y orientación no bloquean el PR: un cambio que los rompa se ve a las 02:00 (Colombia). Hay un borrador para correr un viewport en PR sin activar (`docs/pendientes/deudas/e2e-full-case-pr.yml.draft`).
- Pruebas frágiles por diseño: 64 de 178 specs leen archivos del repo (`readFileSync`/`readdirSync`) y afirman por regex sobre el texto (p. ej. `contrast.contract.spec.ts:22-40`), así que fallan por refactor sin cambio de comportamiento; 26 llevan «contract» en el nombre.
- El esquema de prueba sale de `bootstrap_dev_db`, que no replica los CHECK de producción (`test_deploy_schema_contract.py:3-6`); la BD de prueba es Postgres 18 y la de desarrollo Postgres 16 (`docker-compose.test.yml:13`, `docker-compose.yml:11`).
- Dependencia entre módulos de prueba para las fixtures y suposición del caso sembrado `SIM-VBG-001`; los agregados del dashboard son globales (`test_reportes.py:3`).
- Documentación desfasada: `README.md:136,157-163` describe `test:api:e2e` contra `localhost:8091` con `npm run up`, pero `package.json:15` lo ejecuta con stack aislado y el puerto 8091 está vetado; `playwright.config.ts:9` y `docs/PROMPT_MAESTRO.md` hablan de Jest (el runner es Vitest, `angular.json:53`); `test_reportes.py:3` y `test_authoring.py:4` dicen «BD real psychosim»; `validate-premium-visual-assets.mjs` no está en ningún script ni job (`package.json:11` solo prueba su librería).
- La allowlist de gitleaks es global (`[allowlist]`): su regex de slugs en minúscula con guiones silencia cualquier secreto con esa forma, no solo `generic-api-key` (`gitleaks.toml:10-15`).
- Credenciales demo con valores por defecto en `scripts/test-e2e.mjs:156-161` y en los e2e (`E2E_STUDENT_*`, `E2E_ADMIN_*`); Python 3.14 en CI frente al encabezado «3.13» de `requirements.txt:2`.
