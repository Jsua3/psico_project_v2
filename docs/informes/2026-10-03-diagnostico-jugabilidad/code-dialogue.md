# Auditoría de código: diálogos, decisiones y feedback (SIEP, caso SIM-VBG-001)

Fecha: 2026-10-03. Alcance: experiencia de conversar, decidir y recibir consecuencias.
Método: lectura completa de los archivos asignados (frontend y backend), medición de textos con un script sobre el seed (`scratchpad/seedstats.py`) y contraste con las capturas y los informes de los playtests ya hechos (`reports/playtest-keyboard.md`, `reports/playtest-touch.md`, `reports/playtest-feel.md`). No abrí sesión de juego propia: la tarea no me asignó cuenta. Todo lo que no ejecuté está marcado "(inferencia)" o "verificado por lectura".

Archivos leídos: `dialogue-panel.component.ts`, `dialogue-progression.util.ts`, `dialogue-keys.util.ts`, `portrait-resolver.util.ts`, `patient-state.util.ts`, `outcome.util.ts`, `attempt-outcome.component.ts`, `journal-panel.component.ts`, `tool-inventory.component.ts`, `case-intro-scene.component.ts`, `intro-scene.util.ts`, `intro-gate.util.ts`, `simulation-play.component.ts` (completo), más `simulation-hud.component.ts`, `simulation-view-mode.util.ts`, `scene-objectives.config.ts`, `scene-guide.config.ts`, `evidence-gating.config.ts`; backend `game_service.py`, `decision_effects.py`, `case_effects.py`, `world_service.py`, `game_dtos.py` y el seed `seed_caso_pdf.py`.

---

## 1. Resumen ejecutivo

La sensación de "no se sabe qué hacer" no viene de un solo fallo: viene de que el bucle hablar, usar herramienta y decidir tiene huecos de orientación y de realimentación en cada paso. Lo más grave, en orden de impacto:

1. **Hay decisiones "muertas" y un panel que se queda bloqueado.** La sala de escucha ofrece a la vez tres puntos de decisión (H1, H2 y H3) con sus opciones completas, pero solo uno vale en cada etapa. Si eliges uno que no toca, sale un aviso confuso y el panel queda con la opción marcada, las demás atenuadas y sin botón para cerrar; solo Esc sale, y en táctil no hay Esc (DLG-01, DLG-02).
2. **Es posible tomar una decisión sin querer.** Al terminar el texto, el foco salta a la primera opción y Enter o Espacio la activan. La primera opción de H1 y de C1 es una conducta prohibida (DLG-03).
3. **Nadie dice que es una decisión clínica ni que queda registrada.** No hay encabezado, ni confirmación, ni aviso de la regla de reintento, que además solo se descubre después de fallar (DLG-04).
4. **El feedback llega tarde o no llega.** Tras decidir, la escena se funde, cambia de sala y de objetivo, y 400 ms después aparece el comentario de "Supervisión clínica" sobre la escena nueva. El comentario de la **última** decisión no se ve nunca, porque el modo `outcome` oculta el panel (DLG-05, DLG-06).
5. **El reporte contradice lo que el juego promete.** Una primera respuesta mala "no aplica cambios acumulados", pero el reporte la cuenta como decisión: baja el desempeño, impide el Final 1 y dos de ellas fuerzan el Final 4 "Intervención Crítica / Revictimizante" aunque todo lo final sea perfecto (DLG-07).
6. **El objetivo de escena revela la respuesta y no orienta el proceso.** "Estabiliza emocionalmente a la familia y evita acciones prematuras" es la opción correcta de H1; "Valora el riesgo, activa medidas de protección y orienta derechos" es la de C1. A la vez no dice con quién hablar ni adónde ir (DLG-08).
7. **Las herramientas no se entienden.** El dock solo lee la descripción, los números 1 a 5 son atajos que no existen, recoger una herramienta no avisa y usar PAP antes de tener el kit da un error genérico. Dos de las cinco herramientas no hacen nada (DLG-10, DLG-11).
8. **Los números del feedback no coinciden con el HUD.** El texto dice "Confianza +10 · Riesgo −5" (motor legacy) y las barras del HUD se mueven con otras métricas (DLG-13).
9. **Cierre de aprendizaje flojo y pausa como tablero de puntaje.** El resultado es una pared de métricas sin revisión decisión por decisión; la pausa segura muestra puntaje y línea de tiempo con claves internas, con "Reanudar" fuera de pantalla y sin recursos de apoyo (DLG-17, DLG-18, DLG-19).

Total: 31 hallazgos (2 blocker, 15 high, 11 medium, 3 low). Más de la mitad son de esfuerzo S (menos de medio día). Orden de ataque sugerido en la sección 7.

---

## 2. Respuestas a las preguntas del encargo

### 2.1 ¿Cuántos pasos hay entre acercarse a un NPC y tomar una decisión?

Datos del seed (`seedstats.py`): los diálogos con opciones tienen 2 o 3 líneas y 165 a 230 caracteres; la máquina de escribir va a 22 caracteres por segundo (`dialogue-panel.component.ts:16-17`), es decir 7,5 a 10,5 s si se lee completa.

| Fase | Entradas del jugador | Tiempo |
|---|---|---|
| Acercarse: aparece la tarjeta "E + nombre" en la barra inferior | 0 | 0 |
| Abrir (E o clic en la tarjeta) | 1 | ~94 ms de red (medido en `playtest-feel.md`) |
| Leer 2 líneas sin saltar | 1 (avanzar) | 7,5 a 9 s de tecleo |
| Leer saltando (Enter completa, Enter avanza) | 3 (2 líneas) o 5 (3 líneas) | ~0 s |
| Elegir (dígito o clic) | 1 | +170 ms de "confirmación" (`dialogue-panel.component.ts:535-544`) |
| **Total mínimo hasta decidir** | **5 entradas (2 líneas) o 7 (3 líneas)** | |
| Si falta evidencia (compuerta "Información incompleta") | **+5 entradas** (elegir, 2 líneas de "Criterio profesional", elegir "Decidir con información incompleta") | +10 s |
| Tras decidir: fundido + 3 líneas de "Supervisión clínica" | 4 a 6 entradas para cerrar | 1,5 a 2 s de pantalla negra + 10 s de tecleo |

