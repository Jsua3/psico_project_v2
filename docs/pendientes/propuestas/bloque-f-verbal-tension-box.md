# Bloque F — Verbal Tension Box (tensión verbal de la conversación): propuesta de diseño

- **Fecha:** 2026-10-03
- **Estado:** Propuesta para discusión — sin implementar
- **Rama:** `feat/cierre-plan-maestro`
- **Base de hechos:** propuestas-c-e-f-base-comun.md (se cita como «base común §N»)
- **Marco pedagógico:** el informe de Análisis y Diseño no pudo abrirse esta noche; ECD, LM-GM, MDA e INACSL siguen el resumen de la base común §2 y su plantilla de 5 pasos.
- **Fuentes propias:** plan maestro, bloque F (líneas 993-1092); hoja de ruta de junio, sub-proyecto I y decisiones D1-D3; spec de julio §8.2 y plan de julio de consecuencias de NPC; código de decisiones, métricas del caso, HUD, panel de diálogo y semilla del caso. Nada se ejecutó.
- El plan asigna a este bloque un identificador de requisito de negocio que no coincide con el catálogo; no se usa aquí (base común §3, advertencia de IDs).

---

## 1. Resumen en lenguaje llano

**Qué es.** Un indicador que muestra cuánta carga o presión lleva *la conversación en curso* con una persona del caso. No mide el estrés del estudiante ni el estado emocional general de la paciente: mide el clima del intercambio. Sube con ciertas formas de hablar (interrogar con preguntas cerradas en cadena, minimizar, presionar, prometer lo que no se puede cumplir, dar una noticia sin preparar) y baja con otras (validar, escuchar, preguntar con permiso, informar por etapas, ofrecer control, acompañar en silencio).

**Para qué sirve.** Para que el estudiante vea las consecuencias de *cómo* dice las cosas y no solo de *qué* decide. Entrena desescalada verbal, contención, comunicación de noticias difíciles por etapas y no sobreprometer. También enseña algo que el simulador hoy no muestra: hay temas que pesan aunque se hagan bien; lo que se mira es si el estudiante los sostiene o añade peso evitable.

**Qué vería el estudiante.** En dos o tres conversaciones clave (la abuela en urgencias, la sobreviviente en la comisaría), antes de la decisión de la escena, habría 2 a 4 intercambios cortos. La persona dice algo; el estudiante elige entre cuatro maneras de responder, todas plausibles y sin etiquetas que delaten la mejor; ve cómo reacciona la persona y cómo cambia un indicador con texto (cuatro niveles, nunca solo color). Si la tensión llega al máximo, la persona se retrae: no hay «perdiste», aparece un momento para reparar. No hay cuenta atrás, no hay reflejos, no hay movimiento obligatorio, y la pausa segura está siempre a la vista.

**Lo que encontramos.** Los documentos de partida piden dos cosas distintas con el mismo nombre: un medidor pasivo (plan maestro) o un minijuego en tiempo real tipo Undertale (hoja de ruta). Además, con el contenido actual del caso un medidor pasivo se movería solo dos veces por partida (solo 2 de las 6 decisiones ocurren frente a la persona afectada, §3.3).

**Qué recomendamos.** La alternativa intermedia: **entrevista breve por turnos**, con la tensión como consecuencia visible, en tono clínico sobrio (sin proyectiles ni lenguaje de combate), formativa (no cambia el puntaje ni el estrés) y construida en pasos pequeños, empezando por una sola conversación piloto.

**Qué necesitamos que decida el equipo** (detalle en la sección 9): (1) cuál de las tres alternativas; (2) el tono (serio y clínico, o con estética de juego de combate) y el tiempo (sin reloj, o con reflejos); (3) si aceptan la definición de «tensión verbal» y sus cuatro niveles; (4) quién escribe y valida los intercambios; (5) qué significa y qué consecuencia tiene que la persona se cierre; (6) si la noticia de la muerte de la niña se dramatiza o se elide.

---

## 2. Qué competencia clínica entrena y cómo se evidencia

### 2.1 Qué es la tensión verbal (y qué no)

**Definición propuesta.** Grado de carga o presión que la persona atendida experimenta en el intercambio en curso, resultado de lo que se dice (contenido), cómo se dice (forma), cuándo y a qué ritmo, y de lo que se omite. Tiene dos componentes:

- **Peso del tema:** no depende del estudiante. Hablar de una hija fallecida pesa siempre; un buen profesional no lo lleva a cero.
- **Carga añadida o aliviada por la forma:** sí depende del estudiante. Es la que se evalúa.

El indicador muestra el total. La evidencia pedagógica vive en el segundo componente.

**Cuatro conceptos que no deben mezclarse** (regla R4, base común §8: una tensión por concepto):

| Concepto | Qué describe | Alcance | Quién lo mueve hoy | Relación con la tensión verbal |
|---|---|---|---|---|
| **Tensión verbal** (F) | Clima de *esta conversación* con *esta persona* | Una persona, una entrevista | Nadie (no existe) | — |
| **Estrés del caso** | Presión global del caso; los corazones del HUD muestran la calma restante (base común §4) | Todo el intento | Decisiones y herramientas | Independiente. F no lo lee ni lo escribe |
| **Crisis emocional (Reactividad)** | Activación de la paciente del caso; tiñe su sprite de rojo desde 70 (base común §4) | Todo el intento, global, no por persona | Registro de efectos por opción | F la **lee** (opcional) para ajustar el punto de partida; no la escribe. Una conversación tensa no *es* una crisis: es un clima |
| **Tensión del NPC** (julio, sin construir) | Estado relacional persistente de cada NPC (`trust`, `tension`, `openness`, `available`) con un cambio fijo por decisión | Todo el intento, por NPC | Nadie | Ver abajo |

**Cómo se relaciona con la tensión del NPC.** Se propone que la tensión verbal sea la **capa rápida** (la conversación de hoy, se mueve intercambio a intercambio) y la tensión del NPC la **capa lenta** (el residuo de la relación entre conversaciones, un cambio por decisión). Si el plan de julio se construye, su `tension` actúa como *residuo*: F la lee para fijar el punto de partida de cada entrevista y no la escribe; sus cambios por decisión siguen siendo del plan de julio. Si no se construye, F es la única «tensión» y el punto de partida sale de un valor autorado por entrevista, ajustado por la crisis emocional. En ningún caso habrá dos barras en pantalla para el mismo concepto. El glosario obliga a decir siempre «tensión verbal» o «tensión del NPC», nunca «la tensión» a secas.

### 2.2 Qué la sube y qué la baja (en términos de técnica de entrevista)

Los efectos dependen del momento: no hay técnica «buena» en abstracto. Esta tabla es una propuesta para que Psicología la corrija; los valores numéricos los fija el registro de cada entrevista, no esta tabla.

