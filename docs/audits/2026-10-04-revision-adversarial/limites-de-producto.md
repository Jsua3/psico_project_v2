# Revisión de límites de producto y ética (lente L)

Rama `claude/peaceful-goodall-a2gobv`, HEAD `cab68d1` (difiere de `77d369f` solo en `frontend/angular.json`; `frontend/src` y `backend_django` son los de `77d369f`; los cambios sin commitear están en `frontend/e2e/**` y CI, ajenos a esta lente). Revisor: solo lectura sobre el repo. Fecha de las ejecuciones: 2026-10-04 03:00-03:25 UTC.

Todo lo jugado en navegador se hizo con **tester6@psychosim.edu.co** contra el stack que ya corría (front `:4200`, back `:8091`), un Chromium a la vez, sin tocar tester5. Las ejecuciones de tester6 dejaron intentos `REEMPLAZADO` y `Finalizado` en su historial (inevitable: cada prueba empieza un intento nuevo).

## Resumen ejecutivo

| # | Límite | Veredicto | Por qué |
|---|---|---|---|
| 1 | No revelar la opción adecuada | **Cumple en código y en red; 2 señales de contenido y 1 de proceso sin resolver** | Ninguna respuesta previa a decidir trae `classification` ni `prohibitedConduct` (ejecutado). El panel no distingue opciones. Pero la longitud y las palabras de las opciones delatan la adecuada en 4 de 6 nodos (L-04) y la lista convierte «usar la herramienta» en prerrequisito visible en los nodos 1, 4 y 6 (L-05) |
| 2 | No convertir el sufrimiento en juego | **Cumple con reservas de vocabulario** | Sonidos neutros (UI de Kenney), sin puntos flotantes ni fanfarria. Quedan marcador corriente, corazones, «¡Simulación completada!», «Obtuviste», «Reuniste» (L-07) |
| 3 | No revictimizar | **Cumple** | Sin relojes ni cuentas atrás; la tarjeta no usa temporizadores; los avisos de 2,5-4,5 s repiten lo que queda escrito en la lista o en la barra |
| 4 | ETH-01 / ETH-02 | **Cumple** | Ver detalle abajo |
| 5 | T11.1 backend | **Correcto y coherente en los números; deja ciego al docente y al estudiante en la lectura** | L-02, L-03 |
| 6 | Aviso del nodo 1 y promesa de salida segura | **FALLA en táctil, móvil vertical y tableta** (el aviso); la promesa (botón «Salida segura») sí se ve siempre | L-01 |
| 7 | Supervisión de la última decisión | **Cumple: no hay atrapamiento ni pérdida de datos**; recargar sí pierde la pantalla de resultado | L-09 |

Hallazgos: 0 bloqueantes, 0 altos, 4 medios (L-01 a L-04), 8 bajos (L-05 a L-12). CONFIRMED = reproducido con ejecución y con archivo:línea; PLAUSIBLE = leído en código sin reproducir.

## Hallazgos

### L-01 (medio, CONFIRMED) El aviso del nodo sensible no se ve por defecto en táctil, móvil vertical ni tableta; en escritorio desaparece al plegar la tarjeta
- Dónde: `frontend/src/app/features/simulator/simulation-play.component.ts:555` (`.objective-card:has(app-scene-checklist-card[data-collapsed='true']) .objective-card__notice { display: none; }`), `:1255-1256` (`cardFolded = compactMode() || narrowScreen()`; compacto = `(max-height:520px), (pointer:coarse) and (orientation:landscape)`, estrecho = `(max-width:760px)`), `:285-288` (el aviso vive solo dentro de `.objective-card`). El comentario de `:286` afirma «el único sitio visible en todos los dispositivos»: no es cierto.
- Reproducción (`review/L-s7.mjs`, `shots-L7-*/log.json`, capturas `02-2-sin-ayuda.png`):

