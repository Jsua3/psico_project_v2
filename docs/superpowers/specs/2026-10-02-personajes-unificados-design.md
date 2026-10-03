# Diseño — Personajes unificados: un solo kit por código

- **Fecha:** 2026-10-02
- **Rama:** `feat/personajes-unificados` (worktree `.worktrees/personajes-unificados`, sale de `master` @ `51d1409`)
- **Prueba aprobada:** `76e6171` (maniquí de complexión A y Valentina completa) y `59f4a6d` (por qué se ve distinta dentro del juego)
- **Estado:** aprobado por el usuario el 2026-10-03, con las preguntas de §13 resueltas

## 1. Objetivo

Todos los personajes del juego —los 12 jugables, los NPC de los casos, el guía, los figurantes que hoy son Kenney, el avatar personalizable y los retratos del diálogo— salen de **un único kit de pixel art por código**, con 4 vistas y perfiles reales, la misma densidad de píxel a escala entera, la misma paleta y el mismo contorno.

### 1.1 Criterio de éxito (verificable)

1. En cualquier pantalla (mundo, lobby, editor de personaje, intro del caso, diálogo, resultado del intento, editor de mundo) cada personaje se dibuja con hojas o retratos del kit. El código y los assets ya no contienen `characters/cast`, `characters/modular`, `characters/modular-legacy`, `characters/portraits`, las hojas `characters/v1/<id>/base` ni los cuadros de personaje de Kenney.
2. En pantalla, cada píxel de un sprite mide un número entero de píxeles físicos (teniendo en cuenta `devicePixelRatio`).
3. Ninguna luz ni tinte en tiempo de ejecución altera los píxeles de un personaje, con una sola excepción documentada (§8.3).
4. El validador corre en CI y falla si se rompe cualquiera de los puntos anteriores (§6).

## 2. Decisiones tomadas

No se reabren; el spec las desarrolla.

1. Claude produce el arte; el usuario dirige y aprueba.
2. Estilo adulto estilizado con las medidas de la biblia v1: cuadro de 48×72, pies en (24,68), cabeza de 18-21 px, altura opaca de 60-66 px, contorno de 1 px `#15131d`, luz arriba-izquierda, alfa binario, sin antialias, escala entera, paleta `palette.v1.json`.
3. Las vistas laterales son perfiles de verdad.
4. Izquierda y derecha son vistas propias: el generador refleja lo simétrico, recalcula la luz después del espejo y dibuja por lado lo asimétrico (raya del pelo, bolso, gafete).
5. Fase 1: reposo (4 cuadros a 4 fps, respiración de 1 px) y caminata (6 cuadros a 10 fps) en las 4 vistas, más retratos del diálogo de 32×32 (mostrados a ×3, decisión 15) para quienes hablan. Hablar, interactuar, girar y reaccionar quedan para la fase 2.
6. Avatar personalizable como kit compacto: 2 complexiones, 6 tonos de piel, ~10 peinados con 6 colores, ~6 conjuntos con variantes de color. El elenco y los NPC se arman con el mismo kit mediante recetas.
7. Método A: maniquí como datos de píxel por vista y por cuadro, piezas como capas, generador determinista. Nada de IA generativa. Los retratos se arman por piezas.
8. Los retoques a mano se guardan como una capa del kit.
9. *(2026-10-02)* Prueba aprobada: maniquí de complexión A y Valentina.
10. *(2026-10-02)* Escala entera en pantalla con **zoom entero de cámara** que sigue a la jugadora: ×2 cuando hay espacio, ×1 en pantallas pequeñas.
11. *(derivada de la prueba)* La luz de las salas se pinta **debajo** de los personajes. Hoy va encima y cambia los 752 píxeles de un perfil; pintada debajo, los 752 llegan iguales a la hoja.
12. *(2026-10-03)* Muebles y puertas se recalibran a la altura nueva **en esta rama** (F8), para que `master` nunca tenga personajes y muebles a escalas distintas.
13. *(2026-10-03)* El tinte del estado clínico de la paciente se reemplaza por un **icono de pixel art sobre la cabeza**; el sprite no se toca.
14. *(2026-10-03)* Los peinados marcados como `volumen` (afro, moño alto) pueden llegar a **25 px** de cabeza con pelo; en ellos el validador mide además el cráneo (etiqueta `H`, 17 px con contorno).
15. *(2026-10-03, PARADA 1)* Los retratos son **tiernos y de poco detalle, a 32×32**, y se muestran a ×3 (caja de 96 px) o ×6 (192 px): cabeza grande y redonda, ojos de 2×3 con un píxel de brillo y 6 px entre ellos, cejas de 2 px, rubor, sonrisa pequeña y sin nariz. Sustituye al retrato de 96×96 de la prueba.

## 3. Lo que hay hoy (medido)

### 3.1 Sistemas que conviven

| Sistema | Dónde | Contenido |
|---|---|---|
| v1 | `assets/characters/v1/<id>/base/` | 8 identidades a 48×72 (idle, walk, talk, interact, turn, react, portrait). Los perfiles giran solo la cabeza. Además `roster.v1.json`, `actor-roster.v1.json`, `clinical-emotion-map.v1.json` y `palette.v1.json`. |
| cast | `assets/characters/cast/` | 12 jugables y 9 NPC chibi de 128×192 en 3 filas; la izquierda por espejo y 3 cuadros de caminata. |
| modular | `assets/characters/modular/` | Capas chibi (cuerpo, pelo, cara) del avatar personalizado. |
| modular-legacy | `assets/characters/modular-legacy/` | Copia anterior de las capas. |
| portraits | `assets/characters/portraits/` | 10 retratos de 96×96 para 6 hablantes. |
| Kenney | hoja `rpg-urban-pack` (16×16) | Guía, NPC sin preset, figurantes de mapas legados y jugador de respaldo. La misma hoja sirve de tileset de mapas (`rpg-img`). |

