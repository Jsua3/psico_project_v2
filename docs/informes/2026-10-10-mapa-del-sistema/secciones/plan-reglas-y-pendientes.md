## Plan maestro, reglas del proyecto y pendientes

`docs/PLAN_MAESTRO_TOTAL.md` (v1.0, 2026-06-07) fija 12 «reglas de oro» (líneas 27-41) y los bloques de trabajo A-L; `docs/informes/` mide el plan contra el código y `docs/pendientes/` guarda lo que quedó sin decidir o sin hacer. Es documentación, no una función del sistema: esta sección dice qué cumple el código hoy. El plan cita Django 5.1, Angular 21, Phaser 3 y un backend Spring «congelado» (`docs/PROMPT_MAESTRO.md:7` lo avisa); manda el código (Django 6.1.1, Angular 22.2, Phaser 4.2.1: `backend_django/requirements.txt:3`, `frontend/package.json:28,37`).

### Qué hace hoy

Estado de los bloques. Medición oficial: `master` @ `0f930b1`, 2026-10-02, con dos actualizaciones del 03 y 04 (`docs/informes/2026-10-02-brechas-plan-maestro-total.md:18-95`); contrastada otra vez con el código.

| Bloque | Estado hoy | Evidencia |
|---|---|---|
| A Audio adaptativo | Parcial: 1 de 4 capas (`ambient` = `Musica_PsicoGame.mp3`), piso 0,6 mientras sea la única, SFX del pack Kenney; sin `tension`, `resolution` ni `crisis` | `frontend/src/app/features/simulator/audio-director.service.ts:31,79-84,103-113`; `frontend/src/assets/audio/{music,sfx}/` solo `.gitkeep` |
| B Viñeta y game feel | Hecho con Graphics, no `PostFXPipeline`: viñeta desde estrés > 60, pulso 0,55→0,85 en 800 ms desde ≥ 85, destello 0,20 en 120 ms, sacudida 0,003/200 ms (riesgosa) y 0,006/260 ms (prohibida); apagado con movimiento reducido | `frontend/src/app/features/simulator/game-feel.util.ts:10-76`; `stress-tier.util.ts:15` |
| C Diálogo-síntoma | Parcial: solo retrato por emoción (13 claves → 4 estados `neutral/preocupada/triste/alegre`; sin sonrisa en Abuela, Sobreviviente y madre). No hay `DialogueEmotion`, `wobble`, `glitch` ni QTE | `frontend/src/app/features/simulator/portrait-resolver.util.ts:20,29-37`; `frontend/src/assets/characters/kit/kit.json` (`emotionToPortrait`) |
| D Avatar | Hecho por otra vía: kit de personajes por código, `AvatarStore` en `localStorage` | `frontend/src/app/features/character/avatar.store.ts:6`; `game-world.component.ts:299` |
| E Social Mapping | No existe (0 coincidencias de `social-map`, `SocialNode`, `socialMap` en `frontend/src` y `backend_django`) | — |
| F Verbal Tension Box | No existe (0 coincidencias de `verbalTension`, `VERBAL_TENSION`) | — |
| G RF-027 asistente IA | Parcial: `POST /api/simulation/ai-assistant` apagado por defecto (404), sin pantalla que lo use; la ayuda del juego es curada y sin IA | `backend_django/apps/simulation/views/ai_assistant.py:33-34`; `apps/simulation/urls.py:47`; `frontend/e2e/no-chatbot.e2e.ts:31` |
| H WCAG | Parcial: enlaces de salto, axe (`wcag2a/2aa/21a/21aa`) en las puertas e2e, salida segura en cada estado; faltan T11 (atajo `J`), T13, T14, T15 (`wcag22aa`) | `frontend/src/app/app.component.ts:13-15`; `frontend/e2e/support/quality-gates.ts:8`; `simulation-play.component.ts:1714` |
| I CI | Hecho distinto: `ci.yml` (gitleaks, scripts, pip-audit/npm audit, backend, frontend, e2e) y nocturno `e2e-full-case.yml` (cron 07:00 UTC, `full-case` y `orientation`) | `.github/workflows/ci.yml:24-157`; `.github/workflows/e2e-full-case.yml:14` |
| J Escenarios | Parcial: un solo caso (`SIM-VBG-001`); no hay modelo `scenarioseed` ni fixture; las salas se pintan con renderers, no con Tiled | `backend_django/apps/simulation/management/commands/seed_caso_pdf.py`; `services/case_effects.py:51,173` |
| K Landing y onboarding | Hecho: la ruta `''` carga `LandingComponent`; tarjeta de primera vez y «Cómo se juega» con memoria `siep.ayuda.v1` | `frontend/src/app/app.routes.ts:6-9`; `simulator/help-memory.util.ts:8` |
| L Seguridad | Hecho con riesgos: `.env*`, `*.pem`, `*.key`, `secrets/` ignorados, `.env.example`, gitleaks, `DEBUG=False`; repo privado no verificable desde el código | `.gitignore:13-20`; `backend_django/psychosim/settings/production.py:21,56-64` |

