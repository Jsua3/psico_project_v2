# Fase 3 — Sintaxis concreta del DSL en JSON

| | |
|---|---|
| **Taller** | Diseño de un DSL para la Gestión de Casos Situacionales del Simulador de Psicología Social |
| **Asignatura** | Ingeniería de Software II |
| **Equipo** | Juan José Sua Gómez y Emerson Ángel Gómez (fases 1, 3 y 4) |
| **Entregable** | 3 — DSL: estructura y sintaxis concreta en JSON |
| **Archivos** | `fase-3-sintaxis-concreta.md` (este documento), `dsl-casos.schema.json` (JSON Schema), `ejemplo-minimo.json` (documento válido) y `verificar-fase-3.py` (comprobación) |
| **Parte de** | `fase-1-modelo-dominio.md`, `modelo-dominio.png` y `modelo-dominio.mmd` (la sintaxis abstracta) |
| **Versión** | 11 de octubre de 2026 |

---

## 0. Qué contiene este documento y dónde está cada cosa

| Lo que pide la Fase 3 del enunciado | Dónde está |
|---|---|
| Información general del caso | §3.1 (`caso`) |
| Escenas | §3.4 (`escenas`) |
| Personajes | §3.2 (`personajes`) |
| Decisiones | §3.5 (`escenas[].decision`) |
| Opciones de decisión | §3.6 (`escenas[].decision.opciones`) |
| Herramientas | §3.3 (`herramientas`) |
| Retroalimentación | §3.7 (`retroalimentacion`) y §5.4 |
| Bitácora o registro de decisiones | §3.11 a §3.14 (`ejecucion.intentos[].bitacora`) y §5.6 |
| Evaluación del desempeño (reto del taller) | §3.8, §3.9, §3.15, §3.16 y §5.7 |
| Estructura propia (el enunciado dice que su ejemplo es solo una referencia) | §1, §2 y §8.1 (diferencias con el ejemplo) |
| Qué valida la sintaxis y qué las reglas OCL | §6 |
| Correspondencia con el simulador real (SIEP) | §7 |

**El DSL en una frase.** Un documento JSON describe un `caso`: sus `personajes` y `herramientas`, un grafo de `escenas` en el que cada una puede presentar una `decision` con dos o más `opciones` y cada opción conduce a otra escena (`siguienteEscena`), la `retroalimentacion` pedagógica que se muestra al terminar y las `rubricas` con que se valora. De forma opcional, `ejecucion` registra lo que hizo un estudiante: su intento, su bitácora (decisiones y reflexiones) y su evaluación.

**Esqueleto del documento.** Los puntos suspensivos marcan lo omitido; el documento completo y válido es `ejemplo-minimo.json`.

```json
{
  "versionDsl": "1.0",
  "caso":              { "id": "CASO-001", "titulo": "...", "descripcion": "...", "version": "1.0.0", "estado": "PUBLICADO", "escenaInicial": "E01", "rubrica": "RUB-01" },
  "personajes":        [ { "id": "P01", "nombre": "...", "rol": "..." } ],
  "herramientas":      [ { "id": "H01", "nombre": "...", "descripcion": "..." } ],
  "escenas":           [ { "id": "E01", "titulo": "...", "descripcion": "...", "decision": { "id": "D01", "pregunta": "...",
                           "opciones": [ { "id": "OP01", "texto": "...", "siguienteEscena": "E02", "clasificacion": "ADECUADA" },
                                         { "id": "OP02", "texto": "...", "siguienteEscena": "E03", "clasificacion": "RIESGOSA" } ] } },
                         { "id": "E02", "titulo": "...", "descripcion": "..." } ],
  "retroalimentacion": [ { "id": "R01", "decision": "D01", "mensaje": "...", "fundamentoTeorico": "..." } ],
  "rubricas":          [ { "id": "RUB-01", "nombre": "...", "version": "1.0", "activa": true, "criterios": [ ... ] } ],
  "ejecucion":         { "estudiantes": [ ... ], "intentos": [ { "...": "...", "bitacora": { "decisiones": [ ... ], "reflexiones": [ ... ] } } ], "evaluaciones": [ ... ] }
}
```

**Convenciones del documento.** Las claves y los valores de enumeraciones van en ASCII, sin tildes ni eñes, igual que en la Fase 1; los textos que escribe el docente llevan ortografía normal. Las rutas de archivo son relativas a la raíz del repositorio de SIEP; `sim/` abrevia `backend_django/apps/simulation/`, `auth/` abrevia `sim/services/authoring/` y `fe/` abrevia `frontend/src/app/features/simulator/`. Una expresión como `escenas[].decision.opciones[].id` se lee «el `id` de cada opción de la decisión de cada escena».

---

## 1. Principios de diseño

| N.º | Principio | Qué significa en el DSL |
|---|---|---|
| 1 | **Sintaxis concreta 1 a 1 con el modelo** | Cada una de las 16 clases de la Fase 1 tiene su objeto JSON (§2.3) y cada una de las 25 relaciones se expresa por anidamiento o por una referencia de identificador (§2.4). No hay conceptos en el JSON que no estén en el modelo, ni al revés. |
| 2 | **Composición anida; asociación referencia** | Lo que no existe sin su todo va dentro (`decision` dentro de `escena`, `opciones` dentro de `decision`). Lo que tiene vida propia o se comparte (personajes, herramientas, escenas destino, rúbricas) va en una colección y se cita por `id`. |
| 3 | **Todo se referencia por identificador** | Nunca por posición (`escenas[1]`) ni por nombre. El identificador es legible y su prefijo dice de qué tipo es (`E01`, `OP01`, `H01`; §4). |
| 4 | **Lo derivado no se escribe** | `/esConclusion` y `/duracionActivaSegundos` se calculan. El esquema rechaza que se escriban, para que el documento no pueda contradecirse. |
| 5 | **Lo opcional se omite** | Un campo opcional se omite; no se escribe vacío ni `null`. Una escena sin `decision` es una conclusión. |
| 6 | **Lenguaje cerrado** | Toda clave desconocida es un error (`additionalProperties: false`). Un error de escritura (`siguienteEscen`) o una nota numérica (`nota`) no pasan inadvertidos. El lenguaje evoluciona cambiando `versionDsl`. |
| 7 | **Dos capas de validación** | El esquema valida la **forma** (tipos, requeridos, enumeraciones, formato de identificadores, cardinalidades que dependen de un solo objeto). Las reglas semánticas validan el **significado** (lo referenciado existe, los identificadores no se repiten, el grafo es acíclico y alcanzable). Ambas informan con el mismo número de regla (§6). |
| 8 | **Definición separada de ejecución** | La definición del caso es válida por sí sola. `ejecucion` es opcional y apunta hacia la definición; la definición nunca apunta hacia ella (como en la Fase 1, §2). |
| 9 | **Hecho para el docente** | Claves en español, pocas y con el nombre del dominio. El orden de las escenas lo da el grafo, no una numeración que haya que mantener. |
| 10 | **Importable a SIEP** | Los nombres y los formatos están pensados para que importar y exportar sea mecánico (§7), sin acomodarse a los vacíos que hoy tiene SIEP. |

---

## 2. Estructura raíz

### 2.1 Claves de la raíz

| Clave | Tipo | Obligatoria | Qué contiene | Clases del modelo |
|---|---|---|---|---|
| `$schema` | texto | No | Dirección del esquema, para que el editor valide mientras se escribe | — |
| `versionDsl` | `"1.0"` | Sí | Versión del lenguaje (no del caso) | — |
| `caso` | objeto | Sí | Atributos del caso, su escena inicial y su rúbrica | `Caso` |
| `personajes` | lista | No | Personajes del caso | `Personaje` |
| `herramientas` | lista | No | Catálogo de herramientas del caso | `Herramienta` |
| `escenas` | lista, al menos 1 | Sí | Escenas, con su decisión y sus opciones anidadas | `Escena`, `Decision`, `OpcionDecision` |
| `retroalimentacion` | lista | No | Retroalimentaciones pedagógicas | `Retroalimentacion` |
| `rubricas` | lista | No | Rúbricas formativas y sus criterios | `Rubrica`, `CriterioRubrica` |
| `ejecucion` | objeto | No | Estudiantes, intentos (con bitácora) y evaluaciones | `Estudiante`, `Intento`, `Bitacora`, `RegistroDecision`, `Reflexion`, `Evaluacion`, `ValoracionCriterio` |

**Por qué las partes del caso están en la raíz y no dentro de `caso`.** Un documento describe una versión de un caso (supuesto S-01 de la Fase 1), así que todo lo que contiene es parte de ese caso; `caso` solo lleva los atributos. Es la misma disposición del ejemplo del enunciado (`caso`, `personajes`, `herramientas`, `escenas`, `retroalimentacion` al mismo nivel).

### 2.2 Anatomía de una decisión

```json
{
  "id": "E01",
  "titulo": "Reunión de equipo",
  "descripcion": "El equipo presenta un conflicto durante una reunión. ...",
  "participantes": ["P01", "P02"],
  "decision": {
    "id": "D01",
    "pregunta": "¿Qué debería hacer el estudiante inicialmente?",
    "pistas": ["Antes de intervenir, pregúntese quiénes están involucrados ..."],
    "opciones": [
      { "id": "OP01", "texto": "Analizar los actores involucrados", "siguienteEscena": "E02",
        "clasificacion": "ADECUADA", "herramienta": "H01", "consecuencia": "Con el mapa de actores a la vista ..." },
      { "id": "OP02", "texto": "Intervenir inmediatamente", "siguienteEscena": "E03",
        "clasificacion": "RIESGOSA", "consecuencia": "La intervención calma la reunión por un momento ..." }
    ]
  }
}
```

### 2.3 Dónde vive cada clase del modelo

| Clase (Fase 1) | Representación en JSON | Cardinalidad en el documento |
|---|---|---|
| `Caso` | objeto `caso` | 1 |
| `Escena` | elemento de `escenas` | 1..* |
| `Personaje` | elemento de `personajes` | 0..* |
| `Decision` | objeto `decision` dentro de una escena | 0..1 por escena |
| `OpcionDecision` | elemento de `decision.opciones` | 2..* por decisión |
| `Herramienta` | elemento de `herramientas` | 0..* |
| `Retroalimentacion` | elemento de `retroalimentacion` | 0..* |
| `Rubrica` | elemento de `rubricas` | 0..* |
| `CriterioRubrica` | elemento de `rubricas[].criterios` | 1..* por rúbrica |
| `Estudiante` | elemento de `ejecucion.estudiantes` | 0..* |
| `Intento` | elemento de `ejecucion.intentos` | 0..* |
| `Bitacora` | objeto `bitacora` dentro de un intento | 1 por intento |
| `RegistroDecision` | elemento de `bitacora.decisiones` | 0..* por bitácora |
| `Reflexion` | elemento de `bitacora.reflexiones` | 0..* por bitácora |
| `Evaluacion` | elemento de `ejecucion.evaluaciones` | 0..* |
| `ValoracionCriterio` | elemento de `evaluaciones[].valoraciones` | 0..* por evaluación |

