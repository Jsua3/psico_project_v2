# Bloque C — Diálogo «texto como síntoma», retratos dinámicos e interrupciones

- **Fecha:** 2026-10-03
- **Estado:** Propuesta para discusión — sin implementar
- **Rama:** `feat/cierre-plan-maestro`
- **Base de hechos:** propuestas-c-e-f-base-comun.md (se cita como «base común §x»)
- **Marco pedagógico:** el informe de Análisis y Diseño no se pudo abrir esta noche; se usa el resumen de la base común §2 y su plantilla de 5 pasos.
- **Convenciones:** sin marca = leído en código o documentos (lectura estática; no se ejecutó nada). «(propuesta)» = no existe. «(inferencia)» = deducción. «(supuesto)» = sin verificar.

## 1. Resumen en lenguaje llano

Hoy, cuando una persona del caso habla, todas las líneas aparecen igual —letra a letra, al mismo ritmo— y casi todas con la misma cara. El juego ya sabe cómo se siente cada línea (angustiada, triste, aliviada), pero lo aprovecha mal: la abuela angustiada de urgencias aparece con su cara neutra.

**Qué proponemos.** Que la forma de hablar y la cara de la persona cuenten algo de cómo está, como en una conversación real: la abuela, en urgencias, habla con frases cortas y apresuradas; la sobreviviente, en el consultorio, con pausas y silencios; al cierre del bloque hospitalario, la abuela agradece con un ritmo más sereno. El juego no pone etiquetas ni puntos: el estudiante observa y decide.

**Para qué sirve.** Entrena dos cosas: *observar* las señales de malestar en el habla (no solo leer el contenido) y *decidir cómo responder* (contener, escuchar, informar). Es la competencia de contención emocional de la rúbrica del caso.

**Qué no haremos**, aunque el plan original lo contemplaba: texto que tiembla, letras que se rompen, enojo o disociación (el caso no los tiene y son fáciles de caricaturizar), colores que «avisan» la emoción y cuenta atrás. Las razones están en la sección 3.

**Interrupciones.** El plan proponía una cuenta atrás: si el estudiante no reaccionaba a tiempo, la persona «se cerraba emocionalmente». No lo recomendamos: castiga la lentitud ante el dolor, excluye a quien necesita más tiempo y no es defendible en un caso de violencia basada en género. Proponemos, como piloto y en un solo momento (la abuela angustiada en urgencias), una **ventana de intervención sin reloj**: mientras ella habla, el estudiante puede intervenir con contención o seguir escuchando. Las dos respuestas son válidas y se conversan después; el momento exacto no se mide. Ese piloto solo se construye si el bloque F (entrevista por turnos sobre la tensión de la conversación) no se aprueba: en ese mismo momento del caso la interacción por turnos es de F, y entonces C aporta únicamente la presentación (ritmo del texto y retrato).

**Qué recomendamos.** Tres pasos pequeños: (1) unificar emociones y retratos con el arte que ya existe (sin encargar dibujos); (2) ritmo y pausas para tres estados defendibles (agitada, afligida, aliviada); (3) el piloto de la ventana, solo si el bloque F no se aprueba. Los pasos 1 y 2 no cambian el puntaje ni el estrés.

**Qué necesitamos que el equipo decida** (sección 9): si esos tres estados son defendibles y se deja fuera enojo, disociación y esperanza; si la emoción se muestra con una etiqueta o la interpreta el estudiante; si el estilo se aplica al testimonio de la sobreviviente; si una sonrisa suave en el retrato de la abuela es aceptable en una escena de duelo; y si hacemos el piloto de la ventana.

## 2. Qué competencia clínica entrena y cómo se evidencia

Cadena de la base común §2: competencia → evidencia observable → tarea. Nada de este bloque puntúa automáticamente; el docente puntúa a mano (base común §5.4).

| # | El estudiante puede… | Evidencia observable (quién la deja) | Tarea y mecánica | Criterio de rúbrica |
|---|---|---|---|---|
| C1 | reconocer señales de malestar en el habla y contener antes de informar o preguntar | Aplica PAP a `familia-crisis` y después decide H1: secuencia `TOOL_USED` → `DECISION_SELECTED`; opción `h1-pap-contencion` (banderas `pap_aplicado`, `familia_contenida`). La deja el motor actual | M1 y M3: habla agitada (ritmo ágil, retrato «preocupada») | Existente: `CONTENCION` (rúbrica del caso) y `PAP` (rúbrica básica) |
| C2 | escuchar un testimonio sin presionarlo ni interrumpirlo | Decisión posterior a M9: `c1-riesgo-proteccion-derechos` frente a `c1-mediacion-perdon` o `c1-patrones-infancia`. La deja el motor; el diálogo no mide la escucha | M9: dos climas en una escena, deliberadamente sin botón de intervención | Existente: `COMUNICACION_EMPATIA` («escucha activa, evita juicios») |
| C3 | decidir cuándo intervenir y cuándo seguir escuchando (juicio clínico) | Solo en el piloto: intervino en la línea N / escuchó y contuvo después / no contuvo; más su justificación en la bitácora | M1: ventana sin reloj (solo si el bloque F no se aprueba) | **Nueva**: no existe. Propuesta: describirla dentro de `CONTENCION` en vez de crear un criterio (P8) |

**Plantilla de 5 pasos aplicada a C1:**

| Paso | Contenido |
|---|---|
| 1. Competencia | C1, ligada a `CONTENCION` («identifica necesidades inmediatas y estabiliza a la víctima y su red de apoyo»). |
| 2. Evidencia | Cuenta: contención (PAP) antes de la decisión H1; elegir la opción de contención. Regla: formativa, no puntúa. Eventos: `TOOL_USED` y `DECISION_SELECTED`, ya existentes. El docente la ve en la traza (lista de eventos); no ve `caseMetrics` en pantalla hoy (base común §5.4). |
| 3. Tarea y mecánica | LM-GM: *observación* + *simulación* → texto con ritmo y pausas, retrato por línea y, en el piloto, ventana de intervención. |
| 4. Seguridad y acceso | Sin reloj, sin depender del color ni del movimiento, pausa segura visible dentro de la ventana (sección 7). |
| 5. Devolución | Después de decidir: la supervisión de siempre más dos preguntas de bitácora (propuesta): «¿Qué notaste en cómo hablaba la abuela?» y «¿Qué te llevó a intervenir (o a esperar)?». Para el docente, la secuencia de eventos; sin indicador numérico. |

**Qué NO cuenta como evidencia:** la velocidad de lectura o de pulsación; usar «Saltar» (se usa por muchas razones, entre ellas accesibilidad); usar o no la ventana *por sí solo*; activar el movimiento reducido; el tiempo entre mostrar una línea y hacer clic; haber visto todas las líneas. El estilo del texto es estímulo, no evidencia.