| Técnica o conducta | Efecto típico | Matiz clínico (cuándo cambia) | Dónde aparece en el caso |
|---|---|---|---|
| Validación emocional | Baja | Pierde efecto si es fórmula repetida; no sustituye la información que la persona necesita | M1, M9 |
| Escucha activa (reflejar, parafrasear) | Baja | Con la persona desbordada, reflejos largos la abruman: frases cortas | M1, M9 |
| Pregunta abierta | Baja o sube | En crisis aguda exige una elaboración que la persona no tiene (sube); en exploración abre (baja) | M1 frente a M9 |
| Preguntas cerradas en cadena | Sube, y se acumula | Una pregunta cerrada puntual y necesaria (seguridad) pesa poco; la *cadena* y el momento pesan | M3 (interrogar), M9 |
| Minimizar o tranquilizar en falso | Sube | La persona se siente no escuchada | M1, M9 |
| Presionar a decidir o a perdonar | Sube mucho | Aumenta el riesgo en violencia de género | M9, M10 (`c1-mediacion-perdon`) |
| Explicar o psicologizar su conducta | Sube | Desplaza la responsabilidad y pospone la protección | M10 (`c1-patrones-infancia`) |
| Sobreprometer | Sube | Alivio aparente; erosiona la confianza cuando no se puede cumplir | M1, M8 |
| Informar con honestidad, por etapas y con límites claros | Baja, o sube por el peso del tema | La noticia en sí sube la tensión aunque se dé bien; lo que cuenta es lo que viene después | M5 |
| Dar una noticia difícil sin preparación | Sube mucho (cierre) | — | M3 (`h1-noticia-sin-protocolo`) |
| Silencio acompañado | Baja leve | Silencio sin presencia es abandono: se ofrece solo como «quedarme a su lado» | M1 |
| Ofrecer control (pausa, elegir cómo seguir) | Baja | Es la base de la reparación | M9, reparación |

### 2.3 Qué significa clínicamente que «la persona se cierre»

Es **retraimiento protector**: la persona deja de hablar, responde en monosílabos o evita el contacto. Equivale a una ruptura de alianza de tipo *retirada* (la persona deja de colaborar sin confrontar). No es culpa de la persona atendida, no es el fin de la partida y no es una derrota: es información sobre cómo se condujo la conversación. La conducta profesional esperada es reconocer, bajar el ritmo, validar sin preguntar, ofrecer control y no insistir; es decir, **reparar**. En el simulador (recomendada):

1. A partir de un umbral (90 de 100) la persona se retrae: sus líneas son breves o de silencio.
2. El menú pasa a ofrecer respuestas de reparación (todas plausibles; algunas reparan, otras insisten).
3. Si el estudiante repara, la conversación sigue desde el nivel al que bajó (no desde cero). Si no repara tras dos intentos, la persona da por terminada la conversación por ahora; **no hay bloqueo** y la decisión de la escena sigue disponible (ruta de error sin reparación que termina válidamente, spec de julio §8.2).
4. Un solo desliz no basta para el cierre: hace falta un patrón.

### 2.4 Competencia → evidencia → tarea (plantilla de 5 pasos, base común §2)

| Paso | Contenido |
|---|---|
| 1. Competencia | «El estudiante puede **sostener y desescalar una conversación con una persona en crisis o en duelo**, ajustando cómo interviene (validar, preguntar, informar, guardar silencio), sin añadir carga evitable ni sobreprometer, y reparar cuando la persona se retrae.» |
| 2. Evidencia | **Cuenta:** la secuencia de tipos de respuesta por entrevista; la *trayectoria* de tensión (qué subió por el tema y qué por la forma); si hubo cierre y si el estudiante reparó; el orden de las etapas al informar; si evitó promesas que no controla. **Regla:** formativa; no puntúa. La deja registrada el evento `VERBAL_TENSION_EXCHANGE_ANSWERED` (sección 5); el docente ve la trayectoria como lista. **No cuenta:** ver 2.5 |
| 3. Tarea y mecánica | Entrevista de 2-4 intercambios antes de la decisión de la escena (M1, M9). LM-GM: *simulación + retroalimentación inmediata + reflexión* → elegir una respuesta y ver la reacción y el indicador. MDA en 3.6 |
| 4. Seguridad y acceso | ETH-01 ya cubre el contenido del caso; pausa segura visible dentro de la entrevista (ETH-02, REGLA-004); sin tiempo; sin depender del color ni del movimiento; no se modela la tensión de personas ausentes (sección 7) |
| 5. Devolución | Tras cada respuesta: solo la reacción de la persona y el cambio visible. Al terminar la entrevista: una «mirada de supervisión» breve que nombra las técnicas usadas y por qué pesaron así. Pregunta de bitácora, p. ej.: «¿Qué notaste en la persona cuando cambió el ritmo de la conversación? ¿Qué harías distinto?» Indicador docente: trayectoria por entrevista |

**Subcompetencias y criterios de rúbrica existentes** (base común §2: la competencia es texto libre; ninguna se enlaza automáticamente):

| Subcompetencia | Criterio | Nota |
|---|---|---|
| Desescalar y contener | `CONTENCION` (rúbrica del caso) y `PAP` (rúbrica básica) | Existentes |
| Comunicar con empatía, validar, no juzgar | `COMUNICACION_EMPATIA` | Existente |
| No sobreprometer; informar con honestidad | `COMUNICACION_EMPATIA` | Existente |
| Comunicar una noticia por etapas | `COMUNICACION_EMPATIA` + herramienta `SPIKES` | Solo si M5 se valida (P9) |
| Reparar una ruptura | **Nueva (propuesta)** o dentro de `CONTENCION` | P11 |

### 2.5 Qué NO cuenta como evidencia

- Rapidez para responder, tiempo de lectura, número de clics o de pausas. La pausa segura no se interpreta.
- Usar movimiento reducido, lector de pantalla u ocultar el indicador.
- El valor final del indicador por sí solo: un tema pesado puede terminar alto con buena técnica.
- Llegar a cero, o «no haber provocado cierre»: se puede evitar el cierre por pasividad (elegir siempre lo más neutro).
- Elegir lo que menos sube cuando el momento pedía nombrar la gravedad (p. ej. evitar hablar de seguridad en M9).

---

## 3. Alternativas de diseño

### 3.1 Las dos lecturas del bloque (base común §3.3)

| | Plan maestro (bloque F) | Hoja de ruta (sub-proyecto I) |
|---|---|---|
| Qué es | Medidor pasivo 0-1; crítico desde 0,9 → «el paciente cierra comunicación»; reinicio parcial al cambiar de sala | Minijuego en tiempo real: corazón en una caja, proyectiles azules/naranjas, 4 comandos (DIAGNOSTICAR, ACTUAR, HISTORIAL, PERDONAR) |
| Tiempo | Sin reloj propio | Tiempo real (esquivar) |
| Entrada | `verbal_tension_delta` por opción, «en el JSON de la opción» | Patrones de proyectiles y ritmo |
| Esfuerzo | Bajo | Alto / riesgo alto; exige D1 y D2 resueltas |