### 2.4 Cómo se expresa cada relación del modelo

«Anidada» es composición dentro de otro objeto; «lista de raíz» es una colección del documento; «referencia» es un campo con el `id` del destino; «implícita» no se escribe porque el destino es el caso del documento. La última columna dice qué regla comprueba que la referencia exista.

| Relación (Fase 1, §5) | Forma | Campo | Regla de existencia |
|---|---|---|---|
| R-01 `Caso` → `Escena` (composición) | Lista de raíz | `escenas` | — (OCL-01 exige al menos una) |
| R-02 `Caso` → `Escena` inicial | Referencia | `caso.escenaInicial` | INV-09 |
| R-03 `Caso` → `Personaje` (agregación) | Lista de raíz | `personajes` | — |
| R-04 `Caso` → `Herramienta` (agregación) | Lista de raíz | `herramientas` | — |
| R-05 `Caso` → `Rubrica` | Referencia | `caso.rubrica` | integridad referencial |
| R-06 `Escena` → `Personaje` | Referencia (lista) | `escenas[].participantes` | INV-14 |
| R-07 `Escena` → `Decision` (composición) | Anidada | `escenas[].decision` | — |
| R-08 `Decision` → `OpcionDecision` (composición) | Anidada | `decision.opciones` | — (OCL-02 exige al menos dos) |
| R-09 `OpcionDecision` → `Escena` destino | Referencia | `opciones[].siguienteEscena` | OCL-03 |
| R-10 `OpcionDecision` → `Herramienta` | Referencia | `opciones[].herramienta` | OCL-05 |
| R-11 `Retroalimentacion` → `Decision` | Referencia | `retroalimentacion[].decision` | OCL-06 |
| R-12 `Retroalimentacion` → `OpcionDecision` | Referencia | `retroalimentacion[].opcion` | OCL-06 |
| R-13 `Rubrica` → `CriterioRubrica` (composición) | Anidada | `rubricas[].criterios` | — |
| R-14 `Estudiante` → `Intento` | Referencia (rol inverso) | `intentos[].estudiante` | integridad referencial |
| R-15 `Intento` → `Caso` | Implícita | — (el caso del documento) | — |
| R-16 `Intento` → `Escena` actual | Referencia | `intentos[].escenaActual` | integridad referencial |
| R-17 `Intento` → `Bitacora` (composición) | Anidada | `intentos[].bitacora` | — |
| R-18 `Bitacora` → `RegistroDecision` (composición) | Anidada | `bitacora.decisiones` | — |
| R-19 `Bitacora` → `Reflexion` (composición) | Anidada | `bitacora.reflexiones` | — |
| R-20 `RegistroDecision` → `OpcionDecision` | Referencia | `decisiones[].opcionElegida` | INV-18 |
| R-21 `Reflexion` → `Escena` | Referencia | `reflexiones[].escena` | integridad referencial |
| R-22 `Evaluacion` → `Intento` | Referencia | `evaluaciones[].intento` | integridad referencial |
| R-23 `Evaluacion` → `Rubrica` | Referencia | `evaluaciones[].rubrica` | INV-20 |
| R-24 `Evaluacion` → `ValoracionCriterio` (composición) | Anidada | `evaluaciones[].valoraciones` | — |
| R-25 `ValoracionCriterio` → `CriterioRubrica` | Referencia | `valoraciones[].criterio` | INV-20 |

Son 25 relaciones: 7 anidadas, 3 listas de raíz, 1 implícita y 14 referencias. Cada referencia está anotada en el esquema con `x-referencia` (relación, conjunto de destino y regla), de modo que un validador puede comprobarlas todas sin código específico por campo (§6.3).

### 2.5 Nombres del modelo y nombres del JSON

El modelo y el JSON usan los mismos nombres salvo en tres puntos. Quien escriba las reglas OCL navega por los nombres del modelo; quien escriba JSON, por los de la derecha.

| En el modelo y en OCL (Fase 1) | En el JSON | Razón |
|---|---|---|
| rol `escenaDestino` de `OpcionDecision` | `siguienteEscena` | Es la clave del ejemplo del enunciado; dice lo que hace para quien escribe el caso |
| rol `herramientaUsada` de `OpcionDecision` | `herramienta` | Es la clave del ejemplo del enunciado |
| clase `Retroalimentacion` | lista `retroalimentacion` (singular) | Es la clave del ejemplo del enunciado, aunque sea una lista |

---

## 3. Especificación de cada elemento

Convenciones de las tablas. **Tipo**: «texto» es una cadena con al menos un carácter que no sea espacio; «id de X» es una cadena con el formato del §4; «fecha-hora» es ISO 8601 con zona horaria (`2026-10-09T15:00:00-05:00`). **Obligatorio**: «Sí», «No» (con el valor por defecto entre paréntesis si lo tiene) o «Condicional». **Referencia y reglas**: quién referencia al campo, a qué apunta y qué regla lo cubre.

### 3.1 `caso` (clase `Caso`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | cadena `^[A-Z0-9][A-Z0-9-]{1,39}$` | Sí | Identificador único. Por convención `CASO-001` (la forma del código de caso de SIEP) | — |
| `titulo` | texto | Sí | Nombre del caso | OCL-07 |
| `descripcion` | texto | Sí | Contexto de la situación | OCL-07 |
| `tematica` | texto | No | Área temática (`Psicología social`) | — |
| `version` | cadena `mayor.menor.parche` | Sí | Versión del caso (`1.0.0`) | INV-15: una versión publicada no se edita |
| `estado` | `BORRADOR`, `PUBLICADO`, `ARCHIVADO` | Sí | Estado del caso (RF-13) | RN-03: un documento con intentos no puede estar en `BORRADOR` |
| `objetivosAprendizaje` | lista de texto, sin repetir | No (vacía) | Objetivos que el estudiante ve antes de empezar (RF-16) | — |
| `escenaInicial` | id de escena | Sí | Escena por la que empieza el caso | R-02; INV-09: debe estar en `escenas` |
| `rubrica` | id de rúbrica | No | Rúbrica con la que se valora el caso | R-05: debe estar en `rubricas` |

### 3.2 `personajes[]` (clase `Personaje`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de personaje `P01` | Sí | Identificador único | Lo citan `escenas[].participantes` (R-06, INV-14) |
| `nombre` | texto | Sí | Nombre (`Laura`) | — |
| `rol` | texto | Sí | Papel en la situación (`Líder del equipo`) | — |
| `caracteristicas` | texto | No | Rasgos relevantes para el análisis | — |

### 3.3 `herramientas[]` (clase `Herramienta`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de herramienta `H01` | Sí | Identificador único | Lo cita `opciones[].herramienta` (R-10, OCL-05) |
| `nombre` | texto | Sí | Nombre (`Mapa de actores`) | — |
| `descripcion` | texto | Sí | Para qué sirve | — |
| `categoria` | texto | No | Agrupación en texto libre; se recomienda en minúsculas y sin tildes: `crisis`, `comunicacion`, `evaluacion`, `proteccion`, `reflexion`. `global` tiene significado en SIEP: herramienta aplicable sin objetivo | — |

### 3.4 `escenas[]` (clase `Escena`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de escena `E01` | Sí | Identificador único | Lo citan `caso.escenaInicial`, `opciones[].siguienteEscena`, `intentos[].escenaActual` y `reflexiones[].escena` |
| `titulo` | texto | Sí | Nombre breve | — |
| `descripcion` | texto | Sí | Narración de lo que ocurre | — |
| `orden` | entero ≥ 1 | No | Posición para listar y ordenar (RF-06). No define el flujo | — |
| `contenidoSensible` | booleano | No (`false`) | Marca contenido que exige cuidado | — |
| `advertencia` | texto | No | Aviso que se muestra antes de un contenido sensible | — |
| `participantes` | lista de id de personaje, sin repetir | No (vacía) | Personajes que intervienen | R-06; INV-14: cada uno debe estar en `personajes` |
| `decision` | objeto | No | Punto de decisión de la escena. **Su ausencia hace de la escena una conclusión** | R-07; OCL-08: al menos una escena la tiene |

### 3.5 `escenas[].decision` (clase `Decision`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de decisión `D01` | Sí | Identificador único en el documento | Lo cita `retroalimentacion[].decision` (R-11, OCL-06); OCL-04 |
| `pregunta` | texto | Sí | El dilema (`¿Qué debería hacer el estudiante inicialmente?`) | — |
| `pistas` | lista de texto | No (vacía) | Ayudas opcionales que orientan sin revelar la respuesta (RF-11, RF-18) | — |
| `opciones` | lista de objetos, **al menos 2** | Sí | Alternativas de intervención, sin máximo (RN-11) | R-08; OCL-02 |

### 3.6 `escenas[].decision.opciones[]` (clase `OpcionDecision`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de opción `OP01` | Sí | Identificador único en el documento | Lo citan `retroalimentacion[].opcion` (R-12) y `decisiones[].opcionElegida` (R-20, INV-18) |
| `texto` | texto | Sí | La alternativa tal como la ve el estudiante | — |
| `siguienteEscena` | id de escena | Sí | Escena a la que conduce la opción: **la ramificación** | R-09; OCL-03; RN-02 |
| `clasificacion` | `ADECUADA`, `RIESGOSA`, `INADECUADA` | Sí | Valoración pedagógica de la opción | — |
| `conductaProhibida` | booleano | No (`false`) | `true` si vulnera un principio ético de la intervención | INV-12 |
| `motivoProhibicion` | texto | Condicional: sí cuando `conductaProhibida` es `true` | Razón de la prohibición | INV-12 |
| `consecuencia` | texto | No | Efecto narrativo que el estudiante ve al elegir | RN-08, RP-01 |
| `herramienta` | id de herramienta | No | Herramienta que se emplea al elegir la opción | R-10; OCL-05: debe estar en `herramientas` |

### 3.7 `retroalimentacion[]` (clase `Retroalimentacion`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de retroalimentación `R01` | Sí | Identificador único | — |
| `decision` | id de decisión | Condicional: exactamente uno de `decision` y `opcion` | Decisión a la que se asocia | R-11; OCL-06 |
| `opcion` | id de opción | Condicional: exactamente uno de `decision` y `opcion` | Opción a la que se asocia | R-12; OCL-06 |
| `mensaje` | texto | Sí | Por qué la decisión u opción es adecuada o no | RN-08 |
| `fundamentoTeorico` | texto | Sí | Marco, concepto o autor que lo respalda (`Psicología social`) | RF-10 |

