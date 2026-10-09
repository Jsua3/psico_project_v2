# Auditoría de código: orientación y "qué hacer" en SIM-VBG-001

Alcance: lectura de código y datos del caso. No se ejecutó el navegador ni se tocó el repositorio, Postgres ni ninguna cuenta de prueba. Todo lo que no se verificó leyendo código va marcado "(inferencia)".

Ruta base del repositorio: `/home/user/psico_project_v2`. Abreviaturas de archivo usadas abajo:

- `PLAY` = `frontend/src/app/features/simulator/simulation-play.component.ts`
- `HUD` = `.../simulation-hud.component.ts`
- `WORLD` = `.../game-world.component.ts`
- `DLG` = `.../dialogue-panel.component.ts`
- `DOCK` = `.../tool-inventory.component.ts`
- `OBJ` = `.../scene-objectives.config.ts`
- `GUIDE` = `.../scene-guide.config.ts`
- `EVID` = `.../evidence-gating.config.ts`
- `SEED` = `backend_django/apps/simulation/management/commands/seed_caso_pdf.py`
- `WSVC` = `backend_django/apps/simulation/services/world_service.py`
- `GSVC` = `backend_django/apps/simulation/services/game_service.py`
- `DTO` = `backend_django/apps/simulation/serializers/game_dtos.py`

---

## 0. Resumen ejecutivo

La causa de fondo de "no se sabe qué hacer" es estructural, no de pulido. El caso tiene tres capas que el jugador no puede distinguir:

1. **Nodo del DAG (la etapa)**: avanza solo cuando se toma una de las 6 decisiones (`GSVC:344-408`). De él cuelgan el **objetivo**, el **paso "k/6"**, el chip **"Escenario k de 8"** y la **evidencia** (`PLAY:938`, `HUD:489-496`, `PLAY:1645-1651`, `EVID:22-45`).
2. **Sala/mapa (el lugar)**: cambia con puertas (`enter_room`, no avanza el DAG, `WSVC:385-424`) y con el reinicio automático al cambiar de nodo (`WSVC:476-503`).
3. **Objeto de decisión (el punto donde se decide)**: vive en una sala concreta y, en 2 de las 6 decisiones, en una sala distinta de aquella donde aparece el jugador.

La interfaz habla casi siempre en términos de la capa 1 y casi nunca dice nada de las capas 2 y 3. Resultado medible en código:

- En 2 de 7 etapas (E1 y E4) la decisión se toma en otra sala de la que se spawnea, y ningún texto visible lo dice.
- En las 6 decisiones, la sala donde se decide contiene 3 objetos con opciones de decisión (`_ESCUCHA_DECISION_OBJECTS`, `_CONSULTORIO_DECISION_OBJECTS`, `SEED:744-855`), pero solo 1 corresponde a la etapa activa. Los otros 2 abren sus opciones de otra etapa y, al elegir, devuelven un aviso contradictorio.
- El objetivo mostrado en la recepción y en el hospital-cierre es el de la decisión C1, que ocurre dos salas y una puerta después.
- La entrada específica para `comisaria-recepcion` en `OBJ` es código muerto: `currentNode.key` nunca vale `comisaria-recepcion`.
- Hay dos contadores de progreso incompatibles a la vez ("Escenario 4 de 8" y "Paso 4/6"). El "8" nunca se alcanza (máximo 7).
- Un diálogo con opciones no tiene botón de cerrar (solo Esc). En táctil no hay forma de salir sin elegir, y la salida segura queda `inert` mientras hay diálogo.

Lo bueno que ya existe y se puede reutilizar sin backend nuevo: `NODE_EVIDENCE`, los metadatos `requires*` de las puertas, `world.inventory / inspectedObjectKeys / usedToolKeys / flags.viewedNpcKeys`, `currentNode.options[].id` cruzado con `world.objects[].dialogue.choices[].decisionOptionId`, y los textos huérfanos de `SCENE_GUIDES.hint`. Con eso se puede construir una línea de "Siguiente paso" y una lista de pasos de la escena sin tocar el esquema. Falta solo un dato: en qué sala está el punto de decisión cuando no es la actual (ver §5).

---

## 1. Modelo real de avance (lo que el jugador no ve)

### 1.1 Etapas, salas y dónde se decide

Orden del DAG (de `SEED:144-225` y `SEED:230-529`). "Decisión" es la que sale del nodo.

| # | Nodo (etapa) | Mapa donde aparece el jugador | Decisión pendiente | Dónde se toma (objeto, mapa) |
|---|---|---|---|---|
| 1 | `hospital-urgencias` | `hospital-urgencias` | H1 | `familia-duelo` en **`hospital-sala-escucha`** (otra sala) |
| 2 | `hospital-sala-escucha` | `hospital-sala-escucha` (misma clave: reinicio silencioso a 480,430) | H2 | `marco-normativo-hospital`, misma sala |
| 3 | `hospital-accion-etica` | `hospital-sala-escucha-accion` (copia) | H3 | `psicologa-acompanante`, misma sala |
| 4 | `hospital-cierre-bloque` | `hospital-sala-escucha-cierre` (copia) | C1 | `sobreviviente-consulta` en **`comisaria-consultorio`** (a 2 salas y 1 puerta con compuerta) |
| 5 | `comisaria-consultorio` | `comisaria-consultorio` (misma clave que la sala de C1) | C2 | `marco-normativo-comisaria`, misma sala |
| 6 | `comisaria-accion-final` | `comisaria-consultorio-marco` (copia) | C3 | `profesional-psicosocial`, misma sala |
| 7 | `cierre-caso` (terminal) | `comisaria-consultorio-cierre` (copia) | ninguna | no se juega: al decidir C3 el estado pasa a `COMPLETED` y el overlay de resultado cubre todo (`PLAY:947-950`, `GSVC:393-403`) |
| R | `comisaria-recepcion` (nodo-sala) | `comisaria-recepcion` | ninguna | solo se llega por puerta; `currentNode` nunca es R |

Verificación de que R nunca es el nodo actual: `current_node` solo cambia en `choose_decision` (`GSVC:388`) y ninguna `DecisionOption` tiene como destino `comisaria-recepcion` (`SEED:230-529`). Por tanto, estando en la recepción, `attempt.currentNode.key` sigue siendo `hospital-cierre-bloque`.

Visualmente solo existen 4 tipos de sala (`CASE_PDF_ROOM_RENDERERS`: urgencias, sala de escucha, recepción, consultorio). Las 8 "escenas" son 4 aspectos × copias, con el mismo título de mapa en las copias (`SEED:604-691`).

### 1.2 Las tres clases de compuerta

