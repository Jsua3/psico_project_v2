# Auditoría de código y diseño responsivo: HUD, controles, ayuda y salida segura

Proyecto SIEP (SIM-VBG-001), rama actual `51d1409`. Alcance: `simulation-hud.component.ts`, `hud-dock.util.ts`, `game-menu.component.ts`, `simulation-play.component.ts` (plantilla y estilos), `game-world.component.ts` (controles táctiles, barra de contexto, pistas de puertas y de NPC), `keyboard-focus.util.ts`, `touch-hold.util.ts`, `simulation-hud.settings.spec.ts` y el informe `docs/audits/2026-10-03-bloque-h-accesibilidad-brechas.md` (H-01 a H-35).

## 0. Método y límites de lo que afirmo

- Lectura completa del código de los archivos pedidos más `tool-inventory`, `dialogue-panel`, `journal-panel`, `attempt-outcome`, `scene-objectives`, `scene-guide`, `evidence-gating`, `risky-interaction` e `interaction-priority`.
- No lancé el juego: no se me asignó cuenta de tester y las que aparecen en los scripts de otros agentes (1, 2, 3, 5 y 6) están en uso; una segunda sesión sobre la misma cuenta pisaría su intento. Para ver lo que ve el jugador usé las capturas ya tomadas por los playtests (`scratchpad/shots/pt-touch/*`, `pt-feel/*`) y recorté con ImageMagick las tiras del HUD (`scratchpad/hud/hud-1366-top.png`, `hud-1024-top.png`, `hud-844-top.png`).
- Las medidas de cada viewport salen de CSS + capturas (844x390 y 1024x768 medidas por el playtest táctil; 1366x768 de `pt-feel/01-spawn-1366x768.png`). Lo que deduzco por aritmética de CSS y no vi en pantalla lo marco "(inferencia)".
- Los números de línea de la auditoría H se comprobaron contra el código actual: siguen vigentes (`safeExit()` en `simulation-play.component.ts:1597-1599`, Esc en `:1129-1135`, rama de introducción en `:1113-1127`, `inputBlocked` en `:947-950`).
- H-11, H-13, H-14 y H-15 ya están aplicados en el código actual (HUD `role="complementary"`/`group` en `simulation-hud.component.ts:18-20,80,100`; `reduceMotion` en `dialogue-panel.component.ts:389,574`; anillos `#C9B3FF` en `dialogue-panel.component.ts:256-259` y `#f1a79f` en `simulation-play.component.ts:527`). No los repito.

## 1. Respuestas directas

**¿Existe una pantalla o ayuda de controles ("cómo se juega")?** No.
- Búsqueda en `frontend/src` de "tutorial", "cómo se juega", "ayuda", "primera vez", "onboarding": sin resultados útiles. Ningún componente, ruta ni entrada de Ajustes.
- Lo único que existe es una leyenda pasiva de teclado: `<p class="context-bar__hint">WASD mover · E interactuar · J bitácora · Esc salida segura</p>` (`simulation-play.component.ts:316`), visible solo cuando no hay interacción cerca y oculta con `max-width: 760px` (`:853`). En móvil vertical no hay leyenda; en móvil horizontal (>760 px de ancho) sí, y es de teclado.
- En el lobby: texto de Phaser `← → / A D  mover · E entrar` (`game-menu.component.ts:177-179`) y botón "Entrar al caso (E)" (`:262`).
- `localStorage` solo guarda token, avatar y "recordar correo" (`auth.service.ts:60`, `game-world.component.ts:276`, `login.component.ts:309`). No hay ninguna marca de "ya vio la ayuda".
- `hud-dock.util.ts:4-9` documenta que el recordatorio de controles "vive en su propia píldora de esquina colapsada". Esa píldora no existe en la plantilla; el archivo entero es código muerto (`resolveDock` no se importa en ningún otro lugar, salvo su spec).

**¿El HUD muestra atajos de teclado en dispositivos táctiles?** Sí, en ocho sitios y ninguno se oculta con `(pointer: coarse)` ni `(hover: none)`:
1. Leyenda "WASD mover · E interactuar · J bitácora · Esc salida segura": `simulation-play.component.ts:316` (visible en 761 px o más, incluido móvil horizontal y tableta).
2. Botón "Salida segura" con `<kbd>Esc</kbd>` y `aria-label="Salida segura (Escape)"`: `:292-294`.
3. Ficha de interacción con `<kbd>E</kbd>` y "(atajo E)": `:306-307`.
4. Insignias 1 a 5 en cada ranura de herramienta: `tool-inventory.component.ts:33`. No existe ningún manejador de teclas 1 a 5 para herramientas (los dígitos solo los lee el panel de diálogo, `dialogue-panel.component.ts:511`): es un atajo que no existe.
5. "Abrir bitácora reflexiva (J)" y `title="Bitácora (J)"`: `simulation-hud.component.ts:109`; fila "Bitácora J" en Ajustes: `:145`.
6. Aviso de contenido: "salida segura (`<kbd>Esc</kbd>`)": `simulation-play.component.ts:140`.
7. Botón "Continuar" del diálogo con nombre accesible "Cerrar diálogo (Esc)": `dialogue-panel.component.ts:104`.
8. Pista flotante `▲ E` sobre cada NPC (texto de Phaser de 8 px): `game-world.component.ts:1446,1491`.

**¿La tarjeta de objetivo es descartable o colapsable?** No. Plantilla `simulation-play.component.ts:234-247`: sin botón ni estado. Es `position: absolute; top/left: 10px` con `max-width: min(380px, 58%)` (`:416-425`), `role="status"`, y su texto depende solo del nodo (`scene-objectives.config.ts:9-26`), no del progreso dentro de la sala. En 1366x768 mide 380x120 (captura `pt-feel/01-spawn-1366x768.png`).