### 3.8 `rubricas[]` (clase `Rubrica`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de rúbrica `RUB-01` | Sí | Identificador único | Lo citan `caso.rubrica` (R-05) y `evaluaciones[].rubrica` (R-23) |
| `nombre` | texto | Sí | Nombre de la rúbrica | — |
| `descripcion` | texto | No | Qué evalúa en conjunto | — |
| `version` | cadena `mayor.menor` o `mayor.menor.parche` | Sí | Versión de la rúbrica (`1.0`) | — |
| `activa` | booleano | Sí | Solo una rúbrica activa se puede aplicar | PROP-07: una evaluación con una rúbrica inactiva incumple |
| `criterios` | lista de objetos, al menos 1 | Sí | Criterios que la componen | R-13 |

### 3.9 `rubricas[].criterios[]` (clase `CriterioRubrica`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de criterio `CR01` | Sí | Identificador único | Lo cita `valoraciones[].criterio` (R-25, INV-20) |
| `competencia` | texto | Sí | Competencia que se observa, en texto libre (`ANALISIS_SITUACION`) | — |
| `titulo` | texto | Sí | Nombre del criterio | — |
| `descripcion` | texto | No | Qué se espera ver | — |
| `orden` | entero ≥ 1 | Sí | Posición dentro de la rúbrica | — |

### 3.10 `ejecucion.estudiantes[]` (clase `Estudiante`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de estudiante `EST-01` | Sí | Identificador único | Lo cita `intentos[].estudiante` (R-14, INV-16) |
| `nombre` | texto | Sí | Nombre completo | — |
| `correo` | cadena con forma de correo | Sí | Correo institucional | — |

### 3.11 `ejecucion.intentos[]` (clase `Intento`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de intento `INT-01` | Sí | Identificador único | Lo cita `evaluaciones[].intento` (R-22) |
| `estudiante` | id de estudiante | Sí | Quien realiza el intento | R-14; INV-16: no tiene dos intentos abiertos del caso |
| `estado` | `EN_CURSO`, `PAUSADO`, `COMPLETADO`, `REEMPLAZADO` | Sí | Estado del intento. `COMPLETADO` y `REEMPLAZADO` son terminales | RN-06, RN-07 |
| `iniciadoEn` | fecha-hora | Sí | Momento de inicio | — |
| `finalizadoEn` | fecha-hora | Condicional: sí si el estado es `COMPLETADO` o `REEMPLAZADO`; se omite si no | Momento de cierre. No es anterior a `iniciadoEn`; en un intento `COMPLETADO` coincide con el momento de la decisión que llega a la conclusión, porque en ese instante el intento se cierra y la bitácora se bloquea | PROP-05 |
| `escenaActual` | id de escena | Sí | Escena en que está el intento; allí se reanuda (RF-19) | R-16 |
| `bitacora` | objeto | Sí | Bitácora del intento | R-17; INV-19 |

### 3.12 `intentos[].bitacora` (clase `Bitacora`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de bitácora `BIT-01` | Sí | Identificador único | — |
| `creadaEn` | fecha-hora | Sí | Momento de creación | — |
| `bloqueada` | booleano | Sí | `true` exactamente cuando el intento está `COMPLETADO` o `REEMPLAZADO` | INV-19 |
| `decisiones` | lista de objetos | No (vacía) | Registro de decisiones, en el orden en que ocurrieron | R-18 |
| `reflexiones` | lista de objetos | No (vacía) | Reflexiones del estudiante | R-19; INV-17 |

### 3.13 `bitacora.decisiones[]` (clase `RegistroDecision`)

No tiene identificador: la identifican su bitácora y su `orden`.

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `orden` | entero ≥ 1 | Sí | Posición en el recorrido. No se repite dentro de la bitácora | INV-13 |
| `momento` | fecha-hora | Sí | Cuándo se eligió | — |
| `aplicada` | booleano | No (`true`) | `false` si quedó registrada pero no hizo avanzar el caso (primera respuesta riesgosa o inadecuada de una escena, que el simulador pide reconsiderar) | — |
| `opcionElegida` | id de opción | Sí | Opción que se eligió | R-20; INV-18: debe ser una opción del caso |

### 3.14 `bitacora.reflexiones[]` (clase `Reflexion`)

No tiene identificador: la identifican su bitácora y su `escena`.

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `escena` | id de escena | Sí | Escena a la que se refiere | R-21; INV-17: a lo sumo una reflexión por escena |
| `texto` | texto | Sí | Justificación o análisis del estudiante (RF-20). No puede ser vacío | INV-17 |
| `momento` | fecha-hora | Sí | Cuándo se guardó por última vez. Dentro del intervalo del intento: la bitácora se bloquea al cerrarse | INV-19; PROP-05 |

### 3.15 `ejecucion.evaluaciones[]` (clase `Evaluacion`)

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `id` | id de evaluación `EV-01` | Sí | Identificador único | — |
| `intento` | id de intento | Sí | Intento que se valora | R-22 |
| `rubrica` | id de rúbrica | Sí | Rúbrica que se aplica; debe ser la del caso (un caso sin `caso.rubrica` no tiene cuál aplicar) y estar activa | R-23; INV-20; PROP-07 |
| `origen` | `SISTEMA`, `DOCENTE` | Sí | `SISTEMA`: valoración automática al cerrar el intento (RF-22). `DOCENTE`: valoración del profesor con la rúbrica, que SIEP ya guarda (`sim/services/rubric_service.py:401-461`); RF-25 deja leerla | — |
| `estado` | `PENDIENTE`, `EVALUADA` | Sí | `PENDIENTE` mientras falten criterios por valorar | INV-20 |
| `observacionGeneral` | texto | No | Comentario global sobre el desempeño | — |
| `evaluadaEn` | fecha-hora | Condicional: sí si el estado es `EVALUADA` | Cuándo se completó. Una valoración del `SISTEMA` no es anterior al cierre del intento que valora | PROP-07 |
| `valoraciones` | lista de objetos | Condicional: al menos 1 si el estado es `EVALUADA` | Valoración de cada criterio | R-24; INV-20 |

No existe un campo de nota numérica y el esquema rechaza cualquiera que se agregue: la valoración es formativa y no produce una nota oficial de 0,0 a 5,0 (RN-09).

### 3.16 `evaluaciones[].valoraciones[]` (clase `ValoracionCriterio`)

No tiene identificador: la identifican su evaluación y su `criterio`.

| Campo | Tipo | Obligatorio | Descripción | Referencia y reglas |
|---|---|---|---|---|
| `criterio` | id de criterio | Sí | Criterio valorado | R-25; INV-20: debe ser un criterio de la rúbrica de la evaluación, sin repetirse |
| `nivel` | `EN_INICIO`, `EN_PROCESO`, `LOGRADO`, `DESTACADO` | Sí | Nivel de desempeño cualitativo | — |
| `observacion` | texto | No | Justificación del nivel | — |

---

## 4. Convenciones de identificadores

| Elemento | Prefijo | Formato | Ejemplo | Lo citan |
|---|---|---|---|---|
| Caso | libre en mayúsculas | `^[A-Z0-9][A-Z0-9-]{1,39}$`; por convención `CASO-` + número | `CASO-001` | — |
| Personaje | `P` | `^P[0-9]{2,6}$` | `P01` | `participantes` |
| Herramienta | `H` | `^H[0-9]{2,6}$` | `H01` | `opciones[].herramienta` |
| Escena | `E` | `^E[0-9]{2,6}$` | `E01` | `escenaInicial`, `siguienteEscena`, `escenaActual`, `reflexiones[].escena` |
| Decisión | `D` | `^D[0-9]{2,6}$` | `D01` | `retroalimentacion[].decision` |
| Opción | `OP` | `^OP[0-9]{2,6}$` | `OP01` | `retroalimentacion[].opcion`, `opcionElegida` |
| Retroalimentación | `R` | `^R[0-9]{2,6}$` | `R01` | — |
| Rúbrica | `RUB-` | `^RUB-[0-9]{2,6}$` | `RUB-01` | `caso.rubrica`, `evaluaciones[].rubrica` |
| Criterio | `CR` | `^CR[0-9]{2,6}$` | `CR01` | `valoraciones[].criterio` |
| Estudiante | `EST-` | `^EST-[0-9]{2,6}$` | `EST-01` | `intentos[].estudiante` |
| Intento | `INT-` | `^INT-[0-9]{2,6}$` | `INT-01` | `evaluaciones[].intento` |
| Bitácora | `BIT-` | `^BIT-[0-9]{2,6}$` | `BIT-01` | — |
| Evaluación | `EV-` | `^EV-[0-9]{2,6}$` | `EV-01` | — |

**Reglas.**

1. **El prefijo dice el tipo y el esquema lo exige.** Una referencia con el prefijo equivocado (`siguienteEscena: "H01"`) es un error de forma, detectado antes de buscar nada.
2. **Unicidad.** Dentro de cada colección y, para escenas, decisiones, opciones, personajes y herramientas, dentro del caso (INV-13, OCL-04). JSON Schema no puede exigirla: `uniqueItems` compara objetos completos, no una clave. Es una regla semántica.
3. **Los prefijos no se solapan**: entre los doce tipos con prefijo ningún identificador cumple el formato de dos tipos distintos (`E01` frente a `EST-01`, `R01` frente a `RUB-01`), así que el tipo se reconoce por el identificador solo. El identificador del caso es libre, pero solo aparece en `caso.id`.
4. **Referencia siempre por identificador**, nunca por posición ni por nombre.
5. **Los números no significan orden.** El flujo lo da `siguienteEscena`; el orden de lista lo da `orden`. Se pueden renumerar piezas sin cambiar el flujo siempre que se actualicen las referencias.
6. **Un identificador no se reutiliza entre versiones del mismo caso con otro significado**, para que los intentos guardados sigan apuntando a lo que apuntaban. El esquema no puede comprobarlo (necesita dos versiones).
7. **Sin identificador propio:** `RegistroDecision` (su bitácora y su `orden`), `Reflexion` (su bitácora y su `escena`) y `ValoracionCriterio` (su evaluación y su `criterio`), igual que en el modelo.
8. **Los formatos de esta sección se escriben con `$` al final por legibilidad.** En `dsl-casos.schema.json` terminan en `(?![\s\S])` (el mismo «fin del texto»), porque en Python `$` admite un salto de línea final y `CASO-001⏎` pasaría como válido según el motor. Con `(?![\s\S])` el veredicto no depende del motor de expresiones regulares.

---

## 5. Cómo se expresan los conceptos del dominio

### 5.1 Ramificación

Cada opción de una decisión lleva exactamente a una escena con `siguienteEscena`. Dos opciones pueden ir a escenas distintas (ramas) o a la misma (convergencia). El flujo completo es un grafo dirigido que debe ser acíclico (INV-10) y alcanzable desde `caso.escenaInicial` (INV-11).

