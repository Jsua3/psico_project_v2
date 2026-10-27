# Analítica de aprendizaje: definiciones, umbrales y preguntas abiertas

> **Estado: BORRADOR (Psicología).** Todas las definiciones de este documento son *propuestas del equipo técnico* para poder medir las metas RQ-NEG-001 a 005. **Ninguna cifra es oficial** hasta que Psicología confirme o corrija cada definición (mesa §A20; texto nuevo del servidor VD-23). El sistema entrega el mecanismo y los valores por defecto; no sustituye las decisiones de quien diseña la evaluación.
>
> Este archivo se pliega después en `docs/SIEP.md` §6 (la consolidación de `docs/` está sin integrar en `master`).

La analítica responde, **sola y sin trabajo manual del docente**, a una pregunta: *¿las metas medibles del equipo se están cumpliendo?* Lo hace a partir de lo que el sistema ya guarda al cerrar un intento. No muestra personas: solo **agregados con celda mínima**.

> **Modelo de métricas (2026-10).** El estudiante ya no ve ninguna cifra (ni puntaje, ni índice de estrés, ni porcentaje): el desempeño se cuenta con **cuatro clases de respuesta** (Recomendada, Aceptable, Con riesgo, Contraindicada), **hitos** del caso, el estado de la **persona consultante en palabras** y un **final** por hitos. Qué se implementó y qué se desvió: `docs/investigacion/2026-10-26-metricas-implementacion.md`.

## 1. Qué es y qué no es

| Es | No es |
|---|---|
| Un endpoint de **agregados** (`GET /api/reportes/analiticas`) para docentes y administradores. | Un reporte de un estudiante (para eso están `/api/instructor/**` y `/api/reportes/estudiante/{id}`). |
| Cifras calculadas **solo con intentos COMPLETADOS** (cerrados). | Una nota: el **índice interno 1–4 es solo la escala sobre la que se promedian niveles; nunca es una calificación** (RN-09), no hay puntaje ni índice de estrés, y nada de esto llega al estudiante. |
| Un cálculo **reproducible**: los reportes cerrados no se reescriben jamás. | Una evaluación oficial: todo está marcado `BORRADOR`. |
| Limitada a **los estudiantes del docente** (el ADMIN, a todos), con la misma celda mínima. | Un acceso a comentarios, reflexiones o identidades: nada de texto libre ni de ids viaja. |

## 2. De dónde salen los datos

Al **cerrar** un intento (`ATTEMPT_COMPLETED`) el sistema congela, en la misma transacción:

1. **El reporte v3** (`attempt_reports`, `schemaVersion 3`). No trae una sola cifra de desempeño (sin `finalScore`, `finalStress`, `metrics` ni recomendaciones por estrés) y es la entrada de la analítica y de los reportes docentes:

   | Clave | Qué es | Quién la lee |
   |---|---|---|
   | `counts` | Cuántas respuestas **registradas** hubo de cada clase (`recommended`, `acceptable`, `risky`, `contraindicated`) y los hechos del recorrido (`retries`, `prohibitedRetries`, `toolsUsed`, `reflections`). Los reintentos no se aplicaron: no cuentan como respuestas. Son hechos, no una medida. | Traza y reporte del docente. |
   | `milestones {done[], missing[]}` | Los hitos del caso cumplidos (en el orden en que se cumplieron) y los que faltaron; cada uno `{key, label, decisive}`. `decisive` marca los hitos que deciden el final. | Bloque `milestones` de la analítica, reporte de grupo, traza, cierre del estudiante. |
   | `ending` | `{key, title, message, tone, reason[]}`: la clave del final (`critica`, `protectora`, `riesgo_persistente`, `con_brechas`, o la de un final propio del caso) y su razón en palabras. | Traza y cierre. |
   | `persona` | `{bond, activation, label}` al cerrar, en palabras: vínculo `WITHDRAWN`/`GUARDED`/`OPEN` y activación `CALM`/`TENSE`/`CRISIS`. | Traza (la persona escena por escena) y cierre. |
   | `decisionReview[]` | Por decisión registrada: su clase, su explicación y su fundamento. | Cierre del estudiante. |
   | `competencyLevels[]` | Un nivel por competencia de la rúbrica del caso, con su `basis` y la `evidence[]` que lo sostiene (§3). | Bloques de niveles de la analítica y valoración del sistema. |
   | `profileRules`, `nonRecommendedCount`, `reflectionCoverage`, `keyLearningEvidence` | La versión de la regla con la que se calculó el perfil, las respuestas no recomendadas (Con riesgo o Contraindicada), la reflexión según la definición vigente y la evidencia clave. | Bloques de la analítica. |
   | `reflections`, `timeByScene`, `totalDurationSeconds` | Las notas por escena (sin su texto), los segundos por escena y la duración del intento. | Traza. |

   Se calculan **una vez**, con la rúbrica, el catálogo y las reglas *de ese momento*: si después cambian, el reporte cerrado no cambia. **Los reportes v1 y v2 ya cerrados no se tocan ni se recalculan** y siguen trayendo `finalScore` y `metrics` (inmutables por diseño; la pantalla del estudiante los ignora).
