# Biblia visual premium SIEP v1

Estado: **vinculante** para el slice competitivo de simulación. Esta biblia define la autoridad de autoría, validación mecánica y revisión humana. Ningún asset visible se considera premium por existir en el repositorio o por pasar una compilación.

## 1. Contrato técnico de personajes

- La unidad lógica de cuerpo es exactamente **48×72 px**.
- El pivote de pies es **(24,68)** y el hitbox relativo al pivote es **(-11,-16,22,16)**.
- La silueta adulta opaca mide **60–66 px** de alto dentro del frame. La geometría se mide exclusivamente sobre el componente corporal principal anclado a los pies. En las primeras 18 filas, el tramo contiguo que cruza el eje `x=24` debe medir **18–21 px** durante al menos 6 filas consecutivas o 8 filas totales. En las diez filas siguientes, el tramo central de hombros debe medir **20–27 px** durante al menos 3 filas consecutivas o 4 filas totales. Así se permite taper y gesto authored, pero una sola barra horizontal no puede falsificar el rig.
- *Enmienda 2026-10 (spec «personajes unificados» §11):* en las vistas de perfil la banda de hombros mide el fondo del torso, 10–16 px; los peinados marcados como `volume` admiten una cabeza de 18–25 px; el cuerpo es una sola silueta (sin componentes secundarios); la derecha puede nacer del espejo de la izquierda con la luz recalculada y las piezas asimétricas dibujadas por lado, y el validador comprueba que no sea un espejo exacto. La autoridad de color de los personajes es `frontend/character-kit/palette.v2.json` y su compuerta es `npm run kit:check`.
- Se permiten hasta dos componentes secundarios authored, como manos separadas por el gesto, y se excluyen de las métricas de altura, cabeza y hombros. Cada uno ocupa **4–32 px**, el total no supera 48 px, queda a distancia Chebyshev máxima 3 del cuerpo y dentro del rango vertical `body.top+12` a `body.bottom-4`. Ningún componente secundario puede tocar la banda de pies/sombra `y=66–68`; ruido de 1 px, outliers lejanos y masas sobredimensionadas bloquean el asset.
- El contorno exterior es de **1 px**, color `#15131d`.
- La luz dominante llega desde arriba a la izquierda y se conserva en cuerpo, cabello, ropa y rostro.
- El alpha es binario: únicamente 0 o 255. El borde de cada frame permanece completamente vacío.
- La presentación usa solo escalas enteras, renderizado `pixelated`, nearest-neighbor, sin smoothing y sin escalas fraccionales.
- El rig, proporciones, ojos, pivote, hitbox, zancada, contorno e iluminación son idénticos para las 10 identidades seleccionables y los 11 visuales NPC.
- Izquierda y derecha son direcciones dibujadas de forma independiente. Está prohibido entregar la derecha como espejo horizontal exacto de la izquierda.
- Cada identidad debe ser reconocible sin depender del color: peinado, masa de ropa, postura, accesorios y ritmo de silueta distinguen a la persona.

### 1.1 Hojas y tiempos compartidos

| Hoja | Atlas | Grilla | Frames por dirección | FPS | Loop | Regla |
|---|---:|---:|---:|---:|---:|---|
| `idle` | 192×288 | 4×4 | 4 | 4 | sí | filas down/left/right/up |
| `walk` | 288×288 | 6×4 | 6 | 10 | sí | contactos en posiciones 0 y 3 |
| `talk` | 192×288 | 4×4 | 4 | 7 | sí | filas down/left/right/up |
| `interact` | 192×288 | 4×4 | 4 | 8 | no | gesto completo y legible |
| `turn` | 144×288 | 3×4 | 3 | 12 | no | transición dibujada |
| `react` | 192×1152 | 4×16 | 4 | 7 | no | cuatro bloques de consecuencia |
| `portrait` | 384×768 | 4×8 | 4 | 6 | sí | ocho estados de 96×96 |

Los cuatro bloques corporales de consecuencia, en orden, son `reactRelief`, `reactSteady`, `reactTension` y `reactRupture`; cada bloque contiene down/left/right/up. Los ocho estados de retrato, en orden, son `neutral`, `focused`, `concerned`, `relieved`, `relief`, `steady`, `tension` y `rupture`.

### 1.2 Dirección del elenco

