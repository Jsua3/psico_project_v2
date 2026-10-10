# Antipatrones eliminados y mapa SOLID — SIEP

Resumen para el informe de la materia (Unidad 4, antipatrones; Unidad 6, SOLID). Cada fila remite a su
entrada de `CAMBIOS_ADSI.md`, donde están el problema con su archivo y líneas, la solución, el riesgo, las
pruebas, las capturas «antes/después» y el diagrama UML. Aquí solo se reúne y se ordena; **no hay ninguna
afirmación que no esté sustentada allí**. Las cifras de pruebas salen de las corridas completas de cada rama.

**Estado al 10 de octubre de 2026** (punta de la pila: `adsi/a05c-editor-e2e`): backend **855** pruebas,
frontend **2383** en 179 archivos (línea base del proyecto: 307 y 1809) y **35** de extremo a extremo (34 antes
de A-05c). Todo vive en ramas con su PR hacia `adsi/integracion`; nada se fusionó en `master` (ver
`EVIDENCIA_GIT.md`).

---

## 1. Antipatrones: qué había, qué se hizo y qué sigue

| Antipatrón (Unidad 4) | Dónde estaba | Cambio | Estado |
|---|---|---|---|
| **Objeto Dios / Blob** | `authoring_service.py`: 1266 líneas, 71 funciones y ocho responsabilidades, con la auditoría reasignada al final del archivo | **P-05b** · Facade + SRP: fachada de 28 operaciones y un paquete de nueve módulos | Resuelto |
| | `SimulationService` (frontend): 50 métodos para tres roles | **P-05** · ISP: `AuthoringApi` (25) e `InstructorApi` (4); el servicio del jugador queda con 21 | Resuelto |
| | la escena del mundo (`game-world.component.ts`, 2928 líneas el 9 de octubre), `SimulationPlayComponent` (~1830 líneas de clase), `grupos/services.py` (601) y `game_service.py` (528) (cifras de la línea base y de FASE0 §8) | — | **Documentado, no tocado**: sin red de seguridad suficiente (la escena solo se prueba por contract-specs que leen el texto) |
| **Cut & Paste** | `_clamp` ×3, lectores JSON ×3, `_int` sin uso | **A-01** · un solo módulo (`shared/jsonutils.py`) | Resuelto |
| | diez bucles `_clone_*` campo por campo (83 asignaciones) | **P-03** · Prototype declarativo (`CopySpec`) | Resuelto |
| | `rectC`/`frameC`/`ellipseC` idénticas en dos renderers (239 usos) | **A-01b** · `graphics-primitives.util.ts` | Resuelto |
| | cuatro funciones `render*` con el mismo esqueleto | **P-14b** · Template Method (`CaseRoom`) | Resuelto |
| | dos rutas de copia de rúbricas con criterios distintos; el clon olvidaba cuatro campos | **A-07** · se declaran en el `CopySpec` | Resuelto (decisión del equipo pendiente de fusionar) |
| | `_world_clinical_tool` era una copia exacta de `clinical_tool_editor` | **A-08** · una sola función | Resuelto |
| | `contactShadow` en los dos renderers; el acotado 0–100 del estrés en 6 archivos del frontend | — | **Documentado, no tocado** |
| **Lava Flow / Boat Anchor** | `audio.service.ts`, `renderHospitalEnvironment`, `_parse_csv_rows`, `game_views._int`, `getAttempt`/`getCompletionReport`/`deleteDecision` | **A-02** · borrado verificado con `ng build`, `ng test` y las suites | Resuelto |
| | tres imports sin uso que A-01 y P-05b dejaron anotados (`CriterionScore`, `Rubric`, `_int`) | **A-08** · recorrido de todos los archivos del backend; solo esos tres no estaban marcados a propósito | Resuelto |
| | `ResizeZoneCommand` sin llamador de producción desde P-07 | — | Documentado (decisión del equipo: redimensionar zonas) |
| **Hard Code** | estados del intento como texto en ~46 sitios de 5 archivos, existiendo `AttemptStatus` | **A-03a** | Resuelto |
| | contraseña por defecto `Siep2026!` escrita en el servicio | **A-06** · pasa a configuración (valor por defecto igual) | Resuelto el literal; **el riesgo de fondo (la misma contraseña para todos) sigue** |
| **Números mágicos** | 11 tiempos de `setTimeout` en `simulation-play.component.ts` | **A-03b** | Resuelto |
| | reglas de puntaje, estrés y escalas del backend (`-5/+3`, `40/20/15`, `50/50`, `70`, `960×540`…) | **A-03c** | Resuelto |
| **Exception Handling** | `GoogleLoginView`: `except Exception` que convierte un fallo de la base en «cuenta no asociada» | **A-04** (cambio de comportamiento deliberado: 401 → 500) | Resuelto |
| **Función larga** | `build_completion_report` (~100 líneas) | **P-04** · Builder | Resuelto |
| | `_validate_door` (cascada de `if … raise`) | **P-08a** · Chain of Responsibility | Resuelto |
| | `get_progress_map` (BFS manual con `pop(0)`) | **P-09** · Iterator | Resuelto |
| | `save_world` (110 líneas) | **A-05** · cinco funciones | Resuelto (con cambio de comportamiento, en revisión) |
| **Condicionales en cascada** | `nextNpcTarget` / `nextAmbientTarget` por tipo | **P-10** · Strategy | Resuelto |
| | interceptor JWT con cuatro bloques casi iguales | **P-08b** · Chain of Responsibility | Resuelto |
| **Acoplamiento al detalle** | `choose_decision` importaba y llamaba a progresión en línea | **P-13** · Observer | Resuelto (con una duda declarada: un solo suscriptor) |
| **Integridad de datos** (no es un antipatrón del curso, pero es lo más grave que apareció) | `save_world` buscaba objetos por `id` en toda la base: un objeto nuevo con un id local coincidente **se llevaba el de otra sala**, y cada autoguardado duplicaba lo nuevo | **A-05** | Resuelto en la rama; medido por API: 3 autoguardados pasaban de 4 a 7 objetos; **medido en el navegador (A-05c): agregar tres objetos a un caso nuevo le quitó tres a la versión publicada del caso demo (41 → 38); la misma prueba falla en el mismo punto sobre `master`** |
| | el editor no sustituía los ids locales por los reales tras guardar, así que cada autoguardado recreaba lo nuevo con otro id | **A-05b** · el store adopta los ids de la respuesta por clave | Resuelto en la rama (cambio de comportamiento acotado); verificado en el navegador por **A-05c** |
| **Prueba intermitente** (no es un antipatrón del curso, pero rompía el CI) | un temporizador de 80 ms de `SimulationPlayComponent` sin dueño: se disparaba tras desmontar el entorno de pruebas (`window is not defined`) y hacía fallar 1 de 7 ejecuciones de CI de una rama que ni tocaba el frontend | **A-09** · el temporizador tiene dueño y `ngOnDestroy` lo cancela | Cerrada la ruta del error; que la intermitencia haya desaparecido **no se puede demostrar** |

