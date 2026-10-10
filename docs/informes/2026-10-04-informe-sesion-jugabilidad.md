# Informe de la sesión de jugabilidad — «se sabe qué hacer y se siente bien»

**Fecha:** noche del 2026-10-02 al 2026-10-04 (hora de Colombia) · **Rama:** `claude/peaceful-goodall-a2gobv` (sale de `master` @ `51d1409`), respaldada en `origin`, **sin PR y sin merge**
**Encargo:** «que el simulador cumpla con todas sus líneas de desarrollo y sea jugable bien; hoy lo probé y está muy mal en que no se sabe muy bien qué hacer» · **Cifras:** 113 commits, 154 archivos. +21.607/−829 líneas

## En una página

| Pregunta | Respuesta |
|---|---|
| ¿Por qué «no se sabía qué hacer»? | No era falta de pulido: el objetivo seguía al **nodo** del caso y no a la **sala**, ninguna señal decía qué era interactivo, la decisión 1 y sus requisitos vivían en salas distintas, y no existía ninguna ayuda («Cómo se juega»). Además había **bloqueos reales**: una decisión «muerta» sin mensaje, una enfermera obligatoria que no se podía hablar, y la salida segura inalcanzable con un diálogo abierto. Lo midieron tres jugadores de prueba con Chromium real ([diagnóstico](2026-10-03-diagnostico-jugabilidad)). |
| ¿Qué cambió? | Hay una lista viva **«Qué hacer»** con el siguiente paso (también entre salas), un contador único «Decisión k de 6», una barra inferior con verbos («Hablar con Enfermera de urgencias», «Recoger…», «Pasar a…» con candado y motivo), un anillo sobre el siguiente destino, avisos al recoger y al anotar un paso, ayuda de primera vez y pantalla «Cómo se juega», y un modo compacto para móvil. La **salida segura** funciona en todos los estados. |
| ¿Está verificado? | Jest **149 suites / 1.802 pruebas en verde (línea base: 111 / 886)** · pytest **297 en verde (línea base: 254)** · build de producción limpio · e2e **todo en verde contra el código final: caso completo de las seis decisiones en los 4 viewports (escritorio 1600 y 1366, móvil 390 y 412), salida segura 6/6 (escritorio y táctil, incluido el servidor lento), recorrido guiado 3 (+1 táctil omitido, ver §5), axe de calidad 4/4, consentimiento 3/3, lobby 6/6, mundo vivo 4/4, sin chatbot y fuentes** · dos revisiones adversariales independientes (límites de producto y salida segura/accesibilidad) con hallazgos reproducidos y corregidos. Todo jugado en Chromium real en 1366×768, 1600×900, 1024×768, 844×390 táctil y 390×844/412×915 vertical. |
| ¿Qué NO está? | El contenido clínico de los bloques C (ritmo y pausas), E (mapa de la red) y F (tensión verbal) **no se inventó**: lo debe redactar y validar Psicología. Tampoco la decisión en dos tiempos (T9.12), los atajos de una tecla (WCAG 2.1.4) ni la generalización a un segundo caso. Ver §5. |
| ¿Qué necesita una persona? | **Confirmar T11.1** (los reintentos ya no cuentan como decisiones), decidir la sacudida de cámara, revisar la longitud y redacción de las opciones (la más larga acierta en 4 de 6 nodos) y varias decisiones de copy. Ver §6. |

## 1. Qué pasaba y por qué

Tres jugadores de prueba (teclado «recién llegada», táctil, y «sensación de juego» medida) y cuatro auditorías de código llegaron a lo mismo:

