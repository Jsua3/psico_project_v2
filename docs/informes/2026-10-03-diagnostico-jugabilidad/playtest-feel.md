# Playtest 3: sensación de juego medida (game feel)

Cuenta `tester3@psychosim.edu.co`, modo `laptop` (1366x768), Chromium con WebGL por software (SwiftShader). Capturas en `(capturas no versionadas) shots/pt-feel/` y scripts de medición en `.../scratchpad/pt3/` (`run1.mjs` … `run19.mjs`, resultados `.json`).

## 1. Veredicto en una frase

El motor de movimiento es correcto y responde bien (arranque en 1 cuadro, velocidad constante de 150 px/s, deslizamiento por paredes sin pegarse, animación de 4 direcciones). Lo que se siente mal no es el control sino todo lo que lo rodea: casi no hay señales de qué es interactuable ni por dónde empezar, la recogida de herramientas y las puertas no dan realimentación, el mundo se encoge de forma permanente tras el primer diálogo, los NPC son estatuas atravesables y una puerta puede "robarle" la E a una persona. Es lo que explica el "no se sabe qué hacer".

## 2. Cómo medí (y límites)

- Leí el estado vivo de Phaser con `ng.getComponent(app-game-world).scene` (posición exacta por cuadro, `nearestKey`, frames de animación, colisión con `wouldCollide`) y un muestreador `requestAnimationFrame`. No toqué el repositorio.
- Tiempos de red son contra el backend local: en producción la latencia suma.
- FPS: WebGL por software (SwiftShader). Solo sirve para comparar entre escenarios, no como medida absoluta. El presupuesto de 59 FPS en 1366x768 NO es verificable en esta máquina.
- El audio no se puede oír: lo analizo por código y por qué eventos llaman a qué sonido.
- Alcance jugado: sala 1 (`hospital-urgencias`), cruce a `hospital-sala-escucha`, diálogo con la familia, recogida del Kit PAP y su uso. No avancé más la narrativa.

## 3. Números medidos

### 3.1 Tiempos

| Medida | Resultado | Evidencia |
|---|---|---|
| Clic "Entrar al caso" → URL del simulador | 1099 ms | `run1.json` |
| Clic → aviso de contenido (con "iniciar nuevo intento") | 1236 ms | `run1.json` |
| "Continuar" del contexto → mundo listo | 147 ms (el mundo ya cargó detrás del diálogo) | `run1.json` |
| Entrada completa (con mis clics automáticos) | 3835 ms | `run1.json` |
| Fundido de entrada al primer mundo | 300 ms (cámara) | `game-world.component.ts:1169` |
| E → diálogo de familia en el DOM | 94 ms (incluye PATCH de posición + POST de interacción) | `run12.json` |
| Esc → diálogo cerrado | 41 ms | `run12.json` |
| Máquina de escribir | 22 caracteres/s (44 caracteres en 2 s); una línea de 200 caracteres tarda ~9 s salvo que se salte | `dialogue-panel.component.ts:16`, `run12.json` |
| Cruce de puerta: E → inicio del fundido | +109 ms (primero espera el PATCH de posición) | `run13b.json` |
| Cruce de puerta: pantalla negra total | +392 ms hasta negro completo; negro sostenido ~430 ms | `run13b.json` |
| Cruce de puerta: E → sala nueva visible | 826 ms | `run13b.json` |
| Duración real de los fundidos de escena | CSS 320 ms por lado (`.scene-fade`), más un `setTimeout` fijo de 340 ms antes de llamar a la API | `simulation-play.component.ts:737-741, 1807-1811` |
| Fundido de cámara 180 ms + destello 120 ms | solo para salidas Tiled (`transitionToRoom`); las puertas de este caso NO lo usan | `game-world.component.ts:606-612` |
| Recoger Kit PAP: E → slot 1 desbloqueado | ~85 ms | `run10.json` (DOM log) |
| Usar PAP: clic → respuesta HTTP | 357 ms | `run15.json` |

### 3.2 Movimiento