| Clase | Dónde se aplica | Qué comprueba | Qué dice al fallar |
|---|---|---|---|
| **Dura** (puerta) | `PLAY:1266-1307` (frontend) y `WSVC:427-460` (backend) | `requiresInspected`, `requiresTools`, `requiresNodes`, `requiresNpcs` del `metadata` de la puerta | `lockedMessage` de la puerta, toast de 4,2 s (`PLAY:1313-1318`) |
| **Blanda** (decisión) | `PLAY:1427-1445`, `EVID:22-45`, `EVID:91-110` | `NODE_EVIDENCE[nodo]` (npcs, tools, usedTools, inspected) | diálogo "Criterio profesional" con "Explorar primero" o "Decidir con información incompleta" (`PLAY:1761-1774`). Se puede ignorar |
| **De etapa** (backend) | `GSVC:344-345` | `decision.source_node == attempt.current_node` | frontend lo adelanta con un toast (`PLAY:1427-1434`) |

`NODE_EVIDENCE` solo define 4 nodos: `hospital-urgencias`, `hospital-accion-etica`, `hospital-cierre-bloque`, `comisaria-accion-final` (`EVID:24-44`). H2 (`hospital-sala-escucha`) y C2 (`comisaria-consultorio`) no tienen evidencia.

### 1.3 Interacciones: distancia y prioridad

- Marcadores (objetos del backend): el más cercano a ≤74 px es "el interactuable" (`WORLD:2292-2335`). El backend valida a ≤120 px del rectángulo (`WSVC:98-105`).
- NPC ambientales (JSON de escenarios): rango 60 px (`WORLD:1507`). La prioridad es marcador > NPC (`interaction-priority.util.ts:7-13`).
- Al abrir un objeto con diálogo, el servidor lo marca como inspeccionado en ese momento (`WSVC:214-216`). Si es PERSON, además registra `viewedNpcKeys` (`WSVC:223-232`).
- Los TOOL se recogen al interactuar (`WSVC:234-239`) y desaparecen del mundo (`WSVC:108-111`, `WORLD:1258-1263`).

---

## 2. Tabla por escena

Notación de la columna "Lo que ve hoy": **OBJ** = tarjeta "Objetivo" (arriba a la izquierda del canvas), **HUD** = chips superiores, **CTX** = barra contextual inferior, **MUNDO** = texto dentro del canvas.

Aplica a todas las escenas: la CTX sin objeto cercano muestra solo "WASD mover · E interactuar · J bitácora · Esc salida segura" (`PLAY:316`), y esa línea se oculta por debajo de 760 px de ancho (`PLAY:853`). La CTX muestra `label` + `interactionText` del objeto. El verbo `interactionPrompt` ("Tomar…", "Hablar con…", "Entrar a…") no se muestra nunca (ver WAY-12).

### E1. Urgencias — mapa `hospital-urgencias`, nodo `hospital-urgencias`

HUD hoy: "Escenario 1 de 8", "Paso 1 — Urgencia vital y crisis (1/6)", ubicación "Hospital — Urgencias" (`OBJ:29`).
OBJ hoy: "Estabiliza emocionalmente a la familia y evita acciones prematuras que puedan aumentar la crisis." más el aviso de contenido sensible del nodo (`hospital-map.config.ts:10-11`, `PLAY:240-244`).

Objetos (`SEED:858-903`): `tool-pap` (318,428), `familia-crisis` (190,420), `zona-restringida` (660,268), `puerta-sala-escucha` (838,440). NPC (`hospital-urgencias.json`): `enfermera-urgencias` (560,330), `medico-guardia` (640,290), `psicologa-orientadora` (780,440). Spawn (480,430).

| # | Acción requerida | Compuerta | Qué ve hoy el jugador | Brecha concreta |
|---|---|---|---|---|
| 1 | Tomar el Kit PAP | Blanda: `usedTools: PAP` al decidir H1 (`EVID:26`) | Marcador con pulso. A ≤74 px, CTX: "Kit PAP" y "Primeros Auxilios Psicológicos: contención, estabilización y enlace." Al recogerlo no hay mensaje ni sonido (`unlockedToolCode` no se usa, ver WAY-09); solo desaparece el icono y se enciende el slot PAP | Nadie dice que es requisito, ni "tomar" (el verbo no se muestra), ni confirma que se recogió |
| 2 | Hablar con la familia en crisis (abre y registra "inspeccionado") | **Dura**: `puerta-sala-escucha` exige `requiresInspected: [familia-crisis]` (`SEED:899`) | Etiqueta "Familia en crisis" + texto. Diálogo de 3 líneas. La 3.ª línea dice "La sala de escucha está al fondo a la derecha" (`SEED:867-868`) | Es la única frase que dice a dónde ir, y solo la ve quien lee las 3 líneas |
| 3 | Aplicar PAP a la familia (opción al final de ese diálogo) | Blanda (`usedTools: PAP`) | Aparece como una opción más de la lista, también sin kit. Sin kit: el backend responde 400 "recógela primero" (`WSVC:270-271`), pero el front lo reemplaza por "No pudimos usar la herramienta." (`PLAY:1507`) y las opciones quedan bloqueadas (`DLG:266-267`) | Sin kit no se explica la causa y el diálogo queda sin salida visible (WAY-04, WAY-05) |
| 4 | Hablar con la enfermera de urgencias | Blanda: `npcs: [enfermera-urgencias]` (`EVID:25`) | NPC pequeño. Solo a ≤60 px aparecen su nombre (9 px) y "▲ E" (8 px) (`WORLD:1442-1448`). La CTX no cambia | Es requisito de la decisión y no hay ninguna señal de que importa (WAY-11) |
| 5 | Cruzar `puerta-sala-escucha` | Dura (solo `familia-crisis`) | MUNDO: "E Sala de escucha familiar →" aunque esté bloqueada. CTX: "Sala de escucha familiar →". Si está bloqueada: toast 4,2 s "Primero identifica la necesidad de contención: habla con la familia en crisis." | No dice dónde está la familia. La puerta se abre sin PAP ni enfermera, que la decisión sí exige (WAY-02) |
| 6 | **Decidir H1 en otra sala** (`familia-duelo`, "Familia en crisis" en la sala de escucha) | Blanda (nurse + PAP). Etapa dura | OBJ sin mención de sala. El mismo nombre "Familia en crisis" existe en las 2 salas | Si falta evidencia, el mensaje ("falta hablar con Enfermera de urgencias y tener o usar Primeros Auxilios Psicológicos", `PLAY:1721-1727`) no dice que están en la otra sala (WAY-02) |

Opcionales sin señal: `zona-restringida` (texto informativo), médico de guardia y psicóloga orientadora. La psicóloga está a 58 px de la puerta (780 vs 838): el marcador gana a los NPC, así que solo se le habla desde x≈720-764.

### E2. Sala de escucha — mapa `hospital-sala-escucha`, nodo `hospital-sala-escucha`

HUD hoy: "Escenario 2 de 8", "Paso 2 — Marco normativo en salud (2/6)", ubicación "Hospital — Sala de escucha familiar".
OBJ hoy: "Define el marco normativo y técnico que orienta la atención hospitalaria de este caso."

Tras H1 el mapa conserva la clave, así que **no hay banner de sala** (`PLAY:1874-1880`, solo si cambia `map.key`), y el jugador reaparece en (480,430) sin aviso.

