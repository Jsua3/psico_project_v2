# Reconstrucción 2× de personajes modulares — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir todas las piezas modulares del personaje a resolución 2× (frames 128×192) más nítidas manteniendo pixel-art, con las caras rehechas desde el arte huérfano `expressions/`, conservando el set actual como `modular-legacy/`.

**Architecture:** Re-masterización determinista: cada cuerpo/cabello parte del sheet actual escalado 2× (la alineación de los 9 frames se preserva por construcción) y se re-detalla; las caras se ensamblan desde `expressions/{expr}_{front,right}.png`. Higgsfield añade detalle solo sobre cuerpos/cabellos, con puerta de QC (IoU≥0.90) que descarta cualquier resultado que derive la silueta. Solo cambian constantes de código; la lógica de composición no se toca.

**Tech Stack:** Python 3.13 + Pillow + numpy (scripts en `tools/character-assets/`, venv de imagen en scratchpad), Angular 21 (constantes de render), Jest, Higgsfield MCP (`flux_kontext`, `remove_background`).

## Global Constraints

- **Se conserva la personalización modular** — piezas combinables por separado; NO se hornean personajes completos.
- **Resolución 2×:** hoja 384×576, frame 128×192. Fila 0 = frente, fila 1 = lado (**mira a la derecha**), fila 2 = espalda (sin cara).
- **Tamaño en pantalla sin cambios:** `AVATAR_DISPLAY_SCALE` 0.85 → 0.425; escalas `NPC_PRESET_RENDER` ÷ 2.
- **Legacy in-place:** `modular/` se copia a `modular-legacy/` (intocable); el arte nuevo ocupa las **mismas rutas y nombres** en `modular/`.
- **Invariante:** nunca generar los 9 frames desde cero; siempre partir del sheet actual escalado. La alineación se preserva por construcción y la valida `validate_modular_assets.py`.
- **Higgsfield acotado:** solo detalle sobre cuerpos/cabellos, con QC (IoU≥0.90 por frame vs determinista, borde limpio, paleta ≤32); si falla, se descarta y queda la determinista. Nunca para caras. Presupuesto ≤ 25 créditos.
- **Solo frontend/assets** (RNF-010 intacto): no se toca backend ni esquema.
- **Rama:** `feat/personajes-modulares-2x`. Commits en español, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Herramienta de imagen:** venv en `…/scratchpad/imgtool` (Pillow+numpy ya instalados). Los scripts de `tools/character-assets/` se corren con ese Python.
- Constantes de render actuales (a duplicar): `phaser-avatar-renderer.ts` `AVATAR_SHEET_WIDTH/HEIGHT=192/288`, `AVATAR_FRAME_WIDTH/HEIGHT=64/96`, `AVATAR_DISPLAY_SCALE=0.85`.

---

### Task 1: Legacy snapshot + validador extendido a 2×/66 hojas

**Files:**
- Create: `frontend/src/assets/characters/modular-legacy/**` (copia íntegra de `modular/`)
- Modify: `tools/character-assets/validate_modular_assets.py` (dims 2×, cubrir 66 hojas)

**Interfaces:**
- Produces: `validate_modular_assets.py` que valida contra `modular/` con `SHEET_SIZE=(384,576)`, `FRAME=(128,192)`, recorriendo los 12 cuerpos, 12 caras (filas frente+lado) y 42 cabellos. Devuelve exit 1 si falla algún criterio.

- [ ] **Step 1: Copiar el set actual a legacy y commitear**

```bash
cd "D:/Sua_Files/IdeaProjects/psico_project_v3/frontend/src/assets/characters"
cp -r modular modular-legacy
git add modular-legacy
git commit -m "chore(assets): snapshot legacy del set modular 1x antes de reconstruir 2x"
```

Esperado: `modular-legacy/` con las 126 imágenes idénticas a `modular/`.

- [ ] **Step 2: Extender el validador a 2× y a las 66 hojas**