Las 10 identidades seleccionables y los 11 visuales NPC muestran diversidad seria y contemporánea, con presencia profesional y humana. No se usan estereotipos caricaturescos para comunicar edad, género, origen, rol clínico o condición de sobreviviente. Cada diseño mantiene expresividad contenida, lectura clara a 48×72 y continuidad entre cuerpo y retrato.

## 2. Mundo, cámara y bindings

- La perspectiva del mundo es **3/4** y debe conservar una lectura espacial consistente.
- Los ocho bindings autorizados son `hospital-urgencias`, `hospital-sala-escucha`, `hospital-sala-accion`, `hospital-sala-cierre`, `comisaria-recepcion`, `comisaria-consultorio`, `comisaria-marco` y `comisaria-cierre`.
- Todo binding visible de categoría `PERSON` se resuelve exclusivamente mediante `ActorRenderPlan`. No se aceptan sprites directos, tintes, siluetas genéricas ni rectángulos sustitutos.
- `OBJECT`, `TOOL` y `EXIT` son assets dibujados explícitamente y registrados por ID. Ninguno usa un fallback genérico.
- Tilemaps, tilesets externos o embebidos y todas sus imágenes transitivas forman parte del inventario bloqueante.

## 3. Señales, prompts y HUD

- Señales, prompts, iconos y marcos HUD son pixel art authored, con contorno, volumen y estados propios.
- Liquid Glass, siempre sutil, solo puede aparecer dentro del HUD como una capa de interfaz separada; nunca se aplica a sprites, mapas, retratos ni a la propia pixel art, y también está prohibido en mundo, señales y prompts.
- Están prohibidos Material Icons, emoji, rectángulos genéricos, tintes runtime y cualquier fallback visual no inventariado.
- La carga y presentación conservan nearest-neighbor, coordenadas enteras y escala entera. Se prohíben smoothing, filtrado lineal y reescalado fraccional.
- Los sprites premium de UI viven bajo `/assets/game/ui/premium-v1/`. Su ausencia inicial es deliberada y debe producir un fallo explícito de la compuerta; nunca se disimula con assets heredados.

## 4. Autoridades y trazabilidad

- `palette.v1.json` es la única paleta maestra de personajes y assets premium v1.
- `roster.v1.json` gobierna las 10 identidades seleccionables; `actor-roster.v1.json`, los visuales NPC y sus bindings; `clinical-emotion-map.v1.json`, la proyección narrativa a retrato.
- `inventory.v1.json` enumera cada binding visible, incluidos mapas, tilesets e imágenes transitivas. No se permiten globs ni descubrimiento implícito en producción.
- Cada entrada declara `sourceAsset`, licencia, hash de bytes y metadatos geométricos verificables. Las rutas deben estar contenidas en sus raíces y resolver a archivos reales.
- El origen del elenco remasterizado es `Remaster original del elenco SIEP`, licencia `SIEP-INTERNAL`. Cualquier fuente adicional debe declarar procedencia y licencia explícitas.

## 5. Compuertas de aceptación

### 5.1 Identidad

Una identidad candidata debe pasar dimensiones, alpha binario, paleta, borde vacío, cobertura mínima por frame, pies, color budget, direcciones authored, rig, timings, hashes y provenance. Luego se revisa en contact sheet a escala 1× y entera ampliada para confirmar reconocimiento sin color, coherencia cuerpo/retrato y diferenciación del elenco.

### 5.2 Mundo y UI

Cada mapa debe resolver exactamente su binding, JSON Tiled, tilesets y PNG transitivos. Todos los assets visibles deben existir, coincidir en dimensiones/grilla, usar escala entera, alpha binario y paleta permitida. La ausencia de un sprite premium o cualquier binding no inventariado bloquea la candidatura.

### 5.3 Revisión humana

Todo asset heredado comienza con `reviewStatus: "unreviewed"`. Pasar validaciones mecánicas no cambia ese estado. Solo arte revisado posteriormente puede convertirse en `candidate`.

La aprobación humana se realiza sobre los contact sheets deterministas y requiere el **HEAD exacto** del commit revisado. Una aprobación de otro HEAD, de archivos regenerados o de capturas sin hashes no es transferible. Hasta completar esa revisión, las compuertas `--write` y `--check` de producción deben fallar cerradas.
