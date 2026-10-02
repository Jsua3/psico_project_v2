# Kit de personajes SIEP (prueba)

Estado: **prueba** del método A (kit por código) con un solo personaje, Valentina.
El formato definitivo se fija en el spec; este directorio no se publica en el build
(está fuera de `src/assets`).

## Piezas del método

| Qué | Dónde | Qué es |
|---|---|---|
| Maniquí | `mannequins/complexion-a.mjs` | Grillas de píxel por vista (cabeza, cuello, torso, pelvis, manos, pies) y un rig por cuadro: `bob`, respiración y articulaciones de brazos y piernas. |
| Busto | `portraits/bust-a.mjs` | Maniquí del retrato (96×96), mismo lenguaje. |
| Piezas | `pieces/*.mjs` | Pelo, rostro, parte de arriba, de abajo y calzado. Cada pieza trae sus vistas del sprite y su versión de retrato (`pieces/portrait/`). |
| Rampas | `ramps.mjs` | Rampas con nombre (luz → base → sombra → profunda), todas de `palette.v1.json`. |
| Recetas | `recipes/*.json` | Un personaje = complexión + piezas + colores. |

El código vive en `scripts/character-kit/`:

- `build-mannequin.mjs` rasteriza el maniquí a un mapa de etiquetas por vista y por cuadro.
  La vista derecha es el espejo de la izquierda; lo asimétrico (raya del pelo) se dibuja por lado.
- `kit-dress.mjs` viste cada cuadro (cobertura por región + superposiciones ancladas).
- `kit-core.mjs` calcula la luz **después** del espejo (siempre arriba-izquierda), colorea con
  las rampas y añade el contorno de 1 px `#15131d`.
- `generate.mjs <receta>` exporta `idle.png` (192×288), `walk.png` (288×288) y
  `portrait-neutral.png` (96×96) en `src/assets/characters/kit/<id>/`.

```bash
node scripts/character-kit/generate.mjs valentina
```

Las hojas siguen el contrato del juego: cuadros de 48×72, pies en (24,68), filas
abajo/izquierda/derecha/arriba, reposo 4 cuadros a 4 fps y caminata 6 cuadros a 10 fps
con contactos en 0 y 3.
