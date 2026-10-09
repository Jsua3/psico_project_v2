# Pase visual del bloque B (game feel): calibración sobre el juego real

Fecha: 2026-10-03 · Pista V1 · Rama `claude/peaceful-goodall-a2gobv` · Commit de la calibración: `c11fc53`.

El bloque B (viñeta de tono y de crisis atada al estrés, destello al cambiar de sala, sacudida tras decisiones de alto impacto) se implementó con TDD el 2026-10-02, pero nadie lo había visto en pantalla (informe nocturno §1 y §8; hoja de ruta, fila B). Este informe es el pase visual: se jugó el caso, se leyó el estado vivo de la escena, se midió y se miró cada captura. Las capturas clave están en [`2026-10-03-pase-visual/`](2026-10-03-pase-visual/) (8 PNG comprimidos).

## 0. Resumen

| Pregunta | Veredicto |
|---|---|
| ¿Se ve la viñeta de crisis? | Sí, en 1366x768 y en 844x390. Es un marco vino-violeta de ≈ 115 px (48 px en 844x390) que se nota desde ≈ 70 de estrés y a 80 ya es claro. No se lee como alarma roja: es un tono oscuro (RGB ≈ 44, 14, 35 en el borde a su máximo). **Se conserva color, grosor y rango del pulso.** |
| ¿Pulsa por encima de 85 y se detiene con movimiento reducido? | Sí, comprobado en vivo: pulso 0,55 ↔ 0,85, ciclo de 1,6 s (0,63 Hz). Con movimiento reducido, con la bitácora abierta o con un diálogo abierto queda fija. |
| ¿Hay solape con la viñeta DOM antigua (`.stress-vignette`)? | Hay solape de área y de rango, pero la DOM **no se ve**: sola, a estrés 100, suma una luminancia de borde de 0,0004 frente a 0,0062 de la de Phaser (un 6 %). **Recomiendo retirarla**; está en `simulation-play.component.ts` (otra pista) y dejo el cambio exacto en §5. |
| ¿El destello es suave? | **No lo era.** A 0,45 el salto de luminancia de la sala medido en pantalla fue 0,17 (el umbral de destello general de WCAG 2.3.1 es 0,10) y la escena entera se lavaba. **Bajado a 0,20: salto 0,056.** |
| ¿Qué tan brusca es la sacudida? | Riesgosa/inadecuada: ±3 px de canvas (≈ 4 px de pantalla), salto medio entre cuadros 2,5 px. Conducta prohibida: ±6 px, saltos de hasta 10 px de canvas (≈ 12 px de pantalla) a 60 Hz durante 260 ms: es un golpe seco. **No se toca (decisión de Producto); recomiendo limitarla a conducta prohibida** (§3). |
| ¿Escala del jugador v1? | 62,5 px de alto frente a 68-71 de los NPC (8-12 % menos). Dentro de lo razonable y sin evidencia clara. **`V1_AVATAR_SCALE` sigue en 1** (§4). |
| ¿Umbrales de estrés? | Unificada la viñeta de Phaser con `stress-tier.util` (60 y 85, los del HUD y el audio). La viñeta DOM (40) se retira. El tinte de la paciente (70) no es estrés: es `PatientState.crisisLevel` (§5). |

## 1. Cómo se midió

