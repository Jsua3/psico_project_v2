# Pipeline de los sprites de mobiliario

Genera `frontend/src/assets/game/furniture/*.png` (RGBA, aspect natural, lado largo a footprint).

## Pasos

1. **Generar** — `z_image` (Higgsfield), elevación frontal, "ONLY the furniture, no floor,
   no ground line, everything solid and fully opaque, plain flat white background, no shadow".
   (El modelo ignora "no shadow" a menudo — ver paso 3.)
2. **Quitar fondo** — `local_bgremove.py <src> <out> [tol=42]`: flood-fill desde los bordes
   sobre el blanco plano. Solo borra el blanco conectado al exterior, así los blancos
   interiores (papeles, sábanas) sobreviven. Alternativa: `remove_background` de Higgsfield
   (mejor con sombras, pero encola).
3. **Sombra residual** — `drop_ground_shadow.py <cutout> <out> [band=0.45]`: borra el gris
   claro poco saturado de la banda inferior del contenido, conectado a la transparencia.
   Si la mancha quedó ENCERRADA (p. ej. entre las patas de una silla), quitar la condición
   de conexión para esa pieza.
4. **Pixelar** — `pixelate_furniture.py <src> <out> <preview> <long_side> [min_frac]`:
   conserva el aspect (un mostrador es ancho, una planta es alta), cuantiza y binariza el
   alfa con la misma limpieza de motas del pipeline de puertas. El preview va a una ruta
   explícita, nunca junto al output.
5. **Revisar** — `mock_rooms.py` compone las 4 salas a escala 1:1 replicando
   `paintFurnitureSprite` (sombra + ancla por base + escala por ancho). Los footprints
   salen de los call sites de `case-pdf-rooms.renderer.ts`.

## Integración

`furniture-sprite.util.ts` resuelve por TIPO de mueble; `paintFurnitureSprite()` en el
renderer dibuja sombra de contacto + sprite al `actorDepth` de siempre, con fallback al
cuerpo vectorial del `paintX` si el asset falta. Colisiones y seed no se tocan.

## Por qué no Kenney

Los tres packs del repo (RPG Urban, Tiny Town, Tiny Dungeon) son de exterior/mazmorra:
no tienen camilla, mostrador clínico, archivador ni sofá. Se evaluaron y descartaron.

## Dependencias

Pillow, numpy, scipy.
