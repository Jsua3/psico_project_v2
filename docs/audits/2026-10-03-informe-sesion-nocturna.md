# Informe de la sesión nocturna — cierre del PLAN MAESTRO TOTAL

**Fecha:** noche del 2026-10-01 al 2026-10-02 (hora de Colombia) · **Rama:** `feat/cierre-plan-maestro` (sale de `master` @ `0f930b1`), respaldada en `origin`, **sin PR y sin merge**
**Encargo:** [`docs/superpowers/plans/2026-10-02-prompt-sesion-nocturna.md`](../superpowers/plans/2026-10-02-prompt-sesion-nocturna.md) · **Hoja de ruta actualizada:** [`2026-10-02-brechas-plan-maestro-total.md`](2026-10-02-brechas-plan-maestro-total.md)

## En una página

| Bloque | Qué se hizo | Estado |
|---|---|---|
| **B** Game feel | Implementado con TDD, revisado tarea por tarea y en una revisión final | ✅ Hecho. **Nadie lo ha visto en pantalla:** falta el pase visual |
| **C, E, F** | Tres propuestas para discutir con Psicología, coherentes entre sí, más una base común de hechos y un resumen de una página | 📝 Listas para la reunión. Nada implementado |
| **H** Accesibilidad | Auditoría (35 hallazgos) y plan TDD; se implementaron solo los arreglos claros (contraste, foco, nombres accesibles, movimiento reducido en el diálogo) | ⚠️ Parcial: quedan 3 bloqueantes que necesitan decisión (ver «Lo más importante») |
| **G** Asistente IA | Propuesta corta de alcance y privacidad | 📝 Lista. No implementado |
| **J** Escenario nuevo | Propuesta con la plantilla de lo que Psicología tendría que aportar | 📝 Lista. No implementado |
| Bloques visuales | Auditoría pieza por pieza | Ver sección 6 |

**Para empezar la reunión:** [`2026-10-03-propuestas-c-e-f-resumen.md`](../superpowers/specs/2026-10-03-propuestas-c-e-f-resumen.md) (una página).

## Lo más importante que encontré (no estaba en el encargo)

1. **La salida segura no es siempre alcanzable (REGLA-004).** Verificado leyendo el código, con archivo y línea, en la [auditoría del bloque H](2026-10-03-bloque-h-accesibilidad-brechas.md) §4:
   - Con un **diálogo de decisión abierto** no hay ningún botón de cierre ni de pausa, y el pie donde está «Salida segura» queda inerte. Con teclado hacen falta dos Esc; **en táctil o con ratón solo se sale eligiendo una opción** (H-01).
   - Durante la **introducción animada y la «Primera escena»** Esc no hace nada y no hay botón de salida, aunque el aviso de consentimiento promete que Esc estará disponible (H-02). Es donde está el texto más duro del caso.
   - No lo arreglé: cambia un flujo ético y una prueba actual fija el comportamiento. Está especificado como Tarea 10 del plan H y como «Fase 0b» de las propuestas C/E/F. **Recomiendo decidirlo mañana y hacerlo antes de la beta.**
2. **El mundo de Phaser no tiene alternativa para quien usa lector de pantalla** (H-06) y los atajos `J`, `E` y `WASD` no se pueden desactivar (H-07, WCAG 2.1.4).
3. **El asistente de IA:** la ruta está abierta y sin bandera de apagado; si alguien define la clave, cualquier sesión puede enviar texto libre a un proveedor externo. La pregunta se guarda en claro en `audit_logs` (360 días). Detalle en la [propuesta G](../superpowers/specs/2026-10-03-bloque-g-asistente-ia-propuesta.md).
4. **Un segundo caso no funcionaría hoy sin trabajo previo:** finales, métricas, banderas, aviso de contenido e introducción están atados en código a `SIM-VBG-001` ([propuesta J](../superpowers/specs/2026-10-03-bloque-j-escenario-hogar-consultorio-propuesta.md)).
5. **La hoja de ruta tenía dos errores**, ya corregidos: (a) atribuía al catálogo nombres de `RQ-NEG-002/003` que son de `PROMPT_MIGRACION_DJANGO.md` (en el catálogo son «competencias psicosociales transferibles» y «enfoque ético y de derechos»); (b) no vio que ya existía una viñeta de estrés en el DOM (`.stress-vignette` en `simulation-play`).
6. **«SIC» no está definido en ningún documento ni en el código**; las propuestas no lo usan y lo dejan como pregunta.