No se pueden mezclar: una toma al estudiante como lector de un indicador; la otra, como jugador con reflejos. La hoja de ruta exige resolver D1 y D2 «antes de I».

### 3.2 Decisiones transversales D1 y D2: recomendación explícita

**D1 — Tono frente a subversión. Recomendamos el reencuadre clínico sobrio, sin proyectiles.**

| Opción | Qué es | Veredicto para `SIM-VBG-001` |
|---|---|---|
| Subversión completa | El desahogo de la paciente como proyectiles; DIAGNOSTICAR = luchar; Fight/Flee/Mercy | **No.** Ver razones |
| Reencuadre con proyectiles | Proyectiles = «presión intrusiva», dibujados con respeto | **No** para este caso: sigue siendo tiempo real (D2) y sigue haciendo del dolor algo que se esquiva |
| **Reencuadre clínico sobrio** | La tensión es una propiedad de la conversación; se responde por turnos; vocabulario de acompañar, responder, pausar | **Sí** |
| Híbrido | Solo estética: marco de «caja» y símbolo de calma, sin proyectiles ni vocabulario de combate | Aceptable como acabado visual, nunca como mecánica |

Razones: (1) quien habla es una sobreviviente de tentativa de feminicidio o una abuela cuya nieta murió; representar su relato como ataque a esquivar invierte la postura clínica, que es **permanecer** con el malestar, no evadirlo (base común §6.6 y §6.7). (2) «Perder» frente a una persona que sufre convierte el sufrimiento en un resultado de juego. (3) La competencia es verbal, no motora; el esquive no tiene transferencia a la práctica. (4) El caso es deliberadamente serio y su guardarraíl de no revelar la respuesta adecuada ya choca con la gramática de «golpe y esquive». Si el equipo quiere conservar la identidad Undertale, que sea en un caso futuro de tono no sensible, decidido caso por caso.

**D2 — Accesibilidad. Recomendamos modo único por turnos, sin tiempo; no ofrecer tiempo real en `SIM-VBG-001`.**

El roadmap dice que el modo por turnos es «casi seguro obligatorio». Lo llevamos más lejos: si es el único modo, no hace falta un contrato de respaldo con equivalencia entre dos modos, y la decisión del coordinador «sin tiempo por defecto» se cumple sin excepciones. Si algún día se construye un modo cronometrado (otro caso), el contrato mínimo sería: (a) por turnos es el predeterminado; (b) el cronometrado es opcional, se activa de forma explícita antes del caso y nunca se infiere de preferencias del sistema; (c) con movimiento reducido el cronometrado **no está disponible**, no solo se ralentiza; (d) misma evidencia y mismo debrief en ambos modos; (e) no puntúa reflejos; (f) pausa en cualquier momento (WCAG 2.2.1, 2.2.2); (g) sin destellos (2.3.1).

**D3 (autoría).** Para los primeros cortes, el contenido va en un registro en código del backend (como `OPTION_EFFECTS`); el editor queda para después (sección 6).

### 3.3 Alternativa 1 — Medidor pasivo (lectura del plan)

**Descripción.** Barra 0-1 durante los diálogos. Cada opción de decisión existente suma o resta un valor; al llegar a 0,9 la persona «cierra comunicación»; al cambiar de sala se reinicia en parte.

**Pros.** Barata (≈ 7-11 días-persona, sin la Fase 0 compartida). No exige contenido nuevo. Sin tiempo. Reutiliza el patrón de `OPTION_EFFECTS`.

**Contras (verificados en la semilla del caso).**
- Solo 2 de las 6 decisiones ocurren frente a la persona afectada: H1 (la abuela, `familia-duelo`) y C1 (la sobreviviente, `sobreviviente-consulta`). H2 y C2 son marco normativo; H3 y C3 son con colegas. La barra se movería **dos veces por partida** (tres con el reintento).
- Cada conversación tiene 2-3 líneas y *una* elección que, salvo el reintento, cambia de nodo y cierra el diálogo: la barra nunca se vería «crecer» dentro de una conversación y el cierre no podría ocurrir a mitad.
- Duplica a la crisis emocional y a la tensión del NPC de julio (R4): una tercera barra roja para lo mismo.

**Riesgos.** *Éticos:* medir en números a una sobreviviente; «paciente cierra comunicación» suena a culpa de la persona. *Pedagógicos:* el estudiante aprende a mirar un número, no a la persona; la escala −1..+1 del plan mezcla «empatía» con «tensión», cuando dar bien una mala noticia *sube* la tensión. *Accesibilidad:* el borrador del plan la pone en el HUD, que queda inerte y oculto al lector de pantalla mientras hay un diálogo abierto (7.4).

### 3.4 Alternativa 2 — Entrevista breve por turnos (intermedia)

**Descripción.** Antes de la decisión de la escena, la persona del caso conduce una entrevista de 2-4 intercambios. En cada uno, la persona dice algo y el estudiante elige entre cuatro respuestas (validar, preguntar, informar, guardar silencio acompañando, y variantes que presionan o sobreprometen). La persona reacciona en texto; el indicador cambia de nivel; el cierre y la reparación son parte del recorrido (2.3). Sin tiempo. Las decisiones puntuadas de siempre (H1, C1) **no cambian**: la decisión es el *qué* (estrategia), la entrevista es el *cómo* (técnica verbal), y esta última es formativa.

**Pros.**
- La tensión se mueve donde está el aprendizaje (dentro de la conversación).
- Sin reflejos; funciona con una sola tecla y con lector de pantalla.
- Evidencia más rica que una elección: secuencia, trayectoria, reparación.
- Se construye por escalones: F1 (esqueleto con las decisiones existentes) y F2 (entrevista piloto).
- Compatible con C (estilo del texto) y con E (pistas que abren respuestas).

**Contras.**
- Requiere contenido nuevo escrito y validado por Psicología (≈ 3 entrevistas × 3 intercambios × 4 respuestas, con reacciones).
- Un endpoint nuevo (código, no esquema) y un componente nuevo dentro del panel de diálogo.
- Cambia el ritmo del caso (≈ 2-3 minutos por entrevista).

**Riesgos.**
- *Éticos:* poner un indicador a la sobreviviente puede objetivarla. Mitigación: se rotula «tensión de la conversación», no de la persona; cuatro niveles con texto, sin porcentaje; sin tensión para personas ausentes ni colegas; sin lenguaje de victoria o derrota.
- *Pedagógicos:* (a) buscar el número (Goodhart): no puntúa, no se muestran deltas, y el docente valora trayectoria; (b) la respuesta obvia: reglas de autoría (todas plausibles y profesionales, longitud parecida, orden decidido por el servidor por intento, sin etiquetas de técnica); (c) dependencia del indicador: el estudiante puede ocultarlo (preferencia local no registrada) y las reacciones en texto dicen lo mismo; (d) falsa sensación de dominio: una persona simulada responde de forma determinista; el debrief lo dice.
- *Accesibilidad:* sin tiempo, ver 7.1.

