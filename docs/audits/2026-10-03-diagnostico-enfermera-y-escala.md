# Diagnóstico medido: la enfermera de urgencias y la escala del canvas (T0.2 y T0.3)

Fecha: 2026-10-03. Código: rama `claude/peaceful-goodall-a2gobv` antes de los cambios de la pista G. Cuenta `tester2@psychosim.edu.co`, Chromium con WebGL por software (SwiftShader, 22-29 fps con la máquina compartida), viewports 1366x768 (`laptop`) y 844x390 (`touch`). Todo se midió en vivo leyendo la escena con `ng.getComponent(app-game-world).scene` y `phaserGame.scale`; los scripts viven fuera del repo. Sin cambios al código ni a la base durante la medición.

## Resumen

| Pregunta | Causa medida | Qué decide |
|---|---|---|
| T0.2 ¿Por qué no se «alcanza» a la enfermera? | Tres causas apiladas, ninguna es que esté fuera de alcance: (1) la barra contextual nunca ofrece a un NPC y el rótulo del NPC es de 9 px (invisible en táctil); (2) con NPC la tecla E depende SOLO de `JustDown` de Phaser, que se pierde con pulsaciones cortas, mientras que con marcadores la atiende el `HostListener` de Angular, que no falla; (3) el cliente promete 60 px y el servidor rechaza desde 62 px | T5.2 es la causa real (1 y 2); T11.4 (tolerancia del servidor) es **obligatoria** antes de subir el radio de cliente a 72; endurecimiento extra: tolerar pulsaciones cortas en la escena (hecho en T5.2) |
| T0.3 ¿Por qué el canvas no recupera su tamaño? | `ScaleManager.refresh()` termina llamando `getParentBounds()`, así que el `ResizeObserver` actual consume el aviso de «el contenedor cambió» sin reaplicar el tamaño y `step()` ya no ve cambio | T5.4: basta `getParentBounds()` antes de `refresh()`; no hace falta panel flotante en escritorio |

## T0.2 Enfermera de urgencias (PLAY-KB-03, TOUCH-12)

### Geometría: sí es alcanzable

- NPC `enfermera-urgencias` en (560, 330); mostrador de triage en x 380-600, y 252-308; zona caminable y 236-486. `wouldCollide` sobre una rejilla de 10 px alrededor de la enfermera (el servidor de geometría incluido): todo el semicírculo sur dentro de 60 px es caminable (`.`), el norte es mostrador y pared (`#`).

```
(dy -70 → +70, dx -70 → +70; '.' = libre dentro de 60 px, '#' = bloqueado dentro de 60 px, 'x' = bloqueado fuera)
xxxxxxxxxxxxx
xxxxxxx#xxxxx
xxxx#######xx
xxx#########x
xx###########   ← mostrador y pared
xx###########
xx###########
 .............  ← dy = 0: a su altura, libre
  ...........
  ...........
  ...........
   .........
    .......
       .
```

- Desde el spawn (480, 430) hay que subir 100 px y avanzar 80 px; en el lazo cerrado el jugador llegó a (559, 373), a 43 px, sin atascos.

### Lo que pasa a 43 px de la enfermera (1366x768, teclado)

| Observación | Resultado |
|---|---|
| Rótulo y pista | Aparecen «Enfermera de urgencias» (9 px de canvas, 7,5 px de pantalla) y «▲ E» (8 px): `updateNpcHints`, `game-world.component.ts:1509-1519` |
| Barra contextual | Sigue vacía: `nearbyInteraction` es `null` y `nearestKey` es `null`; solo `isAnyNpcInRange()` es `true`. La barra no ofrece al NPC (`updateNearestInteraction` solo mira marcadores) |
| E con `page.keyboard.press('e')` (0 ms de pulsación) | **Nada**: sin diálogo y sin petición de red. 3 intentos seguidos, igual que los 10 intentos del playtest |
| E con pulsación sostenida | 0, 20, 40 y 80 ms: nada. 150 ms: abre el diálogo (un `POST …/npcs/enfermera-urgencias`, 200) |
| `scene.interactNearest()` llamado directo | Abre el diálogo: la ruta NPC funciona si llega la orden |

Mecanismo (verificado en `node_modules/phaser/src/input/keyboard/KeyboardPlugin.js` y `Key.js`): Phaser encola `keydown` y `keyup` y los procesa juntos en el siguiente `step`; `Key.onUp` pone `_justDown = false`. Si ambos eventos caen en el mismo cuadro, `JustDown()` nunca devuelve `true`. En un equipo a 22-29 fps un cuadro dura 35-45 ms y una pulsación de teclado humana rápida (60-100 ms) pierde el cuadro con facilidad. Con un marcador esto no pasa porque `handleGlobalInteraction` (`simulation-play.component.ts:1155-1160`, `@HostListener('window:keydown')`) lee el evento directo y llama `openInteraction`; para un NPC `nearbyInteraction()` es `null`, ese oyente retorna sin hacer nada y todo depende de `JustDown`. Es la razón por la que «el kit sí se recoge y la enfermera no» con el mismo teclado, y por la que el e2e solo la alcanza tras empujones y reintentos.