### 3.2 Consumidores

| Pantalla | Código | Sistema hoy | Escala hoy |
|---|---|---|---|
| Mundo — jugador | `game-world` (`resolvePlayerVisual`, `createPlayer`) | v1 → cast → modular → Kenney | v1 ×1; cast/modular ×0,425; Kenney ×1,5 |
| Mundo — NPC ambientales | `game-world.spawnNpcs` + `assets/game/scenarios/*.json` (`avatarPresetKey`, `frameIndex`) | cast → modular → Kenney | 0,36-0,42; Kenney ×2,4; con tintes |
| Mundo — PERSON del caso | `game-world.createMarker` + `MAP_OBJECT_PRESETS` o `metadata.avatar` | preset o modular | fraccional |
| Mundo — guía | `game-world.buildGuide` + `scene-guide.config` | Kenney `NPC_SUPERVISOR_IDLE` | ×2,4 / ×1,5 |
| Mundo — figurantes | `renderHospitalEnvironment`, `renderComisariaEnvironment` (mapas legados) | Kenney | ×1,85-2,2, con tintes |
| Lobby | `game-menu` + `lobby-avatar.util` | cast → modular | ×0,5 |
| Editor de personaje | `character-editor` + `avatar-figure` + `editor-preview.util` | v1 → cast → modular (CSS) | v1 ×4; resto fraccional |
| Intro del caso | `case-intro-scene` + `intro-scene.util` | v1 → cast → modular | escenario a escala entera (ya está bien) |
| Diálogo | `dialogue-panel` + `portrait-resolver.util` | `portraits/` o silueta SVG | 96 px dentro de una caja de 88 px |
| Resultado del intento | `attempt-outcome` + `avatar-figure` (retrato) | modular | 64 px |
| Editor de mundo | `world-editor` + `avatar-figure` | modular | 36×54 |

Además, en todo el mundo y el lobby:

- **Lienzo estirado.** Phaser usa `Scale.FIT`: el lienzo de 960×540 se estira para llenar el hueco. A 1920×1080 queda a ×1,77 y los píxeles salen desiguales.
- **Luz encima.** `paintLighting` y las viñetas se pintan en la capa `DEPTH.LIGHTING`, por encima de los actores.
- **Deformación del sprite.** `character-motion.util` estira el sprite en vertical (±1,3 %) y lo hace rebotar medio píxel.
- **Tintes.** Hay tintes por preset, un lavado lavanda y el tinte del estado clínico de la paciente.

### 3.3 Dónde se guardan los avatares

- **Avatar del estudiante:** en el navegador, en `localStorage['psychosim_avatar']` (`AvatarStore`). El backend no lo guarda. Contiene un `AvatarConfig` con `gender`, `clothingColor` (5), `skinTone` (5), `hairStyle` (5), `hairColor` (5), `fringe`, `eyes`, `brows`, `mouth` (12 expresiones), `accessory` (3), `uniform` (2) y `castId` opcional. Por defecto: `castId: 'valentina'`.
- **NPC autorados en el editor de mundo:** dentro de la definición del caso (backend, JSON opaco), en `object.metadata.avatar` (`AvatarConfig`) y `metadata.npcTemplateId`. El caso publicado no trae ninguno; los casos creados por docentes pueden traerlos.

## 4. El kit

### 4.1 Carpetas

```
frontend/character-kit/                       autoría (no se publica)
  mannequins/complexion-a.mjs, complexion-b.mjs   grillas por vista + rig por cuadro
  busts/bust-a.mjs, bust-b.mjs                    maniquí de retrato 32×32
  pieces/<tipo>/<id>.mjs                          piezas: vistas del sprite + versión de retrato
  palette.v2.json                                 paleta maestra (v1 + 6.ª piel)
  ramps.mjs                                       rampas con nombre
  recipes/<id>.json                               un personaje fijo por archivo
  catalog.json                                    actores, hablantes, guías y plantillas → receta; opciones del editor
  retouch/<id>/<hoja>.png                         retoques a mano por personaje
frontend/src/app/features/character/kit/
  kit-engine.ts                                   motor puro: vestir, luz, contorno, hojas, retratos
  character-visual.resolver.ts                    punto único de resolución (§8.1)
  avatar-v2.ts                                    formato del avatar y migración (§9)
frontend/scripts/character-kit/                   Node: build, check, láminas, retoques
frontend/src/assets/characters/kit/
  kit.json                                        paquete para el navegador (§5.3)
  <id>/idle.png, walk.png, portrait-<estado>.png  hojas generadas de los personajes fijos
  manifest.json                                   hashes de píxeles, geometría y procedencia
```

### 4.2 Maniquí

Es lo que ya está en la prueba:

- **Grillas por vista** (abajo, izquierda, arriba): cabeza, oreja, cuello, torso (con fila de cintura para respirar), pelvis, y manos y pies por pose.
- **Anchos de segmento.**
- **Rig por cuadro:** `breath` en reposo, `bob` en caminata y fases de piernas y brazos.

El build lo rasteriza a un **mapa de etiquetas por vista y por cuadro**, que son los datos de píxel que consume el motor:

- Etiquetas: `H e E N T P a b c A B C l m o L M O`. Minúscula es el lado cercano o izquierdo; mayúscula, el lejano o derecho.
- Movimiento por cuadro: `upper`, `bob` y `waistY`.
- La vista derecha es el espejo de la izquierda; la luz se calcula después.

Las dos complexiones comparten la altura (64 px) y la cabeza, así el pelo sirve en ambas:

- **A** (la de la prueba): hombros de 21-23 px con contorno, cintura marcada.
- **B:** hombros de 25-27 px, torso recto sin cintura, manos y pies 1 px más grandes y perfil 1 px más profundo.

Ninguna de las dos es «de mujer» o «de hombre»: el editor deja elegir cualquiera.

### 4.3 Piezas

```js
export default {
  id: 'chaqueta-capucha',
  kind: 'top',                 // hair | face | top | bottom | shoes | layer | accessory
  slots: ['top', 'accent', 'inner'],
  coverage: { T: 'top', a: 'top', b: 'top', A: 'top', B: 'top' },   // región → ranura de color
  edges: [{ labels: ['b', 'B'], edge: 'bottom', tone: 3 }],          // puños, suelas
  asymmetric: false,           // true → exige vista `right` propia
  views: { down: [...], up: [...], left: [...], right: [...] },    // right ausente = espejo de left
  portrait: [...],
};
```

Una superposición se declara así:

```js
{ anchor: 'H'|'T'|'P', at: [x, y], mode: 'paint'|'cover', parts: [...], complexions: ['a', 'b'], legend: {...}, grid: '...' }
```

- `paint` solo recolorea celdas del ancla (o de `parts`).
- `repaint` recolorea como `paint`, pero borra antes los tonos fijos y literales que dejaron otras piezas (una bata sobre una camisa).
- `cover` crea o tapa celdas (pelo, bulto de capucha, falda).
- `sheets` y `frames` (opcionales) limitan la superposición a una hoja o a unos cuadros (una falda larga que se abre con la zancada).
- Si una superposición del torso o la pelvis no encaja en las dos complexiones, se dibuja una por complexión (`complexions`).

Toda pieza que ofrece el editor debe funcionar en A y en B.

### 4.4 Recetas

```json
{
  "id": "valentina",
  "displayName": "Valentina",
  "kind": "jugable",
  "complexion": "a",
  "pieces": { "hair": "bob-flequillo", "face": "serena", "top": "chaqueta-capucha", "bottom": "jean", "shoes": "tenis", "accessories": [] },
  "colors": { "skin": "piel-1", "hair": "castano-oscuro", "top": "verde", "accent": "azul", "inner": "blanco", "bottom": "marino", "shoes": "carbon", "sole": "gris-claro" },
  "portraits": ["neutral"],
  "provenance": { "source": "Kit SIEP", "license": "SIEP-INTERNAL" }
}
```

Los colores literales (ojo, blanco del ojo, iris, brillo y rubor) tienen valores por defecto en el kit y la receta puede cambiarlos. El avatar personalizado usa la misma forma, limitada a las opciones del editor (§4.7) y sin `id`.

### 4.5 Paleta: la sexta piel

`palette.v1.json` trae 5 rampas de piel. Se crea **`palette.v2.json`** con 4 colores nuevos para una rampa intermedia entre la media y la morena: `#c18c6c`, `#a0654a`, `#7a4634`, `#512d23`, obtenidos interpolando las rampas vecinas.

| Tono | Luz | Base | Sombra | Profunda |
|---|---|---|---|---|
| `piel-1` | `#f7dfcc` | `#e9bea0` | `#cf8f6f` | `#a8614c` |
| `piel-2` | `#f0c7a5` | `#d99a76` | `#b86f52` | `#824735` |
| `piel-3` | `#d6a17f` | `#b97656` | `#92513b` | `#623326` |
| `piel-4` (nueva) | `#c18c6c` | `#a0654a` | `#7a4634` | `#512d23` |
| `piel-5` | `#ad7758` | `#87543d` | `#623b2d` | `#40271f` |
| `piel-6` | `#774a35` | `#563223` | `#38231d` | `#241817` |

Fuera de la piel nueva, `palette.v2` es idéntica a v1. El validador exige que todo color del kit esté en ella.

### 4.6 Retoques a mano (capa del kit)

- **Dónde viven:** `character-kit/retouch/<id>/<hoja>.png`, del tamaño de la hoja, transparente salvo los píxeles retocados.
- **Cómo se aplican:** el build compone primero la hoja y después pega encima los píxeles opacos del retoque, así regenerar no los pierde.
- **Flujo con LibreSprite o Pixelorama:**
  1. `npm run kit:retoque -- <id> <hoja>` exporta `<hoja>.base.png`.
  2. El usuario lo edita y lo guarda.
  3. `npm run kit:retoque -- <id> <hoja> --guardar` deja en la capa solo los píxeles que cambiaron.
- **Controles del validador:** que el retoque use la paleta y alfa binario, y avisa si un píxel retocado quedó huérfano porque la base cambió debajo.
- **Dos límites:**
  - Los retoques son por personaje fijo; el avatar personalizado usa la salida limpia del kit.
  - Una corrección que deba valer en todas partes se hace en los datos de la pieza, que son texto.

### 4.7 Opciones del editor (kit compacto)

