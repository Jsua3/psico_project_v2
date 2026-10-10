# Revisión REGLA-004 (salida segura) y accesibilidad — cuenta tester4

Rama `claude/peaceful-goodall-a2gobv` (HEAD 77d369f). Todo medido jugando con Chromium real (playkit, laptop 1366x768 y touch 844x390 con `hasTouch`/`isMobile`, toques con `touchscreen.tap`). Scripts y salidas en este mismo directorio, prefijo `sa-` (`sa-h1.mjs`, `sa-a11y.mjs`, `sa-live.mjs`, `sa-motion.mjs`, `sa-kbd.mjs`, `sa-resume-fold.mjs`, `sa-hang.mjs`, `sa-door.mjs`, `sa-contrast.mjs`, `sa-esc-repeat.mjs`, `sa-opts.mjs`, `sa-resume.mjs`, `s1-intro.mjs`, `s2-world.mjs`). Capturas en `sa-*/`. Sin servicios reiniciados, un solo Chromium a la vez, solo tester4.

## 0. Veredicto

La salida segura está bien resuelta en TODOS los estados estacionarios de F§4.7 (un solo botón operable, pausa real, sin dobles pausas, sin banderas colgadas, reanudar correcto). Los fallos están en los bordes: **el fundido de escena tapa el pie mientras una puerta o una decisión esperan al servidor (F1, el más grave)**, una petición colgada deja la pausa en cola sin plazo (F2), el aviso de reanudar pierde su única salida en 844x390 (F3), y hay un fallo de contraste AA nuevo en el botón táctil «Interactuar» en reposo (F4). El resto es bajo.

axe-core 4.12 (`wcag2a/2aa/21a/21aa/22aa`) sobre consentimiento, introducción, contexto, mundo (con y sin tarjeta de ayuda, tarjeta «Qué hacer» plegada y desplegada), ayuda, ajustes, bitácora, diálogo con y sin opciones y pausa (también con «Ver mi seguimiento» abierto): **0 violaciones en laptop; en touch 1 `color-contrast` serious (F4)**. Ninguna violación de tamaño de objetivo (2.5.8): el mínimo medido es 28x28 (≥ 24).

## 1. Matriz de salida segura (F§4.7)

Medición por estado: botones cuyo nombre o texto contiene «Salida segura»/«Pausando»; visible, dentro del viewport, sin `inert`/`aria-hidden` en ancestros, `elementFromPoint` en 5 puntos (centro y cuatro) y tamaño. Luego pulsar de verdad (clic o toque), contar POST `…/safe-exit`, esperar `PAUSED`, comprobar el foco, reanudar y ver qué queda.

| Estado | laptop | touch 844x390 | Pausa real (POST 200 PAUSED) | Esc |
|---|---|---|---|---|
| Aviso de contenido ETH-01 | ninguno (por diseño); «Volver al catálogo» | igual | n/a | tragado: 0 POST, el aviso sigue |
| Aviso de reanudar | ninguno (por diseño); 3 botones visibles | **«Volver al catálogo» fuera de pantalla y sin scroll (F3)** | n/a | no hace nada, 0 POST |
| Introducción animada | 1 botón en la tarjeta, 181x44, centro alcanzable; el del pie queda `inert`+`aria-hidden` y cubierto | 154x44 | sí (clic, doble clic, Esc, Esc+clic: siempre 1 POST); reanudar reabre la introducción con foco en «Continuar» | pausa (1 POST) |
| Contexto inicial | 181x44 | 154x44 | sí; al reanudar reaparece la introducción (no el contexto), ver obs. 1 | pausa |
| Exploración con tarjeta de ayuda | pie 144x46 | 136x44 | sí | pausa |
| Exploración | idem | idem | sí | pausa |
| Ajustes abiertos | pie operable | pie operable | sí, ajustes cerrados al reanudar | cierra ajustes, 0 POST (F11) |
| Ayuda abierta | pie operable | pie operable | sí, ayuda cerrada al reanudar | cierra la ayuda, 0 POST (F11) |
| Diálogo con opciones | cabecera 154x44 | 154x44 | sí; reabrir el diálogo tras reanudar funciona | cierra; segundo Esc pausa (1 POST) |
| Diálogo sin opciones | 154x44 | 154x44 | sí | idem |
| Supervisión (decisión 1) | 154x44 | 154x44 | sí; al reanudar «Decisión 2 de 6», sin supervisión repetida ni banner colgado | idem |
| Supervisión de la última decisión (intento COMPLETED, respuesta reescrita) | 154x44 | 154x44 | **no llama al servidor (0 POST)**: «Salida segura», Esc, «Volver al mapa» abren el resultado; doble toque y triple Esc: un solo resultado | abre el resultado |
| Bitácora | pie de la bitácora 154x44 | 154x44 | sí; bitácora cerrada al reanudar | cierra, 0 POST |
| Pausa | «Reanudar este intento» 228x44 con foco y visible (y=168-179); sin botón «Salida segura» | igual | n/a | no hace nada |
| Petición en curso (interacción, sin fundido) | pie operable, el toque pone «Pausando…» y espera | igual | sí al terminar la petición | encola |
| **Petición en curso con fundido (puerta, decisión)** | **pie cubierto por `div.scene-fade`, 0 operables (F1)** | **idem** | solo por Esc (se encola) | encola |

