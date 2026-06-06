# Juego 2.5D — Rebanada 4: Pantalla de resultados ("¡Simulación completada!")

- **Fecha:** 2026-06-05
- **Estado:** Aprobado (control delegado total). Spec para auditoría.
- **Iniciativa:** SIEP 2.5D pixel-art. Rebanada 4 de ~7. Anteriores: motor profundidad, HUD liquid-glass, editor de personaje (todas mergeadas).
- **Repos:** **solo frontend.** Sin backend, sin migración.
- **Rama:** `feat/game-outcome-screen`, sobre `master`.

## 1. Contexto

Al terminar un intento (`game.status !== 'IN_PROGRESS'`), `simulation-play.component.ts` muestra `end-state-overlay`: un overlay oscuro con icono, mensaje, una `report-grid` 2×N de métricas, listas de decisiones y competencias en texto plano, y un único botón "Volver al simulador". Es **funcional pero básico**.

El mockup §24 / `docs/ChatGPT Image *08_53_32*(4).png` muestra una pantalla rica: trofeo + "¡Simulación completada!", fila de métricas (Puntaje, Progreso, Estrés final, Tiempo, Desempeño), **resultados por competencia**, **decisiones clave**, **retroalimentación del sistema** (con avatar), y botones **Reintentar caso / Volver al portal**.

Los datos ya existen: `AttemptCompletionReport` (`simulation.model.ts:59`) trae `finalScore`, `finalStress`, `metrics`, `totalDurationSeconds`, `phaseDurations[]`, `adequateDecisions`, `riskyDecisions`, `inadequateDecisions`, `prohibitedDecisions`, `toolsUsed`, `reflectionsCount`, `safeExitUsed`, `visitedNodeTitles[]`, `competencies[]`, `recommendations[]`, `summaryMessage`. El componente ya tiene `formatDuration()` y `startNewAttempt()`.

## 2. Objetivos / No-objetivos

**Objetivos:**
1. **Util pura `outcome.util.ts`** (TDD): `performanceLabel(report)` (Excelente/Adecuado/En desarrollo/Requiere refuerzo según ratio de adecuación, penalizando prohibidas) y `adequacyPercent(report)`.
2. **Rediseñar `end-state-overlay`** a una tarjeta **liquid-glass morada** fiel al mockup §24:
   - Cabecera: icono (trofeo/salida) + título + **avatar del estudiante** (portrait, reusa `AvatarFigureComponent` + `AvatarStore`) + `summaryMessage`.
   - **Métricas** (cards): Puntaje total, Progreso (nº escenarios visitados / desempeño 100% si COMPLETED), Estrés final, Tiempo invertido, **Desempeño** (`performanceLabel`).
   - **Decisiones clave**: barras/contadores Adecuadas / Riesgosas / Inadecuadas (+ alerta ética si `prohibitedDecisions`), y chips: herramientas usadas, reflexiones, salida segura.
   - **Competencias trabajadas**: tags desde `competencies[]`.
   - **Retroalimentación**: `recommendations[]` / `summaryMessage`.
   - **Acciones**: **Reintentar caso** (`startNewAttempt()`), **Volver al portal** (`/portal/dashboard`), **Volver al simulador** (`/portal/simulador`).
3. Estado **Salida segura** (`SAFE_EXITED`): misma tarjeta en tono sereno (sin "completada", sin trofeo), respetando que la salida segura no penaliza.
4. Accesibilidad: `role="alert"`/`dialog`, foco al título, métricas con etiquetas; avatar `aria-hidden` (decorativo) con resumen textual.

**No-objetivos:** barras por-competencia con puntajes numéricos (no hay score por competencia → se muestran como tags, honesto con los datos); tocar el cálculo del reporte (backend); animaciones pesadas; renderizar el avatar dentro del runtime Phaser.

## 3. Diseño

### 3.1 `outcome.util.ts` (+ spec)

