# Diseño: Reconstrucción 2× de los personajes modulares de SIEP

**Fecha:** 2026-07-08
**Estado:** Aprobado (brainstorming). Siguiente paso: plan de implementación.
**Rama:** `feat/personajes-modulares-2x` (sobre `feat/spike-retratos-npc-higgsfield`)
**Enfoque elegido:** A — re-masterización determinista 2× + expressions como caras + Higgsfield como director de arte acotado.

## 1. Objetivo

Reconstruir todas las piezas modulares del personaje (cuerpos, caras, cabellos) para que se vean **más nítidas y detalladas manteniendo el pixel-art**, aplicando por fin el arte huérfano de `expressions/` como las caras reales. El set actual se conserva **íntegro como legacy** (no se borra nada). Higgsfield se usa como herramienta de diseño de forma **acotada y con puerta de control de calidad**, no como generador ciego.

### Decisiones de brainstorming (vinculantes)

1. **Se conserva la personalización modular** — el estudiante sigue combinando cuerpo + cara + cabello por separado. NO se hornean personajes completos. El sistema de capas de 9 frames se mantiene.
2. **Resolución lógica 2×** — frames de 128×192 (hoja 384×576) en vez de 64×96 (192×288). La cabeza pasa de ~16px a ~32px, tamaño mínimo para que una cara real se lea. El tamaño **en pantalla no cambia**: se reduce a la mitad la escala de render.
3. **Legacy por carpeta + reemplazo in-place** — `modular/` se copia íntegra a `modular-legacy/` (commit propio, intocable); el arte nuevo ocupa las **mismas rutas y nombres** en `modular/`. El código no cambia rutas, solo constantes de tamaño. Rollback = restaurar carpeta + revertir constantes.

## 2. Contexto verificado del sistema

- Cada pieza es un spritesheet de 192×288 = 3 columnas (frames de caminata) × 3 filas (direcciones): fila 0 = frente (down), fila 1 = lado (**mira a la derecha**), fila 2 = espalda (up). Frame 64×96.
- Composición por fila (`phaser-avatar-renderer.ts` `avatarRowLayerOrder`): frente/lado → `hairBack, body, face, hairFront`; espalda → `body, hairBack, hairFront` (sin cara).
- Constantes de render (`phaser-avatar-renderer.ts`): `AVATAR_SHEET_WIDTH/HEIGHT = 192/288`, `AVATAR_FRAME_WIDTH/HEIGHT = 64/96`, `AVATAR_DISPLAY_SCALE = 0.85`. NPC: `NPC_PRESET_RENDER` con escalas 0.72–0.84.
- El editor DOM (`avatar-figure.component.ts`) muestra las piezas con `background-size: 300% 300%` (porcentajes) → **resolución-independiente, cero cambios**.
- Inventario actual: 12 cuerpos, 12 caras (`face_{expr}.png`), 42 cabellos (21 frente + 21 espalda), 60 caritas `expressions/` (12 expresiones × 5 poses: `front, left, q34left, q34right, right`), + `expresiones.png` fuente.
- Herramientas existentes en `tools/character-assets/`: `process_modular_raw.py` (pipeline crudo→procesado, con `ROW_OFFSETS`/`ROW_SCALES` de calibración) y `validate_modular_assets.py` (valida 8 hojas: 1 cuerpo, 3 caras, 4 cabellos). Los crudos originales (`docs/character-modular-raw/`) ya no existen.

## 3. Reconstrucción por categoría

| Categoría | Fuente | Técnica |
|---|---|---|
| **Caras (12)** | Las 60 `expressions/` huérfanas | Reconstrucción determinista: `{expr}_front.png` → fila 0 (×3 columnas idénticas), `{expr}_right.png` → fila 1 (lado, mira a la derecha, ×3), fila 2 vacía. Cada carita se normaliza a un ancho de cabeza objetivo y se **ancla a la línea de cejas** del cuerpo (calibración reusada del pipeline original). Las poses `left`/`q34*` quedan documentadas como reserva para un futuro modo 8-direcciones (no se usan ahora). Sin Higgsfield. |
| **Cuerpos (12)** | Los sheets actuales | Re-masterización determinista: 2× nearest-neighbor (preserva alineación de los 9 frames por construcción) → suavizado selectivo de escaleras → re-cuantización a la propia paleta de la pieza → contorno 1px → **pasada opcional Higgsfield con QC**. |
| **Cabellos (42)** | Los sheets actuales | Igual que cuerpos. Los 5 colores por estilo se re-derivan por mapeo de tono desde la mejor forma base de cada estilo, para consistencia de silueta entre colores. |

**Invariante crítico:** la reconstrucción **nunca** parte de generar los 9 frames desde cero (la IA no mantiene registro entre frames). Siempre parte del sheet actual escalado, cuyo registro ya es válido. La alineación se preserva por construcción; el validador lo confirma.

## 4. Pipeline y estructura de archivos

- **Crear** `tools/character-assets/remaster_2x.py`: reconstrucción determinista (cuerpos/cabellos) + ensamblado de caras desde `expressions/`. Idempotente; lee de `modular-legacy/` y escribe en `modular/`.
- **Crear** `tools/character-assets/higgsfield_detail_pass.py`: orquesta las pasadas opcionales de Higgsfield sobre hojas de cuerpo/cabello, con la puerta de QC (ver §5). Fuera del build; se corre a mano.
- **Extender** `tools/character-assets/validate_modular_assets.py`: a 2× (384×576, frame 128×192) y a las **66 hojas** (12 cuerpos + 12 caras × filas frente/lado + 42 cabellos), no solo 8. Mantiene los checks de borde limpio, frames no vacíos y alineación pelo↔cuerpo.
- **Copiar** `frontend/src/assets/characters/modular/` → `modular-legacy/` (commit propio).
- **Modificar** `phaser-avatar-renderer.ts` (constantes) y `npc-avatar-presets.ts` (`NPC_PRESET_RENDER` escalas ÷2) — ver §6.