## 3. Alternativas de diseño

### 3.1 Qué significa «texto como síntoma», con rigor clínico

Proponemos entenderlo como **observación del habla**, en el sentido del examen del estado mental: ritmo, pausas, fragmentación de la frase, volumen aparente. Es una *señal que el estudiante observa*, no un diagnóstico que el juego anuncia ni un efecto especial. Tres principios:

1. **El texto dice lo mismo sin efectos.** Los efectos refuerzan; no cargan el significado. Por eso la señal sigue escrita en las palabras («…», «¡…!», frases cortadas), que es lo único que sobrevive con movimiento reducido o lector de pantalla.
2. **Reacción esperable no es trastorno.** La abuela agitada ante una noticia extrema es una reacción normal; llamarla «síntoma» patologiza. En pantalla y en documentos al estudiante sugerimos «señal» (P11).
3. **Solo las personas del caso hablan con estilo.** El mismo panel muestra la supervisión clínica, los avisos de riesgo, las herramientas y la narración entre paréntesis (hoy usan `danger`/`concerned`/`positive` como *tono del mensaje*, no como emoción de una persona). Esas voces no reciben estilo.

**Recursos expresivos del plan, evaluados:**

| Recurso | Qué sugiere | Riesgo (estereotipo, caricatura, patologizar) | Veredicto beta |
|---|---|---|---|
| Velocidad de la máquina de escribir | habla presionada o lenta | Cliché «ansioso = rápido, triste = lento»; el plan usa 8-55 ms/carácter: a 8-15 ms (67-125 car/s) el efecto no se percibe como habla sino como aparición instantánea | **Sí**, en rango estrecho (±30 % de los 22 car/s actuales) |
| Pausas en la puntuación (`…`, `,`, `.`) | latencia, titubeo | Bajo: es lo más parecido al habla real | **Sí** (núcleo) |
| Puntuación y fragmentación escritas por el autor | pensamiento entrecortado | Bajo; evitar el tartamudeo simulado («n-n-no»), que caricaturiza | **Sí**, vive en el texto |
| Tamaño de letra (13-15 px) | gritar / encogerse | Alto: caricatura; 13 px daña la legibilidad | No |
| Color del cuerpo del texto | la emoción | Alto: «rojo = enojo/peligro»; contraste; y el rojo ya significa estrés *del estudiante* en la viñeta de B | No (cuerpo del texto sin cambio de color) |
| Opacidad (0,7-0,9) | apagamiento, disociación | Texto atenuado sobre fondo oscuro puede bajar de 4,5:1 (1.4.3; estimación, no medida) | No |
| Temblor (`wobble`, animación infinita) | nerviosismo | Alto: caricatura y trope de la «mujer histérica»; movimiento continuo > 5 s (2.2.2); malestar vestibular | No |
| `glitch` con `▓░▒` al azar | disociación | Muy alto: trivializa una respuesta al trauma como «falla de computador»; ilegible; `Math.random` no es reproducible ni auditable; riesgo perceptual (2.3.1 por evaluar); el caso no tiene disociación | No |
| Silencio / narración entre paréntesis | cierre, mutismo | Bajo | **Sí**, como texto |

**Estados:**

| Estado | ¿En SIM-VBG-001? | Dónde | Recurso defendible | Riesgo principal | Beta |
|---|---|---|---|---|---|
| Ansiedad / agitación | Sí | M1; madre en M8; 2.ª línea de M9 | ritmo algo más rápido y pausas cortas | leerla como «descontrol» | **Sí** |
| Aflicción (tristeza) | Sí | 1.ª línea de M9; 2.ª línea de H1 (hoy `negative`) | ritmo más lento y pausas largas | confundir duelo o trauma con depresión | **Sí** |
| Alivio | Sí | M6; desbloqueo de M2 | ritmo base, pausa final; sin celebración | premiar la decisión; sonrisa en el duelo (P4) | **Sí**, muy contenido |
| Preocupación (cuidadora) | Sí | madre en M8; psicóloga | sin efecto textual | — | Solo retrato |
| Cierre / silencio | Sí | `sobreviviente-espera` (M8) | ninguno en texto: el silencio no se decora | patologizar el silencio | Solo retrato |
| Crisis aguda | Parcial (la narración de M1 dice «familia en crisis») | — | no es una emoción: es *intensidad* alta de ansiedad (fase 5, opcional) | caricatura; duplicar la viñeta de B | No como estilo propio |
| Enojo | No (los reclamos de M1 están etiquetados como ansiedad) | — | — | tropo de la mujer enojada o la familia hostil | No (reservado, P1) |
| Disociación | No | — | si algún día: omisión o narración, nunca `glitch` | trivializar el trauma | No (reservado) |
| Esperanza | No | pregunta abierta de M6 | — | — | No |

**Subconjunto defendible para la beta:** tres estilos activos (agitada, afligida, aliviada), dos estados solo de retrato (preocupada, cerrada) y neutral. Nada más.

### 3.2 Tres alternativas

**Alternativa 1 — «Plan literal».** 8 emociones en español con color, `wobble` y `glitch`; hoja de retratos 5×64×80 para 6 personajes genéricos; QTE con cuenta atrás cuyo `onTimeout` «cierra» a la persona.
- *Pros:* cumple al pie de la letra el «Criterio de Done» del plan; el plan trae casi todo el código; máxima visibilidad.
- *Contras:* 3 de las 8 emociones (`enojo`, `disociacion`, `esperanza`) no aparecen en el caso y `crisis` solo como intensidad; los 6 retratos no son los del caso; añade un tercer contrato de retrato (64×80); `onTimeout` haría que el cliente decida una consecuencia (viola R2) sin que exista estado de NPC.
- *Riesgos:* **éticos** — caricatura, testimonio cronometrado, castigo por lentitud; **pedagógicos** — el color y el `glitch` «avisan» la emoción y el estudiante no necesita observar; **accesibilidad** — incumple 2.2.1 y 2.2.2, probablemente 1.4.3, 2.3.1 por evaluar, y no define equivalente con movimiento reducido.