En `validate_modular_assets.py`: cambiar `SHEET_SIZE=(384,576)`, `FRAME_W,FRAME_H=128,192`; reemplazar las listas fijas por descubrimiento de las 12 caras, 12 cuerpos y 42 cabellos reales. Añadir tolerancias escaladas ×2 (`MIN_FRAME_PIXELS=120`, `HAIR_CENTER_TOLERANCE=16`, `HAIR_TOP_RANGE=(-32,52)`). Mantener los checks de dimensiones, borde limpio, frames no-vacíos y alineación pelo↔cuerpo. Recorrer todos los cuerpos como referencia individual de su propio head (todos comparten silueta; validar cada cabello contra `body_orientadora_purple`).

- [ ] **Step 3: Correr el validador (debe fallar: aún no hay arte 2×)**

```bash
cd "D:/Sua_Files/IdeaProjects/psico_project_v3"
"…/scratchpad/imgtool/Scripts/python.exe" tools/character-assets/validate_modular_assets.py
```

Esperado: FAIL con "dimensiones 192x288 != 384x576" en todas las hojas (confirma que el validador ya exige 2×).

- [ ] **Step 4: Commit del validador**

```bash
git add tools/character-assets/validate_modular_assets.py
git commit -m "test(assets): validador modular a 2x y 66 hojas (rojo hasta reconstruir)"
```

---

### Task 2: Caras 2× desde `expressions/` (la gran ganancia)

**Files:**
- Create: `tools/character-assets/remaster_2x.py` (con la parte de caras)
- Modify: `frontend/src/assets/characters/modular/face/face_{12}.png` (reemplazo 2×)

**Interfaces:**
- Consumes: `modular-legacy/` (referencia de posición de cabeza), `modular-legacy/face/expressions/{expr}_{front,right}.png`.
- Produces: `build_faces()` en `remaster_2x.py` que escribe las 12 `face_{expr}.png` a 384×576. Expresiones: `neutral, happy, sad, angry, surprised, worried, sleepy, wink, crying, embarrassed, laughing, confused`.

- [ ] **Step 1: Medir la línea de cabeza del cuerpo de referencia**

En `remaster_2x.py`, función `head_anchor()`: cargar `modular-legacy/body/body_orientadora_purple.png` (192×288), tomar el frame frente (0,0,64,96), calcular bbox opaco; la cabeza es el tercio superior del bbox. Devolver, en coordenadas 2× del frame 128×192: `head_cx` (centro x×2) y `brow_y` (≈ top del bbox ×2 + ~24). Estos anclan la cara.

- [ ] **Step 2: Implementar `place_face(pose_img, head_cx, brow_y, frame)`**

Normaliza la carita (`expressions/{expr}_{pose}.png`) a un ancho objetivo (~46 px a 2×, proporcional), la centra en `head_cx` y sitúa su línea de ojos en `brow_y`; la compone sobre un frame 128×192 transparente. Devuelve el frame.

- [ ] **Step 3: Implementar `build_faces()`**

Para cada una de las 12 expresiones: hoja 384×576 transparente; fila 0 = `place_face({expr}_front)` en las 3 columnas; fila 1 = `place_face({expr}_right)` en las 3 columnas; fila 2 vacía. Guardar en `modular/face/face_{expr}.png`.

- [ ] **Step 4: Correr y validar las caras + inspección visual**

```bash
"…/imgtool/Scripts/python.exe" tools/character-assets/remaster_2x.py --faces
"…/imgtool/Scripts/python.exe" tools/character-assets/validate_modular_assets.py
```

Esperado: las 12 caras a 384×576, filas frente+lado no vacías, borde limpio. Generar un preview compuesto (cara sobre `body_orientadora_purple` escalado 2×) y **revisarlo visualmente**: la cara debe asentar sobre la cabeza (ojos en la línea de cejas), no flotar ni taparse. Iterar `brow_y`/ancho hasta que asiente.

- [ ] **Step 5: Commit**

```bash
git add tools/character-assets/remaster_2x.py frontend/src/assets/characters/modular/face
git commit -m "feat(assets): caras 2x reconstruidas desde el arte expressions/"
```