| Medida | Resultado | Evidencia |
|---|---|---|
| Velocidad real | ~148-150 px/s (118,7 px en 800 ms; 226 px en 1,5 s) = 178 px/s en pantalla a 1366 | `run5b.json`, `player-motion.util.ts:17` |
| Cruzar el ancho caminable (744 px) | ~5,0 s | cálculo |
| Aceleración / inercia | Ninguna. Primer cuadro ya a 6,5 px (velocidad plena) y se detiene en el cuadro siguiente a soltar | `run5b.json` rightProfile |
| Latencia de entrada | 1 cuadro (33-50 ms a 22 fps; ~17 ms a 60 fps, inferencia) | `run5b.json` |
| Diagonal | Normalizada: 69,4 px en 500 ms frente a 75 px en lateral (93%). No es más rápida | `run5b.json` |
| Atasco con muebles | No se pega: contra el mostrador desliza a 150 px/s lateral (dx 160 px en 1,5 s) | `run8.json` |
| Paredes | Para limpio (x 107 a 853, y 485,7). La animación de caminar se detiene al bloquearse (0 cuadros de "caminar en sitio") | `run8.json` |
| NPC y personas | NO bloquean: el jugador pasa a 1,7 px de la enfermera, 3,2 px de la familia y 1,8 px de la psicóloga | `run8.json`, captura `06` |
| Animación | 6 cuadros por dirección, 10 fps, en las 4 direcciones (abajo 0-5, izquierda 6-11, derecha 12-17, arriba 18-23) más pose quieta por dirección | `run9.json` |
| Rebote al caminar / respiración | Rebote de 1,6 px y respiración ±1,3% de escala Y (reducido a 0 con movimiento reducido) | `character-motion.util.ts:15-24` |
| Tamaño | Jugador 48x71 px de mundo (53x78 en pantalla a 1280; 85x128 a 1920; 23x35 a 844x390). NPC 52-54x78-81 (≈10% más altos que el jugador). Maletín 48x72 con brillo, puerta 130x123 | `run9.json`, `run14.json` |
| Colisión justa | Muebles con hitbox de pies, justo salvo sillas (≈30 px de margen invisible por lado). La región caminable es más ancha que el piso dibujado en las esquinas traseras (ver F-08) | capturas `02`, `04` |

### 3.3 Interacción

| Medida | Resultado | Evidencia |
|---|---|---|
| Radio objetos | 74 px de mundo (≈88 px en pantalla, ≈1,5 anchos de personaje); se activa a 69,8 px del maletín | `game-world.component.ts:2324`, `run10.json` |
| Radio NPC | 60 px (≈71 px en pantalla) | `game-world.component.ts:1507` |
| Resaltado del cercano | Escala 1,08 y opacidad 1 (frente a 0,88), etiqueta de nombre bajo el objeto, botón contextual abajo a la derecha (~430 px de distancia en pantalla) | `game-world.component.ts:2340`, capturas `08b`, `10b` |
| NPC en rango | Etiqueta de 9 px y "▲ E" de 8 px sobre la cabeza; el botón contextual NO aparece para NPC (queda el texto genérico "WASD mover…") | `game-world.component.ts:1442-1449`, `run11.json` (btn null) |
| Prioridad con dos objetos cercanos | Gana el más cercano entre marcadores; pero un marcador SIEMPRE gana a un NPC aunque el NPC esté a 0 px | `interaction-priority.util.ts:7-13`, `run11.json` |
| Recoger herramienta | El maletín desaparece, el slot 1 pierde el candado y se enmarca. Sin sonido, sin toast, sin animación | `run10.json`, captura `10b` |
| Usar PAP | Franja inferior "✓ Herramienta pertinente" + "Estrés +x%", sonido `ui_confirm`, pulso del estrés | `simulation-play.component.ts:1681-1696`, captura `19` |
| Puerta bloqueada | Toast claro con el motivo ("Primero identifica la necesidad de contención: habla con la familia en crisis") y sonido `ui_cancel` | captura `12` |