**Alternativa 2 — «Señal sobria» (recomendada).** 7 emociones canónicas; tres perfiles de ritmo y pausas; retrato por línea con 5 estados (4 con el arte existente); sin color, temblor ni `glitch`; ventana de intervención sin reloj como piloto (condicionado a que el bloque F no se apruebe); accesibilidad como prerrequisito.
- *Pros:* encaja con el caso; sin arte nuevo en las fases 1-2; sin cambio de esquema; reversible por fase; deja evidencia útil; no choca con el bloque B.
- *Contras:* menos espectacular y el matiz puede pasar inadvertido (hay que probarlo con estudiantes); en M1 la ventana solo cambia *cuándo* se contiene, no *qué* (3.3); los valores de ritmo requieren calibración.
- *Riesgos:* **éticos** — incluso el ritmo puede leerse como cliché; **pedagógicos** — si el estudiante no nota la señal, el bloque no entrena nada; **accesibilidad** — el matiz se pierde con movimiento reducido, por eso la señal va escrita en el texto.

**Alternativa 3 — «Solo orden».** Solo la fase 1: una emoción, un mapa de retratos, nombres de hablante y movimiento reducido en el panel. Sin estilo de texto ni interrupción.
- *Pros:* 2,5-5 días (sin la Fase 0 compartida); riesgo mínimo; arregla un defecto visible (los retratos casi nunca cambian).
- *Contras:* no entrega «texto como síntoma» ni evidencia nueva.
- *Riesgos:* bajos; pedagógico — se pierde la oportunidad de entrenar la observación del habla.

### 3.3 Interrupciones: tres formas

| | I-a Cuenta atrás (plan) | I-b Ventana sin reloj (recomendada, piloto) | I-c Sin interrupción |
|---|---|---|---|
| Cómo funciona | Aviso con barra que se vacía en `timeoutMs`; al vencer, la persona «se cierra» | Mientras habla una persona en angustia aguda hay dos botones del mismo peso, «Seguir escuchando» e «Intervenir: contención (PAP)». Dura hasta la última línea; nada vence | La contención sigue siendo una opción al final del diálogo, como hoy |
| Qué se gana | Urgencia sentida; señal simple de éxito o fracaso | La contención se vuelve una decisión de *cuándo*; ambas respuestas son legítimas y conversables; no premia la rapidez | Cero código y cero riesgo |
| Qué se pierde | — | La presión de tiempo (y con ella el entrenamiento de respuesta rápida, que no es objetivo de la beta); el indicador automático «a tiempo / tarde» | La sensación de agencia en tiempo real |
| Choques | 2.2.1; base común §6.6 (testimonio cronometrado) y R8; decisión del coordinador «sin tiempo»; «se cierra» sería consecuencia decidida por el cliente (R2); un tiempo de reacción puede inferir salud o discapacidad (base común §6.8) | Aporte pedagógico modesto en M1 (el motor ya ofrece PAP al final); exige pausa segura visible dentro (REGLA-004) | Ninguno |
| Evidencia | éxito / tiempo agotado (no defendible como competencia) | intervino en la línea N / escuchó hasta el final; justificación escrita | ninguna nueva |
| Veredicto | No | Piloto en M1 tras las fases 1-2, solo si el bloque F no se aprueba | Valor por defecto si nadie decide |

Notas. (1) El concepto original del roadmap es *interrumpir texto hostil de forma asertiva*; en SIM-VBG-001 no hay emisor hostil en escena (el agresor está ausente, base común §7), por eso la ventana reinterpreta la idea como contención de angustia. (2) La tensión se conserva sin reloj: por contenido (las líneas escalan), por el retrato y, si el bloque F existe, por su medidor. (3) Si en el futuro existe estado relacional por NPC (spec de julio), la ventana podría alimentarlo; no antes.

### 3.4 Alternativa recomendada y lectura LM-GM / MDA

Se recomienda la **Alternativa 2** en fases (sección 8): las fases 0-1 son comunes con la Alternativa 3 (el piso), así que se puede parar en cualquiera sin deshacer nada. Se elige porque es la única que entrega la idea de «texto como señal» sin contradecir los límites éticos y de accesibilidad de la base común §6.

- **LM-GM.** Mecánica de aprendizaje: *observación* (atender a cómo se dice) + *simulación* (decidir cuándo contener) + *reflexión* (bitácora). Mecánica de juego: ritmo y pausas por emoción, retrato por línea, ventana opcional. Pregunta de control: ¿qué aprende haciendo esto que no aprendería leyendo el guion? Aprende a notar la forma del habla y a vivir la decisión del momento de intervenir, que un guion impreso no ofrece.
- **MDA.** *Mecánicas:* perfiles de ritmo y pausas; estado de retrato por línea; ventana sin reloj. *Dinámicas:* el estudiante nota que la forma de hablar cambia entre personas y entre líneas; duda entre intervenir y esperar. *Estéticas (clínicas):* atención, cuidado, respeto, paciencia; nunca urgencia de combate ni premio.

### 3.5 Emoción canónica y mapa de retratos (regla R5: lo decide C)

**Una sola emoción canónica.** Se conservan los identificadores en inglés que ya están guardados en las líneas y en los NPC (así no hay migración de datos); el nombre en español es solo para mostrar. Se conserva el nombre de tipo `DialogueEmotion` del plan, con estos valores:

| Clave | Español | Significado | Estilo de texto | Estado de retrato |
|---|---|---|---|---|
| `neutral` | neutral | habla habitual | base | `neutral` |
| `worried` | preocupada | preocupación de cuidado | base | `worried` |
| `anxious` | ansiosa / agitada | activación, habla apresurada | perfil ágil | `worried` |
| `sad` | afligida | aflicción, abatimiento | perfil pausado | `sad` (si el personaje no lo tiene: `worried`) |
| `relieved` | aliviada | descenso de tensión | perfil sereno | `relieved` (archivo `happy`; ver P4) |
| `calm` | serena | calma, receptividad (profesionales) | base | `neutral` (la psicóloga usa su archivo cálido; ver mapa de arte) |
| `closed` | retraída / en silencio | repliegue | ninguno | `closed` (sin arte hoy: cae a `neutral`) |

Reservadas, fuera del tipo hasta que Psicología las pida: `angry`, `dissociated`, `hopeful`. Si el valor llega con otro nombre, la regla es `neutral`.

**Correspondencia desde los vocabularios existentes** (una tabla de alias en el frontend; el editor de mundos escribe texto libre, por eso no se propone un CHECK):