2. **La evaluación automática del sistema** (`rubric_evaluations.origin = SISTEMA`, sin docente): un nivel por criterio de la rúbrica, derivado del perfil del reporte. Es única por intento y rúbrica. **No cambia nada de lo que el docente o el estudiante ya veían**: el formulario de rúbrica, la traza, el recuento de rúbricas aplicadas y la evaluación del estudiante hablan solo de las evaluaciones del DOCENTE; la traza gana un campo aparte, `systemEvaluation`, que **queda plegado hasta que el docente guarda la suya** (así no la copia sin mirar).
3. **El evento `FEEDBACK_VIEWED`**: lo registra la *primera* lectura del reporte por su dueño (rutas `report`, `completion-report` y `student-report`) de un intento completado. Es la única escritura de un `GET` y por eso es estrecha: solo del dueño, solo completado, una por intento (la garantiza la base) y, si falla, la lectura sigue.
4. **La encuesta breve opcional** (`attempt_feedback`): una calificación de 1 a 5 y un comentario. **Apagada por defecto** (§7). El comentario **nunca** sale de la tabla: ni al reporte, ni a la auditoría, ni a la analítica.

Los intentos anteriores al modelo de métricas **no se rellenan** con niveles ni hitos inventados:

- Un reporte v1 (o ilegible) cuenta en `cohort` y en `evaluated` y en nada más.
- Un reporte v2 se selló con la regla de perfil `borrador-1` (nivel por severidad): queda fuera de los bloques de niveles, que solo cuentan la regla vigente (`borrador-2`); sí cuenta en los de reflexión y evidencia clave si su definición coincide, y `firstVsSecond` solo lo empareja con otro v2.
- El bloque `milestones` solo cuenta los reportes v3 (los anteriores no tienen hitos).

## 3. Cómo se calcula el perfil por competencia (BORRADOR, regla `borrador-2`)

**Competencias del caso** = las de su rúbrica: los criterios activos, agrupados por la competencia a la que apuntan (o, si no tienen enlace al catálogo, por el código normalizado de su texto).

**Qué competencias toca una respuesta.** Las declara el autor del caso en `effects.competencies` (una lista de códigos o `{CÓDIGO: NIVEL}`). **Sin declaración, la respuesta no aporta a ninguna competencia**: una competencia que ninguna decisión puso a prueba queda **sin nivel** («sin evidencia») y no cuenta como un nivel bajo. Nunca se le inventa un nivel a una competencia que la persona no puso a prueba (se acabó el nivel «por severidad» aplicado a todas). Un código que no es de la rúbrica del caso se ignora. El catálogo no se exige al escribir (varía por despliegue).

**Nivel que aporta una respuesta** = el nivel que el autor fijó (`{CÓDIGO: NIVEL}`) o, si solo marcó la competencia, el de su **clase**:

| Clase de la respuesta | Nivel formativo | Índice interno |
|---|---|---|
| Recomendada (`RECOMMENDED`) | DESTACADO | 4 |
| Aceptable (`ACCEPTABLE`) | LOGRADO | 3 |
| Con riesgo (`RISKY`) | EN_PROCESO | 2 |
| Contraindicada (`CONTRAINDICATED`) | EN_INICIO | 1 |