Objetos (`SEED:744-799, 904-929`): `familia-duelo` (168,408, opciones de H1), `marco-normativo-hospital` (660,320, opciones de H2), `psicologa-acompanante` (740,400, opciones de H3), `tool-spikes` (480,300), `tool-bitacora` (560,430), `puerta-urgencias` (122,460), `salida-institucional` (838,440). NPC: `trabajadora-social` (480,380).

| # | Acción requerida | Compuerta | Qué ve hoy | Brecha |
|---|---|---|---|---|
| 1 | Decidir H2 en "Marco normativo" | Etapa. Sin evidencia (no hay `NODE_EVIDENCE`) | OBJ genérico. CTX: "Marco normativo" + "Protocolos y normas disponibles en el servicio de urgencias." | No dice qué objeto. Hay 3 objetos con opciones y solo 1 vale (WAY-03) |
| – | `familia-duelo` y `psicologa-acompanante` | Etapa (no es su turno) | Abren diálogo con sus opciones (H1 y H3). Elegir una → toast "Esta intervención pertenece a otra etapa del caso. Vuelve cuando el flujo te lleve a esta sala." (`PLAY:1432`) | Mensaje contradictorio: ya estás en esa sala. La familia repite "¿dónde está mi nieta?" después de H1 |
| – | `salida-institucional` | Dura: `requiresNodes: [hospital-cierre-bloque]` | Toast "La ruta institucional aún no está lista. Completa la contención y registra la decisión hospitalaria." (`SEED:137-140`) | No dice que faltan H2 y H3 ni dónde |

Opcionales: SPIKES, bitácora y `trabajadora-social` (dice dónde está el protocolo; no es requisito).

### E3. Acción técnica y ética — mapa `hospital-sala-escucha-accion`, nodo `hospital-accion-etica`

HUD hoy: "Escenario 3 de 8", "Paso 3 — Acción técnica y ética (3/6)". El banner de entrada muestra el mismo título de sala que en E2 (`SEED:617-619`).
OBJ hoy: "Define qué hacer —y qué evitar— técnica y éticamente con la familia y la sobreviviente."

| # | Acción requerida | Compuerta | Qué ve hoy | Brecha |
|---|---|---|---|---|
| 1 | Tomar el protocolo EPICEE/SPIKES (`tool-spikes`) | Blanda: `tools: [SPIKES]`, solo inventario (`EVID:34-35`) | Marcador. Recogerlo es silencioso y no muestra ningún protocolo; el mensaje de falta dice "revisa el protocolo… del estante" | "Revisar" equivale a recoger. No hay lectura ni confirmación (WAY-09) |
| 2 | Decidir H3 en "Psicóloga hospitalaria" | Etapa + blanda | OBJ genérico | Mismo problema de 3 objetos y 2 inactivos |

### E4. Cierre hospitalario — mapa `hospital-sala-escucha-cierre`, nodo `hospital-cierre-bloque`

HUD hoy: "Escenario 4 de 8", "Paso 4 — Ruta de restablecimiento (4/6)".
OBJ hoy: "Valora el riesgo, activa medidas de protección y orienta derechos sin revictimizar." Es el texto de **C1**, que se decide en el consultorio de la Comisaría. En esta sala no hay nada que permita valorar riesgo.

Objetos (`SEED:956-1005`): `familia-duelo` ("Familia acompañada", 168,408), `resumen-bloque` (480,360), `tool-bitacora` (560,430), `puerta-urgencias` (122,460), `salida-institucional` (838,440, **sin compuerta** en esta copia).

| # | Acción requerida | Compuerta | Qué ve hoy | Brecha |
|---|---|---|---|---|
| 1 | Salir por `salida-institucional` hacia la Comisaría | Ninguna aquí | MUNDO "E Salida institucional →", CTX "Salida institucional →" + "Comisaría de Familia" | La instrucción real ("La salida institucional está habilitada: dirígete a la Comisaría de Familia", `SEED:186-188`) solo está en `node.narrative`, que se oculta en exploración (WAY-07). `resumen-bloque` lo repite, pero es opcional |

### E5. Recepción — mapa `comisaria-recepcion`, `currentNode` = `hospital-cierre-bloque`

Al entrar: banner "Comisaría de Familia — Recepción" y, una sola vez, nota a pantalla completa de 4,2 s "Quince días después, tras el alta médica…" (`PLAY:1970-1978`, `SEED:653`).
HUD hoy: sigue "Escenario 4 de 8", "Paso 4 — Ruta de restablecimiento (4/6)".
OBJ hoy: el mismo de E4 ("Valora el riesgo…"). La entrada pensada para esta sala existe pero no se usa nunca: `OBJ:24` ("Revisa el expediente y la orientación de ingreso antes de pasar al consultorio.") y `OBJ:36` ("Paso 4 — Recepción institucional") son código muerto.

Objetos (`SEED:1006-1045`): `expediente-caso` (740,312), `funcionaria-recepcion` (480,332), `puerta-consultorio` (838,440). NPC: `orientadora-juridica` (320,360), `sobreviviente-espera` (180,380), `madre-acompanante` (230,396). Entrada en (160,452).

| # | Acción requerida | Compuerta | Qué ve hoy | Brecha |
|---|---|---|---|---|
| 1 | Revisar "Expediente del caso" | **Dura**: `puerta-consultorio.requiresInspected: [expediente-caso]` | Etiqueta + texto del expediente. Toast de puerta: "Revisa primero el expediente y la orientación de ingreso." | No indica dónde está el expediente. "…y la orientación de ingreso" sugiere hablar con la funcionaria, y eso no se exige (`SEED:141`) |
| 2 | Entrar al consultorio | Dura (lo anterior) | MUNDO/CTX "Consultorio →" | Con el objetivo actual el jugador espera "valorar riesgo" aquí |

### E6. Consultorio — mapa `comisaria-consultorio`, nodo 4 (C1) y luego nodo 5 (C2)

Tras C1 el mapa conserva la clave: reinicio a (480,430) sin banner.
HUD hoy: nodo 4 → "Escenario 4 de 8 / Paso 4 (4/6)". Nodo 5 → "Escenario 5 de 8 / Paso 5 — Marco normativo de derechos (5/6)".
OBJ hoy: nodo 4 → texto de C1. Nodo 5 → "Establece el marco normativo del restablecimiento de derechos."

Objetos (`SEED:801-855, 1046-1058`): `sobreviviente-consulta` (220,408, opciones de C1), `marco-normativo-comisaria` (790,318, opciones de C2), `profesional-psicosocial` (700,400, opciones de C3), `tool-riesgo` (318,436), `tool-ruta` (610,436), `puerta-recepcion` (122,460). NPC: `apoyo-psicosocial` (660,430).