**¿Hay un indicador de cuántas herramientas o qué falta?** No de forma útil.
- Herramientas: 5 ranuras siempre visibles, bloqueadas al 35 % de opacidad con candado y `disabled` (`tool-inventory.component.ts:26-29,100-103`). No hay contador ("1 de 5"), ni texto de "cómo se desbloquea", ni foco en las bloqueadas. Los nombres se truncan a 9,3 px ("Primeros Auxil…", "Protocolo EPIC…").
- Progreso: el chip "Escenario 1 de 8" sale de `progressMap` (`simulation-play.component.ts:1645-1651`) y el chip "Paso 1 — … (1/6)" sale de una tabla fija con `total: 6` (`scene-objectives.config.ts:29-36`). Dos contadores contradictorios lado a lado en 1366 (`hud-1366-top.png`). El segundo se oculta por debajo de 960 px (`simulation-hud.component.ts:376-378`), es decir en todos los móviles.
- Qué falta: lo que se exige antes de decidir está en `evidence-gating.config.ts:24-45` (NPC, herramienta usada) y solo se muestra después de intentar decidir, con el nombre interno: `evidenceNpcLabel` busca solo en el `scenarioConfig` de la sala actual (`simulation-play.component.ts:1738-1744`) y, si el NPC era de otra sala, cae a su clave ("enfermera-urgencias", como vio el playtest táctil TOUCH-08).

**¿La salida segura es alcanzable en cada estado?** No en seis de ocho. Tabla en la sección 4 y diseño mínimo en la sección 5.

**¿Existe aviso o tutorial de primera vez?** El aviso de contenido ETH-01 existe (`simulation-play.component.ts:123-156`, consentimiento por intento en `sessionStorage`, `:1941-1943`). Tutorial o ayuda de primera vez: no existe. Diseño propuesto en la sección 6.

## 2. Qué ocupa cada elemento del HUD, por viewport

Estructura (`simulation-play.component.ts:360-388`): `position: fixed; inset: 0`, filas `auto / minmax(0,1fr) / auto`.
- Cabecera HUD: franja de 48 px + 1 px de borde = **49 px** (`simulation-hud.component.ts:165-183`).
- `.main-zone`: padding `10px 12px 0` (`:394-400`). El mundo (Phaser `Scale.FIT`, 960x540, `game-world.component.ts:2673`) se encaja en 16:9 dentro de `.canvas-zone`.
- `.bottom-zone`: padding `8px 12px 10px`, `min-height: 64px` (`:505-512`). Sin ficha de interacción mide ~65 px; con ficha de interacción 93 a 110 px (medido en TOUCH-04).
- Capas (z-index): vignette 18, objetivo 20, pie 30, cabecera 40, controles táctiles 48, diálogo cinemático 60, hoja lateral móvil 80, bitácora 100, resultado/pausa 150, fundido 200, nota de puerta/banner 320, nota de transición 340, tarjetas de introducción 380, aviso de contenido 395, reanudar 400.

| | 844x390 (móvil horizontal) | 1024x768 (tableta) | 1366x768 (portátil) |
|---|---|---|---|
| Cabecera | 49 px (12,6 % del alto). Muestra marca, título truncado ("Violenc…"), chip escenario, estrés con corazones, barras Confianza y Bienestar, puntaje, 3 iconos de 34x34. **Oculta** sala y paso (`max-width: 960`). | 49 px (6,4 %). Muestra la zona central **encimada** con el chip "Escenario 1 de 8" y con "ESTRÉS" (captura `hud-1024-top.png`). | 49 px. Todo cabe, pero el nombre de la sala se colapsa a 0 px: solo se ve el icono de ubicación (`hud-1366-top.png`). Causa: `.hud-scene` con `min-width:0; overflow:hidden` y `.hud-step` con `flex-shrink:0` (`simulation-hud.component.ts:186,248-258`). |
| Pie | 65 px en reposo, 93 a 110 con ficha. Seguridad 144x47 + dock de 5 tarjetas de 104 = 544 px + barra de contexto con solo **112 px** restantes. | 65 px, ~78 con ficha. Barra de contexto con 292 px. | 65 px. Barra de contexto con 634 px, la leyenda (411 px) cabe. |
| Mundo (canvas) | **469x264 = 37,6 % de la pantalla** (host 818x264). | 998x561 = 71 %. | ~1142x644 = 70 %. |
| Tarjeta de objetivo (380x120) | Cubre 217x120 del mundo = **21 %** del canvas. En modo diálogo lateral (panel de 340 px, zona de mundo de 470) el ancho baja a 273 y la altura sube a ~165: **36 %** del canvas. | 8 % del canvas. | 4,7 % (casi toda cae en la franja negra izquierda). |
| Cruceta táctil (solo `pointer: coarse`) | 377x48 en mitad del mundo (`bottom: 92px`, `game-world.component.ts:2418-2428`): **14,6 %** del canvas. Con diálogo lateral ocupa el 80 % del ancho de la zona y se dibuja sobre el texto del objetivo (z 48 > 20). | 3,2 %. | No aplica (puntero fino). |
| Leyenda de atajos (411 px) | **Pisa las ranuras 3 a 5** del dock (captura `pt-touch/06-world-t0.png`). | Pisaría las ranuras 4 y 5 (inferencia: 292 px < 411 px; la captura 39 mostraba la ficha en su lugar). | Sin solape. |