### 3.4 Cámara y encuadre (sala 1)

| Viewport | Canvas | Escala | Jugador | Observación |
|---|---|---|---|---|
| 1280x720 | 1056x594 | 1,10 | 53x78 | Sin solapes del HUD sobre el piso (tarjeta Objetivo 0% sobre el piso) |
| 1366x768 | 1141x642 | 1,19 | 57x85 | Piso ≈68% del ancho; bandas oscuras arriba y a los lados |
| 1920x1080 | 1696x954 | 1,77 | 85x128 | Bandas negras de ~135 px arriba y ~90 px abajo dentro del lienzo |
| 844x390 táctil | 469x264 | 0,49 | 23x35 | Mundo diminuto; D-pad y "Interactuar" (y 184-232) tapan el piso (y 185-297); tarjeta Objetivo 326x102 tapa la esquina superior izquierda; el texto "WASD mover · E interactuar" aparece encima del dock |

Zoom de cámara = 1 en salas autoradas y cámara fija (sin seguimiento): `game-world.component.ts:1090, 1150`. Capturas `20-viewport-*`.

### 3.5 Rendimiento y consola

- Solo con CPU (SwiftShader): 22,9 fps en reposo y 21,2 fps caminando; p95 de cuadro 83 ms; máximo 100 ms; heap JS 53 MB. Comparación relativa: caminar cuesta ~7% frente a quedarse quieto, no hay picos al abrir diálogo.
- Consola: 0 errores en todas las pasadas, 0 solicitudes con 4xx/5xx para assets del juego (fuentes y audio cargan). Solo avisos de axe en modo desarrollo (landmark principal, h1, skip-link sin destino enfocable): son de accesibilidad, no del juego.
- Cuadro de tiempo de Phaser: `update()` recibe `delta` suavizado y fijado en 16,67 ms durante los primeros 120 cuadros (ver F-12).

### 3.6 Vida de la escena

- NPC ambientales: 0 px de recorrido en 24 s; un solo cuadro de animación; solo respiran (5 actores "vivos"). En los JSON de escenario los NPC de la sala 1 y de casi todas las salas son `attentive` o `idle`; solo `comisaria-familia.json` (`pace`, `avoidant`), `proteccion-nna.json` (`avoidant`) y el legado `urgencias-crisis.json` definen movimiento. El NPC `attentive` no se gira hacia el jugador (cuadro 0 en las 4 posiciones probadas).
- Polvo, brillo en el piso y pulso del marcador sí existen (8 tweens en la sala 1).
- La guía "Enfermera de turno" que lleva al Kit PAP existe pero está APAGADA: `getSceneGuide()` devuelve `null` (`scene-guide.config.ts:107-111`). En la sala 1 no hay guía visible (`run18`).

### 3.7 Audio (por código)

- Música: un solo bucle `Musica_PsicoGame.mp3` a volumen 0,42; las capas `tension`, `resolution` y `crisis` no tienen archivo (`audio-director.service.ts:47-49`). Como al subir el estrés baja la única capa (`ambient` va a 0 con estrés > 85), la música queda en silencio justo en crisis (`audio-director.service.ts:129-145`, inferencia a partir del código).
- SFX con un solo evento real por acción: pasos de Phaser (3 variantes de concreto, cada 280 ms, vol 0,35; `game-world.component.ts:462-470`), blip al entrar en rango (vol 0,45; `:2330-2332`), `ui_select` al abrir diálogo y al pasar por opciones, `ui_confirm` al elegir o usar herramienta, `ui_cancel` en puerta bloqueada y salida segura.
- Definidos pero nunca reproducidos: `door_open`, `footstep_tile`, `footstep_wood`, `stress_high`, `crisis_start`. `footstep_wood` y `footstep_tile` apuntan a archivos de concreto.
- Recoger herramienta y desbloquear slot: silencio. Cruzar puerta: suena `dialogue_advance` (click de UI) por `triggerFade`.
- Pasos y blip se silencian con `prefers-reduced-motion` (acopla audio a preferencia de movimiento). El menú de Ajustes sí ofrece Música, Sonidos de acciones y Movimiento reducido (captura `21`).

