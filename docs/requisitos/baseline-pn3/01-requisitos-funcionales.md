# Requisitos funcionales (RF-01 a RF-26)

> Fuente: hoja «REQUISITOS FUNCIONALES — VERSIÓN ACADÉMICA INICIAL» de `RequisitosPN3.xlsx` (versión académica inicial, línea base unificada de la carrera). Texto fiel al Excel; si el Excel cambia, este archivo se regenera, no se edita a mano.

| ID | Épica | Nombre | Descripción | Actor | Prioridad | Estado |
|---|---|---|---|---|---|---|
| RF-01 | Usuarios y acceso | Autenticar usuarios | El sistema debe permitir que cada usuario pueda iniciar y cerrar sesión con sus credenciales. | Todos | Alta | Definido |
| RF-02 | Usuarios y acceso | Controlar acceso por rol | El sistema debe reconocer si el usuario es estudiante, profesor o administrador y mostrarle solo las funciones que le correspondan. | Todos | Alta | Definido |
| RF-03 | Usuarios y acceso | Gestionar usuarios y roles | El administrador debe poder crear usuarios, actualizar sus datos, activar o desactivar cuentas y asignarles un rol. | Administrador | Alta | Definido |
| RF-04 | Grupos y programación | Gestionar grupos académicos | El profesor debe poder crear grupos y agregar o retirar estudiantes que ya estén registrados en el sistema. | Profesor | Alta | Definido |
| RF-05 | Gestión de casos | Crear y gestionar casos | El profesor debe poder crear, editar y consultar los casos que se van a usar en el simulador. | Profesor | Alta | Definido |
| RF-06 | Gestión de casos | Gestionar escenas | El profesor debe poder agregar, editar, ordenar o eliminar las escenas que forman parte de un caso. | Profesor | Alta | Definido |
| RF-07 | Gestión de casos | Gestionar personajes | El profesor debe poder definir los personajes que participan en el caso o en una escena determinada. | Profesor | Media | Definido |
| RF-08 | Gestión de casos | Gestionar decisiones y opciones | El profesor debe poder crear las decisiones de cada escena y agregar las opciones de respuesta que considere necesarias para la situación. | Profesor | Alta | Definido |
| RF-09 | Gestión de casos | Configurar ramificaciones | Cada opción de respuesta debe poder llevar a otra escena del caso o directamente a una conclusión. | Profesor | Alta | Definido |
| RF-10 | Gestión de casos | Configurar retroalimentaciones | El profesor debe poder agregar una retroalimentación a las opciones o decisiones, explicando por qué son adecuadas o no y apoyándolas con su fundamento teórico. Esta retroalimentación se mostrará al finalizar el intento. | Profesor | Alta | Definido |
| RF-11 | Gestión de casos | Gestionar ayudas | El profesor debe poder agregar ayudas o pistas opcionales a las decisiones del caso. | Profesor | Media | Definido |
| RF-12 | DSL y validación | Validar estructura del caso | Antes de usar un caso, el sistema debe revisar que cumpla la estructura y las reglas definidas en el DSL y señalar qué hace falta cuando exista algún error. | Profesor / Sistema | Alta | Definido |
| RF-13 | Gestión de casos | Publicar y archivar casos | El sistema debe permitir cambiar el estado de un caso entre borrador, publicado y archivado. | Profesor / Administrador | Alta | Definido |
| RF-14 | Grupos y programación | Asignar caso a grupo | El profesor debe poder asignar un caso publicado a uno o varios grupos o estudiantes y, cuando sea necesario, definir una fecha de apertura y una fecha de cierre. | Profesor | Alta | Definido |
| RF-15 | Participación | Consultar casos habilitados | El estudiante debe poder ver únicamente los casos que tenga habilitados para participar. | Estudiante | Alta | Definido |
| RF-16 | Participación | Consultar introducción del caso | Antes de comenzar un caso, el estudiante debe poder ver su contexto, los personajes y los objetivos de aprendizaje. | Estudiante | Media | Definido |
| RF-17 | Participación | Ejecutar simulación ramificada | El estudiante debe poder avanzar por las escenas del caso y tomar decisiones. Según la opción que elija, el caso continuará en otra escena o llegará a una conclusión. | Estudiante / Sistema | Alta | Definido |
| RF-18 | Participación | Consultar ayudas | Durante la simulación, el estudiante debe poder consultar las ayudas o pistas que estén disponibles. | Estudiante | Media | Definido |
| RF-19 | Persistencia | Guardar progreso | El sistema debe guardar el avance del estudiante para que pueda continuar desde el último punto registrado. | Estudiante / Sistema | Alta | Definido |
| RF-20 | Reflexión | Registrar bitácora reflexiva | El estudiante debe poder escribir y guardar reflexiones o justificaciones sobre las decisiones que tome durante el caso. | Estudiante | Alta | Definido |
| RF-21 | Trazabilidad | Registrar recorrido del intento | El sistema debe guardar, para cada intento, las escenas recorridas, las decisiones tomadas, las respuestas elegidas y el tiempo utilizado. En esta fase no se manejará un tiempo máximo obligatorio. | Sistema | Alta | Definido |
| RF-22 | Evaluación | Evaluar respuestas y resultado | Cuando el estudiante llegue a una conclusión, el sistema debe cerrar el intento, valorar sus decisiones con la rúbrica definida para el caso y guardar el resultado. | Sistema | Media | Definido para esta fase |
| RF-23 | Retroalimentación | Presentar retroalimentación | Al finalizar el intento, el estudiante debe poder ver la retroalimentación correspondiente a las decisiones que tomó. | Estudiante | Alta | Definido |
| RF-24 | Resultados | Consultar resultados e historial | El estudiante debe poder consultar sus resultados y los intentos anteriores. Si repite una simulación, el nuevo intento debe guardarse por separado. | Estudiante | Media | Definido |
| RF-25 | Seguimiento docente | Revisar desempeño | El profesor debe poder revisar las respuestas, el recorrido, los tiempos y los resultados de sus estudiantes. | Profesor | Alta | Definido |
| RF-26 | Seguimiento docente | Generar reportes | El profesor debe poder generar reportes básicos del desempeño de un estudiante o de un grupo. | Profesor | Media | Definido |