| Vocabulario | Valores | → Canónico |
|---|---|---|
| Líneas del seed | `neutral`, `anxious`, `sad`, `relieved` | igual |
| Líneas del seed | `negative` (H1, 2.ª línea de la abuela) | `sad` (a validar, P9) |
| Líneas del seed | `positive` (psicóloga) / desbloqueo de M2 (literal en `decorateDialogue`) | `calm` / `relieved` (el literal pasa a `relieved`) |
| Árbol y mensajes del panel | `concerned`, `danger`, `positive` | persona: `worried`, `sad`, `calm`. Voz de sistema: siguen como tono (alerta, aviso, logro) |
| NPC ambiental | `calm`, `worried`, `anxious`, `receptive`, `closed` | igual; `receptive` → `calm` |
| Resolver de retratos (legado) | `vulnerable`, `alerta` | `worried`; `alerta` es voz de sistema |
| Manifiesto v1, mapa de 12 claves | `positive`, `negative`, `danger`, `closed`… → `PortraitState` | se deja intacto (mapa congelado por hash); es tabla puente, no fuente |
| Plan C, 8 en español | `ansiedad`, `tristeza`, `alivio`, `crisis`, `enojo`, `disociacion`, `esperanza` | `anxious`, `sad`, `relieved`; `crisis` = `anxious` con intensidad alta; las otras tres, reservadas |

**Un solo contrato de retrato.** Imagen individual de 96×96 por (personaje, estado), `/assets/characters/portraits/<personaje>_<estado>.png`, que es lo que corre hoy. Cinco estados: `neutral`, `worried`, `sad`, `relieved` y `closed` (este último sin arte todavía). Cadena de caída: estado exacto → `worried` (para `sad`) o `neutral` (el resto) → silueta. Se descartan dos contratos: la hoja 5×64×80 del plan (otro tamaño, personajes ajenos al caso, con estados de «colapso») y, por ahora, la hoja 4×8 del manifiesto v1, cuyo `PortraitState` no distingue `sad` de `worried` y manda `closed` a `rupture` (el silencio no es una ruptura). El manifiesto sigue siendo el destino a largo plazo; migrar exige ampliar `PortraitState` y regenerar sus hashes (I7). Además: en el repo no hay arte de NPC en la hoja del manifiesto (el roster declara 11 visuales de actor pero no existe `actors/*/portrait.png`).

**Defectos de hoy que la fase 1 corrige (lectura estática, no ejecutado):** el panel usa la emoción *cruda* de cada línea y el mapa de retratos no conoce `anxious`, `sad`, `negative` ni `relieved`; todas caen a `neutral`. Por eso las variantes `worried` y `sad` casi nunca se ven: la Abuela angustiada de M1 y la sobreviviente afligida de M9 aparecen con cara neutra. La traducción que el seed hace en el árbol (`_TREE_EMOTION`) no se aplica porque la línea manda. Además `portrait_key` es nulo en todo el caso y el chip de emoción (punto violeta) aparece en cualquier emoción distinta de `neutral` sin significar nada.

**Mapa de arte (qué hay y qué huecos quedan):**

| Personaje (archivo) | neutral | worried | sad | relieved | closed |
|---|---|---|---|---|---|
| Sobreviviente / Consultante (`paciente-vbg`) | sí | sí | sí | no se usa en el caso | **hueco** (M8, M10) |
| Abuela / Madre (`madre-vbg`) | sí | sí | **hueco** (usa `worried`) | sí (`happy`, sonrisa suave; desactivado por defecto, P4) | **hueco** (el «cierre» de M1 si F se construye) |
| Psicóloga hospitalaria | sí | no se usa | no se usa | sí (`happy`, cálida; la usan `calm` y `relieved`) | no se usa |
| Funcionaria de recepción; Profesional psicosocial | sí | — | — | — | — |

Huecos de arte: ninguno bloquea la fase 1 (10 PNG existentes, todos de 96×96). Opcionales, por prioridad: (1) `madre-vbg_closed` y `paciente-vbg_closed` (cabeza baja), que hacen visible el repliegue de M8 y el «cierre» que propone el bloque F (F lo necesita: es dependencia suya, acuerdo 3 de la sección 8); (2) `madre-vbg_sad`; (3) neutral de enfermera y médico de guardia (hoy silueta). Huecos de *mapeo* (sin arte): «Sobreviviente», «Madre de la sobreviviente» (se supone que es la misma persona que «Abuela de la niña»; pregunta E-P12) y los NPC ambientales parecidos a los existentes (el roster los reutiliza como sprites) no resuelven retrato por nombre de hablante. Si se encarga arte nuevo, debe seguir la biblia visual del spec premium §4.1 (pixel art como identidad).

### 3.6 Qué mueve el estilo del texto

C **no persiste estado propio** (R1): calcula el estilo de cada línea al mostrarla, con una función pura (misma entrada, misma salida; sin azar).

| Entrada | De dónde viene | Qué cambia | Estado |
|---|---|---|---|
| Emoción canónica de la línea | `dialogue_lines.emotion` + alias | perfil de ritmo y retrato | Recomendado (obligatorio) |
| Voz (persona / narración / sistema) | clave del diálogo, hablante y paréntesis | si la línea recibe perfil | Recomendado (I3) |
| Preferencia de movimiento reducido | señal del juego (`reduceMotion`) | apaga máquina de escribir y pausas | Obligatorio |
| Confianza (`patientState.trustLevel` = `caseMetrics.confianza`) | estado del paciente | *guarda de coherencia*: con Confianza baja (< 40, supuesto) una línea `relieved` se presenta como `calm`; nunca intensifica | Opcional, requiere decisión (fase 5) |
| Crisis emocional (Reactividad) (`crisisLevel`) | estado del paciente | solo si ≥ 70 (umbral que ya usa el sprite de la paciente) y la línea es `anxious`: perfil ágil → intensidad alta; sin color ni movimiento | Opcional, requiere decisión (fase 5) |
| Banda de tensión verbal (1-4) por persona | bloque F, si existe | bandas 3-4 → intensidad alta en líneas `anxious`; banda 4 → retrato `closed`. F pide, C solo presenta | Opcional; sin F no hay entrada |
| Estrés del caso (`stressIndex`) | intento | **no se usa**: es la viñeta de B y refleja al estudiante, no a la persona | Excluido |

Salvedad de las dos métricas: son globales del caso, no por persona (base común §9.7); modular a la sobreviviente por la crisis medida en el hospital mezclaría personas. Por eso son opcionales. Regla general: **el estado puede apagar, no encender** (evita dramatizar y evita revelar el resultado de una decisión); F puede pedir intensidad, pero el tope sigue siendo el ritmo.

**Perfiles propuestos (a calibrar con 3-5 estudiantes antes de fijar):**

```
base      45 ms/car (22 car/s, como hoy)   sin pausas extra
ágil      34 ms/car (~29 car/s)            , 60 ms   . ? ! 120 ms   … 200 ms
pausado   62 ms/car (~16 car/s)            , 180 ms  . 350 ms       … 700 ms
sereno    45 ms/car                        , 140 ms  . 260 ms       … 500 ms   pausa final 400 ms
tope: ninguna línea tarda más de 6 s; «Saltar» y Enter siempre disponibles
```

