# Juego 2.5D — Rebanada 7: Diálogo Expresivo + Mapa Social + Caja de Tensión Verbal

- **Fecha:** 2026-06-08
- **Estado:** Aprobado (control delegado total).
- **Iniciativa:** SIEP 2.5D pixel-art. Rebanada 7 de 7 — cierre de la iniciativa.
- **Repos:** **solo frontend.** Sin backend, sin migración.
- **Rama:** `feat/plan-maestro-total`.

## 1. Contexto

Tres subsistemas ya implementados en el branch, sin verificación formal:

| Subsistema | Commit | Archivo |
|---|---|---|
| DialogueEmotion (typewriter adaptativo + QTE) | `0484c8c` | `dialogue-panel.component.ts` |
| SocialMapComponent (inventario de pistas) | `89bb6e0` | `verbal-tension.component.ts` (¿?) |
| VerbalTensionBox (caja intervención real-time) | `b676f8d` | `verbal-tension.component.ts` |

Esta rebanada **no implementa código nuevo** — su objetivo es verificar, corregir regresiones y cerrar la iniciativa 2.5D con build limpio, tests verdes y smoke en vivo.

## 2. Objetivos

1. **DialogueEmotion verificado**: typewriter adaptativo (velocidad/color según emoción), retrato SVG del NPC, QTE de interrupción — visibles en smoke con `SIM-VBG-001`.
2. **SocialMapComponent verificado**: el panel de mapa social abre en HUD; los pistas se acumulan al interactuar con objetos/NPCs.
3. **VerbalTensionBox verificado**: la caja de tensión verbal aparece en el modo de intervención; los proyectiles azul/naranja funcionan; sin NaN ni crashes.
4. **Build limpio**: `ng build --configuration development` → 0 errores, 0 warnings nuevos.
5. **Jest suite verde**: `npm test` en `frontend/` → 0 failures, incluyendo todos los utils de rebanadas 2–6.
6. **Commit de cierre**: mensaje `chore(2.5d): cierre iniciativa — R2→R7 verificadas, build y tests verdes`.

## 3. Diseño de verificación

### 3.1 Build check

```bash
cd frontend && ng build --configuration development
```

Cualquier error de compilación se corrige en esta rebanada.

### 3.2 Jest check

```bash
cd frontend && npm test -- --watchAll=false
```

Tests que deben pasar:
- `depth-sort.util.spec` (R1)
- `stress-hearts.util.spec` (R2)
- `avatar-config.util.spec` + `avatar.store.spec` (R3)
- `outcome.util.spec` (R4)
- `dialogue-keys.util.spec` (R5)
- `hud-dock.util.spec` (si existe — R2/HUD)
- Cualquier spec nueva de R6

### 3.3 Smoke en Brave (permiso permanente del usuario)

1. Arrancar: `docker compose up -d db` → Django runserver 8091 → `npm start`.
2. Login estudiante `estudiante@psychosim.edu.co` / `Estudiante123!`.
3. **R2**: verificar HUD glass morado, corazones de estrés, marca SIEP.
4. **R3**: ir a `/portal/personaje`, cambiar avatar → guardar → recargar.
5. **R4**: completar o forzar fin de simulación → ver pantalla de resultados liquid-glass.
6. **R5**: abrir diálogo con NPC → panel morado, opciones numeradas, teclado 1-9.
7. **R6**: verificar vignette sutil; si hay NPC con `characterId` → sprite real animado.
8. **R7**: verificar que typewriter cambia velocidad/color según emoción; mapa social abre; caja de tensión verbal aparece en caso con intervención.

### 3.4 Correcciones

- Si DialogueEmotion tiene bugs → corregir en `dialogue-panel.component.ts`.
- Si SocialMapComponent tiene errores → corregir en su componente.
- Si VerbalTensionBox tiene NaN u otros crashes → ya existe `fix(verbal-tension): NaN guard`; verificar que aplica.
- Cualquier `ng build` warning nuevo → evaluar y corregir o documentar como conocido.

## 4. Criterios de aceptación

- `ng build` → 0 errores.
- `npm test` → 0 failures en frontend.
- Smoke: los 3 subsistemas (diálogo emocional, mapa social, caja de tensión) funcionan visualmente en `SIM-VBG-001`.
- Commit de cierre en el branch.
- **La iniciativa 2.5D queda completa**: R1→R7 implementadas, build verde, tests verdes.