| Viewport | Tarjeta al empezar | `.objective-card__notice` | Texto «Este caso aborda…» visible | «Salida segura» |
|---|---|---|---|---|
| Escritorio 1366x768 | desplegada | `display:block`, y=446 | **sí** | 144x46, operable |
| Táctil 844x390 | plegada (chip «Qué hacer · 6») | `display:none` | **no** | 136x44, operable |
| Móvil vertical 390x844 | plegada | `display:none` | **no** | 137x46, operable |
| Tableta 1024x768 (táctil) | plegada | `display:none` | **no** | 136x44, operable |

  Al tocar el chip aparece (táctil: rect 585,75,220x84); al plegar otra vez desaparece. En escritorio, «Ocultar pasos» lo oculta también (la copia del panel lateral solo sale si la etapa no tiene tarjeta, `:334`).
- Lo que sí funciona: el consentimiento ETH-01 se mostró antes (L-s1) y el botón «Salida segura» está a la vista y operable en los cuatro viewports; existe una nota solo para lector de pantalla (`:433`).
- Por qué importa: d43c407 se presentó como «vuelve a verse en todos los dispositivos»; en la práctica solo es cierto con la tarjeta desplegada. El recordatorio del nodo más duro del caso (muerte de una niña) no está a la vista de quien juega en móvil.
- Brecha de prueba: `simulation-play.sensitive-notice.spec.ts` solo prueba la señal `sensitiveNotice()`, no el CSS de plegado.
- Arreglo: sacar el aviso del contenedor plegable (una línea fija bajo el chip, o en la cabecera) o abrir la tarjeta desplegada la primera vez en el nodo sensible; añadir spec de contrato sobre `[data-collapsed='true'] .objective-card__notice`.

### L-02 (medio, CONFIRMED) T11.1: el panel del docente se contradice con los reintentos y no puede distinguirlos
- Dónde: `frontend/src/app/features/simulator/instructor-trace.component.ts:1631-1635` (`timelineEntryLabel`: `entry.prohibited` → «Contraindicada»), `:1421-1423` (`eventTitle` usa `classification`), `:1477-1481` (`timelineFeedback`: «Evento marcado como contraindicado…»), `:1641-1643` (`isDecisionEvent` sí excluye reintentos, el resto de la plantilla no). Backend: `backend_django/apps/simulation/services/instructor_service.py:127` (los contadores salen de `build_completion_report`, que ya no cuenta reintentos) y `:113-150` (el DTO de la traza no incluye `retries`).
- Reproducción (`review/test_limites_backend.py::test_L4`, salida `review/L4-retry.json`, hoy 03:21): primera respuesta prohibida en la decisión 1 (reintento) y luego la adecuada. Traza del docente: `prohibitedDecisions = 0`, `inadequateDecisions = 0`, pero la línea de tiempo trae `PROHIBITED_DECISION_RETRY_REQUIRED` con `prohibited: true` y `classification: INADEQUATE`, y `trace_has_retries_field = false`. La UI pinta esa fila como «Contraindicada» en rojo con el contador de contraindicadas en 0.
- Informe de grupo, dashboard y CSV: `decisionesInadecuadas = 0`, sin ningún campo de reintentos (esto ya era así antes de T11.1: `reportes/services.py:26` filtraba por decisiones registradas). El efecto nuevo de T11.1 es que la traza individual, que antes sí mostraba el intento, ahora lo oculta de los contadores.
- Qué sí se conserva: los eventos siguen en `attempt_events`, en la línea de tiempo y en `events` (auditables).
- Arreglo: exponer `retries` y `prohibitedRetries` en el DTO de la traza, en el informe de grupo y en el CSV; etiquetar en la UI «Primera respuesta no aplicada (reintento)» en `timelineEntryLabel`, `eventTitle` y `timelineFeedback`.