Supervisión de la última decisión: no hay trampa. El resultado se ve (sección a pantalla completa, opacidad 1, nada encima), el foco va a `section.outcome` (nunca a un botón), 0 llamadas a `/safe-exit`, un Esc más no hace nada. Capturas `sa-h1-last-*/`. Salidas del resultado: «Reintentar caso», «Volver al simulador», «Volver al portal»; en 844x390 quedan bajo el pliegue (hay que desplazar), obs. 2.

## 2. Hallazgos

### F1 (CONFIRMED, alto) El fundido de escena tapa «Salida segura» mientras espera al servidor
- `simulation-play.component.ts:923-927` (`.scene-fade`: `position: fixed; inset: 0; z-index: 200`, `--active { opacity:1; pointer-events:auto }`), activado por `triggerFade` (`:2515-2519`) en `tryOpenDoor` (`:1832`) y `executeDecision` (`:2058`), y no se suelta hasta que vuelve la respuesta (`applyLoadedWorld`, +80 ms).
- Medido (`sa-h1.mjs fade`, respuesta de `/enter-room` y de `/decisions` retrasada 7 s con `page.route`): `elementFromPoint` en el centro del pie = `div.scene-fade`, `operable()` = `[]`, el toque en el pie no envía POST (0), la pantalla está entera negra (`sa-h1-fade-*/01-puerta-fade.png`, `05-decision-fade.png`). Solo Esc llega: encola, aparece «Pausando el caso…» (z 420) y la pausa se ejecuta cuando responde el servidor (a los ~8 s). Idéntico en laptop y touch.
- Con la latencia local normal el hueco dura ~500 ms (`sa-fade-natural.mjs`: puerta 480-500 ms, decisión 500 ms); con red lenta o servidor atascado dura lo que tarde la petición. Un usuario táctil no tiene vía de salida en ese intervalo; F§4.7 («Petición en curso: se acepta el toque») y AC-2 no se cumplen en ese estado.
- Arreglo mínimo: que el pie quede por encima del fundido mientras `fadeActive()` (por ejemplo, `.scene-fade { bottom: <alto del pie> }` o dejar el pie fuera del contexto de apilamiento y por encima de 200), o quitar `pointer-events:auto` del fundido (la entrada ya está bloqueada por `busy()`). Añadir al e2e `safe-exit` un caso con `page.route` retrasando `enter-room`/`decisions`.

### F2 (CONFIRMED, medio) Una petición colgada deja la pausa en cola sin plazo
- `simulation-play.component.ts:1394-1397` (efecto que espera a `busy()`), `:2246-2263`. Sin timeout HTTP en el cliente.
- `sa-hang.mjs`: `POST /interactions/tool-pap` que nunca responde; toque en el pie: «Pausando…» (`aria-busy`) y a los 13 s 0 POST `/safe-exit`; Esc y otro toque no cambian nada; al abortar la petición sale la pausa. El diseño lo acepta (F§7.8), pero contradice «alcanzable siempre»: el estudiante solo puede recargar. Combinado con F1 (decisión/puerta colgadas) la pantalla queda negra indefinidamente.
- Arreglo: plazo de seguridad (p. ej. 8-10 s) tras el cual la pausa se envía igualmente (el servidor ya valida el token), y aviso visible del estado.

