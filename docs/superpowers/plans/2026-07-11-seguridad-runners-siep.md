# SIEP Security and Isolated Runners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los riesgos operativos que impiden puntuar seguridad/reproducibilidad con 9–10: bootstrap remoto, colisiones entre checkouts, PostgreSQL expuesto, teardown inseguro, `shell:true`, API E2E contra desarrollo, tokens en URL y warnings conocidos.

**Architecture:** Las decisiones de seguridad viven en funciones puras de `dev-environment-guard.mjs`; los runners solo orquestan y fallan cerrados. Cada ejecución usa un proyecto Compose derivado del checkout, credencial efímera y teardown verificado. Los GET del intento usan una cabecera dedicada, nunca query strings.

**Tech Stack:** Node.js ESM + `node:test`, Docker Compose, Django/DRF + pytest, Angular HttpClient + Jest, Playwright.

---

## Mapa de archivos

- `scripts/dev-environment-guard.mjs`: identidad por checkout, validación de puertos/targets y construcción de entorno saneado.
- `scripts/dev-environment-guard.test.mjs`: contrato rojo/verde de todas las guardas puras.
- `scripts/db-bootstrap.mjs`: preflight efectivo de Django y ejecución sin `DATABASE_URL`.
- `scripts/test-runner-support.mjs`: ownership pre/post, credencial efímera y teardown reusable.
- `scripts/test-runner-support.test.mjs`: pruebas puras del soporte de runners.
- `scripts/test-backend.mjs`: lifecycle backend en `try/finally`.
- `scripts/test-e2e.mjs`: lifecycle API/UI, CLI local sin shell y modo API.
- `scripts/api-e2e.mjs`: matriz HTTP que exige destino/credenciales/atestación test-only.
- `docker-compose.test.yml`: bind loopback y variables obligatorias.
- `backend_django/shared/test_attestation.py`: middleware cargado solo por settings de test que identifica el backend aislado.
- `backend_django/psychosim/settings/test.py`: cabecera de atestación y middleware de staticfiles deshabilitado en test.
- `frontend/jest.config.js`: única configuración moderna de `ts-jest`.
- `backend_django/apps/simulation/views/game_views.py`: extracción de token desde cabecera y `no-store`.
- `backend_django/apps/simulation/tests/test_game.py`, `test_world.py`, `test_world_authority.py`, `test_caso_pdf.py`: regresiones HTTP del token.
- `frontend/src/app/core/api/simulation.service.ts`: cabecera en cuatro GET.
- `frontend/src/app/core/api/simulation.service.spec.ts`: URLs sin secretos y cabecera correcta.

### Task 1: Guardar bootstrap contra configuración efectiva remota

**Files:**
- Modify: `scripts/dev-environment-guard.mjs`
- Modify: `scripts/dev-environment-guard.test.mjs`
- Modify: `scripts/db-bootstrap.mjs`

- [ ] **Step 1: escribir pruebas rojas para el target de desarrollo**