Un ciclo normal de decisión son entonces **10 a 17 entradas y 35 a 60 s** sin contar el desplazamiento. Si la primera respuesta es mala, el ciclo se repite entero (reabrir con E, releer, elegir) porque el diálogo no recuerda que ya se leyó (`viewedDialogueKeys` llega del backend y ningún componente del juego lo lee: solo aparece en `simulation.model.ts:171` y en la maqueta `world-preview.component.ts:658`).

H1 es el peor caso: antes de poder decidir hay que recoger el Kit PAP, hablar con la familia de urgencias, aplicar PAP (otro diálogo más su feedback), hablar con la enfermera, cruzar la puerta y hablar con la "Familia en crisis" de la sala de escucha. La secuencia de `frontend/e2e/full-case.e2e.ts:47-84` son más de 30 entradas, y los dos playtesters humanos no llegaron a H1.

### 2.2 ¿Entiende el jugador que es una decisión clínica y que no hay vuelta atrás?

**No.**
- El panel de decisión no tiene encabezado "Decisión clínica". Solo el `aria-label` de la región ("Decisión formativa en curso", `simulation-play.component.ts:272`) y la frase final del NPC entre paréntesis ("(Define el foco inmediato de tu intervención.)") lo insinúan. Captura: `shots/pt-keyboard/38-lawbook-choices.png`.
- Elegir ejecuta tras 170 ms, sin confirmar (`dialogue-panel.component.ts:530-545`). No hay "¿Confirmas? Se registra en tu seguimiento".
- La regla real es otra: la primera respuesta riesgosa o inadecuada **no** se aplica y concede una segunda oportunidad (`game_service.py:351-374`). El jugador solo lo sabe después de fallar ("Tienes una última oportunidad…"). Mensaje doble: ni "no hay vuelta atrás" ni "puedes reconsiderar" se dicen antes.
- Tras decidir, el NPC sigue ofreciendo la misma decisión (la "Familia en crisis" de la sala de escucha vuelve a mostrar H1). Parece rehacible y falla (DLG-02).

### 2.3 ¿Qué realimentación recibe tras decidir? ¿Se explica?

Tres líneas de "Supervisión clínica" (`simulation-play.component.ts:1776-1805`):
1. `feedback.message`: prefijo fijo por clasificación ("Decisión adecuada: fortaleciste la contención profesional. ") más `immediate_feedback` (`decision_effects.py:67-75`). El "por qué" sí existe y es bueno, pero el prefijo genérico no encaja con decisiones de marco normativo.
2. Solo en conducta prohibida: la razón (`prohibitionReason`).
3. Una línea numérica seca: `Puntaje +12 · Estrés -5% · Confianza +10 · Riesgo -5` (línea 1795).

Problemas: aparece después del cambio de escena (DLG-06), la de la última decisión no se ve (DLG-05), en el primer fallo no se explica el porqué (solo "puede ser riesgosa o inadecuada", aun para opciones que el registro del caso llama "aceptables", p. ej. `h3-pap-epicee`: "Buena base, pero incompleta"), y no hay diferencia visual entre adecuada, riesgosa o inadecuada salvo el rojo de la conducta prohibida.

### 2.4 ¿Cómo se comunica el efecto en Confianza, Bienestar y Estrés?

Hay **dos sistemas de números** que no coinciden (DLG-13):
- El texto usa los deltas legacy: confianza +10/−5/−12 (−20 más si es prohibida) y riesgo −5/+8/+12 (`decision_effects.py:15-16`).
- Las barras del HUD (Confianza y Bienestar, `simulation-hud.component.ts:79-97`) usan las métricas del caso: `confianza` y `calidad_duelo` (`case_effects.py:230-242`).

Ejemplos: H2 correcta dice "Confianza +10" y la barra no se mueve (`h2-459-1257` no toca `confianza`); H1 con PAP dice "+10" y la barra sube +15. "Riesgo" no existe en el HUD, "Bienestar" no aparece nunca en el texto, y no hay animación ni delta sobre las barras. Además "Estrés −5%" se anuncia con el estrés en 0: el backend lo recorta (`world_service.py:302-304`), así que el HUD no cambia y el jugador piensa que no pasó nada (lo vio el playtester teclado, C7). Ninguna barra explica qué mide ("Confianza" de quién, si la paciente está en cirugía en las escenas 1 a 4).

### 2.5 Herramientas: ¿se entienden?

No (DLG-10, DLG-11, DLG-12):
- Hacer clic en una herramienta del dock solo abre una línea con su descripción (`selectTool`, `simulation-play.component.ts:1511-1526`): no hay "usar". El uso real está escondido dentro del diálogo con un NPC: la opción "Aplicar PAP a la familia en crisis" (`seed_caso_pdf.py:860-871`) y "Aplicar valoración estructurada de riesgo" mezclada con las tres opciones de decisión de C1 (`seed_caso_pdf.py:814`).
- Los números 1 a 5 del dock (`tool-inventory.component.ts:33`) prometen atajos que no existen (`grep` sin handlers).
- Recoger una herramienta no avisa: `unlockedToolCode` llega y se ignora (`simulation-play.component.ts:1246-1253`).
- Si hablas con la familia antes de recoger el kit y eliges "Aplicar PAP", el backend rechaza ("recógela primero") y el cliente solo muestra "No pudimos usar la herramienta." con el panel bloqueado.
- Nombres a 9 px y truncados ("Primeros Auxil…", "Protocolo EPIC…", `tool-inventory.component.ts:73-82`), candado sin motivo.
- Solo PAP y RISK_METER se "usan"; SPIKES solo se recoge; SAFETY_ROUTE y REFLECTION_JOURNAL no tienen efecto (el diario abre con J sin tenerlo).
- El aviso "Información incompleta" aparece en **todas** las opciones por igual, sin decir qué falta, y la causa solo se dice después de elegir, con un identificador interno ("enfermera-urgencias", captura `shots/pt-touch/33-portrait-msg-full.png`, DLG-09).
- "Por qué una herramienta es pertinente": mensaje único y genérico (`world_service.py:535-546`), sin tildes, sin causa. "No pertinente" es inalcanzable desde la interfaz, porque solo existen opciones de herramienta donde son pertinentes.

### 2.6 Ritmo (máquina de escribir y teclas)

