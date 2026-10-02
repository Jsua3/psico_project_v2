# SIM-VBG-001 Premium Gameplay Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ejecutar el rediseño premium aprobado de `SIM-VBG-001` mediante seis
planes de subsistema, con lenguaje pixel-art coherente para todo lo visible,
reacciones audiovisuales congruentes y gates ordenados/verificables sin propagar
cambios prematuramente a otros casos.

**Architecture:** El programa separa identidad visual, runtime, presentación,
caso clínico, audio y resiliencia en planes que producen software verde por sí
mismos. Los contratos compartidos se crean una vez y cada plan posterior los
consume; `PremiumVisualManifestV1` gobierna toda imagen visible,
`ConsequenceTone` gobierna la congruencia cuerpo/retrato/audio, Django mantiene
autoridad clínica, Angular la sesión/UI y Phaser el frame/mundo.

**Tech Stack:** Angular 21, TypeScript 5.9, Phaser 3.90, Django REST Framework, PostgreSQL, Howler, Jest, pytest, Playwright, Axe.

---

## Documentos de autoridad

1. Diseño aprobado: `docs/superpowers/specs/2026-07-13-sim-vbg-001-premium-gameplay-design.md`.
2. Este programa para orden y gates.
3. Cada plan de subsistema para pasos ejecutables.
4. Specs anteriores solo cuando no contradigan el diseño aprobado.

## Planes y orden

| Orden | Plan | Resultado demostrable |
|---:|---|---|
| 1 | `2026-07-13-character-manifest-editor-premium.md` | Diez identidades, once visuales NPC y todo mapa/tileset/mueble/interactivo/señal/icono/HUD bajo un único manifest visual validado, cuatro reacciones congruentes, perfil aislado y handoff WYSIWYG inmutable. |
| 2 | `2026-07-13-world-runtime-motion-camera.md` | Angular–Phaser desacoplados, topología global exacta de ocho mapas/diez EXIT, actores `ambientNpcs ∪ PERSON` sin duplicados ni marcadores genéricos, movimiento/cámara/colisión/input lock, puertas transaccionales, reacción actor-ready fail-closed, gamepad estándar, reduced motion y latencia p95 medida. |
| 3 | `2026-07-13-dialogue-hud-liquid-glass.md` | Diálogo cinematográfico, actor state, HUD contextual, Liquid Glass y chatbot ausente. |
| 4 | `2026-07-13-living-case-npc-consequences.md` | Tres rutas clínicas, NPC reactivos, error con reparación y consecuencias persistidas. |
| 5 | `2026-07-13-audio-atmosphere-premium.md` | Mixer único, buses, pasos por superficie, ducking, settings y reduced stimuli. |
| 6 | `2026-07-13-checkpoint-performance-acceptance.md` | Recovery, rendimiento, accesibilidad, gates completos y handoff local al usuario. |

No iniciar un plan si el anterior no tiene sus tests focalizados, build y smoke verdes.

## Contratos compartidos y ownership

