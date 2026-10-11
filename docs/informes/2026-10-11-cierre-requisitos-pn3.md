# Cierre de la sesión «Requisitos, reglas de negocio y taller de DSL»

Sesiones: «Requisitos PN3» (Claude Sonnet 5.5) y su sesión hermana «Local Claude code prompt session», a pedido de Juan José Sua. Periodo: 2026-10-10 a 2026-10-11. Estado al cerrar: lo producido está en `master` (el código de la ola 0 desde `de430a7`; después entraron #68 y #72) salvo lo marcado como abierto en la sección 7.

## 1. Qué se pidió

1. Medir la **línea base académica unificada PN3** (26 RF, 8 RNF, 11 RN y 15 CU) contra el código real de SIEP.
2. Convertir las propuestas C, E, F, G y J en requisitos formales.
3. Cerrar brechas con la prueba primero, en PR pequeños.
4. Proponer una trazabilidad viva entre requisitos, pruebas y código.
5. Entregar el **taller de DSL** de Ingeniería de Software II (fases 1, 3 y 4; la fase 2, OCL, es de Esteban Bonilla y Santiago Leyton).

## 2. Qué quedó y dónde

| Entregable | Ruta | PR · merge |
|---|---|---|
| Contraste de la línea base (matriz, detalle por requisito, conflictos y decisiones, glosario, extensiones de SIEP) | [`docs/requisitos/contraste-pn3/`](../requisitos/contraste-pn3) | [#59](https://github.com/Jsua3/psico_project_v2/pull/59) · `700904f` |
| Propuestas C/E/F/G/J como requisitos formales (162 requisitos y 58 preguntas para Psicología) | [`docs/requisitos/propuestas/`](../requisitos/propuestas) | [#60](https://github.com/Jsua3/psico_project_v2/pull/60) · `5fe8dd4` |
| Trazabilidad viva (convención de marcadores, plan de marcado de ~300 pruebas, 10 huecos) | [`docs/requisitos/trazabilidad/`](../requisitos/trazabilidad) | [#61](https://github.com/Jsua3/psico_project_v2/pull/61) · `311267c` |
| Ola 0 de código: alcance por docente en reportes | `backend_django/apps/reportes`, `instructor_scope.py` | [#64](https://github.com/Jsua3/psico_project_v2/pull/64) · `f781dbc` |
| Ola 0 de código: guardar un nodo conserva sus datos | `authoring/graph.py`, `case-editor.component.ts` | [#65](https://github.com/Jsua3/psico_project_v2/pull/65) · `f2beb46` |
| Ola 0 de código: el lobby solo muestra casos asignados | `apps/progression/catalog.py` | [#66](https://github.com/Jsua3/psico_project_v2/pull/66) · `8824cb6` |
| Ola 0 de código: validación estructural antes de publicar | `authoring/graph.py`, `world_validation.py` | [#67](https://github.com/Jsua3/psico_project_v2/pull/67) · `de430a7` |
| Taller de DSL (UML, sintaxis JSON, escenarios y validador con 46 pruebas) | [`docs/diseno/dsl/`](../diseno/dsl) | [#63](https://github.com/Jsua3/psico_project_v2/pull/63) · `8541b1b` |
| Deriva del DSL tras la ola 0 (citas y afirmaciones sobre SIEP puestas al día) | [`docs/diseno/dsl/`](../diseno/dsl) | [#72](https://github.com/Jsua3/psico_project_v2/pull/72) · `6b45279` |
| Documento maestro único y vigente | [`docs/PROMPT_MAESTRO.md`](../PROMPT_MAESTRO.md) | [#70](https://github.com/Jsua3/psico_project_v2/pull/70) · `31246e7` |
| Línea base PN3 en Markdown y prompt de la sesión | [`docs/requisitos/baseline-pn3/`](../requisitos/baseline-pn3) | [#58](https://github.com/Jsua3/psico_project_v2/pull/58) · `adbdf60` |

Lo que hizo falta para que `master` quedara verde (sesión hermana): [#62](https://github.com/Jsua3/psico_project_v2/pull/62) revirtió TypeScript 7 y PostgreSQL 18, que Dependabot había subido y rompían el job Frontend del CI.

## 3. Resultado del contraste

Cifras tras la re-medición del 2026-10-11 de los 14 ítems que tocan los PR #64 a #67 (entre paréntesis, la medición original):

| Tipo | Cumple | Parcial | No cumple | Conflicto | No verificable | Total |
|---|---:|---:|---:|---:|---:|---:|
| Requisitos funcionales (RF) | 6 | 19 (18) | 1 | 0 (1) | 0 | 26 |
| Requisitos no funcionales (RNF) | 1 | 5 | 0 | 0 | 2 | 8 |
| Reglas de negocio (RN) | 4 (3) | 3 (4) | 0 | 4 | 0 | 11 |
| Casos de uso (CU) | 4 | 11 | 0 | 0 | 0 | 15 |
| **Total** | **15 (14)** | **38** | **1** | **4 (5)** | **2** | **60** |

- **Cumplen (15):** RF-01, RF-03, RF-04, RF-19, RF-20, RF-24, RNF-03, RN-02, RN-03, RN-06, RN-11, CU-02, CU-03, CU-10 y CU-11.
- **Conflictos vigentes (4):** RN-07 (`forceNew`), RN-08 (retroalimentación pedagógica en el momento), RN-09 (total de rúbrica 1,0–5,0) y RN-10 (el docente crea cuentas). Cada uno tiene opciones y una recomendación en `conflictos-y-decisiones.md` §1.
- **No cumple (1):** RF-11, las ayudas o pistas por decisión.
- **No verificables leyendo código (2):** RNF-05 (rendimiento) y RNF-06 (disponibilidad); la sección 5 del mismo documento dice cómo medirlos.
- Casi todo el «parcial» se explica por cuatro causas: el actor (autorar y publicar es solo del ADMIN), el DSL (existe como diseño y no está integrado), el momento de la retroalimentación y la falta de pistas, fechas y asignación individual.

Método: cada requisito se descompone en cláusulas con evidencia `ruta:línea`; todo «cumple» y todo «conflicto» pasa por dos lentes opuestos; 991 citas únicas verificadas con `verificar_citas.py`. Límite: 27 ítems tienen una sola evaluación y ninguna prueba se ejecutó para medir (la suite de backend corre en el CI de cada PR). «Cumple» quiere decir que el código satisface las cláusulas esenciales del texto; no es una aprobación de Psicología ni de los docentes.

## 4. Qué cambia para quien usa el sistema (ola 0)

| PR | Cambio visible |
|---|---|
| #64 | Cada docente ve solo a sus estudiantes en el tablero, el reporte de grupo (y su CSV) y `student-report`. El ADMIN sigue viendo todo. Tres pruebas del tablero global se ajustaron. |
| #65 | Guardar un nodo en el editor ya no borra sus herramientas requeridas ni sus recursos de apoyo. |
| #66 | Un estudiante sin asignación ve el lobby vacío; con asignación, solo sus casos, y el desbloqueo lineal cuenta únicamente entre ellos. |
| #67 | Una decisión solo une nodos de su versión. Publicar rechaza un nodo alcanzable que no es final y no tiene opciones, y un nodo no final sin mapa; un nodo al que no se llega solo avisa. Los borradores existentes con esos defectos no se podrán publicar hasta corregirlos. |

El caso sembrado `SIM-VBG-001` trae un nodo huérfano, `comisaria-recepcion` (sin opciones y sin entradas); por eso «sin opciones» solo es error en nodos alcanzables. Si es basura del seed, se retira aparte.

## 5. Defectos hallados fuera de la línea base

Detalle en `conflictos-y-decisiones.md` §3.

- **Corregidos:** D-1, D-2, D-3 (alcance por docente, #64) y D-4 (guardar nodo, #65).
- **Abiertos con evidencia:**
  - D-5: credenciales demo y contraseña por defecto en claro.
  - D-11: los cuatro GET de juego que alcanza el profesor solo exigen el token del intento y no acotan por grupo.
  - D-12: mapas, diálogos y objetos del editor de escenas sin acotar a la versión (un borrador puede colgar un mapa de una versión publicada).
  - D-14: el alcance docente es de autoservicio: un profesor agrega por correo a cualquier estudiante y lee su bitácora descifrada sin que lo acepte.
  - D-15: un nodo final sin mapa pasa la validación (#67 lo exime) y rompe la traza del docente.
  - D-16: lecturas (`GET /world` y la traza) que escriben el estado del mundo.
- **Reportados, sin releer:** D-6 a D-10 (auto-desactivación del administrador, cierre de sesión sin revocación, CSV con inyección de fórmulas, borrado de nodo con decisiones entrantes, siembra que borra intentos) y D-17 (rúbricas globales). D-13: reporte de un grupo inactivo (menor, latente).

## 6. Decisiones que le tocan al equipo

Las 22 decisiones con valor por defecto están en `conflictos-y-decisiones.md` §4 (la 22 es nueva: si un docente puede agregar a cualquier estudiante sin su aceptación). Las que más trabajo desbloquean:

| # | Pregunta | Valor por defecto | Desbloquea |
|---|---|---|---|
| 3 | ¿El profesor autora casos (RF-05 a RF-11)? | Sí, con publicación por el administrador | Ola 2 y propuesta J |
| 2 | ¿Se elimina `forceNew` del estudiante (RN-07)? | Sí | Ola 1 |
| 6 | ¿Se oculta la retroalimentación pedagógica hasta el cierre (RN-08)? | Sí | Ola 1 |
| 5 | ¿Fechas de apertura y cierre por grupo y asignación individual (RF-14)? | Sí, por grupo primero | Ola 3 (toca el esquema) |
| 8 | ¿Qué alcance tiene el DSL en el sistema? | Formato de intercambio y validador de publicación | Ola 4 |
| 4 | ¿Se mantiene la importación de estudiantes (RN-10)? | Sí, con cuentas pendientes de activación | Ola 2 |
| 22 | ¿Un docente puede agregar a su grupo a cualquier estudiante registrado sin su aceptación (D-14)? | No: el estudiante acepta o el administrador aprueba | RF-04, RF-25 |

Las olas 1 a 5 y los cambios de esquema (marcados «BD» en la tabla de brechas) **no se iniciaron**: dependen de estas decisiones.

## 7. Abierto al cerrar

| Qué | Dónde | Quién |
|---|---|---|
| Esta nota de cierre y la re-medición de la matriz | [#71](https://github.com/Jsua3/psico_project_v2/pull/71) | Requisitos PN3 |
| Actualizaciones menores de dependencias del frontend de Dependabot | [#69](https://github.com/Jsua3/psico_project_v2/pull/69) | Usuario: ya hubo dos roturas con Dependabot (el #68, de Python, entró) |
| `docker build` de prueba con Node 26 antes del próximo despliegue | `Dockerfile` | Usuario |
| Fase 2 del taller (reglas OCL-01 a OCL-08) | Esteban Bonilla y Santiago Leyton | Equipo |
| Adopción de la trazabilidad (marcador `req` en pytest y ~300 pruebas por marcar) | `docs/requisitos/trazabilidad/plan-de-marcado.md` | Decisión del usuario |
| Prueba nocturna de caso completo (`e2e-full-case.yml`) sobre `master` | corre sola a las 02:00 de Colombia | Automático |

## 8. Cómo se trabajó

- Subagentes `claude-sonnet-5-5` y `claude-haiku-5-5`; lo mecánico (rutas, tablas, citas) con scripts, sin modelo. Una corrida del revisor de la re-medición salió en `claude-sonnet-5` por no fijar el modelo; se descartó como fuente y se repitió en `claude-sonnet-5-5`.
- Contraste: ~1,3 M de tokens de subagentes, tras recuperar 50 de 60 veredictos de una corrida abortada (la corrida completa había costado ~5,7 M). Propuestas: ~0,7 M.
- Cada cambio de código se hizo con la prueba primero y se verificó con la suite de backend (889 pruebas con los cuatro PR juntos) y el CI de cada PR (6 de 6, con E2E).
- Trampas útiles: GitHub puede dar un PR por «conflictivo» cuando hay dos bases de fusión aunque `git merge` salga limpio (se arregla metiendo la punta de la base en la rama); cerrar y reabrir un PR genera un CI nuevo contra la base actual, un «re-run» reutiliza el viejo; el alias `sonnet` del tool `Agent` resuelve a Sonnet 5.5 pero omitirlo hereda Sonnet 5.

## 9. Siguiente paso recomendado

1. Que el equipo conteste las decisiones 2, 3, 5, 6 y 8; con ellas se desbloquean las olas 1 y 2 (sin esquema). La 22 conviene antes de que el sistema tenga estudiantes reales.
2. Corregir D-11 (acotar `_require_attempt` por grupo), D-12 (acotar mapas, diálogos y objetos a la versión) y D-15 (exigir mapa a los nodos finales): son pequeños y sin esquema.
3. Decidir la adopción del marcador `req` para que la matriz se regenere desde las pruebas.
