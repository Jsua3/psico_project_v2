# Arreglos de interfaz de «este mes»: pendientes que quedaron fuera

Resultado de ejecutar los planes 14, 09, 10, 11, 12 y 13 (rama `feat/ui-mes`), con revisión por tarea y revisión final de toda la rama. La revisión final encontró un fallo crítico y dos importantes, y se corrigieron antes de cerrar:

- La captura de teclado de Phaser anulaba Enter y Espacio en los botones, y varias letras en la bitácora.
- Los avisos de error se duplicaban.
- La posición del jugador podía ir atrasada en las acciones validadas.

Lo que sigue se clasificó como menor, fuera de alcance o pendiente de verificación humana. Nada bloquea el merge, pero conviene tenerlo a mano para la siguiente tanda.

## Verificación humana antes de publicar

- **Música:** escuchar el bucle de `Musica_PsicoGame.mp3`. En modo HTML5, Howler reinicia el bucle con `setTimeout`, lo que puede dejar un hueco estimado de 0,05 a 0,2 s cada ~150 s.
- **iPhone y iPad reales:** ahí la música sigue en Web Audio porque iOS ignora `HTMLMediaElement.volume`. Comprobar el volumen, el fundido y la memoria (unos 100 MB si conviven las dos pistas decodificadas).
- **Legibilidad sin desenfoque:** revisar el HUD, el diálogo y la bitácora sobre la sala más clara, ahora que no hay `backdrop-filter`. Es el paso 5 de la verificación del plan 11.
- **Teclado y lectores de pantalla:** recorrer con Tab y Enter los pasos manuales de los planes 12 y 13. Probar VoiceOver y TalkBack sobre las flechas táctiles.

## Teclado en el juego

- **Enter sobre un botón que desaparece al activarse** («Continuar» de la tarjeta de contexto, «Seguir así»): el foco cae en `body` y, en el cuadro siguiente, Phaser puede disparar `interactNearest()` si hay algo en rango. Arreglo: registrar el foco en el `keydown` y evaluar `resolveInteractPress` con ese foco. Espacio no se ve afectado.
- **Regiones enfocables con scroll** (`.case-intro-card__body`, `.right-panel__narrative`): no se desplazan con las flechas ni con Espacio, porque el bloqueo de scroll las trata como si no fueran controles. Ya pasaba con la captura de Phaser. Arreglo: eximir los elementos con `scrollHeight > clientHeight`.
- **Esc por capas:**
  - Con la bitácora abierta sobre Ajustes, el primer Esc cierra el Ajustes que está tapado.
  - Con diálogo y Ajustes abiertos, un solo Esc cierra los dos.
- **Falta un e2e** «Enter activa Ajustes con el mundo vivo». `frontend/e2e/**` es de la otra sesión (PR #10).

## Juego: carga, táctil y avisos

- **Carga colgada sin error:** la capa «Preparando la escena…» no ofrece «Reintentar», porque nunca llega un `loaderror`. Poner un plazo al cargador de Phaser o un temporizador propio.
- **Avisos sobre la interfaz del juego:** los avisos de abajo a la derecha tapan la franja del diálogo y, si hay dos o más, los controles táctiles. Darles otra posición en `body.game-mode`.
- **Controles táctiles:**
  - Con `pointer: coarse`, un portátil táctil cuyo puntero principal es el ratón no ve las flechas. Valorar `any-pointer: coarse`.
  - Multitáctil: soltar una flecha detiene el caminar aunque otra siga pulsada.
  - No hay red de seguridad ante `blur` o `visibilitychange`.
- **Accesibilidad de la capa de carga:**
  - El foco cae en `body` después de «Reintentar» y de «Seguir así».
  - La barra de progreso no es enfocable.
  - El `role=status` nace ya con texto.
  - El aviso puede tapar la tarjeta de objetivo en móvil.
- **Vista previa del editor de casos:**
  - Con carga lenta, el lienzo queda en 0×0 tras `ready`. Ya pasaba antes, en `ac75371`.
  - `.touch-controls` y la capa de 240 px desbordan mientras el host mide 0.

## Sesión y avisos del portal

- **`/me` tardío:** si `/me` falla por red o por un 5xx después del plazo de 1,5 s, se borra la sesión con la pantalla protegida ya pintada. Limpiar la sesión solo ante 401 o 403, que el interceptor ya gestiona.
- **Anuncios perdidos:** si llegan dos avisos que no son de error en el mismo tick, `LiveAnnouncer` pierde el primero. Arreglo posible: un solo anuncio por emisión, con los textos unidos.
- **Host de avisos:**
  - Al cambiar de ventana, `focusout` reanuda la cuenta atrás.
  - En táctil, el `mouseenter` emulado pausa hasta tocar fuera.
  - Al cerrar con teclado, el foco cae en `body`.
- **Deuda de código:**
  - Crear un helper `notifyApiError` para los 11 usos de `apiErrorMessage` + `notify.error`.
  - `apiErrorMessage` no sirve para `/api/auth/login`.

## Formularios

- **Editor de casos:** los 5 botones «Guardar» y «Crear caso» siguen deshabilitados mientras el formulario es inválido. Quedaban fuera de los tres formularios del plan 10 y merecen un plan aparte.
- **Grupos:** «Asignar» (`casoForm`) y «Agregar» (`estudianteForm`) siguen deshabilitados, y sus campos quedan con el borde rojo tras enviar y reiniciar. Ya pasaba antes del plan.
- **Login:** `registerForm.reset()` tiene el mismo defecto de `submitted` que se corrigió con `resetForm()` en el plan 10.
- **Barra superior fija:** mide unos 104 px y puede tapar el campo que recibe el foco. Añadir `scroll-margin-top`.
- **Rúbricas:** añadir un comentario junto a `track criterion` que explique el aviso NG0956 en desarrollo. No aparece en la suite.

## Intro y personajes

- **Suavizado distinto:** la escena de la intro suaviza al elenco y al modular (48×72), mientras que el juego usa `pixelArt` (~54×82). Se resuelve con la unificación del estilo de los personajes.
- **Robustez:**
  - La intro no cae al personaje modular si falla la hoja del personaje elegido.
  - Un `NaN` se propaga en `stageLayout` y `frameAt`.
- **Escena:**
  - El borde de 1 px recorta 1 píxel nativo a 2×.
  - Puede haber un salto de 1× a 2× en el primer pintado.
  - `measure()` no reacciona si solo cambia el alto.
  - El rAF sigue girando en reposo con hojas de un solo cuadro.
- **Nombres heredados en e2e:** quedan `introVideo` y «saltar video» en `frontend/e2e`.

## Pruebas y deuda menor

- **Contratos de texto redundantes:** `portal-feedback.contract.spec.ts` y `forms-validation.contract.spec.ts` repiten lo que ya prueban los specs de comportamiento, y romperán con cualquier refactor.
- **`settle-within`:**
  - No hay caso de rechazo tardío.
  - El `tsc` de los specs no tiene tipos de Node. Es un patrón que ya existía en el repo.
- **Partículas:**
  - Anular `ctx` en `ngOnDestroy`.
  - Usar la última entrada del `IntersectionObserver`, no la primera.
  - Cachear el `rect` del host.
- **Audio:**
  - `setTargetVolume` arranca un tick aunque el objetivo ya sea el volumen actual.
  - Los stems se crean sin `mute: this.musicMuted`.
- **`index.html`:** el script y el `onclick` en línea fallarían con una CSP estricta. Hoy no hay CSP.
