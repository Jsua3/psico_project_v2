# Arreglos de interfaz de «este mes» — índice

Planes derivados de la auditoría estética y técnica del frontend del 2026-09-29 (informe: https://claude.ai/artifact/RYudmDy2HJT3ZSdrHJFVeX), sección «Prioridades › Este mes». Siguen la numeración de la tanda de la semana (01-08) y, como aquellos, cada plan es autocontenido: trae el código actual, el resultado exacto, las pruebas y la verificación.

- **Commit base de todos los planes:** `e68e61b` (rama `feat/ui-mes`, que sale de `feat/ui-semana`, PR #11).
- **Cómo ejecutarlos:** con `superpowers:subagent-driven-development` (un subagente por tarea y revisión entre tareas) o `superpowers:executing-plans`.
- **Regla común:** si el código no coincide con un fragmento «Actual» (drift), el ejecutor se detiene y reporta.
- **Coordinación con otra sesión:** `game-world.component.ts`, `player-motion.util.ts` y los e2e de `frontend/e2e/support/siep-flow.ts` tienen trabajo sin commitear en `.worktrees/personaje-v1-idle-walk` (PR #10). Los planes 11 y 12 tocan `game-world.component.ts` en líneas acotadas. Antes de empezarlos, ejecutar `git log --oneline 470a0a2..feat/personaje-v1-idle-walk -- frontend/src/app/features/simulator/game-world.component.ts`. Si hay commits nuevos, rebasar `feat/ui-mes` primero. Ningún plan edita `frontend/e2e/**`.

## Planes

| # | Plan | Severidad | Esfuerzo | Estado | Depende de |
| --- | --- | --- | --- | --- | --- |
| 09 | [Avisos de error y éxito en el portal](2026-09-29-ui-mes-09-avisos-portal.md) | ALTA | M | TODO | — |
| 10 | [Validar los formularios al enviar](2026-09-29-ui-mes-10-validar-al-enviar.md) | MEDIA | S | TODO | 09 (avisos y `apiErrorMessage`) |
| 11 | [Aliviar el trabajo por cuadro del juego](2026-09-29-ui-mes-11-aliviar-juego.md) | ALTA | M | TODO | — |
| 12 | [Fallos de flujo del juego](2026-09-29-ui-mes-12-flujo-juego.md) | ALTA | M | TODO | 11 (mismo archivo de escena) |
| 13 | [Intro como escena animada en código](2026-09-29-ui-mes-13-intro-escena.md) | MEDIA-ALTA | L | TODO | 11 (crea el spec del audio) |
| 14 | [Pantalla de arranque y sesión que no bloquea](2026-09-29-ui-mes-14-pantalla-arranque.md) | MEDIA | S | TODO | — |

## Qué resuelve cada uno

- **09:** 12 acciones del editor de casos fallaban en silencio. En Usuarios, el mensaje de éxito se borraba al instante. En Grupos se usaba `window.confirm`. Los avisos pasan a tener `role` por tipo, pausa con el cursor o el foco, y van por encima de los diálogos.
- **10:** los formularios de Usuarios, Rúbricas y Grupos marcan los campos inválidos al enviar, con mensajes concretos, y llevan el foco al primer error. Los botones ya no se deshabilitan sin explicar por qué.
- **11:**
  - Caminar dejaba de disparar la detección de cambios de toda la app 60 veces por segundo; ahora son a lo sumo 8.
  - El fundido de música ya no corre 30 veces por segundo durante toda la partida.
  - Los tweens de las salas ya no se acumulan con cada cambio de sala.
  - Las partículas de la portada y el login corren fuera de Angular y en pausa cuando no se ven.
  - Se quitan seis desenfoques caros sobre el lienzo.
- **12:**
  - Esc con Ajustes abierto ya no pausa el intento.
  - Los controles táctiles aparecen por tipo de puntero, y mantener pulsado camina.
  - La carga de la escena muestra el progreso real y ofrece reintentar si faltan mapas.
- **13:**
  - Sale el video de 1,7 MB con marca de agua de IA; entra una escena en código donde entra caminando el personaje elegido.
  - La música larga baja a 128 kbps y se transmite (HTML5) en vez de decodificarse entera.
  - Se puede silenciar la música desde las tarjetas y ya no se ve el nombre interno de la pista.
- **14:** pantalla de arranque en `index.html`, con aviso de recarga a los 12 s y `noscript`. La validación de la sesión deja de retener el primer pintado más de 1,5 s.

## Orden recomendado

1. **14 Arranque:** el más chico e independiente; mejora la primera impresión de todo lo demás.
2. **09 Avisos** y luego **10 Validación:** solo portal, sin cruce con la otra sesión. El 10 usa lo que crea el 09.
3. **11 Aliviar el juego:** idealmente cuando el PR #10 ya haya entrado, para no rebasar sobre trabajo ajeno a medio hacer.
4. **12 Flujo del juego:** justo después del 11. Ambos tocan `game-world.component.ts`, pero el 12 crea sus propios specs de contrato y no modifica los del 11.
5. **13 Intro:** al final. Es el más grande, necesita el spec de audio del 11 y conviene revisarlo en vivo con varios personajes.

## Pruebas que añaden los planes

| Plan | Pruebas nuevas o ampliadas |
| --- | --- |
| 09 | `core/notifications/notification.service.spec.ts`, `shared/notifications/notification-host.component.spec.ts`, `core/api/api-error.util.spec.ts`, `features/simulator/case-editor.feedback.spec.ts`, `features/admin/portal-feedback.contract.spec.ts` |
| 10 | `shared/forms/focus-first-invalid.util.spec.ts`, `features/admin/forms-validation.contract.spec.ts` |
| 11 | `game-world.frame-budget.spec.ts`, `position-emit.util.spec.ts`, `audio-director.service.spec.ts`, `shared/ui/particle-field.util.spec.ts`, `shared/ui/siep-particle-layer.contract.spec.ts`, `overlay-blur.contract.spec.ts` |
| 12 | `simulation-hud.settings.spec.ts`, `touch-hold.util.spec.ts`, `game-world.touch.contract.spec.ts`, `asset-criticality.util.spec.ts`, `game-world.loading.contract.spec.ts` |
| 13 | `intro-audio.budget.spec.ts`, `intro-scene.util.spec.ts`, `case-intro-scene.component.spec.ts`, `simulation-play.intro.contract.spec.ts`; amplía `audio-director.service.spec.ts`, `intro-gate.util.spec.ts` y `simulation-play.consent-gate.spec.ts` |
| 14 | `core/auth/settle-within.util.spec.ts`, `app.config.spec.ts`, `boot-splash.contract.spec.ts` |

Como en la semana, las pruebas que leen código fuente usan `\s*` entre líneas, así que funcionan con CRLF (checkout de Windows) y LF (CI).

## Validación hecha al escribir los planes

- Los fragmentos «Actual» de los planes 09 y 10 se comprobaron contra `e68e61b` al escribirlos.
- Un script comprobó que los 44 fragmentos multilínea de los planes 11-14 existen tal cual en `e68e61b`. El único repetido (`introVideoRef…pause()`, plan 13) está acotado a `ngOnDestroy` en el propio plan.
- Las expresiones de los specs de contrato se revisaron contra el código que cada plan manda escribir. No se ejecutaron: la primera corrida de cada tarea es la que las valida (paso «verlo fallar»).
- El audio y el video se midieron con `ffprobe`:
  - `PsicoLament.mp3`: 156,7 s a 256 kbps.
  - `Musica_PsicoGame.mp3`: 152,1 s a 256 kbps.
  - `fondoHabitacion.mp4`: 10 s, 1280×720, con la marca ✦ visible en los cuadros extraídos.
- Los sprites que usa la escena de la intro existen y tienen las medidas supuestas:
  - v1: `walk.png` 288×288 e `idle.png` 192×288.
  - Elenco: 384×576.
  - Puerta: 48×64. Silla: 27×46. Planta: 49×64.

## Fuera de este mes (a propósito)

- **Estructurales:** mundo a escala entera y sistema de diseño único. Cada uno necesita su propio diseño antes de planificarse.
- **Subset de Material Symbols (535 KB):** sigue pendiente de validar la herramienta de subset de ligaduras.
- **Pendientes menores de la semana:** están en `2026-09-29-ui-semana-99-pendientes.md` (teclado del menú móvil, vocabulario del dashboard, endpoint de IA sin cliente, etc.).
- **Helper `writeInputSignal`:** el plan 13 añade una tercera copia en un spec. Conviene extraerlo a un helper de pruebas compartido en una tanda de limpieza.