### L-03 (medio, CONFIRMED) T11.1: el cierre del estudiante ignora los reintentos (desempeño, recomendaciones, competencias)
- Dónde: `backend_django/apps/simulation/serializers/game_dtos.py:171-191` (competencias y recomendaciones salen solo de los contadores de decisiones registradas) y `frontend/src/app/features/simulator/outcome.util.ts:21` (`performanceLabel`). `retries` solo existe en el modelo (`simulation.model.ts:105`): ningún componente lo lee.
- Reproducción (`test_L5`, `review/L5-sixbad.json`): seis primeras respuestas malas (2 prohibidas, 4 riesgosas) y luego las adecuadas. Resultado: final «integral» (`recommended: 6`), `retries: 6`, **única recomendación** «Consolida el aprendizaje repitiendo el caso…», competencia «Comunicación ética y contención emocional», y `performanceLabel` da «Excelente»; el chip «Alertas éticas» no sale (`prohibitedDecisions = 0`). La única huella visible para el estudiante es la fila roja de la línea de tiempo.
- Lectura clínico-técnica: el juego le dijo en el momento «no se aplicó, reconsidera», lo cual es honesto; pero el resumen formativo final no menciona que reconsideró nada, y antes de T11.1 sí habría dicho «Revisa las decisiones riesgosas o inadecuadas con tu docente». La sonda gratuita por escena (1 intento sin costo y sin rastro en los agregados) ya existía en el juego; T11.1 quitó el último rastro agregado.
- Arreglo: si `retries > 0`, añadir una recomendación («Reconsideraste N respuestas; revísalas con tu docente») y un chip «Reconsideradas: N» en `attempt-outcome`; no contarlas como decisiones.
- Nota de coherencia (lo que sí está bien): student report, historial, final, contadores de la traza, informe de grupo y dashboard cuentan **lo mismo** (solo decisiones registradas): `L4-retry.json` y `L5-sixbad.json`.

### L-04 (medio, CONFIRMED en datos; contenido ya reconocido como DLG-24) La forma y el texto de las opciones delatan la adecuada
- No es un cambio de esta sesión ni un defecto de código: son los textos sembrados de `dialogue_choices` (lo que el panel muestra), medidos en la BD desechable (`psychosim_test`).

| Nodo | Longitudes (orden servido) | La adecuada |
|---|---|---|
| 1 `familia-duelo` | 56, **88**, 64 | la más larga; las otras dos son prohibidas |
| 2 `marco-normativo-hospital` | 38, 41, 50 | mediana; las riesgosas dicen «solo…» y «…como eje» |
| 3 `psicologa-acompanante` | 70, 54, 63, **81** | la más larga y la más completa («PAP + escucha + EPICEE/SPIKES + … + interdisciplina») |
| 4 `sobreviviente-consulta` | (herramienta 56), 72, 64, 66 | la más corta de las tres decisiones, pero es la única que une riesgo + protección + derechos |
| 5 `marco-normativo-comisaria` | **54**, 35, 47 | la más larga; las riesgosas dicen «…1448 como eje» |
| 6 `profesional-psicosocial` | 72, 72, **82** | la más larga y la única que empieza «Lo anterior + …» |

  «Elegir la más larga» acierta en 4 de 6 nodos (esperado al azar: 1,9). Palabras repetidas que delatan: «solo», «como eje», «Lo anterior +». Posición de la adecuada (ya variada): 2.ª de 3, 2.ª de 3, 4.ª de 4, 2.ª de 3 (tras la herramienta), 1.ª de 3, 3.ª de 3.
- El panel no añade señal propia: las tres opciones comparten clases y estilo (`dialogue-panel.component.ts:330-368`, solo `--chosen` y `--unavailable`) y la captura `review/shots-L4-laptop-esc/01-1-panel-6.png` las muestra idénticas. (Una diferencia de fondo en la 2.ª opción que aparece en `shots-L3-laptop/log.json` es el hover residual del ratón en la transición de 150 ms, no un estilo por opción.)
- F§10 ya reconoce DLG-24 y dice que barajar es técnico; no está implementado (el orden servido es el del seed).
- Arreglo: Psicología iguala longitud y quita las pistas de redacción; técnico: barajar por intento conservando la numeración.