```json
"opciones": [
  { "id": "OP01", "texto": "Analizar los actores involucrados", "siguienteEscena": "E02", "clasificacion": "ADECUADA" },
  { "id": "OP02", "texto": "Intervenir inmediatamente",         "siguienteEscena": "E03", "clasificacion": "RIESGOSA" }
]
```

Una decisión puede tener las opciones que la situación necesite (RN-11), siempre al menos dos (OCL-02). El esquema no limita el máximo.

### 5.2 Conclusión

Una conclusión es una escena **sin** `decision`: el recorrido termina allí y el intento pasa a `COMPLETADO`. No hay una clave `conclusion` ni una bandera `terminal` porque la Fase 1 la define como atributo derivado (`/esConclusion`, D-03): escribirla permitiría contradicciones (una escena «final» con opciones, o una escena sin opciones que no se declara final).

```json
{ "id": "E02", "titulo": "Mapa de actores", "descripcion": "... Fin del caso: la intervención se apoya en el análisis." }
```

Dos consecuencias:

- `"decision": null` es un error de forma; la decisión se omite.
- Todo grafo acíclico y finito tiene al menos una escena sin salida, así que **un caso válido siempre tiene al menos una conclusión**. La comprobación `NO_TERMINAL_NODE` que hoy hace SIEP (`sim/services/world_validation.py:69-74`) queda cubierta por INV-10.

### 5.3 Herramienta usada

Las herramientas se definen una sola vez en `herramientas` y una opción las usa con `herramienta`. Es 0..1: una opción usa a lo sumo una herramienta. La herramienta debe estar definida en el caso (OCL-05).

```json
"herramientas": [ { "id": "H01", "nombre": "Mapa de actores", "descripcion": "Herramienta para identificar actores e intereses" } ],
...
{ "id": "OP01", "texto": "Analizar los actores involucrados", "siguienteEscena": "E02", "clasificacion": "ADECUADA", "herramienta": "H01" }
```

### 5.4 Consecuencia inmediata frente a retroalimentación pedagógica con fundamento teórico

La regla de negocio RN-08 separa dos cosas que SIEP hoy mezcla en un solo campo (§7.3, punto 3). El DSL las separa en dos claves distintas.

| | Consecuencia inmediata | Retroalimentación pedagógica |
|---|---|---|
| Clave | `opciones[].consecuencia` | `retroalimentacion[]` |
| Se asocia a | Una opción (a lo sumo una consecuencia) | Una decisión o una opción (exactamente una de las dos) |
| Qué dice | Qué ocurre en la historia | Por qué la decisión u opción es adecuada o no |
| Fundamento teórico | No lleva | `fundamentoTeorico` obligatorio |
| Cuándo la ve el estudiante | Al elegir, para poder continuar la historia | Al terminar el intento (RF-10, RF-23, RP-01) |
| Obligatoria | No | No: una decisión puede no tener ninguna |

```json
{ "id": "OP02", "texto": "Intervenir inmediatamente", "siguienteEscena": "E03", "clasificacion": "RIESGOSA",
  "consecuencia": "La intervención calma la reunión por un momento, pero Carlos se siente señalado." }
...
"retroalimentacion": [
  { "id": "R01", "decision": "D01", "mensaje": "La identificación de los actores permite comprender las diferentes posiciones presentes en el conflicto.", "fundamentoTeorico": "Psicología social" },
  { "id": "R02", "opcion": "OP02",  "mensaje": "Intervenir sin analizar a los actores tiende a reducir el conflicto a un problema entre dos personas.", "fundamentoTeorico": "Psicología social: conflicto en grupos y equipos de trabajo" }
]
```

La retroalimentación de una **decisión** explica la decisión en general (R01); la de una **opción** explica esa opción (R02). Una misma decisión u opción puede tener varias. El DSL no tiene un campo «momento»: cuándo se muestra lo decide el motor (RP-01), no el docente.

### 5.5 Ayudas o pistas

`decision.pistas` es una lista de textos que el estudiante puede consultar mientras resuelve la decisión (RF-11, RF-18). Orientan sin revelar la respuesta. Están en la decisión, no en la opción: ayudan a pensar el dilema, no a elegir una alternativa.

```json
"pistas": [
  "Antes de intervenir, pregúntese quiénes están involucrados y qué interés tiene cada uno.",
  "¿Qué sabe usted de la carga de trabajo de cada persona?"
]
```

SIEP no tiene hoy una pista por decisión: el campo más parecido de un nodo, `support_resources_json`, es el «Apoyo profesional» de la interfaz (recursos de bienestar), no una ayuda para razonar la decisión. Un importador no debe volcar `pistas` ahí (§7.1 y §7.3, punto 6).

### 5.6 Bitácora o registro de decisiones

La bitácora es del intento (`ejecucion.intentos[].bitacora`) y tiene dos partes con ciclo de vida distinto (D-10 de la Fase 1): `decisiones`, que escribe el sistema y no se edita, y `reflexiones`, que escribe el estudiante mientras el intento esté en juego.

```json
"bitacora": {
  "id": "BIT-01",
  "creadaEn": "2026-10-09T15:00:00-05:00",
  "bloqueada": true,
  "decisiones": [
    { "orden": 1, "momento": "2026-10-09T15:02:10-05:00", "aplicada": false, "opcionElegida": "OP02" },
    { "orden": 2, "momento": "2026-10-09T15:04:40-05:00", "aplicada": true,  "opcionElegida": "OP01" }
  ],
  "reflexiones": [
    { "escena": "E01", "texto": "Voy a analizar a los actores primero porque ...", "momento": "2026-10-09T15:04:10-05:00" }
  ]
}
```

El primer registro muestra una decisión **no aplicada**: la primera respuesta riesgosa o inadecuada de una escena queda registrada pero no hace avanzar el caso, y el simulador pide reconsiderar. La bitácora queda `bloqueada` cuando el intento termina o es reemplazado (INV-19) y desde entonces no admite cambios: por eso ninguna reflexión es posterior a `finalizadoEn`, que en un intento `COMPLETADO` coincide con el momento de la decisión que llega a la conclusión (aquí, el segundo registro).

### 5.7 Evaluación formativa

Se separa lo que se define (la rúbrica) de lo que se mide (la evaluación de un intento).

- **Definición.** `rubricas[]` con sus `criterios[]`; el caso elige una con `caso.rubrica`.
- **Medición.** `ejecucion.evaluaciones[]`: cada una valora un intento con una rúbrica y trae una `valoraciones[]` con un `nivel` cualitativo por criterio.

```json
{ "id": "EV-01", "intento": "INT-01", "rubrica": "RUB-01", "origen": "SISTEMA", "estado": "EVALUADA",
  "evaluadaEn": "2026-10-09T15:04:41-05:00",
  "valoraciones": [
    { "criterio": "CR01", "nivel": "LOGRADO",    "observacion": "Eligió analizar a los actores antes de intervenir." },
    { "criterio": "CR02", "nivel": "EN_PROCESO", "observacion": "Su reflexión no dice qué intervención seguiría después del análisis." }
  ] }
```

No hay nota: los niveles son `EN_INICIO`, `EN_PROCESO`, `LOGRADO` y `DESTACADO` (RN-09). Una evaluación `EVALUADA` cubre todos los criterios de su rúbrica (INV-20).

### 5.8 Conducta prohibida

Una opción que vulnera un principio ético de la intervención se marca y documenta su motivo; el motivo es obligatorio (INV-12).

```json
{ "id": "OP05", "texto": "Confrontar a Carlos delante del equipo", "siguienteEscena": "E03",
  "clasificacion": "INADECUADA", "conductaProhibida": true,
  "motivoProhibicion": "Expone a una persona ante sus pares y aumenta el riesgo de estigmatización." }
```

### 5.9 Versión y estado del caso

`caso.version` identifica la versión y `caso.estado` su ciclo: `BORRADOR` → `PUBLICADO` → `ARCHIVADO`. Solo un caso `PUBLICADO` se ejecuta (RN-03) y solo se publica si pasa las dos capas de validación (RN-05). Un documento con `ejecucion.intentos` no puede estar en `BORRADOR`; el esquema lo exige.

---

## 6. Qué garantiza la sintaxis y qué las reglas semánticas

### 6.1 El criterio de reparto

> Si para decidir basta con mirar **el objeto que se está validando**, es del esquema. Si hace falta mirar **otra parte del documento** (o el grafo completo), es una regla semántica.

Por eso `minItems`, `required`, `enum`, `pattern`, `if/then` entre campos de un mismo objeto y `contains` son del esquema; «existe», «no se repite», «no hay ciclos» y «se alcanza desde la inicial» son semánticas.

### 6.2 Reparto de las reglas

«Esquema» indica el mecanismo de JSON Schema que la hace cumplir; «Semántica» indica lo que queda para el validador de reglas (OCL, Fase 2). Las reglas OCL-01 a OCL-08 son las ocho del enunciado, en su orden; INV-09 a INV-20 son las de la Fase 1 (§6.1) y RN-03 y RN-09 son de la línea base.