Los 10 bloques visuales del plan no existen con sus rutas: `frontend/src/assets/` no tiene `tilesets/`, `portraits/` ni `sprites/avatar/`; el arte salió de `tools/` y de renderers por código (`docs/informes/2026-10-03-bloques-visuales-auditoria.md`).

Propuestas para la BETA (`docs/pendientes/propuestas/`, 2026-10-03, nada implementado; el contenido clínico lo redacta y valida Psicología):

| Bloque | Recomendación | Decisiones que bloquean (valor por defecto) | Esfuerzo orientativo |
|---|---|---|---|
| C | «Señal sobria»: 7 emociones canónicas, 3 perfiles de ritmo, sin color, temblor, glitch ni cuenta atrás | P1 tres estilos agitada/afligida/aliviada (sí); P2 sin etiqueta de emoción; P9 alias aprobados; P5 ventana de contención (no) | 6,5-12 d (F0-F2) |
| E | Ecomapa guiado, lista primero, 4 etiquetas, sin «afinidad» ni puntos, 6 vínculos | P1 mapa guiado solo lectura; P3 la niña no aparece; P4 la persona agresora no aparece; P5 «Familia que pide perdonar» | 12-21 d + 2-4 d Psicología |
| F | Entrevista por turnos de 2-4 intercambios en M1 y M9, 4 niveles con texto, sin tiempo, formativa | P1 por turnos; P2 tono sobrio; P3 sin reloj; P4 definición; P5 Psicología escribe M1 y M9 | 20-31 d + 11-17 d Psicología |
| G | Ayuda curada (30-50 entradas) para estudiante y docente; IA opcional solo tras decidir y con concepto jurídico (Ley 1581/2012) | G-P1 reinterpretar RF-027; G-P2 sin IA sin concepto escrito; G-P3 tras decidir; G-P11 topes 10 por intento y 30 por día | 22,5-38 d + 14-22 d Psicología |
| J | Consultorio de primera escucha como 2.º caso, independiente, sin menores ni agresor; antes generalizar finales, métricas, aviso e introducción | 14 preguntas a Psicología (p. ej. escenario A, jugar después de `SIM-VBG-001`, métricas propias); 12 a Ingeniería | Ing. 20-37 d, Arte 5-16 d, Psic. 29-52 h |

C, E y F comparten una Fase 0 de 6-10 d y suman 44,5-74 d (`docs/pendientes/propuestas/propuestas-c-e-f-resumen.md:33-47`). Su pieza 0a (movimiento reducido en el panel: `dialogue-panel.component.ts:543`) y 0b (botón único de salida segura: `safe-exit-button.component.ts`) ya están; 0c, 0d y 0e no.

Deudas y backlog (`docs/pendientes/deudas/`): el backlog de orientación T0-T15 está ejecutado casi todo; sin hacer: T9.12 decisión en dos tiempos, reintentos en informe de grupo y CSV (L-02), H-T11/T13/T15, T14.5 caso completo en cada PR (borrador inactivo `e2e-full-case-pr.yml.draft`), T15.2, T15.3 y T15.5. Las 18 preguntas del backlog (§5) y las 13 del informe de jugabilidad (`docs/informes/2026-10-04-informe-sesion-jugabilidad.md:79-93`) llevan valor por defecto ya aplicado (reintentos no cuentan como decisiones, sacudida se mantiene, portada dice «Próximamente»). Los dos documentos de «pendientes de UI» (2026-09-29) listan menores sin plan: Esc por capas, carga sin «Reintentar», avisos sobre controles táctiles.