| # | Acción requerida | Compuerta | Qué ve hoy | Brecha |
|---|---|---|---|---|
| 1 | Nodo 4: tomar el instrumento de riesgo (`tool-riesgo`) | Blanda: `usedTools: RISK_METER` (`EVID:38`) | Marcador "Valoración de riesgo" | Mismas brechas de recogida silenciosa |
| 2 | Nodo 4: aplicarlo en `sobreviviente-consulta` | Blanda | La opción "Aplicar valoración estructurada de riesgo de feminicidio" es la **opción 1 numerada** de la lista de decisión (`SEED:813-817`). Al usarla el diálogo se reemplaza por "✓ Herramienta pertinente"; hay que cerrar y volver a abrir al sobreviviente | Herramienta y decisión comparten lista numerada y el flujo exige reabrir el diálogo (WAY-05) |
| 3 | Nodo 4: decidir C1 en `sobreviviente-consulta` | Etapa + blanda | OBJ de C1 | Es lo que el OBJ lleva diciendo desde el hospital |
| 4 | Nodo 5: decidir C2 en `marco-normativo-comisaria` | Etapa. Sin evidencia | OBJ de C2 | `sobreviviente-consulta` y `profesional-psicosocial` siguen abiertos con opciones de C1 y C3 (WAY-03) |
| – | `tool-ruta` (SAFETY_ROUTE) | Ninguna: no hay evidencia, compuerta ni opción que la use | Marcador y slot | Herramienta sin función visible (WAY-09) |

### E7. Consultorio (marco) — mapa `comisaria-consultorio-marco`, nodo `comisaria-accion-final`

HUD hoy: "Escenario 6 de 8", "Paso 6 — Actuación y cierre (6/6)".
OBJ hoy: "Cierra la actuación técnica y ética: víctima, dependientes, nivel de riesgo y rutas."

| # | Acción requerida | Compuerta | Qué ve hoy | Brecha |
|---|---|---|---|---|
| 1 | Haber usado el instrumento de riesgo | Blanda: `usedTools: RISK_METER` (`EVID:42`), ya cumplida si se hizo en C1 | Nada. Si se decidió C1 con "información incompleta", la advertencia reaparece aquí sin decir que falta ir a `sobreviviente-consulta` | Ver WAY-02 |
| 2 | Decidir C3 en `profesional-psicosocial` | Etapa | OBJ | `sobreviviente-consulta` y `marco-normativo-comisaria` siguen abiertos con opciones viejas (WAY-03) |

### E8. Cierre — mapa `comisaria-consultorio-cierre`, nodo `cierre-caso`

No se juega. Al decidir C3, `status = COMPLETED` y el overlay "Intento finalizado" cubre el mundo (`PLAY:947-950`). El objeto `cierre-resumen` (480,360), el objetivo "Caso consolidado: revisa tu reporte final…" y el paso "Caso cerrado (6/6)" (`OBJ:22-23, 35`) casi no llegan a verse. "Escenario 7 de 8" tampoco.

---

## 3. Respuestas a las preguntas puntuales

### 3.1 ¿Qué pasa si el jugador toca una puerta bloqueada?

"Tocar" es pulsar E o el botón contextual; no hay disparo al caminar encima porque el mapa tiene `scenarioConfig` (`WORLD:1191`, `checkDbDoorTriggers` solo actúa sin config).

1. `tryOpenDoor` evalúa en el frontend `requiresInspected/Tools/Npcs` y `requiresNodes` (`PLAY:1275-1285`). Si falla: sonido `ui_cancel`, toast con `lockedMessage` (icono de candado, 4,2 s, `role="alert"`) y anuncio a lectores de pantalla. Si la puerta no trae mensaje: "Aún no puedes pasar: te falta información clave de esta sala."
2. El backend revalida (`WSVC:442-459`) y devuelve el mismo `lockedMessage`.
3. Sí hay "por qué", pero:
   - **No hay indicio de bloqueo antes de pulsar**: el rótulo del mundo y la CTX son idénticos con la puerta abierta o cerrada (`WORLD:2079-2087`).
   - Los mensajes dicen el motivo en abstracto ("identifica la necesidad…", "registra la decisión hospitalaria", "revisa… la orientación de ingreso") y no nombran el objeto concreto ni su ubicación.
   - La puerta de E1 comprueba menos de lo que la decisión exige (solo la familia) y la puerta de E5 menciona algo que no exige (la orientación de ingreso).
   - El aviso desaparece a los 4,2 s y no queda una lista persistente de qué falta.
   - Con la puerta recién cruzada hay un segundo aviso, "Da unos pasos dentro de la sala antes de volver a cruzar la puerta." (`PLAY:1287-1290`), útil pero poco frecuente.

### 3.2 ¿Los "puntos de interés" tienen resaltado o indicador?

- **Lo que hay**: todos los marcadores interactivos tienen el mismo círculo pulsante (r=22, alfa .1→.05, 1,1 s) y flotan 3 px (`WORLD:2065-2068, 2105-2110`). El más cercano sube a escala 1.08 y muestra su etiqueta (11 px) (`WORLD:2337-2346`). Suena un `proximity-blip` al entrar en rango (`WORLD:2331-2333`).
- **Lo que no hay**: marca de requerido vs. opcional, estado "hecho/pendiente" (un objeto inspeccionado o un NPC ya hablado se ven igual), flecha o indicador de dirección, ni minimapa. La hoja de ruta ya lo reconoce: "faltan cursores, flecha guía" (`docs/audits/2026-10-02-brechas-plan-maestro-total.md:45`).
- Con **movimiento reducido** (`PLAY:920`) se desactivan los dos tweens (`WORLD:2066, 2103`): queda solo un círculo estático al 10 % de alfa, es decir, ningún indicador animado.
- **Zonas y puntos ambientales del código no se usan en este caso**. `isHospitalMap` compara con `'urgencias-crisis'` y `isComisariaMap` con `'valoracion-comisaria'` (`hospital-map.config.ts:4,121-123`; `comisaria-map.config.ts:4,96-98`), claves que el seed actual no crea. Por eso para SIM-VBG-001 quedan dormidos: `HOSPITAL_ZONES`, `HOSPITAL_AMBIENT_ZONES`, `getSceneAmbientZones` (devuelve `[]`), las etiquetas y descripciones traducidas (`INTERACTION_LABELS`, `scene-map-display.util.ts:27-53`), las advertencias de acción riesgosa (`risky-interaction.config.ts:10-22`) y los pasos por proximidad `"Paso 1/6 — Área médica restringida"` (`:33-36`). Los objetos `cuestionario-prematuro` y `contacto-agresor` no existen en el seed.
- Sí hay rótulos escénicos dentro del arte de las salas ("QUIRÓFANO · ACCESO RESTRINGIDO", "TRIAGE", cartel de la comisaría; `case-pdf-rooms.renderer.ts:488, 508, 553`), pero son ambientación, no orientación.

### 3.3 "Paso 1 de 6" frente a "Escenario 1 de 8"