- 22 caracteres por segundo, una línea de 200 caracteres tarda 9 s (el plan 2026-07-13 pide 35 a 45 con pausas de puntuación).
- Dos pulsaciones por línea (completar y avanzar). La etiqueta "Saltar ▶" parece saltar el diálogo, pero solo completa la línea.
- E no avanza el diálogo; Enter y Espacio sí, y nada lo enseña. El pie dice "WASD mover · E interactuar" y el panel no muestra "Enter: continuar · 1-4: elegir · Esc: cerrar".
- No se puede volver a la línea anterior ni hay registro; al reabrir, todo se reteclea.
- El movimiento reducido sí se respeta (`dialogue-panel.component.ts:574-579`).

### 2.7 Progresión entre decisiones

- Dos contadores incompatibles en la misma barra: "Escenario N de 8" (nodos, con `comisaria-recepcion` añadido al final aunque se juega en medio, `game_service.py:474-514`) y "Paso k (k/6)" (`scene-objectives.config.ts:28-37`). Al final el reporte dice "Escenarios 7": con `NODE_ENTERED` la sala de recepción nunca cuenta, así que 8/8 es inalcanzable.
- El objetivo y el "Paso" solo cambian al decidir; cruzar de sala no cambia nada (playtester teclado, C8).
- Tras decidir, el jugador reaparece en el punto de entrada de la sala (el backend reinicia sala y posición al cambiar el nodo, `world_service.py:492-499`), con el mismo mobiliario y los mismos NPC de decisión de otras etapas.
- Las consecuencias no tocan el mundo: ninguna línea de NPC cambia según las banderas del caso (solo hay una `unlockLines` en todo el caso, `evidence-gating.config.ts:28-33`). El efecto mariposa solo se ve en las métricas finales.

### 2.8 Final y resultados: ¿cierran el aprendizaje?

No del todo (DLG-19, DLG-20). La pantalla (`attempt-outcome.component.ts:20-149`) abre con "¡Simulación completada!", un final con título y color, siete barras, cinco cifras (Puntaje total, Escenarios, Estrés final, Tiempo, Desempeño), barras de decisiones, línea de tiempo y 1 a 3 recomendaciones genéricas. Falta lo importante para aprender: **qué elegiste en cada decisión, qué se esperaba y por qué** (el texto `immediate_feedback` ya existe en la BD y en el evento, pero la línea de tiempo muestra `decision.text`, `game_dtos.py:116-137`), qué reflexionaste y qué practicar.

### 2.9 ¿Qué ve el jugador tras la última decisión?

Un fundido y directamente el resultado. El panel de "Supervisión clínica" se construye a los 400 ms (`simulation-play.component.ts:1473-1476`) pero `resolveViewMode` devuelve `outcome` cuando el estado no es `IN_PROGRESS` (`simulation-view-mode.util.ts:30-33`) y ninguno de los dos paneles se pinta. La señal `dialogue` queda con ese contenido. Además, `startNewAttempt()` (líneas 1044-1050) no la limpia, así que al "Reintentar caso" la tarjeta vieja de la última decisión reaparece en el intento nuevo cuando termina la introducción (inferencia por lectura: solo se limpia si el jugador pulsa Esc sobre el resultado, línea 1131).

---

## 3. Flujo real de una decisión (para entender los hallazgos)

```
Acercarse (<=74 px) -> tarjeta "E + etiqueta"
  -> E: PATCH posición + POST /interactions/<clave>  (openBackendInteraction)
  -> panel lateral "dialogue-right" (si hay opciones) o franja inferior "dialogue-cinematic" (si no)
       lineas con máquina de escribir -> última línea -> aparecen opciones y el foco salta a la 1.ª
  -> elegir (170 ms) -> executeDecision
       a) decisión de otra etapa  -> toast, panel queda bloqueado           [DLG-01/02]
       b) falta evidencia         -> diálogo "Criterio profesional" (2 líneas, 2 botones) [DLG-09]
       c) ok -> dialogue=null, FUNDIDO 340 ms, POST /decisions
            - 1.ª respuesta mala: retryRequired, nada avanza; mensaje genérico
            - si no: avanza el nodo, aplica métricas, reinicia sala/posición
          -> recarga progreso + mundo (3 peticiones) -> +80 ms -> +400 ms
          -> franja "Supervisión clínica" sobre la escena NUEVA       [DLG-06]
          -> si COMPLETED: se oculta bajo el resultado                [DLG-05]
```

---

## 4. Hallazgos

Leyenda de severidad: blocker (el jugador no puede avanzar o se pierde), high, medium, low. Esfuerzo: S menos de 0,5 día, M 0,5 a 2 días, L más de 2.

### DLG-01 (blocker, S) Panel de decisión bloqueado sin salida visible
- **Qué vive el jugador:** elige una opción, no pasa nada, la opción queda resaltada y las demás atenuadas e inertes, y no hay botón para cerrar. Solo Esc lo cierra. En táctil no hay salida.
- **Causa:** `chosenKey` solo se limpia cuando cambia `dialogue()` (efecto del constructor, `dialogue-panel.component.ts:419-432`). Si `executeDecision` rechaza (otra etapa, `simulation-play.component.ts:1430-1434`) o `useTool` falla (línea 1507), el diálogo no cambia y el panel queda en `.choices--locked` (líneas 266-267). Con opciones no se pinta "Continuar" (línea 101).
- **Evidencia:** `shots/pt-keyboard/40-lawbook-after.png`, `46-lawbook-wait7.png`; `playtest-keyboard.md` C9; `playtest-touch.md` TOUCH-02.
- **Arreglo:** las salidas `execute` y `useTool` deben devolver éxito o fallo para liberar `chosenKey`; botón visible "Volver" (cierra el diálogo) siempre que haya opciones; mostrar el mensaje real del backend en el toast. No cambia ningún contenido clínico.

