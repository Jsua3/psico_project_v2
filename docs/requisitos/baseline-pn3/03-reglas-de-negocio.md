# Reglas de negocio (RN-01 a RN-11)

> Fuente: hoja «REGLAS DE NEGOCIO — VERSIÓN ACADÉMICA INICIAL» de `RequisitosPN3.xlsx` (versión académica inicial, línea base unificada de la carrera). Texto fiel al Excel; si el Excel cambia, este archivo se regenera, no se edita a mano.

| ID | Categoría | Regla | Prioridad | Estado | Observación |
|---|---|---|---|---|---|
| RN-01 | Alcance | Los casos del simulador estarán enfocados en situaciones de psicología social con fines educativos y no se usarán para realizar diagnósticos clínicos. | Alta | Definido | Corresponde al propósito del proyecto. |
| RN-02 | Ramificación | Cada opción de una decisión debe llevar a otra escena válida del caso o a una conclusión. | Alta | Definido | Base del flujo ramificado. |
| RN-03 | Publicación | Un caso debe estar publicado antes de que los estudiantes puedan utilizarlo. | Alta | Definido |  |
| RN-04 | Acceso | El estudiante solo podrá entrar a los casos que tenga habilitados o asignados. | Alta | Definido |  |
| RN-05 | Validez | Si un caso no cumple las reglas definidas en el DSL, no podrá publicarse ni ejecutarse. | Alta | Definido |  |
| RN-06 | Historial | Cada intento debe guardarse de manera independiente para no reemplazar intentos anteriores. | Alta | Definido |  |
| RN-07 | Reintentos | El estudiante podrá repetir una simulación cuando haya terminado la anterior. Cada repetición se guardará como un intento nuevo y no podrá iniciar otro si todavía tiene uno en progreso. | Media | Definido | Se conserva el historial de todos los intentos. |
| RN-08 | Retroalimentación | La consecuencia de una decisión se mostrará en el momento para poder continuar la historia. La retroalimentación pedagógica se mostrará al terminar el intento. | Alta | Definido | Se separa consecuencia narrativa de retroalimentación pedagógica. |
| RN-09 | Evaluación | En esta fase, el simulador hará una valoración formativa con criterios o rúbrica, pero no generará una nota oficial de 0,0 a 5,0. | Alta | Definido | La calificación numérica podrá evaluarse en una fase posterior. |
| RN-10 | Usuarios | El administrador será quien cree y administre las cuentas de usuario y asigne los roles de Administrador, Profesor o Estudiante. | Alta | Definido | El profesor administrará sus grupos, pero no las cuentas globales. |
| RN-11 | Decisiones | Cada decisión tendrá la cantidad de opciones de respuesta que sea necesaria para representar correctamente la situación. | Alta | Definido | Regla adoptada para esta fase del DSL. |
