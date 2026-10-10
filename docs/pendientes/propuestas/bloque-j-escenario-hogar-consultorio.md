# Bloque J — Escenario adicional de hogar o consultorio: propuesta de diseño

- **Fecha:** 2026-10-03 · **Estado:** propuesta para decidir; nada implementado y ningún contenido clínico inventado · **Rama:** `feat/cierre-plan-maestro`
- **Base de hechos:** [base común C/E/F](./propuestas-c-e-f-base-comun.md) (reglas y estado compartido) más lectura directa de código. No se ejecutó nada: ni pruebas, ni servidores, ni BD.
- **Convención:** «(inferencia)» = deducción por lectura, no ejecutada; «(propuesta)» = no existe. Lo demás está leído en el archivo citado. Esfuerzos en días-persona (d) y horas (h), orientativos: no hay histórico de cuánto costó `SIM-VBG-001` con que calibrarlos.
- **Contenido sensible:** el caso actual trata violencia basada en género; aquí se cita lo mínimo.

---

## 1. Resumen en lenguaje llano

**Qué es.** Un «caso» es una historia jugable: personas, lugares, decisiones con retroalimentación de supervisión y un final. Hoy hay uno publicado (`SIM-VBG-001`: un hospital y una comisaría). «Añadir un escenario de hogar o consultorio» es sumar un **segundo caso**, con otros lugares y otras competencias que entrenar.

**Lo que conviene saber.** No basta con dibujar una sala nueva: varias piezas están escritas para el caso actual (finales, métricas de cierre, aviso de contenido sensible, introducción). Si se publicara un segundo caso hoy tal cual, el aviso hablaría de violencia de género, el cierre mostraría las métricas del primero y, por la lógica de `compute_ending`, casi cualquier recorrido acabaría en «Riesgo persistente» o «Crítico» (inferencia). Generalizar eso no depende del contenido: puede empezar ya.

**Qué recomendamos.** Empezar por un **consultorio de primera escucha** (alternativa A, sección 4): pide poco arte nuevo (reutiliza casi todo el mobiliario existente), tiene el menor riesgo ético y es la mejor prueba de que el sistema soporta un segundo caso. La **visita domiciliaria** (B) es valiosa, pero expone intimidad, convivencia y menores, y cuesta casi el doble en arte: mejor después, con protocolo ético propio. **La decisión es de Psicología.**

**Qué necesitamos de Psicología.** Rellenar la plantilla de la sección 5 (objetivo y competencias, personas, salas, escenas, 3 opciones por decisión con clasificación y retroalimentación, finales, rúbrica) y que lo revise una persona experta distinta de la autora: **23-42 h de autoría + 6-10 h de revisión experta**.

**Cuánto trabajo es** (consultorio, orientativo): **Psicología** 29-52 h · **Ingeniería** 20-37 d (8-15 d son generalizar lo atado al caso actual) · **Arte** 5-16 d. Hogar: Ingeniería 25-44 d y Arte 11-24 d (sección 6).

---

## 2. Qué pide el plan y qué hay hoy

**El plan** (`docs/PLAN_MAESTRO_TOTAL.md`, «BLOQUE J», líneas 1549-1628; Visual B 1834-1921; Visual I 2255-2324) pide: (1) un fixture `scenario_seeds.json` con 3 escenarios (hospital, comisaría, vivienda: sala + cocina) cargado con `loaddata` sobre un modelo `simulation.scenarioseed`; (2) un `ScenarioConfig` de comisaría con 2 salas; (3) tilesets 32×32 (consultorio, hospital, comisaría, vivienda) y mapas Tiled. Done: 3 seeds cargados, comisaría con 2 salas, mapas placeholder sin crash, `ng build`.

| Lo que pide el plan | Estado real | Consecuencia |
|---|---|---|
| Modelo y fixture `scenarioseed` | **No existe** (grep: solo en el plan). Crearlo exige una tabla nueva (fuera de esta fase; Django es `managed=False`) y duplicaría `scene_maps.theme`/`ambient_json` | (propuesta) no construirlo |
| Hospital y comisaría | **Ya existen** como 4 espacios del caso `SIM-VBG-001` (`seed_caso_pdf.py`), pintados por código (`case-pdf-rooms.renderer.ts`), no por Tiled; los `ScenarioConfig` son JSON en `frontend/src/assets/game/scenarios/` | Done del plan obsoleto en estos puntos |
| Tilesets de interior y mapas Tiled | Los mapas de `assets/game/maps/` salen de `generate-rooms.mjs` con tiles Kenney `tiny-dungeon` (mazmorra); `inventory.v1.json` apunta a `game/maps/premium-v1/`, que no está en el repo | La vía realista es la del caso actual: renderer + sprites de `tools/` |
| Vivienda (sala + cocina) y consultorio | **Falta** (hoja de ruta 2026-10-02, fila J: necesita «contenido clínico del nuevo caso y arte de sus salas») | Este documento |