- **"Escenario k de 8"** (`PLAY:1645-1651`) es la posición de `currentNode` en `progress-map`, que ordena por BFS desde el nodo inicial y añade al final los nodos no alcanzados (`GSVC:478-501`). Eso da: urgencias 1, sala-escucha 2, acción 3, cierre 4, consultorio 5, acción-final 6, cierre-caso 7 y `comisaria-recepcion` 8. El 8.º es un nodo-sala al que nunca se "llega" como nodo, así que el contador **nunca pasa de 7 de 8**. Además cada decisión mueve un escenario, de modo que "escenario" equivale a "decisión", no a "sala".
- **"Paso k (k/6)"** (`HUD:48-53`, `OBJ:28-37`) es una tabla fija por nodo con total 6. Coincide numéricamente con el escenario hasta el 6, pero con otro denominador. En pantalla estrecha el chip de paso y la ubicación desaparecen (≤960 px) y el chip de escenario también (≤640 px) (`HUD:376-389`).
- **"Progreso: X de 8 escenarios"** (`PLAY:1637-1643`) solo está en el atributo `title` del marcador de puntaje (`HUD:100-101`): invisible en táctil y sin efecto en lectores de pantalla (el `aria-label` lo pisa).
- Resultado: el jugador ve "Escenario 4 de 8" y "Paso 4 (4/6)" a la vez y, durante 3 salas distintas (hospital-cierre, recepción y consultorio con C1 pendiente), ambos números no cambian. La sensación de avance se rompe justo cuando más se camina.
- El título de ubicación (`world.map.title`) es idéntico en E2, E3 y E4 ("Hospital — Sala de escucha familiar") y en E5-E7 los dos consultorios.

### 3.4 ¿Por qué los 5 slots de herramientas aparecen bloqueados?

- El dock pinta **todas** las herramientas activas de la versión del caso, no las de la sala (`world.tools`, `WSVC:589-594`; `DOCK:22-40`). El seed define 5 (`SEED:1082-1093`). `inventory` empieza vacío, así que los 5 salen como `tool-card--locked`, con `[disabled]`, candado y opacidad .35.
- Dónde está cada una: PAP en urgencias; SPIKES en sala de escucha (E2 y E3); REFLECTION_JOURNAL en sala de escucha (E2, E3, E4); RISK_METER y SAFETY_ROUTE en el consultorio (E6, E7). Nada en el dock lo dice.
- Por ser `disabled`: no reciben foco de teclado, el `title` no aparece en táctil y el `aria-label` solo dice "No disponible." sin cómo conseguirla.
- Los números 1-5 dibujados en cada tarjeta (`DOCK:33`) **no tienen atajo**: los dígitos solo eligen opciones dentro de un diálogo (`DLG:489-514`; `PLAY:1096-1160` no los maneja). Es una falsa promesa.
- Una herramienta poseída no se "usa" desde el dock: pulsarla abre un diálogo informativo con su descripción (`PLAY:1511-1526`). La aplicación real ocurre como opción dentro del diálogo del objeto objetivo (`requiredToolCode`).
- Por función: PAP y RISK_METER se aplican y cuentan; SPIKES solo tiene que estar en el inventario; SAFETY_ROUTE y REFLECTION_JOURNAL no tienen ningún consumidor. La "Bitácora" recogible no abre la bitácora real (esa es la tecla J).

### 3.5 Escenas sin objetivo definido (copias)

- Para SIM-VBG-001 **las 8 claves de nodo tienen objetivo y paso** (`OBJ:9-37`). Las copias heredan el objetivo por **nodo** (no por mapa): por ejemplo, `hospital-sala-escucha-accion` muestra el de `hospital-accion-etica`. No hay copias huérfanas.
- Lo que sí falla es lo opuesto: el objetivo sigue al nodo y no a la sala que se pisa. Pasa en E5 (recepción), en E4 (sala de cierre, con texto de C1) y en toda sala a la que se vuelva por una puerta de retorno (p. ej. al regresar a urgencias desde la sala de escucha en el nodo 3, la tarjeta dice "Define qué hacer —y qué evitar—…").
- Si una clave de nodo no existe en `OBJ` (casos creados en el editor, otras versiones del caso, un nodo nuevo): `getSceneObjective` devuelve `null`, la tarjeta no se renderiza (`PLAY:234`) y el chip de paso del HUD tampoco (`HUD:48`). No hay respaldo con el título o la narrativa del nodo, que sí existen (`game.currentNode.title/narrative`).
- `SCENE_GUIDES` está también indexado por nodo, aunque su comentario diga "node_key, which equals the scene map_key" (`GUIDE:11`). Para las copias eso es falso, y daría igual porque está apagado.

---

## 4. La guía está desactivada: por qué y qué la sustituye

- **Por qué**: `getSceneGuide` devuelve siempre `null` (`GUIDE:107-112`). El comentario explica que "the moving helper NPC looked like an unrelated orange character approaching the PAP tool". Fue una decisión de apariencia (un personaje ajeno que camina hacia la herramienta), no de producto. `PLAY:939-944` y `WORLD:621-745` conservan toda la plomería.
- **Qué la reemplaza hoy**: nada dedicado. Lo que queda es: (a) la tarjeta de objetivo estática por nodo, (b) los toasts de puerta bloqueada, (c) el diálogo "Criterio profesional" al intentar decidir, (d) las líneas de los NPC ambientales (opcionales; la psicóloga orientadora de urgencias es la única que dice dónde está la puerta, `hospital-urgencias.json`), (e) los chips del HUD.
- **Datos reutilizables**: `SCENE_GUIDES[nodo].targetKey` (siempre una herramienta, nunca una decisión) y `hint` (por ejemplo "Antes de decidir, toma el kit PAP y observa la crisis familiar…"). Respetan el límite de orientar el proceso y no la respuesta. Tienen errores de tildes ("dificiles", "orienta", "actuacion", "Psicologa") que incumplen el límite 7 si se reutilizan tal cual (`GUIDE:40, 43, 46-47, 61, 64`).

---

## 5. Propuesta: "siguiente paso" derivable de datos existentes

Principio: orientar el **proceso y el dónde**, nunca la respuesta. Ningún texto menciona opciones. No hay temporizador ni puntos flotantes (límites 1-3). Se muestra como una línea en la tarjeta de objetivo y una lista corta "En esta escena" (2-5 ítems), con estado hecho/pendiente derivado del estado del mundo.

### 5.1 Algoritmo (puro, testeable)

Entradas ya presentes en el cliente: `attempt.currentNode.{key, options[].id}`, `world.map.key`, `world.objects[]` (con `type`, `toolCode`, `metadata.requires*`, `dialogue.choices[].decisionOptionId|requiredToolCode`), `world.inventory`, `world.inspectedObjectKeys`, `world.usedToolKeys`, `world.flags.viewedNpcKeys`, `scenarioConfig.rooms[].npcs`, `NODE_EVIDENCE`.