## 1. Bloque B — game feel

**Commits:** `8a39f65` (utilidad pura), `e84a1a4` (viñeta de crisis y destello), `f87d096` (sacudida y estrés al mundo), `76a1a88` (arreglo: los efectos esperan a que la sala se vea), `9ba9055` (arreglos de la revisión final).

**Qué hace ahora el juego**
- Viñeta de crisis rojo-violeta sobre la viñeta de tono: invisible hasta estrés 50, crece hasta 85 y **pulsa por encima de 85**. Con movimiento reducido no pulsa (queda fija). **Tampoco pulsa mientras hay un diálogo, la bitácora o el cierre abiertos.**
- Destello suave (120 ms, tope de opacidad 0,45) al cambiar de sala, una sola vez y nunca con movimiento reducido.
- Sacudida breve en decisiones riesgosas o inadecuadas, más fuerte en conducta prohibida; nunca con movimiento reducido.
- Si una decisión de alto impacto además cambia de sala, hay sacudida y no destello (nunca los dos).

**En qué me aparté del plan, y por qué** (todas las decisiones están también en el libro de registro de la ejecución; aquí va la lista completa)

| # | Decisión | Por qué | Qué cuesta si me equivoqué |
|---|---|---|---|
| 1 | La viñeta se pinta en el rectángulo visible, compensando el zoom de la cámara (`vignetteFrame`) | La cámara usa zoom 2 en salas sin renderer propio y un gráfico con `scrollFactor(0)` también se escala: la banda quedaba fuera de pantalla | Con zoom 1 es idéntico al plan; revertir ~10 líneas |
| 2 | Una tercera ruta de render (sala única con renderer registrado) también pinta la crisis | El plan solo cubría dos de las tres rutas | 2 líneas |
| 3 | Destello y sacudida se disparan **cuando la sala ya se ve** (fin del fundido de cámara, o 320 ms después de retirarse el fundido de escena) | Como estaban en el plan quedaban tapados por los fundidos: en la práctica no se veían | Revertir un commit |
| 4 | El destello lleva un tope de opacidad de 0,45 (**valor mío**) | Al dejar de estar tapado pasaba a ser un fogonazo; en un caso de VBG preferí la opción suave | Es una constante |
| 5 | La viñeta de tono que ya existía (`applyLightingOverlay`) también compensa el zoom | Tenía el mismo defecto: con zoom 2 nunca se vio. Primero decidí no tocarla; la revisión final mostró que sin eso el primer criterio de Done no se cumplía | En `SIM-VBG-001` no cambia nada (todas sus salas van a zoom 1); en salas zoom 2 de casos archivados o del editor ahora aparece una viñeta tenue. Revertir 6 líneas |
| 6 | El pulso se congela con el mundo en pausa (diálogo, bitácora, cierre) | WCAG 2.2.2: nada debe latir mientras se lee | — |
| 7 | Sacudida **o** destello, nunca los dos | Juntos tras una conducta prohibida resultaban bruscos | Una decisión de alto impacto que cambia de sala no destella |
| 8 | Se dejaron las dos viñetas de estrés (la DOM antigua, muy tenue, y la nueva) | Quitar la antigua es una decisión visual | Superposición leve |
| 9 | Se añadió un spec de comportamiento con dobles de Phaser | Todo el cableado estaba probado solo con expresiones regulares sobre el código fuente | — |

**Lo que NO se pudo hacer: verlo.** El Browser pane de la sesión arranca el `launch.json` del checkout principal (levantó el frontend de `master`, no el de esta rama) y un hook protege ese archivo; no lo rodeé. El fragmento de consola del Task 4 del plan no se ejecutó. La ejecución real del código nuevo la cubre el e2e (Chromium real, caso completo en cuatro tamaños de pantalla), pero **color, opacidad, grosor de la banda, tope del destello e intensidad de la sacudida no los ha visto nadie**.

**Menores que quedaron anotados sin arreglar** (ninguno bloquea): estrés > 100 se recorta a 100 y muestra crisis plena; falta fijar con un test la frontera 85/86 con movimiento reducido y la sacudida fuerte con `ADEQUATE` + conducta prohibida; la viñeta se redibuja en cada render (se podría hornear en una textura); el test de `[stressLevel]` no está acotado a la etiqueta del mundo; con red lenta la sacudida llega con el diálogo de supervisión ya abierto; `strokeVignetteBand` con zoom 2 solo está cubierto por contrato de texto.

