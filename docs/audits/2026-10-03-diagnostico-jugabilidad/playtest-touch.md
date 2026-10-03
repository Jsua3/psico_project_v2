# Playtest táctil (jugador de prueba 2): SIEP, caso SIM-VBG-001

Cuenta: tester2@psychosim.edu.co. Todo con toques (tap, mantener pulsado, arrastre táctil por CDP), nunca teclado.
Dispositivos: móvil horizontal 844x390 (modo `touch`), tablet 1024x768 y móvil vertical 390x844 (`isMobile`, `hasTouch`).
El tablet y el vertical se probaron cambiando el viewport sobre la misma partida (equivale a girar el equipo), no con intentos separados.
Capturas: `(capturas no versionadas) shots/pt-touch/` (se citan por número, por ejemplo `25-listen-opts7.png`).
Persona: estudiante de séptimo semestre que entra por primera vez y razona solo con lo que ve.

## Hasta dónde llegué

Lobby, consentimiento, introducción, contexto, escena 1 (Urgencias) y la Sala de escucha familiar.

- Recogí el Kit PAP y hablé con "Familia en crisis" en Urgencias.
- Crucé la puerta a la Sala de escucha y abrí la primera decisión clínica.
- En horizontal 844x390 solo se ve la opción 3, así que no pude elegir con el dedo. Cambié a vertical y elegí la opción 2.
- La respuesta fue "Información incompleta: falta hablar con enfermera-urgencias antes de decidir". Elegí "Explorar primero" y volví a Urgencias.
- No conseguí que aparezca el botón para hablar con la enfermera ni con el "Médico de guardia" tras unas 14 pulsaciones (TOUCH-12). No vi el resultado de la decisión 1 ni las escenas 2 a 8.

Cuánto tardé en descubrir qué hacer, en acciones:

| Qué quería | Acciones | Cómo lo descubrí |
|---|---|---|
| Entender cómo moverme | 4 | Toqué "Interactuar" (nada), toqué al NPC (nada), toqué una flecha (se mueve unos 10 px), mantuve la flecha (camina) |
| Saber qué objeto es interactivo | 7 | Solo cuando mis pies están a menos de unos 60 px aparece el nombre, abajo a la derecha |
| Saber qué hacer en la escena | no resuelto | El objetivo ("Estabiliza emocionalmente a la familia...") no dice a quién hablar ni a dónde ir. Lo supe por una frase suelta dentro de un diálogo |

## Qué funciona bien

- El D-pad (48x48) y "Interactuar" (48 de alto) superan 44 px. El header (34x34) cumple los 24 px de WCAG 2.2 AA, aunque queda por debajo de 44.
- Mantener una flecha pulsada sigue caminando aunque el botón se mueva bajo el dedo por un cambio de layout.
- En vertical, la decisión sí cabe (3 opciones visibles y pulsables) y el D-pad queda fuera del mundo (`31-portrait-decision.png`, `35-portrait-world.png`).
- En tablet, el mundo se ve grande (998x561) y la decisión cabe completa (`30-tablet-decision.png`, `39-tablet-world.png`).
- "Salida segura" es visible y de 144x47 en el mundo (fuera de diálogos). La orientación del DÓNDE funciona: "La sala de escucha está al fondo a la derecha".

## Hallazgos

### TOUCH-01 (blocker): en móvil horizontal, las opciones de la decisión 1 y 2 son inalcanzables

- Al abrir la decisión en 844x390, el panel derecho muestra primero el resumen de escena (kicker, título y 4 líneas de narrativa). Debajo queda una franja de solo 101 px para pregunta y opciones.
- Medí `scrollTop=666`, `scrollHeight=767`, `clientHeight=101`. La franja está anclada abajo: solo se ve la mitad inferior de la opción 3 (`25-listen-opts7.png`, `27-opts-swipe2.png`).
- Arrastrar con el dedo no mueve la lista. Al forzar `scrollTop=0` vuelve a 666 en menos de 700 ms.
- `elementFromPoint` sobre donde estarían las opciones 1 y 2 devuelve el párrafo de narrativa. No se pueden tocar.
- Tampoco se ve el nombre del hablante, que queda por encima del borde de la franja (`15-dialog-typed.png`). Con teclado sí se llegaría con 1, 2, 3, pero no hay teclado.
- Causa: `frontend/src/app/features/simulator/dialogue-panel.component.ts:517-521` (`ngAfterViewChecked` hace `el.scrollTop = el.scrollHeight` en cada ciclo de detección). A eso se suma `simulation-play.component.ts:271-285`, donde el resumen de escena se pinta siempre sobre el diálogo.
- Arreglo: no anclar abajo salvo mientras se escribe el texto y solo si el usuario no ha desplazado. En alturas menores de 480 px o con puntero táctil, ocultar o colapsar `right-panel__scene` mientras haya opciones. Mostrar pregunta y hablante fijos arriba y que las opciones se desplacen. Añadir un indicador de scroll. No reordenar ni resaltar opciones (límite 1).