| Opción | Valores |
|---|---|
| Complexión | A, B |
| Piel | `piel-1` … `piel-6` |
| Peinado (10) | rapado, corto liso, corto rizado, bob con flequillo, media melena, largo suelto, cola de caballo, moño, trenza, afro |
| Color de pelo (6) | negro, castaño oscuro, castaño, cobrizo, rubio, canoso |
| Conjunto (6) | casual (chaqueta con capucha y jean), formal (camisa y pantalón de tela), suéter y pantalón, blusa y falda, cárdigan y pantalón, bata clínica sobre camisa y pantalón |
| Color del conjunto | 3-5 variantes por conjunto, todas de la paleta |
| Accesorios | gafas, gafete |

Un conjunto es una combinación curada de parte de arriba, parte de abajo y calzado. El kit tiene más piezas de las que ofrece el editor: uniforme clínico, uniforme de seguridad, bata médica, chaqueta de jean, sudadera, polo y blazer. Esas quedan para las recetas del elenco y de los NPC (§7). El rostro, en la fase 1, lo fija la receta; el editor usa el rostro «sereno».

## 5. Motor y generador

### 5.1 Motor compartido (`kit-engine.ts`)

- **Qué es:** el núcleo de la prueba (`kit-core.mjs` y `kit-dress.mjs`) pasa a un solo archivo TypeScript puro, sin imports y con sintaxis borrable (sin `enum`). Hace cuatro cosas:
  - vestir el mapa de etiquetas;
  - calcular la luz después del espejo, donde lo que tapa por delante no cuenta como borde de forma;
  - colorear con las rampas y añadir el contorno de 1 px por fuera;
  - ensamblar las hojas y el retrato.
- **Un solo código para los dos lados:** lo usan la app (para componer el avatar personalizado) y el build de Node, que lo importa como `.ts` con el *type stripping* de Node 24. Así el navegador y el CI producen los mismos píxeles.

### 5.2 Build (`npm run kit:build`)

Lee la autoría y hace lo siguiente:

1. Rasteriza los maniquíes y los bustos.
2. Compila las piezas, incluida la geometría de los retratos.
3. Arma las rampas desde `palette.v2.json`.
4. Escribe `kit.json`, las hojas y los retratos de cada receta fija, y `manifest.json` con los hashes de píxeles decodificados.

Las láminas de revisión ×4 (vistas, cuadro a cuadro, retratos, piezas en A y B, elenco y maniquí) las genera `npm run kit:laminas` en `docs/visual/kit-personajes/`.

### 5.3 Paquete para el navegador (`kit.json`)

Contiene:

- los mapas de etiquetas por complexión, vista y cuadro, codificados por tramos (RLE), con su movimiento;
- los bustos;
- las piezas compiladas;
- las rampas, los literales por defecto y las recetas;
- el catálogo.

Los contratos de hoja (cuadro 48×72, pivote, filas, cuadros y fps) son constantes del motor, que comparten el navegador y el build.

Peso estimado: menos de 200 KB sin comprimir.

### 5.4 Avatar personalizado en el navegador

`composeAvatar(avatarV2)` devuelve un lienzo con `idle`, `walk` y el retrato neutral; se guarda en memoria por el hash canónico del avatar. Phaser lo registra como hoja (`textures.addSpriteSheet` desde el lienzo) y las vistas CSS lo usan como URL de objeto. Los personajes fijos usan los PNG generados.

## 6. Validador (`npm run kit:check`, en CI)

1. **Al día:** reconstruye en memoria y compara los píxeles decodificados (no los bytes del PNG) de cada hoja, retrato y `kit.json`. Si difieren, indica que hay que ejecutar `npm run kit:build`.
2. **Contrato de hoja:**
   - tamaños: `idle` 192×288, `walk` 288×288, retrato 32×32;
   - alfa binario, colores de `palette.v2.json` y borde vacío;
   - el cuerpo (con contorno) termina entre y = 66 y y = 68, como en la biblia: en la caminata de frente el pie que avanza pisa 1 px más abajo; el centro del apoyo (el punto medio entre los dos pies) queda a ±6 px de x = 24;
   - una sola silueta por cuadro (un componente opaco).
3. **Geometría por vista** (biblia enmendada, §11). Como en la biblia §1, cabeza y hombros son **anchos**: el del tramo opaco contiguo que cruza x = 24, medido fila a fila desde el tope del cuerpo.
   - altura opaca de 60-66 px;
   - cabeza con pelo (filas 0-17): 18-21 px durante 6 filas seguidas u 8 en total; con un peinado marcado como `volumen` (afro, moño alto), 18-25 px (decisión 14);
   - hombros (filas 18-27): 20-27 px de frente y de espalda, durante 3 filas seguidas o 4 en total; en perfil, fondo del torso de 10-16 px con la misma regla;
   - cráneo: cada complexión tiene exactamente la cabeza de A (etiquetas `H`, `e`, `E` en las mismas celdas de cada vista y cuadro); de frente mide 17 px con contorno. Se valida por complexión y no por peinado, porque el pelo tapa el cráneo;
   - la derecha no puede ser el espejo exacto de la izquierda (ni con el eje x ↔ 47 − x ni con x ↔ 48 − x).
4. **Animación:**
   - reposo de 4 cuadros con respiración de exactamente 1 px;
   - caminata de 6 cuadros con bob de 1 px como máximo y, en las vistas de perfil, los dos pies pisando y = 66 en los contactos 0 y 3 (de frente y de espalda la profundidad 3/4 separa los pies 1-2 px a propósito).