**Nivel de una competencia** = el **promedio** de los índices de los aportes, con la mitad hacia arriba, **con un tope `EN_PROCESO`** si alguno viene de una respuesta Contraindicada (aunque el autor le fije otro nivel): una conducta revictimizante no puede dar «logrado» en la competencia.

**`evidence[]`: qué decisiones lo sostienen.** Cada entrada de `competencyLevels` lista las decisiones registradas que la tocaron, en orden: `{order, nodeTitle, optionText, class, level}` (el nivel que cada una aportó, antes del tope). Es lo que el cierre del estudiante muestra bajo cada competencia.

**`basis`: de dónde salió el nivel.** `DECLARED` si alguna decisión que declara la competencia la tocó; nulo si no hubo evidencia (`level` también nulo). Las bases `DEFAULT` y `MIXED` (nivel inferido de la severidad) **ya no se dan**: solo aparecen en reportes v2 cerrados y la clave se conserva para quien los lee. La severidad de una opción también dejó de existir: el modelo es la clase.

**`profileRules`: la versión de la regla.** Cada reporte sella la versión de la regla que convierte decisiones en niveles (`definitions.PROFILE_RULES`, hoy `borrador-2`; los v2 cerrados dicen `borrador-1`). Cuando Psicología cambie la tabla de arriba, el tope o el promedio, se sube ese valor y la analítica **no mezcla** intentos calculados con reglas distintas (§5).

**Aviso de publicación.** Mientras ninguna respuesta del caso declare competencias, el validador de publicación avisa (`competency-without-evidence`) y todas las competencias salen «sin evidencia»; en cuanto alguna respuesta declara competencias, una competencia de la rúbrica sin ninguna respuesta que la toque es un **error** de publicación. SIM-VBG-001 no declara ninguna todavía.

## 4. Metas → bloque de la respuesta → cómo se mide

La meta es el *Beneficio Esperado* de cada requisito de negocio (`docs/requisitos/negocio/RQ-NEG-00x.md`). **La respuesta entrega la cifra, no el veredicto «se cumplió»**: decidirlo es de Psicología (pregunta 12).