### Cómo está construido

- **Reglas en backend** (`backend_django/apps/simulation/services/`): `game_service.py` (intentos, segunda oportunidad, pausa), `attempt_lifecycle.py` (máquina de estados), `decision_effects.py` y `case_effects.py` (efectos, 19 `OPTION_EFFECTS`, 4 finales), `door_chain.py` (puertas), `world_validation.py`, `authoring/{guards,publication,world_definition}.py`, `audit_service.py`, `crypto_service.py`; permisos en `backend_django/shared/permissions.py:10-27`.
- **Reglas en frontend** (`frontend/src/app/features/simulator/`): `simulation-play.component.ts` (consentimiento, Esc, pausa en cola), `game-world.component.ts` (Phaser), `orientation.config.ts:128-135` (`NAME_TOOLS_IN_HINTS=false`, `HIGHLIGHT_TOOL_TARGETS=true`, `SAFE_EXIT_ALWAYS_REACHABLE=true`), `stress-tier.util.ts` (umbrales únicos 30/60/85), `intro-gate.util.ts`.
- **Esquema y despliegue**: `deploy/db_seed.sql` (41 tablas, 6 CHECK), `deploy/upgrades/` (3 scripts idempotentes), `Dockerfile` + `railway.json` (imagen única), `.github/dependabot.yml`.
- **Catálogo de requisitos** (`docs/requisitos/`, 8 RQ-NEG + 1 RF + 10 RNF + 8 técnicas, todos «Propuesto»; 4 CSV):

| ID | Pide (meta) | Cobertura hoy |
|---|---|---|
| RQ-NEG-001 (Alta) | Simulación multi-caso, mejora ≥15 % pre/post | Un caso publicado; no hay medición pre/post |
| RQ-NEG-002 (Alta) | Competencias transferibles, ≥80 % «Aceptable» | `competency` es texto libre (`models/rubric.py`); no hay modelo de competencias |
| RQ-NEG-003 (Alta) | Enfoque ético, −20 % decisiones no recomendadas del intento 1 al 2 | ETH-01/02, segunda oportunidad, bitácora cifrada; no se mide el intento 1 vs 2 |
| RQ-NEG-004 (Media) | Práctica y reflexión, ≥85 % satisfacción | Bitácora y supervisión; no hay encuesta en la app |
| RQ-NEG-005 (Alta) | Evaluación por rúbricas, ≥90 % con desglose | `rubric_service.py` y traza docente; evaluación manual |
| RQ-NEG-006 (Media) | Reportes por grupo/estudiante en ≤3 clics | `apps/reportes` con CSV; los clics no se miden |
| RQ-NEG-007 (Media) | Variante en ≤4 h reutilizando ≥60 % | `clone_version` y editor; un 2.º caso exige generalizar (bloque J) |
| RQ-NEG-008 (Alta) | Checklist ≥95 % y aprobaciones por rol | Checklist de 6 ítems al 100 % y solo `ADMIN` publica; no hay aprobación por rol; `IN_REVIEW` no tiene transición |
| RF-027 (Alta) | Asistente IA para estudiante y docente | Bloque G: solo backend, apagado, solo estudiante (`ai_assistant.py:51`) |
| RNF-001/004/010 | Usabilidad n≥10, WCAG 2.1 AA, ética con salida segura en todas las fases | Onboarding y salida segura hechos; informes miden 2.2 AA; sin prueba n≥10 ni NVDA/VoiceOver |
| RNF-002/003/007 | Acceso por rol, bitácoras fuera de agregados, auditoría ≥12 meses | `IsAdmin`/`IsProfesor`; reportes solo cuentan bitácoras (`reportes/services.py:72-75`); retención 360 d |
| RNF-005/006/009 | p95 ≤2 s, ≥99,5 % disponible, ≥3× concurrencia | Sin pruebas de carga ni medición en el repo |
| RNF-008 | ≥80 % de ajustes sin despliegue | Editor de casos; efectos, métricas, finales y aviso siguen en código |