- **El jugador no sabía a dónde ir.** El objetivo («Estabiliza emocionalmente a la familia…») es un fin, no una acción, y no cambiaba al cambiar de sala. «Escenario 1 de 8» y «Paso 1 (1/6)» eran dos contadores incompatibles y el «8» nunca se alcanzaba. Los cinco espacios de herramientas aparecían bloqueados y grises, con números 1-5 que no hacían nada.
- **Había callejones sin salida:** elegir una decisión de otra etapa dejaba el panel bloqueado y sin mensaje; la enfermera exigida para la decisión 1 «no respondía» (10 pulsaciones de E); en móvil horizontal las opciones de la decisión eran inalcanzables; y con un diálogo abierto no había forma de pausar.
- **La experiencia de juego era mudía:** recoger herramientas, cruzar puertas y desbloquear no daban respuesta; el mundo se encogía tras el primer diálogo; el botón táctil tapaba el piso.
- **Qué sí funcionaba y se conservó:** el movimiento (150 px/s sin atascos ni inercia), el mensaje de puerta bloqueada (el mejor «qué hacer» que había), el aviso de contenido (ETH-01), la pausa/reanudar y la bitácora.

Causa de fondo: el caso tiene tres capas (**nodo** del DAG, **sala**, **objeto de decisión**) y la interfaz hablaba casi solo de la primera. En 2 de las 6 decisiones el punto de decisión está en una sala distinta de la que aparece el jugador, y ningún texto lo decía.

## 2. Qué ve ahora el jugador

| Momento | Antes | Ahora |
|---|---|---|
| Primeros 10 s | Un objetivo abstracto; nada marcado como interactivo | Tarjeta **«Qué hacer · Decisión 1 de 6»** con el siguiente paso y dónde («a la izquierda, al frente»), anillo estático bajo el maletín, nombres legibles sobre lo cercano, «Ahora: …» en la barra, tarjeta de ayuda de primera vez |
| Al acercarse | Rótulo de 9 px; la persona nunca llegaba a la barra; una puerta le robaba la tecla E | Botón principal con verbo y nombre; una **persona gana a una puerta** más lejana; botón secundario «También: …»; E funciona aunque la pulsación sea corta |
| Puertas | Se descubría al pulsar | Candado y **motivo antes de pulsar** («Antes de pasar: …») con nombres, nunca claves |
| Al recoger / anotar | Silencio | «Obtuviste: …», sonido neutro, la fila pasa a hecha y el anillo salta al siguiente paso |
| Decisiones | Opciones de otras etapas abiertas y muertas; insignia «información incompleta» en cada opción | Solo las de la etapa; aviso único de lo que falta; la conversación de otra etapa es informativa; un fallo libera el panel y dice por qué |
| Herramientas | Cinco ranuras bloqueadas sin explicación | «Herramientas 2 de 5», ranuras enfocables con «Se consigue explorando las salas del caso» |
| Móvil horizontal | Controles sobre el piso, objetivo tapando el mundo, atajos de teclado visibles | Cruceta en cruz y «Interactuar» (con su verbo) en las bandas laterales, tarjeta plegada a un chip, pie de altura fija, sin atajos de teclado |
| Salida segura | Inalcanzable en diálogos con opciones, introducción y contexto | Un botón «Salida segura» en cada estado (introducción, contexto, diálogo, supervisión, bitácora, ajustes, ayuda) + Esc; la pausa en cola con una petición en vuelo |
| Pausa | Tablero de puntaje con «Reanudar» fuera de pantalla | «Tu caso está en pausa», «Reanudar este intento» primero, con foco, y el tablero plegado |
| Última decisión | Su supervisión nunca se leía | Se lee sobre la escena y el resultado se abre al cerrarla |

## 3. Defectos reales hallados y corregidos (no estaban en el encargo)

