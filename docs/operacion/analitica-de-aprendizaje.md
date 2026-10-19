# Analítica de aprendizaje: definiciones, umbrales y preguntas abiertas

> **Estado: BORRADOR (Psicología).** Todas las definiciones de este documento son *propuestas del equipo técnico* para poder medir las metas RQ-NEG-001 a 005. **Ninguna cifra es oficial** hasta que Psicología confirme o corrija cada definición (mesa §A20; texto nuevo del servidor VD-23). El sistema entrega el mecanismo y los valores por defecto; no sustituye las decisiones de quien diseña la evaluación.
>
> Este archivo se pliega después en `docs/SIEP.md` §6 (la consolidación de `docs/` está sin integrar en `master`).

La analítica responde, **sola y sin trabajo manual del docente**, a una pregunta: *¿las metas medibles del equipo se están cumpliendo?* Lo hace a partir de lo que el sistema ya guarda al cerrar un intento. No muestra personas: solo **agregados con celda mínima**.

## 1. Qué es y qué no es

| Es | No es |
|---|---|
| Un endpoint de **agregados** (`GET /api/reportes/analiticas`) para docentes y administradores. | Un reporte de un estudiante (para eso están `/api/instructor/**` y `/api/reportes/estudiante/{id}`). |
| Cifras calculadas **solo con intentos COMPLETADOS** (cerrados). | Una nota: el **índice interno 1–4 nunca es una calificación** (RN-09) y nunca llega al estudiante. |
| Un cálculo **reproducible**: los reportes cerrados no se reescriben jamás. | Una evaluación oficial: todo está marcado `BORRADOR`. |
| Limitada a **los estudiantes del docente** (el ADMIN, a todos), con la misma celda mínima. | Un acceso a comentarios, reflexiones o identidades: nada de texto libre ni de ids viaja. |

## 2. De dónde salen los datos

Al **cerrar** un intento (`ATTEMPT_COMPLETED`) el sistema congela, en la misma transacción:

1. **El reporte v2** (`attempt_reports`, `schemaVersion 2`) con claves nuevas: `competencyLevels` (un nivel por competencia de la rúbrica del caso, cada uno con su `basis`: de dónde salió), `profileRules` (la versión de la regla con la que se calculó), `nonRecommendedCount`, `reflectionCoverage` y `keyLearningEvidence`. Se calculan **una vez**, con la rúbrica, el catálogo y los efectos *de ese momento*: si después cambian, el reporte cerrado no cambia.
2. **La evaluación automática del sistema** (`rubric_evaluations.origin = SISTEMA`, sin docente): un nivel por criterio de la rúbrica, derivado del perfil del reporte. Es única por intento y rúbrica. **No cambia nada de lo que el docente o el estudiante ya veían**: el formulario de rúbrica, la traza, el recuento de rúbricas aplicadas y la evaluación del estudiante hablan solo de las evaluaciones del DOCENTE; la traza gana un campo aparte, `systemEvaluation`.
3. **El evento `FEEDBACK_VIEWED`**: lo registra la *primera* lectura del reporte por su dueño (rutas `report`, `completion-report` y `student-report`) de un intento completado. Es la única escritura de un `GET` y por eso es estrecha: solo del dueño, solo completado, una por intento (la garantiza la base) y, si falla, la lectura sigue.
4. **La encuesta breve opcional** (`attempt_feedback`): una calificación de 1 a 5 y un comentario. **Apagada por defecto** (§7). El comentario **nunca** sale de la tabla: ni al reporte, ni a la auditoría, ni a la analítica.

Los intentos anteriores a esta fase (reporte v1 o sin reporte legible) **no se rellenan** con niveles inventados: cuentan en `cohort` y en `evaluated` y en nada más.

## 3. Cómo se calcula el perfil por competencia (BORRADOR)

**Competencias del caso** = las de su rúbrica: los criterios activos, agrupados por la competencia a la que apuntan (o, si no tienen enlace al catálogo, por el código normalizado de su texto). Una competencia sin ninguna decisión que la toque queda **sin nivel** («sin evidencia») y no cuenta como un nivel bajo.