Umbral de solape de la leyenda con las herramientas (inferencia por aritmética): 12 + 144 + 10 + 544 + 10 + 411 + 12 = **1143 px**. Por debajo, el texto se desborda hacia la izquierda porque `.context-bar` usa `justify-content: flex-end` con `white-space: nowrap` (`simulation-play.component.ts:538-544,585-592`).

Qué se tapa entre sí, en resumen:
- Objetivo contra cruceta (844, diálogo lateral): confirmado en `pt-touch/14-dialog-open.png`.
- Leyenda contra ranuras de herramientas (844): confirmado en `pt-touch/06-world-t0.png`.
- Cabecera central contra chip y estrés (1024): confirmado en `hud-1024-top.png`.
- Menú de Ajustes (z 40, `simulation-hud.component.ts:293`) contra cruceta (z 48): inferencia por z-index; en 844x390 el menú de 280 px llega a x≈564 y la flecha derecha de la cruceta está en x 563 a 611.
- Aviso de puerta (`bottom: 120px`, z 320) sobre la cruceta, y banner de sala (`top: 96px`) sobre el objetivo en anchos menores de ~900: solapes breves, menores.

## 3. Hallazgo estructural: los puntos de quiebre miran el ancho, no la altura

En todo el simulador solo existen `max-width: 960` (HUD), `640` (HUD), `760` (juego), `700` (bitácora) y `560` (diálogo), y `pointer: coarse` para la cruceta. No hay una sola `max-height` ni `orientation` en `frontend/src` fuera de dos editores. Un móvil en horizontal (844x390, 915x412, 932x430) mide más de 760 px de ancho y recibe el diseño de escritorio con 390 px de alto: cabecera de 49 + pie de 65 + margen de 10 dejan 266 px para el mundo. Todas las reglas pensadas para móvil (hoja inferior al 62 vh, pie en dos filas, objetivo a dos líneas, leyenda oculta) nunca se aplican a un móvil girado. Esa es la raíz común de TOUCH-01, TOUCH-03, TOUCH-04, TOUCH-05 y TOUCH-07 del playtest táctil.

Ajuste de alta palanca: añadir un modo "compacto" definido por `@media (max-height: 520px), (pointer: coarse) and (orientation: landscape)` y no solo por ancho.

## 4. Salida segura: estado por estado (H-01, H-02, H-03 verificados)

| Estado | Puntero / táctil | Teclado (Esc) | ¿Alcanzable? | Evidencia |
|---|---|---|---|---|
| Aviso de contenido (ETH-01) | "Volver al catálogo" (no pausa; deja el intento `IN_PROGRESS`) | Esc se traga a propósito | Sí, por diseño ETH-01 | `simulation-play.component.ts:147-149`, `:1105-1111` |
| Aviso de reanudar | "Volver al catálogo" | Sin intento cargado | Sí | `:116` |
| Carga del mundo | Pie y HUD sin `inert` (`busy` falso) | Esc pausa | Sí | `:289`, `:1133` |
| **Introducción animada** | Solo "Continuar" y "Silenciar música"; cabecera y pie `inert` | **Nada** | **No** (H-02) | `:158-182`, `:212`, `:289`, `:1113-1127` |
| **"Primera escena" (relato más gráfico)** | Igual | **Nada** (solo Enter) | **No** (H-02) | `:184-210`, `:1122-1125` |
| Exploración | Botón 144x47, en el pie | 1 Esc | Sí | `:290-296`, `:1133` |
| Ajustes abiertos | Botón del pie accesible | 1.º Esc cierra Ajustes, 2.º pausa | Sí, 2 pasos | `simulation-hud.component.ts:441-446` |
| **Diálogo sin opciones** | Pie `inert` y tapado por la franja (z 60 sobre z 30); cerrar exige "Siguiente"/"Continuar" y la máquina de escribir pide "Saltar" antes | 1.º Esc cierra, 2.º pausa | Solo tras 2 a 4 toques (H-03) | `:730`, `dialogue-panel.component.ts:87-107` |
| **Diálogo con opciones** | **Ningún cierre ni pausa**; pie `inert`; en 844x390 ni siquiera las opciones 1 y 2 son tocables (TOUCH-01) | 1.º Esc cierra, 2.º pausa | **No en táctil ni con ratón** (H-01) | `dialogue-panel.component.ts:101` (`!d.choices.length`), `simulation-play.component.ts:289,947-950` |
| Bitácora | "Continuar simulación" y × (cierran, no pausan); pie `inert` | 1.º Esc cierra, 2.º pausa | 2 pasos (H-03) | `journal-panel.component.ts:34,100`, `:1130` |
| Petición en curso (`busy`) | Botón `disabled` | Esc ignorado | **No mientras dure** (H-04) | `:291`, `:1133`, `:1599` |
| Pausa o cierre | Botones propios | n/a | Correcto | `attempt-outcome.component.ts:20-23,128-146` |

Casi todo esto ya lo documenta la auditoría H. Aporto cuatro hechos nuevos, resumidos en los hallazgos HUD-08 y HUD-09:
1. **El texto promete lo que el código no cumple**, en tres lugares: el aviso de contenido ("tendrás disponible la salida segura (Esc)", `:140`), el texto sembrado en la base ("Puedes usar la salida segura en cualquier momento", `backend_django/apps/simulation/management/commands/seed_caso_pdf.py:160` y `deploy/db_seed.sql:3088`) que la tarjeta de objetivo muestra **durante toda la escena 1** (`simulation-play.component.ts:240-244`, captura `pt-touch/06-world-t0.png`), y el `aria-label` "(Escape)".
2. La solución propuesta en el plan (Tarea 10) tiene **trampas de capas**. Si se pausa desde la introducción y las banderas `showIntroScene`/`showCaseIntro` siguen activas, la pantalla de pausa (`attempt-outcome.component.ts:155`, z 150) queda **debajo** de la tarjeta de introducción (`simulation-play.component.ts:609`, z 380) y el botón "Reanudar este intento" no se ve. Lo mismo con `journalOpen` (el modal queda con z 100, por debajo de la pausa, pero reaparece al reanudar).
3. `resumeCurrentAttempt()` (`:1029-1042`) no reevalúa la introducción: al reanudar dentro de la página no vuelve a pedir lo que quedó pendiente.
4. `requestDialogueFocus` enfoca el primer `.choice-btn, .close-btn` (`dialogue-panel.component.ts:607-610`): si el botón nuevo reutiliza la clase `close-btn` robará el foco inicial.

