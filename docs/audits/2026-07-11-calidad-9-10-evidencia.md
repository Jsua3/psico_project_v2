# 2026-07-12 — Evidencia de calidad 9–10: seguridad y runners de SIEP

## Alcance verificable

Este cierre cubre la reproducibilidad local, el aislamiento de pruebas, la exposición de tokens de intento y los warnings conocidos del toolchain. No presenta como cerrados los pendientes de accesibilidad integral, revisión SME ni la paridad visual entre colisiones de frontend y backend.

- **Rama:** `codex/calidad-9-10`
- **HEAD evaluado:** `043ffc6d2b854445bae7d9f1d1e4010dbaa611e7` (antes de este documento)
- **Checkout de pruebas:** `D:\Sua_Files\IdeaProjects\psico_project_v3\.worktrees\calidad-9-10`
- **Fecha:** 2026-07-12

## Cambios cerrados

1. El bootstrap de desarrollo rechaza `DATABASE_URL`, hosts remotos y DSN efectivo distinto del destino local esperado.
2. Cada suite aislada deriva proyecto Compose desde el checkout, usa contraseña y nonce efímeros, exige ownership y limpia en `finally`.
3. Angular, Playwright y la matriz API se invocan con binarios locales, listas de argumentos y destinos explícitos. La API no usa credenciales hasta demostrar el nonce de la misma ejecución.
4. Los GET de intento privados trasladaron el token de query string a `X-SIEP-Attempt-Token`; backend y respuestas privadas añaden `Cache-Control: no-store`.
5. Se quitaron la configuración duplicada de `ts-jest` y WhiteNoise de `settings.test`, eliminando sus warnings sin cambiar la configuración de producción.
6. `npm run check:backend` usa `psychosim.settings.base` solo si no se especificó un settings explícito, por lo que un worktree nuevo no depende del archivo local ignorado.

## Gates ejecutados

| Comando | Resultado fresco |
|---|---|
| `npm run test:scripts` | 82/82, exit 0 |
| `npm run check:backend` | `System check identified no issues`, exit 0 |
| `npm run test:backend` | 214 passed, exit 0 |
| `npm run test:frontend` | 47 suites / 290 tests, exit 0 |
| `npm run build:frontend` | build de producción verde, exit 0 |
| `npm run test:e2e` | matriz API 16/16 + Playwright 11/11, exit 0 |

No se observaron warnings de `staticfiles`, deprecación `ts-jest`, opciones duplicadas de Angular ni `DEP0190` en los gates anteriores.

## Evidencia de no exposición y cleanup

- El E2E verificó en vivo el backend en `127.0.0.1:8093` y Angular en `127.0.0.1:4315`; Playwright recorrió consentimiento, mundo, lobby, teclado y viewport móvil.
- Los logs del flujo real mostraron `progress-map` y `world` sin `attemptToken` en la URL. Las pruebas de contrato cubren los cuatro GET privados y rechazan el token solo en query.
- Tras el gate integral, los puertos `5544`, `8093` y `4315` estaban libres.
- Tras el gate integral, no había contenedores, redes ni volúmenes del proyecto Compose derivado `psico-project-v3-test-7b12c7b1e9`.
- La búsqueda de `attemptToken=` en `frontend/test-results` y `frontend/playwright-report` devolvió cero coincidencias.

## Límites que permanecen explícitos

- Falta una auditoría Axe y una matriz completa de viewports; la cobertura actual llega a los recorridos Playwright existentes, incluido móvil 390×844.
- La autoridad espacial backend sigue necesitando una traducción formal que garantice paridad con las geometrías visuales Tiled/TypeScript.
- Contenido sensible, recursos de apoyo y textos clínicos requieren la revisión SME correspondiente.
- La migración de la BD de desarrollo a un Compose propio sigue siendo una decisión del usuario; estos gates no tocaron esa base compartida.

## Addendum A11Y-INPUT-01 — 2026-07-12