### TOUCH-02 (blocker, REGLA-004/ETH-02): "Salida segura" se ve pero no responde durante un diálogo

- `inputBlocked()` incluye `dialogue() !== null` (`simulation-play.component.ts:947-950`). El `<footer class="bottom-zone">` y el `top-bar` llevan `[attr.inert]` con ese valor (líneas 212 y 289).
- Verifiqué `inert=true` y `aria-hidden=true` en el footer con el diálogo abierto. En el diálogo lateral el botón sigue pintado abajo a la izquierda (`25-listen-opts7.png`) y el toque no hace nada (`29-safe-exit-tap-in-dialog.png`).
- Con la franja ancha de retroalimentación, `elementFromPoint` sobre el botón devuelve `DIV.portrait` (`16-dialog-after-6.png`).
- En la pantalla de opciones no hay "Cerrar diálogo". En feedback sí existe un botón "Continuar", pero su nombre accesible es "Cerrar diálogo (Esc)".
- En táctil no existe Esc, así que durante una decisión no hay salida segura ni forma de cerrar.
- En consentimiento, introducción y contexto no probé si hay salida segura, aparte de "Volver al catálogo" en el consentimiento.
- Arreglo: botón "Salida segura" (pausa PAUSED) dentro del panel de diálogo y de los overlays, fuera de cualquier `inert`, o excluirlo del `inert`. Quitar "(Esc)" de lo que se ve en táctil.

### TOUCH-03 (high): los diálogos de entrada son casi ilegibles en móvil horizontal

- Consentimiento: solo se ven 99 de 217 px de texto. La frase "Durante el caso tendrás disponible la salida segura (Esc)" queda bajo el pliegue (`02-after-entrar.png`, `03-consent-scrolled.png`). El aviso ETH-01 se corta.
- Contexto inicial: se ven unos 84 de 518 px, 2,5 líneas de 12 (`05-context.png`). Sin degradado ni indicador de scroll.
- "Continuar" está activo sin leer nada. Arrastrar con el dedo sí desplaza, pero con una ventana de 84 px hacen falta unas 6 pasadas.
- Introducción: el video (384x215) queda recortado por el pie y la etiqueta "HOSPITAL · URGENCIAS · NOCHE" se pisa con los controles. No hay "saltar" (`04-intro-video.png`).
- Arreglo: en alturas cortas, cabecera compacta y pie fijo. Texto en 2 o 3 páginas con "Seguir leyendo". Degradado inferior como señal de scroll.

### TOUCH-04 (high): el mundo cambia de tamaño al acercarme a un objeto y no se recupera

- Con un objeto cerca, la barra inferior pasa de 47 a 93 px (hasta unos 110 con puertas con nombre largo). El escenario baja de 264 a 218 px y el D-pad salta 46 px hacia arriba (y=184 → y=138).
- Al alejarme, el host vuelve a 264 px pero el canvas se queda en 387x218 y desplazado (`19-right-1500.png`). Medido: host 818x264, canvas 387x218 en y=82.
- Al inicio el canvas era de 469x264 (`06-world-t0.png`). Tras volver de otros viewports queda en 416x234 (`40-landscape-return.png`).
- Causas (inferencia): la barra inferior no reserva altura fija para el prompt. La escala de Phaser no se refresca cuando el host crece.
- Arreglo: altura fija de la barra con el nombre en una sola línea. `ResizeObserver` → `scale.refresh()` en `game-world.component.ts`.

### TOUCH-05 (high): los controles táctiles y la tarjeta de objetivo tapan el mundo

