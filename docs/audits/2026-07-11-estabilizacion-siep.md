# 2026-07-11 — Estabilización crítica de SIEP (6 slices)

- **Rama/HEAD inicial:** `codex/consentimiento-eth01` @ `fbde7c1` (base `f3456ee`); árbol limpio salvo `archivo.md` y `docs/PROMPT-ESTADO-SIEP-2026-07-10.md` (sin trackear, del usuario — intactos al cierre).
- **Rama/HEAD final:** `codex/estabilizacion-siep` @ (ver `git log`); 6 commits locales, sin push.
- **Decisión humana:** ETH-02 → **Opción A (pausa reanudable real)**, confirmada por el usuario en esta sesión.

## Recursos Docker y ownership

- Contenedor ajeno `psychosim-db` (proyecto Compose `psicologia_proyecto`, working dir `D:\Sua_Files\IdeaProjects\psicologia_proyecto`, volumen `psicologia_proyecto_postgres_data`): **verificado intacto** antes y después (estado `running`, mismo volumen). Ninguna acción sobre él.
- Recursos creados por esta tarea: proyecto Compose `psico-project-v3-test` (servicio `db`, `psychosim_test`, datos en **tmpfs**, puerto 5544) — desechable, labels verificados por las guardas antes de cada uso; la limpieza (`npm run test:backend:down`) solo alcanza ese proyecto.
- El compose de desarrollo ahora es el proyecto `psico-project-v3` (sin `container_name` global, puerto configurable `SIEP_DB_PORT`).

## Causa raíz y cierre por slice

1. **Entorno/BD (commit `f7b5906`)** — `container_name: psychosim-db` global + búsqueda por nombre en dev-up podían adoptar la BD de otro checkout, y `settings/test.py` apuntaba la suite a la BD real compartida con `--reuse-db`. Cierre: proyectos Compose explícitos por checkout, resolución vía `compose ps -q db`, guardas puras de ownership/DSN (`dev-environment-guard.mjs`, 14 tests `node --test`), `npm run up` **sin bootstrap automático** (comando explícito protegido `npm run db:bootstrap -- --yes`), BD de test desechable tmpfs con fail-fast anti-coincidencia en `settings/test.py` (`ImproperlyConfigured` ante `psychosim`, DSN de dev, `DATABASE_URL` o host remoto — demostrado).
2. **ETH-01 completo (commit `9f57285`)** — `bootstrapAttempt()` inicializaba audio (Howl `preload:true`), progress map y mundo antes del consentimiento; el HUD se renderizaba tras el modal sin focus trap. Cierre: `startWorld()` diferido e idempotente tras aceptar; layout completo bajo `worldStarted`; focus trap CDK (`cdkTrapFocus` + `cdkFocusInitial`) con fondo NO renderizado; rechazo → catálogo sin mutaciones; 7 tests de integración (rojo demostrado vía stash: 7/7 fallan sin el gate) + `consent-gate.e2e.ts` con red observada. Verificado live: cero requests a `assets/video|assets/game/audio` antes de aceptar.
3. **ETH-02 opción A (commit `e1aa0de`)** — `safe_exit` cerraba el intento (SAFE_EXITED + `ended_at`/`locked_at` + reflexiones bloqueadas) mientras la UI prometía "pausa" y "volver al juego" creaba un intento nuevo. Cierre: estado `PAUSED` sin cierre, endpoint `POST attempts/<id>/resume` (mismo `attemptId`, evento `ATTEMPT_RESUMED`, idempotente), mutaciones bloqueadas en pausa, `forceNew` cierra terminal honesto, PAUSED excluido del score (contador `intentosEnPausa`, estado `EN_PAUSA`), `safeExitUsed` por evento; UI: reanudar el MISMO intento desde prompt y outcome, cierre terminal ofrece "Iniciar un nuevo intento" sin fingir pausa. 12 tests backend nuevos (rojo→verde 10/12) + specs frontend. Sin DDL: solo valores de estado.
4. **GAME-01 (commit `5a010c2`)** — el backend confiaba posición/interacción/herramienta/NPC/puerta del cliente (detalle en el mensaje del commit). Cierre: validación autoritativa 4A–4D + matriz negativa de 22 tests (rojo→verde 13/22) + 13 tests legados actualizados con caminatas plausibles; flush de posición en frontend para la carrera "moverse y pulsar E". Autoridad espacial canónica: `collision_zones` + `map_objects.collision` persistidos (las geometrías Tiled/TS del frontend son de render; incompatibilidades → ver riesgos).
5. **Lobby CAST-01/GAME-09 (commit `12c3790`)** — placeholder geométrico y lista `sr-only` de botones enfocables ocultos. Cierre: identidad real (AvatarStore → `resolveCastId` → hoja horneada, fallback modular compuesto, placeholder solo como último recurso), misma fórmula de pies/flip/ping-pong/reduced-motion, foco inicial + recuperación por click/tap, tap-para-caminar, botón visible "Entrar al caso (E)", navegación única y puerta bloqueada inerte (11 + 3 tests).
6. **E2E aislado (este commit)** — `npm run test:e2e` (`scripts/test-e2e.mjs`): BD desechable verificada por guardas + Django de test en `:8093` (settings.test) + `ng serve` en `:4315` con proxy generado; credenciales sintéticas por entorno (`E2E_STUDENT_*`), artefactos en `frontend/test-results/` (gitignored), `workers: 1` por estado compartido del estudiante sembrado.