- Chromium real de Playwright con WebGL por software (SwiftShader), cuenta `tester2@psychosim.edu.co`, `playkit` en modo `laptop` (1366x768) y `touch` (844x390, táctil), intento nuevo en cada corrida. Capturas con `page.screenshot` y vistas con la herramienta de lectura de imágenes.
- Estado vivo: `ng.getComponent(document.querySelector('app-game-world')).scene` (`setStressLevel`, `crisisVignette`, `crisisPulse`, `cameras.main.flashEffect`, `cameras.main.shakeEffect`) y, para mover el estrés del intento entero (HUD, viñeta DOM y viñeta de Phaser a la vez), `ng.getComponent(document.querySelector('app-simulation-play')).attempt.set({ ...attempt(), stressIndex: n })`.
- Luminancia: luminancia relativa WCAG (sRGB lineal) de franjas de 4-40 px en los bordes del lienzo y de regiones de la sala, calculada con PIL/NumPy sobre las capturas.
- El WebGL por software da ≈ 20 cuadros por segundo y el reloj de Phaser va más lento que el de pared: **las duraciones y los FPS de este entorno no valen**; sí valen los valores que decide el código (alfa, color, desplazamientos) y las capturas.

## 2. Hallazgos

### 2.1 Viñeta de tono y de crisis (estrés 0, 45, 60, 80, 90, 100)

Capturas: `01-vineta-1366x768.png`, `02-vineta-844x390.png`, `06-pulso-valle-y-pico.png`, `08-otra-sala-sala-de-escucha.png`.

| Estrés | Alfa de la capa de crisis (antes → ahora) | Opacidad de la viñeta DOM | Qué se ve |
|---|---|---|---|
| 0 | 0 → 0 | 0 | Solo la viñeta de tono (borde oscuro y suave): enmarca la sala sin llamar la atención. |
| 45 | 0 → 0 | 0,08 | Igual que 0. |
| 60 | 0,16 → 0 | 0,18 | Antes: un velo apenas perceptible; ahora arranca en 60 (ver §3). |
| 80 | 0,47 → 0,44 | 0,32 | Marco vino claro en los tres bordes visibles. |
| 90 y 100 | pulso 0,55 ↔ 0,85 (sin cambio) | 0,38 y 0,45 | Marco vino más intenso que respira. |

Juicio, mirando las capturas:

- **Color.** `0x4a0f2e` (74, 15, 46) sobre un fondo casi negro da en el borde RGB (31, 13, 29) a alfa 0,55, (38, 13, 32) a 0,70 y (44, 14, 35) a 0,85. Es un vino/ciruela oscuro, no el rojo de las alertas del HUD. En la Sala de escucha (más cálida y violeta) queda aún más integrado (`08-otra-sala…`). Adecuado para un caso de VBG: presión, no peligro.
- **Opacidad.** El pico de 0,85 es la parte más fuerte; sigue siendo un marco oscuro, no una lámina de color. Se conserva el rango del pulso.
- **Grosor.** La banda es el 18 % del lado corto del rectángulo visible: 97 px de canvas = ≈ 115 px de pantalla en 1366x768 y ≈ 48 px en 844x390. Cae al cuadrado hacia dentro (a mitad de la banda queda el 25 % del alfa), así que lo visible son unos 55 px (24 px en 844x390). No invade el contenido: en urgencias la sala empieza a ≈ 70 px de pantalla del borde del lienzo (1366x768). Se conserva.
- **Pulso.** 800 ms por tramo (ciclo 1,6 s, 0,63 Hz). La luminancia de la franja del borde varía de 0,0068 a 0,0098: 0,003, treinta veces menos que el umbral de destello de WCAG (0,10) y a un quinto de la frecuencia de 3 Hz. No parpadea; respira.
- **Solape con la viñeta DOM.** La DOM (`radial-gradient(... rgba(120,40,55,.22))` por opacidad ≤ 0,45) llega como máximo a +8 niveles de rojo (de 255) en las esquinas del lienzo y +3 sobre el suelo de la sala, a estrés 100. Con las dos activas la luminancia del borde pasa de 0,0098 (solo Phaser) a 0,0104. Captura `03-capas-dom-y-phaser.png`: la tarjeta «solo DOM» es indistinguible de «ninguna».
- **Movimiento reducido y pausa.** Comprobado en vivo con estrés 92 (script `fx2` de la sesión): vivo 0,55 ↔ 0,85; con `reduceMotion` fijo y sin tween; con la bitácora abierta (`inputBlocked` → `motionPaused`) fijo; al cerrar vuelve a pulsar sin crear un segundo pulso (mismo `Tween` al cambiar el estrés de 92 a 93 o 94 a mitad de ciclo, 8 de 8 casos).
- **Escalón al pausar y reanudar.** Antes, la capa fija valía 0,70 y el pulso arrancaba en 0,55: al abrir un diálogo la opacidad saltaba del valor del pulso en ese instante (0,55-0,85) a 0,70 y al cerrarlo caía de 0,70 a 0,55, en un solo cuadro (el segundo salto, medido 6 de 6 veces). Ahora la fija es 0,55 (mínimo del pulso y final de la rampa): al reanudar no hay salto.