### DLG-02 (blocker, S-M) Decisiones de otras etapas se ofrecen como si estuvieran activas
- **Qué vive el jugador:** en la sala de escucha ve tres puntos de decisión (familia, marco normativo, psicóloga) con opciones completas. Elige y recibe "Esta intervención pertenece a otra etapa del caso. Vuelve cuando el flujo te lleve a esta sala." (engañoso: está en la sala correcta). El panel lateral muestra el título del **nodo actual** ("Urgencias: crisis y contención") aunque las opciones son de otra etapa. Tras decidir H1, la familia sigue ofreciendo H1. En la comisaría ocurre igual (C1, C2 y C3 en el mismo consultorio).
- **Causa:** el seed reutiliza los mismos objetos de decisión en las copias de sala (`seed_caso_pdf.py:744-790`, `801-848` y `MAP_OBJECTS` desde la línea 857). El frontend solo compara con `game.currentNode.options` después de elegir (líneas 1430-1434).
- **Arreglo (orienta el DÓNDE, no la respuesta):** en `decorateDialogue` (`simulation-play.component.ts:1334`) filtrar las opciones cuyo `decisionOptionId` no esté en `currentNode.options`; si ninguna sirve, mostrar solo la línea del NPC más una nota "Este tema corresponde a otra etapa (ya lo resolviste / aún no toca)". Marcar con un distintivo neutral ("Decisión clínica") **solo** el punto de la etapa activa. Misma marca para todas las etapas, sin color ni orden que sugiera la respuesta.

### DLG-03 (high, S) Decisión irreversible por Enter o Espacio sin querer
- **Qué vive el jugador:** lee a golpe de Enter; cuando el texto termina, el foco salta a la primera opción y el siguiente Enter la elige. En H1 y C1 la primera opción es la prohibida (`h1-noticia-sin-protocolo`, `c1-mediacion-perdon`), lo que registra una alerta ética y consume el reintento.
- **Causa:** `requestDialogueFocus` enfoca `.choice-btn` (`dialogue-panel.component.ts:602-612`); `dialogueKeyAction` devuelve `none` para Enter con opciones (`dialogue-progression.util.ts:52-56`) y, sin `preventDefault`, el navegador dispara el clic nativo del botón enfocado. Verificado por lectura y por la captura (anillo de foco en la opción 1 en `shots/pt-keyboard/38-lawbook-choices.png`); no ejecuté la pulsación. El spec fija `none` (`dialogue-panel.component.spec.ts:63`).
- **Arreglo:** no enfocar ninguna opción al aparecer (enfocar el grupo o la pregunta); ignorar Enter/Espacio unos 500 ms tras mostrar opciones; paso de confirmación para decisiones (ver DLG-04).

### DLG-04 (high, S) Sin aviso de "decisión clínica" ni de irreversibilidad, y regla de reintento oculta
- **Qué vive el jugador:** las opciones aparecen sin encabezado y se ejecutan al instante. Solo tras fallar descubre que existía una segunda oportunidad.
- **Evidencia:** `dialogue-panel.component.ts:62-85, 530-545`; `game_service.py:351-374`.
- **Arreglo:** encabezado fijo "Decisión clínica: tu elección queda registrada en tu seguimiento" (y la regla de reconsiderar, si el equipo decide conservarla); confirmación "Registrar decisión" / "Seguir pensando". Texto en la tarjeta de "cómo se juega" (DLG-29). Decisión de diseño pendiente del equipo clínico: conservar o quitar el reintento (ver DLG-07).

### DLG-05 (high, S-M) El feedback de la última decisión nunca se muestra, y queda un diálogo huérfano
- **Qué vive el jugador:** tras la sexta decisión pasa del fundido al tablero de resultados sin ningún "por qué".
- **Causa:** `simulation-view-mode.util.ts:30-33` (modo `outcome`), `simulation-play.component.ts:321-325` y `271-286` (los paneles solo se pintan en sus modos), `1473-1476` (se construye igual). `startNewAttempt` (1044-1050) no limpia `dialogue` (inferencia: el diálogo viejo reaparece en el intento nuevo).
- **Arreglo:** mostrar la "Supervisión clínica" antes de abrir el resultado (el resultado aparece al cerrar) o integrarla como primera tarjeta del resultado; limpiar `dialogue`, `selectedInteraction` y `journalOpen` al arrancar intento nuevo.

### DLG-06 (high, M) El feedback aparece después de cambiar de escena
- **Qué vive el jugador:** elige, la pantalla se funde (1,5 a 2 s sin ningún indicador), reaparece en otro punto con el objetivo ya cambiado, y 400 ms después una franja le dice "Decisión adecuada…" tapando el fondo de la escena (180 px, también el personaje). Pierde el vínculo causa-efecto.
- **Evidencia:** `simulation-play.component.ts:1451-1476` (limpia diálogo, funde, pide, recarga, programa feedback), `1807-1811` (fade 340 ms), `1870-1873`; `world_service.py:492-499` (reinicio de sala).
- **Arreglo:** mostrar primero el feedback sobre la escena donde se decidió; solo al "Continuar" ejecutar el fundido y la nueva sala. Mientras se espera, "Registrando tu decisión…" con `role="status"`.

### DLG-07 (high, S) El reporte cuenta las primeras respuestas malas como decisiones y puede dar un final injusto
- **Qué vive el jugador:** el juego le dice "No se avanzó el caso ni se aplicaron cambios acumulados". Al final, "Alertas éticas: 1" y desempeño rebajado, o un Final 4 "Intervención Crítica / Revictimizante" con 6 respuestas finales correctas.
- **Causa:** los eventos `DECISION_RETRY_REQUIRED` y `PROHIBITED_DECISION_RETRY_REQUIRED` llevan `decision_option` (`game_service.py:372`). `build_completion_report` cuenta todos los eventos con `decision_option_id` sin filtrar por tipo (`game_dtos.py:144-162`) y `compute_ending` también (`case_effects.py:289-295`, 307 `criticals >= 2`, 311 `criticals == 0`). Ejemplo: dos primeros intentos prohibidos (H1 opción 1 y C1 opción 1, que son las opciones enfocadas por defecto, DLG-03) más seis correctas = 2 críticas, final "crítico". Con un solo retry crítico ya no se puede alcanzar el Final 1. Verificado por lectura; sin prueba que lo cubra.
- **También:** dos taxonomías en la misma pantalla (barras Adecuadas/Riesgosas/Inadecuadas contra fichas Recomendadas/Aceptables/Riesgosas/Críticas); opciones "aceptables" cuentan como "Riesgosas" (`base-comun` §7).
- **Arreglo:** filtrar a `DECISION_SELECTED` y `PROHIBITED_DECISION_SELECTED` para conteos y final; mostrar los reintentos aparte ("Reconsideraste 2 veces"); unificar la taxonomía. Sin migración.