### 3.5 Alternativa 3 — Caja en tiempo real (lectura de la hoja de ruta)

**Descripción.** Subsistema Phaser nuevo: corazón en una caja, proyectiles azules (quedarse quieto = escucha activa) y naranjas (moverse = confrontación asertiva), menú DIAGNOSTICAR/ACTUAR/HISTORIAL/PERDONAR (I0 prototipo aislado, I1 patrones y ritmo, I2 integración con modo alterno).

**Pros.** Identidad de juego muy marcada; la hoja de ruta lo ve como el «núcleo» del producto.

**Contras.** Esfuerzo alto (estimación del autor: ≈ 40-65 días-persona con ajuste y pruebas de accesibilidad); exige un modo alterno completo por turnos (que es la Alternativa 2); riesgo de rendimiento (presupuesto de 59 FPS, base común §5.6); la competencia entrenada (reflejos) no es la clínica.

**Riesgos.** *Éticos:* D1 (trivializa el desahogo, «game over» ante una muerte; base común §6.7). *Pedagógicos:* premia la destreza motora y castiga a quien no la tiene; el estudiante «gana» sin haber tomado ninguna decisión clínica. *Accesibilidad:* choca con movimiento reducido, accesibilidad motora y WCAG 2.2.1 (D2); el uso de la preferencia de movimiento reducido para decidir el modo podría inferir una condición de salud.

### 3.6 Comparación y recomendación

| Criterio | Alt. 1 Pasivo | **Alt. 2 Turnos** | Alt. 3 Tiempo real |
|---|---|---|---|
| Movimiento dentro de la conversación | Casi nulo | Alto | Alto |
| Competencia clínica entrenada | Débil | **Fuerte** | Débil (motora) |
| Sin tiempo ni reflejos | Sí | **Sí** | No |
| Riesgo ético (D1) | Medio | **Bajo-medio** | Alto |
| Contenido nuevo | No | Sí (Psicología) | Sí (patrones) |
| Esfuerzo (ing.; sin la Fase 0 compartida, 6-10 d comunes a C, E y F, que la Alt. 3 también necesitaría) | 7-11 d | **20-31 d** | 40-65 d |

**Recomendada: Alternativa 2**, entregada en escalones (sección 8). F1 equivale a la Alternativa 1 y es un buen primer escalón, pero **no se recomienda detenerse ahí** porque no tiene movimiento con el contenido actual. Si Psicología decide no escribir intercambios, el degradado razonable es F1: reacción visible solo en H1 y C1, con el reintento existente como «cierre y reparación».

**Diferencias con el criterio de Done del plan.** (a) El indicador no aparece en *todos* los diálogos sino en las entrevistas con personas afectadas. (b) «Reinicio parcial al cambiar de sala» se sustituye por «cada entrevista parte de un nivel inicial, no de cero» (3.7). (c) El delta no mide «empatía»: mide la carga por forma más el peso del tema. (d) «Efecto en el diálogo» al 90 % es estático (retrato y texto), no un parpadeo.

**Lectura LM-GM (base común §2).** *¿Qué aprende haciendo esto que no aprendería leyendo?* A percibir el efecto inmediato de la forma de hablar y a reparar, que un texto no entrena. Mecánica de aprendizaje: simulación con retroalimentación inmediata + reflexión; mecánica de juego: elegir una respuesta por turno y ver la consecuencia.

**Lectura MDA.** *Mecánicas:* intercambios, cuatro respuestas por turno, estado de tensión por persona, umbral de cierre, reparación. *Dinámicas:* el estudiante lee a la persona, ajusta el ritmo, nota cuándo apretó de más y repara. *Estética (la «A», en términos clínicos):* atención, cautela, respeto por el ritmo de la persona y alivio contenido al reparar; **no** tensión de combate, no competencia, no diversión por el sufrimiento.

### 3.7 De quién es la tensión

**Una por persona presente con quien se conversa; nunca global.** Una barra visible a la vez. Una global duplicaría al estrés del caso.

| Dónde | Contraparte | Clave de la tensión | Nota |
|---|---|---|---|
| Hospital (M1, M3) | La familia en duelo: la abuela de la niña | `familia-duelo` (alias `familia-crisis`) | Dos objetos del mapa, una sola persona. El HUD dice «paciente» aunque la contraparte sea la familia (base común §9.7): F rotula con el nombre de quien está presente |
| Comisaría (M9, M10) | La sobreviviente | `sobreviviente-consulta` (alias `sobreviviente-espera`) | En recepción aparece como NPC ambiental |
| Comisaría (M8) | La madre, con la sobreviviente en silencio (se supone que es la misma persona que la abuela del hospital; pregunta E-P12) | `madre-acompanante` | NPC ambiental sin persistencia (I3) |
| Colegas (`psicologa-acompanante`, `profesional-psicosocial`) | — | **Sin tensión** | Un colega no «se cierra» en el mismo sentido clínico |
| Ausentes (la niña, el agresor, la sobreviviente en quirófano) | — | **Nunca** | Base común §6.6 |

**Punto de partida de cada entrevista.** Valor autorado por entrevista (p. ej. «con carga» en M1), ajustado de forma leve por la crisis emocional (solo lectura). Queda abierto si una métrica *global* debe modular a una persona *concreta* (P12). **Residuo:** al volver a hablar con la misma persona, parte del nivel anterior se conserva; el salto «Quince días después» (`hospital-cierre-bloque`) reinicia. **Pausa segura:** congela todo y al reanudar vuelve exactamente el mismo estado; no cuenta como dejar a la persona. **Cerrar el panel** (Esc) deja la entrevista abierta en el servidor y se retoma donde quedó.

---

## 4. Cómo se vería y se jugaría

### 4.1 Boceto (panel de diálogo; el orden de las respuestas lo decide el servidor por intento)

```
+--------------------------------------------------------------------------+
| [retrato]  Abuela de la niña                              [ Pausa segura ]|
|            «…¿están bien? ¡Dígame que están bien!»                       |
|                                                                          |
|  Tensión de la conversación:  [##][##][  ][  ]   Con carga (2 de 4)      |
|                                                                          |
|  1  Tranquila, todo va a estar bien.                                     |
|  2  ¿Cuál es su parentesco con las personas ingresadas?                  |
|  3  Entiendo que necesita saber. Estoy con usted; ¿se sienta un momento  |
|     mientras averiguo qué puedo decirle?                                 |
|  4  Quedarme a su lado, sin hablar, unos instantes.                      |
+--------------------------------------------------------------------------+
```