| Meta (Beneficio Esperado) | Bloque de C13 | Cómo se mide (BORRADOR) |
|---|---|---|
| **RQ-NEG-001** · mejora ≥ 15 % pre/post en la rúbrica | `improvement` | Por cada serie *(estudiante, caso)* con ≥ 2 intentos con índice: primer frente al **último** intento. `pre` y `post` = medias del índice (1–4); `deltaPct` = `(post − pre) / 3 × 100`, es decir, **la mejora como porcentaje del recorrido posible** (3 puntos), no sobre el valor inicial. Solo cuenta los intentos calculados con la regla vigente (`profileRules`: los v2 cerrados con `borrador-1` quedan fuera). |
| **RQ-NEG-002** · ≥ 80 % alcanza «Aceptable» o más en al menos un intento final | `acceptable` | % de estudiantes con **algún** intento cuyas competencias *con nivel* están **todas** en el nivel aceptable (por defecto `LOGRADO`, el `levelThreshold` de la respuesta) o más. Las competencias sin evidencia se ignoran. Solo cuenta los intentos calculados con la regla vigente (`profileRules`). |
| **RQ-NEG-003** · reducción ≥ 20 % de decisiones no recomendadas entre el intento 1 y el 2 | `firstVsSecond` | Por cada serie, media de `nonRecommendedCount` del **primer** y del **segundo** intento que comparten `schemaVersion` (un v2 y un v3 no se restan: contaban con criterios distintos); `nonRecommendedDeltaPct = (segundo − primero) / primero × 100` (negativo = mejora). Se **omite** si el primero no tuvo ninguna (no hay cambio relativo). *No recomendada* = decisión registrada **Con riesgo o Contraindicada** (la Aceptable no cuenta; los reintentos no se aplicaron: no cuentan). |
| **RQ-NEG-003** · bitácora con reflexión ética en ≥ 90 % de cierres | `reflectionCoverage` | % de intentos cuyo cierre se congeló con reflexión, según la definición vigente (`ANY`: ≥ 1 nota; `PER_DECISION_SCENE`: una nota en cada escena donde hubo una decisión). Los intentos cerrados con **otra** definición no se mezclan. |
| **RQ-NEG-004** · evidencia de aprendizaje clave en ≥ 90 % de intentos | `keyEvidence` | % de intentos **completados, con reflexión y con al menos una competencia con nivel**. Misma población que `reflectionCoverage`. |
| **RQ-NEG-004** · ≥ 85 % de satisfacción (encuesta) | `satisfaction` | % de respuestas con **4 o 5** de 5. **Solo existe con la encuesta encendida** y con respuestas de ≥ `k` estudiantes. |
| **RQ-NEG-005** · ≥ 90 % de intentos evaluados con desglose y comentario accionable | `evaluated` | `systemPct`: intentos con evaluación del sistema **completa** (todos los criterios con nivel). `commentedPct`: intentos con una evaluación del **docente** con comentario (no vacío). Cuenta *todos* los intentos completados, también los v1. |
| **RQ-NEG-005** · mejora ≥ 10 % tras la retroalimentación | `improvementAfterFeedback` | Pares **consecutivos** de intentos con índice *(n, n+1)* de una serie donde el intento *n* tiene `FEEDBACK_VIEWED` **estrictamente antes** de que empiece el *n+1*; `deltaPct` igual que `improvement` sobre esos pares. |
| Modelo de métricas · qué pasos del caso se cumplen | `milestones` | Por cada hito que declara el caso: en qué categoría cae su cobertura entre los intentos completados con reporte v3 y, con 20 estudiantes distintos o más, el porcentaje (`share`). Con menos de 20, solo la categoría `MAYORIA` («la mayoría lo cumplió») o `MENOS_DE_LA_MITAD` y **sin conteos al lado**. Es una lectura del grupo, no de cada persona. Es el mismo cálculo (`analytics.milestone_coverage`) del reporte de grupo del docente. |
| RQ-NEG-006 (auditoría) · RQ-NEG-007 (`reuse_ratio`) | — | Ya los miden la auditoría (E5-7) y la validación del caso (E4); no son parte de C13. |

El bloque `cohort` dice cuántos estudiantes y cuántos intentos alimentan la respuesta; el bloque `definitions` dice con qué reglas se calculó (`status: BORRADOR`, nivel aceptable, celda mínima `minCell`, definición de reflexión y versión de la regla del perfil).

**Un solo criterio: la clase.** «Decisión no recomendada» y el **nivel** que una respuesta aporta salen de la misma **clase** de la opción (§3): ya no hay una clasificación por un lado y una severidad por otro, así que una opción no puede contar como «no recomendada» y aportar `LOGRADO` a la vez (pregunta 5).

### Reglas de lectura

- **Serie = *(estudiante, caso)***: las versiones de un mismo caso se juntan, ordenadas por el **ordinal** del reporte (n.º de intento del estudiante en el caso). Dos casos distintos de un mismo estudiante son dos series.
- **Primero frente al último** (`improvement`) usa los intentos *con índice* (al menos una competencia con nivel). **Primero frente al segundo** (`firstVsSecond`) usa los dos primeros intentos *con medida* (v2): un reporte v1 se salta.
- **Redondeo:** porcentajes a 1 decimal, índices y medias a 2; **mitad hacia arriba**, con aritmética exacta (3,025 → 3,03, nunca 3,02).
- **Un intento sin reporte legible** entra como «sin dato»: no tumba la consulta.

## 5. Celda mínima y privacidad