5. **Retoques:** paleta, alfa binario y retoques huérfanos.
6. **Cobertura:** todo personaje referenciado resuelve a una receta. Eso abarca los jugables, las claves y presets de los escenarios, los actores del caso, los nombres de guía, los hablantes del diálogo y las plantillas del editor de mundo.
7. **Sin legado:** una prueba de Node falla si en `src/` aparecen las rutas viejas, `KenneyCharFrames` de personajes, `setTint` sobre actores o `character-motion`, o si existen las carpetas borradas.
8. **Unitarias del motor** (`node --test`): reglas de luz, espejo con luz recalculada, desplazamiento de superposiciones con el movimiento y determinismo.

`test:character-assets` se reemplaza por `kit:check` más `visual-asset-manifest-lib`, cuyo inventario pierde las entradas de personajes.

## 7. Personajes y recetas

### 7.1 Jugables (12)

La identidad se toma del arte actual: v1 donde existe y cast donde no.

| Receta | Compl. | Piel | Pelo | Ropa | Extra |
|---|---|---|---|---|---|
| `valentina` | A | 1 | bob con flequillo, castaño oscuro | chaqueta con capucha verde y forro azul, camiseta blanca, jean marino, tenis | — (es la prueba) |
| `andres` | B | 2 | corto liso, negro | camisa celeste, pantalón gris, zapatos | — |
| `camila` | A | 2 | largo suelto, cobrizo | blusa morada, jean, botines marrones | — |
| `daniela` | A | 1 | cola de caballo con flequillo, negro | blusa coral, pantalón marino | — |
| `david` | B | 2 | corto liso, castaño | suéter marino sobre cuello blanco, pantalón gris | gafas |
| `felipe` | B | 2 | corto rizado, negro | chaqueta de jean, camiseta blanca, jean oscuro | — |
| `jorge` | B | 4 | corto liso, canoso | suéter verde, pantalón oscuro | rostro maduro |
| `luisa` | A | 6 | corto rizado, negro | cárdigan mostaza, pantalón negro | — |
| `mariana` | A | 3 | trenza, negro | suéter morado, jean | — |
| `mateo` | B | 1 | corto rizado, castaño | sudadera gris con capucha, jean | — |
| `paula` | A | 1 | largo suelto, rubio | chaqueta con capucha rosa, camiseta blanca, pantalón gris oscuro | — |
| `samuel` | B | 5 | rapado | polo vinotinto, pantalón caqui | — |

### 7.2 NPC

Una receta por identidad visual. La columna «Hoy» indica el arte que comparten.

| Receta | Quién y dónde | Hoy | Propuesta |
|---|---|---|---|
| `abuela-familia` | «Abuela de la niña»: `familia-crisis`, `familia-duelo` | madre-vbg (se ve joven) | A, piel 3, moño canoso, cárdigan vinotinto, falda larga, rostro maduro |
| `madre-acompanante` | madre de la sobreviviente (`madre-acompanante`, `familiar-comisaria`, `madre-familiar`) | madre-vbg | A, piel 3, media melena castaño oscuro, blusa vinotinto, pantalón oscuro |
| `sobreviviente` | «Sobreviviente (22 años)» y «Consultante»: `sobreviviente-consulta`, `sobreviviente-espera`, `paciente-comisaria`, `escucha-segura` | paciente-vbg | A, piel 2, largo suelto castaño, suéter gris, jean |
| `psicologa-hospitalaria` | `psicologa-acompanante`, `psicologa-orientadora`; guía «Psicóloga hospitalaria» | psicologa-hospitalaria | A, piel 3, moño castaño, blusa menta, pantalón oscuro, gafete |
| `profesional-psicosocial` | `profesional-psicosocial`, `apoyo-psicosocial`; guía «Apoyo psicosocial» | comisaria-profesional | A, piel 6, bob negro, blusa morada, pantalón oscuro, gafete |
| `trabajadora-social` | `trabajadora-social`; guía «Trabajadora social» | colega-clinica o comisaria-profesional | A, piel 4, corto rizado castaño, cárdigan verde azulado, pantalón, gafete |
| `funcionaria-recepcion` | `funcionaria-recepcion` | funcionaria-recepcion | A, piel 1, media melena cobriza, camisa celeste, falda marina |
| `orientadora-juridica` | `orientadora-juridica`; guía «Orientadora jurídica» | funcionaria-recepcion | A, piel 5, moño negro, blazer gris, pantalón, gafas |
| `enfermera-urgencias` | `enfermera-urgencias`; guía «Enfermera de turno»; colegas en casos archivados | colega-clinica | A, piel 3, cola de caballo castaña, uniforme clínico verde azulado |
| `medico-guardia` | `medico-guardia` | supervisor-clinico | B, piel 2, corto liso negro, bata médica sobre camisa celeste |
| `supervisor-clinico` | supervisores y `defensor-familia` de casos archivados | supervisor-clinico | B, piel 4, corto canoso, camisa y suéter gris, rostro maduro |
| `seguridad` | `seguridad-entrada` (caso archivado) | seguridad | B, piel 6, rapado, uniforme de seguridad gris |
| `adolescente` | `adolescente-nna` (caso archivado) | adolescente-nna | A, piel 2, media melena cobriza, camiseta morada, jean |
| `paciente-espera` | figurantes de los mapas legados (hoy Kenney) | Kenney | B, piel 3, corto liso castaño, suéter, pantalón |

Los NPC de los escenarios archivados que la tabla no nombra se asignan así: `supervisor-cierre`, `supervisor-comisaria`, `supervisor-informe` y `supervisor-ruta` → `supervisor-clinico`; `colega-comisaria` y `colega-guardia` → `enfermera-urgencias`.

Las cuatro plantillas del editor de mundo (`mujer-adulta`, `hombre-adulto`, `adolescente`, `profesional`) pasan a apuntar a recetas: `madre-acompanante`, `paciente-espera`, `adolescente` y `profesional-psicosocial`.