---

### Task 3: Cuerpos 2× re-masterizados

**Files:**
- Modify: `tools/character-assets/remaster_2x.py` (parte de cuerpos)
- Modify: `frontend/src/assets/characters/modular/body/body_{12}.png`

**Interfaces:**
- Consumes: `modular-legacy/body/*.png`.
- Produces: `build_bodies()` que reescribe los 12 cuerpos a 384×576.

- [ ] **Step 1: Implementar `remaster_sheet(src_192x288) -> 384x576`**

2× nearest-neighbor (preserva registro) → suavizado selectivo de bordes (mediana 3×3 solo en píxeles de borde, sin tocar interiores planos) → re-cuantización a la paleta propia de la pieza (`quantize`, ≤32 colores) → contorno 1px oscuro en el alfa. Alfa binarizado (sin semitransparencias).

- [ ] **Step 2: Implementar `build_bodies()`** — aplica `remaster_sheet` a los 12 cuerpos, escribe en `modular/body/`.

- [ ] **Step 3: Correr, validar y revisar**

```bash
"…/imgtool/Scripts/python.exe" tools/character-assets/remaster_2x.py --bodies
"…/imgtool/Scripts/python.exe" tools/character-assets/validate_modular_assets.py
```

Esperado: 12 cuerpos 384×576, validador de cuerpos verde; preview visual: más nítidos, sin pixeles gigantes toscos, silueta intacta.

- [ ] **Step 4: Commit**

```bash
git add tools/character-assets/remaster_2x.py frontend/src/assets/characters/modular/body
git commit -m "feat(assets): cuerpos 2x re-masterizados (deterministico)"
```

---

### Task 4: Cabellos 2× re-masterizados

**Files:**
- Modify: `tools/character-assets/remaster_2x.py` (parte de cabellos)
- Modify: `frontend/src/assets/characters/modular/hair/hair_{42}.png`

**Interfaces:**
- Consumes: `modular-legacy/hair/*.png`, `remaster_sheet` (Task 3).
- Produces: `build_hair()` que reescribe los 42 cabellos a 384×576.

- [ ] **Step 1: Implementar `build_hair()`** — aplica `remaster_sheet` a los 42 sheets (front+back de las 21 variantes), escribe en `modular/hair/`.

- [ ] **Step 2: Correr, validar (alineación pelo↔cuerpo) y revisar**

```bash
"…/imgtool/Scripts/python.exe" tools/character-assets/remaster_2x.py --hair
"…/imgtool/Scripts/python.exe" tools/character-assets/validate_modular_assets.py
```

Esperado: 42 cabellos 384×576; validador **completo verde** (las 66 hojas); preview compuesto por variante muestra el pelo asentado sobre la cabeza en las 3 direcciones.

- [ ] **Step 3: Commit**

```bash
git add tools/character-assets/remaster_2x.py frontend/src/assets/characters/modular/hair
git commit -m "feat(assets): cabellos 2x re-masterizados; validador 66 hojas verde"
```

---

### Task 5: Pasada opcional de detalle con Higgsfield + QC

**Files:**
- Create: `tools/character-assets/higgsfield_detail_pass.py` (QC gate)

**Interfaces:**
- Consumes: hojas deterministas de `modular/`, Higgsfield MCP.
- Produces: hojas con detalle SOLO si pasan QC; función `qc_gate(base_sheet, candidate_sheet) -> bool`.

- [ ] **Step 1: Implementar `qc_gate`** — IoU de máscara opaca por frame ≥ 0.90 (los 9 frames), borde de hoja 0 px opacos, paleta ≤ 32 colores. Devuelve True solo si TODO pasa.

- [ ] **Step 2: Biblia de estilo** — 1 generación Higgsfield de referencia de un personaje pixel-art nítido para calibrar el listón (documentar créditos usados).

- [ ] **Step 3: Pasada sobre 2-3 cuerpos representativos** vía `flux_kontext` (prompt: añadir sombreado/definición manteniendo layout de la hoja idéntico), `remove_background`, re-pixelar, `qc_gate`. Aceptar solo los que pasan; presupuesto ≤ 25 créditos, corte si se agota.

