# Auditoría live — Caso PDF multi-sala con efecto mariposa (2026-06-12)

Ejecución del checklist §12.3 del prompt maestro
(`docs/PROMPT_MAESTRO_CASO_PDF_MULTI_SALA_EFECTO_MARIPOSA.md`) contra el
navegador real (Chromium headless vía Playwright, `tools/smoke-test/caso_pdf_audit.py`),
con Django en `127.0.0.1:8091` y `ng serve` en `127.0.0.1:4201`.

**Resultado: 18/18 verificaciones OK · 0 errores de consola · 0 assets 404 ·
5/5 `enter-room` HTTP 200** (ver `mediciones.json`).

## Flujo verificado

| # | Paso (§12.3) | Evidencia | Resultado |
|---|---|---|---|
| 1-3 | Login → abrir simulador → iniciar caso PDF | — | OK |
| 4 | Sala inicial `hospital-urgencias` (HUD "Hospital — Urgencias") | `01-hospital-urgencias.png` | OK |
| 5-7 | Mover jugador (WASD) → prompt de puerta propio "E Sala de escucha familiar →" | `02-door-prompt.png` | OK |
| — | Puerta bloqueada: aviso con motivo ("habla con la familia en crisis"), SIN DialoguePanel | `02b-door-locked.png` | OK |
| — | Hablar con la familia en crisis (desbloquea por `requiresInspected`, validado backend) | `02c-familia-crisis.png` | OK |
| 8-9 | `E` cruza a `hospital-sala-escucha` (fade + banner de sala) | `03-hospital-sala-escucha.png` | OK |
| 10 | Volver a urgencias por la puerta de regreso | `04-door-return.png` | OK |
| 11 | Decisiones hospital H1 (PAP), H2 (459+1257), H3 (integral) con feedback formativo | `07-decision-feedback.png` | OK |
| 12 | Salida institucional desbloqueada solo tras el bloque hospitalario (`requiresNodes`) | — | OK |
| 13 | Transición temporal "Quince días después…" + llegada a `comisaria-recepcion` | `05-comisaria-recepcion.png` | OK |
| 18 | **Refresh en sala intermedia → sala persistida** (recepción tras reload) | `05b-refresh-persistencia.png` | OK |
| — | Revisar expediente (desbloquea consultorio, `requiresInspected` backend) | — | OK |
| 14 | Entrar a `comisaria-consultorio` | `06-comisaria-consultorio.png` | OK |
| 15 | Decisiones comisaría C1 (riesgo+protección+derechos), C2 (2126+1098+1257), C3 (integral) | — | OK |
| 16-17 | Cierre del caso → **Final 1 — Intervención Protectora Integral** con métricas del caso | `08-final.png` | OK |
| — | Mobile 390×844 sin overflow | `09-mobile.png` | OK |

## Mediciones

- Errores de consola: **0** (ver `mediciones.json`).
- 404 de assets: **0**.
- `POST /enter-room`: 5 llamadas, todas **200** (urgencias→escucha, escucha→urgencias,
  urgencias→escucha, escucha→recepción vía salida institucional, recepción→consultorio).
- Persistencia: tras `location.reload()` en recepción, el HUD volvió a mostrar
  "Comisaría de Familia — Recepción" (sala de puerta ≠ nodo DAG conservada vía
  `flags.syncedNodeId`).
- Cambiar de sala no puntúa ni avanza el DAG (cubierto además por
  `test_cambiar_sala_no_puntua_ni_avanza` en pytest).

## Finales (cubiertos por pytest, `apps/simulation/tests/test_caso_pdf.py`)

- Final 1 integral (live + test), Final 2 brechas, Final 3 riesgo persistente y
  Final 4 crítico/revictimizante (2 críticas o mediación con el agresor) — 124
  tests backend en verde.

## Notas

- En el primer run tras (re)iniciar `ng serve`, Vite puede re-optimizar deps y
  RECARGAR la página a mitad del juego (teletransporta al jugador al punto
  persistido). El script lo detecta (`page.on("load")`); ejecutar el audit con
  el dev server "caliente".
- Las opciones de decisión aparecen al completar el typewriter del diálogo: el
  audit usa el botón "Saltar".