### L-05 (bajo, PLAUSIBLE, reconocido solo en parte) «Usar la herramienta» como prerrequisito visible coincide con el contenido de la opción adecuada
- Dónde: `evidence-gating.config.ts:23-42` (`usedTools: ['PAP']` en el nodo 1, `['RISK_METER']` en los nodos 4 y 6, `tools: ['SPIKES']` en el 3), `stage-route.config.ts:86` (paso `u1-usar`) y `:125` (`u3-recoger`); textos «Recomendado antes de decidir: k de n hechos» y «Antes de decidir te falta: … usar el material de apoyo de la sala».
- La opción adecuada del nodo 1 dice «Aplicar PAP…» y la del 4 «Valorar riesgo de feminicidio…». F§10 solo admite el caso de H1. Con `NAME_TOOLS_IN_HINTS = false` la lista no nombra la técnica, pero la barra y el rótulo del mundo sí (L-06), así que quien sigue la lista llega a la decisión sabiendo qué técnica aplicó.
- Es proceso y no respuesta, pero en H1, H4 y H6 la frontera es fina. Decisión de producto (preguntas 1 y 2 de Psicología): ampliar el reconocimiento de F§10 a H4 y H6, o dejar los pasos de herramienta como sugerencia sin contador «k de n».

### L-06 (bajo, CONFIRMED) Los verbos de la barra nombran técnicas con `NAME_TOOLS_IN_HINTS = false`
- `interaction-verb.util.ts:15` usa la etiqueta del objeto del seed: «Recoger Kit PAP», «Recoger Protocolo EPICEE», «Recoger Valoración de riesgo», «Recoger Ruta de protección» (`review/L-text-unique.txt`, `L-text-hits.json`). P13 de F§2 dice «ninguna salida contiene PAP, SPIKES, RISK_METER ni nombres de herramienta»; las listas, avisos y puertas lo cumplen, los verbos no. El rótulo «Kit PAP» ya está dibujado sobre el objeto en el mundo (captura `shots-L7-touch/02-2-sin-ayuda.png`), así que es coherente con lo que se ve.
- Arreglo: precisar P13 («listas, avisos y puertas») o usar «Recoger material» para objetos `TOOL` con la bandera en `false`.

### L-07 (bajo, CONFIRMED; casi todo preexistente) Vocabulario y mecánicas de juego que el diseño decía evitar
- Nuevo en esta sesión: «Obtuviste: {herramienta}. Ya está en tu barra de herramientas.» (`orientation.config.ts:181`), «Anotado: …» (`:182-185`), «Reuniste lo recomendado.» (`:160`), contador «Herramientas k de 5». Preexistente: marcador corriente con ícono y `aria-label` «Seguimiento formativo: N puntos» (`simulation-hud.component.ts:97-100`; visto 0 → 10 → 66 durante el juego), corazones de estrés (`hud-hearts`, «calma restante»), «¡Simulación completada!» (`attempt-outcome.component.ts:311`), «Puntaje total» (`:107`), «+10 pts» en la línea de tiempo (`:152`), «Final 1 — …Lograste una intervención protectora…» (contenido del caso), «Tienes una última oportunidad» (mensaje del backend).
- Contradicción interna: `simulation-play.component.ts:2499` dice que «puntaje» convierte el caso en un marcador y por eso la supervisión no lleva cifras, pero el marcador sigue permanente en la cabecera.
- Lo que sí cumple: sonidos neutros: `item_pickup` es `rollover5.ogg` (UI de Kenney) a ganancia 0,7 y `session_complete` es `click5.ogg` (`audio-director.service.ts:34,95,102`); sin números flotantes ni fanfarria; la sonrisa del duelo está bloqueada (`portrait-resolver.util.ts`).
- Arreglo (copy, decisión de Psicología): «Recogiste: …», «Ya revisaste lo recomendado», quitar «¡» y «Lograste» del cierre, valorar quitar corazones y marcador de la cabecera.