Añadir import y casos para una API deseada `assessDevelopmentDatabaseTarget({ databaseUrl, expected, effective })`: rechaza `DATABASE_URL`, host no loopback, nombre/usuario distintos y puerto distinto; acepta solo coincidencia local exacta. Añadir también un caso para `buildSanitizedDatabaseEnv(base, expected)` que elimina `DATABASE_URL` y fija `DB_NAME`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`.

```js
test('bootstrap rechaza DATABASE_URL aunque el puerto local coincida', () => {
  const result = assessDevelopmentDatabaseTarget({
    databaseUrl: 'postgresql://remote.invalid/siep',
    expected: { name: 'psychosim', host: '127.0.0.1', port: '5433', user: 'psychosim' },
    effective: { name: 'psychosim', host: '127.0.0.1', port: '5433', user: 'psychosim' },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /DATABASE_URL/);
});

test('entorno saneado elimina DATABASE_URL y fija el DSN validado', () => {
  const env = buildSanitizedDatabaseEnv(
    { DATABASE_URL: 'postgresql://remote.invalid/siep', OTHER: 'kept' },
    { name: 'psychosim', host: '127.0.0.1', port: '5433', user: 'psychosim', password: 'secret' },
  );
  assert.equal('DATABASE_URL' in env, false);
  assert.deepEqual(
    [env.DB_NAME, env.DB_HOST, env.DB_PORT, env.DB_USER, env.DB_PASSWORD, env.OTHER],
    ['psychosim', '127.0.0.1', '5433', 'psychosim', 'secret', 'kept'],
  );
});
```

- [ ] **Step 2: verificar rojo**

Run: `npm run test:scripts`  
Expected: FAIL porque las dos funciones aún no se exportan.

- [ ] **Step 3: implementar la guarda mínima y usarla en bootstrap**

La guarda debe normalizar `localhost` a un host local aceptado, comparar strings sin imprimir contraseña y devolver `{ok, reason}`. `db-bootstrap.mjs` construirá `expected` desde `DB_*`/defaults, rechazará inmediatamente `process.env.DATABASE_URL`, comprobará el puerto publicado y ejecutará un preflight Django con el entorno saneado:

```js
const probe = spawnSync(venvPython(), ['manage.py', 'shell', '-c',
  "import json; from django.db import connection; s=connection.settings_dict; print(json.dumps({k:str(s.get(k,'')) for k in ('NAME','HOST','PORT','USER')}))"],
  { cwd: BACKEND, encoding: 'utf8', stdio: 'pipe', env: childEnv },
);
```

Parsear únicamente la última línea JSON, validarla con `assessDevelopmentDatabaseTarget` y solo después ejecutar `bootstrap_dev_db` con el mismo `childEnv`.

- [ ] **Step 4: verificar verde**

Run: `npm run test:scripts`  
Expected: todos los tests PASS, sin warnings.

- [ ] **Step 5: commit**

```powershell
git add scripts/dev-environment-guard.mjs scripts/dev-environment-guard.test.mjs scripts/db-bootstrap.mjs
git commit -m "fix(dev): cerrar bootstrap sobre bases remotas"
```

### Task 2: Aislar recursos por checkout y hacer teardown fail-closed

**Files:**
- Create: `scripts/test-runner-support.mjs`
- Create: `scripts/test-runner-support.test.mjs`
- Modify: `scripts/dev-environment-guard.mjs`
- Modify: `scripts/dev-environment-guard.test.mjs`
- Modify: `scripts/test-backend.mjs`
- Modify: `scripts/test-e2e.mjs`
- Modify: `docker-compose.test.yml`

- [ ] **Step 1: escribir pruebas rojas de identidad, puerto, secreto y lifecycle**

Definir la API deseada:

```js
const a = deriveTestComposeProject('D:/repo/main');
const b = deriveTestComposeProject('D:/repo/worktree');
assert.match(a, /^psico-project-v3-test-[a-f0-9]{10}$/);
assert.notEqual(a, b);
assert.equal(parseLoopbackPort('5544', 'SIEP_TEST_DB_PORT'), 5544);
assert.throws(() => parseLoopbackPort('5544 & whoami', 'SIEP_TEST_DB_PORT'));
assert.ok(createEphemeralPassword().length >= 32);
assert.notEqual(createEphemeralPassword(), createEphemeralPassword());
```

En `test-runner-support.test.mjs`, inyectar un adapter falso y demostrar que `withOwnedTestDatabase` llama `up → inspect → work → inspect → down`, que llama `down` también cuando `work` lanza, y que no llama `down` si la inspección final no prueba ownership.

- [ ] **Step 2: verificar rojo**

Run: `npm run test:scripts`  
Expected: FAIL por exports/módulo inexistentes.

- [ ] **Step 3: implementar soporte reusable**

`deriveTestComposeProject` usará SHA-256 de la ruta normalizada, diez hexadecimales y prefijo estable. `parseLoopbackPort` aceptará solo enteros 1024–65535. `createEphemeralPassword` usará `randomBytes(32).toString('base64url')`.

`withOwnedTestDatabase({root, project, composeEnv, run, work})` debe:

1. inspeccionar cualquier contenedor preexistente antes de `up`;
2. ejecutar Compose con `-p project` y `composeEnv`;
3. volver a verificar labels/mounts;
4. ejecutar `work`;
5. en `finally`, volver a verificar y solo entonces `down --volumes`;
6. propagar el código/error original y un error de cleanup si existe.

No usar `process.exit` dentro del lifecycle; retornar/lanzar y asignar `process.exitCode` en el borde.

- [ ] **Step 4: endurecer Compose**

```yaml
environment:
  POSTGRES_DB: ${SIEP_TEST_DB_NAME:?SIEP_TEST_DB_NAME requerido}
  POSTGRES_USER: ${SIEP_TEST_DB_USER:?SIEP_TEST_DB_USER requerido}
  POSTGRES_PASSWORD: ${SIEP_TEST_DB_PASSWORD:?SIEP_TEST_DB_PASSWORD requerido}
ports:
  - "127.0.0.1:${SIEP_TEST_DB_PORT:?SIEP_TEST_DB_PORT requerido}:5432"
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
```

Ambos runners pasarán la contraseña efímera a Compose y Django, usarán el proyecto derivado y envolverán bootstrap/tests en `withOwnedTestDatabase`.

- [ ] **Step 5: verificar verde y ausencia de residuos**

Run: `npm run test:scripts`  
Expected: PASS.

Run: `npm run test:backend -- apps/users/tests/test_auth.py -q`  
Expected: PASS y mensaje de cleanup.

Run: `docker ps -aq --filter "label=com.docker.compose.project=$(node -e \"import('./scripts/dev-environment-guard.mjs').then(m=>console.log(m.deriveTestComposeProject(process.cwd())))\")"`  
Expected: salida vacía.

- [ ] **Step 6: commit**

```powershell
git add scripts/test-runner-support.mjs scripts/test-runner-support.test.mjs scripts/dev-environment-guard.mjs scripts/dev-environment-guard.test.mjs scripts/test-backend.mjs scripts/test-e2e.mjs docker-compose.test.yml
git commit -m "fix(test): aislar y limpiar recursos por checkout"
```

### Task 3: Ejecutar Angular, Playwright y matriz API sin shell ni destinos implícitos

**Files:**
- Modify: `scripts/test-e2e.mjs`
- Modify: `scripts/api-e2e.mjs`
- Modify: `scripts/test-runner-support.mjs`
- Modify: `scripts/test-runner-support.test.mjs`
- Modify: `package.json`
- Create: `backend_django/shared/test_attestation.py`
- Modify: `backend_django/psychosim/settings/test.py`

- [ ] **Step 1: escribir pruebas rojas para comandos y destino API**

Añadir helpers puros:

```js
assert.deepEqual(buildAngularCommand({ node: 'node', cli: 'ng.js', port: 4315, proxy: 'proxy.json' }), {
  command: 'node',
  args: ['ng.js', 'serve', '--host', '127.0.0.1', '--port', '4315', '--proxy-config', 'proxy.json'],
});
assert.deepEqual(buildPlaywrightCommand({ node: 'node', cli: 'cli.js', extraArgs: ['--grep', 'consent'] }).args,
  ['cli.js', 'test', '--grep', 'consent']);
assert.equal(assessApiE2ETarget({ url: 'http://127.0.0.1:8093/api', attested: true }).ok, true);
assert.equal(assessApiE2ETarget({ url: 'http://localhost:8091/api', attested: false }).ok, false);
assert.equal(assessApiE2ETarget({ url: 'https://prod.example/api', attested: true }).ok, false);
```

- [ ] **Step 2: verificar rojo**

Run: `npm run test:scripts`  
Expected: FAIL porque los builders/guarda no existen.

- [ ] **Step 3: implementar invocación local sin shell**

Resolver `frontend/node_modules/@angular/cli/bin/ng.js` y `frontend/node_modules/@playwright/test/cli.js`; ejecutar ambos con `process.execPath`, arrays de argumentos y `shell:false`. No usar el script npm `start`, evitando flags duplicados.

Crear un middleware mínimo que añada `X-SIEP-Test-Environment: isolated` a todas las respuestas y cargarlo únicamente desde `settings/test.py`. `test-e2e.mjs` validará la cabecera de `/api/auth/me` antes de enviar credenciales. `api-e2e.mjs` exigirá `SIEP_API_BASE`, `SIEP_API_TEST_ATTESTATION=isolated` y credenciales por entorno, sin defaults. La invocación normal será realizada por `test-e2e.mjs --api`, que provee todos esos valores dentro del stack aislado.

```python
class TestEnvironmentAttestationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["X-SIEP-Test-Environment"] = "isolated"
        return response
```

- [ ] **Step 4: verificar verde y ausencia de warning DEP0190**

Run: `npm run test:e2e -- --grep "consentimiento"`  
Expected: PASS; salida sin `DEP0190`, sin opciones duplicadas y cleanup final.

Run: `npm run test:api:e2e`  
Expected: FAIL antes de hacer red, explicando que debe ejecutarse mediante el runner aislado.

- [ ] **Step 5: commit**

```powershell
git add scripts/test-e2e.mjs scripts/api-e2e.mjs scripts/test-runner-support.mjs scripts/test-runner-support.test.mjs backend_django/shared/test_attestation.py backend_django/psychosim/settings/test.py package.json
git commit -m "fix(test): cerrar comandos y destinos e2e"
```

### Task 4: Sacar tokens de intento de URLs y caches

**Files:**
- Modify: `backend_django/apps/simulation/views/game_views.py`
- Modify: `backend_django/apps/simulation/tests/test_game.py`
- Modify: `backend_django/apps/simulation/tests/test_world.py`
- Modify: `backend_django/apps/simulation/tests/test_world_authority.py`
- Modify: `backend_django/apps/simulation/tests/test_caso_pdf.py`
- Modify: `frontend/src/app/core/api/simulation.service.ts`
- Create: `frontend/src/app/core/api/simulation.service.spec.ts`

- [ ] **Step 1: escribir pruebas rojas backend**

Crear helper de test `attempt_headers(token) -> {"HTTP_X_SIEP_ATTEMPT_TOKEN": token}`. Para cada endpoint GET protegido, afirmar: header válido = 200; token solo en query = 403; respuesta válida contiene `Cache-Control: no-store`.

```python
response = client.get(
    f"/api/simulation/attempts/{attempt_id}/world",
    HTTP_X_SIEP_ATTEMPT_TOKEN=token,
)
assert response.status_code == 200
assert response["Cache-Control"] == "no-store"

query_only = client.get(
    f"/api/simulation/attempts/{attempt_id}/world",
    {"attemptToken": token},
)
assert query_only.status_code == 403
```

- [ ] **Step 2: verificar rojo backend**

Run: `npm run test:backend -- apps/simulation/tests/test_game.py apps/simulation/tests/test_world.py -q`  
Expected: FAIL porque el header no se lee y la query todavía autentica.

- [ ] **Step 3: escribir prueba roja frontend**

Usar `provideHttpClient()` y `provideHttpClientTesting()`. Para `getAttempt`, `getProgressMap`, `getWorld` y `getCompletionReport`, `expectOne` debe recibir una URL sin `?`, y `request.headers.get('X-SIEP-Attempt-Token')` debe igualar el token sintético.

- [ ] **Step 4: verificar rojo frontend**

Run: `npm test --prefix frontend -- --runInBand src/app/core/api/simulation.service.spec.ts`  
Expected: FAIL porque las URLs aún contienen `attemptToken` y falta la cabecera.

- [ ] **Step 5: implementar contrato de cabecera**

En backend:

```python
ATTEMPT_TOKEN_HEADER = "X-SIEP-Attempt-Token"

def _attempt_token(request):
    return request.headers.get(ATTEMPT_TOKEN_HEADER)

def _private_ok(data):
    response = api_ok(data)
    response["Cache-Control"] = "no-store"
    return response
```

Usar ambos helpers en los cuatro GET y eliminar lectura de `query_params`. En Angular, importar `HttpHeaders`, crear `attemptOptions(token)` y usarlo en los cuatro GET. Actualizar todos los GET de tests existentes a header; no cambiar POST bodies en este slice.

- [ ] **Step 6: verificar verde**

Run: `npm run test:backend -- apps/simulation/tests/test_game.py apps/simulation/tests/test_world.py apps/simulation/tests/test_world_authority.py apps/simulation/tests/test_caso_pdf.py -q`  
Expected: PASS.

Run: `npm test --prefix frontend -- --runInBand src/app/core/api/simulation.service.spec.ts`  
Expected: PASS.

- [ ] **Step 7: commit**

```powershell
git add backend_django/apps/simulation/views/game_views.py backend_django/apps/simulation/tests/test_game.py backend_django/apps/simulation/tests/test_world.py backend_django/apps/simulation/tests/test_world_authority.py backend_django/apps/simulation/tests/test_caso_pdf.py frontend/src/app/core/api/simulation.service.ts frontend/src/app/core/api/simulation.service.spec.ts
git commit -m "fix(security): sacar tokens de intento de las URLs"
```

### Task 5: Eliminar warnings conocidos del toolchain

**Files:**
- Modify: `frontend/jest.config.js`
- Modify: `backend_django/psychosim/settings/test.py`

- [ ] **Step 1: capturar evidencia roja**

Run: `npm run test:frontend`  
Expected: PASS con warning de configuración `ts-jest` en `globals`.

Run: `npm run test:backend -- apps/users/tests/test_auth.py -q`  
Expected: PASS con warning `No directory at .../staticfiles`.

- [ ] **Step 2: aplicar cambio mínimo de configuración**

Eliminar por completo `globals['ts-jest']` de Jest, porque la configuración ya vive en `transform`. En `settings/test.py`, remover de `MIDDLEWARE` únicamente la entrada `whitenoise.middleware.WhiteNoiseMiddleware`; producción mantiene WhiteNoise.

- [ ] **Step 3: verificar salida limpia**

Run: `npm run test:frontend`  
Expected: 46 suites / 286+ tests PASS, sin warning ts-jest.

Run: `npm run test:backend -- apps/users/tests/test_auth.py -q`  
Expected: PASS, sin warnings staticfiles.

- [ ] **Step 4: commit**

```powershell
git add frontend/jest.config.js backend_django/psychosim/settings/test.py
git commit -m "chore(test): limpiar warnings del toolchain"
```

### Task 6: Regresión integral y evidencia SEC-RUN-01/SEC-TOKEN-01

**Files:**
- Modify: `docs/audits/2026-07-11-estabilizacion-siep.md`
- Create: `docs/audits/2026-07-11-calidad-9-10-evidencia.md`

- [ ] **Step 1: ejecutar gates completos**

Run, en este orden:

```powershell
npm run test:scripts
npm run check:backend
npm run test:backend
npm run test:frontend
npm run build:frontend
npm run test:e2e
```

Expected: todos código 0, sin warnings conocidos, y el runner E2E ejecuta también la matriz API aislada.

- [ ] **Step 2: demostrar cleanup y no exposición**

Comprobar que puertos 5544/8093/4315 están libres, que no hay contenedores con el proyecto derivado y que una búsqueda de artefactos/logs no contiene la clave literal `attemptToken=`. No imprimir valores de tokens.

- [ ] **Step 3: documentar resultados reales**

Registrar fecha, SHA, comandos, conteos, códigos de salida, ausencia de residuos y cualquier limitación real. Corregir en la auditoría anterior la afirmación obsoleta de que el contenedor queda activo hasta `test:backend:down`.

- [ ] **Step 4: commit**

```powershell
git add docs/audits/2026-07-11-estabilizacion-siep.md docs/audits/2026-07-11-calidad-9-10-evidencia.md
git commit -m "docs(audit): registrar cierre de seguridad y runners"
```