## Gates finales (exit codes y conteos frescos)

| Gate | Resultado |
|---|---|
| `npm run test:scripts` | 14/14 pass · exit 0 |
| `npm run check:backend` | sin issues · exit 0 |
| `npm run test:backend` | **211 passed** (BD desechable) · exit 0 |
| `npm run test:frontend` | **46 suites / 286 tests** · exit 0 |
| `npm run build:frontend` | verde, sin warnings de presupuesto · exit 0 |
| `npm run test:api:e2e` | **16/16 PASS** contra el backend aislado (`SIEP_API_BASE=:8093`) · exit 0 |
| `npm run test:e2e` (Playwright, stack aislado) | **11/11 passed** (18.3 s) · exit 0 |

Warnings conocidos que persisten (preexistentes, clasificados): `staticfiles/` ausente en pytest (toolchain), config `ts-jest` obsoleta (deprecation, no bloqueante).

## Evidencia live

- ETH-01 (sesión previa sobre esta base, panel Chromium): consentimiento como únicos controles enfocables, `fondoHabitacion.mp4`/`PsicoLament.mp3` solicitados solo tras aceptar, Escape sin `safe-exit`, rechazo → catálogo sin POSTs; consola 0 errores. Con el gate completo (slice 2) la evidencia de red se re-verificó live en 4310 y quedó automatizada en `consent-gate.e2e.ts`.
- Playwright (stack aislado `:4315`→`:8093`, BD tmpfs, usuarios sintéticos): 11/11 — cero media antes del consentimiento con red observada; foco atrapado en la advertencia; Escape/rechazo sin mutaciones y re-consentimiento al reingresar; lobby con hoja `cast/david.png` cargada (y fallback modular ante castId inválido) sin errores de consola; entrada única por botón visible, por tecla E (DOM) y por tap móvil (390×844); sin controles enfocables ocultos; HUD del caso tras aceptar. Artefactos/screenshots en `frontend/test-results/` (gitignored).
- Recorridos API live contra el backend aislado (BD desechable): teletransporte → 400 · interacción remota → 400 · NPC inventado → 404 · puerta sin clave → 400 · pausa → `PAUSED` sin `ended_at` · mover en pausa → 400 · reanudar → `IN_PROGRESS` con el MISMO `attemptId` · movimiento legítimo → 200 · refresh → posición persistida exacta.
- Durante los runs E2E se descubrió y corrigió en vivo: (a) el login de los e2e llenaba el formulario de REGISTRO (dos formularios en la página); (b) carrera del prompt de reanudación tras `waitForURL`; (c) **GAME-09 confirmado como bug real** — las teclas de Phaser no entran de forma fiable; se añadió la ruta DOM (`keydown.e/enter/space` en el host enfocable) con la guardia de navegación única.
- Capturas del panel con canvas WebGL siguen expirando (limitación del entorno, no de la app): la evidencia visual del gameplay queda en los screenshots/traces de Playwright (`frontend/test-results/`) y en árboles de accesibilidad.

## Capacidades preservadas

12 jugables + 9 NPCs horneados, hojas 384×576/frames 128×192, ping-pong `[1,0,2,0]`, fallback modular, reduced-motion, diagonal normalizada, multi-sala y persistencia (roundtrip de puertas probado), herramientas visibles y ahora aplicables con reglas, bitácora cifrada (roundtrip verificado en tests), separación de roles (matriz API), escalado métrico del mobiliario (no tocado), trazabilidad docente (tests de instructor verdes).

## Riesgos residuales y pendientes

- **Autoridad espacial**: el backend valida contra sus `collision_zones`/objetos; los mapas Tiled/geometrías TS del frontend pueden divergir (colliders visuales sin espejo persistido). Consolidar una traducción formal sigue abierto (GAME-03 de archivo.md).
- **NPCs ambientales**: validación estricta solo donde `ambient_json.ambientNpcKeys` está autorado (seed del caso PDF); mapas legados quedan en modo observación (slug-only). La BD de desarrollo conserva el seed viejo hasta que el usuario decida re-sembrar (`npm run db:bootstrap -- --yes`).
- **Lista sr-only del simulador** (`simulation-play`): los botones de interacción accesibles a distancia ahora reciben 400 del backend por proximidad — conflicto autoridad/a11y a resolver en A11Y-01.
- **Recursos de apoyo** en la advertencia: SME/BLOCKED_EXTERNAL (no se inventan líneas).
- Texto de la advertencia y lenguaje de pausa: pendiente revisión SME (separada de la validación técnica).
- Viewports 1366×768 y 412×915: cobertura automatizada parcial (desktop 1280×720 + móvil 390×844 en Playwright); matriz completa de 4 viewports y Axe quedan para el gate de accesibilidad (A11Y-01).
- La BD de desarrollo del usuario sigue viviendo en el contenedor del proyecto ajeno (puerto 5433). `npm run up` ya no la adopta: fallará con guía (SIEP_DB_PORT o migrar datos). Decisión de migración = del usuario.
- Roadmap general de `archivo.md` (fases 5-8): abierto; esta tarea cerró solo los bloqueadores enumerados.

## Próximo paso recomendado

Decidir la migración de la BD de desarrollo al proyecto Compose propio (`npm run up` + `npm run db:bootstrap -- --yes` con puerto libre) y continuar con A11Y-01 (focus traps globales + Axe + matriz de viewports completa).