## 5. Diseño mínimo que cumple REGLA-004 sin cambiar ETH-02

Principios: `PAUSED` sigue siendo la pausa reanudable (mismo `attemptId`, `simulationService.safeExit` y `resumeAttempt` sin tocar); `safeExit()` y su prueba (`simulation-play.consent-gate.spec.ts:403-413`) quedan como están; ETH-01 intacto (no hay salida con efecto en el aviso de contenido ni en el aviso de reanudar, que ya ofrecen "Volver al catálogo"); el texto del botón conserva "salida segura" porque el e2e busca `getByRole('button', { name: /salida segura/i })` (`frontend/e2e/support/siep-flow.ts:310`).

1. **Un componente presentacional `app-safe-exit-button`** (`input compact`, `output pause`): texto visible "Salida segura" y sublínea "Pausa y retomas después" en la ayuda, nombre accesible igual al texto visible (2.5.3), 44x44 mínimo, anillo `#f1a79f`, `<kbd>Esc</kbd>` solo con `(hover: hover) and (pointer: fine)`. Se instancia en: panel de diálogo (cabecera fija del panel, modos lateral y cinemático, también con opciones), pie de la bitácora (`journal-panel.component.ts:95-103`), tarjetas de introducción (`simulation-play.component.ts:171-179,202-207`, botón secundario a la izquierda de "Continuar"). Solo hay un botón con ese nombre accesible a la vez: con una superposición abierta el pie queda `aria-hidden`.
2. **Un método nuevo `pauseFromOverlay()`**, sin modificar `safeExit()`:
   - sale si no hay intento `IN_PROGRESS`, si `showResumePrompt()` o `showContentWarning()` (ETH-01), o si ya hay una pausa en curso;
   - `audioDirector.playSfx('ui_cancel')` y `withSyncedPosition(() => this.pauseCurrentAttempt())` (reutiliza el camino ya probado);
   - en el `next` de `pauseCurrentAttempt` (`:1613`), además de limpiar `dialogue`, hacer `journalOpen.set(false)`, `showIntroScene.set(false)`, `showCaseIntro.set(false)`, `audioDirector.stopIntroLament()`, `pendingEvidenceDecisionId = null` y `pendingRestrictedInteraction.set(null)`. Limpiar al éxito y no antes: si la petición falla, la superposición sigue y la persona puede reintentar (se muestra el aviso de error ya existente, `:1614`).
3. **`resumeCurrentAttempt()`** (`:1029`): tras `attempt.set(attempt)`, llamar `maybeShowInitialCaseIntro(this.world()!)`. `resolveIntroStep` (`intro-gate.util.ts:28-34`) ya decide: consentimiento dado y introducción sin leer devuelve `scene` o `narrative`; leída devuelve `none`. Así no hay capa tapada ni se re-pide el consentimiento.
4. **Esc en la introducción**: dentro de la rama `showIntroScene() || showCaseIntro()` (`:1113`), antes del chequeo de `BUTTON`/`A` (el foco siempre está en un botón por `cdkFocusInitial`, así que sin este orden Esc nunca llega): `if (event.key === 'Escape') { event.preventDefault(); this.pauseFromOverlay(); return; }`. La rama del aviso de contenido (`:1105`) conserva su `preventDefault` sin efecto.
5. **Panel de diálogo**: dos acciones en la cabecera del panel, fuera de la rejilla `.choices` y con estilo neutro (no codificado por color respecto de las opciones, límite 1): "Volver al mapa" (emite `close`, hoy solo existe por Esc en táctil) y "Salida segura" (emite `safeExit`). Clases propias (no `close-btn`, ver hecho 4). En alturas menores de 520 px la cabecera es fija y solo las opciones se desplazan (cierra TOUCH-01 sin ordenar ni resaltar opciones).
6. **Petición colgada (H-04)**: separar una señal `pausing` de `busy`, o habilitar el botón cuando `busy()` lleve más de ~8 s. Riesgo (inferencia, confirmar con backend): pausar mientras una decisión está en vuelo puede cruzarse con la mutación del servidor.
7. **Texto honesto** (sin cambiar semántica): aviso de contenido: "Podrás pausar el caso en cualquier momento con el botón «Salida segura» (con teclado, también Esc). Tu avance se guarda y puedes retomarlo." Quitar "(Escape)" y "(Esc)" de los nombres accesibles en táctil. El texto sembrado se queda mientras la afirmación sea cierta en todos los estados.
8. **Pruebas que ya existen y no deben romperse**: `consent-gate.spec.ts:191-202` (Esc bajo el aviso no pausa), `:403-413` (`safeExit()` no actúa con diálogo), `:482-496` (sincroniza posición antes de pausar), `simulation-hud.settings.spec.ts:32-38` (Esc consumido por Ajustes), `simulation-play.intro.contract.spec.ts` (botón "Continuar" y sin "Saltar video"). Nuevas (rojas primero): `pauseFromOverlay` con diálogo con opciones abierto llama a `sim.safeExit` una vez; la pausa desde la introducción deja `showIntroScene()` y `showCaseIntro()` en falso y la pantalla de pausa visible; reanudar con la introducción sin leer la vuelve a abrir; Esc en el aviso de contenido NO pausa; el foco inicial del diálogo sigue siendo la primera opción.