### 3.7 Relación con el bloque B y los bloques visuales del plan

| Elemento | Qué comunica | Regla para C |
|---|---|---|
| Viñeta de crisis (B; estrés > 50, pulsa > 85) | tensión del *estudiante* / la escena | C no usa rojo en el texto; si la viñeta pulsa, el texto queda en perfil base |
| Destello de sala (B, 120 ms) y sacudida (B, 200-260 ms) | cambio de sala; decisión riesgosa o prohibida | C no añade destellos ni sacudidas a ninguna línea |
| Tinte y vibración del sprite de la paciente (≥ 70) | crisis de la *persona* | única señal de movimiento ligada a la crisis; C solo lee el mismo umbral |
| Visual C (6 retratos 5×64×80) | — | No encargar como está: personajes ajenos al caso, otro contrato, estados de «colapso» y «mandíbula caída» (caricatura). Usar los 5 estados y los huecos de 3.5 |
| Visual H: `good`/`bad_decision` | premio / castigo con partículas | No hacer: es lenguaje de victoria y derrota (base común §6.7); el bloque B ya cubre la devolución con la sacudida |
| Visual H: `crisis_pulse`, `door_transition` | pulso rojo; destello casi blanco | No hacer: duplican la viñeta y el destello de B; el segundo termina en «pantalla casi blanca» (2.3.1) |

**Presupuesto de efectos:** a la vez, como máximo un canal de movimiento (la escena de B *o* el panel). C solo añade ritmo (que no es movimiento) y un cambio de imagen en el retrato, así que el presupuesto se cumple por construcción. Lo que sí hay que vigilar es la lectura simultánea: viñeta violeta-roja + texto + sacudida en una escena de violencia de género; por eso el cuerpo del texto no cambia de color.

## 4. Cómo se vería y se jugaría

### 4.1 Boceto (panel en modo cinematográfico, ventana de M1 activa)

```
+------------------------------------------------------------------+
| [retrato: preocupada]  ABUELA DE LA NIÑA                         |
|                        ¡Déjenme pasar! […]                       |
|                        ¿Por qué nadie nos dice nada?             |
|                                                                  |
| [Saltar >]  [Seguir escuchando]  [Intervenir: contención (PAP)]  |
| [Pausa segura]                                                   |
+------------------------------------------------------------------+
```

### 4.2 Recorrido por momentos de SIM-VBG-001

| Momento | Qué lee el estudiante | Retrato | Ritmo |
|---|---|---|---|
| M1 `familia-crisis` (urgencias) | Líneas 1-2 de la Abuela (angustia); la 3.ª es narración entre paréntesis | `worried` (hoy: neutral) | ágil en 1-2; base en la narración |
| M2 desbloqueo (`familia-duelo`) | «(La abuela respira un poco más despacio…) Gracias por quedarse…» | neutral por defecto (P4) | sereno; pausa larga en «…» |
| M6 `familia-duelo` (cierre) | «Gracias por no dejarnos solas…» y la pregunta abierta «¿Qué sigue ahora para mi hija?» | neutral (P4) | sereno; la pregunta, base. Sin verde ni celebración |
| M8 `madre-acompanante` | «Desde el hospital no la dejo sola… ¿verdad que sí?» | `worried` (requiere mapear el nombre) | ágil, suave |
| M8 `sobreviviente-espera` | solo narración entre paréntesis | neutral | sin estilo: el silencio no se decora |
| M9 `sobreviviente-consulta` | 1.ª línea (afligida); 2.ª línea (ansiosa, presión familiar para perdonar) | `sad` → `worried` | pausado → ágil suave (tope ×1,15). Sin ventana de intervención (sección 7; el estilo, P3) |

### 4.3 La ventana de intervención en M1 (piloto; solo si el bloque F no se aprueba)

1. Aparece solo si el kit PAP está en el inventario del estudiante; si no, no se ofrece (hoy usar una herramienta ausente devuelve un error genérico).
2. Desde la línea 1 se ven los dos botones, del mismo peso y sin icono ni resalte de «recomendada» (R3). Nada se vacía ni vence.
3. **Interviene:** la línea en curso se muestra completa, se ejecuta la acción que ya existe (usar PAP sobre `familia-crisis`) y se muestra el mensaje de herramienta de siempre; el resultado se anuncia por la región de estado existente.
4. **Sigue escuchando:** el diálogo avanza como hoy y al final queda «Aplicar PAP a la familia en crisis».
5. **Cierra sin contener:** no se castiga; la compuerta de evidencia de H1 ya advierte «Información incompleta» (base común §5.5). La consecuencia narrativa de haber contenido ya existe (la línea desbloqueada de M2); la ventana no inventa ninguna.

### 4.4 Modos de acceso

| Modo | Qué cambia |
|---|---|
| Movimiento reducido | La línea aparece completa (sin máquina de escribir ni pausas temporizadas); el retrato cambia sin fundido; sin animación de entrada del panel. Temblor y `glitch` no existen en ninguna fase. La señal sigue en la puntuación del texto. La ventana es igual: no tiene reloj |
| Solo teclado | `Tab`/`Mayús+Tab` recorren «Saltar», los dos botones y «Pausa segura»; Enter/Espacio completan o avanzan; 1-9 eligen opciones; Esc cierra (todo existente). La ventana no añade atajos de una tecla |
| Lector de pantalla | Recibe una sola vez la línea completa y limpia, sin símbolos, con el nombre del hablante. Botones con nombre completo («Intervenir con contención: aplicar Primeros Auxilios Psicológicos», «Seguir escuchando»). Descripción breve de la voz solo si el estilo añade algo que el texto no dice (P2) |
| Sin color / alto contraste | Nada depende del color: la emoción se lee en ritmo, texto y retrato; el cuerpo del texto conserva su contraste actual |

## 5. Cómo se evalúa

**Fases 1-2: C no registra eventos.** La evidencia de C1 y C2 ya la dejan `TOOL_USED`, `DECISION_SELECTED` y las banderas del caso. Solo el piloto añade algo.

| Evento | Cuándo | ¿Nuevo? | Línea de tiempo del docente | Fase |
|---|---|---|---|---|
| `TOOL_USED` (PAP sobre `familia-crisis`) | al aplicar PAP | existente | sí (ya en la lista blanca) | — |
| `DECISION_SELECTED` / `PROHIBITED_DECISION_SELECTED` (H1) | al decidir | existente | sí | — |
| `DIALOGUE_INTERRUPTION_USED` | primer uso de la ventana en un diálogo | **nuevo, condicional** (solo si se construye la ventana, es decir, si F no se aprueba) | **No**: solo en `events` de la traza | 3b |
| `DIALOGUE_LISTENED_THROUGH` | se ofreció la ventana y el diálogo se cerró sin usarla | **nuevo, condicional** (ídem) | **No**: solo en `events` | 3b |

