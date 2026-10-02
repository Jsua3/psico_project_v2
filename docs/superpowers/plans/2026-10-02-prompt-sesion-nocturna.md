# Sesión nocturna — cierre del PLAN MAESTRO TOTAL de SIEP

Eres la sesión que trabajará esta noche en SIEP, sin supervisión, durante unas **10 horas**. El monorepo está en `D:\Sua_Files\IdeaProjects\psico_project_v3` (backend Django en `backend_django/`, frontend Angular 21 + Phaser 3 en `frontend/`). Mañana por la mañana el usuario revisará tu trabajo con su equipo (Psicología + Ingeniería de Software). **No hay prisa: prioriza la calidad y gasta pocos tokens.** Nadie responderá preguntas durante la noche.

## Contexto

- El simulador pasa de alpha a beta. Antes de la beta hay que terminar el PLAN MAESTRO TOTAL «de la A a la Z».
- Rama de trabajo: **`feat/cierre-plan-maestro`** (local, sale de `master` @ `0f930b1`). Haz `git switch feat/cierre-plan-maestro` en tu worktree; ya está liberada. Contiene:
  - `docs/PLAN_MAESTRO_TOTAL.md`: el plan original del 2026-06-07.
  - `docs/audits/2026-10-02-brechas-plan-maestro-total.md`: la hoja de ruta, con el estado de cada bloque y el orden de ejecución.
  - `docs/superpowers/plans/2026-10-02-bloque-b-game-feel.md`: el plan TDD del bloque B, listo para ejecutar.
- Empieza leyendo la hoja de ruta, el plan del bloque B y la memoria del proyecto (`MEMORY.md`). El plan maestro completo no lo leas tú; delega lo que necesites de él.
- La rama vieja `origin/feat/plan-maestro-total` **no se mergea**; de ella se portan piezas.

## Cómo trabajar y ahorrar tokens (obligatorio)

- **Tú orquestas y mantienes tu contexto pequeño.** No leas archivos grandes completos (`game-world.component.ts` ~2600 líneas, `simulation-play.component.ts` ~2000, `PLAN_MAESTRO_TOTAL.md` ~2400): delega esa lectura.
- **Delega en subagentes con la herramienta Agent y `model: "sonnet"` (Sonnet 5.5)**: `subagent_type: "general-purpose"` para implementar y redactar, y `"Explore"` para búsquedas de solo lectura. Dales prompts autocontenidos: rutas exactas, qué leer, qué entregar y el criterio de terminado. Pídeles un informe breve (máximo 15 líneas: qué cambió, commits, pruebas con su resultado, dudas).
- Lanza en segundo plano y en paralelo lo que sea independiente; las propuestas de C, E y F lo son. No hagas polling: los subagentes te avisan al terminar.
- **Revisión:** un revisor Sonnet por tarea del bloque B y una revisión final de toda la rama, también con Sonnet. Reserva el modelo más caro para alguna decisión crítica, si surge.
- Suites completas una vez por bloque; en los pasos intermedios, solo pruebas dirigidas.
- **Reparte el tiempo:** si algo se atasca más de ~45 minutos, documéntalo y pasa a lo siguiente.

## Reglas