1. **El destello del bloque B no era seguro.** Con el tope 0,45 la sala saltaba 0,17 de luminancia (el umbral de WCAG 2.3.1 es 0,10) y se lavaba. Bajado a 0,20 (salto 0,056) con una prueba que calcula la cota. Es el primer pase visual real del bloque B.
2. **La enfermera sí era alcanzable.** Tres causas apiladas: la barra nunca ofrecía personas; con una persona la tecla E dependía solo del `JustDown` de Phaser, que se pierde con pulsaciones cortas; y el cliente prometía 60 px mientras el servidor rechazaba desde 62 px. Corregidas las tres ([diagnóstico medido](2026-10-03-diagnostico-enfermera-y-escala.md)).
3. **El canvas no recuperaba su tamaño**: `refresh()` de Phaser consume el aviso de cambio sin releer el contenedor.
4. **La clasificación de cada opción viajaba al cliente antes de decidir** (`classification` y `prohibitedConduct`), contra el límite de «no revelar la respuesta». Ya no sale del servidor ni se lee en el cliente; una prueba estática lo vigila.
5. **El reporte contaba las primeras respuestas malas como decisiones** y podía dar el Final 4 «Intervención Crítica / Revictimizante» con seis respuestas finales correctas. Corregido (T11.1) y, tras la revisión, hecho visible: ver §6, pregunta 1.
6. **La línea de tiempo del estudiante mostraba claves internas** («PAP sobre familia-crisis»); ahora nombra la herramienta y el objeto.
7. **Tras la integración, el primer Enter no avanzaba el diálogo** (la cabecera fija robaba el foco inicial). Hallado jugando; corregido y con prueba de contrato.
8. **El aviso de contenido sensible del nodo 1** se había escondido al plegar la tarjeta (en móvil, siempre). La revisión lo detectó; ahora es una franja fija bajo la cabecera, visible en 1366×768, 844×390, 390×844 y 1024×768 con la tarjeta plegada o no.
9. **La salida segura quedaba bajo el fundido de escena** mientras una puerta o decisión esperaban al servidor; con una petición colgada no había plazo para la pausa. Corregido en la ronda de revisión.
10. **Higiene de CI y build:** el e2e medía el contraste a mitad de una animación (falso fallo ya anotado en el informe nocturno), una carrera táctil hacía fallar el caso completo en 390 px, y el presupuesto de CSS de `simulation-play` superaba el aviso (ahora 20 kB de aviso y 22 kB de error, deuda anotada: extraer ese CSS).

## 4. Líneas de desarrollo (hoja de ruta)

Detalle por bloque en la [actualización de la hoja de ruta](2026-10-02-brechas-plan-maestro-total.md). En resumen: **A** audio mejorado (sigue 1 de 4 capas), **B** visto y calibrado, **C** fase 1 sin contenido nuevo, **G** apagado por defecto y ayuda sin IA, **H** T10 hecha (salida segura), **I** gitleaks y job nocturno de orientación, **K** onboarding hecho. **E, F, J** y el resto de C/H quedan para después (§5).

## 5. Lo que NO se hizo, y por qué

| Qué | Por qué |
|---|---|
| Contenido de **C** (ritmo y pausas del habla), **E** (mapa de la red) y **F** (tensión verbal) | Es contenido clínico sobre violencia de género: lo debe redactar y validar Psicología (propuestas en `docs/superpowers/specs/2026-10-03-*`). Solo se construyó lo técnico que no necesita contenido |
| **T9.12** decisión en dos tiempos | Cambia el orden de la supervisión y del fundido y habría exigido reescribir el e2e. Hoy la supervisión de las decisiones 1-5 se lee sobre la sala nueva tras el fundido; la de la última sí se lee antes del resultado |
| **H T11** atajos de una tecla (2.1.4), **T13** anuncios de estrés, **T15** foco/`aria-modal`/`wcag22aa` | Tocan los tres archivos grandes; van en un carril por archivo, después de las decisiones de §6 |
| **J** segundo caso | Antes hay que generalizar finales, métricas, aviso e introducción atados a `SIM-VBG-001` |
| Endurecer `JWT_SECRET` y la contraseña del administrador (T15.2-3) | Podría tumbar un despliegue existente; depende de si el despliegue de Railway es público |
| Recortar `roster.v1.json` a 8 identidades | Está fijado por hash y lo exige el generador; se dejó una prueba de contrato del desajuste |
| Informe de grupo y CSV con los **reintentos** (L-02) | Vive en `backend_django/apps/reportes`, el CSV es posicional y la pantalla de reportes no tiene dónde mostrarlo. El docente ya los ve en la traza individual («Primera respuesta no aplicada (reintento)», contador «Reconsideradas») y el estudiante en su cierre |
| Anuncios del **cambio de sala** para lector de pantalla (F6) | Cuatro avisos casi simultáneos («Entraste a…», banner, nota de la tarjeta y barra); hay que decidir cuál es la fuente única. Los de puerta, herramienta y leyenda sí se deduplicaron |
| Recorrido guiado **táctil** de 844×390 (prueba `guided-first-minute`) | El barrido «sin coordenadas» no siempre llega a la enfermera; esa prueba queda solo en escritorio, con nota en el código. El primer minuto táctil y el caso completo en móvil (390 y 412) sí pasan |
| Hallazgos bajos de la revisión (L-05, L-06, L-07, L-09 a L-12, F8, F10 a F12) | Decisiones de copy o de producto, código muerto, o de impacto menor; están reproducidos en [`2026-10-04-revision-adversarial/`](2026-10-04-revision-adversarial) |
| Verificación con lector de pantalla real, FPS reales y teléfono físico | No hay GPU ni hardware aquí: el WebGL es por software (≈ 20 fps), así que no sirve para medir los 59 FPS |