Ejemplo de dato (el campo `detail` es texto): `familia-crisis | línea 2 de 3 | contención (PAP)`. Sin nombre del estudiante, sin tiempos.

- **Qué ve el docente.** En la traza, los eventos con rótulo genérico «Evento» y el `detail`; opcionalmente un rótulo legible («Intervino en la línea 2» / «Escuchó hasta el final») con **igual redacción y sin color**. Un tipo nuevo no entra en la línea de tiempo salvo que se añada a ambas listas (base común §5.1); recomendamos no añadirlo (P7).
- **Puntaje y estrés.** C no cambia ninguno. Intervenir ejecuta la herramienta que ya existe, con su regla actual (−5 de estrés si es pertinente, +3 si no, una vez por herramienta y objetivo), idéntica con o sin ventana. Las variables `stressIndex`, `accumulatedScore`, `userTrust`, `victimRisk` y `caseMetrics` no reciben escrituras nuevas.
- **Rúbrica.** El docente puntúa `CONTENCION`, `PAP` y `COMUNICACION_EMPATIA` a mano y puede citar los eventos como evidencia (hoy no se vuelcan solos en `evidence_json`).
- **Que «llegar a tiempo» no sea competencia.** (i) No hay reloj ni dato de tiempo de reacción, y no se calcula en la interfaz docente; el evento lleva solo la hora estándar de todos los eventos. (ii) El «cuándo» es la *línea* en que se intervino, no los segundos. (iii) El reporte de grupo, si lo muestra, da conteos sin orden ni ranking. (iv) Se explica al docente que ninguna de las dos respuestas es mejor por sí sola: el criterio es la justificación escrita. (v) No se registra «Saltar» ni el movimiento reducido.

## 6. Datos

| Dato | Dónde vive hoy | Con lo que ya existe | Alternativa con esquema (solo propuesta) |
|---|---|---|---|
| Emoción de cada línea | `dialogue_lines.emotion` (texto libre, 60) | tabla de alias en el frontend; re-etiquetar a lo sumo 1-3 líneas del seed si Psicología lo pide | CHECK con la lista canónica en `deploy/db_seed.sql` + script en `deploy/upgrades/` + contrato; rompería el editor de mundos (texto libre) |
| Perfil de ritmo y pausas | no existe | registro en el frontend con 3 perfiles (como `NODE_EVIDENCE`; D3 del roadmap) | columna `presentation_json` en `dialogue_lines` para que el editor lo autore |
| Voz (persona / narración / sistema) | implícita: clave del diálogo, hablante, paréntesis | función que la deduce (I3) | columna `voice` |
| Personaje del retrato | `dialogue_trees.portrait_key` (nulo en todo el caso) + 2 mapas en código | poblar `portrait_key` con el personaje en el seed (solo datos) y dejar el mapa por hablante como respaldo | tabla de personajes |
| Ventanas de intervención | no existe | registro en el frontend por clave de diálogo (`familia-crisis`) | marca en `dialogue_choices.effect_json` (viaja al cliente antes de elegir: solo metadatos neutros, R3) |
| Acción del estudiante ante la ventana | no existe | texto en el `detail` de `TOOL_USED` (marca «ventana, línea 2») como en el precedente `evidenceOverride`; o los 2 eventos de arriba con **endpoint nuevo** (código, no esquema) | columna JSON en `attempt_events`, compartida con E y F |
| Estado del paciente y métricas | derivado de `caseMetrics` | solo lectura | — |
| Movimiento reducido | cliente (señal + preferencia del sistema) | **no se guarda** (privacidad, base común §6.8) | — |
| Tensión verbal | no existe (bloque F) | entrada opcional | — |

Cualquier cambio de esquema seguiría el procedimiento vigente (script idempotente en `deploy/upgrades/`, CHECK en `deploy/db_seed.sql`, `test_deploy_schema_contract.py` en verde; base común §5.2). **La alternativa recomendada no necesita ninguno.**

## 7. Accesibilidad y ética

**Prerrequisito (verificado):** el panel de diálogo no recibe el interruptor de movimiento reducido del juego (`simulation-play.component.ts` lo pasa a la intro, al HUD y a Phaser, pero no a las dos instancias de `app-dialogue-panel`); la máquina de escribir (JavaScript) tampoco lo mira. Sin esto, nada de lo siguiente es verdad. Es la pieza 0a de la Fase 0 compartida (sección 8).

| WCAG 2.2 | Aplicación | Cómo se cumple |
|---|---|---|
| 1.1.1 / 1.3.1 | retratos | siguen decorativos (`aria-hidden`); lo relevante va en el texto o en la descripción de voz |
| 1.3.3 | características sensoriales | la señal no depende de forma, color ni sonido: está también en el texto |
| 1.4.1 / 1.4.3 | color y contraste | cuerpo del texto sin cambio de color ni opacidad; nada se distingue solo por color |
| 1.4.4 / 1.4.12 | tamaño y espaciado | sin tamaño ni espaciado fijo por emoción |
| 2.1.1 / 2.1.4 | teclado y atajos | todo por `Tab`; sin atajos de una tecla nuevos |
| 2.2.1 | tiempo ajustable | sin límites de tiempo; la cuenta atrás se descarta |
| 2.2.2 | pausar, detener | la máquina de escribir se salta (Saltar/Enter) y se apaga con movimiento reducido; sin movimiento continuo |
| 2.3.1 | destellos | sin `glitch`, sin parpadeo; el pulso de la viñeta de B (800 ms por tramo) no cambia |
| 2.4.3 / 2.4.11 | foco | la ventana no mueve el foco durante la línea; el foco inicial sigue en «Saltar» |
| 2.5.8 | tamaño de objetivo | botones de 42 px mínimo (ya existen) |
| 3.2.1 | sin cambio de contexto | la ventana aparece sin tomar el foco |
| 4.1.3 | mensajes de estado | el resultado de intervenir se anuncia por la región existente; la línea completa se anuncia una sola vez (verificar con NVDA, I6) |