### F3 (CONFIRMED, medio) Aviso de reanudar en 844x390: la única salida queda fuera de pantalla y sin scroll
- Template `simulation-play.component.ts:132-157`, CSS `.resume-overlay` (`:989`, sin `overflow`) dentro de `.game-container { overflow: hidden }` (`:473`).
- `sa-resume-fold.mjs touch`: viewport 844x390, la tarjeta mide 469 px (top 24, bottom 493); «Continuar» y parte de «Iniciar nuevo intento» se ven; «Volver al catálogo» (410-458) queda fuera, y rueda y arrastre táctil (CDP `synthesizeScrollGesture`) no mueven nada (`sa-resume-fold-touch/01-aviso.png`). Con teclado, Tab sí lo trae a la vista. Laptop: los tres a la vista. La tabla F§4.7 dice que ese estado conserva «Volver al catálogo»: en el móvil horizontal no es alcanzable (quien no quiere seguir tiene que reanudar y salir después).
- Arreglo: `overflow-y: auto` y `max-height: 100%` en la tarjeta/overlay, o compactar la tarjeta en pantallas bajas (misma receta que `.case-intro-card`).

### F4 (CONFIRMED, medio) Contraste AA (1.4.3) del botón táctil «Interactuar» en reposo
- `game-world.component.ts:2864` (`.touch-interact--idle { color: rgba(232,240,244,.78) }`, commit afe8ef0) sobre el vidrio claro de `.psy-button--glass` (`styles.scss:543`, `rgba(255,255,255,.52)`). Solo en anchos ≥ 700 px: la variante oscura de `:2926-2927` aplica a < 700 px.
- axe (serious) y `sa-contrast.mjs`: «Acércate a algo», fg #d4dadf sobre #8b8e95 = **2,32:1** (mínimo 4,5) en 844x390 y en tableta 1024x768; con algo cerca (texto oscuro) 5,45:1. El estado de reposo es el más frecuente (`sa-contrast-touch/crop-reposo.png`: gris sobre gris).
- Arreglo: en ≥ 700 px mantener texto oscuro (p. ej. `#2b333b`) y marcar el reposo con borde discontinuo/opacidad solo del icono, o usar el fondo oscuro translúcido en todo `pointer: coarse`.

### F5 (CONFIRMED, bajo-medio) Un Esc mantenido cierra y además pausa
- `simulation-play.component.ts:1609-1615` no mira `event.repeat`; `dialogueKeyAction` (`dialogue-progression.util.ts`) cierra con Esc incluso repetido.
- `sa-esc-repeat.mjs`: con un diálogo, la bitácora y la ayuda, un Esc seguido de eventos `repeat:true` (y la tecla real mantenida con `keyboard.down` repetido) cierra la superposición y envía 1 POST `/safe-exit` en los cuatro casos. Quien pulsa Esc más tiempo del habitual (temblor, pulsación larga) acaba en «Tu caso está en pausa» sin querer; es recuperable pero confunde.
- Arreglo: `if (event.repeat) return;` en la rama de Esc.

