# Propuestas C, E, F, G y J como requisitos formales

Cada propuesta de [`docs/pendientes/propuestas/`](../../pendientes/propuestas) se convierte aquí en requisitos con el formato de la línea base (RF, RNF, RN y CU con ID, épica, actor, prioridad y origen), su **ubicación frente a la línea base**, criterios de aceptación, riesgos éticos y de privacidad, dependencias y las decisiones que bloquean, más preguntas cerradas para Psicología. Todo es **propuesta para decidir: nada está implementado**, y ningún requisito inventa funcionalidad que la propuesta no describa (lo que se completó va marcado `ASUNCION`; lo que exige concepto jurídico, `JURIDICO`).

- **Fuente:** propuestas del 2026-10-03; estado del código verificado el 2026-10-11 contra `master` (`5ad59d1`).
- **IDs:** esquema `SIEP-{RF,RNF,RN,CU}-X-nn` con X = C, E, F, G, J o 0 (Fase 0 compartida); ver [`../contraste-pn3/extensiones-siep.md`](../contraste-pn3/extensiones-siep.md) §A.
- **Decisiones numeradas del contraste:** «decisión N» remite a [`../contraste-pn3/conflictos-y-decisiones.md`](../contraste-pn3/conflictos-y-decisiones.md) §4.

## Qué hay

| Documento | Bloque | RF | RNF | RN | CU | Preguntas para Psicología |
|---|---|---:|---:|---:|---:|---:|
| [`fase-0-compartida.md`](fase-0-compartida.md) | Piezas previas comunes a C, E y F (0a a 0e) | 2 | 2 | 1 | — | — |
| [`bloque-c-requisitos.md`](bloque-c-requisitos.md) | **C** Diálogo «texto como señal», retratos e interrupciones | 9 | 9 | 9 | 5 | 11 |
| [`bloque-e-requisitos.md`](bloque-e-requisitos.md) | **E** Social Mapping (mapa guiado de la red de apoyo) | 9 | 8 | 9 | 5 | 15 |
| [`bloque-f-requisitos.md`](bloque-f-requisitos.md) | **F** Tensión verbal (entrevistas por turnos) | 9 | 6 | 9 | 4 | 10 |
| [`bloque-g-requisitos.md`](bloque-g-requisitos.md) | **G** Pistas, ayuda curada e IA opcional (RF-027) | 9 | 9 | 9 | 7 | 10 |
| [`bloque-j-requisitos.md`](bloque-j-requisitos.md) | **J** Segundo caso (consultorio) y generalización previa | 9 | 7 | 9 | 7 | 12 |
| [`impacto-en-la-linea-base.md`](impacto-en-la-linea-base.md) | Cruce de las cinco propuestas con la línea base (generado) | | | | | |

Total: 162 requisitos y casos de uso nuevos (47 RF, 41 RNF, 46 RN, 28 CU) y 58 preguntas cerradas para Psicología. `herramientas/validar_propuestas.py` comprueba la estructura (secciones, IDs únicos, prioridad y origen, criterios para cada RF y RN, citas del catálogo y de la línea base).

## Cómo se relacionan

| | Es dueño de | Lee de los otros | Dónde toca la línea base |
|---|---|---|---|
| **C** | Cómo se presenta el texto y el retrato (no guarda nada) | De F, opcional: banda de tensión | RF-17, RN-08 (etiqueta de emoción), RNF-04 |
| **E** | La red, las pistas halladas y las marcas del estudiante | Nada obligatorio | RF-21, RF-23, RF-25, RN-01, RN-08, RNF-08 |
| **F** | La tensión de cada conversación, su cierre y su reparación | De C: emoción y retratos; de E: pistas halladas | **RF-09 y RN-02** (varios intercambios dentro de una escena), RN-08 |
| **G** | Pistas autoradas, ayuda curada y la IA opcional | Nada | **RF-11 y RF-18** (la línea base obliga a las pistas), RN-08, RNF-04 |
| **J** | Generalización del cierre, aviso e introducción y el caso 2 | De G: la ayuda por caso | **RF-05..RF-11** (rol de autoría), RF-16, RF-22, RN-09 |

Ninguna propuesta escribe puntaje, estrés ni métricas. C, E, F y J no cambian el esquema de la base de datos (J deja los efectos y finales en código por caso, J-P15); solo G lo requiere, por las pistas por escena (ola 3.2 del contraste, decisión 13).

## Orden sugerido