| Contrato | Lo crea | Consumidores |
|---|---|---|
| `CharacterManifestV1` | Plan 1 | Editor, lobby, Phaser, retratos, NPC, outcome. |
| `AvatarRenderPlan` | Plan 1 | `GameWorldPort` del plan 2. |
| `ActorRenderPlan` | Plan 1 | Mapper/renderer de NPC del plan 2 y presentación de planes 3/4. |
| `PremiumVisualManifestV1/VisualAssetInventoryV1` | Plan 1 | Validator, editor, los ocho mapas, Phaser, interacciones, HUD y gate humano del plan 6. |
| `ConsequenceTone` | Plan 1 | Reacciones visuales del elenco y consecuencias/audio de planes 4/5. |
| `consequenceReactions` (`relief/steady/tension/rupture`) | Plan 1 | Resolvedor cuerpo/retrato del plan 2, presentación del plan 3 y prueba cruzada de planes 4/5. |
| `clinicalEmotionPortraitStates/resolveNarrativePortraitState` | Plan 1 | Proyección de retratos narrativos del plan 3; emoción desconocida falla cerrada. |
| `ScenePackageV1` | Plan 2 | Editor preview, runtime y validación backend. |
| `SceneExitV1/RoomTransitionRequestV1` | Plan 2 | Puertas, paquete autoritativo y recovery del plan 6. |
| `GameWorldCommand/GameWorldEvent` | Plan 2 | `SimulationPlayComponent`, movimiento, diálogo, NPC, audio y checkpoints. |
| `InputLockState` | Plan 2 | Todos los overlays y beats narrativos. |
| `RoutedMovementFrame/RoutedInputAction/InputLatencyProbe` | Plan 2 | Autoridad única de input, Playwright y gate de latencia. |
| `InputBindingsV1/GameInputRouterService` | Plan 2 | Runtime y diálogo del plan 3. |
| `ActorPresentationState/actor-presentation-ready` | Plan 2 | Diálogo del plan 3 y consecuencias del plan 4. |
| `ClinicalConsequence` | Plan 4 | `SimulationPlayComponent`, NPC, diálogo, debrief y `AudioCue` del plan 5. |
| `AudioCue` y buses | Plan 5 | Mundo, Liquid Glass, diálogo y consecuencias. |
| `CheckpointRequest/CheckpointEnvelope/revision` | Plan 6 | `SimulationPlayComponent`, autoridad backend del mundo y recovery. |

Si un plan descubre que necesita duplicar uno de estos tipos, debe detenerse y extender el contrato propietario con test, no crear una segunda fuente.

`ClinicalConsequence` del plan 4 importa o reexporta el `ConsequenceTone` neutral
del plan 1; nunca vuelve a declarar su unión. Cada beat `react` transporta
literalmente `ClinicalConsequence.tone` hacia `ActorPresentationState`, mientras
los beats ordinarios omiten el campo. El resolvedor no deduce una reacción desde
`emotion`, texto clínico ni un fallback genérico.

El catálogo global `SIM_VBG_001_SCENARIO_ASSET_BY_BACKEND_MAP`, sus cuatro
`ScenarioConfig` versionados y los validadores frontend/backend cubren exactamente
los ocho map keys `hospital-urgencias`, `hospital-sala-escucha`,
`hospital-sala-escucha-accion`, `hospital-sala-escucha-cierre`,
`comisaria-recepcion`, `comisaria-consultorio`,
`comisaria-consultorio-marco` y `comisaria-consultorio-cierre`, con exactamente
diez registros `EXIT` autoritativos en total. Cada `ScenePackageV1` representa
solo el mapa backend cargado y contiene únicamente sus `exits`; nunca replica ni
pretende contener la topología global. Dentro de ese paquete, `actors` es la
unión exacta, sin duplicados, de los `ambientNpcs` de su `ScenarioConfig` más los
`MapObject` `PERSON` de ese mapa. Cada miembro tiene un solo `ActorRenderPlan`
corporal y ningún `PERSON` puede caer en marcador genérico.

`SimulationPlayComponent` queda como composition root Angular y coordinador de
la pantalla, no como una segunda implementación de cada subsistema. Los planes
extraen cálculo de mundo, input, audio y persistencia a sus autoridades
testeables; el componente solo conserva signals de vista, invoca repositorios y
traduce eventos entre contratos. No se crea en paralelo un
`SimulationSessionFacade` con estado duplicado.

## Cobertura trazable del diseño aprobado