### F6 (CONFIRMED, medio-bajo) Anuncios de regiones vivas duplicados o ruidosos
- Puerta cerrada: el mismo texto sale en `div.door-notice[role=alert]` y `div.sr-only[assertive]` con 12-56 ms de diferencia (`:106` + `announce` en `:1861`) y, al acercarse, también en `div.context-bar[aria-live=polite]` (3 anuncios en ~1 s). Preexistente, pero es lo que pidió la lente.
- Usar herramienta: `p.visually-hidden[status/polite]` del panel (`dialogue-panel.component.ts:81`) y `div.sr-only[assertive]` (`simulation-play.component.ts:2395`) leen el mismo «Has aplicado Primeros Auxilios Psicológicos…» con 60 ms de diferencia.
- Cambio de sala: `div.sr-only` «Entraste a …» (`:1841`) + `div.room-banner[role=status]` (`:124`) + nota de la tarjeta «Anotado: llegaste a …» + barra, cuatro en < 100 ms.
- La barra (`:364`, `aria-live=polite aria-atomic`) mete la leyenda «WASD mover · E interactuar · J bitácora · Esc salida segura» (`:392`) dentro de la región viva: se vuelve a leer entera cada vez que la barra vuelve a reposo (tras cada diálogo, al alejarse de un objeto; ~10 veces en el recorrido de H1, `sa-live-laptop2.out`). En touch la leyenda está `display:none`, no se lee.
- La tarjeta «Qué hacer» y `.soft-notice` están bien: una sola región cada una, sin duplicar entre ellas.
- Arreglo: sacar la leyenda de la región viva (o `aria-hidden`), quitar `role=alert` del aviso de puerta o el `announce`, no llamar a `announce` si ya hay región con el mismo texto.

### F7 (CONFIRMED, bajo) Banner de etapa por encima de la pantalla de pausa
- `.room-banner` z 320 (`:970`) frente a la pausa z 150 (`attempt-outcome.component.ts:183`); `resetNotices()` (`:2770-2779`) no apaga banner, aviso de puerta ni `transition-note`.
- Pausa en cola tras decidir (`sa-h1.mjs fade`): «Nueva etapa: Marco normativo en salud» queda pintado encima del texto «Tu avance quedó guardado…» más de 1,5 s (`sa-h1-fade-laptop/07-decision-pausa.png`) y es `role=status` (se anuncia en plena pausa). Aviso de puerta y nota de transición: PLAUSIBLE por la misma causa (no se limpian).
- Arreglo: limpiar `roomBanner`, `doorNotice`, `transitionNote` en `clearTransientOverlays()` o subir la pausa por encima.

### F8 (CONFIRMED, bajo) La pausa en cola tras cruzar una puerta manda la posición de la sala vieja con la clave de la sala nueva
- Efecto `:1394-1397` arranca en el mismo instante en que `applyLoadedWorld` suelta `busy`; `withSyncedPosition` (`:2877-2900`) lee `gameWorld.playerPosition()` antes de que Phaser recoloque al jugador.
- `sa-door.mjs`: `PATCH …/world-state {"playerX":829,"playerY":465,"currentMapKey":"hospital-sala-escucha"}` → 400 «Desplazamiento no plausible para el tiempo transcurrido» (también en touch). Se traga el error y la pausa sigue; tras reanudar el jugador queda en el punto de entrada (160,452). Hoy inocuo gracias a la validación del servidor; si unas coordenadas viejas fueran plausibles en la sala nueva se guardaría una posición falsa. Ruido: error 400 en consola.
- Arreglo: al encolar tras un cambio de sala, saltar la sincronización de posición (o esperar a `world-ready`).

### F9 (CONFIRMED, bajo) El interruptor «Movimiento reducido» del juego no apaga las animaciones CSS, solo `prefers-reduced-motion` del sistema
- `simulation-play.component.ts:1146-1150` (el bloque solo cuelga de la media query). Con el interruptor en On (`sa-motion-toggle-*.out`) siguen: `sheet-up` (nuevo, T10.3, `:1036`, `:1114`), `panel-in`, `choice-in`, `door-notice-in`, `tool-pop`, transiciones de la bitácora y `fade-in` del fondo.
- Con `prefers-reduced-motion: reduce` emulado (`sa-motion-os-*.out`): 0 animaciones CSS y transiciones de 1 ms (regla global `styles.scss:681-688`); la introducción animada se omite. Lo nuevo propio (tarjeta «Qué hacer», `.soft-notice`, `.pausing-notice`, ayuda) es estático en ambos casos; el anillo y los rótulos de Phaser no usan tweens.
- Arreglo: aplicar `reduceMotion()` también como clase en `.game-container` y apagar ahí las animaciones.

### F10 (CONFIRMED, bajo, preexistente) Foco de la bitácora
- `journal-panel.component.ts:21-27` (sin cambios en esta rama): abierta con Enter desde el botón del HUD el foco queda en `body` (`sa-kbd-laptop.out`: «tras Enter (bitácora abierta): body»); tras Esc el foco puede quedar en `button.sheet-close` ya oculto (`obscured:true` a los 900 ms). Los botones nuevos de la bitácora (pie, «Salida segura») sí se alcanzan con Tab.