1. **Fase 0** ([`fase-0-compartida.md`](fase-0-compartida.md)): 0a y 0b ya están en el panel; faltan 0c (escritor con bloqueo), 0d (tipos de evento) y 0e (regla de atajos). 0c coincide con la ola 5.4 del contraste (cerrojos y escrituras atómicas) y puede adelantarse.
2. **C fases 0–1** (emoción canónica y retratos), con Psicología redactando la entrevista de M1 (F) y los textos del mapa (E) en paralelo.
3. **E fases 1–2**, luego **F fases 1–2** (indicador en H1 y C1, entrevista piloto en M1), luego **C fase 2** (ritmo) y **E y F fases 3–4** (dibujo, vista docente, cierre y reparación).
4. **G**: la pista autorada (G-01 y G-02) es lo único obligatorio por la línea base y depende de la ola 3.2 del contraste; la ayuda curada necesita las 30–50 entradas de Psicología; la IA queda detrás del concepto jurídico.
5. **J**: la generalización (J-01 a J-06) no depende de Psicología y puede empezar ya; el caso 2 espera a las hojas de contenido y a la decisión de rol.

Estimación de la propuesta original: 45–75 días de Ingeniería para C, E y F (con la Fase 0), más 13–21 días de Psicología para redactar y validar contenido. G y J no la incluyen.

## Qué cambió desde las propuestas (vigencia)

Las propuestas son del 3 de octubre; al revisarlas contra `master` se corrigieron tres puntos (cada documento lo marca en su «Nota de vigencia»):

- **C:** el kit de personajes unificado (2026-10-09) ya trae el mapa emoción → retrato con cuatro estados y caída a `neutral`; la carpeta `portraits/` y el manifiesto v1 ya no existen. Los requisitos de C ahora **amplían el catálogo del kit** en lugar de crear otro contrato.
- **G:** la bandera `AI_ASSISTANT_ENABLED` nace apagada y la vista responde 404; hay pruebas. SIEP-RNF-G-01 ya está implementado.
- **J:** `decision_option_state` ya no envía la clasificación ni la conducta prohibida antes de decidir; J-P23 queda resuelta para ese punto.

## Reconciliaciones pendientes

- **C y F sobre M1:** SIEP-RF-C-07 y C-08 (ventana de intervención) solo existen si F no se aprueba (F-P1). Con F aprobado, C aporta solo presentación.
- **WCAG 2.1 o 2.2** (decisión 19 del contraste): C, E, F y G citan criterios de 2.2 (2.5.7, 2.5.8); por defecto se exige 2.1 AA.
- **G y la línea base:** la propuesta G no describe la autoría de pistas por el profesor; SIEP-RF-G-01 y G-02 se derivan de RF-11/RF-18 y de la decisión 13.
- **E:** la comparación con la lectura de referencia asume «tras decidir C3 o al cerrar el intento» (ASUNCION). El instrumento (Sluzki, Hartman) se cita de memoria: Psicología debe confirmarlo.
- **F:** los niveles 40/70/90 y el umbral de retraimiento 90/100 son `ASUNCION` por validar; el documento solo aplica a la Alternativa 2 (entrevista por turnos).
- **RN-08 (decisión 6):** las cinco propuestas la tensionan; todas asumen que la retroalimentación pedagógica se oculta hasta el cierre.

## Decisiones que bloquean el arranque

Las que desbloquean más trabajo, con su valor por defecto. El detalle de cada bloque está en su sección 10.

| # | Pregunta | Por defecto | Bloque |
|---|---|---|---|
| F-P1 | ¿Tensión verbal: medidor pasivo, entrevista por turnos o tiempo real? | Entrevista por turnos | F; condiciona C-07/08 |
| C-P9 | ¿Se aprueban los alias de emoción (`negative` = afligida, `positive` = serena…)? | Sí | C |
| E-P1 | ¿Panel pasivo, inventario de pistas o mapa guiado con lista primero? | Mapa guiado, solo lectura primero | E |
| F-P5 | ¿Quién redacta y valida los intercambios de las entrevistas? | Psicología escribe M1 y M9; revisión experta | F |
| C-P1 | ¿Es defendible dar estilo de habla solo a tres estados? | Sí | C |
| C-P2 / F-P14 | ¿Se le dice al estudiante en qué estado está la persona? | Sin etiqueta; indicador ocultable | C, F |
| E-P3 / E-P4 | ¿Aparecen la niña fallecida o la persona agresora en el mapa? | No | E |
| G-P1 / G-P2 | ¿Se reinterpreta RF-027 como ayuda contextual? ¿Quién autoriza enviar texto a un proveedor extranjero? | Sí, ayuda curada primero; sin IA sin concepto jurídico escrito | G |
| J-P1 | ¿El primer escenario es consultorio, hogar o seguimiento? | Consultorio de primera escucha | J |

## Regenerar y validar

Desde `docs/requisitos/propuestas/herramientas/`:

```bash
python -I validar_propuestas.py --carpeta .. --catalogo ../../contraste-pn3/extensiones-siep.md
python -I generar_impacto.py --carpeta .. --base ../../baseline-pn3 --salida .. --fecha AAAA-MM-DD
```
