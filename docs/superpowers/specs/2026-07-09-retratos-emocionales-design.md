# Diseño: retratos emocionales del elenco NPC

**Fecha:** 2026-07-09
**Estado:** Aprobado (brainstorming). Rama: `feat/retratos-emocionales-npc`.

## Objetivo

Hacer que los diálogos del caso activo cobren vida: etiquetar con emoción los momentos ya cargados del guion y generar solo los retratos que esos momentos necesitan (curado, no "cada personaje × cada emoción").

## Hallazgos que lo enfocan

- Los 6 NPC-persona del caso YA tienen retrato neutral. La cobertura está completa.
- Varias líneas emocionalmente cargadas están etiquetadas `neutral` en `dialogue_trees.emotion` (p. ej. Abuela: "¡Quiero ver a mi nieta!"; Sobreviviente: "las heridas duelen menos que todo lo demás").
- Vocabulario de emoción del frontend (`emotionColor`/`emotionLabel`): `positive` (verde/receptiva), `concerned` (ámbar/preocupada), `danger` (rojo/alerta), `neutral`. El seed hoy usa `neutral`/`vulnerable`/`alerta`.
- Resolver actual (`portrait-resolver.util.ts`): `vulnerable→worried`, `concerned→worried`, `danger→sad`, `positive→neutral`. `NEUTRAL_ONLY_SLUGS` fuerza neutral para madre-vbg, funcionaria, psicologa, comisaria.

## Alcance

### 1. Retratos nuevos (~3, pipeline probado)
Generados con `flux_kontext` desde la neutral existente (referencia por job_id) → `remove_background` → pixelado 96×96 RGBA:
- `madre-vbg_worried.png` (Abuela angustiada) — ref job `11294f0b-eef4-4f38-88cb-776b51cae236`.
- `madre-vbg_happy.png` (Abuela aliviada/agradecida) — mismo ref.
- `psicologa-hospitalaria_happy.png` (Psicóloga cálida/receptiva) — ref job `6020bb03-cd2d-4a4c-84d7-f87d64997903`.
- Sobreviviente y Consultante ya tienen sad/worried/neutral — no se generan.

### 2. Resolver (`portrait-resolver.util.ts`)
- `EMOTION_TO_VARIANT`: `positive → happy` (antes neutral).
- `NEUTRAL_ONLY_SLUGS`: quitar `madre-vbg` y `psicologa-hospitalaria` (ahora tienen variantes); conservar `funcionaria-recepcion` y `comisaria-profesional`.
- Fallback intacto: si una emoción mapea a un asset inexistente para ese personaje, el `<img>` falla → silueta SVG (ya cableado con `onPortraitError`).
- Tests unitarios nuevos: `positive→happy`, y que la Abuela/Psicóloga ya no fuerzan neutral.

### 3. Seed (`seed_caso_pdf.py`)
Etiquetar ~6-8 `dialogue_trees` con la emoción correcta usando el vocabulario del frontend:
- Abuela angustia → `concerned`; Abuela gratitud → `positive`.
- Sobreviviente/Consultante dolor → `danger` (donde aplique); disclosure → `concerned`.
- Psicóloga contención → `positive`.
- Resto queda `neutral`.
Requiere re-seed (`bootstrap_dev_db`). Solo dato, no esquema (RNF-010 intacto).

## Verificación
- jest verde (resolver con `happy` + no-neutral para madre/psicóloga) · ng build OK.
- Re-seed + smoke en vivo: disparar diálogo de la Abuela y la Psicóloga → el retrato cambia con la emoción y la etiqueta del panel colorea acorde (verde/ámbar/rojo).

## No-objetivos
- No se generan variantes para Funcionaria/Comisaría (líneas procedimentales, quedan neutral).
- No se toca el esquema ni el backend más allá de los valores de `emotion` del seed.
- No se añade retrato del jugador (su avatar modular ya cumple ese rol).