El **guía** usa la receta de su rol según `guideName`. Los nombres actuales que la tabla no nombra se asignan así: «Colega de psicología» → `psicologa-hospitalaria`; «Funcionario de derechos» → `supervisor-clinico`; «Defensora de familia» → `orientadora-juridica`.

Las **voces sin cuerpo** («Marco normativo y técnico», «Supervisión clínica», «Protocolo clínico», «Herramienta profesional») no son personajes: conservan su icono.

### 7.3 Retratos (fase 1)

| Quién | Estados |
|---|---|
| NPC que hablan: abuela-familia, sobreviviente, psicologa-hospitalaria, profesional-psicosocial, funcionaria-recepcion, madre-acompanante, enfermera-urgencias, medico-guardia, trabajadora-social, orientadora-juridica, más supervisor-clinico, seguridad y adolescente | neutral, preocupada, triste, alegre |
| Los 12 jugables y el avatar personalizado | neutral (resultado del intento, editor y lobby) |

Las emociones del diálogo se proyectan sobre esos estados igual que hoy: `vulnerable` y `concerned` van a preocupada; `danger`, a triste; `positive`, a alegre.

Los 8 estados de la biblia (`focused`, `tension`, `rupture`…) se dejan para la fase 2.

### 7.4 Piezas que hacen falta (catálogo)

| Tipo | Piezas |
|---|---|
| Pelo (10) | rapado, corto liso, corto rizado, bob con flequillo ✓, media melena, largo suelto, cola de caballo, moño, trenza, afro |
| Rostro | sereno ✓, maduro (líneas de expresión), con 4 expresiones de retrato |
| Arriba | chaqueta con capucha ✓, camiseta, camisa, suéter, blusa, cárdigan, chaqueta de jean, sudadera, polo, blazer, uniforme clínico, camisa de seguridad |
| Capas | bata médica o clínica (sobre la parte de arriba), gafete, gafas |
| Abajo | jean ✓, pantalón de tela, falda (larga y a la rodilla), pantalón de uniforme |
| Calzado | tenis ✓, zapatos, botines |

Cada pieza lleva sus 4 vistas, la versión de retrato y, si hace falta, una variante por complexión. ✓ = ya está en la prueba.

## 8. Migración de consumidores

### 8.1 Punto único de resolución

`character-visual.resolver.ts`:

```ts
type CharacterRef =
  | { kind: 'jugador'; avatar: AvatarV2 }               // AvatarStore
  | { kind: 'receta'; recipeId: string }                // elenco, NPC, guía, figurante
  | { kind: 'autorado'; avatar: unknown };              // metadata.avatar del editor de mundo (v1 o v2)

interface CharacterVisual {
  key: string;                                          // 'kit-valentina' | 'kit-avatar-<hash>'
  idle: SheetSource; walk: SheetSource;                 // URL del PNG o lienzo compuesto
  portrait(state: PortraitState): SheetSource | null;
}

resolveCharacter(ref: CharacterRef): CharacterVisual;
resolveRecipeId(clave: { actor?: string; speaker?: string; guide?: string; scenarioNpc?: string }): string | null;
```

Las constantes compartidas (cuadro 48×72, pivote (24,68), filas abajo/izquierda/derecha/arriba, 4 cuadros a 4 fps y 6 a 10 fps) salen del motor.

`catalog.json` es la única tabla de correspondencias y reemplaza a:

- `NPC_AVATAR_PRESETS`, `NPC_PRESET_RENDER` y `MAP_OBJECT_PRESETS`;
- `SPEAKER_NAME_TO_SLUG` y `PORTRAIT_KEY_TO_SLUG`;
- las correspondencias de `actor-roster.v1.json`;
- el par `avatarPresetKey` y `frameIndex` de los escenarios, que pasa a ser `recipeId`.

### 8.2 Consumidor por consumidor

| Pantalla | Después |
|---|---|
| Mundo — jugador | Sprite de `resolveCharacter(jugador)` a escala 1, con las 4 filas reales y sin `flipX`. `data-player-x/y` se sigue escribiendo cada cuadro. |
| Mundo — NPC, PERSON, guía y figurantes | `resolveCharacter(receta \| autorado)`, misma hoja y escala 1, mirando en 4 direcciones; sin tintes ni escalas por preset. |
| Lobby | Las mismas hojas del kit y el mismo zoom entero que el mundo (§8.3). |
| Editor de personaje | Vista previa del avatar compuesto en el navegador a ×4: las 4 vistas con reposo y caminata animados. Opciones del §4.7. Tarjetas del elenco con el cuadro 0 a ×2. |
| Intro del caso | Hojas del kit (caminata a la derecha y reposo de frente) a la escala entera que ya usa el escenario. |
| Diálogo | Retrato de la receta del hablante a ×3 (96 px) o ×6 (192 px) según el diseño, sin `object-fit` que lo encoja. |
| Resultado del intento | Retrato neutral del jugador a ×3, 96 px (hoy 64). |
| Editor de mundo | Cuadro 0 de frente y de perfil a ×1 (48×72). Los campos del NPC pasan a ser «plantilla = receta» u opciones del kit. |

### 8.3 Render a escala entera

**Mundo y lobby (Phaser).** El lienzo toma el tamaño del contenedor en píxeles físicos: tamaño CSS × `devicePixelRatio`, y `scale.zoom = 1/dpr`. La cámara usa un zoom entero:

```
k = mayor entero ≥ 1 con (anchoFísico / k ≥ 0,8 · anchoSala) y (altoFísico / k ≥ 0,8 · altoSala)
```

Ejemplos:

- A 1920×1080, con un contenedor de unos 1696×954, da ×2: se ve el 88 % de la sala, que se desplaza un poco, y Valentina mide 128 px.
- A 1366×768 da ×1: la sala entra entera.
- En 4K da ×3.

La cámara sigue a la jugadora con `roundPixels` y se limita a la sala; si la vista es mayor que la sala, la centra. El `ambient.cameraZoom` de autoría deja de controlar el render.

**Luz debajo.** Los focos y las viñetas de las salas pasan a la banda del suelo (`DEPTH.ENVIRONMENT + 0,5`). Afecta a `case-pdf-rooms.paintLighting`, a la iluminación de `premium-clinical-room` y a `game-world.applyLightingOverlay`. La **viñeta de crisis** (estrés, bloque B) queda como única capa por encima, porque es una señal temporal de juego; se documenta como excepción.

**Nada deforma los píxeles.** Se retira `character-motion.util`: la respiración y el bob ya vienen en las hojas. Se quitan todos los tintes de actores. El tinte del estado clínico de la paciente se reemplaza por un icono de pixel art sobre la cabeza, con colores de la paleta y a la misma escala entera (decisión 13).

**Retratos y vistas CSS.** Los sprites, siempre a ×1, ×2 o ×4; los retratos (32×32), a ×3 o ×6. Todo con `image-rendering: pixelated` y una caja del tamaño exacto.

### 8.4 Pruebas e2e (aviso)

El contrato `data-player-x/y` no cambia. Pero **`frontend/e2e/lobby.e2e.ts`** comprueba hoy que el lobby pida `cast/david.png` y que un `castId` inválido caiga a `modular`. Al borrar esos sistemas, esas dos pruebas deben reescribirse:

- pedir las hojas de `kit/david`;
- un avatar inválido debe resolver a la receta por defecto.

Ese cambio en `frontend/e2e/**` se hará solo con el visto bueno del usuario, en la fase indicada del plan.

## 9. Migración de avatares guardados

### 9.1 Avatar del estudiante (`localStorage`)

Nuevo formato, en la misma clave `psychosim_avatar`:

```ts
type AvatarV2 =
  | { schemaVersion: 2; mode: 'elenco'; recipeId: PlayableId }
  | { schemaVersion: 2; mode: 'personalizado'; complexion: 'a' | 'b'; skin: SkinId; hair: HairId;
      hairColor: HairColorId; outfit: OutfitId; outfitColor: OutfitVariantId; accessories: AccessoryId[] };
```

Al cargar:

- **Formato v2:** se valida campo por campo y lo inválido toma el valor por defecto.
- **Formato v1:** se aplica `migrateAvatarV1`, se guarda en v2 y se conserva una copia del texto original en `psychosim_avatar_v1`.

La migración es pura, idempotente y se prueba con una tabla. Por defecto, `{ mode: 'elenco', recipeId: 'valentina' }`.

### 9.2 NPC autorados (`metadata.avatar` en la definición del caso)

Se leen con la misma `migrateAvatarV1` cuando vienen en v1. Al editar, el editor de mundo guarda v2 (y `metadata.recipeId` si es una plantilla). El backend lo trata como JSON opaco, así que no requiere cambios. No hace falta reescribir la base de datos: el caso publicado no trae avatares autorados y la lectura cubre los demás.

### 9.3 Equivalencias v1 → v2

| v1 | v2 |
|---|---|
| `castId` de uno de los 12 | `mode: 'elenco'`, `recipeId = castId` |
| sin `castId` o inválido | `mode: 'personalizado'`, con lo siguiente: |
| `gender` female / male | complexión A / B |
| `skinTone` porcelana, clara, media, morena, oscura | `piel-1`, `piel-2`, `piel-3`, `piel-5`, `piel-6` (se respeta el orden; `piel-4` es nueva) |
| `hairStyle` corto, medio, largo, recogido, ninguno | corto liso, media melena (bob con flequillo si `fringe`), largo suelto, moño, rapado |
| `hairColor` negro, castaño, rubio, rojizo, gris | negro, castaño, rubio, cobrizo, canoso |
| `uniform` con bata / sin bata | conjunto bata clínica / formal |
| `clothingColor` purple, blue, green, burgundy, gray | variante morado, azul, verde, vinotinto, gris |
| `accessory` gafas / pin / ninguno | `['gafas']` / `['gafete']` / `[]` |
| `eyes`, `brows`, `mouth` | se descartan: el rostro lo fija la complexión en la fase 1 y la expresión solo aplica a retratos |

## 10. Qué se borra

**Assets:**

- `characters/cast/` (21 PNG)
- `characters/modular/` y `characters/modular-legacy/`
- `characters/portraits/` (10 PNG)
- las hojas de `characters/v1/<id>/`, junto con `roster.v1.json`, `actor-roster.v1.json` y `clinical-emotion-map.v1.json`, cuyo contenido pasa a `catalog.json`

`palette.v1.json` se reemplaza por `palette.v2.json` del kit. La hoja Kenney `rpg-urban-pack` **se queda** si algún mapa la usa como tileset, pero deja de cargarse como `characters`.

**Código:**

- `baked-cast.util`
- `phaser-avatar-renderer` (el compositor modular)
- `npc-avatar-presets`
- `v1-avatar.util`
- `avatar-render-plan.util` y los tipos `CharacterManifestV1` (el resolver v1 dormido)
- `character-motion.util` y el sistema de actores vivos de `game-world`
- `avatar.model` y `avatar-config.util` (salvo lo que use `migrateAvatarV1`)
- los cuadros de personaje de `kenney-frames.constants`
- las plantillas de NPC y peinados de `authoring-catalog.config`