## 4. Hallazgos

Detalle completo también en el resultado estructurado.

### F-01 (alto) Señales de "esto se toca" casi inexistentes y guía apagada
Lo que se siente: entras y ves tres NPC, un maletín, una puerta y una cartela; nada indica qué es interactuable ni por dónde empezar. Al acercarte, el maletín crece 8% y aparece una etiqueta pequeña. Evidencia: `scene-guide.config.ts:107-111`, `game-world.component.ts:2340` y `:1442-1449`, capturas `01`, `08`, `08b`. Arreglo (orienta proceso y lugar, nunca la respuesta): marcador uniforme "E" que flota sobre todo interactuable a ≤ 140 px (igual para todos, no codifica nada clínico); checklist de proceso en la tarjeta Objetivo que se tacha ("Tomar kit PAP", "Hablar con la familia"); anillo suave sobre el siguiente punto de proceso pendiente; contorno de 2 px y etiqueta ≥ 12 px en el objeto cercano. Esfuerzo M.

### F-02 (alto) Una puerta le roba la E a una persona
Lo que se siente: junto a la psicóloga, E no habla con ella sino que muestra "puerta bloqueada". En 16 de 27 posiciones donde la NPC está en rango (59%) gana la puerta, incluso con la NPC a 0 px. Evidencia: `interaction-priority.util.ts:7-13`, `game-world.component.ts:772-781, 2324`, `run11.json`, capturas `11`, `12`. Arreglo: elegir por distancia real entre marcadores y NPC, con empate a favor de la persona; que la salida solo gane si es la más cercana por margen. Un único "objetivo actual" con anillo. Esfuerzo S.

### F-03 (alto) El mundo se encoge 17% al primer diálogo y no se recupera
Lo que se siente: tras hablar con la familia el cuarto queda más pequeño y desplazado hacia abajo hasta recargar; las salas siguientes conservan el canvas reducido (captura `16`; inferencia). Medido: canvas 1141x642 → 948x533 con `y` de 60 a 114, en modo `explore` (`run19.json`), y un evento `resize` no lo arregla. Mientras el panel lateral está abierto el mundo también se reencuadra (1141 → 948 en +147 ms). Evidencia: `simulation-play.component.ts:401-402` (columna lateral), `game-world.component.ts:2681-2685` (ResizeObserver → `scale.refresh()`), capturas `23` frente a `08b`. Arreglo: que el panel flote sobre el canvas sin cambiar su tamaño, o forzar `scale.refresh()`/`updateBounds()` tras `transitionend` y comprobar en e2e el tamaño antes y después de un diálogo. Esfuerzo M.

### F-04 (alto) Táctil horizontal 844x390: mundo diminuto y controles encima
Lo que se siente: personaje de 23x35 px, el D-pad y "Interactuar" tapan el centro del piso, la tarjeta Objetivo tapa la esquina y el texto de teclado se encima con el dock. Evidencia: captura `20-viewport-844x390-room1.png`, `run14.json`, `game-world.component.ts:2418-2426` (`bottom: 92px` centrado), `simulation-play.component.ts:852-853`. Arreglo: D-pad abajo-izquierda y E abajo-derecha fuera de la escena, Objetivo plegable a una línea, ocultar el hint de teclado con `pointer: coarse`, zoom 1,4 con límites de cámara. Esfuerzo M.

### F-05 (medio) NPC atravesables y estáticos
Lo que se siente: atraviesas a la enfermera (1,7 px) y todos son estatuas. Evidencia: `run8.json`, `run16.json`, captura `06`, `game-world.component.ts:2237-2249`, JSON de escenarios con `attentive`. Arreglo: colisión de pies pequeña (radio ~10 px) para NPC y personas; microvida sobria (giro de cabeza hacia el jugador, cambio de peso, 2 cuadros de reposo); deambulación lenta solo en NPC de fondo no sensibles; respetar movimiento reducido; sin animar a la sobreviviente como espectáculo. Esfuerzo M.