- No mergees a `master`, no abras PR y no toques `master`. El control de permisos bloquea los merges sin revisión: no intentes rodearlo.
- Commits pequeños y frecuentes en `feat/cierre-plan-maestro`, con las líneas de atribución que te indique tu sesión. **Haz push de esa rama a `origin` al cerrar cada bloque**, como respaldo.
- **Sin cambios de esquema.** Django usa `managed=False`. Cualquier tabla, columna o CHECK nuevo va solo como propuesta escrita. La convención del proyecto es un script idempotente en `deploy/upgrades/`, el CHECK en `deploy/db_seed.sql` y la prueba `test_deploy_schema_contract.py` en verde; esta noche no se implementa.
- No cambies la semántica de la salida segura (ETH-02: `PAUSED` es una pausa reanudable y `REPLACED` es un reemplazo, no una salida segura) ni la del consentimiento (ETH-01). REGLA-004: la salida segura debe ser siempre alcanzable.
- No modifiques los datos de `psychosim-db` (BD de desarrollo, puerto 5433, encendida y con los tres `deploy/upgrades/` ya aplicados). Las pruebas backend usan su propia BD desechable con `npm run test:backend`.
- Si una acción necesita un permiso que nadie puede dar, o el clasificador la niega, no la rodees: anótala en el informe y sigue con lo siguiente.
- Las decisiones de producto no se toman en código. Si algo es reversible, elige la opción más conservadora y anótala; si no lo es, déjalo como pregunta para mañana.
- Mira con `ListAgents` si otra sesión trabaja en SIEP; si la hay, coordínate por `SendMessage` antes de tocar ramas compartidas.

## Entorno (Windows)

- Si a tu worktree le faltan `backend_django/.venv` o `frontend/node_modules`, crea uniones (junction) a `D:\Sua_Files\IdeaProjects\psico_project_v3\backend_django\.venv` y `D:\Sua_Files\IdeaProjects\psico_project_v3\.worktrees\ui-mes\frontend\node_modules`. Para borrar una unión usa `cmd /c rmdir`, nunca un borrado recursivo. Si hay que recrear un venv: `C:\Python313\python.exe -m venv`, porque el Python de la Microsoft Store rompe los venvs.
- Verificación desde la raíz: `npm run test:backend`, `npm run test:frontend` y `npm run build:frontend`. Jest da falsos rojos si corres varias suites a la vez: una cada vez.
- Los `.ts` del frontend usan CRLF: consérvalo.
- Browser pane: con el panel oculto, Phaser no llega a `create()` y las capturas fallan. Lee el estado de la escena con `window.ng.getComponent(...)`. `preview_start` usa el `.claude/launch.json` de tu propio worktree (un hook impide editar el del checkout principal), y si el nombre no existe arranca la primera configuración sin avisar. Revierte ese archivo al terminar.

## Trabajo de la noche, en este orden

### 1. Bloque B: implementar (~2 h)

Ejecuta `docs/superpowers/plans/2026-10-02-bloque-b-game-feel.md` con la skill `superpowers:subagent-driven-development`, con implementadores y revisores Sonnet, siguiendo el TDD tal como está escrito. Al terminar: suites completas, verificación en el Browser pane (Task 4), bloque B marcado en la hoja de ruta y push de la rama.

### 2. Propuestas de C, E y F: no implementar (~4 h, en paralelo)

Lanza tres subagentes Sonnet en paralelo, uno por bloque. Cada uno escribe una propuesta lista para que el equipo de Psicología la discuta mañana, **sin código de producción**. Pueden usar la skill `superpowers:brainstorming` para estructurarla, pero sin esperar respuestas: las preguntas van al documento.