- **`k = max(5, MIN_CELL_SIZE)`.** Con menos de `k` estudiantes distintos con intentos completados en el alcance, la respuesta trae **solo** `cohort` (con `suppressed: true`) y `definitions`.
- Con cohorte suficiente, **cada bloque exige además `k` estudiantes distintos entre los que lo alimentan**, o se omite (p. ej. 5 estudiantes pero solo 3 con segundo intento: faltan `improvement` y `firstVsSecond`).
- **Cobertura por hito:** además de la celda `k`, con **menos de 20 estudiantes distintos** el porcentaje por hito se colapsa a dos categorías («la mayoría lo cumplió» / «menos de la mitad») y **sin conteos al lado**; solo con 20 o más viaja el porcentaje. Con pocos estudiantes un porcentaje o un conteo identifica a personas.
- **El piso 5 vale para todos**, también para el ADMIN y también si la configuración dice menos. Vale además **dentro del propio cálculo** (`analytics.compute`), no solo al leer la configuración: quien lo llame con una celda menor (o cero o negativa) sigue publicando con 5.
- **No se mezclan reglas.** Los bloques que leen niveles (`improvement`, `acceptable`, `improvementAfterFeedback`) cuentan solo los intentos cuyo reporte se selló con la `profileRules` vigente; los que leen la reflexión (`reflectionCoverage`, `keyEvidence`), solo los cerrados con la definición de reflexión vigente. Lo demás (`cohort`, `evaluated`, `firstVsSecond`) cuenta todo.
- **Alcance:** un docente agrega solo a los estudiantes de sus **grupos activos con membresía `ACTIVE`**; con `grupoId`, el grupo debe ser suyo y estar activo (403 si no; 404 si no existe). El ADMIN, a cualquiera. `caseVersionId` desconocido → 404; un id mal escrito → 400 `INVALID_QUERY_PARAM` (no se ignora, para no ampliar el alcance sin avisar).
- **Auditoría:** cada consulta buena escribe **una** fila `analitica.ver` con `{groupId, caseVersionId, suppressed}`; **nunca** ids de estudiantes ni cifras. Una consulta rechazada no audita.
- **Límite conocido:** la celda mínima protege contra la lectura casual de roles que no deberían ver individuos; **no es privacidad diferencial**: un docente que pide un grupo y luego todos sus grupos podría restar para inferir un subgrupo pequeño. Ese docente ya puede ver a sus estudiantes uno por uno en la traza, así que no gana acceso; quien necesite una garantía más fuerte debe pedirla (pregunta 10).
- **La supresión por hito es cosmética en el reporte del docente.** El reporte de grupo y el CSV traen, por estudiante, los hitos que cumplió (`hitosCumplidos`, columnas Sí/No): el docente que ve a sus estudiantes uno por uno puede reconstruir la cobertura que la celda mínima oculta. La regla protege el agregado frente a quien solo lee el agregado (la analítica C13, que no trae individuos); no es una garantía frente al propio docente (pregunta 10b).

## 6. Umbrales configurables

Las variables de entorno se leen **al arrancar el proceso** (cambiarlas exige reiniciar); `settings` se consulta en cada llamada. Una configuración inválida cae al valor por defecto y **nunca rompe** una consulta. Están listadas en `backend_django/.env.example`.

| Variable de entorno | Efecto | Por defecto |
|---|---|---|
| `SIEP_ACCEPTABLE_LEVEL` | Nivel formativo desde el que un desempeño es «Aceptable» (`EN_INICIO`, `EN_PROCESO`, `LOGRADO`, `DESTACADO`). | `LOGRADO` |
| `SIEP_MIN_CELL_SIZE` | Celda mínima `k`; **nunca baja de 5**. | `5` |
| `SIEP_REFLECTION_DEFINITION` | Qué cuenta como reflexión *al cerrar* un intento: `ANY` o `PER_DECISION_SCENE`. | `ANY` |
| `SIEP_ATTEMPT_FEEDBACK_SURVEY` | Enciende la encuesta (C14) y el bloque `satisfaction`. | apagada |

**Cambiar `SIEP_REFLECTION_DEFINITION` no recalcula lo cerrado.** Los intentos ya congelados con la definición anterior quedan fuera de `reflectionCoverage` y `keyEvidence` (siguen en `cohort`), y esos dos bloques arrancan de cero bajo la definición nueva. Lo mismo pasa con la versión de la regla del perfil (`definitions.PROFILE_RULES`): al subirla, los intentos ya sellados con la anterior salen de `improvement`, `acceptable` e `improvementAfterFeedback`. Cambiar `SIEP_ACCEPTABLE_LEVEL` sí aplica a todo lo cerrado, porque el nivel se compara al consultar.