Esto cierra H-01, H-02 y H-03 y deja pendiente la decisión de producto ya registrada: si al reanudar vuelve la introducción (el diseño de arriba propone que sí, hasta que se lea completa).

## 6. Ayuda contextual de primera vez

### 6.1 Qué se enseña (cinco ideas, ninguna revela la decisión adecuada)
1. **Moverse**: táctil "Mantén pulsada una flecha para caminar; un toque da un paso corto". Teclado: "Flechas o WASD".
2. **Interactuar**: "Acércate a una persona o un objeto: aparecerá un botón con su nombre". Táctil "tócalo"; teclado "E, Espacio o Enter".
3. **Objetivo y herramientas**: "El panel «Objetivo» dice qué buscar en esta escena (puedes ocultarlo). Las herramientas se recogen explorando; al tocar una lees para qué sirve."
4. **Decidir sin prisa**: "No hay límite de tiempo. Ninguna opción está marcada como correcta; recibirás retroalimentación formativa después." (respeta los límites 1 y 3).
5. **Salida segura**: "Puedes pausar cuando quieras y retomar donde quedaste."

### 6.2 Cuándo (casi-just-in-time, nunca antes de ETH-01)
| id | Disparador (señal existente) | Anclaje | Se descarta |
|---|---|---|---|
| `mover` + `objetivo` | `showCaseIntro` pasa a falso y el mundo está listo (`continueFromCaseIntro`, `:1955`) | Esquina inferior izquierda, junto a la cruceta (táctil) o sobre el pie (teclado). Una sola tarjeta con 2 líneas | "Entendido", o la persona camina más de ~40 px |
| `interactuar` | Primera vez que `contextualInteraction()` deja de ser nulo (`:954`) | Sobre la ficha de interacción | "Entendido", o activa la ficha |
| `herramientas` | `world().inventory.length` crece por primera vez | Sobre el dock | "Entendido" |
| `decision` | Primera vez que `viewMode() === 'dialogue-right'` | Una línea fija arriba del panel (nunca sobre las opciones; en altura menor de 520 px se omite y queda solo en la pantalla de ayuda) | "Entendido" |
| `salida` | Mismo momento que `mover` | Línea 3 de la misma tarjeta | "Entendido" |

Reglas: una tarjeta visible a la vez, en cola; nunca mientras `showContentWarning()`, `showIntroScene()`, `showCaseIntro()`, `busy()` o la bitácora estén abiertos; sin temporizador de cierre (2.2.1); no roba foco; **no consume Esc** (Esc sigue siendo salida segura); sin animación (un contorno estático de 2 px `#C9B3FF`, 3:1 o más; ni destello ni pulso, así respeta movimiento reducido por construcción); botón "Entendido" de 44 px; `role="region" aria-label="Ayuda"` no modal y un único `aria-live="polite"` al aparecer; texto en español con tildes.

### 6.3 Pantalla permanente "Cómo se juega"
Un diálogo no modal de teclado completo (`cdkTrapFocus`, cierra con × y con Esc cuando está abierto) con las cinco ideas más Bitácora y Ajustes, con las variantes táctil y teclado (en equipos híbridos se muestran las dos, plegadas). Puntos de entrada: botón de 44 px "Cómo se juega" **en DOM** sobre el lobby (no texto de Phaser), icono "?" en la cabecera junto a Ajustes, fila "Cómo se juega" y "Ver la ayuda otra vez" en Ajustes (`simulation-hud.component.ts:119-153`), y la pantalla de pausa.

### 6.4 Cómo se recuerda (sin datos personales)
- Clave única `siep.ayuda.v1` en `localStorage` con `{"v":1,"vistas":["mover","interactuar"]}`. Sin id de usuario, correo, `attemptId`, caso ni fecha; no se envía al servidor ni a analítica. Subir `v` reactiva la ayuda cuando cambie el diseño.
- Todo acceso en `try/catch` con respaldo en memoria (modo privado o almacenamiento bloqueado): la página funciona igual sin él.
- Limitación asumida: en laboratorios con equipos compartidos la marca es por navegador, no por persona. Se mitiga con "Cómo se juega" siempre visible y "Ver la ayuda otra vez". No se liga a la cuenta para no crear un dato personal nuevo ni tocar el backend.
- Estructura de código: `help-hints.util.ts` (función pura `nextHint(ctx)` y lectura/escritura segura, con spec) + `HelpHintsService` (señales) + `<app-help-hint>` presentacional + `<app-how-to-play>`.