### DLG-08 (high, S) El objetivo de escena revela la respuesta y no orienta el proceso
- **Evidencia (límite 1):**
  - `hospital-urgencias`: "Estabiliza emocionalmente a la familia y evita acciones prematuras que puedan aumentar la crisis." (`hospital-map.config.ts:10-11`) es la respuesta de H1 y descarta las otras dos.
  - `hospital-cierre-bloque`: "Valora el riesgo, activa medidas de protección y orienta derechos sin revictimizar." (`scene-objectives.config.ts:16-17`) es C1.
  - `comisaria-accion-final`: "…víctima, dependientes, nivel de riesgo y rutas." (líneas 20-21) enumera lo que distingue la opción correcta de C3.
  - Frase del NPC de urgencias: "(La familia necesita contención antes de cualquier información difícil…)" (`seed_caso_pdf.py:867`).
  - Las pistas de `scene-guide.config.ts` (hoy desactivadas) igual: "contener sin apresurarte", "valorar riesgo y protección".
  - La compuerta de evidencia exige "usar PAP" o "usar la valoración de riesgo" antes de decidir H1 y C1 (`evidence-gating.config.ts:24-42`), lo que equivale a nombrar la opción.
- **Qué falta (permitido):** con quién hablar, qué recoger, adónde ir. El jugador no lo sabe (`playtest-keyboard.md` C2, C8; `playtest-touch.md` TOUCH-08).
- **Arreglo:** objetivos con lista viva de proceso ("Habla con la Enfermera de turno · Recoge el Kit PAP · Habla con la Familia en crisis · Pasa a la Sala de escucha: ahí tomarás tu primera decisión"), con nombres legibles y marca de hecho. Mover el razonamiento clínico al feedback posterior. Para la compuerta, desacoplar "usar herramienta" de la opción (p. ej. exigir "haber hablado con X" sin nombrar la técnica).

### DLG-09 (high, S) "Información incompleta": no se entiende, filtra identificadores y se escribe en pantalla texto interno
- **Qué vive el jugador:** las tres opciones llevan el mismo rótulo amarillo sin explicación (`shots/pt-touch/30-tablet-decision.png`). Al elegir: "falta hablar con **enfermera-urgencias** antes de decidir" (identificador interno). Si decide igual, el feedback acaba con "| Override de evidencia: npc:enfermera-urgencias, tool:PAP".
- **Causa:** `evidenceNpcLabel` solo busca NPC de la sala actual y cae al slug (`simulation-play.component.ts:1738-1744`); "tener o usar" ambiguo (1733); `game_service.py:384-387` añade etiquetas crudas al mensaje, y el frontend lo muestra tal cual (línea 1779). El rótulo es de nodo, no de opción, así que no distingue nada. La compuerta cuesta 5 entradas más (sección 2.1).
- **Arreglo:** un aviso único sobre las opciones con lista humana de lo pendiente ("Antes de decidir te falta: hablar con la Enfermera de turno · usar el Kit PAP"); etiquetas legibles desde un mapa estático; no concatenar el override al `message` del cliente; "usar" frente a "tener" bien diferenciados.

### DLG-10 (high, M) Herramientas: sin "cómo", sin "cuándo", con atajos falsos
Ver 2.5. **Evidencia:** `simulation-play.component.ts:1511-1526`, `tool-inventory.component.ts:29-40, 73-82`, `world_service.py:254-323`, seed 1082-1090 (`TOOLS`). **Arreglo:** el dock muestra "Cómo se usa: …" y "Se desbloquea al recoger X en <sala>" en las bloqueadas; implementar 1 a 5 o quitar las insignias (hoy engañan, y los números del panel de opciones los confunden); tamaño mínimo 12 px y nombre completo (tooltip o dos líneas); tres de cinco herramientas deben tener una función visible o desaparecer del dock; en el panel de opciones separar visualmente "Usar herramienta" de "Decisión clínica".

### DLG-11 (high, S) Recoger una herramienta no avisa, y usarla sin tenerla da un error opaco
- **Evidencia:** `simulation-play.component.ts:1246-1253` (ignora `unlockedToolCode`), `1507` ("No pudimos usar la herramienta."), `world_service.py:270-271` (el mensaje útil existe: "recógela primero").
- **Arreglo:** toast/línea "Obtuviste: Kit PAP. Se usa hablando con quien corresponda"; chip "Requiere: Kit PAP (no lo tienes)" en la opción de herramienta; propagar `error.error.message`.

### DLG-12 (medium, S) Feedback de herramienta genérico y a veces falso
- **Evidencia:** `world_service.py:302-304` (estrés ya en 0 se anuncia "−5%"), `535-546` (mensaje único, sin tildes: "intervencion profesional y etica", "mas apropiado", "situacion"), `simulation-play.component.ts:1683-1692` ("✓ Herramienta pertinente" como nombre de hablante, segunda línea "Estrés +0%" si ya se usó).
- **Arreglo:** mensaje por (herramienta, objetivo) escrito por el equipo clínico (sin revelar decisiones); mostrar la variación real; reemplazar el símbolo del hablante por una etiqueta de estado; tildes.

### DLG-13 (high, M) Los números del feedback no coinciden con el HUD
Ver 2.4. **Evidencia:** `decision_effects.py:15-16`, `case_effects.py:46-51, 64-68, 230-242`, `simulation-play.component.ts:1795`, `simulation-hud.component.ts:79-97`. **Arreglo:** una sola fuente (las métricas del caso que ya muestra el HUD); micro-delta junto a la barra al cambiar ("Confianza +15") con alternativa sin movimiento; quitar "Riesgo" del texto o añadirlo al HUD; no mencionar deltas que no se aplican (estrés ya en 0); tooltip "Confianza: cuánto confía en ti la familia/sobreviviente". Efecto M porque toca texto del feedback y HUD.

### DLG-14 (medium, S-M) Texto de feedback: prefijo genérico, primer fallo sin explicación, lenguaje de puntaje
- **Evidencia:** `decision_effects.py:67-75` ("Decisión adecuada: fortaleciste la contención profesional." también para elegir leyes), `game_service.py:362-366` (mensaje único "puede ser riesgosa o inadecuada", aun para opciones que el registro llama aceptables), línea 1795 ("Puntaje +12", límite 2).
- **Arreglo:** prefijo por tipo de decisión; diferenciar "parcial, falta algo" de "inadecuada"; "seguimiento formativo" en lugar de "Puntaje"; mostrar el porqué desde el primer intento (después de elegir es legítimo, límite 1).