### F-06 (medio) Recoger y desbloquear no dan realimentación
Lo que se siente: el maletín desaparece sin ruido y un candado se quita en la barra. Evidencia: `run10.json`, captura `10b`, ausencia de `playSfx` en la interacción de TOOL. Arreglo: el kit "vuela" al slot en 250 ms (estático con movimiento reducido), un pulso único del slot, mensaje "Kit PAP añadido. Pulsa 1 para consultarlo." en toast con aria-live y un `ui_confirm` bajo. Sin puntos flotantes ni fanfarria. Esfuerzo S.

### F-07 (medio) Cruce de puerta lento y sin sonido propio
Lo que se siente: 0,83 s hasta ver la sala nueva, de los cuales ~0,43 s en negro; suena un click de interfaz. Evidencia: `run13b.json`, `simulation-play.component.ts:1293-1306, 1807-1811`, `audio-director.service.ts:82` (`door_open` sin uso). Arreglo: fundido de 150-200 ms y lanzar PATCH y POST en paralelo en lugar de esperar 340 ms fijos; sonido de puerta suave; sin parpadeo y con movimiento reducido en corte directo. Esfuerzo S.

### F-08 (medio) La colisión no coincide con el arte
Lo que se siente: en las esquinas traseras el personaje queda de pie sobre la pared, fuera del piso dibujado; las sillas bloquean ~30 px antes de tocarlas; la planta junto a la puerta se atraviesa. Evidencia: capturas `02`, `04`, `07`, `run4`, `run9.json` (`plantBlocked: false`). Arreglo: derivar el área caminable del polígono del piso (recortada medio hitbox), reducir el margen de sillas y añadir un bloqueo pequeño para planta y marco de puerta. Esfuerzo S.

### F-09 (medio) Audio con huecos
Lo que se siente: pasos y blip suenan, pero recoger, desbloquear y cruzar puerta no tienen sonido propio y la música desaparece justo con estrés alto. Evidencia: sección 3.7. Arreglo: SFX distintos y sobrios (recoger, desbloqueo, puerta, puerta bloqueada), ambiente de sala bajo, y a estrés alto bajar a un colchón grave en vez de silenciar (sin "game over" sonoro); separar audio de `prefers-reduced-motion`. Esfuerzo M (assets CC0).

### F-10 (medio) Rótulos pequeños, solapados y sin botón para NPC
Lo que se siente: la puerta, la etiqueta de la psicóloga y el "▲ E" se apilan en el mismo punto; el NPC no muestra botón en la barra inferior. Evidencia: capturas `12`, `15`, `game-world.component.ts:1442-1449`. Arreglo: la barra contextual muestra "E Hablar con …" para NPC también; fuentes ≥ 12 px; mostrar solo el rótulo del objetivo actual y apilar si hay dos. Esfuerzo S.

### F-11 (bajo) Diálogo: dos maquetaciones, E no avanza y 22 caracteres/s
Lo que se siente: abrir con E y tener que usar Espacio o Enter para avanzar; el retrato ocupa ~60% del panel y el texto queda en una línea. Evidencia: `dialogue-progression.util.ts:49-56`, `dialogue-panel.component.ts:16`, capturas `13`, `19`. Arreglo: E, Enter, Espacio y clic avanzan; unificar la maquetación; no premiar rapidez (el texto sensible no cronometrado). Esfuerzo S.

### F-12 (bajo, inferencia) A menos de 60 fps el personaje va en cámara lenta los primeros segundos
Medido: con ~22 fps, 87,5 px en 1,5 s (58 px/s) durante los primeros 120 cuadros y 226 px (150 px/s) después. Causa: `TimeStep.smoothDelta` fija el delta a 16,67 ms durante `panicMax` = 120 cuadros tras cargar o tras volver a la pestaña (`node_modules/phaser/src/core/TimeStep.js`). En una máquina real a 60 fps no se nota. Arreglo: `fps: { smoothStep: false }` o usar `game.loop.rawDelta` acotado a `PLAYER_MAX_FRAME_DELTA_MS`. Esfuerzo S.