### L-08 (bajo, CONFIRMED) La línea de tiempo del estudiante muestra claves internas
- `backend_django/apps/simulation/services/world_service.py:313-317` guarda «Herramienta usada: PAP sobre familia-crisis — pertinente (estrés -5%)» y `game_dtos.build_timeline` lo devuelve como `label`; `attempt-outcome.component.ts:150` (`{{ t.label }}`) lo imprime tal cual. Salida real en `review/L6-override.json` (`student_timeline_labels[0]`). Viola §5.7 (identificadores internos en pantalla); el desarrollador tocó esa línea para poner la tilde de «estrés» y dejó la clave.
- Arreglo: construir el `label` de `TOOL_USED` con el nombre de la herramienta y del objetivo (o no listar `TOOL_USED` en la línea de tiempo del estudiante).

### L-09 (bajo, CONFIRMED) Recargar con el caso terminado pierde la pantalla de resultado y la supervisión final
- Ejecutado (`review/L-s4.mjs laptop reload`, `shots-L4-laptop-reload/log.json`): con la supervisión final a la vista, recargar da `GET active-attempt 204` y luego `POST /attempts 200`: arranca un intento nuevo (aviso ETH-01 incluido) y no muestra el resultado (`simulation-play.component.ts:1452-1465`, ruta preexistente). No se pierde ningún dato: el historial muestra «Finalizado 66 pts 6 adecuadas» y «Ver resumen» abre el informe (`review/L-s8.mjs`, `shots-L8/log.json`), pero ese resumen no muestra el final («Final 1…») ni el texto de la supervisión final.
- Sin atrapamiento (ver «Comprobaciones»). Arreglo opcional: mostrar el final en «Ver resumen» y, al cargar un intento `COMPLETED` reciente, abrir su resultado en vez de empezar otro.

### L-10 (bajo, CONFIRMED como código muerto) Copy latente que revelaría la respuesta o nombra técnicas si alguien lo reactiva
- `scene-guide.config.ts:27-105` (hints como «Antes de decidir, toma el kit PAP… El objetivo es contener sin apresurarte»); su única puerta de entrada `getSceneGuide` devuelve `null` siempre (`:107-111`). `scene-objectives.config.ts:10-31` (`SCENE_OBJECTIVES`: «Valora el riesgo, activa medidas de protección y orienta derechos sin revictimizar» para el nodo 4) sin consumidor fuera de specs. `risky-interaction.config.ts:33-36` (`PROXIMITY_STEP_HINTS`: «Acción riesgosa: contacto con agresor») sin consumidor y para claves que no existen en el mapa.
- Hoy no se muestra nada de esto (grep de consumidores). Arreglo: borrarlo o añadir un spec que prohíba su uso.

### L-11 (bajo, PLAUSIBLE, no ejecutado) T11.1: condición de carrera y constante duplicada
- `game_service.py:359-364`: el conteo `prior_retries` no bloquea el intento; dos POST de respuesta mala concurrentes en el mismo nodo verían ambos `0` y registrarían dos reintentos (tercera oportunidad y `retries = 2` por una escena). La UI lo evita (`busy`), un cliente directo no. No se ejecutó (las pruebas del repo prohíben `transactional_db`).
- `reportes/services.py:26` (`DECISION_EVENT_TYPES`) duplica `case_effects.py:25` (`REGISTERED_DECISION_EVENT_TYPES`): riesgo de que se desalineen.
- Los informes se calculan al vuelo: tras el despliegue, el informe y el final de intentos antiguos cambian retroactivamente (sin migración).

