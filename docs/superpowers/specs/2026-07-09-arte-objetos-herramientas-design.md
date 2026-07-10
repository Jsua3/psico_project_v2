# Diseño: arte de las 5 herramientas clínicas

**Fecha:** 2026-07-09
**Estado:** Aprobado (brainstorming). Rama: `feat/arte-objetos-herramientas`.

## Objetivo

Reemplazar los marcadores abstractos de las 5 herramientas del caso (hoy un badge de color con un código de 3-4 letras) por **sprites pixel-art reconocibles** de cada objeto, generados con Higgsfield.

## Contexto verificado

- Las herramientas se dibujan en `game-world.component.ts` `createMarker()` (rama `object.type === 'TOOL'`) vía `buildToolMarker(color, shortCode)` — rectángulo de color + código (PAP/EPI/BIT/RUT/RIE). Alrededor van un ring/pulso, sombra de contacto y label oculto (se conservan).
- Las 5 herramientas (`tool_code` → qué es):
  - `PAP` → Kit de Primeros Auxilios Psicológicos (botiquín con cruz)
  - `SPIKES` → Protocolo EPICEE (tarjeta/documento por pasos)
  - `REFLECTION_JOURNAL` → Bitácora (libreta con lápiz)
  - `SAFETY_ROUTE` → Ruta de protección (señal/letrero con flecha)
  - `RISK_METER` → Valoración de riesgo (medidor/monitor con aguja)

## Alcance

### 1. Arte (Higgsfield)
- `z_image` (gratis) con prompt consistente por herramienta: ítem de juego pixel-art, vista clara, fondo plano → pixelado (downscale ~64 + cuantización) + `remove_background`.
- **Sonda primero:** generar Kit PAP, cablearlo y verlo en el mapa (valida estilo/tamaño/integración) antes de los otros 4.
- Estilo alineado con los personajes 2× (pixel limpio, paleta limitada, ligero contorno).

### 2. Assets
`frontend/src/assets/game/objects/tool_{pap,spikes,reflection_journal,safety_route,risk_meter}.png` (PNG RGBA ~64×64).

### 3. Integración
- `object-sprite.util.ts`: `resolveToolSprite(toolCode: string | null) → string | null` (ruta del asset o null si no hay). Test unitario.
- `game-world.component.ts`: precargar los sprites de herramienta; en `createMarker()` rama `TOOL`, usar `this.add.image(sprite)` cuando el asset existe/cargó, con **fallback** a `buildToolMarker` (badge actual) si falta. Ring/pulso/sombra/label intactos.

### 4. Verificación
- Assets servidos (200) · jest verde (resolver) · ng build OK.
- Smoke en vivo: en el mapa las herramientas se ven como ítems (botiquín, libreta…), no como badges; la interacción (recoger) sigue funcionando.

## No-objetivos
- No se tocan los 5 OBJECT de escenario, ni las puertas (EXIT), ni el mobiliario Kenney (lotes futuros).
- No se toca backend/esquema (solo assets + frontend).