| Regla | Qué exige | Capa | Cómo |
|---|---|---|---|
| OCL-01 (INV-01) | Un caso tiene al menos una escena | **Esquema** | `escenas` con `minItems: 1` |
| OCL-02 (INV-02) | Una decisión tiene al menos dos opciones | **Esquema** | `opciones` con `minItems: 2` |
| OCL-03 (INV-03) | Una opción referencia una escena existente | Esquema + **semántica** | Esquema: `siguienteEscena` obligatoria y con forma `E01`. Semántica: está en `escenas[].id` |
| OCL-04 (INV-04) | Los identificadores de decisión no se repiten | **Semántica** | Unicidad de clave; una escena tiene a lo sumo una decisión por estructura |
| OCL-05 (INV-05) | La herramienta usada está definida en el caso | Esquema + **semántica** | Esquema: forma `H01`. Semántica: está en `herramientas[].id` |
| OCL-06 (INV-06) | Una retroalimentación está asociada a una decisión u opción | **Esquema** + semántica | Esquema: `oneOf` exactamente uno de `decision` y `opcion`. Semántica: el destino existe |
| OCL-07 (INV-07) | Un caso tiene título y descripción | **Esquema** | `required` y texto no vacío |
| OCL-08 (INV-08) | Un caso tiene al menos un punto de decisión | **Esquema** | `contains` una escena con `decision` |
| INV-09 | Una escena inicial, y es de las del caso | Esquema + **semántica** | `caso.escenaInicial` obligatoria; está en `escenas[].id` |
| INV-10 | El flujo es acíclico | **Semántica** | Recorrido del grafo |
| INV-11 | Toda escena es alcanzable desde la inicial | **Semántica** | Recorrido del grafo |
| INV-12 | Conducta prohibida documenta su motivo | **Esquema** | `if conductaProhibida = true then required motivoProhibicion` |
| INV-13 | Los identificadores no se repiten | **Semántica** | Unicidad de clave por colección |
| INV-14 | Los participantes de una escena son del caso | Esquema + **semántica** | Esquema: forma `P01` y sin repetir. Semántica: están en `personajes[].id` |
| INV-15 | Un caso publicado cumple todo y no se edita | **Semántica** y proceso | Pasa las dos capas; la inmutabilidad exige comparar versiones, fuera del documento |
| INV-16 | Un estudiante no tiene dos intentos abiertos del caso | **Semántica** | Conteo entre intentos |
| INV-17 | A lo sumo una reflexión por escena, no vacía | Esquema + **semántica** | Esquema: texto no vacío. Semántica: unicidad por escena |
| INV-18 | Un registro corresponde a una opción del caso | **Semántica** | `opcionElegida` está en `opciones[].id` |
| INV-19 | Bitácora bloqueada exactamente cuando el intento terminó o fue reemplazado | **Esquema** | `if estado en COMPLETADO, REEMPLAZADO then bloqueada = true else false` |
| INV-20 | Se valoran criterios de la rúbrica; `EVALUADA` los cubre; sin nota numérica | Esquema + **semántica** | Esquema: sin campo de nota, `EVALUADA` exige fecha y valoraciones. Semántica: criterios de la rúbrica, cobertura completa |
| RN-03 | Solo un caso publicado se ejecuta | **Esquema** | `if hay intentos then caso.estado en PUBLICADO, ARCHIVADO` |
| RN-09 | Valoración formativa, sin nota oficial | **Esquema** | No existe el campo y las claves desconocidas se rechazan |

**Resumen.** De las 22 reglas, 8 las hace cumplir solo el esquema, 7 se reparten entre esquema y semántica y 7 son solo semánticas. De las ocho del enunciado, siete tienen al menos una parte en el esquema; la excepción es OCL-04, que es de unicidad de clave y JSON Schema no la expresa. INV-10 e INV-11 miran el grafo completo y tampoco tienen forma en el esquema.

### 6.3 Dos capas, sin cortocircuito

```
documento.json ──► capa 1: esquema    ──► errores de forma      (regla + ruta)
               └─► capa 2: semántica  ──► errores de significado (regla + ruta)
                                           └─► informe único; si hay errores, no se publica (RN-05)
```

- **Las dos capas se ejecutan siempre**, aunque la primera falle. Un documento con una decisión de una sola opción y una herramienta no definida informa OCL-02 (capa 1) y OCL-05 (capa 2) en la misma pasada.
- **El número de regla viaja con el error.** El esquema lleva `x-regla` en cada punto donde hace cumplir una regla; el validador lo lee del error. Una referencia que no existe se informa con la regla de su `x-referencia`; las que no tienen regla numerada (R-05, R-14, R-16, R-21 y R-22) se informan como `RI`, integridad referencial.
- **La capa semántica no necesita código por campo.** Recorre el documento junto al esquema, toma cada campo con `x-referencia` y comprueba que su valor esté en el conjunto de destino. Las demás comprobaciones (unicidad, ciclos, alcanzabilidad, un intento abierto por estudiante, cobertura de criterios) son propias de cada regla.

`verificar-fase-3.py` implementa las dos capas y las ejercita con 32 alteraciones del ejemplo (§10).

### 6.4 Los tres errores del enunciado, vistos desde las capas

Ilustración de cómo se reparten; el análisis del escenario con errores completo es de la Fase 4.

| Error | Regla | Capa | Cómo se detecta |
|---|---|---|---|
| Decisión con una sola opción | OCL-02 | Esquema | `escenas/0/decision/opciones` tiene 1 elemento y se exige `minItems: 2` |
| Herramienta no definida previamente | OCL-05 | Semántica | `herramienta: "H99"` tiene forma válida, pero `H99` no está en `herramientas[].id` |
| Opción hacia una escena inexistente | OCL-03 | Semántica | `siguienteEscena: "E09"` tiene forma válida, pero `E09` no está en `escenas[].id` |

**Efectos en cadena.** Un error rara vez viene solo. Al quitar la segunda opción de `D01`, la retroalimentación `R02` (que citaba esa opción) queda colgada (OCL-06) y la escena a la que llevaba (`E03`) deja de ser alcanzable (INV-11). Al apuntar `OP02` a una escena inexistente, `E03` también queda inalcanzable. Quien construya un escenario con errores debe esperar estas reglas adicionales o evitarlas a propósito.

### 6.5 Lo que ninguna capa garantiza

- **La calidad pedagógica**: que la clasificación de una opción sea la correcta, que el fundamento teórico sea pertinente o que la retroalimentación explique bien.
- **Que toda decisión tenga retroalimentación.** El modelo no lo exige. Si el equipo lo quiere, es una regla nueva (por ejemplo: «toda decisión de un caso publicado tiene al menos una retroalimentación asociada a ella o a una de sus opciones»).
- **La inmutabilidad de una versión publicada (INV-15)**: es una propiedad entre dos versiones, no de un documento.
- **Que dos documentos distintos no contradigan al mismo caso**: un documento es una versión y no ve a los demás.

---

## 7. Correspondencia DSL → SIEP

SIEP no tiene hoy un DSL, ni un JSON Schema, ni importación o exportación de casos: los casos se definen con el editor de administración y con un comando de siembra en Python (`sim/management/commands/seed_caso_pdf.py`). Esta sección dice dónde caería cada clave del DSL en SIEP y qué no tiene lugar. Es la base de un importador y un exportador.

### 7.1 Definición del caso

«Editor» es el campo de la interfaz de autoría (`fe/` es `frontend/src/app/features/simulator/`); «BD» es el modelo Django (`managed=False`) y su campo. «Cobertura»: **Directa**, **Parcial** o **No existe**.