**Nivel de una decisión = su severidad** (la de sus efectos propios o, si no los tiene, la de su clasificación; sin efectos propios, la conducta prohibida es crítica):

| Severidad de la decisión | Nivel formativo | Índice interno |
|---|---|---|
| recomendada (`recommended`; clasificación `ADEQUATE`) | DESTACADO | 4 |
| aceptable (`acceptable`) | LOGRADO | 3 |
| riesgosa (`risky`; clasificación `RISKY`) | EN_PROCESO | 2 |
| crítica (`critical`; clasificación `INADEQUATE` o conducta prohibida) | EN_INICIO | 1 |

**Nivel de una competencia** = el **promedio** de los índices de las decisiones que la tocan, con la mitad hacia arriba, **con un tope `EN_PROCESO`** si la tocó una decisión crítica *por defecto* **o cualquier conducta prohibida** (aunque el autor le fije otra severidad o le declare el nivel): una conducta revictimizante no puede dar «logrado» en la competencia.

**`effects.competencies`** (datos del autor del caso): una opción puede declarar `{CÓDIGO: NIVEL}`; entonces aporta **solo** a esas competencias y **con esos niveles** (los datos del autor mandan sobre la severidad, salvo el tope de la conducta prohibida). Un código que no es de la rúbrica del caso se ignora. El catálogo no se exige al escribir (varía por despliegue).

**`basis`: de dónde salió cada nivel.** Cada entrada de `competencyLevels` dice si su nivel lo **declaró** el autor (`DECLARED`: todas las decisiones que la tocaron declaran `effects.competencies`), se **infirió** de la severidad (`DEFAULT`) o ambas cosas (`MIXED`); sin evidencia, `level` y `basis` son nulos. **Mientras un caso no declare `effects.competencies` todas sus competencias salen con el mismo nivel** (el de la severidad media de las decisiones, también «Reflexión»): el reporte lo dice con `basis: DEFAULT` para que nadie lo lea como una medición por competencia. Un caso publicado no puede ganar esos datos sin una versión nueva (cambia su huella).

**`profileRules`: la versión de la regla.** Cada reporte sella la versión de la regla que convierte decisiones en niveles (`definitions.PROFILE_RULES`, hoy `borrador-1`). Cuando Psicología cambie la tabla, el tope o el promedio, se sube ese valor y la analítica **no mezcla** intentos calculados con reglas distintas (§5).

## 4. Metas → bloque de la respuesta → cómo se mide

La meta es el *Beneficio Esperado* de cada requisito de negocio (`docs/requisitos/negocio/RQ-NEG-00x.md`). **La respuesta entrega la cifra, no el veredicto «se cumplió»**: decidirlo es de Psicología (pregunta 12).