```ts
import { AttemptCompletionReport } from '../../core/models/simulation.model';
export type Performance = 'Excelente' | 'Adecuado' | 'En desarrollo' | 'Requiere refuerzo' | 'Sin decisiones';

export function decisionTotal(r: Pick<AttemptCompletionReport,'adequateDecisions'|'riskyDecisions'|'inadequateDecisions'>): number;
export function adequacyPercent(r): number;     // round(adequate/total*100); total 0 → 0
export function performanceLabel(r): Performance;
```
- `performanceLabel`: `total = adequate+risky+inadequate`. Si `total===0` → 'Sin decisiones'. `pct = adequate/total`. Si `prohibitedDecisions>0` baja un escalón. Cortes: `>=0.8`→Excelente, `>=0.6`→Adecuado, `>=0.4`→En desarrollo, else→Requiere refuerzo (tras el posible descenso por prohibidas).

### 3.2 Template — reemplazar `end-state-overlay` en `simulation-play.component.ts`

Nueva estructura dentro del `@if (game.status !== 'IN_PROGRESS')`:
- `<section class="outcome liquid-glass" [class.outcome--safe]>` con `role="alertdialog"`.
- Cabecera con `app-avatar-figure [config]="avatar()" [portrait]="true"` en un marco circular, título dinámico y `summaryMessage`.
- `report` (si existe): grid de métricas, bloque decisiones (barras proporcionales con `adequate/risky/inadequate`), tags de competencias, retroalimentación.
- Footer de acciones (Reintentar / Portal / Simulador).
- Inyectar `AvatarStore` (público `avatar = store.avatar`) e importar `AvatarFigureComponent` en el componente. Importar helpers de `outcome.util`.

### 3.3 `AvatarFigureComponent` — input `portrait`

Añadir `portrait = input(false)`: cuando true, usa `viewBox="22 26 76 76"` (recorta a cabeza/hombros) para un retrato; default mantiene el bust completo. Cambio mínimo y reutilizable.

### 3.4 Estilos

Tarjeta liquid-glass morada (vars análogas a rebanada 2: superficie translúcida, borde/glow morado, texto lavanda/blanco). Métricas en cards glass; barras de decisiones con verde `#6EC67A` / ámbar `#F5B84B` / rojo `#E25A4F`; competencias como chips morados. `outcome--safe` usa acentos sobrios (sin verde de "logro"). Responsive (scroll si excede alto). `prefers-reduced-motion`: sin entrada animada.

## 4. Errores / bordes

- `completionReport === null` (cierre sin reporte): mostrar solo cabecera + acciones (degradación elegante).
- `totalDurationSeconds === null` → "—".
- `competencies`/`recommendations` vacíos → ocultar esa sección.
- Decisiones todas 0 → barras vacías + "Sin decisiones registradas"; `performanceLabel`='Sin decisiones'.
- `SAFE_EXITED` → título "Salida segura registrada", sin trofeo, mensaje de no penalización.

## 5. Pruebas

- **jest (TDD):** `outcome.util.spec.ts`:
  - `decisionTotal`/`adequacyPercent`: 4/0/0 → 100%; 2/1/1 → 50%; 0/0/0 → 0%.
  - `performanceLabel`: 5/0/0 → 'Excelente'; 3/1/1 → 'Adecuado'(0.6); 2/1/2 → 'En desarrollo'; 1/2/3 → 'Requiere refuerzo'; 0/0/0 → 'Sin decisiones'; con `prohibited>0` baja un escalón (p.ej. 5/0/0+prohibited → 'Adecuado').
- **ng build** verde; suite jest sin regresión.
- **Smoke navegador:** completar un intento `SIM-VBG-001` (o forzar estado COMPLETED) → ver la tarjeta de resultados liquid-glass con avatar, métricas, decisiones, competencias, retroalimentación; probar **Reintentar** y **Volver al portal**; verificar variante salida segura y legibilidad.

## 6. Criterios de aceptación

- La pantalla de fin de partida coincide con el mockup §24 (liquid-glass morada, métricas, decisiones, competencias, retro, avatar) y usa datos reales del `completionReport`.
- `Reintentar caso` reinicia el intento; `Volver al portal`/`Volver al simulador` navegan.
- `outcome.util.spec.ts` verde; `ng build` verde; suite jest sin regresión.
- Sin backend/migración; salida segura sin penalización; resto de la app intacto.

## 7. Cómo se procede

`writing-plans` → plan → `executing-plans` (TDD util, luego template+estilos, build) → `verify` (jest+build+smoke) → `finishing-a-development-branch` (merge a master).