### 6.5 Mejoras de HUD que acompañan la ayuda
- Contador "Herramientas 1/5" en el dock y texto "Se desbloquea durante el caso" en las bloqueadas (no solo `title`). Quitar las insignias 1 a 5 hasta que existan atajos.
- Unificar el avance en un solo chip ("Escenario 1 de 8") y quitar el "Paso (1/6)" o derivarlo del mismo `progressMap`.
- Objetivo con botón de ocultar/mostrar y estado por nodo (expandido al entrar a un escenario nuevo, plegado a "Objetivo" de 44x32 después). Reutilizar como "Pista de proceso" los textos de `scene-guide.config.ts` (ya redactados para no revelar la decisión) en lugar de la guía NPC desactivada (`getSceneGuide` devuelve siempre `null`, `:107-112`).
- Lista "Antes de decidir" con nombres legibles de personas y lugares (el DÓNDE). Para las herramientas conviene frase genérica ("usa una herramienta de tu inventario"): nombrar la herramienta exacta cuando es lo que la decisión pide se acerca al límite 1. Decisión de Psicología.
- Modo compacto de alto bajo (ver sección 3): cabecera de 40 a 44 px solo con chip de escenario, estrés, puntaje y acciones; cruceta en la franja negra izquierda y "Interactuar" en la derecha (con 473 px de mundo quedan ~174 px libres a cada lado en 844x390; inferencia, no cabe en 667x375, donde se deja semitransparente); pie con altura fija de ~56 px (nombre de una línea, sin descripción) para que el mundo no cambie de tamaño.

## 7. Triage de los 35 hallazgos H-xx para "no saber qué hacer"

| Grupo | H-xx | Comentario |
|---|---|---|
| **Bloqueantes** (la persona no avanza o no sale) | **H-01**, **H-02**, **H-06** (los tres que ya figuran bloqueantes) y en la práctica táctil **H-03** | H-01 y H-02 son REGLA-004. H-06 impide a quien usa lector localizar personas y objetos. |
| **Afectan directamente a "no saber qué hacer"** | H-06, H-23 (la única explicación de por qué una puerta no abre desaparece a los 4,2 s, `:1317`), H-13 (22 car/s, ya con interruptor), H-08 (el estrés no se anuncia), H-09 y H-10 (regiones vivas que se repiten o callan), H-12 (barra de herramientas con dos paradas), H-07 (atajos globales sin forma de apagarlos) | Son orientación para lector de pantalla y feedback efímero; la ayuda visual de este informe no las sustituye. |
| Dependen de la salida segura | H-04 (petición colgada), H-05 (foco tras pausa) | Entran en el diseño de la sección 5. |
| No afectan a la orientación | H-16 a H-22, H-24 a H-35 (login, portada, contraste, tokens) | Siguen su plan propio. |
| Ya aplicados | H-11, H-13, H-14, H-15 | Verificado en el código actual. |

## 8. Restricciones de pruebas que hay que respetar al implementar

- Pruebas de "contrato de fuente" que leen el código con `readFileSync` y fijan cadenas literales: `simulation-hud.settings.spec.ts:108-123` (un solo `HostListener('document:keydown.escape')`, `renderer.listen('document','pointerdown')`, `aria-expanded`, `aria-controls`, `#settingsTrigger`), `game-world.touch.contract.spec.ts:7-10` (la regla exacta `@media (pointer: coarse) { .touch-controls { display: grid; } }` y los cuatro `pointerdown`/`pointerup`/`pointercancel`/`lostpointercapture` por flecha) y `simulation-play.intro.contract.spec.ts`. Mover la cruceta fuera del host de Phaser obliga a actualizar esos contratos en el mismo cambio.
- El HUD no puede abrir un listener global permanente (`simulation-hud.settings.spec.ts:58-62,108-114`): un nuevo botón "?" no debe registrar `document:keydown` genérico.
- Presupuesto de 59 FPS (`game-world.frame-budget.spec.ts`): la ayuda y el contador viven en DOM, nada nuevo dentro de `update()`.

## 9. Hallazgos nuevos (no repiten H-xx)

Orden de prioridad sugerido: HUD-08, HUD-09, HUD-04, HUD-03, HUD-01, HUD-02, HUD-05, HUD-06, HUD-07, el resto.

| ID | Sev. | Área | Título | Esf. |
|---|---|---|---|---|
| HUD-01 | high | Ayuda | No existe "Cómo se juega" ni ayuda de primera vez | M |
| HUD-02 | high | Táctil | Atajos de teclado visibles o prometidos en dispositivos táctiles | S |
| HUD-03 | high | HUD / objetivo | Tarjeta de objetivo fija, estática y tapa entre el 21 y el 36 % del mundo en móvil horizontal | M |
| HUD-04 | high | Responsivo | Los puntos de quiebre miran el ancho: el móvil girado recibe el diseño de escritorio | M |
| HUD-05 | high | Pie inferior | La leyenda pisa las herramientas, la ficha se aplasta a 112 px y la altura del pie salta | M |
| HUD-06 | high | Progreso | Sin indicador de qué falta: dos contadores contradictorios, paso oculto en móvil, evidencia solo tras decidir | M |
| HUD-07 | high | Interacción | Los NPC no aparecen en la barra de contexto y sus pistas son texto de canvas ilegible | M |
| HUD-08 | blocker | Salida segura | Diseño mínimo de REGLA-004 con cuatro trampas que el plan no cubre | M |
| HUD-09 | high | Salida segura | El texto promete una salida "en cualquier momento" o "Esc" que no existe en táctil ni en la introducción | S |
| HUD-10 | medium | HUD | Cabecera: solapes entre 961 y ~1200 px y nombre de sala colapsado en 1366 | S |
| HUD-11 | medium | Herramientas | Dock: números sin atajo, bloqueadas sin explicación, nombres truncados, bitácora contradictoria | S |
| HUD-12 | medium | Salida | Dos iconos de salida casi iguales con semánticas distintas | S |
| HUD-13 | medium | Legibilidad | Texto de 9 a 11 px en HUD, dock y objetivo; texto de canvas a 4 px | S |
| HUD-14 | medium | Límite 1 | La etiqueta de proximidad nombra "Acción riesgosa" antes de elegir (inferencia, decide Psicología) | S |
| HUD-15 | medium | Orientación | La guía NPC con pistas de proceso ya redactadas está desactivada (`getSceneGuide` siempre `null`) | S |
| HUD-16 | low | HUD | Puntaje y estrés sin etiqueta visible; los corazones se leen como "vidas" (límite 2, inferencia) | S |
| HUD-17 | low | Táctil | Objetivos táctiles de 28 a 42 px donde el mínimo cómodo es 44 px | S |