### 4.2 Recorrido: entrevista piloto, M1 (`familia-crisis`, hospital-urgencias)

Los textos y valores son **ejemplos para discutir**, no contenido validado.

1. El estudiante ya consintió al inicio (ETH-01) y quizá escuchó a la enfermera. Se acerca a `familia-crisis`; se abre el panel con las líneas actuales de la abuela. El indicador aparece en «Con carga».
2. **Intercambio 1** (ella pide certezas). Se elige la 3 (validar y ofrecer presencia sin dar información que no se tiene). La abuela deja de repetir la pregunta y se sienta. Nivel: «Con carga», más cerca de «Serena». Anuncio por lector de pantalla solo si cambia el nivel.
3. **Intercambio 2** (insiste en la verdad). Opciones: ser honesto sobre los límites («no tengo información confirmada; hay un equipo atendiendo y estoy aquí con usted»); decir «está bien» (mentira que además contradice lo que el equipo sabe); una respuesta administrativa fría; derivar a un colega. Elegir la honesta baja; la mentira sube hasta «Tensa».
4. **Intercambio 3** (quiere entrar a ver). Opciones sobre límites y control: ofrecer agua y un lugar donde sentarse, explicar quién la acompañará cuando haya información, o negarse en seco.
5. **Fin de la entrevista.** Aparece la «mirada de supervisión» (qué técnicas se usaron y por qué pesaron así). Luego sigue el recorrido actual: herramienta PAP, línea desbloqueada (M2), puerta a la sala de escucha.
6. **Variante con cierre.** Si en los tres intercambios se sobreprometió y se interrogó, el nivel llega al cuarto, «la persona se retrae»: la abuela se retrae (retrato y líneas breves). El menú pasa a **reparación**: reconocer que se le habló de prisa y quedarse sin pedir nada; ofrecer una pausa y volver; insistir en la pregunta. Reparar baja el nivel; insistir termina la conversación por ahora. Nada de esto toca el puntaje ni el estrés.

### 4.3 Los demás momentos

| Momento | Hoy | Participación recomendada |
|---|---|---|
| **M1** `familia-crisis` | 3 líneas y la herramienta PAP | **Piloto** (4.2): contención sin dar la noticia, no sobreprometer. En M1 la interacción por turnos es de F: el bloque C no construye allí su ventana de contención si F se aprueba (acuerdo 1, sección 8) |
| **M3** decisión H1 en `familia-duelo` | Tres enfoques en una elección | F1: la reacción de la abuela ante `h1-noticia-sin-protocolo` (sube a cierre) y `h1-pap-contencion` (baja) se ve en el indicador; el reintento existente hace de reparación. `h1-interrogar-victima` apunta a una persona ausente: **sin tensión** |
| **M5** decisión H3, `psicologa-acompanante` | Opciones de plan con una colega | Sin indicador con la colega. Si Psicología lo valida (P9): ensayo de la secuencia de etapas con la **noticia elidida** («[El equipo comunica la noticia]»); se practica lo que la rodea. El peso del tema sube por diseño; se evalúa lo que sigue |
| **M8** `madre-acompanante` | Una línea: la madre pide que le confirmen que allí sí la protegerán | Un intercambio sobre promesas: acotar lo que la comisaría puede hacer hoy frente a «sí, estará a salvo». La sobreviviente, en silencio (`closed`), es contexto, no medida. Requiere decidir cómo se persiste un NPC ambiental (I3) |
| **M9** `sobreviviente-consulta` | 2 líneas y la elección C1 | **Segunda entrevista**: ritmo, preguntas abiertas, presión familiar a perdonar; sin juzgar ni explicar su elección de pareja |
| **M10** decisión C1 | Mediación, riesgo/protección o psicologizar | F1/F2: `c1-mediacion-perdon` lleva a cierre; `c1-patrones-infancia` sube; `c1-riesgo-proteccion-derechos` baja. La segunda oportunidad es la reparación |

### 4.4 Versiones accesibles

- **Movimiento reducido** (señal del sistema o interruptor del HUD): el indicador cambia de nivel al instante, sin transición; sin parpadeo; el cierre es estático (retrato y texto). Hoy el panel de diálogo no recibe esa señal (base común §5.5): F la necesita como entrada (pieza 0a de la Fase 0 compartida, sección 8).
- **Solo teclado:** teclas 1-4 eligen, Enter/Espacio completa y avanza, Esc cierra el panel (la entrevista se retoma), el botón «Pausa segura» es enfocable. El indicador es enfocable (Tab) para releer el estado; F **no añade atajos de una tecla nuevos**.
- **Lector de pantalla:** la línea de la persona se anuncia una sola vez, completa. El indicador es `role="meter"` con nombre «Tensión de la conversación»; valores 1 a 4 y `aria-valuetext` «Con carga, 2 de 4» (paridad con lo que ve quien ve). Cuando cambia de nivel, **una** frase breve en la misma región viva que ya anuncia la línea, después de ella; sin anuncio por cada pequeño cambio (WCAG 4.1.3).
- **Sin color:** nivel en texto, cuatro segmentos con relleno distinto, nunca solo tono.

---

## 5. Cómo se evalúa

### 5.1 Eventos (`AttemptEvent`) propuestos — prefijo `VERBAL_TENSION_`

Todos los escribe el backend (R2). Ninguno registra identificadores personales, preferencias de accesibilidad ni tiempos de reacción (base común §6.8).

| Evento (≤ 48) | Cuándo | `detail` (texto) | ¿Línea de tiempo docente? | ¿Afecta puntaje o estrés? |
|---|---|---|---|---|
| `VERBAL_TENSION_EXCHANGE_ANSWERED` (32) | Cada respuesta | persona, intercambio, respuesta (clave opaca), nivel antes → después | **No** (aparece en `events`; el bloque «Conversaciones» la resume) | No |
| `VERBAL_TENSION_COMMUNICATION_CLOSED` (35) | La persona se retrae | frase legible: «La persona se retrajo…» | **Sí** | No (por defecto) |
| `VERBAL_TENSION_REPAIRED` (23) | Se repara tras el cierre | frase legible | **Sí** | No |
| `VERBAL_TENSION_INTERVIEW_COMPLETED` (34) | Termina la entrevista, con o sin reparación | resultado: completada / reparada / terminada por la persona | **Sí** | No |

El rótulo de la línea de tiempo es `decisionText` o, si no, `detail` (`buildTimelineFallback` y su espejo `TIMELINE_EVENT_TYPES`, base común §5.1): por eso el `detail` de los tres eventos que entran debe ser una frase legible en español, no una cadena técnica. Entrar a la línea de tiempo exige editar **ambas** listas; el mecanismo común para hacerlo es la pieza 0d de la Fase 0 compartida (sección 8). Entre los tres bloques, F es el único que añade tipos a esa línea (C y E recomiendan no hacerlo).