| Meta (Beneficio Esperado) | Bloque de C13 | Cómo se mide (BORRADOR) |
|---|---|---|
| **RQ-NEG-001** · mejora ≥ 15 % pre/post en la rúbrica | `improvement` | Por cada serie *(estudiante, caso)* con ≥ 2 intentos con índice: primer frente al **último** intento. `pre` y `post` = medias del índice (1–4); `deltaPct` = `(post − pre) / 3 × 100`, es decir, **la mejora como porcentaje del recorrido posible** (3 puntos), no sobre el valor inicial. Solo cuenta los intentos calculados con la regla vigente (`profileRules`). |
| **RQ-NEG-002** · ≥ 80 % alcanza «Aceptable» o más en al menos un intento final | `acceptable` | % de estudiantes con **algún** intento cuyas competencias *con nivel* están **todas** en el nivel aceptable (por defecto `LOGRADO`, el `levelThreshold` de la respuesta) o más. Las competencias sin evidencia se ignoran. Solo cuenta los intentos calculados con la regla vigente (`profileRules`). |
| **RQ-NEG-003** · reducción ≥ 20 % de decisiones no recomendadas entre el intento 1 y el 2 | `firstVsSecond` | Por cada serie con ≥ 2 intentos v2: media de `nonRecommendedCount` del **primer** y del **segundo** intento; `nonRecommendedDeltaPct = (segundo − primero) / primero × 100` (negativo = mejora). Se **omite** si el primero no tuvo ninguna (no hay cambio relativo). *No recomendada* = decisión registrada riesgosa, inadecuada o prohibida (los reintentos no se aplicaron: no cuentan). |
| **RQ-NEG-003** · bitácora con reflexión ética en ≥ 90 % de cierres | `reflectionCoverage` | % de intentos cuyo cierre se congeló con reflexión, según la definición vigente (`ANY`: ≥ 1 nota; `PER_DECISION_SCENE`: una nota en cada escena donde hubo una decisión). Los intentos cerrados con **otra** definición no se mezclan. |
| **RQ-NEG-004** · evidencia de aprendizaje clave en ≥ 90 % de intentos | `keyEvidence` | % de intentos **completados, con reflexión y con al menos una competencia con nivel**. Misma población que `reflectionCoverage`. |
| **RQ-NEG-004** · ≥ 85 % de satisfacción (encuesta) | `satisfaction` | % de respuestas con **4 o 5** de 5. **Solo existe con la encuesta encendida** y con respuestas de ≥ `k` estudiantes. |
| **RQ-NEG-005** · ≥ 90 % de intentos evaluados con desglose y comentario accionable | `evaluated` | `systemPct`: intentos con evaluación del sistema **completa** (todos los criterios con nivel). `commentedPct`: intentos con una evaluación del **docente** con comentario (no vacío). Cuenta *todos* los intentos completados, también los v1. |
| **RQ-NEG-005** · mejora ≥ 10 % tras la retroalimentación | `improvementAfterFeedback` | Pares **consecutivos** de intentos con índice *(n, n+1)* de una serie donde el intento *n* tiene `FEEDBACK_VIEWED` **estrictamente antes** de que empiece el *n+1*; `deltaPct` igual que `improvement` sobre esos pares. |
| RQ-NEG-006 (auditoría) · RQ-NEG-007 (`reuse_ratio`) | — | Ya los miden la auditoría (E5-7) y la validación del caso (E4); no son parte de C13. |

El bloque `cohort` dice cuántos estudiantes y cuántos intentos alimentan la respuesta; el bloque `definitions` dice con qué reglas se calculó (`status: BORRADOR`, nivel aceptable, celda mínima `minCell`, definición de reflexión y versión de la regla del perfil).

**Dos criterios distintos, a propósito.** «Decisión no recomendada» se mide por la **clasificación** de la opción (riesgosa, inadecuada o prohibida) y el **nivel** de una competencia, por su **severidad**: una opción riesgosa con severidad `acceptable` cuenta como no recomendada y aporta `LOGRADO`. Es lo que hoy permiten los datos del caso (pregunta 5).

### Reglas de lectura

- **Serie = *(estudiante, caso)***: las versiones de un mismo caso se juntan, ordenadas por el **ordinal** del reporte (n.º de intento del estudiante en el caso). Dos casos distintos de un mismo estudiante son dos series.
- **Primero frente al último** (`improvement`) usa los intentos *con índice* (al menos una competencia con nivel). **Primero frente al segundo** (`firstVsSecond`) usa los dos primeros intentos *con medida* (v2): un reporte v1 se salta.
- **Redondeo:** porcentajes a 1 decimal, índices y medias a 2; **mitad hacia arriba**, con aritmética exacta (3,025 → 3,03, nunca 3,02).
- **Un intento sin reporte legible** entra como «sin dato»: no tumba la consulta.

## 5. Celda mínima y privacidad