- `SimulationPlayComponent` ahora calcula `inputBlocked` como fuente única para overlays, teclado, movimiento de Phaser y entradas que abrirían interacciones, NPCs, puertas, herramientas o salida segura.
- La acción accesible ya no es una lista oculta de todos los objetos del mapa: solo aparece un botón visible para `nearbyInteraction`, el mismo objeto que el jugador puede alcanzar en el mundo.
- Los overlays de reanudación, video, contexto, diálogo y bitácora tienen focus trap; las zonas de HUD, canvas y acciones de fondo quedan `inert` y ocultas al árbol de accesibilidad mientras el overlay bloquea.
- Evidencia fresca: `npm run test:frontend` pasó **47 suites / 294 pruebas**; `npm run build:frontend` pasó sin warnings; `npm run test:e2e` pasó **matriz API 16/16 + Playwright 12/12**. El recorrido Playwright tabuló ocho ciclos dentro de la bitácora sin perder el foco y confirmó la ausencia de `button.sr-only` en el caso.
- Sigue pendiente ejecutar Axe tras los estados dinámicos y la matriz completa `1600×900`, `1366×768`, `390×844`, `412×915`; por eso este addendum no declara cerrada la dimensión de accesibilidad.

## Addendum GAME-DOOR-ENTRY-01 — 2026-07-12

- `enter_room` ya no acepta coordenadas de entrada: tras validar `doorKey`, destino, proximidad y requisitos, el backend toma `entryX`/`entryY` del metadato autorado de esa puerta.
- La regresión adversarial envía `(99999, -50)` para `puerta-sala-escucha` y recibe el spawn autorado `(160, 452)`; el cliente Angular ya no serializa esos campos.
- Evidencia fresca: 52 pruebas espaciales backend, 47 suites / 295 pruebas frontend y E2E aislado con matriz API 16/16 más Playwright 12/12, todos verdes.
- El alcance no resuelve todavía hitbox completo del jugador ni la paridad formal entre colisiones Tiled y `collision_zones` backend; ambos permanecen en GAME-SPATIAL-02.

## Addendum GAME-SPATIAL-02b — 2026-07-12

- El servidor ya valida el mismo rectángulo de pies de **22×16 px** que usa el cliente: `x - 11 .. x + 11` y `y - 16 .. y`. Una posición cuyo punto no cae en el mueble, pero cuyo hitbox sí lo solapa, se rechaza sin mutar el intento.
- Los NPCs ambientales del corte `SIM-VBG-001` se siembran como `ambientNpcs` con `key`, `x`, `y` e `interactionRadius`; `ambientNpcKeys` queda como proyección derivada, no como una segunda lista autoritativa. Las claves históricas que no representan un NPC visible del mapa actual ya no se aceptan por mera declaración.
- `record_npc_interaction` deriva la geometría de `ambient_json` o del rectángulo autorado de un objeto `PERSON`, rechaza solicitudes remotas antes de escribir `viewedNpcKeys` o un evento, y no acepta contenido ambiental sin posición.
- El cliente ya no acredita un NPC de forma optimista: espera el `2xx`, hidrata `viewedNpcKeys` desde el mundo devuelto y solo entonces abre el diálogo. Un error conserva la evidencia sin cambios.
- Evidencia fresca: 54 pruebas backend espaciales, 47 suites / 296 pruebas frontend, y E2E aislado con matriz API 16/16 más Playwright 12/12, todos con salida 0.
- Tras ese gate: cero contenedores del proyecto Compose de pruebas y cero listeners en los puertos 5544, 8093 y 4315.

Todavía faltan el bucle clínico completo, diálogo por intervención, Axe y la matriz de cuatro viewports. La geometría visual de Tiled/TypeScript no se declara una segunda autoridad: para `SIM-VBG-001`, el backend decide la aceptación espacial y el gate final debe demostrar que el recorrido visual no presenta bloqueos.

## Addendum CLINICAL-LOOP-01 — 2026-07-12

- Una decisión que el estudiante confirma pese a evidencia faltante recibe `evidenceOverride` y una lista acotada de etiquetas; Django normaliza esas etiquetas y las adjunta solamente al evento de decisión que realmente se comprometió. Los reintentos no generan una falsa traza de override.
- `clinicalState` se deriva de `AttemptWorldState.flags_json`: PAP aplicado, estado emocional, confianza, apertura y nivel de crisis proceden de flags y métricas persistidas. El DTO está disponible al iniciar, decidir, refrescar y reanudar.
- El HUD y la reacción visual de la paciente ya no calculan consecuencias con el reducer del navegador tras una decisión; se hidratan desde `clinicalState` retornado por el servidor. La evidencia confirmada se conserva entre el diálogo de confirmación y el envío de la decisión.
- Evidencia fresca: 30 pruebas backend de decisiones/caso, 47 suites / 297 pruebas frontend, E2E aislado con matriz API 16/16 y Playwright 12/12, todas con salida 0.

