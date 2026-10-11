# Impacto de las propuestas en la línea base

> Generado el 2026-10-11 por `herramientas/generar_impacto.py` desde la sección 2 de `bloque-?-requisitos.md`. Lectura mecánica: cada celda es la relación que declara el documento del bloque. No se edita a mano.

## Puntos de fricción (tensiona o contradice)

| ID | Nombre | Bloque | Relación |
|---|---|---|---|
| RF-05 | Crear y gestionar casos | J | contradice |
| RF-06 | Gestionar escenas | J | contradice |
| RF-07 | Gestionar personajes | J | contradice |
| RF-08 | Gestionar decisiones y opciones | J | contradice |
| RF-09 | Configurar ramificaciones | F | tensiona |
| RF-09 | Configurar ramificaciones | J | contradice |
| RF-10 | Configurar retroalimentaciones | J | contradice |
| RF-11 | Gestionar ayudas | G | tensiona |
| RF-11 | Gestionar ayudas | J | contradice |
| RF-16 | Consultar introducción del caso | J | tensiona |
| RF-22 | Evaluar respuestas y resultado | J | tensiona |
| RF-23 | Presentar retroalimentación | E | tensiona |
| RF-23 | Presentar retroalimentación | J | tensiona |
| RNF-08 | Integridad de la información | E | tensiona |
| RN-01 | Alcance | C | tensiona |
| RN-01 | Alcance | E | tensiona |
| RN-02 | Ramificación | F | tensiona |
| RN-08 | Retroalimentación | C | tensiona |
| RN-08 | Retroalimentación | E | tensiona |
| RN-08 | Retroalimentación | F | tensiona |
| RN-08 | Retroalimentación | G | tensiona |
| RN-08 | Retroalimentación | J | tensiona |
| RN-09 | Evaluación | J | tensiona |

## Matriz completa (39 IDs de la línea base tocados)

| ID | Nombre | C | E | F | G | J | Bloques |
|---|---|---|---|---|---|---|---:|
| RF-05 | Crear y gestionar casos |  |  |  |  | contradice | 1 |
| RF-06 | Gestionar escenas |  |  |  |  | contradice | 1 |
| RF-07 | Gestionar personajes |  |  |  |  | contradice | 1 |
| RF-08 | Gestionar decisiones y opciones |  |  | independiente |  | contradice | 2 |
| RF-09 | Configurar ramificaciones |  |  | tensiona |  | contradice | 2 |
| RF-10 | Configurar retroalimentaciones |  |  |  | independiente | contradice | 2 |
| RF-11 | Gestionar ayudas |  |  |  | tensiona | contradice | 2 |
| RF-12 | Validar estructura del caso |  |  |  |  | extiende | 1 |
| RF-13 | Publicar y archivar casos |  |  |  |  | reutiliza | 1 |
| RF-14 | Asignar caso a grupo |  |  |  |  | extiende | 1 |
| RF-15 | Consultar casos habilitados |  |  |  |  | extiende | 1 |
| RF-16 | Consultar introducción del caso | independiente |  |  | independiente | tensiona | 3 |
| RF-17 | Ejecutar simulación ramificada | extiende | reutiliza | extiende |  | reutiliza | 4 |
| RF-18 | Consultar ayudas | independiente | independiente |  | extiende |  | 3 |
| RF-19 | Guardar progreso |  | reutiliza |  |  |  | 1 |
| RF-20 | Registrar bitácora reflexiva | extiende | extiende | reutiliza |  |  | 3 |
| RF-21 | Registrar recorrido del intento | extiende | extiende | extiende |  |  | 3 |
| RF-22 | Evaluar respuestas y resultado | reutiliza | independiente |  |  | tensiona | 3 |
| RF-23 | Presentar retroalimentación |  | tensiona | independiente | independiente | tensiona | 4 |
| RF-25 | Revisar desempeño | extiende | extiende | extiende | extiende | independiente | 5 |
| RF-26 | Generar reportes |  |  |  |  | independiente | 1 |
| RNF-01 | Protección de credenciales |  |  |  | reutiliza |  | 1 |
| RNF-04 | Accesibilidad básica | extiende | extiende | extiende | reutiliza | extiende | 5 |
| RNF-07 | Separación de componentes |  |  |  |  | extiende | 1 |
| RNF-08 | Integridad de la información | independiente | tensiona |  |  | extiende | 3 |
| RN-01 | Alcance | tensiona | tensiona | reutiliza | reutiliza | reutiliza | 5 |
| RN-02 | Ramificación | independiente |  | tensiona |  | reutiliza | 3 |
| RN-03 | Publicación |  |  |  |  | reutiliza | 1 |
| RN-04 | Acceso |  |  |  |  | extiende | 1 |
| RN-05 | Validez |  |  |  |  | extiende | 1 |
| RN-06 | Historial |  | reutiliza |  |  |  | 1 |
| RN-07 | Reintentos |  |  |  |  | independiente | 1 |
| RN-08 | Retroalimentación | tensiona | tensiona | tensiona | tensiona | tensiona | 5 |
| RN-09 | Evaluación | reutiliza | reutiliza | reutiliza | reutiliza | tensiona | 5 |
| RN-11 | Decisiones |  |  | reutiliza |  | reutiliza | 2 |
| CU-08 | Ejecutar simulación |  | reutiliza |  |  |  | 1 |
| CU-09 | Consultar ayuda |  |  |  | reutiliza |  | 1 |
| CU-11 | Registrar bitácora |  | extiende |  |  |  | 1 |
| CU-14 | Revisar desempeño |  | extiende |  |  |  | 1 |

## Sin tocar por ninguna propuesta (21)

RF-01, RF-02, RF-03, RF-04, RF-24, RNF-02, RNF-03, RNF-05, RNF-06, RN-10, CU-01, CU-02, CU-03, CU-04, CU-05, CU-06, CU-07, CU-10, CU-12, CU-13, CU-15