## 2. Propuestas de C, E y F

**Commits:** `38e8ff2` (base común), `a47635d` (tres propuestas y resumen). Documentos en `docs/superpowers/specs/`:
- [`2026-10-03-propuestas-c-e-f-resumen.md`](../superpowers/specs/2026-10-03-propuestas-c-e-f-resumen.md) — una página para la reunión.
- [`2026-10-03-propuestas-c-e-f-base-comun.md`](../superpowers/specs/2026-10-03-propuestas-c-e-f-base-comun.md) — qué existe hoy de verdad (estado compartido, eventos, campos, caso), límites y glosario.
- [`…-bloque-c-dialogo-sintoma-propuesta.md`](../superpowers/specs/2026-10-03-bloque-c-dialogo-sintoma-propuesta.md) — recomienda «señal sobria»: ritmo y pausas para tres estados, retrato por línea con el arte actual, sin color de alarma, temblor ni glitch; la interrupción deja de ser una cuenta atrás.
- [`…-bloque-e-social-mapping-propuesta.md`](../superpowers/specs/2026-10-03-bloque-e-social-mapping-propuesta.md) — recomienda un mapa de red guiado, con lista primero; vínculos cualitativos, sin «afinidad» numérica ni puntos; la niña fallecida y la persona agresora no aparecen por defecto.
- [`…-bloque-f-verbal-tension-box-propuesta.md`](../superpowers/specs/2026-10-03-bloque-f-verbal-tension-box-propuesta.md) — recomienda entrevistas breves por turnos (2 a 4 intercambios), tono clínico sobrio, sin reloj ni reflejos; propone resolver D1 y D2 en ese sentido.

**Cómo se hicieron:** un analista reunió la base común leyendo el código; tres redactores escribieron en paralelo con las mismas reglas; un revisor las cotejó, corrigió ocho contradicciones (entre ellas: las tres querían usar el mismo momento del caso, M1; ahora es de F) y escribió el resumen. **Todo es lectura de código: nada se ejecutó.**

**Dos advertencias de procedencia**
- **El informe de Análisis y Diseño no se pudo abrir** (el artefacto pedía una aprobación que nadie podía dar esta noche). El marco ECD / LM-GM / MDA / INACSL de las propuestas viene de conocimiento general y está marcado así. Conviene contrastarlo con el informe.
- Las estimaciones de esfuerzo (≈ 45-75 días de Ingeniería para los tres, más 13-21 de Psicología) son orientativas y sin histórico.

## 3. Bloque H — accesibilidad

**Commits:** `b0b13ff` (auditoría y plan), `67cb0c2`, `100dd42`, `4dbf1fb`, `2200cd2`, `e301d4b` (lote A), `a712390`, `4573a09`, `249f5c5` (lote B).

**Auditoría** ([`2026-10-03-bloque-h-accesibilidad-brechas.md`](2026-10-03-bloque-h-accesibilidad-brechas.md)): 35 hallazgos contra WCAG 2.2 AA — 3 bloqueantes, 5 altos, 16 medios, 11 bajos — por lectura de código y cálculo de contraste. Incluye el recorrido exacto de la salida segura por teclado y puntero, 10 preguntas de decisión y la lista de lo que hay que verificar a mano con lector de pantalla y axe.

**Plan** ([`2026-10-03-bloque-h-accesibilidad.md`](../superpowers/plans/2026-10-03-bloque-h-accesibilidad.md)): 15 tareas. Ejecuté **solo las 8 con arreglo claro y prueba automática**, en dos lotes con su revisión:

| Tarea | Qué cambió | Hallazgos |
|---|---|---|
| 1 | Util puro de razón de contraste WCAG con mezcla de alfa (`frontend/src/styles/contrast.util.ts`) | base |
| 2 | Portada: botón primario `#8B5CF6→#7C3AED` pasa a `#7C3AED→#6D28D9` (de 4,23:1 a 5,70:1 como mínimo) | H-24 |
| 3 | Login: placeholder, divisor «o», «Conectando con Google…» y texto pequeño del panel índigo | H-25 a H-27 |
| 5 | Juego: anillo de foco de las opciones del diálogo (2,89:1 → 9,65:1) y del botón de salida segura (2,55:1 → 9,49:1); hablante de advertencia y etiqueta de emoción | H-14, H-15 |
| 6 | Foco visible en el buscador de Grupos y en los nodos del editor DAG (más `role="group"` y tecla Espacio) | H-17, H-18 |
| 4 | Login: nombres accesibles de los campos del registro, `role="group"` en el selector de perfil, «Volver al inicio» incluye el texto visible | H-29 a H-31 |
| 7 | **El panel de diálogo respeta el interruptor «Movimiento reducido» del juego**: la línea aparece completa, sin máquina de escribir; cambiarlo con un diálogo abierto no lo reinicia | H-13 |
| 8 | Portada: el botón del menú móvil anuncia si está abierto; la maqueta decorativa se oculta a lectores; grupos con nombre en el HUD | H-11, H-32, H-33 |

La tarea 7 es además el prerrequisito «Fase 0a» que comparten las propuestas C, E y F. El revisor del lote A recalculó 25 razones de contraste y coinciden con las del plan.

**Lo que NO se hizo, a propósito** (tareas 10-15, especificadas en el plan): la salida segura dentro de diálogos e introducción (decisión ética, H-01 a H-03), los atajos de una tecla (H-07), la alternativa no visual del mundo (H-06), los anuncios de estrés y las regiones vivas (hay que oírlos con un lector), el borde y las etiquetas visibles de los campos del login (cambia la identidad visual) y ampliar las puertas axe a `wcag22aa` (puede romper CI).

**Cambios visibles que conviene mirar:** el morado del botón primario de la portada es un tono más oscuro; el anillo de foco del botón de salida segura es más claro; en el editor DAG puede verse un doble indicador de foco (anillo global más trazo nuevo).

## 4. Bloque G — asistente de IA (propuesta, commit `47b1911`)

[`2026-10-03-bloque-g-asistente-ia-propuesta.md`](../superpowers/specs/2026-10-03-bloque-g-asistente-ia-propuesta.md). Hoy el backend envía al proveedor (OpenAI por defecto, Anthropic si se configura) la pregunta completa, el título del caso, el nodo actual y un texto fijo de instrucciones; no envía nombre, correo, ids, decisiones ni bitácoras. Recomienda: para el estudiante, primero una ayuda curada por Psicología **sin proveedor externo** y la IA de texto libre solo con concepto jurídico escrito; para el docente, ninguna IA que reciba datos de estudiantes por ahora. Lo legal (Ley 1581/2012, Decreto 1377/2013, Ley 1090/2006) está escrito de conocimiento general y pide validación jurídica institucional.

## 5. Bloque J — escenario nuevo (propuesta, commit `47b1911`)

[`2026-10-03-bloque-j-escenario-hogar-consultorio-propuesta.md`](../superpowers/specs/2026-10-03-bloque-j-escenario-hogar-consultorio-propuesta.md). Recomienda empezar por un **consultorio de primera escucha** (poco arte nuevo, menor riesgo ético, mejor prueba de que el sistema soporta un segundo caso) y dejar la visita domiciliaria para después, con protocolo ético propio. Trae la plantilla de entrega para Psicología y la lista de lo que hay que generalizar en código. Esfuerzo orientativo para el consultorio: Psicología 23-42 h + 6-10 h de revisión experta; Ingeniería 20-37 días; Arte 5-16 días. De paso: la semilla del caso crea o reinicia el usuario administrador con una contraseña fija escrita en el código (entorno de desarrollo).

## 6. Bloques visuales

[`2026-10-03-bloques-visuales-auditoria.md`](2026-10-03-bloques-visuales-auditoria.md), pieza por pieza contra el plan. **Ningún bloque está hecho tal como lo pedía el plan** (ninguna ruta ni nombre de archivo del plan existe en el repo); lo cumplido lo está por otra vía, y varias piezas ya no aplican.

- A (iconos de audio), F (overlays), H (efectos de decisión), I (mapas Tiled) y J (fondos): **hechos por otra vía** (iconos Material, viñetas y efectos por código, salas con renderer en vez de Tiled, fondos por CSS). Cambian respecto a la hoja de ruta, que los tenía «sin auditar» o «parcial».
- C (retratos), D (avatar), E (NPC ambientales): hechos por otra vía, confirmado. En C hay 10 PNG de 5 personajes y **falta la variante «cerrada»** que piden las propuestas C y F.
- B (tilesets) y G (UI kit): parciales. Faltan muebles de vivienda y props pequeños; cursores, flecha guía e iconos de genograma/ecomapa.