Otros hechos: la meta del catálogo de requisitos de negocio «crear variante de caso en ≤4 h reutilizando ≥60 % de componentes» no la cumple un caso nuevo (inferencia); sí es el camino de una variante clonada con el editor (no medido). Estados de versión: `DRAFT`, `IN_REVIEW`, `PUBLISHED`, `ARCHIVED` (`models/case.py`); `IN_REVIEW` no tiene ninguna transición en el código (grep) y `authoring_service.publish` pasa de `DRAFT` a `PUBLISHED` si el checklist está al 100 % y la validación del mundo no da errores. En `deploy/db_seed.sql` solo está publicada la versión 2.0.0 de `SIM-VBG-001`; `SOC-FEM-001` y la 1.0.0 están archivadas, y queda `CASO-EJEMPLO` («Avalancha», borrador de prueba, activo).

---

## 3. Anatomía de un caso en SIEP

Tamaños de `SIM-VBG-001` contados en `seed_caso_pdf.py` y los registros del frontend (≈ = conteo propio por lectura).

| Pieza | Dónde vive hoy | Quién la produce | Tamaño en `SIM-VBG-001` |
|---|---|---|---|
| Caso y versión | `simulation_cases`, `case_versions` | Psicología (título, descripción, contexto) | 1 caso, versión 2.0.0 `PUBLISHED` |
| Nodos del DAG | `simulation_nodes` (clave, narrativa, sensible, aviso, inicial/terminal) | Psicología | 8: 7 en cadena + 1 nodo-sala; 1 inicial, 1 terminal |
| Decisiones y opciones | `decision_options` (texto, clasificación, puntaje, estrés, retroalimentación, prohibida + razón) | Psicología | 6 decisiones, 19 opciones (6 adecuadas, 10 riesgosas, 3 prohibidas) |
| Efectos, métricas, banderas | `OPTION_EFFECTS` en `services/case_effects.py` (**en código, no en BD**) | Psicología define; Ingeniería codifica | 19 entradas, 7 métricas, 14 banderas |
| Finales | `ENDINGS` + `compute_ending` (código) | Psicología (condiciones y texto) | 4 finales |
| Salas | `scene_maps` (1 por nodo, `UNIQUE(node_id)`), `collision_zones` | Psicología (qué espacio); Ingeniería | 8 mapas sobre 4 espacios de 960×528 |
| Objetos y puertas | `map_objects`; condiciones de puerta en `metadata_json` | Psicología (qué hay); Ingeniería | ≈41 objetos, 10 puertas, 3 con condición |
| Personas y diálogos | `dialogue_trees/lines/choices`; NPC ambientales en `scene_maps.ambient_json` y `scenarios/*.json` | Psicología (texto) | ≈19 árboles, ≈39 líneas, 8 NPC ambientales |
| Herramientas clínicas | `clinical_tools`; iconos `tool_*.png` | Psicología (cuáles); Arte | 5 (PAP, SPIKES, RISK_METER, SAFETY_ROUTE, REFLECTION_JOURNAL) |
| Evidencia previa | `NODE_EVIDENCE` (`evidence-gating.config.ts`), `effect_json` por opción de diálogo, puertas | Psicología; Ingeniería | 4 nodos con evidencia |
| Rúbrica | `rubrics`, `rubric_criteria` (datos; página de rúbricas) | Psicología | 1 rúbrica de 4-5 criterios |
| Objetivo y «Paso n de 6» | `scene-objectives.config.ts` | Psicología (frase) | 8 entradas |
| Aviso, introducción | texto fijo en `simulation-play.component.ts`; `intro-gate.util.ts` | Psicología; Ingeniería | 1 aviso, 6 párrafos, escena y audio de intro |
| Arte de salas | `case-pdf-rooms.renderer.ts` (665 l.), `.geometry.ts`, `furniture/` (10 tipos), `doors/` (5 tipos, 10 PNG) | Arte; Ingeniería | 4 renderers |
| Personajes | `NPC_CAST` (9 hojas horneadas), `npc-avatar-presets.ts`, retratos (10 PNG, 5 personajes) | Arte | 9 hojas, 10 retratos |
| Publicación | checklist de 6 ítems, `world_validation.py`, `publish()` (solo ADMIN) | Psicología (revisión); Ingeniería | 1 versión publicada |