### Lo que NO se arregló y debe quedar escrito

- **Cambios que esperan decisión**, cada uno en su rama y su PR: A-05 (borra lo que antes no borraba), A-05b (el
  editor adopta los ids reales tras guardar), A-07 (el clon conserva pesos y estado de criterios) y P-13 (Observer
  con un único suscriptor; no cambia comportamiento).
- **Hallazgos sin corregir**: `create_case` es la única mutación del editor sin auditoría; `create_object` y
  `create_tool` responden 500 si faltan campos NOT NULL; `update_dialogue` sin `lines` borra las líneas;
  `get_completion_report` devuelve el informe de un intento pausado o reemplazado; `patrol` empieza en el punto 1;
  `requests` falta en `requirements.txt`, por lo que el inicio de sesión con Google siempre responde «proveedor no
  instalado»; los demás temporizadores sin dueño de `SimulationPlayComponent` (ninguno vuelve a usar `window`); el
  editor de mundo pinta «0 objetos · 0 zonas» y deja activa la biblioteca antes de que cargue la sala (un clic en
  ese momento no hace nada); `save_world`, `create_object` y `create_dialogue` buscan `decisionOptionId` y
  `mapObjectId` por id sin acotar a la versión del caso (solo se alcanza llamando a la API a mano: la interfaz
  ofrece únicamente las decisiones del nodo).
- **Decisiones de producto, no tomadas**: P-11 (Strategy de finales: `compute_ending` aplica las reglas y los
  textos del caso del PDF a cualquier caso; uno que no sea el del PDF no tiene banderas, así que solo puede
  terminar en «Riesgo Persistente» o, con dos decisiones críticas, en «Crítico», y nunca en «Integral» ni «Con
  brechas»; decidir qué final tienen los demás casos es una decisión de producto) y los opcionales P-15 a P-20 del
  plan v1 (alto riesgo: los contract-specs leen el texto fuente).
- **Dos DDL distintas**: `bootstrap_dev_db` no replica los `ON DELETE CASCADE` de `deploy/db_seed.sql`.

---

## 2. Mapa SOLID (Unidad 6)