### L-12 (bajo, PLAUSIBLE) Solo el nodo 1 está marcado como contenido sensible
- BD desechable: `simulation_nodes.sensitive_content = true` solo en `hospital-urgencias`; el consultorio (testimonio de la sobreviviente) y la recepción (expediente con «28 heridas… su hija de 3 años fue asesinada») no llevan aviso de nodo ni `safe_exit_required`. El aviso global ETH-01 sí cubre el caso. Es un dato de siembra, no de código.

## Comprobaciones que pasaron (con cómo se ejecutaron)

**(1) No revelar**
- Código: `grep` de `classification|prohibitedConduct|isRecommended|isProhibited` en `frontend/src` sin specs: solo aparecen en feedback posterior a decidir (`patient-state.util`, `game-feel.util`, `game-world.component:644-653`, `simulation-play:2486-2510,2794-2800`), editores y panel del docente. `SimulationDecisionOption = {id, text}` (`simulation.model.ts:138-142`); `isRecommended`/`isProhibited` ya no existen.
- Red real: `test_L1` (7 endpoints de jugador × los 6 nodos) sin hallazgos (`review/L1-findings.txt`); en navegador (`review/L-s3.mjs`, tester6) 27 respuestas previas a decidir sin `classification` ni `prohibitedConduct`; las únicas claves de cifras son `stressDelta` en `tools/use`, que es retroalimentación de herramienta, no de decisión. Tras decidir, el feedback sí trae la clasificación (esperado). `map_objects.decision_option_id` es nulo en todo el seed.
- Barrido de texto: producto cartesiano de 49.152 estados (etapa × sala × inventario × herramientas usadas × personas habladas × inspeccionado × salas visitadas) más puertas y avisos de evidencia, 262 cadenas únicas (`review/L-text-unique.txt`): sin relojes, sin exclamaciones, sin vocabulario de logro en la lista, sin claves internas, sin PAP/SPIKES/RISK_METER en listas, avisos ni puertas. Los 37 «hits» son: nombres propios de personas y salas que comparten raíz con alguna opción («crisis», «psicosocial», «decisiones», «derechos»; falsos positivos porque nombran lugar), los verbos de L-06 y dos frases de ayuda que niegan marcar la respuesta.
- `HIGHLIGHT_TOOL_TARGETS`: el anillo marca el objeto que aloja la decisión o el maletín; `dimmedKeys` atenúa decisiones de otras etapas sin mirar clasificación (`simulation-play.component.ts:1355-1359`).

**(2)-(3)** `grep` de `setTimeout/setInterval` en `features/simulator`: la tarjeta «Qué hacer» no tiene temporizadores; los avisos (`nothingNearby` 2,5 s, `doorNotice`/`softNotice` 4,2 s, `actionError` 4,5 s) repiten algo que queda en la lista, la barra o el panel. `disappearedAfter6s` vacío en los 4 viewports (`L-s1`).

**(4) ETH-01 / ETH-02** (`review/L-s1.mjs`, 4 viewports: táctil 844x390, vertical 390x844, escritorio 1366x768, tableta 1024x768, tester6)
- Con el aviso de contenido a la vista: no existen `app-game-help`, `app-scene-checklist-card`, `app-simulation-hud` ni `app-game-world`; 0 peticiones de audio/video/`world` antes del consentimiento; Esc se traga (0 llamadas, el aviso sigue).
- Tras «Continuar» (audio y mundo empiezan después): Esc en la introducción → `POST safe-exit 200 PAUSED`, foco en «Reanudar este intento», reanudar vuelve a la introducción; «Salida segura» presente en introducción y contexto. Pausar y reanudar en sesión nueva vuelve a pedir el aviso (`shots-s5/log.json`, ejecutado tras HEAD).
- `pauseFromOverlay()` no actúa bajo el aviso ni bajo el de reanudar (`simulation-play.component.ts:2255`); `safeExit()` y el backend `safe_exit` no cambiaron (`git diff` sin cambios en `game_service.safe_exit`).
- REPLACED no es salida segura: el historial dice «Reemplazado por un intento nuevo» (`L-s8`), `reportes/tests/test_reemplazo_vs_salida_segura.py` pasa.