| Secciones de la spec | Plan y tasks propietarias | Evidencia bloqueante |
|---|---|---|
| §4–5 Personajes, manifest y WYSIWYG | Plan 1, Tasks 1–11 | Validator que abre PNG/Tiled y falla por antialias, escala fraccionaria, ruta/dimensión rota o regla mecánica fuera de estilo; diez identidades, once visuales NPC, cuatro reacciones, mapas, tilesets, mobiliario, `PERSON/OBJECT/TOOL/EXIT`, señales, prompts, iconos y frames HUD con procedencia/hash; cuatro contact sheets y paridad Playwright a dos viewports. |
| §6 Movimiento, cámara e interacción | Plan 2, Tasks 3–14 | Unitarios deterministas, cien recorridos, topología exacta 8 mapas/10 EXIT, unión de actores sin duplicados/fallback, nueve fuentes de input lock, puertas cover/request/reveal, actor-ready de cuatro tonos, gamepad, remapeo, reduced motion, p95 y capturas runtime. |
| §7 Diálogo, HUD, Liquid Glass y chatbot | Plan 3, Tasks 1–8 | Jest, Axe, dos viewports, teclado/mando/NVDA manual y scans de DOM, bundle y red. |
| §8 Bucle, NPC y consecuencias | Plan 4, Tasks 1–9 | Catálogo de diecinueve opciones, tres rutas E2E, `ClinicalConsequence.tone` intacto en los cuatro tonos, reload sin replay, cero hardlocks y paquete SME. |
| §9 Audio y atmósfera | Plan 5, Tasks 1–8 | Validator de assets, mixer único, fuentes localizadas, cuatro cues de consecuencia congruentes con cuerpo/retrato y soak auditivo de veinte minutos. |
| §10 Autoridades y paquete de escena | Plan 2, Tasks 1–5 y 9–14 | Hash canónico, `sceneInstanceKey`, port tipado, mapper exhaustivo y scans contra storage/API/geometry paralelos. |
| §11 Persistencia y recuperación | Plan 6, Tasks 1–7 | Transacción, revision, receipt/fingerprint, cola durable, writer único, fault injection y recovery E2E. |
| §12 Accesibilidad y rendimiento | Planes 2/3/5 y Plan 6, Tasks 8–10 | Latencia, frame times, Axe, NVDA, reduced motion/stimuli, HAR redactado y soak del equipo de referencia. |
| §13 Pipeline de assets | Plan 1, Tasks 2–5; Plan 5, Task 2 | Inventario completo de todo píxel visible, procedencia/hash, remaster de inconsistencias, generación reproducible, validación automática fail-closed, contact sheets y revisión humana exact-HEAD en movimiento/escucha. |
| §14–15 Rúbrica, gates y evidencia | Plan 6, Tasks 10–13 | `verify:premium`, identidad de commit, manifest de evidencia, partida del usuario y gates humanos no autoaprobables. |

Una fila solo se considera cubierta cuando sus pruebas automáticas y sus gates
humanos aplicables están registrados; la existencia del código no basta.

## Estrategia de ejecución

### Phase 1: Identidad visual verificable

- [ ] Ejecutar todas las tareas del plan 1 con TDD.
- [ ] Confirmar que cada control visible cambia píxeles o fue retirado.
- [ ] Comparar las diez identidades en editor y lobby; registrar hashes para la comparación runtime de Phase 2.
- [ ] Validar los once visuales NPC, catorce mappings y las cuatro reacciones exactas `reactRelief`, `reactSteady`, `reactTension`, `reactRupture` antes de que el runtime los consuma.
- [ ] Inventariar y abrir realmente todos los PNG/Tiled de los ocho mapas, tres tilesets, mobiliario, `PERSON`, `OBJECT`, `TOOL`, `EXIT`, señales/prompts, iconos y frames HUD; bloquear ruta, dimensión, antialias, paleta, escala lógica, procedencia o hash inválidos.
- [ ] Remasterizar cualquier asset inconsistente; un asset existente empieza `unreviewed` y no hereda cumplimiento por estar ya en el repositorio.
- [ ] Generar cuatro contact sheets (`characters`, `npc`, `world-assets`, `hud-assets`) y capturas de editor a 1366×768 y 1600×900.
- [ ] Mantener fuera del lote cualquier asset que no supere revisión humana; los validadores no pueden autoaprobar coherencia visual.

Gate:

```powershell
npm run test:frontend
npm run build:frontend
npm run validate:visual-assets
```

Expected: los tres comandos PASS; ambos manifests, assets y hashes sin drift.

### Phase 2: Runtime y control