- En 844x390 el D-pad es una fila horizontal de 377x48 en el centro vertical del mundo (`game-world.component.ts:2387-2437`, visible con `@media (pointer: coarse)` en la línea 2493). Tapa al médico, la camilla y la enfermería (`06-world-t0.png`).
- La tarjeta de objetivo (380x120) cubre la esquina superior izquierda y no se puede cerrar.
- Con el panel lateral de diálogo abierto, la tarjeta y el D-pad cubren la mayor parte del mundo, y las flechas se dibujan sobre el texto del objetivo (`14-dialog-open.png`).
- "Interactuar" queda reducido a 44 px y muestra "Interac" (`15-dialog-typed.png`, `35-portrait-world.png`).
- Arreglo: cruceta abajo a la izquierda y "Interactuar" abajo a la derecha, fuera del canvas. Objetivo como chip colapsable en táctil. Etiqueta sin recorte.

### TOUCH-06 (high): "Interactuar" no dice con qué interactúa y los toques en el mundo no hacen nada

- El botón central es siempre el mismo, aunque no haya nada cerca. Sin objeto, no da ninguna señal (`08-tap-interact-nothing.png`). Tocar al NPC tampoco hace nada (`09-tap-nurse.png`).
- La etiqueta real aparece en otro botón (chip abajo a la derecha, 112x77) con texto recortado: "Primer... Auxilio..." y "Sala de escucha familiar →" en 3 líneas. Hay dos botones de interacción. Esto alimenta TOUCH-04.
- Un toque corto en la flecha mueve solo 20 px de mundo (~10 px de pantalla). Hay que mantener pulsado y nada lo explica.
- Arreglo: un único botón "Hablar con Familia en crisis" / "Pasar a Sala de escucha" / "Recoger Kit PAP", atenuado si no hay objetivo, con aviso "Acércate a alguien". Aceptar toque sobre el NPC como "ir y hablar". Texto de ayuda al primer uso: "Mantén pulsada la flecha".

### TOUCH-07 (high): atajos de teclado en pantallas donde no sirven

- Lobby: "← → / A D mover · E entrar" y "Entrar al caso (E)" (`01-lobby.png`).
- Mundo: `simulation-play.component.ts:316` pinta "WASD mover · E interactuar · J bitácora · Esc salida segura", que se pisa con las ranuras 4 y 5 de herramientas (`06-world-t0.png`, `39-tablet-world.png`). Las ranuras llevan insignias 1 a 5, la ficha de interacción lleva "E" y "Salida segura" lleva "Esc".
- Textos y nombres accesibles: "(Esc)" en el consentimiento, "(atajo E)", "(J)", "Salida segura (Escape)".
- Arreglo: ocultar con `@media (hover: none), (pointer: coarse)` o no renderizar. Cambiar por "Toca Salida segura".

### TOUCH-08 (high): no se sabe qué hacer, y el bloqueo de la decisión es invisible

- El objetivo es siempre "Estabiliza emocionalmente a la familia y evita acciones prematuras...". No cambia al pasar de sala ni tras interactuar, y no lista a quién hablar.
- Crucé la puerta (la interacción se ejecuta al instante) sin ninguna señal de "escena terminada" o "te falta algo" (`22-door-try.png`).
- Las 3 opciones llevan la etiqueta "INFORMACIÓN INCOMPLETA" sin explicar qué significa (`30-tablet-decision.png`).
- Al elegir salió: "Información incompleta: falta hablar con enfermera-urgencias antes de decidir" (`33-portrait-msg-full.png`). Es un identificador interno (slug) visible al jugador. Luego salió "Explorar primero / Decidir con información incompleta".
- Esa es la primera vez que se dice a quién hablar, y solo después de haber elegido.
- Arreglo: objetivo con lista viva ("Habla con: Enfermera de urgencias, Familia en crisis"), con nombres legibles. Explicar la etiqueta antes de elegir: "Aún no hablaste con X". No resaltar nunca cuál opción es la adecuada (límite 1).

### TOUCH-09 (high): dos pantallas del flujo no son claras sobre quién habla

- En el panel lateral, el nombre del hablante queda fuera de vista. Con la franja de feedback aparece "HERRAMIENTA PERTINENTE" donde antes estaba el nombre (`16-dialog-after-6.png`).
- El botón "Continuar ▶" tiene como nombre accesible "Cerrar diálogo (Esc)". "Siguiente ▶" se llama "Mostrar siguiente intervención". Incumple "etiqueta en el nombre" (WCAG 2.5.3).
- Arreglo: hablante fijo arriba del panel. Nombre accesible igual a la etiqueta visible.

### TOUCH-10 (high, límite 1; inferencia): una frase del NPC adelanta la respuesta de la decisión 1

