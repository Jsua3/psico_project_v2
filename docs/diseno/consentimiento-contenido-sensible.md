# Spec — Consentimiento antes de contenido sensible (ETH-01)

**Fecha:** 2026-07-10 · **Rama:** `feat/elenco-horneado-animacion` · **HEAD inicial:** `f3456ee`
**Defecto:** ETH-01 del registro vivo de `archivo.md` §12 (P0, Fase 1).

## Resultado observable

Al entrar o reanudar un intento en el simulador, el estudiante ve **primero** una
advertencia neutral de contenido con consentimiento explícito. Hasta que consiente:

- el video de introducción **no se renderiza ni se descarga** (el `<video>` no existe en el DOM);
- la narrativa del caso y su audio (`playIntroLament`) **no se reproducen**;
- el mundo permanece congelado (`worldMotionPaused`);
- Escape **no** dispara la salida segura (que mutaría el intento en backend);
- puede elegir **Continuar** (el flujo video → narrativa → juego queda idéntico al actual)
  o **Volver al catálogo** (navegación honesta, sin penalización: el intento queda
  `IN_PROGRESS` y reanudable — no se toca la semántica contestada de `safe_exit`/ETH-02).

Nada de lo existente se degrada: tras consentir, video, narrativa, `reduce-motion`
(salta el video) y gameplay se comportan exactamente igual que hoy.

## Causa raíz

`maybeShowInitialCaseIntro()` en `simulation-play.component.ts` muestra el video
(o la narrativa con `prefers-reduced-motion`) directamente al cargar el mundo.
No existe ninguna puerta de advertencia/consentimiento previa; la única mención
es un `<p class="sr-only">` informativo. El `<video>` con `[src]` se monta al
mostrarse el overlay, iniciando la descarga sin consentimiento (solapa PERF-01).

## Diseño mínimo

1. **Lógica pura extraíble** — `intro-gate.util.ts` con
   `resolveIntroStep(ctx): 'consent' | 'video' | 'narrative' | 'none'`:
   - intento no `IN_PROGRESS` → `none`;
   - sin consentimiento registrado → `consent` (también al reanudar a mitad de caso);
   - nodo/mapa distinto de `hospital-urgencias` → `none` (comportamiento actual);
   - intro ya leída → `none`;
   - `reduceMotion` → `narrative`; si no → `video`.
2. **Persistencia** — `sessionStorage` con clave por intento
   (`siep_case_consent_<caseVersionId>_<attemptId>`), mismo patrón que la intro.
   Conservador: cada sesión de navegador vuelve a pedir consentimiento.
3. **Componente** — señal `showContentWarning`; overlay `role="dialog"` con texto
   neutral (sin detalle gráfico, sin recursos inventados), botones Continuar /
   Volver al catálogo; branch temprano en `handleGlobalInteraction` que traga las
   teclas bajo el overlay (evita Escape→`safeExit`); `worldMotionPaused` incluye
   la nueva señal.

## Qué NO cubre este slice (residuales registrados)

- Recursos institucionales de apoyo en la advertencia: requieren datos SME
  verificados (institución, jurisdicción, fecha de revisión). No se inventan (§16).
- Precarga de audio ambiental del `audio-director` antes del consentimiento (PERF-01).
- Focus trap completo del modal (A11Y-01, aplica a todos los overlays existentes).
- Semántica pausa-vs-cierre de la salida segura (ETH-02, decisión de producto).
- Revisión SME/docente del texto de la advertencia: **pendiente**, separada de la
  validación técnica.

## Plan TDD

1. `intro-gate.util.spec.ts` rojo: ordering invariante (consentimiento precede a
   video/narrativa en toda combinación; `none` para intentos cerrados; narrativa
   con `reduceMotion`; `none` fuera del nodo inicial tras consentir).
2. Implementar `intro-gate.util.ts` → verde focalizado.
3. Cablear componente (overlay, señal, teclado, `worldMotionPaused`).
4. `npm run test:frontend` y `npm run build:frontend` verdes.
5. Verificación live: consentimiento visible antes del video; sin request del
   video antes de consentir; Volver al catálogo funciona; Escape no muta.