### Detalle

**HUD-01 (high, M). Sin "Cómo se juega" ni ayuda de primera vez.** El jugador no recibe ninguna explicación de cómo caminar, cuándo se puede interactuar ni para qué sirven las herramientas; lo averigua probando (un toque a la flecha avanza ~10 px, "Interactuar" sin nada cerca no hace nada). Evidencia: sección 1 (búsqueda sin resultados; Ajustes sin entrada de ayuda, `simulation-hud.component.ts:119-153`; `hud-dock.util.ts:4-9` promete una píldora que no existe; ninguna clave de "visto" en `localStorage`). Arreglo: sección 6 completa.

**HUD-02 (high, S). Atajos de teclado en dispositivos táctiles.** En un móvil se lee "WASD mover · E interactuar · J bitácora · Esc salida segura", una "E" en la ficha, "Esc" en el botón de salida, insignias 1 a 5 que no hacen nada y "(Esc)" en el aviso de contenido. Evidencia: los ocho sitios de la sección 1, ninguno detrás de `(pointer: coarse)` ni `(hover: none)`. Arreglo: ocultar `<kbd>` y la leyenda bajo `@media (hover: none), (pointer: coarse)`; nombres accesibles sin "(Esc)", "(E)", "(J)"; en táctil, texto "Toca Salida segura"; sustituir el texto de Phaser del lobby por un botón DOM; quitar insignias 1 a 5 (o implementar el atajo).

**HUD-03 (high, M). Tarjeta de objetivo fija y estática.** Cubre 380x120 px en la esquina del mundo (21 % del canvas en 844x390, 36 % con el diálogo lateral), no se puede ocultar, no cambia al avanzar dentro de la sala y arrastra el aviso sensible de la base ("…la muerte de una niña…") durante toda la escena 1. Evidencia: `simulation-play.component.ts:234-247,416-458`; capturas `pt-touch/06-world-t0.png`, `14-dialog-open.png`; texto en `seed_caso_pdf.py:160`. Arreglo: botón de plegar a un chip "Objetivo" de 44x32, estado por nodo, el párrafo sensible solo en el primer ingreso (queda en la ayuda), y una línea "Pista de proceso" (ver HUD-15).

**HUD-04 (high, M). Puntos de quiebre solo por ancho.** Un móvil horizontal de 844 px recibe el diseño de escritorio con 266 px de alto para el mundo (37,6 % de la pantalla), cruceta en mitad del mundo (`bottom: 92px`) y el diálogo lateral con opciones inalcanzables. Evidencia: sección 3; `simulation-play.component.ts:818` (único quiebre del juego), `game-world.component.ts:2418-2428`. Arreglo: modo compacto por `(max-height: 520px), (pointer: coarse) and (orientation: landscape)` con cabecera de 40 a 44 px, cruceta e "Interactuar" en las franjas negras laterales del encaje 16:9, hoja inferior de diálogo y pie de altura fija.

**HUD-05 (high, M). Pie inferior.** La leyenda de teclado se dibuja encima de las ranuras 3 a 5 (<1143 px de ancho); la ficha de interacción queda en 112 px (texto en tres líneas, "Primer… Auxilio…") y el pie salta de 65 a 93 o 110 px, con lo que el mundo se encoge cada vez que se acerca algo. Evidencia: `simulation-play.component.ts:303-318,505-600`; capturas `pt-touch/06-world-t0.png`, `39-tablet-world.png`. Arreglo: pie de altura fija (~56 px) con nombre de una línea; dock en modo icono (44x44) en compacto; la leyenda solo con puntero fino y ancho de sobra, o dentro de la pantalla de ayuda.

**HUD-06 (high, M). Sin indicador de qué falta.** No hay contador de herramientas; "Escenario 1 de 8" y "Paso 1 (1/6)" se contradicen; el paso se oculta en móvil; lo que se exige antes de decidir se dice solo al intentar decidir y con el nombre interno del NPC. Evidencia: `scene-objectives.config.ts:29-36` frente a `simulation-play.component.ts:1645-1651`; `simulation-hud.component.ts:376-378`; `simulation-play.component.ts:1729-1744`. Arreglo: un solo contador de escenario; "Herramientas 1/5"; lista "Antes de decidir" con etiquetas legibles (mapa estático de claves a nombres que no dependa de la sala actual). Sin marcar nunca cuál opción es la adecuada.

**HUD-07 (high, M). Los NPC no aparecen en la barra de contexto.** Al acercarse a una persona la barra sigue diciendo la leyenda de teclado; el nombre y la pista `▲ E` son texto de Phaser de 8 a 9 px (≈4 px en pantalla a 844x390, escala 0,49) y un marcador cercano gana al NPC (radio 74 frente a 60). Evidencia: `game-world.component.ts:1446-1448,1491-1493,1509-1517,2294-2335`; `interaction-priority.util.ts:8-14`; `simulation-play.component.ts:954-960`. Arreglo: emitir también la proximidad de NPC y mostrar la ficha "Hablar con {nombre}"; priorizar al NPC no visitado cuando es requisito de la decisión (alinear con TOUCH-12).