**Lo que hoy está atado a `SIM-VBG-001`** (B = bloquea publicar un segundo caso; D = duplicar o añadir entradas; C = degrada sin romper):
1. **B. Finales y métricas.** `case_effects.py` no mira el código del caso: `read_case_state`/`clinical_state` devuelven siempre las 7 métricas (en 50) y `compute_ending` da uno de 4 finales a todo intento `COMPLETED`; las reglas exigen banderas del caso actual (`pap_aplicado`, `riesgo_feminicidio_valorado`...). `attempt-outcome.component.ts` rotula esas 7 métricas.
2. **B. Aviso ETH-01 e introducción.** El aviso es texto fijo sobre violencia de género (`simulation-play.component.ts`, ~líneas 134-143); la introducción son 6 párrafos fijos (`CASE_INTRO_PARAGRAPHS`) y `INTRO_NODE_KEY = 'hospital-urgencias'` (`intro-gate.util.ts`): en otro caso no habría introducción. El `warning_message` de los nodos solo se ve dentro del juego; no alimenta el aviso previo.
3. **D. Efectos por opción.** `OPTION_EFFECTS` se indexa por `option_key` sin caso; sin entrada, la severidad cae a la clasificación (`option_severity`).
4. **D. Renderer y geometría de salas.** `caseRoomKind` fija 4 claves/prefijos (`hospital-sala-escucha*`, `comisaria-consultorio*`...). Una sala nueva necesita renderer propio y la geometría en **tres copias** (`FURNITURE` del seed, `CASE_ROOM_FURNITURE`, el dibujo). Sin renderer: base procedural oscura con cuadrícula. Como el motor exige 1 mapa por nodo, una sala usada en varias escenas se **copia por nodo** y cada copia necesita su alias (`scenario-config-assets.util.ts`).
5. **D. NPC ambientales.** Geometría en el seed (`MAPS.ambient`), en `scenarios/*.json` y en `deploy/upgrades/2026-10-01-ambient-npcs-caso-pdf.sql` (filtra por `map_key`: si el caso nuevo reutilizara claves, las pisaría).
6. **D. Registros por clave.** `NODE_EVIDENCE`, `SCENE_OBJECTIVES`/`SCENE_PROGRESS`, `NpcAvatarPresetKey` (unión de 9 en `simulation.model.ts`), `NPC_CAST`, mapeo de retratos por nombre de hablante (6), `TOOL_SPRITE` (5 códigos). Con claves nuevas degradan: sin objetivo, retrato → silueta, herramienta → insignia.
7. **C. Motor genérico con vocabulario del caso.** `decision_effects.py`: `victimRisk` y «ruta institucional» por palabras clave en la clave o título del nodo destino («ruta», «protección», «institucional»).
8. **D. Semillas y pruebas.** `seed_caso_pdf.py` **borra los intentos** de su versión y reescribe en sitio una versión `PUBLISHED`; crea o reinicia el usuario administrador con una contraseña fija escrita en el código (no copiar ese patrón: sembrar en otro entorno restablecería esa contraseña). `bootstrap_dev_db.py` y `seed_demo_access.py` asignan solo `SIM-VBG-001`; `full-case.e2e.ts` recorre solo ese caso con textos y posiciones fijas.
9. **C. Catálogo.** `progression/catalog.py` ordena por `created_at` y desbloquea en cadena (el caso 2 exige completar el 1); no filtra por grupo, pero `start_attempt` exige asignación (`grupo_case_version`).

---

## 4. Hogar vs. consultorio

Solo se describe el marco, no el guion. Las competencias son familias generales, **a confirmar por Psicología**.

