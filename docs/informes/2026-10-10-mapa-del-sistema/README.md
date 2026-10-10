# Relevo de la sesión del 2026-10-10: mapa del sistema, línea base PN3 y taller de DSL

> **Estado:** trabajo interrumpido por el límite semanal de uso. Esta carpeta conserva todo lo que existía en ese momento para que otra sesión continúe sin rehacerlo. Las secciones del mapa son **borradores de lectores con evidencia, sin la verificación adversarial completa**: úsalas como punto de partida y verifica antes de afirmar.

## Qué hay aquí

| Ruta | Contenido | Estado |
|---|---|---|
| `secciones/*.md` | 13 áreas del sistema vigente (usuarios, grupos, autoría, simulación, evaluación y reportes, plataforma, stack, portal, editor, simulador, calidad, contenido, plan y pendientes) con evidencia `ruta:línea` | Escritas por lectores; verificación en curso al interrumpirse (pueden contener imprecisiones) |
| `herramientas/wf1-mapa.js` | Workflow que produce las 13 secciones y las verifica con dos lentes (literalidad y contraejemplos) y corrige | Detenido a media verificación |
| `herramientas/wf2-linea-base-s55.js` | Workflow que contrasta los 26 RF, 8 RNF, 11 RN y 15 CU con el código (10 evaluadores, 2 lentes por grupo, 4 síntesis: matriz, conflictos y decisiones, glosario, extensiones) | Evaluadores terminados; verificación y síntesis sin terminar |
| `herramientas/wf3-documento-maestro.js` | Workflow que redacta (4 partes), ensambla, revisa (3 lentes) y corrige el documento maestro unificado en `docs/PROMPT_MAESTRO.md` | No se lanzó: necesita las secciones verificadas |
| `herramientas/wf4-taller-dsl.js` | Workflow del taller de DSL: Fase 1 (UML), Fase 3 (JSON + Schema), Fase 4 (escenarios + validador + pruebas), 3 revisores y corrección | Ver `docs/diseno/dsl/` si llegó a terminar |
| `herramientas/xlsx_dump.py`, `tsv_to_md.py`, `docx_dump.py` | Volcado del Excel y del docx a texto y de TSV a Markdown (solo biblioteca estándar) | Usables |
| `herramientas/limpieza.mjs`, `dangling.mjs` | Herramienta de la limpieza del repositorio (movimientos con reescritura de enlaces) y buscador de menciones colgadas | Referencia |
| `herramientas/taller_dsl_enunciado.txt` | Texto del taller de DSL extraído del docx | Fuente |

## Cómo continuar

1. Lee `docs/requisitos/PROMPT_SESION_REQUISITOS_PN3.md`: es el prompt maestro de la sesión siguiente (frentes, método, decisiones y trampas).
2. Para volver a correr un workflow, edita las constantes `ROOT` y `SCRATCH` del script, deja `model: 'claude-sonnet-5-5'` en cada `agent()` y lanza con `Workflow({scriptPath: ...})`. `resumeFromRunId` solo funciona dentro de la misma sesión.
3. Orden sugerido: (a) verificar y entregar el taller de DSL (urgente); (b) terminar el contraste con la línea base (`wf2`); (c) redactar el documento maestro unificado (`wf3`) cuando las secciones estén verificadas; (d) propuestas C/E/F/G/J.