**HUD-08 (blocker, M). Salida segura (REGLA-004).** Ver secciones 4 y 5. Cuatro trampas no cubiertas por el plan: capa de pausa (z 150) bajo la introducción (z 380), `resumeCurrentAttempt` sin reevaluar la introducción, `journalOpen` que reaparece, y la clase `close-btn` que robaría el foco inicial. Arreglo: `app-safe-exit-button` + `pauseFromOverlay()` + Esc en la introducción, sin tocar `safeExit()`.

**HUD-09 (high, S). Promesas que el código no cumple.** El aviso de contenido dice "tendrás disponible la salida segura (Esc)", la base dice "Puedes usar la salida segura en cualquier momento" y la tarjeta de objetivo lo repite toda la escena 1, pero en táctil no hay Esc y en introducción y diálogos con opciones no hay salida. Evidencia: `simulation-play.component.ts:140,240-244,292`; `seed_caso_pdf.py:160`; `pt-touch/29-safe-exit-tap-in-dialog.png`. Arreglo: arreglar HUD-08 primero y luego reescribir el texto (sección 5, punto 7).

**HUD-10 (medium, S). Cabecera.** Entre 961 y ~1200 px el contenido central se desborda sobre el chip y "ESTRÉS" (centrado con `flex-shrink:0`); en 1366 la sala queda en 0 px. Evidencia: `hud-1024-top.png`, `hud-1366-top.png`; `simulation-hud.component.ts:186,248-258`. Arreglo: `.hud-zone--center { overflow: hidden; justify-content: flex-start }`, `.hud-step { flex-shrink: 1; min-width: 0 }` con elipsis y un mínimo para `.hud-scene`; o ocultar las barras de Confianza y Bienestar bajo 1200 px.

**HUD-11 (medium, S). Dock de herramientas.** Insignias numéricas sin atajo; bloqueadas al 35 % y sin foco ni explicación; nombres truncados; la ranura 5 "Bitácora reflexiva" aparece bloqueada mientras la bitácora está abierta desde el HUD (J); tocar una ranura solo muestra su descripción. Evidencia: `tool-inventory.component.ts:23-39,54-82,100-123`; `simulation-play.component.ts:1511-1526`. Arreglo: contador, texto "Se desbloquea durante el caso", nombre completo en un rótulo accesible, quitar números, y alinear el estado de la ranura de bitácora con la realidad.

**HUD-12 (medium, S). Dos salidas.** El icono de la cabecera usa el glifo `logout` y el de "Salida segura" usa `exit_to_app`; el primero sale al catálogo sin pausar (deja el intento `IN_PROGRESS`) y sin confirmar, el segundo pausa. Evidencia: `simulation-hud.component.ts:154-157`, `simulation-play.component.ts:291-294`. Arreglo: icono de casa o lista para el catálogo y etiqueta "Volver al catálogo (el caso queda guardado)".

**HUD-13 (medium, S). Legibilidad.** Tamaños: 8,96 px (`.tool-key`), 9,28 px (`.tool-name`, `.bar-label`, `kbd` de salida), 9,6 px ("OBJETIVO"), 9,9 px (etiqueta "Estrés"), 10,9 px (párrafo ético). Texto de Phaser de 8 a 11 px escalado a 0,49 en 844x390. Evidencia: `tool-inventory.component.ts:78,117`, `simulation-hud.component.ts:220-228,243`, `simulation-play.component.ts:447-458`. Arreglo: mínimo de 12 px en compacto para etiquetas que informan; mover a DOM el texto de NPC y puertas.

**HUD-14 (medium, S; inferencia, límite 1). Etiquetas que nombran la opción inadecuada.** Al acercarse al objeto restringido la cabecera dice "Paso 1/6 — Área médica restringida" o "Paso 4/6 — Acción riesgosa: contacto con agresor" y la ficha dice "Acción riesgosa: interrogatorio prematuro". Evidencia: `risky-interaction.config.ts:33-36`, `hospital-map.config.ts:16,23`. Arreglo: etiquetas neutras ("Cuestionario", "Contacto con la persona agresora") y mantener el aviso previo solo si Psicología lo confirma como parte de la pedagogía.

**HUD-15 (medium, S). Guía desactivada.** `getSceneGuide()` devuelve siempre `null` (`scene-guide.config.ts:107-112`): las pistas de proceso por escena (`:27-105`, cuyo contrato prohíbe revelar la decisión) nunca se ven. Arreglo: mostrarlas como línea "Pista" del panel de objetivo en lugar del NPC animado.

**HUD-16 (low, S; inferencia). Puntaje y corazones.** El puntaje es un icono y un número sin etiqueta visible (`simulation-hud.component.ts:100-104`) y los corazones se vacían al subir el estrés, con "calma restante" solo en un `title` (`:64`): se leen como vidas. Arreglo: etiqueta "Seguimiento" visible en tamaños amplios y revisar con Psicología si los corazones son la metáfora deseada (límite 2).

**HUD-17 (low, S). Objetivos táctiles.** Iconos de la cabecera 34x34 (`simulation-hud.component.ts:268-275`), × de Ajustes 28x28 (`:320-329`), "Saltar/Siguiente/Continuar" 42 px de alto (`dialogue-panel.component.ts:321-327`). Cumplen 24 px de WCAG 2.2 AA pero no 44 px. Arreglo: 44 px bajo `pointer: coarse`.

## 10. Lo que no pude verificar

- Medidas vivas del DOM (`getBoundingClientRect`) de los tres viewports: dependo de CSS y de las capturas de otros agentes.
- Aritmética de 1024x768 para la leyenda y del menú de Ajustes contra la cruceta (marcados como inferencia).
- Comportamiento del backend si se pausa con una decisión en vuelo.
- Lector de pantalla real con los nuevos controles.
- Si Psicología acepta nombrar herramientas en la lista "Antes de decidir".