| | A. Consultorio de primera escucha | B. Visita domiciliaria (hogar) | C. Consultorio de seguimiento |
|---|---|---|---|
| Competencias distintas a las del caso actual (hoy: contención en crisis, noticia difícil, marco normativo, riesgo y protección, no revictimizar) | Encuadre y consentimiento informado; confidencialidad y sus límites; entrevista inicial y alianza; cierre de sesión y derivación | Lectura respetuosa del entorno; consentimiento para entrar y entrevistar; seguridad de la profesional y de los presentes; trabajo con varias personas a la vez; coordinación con la red local | Continuidad del vínculo y revisión de acuerdos; abandono y recaída; cierre del proceso; reflexión sobre la propia práctica |
| Riesgo ético | Bajo-medio: depende del tema; sin menores en escena es controlable | **Alto:** espacio íntimo, posible convivencia con quien agrede, menores presentes, estigma de vivienda o barrio (`noStigmatizing`), puede activar a estudiantes con vivencias propias | Medio: si retoma a la sobreviviente de `SIM-VBG-001`, la re-escenifica |
| Arte nuevo | 5-16 d: 2 salas (consultorio y espera); el mobiliario existente cubre `desk`, `chair`, `sofa`, `coffee_table`, `shelf`, `plant`, `waiting_chairs`, `counter`, `file_cabinet` (inferencia: depende de las salas que pida Psicología) | 11-24 d: 2-3 salas (sala, cocina, cuarto) y mobiliario casi todo nuevo (mesa, camas, cocina, televisor, armario...); el plan solo lista «sala + cocina» | 3-8 d si A ya existe: mismas salas, solo personajes y objetos |
| Coste técnico | Bajo: mismo patrón que el caso actual | Medio: más salas y objetos; aviso y protocolo propios | Bajo, pero requiere A y la decisión de continuidad |

**Recomendación: A primero.** (1) Lo difícil y arriesgado es generalizar el motor, no pintar; A lo prueba al menor coste, y B sumaría a la vez riesgo ético y arte. (2) Complementa al caso actual: entrena lo que va antes y después de la crisis (encuadre, entrevista, derivación), que el caso actual apenas toca (inferencia, a confirmar por Psicología). (3) El plan ya lista el consultorio (Visual B: `tileset_consultorio`; Visual I: `consultorio_principal`); la «vivienda» queda para B. (4) Reutiliza arte y pipeline de `tools/`. (5) B llega después, con protocolo ético propio (sección 8). **Cambiaría la recomendación** si Psicología prioriza una competencia que solo se entrena en domicilio; entonces B primero, asumiendo coste y revisión ética reforzada.

**Atajo de arte (solo prototipo, inferencia):** la sala clínica premium (`premium-clinical-room.renderer.ts`) pinta un consultorio y se activa por 11 claves de mapa heredadas del caso v1 (`AUTHORED_CLINICAL_ROOM_KEYS`); añadir claves nuevas ahorra el renderer (≈3-5 d), pero deja una sola disposición con colisiones fijas.

---

## 5. Lo que Psicología tendría que aportar

Un documento por caso, con estas hojas. Los marcadores `«…»` indican formato y longitud máxima, no contenido. Claves en minúsculas con guiones y un prefijo único del caso (`«prefijo»-«escena»`), porque el frontend las usa como identificador global.