## 7. La encuesta breve opcional (contrato C14)

- Apagada por defecto: con la bandera apagada, `GET` y `POST /api/simulation/attempts/{id}/feedback` responden **404** como si no existieran.
- Encendida: el **dueño** de un intento **completado** responde `{rating: 1..5, comment?: ≤ 500 caracteres, texto plano}` (201). Una sola vez (409 `FEEDBACK_ALREADY_SENT`); un intento no completado → 409 `ATTEMPT_NOT_COMPLETED`; el de otro estudiante → 404; el docente o el ADMIN → 403. El `GET` devuelve `{submitted: false}` o lo que respondió.
- No pide el token del intento (cerrado, ya no protege nada). El comentario es del estudiante y **no viaja a ningún reporte, auditoría ni agregado**.

## 8. Cómo se consulta

```
GET /api/reportes/analiticas[?grupoId=<id>][&caseVersionId=<id>]
```

Sobre `{success, data}`; `data` (los bloques opcionales faltan si no llegan a la celda mínima):

```json
{
  "cohort": {"students": 20, "attempts": 40, "suppressed": false},
  "improvement": {"students": 20, "series": 20, "pre": 1.85, "post": 3.03, "deltaPct": 39.2},
  "firstVsSecond": {"students": 20, "series": 20, "firstMean": 3.9, "secondMean": 2.7, "nonRecommendedDeltaPct": -30.8},
  "acceptable": {"students": 20, "achieved": 14, "pct": 70.0, "levelThreshold": "LOGRADO"},
  "reflectionCoverage": {"definition": "ANY", "attempts": 40, "covered": 24, "pct": 60.0},
  "keyEvidence": {"attempts": 40, "keyEvidence": 24, "pct": 60.0},
  "evaluated": {"attempts": 40, "systemPct": 80.0, "commentedPct": 50.0},
  "satisfaction": {"responses": 17, "satisfiedPct": 64.7},
  "improvementAfterFeedback": {"students": 13, "pairs": 13, "deltaPct": 42.3},
  "milestones": [
    {"key": "pap_aplicado", "label": "Aplicar primeros auxilios psicológicos", "decisive": false, "share": 85.0, "category": "MAYORIA"},
    {"key": "medidas_proteccion_activadas", "label": "Recomendar medidas de protección", "decisive": true, "share": 35.0, "category": "MENOS_DE_LA_MITAD"}
  ],
  "definitions": {"status": "BORRADOR", "acceptableLevel": "LOGRADO", "minCell": 5, "reflectionDefinition": "ANY", "profileRules": "borrador-2"}
}
```

`milestones` es una lista (una entrada por hito del caso, en su orden); `share` es `null` con menos de 20 estudiantes y `category` es siempre `MAYORIA` o `MENOS_DE_LA_MITAD`. Si la consulta abarca varias versiones del caso, los hitos son los observados y la etiqueta es la clave.

Las cifras de los bloques de niveles, reflexión y evaluación son las de la **cohorte sintética de 40 intentos** (20 estudiantes × 2) de la prueba `apps/simulation/tests/test_analytics_synthetic_cohort.py`, derivadas a mano en el docstring de la prueba (los hitos del ejemplo son ilustrativos). Si una definición cambia, esa prueba falla a propósito y este documento debe revisarse.

## 9. Límites conocidos