**Arte que más falta para la beta:** (1) retratos «cerrada» de la madre y de la sobreviviente, solo si se aprueban C y F (1-2 días); (2) el pase visual de calibración sobre el juego real (viñeta, destello, escala del jugador v1 frente a los NPC); (3) si entra un segundo caso, sus salas y personajes (5-16 días según la propuesta J).

**De paso:** `inventory.v1.json` declara 74 piezas y 41 no existen; `angular.json` copia al build los 13 MB de `assets/`, incluidos paquetes sin uso; la biblia premium prohíbe Material Icons y el HUD los usa.

## 7. Estado de las suites

**Sobre el último commit de código (`fe331d1`), todo en verde en una sola pasada:**

| Suite | Orden | Resultado |
|---|---|---|
| Frontend (Jest) | `npm run test:frontend` | **111 suites, 886 pruebas** en verde (en `master` @ `0f930b1` eran 824; +62 de esta noche) |
| Build de producción | `npm run build:frontend` | Limpio, sin errores ni advertencias |
| Backend (pytest, BD desechable) | `npm run test:backend` | **254** en verde (el backend no se tocó) |
| e2e (Playwright, Chromium real, BD y servidores de prueba propios) | `npm run test:e2e` | **24/24** en 8,5 min, incluido el caso completo en cuatro tamaños de pantalla |

**Historial del e2e durante la noche** (para que nadie se sorprenda si CI muestra algo parecido): cinco ejecuciones completas, tres de ellas 24/24. Las otras dos dieron 23/24, cada una con un fallo distinto y ajeno a la rama:
- `net::ERR_NO_BUFFER_SPACE` al abrir `/login` (agotamiento de sockets de Windows a los 221 ms, antes de tocar el juego), con varias tareas pesadas corriendo a la vez.
- axe midió el contraste del botón «Siguiente» del diálogo durante su animación de entrada (1,95:1 contra un fondo `#f7f7f7` que solo existe a mitad de la transición). La misma prueba pasó antes y después, y sola (4/4).

El segundo apunta a una fragilidad real de la puerta de calidad: axe puede ejecutarse antes de que termine la animación de entrada del panel. Conviene esperar al fin de la transición antes de medir.

No se probó nada contra `psychosim-db`: las pruebas usan su propia base desechable.

## 8. Lo que quedó a medias o sin hacer

1. **Pase visual del bloque B y de los cambios de color del bloque H.** *(El pase del bloque B se hizo el 2026-10-04: [`2026-10-03-pase-visual-bloque-b.md`](2026-10-03-pase-visual-bloque-b.md). Calibró el destello, el alfa fijo y los umbrales y respondió las preguntas 1, 2 y 4 de la sección 9; la 5, la sacudida, sigue pendiente de Producto.)* No se pudo hacer desde esta sesión. Recorrido sugerido con `npm run up` en un navegador real: subir el estrés por encima de 85 (o, en la consola en modo desarrollo, `ng.getComponent(document.querySelector('app-game-world')).scene.setStressLevel(92)`), cruzar una puerta, tomar una decisión riesgosa, abrir un diálogo con el estrés alto, y recorrer con Tab el botón de salida segura, el buscador de Grupos y un nodo del editor DAG.
2. **Verificación con lector de pantalla y axe** (lista en la auditoría H §6). En particular: con movimiento reducido el diálogo ya no tiene máquina de escribir, y dos pulsaciones rápidas de Enter podrían cerrar un diálogo de una línea sin leerlo; hay que comprobarlo con NVDA.
3. **Tareas 10-15 del plan H** (salida segura en diálogos e introducción, atajos de una tecla, mundo sin vista, anuncios, campos del login, puertas axe): especificadas, sin ejecutar.
4. **Informe de Análisis y Diseño:** sin leer (permiso). Las propuestas no lo citan como fuente.
5. **Residuales de movimiento reducido:** las animaciones CSS de entrada del panel de diálogo y un pulso del HUD siguen dependiendo solo de la preferencia del sistema, no del interruptor del juego; el interruptor no se puede alcanzar durante el aviso de consentimiento ni la introducción y no se recuerda entre cargas.
6. **Menores anotados sin arreglar** en ambos bloques (listados en las secciones 1 y 3 y, con más detalle, en los libros de registro locales). Ninguno bloquea un merge según las dos revisiones finales.
7. **e2e algo inestable bajo carga:** en dos de cinco ejecuciones falló una prueba distinta por causas ajenas a la rama (ver sección 7). Conviene vigilarlo en CI.