### 5.2 Qué ve el docente

Hoy la interfaz docente no muestra las métricas del caso (base común §5.4). Se propone un bloque **«Conversaciones»** en la traza: por persona, una lista (no solo un gráfico) con el nivel inicial, cada intercambio con el tipo de técnica (que el estudiante no ve hasta el final), el nivel resultante, y el cierre o la reparación. El intervalo entre intercambios **no se muestra**: `occurred_at` ya existe en todos los eventos y de él se podría inferir velocidad de reacción.

### 5.3 Qué recibe el estudiante

Durante la entrevista: la reacción y el nivel, nada más. Al terminar: la mirada de supervisión y la pregunta de bitácora. Siempre después de decidir, nunca antes.

### 5.4 ¿Afecta al puntaje o al estrés?

**Por defecto, no** (R7): F no escribe `accumulatedScore`, `stressIndex`, `userTrust`, `victimRisk` ni `caseMetrics`. Opciones para el equipo:

| Opción | Qué hace | Riesgos |
|---|---|---|
| **0 (por defecto)** | El cierre no tiene efecto numérico; solo narrativo y de reparación | Puede percibirse como «sin consecuencia» |
| 1 | El cierre no reparado hace que la persona comparta una línea menos (p. ej. la de la presión familiar, M9); la decisión de esa escena muestra el aviso existente «Información incompleta», que no impide decidir | La información se vuelve premio por «portarse bien»; riesgo de decidir peor por una pérdida que dependió del tono. Reutiliza el mecanismo de líneas desbloqueables (M2) |
| 2 *(requiere decisión de Psicología)* | Pequeño aumento de la crisis emocional | Doble conteo con la decisión; mueve los 4 finales (`compute_ending`) |
| 3 *(requiere decisión de Psicología)* | Sube el estrés | Mezcla una variable formativa con una global; con estrés ≥ 40 se activa la viñeta de crisis: un efecto visual por un indicador formativo |
| 4 *(requiere decisión de Psicología)* | Cambia el puntaje | No recomendado: premia números sobre la persona |

### 5.5 Rúbrica

La evaluación sigue siendo manual (`RubricEvaluation`, `CriterionScore.evidence_json` no se llena solo; base común §2). La trayectoria es la evidencia que el docente cita en `CONTENCION` y `COMUNICACION_EMPATIA`. Una posible mejora posterior: botón «citar como evidencia». Indicador agregado de grupo (p. ej. «porcentaje que reparó tras un cierre»): posterior, nunca como ranking individual.

---

## 6. Datos

### 6.1 Lo que se puede hacer sin cambio de esquema

| Dato | Dónde vive hoy / propuesta sin esquema | Alternativa con esquema |
|---|---|---|
| Delta por respuesta (equivale al `verbal_tension_delta` del plan) | **No existe.** Registro en código del backend junto a `OPTION_EFFECTS`, con una clave por respuesta; nunca llega al cliente. `decision_options` no tiene columna JSON (base común §5.2); `dialogue_choices.effect_json` viaja al cliente *antes* de elegir, así que no puede llevar nada que delate la mejor respuesta (R3) | Columna JSON en `decision_options`, o tabla de opciones de intercambio editable desde el editor |
| Textos de las entrevistas (líneas, cuatro respuestas, reacciones) | Mismo registro en código (v1); alternativa: texto en las tablas de diálogo existentes y deltas en el registro | Tablas propias de intercambios |
| Valor, estado y respuestas dadas, por persona | `attempt_world_states.flags_json`, clave nueva `verbalTension` (ejemplo abajo) | Tabla de estado por intento y persona |
| Bitácora para el docente | `attempt_events.detail` (texto) y `event_type` nuevos (sin CHECK, ≤ 48) | Columna JSON en `attempt_events` o tabla de muestras |
| Técnica de cada respuesta (para el docente) | Registro en código | Columna en la tabla de opciones |
| Punto de partida y umbrales (40, 70, 90) | Constantes en código | Campo por nodo o sala |
| Lo que ya sabe el estudiante (pistas) | `viewedNpcKeys`, objetos inspeccionados, herramientas usadas (existen) | Tabla de pistas (bloque E) |
| Preferencias de accesibilidad | **No se registran** | No se debe crear |

Todo `flags_json` viaja al cliente (`/world`) y a la traza docente, por eso las claves de respuesta son **opacas** (no nombres de técnica) y no se guarda ningún delta de respuestas que aún no se eligieron.

```
"verbalTension": {"familia-duelo": {"value": 41, "state": "open", "turn": 2,
                  "answered": ["m1-t1-c"]}}          # en flags_json
VERBAL_TENSION_EFFECTS["m1-t1"]["m1-t1-c"] = {"delta": -14, "technique": "validar_y_acompanar"}  # solo servidor
```

### 6.2 Backend autoritativo

El cliente muestra y envía la respuesta elegida; no calcula ni escribe la tensión. Un hecho nuevo del cliente exige endpoint nuevo (código, no esquema): uno solo, idempotente por (intento, intercambio), que escriba `flags_json` por medio del escritor único con bloqueo de fila (pieza 0c de la Fase 0 compartida; hoy `apply_case_effects` no bloquea; base común §9.10) y devuelva el nivel nuevo y la línea de reacción. El servidor decide también el orden de las respuestas.

### 6.3 Qué exigiría esquema (solo propuesta)

Autoría en el editor (opciones de intercambio y sus deltas), estado transaccional por persona (evita la lectura-escritura sobre `flags_json`), muestras consultables por docente y por reporte de grupo. Procedimiento vigente (base común §5.2): script idempotente en `deploy/upgrades/`, CHECK en `deploy/db_seed.sql` y `test_deploy_schema_contract.py` en verde.

---

## 7. Accesibilidad y ética

### 7.1 WCAG 2.2, criterio por criterio

| Criterio | Cómo se cumple |
|---|---|
| 1.1.1 Contenido no textual | Retrato y segmentos con equivalente textual; el nivel va en palabras |
| 1.3.1 Información y relaciones | `role="meter"` con nombre y valor; las respuestas son un grupo con etiqueta |
| 1.4.1 Uso del color / 1.4.11 Contraste no textual | Texto + cuatro segmentos con relleno distinto; contraste ≥ 3:1 de los segmentos (por comprobar, no se midió) |
| 1.4.3 Contraste | Texto del indicador y de las respuestas ≥ 4,5:1 (por comprobar) |
| 2.1.1 Teclado / 2.1.2 Sin trampas | Todo por teclado; el panel ya atrapa el foco con salida por Esc |
| 2.1.4 Atajos de una tecla | F no añade; usa 1-4 que ya existen |
| 2.2.1 Tiempo ajustable | **No hay límites de tiempo.** «Guardar silencio» es un botón, no una espera |
| 2.2.2 Pausar, detener u ocultar | Sin parpadeo ni movimiento continuo (el borrador del plan parpadea sin fin); el indicador se puede ocultar |
| 2.3.1 Tres destellos | Sin destellos; el cierre es estático |
| 2.4.3 / 2.4.7 / 2.4.11 Foco | Orden lógico; foco visible; el panel no oculta el foco |
| 2.5.8 Tamaño del objetivo | Botones de respuesta y de pausa ≥ 24 px |
| 4.1.2 Nombre, función, valor | `role="meter"` con nombre, valores 1-4 y texto |
| 4.1.3 Mensajes de estado | Un anuncio breve por cambio de nivel, en la región viva existente, sin saturar |