- **Técnicas de elicitación** (8): análisis del caso, análisis documental de la guía, encuesta a estudiantes, entrevista a docentes, prototipado de escenarios, revisión con ingeniería, revisión normativa y ética, taller de validación de decisiones.
- **Decisiones de arquitectura** (`docs/arquitectura/estrategia-stack-esquema-y-despliegue.md:15-24`): D1 quedarse en Django (Laravel descartado), D2 Django dueño del esquema, D4 Hetzner, D5 panel generado aplazado, D6 Django 6.2 LTS en abril 2027; D3 (actualizar) está hecha en master.

### Reglas que aplica

| Regla del plan | Qué hace el código hoy |
|---|---|
| 001 No tocar `backend/` (Spring) | Sin objeto: no hay `backend/` en la raíz; quedan ~72 menciones a Spring/Flyway en comentarios |
| 002 Sin migraciones Django (`managed=False`) | Rota en la práctica: 25 modelos `managed=False`, pero `progression/models.py:19` y `users/models.py:111-125` son gestionados (`users/migrations/0002_accessrequest.py`) y dos tablas nacen por `RunSQL` (`simulation/migrations/0003_rubric_management.py:10-56`, `grupos/migrations/0002_grupo_case_version.py:11-22`) |
| 003 `ScenarioConfig` coexiste con lo BD-driven | Cumplida: el mundo viene de la BD y se le superpone `assets/game/scenarios/<clave>.json` (`frontend/src/app/core/api/simulation.service.ts:68-70`) |
| 004 Salida segura siempre alcanzable | Cumplida: `safe_exit` deja `PAUSED`, reanudable e idempotente (`game_service.py:453-467`); botón en introducción, contexto, diálogo, supervisión y bitácora; Esc encadena ayuda→bitácora→diálogo→pausa (`simulation-play.component.ts:1691-1698`); pausa en cola con plazo de 10 s (`:99`); bajo ETH-01 Esc no pausa (`:1660-1665`); `REPLACED` no es salida segura (`game_service.py:142-157`) |
| 005 `PUBLISHED` no se muta | Cumplida en la API: `ensure_draft` (`authoring/guards.py:28-36`), `publish` (`publication.py:61-66`), `clone_version` (`:89-111`); la rompe `seed_caso_pdf.py:1137-1176`, que reescribe una versión publicada y borra sus intentos |
| 006 `audit_logs` no interrumpen, vía señales | Efecto cumplido, mecanismo distinto: `@auditable` y `append` tragan toda excepción (`audit_service.py:68-106`); `signals.py:18` solo define `attempt_completed` |
| 007 Repo privado | No verificable en código; privado desde 2026-09-29 según el informe de brechas (línea 33); gitleaks en `ci.yml:24-47` |
| 008 Avatar solo en `localStorage` | Cumplida: `psychosim_avatar` (`avatar.store.ts:6`); el backend no tiene campo de avatar |
| 009 Phaser `pixelArt`, `roundPixels`, zoom 2× | `pixelArt` y `roundPixels` sí (`game-world.component.ts:2808-2809`); el zoom es el mayor entero que muestre ≥75 % de la sala (`pixel-scale.util.ts:31-38`) |
| 010 CSS del juego dentro de `.game-container` | Aproximada: CSS encapsulado de `simulation-play.component.ts:121,485` y reglas globales `body.game-mode` (`frontend/src/styles/styles.scss:761-807`) |
| 011 Bloqueo optimista con `version`, 409 | Nominal: solo `save_world` compara `revision` y lanza 409 (`world_definition.py:118-120`), pero nada incrementa `version` (`:152-153`; 0 incrementos en `apps/`) |
| 012 Publicar solo con la validación del mundo limpia | Cumplida: checklist de 6 ítems al 100 % y 0 errores (`publication.py:38-43,68-80`); 14 códigos de error y 1 aviso (`world_validation.py:54-208`); `NO_SAFE_EXIT` acepta cualquier objeto `EXIT` (`world_definition.py:308`) |