### Servidor: el cliente promete más de lo que acepta

Con el radio de cliente subido a 90 solo para la prueba y `interactNearest()` sobre la enfermera (posición persistida antes por `PATCH`):

| Distancia a la enfermera | Respuesta |
|---|---|
| 58 px | 200 «Interaccion con NPC registrada» |
| 62 px | 400 «Estás demasiado lejos del NPC para interactuar» |
| 66, 72, 80 px | 400 igual |

`world_service.py:333-339`: `math.hypot(...) > radius` con `radius = 60` (`seed_caso_pdf.py:562`). Confirma V2 del diseño: sin tolerancia en el servidor, un radio de cliente de 72 mostraría «Hablar con…» y devolvería 400 entre 61 y 72 px; hoy ese 400 sale como un aviso genérico («No pudimos guardar la interaccion con el NPC.», sin tilde, `simulation-play.component.ts:1550`).

### Hipótesis del diseño (F§1.3)

| Hipótesis | Veredicto |
|---|---|
| 1. El jugador no entra en el radio por donde se acerca | Parcial: sí entra (≤ 43 px, rótulo visible), pero no hay señal en la barra y el rótulo es ilegible en táctil |
| 2. 400 del servidor por posición persistida con retraso | No es la causa con 44 px (200); sí lo sería entre 61 y 72 px si se sube el radio sin T11.4 |
| 3. Retorno temprano de `openNpcDialogue` por `busy`/`inputBlocked` | Descartada: `busy()` y `inputBlocked()` eran `false` y la ruta directa funciona |
| 4. Contenedor desplazado por `freeTileNear` | Descartada: el NPC está exactamente en (560, 330) |
| **Nueva** | Pulsación corta perdida por `JustDown` + NPC ausente de la barra |

### Qué hace falta (reparto entre pistas)

- **G (esta pista, T5.2)**: unificar marcadores y NPC en `pickNearby` y emitir al NPC como `proximity` principal (`npc:{clave}`), de modo que la barra lo ofrezca y el `HostListener` de Angular lo atienda como a cualquier marcador; además dejar la escena tolerante a pulsaciones cortas (la ruta de Phaser deja de depender de que `keydown` y `keyup` caigan en cuadros distintos).
- **Pista de integración (`simulation-play`)**: resolver las claves `npc:` en `openInteraction` y en la rama E de `handleGlobalInteraction` llamando a `openNpcDialogue` con el `NpcConfig` de `scenarioConfig()`; con eso la tecla E funciona igual para personas y objetos (se recomienda que Angular atienda `npc:` y haga `preventDefault`, no ignorarlo: ignorarlo deja la ruta frágil de Phaser como única).
- **Backend (T11.4, otra pista)**: `_require_nearby_ambient_npc` con `radio + NPC_RANGE_TOLERANCE_PX (16)`; prueba: acepta 70 px y rechaza 90 px. **Dependencia dura**: el cliente de esta pista usa 72 px. (Ya está en el árbol desde el commit `90f7f96`; ver la verificación posterior.)

## T0.3 Escala del canvas (FEEL-03, TOUCH-04)

### Mediciones (px de pantalla; `host` = `.phaser-host`, `parentSize` = `scale.parentSize`, `display` = `scale.displaySize`)

**1366x768, diálogo lateral de la familia (modo exploración, panel derecho de 340 px)**

| Momento | host | canvas (x, y, ancho, alto) | estilo del canvas | parentSize | display |
|---|---|---|---|---|---|
| Inicio | 1340x643 | 111, 60, 1143x643 | 1143x643 | 1340x643 | 1143x643 |
| Diálogo abierto (+2,5 s) | 948x643 | 13, 60, **948x643** | 1143x643 (viejo) | 947,5x643 | **1143x643 (viejo)** |
| Cerrado (+0,8 s) | 1340x642 | **209, 114, 948x533** | 947,5x533 | 1340x642,45 | 948x533 |
| Cerrado (+3,3 s) | 1340x642 | **209, 114, 948x533** | igual | igual | igual |

Con el diálogo abierto el canvas se aplasta por el CSS (`max-width: 100%`) en vez de reescalarse (948x643 ≠ 16:9). Al cerrarlo, `parentSize` ya vale 1340x642 pero `display` conserva el tamaño del panel abierto: el canvas queda 17 % más pequeño (948x533 frente a 1143x643) y desplazado 54 px hacia abajo, y así sigue pasado el intervalo de 500 ms de Phaser.