1. **Evidencia pendiente**: `missingEvidence(nodeEvidence(nodo), world, viewed)` ya devuelve `npc:`, `tool:`, `inspected:`. `evidenceMissingItemLabel` ya los convierte a texto ("hablar con…", "tener o usar…", "revisar…"). Se reutiliza para generar ítems de la lista.
2. **Puertas con requisito**: para cada EXIT con `requires*` incumplido, el ítem es "Para abrir «Consultorio →»: revisa «Expediente del caso»", con el nombre del objeto tomado de `world.objects` y su posición (x, y) para señalarlo.
3. **Punto de decisión en esta sala**: objetos cuyo `dialogue.choices` contenga un `decisionOptionId` que esté en `currentNode.options[].id`. El ítem es "Cuando quieras decidir, acércate a «{label}»".
4. **Herramienta que hay que aplicar**: `choice.requiredToolCode` + `world.tools[].label` + `inventory` → "Toma «Kit PAP»" y luego "Aplícala con «Familia en crisis»".
5. **Punto de decisión en otra sala** (E1, E4): hoy no derivable en cliente, porque `world.objects` solo trae la sala actual.

Regla de seguridad: el algoritmo solo lee `options[].id` y `choices[].decisionOptionId`. Nunca `classification` ni `prohibitedConduct` (ver WAY-15).

### 5.2 Lista por escena y dato faltante

| Escena | Pasos derivables hoy (fuente) | Dato que falta |
|---|---|---|
| **E1** | 1) Tomar el Kit PAP (`tool-pap`, `NODE_EVIDENCE.usedTools`). 2) Hablar con la familia en crisis y aplicar PAP (`requiresInspected` de la puerta + `choice.requiredToolCode`). 3) Hablar con la enfermera (`NODE_EVIDENCE.npcs`). 4) Pasar a la sala de escucha (puerta con requisito). | 5) **Punto de decisión en otra sala** (`familia-duelo` en `hospital-sala-escucha`). Además, la evidencia faltante (nurse, PAP) está en una sala distinta de la de decisión, y el mensaje no lo dice. |
| **E2** | 1) Acercarse a «Marco normativo» (objeto con opciones activas ∩ `currentNode.options`). Sin evidencia obligatoria. | Ninguno. Se pueden atenuar `familia-duelo` y `psicologa-acompanante` por no tener opciones activas. |
| **E3** | 1) Tomar el protocolo EPICEE (`tool-spikes`, `NODE_EVIDENCE.tools`). 2) Acercarse a «Psicóloga hospitalaria» (objeto con opciones activas). | Ninguno. |
| **E4** | 1) Salir por «Salida institucional →» (puerta sin requisito). | **Ruta completa hasta C1**: recepción (expediente → consultorio) y consultorio (instrumento de riesgo → aplicar → decidir). Solo se conocen los objetos de la sala actual. |
| **E5** | 1) Revisar «Expediente del caso» (`puerta-consultorio.requiresInspected`, objeto en esta sala). 2) Entrar al consultorio. | Ninguno para los pasos. Falta el **objetivo por sala** (el actual dice "Valora el riesgo…"). |
| **E6, nodo 4** | 1) Tomar «Valoración de riesgo». 2) Aplicarla con «Sobreviviente» (`requiredToolCode`). 3) Acercarse a «Sobreviviente» para decidir. | Ninguno si el jugador ya está en la sala. |
| **E6, nodo 5** | 1) Acercarse a «Marco normativo» (objeto activo). | Ninguno. |
| **E7** | 1) Si falta, usar el instrumento de riesgo (`NODE_EVIDENCE.usedTools`). 2) Acercarse a «Profesional psicosocial». | Ninguno: `sobreviviente-consulta` (donde se aplica el instrumento) y `tool-riesgo` están en esta misma sala. |
| **E8** | Ninguno: es el informe final. | — |

Soluciones al dato faltante, de menor a mayor costo:

- **A (solo frontend, recomendada para empezar)**: un mapa estático `NODE_ROUTE[nodeKey] = { decisionMapKey, decisionObjectKey, steps?: [...] }` junto a `NODE_EVIDENCE`. Es la opción D3 de la base común (contenido en config del frontend). Se escribe una vez para los 6 nodos de decisión.
- **B (backend, sin migración)**: añadir a `node_state` un campo derivado `decisionPoint: { mapKey, objectKey, label }`, calculado con una consulta de solo lectura (`DialogueChoice → DialogueTree → MapObject → SceneMap` filtrando por `decision_option__source_node`). Sirve para casos del editor. No toca el esquema.

---

## 6. Qué reemplazaría a "Paso k/6" y "Escenario k/8" (propuesta, S)

- Un solo contador de **decisiones**: "Decisión 3 de 6". El total es derivable (nodos no terminales con opciones); hoy basta `SCENE_PROGRESS.total`. Retirar el chip "Escenario k de 8".
- Debajo, el nombre de la sala (`world.map.title`), que ya está en el HUD, para separar "dónde estoy" de "cuántas decisiones llevo".
- Borrar la entrada muerta `comisaria-recepcion` o, mejor, resolver el objetivo con `getSceneObjective(nodeKey, mapKey)` y una tabla de excepciones por sala (E4: "Dirígete a la Comisaría de Familia"; E5: "Revisa el expediente antes de pasar al consultorio"). Esos textos ya están escritos en el repositorio (`SEED:186-188`, `OBJ:24`) y no revelan ninguna respuesta.
- Mostrar `progressLabel` como texto visible (no solo `title`) o eliminarlo.

---

## 7. Guardarraíles de producto

Ninguna propuesta de este informe cruza los límites del §6 de la base común:

1. Los pasos nombran personas, objetos y herramientas, no opciones. Aviso: `DTO:52-58` ya envía `classification` y `prohibitedConduct` de cada opción antes de decidir; cualquier lógica de "siguiente paso" debe ignorarlos (WAY-15).
2. Sin puntos flotantes ni lenguaje de victoria/derrota. El puntaje sigue como "Seguimiento formativo".
3. Sin tiempos ni premio a la rapidez.
4. Salida segura: ver WAY-04, que muestra que hoy no es alcanzable en táctil durante un diálogo con opciones.
5. Sin migraciones ni backend nuevo obligatorio (la opción B del §5.2 es solo lectura).
6. WCAG 2.2 AA: los indicadores nuevos deben tener alternativa sin movimiento y texto accesible; hoy el estado hecho/pendiente no existe en ARIA.
7. Textos con tildes (ver errores en `GUIDE`).

---

## 8. Hallazgos (resumen ordenado)

Detalle completo en el resultado estructurado. IDs `WAY-NN`.