**(5) T11.1**: `backend-tests.sh apps/simulation apps/progression apps/reportes` → **229 passed** (tras restaurar la BD, ver incidencia); pruebas de lente `review/test_limites_backend.py` → 7 passed. Los reintentos siguen en `attempt_events`, en `timeline` y en `events`. Override de evidencia: el mensaje del jugador no lo trae (`L6-override.json: override_in_feedback_message=false`); queda en el detalle del evento para el docente. `missingEvidence` está acotado (8 × 160). `AI_ASSISTANT_ENABLED` apagado: `POST /api/simulation/ai-assistant` en `:8091` → 404 «El asistente no está disponible»; el frontend no lo consume; el contexto que envía no incluye opciones ni clasificaciones.

**(7) Supervisión de la última decisión** (`review/L-s4.mjs`, tester6, 5 decisiones por API y la 6.ª por la UI con la compuerta de evidencia):
- Escritorio, Esc: cierra la supervisión y abre el resultado («¡Simulación completada!», «Final 1…»); un 2.º Esc no hace llamadas (no pausa un caso terminado).
- Táctil 844x390, botón «Salida segura» de la cabecera del panel: abre el resultado, 0 llamadas.
- `pauseFromOverlay()` con `holdingOutcome()` cierra la supervisión en vez de pausar (`:2246-2252`); `holdingOutcome` exige diálogo a la vista y estado `COMPLETED`, y si el diálogo desaparece por cualquier camino el resultado se abre (`:1219-1226,1399-1402`); un fallo de `loadWorld` suelta la retención (`:2545`).
- No ejecutado: variantes «Continuar» y «Volver al mapa» (mismo `closeDialogue`), ni la 6.ª decisión en vertical o tableta.

## Incidencia de mi lado (honestidad)
Al intentar repetir las pruebas de lente con `backend-tests.sh /ruta/fuera/del/repo/test_limites_backend.py`, pytest perdió `pytest.ini` (`--reuse-db --nomigrations`) y recreó la BD desechable `psychosim_test`, dejándola con 5 tablas. La restauré con `backend-tests.sh --reseed apps/progression -q` (reutiliza `bootstrap_dev_db` sobre esa misma BD desechable) y comprobé después 229 passed en simulation + progression + reportes. **No se tocó la BD de desarrollo `psychosim`** ni los intentos de tester5. Si otro revisor ejecutó pytest entre 03:19 y 03:22 UTC puede haber visto fallos de «relation does not exist». Para ejecutar pruebas ajenas al repo hay que añadir `-c <repo>/backend_django/pytest.ini --rootdir <repo>/backend_django`.

## Artefactos (todos en `review/`)
`L-s1.mjs` y `shots-L1-{touch,portrait,laptop,tablet}/log.json` (ETH-01/02, exploración); `L-s3.mjs`, `shots-L3-laptop/log.json` (respuestas HTTP previas a decidir, panel, supervisión); `L-s4.mjs`, `shots-L4-laptop-esc`, `shots-L4-laptop-reload`, `shots-L4-touch-button` (última decisión); `L-s7.mjs`, `shots-L7-*/log.json` (aviso del nodo sensible); `L-s8.mjs`, `shots-L8/log.json` (historial); `limites-text.spec.ts` + `jest.limites.config.js` → `L-text-unique.txt`, `L-text-hits.json`, `L-text-combos.txt`; `test_limites_backend.py` → `L1-findings.txt`, `L2-options.json`, `L4-retry.json`, `L5-sixbad.json`, `L6-override.json`, `L7-dialogue-order.json`; `L-pytest-3apps.log`. `L-harness.mjs` es una copia de `harness.mjs` apuntada a `:8091` y a tester6.