- **Sin datos reales todavía:** no hay cohortes de verdad contra las que contrastar; el relleno de niveles de intentos anteriores se descartó a propósito (R8).
- **«Cohortes comparables»** (RQ-NEG-001) no está modelado: la comparación es la del alcance que el docente elige (grupo, caso o todos), sin control de comparabilidad.
- **«Vio la retroalimentación»** (RQ-NEG-005) se registra cuando el dueño abre el reporte por `report`, `completion-report` o `student-report`. La pantalla final del juego, que recibe el reporte en la respuesta de la última decisión, **no** lo registra: mientras el visual no lea el reporte final por una de esas rutas, `improvementAfterFeedback` solo verá a quien lo reabra desde el historial (sesgo de autoselección).
- **Costo de lectura:** las consultas son constantes (cuatro), pero el reporte congelado se analiza en memoria por fila; con miles de intentos conviene materializar las pocas claves que se leen.
- **Revertir la migración `0027`:** se puede aunque haya evaluaciones del sistema; la reversa **las borra** (son derivadas y no tienen docente) y deja las del docente. **Para llegar a la `0027` hay que revertir antes la `0028`: la tabla de la encuesta y TODAS sus respuestas se pierden** (no se reponen). Tras volver a avanzar, `python manage.py backfill_attempt_reports` repone las evaluaciones del sistema con la rúbrica y los criterios *de ese momento*: si se editaron entre el cierre y el relleno, la evaluación repuesta puede diferir de la original (otros pesos o estado `PENDING`) y `evaluated.systemPct` cambia.
- **Bases locales que aplicaron E6 antes de integrarse con el plan 03:** las migraciones se llamaban `0026_system_evaluations` y `0027_attempt_feedback`; ahora son `0027_system_evaluations` y `0028_attempt_feedback`, detrás de `0026_audit_logs_append_only` (seguridad). Una base que ya tenga las dos filas viejas en `django_migrations` falla en `migrate` («constraint … already exists»). E6 no llegó a `master` con los nombres viejos, así que solo afecta a una base local que corrió esta rama. Receta: `python manage.py migrate simulation 0026_audit_logs_append_only`; luego `UPDATE django_migrations SET name = CASE name WHEN '0026_system_evaluations' THEN '0027_system_evaluations' WHEN '0027_attempt_feedback' THEN '0028_attempt_feedback' END WHERE app = 'simulation' AND name IN ('0026_system_evaluations', '0027_attempt_feedback');` y por último `python manage.py migrate`. Las bases desechables (pruebas, e2e) se recrean solas.
- **Sin pantalla para la analítica agregada:** la cobertura por hito del grupo sí tiene pantalla (Reportes del docente), pero el endpoint de agregados (C13) todavía no. Los contratos están en el ledger «estructural → visual».
- **Lo que la analítica todavía no cuenta:** el reporte v3 guarda el final (`ending.key`), la persona al cerrar y las duraciones, pero ningún bloque de C13 los agrega (por ejemplo, el reparto de finales del grupo). Es una decisión de producto, no de código.
- **Reportes v1 y v2:** siguen sirviendo `finalScore` y `metrics` a quien los lee porque lo cerrado es inmutable; el bloque `milestones` y los de niveles no los usan.

## 10. Preguntas abiertas para Psicología

Cada una cambia una cifra o una regla; todas tienen hoy una respuesta provisional que está en este documento y en el código (una función o una tabla). La versión para responder, en lenguaje llano y con 2 o 3 opciones por pregunta, es `docs/operacion/analitica-preguntas-para-psicologia.md`:

1. **Nivel de una decisión.** ¿Es correcto traducir la clase (Recomendada, Aceptable, Con riesgo, Contraindicada) a DESTACADO, LOGRADO, EN_PROCESO y EN_INICIO? ¿Debe ser configurable por caso?
2. **Nivel de una competencia.** ¿El promedio (mitad hacia arriba) es la regla adecuada, o debe pesar más lo último, lo peor o lo más reciente? ¿El **tope `EN_PROCESO`** por una respuesta Contraindicada es correcto?
3. **«Aceptable».** ¿Es `LOGRADO`? ¿«Al menos un intento final» significa *cualquier* intento (como hoy) o *el último*?
4. **Mejora pre/post (RQ-NEG-001).** ¿El «≥ 15 %» es sobre el **recorrido posible** (como hoy: `(post − pre) / 3`) o relativo al valor inicial? ¿Qué es una cohorte «comparable»?
5. **Decisiones no recomendadas (RQ-NEG-003).** ¿Cuentan por igual las Con riesgo y las Contraindicadas, o hay que ponderarlas? (La Aceptable no cuenta.)
6. **Reflexión ética (RQ-NEG-003).** ¿Basta con **una nota** (`ANY`) o debe haber una **por escena con decisión** (`PER_DECISION_SCENE`)? ¿Hay criterio de *calidad* del texto, o solo de existencia?
7. **Evidencia de aprendizaje clave (RQ-NEG-004).** Hoy es «completado + reflexión + al menos una competencia con nivel». ¿Qué más debe exigirse?
8. **Encuesta (RQ-NEG-004).** ¿Una sola calificación 1–5 y un comentario son suficientes, o hay preguntas por dimensión? ¿«Satisfecho» es 4 o 5? **Hasta que la apruebe, la encuesta sigue apagada.**
9. **Comentario accionable (RQ-NEG-005).** Hoy es «comentario del docente no vacío». ¿Hace falta una longitud mínima o una estructura?
10. **Mejora tras la retroalimentación (RQ-NEG-005).** ¿Basta con que la persona haya *abierto* el reporte antes del siguiente intento, o debe constar que lo *leyó*? ¿Es suficiente una celda mínima de 5, o debe ser mayor para el ADMIN o los comités?
11. **Competencias fuera del catálogo.** Un autor puede escribir en `effects.competencies` un código que no existe en el catálogo: hoy se ignora sin avisar. ¿Debe avisarse al autor o rechazarse?
12. **Veredicto de metas.** ¿La plataforma debe mostrar «meta cumplida / no cumplida» (≥ 15 %, ≥ 80 %…) o solo la cifra? ¿Quién fija y revisa los umbrales de cada meta?
13. **Texto del servidor.** El comentario de la evaluación automática y los mensajes de error nuevos están marcados `BORRADOR` (VD-23): ¿quién los aprueba?
14. **Versiones de un caso.** Hoy las versiones de un mismo caso forman una sola serie. ¿Debe un cambio de versión *reiniciar* la comparación (el caso pudo cambiar)?
15. **Competencias sin declarar.** Mientras un caso no declare `effects.competencies`, todas sus competencias salen «sin evidencia» (ya no se infiere un nivel). ¿Basta con un aviso al publicar (hoy), o debe exigirse que cada competencia de la rúbrica tenga al menos una respuesta que la toque?
16. **Cambio de regla.** Al subir `PROFILE_RULES` los intentos ya cerrados salen de los bloques de niveles (lo cerrado no se recalcula; hoy esto deja fuera a todos los v2 de `borrador-1`). ¿Prefiere Psicología recalcularlos una vez con una migración de datos cuando decida la regla, o empezar de cero bajo la nueva?
17. **Etiquetas de los hitos.** Los once hitos de SIM-VBG-001 llevan etiquetas escritas por el equipo técnico y la descripción «A confirmar con Psicología». Las que deciden el final son «Informar sobre derechos», «Recomendar medidas de protección» y «Valorar el riesgo de feminicidio» (los nombres hablan de lo que el psicólogo hace, no de «activar»: Ley 2126 de 2021, arts. 15-16).
18. **Nombres de los finales.** Los cuatro finales de plantilla (`critica`, `protectora`, `riesgo_persistente`, `con_brechas`) y sus textos son borrador: ¿se confirman o se renombran?
19. **Casos sin hitos decisivos.** Con cero hitos decisivos la plantilla de finales aplica la fórmula literal: `critica` solo con dos o más Contraindicadas (una sola cae a `con_brechas`). La especificación decía «solo Protectora o Crítica». ¿Cuál rige?
20. **Segunda oportunidad.** Cinco opciones de SIM-VBG-001 (por ejemplo «solo la Resolución 459» y «Ley 1098 + Ley 1257») eran «riesgosas» en el documento 1.0 y quedaron **Aceptables** por clase: ya no reciben la segunda oportunidad. ¿Deben volver a ser Con riesgo (un cambio de datos del caso)?
21. **`rating` de la encuesta.** La lista blanca de la prueba «ninguna cifra al estudiante» permite `rating` (el eco de la propia calificación del estudiante en la encuesta de cierre). ¿Se mantiene permitido o debe tratarse como una cifra y quitarse?
