# Diseño: mobiliario pixel-art de las salas del caso

**Fecha:** 2026-07-10
**Estado:** Aprobado (brainstorming). Rama: `feat/arte-objetos-herramientas`.

## Objetivo

Reemplazar las primitivas vectoriales con que hoy se dibuja el mobiliario de las salas del caso por **sprites pixel-art**, generados con Higgsfield, para unificar el lenguaje visual de la sala con los props que ya se hicieron (herramientas, objetos de escenario, puertas).

## Contexto verificado

- El mobiliario de las salas del caso **no** usa tiles de Kenney: se dibuja con primitivas vectoriales en `case-pdf-rooms.renderer.ts` (`paintCounter`, `paintGurney`, `paintSofa`, `paintDesk`, `paintPlant`, …). Cada `paintX(scene, x, y, …)` crea su propio `Graphics`, con `contactShadow(...)` y profundidad `actorDepth(y + offset)`.
- Los tres tilesets de Kenney (RPG Urban Pack, Tiny Town, Tiny Dungeon) son de **exterior/mazmorra** y no tienen mobiliario clínico (camilla, mostrador de triage, archivador, sofá, estante). Por eso no se usan aquí; los frames `DESK`/`CHAIR`/`CABINET` de Tiny Dungeon solo son *fallback* tosco del camino procedural.
- Las colisiones viven en `CASE_ROOM_FURNITURE` (`case-pdf-rooms.geometry.ts`), espejo del `FURNITURE` del seed. **No se tocan**: el sprite es puramente visual.

## Perspectiva

Elevación frontal con volumen leve (3⁄4 suave), igual que las puertas y que el vector actual. Cae en el mismo hueco sin re-ubicar piezas y concuerda con las puertas de pared.

## Inventario (10 tipos, deduplicados por función de pintado)

| Clave | `paintX` | Salas | Footprint |
|---|---|---|---|
| `counter` | paintCounter | urgencias, recepción | 220×56 |
| `gurney` | paintGurney | urgencias | 110×46 |
| `waiting_chairs` | paintWaitingChairs | urgencias, recepción | 150×38 |
| `plant` | paintPlant | urgencias, consultorio | 44×40 |
| `sofa` | paintSofa | sala escucha | 130×64 |
| `coffee_table` | paintCoffeeTable | sala escucha | 90×36 |
| `shelf` | paintLowCabinet | sala escucha | 150×44 |
| `chair` | paintChair | sala escucha, consultorio | 56×36 |
| `file_cabinet` | paintFileCabinets | recepción, consultorio | 130×46 |
| `desk` | paintDesk | consultorio | 200×60 |

Las claves son por **tipo de mueble**, no por id del seed: las funciones de pintado ya están deduplicadas por función (un mismo `paintCounter` sirve a triage y a recepción).

## Alcance

### 1. Arte (Higgsfield)
- `z_image` (gratis) → `remove_background` → pixelado. Prompt por pieza: mueble pixel-art en elevación frontal, vista limpia, fondo plano, sin piso ni sombra.
- **Densidad de pixel consistente**: cada pieza se pixela a una resolución elegida según su footprint para que el tamaño de bloque quede parecido al de puertas/objetos (~1 art-px por px de pantalla). Se afina en la sonda.
- Assets en `frontend/src/assets/game/furniture/{counter,gurney,waiting_chairs,plant,sofa,coffee_table,shelf,chair,file_cabinet,desk}.png` (PNG RGBA).

### 2. Integración
- `furniture-sprite.util.ts`: `FURNITURE_SPRITE` (clave → asset), `resolveFurnitureTextureKey(key)`, `furnitureSpriteSpecs()`. Test unitario.
- `game-world.component.ts`: precargar `furnitureSpriteSpecs()` junto a objetos y puertas.
- `case-pdf-rooms.renderer.ts`: un helper `paintFurnitureSprite(scene, key, x, y, footprintW, feetY): boolean` que —si la textura existe— dibuja `contactShadow` + `add.image` escalada al footprint, al `actorDepth` correcto, y devuelve `true`. Cada `paintX` empieza con `if (paintFurnitureSprite(...)) return;` y conserva su cuerpo vectorial como **fallback**.

### 3. Sonda primero (sala de urgencias)
Generar y cablear **4 piezas** —`counter`, `gurney`, `waiting_chairs`, `plant`— y verlas antes de las otras 6. Valida estilo, footprint, profundidad y sombra con poco gasto. Si convence, se sigue con el resto (`sofa`, `coffee_table`, `shelf`, `chair`, `file_cabinet`, `desk`).

### 4. Verificación
- Montaje de cada pieza a su footprint real antes de cablear.
- `jest` verde (resolver) · `ng build` OK · assets servidos (200).
- Smoke: los muebles se ven pixel-art en la sala, asentados (sombra) y con la profundidad correcta respecto al jugador; la interacción y las colisiones intactas.

## No-objetivos
- No se toca el seed, el esquema ni las colisiones (`CASE_ROOM_FURNITURE`): el sprite es visual y se dimensiona al footprint existente.
- No se anima el mueble.
- No se rediseña la disposición de las salas: mismas piezas en las mismas posiciones.
- No se toca el mobiliario del camino procedural (fallback Kenney), fuera de las salas del caso.