- **`k = max(5, MIN_CELL_SIZE)`.** Con menos de `k` estudiantes distintos con intentos completados en el alcance, la respuesta trae **solo** `cohort` (con `suppressed: true`) y `definitions`.
- Con cohorte suficiente, **cada bloque exige además `k` estudiantes distintos entre los que lo alimentan**, o se omite (p. ej. 5 estudiantes pero solo 3 con segundo intento: faltan `improvement` y `firstVsSecond`).
- **El piso 5 vale para todos**, también para el ADMIN y también si la configuración dice menos. Vale además **dentro del propio cálculo** (`analytics.compute`), no solo al leer la configuración: quien lo llame con una celda menor (o cero o negativa) sigue publicando con 5.
- **No se mezclan reglas.** Los bloques que leen niveles (`improvement`, `acceptable`, `improvementAfterFeedback`) cuentan solo los intentos cuyo reporte se selló con la `profileRules` vigente; los que leen la reflexión (`reflectionCoverage`, `keyEvidence`), solo los cerrados con la definición de reflexión vigente. Lo demás (`cohort`, `evaluated`, `firstVsSecond`) cuenta todo.
- **Alcance:** un docente agrega solo a los estudiantes de sus **grupos activos con membresía `ACTIVE`**; con `grupoId`, el grupo debe ser suyo y estar activo (403 si no; 404 si no existe). El ADMIN, a cualquiera. `caseVersionId` desconocido → 404; un id mal escrito → 400 `INVALID_QUERY_PARAM` (no se ignora, para no ampliar el alcance sin avisar).
- **Auditoría:** cada consulta buena escribe **una** fila `analitica.ver` con `{groupId, caseVersionId, suppressed}`; **nunca** ids de estudiantes ni cifras. Una consulta rechazada no audita.
- **Límite conocido:** la celda mínima protege contra la lectura casual de roles que no deberían ver individuos; **no es privacidad diferencial**: un docente que pide un grupo y luego todos sus grupos podría restar para inferir un subgrupo pequeño. Ese docente ya puede ver a sus estudiantes uno por uno en la traza, así que no gana acceso; quien necesite una garantía más fuerte debe pedirla (pregunta 10).

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
  "definitions": {"status": "BORRADOR", "acceptableLevel": "LOGRADO", "minCell": 5, "reflectionDefinition": "ANY", "profileRules": "borrador-1"}
}
```

Esas cifras son las de la **cohorte sintética de 40 intentos** (20 estudiantes × 2) de la prueba `apps/simulation/tests/test_analytics_synthetic_cohort.py`, derivadas a mano en el docstring de la prueba. Si una definición cambia, esa prueba falla a propósito y este documento debe revisarse.

## 9. Límites conocidos

- **Sin datos reales todavía:** no hay cohortes de verdad contra las que contrastar; el relleno de niveles de intentos anteriores se descartó a propósito (R8).
- **«Cohortes comparables»** (RQ-NEG-001) no está modelado: la comparación es la del alcance que el docente elige (grupo, caso o todos), sin control de comparabilidad.
- **«Vio la retroalimentación»** (RQ-NEG-005) se registra cuando el dueño abre el reporte por `report`, `completion-report` o `student-report`. La pantalla final del juego, que recibe el reporte en la respuesta de la última decisión, **no** lo registra: mientras el visual no lea el reporte final por una de esas rutas, `improvementAfterFeedback` solo verá a quien lo reabra desde el historial (sesgo de autoselección).
- **Costo de lectura:** las consultas son constantes (cuatro), pero el reporte congelado se analiza en memoria por fila; con miles de intentos conviene materializar las pocas claves que se leen.
- **Revertir la migración `0026`:** se puede aunque haya evaluaciones del sistema; la reversa **las borra** (son derivadas y no tienen docente) y deja las del docente. **Para llegar a la `0026` hay que revertir antes la `0027`: la tabla de la encuesta y TODAS sus respuestas se pierden** (no se reponen). Tras volver a avanzar, `python manage.py backfill_attempt_reports` repone las evaluaciones del sistema con la rúbrica y los criterios *de ese momento*: si se editaron entre el cierre y el relleno, la evaluación repuesta puede diferir de la original (otros pesos o estado `PENDING`) y `evaluated.systemPct` cambia.
- **Sin pantalla:** E6 no cambia el visual. Los contratos nuevos (C13, C14, el reporte v2 y `effects.competencies`) están en el ledger «estructural → visual».

## 10. Preguntas abiertas para Psicología

Cada una cambia una cifra o una regla; todas tienen hoy una respuesta provisional que está en este documento y en el código (una función o una tabla). La versión para responder, en lenguaje llano y con 2 o 3 opciones por pregunta, es `docs/operacion/analitica-preguntas-para-psicologia.md`:

1. **Nivel de una decisión.** ¿Es correcto traducir la severidad (recomendada, aceptable, riesgosa, crítica) a DESTACADO, LOGRADO, EN_PROCESO y EN_INICIO? ¿Debe ser configurable por caso?
2. **Nivel de una competencia.** ¿El promedio (mitad hacia arriba) es la regla adecuada, o debe pesar más lo último, lo peor o lo más reciente? ¿El **tope `EN_PROCESO`** por una decisión crítica es correcto?
3. **«Aceptable».** ¿Es `LOGRADO`? ¿«Al menos un intento final» significa *cualquier* intento (como hoy) o *el último*?
4. **Mejora pre/post (RQ-NEG-001).** ¿El «≥ 15 %» es sobre el **recorrido posible** (como hoy: `(post − pre) / 3`) o relativo al valor inicial? ¿Qué es una cohorte «comparable»?
5. **Decisiones no recomendadas (RQ-NEG-003).** ¿Cuentan por igual las riesgosas, las inadecuadas y las prohibidas, o hay que ponderarlas?
6. **Reflexión ética (RQ-NEG-003).** ¿Basta con **una nota** (`ANY`) o debe haber una **por escena con decisión** (`PER_DECISION_SCENE`)? ¿Hay criterio de *calidad* del texto, o solo de existencia?
7. **Evidencia de aprendizaje clave (RQ-NEG-004).** Hoy es «completado + reflexión + al menos una competencia con nivel». ¿Qué más debe exigirse?
8. **Encuesta (RQ-NEG-004).** ¿Una sola calificación 1–5 y un comentario son suficientes, o hay preguntas por dimensión? ¿«Satisfecho» es 4 o 5? **Hasta que la apruebe, la encuesta sigue apagada.**
9. **Comentario accionable (RQ-NEG-005).** Hoy es «comentario del docente no vacío». ¿Hace falta una longitud mínima o una estructura?
10. **Mejora tras la retroalimentación (RQ-NEG-005).** ¿Basta con que la persona haya *abierto* el reporte antes del siguiente intento, o debe constar que lo *leyó*? ¿Es suficiente una celda mínima de 5, o debe ser mayor para el ADMIN o los comités?
11. **Competencias fuera del catálogo.** Un autor puede escribir en `effects.competencies` un código que no existe en el catálogo: hoy se ignora sin avisar. ¿Debe avisarse al autor o rechazarse?
12. **Veredicto de metas.** ¿La plataforma debe mostrar «meta cumplida / no cumplida» (≥ 15 %, ≥ 80 %…) o solo la cifra? ¿Quién fija y revisa los umbrales de cada meta?
13. **Texto del servidor.** El comentario de la evaluación automática y los mensajes de error nuevos están marcados `BORRADOR` (VD-23): ¿quién los aprueba?
14. **Versiones de un caso.** Hoy las versiones de un mismo caso forman una sola serie. ¿Debe un cambio de versión *reiniciar* la comparación (el caso pudo cambiar)?
15. **Niveles inferidos.** Mientras un caso no declare `effects.competencies`, todas sus competencias salen con el mismo nivel (`basis: DEFAULT`). ¿Deben contar esos niveles en `acceptable` e `improvement`, o solo los declarados? Hoy cuentan todos.
16. **Cambio de regla.** Al subir `PROFILE_RULES` los intentos ya cerrados salen de los bloques de niveles (lo cerrado no se recalcula). ¿Prefiere Psicología recalcularlos una vez con una migración de datos cuando decida la regla, o empezar de cero bajo la nueva?