| Principio | Violación encontrada | Corrección | Prueba que la sostiene |
|---|---|---|---|
| **S** · Responsabilidad única | `authoring_service` (8 responsabilidades); la vista de IA (valida, arma el prompt, llama por HTTP, parsea y audita); `build_completion_report`; el interceptor JWT; `choose_decision` que además registra la progresión; `save_world` | P-05b, P-01, P-04, P-08b, P-13, A-05 | 46 pruebas de caracterización de las 28 operaciones (45 de P-05b y una de A-08); 39 en la frontera HTTP de IA; 31 del reporte; 23 del interceptor |
| **O** · Abierto/cerrado | un `if proveedor ==` por API; cascadas por tipo de movimiento; reglas de puertas en una función; cada reacción nueva a una finalización obligaba a editar el servicio del juego | P-01 (registro `PROVIDERS`), P-10 (registro de estrategias), P-08a (un eslabón nuevo es una clase), P-13 (suscripción), P-03 (campo nuevo = una línea en el `CopySpec`), P-12 (tabla de transiciones) | pruebas de «registrar un proveedor nuevo no toca la vista»; L-01 recorre cada registro |
| **L** · Sustitución de Liskov | no había un contrato único: pruebas por clase concreta | **L-01** · una suite por registro (proveedores de IA, estrategias de movimiento, renderers de sala): 136 pruebas | 27 mutaciones sobre las implementaciones, las 27 detectadas; ninguna implementación incumplía el contrato |
| **I** · Segregación de interfaces | un servicio de 50 métodos que inyectaban todos los componentes | P-05: `AuthoringApi`, `InstructorApi`, `SimulationService` (jugador) | `api-boundaries.contract.spec.ts` fija quién puede inyectar qué |
| **D** · Inversión de dependencias | la vista de IA llamaba a `urllib` directo; el servicio del juego importaba a progresión; las vistas dependían del módulo grande | P-01 (la vista depende de `AIProvider`), P-13 (el juego anuncia, progresión se suscribe), P-05b (las vistas dependen de la fachada) | `test_el_servicio_del_juego_ya_no_importa_la_app_de_progresion`; `test_la_vista_usa_el_proveedor_que_le_da_la_fabrica` |

---

## 3. Cómo leer una entrada del registro

Cada entrada de `CAMBIOS_ADSI.md` tiene la misma ficha (rama y commit, patrón o antipatrón, archivos, riesgo,
**cambio de comportamiento** declarado) y las mismas secciones: *Problema (antes)*, *Solución (después)*,
*Decisión de diseño*, *Lo que no cambió*, *Pruebas* (con el rojo primero cuando lo hubo y las mutaciones),
*Hallazgos*, *Evidencia* y *Relación con la materia*. La carpeta `<ID>/` de la misma ubicación trae las
capturas generadas con `tools/codeshot.py` (números de línea reales, no editadas) y los diagramas UML en
Mermaid (fuente `.mmd`).

## 4. Lo que el proceso enseñó (para la sustentación)

1. **Las pruebas primero, y en rojo.** En A-05, A-07 y P-13 se escribieron las pruebas del comportamiento nuevo y
   se vio fallar el código anterior por la razón esperada antes de tocarlo.
2. **La mutación como control de calidad de las pruebas.** En P-05b la primera ronda dejó pasar 12 de 41
   mutaciones; ninguna era un riesgo de mover el código: eran huecos que la suite original ya tenía.
3. **Un refactor "seguro" puede ocultar un defecto.** El Prototype declarativo (P-03) hizo visible, como una línea
   que falta, cada campo que el clon olvidaba; A-07 los corrige.
4. **Medir antes de afirmar.** El duplicado por autoguardado de A-05 se midió (4 → 7 objetos), no se supuso.
5. **Una prueba intermitente es deuda del CI, no mala suerte.** El job de frontend de A-08 (que no toca el
   frontend) falló con las 2376 pruebas en verde; la causa estaba en el código de producción (un temporizador sin
   dueño). Se re-ejecutó el job para comprobar la hipótesis y se arregló la causa en su propia rama (A-09), sin
   silenciar el error.
6. **Un hallazgo menor anotado hoy es un cambio verificable mañana.** Los dos «hallazgos menores» que P-05b y A-01
   dejaron escritos (tres imports sin uso y una copia exacta) se cerraron en A-08 con una prueba que compara las
   dos vistas antes y después.
7. **El navegador real contó lo que las pruebas de API no podían.** Las pruebas de A-05 probaban el mecanismo
   (un id local coincidente se lleva el objeto de otra sala); A-05c mostró cuán común es el disparador: los ids
   locales del editor parten de 1 y existen en otro caso, así que con el código original agregar los primeros
   objetos a un caso nuevo le quitó tres a la versión publicada del caso demo (41 → 38). La misma prueba sobre
   tres versiones del código (original, solo A-05, punta) falla en el punto esperado en las dos primeras, y sobre
   `master` falla en el mismo punto que el original: el defecto está vivo ahí.