| Clave del DSL | Editor (archivo:línea) | BD y archivo:línea | Cobertura |
|---|---|---|---|
| `caso.id` | «Código opcional» (`fe/case-authoring-hub.component.ts:46-49`) | `SimulationCase.code` (`sim/models/case.py:24`); se normaliza a mayúsculas y guiones, 40 caracteres (`auth/cases.py:91-93`); si falta se genera del título (`auth/cases.py:45-46`) | Directa |
| `caso.titulo` | «Titulo del caso *» (`fe/case-authoring-hub.component.ts:42-45`) | `SimulationCase.title` (`sim/models/case.py:25`); obligatorio al crear (`auth/cases.py:36-38`) | Directa |
| `caso.descripcion` | «Descripcion», sin asterisco (`fe/case-authoring-hub.component.ts:50-53`) | `SimulationCase.description` (`sim/models/case.py:26`) y `CaseVersion.narrative_context` (`sim/models/case.py:52`), copiada al crear (`auth/cases.py:55-61`) | Parcial: SIEP la admite vacía; OCL-07 la exige |
| `caso.tematica` | — | — | No existe |
| `caso.version` | No editable: nace `0.1.0` y cada clon sube el menor | `CaseVersion.semantic_version` (`sim/models/case.py:48`; `auth/cases.py:55-58`; `auth/publication.py:197`) | Parcial: SIEP la gestiona, no se escribe a mano |
| `caso.estado` | Botones de publicar y clonar | `CaseVersion.status` (`sim/models/case.py:10-14,49-51`); `BORRADOR`↔`DRAFT`, `PUBLICADO`↔`PUBLISHED`, `ARCHIVADO`↔`ARCHIVED`. Desde la API solo se asigna `DRAFT`→`PUBLISHED` (`auth/publication.py:82-84`); `IN_REVIEW` no tiene equivalente | Parcial: no hay forma de archivar |
| `caso.objetivosAprendizaje` | — | — | No existe |
| `caso.escenaInicial` | Casilla «Nodo inicial» (`fe/case-editor.component.ts:304`) | `SimulationNode.start_node` (`sim/models/case.py:86`); exactamente uno (`sim/services/world_validation.py:57-67`) | Directa, como bandera del nodo y no como referencia del caso |
| `caso.rubrica` | Asignar rúbrica a la versión (`frontend/src/app/features/admin/rubrics.component.ts:380`) | `SimulationRubricAssignment` (`sim/models/rubric.py:88-103`) por `sim/services/rubric_service.py:278-294`; o `Rubric.case_version` (`sim/models/rubric.py:10-13`) | Parcial: SIEP resuelve la rúbrica en cadena (asignación activa, rúbrica de la versión y, si no hay, la predeterminada `is_default`, o falla con «No existe rubrica activa»; `sim/services/rubric_service.py:297-311`). Un caso sin `caso.rubrica` en el DSL no significa «sin rúbrica» en SIEP. La asignación no pasa al clonar una versión (solo se clonan las rúbricas con `case_version`; `auth/publication.py:181-185`): el importador debe asignarla de nuevo |
| `personajes[].id` | «Clave del objeto *» del objeto tipo Persona (`fe/case-editor.component.ts:452`) | `MapObject.object_key` con `object_type='PERSON'` (`sim/models/world.py:36,38`) | Parcial: el personaje es un objeto de una sala; en dos salas son dos objetos |
| `personajes[].nombre` | «Etiqueta *» (`fe/case-editor.component.ts:453`) | `MapObject.label` (`sim/models/world.py:37`) y `DialogueTree.speaker_name` (`sim/models/world.py:92`) | Parcial |
| `personajes[].rol`, `.caracteristicas` | — | — | No existe |
| `escenas[].participantes` | Objetos de tipo Persona dentro de la sala de la escena | `MapObject` del `SceneMap` del nodo (`sim/models/world.py:11-29,32-65`) | Parcial: no es una lista, es la presencia de un objeto en la sala |
| `herramientas[].id` | «Código *» (`fe/case-editor.component.ts:510`) | `ClinicalTool.tool_code` (`sim/models/world.py:142`; `auth/tools.py:37`), máximo 50 caracteres | Directa |
| `herramientas[].nombre` | «Etiqueta *» (`fe/case-editor.component.ts:511`) | `ClinicalTool.label` (`sim/models/world.py:143`) | Directa |
| `herramientas[].descripcion` | «Descripción *» (`fe/case-editor.component.ts:514`) | `ClinicalTool.description` (`sim/models/world.py:146`) | Directa |
| `herramientas[].categoria` | «Categoría» (`fe/case-editor.component.ts:512`) | `ClinicalTool.category` (`sim/models/world.py:145`); por defecto `clinical` (`auth/tools.py:39`). El valor `global` tiene significado: la herramienta es pertinente sin objetivo solo si su categoría es `global` (`sim/services/world_service.py:501-509`); el caso sembrado usa códigos sin tildes (`sim/management/commands/seed_caso_pdf.py:1082-1093`) | Directa; el exportador debe escribir minúsculas y sin tildes para que el valor viaje intacto |
| `escenas[].id` | «Clave del nodo *» (`fe/case-editor.component.ts:287-290`) | `SimulationNode.node_key` (`sim/models/case.py:78`) | Directa; SIEP admite claves libres (`inicio`) y el DSL exige `E01` |
| `escenas[].titulo` | «Título *» (`fe/case-editor.component.ts:291-294`) | `SimulationNode.title` (`sim/models/case.py:79`) | Directa |
| `escenas[].descripcion` | «Narrativa *» (`fe/case-editor.component.ts:295-298`) | `SimulationNode.narrative` (`sim/models/case.py:80`) | Directa |
| `escenas[].orden` | — | — (SIEP lista por `id`: `auth/editor_view.py:23`; `position_x/y` son del lienzo: `sim/models/case.py:88-89`) | No existe |
| `escenas[].contenidoSensible` | «Contenido sensible» (`fe/case-editor.component.ts:306`) | `SimulationNode.sensitive_content` (`sim/models/case.py:83`) | Directa, pero solo viaja al cliente (`sim/serializers/game_dtos.py:72`) |
| `escenas[].advertencia` | «Mensaje de advertencia» (`fe/case-editor.component.ts:299-302`) | `SimulationNode.warning_message` (`sim/models/case.py:85`) | Directa, pero solo viaja al cliente (`sim/serializers/game_dtos.py:74`) |
| escena sin `decision` (conclusión) | «Nodo terminal» (`fe/case-editor.component.ts:305`) | `SimulationNode.terminal_node` (`sim/models/case.py:87`) | Parcial: bandera manual, independiente de si hay opciones |
| `decision.id` | — | No hay entidad: la decisión es el conjunto de `DecisionOption` con el mismo `source_node` (`sim/serializers/game_dtos.py:57-64`) | No existe |
| `decision.pregunta` | El texto va en las líneas del diálogo del objeto que presenta las opciones (`DialogueLine`) | No hay campo de pregunta. El enunciado del dilema es una línea de diálogo, por ejemplo «Define el foco inmediato de tu intervención» (`sim/management/commands/seed_caso_pdf.py:753`), y el hablante es el personaje (`DialogueTree.speaker_name`, `sim/models/world.py:92`) | Parcial: el exportador debe derivarla de ese diálogo y el importador escribirla ahí |
| `decision.pistas` | El editor no las ofrece y al guardar un nodo envía `supportResources: []` (`fe/case-editor.component.ts:914`) | No existen. `SimulationNode.support_resources_json` (`sim/models/case.py:81`) es del nodo y la interfaz lo rotula «Apoyo profesional», mezclado con los recursos de salida segura (`sim/serializers/game_dtos.py:16-20,70,364`; `fe/journal-panel.component.ts:82-89`; `fe/attempt-outcome.component.ts:50-56`; `fe/simulation-play.component.ts:2490-2497`); el caso sembrado lo deja en `[]` (`sim/management/commands/seed_caso_pdf.py:1186`) | No existe (aproximación con un campo de otro propósito). Lo más cercano a una pista para decidir son los objetos `RESOURCE` («Información de apoyo para tomar la decisión», `fe/authoring-catalog.config.ts:109-120`) y el diálogo del personaje. El importador no debe volcar pistas en `support_resources_json` salvo decisión del equipo |
| `opciones[].id` | Sin campo en el formulario; si falta, SIEP genera `origen->destino-<marca de tiempo>` (`auth/graph.py:93-96`) | `DecisionOption.option_key` (`sim/models/case.py:103`) | Directa |
| `opciones[].texto` | «Texto de la decisión *» (`fe/case-editor.component.ts:349-352`) | `DecisionOption.text` (`sim/models/case.py:111`) | Directa |
| `opciones[].siguienteEscena` | «Nodo destino *» (`fe/case-editor.component.ts:341-348`) | `DecisionOption.target_node` (`sim/models/case.py:107-110`); SIEP no comprueba que el destino sea de la misma versión (`auth/graph.py:87-92`) | Directa |
| `opciones[].clasificacion` | «Clasificación *» (`fe/case-editor.component.ts:353-360`) | `DecisionOption.classification` (`sim/models/case.py:112`; `auth/graph.py:14`); `ADECUADA`↔`ADEQUATE`, `RIESGOSA`↔`RISKY`, `INADECUADA`↔`INADEQUATE` | Directa |
| `opciones[].conductaProhibida` | «Conducta prohibida» (`fe/case-editor.component.ts:375-378`) | `DecisionOption.prohibited_conduct` (`sim/models/case.py:117`) | Directa |
| `opciones[].motivoProhibicion` | «Razón de prohibición *» (`fe/case-editor.component.ts:380-383`) | `DecisionOption.prohibition_reason` (`sim/models/case.py:118`); exigido por `PROHIBITED_WITHOUT_REASON` (`sim/services/world_validation.py:144-152`) | Directa |
| `opciones[].consecuencia` | «Feedback inmediato» (`fe/case-editor.component.ts:371-374`) | `DecisionOption.immediate_feedback` (`sim/models/case.py:116`) | Parcial: el mismo campo hace de retroalimentación. **Regla de exportación:** `immediate_feedback` = `consecuencia` (RN-08: se muestra en el momento). **Importación:** `immediate_feedback` pasa a `consecuencia` y no se genera retroalimentación |
| `opciones[].herramienta` | «Herramienta vinculada», en un objeto del mapa (`fe/case-editor.component.ts:485-493`) | La opción no tiene columna de herramienta. El vínculo existe en `MapObject.tool_code` + `decision_option` (`sim/models/world.py:50-54`) y en `DialogueChoice.required_tool_code` + `decision_option` (`sim/models/world.py:123-127`; `auth/scenes.py:190-199`) | Parcial |
| `retroalimentacion[]` de una opción: `mensaje` | «Feedback inmediato» (`fe/case-editor.component.ts:371-374`) | `DecisionOption.immediate_feedback` (`sim/models/case.py:116`); se muestra al decidir (`sim/services/game_service.py:393,421`; `sim/services/decision_effects.py:72-80`) | Parcial: SIEP la muestra en el acto, no al terminar; la respuesta de la decisión trae además la clasificación, los deltas y un veredicto por prefijo (`sim/serializers/game_dtos.py:80-95`). La retroalimentación pedagógica (`mensaje` + `fundamentoTeorico`) no tiene destino: concatenarla en `immediate_feedback` la mostraría al decidir e incumpliría RN-08, así que solo se hace por decisión del equipo |
| `retroalimentacion[]` de una decisión | — | — | No existe |
| `retroalimentacion[].fundamentoTeorico` | — (hoy va dentro del texto: `sim/management/commands/seed_caso_pdf.py:248-251`) | — | No existe como campo |
| `rubricas[]`: `nombre`, `descripcion`, `version`, `activa` | Pantalla de rúbricas (`frontend/src/app/features/admin/rubrics.component.ts`) | `Rubric.name`, `description`, `version`, `active` (`sim/models/rubric.py:14-17`) | Directa |
| `rubricas[].criterios[]`: `competencia`, `titulo`, `descripcion`, `orden` | ídem | `RubricCriterion.competency`, `title`, `description`, `display_order` (`sim/models/rubric.py:35-37,41`) | Directa; SIEP exige además `weight` y que sumen 100 (`sim/services/rubric_service.py:93-98`) |

### 7.2 Ejecución y evaluación

| Clave del DSL | BD y archivo:línea | Cobertura |
|---|---|---|
| `estudiantes[].id`, `.nombre`, `.correo` | `CustomUser.id`; `nombre` y `apellido`, dos campos; `email` (`backend_django/apps/users/models.py:41-67`) | Parcial: el nombre se parte en dos. El correo viaja en claro en el DSL (dato personal) |
| `intentos[].id` | `SimulationAttempt.id`, un UUID (`sim/models/attempt.py:40`) | Directa, con otro formato de identificador |
| `intentos[].estudiante` | `SimulationAttempt.student` (`sim/models/attempt.py:45-47`) | Directa |
| `intentos[].estado` | `SimulationAttempt.status` (`sim/models/attempt.py:15-25,51-53`): `EN_CURSO`↔`IN_PROGRESS`, `PAUSADO`↔`PAUSED`, `COMPLETADO`↔`COMPLETED`, `REEMPLAZADO`↔`REPLACED`; `SAFE_EXITED` es histórico y no tiene equivalente | Directa |
| `intentos[].iniciadoEn`, `.finalizadoEn` | `SimulationAttempt.started_at`, `ended_at` (`sim/models/attempt.py:61-62`) | Directa |
| `intentos[].escenaActual` | `SimulationAttempt.current_node` (`sim/models/attempt.py:48-50`) | Directa |
| `bitacora` (`id`, `creadaEn`, `bloqueada`) | No hay entidad. `bloqueada` corresponde a `ReflectionJournal.locked` por reflexión (`sim/models/attempt.py:101`) y a `SimulationAttempt.locked_at` (`sim/models/attempt.py:63`); `id` y `creadaEn` no tienen equivalente | Parcial: sin clase |
| `bitacora.decisiones[]` | `AttemptEvent` (`sim/models/attempt.py:70-90`) con `event_type` `DECISION_SELECTED` o `PROHIBITED_DECISION_SELECTED` (aplicada) y `DECISION_RETRY_REQUIRED` o `PROHIBITED_DECISION_RETRY_REQUIRED` (no aplicada) (`sim/services/game_service.py:376-382,391`); `momento` es `occurred_at` (`:85`), `opcionElegida` es `decision_option` (`:78-81`) y `orden` se deduce de `occurred_at, id` (`:90`) | Parcial: un subconjunto de los tipos de evento |
| `bitacora.reflexiones[]` | `ReflectionJournal` (`sim/models/attempt.py:93-107`): `escena` es `node` (`:98`), `texto` es `encrypted_text` cifrado (`:99`; `sim/services/crypto_service.py`), `momento` es `updated_at` (`:103`); una por (intento, nodo) | Directa en la estructura; el texto viaja sin cifrar en el DSL, mientras que SIEP lo guarda cifrado en reposo y solo lo descifra para el docente de ese estudiante (`sim/services/instructor_service.py:46-58,125-133`) |
| `evaluaciones[]` | `RubricEvaluation` (`sim/models/rubric.py:49-68`): `intento`→`attempt`, `rubrica`→`rubric`, `estado`→`status` (`PENDING`/`EVALUATED`; `sim/services/rubric_service.py:430`), `observacionGeneral`→`comment`, `evaluadaEn`→`evaluated_at` | Parcial: `origen` no tiene lugar; SIEP solo guarda la del docente (`instructor` es obligatorio, `:55-57`) |
| `valoraciones[]` | `CriterionScore` (`sim/models/rubric.py:71-85`): `criterio`→`rubric_criterion`, `nivel`→`score` decimal de 1,0 a 5,0 (`:79`; rango en `sim/services/rubric_service.py:418-419`), `observacion`→`comment` | Parcial: nivel cualitativo frente a puntaje numérico |

