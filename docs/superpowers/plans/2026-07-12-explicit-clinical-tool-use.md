# CLINICAL-APPLICATION-02 — plan de aplicación clínica explícita

**Fecha:** 2026-07-12
**Alcance:** `SIM-VBG-001`, desde una acción visible del estudiante hasta la evidencia autoritativa persistida.

## Brecha demostrada

El gate frontend actual considera suficiente que una herramienta esté en `inventory`, aunque el contrato de calidad exige distinguir adquisición de aplicación. Además, el seed canónico no ofrece elecciones `required_tool_code` para PAP ni para la valoración estructurada, por lo que el estudiante no dispone de una ruta UI explícita para generar un uso pertinente. El E2E integral anterior prueba adquisición, pero no aplicación.

## Task 1: Separar herramienta adquirida de herramienta aplicada

**Files:**

- Modify: `frontend/src/app/features/simulator/evidence-gating.config.ts`
- Modify: `frontend/src/app/features/simulator/evidence-gating.config.spec.ts`

- [x] Añadir requisitos `usedTools` independientes de `tools` adquiridas/revisadas.
- [x] Probar en rojo que PAP en inventario no satisface H1 y que `PAP@familia-crisis` sí.
- [x] Exigir uso de `RISK_METER` en C1/C3, manteniendo SPIKES como protocolo adquirido/revisado.
- [x] Mantener etiquetas de evidencia faltante compatibles con el override auditado.

## Task 2: Autorizar acciones clínicas visibles desde el contenido sembrado

**Files:**

- Modify: `backend_django/apps/simulation/management/commands/seed_caso_pdf.py`
- Modify: `backend_django/apps/simulation/tests/test_caso_pdf.py`

- [x] Extender las elecciones autoradas para soportar `required_tool_code` sin alterar las decisiones existentes.
- [x] Añadir “Aplicar PAP a la familia” en `familia-crisis` y “Aplicar valoración estructurada” en `sobreviviente-consulta`.
- [x] Probar que el seed enlaza el código real, que el servidor exige inventario/proximidad y que ambos usos se califican como pertinentes.
- [x] Conservar idempotencia: repetir la misma aplicación no duplica evento ni efecto.

## Task 3: Demostrar las aplicaciones en el recorrido UI

**Files:**

- Modify: `frontend/e2e/support/siep-flow.ts`
- Modify: `frontend/e2e/full-case.e2e.ts`

- [x] Añadir un helper que avance al grupo de opciones, elija una acción de herramienta visible y observe el `POST /tools/use` real.
- [x] Aplicar PAP sobre `familia-crisis` antes de H1 y afirmar `pertinent=true` más `PAP@familia-crisis` persistido.
- [x] Aplicar `RISK_METER` sobre `sobreviviente-consulta` antes de C1 y afirmar `pertinent=true` más la clave target persistida.
- [x] Reabrir el diálogo para decidir y conservar la prohibición de la rama “información incompleta”.

## Task 4: Gates y evidencia

**Files:**

- Modify: `docs/audits/2026-07-11-calidad-9-10-evidencia.md`

- [x] Ejecutar pruebas focalizadas rojo→verde, backend completo, frontend completo, build y `@full-case`.
- [x] Ejecutar el E2E completo para demostrar que el nuevo contenido no rompe los demás recorridos.
- [x] Verificar cleanup del proyecto Compose exacto y cero `attemptToken=` en artefactos.
- [x] Registrar que esta evidencia prueba el contrato de aplicación, no certifica la pertinencia clínica del contenido sin SME.

## Acceptance

- Recoger PAP sin usarla deja H1 con evidencia faltante.
- La acción visible aplica PAP a la familia y Django devuelve `pertinent=true`.
- Recoger el instrumento sin usarlo deja C1/C3 con evidencia faltante.
- La acción visible aplica la valoración a la sobreviviente y Django devuelve `pertinent=true`.
- El recorrido recomendado termina sin override y el informe conserva final integral.
- Todos los gates salen con código 0 y el runner no deja recursos propios.
