# Elenco horneado — pipeline de cosecha

Produce las hojas de sprites de `frontend/src/assets/characters/cast/`:
personajes completos (pelo + ropa + cara integrados) generados con Higgsfield
(z_image, gratis) y cosechados con `harvest_cast_sheet.py`.

## Contrato de hoja

Idéntico al sistema modular 2×, así que una hoja horneada es un drop-in para
las animaciones existentes (`createAvatarAnimationsFor`):

| Propiedad | Valor |
|---|---|
| Hoja | 384×576 = 3 columnas (caminata) × 3 filas (dirección) |
| Frame | 128×192, pies en y=180, personaje de 168px de alto |
| Filas | frente / lado-DERECHA / espalda (izquierda = flipX) |
| Caminata | ping-pong `[1,0,2,0]` a 8 fps; idle = col 0 |
| Paleta | cuantización conjunta a 40 colores (las 9 celdas comparten paleta) |

Jugables: `<id>.png` (p. ej. `valentina.png`), registrados en `PLAYABLE_CAST`.
NPCs: `npc_<preset>.png` (p. ej. `npc_madre-vbg.png`), registrados en
`NPC_CAST` (`baked-cast.util.ts`). Un preset sin entrada cae al modular.

## Receta por personaje

1. **Generar** con z_image (gratis, ~40 s), guardando los job ids:
   - 2× rejilla "RPG Maker sprite sheet … 3 columns and 4 rows, row 1 walking
     DOWN … row 4 walking UP …" (aspect 3:4). Da frentes/espaldas reales y a
     veces perfiles; las celdas salen desparramadas, no en rejilla exacta.
   - 1× tira "walk cycle animation strip, 4 frames … walking to the RIGHT …"
     (aspect 16:9). Da perfiles consistentes. ¡La dirección real varía por
     tanda: unas obedecen RIGHT, otras dibujan LEFT — verificar siempre!
   - Si faltan espaldas: tira "seen from BEHIND walking AWAY from the camera"
     (funciona de forma fiable; le pasó al supervisor).
2. **Descargar** los `rawUrl` de `job_display` (copiarlos textualmente).
3. **Galería** numerada para elegir a ojo:
   ```
   python harvest_cast_sheet.py x --grid g1.png --grid g2.png --strip s.png \
       --gallery gal.png [--loose]
   ```
   `--loose` relaja los filtros de blob (necesario con sub-estilos anchos:
   al guarda de seguridad los filtros estrictos le vaciaron la rejilla entera).
4. **Ensamblar** con picks manuales (índice negativo = espejar; la primera
   celda de cada fila es el idle; filas cortas se completan con espejo
   (frente/espalda) o repitiendo el idle (lado)):
   ```
   python harvest_cast_sheet.py out.png --grid … --strip s.png \
       --pick "front=5,0 side=4,16,18 back=1,2" --preview prev.png [--loose]
   ```
5. **Verificar el preview** (SIEMPRE, cuesta un vistazo):
   - fila 2 mira a la DERECHA en las 3 celdas,
   - fila 1 col 0 es un frente de verdad (no un 3/4 ni una espalda),
   - las 3 filas son del MISMO sub-estilo (ver "lotería de familias").

## Lecciones aprendidas (no re-aprender)

- **z_image ignora layouts custom**: pedir una tira frontal da perfiles;
  la fraseología "RPG Maker sheet" sí produce frentes/espaldas reales.
- **Lotería de familias**: cada generación trae 1-2 sub-estilos ("familias")
  con proporciones distintas. Mezclar familias EN UNA FILA parpadea al animar;
  mezclarlas entre filas salta al girar. Regla: una sola familia por hoja si
  se puede, y si no, familia consistente por fila y paleta idéntica.
- **La tira y la rejilla pueden diferir en tono de piel** aunque el prompt sea
  idéntico (le pasó a la colega). Preferir una hoja homogénea de la rejilla
  antes que la fidelidad exacta al preset.
- **La clasificación automática de vistas NO generaliza** entre sub-estilos
  (orejas + pelo oscuro parecen ojos; cuellos parecen caras). El camino
  robusto es `--gallery` + `--pick` con un humano/agente eligiendo.
- **flux_kontext no rota personajes** (reescribe la instrucción con
  enhance_prompt y devuelve casi la misma imagen): no sirve para vistas.
- **La identidad se sostiene** dentro de una generación y entre generaciones
  del mismo prompt detallado (el espacio pixel-chibi es pequeño). Por eso
  regenerar una vista que faltó es barato y seguro.
- **2 zancadas > 1**: si solo hay una zancada lateral, repetirla como col 2
  (`side=idle,paso,paso`) da la alternancia paso-apoyo clásica de 2 frames.

## En el juego

- Jugables: el editor de personaje ofrece el elenco (`castId` en el avatar);
  `resolveCastId` valida y cae al modular si la hoja no existe.
- NPCs: `ensureNpcComposite` prefiere `npcCastSheetId(preset)` y solo compone
  modular si no hay hoja. El tinte por preset se omite con hoja horneada.
- Vida: respiración idle + bob de caminata (character-motion.util) aplican
  igual a horneados y modulares; `adolescente-nna` renderiza a escala 0.36.