### DLG-15 (high, S) Retratos y emociones: las líneas del caso no activan ningún retrato expresivo
- **Qué vive el jugador:** la abuela grita "¡Déjenme pasar!" con cara neutra y sin etiqueta; un punto morado suelto flota a la derecha; el retrato ocupa unos 350 px de alto; para objetos, herramientas y supervisión sale una silueta de persona.
- **Causa:** el seed guarda emociones crudas por línea (`anxious`, `negative`, `sad`, `relieved`, `seed_caso_pdf.py:1297`); `activeEmotion` da prioridad a la línea (`dialogue-panel.component.ts:457-459`) y ni `EMOTION_TO_VARIANT` (`portrait-resolver.util.ts:35-41`) ni `emotionLabel` (475-483) conocen esos valores. Existen `madre-vbg_worried`, `paciente-vbg_sad`, `paciente-vbg_worried`, `psicologa-hospitalaria_happy` y no se usan. `emotion-chip` aparece para cualquier valor distinto de `neutral`, incluido `anxious`. `.portrait-img` es `width/height: 100%` (líneas 145-152) en el panel lateral.
- **Evidencia:** `shots/pt-keyboard/19-npc-familia-1.png`.
- **Arreglo:** ampliar los mapas (`anxious/negative` a worried, `sad` a sad, `relieved` a happy); altura máxima del retrato en modo lateral (96 a 120 px); no mostrar chip para valores no mapeados; etiquetas neutras de género o ninguna ("receptiva"/"preocupada" se pegan hasta a "Criterio profesional"); icono distinto para no-personas.

### DLG-16 (high, S-M) Panel lateral: anclado al fondo, con resumen de escena que ocupa el espacio
- **Qué vive el jugador:** en 1366×768 el resumen de escena (kicker, título, narrativa de 4 a 5 líneas cortadas) más el retrato empujan las opciones; `ngAfterViewChecked` fija `scrollTop = scrollHeight` en cada ciclo (`dialogue-panel.component.ts:516-522`), así que el hablante y la pregunta quedan fuera de vista y pasar el ratón por una opción reancla el scroll. En móvil horizontal las opciones 1 y 2 son inalcanzables (`playtest-touch.md` TOUCH-01). Cuando se abre el panel, el mundo se reencuadra (`playtest-feel.md` F-03).
- **Evidencia:** `shots/pt-touch/30-tablet-decision.png`, `25-listen-opts7.png`; `simulation-play.component.ts:271-286, 494-501`.
- **Arreglo:** anclar abajo solo mientras se teclea; cabecera fija (hablante y pregunta) con las opciones en una zona desplazable; plegar el resumen de escena mientras haya opciones; panel flotante que no reencuadre el canvas.

### DLG-17 (high, S-M) Salida segura inalcanzable en la introducción y en diálogos táctiles; sin recursos de apoyo en la pausa
- **Qué vive el jugador:** en la escena de intro y en la tarjeta de contexto (la narrativa más dura: muerte de una niña de 3 años) no hay botón de salida segura y Esc no hace nada. Con un diálogo abierto, la cabecera y el pie están `inert` y, sin teclado, no hay salida. Al pausar, el jugador no ve ningún recurso de apoyo.
- **Evidencia:** `simulation-play.component.ts:1113-1127` (Esc no mapeado en intro), `947-950`, `212`, `289` (`inert`), `1597-1604` (`safeExit` sale sin actuar si `inputBlocked`); `game_dtos.py:11-15, 247` (3 recursos que solo se pintan dentro del modal de bitácora, `simulation-play.component.ts:334`, que no puede abrirse en pausa); `playtest-touch.md` TOUCH-02. Spec §6 punto 4 (REGLA-004).
- **Arreglo:** botón visible "Pausa segura" dentro de consentimiento, escena de intro, contexto, panel de diálogo y resultado, fuera del `inert`; el resultado en `PAUSED` muestra `supportResources`; quitar "(Esc)" de lo que se ve en táctil.

### DLG-18 (high, S) La pausa segura es un tablero de puntaje con claves internas y "Reanudar" fuera de pantalla
- **Evidencia:** `attempt-outcome.component.ts:34-130` se pinta para cualquier estado distinto de `IN_PROGRESS`; el pie con "Reanudar este intento" va al final de la lista (`margin-top: auto`, líneas 132-149, 225); `shots/pt-keyboard/55-esc-pause.png` ("Puntaje total 0", "Tiempo: No disponible", "Desempeño: Sin decisiones", línea de tiempo con "Herramienta usada: PAP sobre familia-crisis — pertinente (estres -5%)" y "Puerta hacia sala hospital-sala-escucha"); `game_dtos.py:116-137` (etiqueta = `ev.detail`), `world_service.py:307-312`.
- **Arreglo:** en `PAUSED`, una tarjeta tranquila con los botones arriba, los recursos de apoyo y nada de puntaje; etiquetas de línea de tiempo con nombres legibles y tildes (mapa de herramientas, salas y decisiones).

### DLG-19 (high, M) El resultado no cierra el aprendizaje
- **Evidencia:** `attempt-outcome.component.ts:20-129`, `game_dtos.py:166-186` (competencias heurísticas: "Comunicación ética y contención emocional" con una sola adecuada; 1 a 3 recomendaciones genéricas), línea de tiempo con `decision.text` y no con el porqué (`game_dtos.py:127-136`).
- **Arreglo:** orden del resultado: (1) el final narrado, (2) "Tu recorrido": por cada decisión, lo que elegiste, lo que se esperaba y por qué (texto `immediate_feedback`, ya guardado en el evento; revisión del equipo clínico porque el intento ya terminó, no viola el límite 1), (3) preguntas de bitácora, (4) métricas plegadas. Incluir las reflexiones guardadas. Esfuerzo M por el DTO y la maquetación.

### DLG-20 (medium, S) Lenguaje de puntaje y victoria en feedback y resultados
- **Evidencia (límites 2 y 3):** "¡Simulación completada!" (`attempt-outcome.component.ts:248`), "Puntaje total" como primera cifra, "Desempeño: Excelente" (`outcome.util.ts:19-28`), "Tiempo" como cifra (no premia la rapidez pero la expone, sección 6), barra "Manejo del duelo" con verde y rojo (líneas 280-303), título "Final 4 — Intervención Crítica / Revictimizante" con color crítico (`case_effects.py:160-199`), "Puntaje +12" en el feedback.
- **Arreglo:** "Seguimiento formativo", sin exclamaciones; eliminar "Tiempo" o rotularlo "Duración (informativo)"; sustituir la barra de duelo por "Aspectos a fortalecer" en lenguaje cualitativo; mantener los 4 finales pero con tono formativo y sin color de alarma para el final 4.