### 7.2 Movimiento reducido, teclado y lector

Descritos en 4.4. Se añade: sin sonido nuevo (el audio es de otro plan); sin tercera capa roja (la viñeta de crisis existente ya depende del estrés y no se toca).

### 7.3 Ética

- **ETH-01 (consentimiento).** F no añade contenido sensible fuera del caso, pero las entrevistas añaden *líneas nuevas* de la abuela y de la sobreviviente. Solo el primer nodo está marcado como sensible (base común §7). Si las entrevistas amplían el testimonio de la sobreviviente, conviene marcar también el nodo de C1 y añadir una frase al aviso previo («tus respuestas cambian cómo reacciona la persona; puedes pausar cuando quieras»), sujeta a la revisión del texto de ETH-01 (P13).
- **ETH-02 y REGLA-004 (salida segura).** Cada entrevista incluye un botón visible «Pausa segura» dentro del panel, sin depender de acciones cronometradas ni de los dos Esc que hoy exige un diálogo abierto (base común §5.5); es la pieza 0b de la Fase 0 compartida (sección 8). La pausa congela el estado; al reanudar vuelve el mismo nivel. La pausa es para el estudiante (puede sufrir malestar propio), no para la persona del caso.
- **No revictimizar.** Sin tiempo, sin premiar la rapidez, sin usar el testimonio como estímulo cronometrado; sin reconstruir hechos; la noticia de la muerte de la niña se elide (P9); no se modela tensión de personas ausentes.
- **No convertir el sufrimiento en un juego.** Sin puntos, sin «game over», sin lenguaje de ganar o perder. El cierre se llama «la persona se retrae» (docente: «se cierra»). El indicador se llama «tensión de la conversación», no de la persona.
- **Privacidad (Ley 1581).** Sin latencias, sin preferencias de accesibilidad, alias docente; sin enviar datos de esta mecánica al asistente IA externo.
- **Andamiaje.** El indicador es un apoyo de aprendizaje, no un instrumento clínico: en la práctica real no existe. Se puede ocultar y las reacciones en texto dicen lo mismo.

### 7.4 Observaciones sobre el borrador del plan (lo que habría que corregir)

| Borrador del plan | Problema | Propuesta |
|---|---|---|
| Se integra «en el HUD» | El HUD queda `inert` y `aria-hidden` mientras hay un diálogo abierto (`simulation-play.component.ts`): no se vería ni se leería | Dentro del panel de diálogo, bajo `role="dialog"` |
| `verbalTension` como señal del cliente | Viola R2 | Estado en el servidor |
| `metadata.verbal_tension_delta` en la opción | La opción no tiene metadatos; en `effect_json` viaja antes de elegir (R3) | Registro en código |
| Escala −1..+1 «empático → confrontativo» | Mezcla empatía con tensión | Delta de forma + peso del tema, por intercambio |
| `blink 1s infinite` | WCAG 2.2.2 | Estático |
| Solo color verde/ámbar/rojo | WCAG 1.4.1 | Texto + segmentos |
| `triggerPatientWithdrawal()` | Sin especificar | Estado `cerrado` con reparación (2.3) |
| `@Input()` con signal | Patrón del plan; el proyecto usa `input()` | Detalle de implementación |

---

## 8. Esfuerzo estimado por fases y dependencias

Días-persona **orientativos** de Ingeniería (rango), más días de Psicología para contenido y revisión. **Las cifras de esta tabla no incluyen la Fase 0 compartida** (acuerdos de coherencia, abajo), que se cuenta una sola vez para C, E y F.

| Fase | Contenido | Entregable | Ing. | Psic. |
|---|---|---|---|---|
| **Fase 0 compartida** | Piezas 0a-0e (tabla de acuerdos, abajo); no se suma al total de este documento | Prerrequisitos comunes | 6-10 (una sola vez para los tres bloques) | 0 |
| **F0** Decisiones y contenido | Resolver P1-P9; fijar definición, niveles, matriz de técnicas; escribir y revisar la entrevista piloto (M1) | Acta de decisiones y texto validado | 0 | 4-6 |
| **F1** Esqueleto | Estado por persona y niveles; registro de deltas para H1 y C1; indicador accesible en el panel; reintento = cierre/reparación; eventos (el botón de pausa segura es la pieza 0b) | Indicador en H1 y C1 (equivale a la Alt. 1) | 7-11 | 1-2 |
| **F2** Entrevista piloto | Endpoint de intercambio (idempotente; el bloqueo es la pieza 0c); flujo de intercambios; mirada de supervisión; bitácora | M1 de punta a punta | 5-7 | 2-3 |
| **F3** Cierre y docente | Estados cerrado/reparado/terminado; tres tipos en la línea de tiempo (el mecanismo es la pieza 0d); bloque «Conversaciones» | Traza docente completa | 3-5 | 1 |
| **F4** Más entrevistas y calidad | M9 (y M8, M5 si se validan); E2E por teclado; auditoría axe; prueba manual con lector de pantalla | Piloto ampliado | 5-8 | 3-5 |
| **Total** (sin Fase 0 compartida) | | | **20-31** | **11-17** |

**Qué se puede entregar primero.** F0 no depende de código: Psicología puede empezar mañana con la matriz de técnicas y la entrevista de M1. El primer entregable con sentido pedagógico es F0 + F1 + F2.

**Dependencias.** Blandas: C (emoción canónica y retratos), E (pistas), plan de julio (tensión del NPC) y el arte del retrato «cerrada» (`closed`), que no existe (hueco de arte en el bloque C): mientras tanto el retrato cae a `neutral` y el cierre se ve solo en el texto. Duras: las respuestas de Psicología a P1-P5, la revisión SME del texto de las entrevistas (pendiente, base común §9.13) y la Fase 0 compartida (0b, 0c y 0d; 0a para el movimiento reducido).

### Interfaz con los otros bloques

