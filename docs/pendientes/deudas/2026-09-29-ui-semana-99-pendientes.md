# Arreglos de interfaz de «esta semana» — pendientes que quedaron fuera

Resultado de ejecutar los planes 01–08 (rama `feat/ui-semana`) con revisión por tarea y revisión final de toda la rama. Estas observaciones se clasificaron como menores o fuera de alcance: ninguna bloquea el merge, pero conviene tenerlas a mano para la siguiente tanda.

## Accesibilidad con teclado

- **Menú móvil del portal:**
  - Al abrirlo, el foco no entra al panel. El botón que lo abre queda con `visibility: hidden` y el panel está antes en el DOM, así que desde teclado cuesta llegar a él. Este problema ya existía antes de la rama.
  - Cerrar con el botón «x» o con el fondo no devuelve el foco. Solo lo devuelve Esc.
  - `aria-expanded="true"` nunca se anuncia, porque el botón está oculto mientras el menú está abierto.
  - No se verificó en vivo si el anillo de foco se ve dentro del panel oscuro.
- **Login:** al cambiar entre «Iniciar sesión» y «Solicitar acceso» con el foco dentro del formulario que pasa a `inert`, el foco cae en `body`.
- **Enfoque del menú al cerrar con Esc** (`shell.component.ts`, `retryTriggerFocus`):
  - El reintento no vuelve a comprobar `menuOpen` dentro del callback de `requestAnimationFrame`.
  - No se cancela al destruir el componente.

## Dashboard

- **Vocabulario mezclado:** «Mejor puntaje» y «Promedio» dicen «Pendiente», y el resto de los datos ausentes dicen «Sin datos».
- **Fallos parciales:** si falla una sola fuente, sus cifras muestran «Sin datos» y la etiqueta «No se pudo cargar», pero no aparece el aviso general, que solo sale ante un fallo total.
- **Regla de error en admin:** la condición `!dashboard && !users.length` marca también como «Sin datos» cifras que sí cargaron. El error es hacia el lado seguro.
- **Estado vacío:** el título «Sin simulaciones activas» va seguido de un párrafo que repite lo mismo.
- **Insignias:** las de «Interrumpido» y «En pausa» no tienen un estilo propio.
- **Grilla del docente:** tiene 7 tarjetas en 4 columnas y queda una fila huérfana.
- **Código:**
  - La derivación del tiempo activo está duplicada entre la grilla y la tarjeta superior.
  - Queda un `slice(0, isEstudiante() ? 3 : 2)` cuando el estudiante ya tiene una sola acción.
  - La variable `criticasByCase` conserva un nombre que ya no corresponde a lo que cuenta.

## Backend

- **Asistente de IA:** el endpoint `/api/simulation/ai-assistant` y los ajustes `AI_ASSISTANT_*` ya no tienen ningún cliente en el frontend. Es una superficie muerta que llama a un LLM externo, así que conviene retirarlo o documentarlo.
- **Métricas del historial:**
  - No hay prueba de función pura para el caso real de abandono: una salida segura registrada después de `ended_at`.
  - `PAUSE_EVENT` no se comparte con los otros literales `"SAFE_EXIT_REQUESTED"`.
- **Reportes:** el límite de «hoy» usa la medianoche local ingenua. Esto ya existía antes de la rama.

## Editor de personaje

- **Sin respaldo:** si una hoja del elenco no carga, la etapa queda vacía. El juego, en cambio, cae a la figura modular.
- **Tamaño de la vista previa:** cambia entre personajes v1 (192×288) y los del elenco horneado (128×192). Esto es consecuencia de mantener la escala entera.
- **Detalles:**
  - La etiqueta accesible de la vista previa no menciona la pose.
  - `castLabel` repite la búsqueda en `PLAYABLE_CAST` en lugar de usar `resolveCastId`.
  - El halo podría quedar unos 7 px por debajo de los pies de los personajes del elenco (sin verificar).

## Movimiento y contraste

- **Tarjeta «Continuar simulación formativa»:** el encabezado pequeño se ve gris claro en lugar de lila, porque la regla `.resume-card p` del componente gana en especificidad. Igual cumple el contraste (8,4:1).
- **Botón del dashboard:** `.pixel-button:active` usa una sombra azul que tapa la sombra de acento mientras se presiona.
- **Opciones del diálogo:**
  - Con mouse, la transición al soltar probablemente oculta el pulso de confirmación.
  - Si se elige durante la entrada escalonada, el atenuado espera a que termine.

## Pruebas

- **Pruebas de texto fuente:** muchas pruebas de contrato leen el código fuente (motion, contrast, login, shell, editor). Son frágiles ante cambios de formato y no comprueban el comportamiento real: foco, `inert`, gating del hover.
- **Enlaces de salto:** no hay prueba de la rama dentro del juego (los dos enlaces y el foco en `#game-area`).
- **e2e sin chatbot:** `no-chatbot.e2e.ts` quedó vacía de sentido tras borrar el componente.
- **Diálogo de confirmación:** su spec emite avisos `console.warn` de CDK por jsdom, y el helper `writeInputSignal` está duplicado en dos specs.
- **Conteo de consultas:** la prueba que cuenta consultas del historial compara el texto SQL con comillas; se rompe si el ORM cambia cómo cita.

## Limpieza

- Probablemente quedaron huérfanos los tipos `OutcomeTier` y `SimulationOutcome` en `simulation.model.ts`.
- El respaldo `'Montserrat'` de `font-family` nunca se carga.
- `.psy-button` conserva un `position: relative` que solo necesitaba el destello eliminado.

## Fuera de esta tanda (de la auditoría original)

- Reducir la fuente de íconos Material Symbols (535 KB).
- Las prioridades «del mes»:
  - Mostrar los errores al usuario en el editor de casos, Usuarios y Grupos.
  - Aliviar el trabajo del juego por cuadro.
  - Los fallos de flujo del juego.
  - Rehacer la introducción.
  - La pantalla de arranque.
- Las prioridades estructurales:
  - Mundo a escala entera.
  - Sistema de diseño único.
