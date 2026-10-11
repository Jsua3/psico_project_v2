# Documentación de SIEP

Índice de `docs/`. La entrada general del proyecto (arranque, rutas de la API, solución de problemas) es el [`README.md`](../README.md) de la raíz.

## Dónde está cada cosa

| Carpeta o archivo | Qué contiene |
|---|---|
| [`PROMPT_MAESTRO.md`](PROMPT_MAESTRO.md) | **Documento maestro único y vigente**: producto, stack, arquitectura, cómo funciona hoy, reglas, seguridad, calidad, estado y cómo trabajar (corte 2026-10-11) |
| [`PLAN_MAESTRO_TOTAL.md`](PLAN_MAESTRO_TOTAL.md) | Plan maestro por bloques, con las reglas de oro del proyecto (REGLA-00x), la auditoría de estado y el orden de ejecución |
| [`arquitectura/`](arquitectura) | Estrategia de stack, dueño del esquema de la base de datos y despliegue |
| [`requisitos/`](requisitos) | Requisitos de negocio (`RQ-NEG`), funcionales (`RF`) y no funcionales (`RNF`) y las técnicas de elicitación aplicadas, con su CSV de cada grupo. [`baseline-pn3/`](requisitos/baseline-pn3) es la **línea base académica unificada** de la carrera (26 RF, 8 RNF, 11 RN, 15 CU) y [`PROMPT_SESION_REQUISITOS_PN3.md`](requisitos/PROMPT_SESION_REQUISITOS_PN3.md) el prompt de la sesión que la contrasta con el sistema. [`contraste-pn3/`](requisitos/contraste-pn3) es ese contraste: matriz de cumplimiento de los 60 ítems con evidencia, conflictos y decisiones, glosario y catálogo de extensiones propias de SIEP con su tabla de equivalencias |
| [`diseno/`](diseno) | Diseños vigentes: personajes unificados, orientación y jugabilidad, arte de las puertas y consentimiento antes de contenido sensible (ETH-01) |
| [`visual/`](visual) | Biblia visual y láminas de revisión del arte (las genera `npm run kit:laminas` y `npm run world-art:laminas`) |
| [`operacion/`](operacion) | Despliegue en Railway |
| [`pendientes/`](pendientes) | Lo que quedó sin decidir o sin hacer: las propuestas C, E, F, G y J para la BETA (`propuestas/`) y las deudas abiertas (`deudas/`) |
| [`informes/`](informes) | Informes y auditorías de las sesiones de octubre: brechas del plan maestro, diagnóstico de jugabilidad, revisión adversarial, pase visual |
| [`historico/`](historico) | Documentos de la era Java/Spring que `PLAN_MAESTRO_TOTAL.md` y los informes citan como origen de requisitos y de la numeración `RQ-NEG` |
| [`diseñosistemas_docs/`](diseñosistemas_docs) | Material de la materia «Análisis y diseño de sistemas»: serie de patrones, antipatrones y SOLID, con su evidencia. Tiene su propio [índice](diseñosistemas_docs/README.md) |

## Ciclo de vida de los documentos

Para que la carpeta no vuelva a llenarse de material que ya cumplió su trabajo:

| Tipo | Dónde vive | Cuándo se retira |
|---|---|---|
| Plan de implementación | En la rama de trabajo, no en `master` | Al ejecutarse: lo que importa queda en el código, las pruebas y el historial de commits |
| Diseño (spec) | [`diseno/`](diseno) | Cuando describe algo que ya no existe o lo reemplaza otro diseño |
| Propuesta | [`pendientes/propuestas/`](pendientes/propuestas) | Cuando el equipo decide: pasa a `diseno/` si se aprueba, se borra si se descarta |
| Informe o auditoría de sesión | [`informes/`](informes) | Cuando su trabajo está cerrado y ningún documento vigente lo cita |
| Capturas y salidas de herramientas (JSON, PNG) | Junto al informe que las cita | Con ese informe; si ninguno las cita, no se versionan |

## Recuperar algo retirado

Todo lo que se retira sigue en el historial de Git. La limpieza del 2026-10-10 parte del commit `9931599`; para leer un archivo retirado:

```bash
git show 9931599:docs/superpowers/plans/2026-10-08-personajes-unificados-4-integracion-master.md
```

Los documentos que mencionan archivos retirados lo avisan en una nota al inicio.