### 2.2 Destello al cambiar de sala

Capturas: `04-destello-antes-y-despues.png` (picos), `07-cruce-real-de-puerta.png` (cruce real).

- **Perfil.** El pico decidido por el código es `peakAlpha` y decae linealmente a 0 en `durationMs` (120 ms). Medido: 0,45 → 0,39 → 0,33 → 0,26 → … → 0,01; con el cambio, 0,2 → 0,17 → 0,14 → … Se aplica una sola vez (`pendingRoomFlash` se consume).
- **Tope 0,45.** Se capturó el fotograma del pico (destello largo con el mismo color y pico para poder fotografiarlo) en la sala de urgencias: la luminancia relativa media de la zona de juego pasa de 0,068 a **0,239** (salto 0,171; el modelo da 0,187), los sprites pierden contraste y toda la escena queda gris. Esto no es un «destello suave» en un caso de VBG, y supera el umbral de destello general de WCAG 2.3.1 (salto ≥ 0,10 con luminancia oscura < 0,8).
- **Ahora, 0,20.** Mismo fotograma: 0,068 → 0,123, **salto 0,056** (el modelo da 0,062; bajo 0,10 también sobre una escena casi negra, 0,03, y sobre una clara, 0,063). La sala se ilumina un instante sin lavarse. El color (214, 222, 236) no cambia.
- **Cruce real.** Se cruzó de verdad la puerta de Urgencias a la Sala de escucha (recoger el kit, hablar con la Familia, rodear a la psicóloga). Línea de tiempo en la página (SwiftShader, reloj de pared): fundido DOM a negro en ≈ 340 ms, cambio de mapa a ≈ 525 ms, vuelta a la escena a ≈ 770 ms, destello a partir de ≈ 960 ms. Es decir, el destello llega **después** del fundido de entrada, cuando la sala ya se ve (`playRevealEffects`), como se diseñó. Un solo destello por cruce, con el estrés en 0: no se probó cruzar con estrés crítico.
- **Ráfagas de capturas.** No alcanzan un destello de 120 ms: cada captura tarda 0,2-0,7 s con WebGL por software, y una captura continua del navegador (`Page.startScreencast`) llegó a pillar el fundido a negro (cuadro 4 de `07-…`) y, quizá, la cola del destello (+2 de luminancia media en el cuadro de ≈ 1,1 s), pero no el pico. Por eso el pico se midió en la página y se fotografió con destello largo.

#### Tres destellos por segundo (WCAG 2.3.1)

- Pulso de crisis: ciclo de 1,6 s, ≤ 0,63 por segundo, y sin salto de luminancia que cuente como destello (0,003).
- Destello de sala: un cruce dura como mínimo ≈ 0,75 s (340 ms de fundido + respuesta del servidor + 80 ms + 320 ms hasta mostrarse), así que a lo sumo hay ≈ 1,3 destellos por segundo, y haría falta cruzar puertas sin parar. Antes (0,45) cada cruce contaba como un destello general; ahora (0,056) ni siquiera supera el umbral.
- Pulso y destello juntos: ≤ 0,63 + 1,3 por segundo; por debajo de 3 incluso en el peor caso, y con el destello nuevo el cruce ya no cuenta como destello.
- La sacudida y el destello nunca coinciden (`playRevealEffects`); con movimiento reducido no hay ni destello ni sacudida ni pulso.