- En Urgencias, el diálogo de "Familia en crisis" termina con "(La familia necesita contención antes de cualquier información difícil. La sala de escucha está al fondo a la derecha.)" y un único botón "1 Aplicar PAP a la familia en crisis". Ese botón no es una elección real.
- Después, en la Sala de escucha, la decisión ofrece "Aplicar PAP: contención emocional..." (`16-dialog-after-6.png`, `25-listen-opts7.png`).
- Está bien orientar el DÓNDE ("al fondo a la derecha"). Adelantar cuál intervención conviene antes de decidir viola el límite 1. Inferencia: asumo que PAP es la opción adecuada; debe confirmarlo el equipo clínico.
- Arreglo: dejar solo la orientación espacial y mover la intención clínica al feedback posterior.

### TOUCH-11 (medium): recoger el Kit PAP no da respuesta y las herramientas bloqueadas no se explican

- Al recoger el Kit PAP desaparece el objeto y se ilumina la ranura 1. No vi aviso ni mensaje (`11-interact-kit.png`).
- Las ranuras 2 a 5 tienen candado sin texto, y los nombres se recortan ("Primeros Auxil...", "Protocolo EPIC..."). No probé tocar una ranura bloqueada.
- Arreglo: aviso breve "Obtuviste: Kit PAP. Se desbloquea la herramienta Primeros Auxilios Psicológicos". En las bloqueadas, mostrar "Se desbloquea al...". Quitar las insignias numéricas en táctil.

### TOUCH-12 (high; inferencia): no conseguí hablar con la enfermera en unas 14 pulsaciones

- Cerca del "Médico de guardia" y de la mesa de recepción, el botón sigue diciendo "Acceso a quirófano" aunque el personaje está pegado al médico (`37-portrait-toward-nurse.png`, `39-tablet-world.png`).
- Una pulsación a la izquierda en (611, 252) dejó x sin cambiar durante 350 ms (posible choque con la mesa).
- El prompt de la puerta restringida gana sobre el del NPC necesario para desbloquear la decisión (inferencia; ver `interaction-priority.util.ts` para confirmarlo).
- Sin NPC mínimo alcanzable no se puede completar la decisión sin elegir "Decidir con información incompleta".
- Arreglo: priorizar al NPC sin visitar sobre la puerta restringida, o empujar al jugador al centro de su radio. Alinear las áreas de colisión de la mesa.

### TOUCH-13 (medium): móvil vertical

- La HUD se reduce a "0%" sin etiqueta y la puntuación (se pierde título, escenario, confianza y bienestar) (`35-portrait-world.png`).
- La tarjeta de objetivo se corta con puntos suspensivos ("...evita la...").
- El inventario se corta a la derecha (solo se ve la ranura 1 y media 2).
- El mundo ocupa 372x209 en una pantalla de 844 px de alto.
- El diálogo es una hoja inferior que cubre el 60% y corta el resumen de escena a media línea (`31-portrait-decision.png`).
- Arreglo: HUD mínima con etiquetas, inventario con scroll visible o 2 filas, zoom de cámara al personaje.

### TOUCH-14 (medium): tablet 1024x768, colisión de textos en el encabezado

- La píldora "Escenario 1 de 8" se superpone al título "Violencia Familiar y Tentativa d..." y a la etiqueta "ESTRÉS" (`30-tablet-decision.png`, `39-tablet-world.png`).
- Hay un bloque rojo oscuro de 20 px en el panel derecho encima del nombre del hablante (`30-tablet-decision.png`). Inferencia: retrato o chip de emoción cortado.
- La etiqueta "Médico de guardia" y el rótulo "Acceso a quiróf..." se solapan en el mundo (`39-tablet-world.png`).

### TOUCH-15 (low): dos iconos de salida casi iguales

- Arriba a la derecha, "Volver al catálogo de simulaciones" usa el glifo de salida y mide 34x34 (cumple 24 px, pero queda por debajo de 44). Abajo a la izquierda está "Salida segura". Pueden confundirse (`06-world-t0.png`).
- Arreglo: icono distinto (casa/lista) para volver al catálogo. Subir el header a 44 px.

## Lo que no pude verificar

- Escenas 2 a 8, la puerta de salida de la escena 1 y el resultado completo de la decisión 1.
- Pulsar una herramienta bloqueada y la bitácora J con el dedo.
- Salida segura dentro de los overlays de consentimiento, introducción y contexto.
- Reproducción de audio (solo vi el botón "Silenciar música").
