# Auditoría de brechas del BLOQUE H (accesibilidad)

**Fecha:** 2026-10-03 · **Medido contra:** rama `feat/cierre-plan-maestro` @ `a47635d` (sin cambios en `frontend/` hasta `47b1911`) · **Plan derivado:** [`2026-10-03-bloque-h-accesibilidad.md`](../superpowers/plans/2026-10-03-bloque-h-accesibilidad.md)
**Origen:** la hoja de ruta ([`2026-10-02-brechas-plan-maestro-total.md`](2026-10-02-brechas-plan-maestro-total.md), fila H) pide «auditoría completa: contraste en landing y login (pendiente conocido), foco, lectores de pantalla en el juego». Este informe lo mide y lo ordena.

## 1. Alcance, método y criterio

- **Alcance:** portada, login, tokens globales (`frontend/src/styles/`), foco y teclado, el simulador (`frontend/src/app/features/simulator/`) con lector de pantalla y teclado, la salida segura (REGLA-004) y los efectos del bloque B (`game-feel.util.ts`).
- **Método:** lectura estática del código y cálculo de contraste con un script de `node` (fórmula WCAG 2.x; los colores con alfa se mezclan sobre su fondo y, para superposiciones sobre el mapa, sobre un píxel blanco: peor caso). Se leyeron los planes `2026-09-29-ui-semana-02/06/99`, `ui-mes-99`, `2026-07-12-a11y-input-siep` y las puertas e2e (`frontend/e2e/support/quality-gates.ts`, `vertical-quality.e2e.ts`).
- **No se pudo comprobar** (sin ejecutar nada): lector de pantalla real, axe en vivo, navegador, Jest, e2e. Por eso: el color de `::placeholder` de Chrome (#757575) es un supuesto del agente de usuario; el contraste sobre degradados e imágenes lo da axe como «incomplete»; el recorrido por teclado se dedujo del código; los anuncios de regiones vivas están sin verificar (sección 6).
- **Criterio:** WCAG 2.2 AA (el catálogo `RNF-004` aún dice 2.1 AA y las puertas e2e etiquetan `wcag2a/wcag2aa/wcag21a/wcag21aa`, sin `wcag22aa`). Texto normal ≥ 4,5:1; texto grande y componentes/foco ≥ 3:1 (1.4.3, 1.4.11).
- **Severidad:** *Bloqueante* = la persona no puede completar una tarea central o no alcanza la salida segura; *Alta* = fallo A/AA con rodeo costoso; *Media* = fallo A/AA con rodeo razonable; *Baja* = riesgo latente o mejora.

## 2. Qué pide el bloque H y qué está cubierto

«Criterio de Done» (`docs/PLAN_MAESTRO_TOTAL.md`, sección BLOQUE H): 0 violaciones axe AA; contraste ≥ 4,5:1 en todos los textos; todas las opciones del diálogo navegables con teclado; skip links funcionales; el lector de pantalla anuncia progreso, diálogos y opciones.

| Criterio | Estado | Evidencia |
|---|---|---|
| 0 violaciones axe AA | Parcial | Puerta e2e con axe en 10 estados (`vertical-quality.e2e.ts:21-67`, `full-case.e2e.ts:232`); bloquea solo `serious`/`critical` (`quality-gates.ts:9`), descarta `incomplete` (`:62`) y no cubre portada, registro, opciones del diálogo, portal ni editores (H-20) |
| Contraste ≥ 4,5:1 | Parcial | Contrato `frontend/src/styles/contrast.contract.spec.ts` (portada, login, simulador, portal, menú lateral); quedan 10 pares bajo el mínimo (H-14, H-15, H-24 a H-28) |
| Opciones del diálogo con teclado | Cumplido | `1-9`, Tab, Enter/Espacio y Esc (`dialogue-progression.util.ts:42-63`, `dialogue-panel.component.ts:487-512`); el anillo de las opciones no llega a 3:1 (H-14) |
| Skip links | Cumplido | `app.component.ts:12-14` y `:38-44` (`#main-content`; `#game-area` solo en el juego); falta prueba dentro del juego (`ui-semana-99-pendientes.md`) |
| Lector anuncia progreso, diálogos y opciones | Parcial | Diálogos y opciones sí: región viva por línea (`dialogue-panel.component.ts:60`), botones con número (`:71`), región asertiva (`simulation-play.component.ts:66`), ruta narrativa (`:338-348`). Progreso y estrés no (H-08); el mundo no tiene alternativa (H-06) |

Ya hecho y fuera de hallazgos: foco global de 3 px y anillo claro en modo juego (`styles.scss:116-119`, `:750-765`, #C9B3FF = 10,02:1 sobre #0E1322); título por ruta (`app.routes.ts`); paneles inertes en el login (`login.a11y.spec.ts`); `cdkTrapFocus` en 7 diálogos; control de audio (`simulation-play.component.ts:172,190`, HUD `:127`); partículas con `prefers-reduced-motion` (`siep-particle-layer.component.ts:61`). La portada quedó casi limpia tras `ui-semana-02` (mínimo medido: 4,23:1 en un tramo del botón, H-24).

## 3. Hallazgos

| ID | WCAG | Sev. | Pantalla | Evidencia | Arreglo propuesto | ¿Claro y verificable con prueba automática? |
|---|---|---|---|---|---|---|
| H-01 | REGLA-004, RNF-010; 2.1.1 sin teclado físico | Bloqueante | Juego: diálogo con opciones | El único botón de cierre exige `!d.choices.length` (`dialogue-panel.component.ts:101-107`); pie `inert` (`simulation-play.component.ts:289`); hoja móvil sobre el pie (`:823-833`). En táctil no hay cierre ni pausa salvo elegir una opción | Botón «Pausa segura» dentro del panel, siempre visible | **No:** cambia el flujo ético; una prueba fija que `safeExit()` no actúa con un diálogo abierto (`simulation-play.consent-gate.spec.ts:403-413`) y el arreglo debe respetarla con un método aparte. Tarea 10 |
| H-02 | REGLA-004, RNF-010 | Bloqueante | Juego: introducción animada y «Primera escena» | Esc sin efecto (`simulation-play.component.ts:1113-1127`); cabecera y pie `inert` (`:212`, `:289`, `inputBlocked` `:947-950`); solo «Continuar» y «Silenciar música» (`:158-210`); el aviso promete «tendrás disponible la salida segura (Esc)» (`:140`) | Esc pausa y botón «Pausa segura» en las tarjetas | **No:** decisión de Psicología (aquí está el texto más gráfico). Tarea 10 |
| H-03 | REGLA-004 | Alta | Juego: diálogo o bitácora abiertos | `safeExit()` retorna si `inputBlocked()` (`:1597-1599`); el primer Esc cierra y el segundo pausa (`:1129-1135`); el botón del pie queda visible pero `inert` (modo lateral) o tapado (`.dialogue-cinematic` z 60, `:730`) | Ver sección 4 | **No:** misma razón que H-01. Tarea 10 |
| H-04 | REGLA-004 | Media | Juego: petición en curso | `busy()` deshabilita el botón (`:291`) y `safeExit()` (`:1599`); sin plazo, una red colgada deja sin salida | Plazo o `busy` separado de la pausa | **No:** requiere probar con red lenta (sección 6). Tarea 15 |
| H-05 | 4.1.3, 2.4.3 | Media | Juego: cierre y pausa | `role="alertdialog"` sin `aria-modal` ni foco inicial (`attempt-outcome.component.ts:21-23`, sin `focus` en el archivo); el botón que la provocó queda `inert` y el foco cae a `body`; aviso de reanudar sin `aria-modal` (`simulation-play.component.ts:96`) | Mover el foco al título y añadir `aria-modal` | **No:** el anuncio solo se confirma con lector. Tarea 15 |
| H-06 | 1.1.1, 2.1.1; RNF-004 «0 bloqueos con lector» | Bloqueante | Juego: mundo de Phaser | `.phaser-host` es `role="application"` sin `tabindex` (`game-world.component.ts:2362-2366`); las teclas se leen de `window` (`:380-384`); solo hay botón para la interacción ya cercana (`simulation-play.component.ts:303-318`) y A11Y-INPUT-01 (`2026-07-12-a11y-input-siep.md`) retiró la lista remota porque el backend rechaza acciones a distancia. Quien usa lector no localiza ni se acerca a personas u objetos | Alternativa «ir a…» que camine hasta el radio de interacción | **No:** diseño nuevo con Psicología. Tarea 12 |
| H-07 | 2.1.4 (A) | Alta | Juego: teclado | `J`, `E` y `WASD` son globales (`simulation-play.component.ts:1148-1159`, `keyboard-focus.util.ts:78-82`, `game-world.component.ts:382-384`) sin desactivar, reasignar ni limitar al foco; el lobby sí usa host enfocable (`game-menu.component.ts:249-252`) | Ajuste, foco en el host o modificador | **No:** tres opciones. Tarea 11 |
| H-08 | 4.1.3 | Media | Juego: HUD | `role="meter"` no vivo (`simulation-hud.component.ts:58-62`); puntaje y estrés estáticos (`simulation-play.component.ts:347`); el umbral de crisis (> 85) es solo visual y sonoro; solo los diálogos de herramienta y supervisión dicen «Estrés +X%» (`:1689`, `:1795`) | Anunciar el cambio de nivel | **No:** verbosidad y tono. Tarea 13 |
| H-09 | 4.1.3 | Media | Juego: regiones vivas | Regiones que nacen con su texto: `.room-banner` (`:87`), `.transition-note` (`:90`), línea del diálogo (`dialogue-panel.component.ts:60`), carga (`game-world.component.ts:2370`); `announce()` usa `aria-live="assertive" role="status"` (`:66`) y `door-notice` se anuncia dos veces (`:81`, `:1315`) | Región ya presente y vaciada | **No:** depende de NVDA y VoiceOver. Tarea 13 |
| H-10 | 4.1.3 | Baja | Juego: barra de contexto | `aria-live="polite" aria-atomic` (`:303`) relee la guía de controles cada vez que se sale del rango de una interacción (`:316`) | Limitar la región a la interacción | **No:** verificar en vivo. Tarea 13 |
| H-11 | 4.1.2 | Baja | Juego: HUD y tarjeta de contexto | `aria-label` en `div` sin rol: `simulation-hud.component.ts:49`, `:80`, `:100` y `simulation-play.component.ts:196` | `role="group"`/`region` o quitar la etiqueta | **Sí** → Tarea 8 |
| H-12 | 4.1.2 | Baja | Juego: herramientas | `role="toolbar" tabindex="0"` y cada botón tabulable (`tool-inventory.component.ts:17-21`): dos paradas, sin flechas | Patrón de barra de herramientas | **No:** patrón por decidir |
| H-13 | 2.2.2 | Media | Juego: diálogo | El panel no recibe `reduceMotion` (confirmado: sin `input`, `dialogue-panel.component.ts:384-392`; máquina de escribir a 22 car/s siempre, `:570-584`; solo la media query, `:375-380`; no se pasa en `simulation-play.component.ts:281`, `:322`). 2.2.2 se cumple con «Saltar» (`:87-93`), pero el ajuste promete otra cosa | Entrada `reduceMotion` y texto completo | **Sí** → Tarea 7 |
| H-14 | 2.4.7, 1.4.11 | Alta | Juego: foco | Opciones del diálogo `rgba(182,156,255,.5)` sobre #14181E = **2,89:1** (`dialogue-panel.component.ts:256-259`); botón de salida segura `rgba(226,90,79,.6)` sobre #0E1322 = **2,55:1** (`simulation-play.component.ts:527`); mínimo 3:1 | #C9B3FF (9,65:1) y #F1A79F (9,49:1) | **Sí** → Tarea 5 |
| H-15 | 1.4.3 | Media | Juego: diálogo | Hablante de advertencia #A85062 sobre #14181E = **3,38:1** (`dialogue-panel.component.ts:184`); etiqueta de emoción «alerta» #E25A4F con `opacity: .75` = **3,29:1** (`:185-191`); mínimo 4,5:1 | #D9798E (6,00:1) y `opacity: 1` (4,93:1) | **Sí** → Tarea 5 |
| H-16 | 2.3.1, 2.2.2 | Baja | Juego: efectos del bloque B | Sin hallazgo (sección 4 de este informe, nota). Con movimiento reducido la viñeta fija sube a α 0,7 (`game-feel.util.ts:40`), más opaca que la de 0,55 sin reducir | Confirmar con Psicología (pregunta 6) | No aplica |
| H-17 | 2.4.7 | Alta | Grupos: buscador | `.search-box input { outline: 0 }` y el contenedor sin `:focus-within` (`grupo-list.component.ts:410-418`): el campo no muestra foco | Anillo en `.search-box:focus-within` | **Sí** → Tarea 6 |
| H-18 | 2.4.7, 4.1.2, 2.1.1 | Alta | Editor DAG | `.dag-node-group:focus { outline: none; }` sin sustituto (`dag-editor.component.ts:259`); `svg role="img"` con nodos `tabindex="0"` dentro (`:60`, `:105-108`; axe `nested-interactive`); nodos `role="button"` solo con Enter | Trazo de foco, `role="group"`, Espacio | **Sí** → Tarea 6 |
| H-19 | 2.4.11 | Media | Portada y portal | `.landing-nav` fija de ~72 px (`landing.component.scss:67-81`) sin `scroll-padding`/`scroll-margin` para el foco (solo las anclas, `:472`); barra del portal ~104 px (`ui-semana-99-pendientes.md`) | `scroll-margin-top` en enfocables | **No:** se ve solo en un navegador. Tarea 15 |
| H-20 | herramienta | Media | Puertas e2e | Etiquetas sin `wcag22aa` (`quality-gates.ts:8`, incluye `target-size`); solo `serious`/`critical` (`:9`); `resultTypes: ['violations']` (`:62`); sin portada, registro, opciones del diálogo, aviso de reanudar, portal ni editores | Añadir `wcag22aa` y estados | **No:** puede romper CI; probar antes en local. Tarea 15 |
| H-21 | 2.5.8 | Baja | Login | Checkbox «Recordar sesión» nativo y `.auth-link-btn` de ~17 px (`login.component.scss:427-436`) | Medir con axe `target-size` | **No:** se mide con axe 2.2. Tarea 15 |
| H-22 | 2.2.2 (A) | Baja | Portada y login | Partículas continuas: respetan `prefers-reduced-motion` (`siep-particle-layer.component.ts:61`, `:91`) pero no ofrecen pausa | Botón de pausa o aceptar la preferencia | **No:** pregunta 8 |
| H-23 | 2.2.1 | Baja | Juego: avisos | `door-notice` 4,2 s (`:1317`), `action-toast` 4,5 s (`:1424`), `transition-note` 4,2 s (`:1977`, ~80 caracteres) desaparecen solos | Mantener hasta descartar | **No:** pregunta 10 |
| H-24 | 1.4.3 | Media | Portada | Botón primario: blanco sobre `linear-gradient(135deg, #8B5CF6, #7C3AED)`; el inicio da **4,23:1** (`landing.component.scss:187`; 14,4 px en negrita no es «grande»); axe lo marca «incomplete» | `#7C3AED → #6D28D9` (5,70 y 7,10:1) | **Sí** → Tarea 2 |
| H-25 | 1.4.3 | Media | Login | `::placeholder` sin estilo (`login.component.scss:270-285`): Chrome pinta #757575 sobre #F3F4F6 = **4,19:1** (supuesto del agente de usuario) | `color: var(--siep-muted)` (#5F6B76, 4,95:1) y `opacity: 1` | **Sí** → Tarea 3 |
| H-26 | 1.4.3 | Media | Login (con Google activo) | «o» del divisor `rgba(120,120,140,.85)` = **3,31:1** (`:382-392`); «Conectando con Google…» `.95` = **3,92:1** (`:421-425`) | `var(--siep-muted)` (5,45:1 sobre blanco) | **Sí** → Tarea 3 |
| H-27 | 1.4.3 | Baja | Login (panel índigo) | `.toggle-brand small` (9,9 px) `rgba(255,255,255,.82)`: 4,38:1 en su posición (gradiente de 145°, t≈0,09, #5460B6) y **3,85:1** sobre el tramo claro #5C6BC0 (`:586-593`) | `#fff` (≥ 4,86:1 en todo el gradiente) | **Sí** → Tarea 3 |
| H-28 | 1.4.11 | Media | Login | Campos sin borde: #F3F4F6 sobre #FFFFFF = **1,10:1** (`:270-272`); el control no se identifica sin su texto | Borde de 1,5 px #767676 (4,54:1) | **No:** cambia la identidad visual. Tarea 14 |
| H-29 | 3.3.2, 4.1.2 | Media | Login: registro | Tres campos solo con `placeholder` (`login.component.html:32`, `:37`, `:42`): sin etiqueta persistente ni nombre fiable | `aria-label` ya; etiquetas visibles después | **Sí** (`aria-label`) → Tarea 4; las etiquetas visibles son la Tarea 14 |
| H-30 | 4.1.2 | Media | Login | `role="radiogroup"` con botones `aria-pressed` (`login.component.html:80-94`): promete flechas y `aria-checked` | `role="group"` | **Sí** → Tarea 4 |
| H-31 | 2.5.3 (A) | Media | Login | «Volver al inicio»: `aria-label` sin el texto visible (la institución) (`login.component.html:5-8`) | `'Volver al inicio, ' + brand.institution` | **Sí** → Tarea 4 |
| H-32 | 4.1.2 | Media | Portada | Botón del menú móvil sin `aria-expanded` ni `aria-controls`, etiqueta fija «Abrir menú» (`landing.component.html:13-22`) | `aria-expanded` y `aria-controls` | **Sí** → Tarea 8 |
| H-33 | 4.1.2 | Baja | Portada | Tres botones `disabled` de maqueta dentro del `aside` (`landing.component.html:99-105`) se leen como «no disponible» | `aria-hidden="true"` | **Sí** → Tarea 8 |
| H-34 | mejores prácticas | Baja | Portada y juego | `<footer>` dentro de `<main>` (`landing.component.html:219`) pierde `contentinfo`; el juego no tiene `h1` | Mover el pie; añadir `h1` | No aplica (no bloquea) |
| H-35 | 1.4.3 | Baja | Tokens | `$success` #27AE60 = 2,87:1 y `$warning` #E67E22 = 2,85:1 (`_variables.scss:18-19`); `--psy-green` #5D9278 = 3,59:1 y `--psy-lavender` #7A9EC0 = 2,81:1 (`styles.scss:44,46`) como texto sobre blanco. Sin usos hoy (Grep) | No usarlos como texto | No aplica |

**Conteo:** 35 hallazgos: 3 bloqueantes, 5 altas, 16 medias, 11 bajas. 15 son «Sí» y están en las tareas 2 a 8 del plan.

## 4. Salida segura y REGLA-004

**Verificación del análisis previo** (`docs/superpowers/specs/2026-10-03-propuestas-c-e-f-base-comun.md`, §5.5): se confirma con archivo y línea. (1) Con diálogo, bitácora o cualquier superposición, cabecera, lienzo y pie llevan `inert` y `aria-hidden` (`simulation-play.component.ts:212`, `:233`, `:289`) porque `inputBlocked()` es verdadero (`:947-950`). (2) `safeExit()` retorna sin actuar si `inputBlocked()` o `busy()` (`:1597-1599`), y una prueba lo fija (`simulation-play.consent-gate.spec.ts:403-413`). (3) Con diálogo o bitácora abiertos, el primer Esc los cierra (`:1129-1131`) y el segundo ejecuta `safeExit()` (`:1132-1133`). Se añaden dos hechos nuevos: **sin botón de cierre con opciones** y **sin salida alguna durante la introducción**.

**Recorrido exacto por teclado y puntero** (Esc se procesa en `handleGlobalInteraction`, `:1096-1160`):

| Estado | Tab y puntero | Esc | Resultado |
|---|---|---|---|
| Aviso de contenido (ETH-01) | «Volver al catálogo» (`:147`) | Se traga a propósito (`:1105-1111`) | Correcto: exige decisión informada |
| Aviso de reanudar | «Volver al catálogo» (`:116`) | Sin intento cargado: nada | Correcto |
| Introducción animada y «Primera escena» | Solo «Continuar» y «Silenciar música» | **Nada** (`:1113-1127`) | **Sin salida** (H-02) |
| Exploración (`IN_PROGRESS`) | HUD (bitácora, ajustes, catálogo) y luego «Salida segura» (`:291`) | `safeExit()` inmediato, sin confirmación (`:1133`) | 1 paso |
| Ajustes abiertos | Esc cierra Ajustes (`simulation-hud.component.ts:441-446`) | 2.º Esc: pausa | 2 pasos |
| Diálogo sin opciones | «Continuar» | 1.º cierra, 2.º pausa | 2 pasos; botón del pie tapado e inerte (H-03) |
| **Diálogo con opciones** | Solo las opciones; **ningún cierre** (`dialogue-panel.component.ts:101`) | 1.º cierra, 2.º pausa | **Táctil y ratón: atrapados** (H-01) |
| Bitácora | «Continuar simulación» (`journal-panel.component.ts:100`) | 1.º cierra, 2.º pausa | 2 pasos, sin pausa propia |
| Pausa o cierre | Botones propios; foco sin mover (H-05) | — | Correcto en semántica |

**Qué se propone sin cambiar la semántica** (ETH-02: `PAUSED` sigue siendo pausa reanudable; ETH-01 intacto): una acción de pausa visible dentro de cada superposición (panel de diálogo, tarjetas de introducción, bitácora) que cierre lo abierto y llame al mismo `safeExit` del servicio; Esc en la introducción; `safeExit()` y su prueba actual quedan como están, con un método nuevo para las superposiciones. Detalle y preguntas en la Tarea 10 y la pregunta 1.

*Nota sobre el bloque B (H-16):* pulso de 800 ms por tramo (0,6 Hz) sobre #4A0F2E (luminancia ≈ 0,02; R/(R+G+B) = 0,55 < 0,8): ni destello general ni rojo saturado. Destello de sala de 120 ms, uno por cambio de sala, más el fundido de 320 ms: como máximo 2 por segundo (< 3). Para 2.2.2 existe el interruptor «Movimiento reducido» (`simulation-hud.component.ts:137`) y la preferencia del sistema (`simulation-play.component.ts:920`); bajo superposiciones el pulso se detiene (`game-world.component.ts:1798`). Sin hallazgo, pendiente de un analizador de destellos (sección 6).

## 5. Decisiones de producto o de Psicología

1. **Salida segura dentro de diálogos e introducción.** ¿Botón «Pausa segura» en el panel y en las tarjetas? ¿Basta un Esc en la introducción o pide confirmación? ¿Esc de exploración pausa sin confirmar, como hoy? ¿El texto visible dice «Salida segura» (ETH-02 la define como pausa)?
2. ¿Se acepta pausar durante la introducción animada? Al reanudar, ¿vuelve la introducción o se omite?
3. **Atajos de una tecla (2.1.4).** ¿Ajuste «Atajos de una tecla» en el HUD, atajos solo con el foco en el juego (como el lobby) o modificador? ¿Activado por defecto?
4. **Mundo sin vista.** ¿Es aceptable un «ir a…» que camine solo hasta el radio de interacción? ¿Qué se puede listar sin revelar evidencia que el juego pide descubrir? ¿Cómo afecta la evaluación que quien usa lector no explore el espacio?
5. **Anuncios de estrés.** ¿Se anuncia a quien usa lector el nivel (estable, tensión, crítico)? ¿Con qué tono, para no alarmar ni revictimizar? ¿Solo al cambiar de nivel?
6. **Movimiento reducido.** La viñeta fija sube a α 0,7: ¿es deseable que sea más intensa que la animada (0,55)?
7. **Campos del login.** ¿Borde visible y etiquetas persistentes en el registro (cambio de identidad visual)?
8. **Partículas de la portada y el login (2.2.2).** ¿Botón de pausa o basta la preferencia del sistema?
9. **Criterio.** ¿Se adopta WCAG 2.2 AA y se actualiza `RNF-004` (hoy 2.1) y las puertas e2e con `wcag22aa`?
10. **Avisos temporales (2.2.1).** ¿Permanecen hasta descartarlos, o basta el anuncio por región viva?

## 6. Qué queda por verificar a mano

Con NVDA + Firefox y Chrome (Windows), VoiceOver + Safari (macOS e iOS) y TalkBack:
- [ ] Portada y login: leer de arriba abajo; abrir el menú móvil; cambiar de perfil; ¿se lee el nombre de cada campo del registro?
- [ ] Juego, modo foco: ¿NVDA entra en modo aplicación con `role="application"` sin `tabindex`? ¿Llegan WASD, E y J a Phaser o NVDA se los queda (letras de navegación rápida)?
- [ ] ¿Se anuncian sin repetirse: entrada a sala por puerta y por decisión, aviso de puerta bloqueada, interacción cercana, «Estrés +X%», cambio de nivel y desenlace? (H-08 a H-10)
- [ ] Al abrir un diálogo, ¿se lee la línea completa aunque su región nazca con el texto?
- [ ] Tras elegir una opción, pausar y cerrar: ¿a dónde va el foco y qué se anuncia? (H-05)
- [ ] Salida segura: con teclado, táctil real y ratón, desde cada fila de la tabla de la sección 4, incluida una red lenta (H-04).
- [ ] Foco no oculto con la cabecera fija de la portada y del portal; Tab y Mayús+Tab con la página desplazada (H-19).
- [ ] Zoom al 200 % y 400 %, reflujo a 320 px y espaciado de texto (1.4.4, 1.4.10, 1.4.12) en login, portada, HUD y diálogo (hay textos de 9 a 11 px).
- [ ] Modo de alto contraste de Windows: ¿se ve el titular con degradado (`color: transparent`)?
- [ ] Analizador de destellos (PEAT o Harding) sobre una grabación de crisis y de cambio de sala (H-16).
- [ ] axe DevTools con etiquetas `wcag22aa` y `best-practice` en cada estado de H-20; anotar los `incomplete` y revisar a ojo el contraste sobre degradados.
- [ ] Objetivos táctiles de 24 px (checkbox y enlaces del login) y de 44 px en táctil (H-21).