## 6. Preguntas para personas (valor por defecto ya aplicado)

Las preguntas de Psicología (1, 2, 4, 5, 6, 7, 13) y dos de producto (8, 9) están también en la [guía de revisión para Psicología](2026-10-04-guia-revision-psicologia.md): un recorrido de 15 minutos con casillas para responder.

| # | Quién | Pregunta | Por defecto |
|---|---|---|---|
| 1 | Psicología | **T11.1:** los reintentos («la primera respuesta mala no se aplica») ya no cuentan como decisiones en el reporte ni en el final. ¿Es lo que se quiere? Se hicieron visibles (recomendación y chip para el estudiante, etiqueta propia para el docente). Una sonda gratuita por escena existía antes | Aplicado: no cuentan, se muestran aparte |
| 2 | Psicología | **Longitud y redacción de las opciones:** «elegir la más larga» acierta en 4 de 6 nodos y hay palabras que delatan («solo», «como eje», «Lo anterior +») (DLG-24 / L-04). Igualarlas es contenido clínico. Barajar el orden por intento es técnico | Sin cambios |
| 3 | Producto | **Sacudida de cámara tras una opción riesgosa** (límite 2): medida en ±3 px (riesgosa) y ±6 px con saltos de 10 px (prohibida). Se recomienda limitarla a conducta prohibida | Se mantiene |
| 4 | Psicología | ¿Se pueden **nombrar las herramientas** en la lista y mantener el anillo sobre el maletín (`NAME_TOOLS_IN_HINTS`, `HIGHLIGHT_TOOL_TARGETS`)? Hoy la lista no las nombra, pero los verbos de la barra y los rótulos sí («Recoger Kit PAP») | Genérico en la lista; anillo activo |
| 5 | Psicología | Líneas existentes que adelantan la respuesta de H1 (enfermera, médico, psicóloga orientadora, apoyo psicosocial, «Familia en crisis» y la narrativa del nodo 1) y los «Usar la herramienta» como paso visible en H1, H4 y H6 | No se tocan |
| 6 | Psicología | Copy de **puntaje y logro**: el marcador permanente de la cabecera, «¡Simulación completada!», «Puntaje total», «Obtuviste», «Reuniste» (límite 2) | Sin cambios |
| 7 | Psicología | Solo el nodo 1 está marcado como sensible; el consultorio (testimonio) y la recepción (expediente) no llevan aviso de nodo | Sin cambios |
| 8 | Producto | **Pausar en el contexto y reanudar** vuelve a mostrar la introducción animada con su música (re-exposición para quien pausa por malestar) | Se mantiene |
| 9 | Producto | «Salida segura» sobre la supervisión final lleva al **resultado con puntaje**; revisar el copy | Se mantiene |
| 10 | Ingeniería | ¿Caso completo de escritorio en cada PR que toque el simulador (~15-20 min)? Borrador inactivo en `docs/pendientes/deudas/e2e-full-case-pr.yml.draft` | No activado |
| 11 | Dirección | ¿El despliegue de Railway es público? Define la urgencia de `JWT_SECRET`, `REFLECTION_ENCRYPTION_KEY` y las credenciales demo | Sin cambios |
| 12 | Dirección | Casos futuros en la portada: «próximamente» o fuera | «Próximamente» |
| 13 | Psicología y dirección | Recursos de apoyo de la pantalla de pausa (ETH-01 sigue pendiente de verificación externa) | Los de la bitácora |
| 14 | Ingeniería | Las demás preguntas del [backlog](../pendientes/deudas/2026-10-03-orientacion-jugabilidad-backlog.md) §5 (1-18) siguen vigentes con sus valores por defecto | — |