```
HOJA 0  FICHA        Título «≤80 car.» · Descripción «2-3 líneas» · Contexto «≤120 palabras, sin detalle gráfico»
                     Duración objetivo «min» · Asignatura/cohorte · Documento fuente
HOJA 1  OBJETIVO     1 objetivo «el estudiante puede + verbo observable» · 3-5 competencias:
                     código «MAYÚSCULAS_GUION_BAJO, ≤80 car.» · nombre · descripción «1 frase» · peso «suma 100»
HOJA 2  AVISO ETH-01 Texto «≤60 palabras, neutral, sin detalle gráfico» · temas sensibles «lista» · ¿menores? «sí/no»
                     Recursos de apoyo VERIFICADOS «institución, jurisdicción, contacto, fecha de revisión» (si no hay, "pendiente")
                     Nodos sensibles «claves» · ¿alguno exige salida segura obligatoria? «sí/no + cuál»
HOJA 3  PERSONAS     Por persona: clave · nombre en pantalla · rol · banda de edad «NNA/adulta/mayor» · estado emocional inicial
                     «1 palabra» · qué sabe y qué no dice aún · «en escena | solo mencionada» · rasgos para Arte «3-5, sin estereotipos»
HOJA 4  SALAS        Por sala: clave · tipo de lugar · muebles y objetos que se ven «lista» · personas presentes
                     puertas «destino + condición de apertura, p. ej. haber hablado con X» · tono de luz · qué NO debe aparecer
HOJA 5  ESCENAS      Por escena (nodo): clave · título «≤60 car.» · narrativa «≤80 palabras» · objetivo «1 frase, sin revelar la respuesta»
                     sala(s) · «inicial | intermedia | terminal» · evidencia previa exigible «personas a escuchar, herramienta a usar,
                     objeto a revisar» · mensaje si falta evidencia «sin insinuar la opción adecuada»
HOJA 6  DECISIONES   Una por escena con decisión «típico 3-6». Por decisión: pregunta que enfrenta el estudiante, y 3 opciones
                     (4 solo si hace falta, las 3 verosímiles); por opción:
                       texto «≤40 palabras» · clasificación «ADEQUATE | RISKY | INADEQUATE»
                       conducta prohibida «sí/no; si sí = INADEQUATE + razón obligatoria»
                       retroalimentación de supervisión «≤50 palabras: el porqué clínico; se lee DESPUÉS de decidir»
                       impacto «bajo | medio | alto» en estrés y puntaje (Ingeniería lo traduce a números)
                       hecho que queda registrado «frase: "aplicó X" / "omitió Y"» · métrica(s) que mueve «de la HOJA 9»
                     Nota: la 1.ª respuesta riesgosa o inadecuada concede una 2.ª oportunidad sin efectos (regla del motor):
                     la retroalimentación debe sostener un segundo intento sin humillar.
HOJA 7  HERRAMIENTAS Por herramienta: código «MAYÚSCULAS» · nombre · categoría · descripción «≤25 palabras» · dónde se recoge
                     con qué persona/objeto es pertinente · ¿reutiliza PAP, SPIKES, RISK_METER, SAFETY_ROUTE, REFLECTION_JOURNAL?
HOJA 8  FINALES      3-4 finales: nombre · tono «positivo | neutral | advertencia | crítico» · mensaje «≤50 palabras»
                     condición en lenguaje llano «sin decisiones críticas y con X e Y registradas»
HOJA 9  MÉTRICAS     3-5 métricas del caso «nombre en lenguaje de Psicología, 0-100, inicia en 50» · qué sube o baja cada una
HOJA 10 RÚBRICA      4-6 criterios (los de la HOJA 1) · por criterio, la evidencia observable en el juego «decisión, herramienta, bitácora»
HOJA 11 AMBIENTE     Opcional: por NPC ambiental «≤3 líneas»; no pueden indicar cuál opción es la adecuada
HOJA 12 REVISIÓN     Persona experta «nombre, cargo, distinta de la autora» · fecha · los 6 ítems del checklist de publicación
                     «originalidad, ética, protocolos de seguridad, sin estigmatización, advertencias, accesibilidad» · observaciones · acta
```

**Horas orientativas de Psicología** (sin histórico; a recalibrar tras la primera entrega): hojas 0-2 y 10, 4-8 h · hojas 3-5, 5-9 h · hoja 6 (p. ej. 4 decisiones × 3 opciones = 12 opciones, 40-70 min por opción), 8-14 h · hojas 7-9 y 11, 3-6 h · una ronda de ajustes, 3-5 h = **23-42 h de autoría**; revisión experta (hoja 12), **6-10 h**.

---

## 6. Lo que Ingeniería y Arte tendrían que hacer

Rangos en días-persona para el consultorio (A); entre paréntesis, el hogar (B) donde cambia.