**Ética (ETH-01, ETH-02, REGLA-004, base común §6):**
- **Consentimiento (ETH-01).** C no añade contenido sensible ni lo adelanta: el estilo opera sobre líneas que ya están detrás de la advertencia. La ventana no se ofrece en el testimonio de la sobreviviente.
- **Pausa segura.** Hoy, con un diálogo abierto, salir exige dos Esc y la cabecera/pie van inertes (base común §5.5). La ventana es una superposición nueva: lleva un botón **«Pausa segura» visible dentro del panel**, no depende de ninguna acción cronometrada y no empeora el camino actual. Requiere que el padre permita pausar desde el diálogo (I4); proponemos mostrarlo en todos los diálogos de persona, no solo en la ventana. Es la pieza 0b de la Fase 0 compartida (sección 8).
- **No revictimizar.** Ningún testimonio como estímulo cronometrado; ni temblor ni color de alarma sobre la voz de una mujer sobreviviente; ni hechos violentos reconstruidos.
- **No convertir el sufrimiento en juego.** Sin barras de emoción, sin puntos, sin sonidos de «crisis», sin lenguaje de victoria o derrota.
- **Privacidad.** Ningún evento guarda tiempos de reacción ni preferencias de accesibilidad; no se envía nada de C al asistente de IA.
- **No revelar (R3).** Los dos botones de la ventana tienen el mismo peso visual; `isRecommended` e `isProhibited` no se usan.

## 8. Esfuerzo estimado por fases y dependencias

Días-persona orientativos, con rango; incluyen pruebas automáticas, no el arte. **Las cifras de esta tabla no incluyen la Fase 0 compartida** (acuerdos de coherencia, abajo), que se cuenta una sola vez para C, E y F.

| Fase | Entrega | Días | Depende de |
|---|---|---|---|
| Fase 0 compartida | piezas 0a-0e (tabla de acuerdos, abajo); no se suma a las rutas de este documento | 6-10 (una sola vez para los tres bloques) | — |
| F0 Decisiones y voz | decisiones P1, P2, P9; criterio de voz (I3) | 0,5-1 | — |
| F1 Una emoción y un mapa | función de emoción canónica + alias; resolver de retratos unificado; mapeo de nombres de hablante; literal de M2 a `relieved`; sin arte | 2-4 | F0, P9 |
| F2 Ritmo y pausas | plan de máquina de escribir como función pura con 3 perfiles; apagado con movimiento reducido; línea limpia al lector; calibración con 3-5 estudiantes | 4-7 | F1, P1, P2, Fase 0 compartida (0a) |
| F3a Ventana (piloto M1; solo si el bloque F no se aprueba) | botones, uso de la herramienta existente, marca en `detail` (el control de pausa segura es la pieza 0b) | 3-5 | F2, P5, Fase 0 compartida (0b) |
| F3b Eventos y rótulos (solo si se hace F3a) | endpoint, 2 tipos de evento, rótulos en la traza docente | 3-5 | F3a, P7, I5 |
| F4 Arte opcional | `madre-vbg_closed`, `paciente-vbg_closed`, `madre-vbg_sad`, 2 neutrales | 1-3 | P4 |
| F5 Modulación por estado | guarda de coherencia y umbral de crisis | 2-3 | F2, decisión de Psicología |

Rutas (sin la Fase 0 compartida): **mínima** (F0-F1) 2,5-5 días; **recomendada** (F0-F2) 6,5-12; con piloto (hasta F3a, solo si F no se aprueba) 9,5-17; todo 15,5-28. Si el bloque F se aprueba, F3a-F3b no se construyen y «todo» queda en 9,5-18 (F0-F2, F4 y F5). Se puede entregar primero F1: es visible (los retratos empiezan a cambiar) y no toca puntaje ni estrés.

**Dependencias.** D2 del roadmap (alternativa sin tiempo) queda resuelta aquí para C: no hay versión cronometrada. D1 (tono): se adopta el «reencuadre clínico sobrio». D3 (autoría): los primeros cortes llevan el contenido de presentación en configuración del frontend (el contenido que no puede viajar al cliente, como las lecturas de referencia de E y los deltas de F, va en el servidor: R3). Los planes de julio (spec premium §7.2: 35-45 car/s, sin chips) chocan con el panel actual (22 car/s, chip): hay que decidir cuál rige (I1).

**Interfaz con los otros bloques**

| Bloque | Qué lee C de él | Qué le ofrece C | Si el otro bloque no se construye |
|---|---|---|---|
| E — Social Mapping | El conjunto de vínculos conocidos que ofrece E, solo para condicionar líneas desbloqueadas (texto y emoción canónica). Hoy: `unlockLines` de `NODE_EVIDENCE` | La emoción canónica y los 5 estados de retrato; la correspondencia hablante → personaje, por si E quiere mostrar con cara a las personas presentes (los ausentes nunca) sin un cuarto contrato de retrato | C usa solo `NODE_EVIDENCE`; no cambia nada |
| F — Tensión verbal | Opcional: la banda de tensión verbal (1-4) por persona que ofrece F, como pista de intensidad (solo cambia el ritmo y el retrato; sin color ni movimiento) | La emoción canónica y los 5 estados de retrato (incluido `closed`, con su hueco de arte); `resolveLinePresentation` (perfil de ritmo y pausas) para las líneas de reacción de F. La ventana de contención solo existe si F no se aprueba (acuerdo 1) | C no lee nada; intensidad base |
| Estado del caso (existente) | `patientState` (Confianza, crisis emocional) solo en la fase 5 | — | — |
| B — Game feel (hecho) | umbrales de la viñeta, sin dependencia de código | Regla de presupuesto de efectos (3.7) | — |

**Acuerdos de coherencia entre C, E y F** (revisión del 2026-10-03; este bloque figura con el mismo texto en los tres documentos)

1. **Mismo momento del caso (M1, `familia-crisis`).** La interacción por turnos en M1 es del bloque F. La fase de «ventana de contención» de C queda condicionada a que F NO se apruebe; si F se aprueba, C aporta solo presentación: ritmo del texto y retrato.
2. **Cierre de la comunicación.** Solo ocurre por el contenido de las respuestas (bloque F), nunca por un reloj: ni C ni E pueden «cerrar» a una persona por tiempo.
3. **Retrato «cerrada» (`closed`).** F lo necesita y no existe arte: es un hueco de arte en C (sección 3.5) y una dependencia de F. Mientras no exista, el retrato cae a `neutral`.
4. **Fase 0 compartida.** Prerrequisitos que los tres bloques necesitan. Se construyen una sola vez y se cuentan una sola vez en el esfuerzo: las cifras por fases de cada documento no los incluyen. Días de Ingeniería, estimación de la revisión de coherencia, a confirmar por Ingeniería.