### 7.3 Lo que SIEP no soporta hoy

Cada punto está verificado en el código de la rama `docs/documento-maestro-unificado` (commit `46b7206`).

| N.º | Lo que falta en SIEP | Evidencia | Efecto sobre el DSL |
|---|---|---|---|
| 1 | **No hay DSL, JSON Schema ni importación o exportación de casos.** El contrato son diccionarios copiados a mano en TypeScript | `auth/editor_view.py:73-179`; `frontend/src/app/core/models/simulation.model.ts` | El DSL llena ese hueco; falta construir importador, exportador y validador |
| 2 | **No existe la decisión como entidad:** sin identificador, campo de pregunta ni retroalimentación propia | `sim/serializers/game_dtos.py:57-64` | `decision.id` se pierde al importar y al exportar hay que inventarlo; `decision.pregunta` solo existe como texto de las líneas de diálogo del objeto que presenta las opciones (§7.1) |
| 3 | **Consecuencia y retroalimentación son el mismo campo, y se muestra al decidir, no al terminar** | `sim/models/case.py:116`; `sim/services/game_service.py:393,421` | RN-08 no se puede cumplir tal como la define la línea base |
| 4 | **No hay campo de fundamento teórico** | `sim/management/commands/seed_caso_pdf.py:248-251` | `fundamentoTeorico` va dentro del texto |
| 5 | **No hay personaje a nivel de caso, ni rol ni características** | `sim/models/world.py:32-65` | `personajes` se reconstruye a partir de objetos de sala |
| 6 | **Las ayudas no se pueden escribir desde el editor, y guardar un nodo las borra** | `fe/case-editor.component.ts:914` envía `supportResources: []`; el guardado reemplaza (`auth/graph.py:48-49`, `auth/request_utils.py:9-10`) | `decision.pistas` no tiene destino propio: el campo del nodo es el «Apoyo profesional» de la interfaz (§7.1), y lo que se cargue ahí por API o por siembra el editor lo pierde en el siguiente guardado |
| 7 | **No hay tema ni objetivos de aprendizaje del caso** | `sim/models/case.py:23-71` | `tematica` y `objetivosAprendizaje` se pierden |
| 8 | **No hay herramienta ligada a la opción.** El uso de una herramienta es una acción del mundo independiente de la decisión; `required_tools_json` se guarda y no se aplica | `sim/services/world_service.py:262-331`; `sim/models/case.py:82`; `sim/serializers/game_dtos.py:71` | `opciones[].herramienta` se aproxima con `DialogueChoice` o `MapObject` |
| 9 | **No hay bitácora como entidad ni evaluación del sistema guardada.** Solo se guarda la evaluación del docente | `sim/models/attempt.py:93-107`; `sim/models/rubric.py:55-57` | `bitacora` se reconstruye de eventos y reflexiones; `origen: SISTEMA` no se persiste |
| 10 | **La evaluación es numérica:** 1,0 a 5,0 por criterio y total ponderado, en tensión con RN-09 | `sim/services/rubric_service.py:418-430` | `nivel` necesita una regla de conversión que el equipo debe decidir (D-09 de la Fase 1) |
| 11 | **No se validan OCL-02, OCL-04, OCL-05, OCL-07 (la descripción puede ir vacía), OCL-08 ni INV-11**, y el destino de una opción no se comprueba contra la versión | `sim/services/world_validation.py:52-76`; `auth/cases.py:36-39`; `auth/graph.py:87-92` | Un caso importado con esos errores pasaría la validación de SIEP |
| 12 | **Los cuerpos de autoría no se validan:** un campo obligatorio ausente (la descripción de una herramienta, el texto de interacción de un objeto) termina en error 500 | `sim/tests/test_authoring_operations_contract.py:324-346` | El importador debe validar antes de llamar a la API |
| 13 | **Contenido sensible, advertencia y salida segura obligatoria solo viajan al cliente**, sin efecto en servidor | `sim/serializers/game_dtos.py:68-74` | `contenidoSensible` y `advertencia` no cambian el comportamiento |
| 14 | **No hay revisión por pares ni forma de archivar** (`IN_REVIEW` y `ARCHIVED` existen en el enum, ninguna ruta los asigna) | `sim/models/case.py:10-14`; `auth/publication.py:82-84` | `ARCHIVADO` no se puede conseguir desde SIEP |
| 15 | **Claves libres frente a identificadores con prefijo** | `sim/models/case.py:78,103` | Un exportador debe renumerar (`inicio` → `E01`) y conservar una tabla de correspondencia |
| 16 | **El juego solo ofrece una opción si algún diálogo la enlaza, y la publicación no lo valida.** Una opción llega al estudiante como `DialogueChoice` con `decision_option` en el árbol de un objeto de la sala; `currentNode.options` solo sirve para validar y el evento de ejecución lo emite únicamente una elección de diálogo. La validación de publicación ve nodos, decisiones, geometría, salida y límites, no los diálogos | `fe/simulation-play.component.ts:2113`; `fe/dialogue-panel.component.ts:817-818`; `sim/management/commands/seed_caso_pdf.py:698-720,744-780,1278-1299`; `sim/services/world_validation.py:37-48`; `auth/world_definition.py:310-366` | Un caso importado con una sala mínima y una salida segura se podría publicar y no se podría jugar: el importador debe crear el diálogo (§7.4) |
| 17 | **El volcado conserva seis tablas de un modelo de quiz anterior** (`casos`, `escenarios`, `preguntas`, `opciones`, `respuestas`, `sesiones_juego`), sin modelo ni código y sin ramificación (`opciones.es_correcta`, sin escena destino) | `deploy/db_seed.sql:516,848,1006,1039,1175,1360`; `docs/informes/2026-10-10-mapa-del-sistema/secciones/contenido-y-caso-sembrado.md:49` | Ninguno: no son la estructura viva y no se usan en esta correspondencia; quien lea el volcado no debe tomar `preguntas.enunciado` ni `opciones.normativa_ref` por equivalentes de `decision.pregunta` ni de `fundamentoTeorico` |

### 7.4 Lo que SIEP guarda y el DSL no transporta

El DSL describe el caso, no su mundo explorable ni su motor de puntaje (Fase 1, §7.5). Al importar, el equipo debe decidir un valor por defecto para cada uno:

| SIEP | Archivo | Qué hace un importador |
|---|---|---|
| `score_delta`, `stress_delta` y `prohibited_penalty` de cada opción (el editor propone `scoreDelta` 10 por defecto) | `sim/models/case.py:113-115`; `fe/case-editor.component.ts:843-845` | Fijar un valor explícito. Propuesta: 0, porque un caso autorado recibe de todos modos severidad por clasificación (`sim/services/case_effects.py:215-222`) |
| Sala (`SceneMap`), objetos, colisiones y diálogos | `sim/models/world.py:11-134` | Por cada escena con decisión, una sala con: (1) un objeto `PERSON` u `OBJECT` (el personaje que presenta la decisión) con un `DialogueTree` cuyo `speaker_name` sea ese personaje y cuyas `DialogueLine` incluyan `decision.pregunta`; (2) una `DialogueChoice` por opción, con `choice_key` = `opciones[].id`, `text` = `texto` y `decision_option` = la opción importada; (3) un objeto `EXIT`, porque **sin un objeto de salida segura SIEP rechaza publicar el caso** (`NO_SAFE_EXIT`, `sim/services/world_validation.py:156-161`); y (4) un `SceneMap` por nodo, porque sin sala el juego responde 404 (`sim/services/world_service.py:467-469`). Sin el diálogo la opción no llega al estudiante y la publicación no lo detecta (§7.3, punto 16) |
| `safe_exit_required`, `position_x`, `position_y` del nodo | `sim/models/case.py:84,88-89` | Valores por defecto (`false`, posición automática) |
| Checklist ético de seis casillas | `auth/publication.py:34-53` | No se importa; el docente lo completa antes de publicar |
| `weight` y `max_score` de cada criterio; `is_default` de la rúbrica | `sim/models/rubric.py:38-39`, `:18` | Repartir el peso en partes iguales, como ya hace SIEP cuando no suman 100 (`sim/services/rubric_service.py:79-90`). `is_default` no se importa, pero SIEP la usa como respaldo cuando un caso no tiene rúbrica asignada (`sim/services/rubric_service.py:308-311`) |
| `icon` y `active` de la herramienta | `sim/models/world.py:144,147` | Valores por defecto (`psychology`, activa: `auth/tools.py:39-42`) |

---

## 8. Decisiones de diseño y supuestos

### 8.1 Diferencias con el ejemplo del enunciado

El enunciado dice que su estructura es solo una referencia. Se conservaron las claves que tienen sentido y se agregó lo que el modelo de la Fase 1 exige.

| Elemento | Ejemplo del enunciado | Este DSL | Razón |
|---|---|---|---|
| Raíz | `caso`, `personajes`, `herramientas`, `escenas`, `retroalimentacion` | Las mismas, y `versionDsl`, `rubricas`, `ejecucion` | Versión del lenguaje; rúbrica y registro de ejecución |
| `caso` | `id`, `titulo`, `tematica`, `descripcion` | Las mismas, y `version`, `estado`, `objetivosAprendizaje`, `escenaInicial`, `rubrica` | Publicación por versiones, introducción del caso, escena de arranque explícita |
| `personajes[]` | `id`, `nombre`, `rol` | Las mismas, y `caracteristicas` | Rasgos relevantes para el análisis |
| `herramientas[]` | `id`, `nombre`, `descripcion` | Las mismas, y `categoria` | Agrupación libre |
| `escenas[]` | `id`, `descripcion`, `decision` obligatoria | `id`, `titulo`, `descripcion`, `orden`, `contenidoSensible`, `advertencia`, `participantes`; `decision` **opcional** | Una escena sin decisión es una conclusión |
| `decision` | `id`, `pregunta`, `opciones` | Las mismas, y `pistas` | Ayudas (RF-11) |
| `opciones[]` | `id`, `descripcion`, `siguienteEscena`, `herramienta` | `id`, **`texto`**, `siguienteEscena`, `clasificacion`, `conductaProhibida`, `motivoProhibicion`, `consecuencia`, `herramienta` | `texto` es el atributo del modelo y evita repetir `descripcion`, que en las demás clases es la narración. `clasificacion`, la conducta prohibida y la consecuencia son la base de la valoración formativa y de RN-08 |
| `retroalimentacion[]` | `decision`, `mensaje`, `fundamentoTeorico` | Las mismas, y `id`; `decision` u `opcion`, exactamente una | La Fase 2 exige asociarla a una decisión **u opción** (OCL-06) |
| Identificadores | `CASO-001`, `P01`, `H01`, `E01`, `D01`, `OP01` | Los mismos, y `R`, `RUB-`, `CR`, `EST-`, `INT-`, `BIT-`, `EV-` | Mismo estilo para los elementos nuevos |
| Bitácora y evaluación | No aparecen | `ejecucion.intentos[].bitacora`, `ejecucion.evaluaciones[]` | Los pide el reto del taller |