| Fase | Qué se hace | Ing. (d) | Arte (d) | Depende de |
|---|---|---|---|---|
| E0 | Decisiones y especificación con Psicología (sección 9) | 1-2 (2-3) | — | — |
| E1 | **Generalizar lo atado** (sección 3): a) efectos, métricas, banderas y finales por caso, y que un caso sin paquete no muestre finales ajenos (3-5); b) pantalla de cierre con rótulos del caso (1-2); c) aviso ETH-01 e introducción desde datos, con pruebas de accesibilidad (2-3); d) registros por clave, preset de NPC, retratos (1-2); e) catálogo y asignación a grupo (1-2); f) vocabulario del motor genérico (0,5-1) | 8-15 | — | **Nada: puede empezar ya** |
| E2 | Semilla del caso, a la manera de `seed_caso_pdf.py` (1.436 líneas; uno más pequeño, menos de la mitad, inferencia). Mejor: en `DRAFT`, validar y publicar con el servicio, sin borrar intentos; rúbrica y grupo de demostración | 3-5 (3-6) | — | Hojas 3-6 aprobadas |
| E3 | Renderer de 2 salas y espejo de geometría; inventario visual (`inventory.v1.json`) y su prueba de contrato, si se decide registrar las salas | 3-5 (5-8) | — | Hojas 3-4 |
| A1-A5 | Mobiliario nuevo (1-3; hogar 4-8) · hojas de NPC horneadas (2-6; 3-7) · retratos (1-3; 2-4) · puertas (1-2; 1-2) · iconos de objetos/herramientas (0-2; 1-3), con el pipeline de `tools/` | — | 5-16 (11-24) | Hojas 3-4; **escala contra la altura del personaje (~46 px/m), nunca contra el footprint** |
| E4 | Pruebas: semilla (patrón de `test_caso_pdf.py`: 17 pruebas, 4 de finales), contratos, specs del renderer y del cierre, **e2e de caso completo** nuevo (el actual: 245 líneas de pasos fijos) y ajuste del lobby con 2 casos | 3-6 (4-7) | — | E2, E3 |
| E5 | Publicación: checklist al 100 %, validación del mundo, asignación de grupo, siembra por entorno, auditoría con axe, teclado y lector | 2-4 (3-5) | — | Revisión experta |
| | **Total** | **20-37 (25-44)** | **5-16 (11-24)** | |

El nocturno `e2e-full-case.yml` corre 4 viewports × hasta 20 min con `timeout-minutes: 90`: añadir un segundo recorrido lo duplica y exige subir el límite o recortar viewports.

**Criterio de Done propuesto** (sustituye al del plan): caso `PUBLISHED` en un entorno de prueba y asignado a un grupo; recorrido completo e2e verde, con pausa y reanudación; aviso, introducción, cierre y finales propios (ningún texto de `SIM-VBG-001`); `SIM-VBG-001` sigue verde; checklist al 100 % con acta de revisión experta; axe sin violaciones críticas ni serias.

**Orden y riesgos.** (1) E1 no espera a Psicología: arranca ya y corre en paralelo con la redacción; Arte arranca con las hojas 3-4 aprobadas (personas y salas) aunque falte el texto de las decisiones; E2 espera a las hojas 3-6. (2) El camino crítico es el tiempo de Psicología (≈ 2-3 semanas de calendario para 23-42 h, supuesto) y la revisión experta. (3) Riesgo de regresión: E1 toca el cierre, el aviso y los finales del caso vigente; su red de seguridad son `test_caso_pdf.py` y el e2e actual, que deben seguir verdes sin cambios de comportamiento para `SIM-VBG-001`. (4) Las estimaciones no están calibradas: se revisan tras E1.

**Qué cubre el editor y qué no** (ADMIN; `app.routes.ts`, `authoring_service.py`, `urls_admin.py`, `world-editor/`):
- **Cubre, sin tocar código:** crear el caso (`DRAFT` 0.1.0 con nodo y sala iniciales), nodos, decisiones (texto, clasificación, puntaje, estrés, retroalimentación, prohibida + razón), mapas, objetos, herramientas, zonas de colisión, spawn, puertas con destino y punto de entrada, diálogos con opciones (herramienta y evidencia exigidas por opción), 4 plantillas de NPC modular, zoom e imagen de fondo por sala, checklist, validación, vista previa, publicar y clonar versión.
- **No cubre (exige código):** efectos, métricas, banderas y finales; aviso e introducción; condiciones de puerta (`requiresInspected`, `requiresNodes`, `lockedMessage`: el editor solo fija destino y entrada); `NODE_EVIDENCE` y objetivos por escena; NPC ambientales (`ambientNpcs` y diálogo en `scenarios/*.json`); todo el arte (renderer, mobiliario, puertas, hojas de NPC, retratos). Las plantillas de escena traen `backgroundImage` vacío: sin arte, la sala sale con la base oscura y cuadrícula.
- **Sin exportar ni importar:** no hay endpoint ni botón; un caso hecho solo en el editor vive en esa BD (inferencia: llevarlo a otro entorno exige volcar la BD).
- **Conclusión:** el primer caso nuevo, **por semilla** (reproducible, versionada, con pruebas); el editor, para verificar, retocar y para variantes clonadas.

---

## 7. Datos