| Pieza | Qué es | Días |
|---|---|---|
| 0a | El panel de diálogo (sus dos instancias) recibe el interruptor de movimiento reducido del juego; hoy solo atiende la preferencia del sistema | 0,5-1 |
| 0b | Un único control visible de «Pausa segura», reutilizable dentro del panel de diálogo y de cualquier superposición nueva; hoy, con un diálogo abierto, `safeExit()` no actúa y salir exige dos pulsaciones de Esc | 2-3 |
| 0c | Un escritor único con bloqueo de fila para `flags_json` (hoy se lee, modifica y escribe sin bloqueo) | 2-3 |
| 0d | Un mecanismo común para añadir tipos de evento a la línea de tiempo del docente: lista blanca del backend y su espejo en el frontend, con una prueba que verifique que coinciden | 1-2 |
| 0e | Regla de revisión: ningún atajo de una sola tecla nuevo sin revisar WCAG 2.1.4 (incluye revisar los que ya existen, `J` y `E`) | 0,5-1 |
| **Total** | | **6-10** |

Quién usa cada pieza: 0a, C y F (E solo si su panel anima algo); 0b y 0e, los tres; 0c, E y F (C no escribe en `flags_json`); 0d, F (en su alternativa recomendada, C y E no meten tipos en la línea de tiempo).

**Otros puntos de choque que quedan.** (1) **Lista de la línea de tiempo:** solo F añade tipos a ella (tres de sus cuatro eventos); C y E recomiendan no hacerlo; el mecanismo común es la pieza 0d. (2) **Vocabulario:** E y F usan las claves canónicas de 3.5; si alguno propone otro nombre, hay que fusionarlo en la tabla de alias. (3) **Pregunta cruzada** sobre mostrar o no el estado de la persona (C-P2 y F-P14, misma redacción en ambos documentos).

## 9. Preguntas abiertas para el equipo de Psicología

**P1 (bloquea).** ¿Es defendible el subconjunto de la beta: agitada, afligida y aliviada con estilo; preocupada y cerrada solo con retrato; enojo, disociación y esperanza reservados? (a) Sí. (b) Añadir enojo, porque los reclamos de la familia en M1 se leen como enojo contra la institución (implica re-etiquetar). (c) Solo ritmo uniforme, sin diferenciar. *Por defecto: (a).*

**P2 (bloquea).** Hoy el panel muestra un punto de color y, para tres emociones, una etiqueta («receptiva», «preocupada», «alerta»). Si el estudiante debe *observar*, una etiqueta le da la respuesta. (a) Quitar toda etiqueta de las personas; el lector de pantalla recibe una descripción breve. (b) Mantener etiqueta en español. (c) Etiqueta opcional como «ayuda de lectura». *Por defecto: (a).*

**Pregunta cruzada (la misma en C-P2 y F-P14):** C propone quitar las etiquetas de emoción para que el estudiante *observe*; F propone mostrar un indicador de tensión verbal con texto («con carga», «tensa»). ¿Se aplica el mismo criterio a ambos? (a) Se mantienen las dos propuestas (sin etiqueta de emoción; indicador de tensión ocultable). (b) Ambos ocultos por defecto. (c) Ambos visibles. *Por defecto: (a).*

**P3.** ¿Se aplica el estilo al testimonio de la sobreviviente (M9)? (a) Sí, perfil suave (tope ×1,15). (b) Solo retrato. (c) No. *Por defecto: (a), con veto de la revisión de expertos.*

**P4.** El retrato `happy` de la Abuela es una sonrisa suave. ¿Es aceptable en M2 y M6, cuando la familia está en duelo? (a) Conservarlo. (b) No usarlo (se queda el neutral). (c) Encargar una versión «alivio sin sonrisa». *Por defecto: (b).*

**P5 (bloquea la fase 3).** ¿Hacemos el piloto de la ventana de intervención en M1? (a) Sí, solo M1. (b) No: la contención sigue como menú al final. (c) Sí, y evaluar después M3 y M10. Solo se discute si el bloque F NO se aprueba (F-P1): si F se aprueba, la interacción por turnos en M1 es de F y las opciones (a) y (c) no se construyen. *Por defecto: (b).*

**P6.** ¿Qué acciones cuentan como «intervenir»? (a) Solo contención (PAP). (b) Además «pedir un momento a la familia». *Por defecto: (a).*

**P7.** ¿Los eventos de la ventana aparecen en la línea de tiempo del docente? (a) No, solo en la lista de eventos. (b) Sí. *Por defecto: (a).*

**P8.** ¿La competencia C3 va como criterio nuevo o dentro de `CONTENCION`? ¿Qué dos preguntas de bitácora (sección 2) se aprueban? (a) Dentro de `CONTENCION` y las dos preguntas propuestas. (b) Criterio nuevo. *Por defecto: (a).*

**P9 (bloquea la fase 1).** Validar los alias: «negative» (2.ª línea de la Abuela en H1) = afligida; «positive» de la psicóloga = serena; el desbloqueo de M2 = aliviada; «closed» = retraída. (a) Aprobados. (b) Re-etiquetar en el seed las líneas dudosas. *Por defecto: (a).*

**P10.** ¿Se descartan los 6 retratos genéricos (Visual C) y los 5 efectos de decisión (Visual H)? (a) Sí, ambos. (b) Solo H. (c) Ninguno. *Por defecto: (a).*

**P11.** En pantalla y en documentos al estudiante, ¿«señal» o «síntoma»? *Por defecto: «señal»; «síntoma» queda como nombre interno del plan.*

**Preguntas para Ingeniería**
- **I1.** ¿Siguen vigentes los planes de julio (35-45 car/s, sin chips, `ActorPresentationState`)? Define la velocidad base y el chip.
- **I2.** Pasar `reduceMotion` al panel (dos instancias); la señal solo lee la preferencia del sistema al crearse. Es la pieza 0a de la Fase 0 compartida.
- **I3.** ¿Cómo se deduce la voz (persona / narración / sistema)? Propuesta: prefijos de clave (`supervision-`, `evidence-gate-`, `risky-warning-`, `npc-`), lista de hablantes de sistema y paréntesis completos.
- **I4.** `safeExit()` retorna con diálogo abierto (`inputBlocked()`): ¿cómo permitir «Pausa segura» desde el panel sin reabrir el riesgo de dos pasos? Se acordó un componente común con E y F (pieza 0b de la Fase 0 compartida); queda por diseñar.
- **I5.** Eventos de la ventana: ¿endpoint nuevo con lista blanca y deduplicado, o marca en el `detail` de `TOOL_USED` (más barato, sin «escuchó hasta el final»)?
- **I6.** Verificar con NVDA que la región de estado anuncia la primera línea al abrir el diálogo (se monta ya con texto; supuesto).
- **I7.** Migración al manifiesto v1: ampliar `PortraitState` (`sad`, `closed`) y regenerar el hash del mapa clínico, o seguir con archivos individuales.