| ID | Sev. | Título |
|---|---|---|
| WAY-01 | high | El objetivo sigue al nodo y no a la sala: en E4 y E5 describe una decisión que ocurre dos salas después |
| WAY-02 | high | La decisión de E1 y los requisitos viven en salas distintas; la puerta exige menos que la decisión |
| WAY-03 | high | Los objetos de decisión de otras etapas siguen activos con opciones viejas y un aviso contradictorio |
| WAY-04 | blocker (táctil) | Los diálogos con opciones no tienen botón de cerrar; la salida segura queda `inert` mientras hay diálogo |
| WAY-05 | high | Aplicar una herramienta sin tenerla da un error genérico y deja el diálogo bloqueado; la herramienta comparte lista con las decisiones |
| WAY-06 | high | Dos contadores de progreso incompatibles; el "8" nunca se alcanza y E8 no se juega |
| WAY-07 | high | No hay aviso de cambio de etapa; la narrativa de la etapa solo se ve dentro de un diálogo de decisión |
| WAY-08 | medium | Puertas: el bloqueo no se ve hasta pulsar y los mensajes no nombran objeto ni lugar |
| WAY-09 | medium | Recoger una herramienta es silencioso; tres de las cinco no tienen función visible |
| WAY-10 | medium | Los 5 slots salen bloqueados, deshabilitados y con números que no funcionan |
| WAY-11 | medium | Los NPC (uno es requisito) son invisibles para la CTX y pierden prioridad frente a los marcadores |
| WAY-12 | medium | La CTX descarta el verbo de la interacción; la configuración hospital/comisaría está dormida para este caso |
| WAY-13 | medium | Los marcadores no tienen estado (requerido, hecho, opcional) ni flecha; con movimiento reducido no hay indicador |
| WAY-14 | medium | La guía se apagó sin sustituto; sus pistas quedan huérfanas y sin tildes |
| WAY-15 | medium | `classification` y `prohibitedConduct` viajan al cliente antes de decidir |
| WAY-16 | low | El rótulo de puerta del mundo mide 88 px y el texto es más largo (inferencia) |
| WAY-17 | low | `world_validation` no valida referencias `requires*` ni que cada decisión sea alcanzable |

### 8.1 Detalle de hallazgos

Esfuerzo: S < 0,5 día, M 0,5-2 días, L > 2 días.

**WAY-01 (high, S). El objetivo sigue al nodo y no a la sala.**
Jugador: en el hospital de cierre y en la recepción lee "Valora el riesgo, activa medidas de protección y orienta derechos…", pero no hay nada que valorar ahí. Evidencia: `PLAY:938` (`getSceneObjective(attempt.currentNode.key)`), `OBJ:16-17` (objetivo de `hospital-cierre-bloque` = C1), `OBJ:24, 36` (entradas de `comisaria-recepcion` inalcanzables), `GSVC:388` (el nodo solo cambia al decidir). Arreglo: `getSceneObjective(nodeKey, mapKey)` con una tabla de excepciones por sala para E4 y E5 y para las salas visitadas por puertas de retorno; usar los textos que ya existen en `SEED:186-188` y `OBJ:24`. Fallback para claves sin objetivo: primera frase de `currentNode.narrative`.

**WAY-02 (high, M). La decisión de E1 y sus requisitos están en salas distintas, y la puerta exige menos que la decisión.**
Jugador: puede pasar a la sala de escucha con solo haber hablado con la familia; allí descubre que faltaban el PAP y la enfermera, que están en la sala anterior. Evidencia: `SEED:899` (solo `familia-crisis`), `EVID:24-32`, `PLAY:1721-1727` (el mensaje no dice dónde), `PLAY:1770-1771` (opción de decidir con información incompleta). En C1/C3 se repite con el instrumento de riesgo. Arreglo: lista "En esta escena" derivada de `NODE_EVIDENCE` + puertas, con nombre de sala en cada ítem (config `NODE_ROUTE`, §5.2-A); alinear el `lockedMessage` de la puerta con esos requisitos o nombrarlos en el mensaje de evidencia ("en Urgencias").

**WAY-03 (high, S). Objetos de decisión de otras etapas siguen activos.**
Jugador: en cada sala hay 3 objetos con opciones; abre uno equivocado, ve opciones de otra etapa y, al elegir, recibe "Vuelve cuando el flujo te lleve a esta sala" estando ya en ella. Además la familia repite lo del inicio en E2 y E3. Evidencia: `SEED:744-799` y `801-855`, `PLAY:1334-1359` (no filtra), `PLAY:1427-1434`, `DLG:62-85`, `GSVC:344-345`. Arreglo: en `decorateDialogue`, quitar las opciones de decisión cuyo `decisionOptionId` no esté en `currentNode.options` y mostrar el diálogo como informativo con "Continuar"; atenuar el marcador; cambiar el aviso a "Esta conversación corresponde a otro momento del caso". No revela cuál opción de la etapa activa es la adecuada.

**WAY-04 (blocker en táctil, S). Diálogos con opciones sin salida y salida segura inaccesible.**
Jugador (táctil): abre un diálogo de decisión por curiosidad y no hay forma de cerrarlo sin elegir; el botón "Salida segura" y el HUD quedan `inert` mientras hay diálogo, y no hay tecla Esc. En escritorio solo sirve Esc, que no está anunciado en el diálogo. Evidencia: `DLG:94-107` (el botón "Continuar/cerrar" solo existe sin opciones), `PLAY:212, 233, 289` (`inert` con `inputBlocked`), `PLAY:1597-1599` (`safeExit` se niega si hay bloqueo), `PLAY:1129-1134`. (Inferencia para táctil: no probado en navegador; confirmar.) Arreglo: botón visible "Cerrar" en el diálogo mientras no haya elección en curso, y la salida segura dentro del panel de diálogo o fuera de la zona `inert`. Es parte del límite 4 (ETH-02).

**WAY-05 (high, S). Herramienta sin tenerla: error genérico y diálogo bloqueado.**
Jugador: "Aplicar PAP a la familia en crisis" se ve igual que cualquier opción; sin kit sale "No pudimos usar la herramienta." y las opciones quedan en gris sin cierre. En C1 la herramienta es la opción 1 de la lista numerada de decisiones y, al usarla, el diálogo se reemplaza y hay que reabrirlo. Evidencia: `WSVC:270-271` (mensaje útil descartado), `PLAY:1507`, `DLG:530-545` y `266-267` (`chosenKey` solo se limpia al cambiar el diálogo), `SEED:813-817`. Arreglo: marcar la opción como "Necesitas el Kit PAP" cuando `inventory` no lo incluye y no permitirla; mostrar el mensaje del backend; limpiar `chosenKey` ante error; separar visualmente la herramienta de las decisiones y volver al mismo diálogo tras usarla (hay que actualizar el e2e que hoy cierra y reabre).

**WAY-06 (high, S). Dos contadores incompatibles.**
Jugador: ve a la vez "Escenario 4 de 8" y "Paso 4 (4/6)"; el 8 es inalcanzable (máximo 7) y E8 no se juega. Evidencia: `GSVC:478-501`, `PLAY:1645-1651`, `HUD:48-53`, `OBJ:28-37`, `HUD:376-389` (chips ocultos en pantalla estrecha), `HUD:100-101` (progreso solo en `title`). Arreglo: §6.