### 2.3 Sacudida de cámara tras una decisión riesgosa

Medido con `cameras.main.shakeEffect._offsetX/_offsetY` en cada cuadro de Phaser (14 sacudidas por tipo, 1366x768, canvas 960x540 a escala 1,19; `roundPixels` hace los desplazamientos enteros). Phaser sortea un desplazamiento nuevo, uniforme en ±(intensidad × ancho o alto), en **cada cuadro**: es ruido de alta frecuencia, no una oscilación.

| Tipo | Constante | Desplazamiento máximo (canvas) | Magnitud máxima | Salto medio entre cuadros | Salto máximo entre cuadros | En pantalla 1366x768 |
|---|---|---|---|---|---|---|
| RISKY o INADEQUATE | 0,003 · 200 ms | ±3 en x, ±2 en y | 3,6 px | 2,5 px | 5,1 px | magnitud ≈ 4,3 px; salto medio ≈ 3 px |
| Conducta prohibida | 0,006 · 260 ms | ±6 en x, ±3 en y | 6,3 px | 4,7 px | 10 px | magnitud ≈ 7,5 px; salto medio ≈ 5,6 px; **hasta ≈ 12 px de un cuadro al siguiente** |

A 60 Hz son 12 y 16 saltos aleatorios. En 844x390 (escala 0,50) todo se divide por dos.

Lectura: la riesgosa es casi imperceptible (≈ 3 px); la prohibida es un golpe seco, claramente perceptible. Con estos números no se afinó la constante: el problema no es la cantidad de píxeles sino el lenguaje (golpe/castigo; límite 2), y eso lo decide Producto (pregunta 5 del backlog).

**Recomendación.** Limitarla a conducta prohibida. Razones: (1) la sacudida de ±3 px tras una opción riesgosa casi no se ve, pero sí transmite «te equivocaste» (una señal de castigo asimétrica: nada tras las adecuadas); (2) la supervisión clínica, la viñeta y el HUD ya informan; (3) en conducta prohibida (revictimizar) un cierre físico de la escena sí puede justificarse pedagógicamente. La alternativa más prudente es quitarla del todo. Mientras Producto no decida se deja como está (`decisionShake`). Si se limita a prohibida, el cambio es una línea en `decisionShake` (devolver `null` si `!feedback.prohibitedConduct`) y su spec; si se conserva, bajar a 0,004 deja saltos de ≈ 8 px.

### 2.4 Escala del jugador v1 frente a NPC y muebles

Captura: `05-escala-jugador-y-npc.png`. Se midió la caja de píxeles no transparentes de cada sprite × su escala:

| Actor | Sprite | Alto visible | Ancho visible |
|---|---|---|---|
| Jugador v1 | `v1-valentina-idle`, 48x72 nativo, `V1_AVATAR_SCALE = 1` | **62,5 px** | 31 px |
| Enfermera | `cast-npc_colega-clinica`, escala 0,41 | 68,1 px | 41 px |
| Médico | `cast-npc_supervisor-clinico`, escala 0,42 | 71,0 px | 36,5 px |
| Psicóloga | `cast-npc_psicologa-hospitalaria`, escala 0,41 | 68,3 px | 45,5 px |
| Madre (familia) | `cast-npc_madre-vbg`, escala 0,41 | 68,5 px | 40,2 px |

El jugador es un 8-12 % más bajo (62,5 frente a 68-71) y de aspecto más esbelto: el NPC es «chibi» (cabeza grande) y el v1 tiene proporciones realistas, por eso la diferencia percibida es mayor que la de la altura. Los muebles y las puertas son coherentes con los NPC (≈ 41 px por metro: la puerta de urgencias mide ≈ 80 px, ≈ 1,95 m). En 844x390 todo se escala a la mitad y el jugador mide ≈ 31 px de alto.