**Sin cambio de esquema** (todo lo que hace `seed_caso_pdf.py` va por tablas existentes): caso, versión, nodos, decisiones, mapas, colisiones, objetos, diálogos, herramientas, rúbrica y checklist; asignación a grupo en `grupo_case_version`; banderas y métricas por intento en `attempt_world_states.flags_json` (`caseFlags`, `caseMetrics`). `object_type` admite `PERSON, OBJECT, ROUTE, TOOL, WARNING, EXIT` (CHECK): basta. `competency` ≤ 80 caracteres (BD; el modelo dice 100); no hacen falta eventos nuevos. El paquete de efectos y finales del caso nuevo vive **en código, por caso** (propuesta). `db_seed.sql` es un volcado: el caso nuevo llega corriendo su semilla en cada entorno (idempotente) o regenerando el volcado; no requiere script en `deploy/upgrades/`.

**Exigiría cambio de esquema (solo propuesta; nombres por definir):** (a) guardar en BD el paquete de efectos, métricas, banderas y finales por versión (p. ej. una columna JSON en `case_versions`): permitiría crear casos sin código y que `clone_version` los copie; (b) aviso de contenido y recursos de apoyo por versión (hoy `warning_message` es por nodo); (c) orden explícito del catálogo en lugar de `created_at`. Cada uno iría con script idempotente en `deploy/upgrades/`, su CHECK en `deploy/db_seed.sql` y `test_deploy_schema_contract.py` en verde. El modelo `scenarioseed` del plan no hace falta.

---

## 8. Accesibilidad y ética del escenario nuevo

- **Consentimiento (ETH-01).** El caso nuevo lleva su propio aviso, antes de cualquier narrativa, audio o mundo, con texto neutral y recursos de apoyo verificados (institución, jurisdicción, fecha). Hoy el aviso es fijo y la revisión SME del caso actual sigue pendiente (`consentimiento-contenido-sensible.md`): no inventar recursos; si faltan, declararlo como pendiente.
- **Salida segura (ETH-02, REGLA-004).** Es la pausa reanudable (`PAUSED`), ya genérica en `game_service.safe_exit`. Con un diálogo abierto exige dos Esc (base común §5.5; mejora transversal ya propuesta). Ojo: la validación de publicación `NO_SAFE_EXIT` se cumple con cualquier objeto `EXIT`, es decir, una puerta (`authoring_service.py`, `hasSafeExit`); no prueba la salida segura. La prueba es la e2e de pausa y reanudación.
- **No revictimizar.** No escenificar hechos violentos ni reconstruir relatos de agresión; las personas ausentes no aparecen como figuras; si hay persona consultante, no usar a la sobreviviente de `SIM-VBG-001` sin decisión explícita (alternativa C). Sin lenguaje de victoria o derrota sobre el sufrimiento (base común §6).
- **Representación del hogar y de menores (si se elige B).** Protocolo previo: sin la persona agresora en pantalla (o tratamiento declarado); NNA solo mencionados, o en escena con revisión reforzada y sin preguntas clínicas directas; sin signos de violencia como decorado; sin estereotipos de pobreza o vivienda; el consentimiento para entrar al domicilio es una competencia a entrenar, no un castigo.
- **No revelar la opción adecuada.** `decision_option_state` envía `classification` y `prohibitedConduct` al cliente antes de decidir (la UI no los muestra); el caso nuevo hereda esa exposición. Ni los diálogos de ambiente ni los mensajes de evidencia faltante pueden insinuarla.
- **WCAG 2.2.** Salas, objetos y diálogos operables por teclado y con lector; nada depende solo del color (finales y métricas con texto); movimiento reducido respetado; objetivos táctiles ≥ 24 px; texto alternativo o descripción de cada sala (más aún si hay imagen de fondo); axe en el recorrido nuevo (`e2e/support/quality-gates.ts`).
- **Privacidad.** Datos ficticios (el chip actual lo dice) y ningún dato real en el contenido; el asistente IA envía a un proveedor externo: no darle datos del caso sin decisión expresa.

---

## 9. Preguntas abiertas