**Fuentes:**
- **C** (diálogo «texto como síntoma» + retratos dinámicos + interrupciones QTE): sección «BLOQUE C» de `docs/PLAN_MAESTRO_TOTAL.md` y bloques visuales C y H; retratos existentes en `frontend/src/app/features/simulator/portrait-resolver.util.ts`; panel de diálogo en `dialogue-panel.component.ts`.
- **E** (Social Mapping): sección «BLOQUE E» del plan; sub-proyecto G («Social Mapping / Clue Inventory») de `docs/superpowers/2026-06-03-psychosocial-sim-roadmap.md`.
- **F** (Verbal Tension Box): sección «BLOQUE F» del plan; sub-proyecto I del mismo roadmap y sus decisiones transversales D1 y D2 (sección 3), que siguen sin resolver.
- **Para los tres:**
  - El caso real `SIM-VBG-001`, para sacar ejemplos concretos. Es contenido sensible: violencia basada en género, tentativa de feminicidio y feminicidio de una niña de 3 años, con escenas en hospital y comisaría. Está en `backend_django/apps/simulation/management/commands/seed_caso_pdf.py`.
  - Las reglas éticas ETH-01, ETH-02 y REGLA-004.
  - El marco recomendado en la investigación de Análisis y Diseño (informe en https://claude.ai/artifact/129JmoXkkV83gGb6mBZP4J; léelo con la acción `read` de la herramienta Artifact): Evidence-Centered Design (modelos de competencia, evidencia y tarea), LM-GM, MDA e INACSL.
- **Ojo con los IDs:** el plan cita RQ-NEG-002/003 para E y F, pero en el catálogo esos IDs son otra cosa (lo explica la hoja de ruta). No los uses como fuente.

**Cada propuesta** va en `docs/superpowers/specs/2026-10-03-bloque-<c|e|f>-<nombre>-propuesta.md` y tiene:
1. Resumen en lenguaje llano para psicólogos, sin jerga técnica (media página).
2. Qué competencia clínica entrena y cómo se evidencia (ECD: competencia → evidencia observable → mecánica o tarea).
3. Dos o tres alternativas de diseño, con pros, contras y riesgos éticos, pedagógicos y de accesibilidad, y una recomendada.
4. Cómo se vería y se jugaría: boceto ASCII o recorrido paso a paso con un ejemplo de `SIM-VBG-001`.
5. Cómo se evalúa: qué eventos registra (`AttemptEvent`), qué ve el docente en la traza y en el reporte, si afecta al puntaje o al estrés, y cómo encaja con la rúbrica.
6. Datos: qué se puede hacer con lo que ya existe (eventos, campos JSON) y qué exigiría un cambio de esquema (solo como propuesta).
7. Accesibilidad (WCAG 2.2, movimiento reducido, teclado, lector de pantalla) y ética (consentimiento, salida segura siempre alcanzable, no revictimizar, no convertir el sufrimiento en un juego).
8. Esfuerzo estimado por fases y dependencias con otros bloques.
9. Preguntas abiertas para el equipo de Psicología: numeradas, concretas y que se puedan responder en la reunión.

Luego revisa las tres, tú o un revisor Sonnet, para que sean coherentes entre sí: C, E y F comparten estado (Confianza, Reactividad y SIC del roadmap, el estrés y las métricas del caso) y no deben contradecirse. Por último, escribe `docs/superpowers/specs/2026-10-03-propuestas-c-e-f-resumen.md`: una página para la reunión de mañana con la recomendación de cada bloque, cómo encajan entre sí y las preguntas que más bloquean.

### 3. Si queda tiempo (opcional, en este orden)

1. **Bloque H (accesibilidad):** auditoría concreta de brechas en `docs/audits/` (contraste de landing y login, foco, juego con lector de pantalla) y su plan TDD. Implementa solo los arreglos claros y verificables, como el contraste, con pruebas.
2. **Bloque G (asistente IA):** propuesta corta de alcance para estudiante y docente. Debe tratar la privacidad: hoy el backend envía la pregunta y el contexto a un proveedor externo (Ley 1581/2012), y sin `AI_ASSISTANT_API_KEY` funciona en modo degradado. No implementar.
3. **Bloque J:** propuesta del escenario de hogar o consultorio, con el contenido clínico que el equipo tendría que aportar. No implementar.
4. **Bloques visuales:** auditoría pieza por pieza de los que la hoja de ruta marca «sin auditar».

## Al terminar, o si se acaba el tiempo

- Escribe `docs/audits/2026-10-03-informe-sesion-nocturna.md` con: lo que se hizo (con sus commits), lo que quedó a medias, las decisiones que tomaste y por qué, las preguntas para el usuario y su equipo, y el estado de las suites con números.
- Actualiza la hoja de ruta de brechas y la memoria del proyecto.
- Haz el push final de `feat/cierre-plan-maestro`. No abras PR.