**Decisión: no se cambia.** La diferencia está dentro de lo creíble (los NPC ya varían un 4 % entre sí) y la única corrección alcanzable por código es una escala no entera (p. ej. 1,1 → 52,8x79,2 px), que con `pixelArt` y `roundPixels` duplica filas y columnas de forma desigual y da el temblor de píxeles que prohíbe REGLA-009. La coherencia real (densidad de píxel y estilo) es una decisión de arte, el riesgo E ya aceptado: si se quiere paridad, exportar la hoja v1 a 54x81 (×1,125) en el pipeline de arte, no escalar en el motor. Nota: el «respirar» de todos los actores (`updateLivingActors`) ya modula `scaleY` entre ≈ 0,99 y 1,01 en jugador y NPC por igual; no se tocó.

### 2.5 Umbrales de estrés: cinco juegos

| Sistema | Antes | Ahora |
|---|---|---|
| HUD (etiquetas y clases `hud--stress-*`) | 25 / 50 / 75 | 30 / 60 / 85 (pista H, T7.5) |
| Audio | 30 / 60 / 85 | igual (`stress-tier.util`) |
| Viñeta de Phaser | aparece > 50; pulsa > 85 | **aparece > 60 (`STRESS_TIER_FLOORS.high`); pulsa desde 85 inclusive (`STRESS_TIER_FLOORS.critical`)** |
| Viñeta DOM (`simulation-play`) | 40 | sin cambio (otra pista); **recomiendo retirarla** (§5) |
| Tinte rojo y temblor del sprite de la paciente | `crisisLevel >= 70` | sin cambio: **no es estrés** |

Lo que se hizo: `CRISIS_VIGNETTE_START` y `CRISIS_PULSE_THRESHOLD` de `game-feel.util.ts` salen ahora de `STRESS_TIER_FLOORS`; un spec fija esa igualdad. El resultado coincide con lo que se ve: a 60 el HUD pasa a naranja y empieza la viñeta; a 85 el HUD pasa a rojo y empieza el pulso.

Lo que no se unifica: el sprite de la paciente reacciona a `PatientState.crisisLevel` (la crisis de la paciente que se simula), no a `stressIndex` (el estrés de quien juega). Son dos variables distintas y no deben compartir umbral.

## 3. Tabla de calibración

| Constante (archivo) | Antes | Ahora | Por qué |
|---|---|---|---|
| `CRISIS_VIGNETTE_START` (`game-feel.util.ts`) | 50 | `STRESS_TIER_FLOORS.high` = 60 | La viñeta aparecía antes que el color del HUD y la música; a 50-60 su alfa (≤ 0,16) es casi invisible, así que el cambio no se nota y alinea los tramos. |
| `CRISIS_PULSE_THRESHOLD` | 85 (pulsa > 85) | `STRESS_TIER_FLOORS.critical` = 85 (pulsa ≥ 85) | Mismo umbral que el tramo crítico del HUD y del audio; 85 exacto ya es «crítico». |
| Alfa fijo de la crisis con movimiento reducido o en pausa (`crisisVignetteState`) | 0,70 | 0,55 | Es el mínimo del pulso y el final de la rampa: al reanudar no hay escalón (antes 0,70 → 0,55 en un cuadro) y no hay salto de 84 a 85 con movimiento reducido. Es la respuesta a la pregunta 4 del informe nocturno: no «el nivel adecuado», sino el que no produce escalones. |
| Rampa de la crisis | 0 → 0,55 entre 50 y 85 | 0 → 0,55 entre 60 y 85 | Consecuencia de lo anterior; a 80 pasa de 0,47 a 0,44. |
| `peakAlpha` del destello de sala (`roomEntryFlash`) | 0,45 | **0,20** | Salto de luminancia medido: 0,171 → 0,056 (umbral WCAG 2.3.1: 0,10); a 0,45 la escena se lavaba. Un spec calcula el salto sobre tres escenas (casi negra, urgencias, clara) y exige < 0,10. |
| Duración del destello | 120 ms | 120 ms | Sin cambio. |
| Pulso de la crisis | 0,55 ↔ 0,85 · 800 ms por tramo | sin cambio | Visto a 90 y 100: marco oscuro y sobrio; 0,63 Hz, sin destello por definición. |
| Color de la crisis `0x4a0f2e` y banda del 18 % | — | sin cambio | Se ve, no alarma, no invade el contenido. |
| Tono `applyLightingOverlay` (banda 12 %, alfa 0,30) | — | sin cambio | Enmarca la sala sin leerse como efecto. |
| Sacudida (`decisionShake`) | 0,003 · 200 ms; 0,006 · 260 ms | sin cambio | Decisión de Producto (pregunta 5); medida y recomendación en §2.3. |
| `V1_AVATAR_SCALE` | 1 | 1 | Sin evidencia clara; una escala no entera rompe REGLA-009 (§2.4). |

