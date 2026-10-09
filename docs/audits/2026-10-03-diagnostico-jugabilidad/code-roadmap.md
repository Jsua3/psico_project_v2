# Verificación del ROADMAP (PLAN MAESTRO TOTAL) contra el código real

**Fecha:** 2026-10-03 · **Código medido:** rama `claude/peaceful-goodall-a2gobv` = `master` @ `51d1409` (merge del PR #15), árbol limpio · **Modo:** solo lectura (grep, lectura de archivos, `git log`, una consulta a la API de GitHub). No se ejecutó el juego, ni Jest, ni e2e, ni se usó ninguna cuenta de prueba.
**Convención:** «archivo:línea» = leído hoy. «(inferencia)» = deducción por lectura, no ejecutada. «Hermano» = informes de los otros agentes de esta fase en la misma carpeta (`playtest-feel.md`, `playtest-touch.md`, `playtest-keyboard.md`, `code-dialogue.md`, `code-wayfinding.md`), citados como contraste, no como única fuente.

---

## 0. Resumen en una página

1. **Ningún bloque del roadmap trata directamente el «no se sabe qué hacer»**. Los bloques A-L miden profundidad (audio, game feel, diálogo expresivo, mapa social, tensión verbal, IA, accesibilidad, CI, casos nuevos, landing, secretos). Lo que el líder describe es el criterio **RNF-001** (≥90 % completa el inicio y el primer nodo *sin ayuda*; herramientas, **ayuda** y salir localizables en ≤30 s) que el bloque K «Landing y onboarding» debía cubrir y **no cubre**: en el juego no existe ninguna «Ayuda» ni «Cómo se juega» (grep de «ayuda|onboarding|tutorial|cómo se juega» en `frontend/src/app`: solo aparece «Controles táctiles»; el menú Ajustes del HUD tiene Música, Sonidos, Movimiento reducido, Bitácora y Catálogo, `simulation-hud.component.ts:112-152`).
2. **Tres filas del roadmap están mal marcadas «Hecho»**: **A** (solo existe 1 de 4 capas de música y la única pista se **apaga en crisis**), **I** (el CI no tiene escaneo de secretos ni cobertura, que son criterios de Done del plan) y **K** (landing sí; onboarding no, y la portada promete 3 casos cuando hay 1). **B** está bien construido pero **nadie lo ha visto**. **L** se verifica hoy (repo privado confirmado por la API de GitHub) pero con riesgos vivos (credenciales de demostración públicas, `JWT_SECRET` por defecto aceptado en producción).
3. **Lo más urgente de todo el roadmap es un bloqueante de H, no de los bloques «nuevos»**: la tarea 10 (salida segura). Con un diálogo de decisión abierto, en táctil o con ratón, no hay forma de pausar; durante la introducción animada tampoco (REGLA-004 / ETH-02). Los playtests hermanos lo reprodujeron (`playtest-touch.md` TOUCH-02, `code-dialogue.md` DLG-01 y DLG-17).
4. **C, E, F, G (contenido), J (caso nuevo) son «bloqueados por Psicología»** en lo que importa. Pero cada uno tiene una parte técnica o de presentación que se puede construir ya **sin inventar contenido clínico**: C fase 1 (los retratos nunca cambian porque las emociones del caso no están en el mapa del resolver), el botón «Pausa segura» reutilizable (0b), el escritor con bloqueo para `flags_json` (0c), la bandera de apagado del asistente, la generalización de J (E1) y un panel de **Ayuda** que reutilice texto ya sembrado (descripciones de herramientas).
5. **Deuda que pone en riesgo el trabajo de esta semana** (sección 7): `game-world.component.ts` (2701 líneas: una escena Phaser de ~2200 líneas + un wrapper de ~200) y `simulation-play.component.ts` (2101: plantilla 294, estilos 515, clase 1228) son leídos como **texto** por 13 specs «de contrato» con regex; cualquier extracción de código rompe esas pruebas. El e2e `full-case` tiene **9 movimientos en píxeles fijos y 18 `moveUntilNearby` por nombre** y solo corre de noche: los arreglos de orientación, prioridad de interacción y colisión de NPC lo romperán y el PR no lo avisa. Y hay una **carrera de escritura sobre `flags_json`** (`world_service.update_position` guarda la fila completa) que se agrava si E/F añaden más claves.
6. **Orden recomendado**: Ola 1 (directo a «qué hacer / sentirse bien», sin Psicología, 7-12,5 días-persona): T10 salida segura → Ayuda/«Cómo se juega» → audio → C fase 1 → pase visual de B con umbrales unificados. Ola 2 (cumplimiento: atajos 2.1.4, anuncios, foco, bandera de IA, CI, secretos). Ola 3 (con decisión). Ola 4 (Psicología).

---

## 1. Método y límites

- Para cada bloque se leyeron los 5 documentos de auditoría pedidos, el plan H, las 7 propuestas/specs y el `PLAN_MAESTRO_TOTAL.md` (criterios de Done de A, B, D, I, K, L) y se **volvió a buscar la pieza en el código** (símbolos, rutas, líneas).
- Verificado por conteo propio: inventario visual `inventory.v1.json` (66 `assets` + 8 `maps` = 74; 33 `assets` y los 8 mapas `premium-v1` no existen = 41 faltantes, coincide con la auditoría), 10 PNG de retratos, 8 carpetas v1 frente a 10 identidades en `roster.v1.json`, 110 archivos `.spec.ts` en `frontend/src` (la sesión nocturna informó 111 suites; diferencia irrelevante), 13 specs que leen el texto de los dos monolitos, `.github/workflows` (2 archivos), historial de git (265 commits) sin patrones de claves de proveedor.
- **No verificado (límites):** nada en pantalla (viñeta, destello, sacudida, escala del jugador); nada con lector de pantalla; no corrí la suite de pruebas (el estado «886 pruebas en verde» es el del informe nocturno); no corrí gitleaks (solo `git grep` y `git log -G` con patrones comunes, que **no** es exhaustivo).
- Las estimaciones de esfuerzo de las propuestas (C, E, F, G, J) son **suyas y no están calibradas**; las de «incremento mínimo» son mías (inferencia, sin histórico).

---

## 2. Tabla maestra

Leyenda de **contribución**: **Directo** = ataca «no se sabe qué hacer» o «no se siente bien» · **Indirecto** = cumplimiento o base necesaria · **Aparte** = no cambia la experiencia de hoy. **Estado real**: ✔ cumple el criterio · ◐ parcial · ✘ no existe.

| Bloque | Roadmap dice | **Estado real verificado** | Contribuye | Incremento mínimo SIN contenido clínico | Requiere Psicología / decisión externa | Esfuerzo mín. |
|---|---|---|---|---|---|---|
| **A** Audio | ✅ Hecho | ◐ Howler y 10 SFX sí; **1 de 4 capas** de música; la pista **se calla con estrés > 85**; recoger herramienta y cruzar puerta sin SFX propio | **Directo** | Piso de volumen mientras haya una sola capa, `door_open` y SFX de recogida, utilidad común de niveles de estrés | Música por capas propia (compositor) | S (0,5-1 d) |
| **B** Game feel | ✅ Hecho (falta verlo) | ✔ implementado y cableado de punta a punta; ✘ visto; ◐ umbrales de estrés incoherentes entre 5 sistemas | **Directo** | Pase visual con el kit de Playwright + `stress-tier.util.ts` único + decidir viñeta DOM | Confirmar que la sacudida tras opción riesgosa es aceptable (límite 2) | S (0,5-1,5 d) |
| **C** Diálogo-síntoma / retratos | ⚠️ Parcial | ◐ retratos y panel existen; **las emociones del caso no activan ningún retrato** (`anxious`, `negative`, `sad`, `relieved` caen a neutral); nada de `DialogueEmotion`, ritmo ni interrupciones | **Directo** (fase 1) | **C fase 1**: emoción canónica + alias + mapa de retratos con el arte existente; quitar chip/etiqueta de personas | Validar alias (P9) y estados; ritmo/pausas y piloto: Psicología + calibrar con 3-5 estudiantes | S-M (2-4 d) |
| **D** Avatar | ✅ Hecho | ✔ v1 (8), cast (12), modular; ◐ `V1_AVATAR_SCALE = 1` sin calibrar; `roster.v1.json` dice 10, hay 8 carpetas | Indirecto | Recortar roster a 8 + prueba de contrato; decidir escala con captura | — | S (0,5 d) |
| **E** Social Mapping | ❌ No existe | ✘ confirmado (cero símbolos fuera de docs) | Aparte (a futuro orienta) | Ninguno visible. Infra: 0b, 0c, 0d | Toda la red, textos de pistas, instrumento, P1-P5, P12 | Ing. 12-21 d + 6-10 d Fase 0 |
| **F** Verbal Tension Box | ❌ No existe | ✘ confirmado; el spec de HUD 2026-06-08 cita `verbalTension` como input «real» y no lo es | Aparte | Ninguno. Solo infra (0b, 0c, 0d) | **Todos** los intercambios de entrevista y su validación (F-P5) | Ing. 20-31 d + Psic. 11-17 d |
| **G** Asistente IA | ⚠️ Parcial | ◐ backend abierto, **sin bandera, sin pruebas, pregunta en claro 360 días**; sin pantalla | Directo (ayuda de interfaz) / Aparte (IA) | Bandera `AI_ASSISTANT_ENABLED=false` + prueba; panel **Ayuda** sin IA (comparte con K) | 30-50 entradas curadas; concepto jurídico antes de cualquier proveedor | 0,5-1 d (bandera) + S-M (panel) |
| **H** WCAG 2.2 AA | ⚠️ Parcial (T1-9 hechas) | ◐ T1-9 verificadas en código; **T10-T15 pendientes**; T10 es **bloqueante** | **Directo** (T10, T12) / Indirecto | T10 completa con defaults; T11 opción B; T13/T15 partes automatizables | Qué se lista en «Alrededor» sin revelar evidencia (T12); verificación con NVDA/VoiceOver | T10: M (2-3 d) |
| **I** CI | ✅ Hecho | ◐ 4 jobs + nocturno; **faltan secretos y cobertura** (Done del plan); `@full-case` fuera del PR | Indirecto (protege lo demás) | gitleaks, e2e de escritorio en PR que toque `simulator/**` | — | S (0,5-1 d) |
| **J** Escenarios adicionales | ⚠️ Parcial | ◐ un solo caso; acoplamientos verificados (finales, intro, aviso, retratos, login) | Aparte | **E1 de la propuesta J**: generalizar finales/métricas/aviso/intro por caso | Caso clínico completo (23-42 h + 6-10 h de revisión), A/B/C, aviso ETH-01 y recursos | Ing. 8-15 d (E1) |
| **K** Landing y onboarding | ✅ Hecho | ◐ landing sí; **onboarding ✘**; promete 3 casos (hay 1); «Ver todos los casos» apunta a sí misma; sin «Ayuda» en el juego (RNF-001) | **Directo** | Panel/primera visita «Cómo se juega» + botón «Ayuda» en HUD y catálogo; landing honesta | Nada si solo hay controles y descripciones ya sembradas | S-M (2-3 d) + 0,5 d landing |
| **L** Repo privado + secretos | ✅ Hecho | ✔ privado (API de GitHub hoy); ✔ sin claves de proveedor en árbol ni historial (patrones comunes); ◐ credenciales demo públicas, `JWT_SECRET` por defecto aceptado en prod | Indirecto | Documentar/forzar cambio de claves demo; exigir `JWT_SECRET` ≠ defecto y `REFLECTION_ENCRYPTION_KEY` explícita | Jurídica (si el despliegue es público) | S (0,5-1 d) |
| **Visuales A-J** | «Hecho por otra vía» | ✔ confirmado por conteo; arte pendiente real = 3 piezas (retratos `closed`, pase visual, caso 2) | Indirecto | Pase visual (ya contado en B) | Retratos `closed` solo si se aprueban C y F | 0,5 d (pase) |

---

## 3. Detalle por bloque

### A — AudioDirector con Howler

**Estado real hoy.**
- `howler` y `@types/howler` en `frontend/package.json:25-26`. `AudioDirectorService` (282 líneas, `audio-director.service.ts`) con capas `ambient | tension | resolution | crisis` declaradas (`:5`) pero **solo se carga `ambient`** (`:59-61`, `assets/game/audio/Musica_PsicoGame.mp3`); `assets/audio/{music,sfx}` solo tienen `.gitkeep`.
- `setStressLevel` (`:129-158`): ≤30 ambient 1,0; 31-60 baja a 0,5 y sube `tension` (no existe); 61-85 ambient 0,2; **>85 ambient 0** y `crisis` (no existe). Como solo hay una pista, **la música baja a 0,2 y luego a 0 justo cuando la tensión es máxima** (inferencia desde el código; coincide con `playtest-feel.md` §3.7). Los 3 stems que faltan son un no-op silencioso.
- SFX: 10 declarados (`:79-90`). Se reproducen `ui_select`, `ui_confirm`, `ui_cancel`, `dialogue_advance` (también al **cruzar puertas**, `simulation-play.component.ts:1807-1808`, `triggerFade`), `session_complete`. **Nunca** se reproducen `door_open`, `footstep_tile/wood` (los pasos los hace Phaser, `game-world.component.ts:467`, `step0-2`), `stress_high`, `crisis_start`. Recoger herramienta y desbloquear slot: silencio (`playtest-feel.md` F-06).
- Criterios de Done del plan: «la música cambia de stem al subir el estrés» → **no se cumple en la práctica**; «SFX en pasos y clics» ✔; «reduced-motion suprime pasos» ✔ (Phaser y `playSfx:173`); «sin errores de consola» ✔.

**Incremento mínimo entregable (sin contenido clínico).**
1. Mientras `stems.size === 1`, `setStressLevel` no baja `ambient` de ~0,6 ni a 0 (un piso de volumen; sin cambios en el archivo de audio).
2. Usar `door_open` al cruzar puertas en lugar de `dialogue_advance`; SFX discreto al recoger y al desbloquear herramienta reutilizando los OGG de Kenney ya incluidos.
3. Una utilidad `stress-tier.util.ts` compartida (ver B y sección 7: hoy hay 5 juegos de umbrales).
4. Pruebas en `audio-director.service.spec.ts` (ya usa `Howl` mockeado, `:34-90`).
- **No** activar `stress_high`/`crisis_start`: el límite 2 y la propuesta C descartan «sonidos de crisis».

**Necesita Psicología/decisión.** Nada para 1-4. Música propia por capas (tensión/crisis) = decisión creativa externa y revisión clínica (tensión sonora en un caso de VBG); no bloquea.
**Dependencias.** Comparte umbrales con B y con T13 (anuncios).
**Riesgos.** Tocar `simulation-play.component.ts:1808` choca con cualquier agente que edite `triggerFade`. Autoplay del navegador ya está resuelto por Howler tras el clic de consentimiento (inferencia).
**Esfuerzo.** S (0,5-1 d). **Aporta a «se siente bien»:** sí, directo.

### B — WebGL Pipeline + GameFeel

**Estado real hoy.**
- `game-feel.util.ts` (80 líneas): viñeta de crisis (`crisisVignetteState`, α 0 hasta 50, 0,55·t hasta 85, pulso 0,55↔0,85 a 800 ms por encima de 85), sacudida (`decisionShake`: 200 ms/0,003 en RISKY o INADEQUATE; 260 ms/0,006 en conducta prohibida), destello (`roomEntryFlash`: 120 ms, tope 0,45).
- Cableado: `game-world.component.ts:562-612` (`setStressLevel`, `playDecisionImpact`, `playRevealEffects`), `:1750-1830` (viñetas y destello), `:2556` (entrada `stressLevel`); `simulation-play.component.ts:1473` (impacto pendiente tras decidir), `:1814-1821` (se dispara cuando la sala ya se ve, tras `SCENE_FADE_MS`). Pruebas: `game-feel.util.spec`, contrato y `game-world.game-feel.behaviour.spec.ts` (202 líneas, con dobles de Phaser).
- **Nadie lo ha visto**: ni la sesión nocturna ni los playtests hermanos capturaron la viñeta (grep de «viñeta|sacudida|destello» en `playtest-*.md`: sin observaciones de pantalla).
- **Umbrales de estrés incoherentes** (5 juegos): HUD calma <25, moderada <50, elevada <75, crítica ≥75 (`simulation-hud.component.ts:465-471`); viñeta DOM antigua desde 40 (`simulation-play.component.ts:967-971`); viñeta Phaser desde 50 y pulso >85 (`game-feel.util.ts:5-9`); audio 30/60/85; sprite de la paciente ≥70 (`crisisLevel`). A estrés 75-85 el HUD dice «crítico» y ni el pulso ni la música lo reflejan.
- Siguen las **dos viñetas superpuestas** (`.stress-vignette` DOM + Phaser), decisión pendiente del informe nocturno.
- La sacudida solo ocurre tras opciones RISKY/INADEQUATE/prohibidas. No viola el límite 1 (llega **después** de elegir), pero un temblor ligado solo al «mal» es lenguaje de golpe/castigo (límite 2) y refuerza la regla del reintento que ya es opaca (`code-dialogue.md` DLG-04/DLG-07).

**Incremento mínimo.** (1) Pase visual: con `playkit.mjs` (`openGame` + `scene.setStressLevel(92)` desde `ng.getComponent(app-game-world)`) tomar capturas a estrés 0/60/90, cruce de puerta y una decisión riesgosa; calibrar color, α, banda, 0,45 y la sacudida. (2) `stress-tier.util.ts` único, usado por HUD, viñetas, audio y T13. (3) Mantener las dos viñetas hasta ver las capturas (default del informe) y decidir ahí. (4) Dejar la sacudida en el mínimo o solo en conducta prohibida si las capturas la muestran brusca.
**Necesita Psicología/decisión.** Visto bueno de producto sobre la sacudida (límite 2 y 3); el analizador de destellos de H-16 es verificación, no contenido.
**Dependencias.** Con A (umbrales) y con T13. **Riesgos.** Contratos `game-world.game-feel.contract.spec.ts` y `simulation-play.game-feel.contract.spec.ts` fijan texto exacto (`:4-30`); cambiar constantes no los rompe, mover funciones sí. **Esfuerzo.** S (0,5-1,5 d). **Aporta:** directo.

### C — Diálogo texto-como-síntoma + retratos dinámicos

**Estado real hoy.**
- `portrait-resolver.util.ts:34-46`: `EMOTION_TO_VARIANT` solo conoce `neutral`, `vulnerable`, `concerned`, `danger`, `positive`. Las líneas del caso usan `neutral, anxious, negative, sad, relieved` (`seed_caso_pdf.py:1284-1297`; base común §5.5 y §9.5) → **caen a neutral** (inferencia por lectura, coincide con `code-dialogue.md` DLG-15). El mapa por hablante (`:23-30`) no cubre «Sobreviviente», «Madre de la sobreviviente» ni los NPC ambientales.
- 10 PNG de retrato (5 personajes) en `assets/characters/portraits/`; sin `closed`.
- `dialogue-panel.component.ts`: chip de color por emoción distinta de neutral y etiqueta «receptiva / preocupada / alerta» (`:45-56`, `:466-482`); máquina de escribir fija a 22 car/s (`:16-17`, `:584-592`); `reduceMotion` ya entra por `input` (`:389`, commit `4573a09`) → la **Fase 0a está hecha**.
- Cero símbolos del plan: `DialogueEmotion`, `resolveLinePresentation`, `interruptionConfig`, `wobble`, `glitch` (grep en `frontend/src`).

**Incremento mínimo (fase 1 de la propuesta C, con defaults que el límite permite).**
- Módulo puro `dialogue-emotion.util.ts`: alias → emoción canónica (`neutral, worried, anxious, sad, relieved, calm, closed`) → variante de retrato **existente**; `resolvePortraitAsset` lo usa.
- Defaults aplicados: **P9(a)** alias aprobados (`negative`→`sad`, `positive` de la psicóloga→`calm`, desbloqueo de M2→`relieved`); **P4(b)** no usar el `happy` de la Abuela en M2/M6 (sin sonrisa en el duelo; límite 2); **P2(a)** quitar chip y etiqueta de emoción de las **personas** (la voz de sistema —supervisión, avisos— conserva su tono); **P10(a)** descartar los 6 retratos genéricos y los 5 efectos de decisión del plan.
- Mapear «Sobreviviente» y «Madre de la sobreviviente» solo a los PNG que ya existen (P12 «misma persona»: default «sí», marcarlo pendiente).
- Chequeo de límites: no revela la opción (es presentación de personas); no cronometra; no usa color de alarma.

**Necesita Psicología/decisión.** Validar los alias (P9) y los estados defendibles (P1); **ritmo/pausas (fase 2)** y su aplicación al testimonio de la sobreviviente (P3; límite 3: mantener perfil base allí hasta que lo valide un experto); calibración con 3-5 estudiantes. **No** construir la ventana de intervención (P5 default b). Arte `closed` (1-2 d) solo si se aprueban C y F.
**Dependencias.** F y E leen la emoción canónica (R5); 0a ✔; los planes de julio chocan con el panel (35-45 car/s y sin chips; decisión I1) → resolver antes de tocar velocidad.
**Riesgos.** `dialogue-panel.motion.spec.ts` y `dialogue-panel.component.spec.ts` leen/montan el panel; el chip está en el DOM. Colisión con T10 en el mismo archivo (cabecera de plantilla `:36-56` frente a cierre `:96-112`).
**Esfuerzo.** S-M (2-4 d). **Aporta:** directo (las caras empiezan a «hablar»).

### D — Avatar pixel art

**Estado real hoy.** ✔ v1 para 8 identidades (`V1_ROSTER`, `v1-avatar.util.ts:6-9`) con idle/walk de 4 direcciones; cast horneado de 12 jugables (`baked-cast.util.ts:22`); modular de respaldo; Y-sort (`depth-sort.util.ts`). ◐ `V1_AVATAR_SCALE = 1` (`:56`) con un comentario que dice «CALIBRADO… inicia en 1 y se ajusta en el smoke»: nunca se ajustó. Medido por el hermano: jugador 48×71, NPC adultos 52-54×78-81 (≈10 % más altos) (`playtest-feel.md` §3.2). `roster.v1.json` lista 10 identidades y hay 8 carpetas (faltan `mariana` y `mateo`). `defaultAvatar()` = `valentina` (v1), así que un estudiante nuevo ya ve el personaje premium.
**Incremento mínimo.** Recortar `roster.v1.json` a 8 (o producir las 2) con una prueba de contrato; decidir la escala contra una captura: **no** subirla a 1,1 sin mirar (escala no entera con `pixelArt`/`roundPixels`, REGLA-009, produce temblor de píxeles).
**Psicología.** Ninguna. **Dependencias.** Pase visual de B. **Riesgo.** Bajo. **Esfuerzo.** S. **Aporta:** indirecto.

### E — Social Mapping

**Estado real hoy.** ✘ Nada en código (grep de `SocialNode|social-map|socialMap|reveals_social` fuera de `docs/`: sin resultados). Propuesta lista (lista primero, vínculos cualitativos, sin «afinidad», sin niña ni agresor por defecto).
**Incremento mínimo.** Ninguno visible sin contenido: cada vínculo necesita una frase del caso y su fuente, y esas frases son contenido clínico a validar. Lo construible son prerrequisitos compartidos: **0b** (botón «Pausa segura» reutilizable), **0c** (escritor con bloqueo sobre `flags_json`), **0d** (prueba de paridad de la lista blanca de la línea de tiempo: backend `game_dtos.py:102-106` y espejo `instructor-trace.component.ts:1664-1673`, **sin prueba que los compare**). *Aparte, y no como bloque E*: una lista «Lo que has revisado en esta escena» con nombres ya existentes (`viewedNpcKeys`, objetos inspeccionados, inventario) es orientación de proceso sin texto clínico; pertenece al frente de orientación (`code-wayfinding.md`) y debe llamarse distinto para no violar R4/D3.
**Necesita Psicología.** Todo: instrumento (ecomapa), 6 vínculos, vocabulario («tensión» ya nombra otra cosa en F), P1-P5 y P12, lectura de referencia para el docente. **Dependencias.** 0b, 0c; opcional C (retratos). **Riesgos.** `flags_json` (ver 7.5); `no-chatbot.e2e.ts` no aplica. **Esfuerzo.** Ing. 12-21 d (+0,5 de taller) sin Fase 0.

### F — Verbal Tension Box

**Estado real hoy.** ✘ Nada (grep `verbalTension|verbal_tension|VERBAL_TENSION`: solo docs). El spec `2026-06-08-hud-redesign-design.md` afirma que `verbalTension` es un input real del HUD: **es incorrecto**.
**Incremento mínimo.** Ninguno de contenido. **No** construir el esqueleto con deltas o textos «de relleno»: F1 mueve un indicador sobre decisiones reales y F2 son intercambios de entrevista; ambos requieren validación experta (F-P5, revisión SME pendiente). Solo infra: 0b, 0c, 0d. Aplicar como **restricciones de diseño** los defaults F-P1(b) por turnos, F-P2(a) tono sobrio, F-P3(a) sin tiempo, F-P9(a) elipsis de la noticia: son compatibles con los límites 2 y 3.
**Necesita Psicología.** Matriz de técnicas, entrevista de M1, definición y 4 niveles, qué significa «la persona se retrae», M5. **Dependencias.** C (emoción canónica y retrato `closed`), E (pistas), 0b/0c/0d. **Esfuerzo.** Ing. 20-31 d + Psic. 11-17 d.

### G — Asistente IA contextual (RF-027)

**Estado real hoy.** Backend: `views/ai_assistant.py` (176 líneas), ruta `ai-assistant` en `apps/simulation/urls.py:47`, `IsAuthenticated` (`:24`) pero con el intento filtrado a `student=request.user` (`:39`: un docente recibe 404), **sin bandera** (grep `AI_ASSISTANT_ENABLED`: solo en un plan de julio), **sin pruebas** (grep de `ai_assistant|AIAssistant` en el resto del backend: solo `urls.py`), la pregunta (primeros 500 caracteres, en claro) se guarda en `audit_logs` (`_write_audit`, `:148-172`) con retención de 360 días (`audit_service.py:28`). Sin pantalla; `e2e/no-chatbot.e2e.ts:31` exige que no exista `app-ai-assistant`. `.env.example` (raíz y backend) invita a pegar una clave. Sin clave responde un texto fijo **con el nombre de una variable interna** (`:47-50`).
**Incremento mínimo.** (1) `AI_ASSISTANT_ENABLED=false` por defecto en `settings/base.py:118-120` + prueba de la vista (default G-E1, 0,5-1 d). (2) Validar UUID y devolver el sobre `{success, message}` habitual en lugar de 500. (3) **Panel «Ayuda» sin IA** compartido con K (ver K): controles, qué mide cada indicador del HUD y las **descripciones de herramientas ya sembradas** (`seed_caso_pdf.py:1082-1093`, una línea cada una; el modelo del front ya las trae, `simulation.model.ts` `description`), mostradas tal cual, sin redactar nada nuevo.
**Necesita Psicología/Jurídica.** Las 30-50 entradas curadas (G-P6), la lista de derivación (G-P7), concepto jurídico escrito antes de activar cualquier proveedor (Ley 1581/1377), quién autoriza (G-P2). Defaults que se aplican: G-P1 (ayuda curada primero), G-E1, G-P9 (tratar el caso como real: no enviar texto narrativo). **No** aplicar: IA de texto libre, ni «botón Orientación siempre visible» del plan (revela la respuesta, límite 1).
**Dependencias.** 0b para cualquier panel; reescribir `no-chatbot.e2e.ts` si hay panel de Ayuda (aunque no sea chat, el texto «Ayuda» no lo viola; revisar). **Riesgos.** Dejar la ruta abierta con clave definida. **Esfuerzo.** 0,5-1 d (bandera) + panel S-M.

### H — WCAG 2.2 AA, tareas 10-15

**Estado real hoy (verificado hoy en código).** T1-T9 hechas (commits `67cb0c2`…`fe331d1`; `reduceMotion` en el panel `dialogue-panel.component.ts:389`; `contrast.util.ts` y tres contratos en `src/styles/`). Pendiente confirmado:
- **H-01** sin cierre con opciones: el único botón exige `!d.choices.length` (`dialogue-panel.component.ts:101-107`); pie `inert` con `inputBlocked()` (`simulation-play.component.ts:289`); `safeExit()` retorna si `inputBlocked()` o `busy()` (`:1597-1599`).
- **H-02** introducción sin salida: la rama `showIntroScene() || showCaseIntro()` solo atiende Enter/Espacio (`:1113-1127`); el aviso promete Esc (`:140`).
- **H-06** `.phaser-host role="application"` sin `tabindex` (`game-world.component.ts:2362-2366`).
- **H-07** `J`, `E`, WASD globales (`simulation-play.component.ts:1148-1159`).
- `WCAG_TAGS` sin `wcag22aa` (`e2e/support/quality-gates.ts:8`); solo `serious`/`critical` (`:9`).
- La pista inferior dice «Esc salida segura» (`:316`) aunque Esc no sale en diálogo ni intro.
- Mitigación ya existente que el informe nocturno no menciona: `waitForSettledOverlays` espera opacidad ≥ 0,99 antes de axe (`quality-gates.ts:26-37`); no verifiqué que cubra el caso del botón «Siguiente».

**Incremento mínimo por tarea, con el default que el límite permite.**

| Tarea | ¿Construir ya? | Cómo (sin contenido clínico) | Límite que lo exige o lo acota | Esfuerzo |
|---|---|---|---|---|
| **T10** salida segura | **Sí, primero** | Componente nuevo `safe-pause-button.component.ts` (la pieza **0b**), usado en el panel de diálogo (visible también con opciones, modos lateral y cinemático), la bitácora y las tarjetas de introducción; `pauseFromOverlay()` aparte de `safeExit()` (la prueba `simulation-play.consent-gate.spec.ts:403-413` sigue valiendo); Esc pausa en la introducción pero **no** bajo el aviso ETH-01 (la prueba `:191-202` se mantiene). Defaults: sin confirmación (igual que el Esc de exploración), mismo rótulo en todas partes («Pausa segura»), al reanudar la introducción reaparece si no se leyó | Límite 4 (REGLA-004/ETH-02 obliga); ETH-01 intacto | M (2-3 d) |
| **T11** atajos 2.1.4 | Sí | Opción B del plan: ajuste «Atajos de una tecla» en Ajustes, **activado por defecto** (no cambia el hábito); apagado ignora `J`, `E`, WASD y siguen flechas, Espacio, Enter y botones | Límite 6 (2.1.4 es nivel A); toca `game-world` para WASD | S-M (1-1,5 d) |
| **T12** «Alrededor» / «Ir a…» | **Versión mínima** | Panel visible (no `sr-only`) con las personas y objetos de la sala actual, **orden por distancia, sin resaltar ninguno ni marcar «siguiente»**, con dirección y distancia aproximada; sin «Ir a» automático (exige pathfinding) | Límite 1: lista solo lo visible en pantalla; nunca usar la compuerta de evidencia para ordenar o destacar. Pregunta 4 del informe sigue abierta | min. S-M (1,5-2 d); con «Ir a» M-L (3-5 d) |
| **T13** anuncios | Sí (util + pruebas) | `stressAnnouncement(prev, next)` solo al **cambiar de nivel**, reutilizando las etiquetas existentes (`simulation-hud.component.ts:482-487`); región ya presente y vaciada; limitar el `aria-live` de la barra de contexto a la interacción | Límite 2/3: neutro, sin tono de alarma. La verificación con NVDA queda como paso manual | S (0,5-1 d) |
| **T14** campos del login | **No** | Cambia la identidad visual del login; no afecta al juego | — | S, diferido |
| **T15** puertas axe, foco, cierre | Parcial | `aria-modal` y foco al título en pausa/cierre (`attempt-outcome.component.ts:21-23`) y en el aviso de reanudar; `scroll-margin-top` bajo la barra fija; `wcag22aa` en local **antes** de CI; plazo para `busy` (H-04) | Límite 4 (H-04 deja sin salida con una petición colgada) | S-M (1-2 d) |

**Necesita Psicología/decisión.** Pregunta 4 (qué listar en T12 sin revelar evidencia; con el default anterior queda resuelta para la versión mínima); preguntas 5 y 10 (tono de anuncios, avisos que desaparecen); 9 (adoptar 2.2 y actualizar RNF-004). **Dependencias.** 0b alimenta C, E, F, G y T12; 0e (regla de atajos) alimenta cualquier tecla nueva. **Riesgos.** T10 toca 4 archivos calientes; `frontend/e2e/**` usa `closeDialogue` por nombre. **Aporta:** T10 directo («sentirse seguro»), T12 directo, resto indirecto.

### I — CI Quality Gates

**Estado real hoy.** `.github/workflows/ci.yml` (108 líneas): `scripts`, `backend` (`check:backend` + `test:backend`), `frontend` (Jest + `test:character-assets` + build), `e2e` (sin `@full-case`); `e2e-full-case.yml` (63 líneas): nocturno 07:00 UTC, 4 viewports, `timeout-minutes: 90`, `E2E_TIME_SCALE=4`. Criterios de Done del plan **no cumplidos**: «falla si hay secretos hardcodeados» (sin gitleaks/trufflehog) y «coverage report» (sin cobertura; `grep -rn "coverage|gitleaks|trufflehog|audit"` en `.github`, `package.json` y configs de pruebas: nada). Tampoco hay lint ni `npm audit`.
**Incremento mínimo.** (1) Paso gitleaks (0,25 d). (2) Job `e2e-full-case` solo en escritorio-1366 cuando el PR toca `frontend/src/app/features/simulator/**` (hoy un cambio que rompe el recorrido se ve a las 02:00 del día siguiente; en CI son 3-4× más lento que en local, calcular ~15-20 min) (0,5 d). (3) `npm audit --omit=dev` informativo. **Psicología:** no. **Riesgos:** tiempo de CI; flakiness conocida del e2e. **Esfuerzo:** S. **Aporta:** indirecto, pero es la red de seguridad de todo lo demás.

### J — Escenarios adicionales / generalización

**Estado real hoy.** Un caso (`SIM-VBG-001`). Acoplamientos verificados hoy: `INTRO_NODE_KEY = 'hospital-urgencias'` (`intro-gate.util.ts:28`) y en otro caso no habría introducción; aviso ETH-01 y 6 párrafos de introducción fijos (`simulation-play.component.ts:47-55`, `:134-143`); `ENDINGS` y `compute_ending` fijos a las banderas de VBG (`case_effects.py:160`, `:280`; `OPTION_EFFECTS` de 19 claves en código); `previewCase: 'SIM-VBG-001'` (`login-role.config.ts:29`); mapa de retratos por nombre de hablante; geometría en tres copias (seed, `CASE_ROOM_FURNITURE`, dibujo). Además `seed_caso_pdf.py` **borra los intentos** de su versión y fija la contraseña del administrador (`:1110-1117`).
**Incremento mínimo.** **E1 de la propuesta J** (paquete de efectos/finales por caso, cierre con rótulos del caso, aviso e introducción desde datos, registros por clave, catálogo por grupo): no necesita a Psicología. **Pero no mueve «jugable bien» hoy**: va en la Ola 3. Hasta entonces, regla de no empeorar: los arreglos nuevos (ayuda, orientación) no pueden añadir más literales de `SIM-VBG-001` ni de `hospital-*`/`comisaria-*` fuera de las configs por clave que ya existen.
**Necesita Psicología.** Todo el caso: la plantilla de 13 hojas (23-42 h + 6-10 h de revisión), decisión A (consultorio) / B (hogar) / C, aviso ETH-01 con recursos verificados (siguen `BLOCKED_EXTERNAL`), rúbrica. Defaults aplicables como diseño: A primero; sin menores, sin persona agresora, independiente del caso 1, omitir la introducción propia. **Dependencias.** 0b (aviso/intro con salida), C (retratos nuevos). **Riesgos.** Regresión del caso vigente (`test_caso_pdf.py`, 17 pruebas; e2e actual). **Esfuerzo.** E1: Ing. 8-15 d.

### K — Landing y onboarding

**Estado real hoy.** Landing en `frontend/src/app/features/public/` (4 archivos + `landing.a11y.spec.ts`); la ruta `/` carga `LandingComponent` (`app.routes.ts:6-8`). El Done del plan (banner «en progreso», acceso al editor de personaje, CTA «Comenzar») se resolvió con otra arquitectura: login obligatorio, portal con tablero y «Mi personaje» en el menú (`shell.component.ts:681`).
Desfases verificados:
- Anuncia **tres** casos (`landing.component.ts:69-93`: «Violencia intrafamiliar», «Desplazamiento forzado», «Conflicto comunitario»); solo existe el primero, y se llama «violencia intrafamiliar» cuando el caso es de violencia basada en género.
- «Ver todos los casos» enlaza a su propia sección (`landing.component.html:119`, `href="#casos"`).
- La vista previa muestra decisiones que no son las del caso (`:61-64` «Activar ruta institucional», «Solicitar más contexto», «Registrar observación ética»).
- «Salida segura: recursos institucionales» (`:149`) mientras los recursos de apoyo siguen pendientes (ETH-01 `BLOCKED_EXTERNAL`).
- **Onboarding ✘ y «Ayuda» ✘** (RNF-001), ver resumen.

**Incremento mínimo.** (1) Panel **«Cómo se juega»**: aparece la primera vez que se entra al mundo (recordado en `localStorage` con try/catch, nunca bloqueante) y siempre disponible con un botón «Ayuda» en el HUD y en el catálogo; contenido **solo de interfaz**: moverse (flechas/WASD, táctil), interactuar (E o botón), qué es el pie de herramientas y sus 5 espacios (descripciones sembradas, literal), qué mide cada indicador (sin decir qué decisiones lo mueven), cómo abrir la bitácora y cómo pausar. Se integra con G (el panel de ayuda curada llenará el mismo espacio). (2) Portada honesta: marcar los casos futuros como «próximamente» o retirarlos, y arreglar el enlace. **Chequeo de límites:** no contiene ninguna pista de la respuesta; no cronometra; la pausa segura se explica.
**Psicología.** Nada para controles. Las explicaciones de PAP/SPIKES siguen siendo las de una línea ya sembradas; **no** redactar guías clínicas nuevas. **Esfuerzo.** S-M (2-3 d) + 0,5 d de portada. **Aporta:** directo y el más barato contra «no se sabe qué hacer».

### L — Repositorio privado y secretos

**Estado real hoy.**
- Repo `Jsua3/psico_project_v2`: `"private": true, "visibility": "private"` (API de GitHub consultada hoy). ✔
- `.gitignore` cubre `.env*`, `*.pem`, `*.key`, `secrets/`, `settings/local.py`; solo hay dos `.env.example` versionados. ✔ `production.py` exige `DJANGO_SECRET_KEY`, rechaza el valor por defecto, `JWT_SECRET`, `DB_PASSWORD`/`DATABASE_URL`, `ALLOWED_HOSTS`, `DEBUG=False` (`production.py:21`, `:54-60`). ✔
- `git grep` y `git log --all -G` (265 commits) con patrones de `sk-…`, `AKIA…`, claves privadas, `ghp_…`, `AIza…`: sin coincidencias fuera de `docs/`, `*.sql` y locks. (No es gitleaks.)
- **Riesgos vivos:** (a) credenciales de demostración públicas y repetidas: `README.md:64-66`, `DEPLOY_RAILWAY.md:102-104`, seeds (`seed_demo_access.py`, `seed_demo_users.py`, `seed_default_rubric.py:16`, `seed_caso_pdf.py:1110-1117`, que **restablece** la contraseña del administrador a `Admin123!` cada vez que se corre) y el volcado `deploy/db_seed.sql:3129` con el hash del administrador que se restaura en Railway; la nota «Cámbialas» está en la guía pero nada lo fuerza; (b) `JWT_SECRET` tiene un valor por defecto literal en `base.py:112-115` y `production.py` **exige que exista pero no que sea distinto**; (c) `REFLECTION_ENCRYPTION_KEY` cae a `JWT_SECRET` (`base.py:116`): rotar el JWT dejaría ilegibles las bitácoras cifradas y, mientras no se defina, la llave de las bitácoras es la del token; (d) el Done del plan pide gitleaks sobre el historial: no corre en ningún lado (ver I).
**Incremento mínimo.** Rechazar en `production.py` el `JWT_SECRET` por defecto y exigir `REFLECTION_ENCRYPTION_KEY`; que `seed_caso_pdf.py` **no** reinicie la contraseña de un administrador existente; sacar las credenciales de `DEPLOY_RAILWAY.md` o marcarlas «solo desarrollo» y añadir gitleaks al CI. **Psicología:** no. **Esfuerzo.** S (0,5-1 d). **Aporta:** indirecto.

### Bloques visuales A-J (confirmación de la auditoría del 2026-10-03)

Confirmado por conteo propio: ninguna ruta del plan existe; 10 PNG de retrato; HUD con Material Symbols (`music_note`, `graphic_eq`, `simulation-hud.component.ts:128,133`); inventario premium con 41 de 74 entradas inexistentes; arte pendiente real: retratos `closed` (condicional a C+F), pase visual (0,5 d) y, solo con el caso 2, 5-16 d. **Una imprecisión de la auditoría:** el punto 7 de §4 llama «carpetas vacías» a `assets/game/kenney/`; hoy contiene `.gitkeep` **y** cuatro paquetes (`rpg-urban-pack`, `tiny-dungeon`, `tiny-town`, `ui-audio` de 420 K). **Peso:** `src/assets` mide 15 MB y `angular.json:23` lo copia entero al build (más `src/favicon.ico`, que no existe). **Decisión por defecto aplicable:** diferir la biblia premium (la auditoría P1) y no tocar el arte.

---

## 4. Opciones «por defecto»: cuáles se aplican y cuáles no

| Propuesta (pregunta) | Default | ¿Aplicar ya? | Razón |
|---|---|---|---|
| H T10 (p. 1-2) | Botón «Pausa segura» visible en panel, bitácora y tarjetas; Esc en intro; sin confirmación; la intro reaparece si no se leyó | **Sí** | El límite 4 lo exige; ETH-02 y ETH-01 intactos |
| H T11 (p. 3) | Ajuste en Ajustes, activado | **Sí** | 2.1.4 es nivel A; no rompe hábito |
| H T12 (p. 4) | Lista de todo lo visible, por distancia, sin resaltar; sin «Ir a» | **Sí, mínima** | Límite 1: orienta el dónde, nunca la respuesta |
| H T13 (p. 5) | (sin default escrito) solo cambio de nivel, con las etiquetas existentes | Sí | Evita tono nuevo |
| H T14 (p. 7) | — | **No** | Identidad visual; ajena al juego |
| C P2(a), P4(b), P9(a), P10(a), P11 | Sin etiqueta de emoción en personas; sin sonrisa en el duelo; alias aprobados; descartar retratos/efectos genéricos; «señal» | **Sí** | Compatible con límites 1-3; reversible (tabla de alias) |
| C P1(a)/P3(a) (estilo de habla) | Tres estilos, perfil suave en el testimonio | **No todavía** | Límite 3 y «veto de expertos» del propio default; falta calibrar |
| C P5(b) | Sin ventana de intervención | Sí (no construir) | Límite 3 |
| E P1(c), P3(a), P4(a) · F P1(b), P2(a), P3(a), P9(a) · J A primero, sin menores/agresor | Mapa guiado lista-primero, sin niña ni agresor; entrevista por turnos, sobria, sin tiempo; consultorio de primera escucha | **Como restricción de diseño**, no se construye | El contenido que las llena necesita validación experta |
| G P1, E1 | Ayuda curada primero; bandera apagada; tratar el caso como real | **Sí** (bandera y panel de ayuda de interfaz) | Privacidad; límite 1 |
| G (IA de texto libre) | Después de decidir, con aviso y concepto jurídico | **No** | Sin concepto jurídico |
| B informe P2 | Mantener las dos viñetas | **Sí, hasta ver capturas** | Decisión visual |
| Visuales P1 | Diferir biblia premium | Sí | Sin impacto en el juego |

---

## 5. Dependencias entre bloques

```
H-T7 (0a, HECHO) ──────────────► C-F2 ritmo y pausas
H-T10 / 0b «Pausa segura» ─────► T12 «Alrededor», Ayuda (K/G), E panel, F entrevista, G panel, J aviso/intro   [toda superposición nueva]
H-T11 / 0e regla de atajos ────► cualquier tecla nueva (p. ej. un atajo para «Ayuda»)
0c escritor con bloqueo ───────► E (marcas), F (estado) y arregla el riesgo actual de flags_json
0d paridad de la lista blanca ─► F (tipos nuevos en la línea de tiempo del docente)
C-F1 emoción canónica ─────────► F (lee emoción y retrato `closed`), E (retratos opcionales), C-F2
stress-tier.util (A+B) ────────► T13 anuncios, A, B, HUD
K «Cómo se juega» ─────────────► G-F1 ayuda curada (mismo panel) ─► G-F3 IA (opcional, con concepto jurídico)
J-E1 generalizar ──────────────► J-E2.. (necesita las hojas de Psicología); independiente de E/F
Retratos `closed` (arte) ──────► el cierre visible de F; no bloquea C-F1
```
Choques de edición reales: T10, C-F1 y K/Ayuda tocan `simulation-play.component.ts` y `dialogue-panel.component.ts`; T11, B y la orientación tocan `game-world.component.ts`. Ver partición en 7.2.

---

## 6. Orden recomendado

| Ola | Qué | Esfuerzo (inferencia) | Límites a vigilar | Por qué ahora |
|---|---|---|---|---|
| **1 · Directo, sin Psicología** | T10 salida segura (M, 2-3 d) · Ayuda / «Cómo se juega» (S-M, 2-3 d) · Audio (S, 0,5-1 d) · C fase 1 (S-M, 2-4 d) · B pase visual + `stress-tier.util` (S, 0,5-1,5 d) | **7-12,5 d-p** | 1 (nada orienta la respuesta), 4 (pausa siempre alcanzable), 2 (sin celebración en retratos) | Ataca «no se sabe qué hacer» (RNF-001), el único bloqueante y lo que se siente mal |
| **2 · Cumplimiento** | T11 atajos · T13 anuncios · T15 (foco, `aria-modal`, `wcag22aa` local, `busy`) · bandera de IA · CI (gitleaks, e2e en PR) · L (JWT, seed, guía) · landing honesta · D (roster) | **5-9 d-p** | 6 (WCAG), 5 (sin esquema) | Baratos, quitan riesgo y protegen la Ola 1 |
| **3 · Con decisión** | T12 con «Ir a» (3-5 d) · 0c (2-3 d) · 0d (1-2 d) · J-E1 (8-15 d) | 14-25 d-p | 4 y 1 | Aportan al futuro; no a la prueba de hoy |
| **4 · Psicología** | E (12-21 d Ing.) · F (20-31 d Ing. + 11-17 d Psic.) · J contenido y arte · G curada (9,5-16 d Ing. + 14-22 d Psic.) · C fase 2/F4 · música propia | ver propuestas | 1, 2, 3 (testimonio sin reloj) | No se inventa contenido clínico |

Orden **dentro** de la Ola 1 para no chocar: (1) T10 y su componente 0b; (2) Ayuda (sin tocar el mismo archivo que T10 salvo un botón de HUD); (3) Audio; (4) C fase 1; (5) B. Ejecutar `npx jest --runInBand src/app/features/simulator` tras cada uno (ver 7.3).

---

## 7. Deuda técnica que pone en riesgo el trabajo

### 7.1 Los dos monolitos y qué costuras permiten tocarlos sin chocar

**`game-world.component.ts` (2701 líneas):** `DataDrivenWorldScene` (Phaser, `:151-2356`, ~2200 líneas en una sola clase) y `GameWorldComponent` (wrapper Angular, `:2357-2701`: plantilla+estilos ~140 líneas, clase ~200).

| Zona (líneas) | Contenido | Quién puede tocarla | Cuidado |
|---|---|---|---|
| `:363-368`, `:462-470`, `:568-612`, `:1750-1830` | audio de pasos y blip, efectos de B | feel / audio | Contratos `game-world.game-feel.contract` y `frame-budget` (texto exacto) |
| `:621-745` (`buildGuide`, `showGuideBubble`, `updateGuide`), `:1509-1550` (pistas de NPC), `:1996-2101` (`createMarker`), `:2292-2356` (`updateNearestInteraction`, `refreshMarkerStates`) | orientación y señales de «esto se toca» | orientación | `interaction-priority.util.ts` es puro: el lugar correcto para arreglar «la puerta le roba la E a una persona» sin tocar la escena |
| `:1172-1316` (`checkExitTriggers`, `checkDbDoorTriggers`) | lógica de puertas | un solo dueño | Cualquier cambio afecta a `full-case.e2e` |
| `:2357-2495` (plantilla/estilos del wrapper), `holdDirection`/`releaseDirection` (`:2575+`) | controles táctiles, carga | táctil | `game-world.touch.contract.spec.ts` y `loading.contract.spec.ts` leen este texto |
| `:1589-1832` (`renderHospitalEnvironment`, `renderComisariaEnvironment`) | rama heredada (Tiled) | nadie ahora | Candidata a extraer **al final**, junto con su spec |

**`simulation-play.component.ts` (2101 líneas):** plantilla `:64-357`, estilos `:358-872` (515 líneas), clase `:874-2101`. Regiones de la clase: teclado `:1097-1175`; interacciones y puertas `:1176-1360`; decisiones, herramientas y diálogos `:1427-1577`; bitácora y pausa `:1578-1640`; intro y consentimiento `:~1895-1990`; persistencia `:1986-2075`; sincronía de posición `:2077-2100`.

**Costuras seguras (no mover código existente):**
1. **Archivos nuevos**, como el repo ya hace (`*.util.ts` puros + spec): `safe-pause-button.component.ts`, `game-help.component.ts`, `dialogue-emotion.util.ts`, `stress-tier.util.ts`, `stress-announcement.util.ts`. Se enchufan con una línea de plantilla.
2. **Configs ya separadas por clave:** `scene-objectives.config.ts`, `scene-guide.config.ts` (`getSceneGuide` devuelve `null`, `:107-111`), `evidence-gating.config.ts`, `interaction-priority.util.ts`, `hud-dock.util.ts`, `touch-hold.util.ts`. Los textos de `SCENE_OBJECTIVES` **no** deben reutilizarse como pista: varios describen la respuesta (`code-dialogue.md` DLG-08).
3. **Particionar por zona entre agentes** (tabla anterior); y **un solo agente por archivo `*.component.ts`** a la vez en la medida de lo posible. Las últimas 8 ediciones de ambos archivos vinieron de B y H: hay churn.

**Costuras peligrosas:** extraer estilos o plantilla a `.scss/.html`, mover métodos a servicios o renombrar funciones privadas: rompe los 13 specs de la sección 7.2 y obliga a reapuntar su `source`.

### 7.2 Pruebas de contrato que leen el código como texto

13 specs leen `game-world.component.ts` o `simulation-play.component.ts` con `readFileSync` y regex exactas: 10 en `simulator/` (`game-world.touch.contract`, `game-world.game-feel.contract`, `game-world.frame-budget`, `game-world.loading.contract`, `simulation-play.game-feel.contract`, `simulation-play.intro.contract`, `simulation-hud.settings`, `keyboard-capture.contract`, `overlay-blur.contract`, `scene-renderer.registry`) y 3 en `src/styles/` (`a11y-bloque-h`, `motion`, `contrast`). Ejemplos de fragilidad: `game-world.frame-budget.spec.ts:8-11` exige exactamente 2 `this.children.removeAll(true)` y `:15` exige `this.callbacks.onPosition(` una sola vez; `simulation-play.game-feel.contract.spec.ts:18-20` fija `const SCENE_FADE_MS = 320;` y `transition: opacity 320ms ease` dentro del `.ts`. En total 27 specs del repo usan `readFileSync`. **Regla de trabajo:** añadir comportamiento en archivos nuevos con pruebas de comportamiento; si hay que tocar un texto fijado, actualizar el spec en el mismo commit; ejecutar los 13 antes de cada push. Las regex usan `\s*` y toleran LF o CRLF (este checkout es LF; el plan H asume CRLF de Windows): una regex nueva con `\n` literal fallaría en un entorno u otro.

### 7.3 e2e `full-case` frágil y solo nocturno

`frontend/e2e/full-case.e2e.ts` (245 líneas): **9 movimientos en píxeles fijos** (`:64,65,70,119,135,152,156,189,205`) y 18 `moveUntilNearby` por nombre accesible (`/kit pap/i`, `/familia en crisis/i`…) en 4 viewports; `siep-flow.ts` (608 líneas) fija selectores y nombres. Cualquier cambio que mueva el piso (zoom de cámara F-03, colisión de NPC F-05), la prioridad E (F-02), las etiquetas de los objetos o el orden de los botones lo rompe, y el PR **no corre** `@full-case` (solo el nocturno, `e2e-full-case.yml:5-12`). Recomendación: tras cada ola, `npm run test:e2e` completo en local (8,5 min según el informe nocturno) y, antes de eso, hacer que los 9 `moveBy` sean `moveUntilNearby` por nombre (no cambia la lógica del caso).

### 7.4 Un solo valor de estrés, cinco umbrales

Ver B: HUD 25/50/75, viñeta DOM 40, viñeta Phaser 50/85, audio 30/60/85, sprite 70. Es deuda que el jugador **siente** (la música muere y el HUD dice «crítico» a distinto estrés). Resolver con `stress-tier.util.ts`.

### 7.5 Carrera de escritura sobre `flags_json` (backend)

`world_service.update_position` (`:162-197`) lee el estado (`require_world_state` → `flags_json` en memoria), actualiza `positionSyncedAt` y llama `world_state.save()` **sin `update_fields`**, o sea reescribe la fila completa. `case_effects.apply_case_effects` (`:245-269`) lee-modifica-escribe `caseFlags` y `caseMetrics` en la misma columna con `save(update_fields=[…])` y **sin `select_for_update`** (ningún `select_for_update` en `backend_django/apps`). Si una petición de posición ya cargó el estado cuando llega una decisión, el guardado completo de la primera puede **pisar** las métricas de la segunda (inferencia; Postgres READ COMMITTED). El cliente mitiga con `withSyncedPosition` (`simulation-play.component.ts:2077-2100`, espera la posición antes de actuar, pero continúa si falla) y con un guardado diferido de posición que puede coincidir. La probabilidad hoy es baja; **sube** si E o F añaden claves y escritores. Es la pieza 0c: un escritor único con `select_for_update` y `update_fields`.

### 7.6 Duplicados y contratos paralelos (limpiar o no ampliar)

- **5 vocabularios de emoción** (seed, árbol, NPC ambiental, manifiesto v1, plan C) y **3 contratos de retrato** (PNG por variante, hoja 5×64×80 del plan, hoja 96×96 4×8 del manifiesto); lo cierra C fase 1.
- **2 copias de la lista blanca de la línea de tiempo** sin prueba (backend `game_dtos.py:102-106`, front `instructor-trace.component.ts:1664-1673`; este archivo mide 1850 líneas).
- **3 copias de geometría de sala** (seed, `CASE_ROOM_FURNITURE`, dibujo) y **5 listas de competencias** de rúbrica (base común §2).
- **2 viñetas de estrés** y **2 admin sembrados** con contraseña fija (`seed_default_rubric.py:16`, `seed_caso_pdf.py:1110`).
- Assets: `modular-legacy` y `modular` con 63 archivos idénticos; `inventory.v1.json` con 41 de 74 entradas inexistentes (`status: unreviewed`, validado por un script y un test de contrato).

### 7.7 Documentos vigentes o no

El spec premium del 2026-07-13 y sus 6 planes (35-45 car/s, sin chips de emoción, estado por NPC `trust/tension/openness`, `AI_ASSISTANT_ENABLED`, único escritor de estado) **nunca se implementaron** y chocan con el panel actual y con las propuestas C y F. Hay que decidir si rigen (pregunta I1) **antes** de tocar velocidad o chips del diálogo. Mientras no se decida, C fase 1 evita ambos.

---

## 8. Correcciones a los documentos del roadmap (para cuando se editen)

1. **A:** de «Hecho» a «Parcial»: 1 de 4 capas; la música se apaga con estrés alto; 5 de 10 SFX nunca se reproducen.
2. **I:** de «Hecho» a «Parcial»: faltan escaneo de secretos y cobertura (Done del plan); `@full-case` fuera del PR.
3. **K:** de «Hecho» a «Parcial»: sin onboarding ni ayuda en el juego (RNF-001); la portada anuncia 3 casos y hay 1; enlace circular.
4. **L:** añadir los tres riesgos de la sección 3-L; el repo privado queda **confirmado** (2026-10-03).
5. **B:** añadir los 5 juegos de umbrales y las dos viñetas.
6. **D:** `roster.v1.json` declara 10 identidades y hay 8 carpetas; `V1_AVATAR_SCALE` nunca se calibró pese a su comentario.
7. **Auditoría visual §4.7:** `assets/game/kenney/` no está vacía.
8. **Informe nocturno §7:** ya existe `waitForSettledOverlays` en `quality-gates.ts:26-37` (mitigación de la fragilidad de axe); verificar si cubre el caso mencionado.
9. **Spec `2026-06-08-hud-redesign-design.md`:** quitar la afirmación de que `verbalTension` es un input real.
10. **Hoja de ruta, fila H:** T10 pasa de «requiere decisión» a «construir con los defaults de la sección 4»; el límite 4 del producto ya decide lo esencial.

---

## 9. Preguntas que sí necesitan una persona

1. **Producto (rápida):** ¿«Pausa segura» sin confirmación y con el mismo rótulo en todas partes? (default de la sección 4; si se confirma, T10 no se bloquea).
2. **Producto:** ¿la sacudida tras opción riesgosa se mantiene, se limita a conducta prohibida o se quita? (límite 2). Se decide con el pase visual.
3. **Psicología:** alias de emoción (P9), `closed` y la sonrisa de la Abuela (P4), estilo de habla en el testimonio (P3).
4. **Psicología:** qué se puede listar en «Alrededor» sin revelar evidencia (T12); el default de la sección 4 es conservador.
5. **Ingeniería:** ¿rigen los planes de julio (I1)? Define velocidad y chips.
6. **Ingeniería:** ¿se puede correr `full-case` en escritorio en cada PR del simulador (CI más lento)?
7. **Dirección:** ¿se retira la sección de casos futuros de la portada o se rotula «próximamente»?
8. **Jurídica / dirección:** ¿el despliegue de Railway es público? De eso depende la urgencia de las credenciales demo y del `JWT_SECRET`.

---

## Anexo: comandos de verificación usados

```
git -C /home/user/psico_project_v2 log --oneline | head; git status --short
grep -n "stemFiles\|setStressLevel" frontend/src/app/features/simulator/audio-director.service.ts
grep -rn "door_open\|'stress_high'\|'crisis_start'" frontend/src/app --include=*.ts
grep -rn "SocialNode\|socialMap\|verbalTension\|DialogueEmotion\|interruptionConfig" frontend/src backend_django
grep -rn "ayuda\|onboarding\|tutorial\|cómo se juega" frontend/src/app --include=*.ts --include=*.html
grep -rln "readFileSync" frontend/src --include=*.spec.ts | wc -l          # 27 (13 leen los monolitos)
grep -rn "select_for_update" backend_django/apps                           # sin resultados
git log --all -G'(sk-[A-Za-z0-9]{24,}|AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)' -- . ':!docs' ':!*.sql'
mcp github search_repositories repo:Jsua3/psico_project_v2                  # private: true
```