**Para Psicología** («bloquea» = sin respuesta no se puede empezar la fase indicada).
1. **(bloquea E0)** ¿Qué escenario va primero: A consultorio de primera escucha, B visita domiciliaria o C seguimiento? *Por defecto: A.*
2. **(bloquea hojas 1 y 10)** ¿Cuál es el objetivo de aprendizaje y qué 3-5 competencias entrena el caso que el actual no cubre? *Por defecto: las que Psicología elija entre las familias de la sección 4.*
3. **(bloquea la fecha)** ¿Quién redacta, quién revisa como persona experta distinta de la autora y para cuándo? *Por defecto: una docente de Psicología del equipo escribe; una persona experta externa al equipo revisa.*
4. **(bloquea publicar)** ¿Qué dice el aviso ETH-01 del caso y qué recursos de apoyo están verificados? *Por defecto: texto neutral breve; sin recursos hasta tener datos verificados, como en el caso actual.*
5. ¿El caso es independiente o continúa a una persona de `SIM-VBG-001`? *Por defecto: independiente.*
6. ¿Aparecen menores de edad, y como figuras en escena o solo mencionados? *Por defecto: solo mencionados o ausentes.*
7. ¿Aparece la persona agresora? *Por defecto: no.*
8. ¿Se juega antes o después de `SIM-VBG-001`? Hoy se desbloquea por fecha de creación, tras completar el anterior. *Por defecto: después.*
9. ¿Métricas del caso: se reutilizan las 7 actuales (confianza, crisis emocional, riesgo de la víctima, rigor técnico, ética profesional, ruta institucional, calidad del duelo) o hay un conjunto propio de 3-5? *Por defecto: propio, con nombres de Psicología.*
10. ¿Cuántas decisiones y cuántas opciones? ¿Hay opciones de conducta prohibida? *Por defecto: 4 decisiones × 3 opciones, a lo sumo una prohibida por decisión.*
11. ¿Se reutilizan las 5 herramientas clínicas actuales o hay nuevas (cada una necesita icono)? *Por defecto: reutilizar las pertinentes y la bitácora.*
12. ¿Se mantiene la segunda oportunidad tras una respuesta riesgosa o inadecuada? *Por defecto: sí (regla del motor).*
13. ¿Cuántos finales y con qué condiciones? *Por defecto: 3-4, en lenguaje llano.*
14. ¿Alguna escena exige salida segura obligatoria (`safe_exit_required`, hoy falso en todo el caso actual)? *Por defecto: decide Psicología escena a escena.*

**Para Ingeniería y Arte**
15. **(bloquea E1)** ¿Los efectos y finales del caso nuevo viven en código por caso (sin esquema) o en BD (propuesta de la sección 7)? *Por defecto: código por caso ahora; BD como propuesta.*
16. **(bloquea E2)** ¿Se acepta que el primer caso nuevo sea una semilla por comando y no authored en el editor (que no exporta)? *Por defecto: sí.*
17. ¿La semilla nueva se crea en `DRAFT`, valida y publica con el servicio, y evoluciona con `clone_version`, sin borrar intentos? *Por defecto: sí.*
18. ¿Arte de salas por renderer en código (consistente, con oclusión) o por imagen de fondo desde el editor (rápida, sin oclusión: inferencia)? *Por defecto: renderer.*
19. ¿Sigue disponible la generación de arte de los pipelines de `tools/` (Higgsfield) o se usa otra fuente o un artista? *Por defecto: mismo pipeline.*
20. ¿Convención de claves (`node_key`, `map_key`, `option_key`) con prefijo por caso para no chocar con `hospital-*` ni `comisaria-*`? *Por defecto: prefijo del código del caso.*
21. ¿La introducción propia (escena y audio) se omite en el caso nuevo y solo se muestra la narrativa tras el aviso? *Por defecto: omitir.*
22. ¿Quién tiene rol ADMIN (el editor y publicar son solo ADMIN) y quién publica? *Por defecto: Ingeniería publica tras el acta de revisión.*
23. ¿Se corrige antes el envío de `classification` y `prohibitedConduct` antes de decidir? *Por defecto: sí, antes de publicar el caso 2.*
24. ¿El catálogo debe filtrar por grupo asignado, para que un estudiante no vea un caso que no puede iniciar? *Por defecto: sí.*
25. ¿Se limpia `CASO-EJEMPLO` de `deploy/db_seed.sql`, y se retira de `seed_caso_pdf.py` la contraseña fija del administrador? *Por defecto: sí, en una tarea aparte.*
26. ¿Cuántos viewports y minutos del nocturno se asignan al recorrido nuevo? *Por defecto: los mismos 4 viewports con el límite subido.*