Cobertura: `game-feel.util.spec.ts` (umbrales ligados a `stress-tier`, monotonía de la opacidad con y sin movimiento reducido, sin escalón, pico del destello y su cota de WCAG) y `game-world.game-feel.behaviour.spec.ts` (el pulso arranca donde quedó la fija; el destello usa el pico de la utilidad). Los contratos `game-world.game-feel.contract.spec.ts` y `simulation-play.game-feel.contract.spec.ts` no fijan estos valores y siguen intactos.

## 4. Decisión sobre la viñeta DOM antigua

**Retirarla.** Evidencia: (1) añade 0,0004 de luminancia de borde frente a 0,0062 de la de Phaser (6 %), a lo sumo +8 niveles de rojo en las esquinas a estrés 100 y +3 sobre el suelo; (2) dos viñetas del mismo color con umbrales distintos (40 y 60) contaban historias distintas; (3) cubre toda la zona del lienzo con una capa DOM con transición de 1,2 s que no aporta nada visible; (4) ningún spec ni e2e la nombra.

No se pudo hacer aquí porque `simulation-play.component.ts` es de la pista I2. El cambio exacto (todo en ese archivo; números de línea del árbol al cierre, pueden moverse):

1. Plantilla (≈ 311-312): borrar `<div class="stress-vignette" [class.vignette--active]="stressVignetteLevel() > 0" [style.--vignette-opacity]="stressVignetteLevel()" aria-hidden="true"></div>`.
2. Estilos (≈ 540-545): borrar `.stress-vignette { … }` y `.vignette--active { … }`; en la regla de movimiento reducido (≈ 1021) dejar `.scene-fade { transition: none; }`.
3. Clase (≈ 1210): borrar `readonly stressVignetteLevel = computed(…)`.

Además, `src/styles/styles.scss:367` define `.psy-stress-vignette`, que nada usa (se puede borrar).

## 5. Recomendaciones y decisiones para personas

1. **Producto (pregunta 5, límite 2):** sacudida tras una opción riesgosa. Recomendación: limitarla a conducta prohibida (§2.3); la más prudente, quitarla. Default actual: se mantiene.
2. **Ingeniería (I2):** retirar la viñeta DOM (§4).
3. **Psicología y UX (opcional):** una persona con historia de trauma puede encontrar el marco vino que respira demasiado presente a estrés crítico. Si se quisiera aún más sobrio, la palanca es el pico del pulso (0,85) y no el tinte; no hay evidencia para tocarlo hoy. Con movimiento reducido ya queda fijo en el mínimo.
4. **Ingeniería (P2, no hecho):** al subir el estrés por una decisión la opacidad cambia de golpe (p. ej. 60 → 80: 0 → 0,44), mientras la viñeta DOM antigua tenía una transición de 1,2 s. Al retirar la DOM se pierde esa suavidad; una transición corta (≈ 400 ms) del alfa estático en `applyCrisisState` lo resolvería. No se hizo porque exige cambiar el contrato del `Tween` y su spec y no hay evidencia de que moleste.
5. **Arte (riesgo E):** coherencia de densidad de píxel entre el v1 y los NPC horneados (§2.4).
6. **Comentario desactualizado:** la cabecera de `stress-tier.util.ts` (pista H) dice que la viñeta de Phaser sigue con sus umbrales; ya usa los de la utilidad.