### F11 (CONFIRMED, bajo) «Esc» visible donde Esc no pausa
- El pie muestra «Salida segura Esc» (`:355`, `<kbd>` con puntero fino) y la barra «Esc salida segura» (`:392`) también con la ayuda o Ajustes abiertos; ahí Esc cierra primero la ayuda/el menú (0 POST, medido). F§4.7 lo declara; la etiqueta visible promete otra cosa. Arreglo: ocultar el `<kbd>` mientras `helpOpen()` o el menú estén abiertos.

### F12 (CONFIRMED, bajo) Si la pausa en cola llega detrás de una decisión, la supervisión se pierde
- `sa-h1.mjs fade` (decisión): la supervisión (400 ms, `:2085`) llega con el intento ya `PAUSED`; al reanudar `dialogue.set(null)` (`:1494`). El estudiante no puede releer la retroalimentación. El diseño acepta esa pérdida solo para la recarga (F§7.7).

### Objetivos táctiles (2.5.8 cumple; AC-11 pide 44 de ideal)
Por debajo de 44 (todos ≥ 24): touch: chip «Qué hacer · n» 102x32, «Ocultar pasos» 109x32, «Saltar animación de texto» 109x42; laptop: acciones del HUD 34x34, tarjetas de herramienta 112x43, filas de Ajustes 258x38, «Cerrar ajustes» 28x28, «Ocultar pasos» 109x32. El resto (salida segura 44-46, «Volver al mapa» 44, opciones 44-77, «Interactuar» 48, cruz 48, pausa 44) cumple 44.

## 3. Accesibilidad que pasa

- Teclado completo: Tab recorre cabecera, tarjeta, ayuda, pie y herramientas; introducción y contexto: música → Salida segura → Continuar (foco inicial «Continuar»); diálogo: Tab llega a «Volver al mapa» y «Salida segura»; Enter sobre «Salida segura» pausa una vez (`sa-opts-*.out`); pausa: foco en «Reanudar este intento», trampa de foco correcta, Esc inerte.
- Indicador de foco: todos los controles medidos tienen contorno ≥ 2 px (2-3 px lavanda/rosa); ninguno «NINGUNO». Con 3 opciones en 844x390 ninguna queda tapada por la cabecera fija (2.4.11).
- Nombre accesible contiene el texto visible (2.5.3): 0 desajustes en botones y enlaces (solo regiones con `aria-label`, que no aplican); `Pausando…` coincide en etiqueta y texto.
- Foco tras reanudar: en la introducción y el contexto vuelve a «Continuar»; en el mundo queda en `body` (como antes de pausar).
- Contraste: axe sin violaciones salvo F4; los «incompletos» son fondos semitransparentes y el pie `inert` (`aria-hidden-focus`), sin hallazgo.
- ETH-01: bajo el aviso (y tras vaciar `sessionStorage` y reanudar) no hay mundo ni canvas detrás, Esc se traga, el texto promete «Salida segura (con teclado, también Esc)» y es cierto una vez dentro.
- Reanudar tras recarga (pausa o en curso) funciona; sesión nueva vuelve a pedir el consentimiento y reabre la introducción.

## 4. Observaciones sin hallazgo
1. Pausar en el contexto y reanudar reproduce de nuevo la introducción animada (con su música) antes del contexto, porque `introRead` solo se guarda al aceptar el contexto (F§7.8 lo prevé). Para quien pausa por malestar es una re-exposición; decisión de producto.
2. La supervisión de la última decisión con «Salida segura»/Esc abre el marcador «¡SIMULACIÓN COMPLETADA! … Excelente»: alguien que pidió salir ve una pantalla de puntaje; en touch las salidas quedan bajo el pliegue. Revisar copy con la lente de límites de producto.
3. El aviso de reanudar titula «Intento en progreso» aunque el intento esté en pausa (copy).
4. El aviso de puerta, el de herramienta y el de cambio de sala ya eran dobles antes de esta rama (commit 80cce92); no se introdujeron aquí.