## 7. Cómo verificarlo mañana

```powershell
npm run up                        # PostgreSQL + Django + Angular (README)
npm run test:frontend             # Jest
npm run test:backend              # pytest (BD desechable)
npm run build:frontend            # build de producción (sin advertencias)
npm run test:e2e                  # Playwright (caso completo en 4 viewports, orientación, salida segura)
```

Recorrido a mano de 10 minutos (entra como `estudiante@psychosim.edu.co`, `/portal/jugar`):
1. Aviso de contenido → introducción → contexto: en cada uno hay un botón **«Salida segura»**; púlsalo en la introducción y reanuda.
2. En la sala de Urgencias comprueba la tarjeta **«Qué hacer»**, el anillo bajo el maletín y la línea «Ahora: …».
3. Recoge el kit: aviso «Obtuviste…», el paso se marca y el anillo salta a la familia.
4. Acércate a la **enfermera** y pulsa E una sola vez (pulsación corta): abre su conversación.
5. Intenta la puerta de la sala de escucha sin haber hablado con la familia: lee el motivo **antes** de pulsar.
6. Abre un diálogo con opciones y pulsa **«Volver al mapa»** y **«Salida segura»**; en móvil horizontal (844×390) las opciones 1-3 se ven y se tocan.
7. Haz las seis decisiones: tras la última se lee la supervisión y luego el resultado.
8. Abre Ajustes → «Cómo se juega» y «Ver la ayuda otra vez».
9. En un móvil o con el emulador a 390×844 comprueba el aviso de contenido sensible visible durante la primera sala.
10. Sube el estrés a 90 (consola: `ng.getComponent(document.querySelector('app-game-world')).scene.setStressLevel(90)`) y mira la viñeta de crisis.

## 8. Cómo se trabajó

- Orquestación con subagentes: un diagnóstico (3 playtests, 4 auditorías, 3 diseñadores y un juez), después implementación por **pistas de archivos exclusivos** con contratos entre componentes (panel y seguridad, lógica de orientación, componentes, mundo, HUD/audio, backend, integración), TDD, revisión por pista y verificación jugada, un pase visual, la adaptación y ejecución real de los e2e, y por último **dos revisiones adversariales independientes** y una ronda de correcciones.
- Fuentes de verdad del trabajo: [diseño final](../diseno/orientacion-jugabilidad.md) y [backlog por pistas](../pendientes/deudas/2026-10-03-orientacion-jugabilidad-backlog.md).
- **Incidencias:** (a) a mitad de la fase final los agentes de e2e y de revisión murieron por un límite de uso semanal y el contenedor se reinició; no se perdió trabajo (todo estaba commiteado o en disco), se restauró el entorno y se retomó; (b) un `pkill -f` coincidió con mi propia línea de comandos y tumbó el servidor de desarrollo unos segundos; (c) una revisión ejecutó pytest sin `pytest.ini` y recreó la BD **desechable** de pruebas; se restauró (la base de desarrollo no se tocó).
- No se tocó `master`, no se abrió PR, no se cambió el esquema de la base ni se tocó el backend Spring. Las bases usadas (`psychosim` y `psychosim_test`) son locales y desechables de esta sesión.
- Las capturas de los playtests y de los e2e no se versionan (están en el scratchpad de la sesión); solo las 8 capturas del pase visual de B, en [`2026-10-03-pase-visual/`](2026-10-03-pase-visual).