## 9. Preguntas para el usuario y su equipo

**Para decidir antes de mergear esta rama**
1. ¿Se ven bien la viñeta de crisis, el destello (tope 0,45) y la sacudida? ¿Hay que suavizar o intensificar algo? (sección 8, punto 1)
2. ¿Se retira la viñeta de estrés antigua del DOM (`.stress-vignette`) ahora que existe la de Phaser, o se quedan las dos?
3. ¿Se acepta el morado más oscuro del botón primario de la portada (necesario para llegar a 4,5:1)?
4. Con movimiento reducido (o con un diálogo abierto) la viñeta de crisis queda fija en 0,70, el punto medio del pulso. ¿Es el nivel adecuado, o debería quedarse en el mínimo (0,55)?
5. ¿El pulso por encima de 85 debe detenerse solo tras unos ciclos, además de con el interruptor de movimiento reducido?

**Para decidir antes de la beta**
6. **Salida segura dentro de los diálogos de decisión y de la introducción** (REGLA-004): ¿botón «Pausa segura» en el panel y en las tarjetas?, ¿Esc en la introducción?, ¿con o sin confirmación? (auditoría H, preguntas 1 y 2)
7. Atajos de una tecla, alternativa del mundo para lector de pantalla y anuncios de estrés (auditoría H, preguntas 3 a 5).
8. ¿Se adopta WCAG 2.2 AA y se actualiza `RNF-004` (hoy dice 2.1)?
9. Asistente de IA: ¿se añade ya una bandera de apagado a la ruta?, ¿quién autoriza enviar texto de estudiantes a un proveedor externo? (propuesta G, G-P1 a G-P3)

**Para la reunión con Psicología** (detalle y opciones por defecto en el [resumen](../superpowers/specs/2026-10-03-propuestas-c-e-f-resumen.md))
10. Tensión verbal: ¿medidor pasivo, entrevista por turnos o minijuego en tiempo real? (F-P1)
11. ¿Se aprueban las siete emociones canónicas y sus alias? (C-P9, C-P1)
12. Mapa de la red: ¿panel pasivo, inventario de pistas o mapa guiado? ¿Aparecen la niña fallecida y la persona agresora? (E-P1, E-P3, E-P4)
13. ¿Se le dice al estudiante en qué estado está la persona, o se le deja observarlo? (C-P2 = F-P14)
14. ¿Quién redacta y valida los intercambios de las entrevistas y los textos del mapa? (F-P5)
15. ¿Qué significa «SIC»? No está definido en ningún documento.
16. Escenario nuevo: ¿consultorio de primera escucha primero? ¿Quién escribe y quién revisa el caso? (propuesta J)

**Para Ingeniería**
17. ¿Siguen vigentes el spec premium y los seis planes del 2026-07-13? Se solapan con C y F y nunca se implementaron.
18. ¿Se limpian las dos numeraciones de `RQ-NEG` y la colisión de `RNF-010`?
19. `preview_start` de una sesión que nace en el checkout principal no puede previsualizar un worktree sin editar el `launch.json` principal (protegido por un hook). ¿Se añade allí una configuración fija para worktrees?

## 10. Cómo se trabajó

- Orquestación con subagentes Sonnet: implementadores con TDD, un revisor por tarea o lote, una revisión final por bloque y una ronda de arreglos tras cada revisión. El detalle de cada decisión quedó en libros de registro locales (`.superpowers/sdd/`, no versionados) y está resumido en este informe.
- No se tocó `master`, no se abrió PR, no se cambió el esquema, no se tocaron los datos de `psychosim-db` (las pruebas de backend y el e2e usan su propia base desechable) y no se cambió la semántica de la salida segura ni del consentimiento.
- Había otra sesión de Claude abierta («Activar modo automático», inactiva); no trabajaba en SIEP y no hizo falta coordinar.
