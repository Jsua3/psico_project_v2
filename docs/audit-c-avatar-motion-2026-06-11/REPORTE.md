# Auditoría Fase C — escena por capas + avatar modular + movimiento fino (2026-06-11)

Ejecución completa de `docs/PROMPT_MAESTRO_FASE_C_ESCENA_AVATAR_MOVIMIENTO.md`.

## Evidencia

| Archivo | Qué muestra |
|---|---|
| `00-before-*.png/json` | Estado antes (editor con controles que mentían, pelo tapando ojos, sin overflow) |
| `01..04-personaje-*.png` | Editor: las 4 variantes reales de cabello aplicadas al avatar |
| `05-game-idle-down.png` | Idle frontal en la sala premium — cara visible, pies asentados |
| `06/07/08-game-walk-*.png` | Caminata izquierda/derecha/arriba — dirección y flip correctos |
| `09-game-collision-desk.png` | Colisión de pies contra el escritorio (vista de espaldas con pelo) |
| `10-game-dialogue.png` | Diálogo de herramienta abierto junto al marker |
| `11-mobile-explore.png` | Mobile 390×844 sin overflow |
| `12-final-measurements.json` | Sin overflow, sin errores de consola, sin 404, avatar guardado = avatar en Phaser |
| `avatar-preview.png` | Validador de assets: 4 variantes × 3 direcciones, composición final |
| `_debug_*.png` | Diagnóstico del defecto original (masa de pelo opaca sobre la cara; pies desalineados) |

## Hallazgos clave corregidos

1. **El cuerpo crudo traía los pies a alturas distintas por fila** (90/77/60 px):
   al cambiar de dirección el avatar saltaba. Se alinearon a y=90 en
   `tools/character-assets/process_modular_raw.py` (ROW_OFFSETS).
2. **La masa trasera de pelo es opaca**: pintada sobre el cuerpo tapaba la cara.
   Nuevo orden por fila: frente/lado → pelo-atrás DETRÁS del cuerpo; espalda →
   encima (`avatarRowLayerOrder`).
3. **Las "gorras" frontales (tied/red) venían para una cabeza más alta**: se
   comprimen verticalmente (ROW_SCALES 0.72/0.65) y se asientan en la línea de
   cejas.
4. **`persistPosition()` reemplazaba `world` con el eco del backend** y
   re-renderizaba la escena en plena caminata (tirón). Ahora persiste en
   silencio salvo cambio real de mapa.

## Validación

- `npm run build` ✓ · `npm test -- --runInBand` ✓ (31 suites / 158 tests)
- `python tools/character-assets/validate_modular_assets.py` ✓ (dimensiones,
  alpha, frames requeridos, alineación pelo↔cuerpo)
- `python tools/smoke-test/c_phase_audit.py --after` ✓ (RESULTADO: OK)
