# Auditoría final SIEP 9/10–10/10

- **Fecha:** 2026-07-12
- **Rama:** `codex/calidad-9-10`
- **Commit funcional evaluado:** `72e2326`

**Alcance certificado:** corte vertical completo `SIM-VBG-001`, sus contratos compartidos y los runners locales de verificación. Esta auditoría no extrapola automáticamente el resultado al contenido de otros casos.

## Dictamen

El alcance evaluado cumple la regla de terminación definida en el diseño: todas las dimensiones quedan en **9 o 10**, no hay P0/P1 conocidos abiertos y el gate live final pasa sobre un stack desechable sin dejar recursos ni secretos en artefactos.

| Dimensión | Nota | Evidencia que sostiene la nota | Por qué no se otorga más |
|---|---:|---|---|
| Seguridad operativa y aislamiento de datos | **10/10** | Bootstrap fail-closed, DSN/nonce/password efímeros, ownership Docker revalidado, token de intento en header y `no-store`; 82/82 pruebas de runner y 0 secretos en artefactos. Ver [evidencia de seguridad y cleanup](./2026-07-11-calidad-9-10-evidencia.md#evidencia-de-no-exposición-y-cleanup). | Cumple completa y directamente la meta definida para 10. |
| Confiabilidad y reproducibilidad | **10/10** | `check` sin incidencias; 220 backend, 319 frontend, build limpio, API 16/16 y Playwright 21/21; base y puertos aislados, un worker, cero retries y teardown verificado. Ver [evidencia final E2E-VERTICAL-02](./2026-07-11-calidad-9-10-evidencia.md#addendum-e2e-vertical-02--2026-07-12). | Cumple completa y directamente la meta definida para 10. |
| Integridad de autoridad de juego | **9/10** | Django decide entrada de puertas, hitbox, proximidad NPC, evidencia, aplicación pertinente y consecuencias; UI completa las cuatro rutas sin teleportación. Ver [GAME-SPATIAL-02b](./2026-07-11-calidad-9-10-evidencia.md#addendum-game-spatial-02b--2026-07-12) y [FULL-VERTICAL-01](./2026-07-11-calidad-9-10-evidencia.md#addendum-full-vertical-01--2026-07-12). | La aceptación live certifica `SIM-VBG-001`, no todos los mapas/casos posibles. |
| Calidad clínica y académica | **9/10** | PAP y valoración de riesgo se aplican a targets persistidos; evidencia incompleta deja override trazable; seis decisiones recomendadas producen final integral, 0 críticas e informe coherente. Ver [CLINICAL-LOOP-01](./2026-07-11-calidad-9-10-evidencia.md#addendum-clinical-loop-01--2026-07-12) y [CLINICAL-APPLICATION-02](./2026-07-11-calidad-9-10-evidencia.md#addendum-clinical-application-02--2026-07-12). | La validez profesional de textos y consecuencias requiere firma SME externa. |
| Accesibilidad | **9/10** | Foco/trap/inert, bloqueo unificado de input, teclado y touch reales; Axe WCAG 2.1 A/AA y geometría sin `serious`/`critical` en cuatro viewports y outcomes. Ver [A11Y-INPUT-01](./2026-07-11-calidad-9-10-evidencia.md#addendum-a11y-input-01--2026-07-12), [E2E-VERTICAL-01](./2026-07-11-calidad-9-10-evidencia.md#addendum-e2e-vertical-01--2026-07-12) y [E2E-VERTICAL-02](./2026-07-11-calidad-9-10-evidencia.md#addendum-e2e-vertical-02--2026-07-12). | Falta una sesión manual con lector de pantalla real. |
| UX, narrativa y legibilidad | **9/10** | Diálogo por intervención, foco restaurado, controles visibles, refresh/pausa/reanudación sin pérdida y cuatro recorridos sin bloqueos. Ver [NARRATIVE-01](./2026-07-11-calidad-9-10-evidencia.md#addendum-narrative-01--2026-07-12) y [E2E-PERSISTENCE-02](./2026-07-11-calidad-9-10-evidencia.md#addendum-e2e-persistence-02--2026-07-12). | No se ejecutó un estudio de usabilidad con participantes. |
| Rendimiento y mantenibilidad | **9/10** | Build de producción dentro de presupuestos y sin warnings; matriz/driver compartidos, estados autoritativos únicos y regresiones focalizadas. Ver [evidencia fresca final](./2026-07-11-calidad-9-10-evidencia.md#evidencia-fresca-final). | No se realizó perfil ETW/Lighthouse ni prueba de carga formal; no eran gates del corte. |
| Preparación de entrega | **9/10** | Caso completo reproducible en 1600×900, 1366×768, 390×844 y 412×915; evidencia actualizada, `last-run: passed`, 0 listeners/recursos/artefactos sensibles. Ver [E2E-VERTICAL-02](./2026-07-11-calidad-9-10-evidencia.md#addendum-e2e-vertical-02--2026-07-12). | Push, merge y despliegue no se ejecutaron; requieren autorización independiente. |

**Resultado agregado:** **74/80 = 9.25/10**.

**P0/P1 conocidos abiertos en el alcance:** **0**.

## Gates finales reproducibles

| Gate | Resultado |
|---|---|
| Scripts y guardas | **82/82** |
| Django system check | **0 incidencias** |
| Backend aislado | **220/220** |
| Frontend | **49/49 suites, 319/319 pruebas** |
| Build Angular de producción | **verde, sin warnings ni ampliación de presupuestos** |
| API/RBAC live | **16/16** |
| Playwright live sin filtro | **21/21 en 5 archivos**, 9.6 min, sin retries |
| Matriz integral | **4/4** viewports; teclado en escritorio y controles touch visibles en móvil |
| Axe/geometría | **4/4** estados parciales más outcome de cada ruta integral |
| Cleanup | **0** listeners, contenedores, redes, volúmenes, traces y coincidencias `attemptToken=` |

## Criterio de terminación

- [x] Suites de scripts, backend, frontend, API y Playwright con salida 0.
- [x] Build de producción limpio y sin warnings conocidos.
- [x] Cero procesos/puertos/recursos Compose propios después de los gates.
- [x] Cero `attemptToken` en targets, logs y artefactos comprobados.
- [x] Recorrido completo en cuatro viewports y Axe sin hallazgos bloqueantes.
- [x] Refresh y pausa conservan intento, posición, evidencia, uso pertinente y estado clínico.
- [x] Resultado e informe concuerdan con seis eventos recomendados y cero críticos.
- [x] Cada dimensión tiene 9 o 10 con evidencia enlazada.

## Límites externos y siguiente nivel

Los siguientes puntos no son P0/P1 de software ni invalidan el corte, pero impiden declarar 10/10 global: revisión SME firmada, sesión manual con lector de pantalla, prueba de usabilidad con participantes, perfil de rendimiento formal y repetición del mismo estándar para cada caso adicional. Deben tratarse como gates propios antes de una certificación institucional general.

**Decisión:** el objetivo **9/10–10/10 queda aprobado para el alcance `SIM-VBG-001` y los contratos compartidos evaluados**. No se declara despliegue ni certificación clínica institucional.