## 5. Rol de Higgsfield (acotado, con puerta de QC y presupuesto)

1. **Biblia de estilo:** 1–2 generaciones de referencia para fijar paleta/contraste/nivel de detalle objetivo. Guía el suavizado y la cuantización deterministas.
2. **Pasadas de detalle** sobre cuerpos/cabellos vía `flux_kontext` (editar manteniendo el layout de la hoja): añadir sombreado/definición sin mover la silueta.
3. **Puerta de QC automática** por cada resultado de Higgsfield, antes de aceptarlo:
   - IoU de silueta por frame ≥ **0.90** contra la versión determinista (garantiza que no derivó la alineación),
   - borde de la hoja limpio (0 px opacos),
   - paleta ≤ **32** colores.
   - Si falla cualquier criterio → se **descarta** y queda la versión determinista. La versión determinista es siempre el piso garantizado.
4. **Nunca** para caras (el arte huérfano es la fuente) ni sin pasar por QC.
5. **Presupuesto:** ≤ **25 créditos** de los ~97 restantes; corte duro si se agota (se continúa solo con lo determinista). El trial se auto-renueva a $49/mes salvo cancelación — nota operativa, no técnica.

## 6. Cambios de código (contenidos)

Solo constantes y tests; ninguna lógica de composición cambia.

- `phaser-avatar-renderer.ts`:
  - `AVATAR_SHEET_WIDTH = 384`, `AVATAR_SHEET_HEIGHT = 576`
  - `AVATAR_FRAME_WIDTH = 128`, `AVATAR_FRAME_HEIGHT = 192`
  - `AVATAR_DISPLAY_SCALE = 0.425` (0.85 ÷ 2 — **el tamaño en pantalla se conserva**)
- `npc-avatar-presets.ts`: cada escala de `NPC_PRESET_RENDER` ÷ 2 (0.72→0.36 … 0.84→0.42).
- Tests que referencien 192/288/64/96 (specs de `phaser-avatar-renderer`, world) → actualizar a los valores 2×.
- El editor DOM (`avatar-figure.component.ts`) **no cambia** (usa porcentajes).

## 7. Verificación

- `validate_modular_assets.py` extendido en **verde** para las 66 hojas (dimensiones 2×, borde limpio, frames no vacíos, alineación pelo↔cuerpo dentro de tolerancia).
- **jest** verde (con las constantes 2× actualizadas) · **ng build** verde.
- **Smoke en vivo:** editor de personaje (`/portal/personaje`) muestra las piezas nítidas y combinables; el avatar camina en el mapa sin desalinearse; los NPC del caso se renderizan a escala correcta.
- **Galería Artifact** actualizada: "nuevo vs legacy" lado a lado por categoría, y las caras nuevas (desde expressions) vs las viejas.

## 8. Secuencia (commits atómicos)

1. **Legacy + scaffolding + validador 2×:** copiar `modular/`→`modular-legacy/`; extender el validador a 2×/66 hojas (aún rojo, sin arte nuevo).
2. **Caras desde `expressions/`** (la gran ganancia): `remaster_2x.py` ensambla las 12 caras 2×; validador de caras en verde.
3. **Cuerpos:** re-masterización determinista 2× de los 12 cuerpos; validador en verde.
4. **Cabellos:** los 42; validador en verde.
5. **Pasada Higgsfield opcional** sobre cuerpos/cabellos con QC (dentro de presupuesto); solo se aceptan los que pasan la puerta.
6. **Constantes de código + tests + smoke:** actualizar `phaser-avatar-renderer.ts` y `npc-avatar-presets.ts`; jest/build verdes; smoke en vivo.
7. **Galería comparativa** nuevo vs legacy.

## 9. No-objetivos

- No se hornean personajes completos (se conserva la personalización modular).
- No se generan los 9 frames de caminata con IA desde cero (mal fit; la fuente es siempre el sheet actual escalado).
- No se añade un modo 8-direcciones ahora (las poses `left`/`q34*` de expressions quedan como reserva documentada).
- No se toca el backend ni el esquema (RNF-010): esto es puramente frontend/assets.
- No se borra ni modifica `modular-legacy/` una vez copiada.

## 10. Riesgos y mitigaciones

- **La cara no asienta sobre la cabeza a 2×** → medir la línea de cejas del cuerpo escalado y anclar ahí; el validador de frames no-vacíos + un check de posición de cara lo detecta. Iterar el anclaje en la tarea de caras antes de seguir.
- **El escalado 2× NN se ve tosco (pixeles enormes)** → el objetivo es más detalle, no pixeles más grandes; el re-detallado (suavizado + re-cuantización) y, si aporta, la pasada Higgsfield con QC añaden definición dentro de la nueva rejilla. La biblia de estilo fija el listón.
- **Higgsfield deriva la silueta** → la puerta de QC (IoU ≥ 0.90) lo descarta automáticamente; la versión determinista es el piso.
- **Regresión de alineación en el juego** → el validador extendido + el smoke en vivo (caminar en el mapa) son gates antes de declarar hecho.