- [ ] Ejecutar todas las tareas del plan 2.
- [ ] Probar las nueve fuentes reales de input lock: resume, warning, video, intro, diálogo, journal, settings, outcome y busy.
- [ ] Probar puerta exitosa y fallida: cover antes del único POST, entrada autoritativa, reveal del destino o recuperación exacta del origen.
- [ ] Medir giro de actor y pausa humana; no abrir copy antes de `actor-presentation-ready` entre 100 y 350 ms.
- [ ] Probar teclado y gamepad estándar mediante la misma autoridad de input.
- [ ] Confirmar reduced motion y latencia viva p95 menor o igual a 50 ms.
- [ ] Confirmar que frontend y backend comparten geometría/revisión.
- [ ] Probar la topología global exacta de ocho map keys y diez registros `EXIT`, aunque cada `ScenarioConfig` muestre un subconjunto.
- [ ] Probar que `ScenePackageV1.actors` es la unión exacta y sin duplicados de `ambientNpcs + MapObject PERSON`, con un `ActorRenderPlan` por actor y cero marcadores genéricos.
- [ ] Comparar las diez identidades y sus hashes entre editor, lobby, runtime, retrato y outcome.
- [ ] Resolver `relief`, `steady`, `tension` y `rupture` por catálogo, con cuerpo y retrato congruentes para las diez identidades y once NPC; faltar/mutar el tono debe fallar cerrado.
- [ ] Capturar exploración e interacción `PERSON/OBJECT/TOOL/EXIT` a 1366×768 y 1600×900 antes de continuar con presentación.

Gate:

```powershell
npm run test:backend
npm run test:frontend
npm run build:frontend
```

Expected: PASS y cero recursos de prueba restantes.

### Phase 3: Presentación narrativa

- [ ] Ejecutar todas las tareas del plan 3.
- [ ] Verificar typewriter, foco, NVDA, mando y reduced motion.
- [ ] Confirmar que `app-ai-assistant` no aparece en DOM, bundle ni red.
- [ ] Aprobar capturas Liquid Glass a 1600×900 y 1366×768.

Gate:

```powershell
npm run test:frontend
npm run build:frontend
```

Expected: PASS, Axe serious/critical = 0 en estados cubiertos.

### Phase 4: Caso vivo

- [ ] Ejecutar todas las tareas del plan 4.
- [ ] Completar ruta recomendada.
- [ ] Completar error con reparación.
- [ ] Completar error sin reparación.
- [ ] Probar que cada consecuencia preserva sin traducción uno de los cuatro valores de `ClinicalConsequence.tone` hasta `ActorPresentationState`; una emoción clínica no mapeada bloquea el gate.
- [ ] Generar paquete para revisión SME sin autoaprobarlo.

Gate:

```powershell
npm run test:backend
npm run test:frontend
npm run build:frontend
npm run test:e2e -- premium-routes.e2e.ts --project=chromium --retries=0
```

Expected: PASS; tres desenlaces válidos, cero hardlocks.

### Phase 5: Paisaje sonoro

- [ ] Ejecutar todas las tareas del plan 5.
- [ ] Eliminar reproducción duplicada entre Howler y Phaser.
- [ ] Verificar pasos, ducking, pause/resume y preferencias persistentes.
- [ ] Auditar los cuatro beats de consecuencia mediante el mixer único.
- [ ] Ejecutar, después de existir `AudioCatalog`, una prueba cruzada que recorra los cuatro tonos y los veintiún render plans: cuerpo y retrato deben resolver desde `consequenceReactions`, debe existir exactamente `AUDIO_CATALOG['consequence.' + tone]` y `ClinicalConsequence.tone` debe permanecer idéntico. Cualquier hueco falla cerrado; nunca se usa `unknown → concerned`.

Gate:

```powershell
npm run test:frontend
npm run build:frontend
```

Expected: PASS y smoke de audio sin doble reproducción.

### Phase 6: Recovery y aceptación