Otras reglas que el código impone: la primera respuesta riesgosa o inadecuada se reintenta sin efectos y la segunda cuenta (`game_service.py:361-384`); conducta prohibida suma +40 estrés, −20 confianza, +15 riesgo (`decision_effects.py:9-11`); antes de decidir solo viajan `id` y `text` (`game_dtos.py:47-54`); el final solo cuenta decisiones registradas (`case_effects.py:29,298-301`); puertas en cadena existe→destino→cerca→inspeccionado→herramientas→nodo→NPC (`door_chain.py:122-134`); el estudiante solo juega casos asignados a su grupo y el catálogo se desbloquea en orden (`game_service.py:130-134,163-164`; `progression/catalog.py:12-43`); sin consentimiento ETH-01 no hay audio, mundo ni introducción (`simulation-play.component.ts:1616-1628`).

### Límites y deuda conocida

- **Numeración doble**: los RQ-NEG del catálogo difieren de los de `docs/historico/PROMPT_MIGRACION_DJANGO.md:36-43`, y «RNF-010» es ética en el catálogo pero «no regresión de datos» (origen de REGLA-002) en `PROMPT_MIGRACION_DJANGO.md:127`; el plan cita RQ-NEG-002/003 para C/E/F, que no los definen.
- **Esquema (Fase 2 sin hacer)**: `bootstrap_dev_db` no replica los CHECK; `test_deploy_schema_contract.py:34-37` cruza 4 de los 6; el volcado conserva 6 tablas legacy de quiz. La cabecera de la estrategia (`:3`) aún dice «sin mergear» aunque Django 6.1.1 ya está en `master`.
- **Despliegue (Fase 3 sin hacer)**: sin Hetzner, Compose ni Caddy; `Dockerfile:1` es imagen para Railway con `--workers 3` fijo (`:26`) y `production.py:41` lee `RAILWAY_PUBLIC_DOMAIN`; el arranque no corre `migrate`. Abiertas: región, usuarios reales, dominio y plazo (`estrategia...:315-320`).
- **Secretos**: `JWT_SECRET` y `REFLECTION_ENCRYPTION_KEY` tienen valor de desarrollo por defecto (`settings/base.py:112-116`) y producción solo exige que `JWT_SECRET` exista (`production.py:64`); contraseña fija del administrador en `seed_caso_pdf.py:1110-1117`; la contraseña por defecto de importados (`base.py:122-123`) se dejó «así por ahora» el 2026-10-10 (`docs/diseñosistemas_docs/DECISIONES_SESION_NOCTURNA_2026-10-10.md:18`).
- **Auditoría**: retención de 360 d frente a ≥12 meses de RNF-007 (`audit_service.py:28`); `purge_audit_logs` es manual y ninguna vista lee `audit_logs`.
- **Asistente IA** (con la bandera encendida): la pregunta queda en claro 500 caracteres (`ai_assistant.py:134`); «ya decidió» lo manda el navegador (`:39`); sin límites de uso (0 `THROTTLE`); un proveedor mal escrito cae a OpenAI (`ai_providers.py:100-102`); docente sin servicio (`:51`).
- **Concurrencia**: `flags_json` se lee-modifica-escribe sin bloqueo (0 `select_for_update`); es la pieza 0c que E y F necesitan.
- **Contenido pendiente**: E, F y el ritmo de C no existen sin Psicología; falta el retrato `closed`; ETH-01 sin revisión SME ni recursos de apoyo verificados (`BLOCKED_EXTERNAL`, `docs/diseno/consentimiento-contenido-sensible.md:50-55`); el consentimiento vive solo en `sessionStorage` (`simulation-play.component.ts:2802`).
- **Coste de un 2.º caso**: finales, métricas, aviso e introducción atados a `SIM-VBG-001` (`intro-gate.util.ts:28`; `OPTION_EFFECTS` solo del caso 1; `compute_ending` no mira el caso, `case_effects.py:289-341`).
- **Sin verificar con personas o hardware**: lector de pantalla real, FPS reales, teléfono físico y prueba con ≥10 usuarios (informe de jugabilidad §5, última fila).