### DLG-21 (medium, S) Ritmo de lectura y controles sin enseñar
Ver 2.6. **Evidencia:** `dialogue-panel.component.ts:16-17, 87-107, 572-593`, `dialogue-progression.util.ts:52-56`, `simulation-play.component.ts:316`. **Arreglo:** pista fija en el panel "Enter: continuar · 1 a 4: elegir · Esc: cerrar"; E también avanza; "Saltar" renombrado a "Mostrar todo"; saltar la máquina de escribir de líneas ya leídas (`viewedDialogueKeys`); 35 a 45 car/s con pausas (plan 2026-07-13).

### DLG-22 (medium, M-L) Las decisiones no se notan en el mundo
- **Evidencia:** `case_effects.py:245-269` guarda banderas (`noticia_muerte_mal_manejada`, `familia_contenida`, …) que ningún diálogo lee; una sola `unlockLines` (`evidence-gating.config.ts:28-33`); `familia-duelo` repite H1 (seed 746) tras haberla resuelto.
- **Arreglo:** marcar el objeto como "resuelto" tras decidir y añadir 1 o 2 líneas de reacción del NPC por bandera (por ejemplo, la abuela tras `familia_contenida` o tras `noticia_muerte_mal_manejada`), sin celebración y sin cronometrar.

### DLG-23 (medium, S) Jerga sin explicar y opciones pequeñas
- **Evidencia:** PAP, EPICEE/SPIKES, disonancia cognitiva, ciclo de la violencia, factores protectores, leyes con número; descripciones de herramientas de una línea (`seed_caso_pdf.py:1082-1090`); opciones a 13 px con dos adornos por fila (número y círculo vacío, `dialogue-panel.component.ts:74-75, 282-303`); "Información incompleta" a 10,5 px; `emotion-tag` a 9,6 px; hover con sonido en cada `mouseenter` (línea 72).
- **Arreglo:** glosario neutral ("¿Qué es PAP?") accesible desde la opción y el dock; quitar el círculo; mínimo 12 a 13 px; sonido solo al enfocar con teclado.

### DLG-24 (medium, M) La opción adecuada se adivina por forma y posición (límite 1)
- **Medición** (`seedstats.py`, textos tal como se muestran): la correcta es la más larga en H1 (88 car.), H3 (81), C2 (54) y C3 (82); H3 y C3 la formulan como "Lo anterior + …" (`seed_caso_pdf.py:716, 740`, acumulativa). Posición de la correcta: 2.ª en H1, H2 y C1, 1.ª en C2, 3.ª en C3, 4.ª en H3. Las prohibidas de H1 y C1 están redactadas de forma que se descartan solas ("sin estabilización previa ni protocolo", "mediación y perdón").
- **Arreglo:** barajar el orden por intento con semilla estable (y que los dígitos sigan el orden mostrado); igualar longitud y estructura entre opciones (revisión clínica); evitar "Lo anterior +" (cada opción debe entenderse sola).

### DLG-25 (medium, S) El servidor envía la clasificación de cada opción antes de decidir
- **Evidencia:** `decision_option_state` incluye `classification` y `prohibitedConduct` (`game_dtos.py:52-58`) dentro de `currentNode.options`; el cliente los copia a `isProhibited` (`simulation-play.component.ts:1354`); el modelo tiene `isRecommended`/`isProhibited` (`simulation.model.ts:256-259`); `frontend:cancel-restricted` va con `isRecommended: true` (línea 1386). La UI no los pinta; cualquiera con DevTools los ve. El plan de 2026-07-13 pide retirarlos (spec §5.3).
- **Arreglo:** quitar ambos campos del DTO de nodo (el cliente solo necesita `id` y `text`) y eliminar los campos de ayuda visual del modelo.

### DLG-26 (medium, S) Progreso con dos contadores y recorrido que no llega a 8/8
Ver 2.7. **Arreglo:** un solo contador de decisiones ("Decisión 2 de 6") más el nombre de la etapa; mostrar la sala por separado; cuando se cruza de sala, el objetivo debe reflejar el avance de proceso (DLG-08).

### DLG-27 (medium, S-M) Bitácora desconectada del flujo
- **Evidencia:** el diario abre con J sin necesidad de la herramienta "Bitácora" (`simulation-play.component.ts:1148-1152`); preguntas guía genéricas (`journal-panel.component.ts:257-263`); "Trazabilidad" con etiquetas cortadas a 14 caracteres ("Urgencias: cr…", `game_dtos.py:254-258`); nota "se cifran con AES-GCM" (jerga, línea 98); no recarga lo ya guardado; nunca se sugiere tras una decisión; el jugador no sabe que cuenta para la rúbrica de reflexión.
- **Arreglo:** botón opcional "Registrar reflexión sobre esta decisión" tras el feedback, con la pregunta de la etapa; cargar el texto guardado; "Se guarda cifrada"; trazabilidad con nombre completo; decidir si la herramienta "Bitácora" tiene función o se retira.

### DLG-28 (medium, S) Introducción sin "cómo se juega"; nuevo intento sin confirmación
- **Evidencia:** `simulation-play.component.ts:47-54, 159-210` (escena animada de 3,6 s, seis párrafos de contexto, "Continuar" siempre activo; no explica el bucle ni los controles; el consentimiento cita Esc pero la tarjeta de contexto lo ignora); `95-120, 1044-1050` ("Iniciar nuevo intento" cierra el intento actual de forma terminal, `game_service.py:135-150`, sin confirmar; el texto dice "desde Urgencias: crisis y contención" aunque el jugador esté en otra sala).
- **Arreglo:** tarjeta de 3 líneas solo de proceso ("Explora y habla (E) · Recoge herramientas y úsalas con quien corresponda · En cada decisión elegirás una intervención y quedará registrada"), antes del mundo; confirmación al reemplazar intento ("El intento actual se cerrará"); al reanudar nodo 1 en sesión nueva, ofrecer "Saltar introducción".