**844x390 táctil, acercarse al Kit PAP y alejarse**

| Momento | `.bottom-zone` | host | canvas | parentSize | display |
|---|---|---|---|---|---|
| Lejos | 64 px | 818x269 | 478x269 | 818x269 | 478x269 |
| Cerca del Kit +3 s | **79 px** (crece 15 px: la ficha del objeto) | 818x254 | 478x**254** (aplastado, escala x 2,007 / y 2,127) | 818x**253,9** | 478x**269 (viejo)** |
| + `scale.refresh()` (lo que hace el `ResizeObserver`) | 79 px | 818x254 | 451x254 | 818x254 | 451x254 |
| Lejos otra vez | 64 px | 818x269 | **451x254** (se queda pequeño) | 818x**269** | 451x254 (viejo) |

El patrón se repite a la inversa: el host recupera su alto y el canvas no. Es el mismo defecto de TOUCH-04 y F-03.

### Causa

`ScaleManager.updateScale()` termina con `this.getParentBounds()` («Update the parentSize in case the canvas / style change modified it», `ScaleManager.js:1167-1168`). El `ResizeObserver` del componente llama solo `scale.refresh()` (`game-world.component.ts:2684`): `refresh()` usa el `parentSize` viejo para calcular el tamaño, y al final de `updateScale()` ese `getParentBounds()` actualiza `parentSize` al valor nuevo y devuelve `true` sin que nadie lo atienda. El `step()` de Phaser solo refresca cuando `getParentBounds()` devuelve `true` (`:1703-1708`), y ya no lo hace porque el tamaño nuevo está registrado. Resultado: `parentSize` correcto, `displaySize` y estilo viejos, para siempre.

Una segunda llamada a `refresh()` (o `getParentBounds()` seguido de `refresh()`) lo corrige: medido en la tabla táctil (451x254 correcto con la relación 16:9 intacta, escala x = y = 2,127).

### Decisión

- **T5.4**: en el `ResizeObserver` llamar `scale.getParentBounds(); scale.refresh();` y exponer `refreshScale()` con las mismas dos llamadas para que la integración lo use al terminar la animación del panel lateral. Esto resuelve el escritorio (AC-5) sin panel flotante: el canvas se reduce mientras hay diálogo (reencuadrado, sin aplastar) y recupera 1143x643 al cerrarlo.
- El pie sigue creciendo de 64 a 79 px al acercarse a un objeto en táctil (medido arriba): reservarle altura fija es trabajo de la pista de `simulation-play` (F§7.9). El arreglo de escala es independiente de eso y deja el canvas correcto aunque el contenedor cambie de alto.
- Ningún cambio de backend ni de esquema.

## Conclusión una línea por tarea

- T0.2: causa = barra sin NPC + pulsación corta perdida en la ruta de Phaser + radio de servidor 60 estricto; arreglo en T5.2 (cliente) y T11.4 (servidor, obligatorio con radio 72).
- T0.3: causa = el `ResizeObserver` llama `refresh()` sin `getParentBounds()` previo; arreglo en T5.4, comprobado en vivo.

## Verificación posterior (misma cuenta y mismos viewports, con los cambios de la pista G y la tolerancia del servidor)

| Prueba | Antes | Después |
|---|---|---|
| E con pulsación de 0, 20 y 80 ms junto a la enfermera (con Angular sin candidato, es decir solo la ruta de Phaser) | nada en 0, 20, 40 y 80 ms; abre desde 150 ms | abre el diálogo y envía un `POST …/npcs/enfermera-urgencias` (200) en las cuatro |
| Alcance desde el cliente (radio 72) frente al servidor (60 + 16) | el servidor rechazaba desde 62 px | 200 a 58, 62, 66, 70, 72 y 76 px; la histéresis de una persona se limita a 76 px para que el cliente nunca ofrezca lo que el servidor rechaza |
| 1366x768, canvas tras cerrar el diálogo de la familia | 948x533 en y = 114 (17 % menor, desplazado) | 1142x642 en (111, 60): igual que al inicio (1143x643, ±1 px); con el diálogo abierto el canvas se reencaja a 948x533 sin aplastarse |
| 844x390, cerca del Kit PAP y de vuelta | 478x254 aplastado cerca; 451x254 pequeño al alejarse | 451x254 con 16:9 intacto cerca (el pie crece de 64 a 79 px: falta el pie fijo de `simulation-play`); 478x269 al alejarse |
| 844x390, controles táctiles frente al mundo | cruceta de 377x48 sobre el piso | cruz de 152x152 en x 21-173 (el canvas empieza en x = 182) e «Interactuar» en x 667-823 (el canvas termina en x = 660): nada tapa el piso |