### 8.2 Decisiones

| N.º | Decisión | Razón | Alternativa descartada |
|---|---|---|---|
| F3-01 | `ejecucion` es un bloque aparte y opcional | La definición del caso es válida sola; la ejecución apunta a ella (principio 8) | Mezclar intentos con las escenas |
| F3-02 | La escena inicial es `caso.escenaInicial` | La unicidad queda en la estructura (D-06 de la Fase 1) | Bandera `inicial` en cada escena |
| F3-03 | La conclusión es la ausencia de `decision` | No admite contradicciones (D-03) | Clave `conclusion` o `terminal: true` |
| F3-04 | `retroalimentacion` es una lista de raíz con referencia a la decisión u opción | Es la forma del ejemplo del enunciado y hace visible la exclusión `decision` u `opcion` | Anidarla dentro de cada decisión y opción |
| F3-05 | `evaluaciones` van en `ejecucion`, no dentro del intento | Es una asociación y no una composición en el modelo (R-22); un intento puede tener la del sistema y la del docente | Anidar la evaluación en el intento |
| F3-06 | `rubricas` es una lista aunque el caso use una sola | La rúbrica tiene identidad propia y puede servir a varios casos (R-05) | Un objeto `rubrica` único dentro del caso |
| F3-07 | El esquema es cerrado (`additionalProperties: false`) | Detecta errores de escritura y mantiene la evaluación sin nota (RN-09) | Esquema abierto con claves libres |
| F3-08 | Los formatos de identificador con prefijo los exige el esquema | Detecta una referencia al tipo equivocado antes de buscarla | Prefijos solo como convención |
| F3-09 | Las cardinalidades que dependen de un solo objeto (`minItems`) están en el esquema | Un documento con una opción por decisión ni siquiera es un documento bien formado (§6.1); además OCL-02 sigue formulada en el modelo | Esquema laxo y todas las cardinalidades en OCL |
| F3-10 | Las fechas son ISO 8601 con zona horaria | No se interpretan según el servidor; coincide con `DateTime` del modelo | Texto libre o marcas de tiempo numéricas |
| F3-11 | El esquema lleva anotaciones propias `x-regla` y `x-referencia` | Une cada restricción con su regla y permite validar referencias sin código por campo | Documentar las reglas solo en prosa |
| F3-12 | Los nombres JSON siguen al modelo salvo `siguienteEscena`, `herramienta` y `retroalimentacion` | Conserva las claves del ejemplo del enunciado (§2.5) | Cambiar el modelo de la Fase 1 |

### 8.3 Supuestos

| N.º | Supuesto |
|---|---|
| S-F3-01 | Un documento describe una sola versión de un caso, como en S-01 de la Fase 1. |
| S-F3-02 | La retroalimentación de una decisión explica la decisión en general; la de una opción, esa opción (S-05 de la Fase 1). |
| S-F3-03 | El texto de los casos puede escribirse con cualquier carácter; solo las claves y los valores de enumeración son ASCII. |
| S-F3-04 | Los estudiantes del ejemplo (`EST-01`) y su correo (`example.org`) son ficticios. |
| S-F3-05 | Los niveles de desempeño los acuerda el equipo (S-09 de la Fase 1). |
| S-F3-06 | Un documento con `ejecucion` es una exportación de un caso ya ejecutado; escribir intentos a mano no es el uso previsto. Contiene datos personales (el correo del estudiante) y reflexiones sin cifrar: no se publica junto con la definición del caso, y un exportador puede omitir `correo` y `texto`. |

---

## 9. Trazabilidad con la línea base

| Requisito o regla | Dónde queda en el DSL |
|---|---|
| RF-05 Crear y gestionar casos | `caso` |
| RF-06 Gestionar escenas | `escenas`, `escenas[].orden` |
| RF-07 Gestionar personajes | `personajes`, `escenas[].participantes` |
| RF-08 Gestionar decisiones y opciones | `escenas[].decision`, `decision.opciones` |
| RF-09 Configurar ramificaciones | `opciones[].siguienteEscena`, escena sin `decision` |
| RF-10 Configurar retroalimentaciones | `retroalimentacion`, `fundamentoTeorico` |
| RF-11 Gestionar ayudas | `decision.pistas` |
| RF-12 Validar estructura del caso | Esquema y reglas semánticas (§6) |
| RF-13 Publicar y archivar casos | `caso.estado`, `caso.version` |
| RF-16 Consultar introducción del caso | `caso.descripcion`, `caso.objetivosAprendizaje`, `personajes` |
| RF-17 Ejecutar simulación ramificada | `intentos[].escenaActual`, `bitacora.decisiones` (SIEP añade la reconsideración de la primera respuesta mala: `aplicada`, Fase 1 §7.4) |
| RF-18 Consultar ayudas | `decision.pistas` |
| RF-19 Guardar progreso | `intentos[].estado`, `intentos[].escenaActual` |
| RF-20 Registrar bitácora reflexiva | `bitacora.reflexiones` |
| RF-21 Registrar recorrido del intento | `bitacora.decisiones`, `iniciadoEn`, `finalizadoEn` |
| RF-22 Evaluar respuestas y resultado | `rubricas`, `evaluaciones` con `origen: SISTEMA` |
| RF-23 Presentar retroalimentación | `retroalimentacion` (se muestra al terminar) |
| RF-24 Consultar resultados e historial | `ejecucion.intentos`, `ejecucion.evaluaciones` |
| RF-25 Revisar desempeño | `evaluaciones` con `origen: DOCENTE` |
| RN-02 Cada opción lleva a una escena válida o a una conclusión | `siguienteEscena` obligatoria (OCL-03) |
| RN-03 Publicado antes de usarse | `caso.estado` y regla del esquema |
| RN-05 Si no cumple el DSL, no se publica ni se ejecuta | Las dos capas de validación (§6.3) |
| RN-06, RN-07 Intentos independientes, sin dos abiertos | `ejecucion.intentos`, INV-16 (SIEP permite reemplazar un intento abierto: estado `REEMPLAZADO`, Fase 1 §7.4) |
| RN-08 Consecuencia en el momento, retroalimentación al final | `opciones[].consecuencia` frente a `retroalimentacion` (§5.4) |
| RN-09 Valoración formativa sin nota oficial | `evaluaciones[].valoraciones[].nivel`; sin campo numérico |
| RN-11 Opciones necesarias por decisión | `opciones` con `minItems: 2` y sin máximo |
| RF-01 a RF-04, RF-14, RF-15, RF-26; RN-01, RN-04, RN-10 | Fuera del DSL: usuarios, grupos, asignación y reportes |

---

## 10. Verificación y límites

**Qué se verificó.** `verificar-fase-3.py` (solo biblioteca estándar y `jsonschema` 4.25.1, Python 3.13) hizo, el 11 de octubre de 2026:

1. `dsl-casos.schema.json` es un esquema válido del *draft* 2020-12 (`Draft202012Validator.check_schema`).
2. `ejemplo-minimo.json` valida contra el esquema sin errores (también con el verificador de formatos de `jsonschema` activo; de los dos formatos que usa el esquema, `date-time` y `email`, ese verificador solo conoce `email`, así que las fechas se comprueban por `pattern`) y no infringe ninguna regla semántica. Tiene 2 personajes, 3 escenas (1 con decisión y 2 conclusiones), 1 decisión con 2 opciones, 1 herramienta, 2 retroalimentaciones (una a una decisión y otra a una opción), 1 rúbrica con 2 criterios, 1 estudiante, 1 intento con bitácora (1 decisión y 1 reflexión) y 1 evaluación con 2 valoraciones.
3. **32 alteraciones del ejemplo**, cada una introduce una infracción, se detecta en la capa que dice §6.2 y con el número de regla esperado. Cubren OCL-01 a OCL-08, INV-09 a INV-14, INV-16 a INV-20, RN-03, RN-09 y errores de forma (clave derivada escrita, `decision: null` en una conclusión y en la única escena con decisión, referencia con prefijo equivocado), más una combinación de los tres errores del enunciado (OCL-02, OCL-05 y OCL-03 a la vez).

Para repetirlo:

```
C:/Python313/python.exe -I -B verificar-fase-3.py
```

`C:/Python313/python.exe` es la instalación del equipo donde se ejecutó; en otro equipo se usa `python` o `python3`. `-B` evita que Python escriba una carpeta `__pycache__` junto a los archivos.

Resultado: `RESULTADO: TODO CORRECTO`, código de salida 0.

**Para validar un documento propio con el esquema** (capa 1 sola):

```python
import json
from jsonschema import Draft202012Validator

esquema = json.load(open("dsl-casos.schema.json", encoding="utf-8"))
documento = json.load(open("ejemplo-minimo.json", encoding="utf-8"))
errores = list(Draft202012Validator(esquema).iter_errors(documento))
print(len(errores))  # 0
```

**Qué no se verificó.**

- **Las reglas OCL de la Fase 2 no se ejecutaron con una herramienta OCL.** La capa semántica de `verificar-fase-3.py` es una implementación de referencia en Python de lo que esas reglas dicen; no sustituye a una evaluación OCL sobre el modelo.
- **No se probó con otro validador de JSON Schema** (por ejemplo Ajv). El esquema usa solo palabras clave estándar del *draft* 2020-12 (`$defs`, `$ref` con vecinas, `if/then/else`, `contains`, `oneOf`, `allOf`, `const`, `enum`, `pattern`, `uniqueItems`); `x-regla` y `x-referencia` son anotaciones que cualquier validador ignora.
- **`format` es informativo.** El esquema impone la forma de fechas y correos con `pattern`; no comprueba que una fecha exista en el calendario (por ejemplo, `2026-02-31T10:00:00Z` cumple el patrón, también con el verificador de formatos de `jsonschema` activo, que en este entorno no incluye `date-time`). El validador de la Fase 4 no puede interpretar una fecha imposible y, en ese caso, omite en silencio las comprobaciones de tiempo de PROP-05 y PROP-07 para ese valor.
- **No se ejecutó SIEP.** La sección 7 se leyó del código de la rama `docs/documento-maestro-unificado` (commit `46b7206`); las restricciones de base de datos que cita provienen del volcado `deploy/db_seed.sql` y no de una base viva.
- **No se construyó importador ni exportador.** La sección 7 dice cómo se hará, no lo hace.