El contenido clínico autorado todavía requiere revisión SME. En ese corte permanecían pendientes el diálogo por intervención, Axe en estados dinámicos y la matriz real de `1600×900`, `1366×768`, `390×844` y `412×915`; ese addendum no declaraba el objetivo global terminado.

## Addendum NARRATIVE-01 — 2026-07-12

- `DialoguePanelComponent` presenta una sola intervención autorada por vez. La línea activa gobierna texto, hablante, emoción y retrato; las opciones permanecen ausentes hasta completar la última línea y el nombre accesible no expone texto futuro.
- Enter y Espacio comparten un contrato determinista: completan la línea en curso, avanzan exactamente una intervención y, al final, dejan las opciones operables o cierran un diálogo sin opciones. Escape conserva la salida inmediata y los dígitos fuera del rango de opciones no se interceptan.
- Cada reemplazo de `Saltar`, `Siguiente`, `Continuar` u opciones recupera el foco después del render. Los controles nativos conservan Enter/Espacio sin anular atajos globales como `J`; las líneas con hablante o emoción vacíos heredan el árbol y el feedback de herramienta ya no se autocierra antes de poder leerse.
- El mundo Phaser expone readiness solo después de crear la escena, jugador y marcadores. El E2E espera esa condición antes de mover al avatar, sincroniza la posición, observa el `POST` real de `familia-crisis` y recorre sus tres intervenciones con teclado y foco contenido.
- Evidencia fresca: `npm run test:frontend -- --runInBand` pasó **47 suites / 305 pruebas**; el build Angular de producción pasó con salida 0; `npm run test:e2e` pasó **matriz API 16/16 + Playwright 13/13**. Tras el gate quedaron **0** contenedores del proyecto de pruebas y **0** listeners en 5544, 8093 y 4315.

Permanecen pendientes el gate Axe `serious/critical = 0`, la matriz completa `1600×900`, `1366×768`, `390×844`, `412×915`, el recorrido vertical hasta resultado/informe y la revisión SME del contenido clínico. Este addendum no declara terminado el objetivo global.

## Addendum E2E-VERTICAL-01 — 2026-07-12

- Se incorporó un gate Playwright reutilizable que ejecuta Axe con WCAG 2.1 A/AA y bloquea hallazgos `serious` o `critical` sin desactivar contraste. La medición geométrica rechaza overflow global, canvas o contenedores fuera del viewport, overlays fuera de pantalla y controles cubiertos por elementos externos.
- La matriz recorre login, lobby, advertencia de contenido, video, contexto del caso, mundo Phaser listo, ajustes, bitácora y diálogo real de `familia-crisis` en `1600×900`, `1366×768`, `390×844` y `412×915`. Escritorio avanza la narrativa con teclado; móvil mueve al avatar y avanza el texto con controles táctiles visibles.
- Los rojos preservados detectaron y corrigieron semántica ARIA inválida en login y ajustes, un cierre de ajustes cubierto por el CTA del instructor, un inventario horizontal sin acceso de teclado, desplazamiento lateral del HUD móvil y contraste insuficiente en la nota de cifrado. El gate espera la opacidad estable de overlays antes de medir contraste para no auditar fotogramas intermedios.
- Evidencia fresca: `npm run test:frontend` pasó **47 suites / 305 pruebas**; `npm run build:frontend` pasó limpio, sin advertencias de presupuesto; `npm run test:e2e -- --grep @quality` pasó **4/4 viewports**; `npm run test:e2e` pasó **matriz API 16/16 + Playwright 17/17**.
- El runner eliminó todos sus recursos: **0** listeners en 5544/8093/4315 y **0** contenedores, redes o volúmenes del proyecto Compose de pruebas.

El Browser plugin no estaba disponible en esta sesión, por lo que la verificación live se ejecutó con el Playwright versionado del repositorio y su backend/BD desechables. Aún requieren validación manual un lector de pantalla real y la revisión SME del contenido clínico. También sigue pendiente demostrar el recorrido vertical completo de seis decisiones hasta resultado e informe; este addendum cierra Axe y responsive del alcance escaneado, no el objetivo global.