### F-13 (bajo) Texto sin tildes
"Esto contribuye a una intervencion profesional y etica" (mensaje de herramienta, probablemente de backend/BD, inferencia) y las pistas de `scene-guide.config.ts` ("dificiles", "guia", "actuacion", "Psicologa"). Esfuerzo S.

### F-14 (bajo) E sin nada cerca no responde
`interactNearest()` no hace nada si no hay objetivo (`game-world.component.ts:772-781`). Arreglo: un destello breve en la barra de pista, sin sonido de error. Esfuerzo S.

### F-15 (bajo) Encuadre con mucho margen oscuro
Zoom 1 y mapa 960x528: a 1920x1080 sobran bandas de ~135 px arriba y ~90 px abajo; a 1366x768 el piso es el 68% del ancho. Arreglo: recortar el arte al área jugable o zoom 1,15-1,25 con límites. Esfuerzo S a M.

## 5. Contra un RPG top-down que se siente bien

| Principio | Estado | Qué falta |
|---|---|---|
| Respuesta inmediata | Cumple (1 cuadro, sin inercia) | Nada en el control; ajustar F-12 para equipos lentos |
| Fricción baja | Parcial | Puerta que roba la E (F-02), mundo que se encoge (F-03), cruce de 0,83 s (F-07), NPC atravesables (F-05) |
| Señales claras de lo interactivo | No cumple | Marcador uniforme, checklist de proceso, anillo en el siguiente punto (F-01), botón para NPC (F-10) |
| Feedback en cada acción | Parcial | Recoger, desbloquear y puerta sin respuesta (F-06, F-07), audio con huecos (F-09) |
| Mundo vivo | Mínimo | NPC con giro de cabeza y microanimación, colisión con personas (F-05) |
| Encuadre legible en todas las pantallas | Parcial | Táctil horizontal roto (F-04), márgenes (F-15) |

## 6. Qué ya funciona y conviene no tocar

- Control: velocidad constante de 150 px/s, diagonal normalizada, sin atascos, deslizamiento por paredes, animación de caminar de 4 direcciones y pose quieta por dirección.
- Cierre de diálogo en 41 ms, apertura en 94 ms, máquina de escribir omitida con movimiento reducido.
- Mensaje de puerta bloqueada con el motivo y la acción siguiente (el mejor "qué hacer" del juego hoy).
- Menú de Ajustes con Música, Sonidos de acciones y Movimiento reducido; salida segura visible siempre.
- Sin errores de consola en toda la sesión.

## 7. Cumplimiento de límites de producto en las propuestas

- Todas las pistas propuestas orientan proceso y lugar con el mismo estilo para todos los objetos: ninguna codifica cuál opción de decisión es la adecuada.
- Sin puntos flotantes, fanfarrias ni lenguaje de victoria; el audio de crisis baja a un colchón sobrio, nunca "game over".
- Ningún cambio exige migraciones Django ni toca Spring.
- Movimiento reducido: todas las animaciones nuevas tienen versión estática; nada parpadea.

## 8. Capturas (en `shots/pt-feel/`)

`01-spawn-1366x768`, `02-collision-and-radii-overlay-room1`, `03-walk-right-frame0..2`, `04-player-at-top-left-walkable-corner`, `05-player-at-top-right-walkable-corner`, `06-player-overlapping-nurse`, `07-player-at-plant`, `08/08b-near-medkit`, `09-medkit-out-of-range`, `10/10b-medkit-after-E`, `11/12-psicologa-and-door-priority`, `13/14-familia-dialogue`, `15-near-door-hint`, `16-after-door-new-room`, `17/18/19-tool-used-feedback`, `20-viewport-1280x720/1920x1080/844x390-room1`, `21-settings-menu`, `23-after-dialogue-close-canvas-smaller`.