Se reescriben `lobby-avatar.util`, `editor-preview.util`, `avatar-figure` (pasa a ser una figura del kit) y `portrait-resolver.util`, junto con sus `.spec`.

**Herramientas:**

- `tools/cast-assets/` y `tools/character-assets/` (pipelines de Higgsfield y del modular)
- `frontend/scripts/character-manifest-lib.mjs` y su prueba
- `validate-character-manifest.mjs`
- `render-premium-contact-sheets.mjs`

**Pruebas:** las de los módulos borrados. `lobby.e2e.ts` se reescribe con aviso (§8.4).

## 11. Enmiendas a la biblia v1

- **§1:** la cabeza con pelo sigue en 18-21 px, salvo los peinados de `volumen`, que llegan a 25 px con el cráneo en 17 px. Los hombros (20-27 px) aplican solo de frente y de espalda; en perfil, el fondo del torso es de 10-16 px. La regla «la derecha no es espejo exacto» se cumple con la luz recalculada y las piezas asimétricas, y el validador la comprueba.
- **§2-3:** la luz y las viñetas ambientales van debajo de los actores; la viñeta de crisis es la única excepción. La presentación es a escala entera en píxeles físicos (zoom entero de cámara).
- **§4:** la autoridad pasa a `palette.v2.json` y a `catalog.json` (en lugar de `roster` y `actor-roster`).
- **§5:** la compuerta de aceptación es `npm run kit:check`, más la aprobación humana sobre láminas generadas en un HEAD concreto.

## 12. Fases (base del plan)

| Fase | Contenido | Parada de aprobación |
|---|---|---|
| F1 | Motor `kit-engine.ts`, build, `kit.json`, `manifest.json`, esqueleto de `kit:check` en CI. Valentina debe salir idéntica a la prueba (mismo hash de píxeles). | — |
| F2 | Complexión B y catálogo de piezas (pelo, ropa, calzado, capas, rostros y sus retratos) | sí: láminas por lote |
| F3 | Recetas: 12 jugables, 14 NPC, guía, figurantes y plantillas | sí: lámina del elenco |
| F4 | Resolver único, render a escala entera (zoom entero, DPR, luz debajo, sin `character-motion`, sin tintes) y migración del mundo | sí: capturas dentro del juego |
| F5 | Lobby, editor de personaje, intro, diálogo, resultado y editor de mundo | — |
| F6 | Migración de avatares (`localStorage` y `metadata.avatar`) | — |
| F7 | Borrado del legado, validador completo («sin legado») y e2e del lobby | aviso por `frontend/e2e/**` |
| F8 | Recalibrar muebles y puertas a la altura nueva (unos 39 px/m) y dibujarlos a ×1 exacto | sí: capturas dentro del juego |

Si un solo plan resulta demasiado largo, se parte en tres: **arte** (F1-F3), **integración** (F4-F7) y **escala del mundo** (F8). La rama no se integra en `master` hasta terminar la F8.

## 13. Riesgos y preguntas abiertas

1. **Escala del mundo.** A ×1 Valentina mide 64 px. Muebles y puertas están calibrados para unos 82 px (unos 46 px/m; la puerta mide 93 px) y se dibujan a escalas fraccionarias (0,9 a 1,45). Con la cámara a ×2, esos píxeles desiguales se notarán más. **Resuelto (decisión 12):** se recalibra a unos 39 px/m y se dibuja a ×1 exacto en la F8, dentro de esta rama.
2. **Indicador del estado de la paciente.** Hoy es un tinte rojo, verde o azul. **Resuelto (decisión 13):** un icono de pixel art sobre la cabeza.
3. **Cambio de identidad de la abuela.** Hoy usa el arte de una madre joven; la receta la hace mayor (moño canoso, rostro maduro). Lo mismo con roles que hoy comparten arte (trabajadora social, orientadora jurídica): pasan a tener aspecto propio.
4. **Patinaje.** A 150 px/s, una caminata de 6 cuadros a 10 fps patina. Las alternativas (12 fps o zancada más larga) afectan a la biblia; se deja anotado y no se cambia sin decisión.
5. **Volumen de arte.** 10 peinados × 4 vistas × 2 complexiones, más retratos, más unas 20 prendas: es el grueso del trabajo. Por eso las aprobaciones son por lote (F2 y F3).
6. **Motor TypeScript importado desde Node.** **Verificado (2026-10-03):** Node 24.16 importa `kit-engine.ts` desde `.mjs` y `node --test`; como `frontend/package.json` no declara `type`, los scripts se ejecutan con `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`. El motor portado reproduce los píxeles de la prueba (hashes iguales) y pasa `tsc` con las reglas del proyecto más `erasableSyntaxOnly`.
7. **Peinados de volumen.** Un afro o un moño alto dentro de 21 px se ven aplastados. **Resuelto (decisión 14):** hasta 25 px solo en peinados marcados como `volumen`, validando el cráneo (17 px con contorno).

## 14. Fuera de alcance

- Las animaciones de la fase 2 (hablar, interactuar, girar, reaccionar) y los 8 estados de retrato de la biblia.
- Guardar el avatar del estudiante en el backend: hoy solo vive en su navegador.
- Tilesets y el arte de la interfaz. Del mobiliario solo entra su escala (F8), no un rediseño.
- La velocidad de movimiento del jugador.