- [ ] **Step 4: Validar y commit (solo si algo pasó QC)**

```bash
"…/imgtool/Scripts/python.exe" tools/character-assets/validate_modular_assets.py
git add tools/character-assets/higgsfield_detail_pass.py frontend/src/assets/characters/modular
git commit -m "feat(assets): pasada de detalle Higgsfield con QC (solo lo que paso la puerta)"
```

Nota: si NINGÚN candidato pasa QC, se commitea solo el script (`higgsfield_detail_pass.py`) y las hojas quedan deterministas — resultado válido.

---

### Task 6: Constantes de código 2× + tests + smoke

**Files:**
- Modify: `frontend/src/app/features/simulator/phaser-avatar-renderer.ts`
- Modify: `frontend/src/app/features/simulator/npc-avatar-presets.ts`
- Modify: specs que referencien 192/288/64/96/0.85

**Interfaces:**
- Consumes: assets 2× ya en `modular/`.
- Produces: runtime que consume frames 128×192 a escala 0.425 (mismo tamaño en pantalla).

- [ ] **Step 1: Buscar todas las referencias a las dimensiones**

```bash
cd "D:/Sua_Files/IdeaProjects/psico_project_v3/frontend"
grep -rn "192\|288\|AVATAR_FRAME\|AVATAR_SHEET\|AVATAR_DISPLAY_SCALE\|0.85" src/app/features/simulator/phaser-avatar-renderer.ts src/app/features/simulator/*.spec.ts
```

- [ ] **Step 2: Actualizar constantes en `phaser-avatar-renderer.ts`**

`AVATAR_SHEET_WIDTH=384`, `AVATAR_SHEET_HEIGHT=576`, `AVATAR_FRAME_WIDTH=128`, `AVATAR_FRAME_HEIGHT=192`, `AVATAR_DISPLAY_SCALE=0.425`. Actualizar el docstring (192×288 → 384×576).

- [ ] **Step 3: Halvar escalas de NPC** en `npc-avatar-presets.ts` (`NPC_PRESET_RENDER`): cada `scale` ÷ 2.

- [ ] **Step 4: Actualizar specs afectados** a los nuevos valores; correr jest.

```bash
npm test -- --watch=false --runInBand
```

Esperado: verde (mismo nº de tests, valores 2× actualizados).

- [ ] **Step 5: Build + smoke en vivo**

```bash
npm run build
```

Smoke: `/portal/personaje` muestra piezas nítidas y combinables; el avatar camina en el mapa sin desalinearse; NPCs del caso a escala correcta. Sin errores de consola.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/simulator/phaser-avatar-renderer.ts frontend/src/app/features/simulator/npc-avatar-presets.ts frontend/src/app/features/simulator/*.spec.ts
git commit -m "feat(simulator): runtime a frames 2x (128x192, escala 0.425); mismo tamano en pantalla"
```

---

### Task 7: Galería comparativa nuevo vs legacy

**Files:**
- Create: hoja/HTML de comparación (Artifact)

**Interfaces:**
- Consumes: `modular/` (nuevo) y `modular-legacy/` (viejo).

- [ ] **Step 1: Componer contact sheets nuevo vs legacy** por categoría (cuerpos, caras, cabellos) y ensamblados, embebidos base64.

- [ ] **Step 2: Publicar Artifact** con identidad morada SIEP, secciones "antes (legacy) / después (2×)".

- [ ] **Step 3: Reporte final** — validador verde 66 hojas, jest/build verdes, smoke OK, créditos usados, y estado de la pasada Higgsfield (aceptada o descartada por QC).

---

## Seguimientos (fuera de alcance)

- Modo 8-direcciones usando las poses `left`/`q34*` de `expressions/` (ya presentes, sin usar).
- Consolidar cuerpos duplicados (`default`/`orientadora` ≈ morado) y diferenciar silueta male/female.
- Emoción `happy` en retratos de NPC (del spike anterior).
