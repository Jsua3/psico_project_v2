# Fase 0 compartida de las propuestas C, E y F (requisitos)

> Las tres propuestas de la familia «señal y vínculo» (C diálogo, E mapa de la red, F tensión verbal) comparten cinco piezas previas. Se redactan **una sola vez** aquí con el bloque `0` y cada propuesta las cita por su código (0a a 0e). Fuente: [`propuestas-c-e-f-resumen.md`](../../pendientes/propuestas/propuestas-c-e-f-resumen.md) (2026-10-03) y verificación del estado actual en el código de `master` (2026-10-11). Estimación original de la Fase 0: 6 a 10 días de Ingeniería, contados una sola vez.

## Requisitos

| ID | Código | Tipo | Nombre | Descripción | Prioridad | Estado | Línea base relacionada |
|---|---|---|---|---|---|---|---|
| SIEP-RNF-0-01 | 0a | RNF | Movimiento reducido en el panel de diálogo | El panel de diálogo debe respetar el interruptor de «movimiento reducido» del juego en toda animación que añadan los bloques C, E y F | Alta | Implementado (el panel recibe `reduceMotion`; cubierto en `dialogue-panel.component.spec.ts:138,176`) | RNF-04 |
| SIEP-RF-0-01 | 0b | RF | Pausa segura visible y reutilizable | El sistema debe mostrar un único botón visible de «Pausa segura», reutilizable en el panel de diálogo y en toda pantalla nueva, que pause el intento sin cerrarlo | Alta | Implementado en el panel (`SafeExitButtonComponent` en `dialogue-panel.component.ts:16,49`); falta exigirlo a las pantallas nuevas | RF-19; `SIEP-RF-01`, `SIEP-RN-01` |
| SIEP-RNF-0-02 | 0c | RNF | Escritor único con bloqueo del estado del caso | El sistema debe actualizar el estado del caso que guardan E y F mediante un único escritor con bloqueo, de modo que dos peticiones simultáneas no se pisen | Alta | Propuesto | RNF-08 (integridad; hoy sin cerrojos, ver `contraste-pn3` RNF-08) |
| SIEP-RF-0-02 | 0d | RF | Tipos de evento extensibles en la línea de tiempo docente | El docente debe poder ver en la línea de tiempo de un intento los eventos de los bloques nuevos (marcas de la red, turnos de entrevista) sin que cada bloque implemente un camino de registro propio | Media | Propuesto | RF-21, RF-25, CU-14 |
| SIEP-RN-0-01 | 0e | RN | Atajos de una sola tecla | No se añade ningún atajo de una sola tecla nuevo sin revisarlo contra WCAG 2.1.4 (poder desactivarlo, reasignarlo o limitarlo al foco del componente) | Alta | Propuesto (regla de proceso; hoy J, E y WASD son globales y sin ajuste: RNF-04) | RNF-04 |

## Criterios de aceptación

| ID | Criterio (Dado / Cuando / Entonces) | Cómo se prueba |
|---|---|---|
| SIEP-RNF-0-01 | Dado el interruptor de movimiento reducido activo, cuando se abre el panel con la animación de un bloque nuevo, entonces la animación no se reproduce y el contenido aparece de inmediato | Prueba de componente con `reduceMotion = true` |
| SIEP-RF-0-01 | Dado cualquier pantalla de bloque nuevo abierta, cuando el estudiante pulsa «Pausa segura», entonces el intento queda en pausa (no cerrado) y puede reanudarse con el mismo identificador | Prueba e2e de la pantalla y prueba de servicio de pausa |
| SIEP-RF-0-01 | Dado un diálogo abierto, cuando se pulsa Esc una vez, entonces el estudiante llega a una salida segura sin necesitar pulsar dos veces | Prueba de componente (hoy la pantalla ya expone el botón; verificar el teclado) |
| SIEP-RNF-0-02 | Dadas dos peticiones simultáneas que modifican el estado del caso del mismo intento, cuando ambas terminan, entonces ambas escrituras quedan reflejadas y ninguna se pierde | Prueba de concurrencia con dos transacciones sobre el mismo intento |
| SIEP-RF-0-02 | Dado un evento de un bloque nuevo registrado, cuando el docente abre la traza del intento, entonces aparece en la línea de tiempo con su etiqueta, sin cambios en el código de la traza | Prueba de contrato de la traza con un tipo de evento de prueba |
| SIEP-RN-0-01 | Dado un atajo de una tecla nuevo, cuando se revisa el cambio, entonces existe un modo de desactivarlo o limitarlo al foco y consta en la descripción del PR | Revisión de PR; lista de verificación de accesibilidad |

## Dependencias

- 0a y 0b ya están en el panel, de modo que **no bloquean** el arranque de C. Lo que falta de 0b es la **regla** de que toda pantalla nueva lo incluya.
- 0c es previo a E fase 1 y a F fase 1 (los dos escriben el estado del caso). Depende de la decisión sobre cerrojos del contraste (ola 5.4 de `conflictos-y-decisiones.md`) y se puede adelantar a la ola 0 sin esperar decisiones de producto.
- 0d es previo a la vista docente de E y F (fases 3 y 4).
- 0e es una regla de revisión: no requiere código.