**WAY-07 (high, M). Sin aviso de cambio de etapa y la narrativa de la etapa está oculta.**
Jugador: tras decidir, el mundo se reinicia en (480,430) sin banner (misma `map.key`) o con el mismo título de sala (copias); el texto que dice qué hacer ("dirígete a la Comisaría de Familia") solo se muestra dentro de un diálogo de decisión o a lectores de pantalla. Evidencia: `PLAY:1874-1880` y `1970-1979`, `PLAY:271-286`, `PLAY:338-348`, `SEED:604-638`. Arreglo: tarjeta no modal "Nueva etapa: {título}" con la primera frase de `narrative` y el objetivo, al cambiar `currentNode.key`; banner con `node.title` aunque no cambie el mapa; respetar movimiento reducido.

**WAY-08 (medium, S). Puertas.**
Jugador: no sabe que una puerta está cerrada hasta pulsar E; el mensaje no nombra el objeto ni dónde está; dura 4,2 s. Evidencia: `WORLD:2079-2087`, `PLAY:1275-1285, 1313-1318`, `SEED:134-141`. Arreglo: candado en el rótulo y en la CTX calculado con la misma lógica de `tryOpenDoor`; texto "Antes de pasar: revisa «Expediente del caso»" con nombres de `world.objects`; corregir `LOCKED_CONSULTORIO` (menciona una orientación que no se exige).

**WAY-09 (medium, S). Recoger una herramienta es silencioso y 3 de 5 no tienen función visible.**
Jugador: pulsa E sobre el kit, el icono desaparece y nada confirma ni explica. SPIKES "se revisa" recogiéndola, sin ver el protocolo. Evidencia: `PLAY:1251` (`dialogue.set(null)` para TOOL), `simulation.model.ts:269` y ausencia de otros usos de `unlockedToolCode`, `SEED:788-798, 850-853`, `EVID:34-35`. Arreglo: toast + sonido + anuncio accesible al recoger; mostrar el texto de `PROTOCOL_INFO_MESSAGE` (`hospital-map.config.ts:63-64`) al recoger SPIKES; decidir con el equipo clínico si SAFETY_ROUTE y REFLECTION_JOURNAL se quedan (el diseño pide "ninguna interacción de relleno", spec `2026-07-13-sim-vbg-001-premium-gameplay-design.md` §8.1).

**WAY-10 (medium, S). Dock de herramientas.**
Jugador: 5 slots grises con candado desde el minuto 0, sin saber dónde ni para qué; números 1-5 que no hacen nada. Evidencia: `DOCK:22-40`, `WSVC:589-594`, `DLG:489-514`, `PLAY:1511-1526`. Arreglo: slots enfocables (`aria-disabled`, no `disabled`) con popover "Dónde: …" desde la config de §5.2-A, contador "1 de 5", y quitar los números o implementar los atajos sin chocar con los dígitos del diálogo.

**WAY-11 (medium, S). NPC invisibles al HUD.**
Jugador: la enfermera (requisito de H1) solo muestra un "▲ E" de 8 px a ≤60 px; la CTX no cambia; la psicóloga de urgencias queda tapada por la puerta (marcador gana). Evidencia: `WORLD:1507-1529`, `WORLD:1442-1448`, `interaction-priority.util.ts:7-13`, `PLAY:303-318`, `hospital-urgencias.json`. Arreglo: incluir NPC en la CTX ("Hablar con Enfermera de urgencias") y en la lista de pasos; marcar el NPC como atendido; dar prioridad al NPC cuando está más cerca que la puerta.

**WAY-12 (medium, S). Verbo descartado y configuración dormida.**
Jugador: ve "Kit PAP" y "Primeros Auxilios Psicológicos: contención…" y no "Tomar el kit…"; la puerta repite su nombre en etiqueta y descripción. Evidencia: `PLAY:1223-1231`, `scene-map-display.util.ts:36-43`, `hospital-map.config.ts:4,121-123`, `comisaria-map.config.ts:4,96-98`, `risky-interaction.config.ts:33-36`. Arreglo: mostrar `interactionPrompt` como línea principal; limpiar o generalizar las configuraciones dependientes de `urgencias-crisis` y `valoracion-comisaria`. El spec §7.4 pide "no habrá dos entradas para una misma acción".

**WAY-13 (medium, M). Marcadores sin estado.**
Jugador: todo pulsa igual; no distingue lo hecho de lo pendiente ni lo requerido de lo opcional; con movimiento reducido no hay indicador animado. Evidencia: `WORLD:2065-2068, 2102-2112, 2337-2346`, `docs/audits/2026-10-02-brechas-plan-maestro-total.md:45`. Arreglo: marca estática de "hecho" (forma + texto, no solo color), anillo del objetivo actual del paso siguiente, flecha estática al borde si el objetivo no está en esta sala.

**WAY-14 (medium, S). Guía apagada sin sustituto.**
Evidencia: `GUIDE:107-112`, `PLAY:939-944`, `WORLD:621-745`. Arreglo: reutilizar `hint` como texto de la línea "Siguiente paso" (sin NPC) tras corregir tildes, o borrar el código muerto.

**WAY-15 (medium, S). `classification` y `prohibitedConduct` viajan antes de decidir.**
Jugador/estudiante curioso: abriendo la pestaña Red del navegador ve la clasificación de cada opción de la etapa. No se pinta (`isProhibited` no se usa en la plantilla), pero la evaluación es formativa y el límite 1 prohíbe revelarlo. Evidencia: `DTO:52-58`, `DTO:61-81`, `PLAY:1354`, `simulation.model.ts:257-259`. Arreglo: enviar solo `id` y `text` en `currentNode.options`; mantener la clasificación en el `feedback` posterior a elegir; quitar `isProhibited` del flujo.

**WAY-16 (low, S). Rótulo de puerta desbordado (inferencia).**
Evidencia: `WORLD:2080-2081` (fondo de 88 px frente a "E  Sala de escucha familiar →" a 11 px en negrita). Arreglo: ancho dinámico según `hintTx.width`.

**WAY-17 (low, M). El validador de mundo no revisa puertas ni alcanzabilidad.**
Evidencia: `world_validation.py:37-48` (grafo, geometría, ética, salida segura, límites). Un `requiresInspected` con una clave inexistente deja la puerta cerrada para siempre sin advertencia al publicar. Arreglo: advertencias para claves `requires*` desconocidas, destinos sin mapa y nodos con opciones sin objeto que las ofrezca.

---

## 9. Qué no se verificó

- Ninguna captura ni sesión de navegador. Los puntos marcados "(inferencia)" deben confirmarse jugando; en especial WAY-04 en táctil y WAY-16.
- El estado real de la base de datos en el entorno corriendo se asume igual al seed (`seed_caso_pdf.py` es idempotente y reconstruye la versión 2.0.0).
- No se auditó el contenido clínico de las opciones ni su orden. Sí se confirmó que el frontend no pinta `isProhibited` ni `isRecommended` en las opciones de decisión (`DLG:62-85` no los usa).