| | Lee de | Ofrece | Si el otro bloque no se construye |
|---|---|---|---|
| **C** (diálogo, retratos, interrupciones) | La **emoción canónica** y los **estados de retrato** que defina el bloque C para las líneas de reacción, incluido el retrato «cerrada» (`closed`, sin arte hoy); opcionalmente `resolveLinePresentation` (perfil de ritmo y pausas) | La **banda** de tensión verbal (1-4) por persona, como entrada **opcional** del estilo del texto. C solo presenta; no persiste (R1) | F funciona sobre el panel actual: reacción en texto, sin cambio de retrato ni de estilo; mientras C no decida, se usan las emociones crudas del seed |
| **E** (red social y pistas) | Los vínculos conocidos (pistas halladas) que ofrece E, solo lectura; no lee las marcas del estudiante. Hoy ya existen como evidencia: NPC escuchado, herramienta usada, objeto inspeccionado. Con ellas F puede mostrar respuestas de desescalada que **solo aparecen** si el estudiante halló una pista (p. ej. explicar lo que la comisaría puede hacer tras revisar el expediente, M7); la respuesta bloqueada no aparece, para no delatar que hay una mejor | Nada que E lea (E no usa ni escribe tensión verbal) | F usa la evidencia existente; sin respuestas desbloqueables nuevas |
| **Estado compartido** | `caseMetrics.crisis_emocional` (solo lectura y opcional: por defecto no se usa, P12); `viewedNpcKeys` y evidencia previa | Escribe solo `flags_json["verbalTension"]` y los eventos `VERBAL_TENSION_*` | — |

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

**Otros puntos de choque que quedan.** (1) **Lista de la línea de tiempo:** F es el único bloque que añade tipos a ella (tres de sus cuatro eventos); el mecanismo común es la pieza 0d, que evita conflictos de fusión con los cambios futuros de C o E. (2) **Vocabulario de emociones:** F no inventa nombres (R5). (3) **Pregunta cruzada** sobre mostrar o no el estado de la persona (C-P2 y F-P14, misma redacción en ambos documentos).

---

## 9. Preguntas abiertas para el equipo de Psicología

Cada pregunta indica la opción por defecto si nadie decide. **(bloquea)** = impide empezar.

- **P1 (bloquea). Alternativa.** a) pasivo; b) entrevista por turnos; c) tiempo real. *Por defecto: b, con F1 como primer escalón.* Si se aprueba b, la interacción por turnos en M1 es de F y el bloque C no construye allí su ventana de contención (C-P5).
- **P2 (bloquea). Tono (D1).** a) reencuadre clínico sobrio; b) híbrido solo visual; c) subversión completa. *Por defecto: a.*
- **P3 (bloquea). Tiempo (D2).** a) modo único por turnos sin tiempo; b) por turnos y un modo cronometrado opcional. *Por defecto: a.*
- **P4 (bloquea). Definición.** ¿Aceptan «carga de la conversación» (peso del tema + forma), separada de estrés, crisis emocional y tensión del NPC? ¿Los cuatro niveles («serena», «con carga», «tensa», «la persona se retrae») y no mostrar porcentaje? *Por defecto: sí, con esos rótulos.*
- **P5 (bloquea). Contenido.** ¿Quién escribe y valida los intercambios? ¿Cuáles entran primero? *Por defecto: M1 piloto, M9 segunda; escritura de Psicología, revisión SME.*
- **P6. Matriz de técnicas (2.2).** ¿Validan los efectos? En especial: pregunta abierta en crisis aguda, silencio acompañado y sobreprometer. *Por defecto: la tabla propuesta, con revisión SME.*
- **P7. Consecuencia del cierre (5.4).** a) solo narrativa y reparación; b) además una línea menos; c) además mueve crisis emocional o estrés. *Por defecto: a.*
- **P8. Reparación.** a) dos intentos y luego la persona termina la conversación sin bloqueo; b) un intento; c) obligatoria hasta lograrla. *Por defecto: a.*
- **P9. M5 (comunicar la noticia).** a) elipsis de la noticia (se practica lo que la rodea); b) dramatizarla; c) no incluirla. *Por defecto: a, o c si hay duda; nunca b sin revisión SME.*
- **P10. Devolución.** ¿Se nombra la técnica tras cada respuesta o solo al final de la entrevista? *Por defecto: al final.*
- **P11. Rúbrica.** ¿La reparación es un criterio nuevo o parte de `CONTENCION`? *Por defecto: parte de `CONTENCION`, sin criterio nuevo.*
- **P12. Punto de partida.** ¿Una métrica global (crisis emocional) debe modular a una persona concreta? *Por defecto: no; valor autorado.*
- **P13. ETH-01.** ¿Se añade una frase al aviso previo y se marca como sensible el nodo de C1? *Por defecto: sí a ambas, sujeto a la revisión SME del texto.*
- **P14. Indicador.** ¿Siempre visible o ocultable? ¿Se muestra también a la sobreviviente, o en ella solo la reacción en texto? *Por defecto: ocultable y en ambas personas.*
  **Pregunta cruzada (la misma en C-P2 y F-P14):** C propone quitar las etiquetas de emoción para que el estudiante *observe*; F propone mostrar un indicador de tensión verbal con texto («con carga», «tensa»). ¿Se aplica el mismo criterio a ambos? (a) Se mantienen las dos propuestas (sin etiqueta de emoción; indicador de tensión ocultable). (b) Ambos ocultos por defecto. (c) Ambos visibles. *Por defecto: (a).*
- **P15. Participación.** ¿Se permite omitir la entrevista? ¿La entrevista precede o sustituye el uso de la herramienta PAP? *Por defecto: no omitir (la pausa segura ya existe); la entrevista precede a la herramienta.*

### Preguntas para Ingeniería

- **I1.** ¿Registro en código con texto y deltas, o texto en las tablas de diálogo y solo los deltas en código?
- **I2.** ¿Un solo endpoint de intercambio, idempotente, que escriba por el escritor único con bloqueo (pieza 0c de la Fase 0 compartida)? ¿Cómo se coordina con el escritor único planeado en julio?
- **I3.** ¿Cómo se identifica a la persona (alias `familia-crisis`/`familia-duelo`, `sobreviviente-espera`/`sobreviviente-consulta`) y cómo se persiste un NPC ambiental (M8)?
- **I4.** ¿Se permite enganchar el reintento de `choose_decision` para F1?
- **I5.** ¿Orden de respuestas por semilla de intento? ¿Cómo se prueba que ningún dato enviado antes de elegir delata la mejor?
- **I6.** Pasar `reduceMotion` al panel (pieza 0a) y compartir con C y E el control de pausa segura (pieza 0b) están acordados en la Fase 0 compartida; queda por diseñar el enlace con `safeExit()`.
- **I7.** ¿El plan de julio (tensión del NPC) sigue vigente? Define si F lee su `tension` o la crisis emocional.
- **I8.** ¿Dónde se prueba la completitud del registro (como con las 19 opciones de `OPTION_EFFECTS`) y el recorrido por teclado?
