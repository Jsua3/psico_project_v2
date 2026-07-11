# SIEP 9/10–10/10 — diseño de cierre verificable

**Fecha:** 2026-07-11  
**Rama de trabajo:** `codex/calidad-9-10`  
**Alcance inicial:** un corte vertical completo y demostrable de `SIM-VBG-001`; no se generalizan patrones a todos los casos hasta que ese corte sea verde.

## 1. Objetivo y regla de puntuación

SIEP solo podrá recibir 9 o 10 en una dimensión cuando exista evidencia automatizada y, donde corresponda, evidencia live. Una compilación verde no sustituye un recorrido real. La puntuación objetivo es:

| Dimensión | Meta | Evidencia obligatoria |
|---|---:|---|
| Seguridad operativa y aislamiento de datos | 10 | bootstrap fail-closed, recursos Docker propios, secretos fuera de URLs, teardown verificado |
| Confiabilidad y reproducibilidad | 10 | suites limpias, cero warnings conocidos, runners deterministas |
| Integridad de autoridad de juego | 9 | movimiento, puertas, NPC, herramientas y consecuencias validados por servidor |
| Calidad clínica y académica | 9 | PAP realmente aplicado, decisiones incompletas trazables, reporte coherente |
| Accesibilidad | 9 | foco visible, overlays aislados, teclado/touch, Axe serious/critical = 0 |
| UX, narrativa y legibilidad | 9 | diálogo por intervención, estado persistente, cuatro viewports sin bloqueos |
| Rendimiento y mantenibilidad | 9 | build dentro de presupuestos actuales, una fuente de verdad por estado, pruebas focalizadas |
| Preparación de entrega | 9 | recorrido vertical E2E reproducible y documento de evidencia actualizado |

Un hallazgo P0/P1 sin cerrar limita su dimensión a 8 como máximo. Un riesgo externo (por ejemplo, texto clínico pendiente de SME) debe quedar marcado como externo y no puede fingirse resuelto.

## 2. Restricciones no negociables

- No tocar bases compartidas, producción, despliegues, push o merge sin una autorización adicional específica.
- `archivo.md` y `docs/PROMPT-ESTADO-SIEP-2026-07-10.md` son evidencia del usuario; no se editan ni se incluyen en commits.
- Cada cambio de comportamiento sigue rojo → verde → refactor y se entrega en un commit conceptual.
- No se registran JWT, tokens de intento, contraseñas ni URLs que los contengan.
- Toda limpieza Docker demuestra primero proyecto, checkout y montajes. Ante duda, aborta sin destruir.
- El caso inicial es `SIM-VBG-001`; los contratos nuevos pueden ser generales, pero la aceptación se prueba primero allí.

## 3. Arquitectura de cierre

### 3.1 Capa A — runner y datos fail-closed

Los scripts de desarrollo y pruebas compartirán guardas puras. El proyecto Compose de pruebas se derivará del checkout para evitar colisiones entre worktrees. PostgreSQL se publicará únicamente en `127.0.0.1`, recibirá una contraseña efímera por ejecución y siempre se desmontará en `finally`, después de volver a verificar ownership.

`db-bootstrap.mjs` no heredará `DATABASE_URL`. Antes de sembrar validará tanto el target esperado como la configuración efectiva que Django resolvería: host loopback, puerto publicado, nombre y usuario locales. La verificación no imprimirá credenciales.

Los binarios Node se invocarán con `process.execPath` y rutas locales a Angular/Playwright, siempre con `shell:false`. Puertos y argumentos tendrán validación explícita.

### 3.2 Capa B — credenciales de intento fuera de la URL

Los cuatro GET protegidos (`attempt`, `progress-map`, `world`, `completion-report`) recibirán el token mediante `X-SIEP-Attempt-Token`. El backend no leerá `attemptToken` del query string. Las respuestas privadas llevarán `Cache-Control: no-store`. Pruebas frontend y backend demostrarán que la URL no contiene el secreto y que una query heredada ya no autentica.

### 3.3 Capa C — interacción accesible y bloqueo de entrada

Habrá un único estado `inputBlocked` para cualquier overlay bloqueante. Cuando sea verdadero, movimiento, interacción, nudges y puertas son no-op. Todo diálogo modal tendrá foco inicial, trap bidireccional, fondo inerte y restauración de foco. El menú móvil cerrado será `inert` y `aria-hidden`.

La lista remota `sr-only` desaparecerá. La alternativa accesible será una región visible y contextual con solo interacciones cercanas aceptadas por la misma regla de proximidad. El estado de reduced motion combinará preferencia del SO y toggle interno y se propagará a CSS y Phaser.

### 3.4 Capa D — autoridad espacial y bucle clínico

La entrada de una puerta será dato del servidor, no coordenada del cliente. El servidor validará el rectángulo de hitbox del jugador completo. Los NPC ambientales tendrán posición/radio en el contrato y solo acreditarán evidencia tras respuesta 2xx del servidor.

Las herramientas distinguirán `collected`, `attempted` y `pertinentUsed`. PAP se aplicará explícitamente a un target autorado; poseerla no equivale a usarla. Una decisión que continúe con evidencia incompleta persistirá qué faltaba y que hubo override. El HUD se hidratará de métricas autoritativas tras bootstrap, decisión, refresh y resume.

### 3.5 Capa E — narrativa y gate vertical

El diálogo avanzará una intervención por vez. Enter/Espacio primero completa el typewriter y luego avanza; speaker, emoción y retrato cambian con la línea.

El gate final recorrerá UI y API reales: intento fresco → consentimiento → NPC cercano → PAP pertinente → familia → puerta → seis decisiones → pausa y refresh intermedios → mismo intento/estado → final e informe. La matriz obligatoria es `1600×900`, `1366×768`, `390×844` y `412×915`, con teclado y touch. Axe se ejecutará después de estados dinámicos y fallará ante violaciones serious/critical.

## 4. Orden de entrega

1. **SEC-RUN-01:** runners, DB, teardown y toolchain limpios.
2. **SEC-TOKEN-01:** token de intento en header y `no-store`.
3. **A11Y-INPUT-01:** foco, fondo inerte, bloqueo total de input, controles cercanos visibles y reduced motion efectivo.
4. **GAME-SPATIAL-02:** entradas canónicas, hitbox y NPC ambiental autoritativo.
5. **CLINICAL-LOOP-01:** PAP pertinente, override trazable y estado clínico hidratado.
6. **NARRATIVE-01:** diálogo por línea.
7. **E2E-VERTICAL-01:** recorrido completo, Axe y matriz responsive.

Cada entrega debe mantener verdes las anteriores. Si una prueba live descubre un defecto, primero se añade una regresión automatizada y luego se corrige.

## 5. Criterio de terminación

El objetivo no se considera completo por número de commits. Termina únicamente cuando:

- todas las suites unitarias, backend, frontend, API y Playwright salen con código 0 y sin warnings conocidos;
- al finalizar no quedan procesos/puertos/contenedores de prueba;
- no aparece `attemptToken` en request targets, logs o artefactos;
- el recorrido vertical se completa en los cuatro viewports y Axe no reporta serious/critical;
- refresh y pausa conservan intento, posición, evidencia, uso pertinente y consecuencias;
- el informe final concuerda con los eventos autoritativos;
- la auditoría final asigna 9 o 10 a cada dimensión con enlace a evidencia concreta.