### DLG-29 (low, S) Textos visibles sin tildes (límite 7)
- **Evidencia:** `world_service.py:307-312, 535-546`; `simulation-play.component.ts:1555` ("interaccion"); `evidence-gating.config.ts:67` ("Informacion insuficiente"); `scene-guide.config.ts:36, 68` ("dificiles", "decision"). Playtester teclado: "intervencion profesional y etica".
- **Arreglo:** corregir en las cuatro ubicaciones y añadir una prueba que busque cadenas sin tilde en un diccionario corto.

### DLG-30 (low, S) Código muerto y destellos en el HUD de paciente
- **Evidencia:** `interventionRules` se pide al arrancar y no se lee (`simulation-play.component.ts:925, 990-993`); `applyFeedbackToPatient` y `applyPatientDelta` sin uso (`patient-state.util.ts:22-41`); `PATIENT_INITIAL_STATE` (confianza 20, estado 40) se pinta unos instantes antes de la hidratación del servidor (50/50, `startWorld` línea 1088 contra `hydrateClinicalState` 1884-1889).
- **Arreglo:** quitar la petición y las utilidades; sembrar el HUD con el estado del servidor.

### DLG-31 (low, S) Marcador de herramienta seleccionada persistente y etiquetas de NPC repetidas
- **Evidencia:** `closeDialogue()` (línea 1528) no limpia `selectedInteraction`, así que `tool-card--selected` queda resaltada hasta la próxima interacción; la "Familia en crisis" de urgencias y la de la sala de escucha tienen la misma etiqueta pero distinta función (seed 746, 860).
- **Arreglo:** limpiar la selección al cerrar; etiquetas distintas ("Abuela (familia)" frente a "Familia en duelo") coordinadas con DLG-02.

---

## 5. Lo que ya funciona y conviene conservar

- ETH-01 está bien resuelto: aviso de contenido antes de todo, Escape tragado en consentimiento, rechazar no muta el intento.
- Pausa reanudable real con el mismo `attemptId`, que restaura mapa y posición (confirmado en playtest).
- Separación entre `E` abrir y `Enter` en panel, con `preventDefault` correcto en avanzar y completar para no duplicar pulsaciones (`dialogue-panel.component.ts:489-514`).
- Lectores de pantalla: el texto animado va en `aria-hidden` y la línea completa en una región `aria-live` (líneas 59-60); opciones con `aria-label` que incluye "información incompleta".
- Movimiento reducido: `reduceMotion` apaga la máquina de escribir y las animaciones del panel.
- El mensaje de "retry" no revela la opción correcta, y el "porqué" de cada opción (`immediate_feedback`) es pedagógicamente bueno, solo mal ubicado.
- La compuerta de evidencia es "de presentación" y no impide decidir: respeta la autonomía del estudiante.

## 6. Cumplimiento de los límites de producto

| Límite | Estado | Detalle |
|---|---|---|
| 1. No revelar la respuesta antes de elegir | **Incumple en 3 puntos** | Objetivos de escena (DLG-08), forma/posición de las opciones (DLG-24), clasificación en el JSON del nodo (DLG-25). La UI no pinta color/icono/orden con ese fin. |
| 2. No convertir el duelo en juego | **Parcial** | "Puntaje +12", "¡Simulación completada!", "Excelente", barra "Manejo del duelo" (DLG-20). No hay puntos flotantes ni game over. |
| 3. No premiar rapidez / testimonio no cronometrado | **Cumple, con matiz** | El tecleo es saltable y no hay cronómetros; el resultado muestra "Tiempo" como cifra (DLG-20). La nota de transición "Quince días después" se retira sola a los 4,2 s (`simulation-play.component.ts:1977`). |
| 4. Salida segura siempre alcanzable (REGLA-004, ETH-02), aviso antes de narrativa (ETH-01) | **Incumple en intro y táctil** | DLG-17. ETH-01 sí se cumple. |
| 5. Sin migraciones ni cambios de esquema | **Cumple** | Todos los arreglos propuestos son de código, DTO y copy. |
| 6. WCAG 2.2 AA | **Parcial** | Teclado completo sí; objetivos pequeños y tipografía de 9 a 10,5 px (DLG-23, DLG-10); nombre accesible "Cerrar diálogo (Esc)" para "Continuar" (`dialogue-panel.component.ts:104`, ver `playtest-touch.md` TOUCH-09). |
| 7. Español con tildes, 59 FPS | **Parcial** | Tildes: DLG-29. FPS: no medible aquí (SwiftShader). |

## 7. Orden de ataque sugerido

**Primer bloque (S, desbloquea y evita decisiones por accidente):** DLG-01, DLG-03, DLG-02 (filtro de opciones), DLG-09 (etiquetas y aviso), DLG-15 (emociones y tamaño del retrato), DLG-18 (pausa calmada), DLG-17 (botón de pausa en overlays), DLG-07 (filtro en backend), DLG-08 (reescribir objetivos como lista de proceso), DLG-25 y DLG-29.

**Segundo bloque (M, la sensación de juego):** DLG-06 y DLG-05 (feedback antes del cambio de escena y para la última decisión), DLG-10 y DLG-11 (herramientas), DLG-13 (números coherentes y micro-delta en el HUD), DLG-16 (panel), DLG-19 (resultado con recorrido y porqué).

**Tercer bloque (L o contenido clínico):** DLG-22 (reacciones de NPC), DLG-24 (barajar y equilibrar opciones), DLG-12 (mensajes de herramienta por caso).

## 8. Inferencias y puntos a verificar al implementar

- DLG-03: el clic nativo por Enter/Espacio sobre la opción enfocada es lectura de código más captura del foco; conviene un test e2e (`Enter` tras mostrar opciones no debe llamar a `chooseDecision`).
- DLG-05: reaparición del diálogo viejo en el intento nuevo (inferencia; se evita con limpiar señales).
- DLG-07: sin prueba existente de los conteos con reintento; añadir test en `test_game.py` (dos retry críticos más seis correctas, esperado Final 1).
- DLG-13: comparación de números calculada de las constantes; confirmar con una partida (H2 correcta: barra de Confianza sin cambio).
- DLG-17: lo observado por los playtesters (inert, Esc) coincide con el código; falta probar la intro con teclado real.
- Decisión del equipo clínico pendiente: conservar o no el reintento de "primera respuesta mala", y revisar los textos que se mostrarían tras terminar (DLG-19).
