# Pipeline de los sprites de puerta

Genera `frontend/src/assets/game/doors/*.png` (48×64 RGBA).

## Pasos

1. **Frontal** — `z_image` (Higgsfield) → `remove_background` → recorte de plena resolución.
2. **Lateral (3/4)** — `sidify_door.py <frontal_recortada.png> <warp.png>`
   Deforma la frontal con una proyección de un punto de fuga. La salida mira a la
   **derecha** (puerta del muro izquierdo); la del muro derecho es su espejo, que
   Phaser resuelve con `setFlipX` — no hay un segundo asset.
3. **Pixelado** — `pixelate_door.py <src> <out.png> <preview.png> [min_frac]`
   Lienzo retrato 48×64, cuantización y alfa binarizado.
   `min_frac=1.0` conserva solo el cuerpo principal. Usa un valor `<1` (p. ej. `0.02`)
   cuando la puerta tiene una pieza legítimamente separada — el cartel de SALIDA de
   `door_salida_institucional` flota sobre la hoja y con `1.0` desaparecería.

El preview se escribe a una ruta **explícita**: nunca junto al output, para no colar
`*_prev.png` dentro de `assets/`.

## Por qué la lateral no se genera con IA

Se intentó dos veces y quedó documentado en
`docs/superpowers/specs/2026-07-09-arte-puertas-exit-design.md`:

- `z_image` desde cero metía piso y zócalo, y el ángulo salía distinto en cada puerta.
- `flux_kontext` conservaba la identidad pero apenas rotaba.

Una puerta es una losa plana, así que la rotación **es** una proyección de un punto de
fuga: hacerla geométricamente da identidad exacta con la frontal, un ángulo que es un
número, y un espejo exacto.

## Verificar

La dirección no se comprueba a ojo. En cada asset lateral, el alto de contenido a 3 px
del borde izquierdo (cercano) debe superar el del borde derecho (lejano):

```python
a = np.array(Image.open(p).convert("RGBA"))[:, :, 3] > 0
cols = np.nonzero(a.any(axis=0))[0]
assert a[:, cols.min():cols.min()+3].any(axis=1).sum() > a[:, cols.max()-2:cols.max()+1].any(axis=1).sum()
```

## Dependencias

Pillow, numpy, scipy.