- [ ] Ejecutar todas las tareas del plan 6.
- [ ] Validar offline, timeout, 500, reload, pause y resume.
- [ ] Capturar veinte minutos de frame times y audio.
- [ ] Ejecutar suites completas sin filtros.
- [ ] Indexar el mismo `PremiumVisualManifestV1`, las cuatro contact sheets y las capturas editor/exploración/interacción de ambos viewports en el manifest de evidencia del `FINAL_HEAD`.
- [ ] Recoger en un único gate humano exact-HEAD el veredicto visual del dueño; el agente solo valida estructura, hash y completitud, nunca escribe `APROBADO`.
- [ ] Encender el stack y entregar URL local al usuario.

Gate:

```powershell
npm run verify:premium
```

Expected: todos los comandos internos PASS una sola vez, cleanup verificado,
artefactos ligados al mismo commit y manifest con estado
`automated-gates-passed`. Ese estado no sustituye la partida continua del
usuario, NVDA, hardware físico de referencia, los cinco participantes
independientes ni la firma SME.
El índice final falla si faltan `visual-language`, `character-parity`,
`motion-camera`, `dialogue-liquid-glass`, `audio-session` o
`checkpoint-recovery`, o si cualquiera declara un SHA diferente.

## Política de commits y revisión

- Un commit conceptual al terminar cada task.
- Antes de cada commit: test rojo observado, implementación mínima, test verde y refactor.
- No mezclar assets, contratos, comportamiento y documentación sin que la task lo indique.
- No usar `--no-verify`, retries de Playwright ni ampliación de budgets para ocultar fallos.
- Después de cada plan: revisión de conformidad con la spec y revisión de calidad de código.
- Ante defecto live: primero añadir regresión, después corregir.

## Stop conditions

Detener la ejecución y no avanzar de fase si ocurre cualquiera:

- manifest, editor y runtime muestran identidades distintas;
- un asset visible carece de entrada aprobada/procedencia/hash, usa antialias o escala fraccionaria, o un asset `unreviewed` fue autoaprobado;
- aparece un marcador genérico, Material icon, tint o sustituto CSS para `PERSON`, `OBJECT`, `TOOL`, `EXIT`, señal, prompt, icono o frame HUD;
- la topología no contiene exactamente los ocho map keys/diez `EXIT`, o `ScenePackageV1.actors` difiere de la unión sin duplicados `ambientNpcs + PERSON`;
- una reacción no resuelve exactamente `relief|steady|tension|rupture` de forma congruente en cuerpo, retrato y audio, o intenta adivinar desde `emotion`;
- un overlay permite movimiento o requests de posición;
- una puerta pide HTTP antes de cubrir, revela una entrada no autoritativa o deja el input bloqueado tras fallo;
- hay dos fuentes de colisión/NPC activas;
- un diálogo revela la respuesta correcta;
- el chatbot aparece o realiza requests;
- una decisión produce hardlock o pierde estado;
- audio se duplica al pausar/reanudar;
- checkpoint pierde o duplica progreso;
- un test requiere base no aislada;
- aparece P0/P1;
- rendimiento no cumple y el fallback estático tampoco lo corrige.

## Publicación

Este programa termina con un candidato local, no con publicación. Push, merge, deploy y publicación requieren autorización específica después de que el usuario:

1. reciba URL y credenciales;
2. complete una partida continua;
3. evalúe arte, control, diálogo, jugabilidad y sonido;
4. revise las cuatro contact sheets y las capturas de ambos viewports contra el hash exacto de `PremiumVisualManifestV1`;
5. apruebe explícitamente el resultado en el gate humano del mismo `FINAL_HEAD`.

Antes de denominarlo candidato premium también deben pasar NVDA, la revisión
clínica y el soak de veinte minutos a 1366×768 sobre Windows 10/11, cuatro
núcleos físicos, 8 GiB e Intel UHD 620 (o un perfil equivalente versionado y
revisado). La afirmación pública 9/10 requiere además exactamente cinco
participantes y los cortes humanos definidos en la spec; los validadores nunca
autoaprueban ni reescriben esos resultados.