## 6. Lo que no se pudo ver

- **FPS reales y la sensación de la sacudida en movimiento:** el WebGL por software (≈ 20 fps, reloj de Phaser más lento que el de pared) no sirve para medir rendimiento ni ritmo de animaciones. Los desplazamientos por cuadro sí valen; su percepción a 60 Hz es una inferencia.
- **El pico real del destello de 120 ms en un cruce:** medido en la página y fotografiado con destello largo, pero ninguna captura continua lo atrapó.
- **Otras salas** (comisaría, oficina, etc.): solo se vieron Urgencias y la Sala de escucha. Las salas más claras acusarían más el marco.
- **Una persona real:** nadie de Psicología ha juzgado el color ni la presencia del marco; el juicio de «sobrio» es mío con las capturas.
- **Táctil físico:** 844x390 es una emulación (viewport táctil), no un teléfono.
- **El escalón de opacidad al pausar:** con la fija en 0,55, abrir un diálogo en el pico del pulso baja la opacidad de 0,85 a 0,55 en un cuadro (el panel que se abre lo cubre en parte). No se alisó (§5, punto 4).
- **Lector de pantalla:** la viñeta es decoración dentro de `<canvas>`; no se probó con uno (no aplica).

## 7. Reproducir

Con el juego abierto y una partida en curso, en la consola (modo desarrollo):

```js
const scene = ng.getComponent(document.querySelector('app-game-world')).scene;
const play = ng.getComponent(document.querySelector('app-simulation-play'));
play.attempt.set({ ...play.attempt(), stressIndex: 92 });   // HUD + viñeta DOM + viñeta de Phaser
scene.crisisVignette.alpha; !!scene.crisisPulse?.isPlaying(); // 0,55-0,85 y true
play.reduceMotion.set(true);                                   // fija en 0,55, sin pulso
scene.cameras.main.shake(260, 0.006);                          // sacudida de conducta prohibida
```

Los scripts de medición (`sweep`, `iso`, `fx`, `fx2`, `fx3`, `shake`, `cross`) viven en el directorio de trabajo de la sesión, fuera del repo.

## 8. Índice de capturas (`2026-10-03-pase-visual/`)

| Archivo | Muestra |
|---|---|
| `01-vineta-1366x768.png` | Estrés 0, 45, 60, 80, 90 y 100 (picos) en 1366x768 |
| `02-vineta-844x390.png` | Los mismos estados en 844x390 táctil |
| `03-capas-dom-y-phaser.png` | Ninguna, solo viñeta DOM, solo Phaser (0,70) y ambas a estrés 100 |
| `04-destello-antes-y-despues.png` | Sin destello, pico 0,45 (antes) y pico 0,20 (ahora) |
| `05-escala-jugador-y-npc.png` | Jugador v1 junto a enfermera, médico, psicóloga y madre, con la altura visible de cada uno |
| `06-pulso-valle-y-pico.png` | Valle (0,55) y pico (0,85) del pulso a estrés 100 |
| `07-cruce-real-de-puerta.png` | Cruce real de Urgencias a la Sala de escucha: antes, fundido a negro y después |
| `08-otra-sala-sala-de-escucha.png` | La Sala de escucha a estrés 0, 80 y 100 (pico) |
