# Decisiones de la sesión autónoma del 9 al 10 de octubre de 2026

**Para qué existe este documento.** El 9 de octubre (~23:07) se pidió a Claude trabajar «en todo el plan» sin
supervisión hasta las 8:00 del 10 de octubre y dejar claro, al final, qué hizo, en qué tuvo dudas y qué decidió por
su cuenta, para que el equipo diga si está de acuerdo. Esta es esa cuenta. No es un entregable de la materia: si el
equipo no la quiere en el repositorio, se borra este archivo y no cambia nada más.

## Resolución de la mañana (10 de octubre)

Juan José Sua leyó la cuenta y respondió:

| Pregunta | Respuesta |
|---|---|
| ¿Fusionar en orden hacia `adsi/integracion`? | **Sí.** Se fusionaron los PR #24 a #54 (sin el #31, que va a `master`) uno por uno, en orden y con *merge commit*; este (#50) va al final porque contiene la punta. |
| ¿De acuerdo con los cambios de comportamiento (A-05, A-07, A-05b)? | **Sí, totalmente.** |
| P-13 (Observer con un único suscriptor) | **Se deja anotado como lo que es**, para decidir después qué hacer con él. Queda fusionado y marcado como «a decidir» en el registro. |
| ¿P-11 y P-15 a P-20? | **Lo que recomiende Claude:** no hacerlos por ahora; siguen en «evaluado, no aplicado». |
| `requests` para Google y contraseña por defecto | **Sin decidir:** pidió que se explicara qué son (abajo). Siguen pendientes. |

**Qué son los dos pendientes de seguridad y dependencias.**

- **`requests` (inicio de sesión con Google).** `backend_django/requirements.txt` trae `google-auth` pero no
  `requests`, que esa librería necesita para verificar el token (`users/views.py` la importa). Hoy el inicio de sesión
  con Google siempre responde «El proveedor de Google no está instalado en el backend», aunque se configure
  `GOOGLE_OAUTH_CLIENT_ID`. El arreglo es una línea en `requirements.txt` (pasa por `pip-audit` del CI). Recomendación:
  agregarla solo si el inicio de sesión con Google va a usarse.
- **Contraseña por defecto de los importados.** Al importar estudiantes desde un archivo, si la columna de contraseña
  queda vacía todos reciben la misma (`Siep2026!` por defecto; desde A-06 sale de la variable de entorno
  `IMPORTED_STUDENT_DEFAULT_PASSWORD`). Quien la conozca puede entrar como cualquier importado que no la haya cambiado.
  Opciones: **(1)** en producción, definir esa variable con un valor secreto propio (solo configuración); **(2)**
  generar una contraseña aleatoria por estudiante y entregarla una sola vez; **(3)** obligar a cambiarla en el primer
  ingreso (necesita una columna nueva, y la serie no toca el esquema). Recomendación: (1) antes de desplegar, y
  decidir (2) o (3) con el equipo.

## Reglas que se aplicaron

- Durante la noche no se fusionó nada en `adsi/integracion` ni en `master`; la fusión llegó con la aprobación de la
  mañana (arriba). `master` no se tocó. Sin `--force`, sin `--no-verify`.
- Se decidió y construyó solo lo reversible (una rama y un PR), dentro del código, las pruebas y los documentos del
  repositorio, coherente con lo que el código o los documentos ya decían que debía pasar, y sin tocar seguridad.
- **No** se construyó lo que toca seguridad (contraseñas, OAuth), lo que exige un dato de negocio que no se puede
  inferir (qué final tienen los casos que no son el del PDF) ni lo que cambia dependencias.
- Cada cambio siguió el ritual de la serie: pruebas de caracterización primero (en rojo cuando cambia comportamiento),
  mutaciones a propósito, entrada en `CAMBIOS_ADSI.md`, evidencia antes/después, dos commits y PR hacia
  `adsi/integracion`.

## Qué se hizo y qué se decidió sin consultar

| PR | Cambio | ¿Cambia comportamiento? | Decisión de Claude y su duda |
|---|---|---|---|
| #45 | **P-05b** Facade de `authoring_service` (28 operaciones, 9 módulos) | No | La fachada **no reexporta**: cada operación es una función propia con su `@auditable`, porque el registro de auditoría guarda el módulo de la función y reexportar habría cambiado 22 filas de auditoría. Se añadieron 20 pruebas tras las mutaciones (45 en total) en lugar de dejar los huecos anotados. |
| #46 | **A-05** el guardado del mundo persiste borrados y zonas | **Sí** | Se implementó lo que P-07 había dejado como «decisión del equipo». Duda: un diálogo que viene en el cuerpo pero cuyo objeto se borró **queda sin dueño** (no se borra); la alternativa es borrarlo. Zonas: ancho y alto mínimo 1, clave vacía `""`. |
| #47 | **A-07** el clon conserva peso, estado, versión de rúbrica y esquema de mundo | **Sí** (solo clones nuevos) | Se cerraron 4 de los 5 huecos que P-03 documentó. **`Rubric.is_default` sigue sin copiarse a propósito**: es una marca global y copiarla dejaría dos rúbricas predeterminadas. Se cambiaron **dos aserciones** de P-03 (la lista `KNOWN_GAPS` y la de `world_schema_version`), declarado en el registro. |
| #48 | **P-13** Observer `attempt_completed` | No | **Duda de fondo:** es un patrón «de libro» con un solo suscriptor. Se hizo porque el servicio del juego deja de importar `apps.progression` y el plan v1 lo asignaba a la sustentación 2. Síncrona y `send_robust`, dentro de la misma transacción, para no cambiar la semántica. |
| #49 | **L-01** contratos de Liskov por registro (136 pruebas) | No (solo pruebas) | El identificador «L-01» es nuevo (el catálogo usa P- y A-). Los contratos salen de lo documentado, no de lo que hoy hace cada implementación; no hay suite para `DoorRule` ni `CopySpec`. Ninguna implementación incumplía el contrato. |
| #50 | **Documentación**: informe de antipatrones y SOLID, patrones existentes y descartados, evidencia de Git (script) y este documento | No | El documento dice sin adornos que la autoría de los cuatro integrantes **no** está reflejada en Git y que P-11 y P-15 a P-20 no se hicieron. Contiene la punta de la pila (unida con un merge commit) para describirla completa. |
| #51 | **A-08** tres imports sin uso y una copia exacta | No | Antes de tocar se escribió la prueba que compara las dos vistas. No se tocaron los imports «sin uso» de pruebas marcados con `# noqa: F401` (re-exportan fixtures). |
| #52 | **A-05b** el editor adopta los ids reales tras guardar | **Sí**, acotado (frontend) | Sin esto A-05 deja filas que cambian de id en cada autoguardado. Duda: toca el camino del autoguardado; lo cubren 6 pruebas del store, las 115 del editor, la suite completa y, desde #54, un e2e en el navegador. Solo adopta `id` y `mapObjectId`, por clave. |
| #53 | **A-09** un temporizador sin dueño hacía fallar el CI | No | El job de frontend de #51 (que no toca el frontend) falló con las 2376 pruebas en verde; se re-ejecutó una vez para comprobar la hipótesis (pasó) y se arregló la causa en su rama. Se editaron **7 specs** (solo su `afterEach`) y tres líneas del componente (un campo, una asignación y un elemento en `ngOnDestroy`); ninguna aserción. No se silenció el error. |
| #54 | **A-05c** el editor de mundo, probado en el navegador contra la base real | No (solo una prueba e2e nueva) | Se agregó porque la duda de #52 era no tener e2e del editor (cubre objetos, diálogo, borrado y zonas de colisión). La misma prueba sobre el código original, sobre A-05 solo y sobre la punta: **el original (también `master`) le quita tres objetos a la versión publicada del caso demo (41 → 38)**; A-05 sin A-05b recrea lo nuevo con otro id en cada autoguardado; la punta pasa. Duda: es una prueba con autoguardado diferido y con arrastre del ratón; si resulta intermitente en el CI, se descarta (es el último de la pila; #50 lo contiene por la unión de la punta). |

Además: `tools/codeshot.py` ganó ancho de numeración para números de línea de cuatro cifras (las capturas del «antes»
de P-05b salían cortadas).

## Lo que se verificó en la punta de la pila (`adsi/a09-timer-teardown`, más #54 encima)

- Backend: **855** pruebas en verde y `manage.py check` limpio.
- Frontend: **2383** pruebas en 179 archivos; `ng build` correcto.
- Corrida local completa de extremo a extremo (sobre `adsi/a09-timer-teardown`): matriz API **16/16**; Playwright
  **33 en verde y 1 omitida** a propósito por el propio spec (`guided-first-minute`, variante táctil 844x390). Incluye
  cuatro recorridos del caso completo (escritorio 1600 y 1366, móvil 390 y 412) y los de salida segura.
- El e2e del editor (#54): pasa sobre la punta en todas las corridas completas (y en el job E2E del CI) y falla en
  el punto esperado sobre el código original —incluido `master`— y sobre A-05 sin A-05b (ver la entrada A-05c).
- CI de GitHub (consultado sin sondeo): los 30 PR hacia `adsi/integracion` con las seis comprobaciones en verde antes
  de fusionar. #51 falló una vez por la intermitencia que A-09 corrige y pasó al re-ejecutarse con el mismo código.
- Tras fusionar los 29 PR (#24 a #54), el árbol de `adsi/integracion` es idéntico al de `adsi/a05c-editor-e2e`.

## Lo que NO se hizo, y por qué

| Pendiente | Por qué no |
|---|---|
| **P-11** Strategy de finales | Con un solo caso sería código para un futuro hipotético, y antes hay que decidir qué final tienen los demás casos. Hallazgo: `compute_ending` aplica las reglas y los textos del caso del PDF a cualquier caso; uno distinto solo puede terminar en «Riesgo Persistente» o, con dos decisiones críticas, en «Crítico», y nunca en «Integral» ni «Con brechas». |
| **P-15 a P-20** (State del componente de juego, Mediator, Memento, Abstract Factory, Factory Method, Chain/Command) | Riesgo alto: los contract-specs leen el texto fuente y habría que reescribirlos antes; no hay pase visual. Los patrones de cada unidad de la materia ya tienen su aplicación (ver `PATRONES_EXISTENTES_Y_DESCARTADOS.md`). |
| Contraseña por defecto de los importados | Seguridad: el riesgo de fondo (la misma contraseña para todos) es de diseño; A-06 solo la movió a configuración. |
| `requests` en `requirements.txt` | Cambio de dependencias: hoy el inicio de sesión con Google siempre responde «proveedor no instalado». |
| Hallazgos de robustez (`create_object`/`create_tool` → 500 sin campos NOT NULL; `update_dialogue` sin `lines` borra líneas; `create_case` sin auditoría; `get_completion_report` de un intento pausado; `patrol` empieza en el punto 1; `create_dialogue`, `create_object` y `save_world` buscan `mapObjectId`/`decisionOptionId` sin acotar a la versión, solo por API directa) | Cada uno cambia comportamiento y no hay una referencia clara de lo que se espera; quedan escritos en el registro. |
| Autoría de los cuatro integrantes en Git | Depende de que cada dueño de rama revise, apruebe o commitee desde su cuenta. |

## Cómo descartar una decisión (ya fusionadas)

Todo está fusionado en `adsi/integracion` con un *merge commit* por PR; el árbol de `adsi/integracion` es idéntico al
de `adsi/a05c-editor-e2e`. Para deshacer una decisión se revierte su fusión, sin `--force`:

| Decisión | Comando |
|---|---|
| A-05 (guardado del mundo) | `git revert -m 1 e3b849f` |
| A-07 (el clon conserva peso y estado) | `git revert -m 1 af80144` |
| P-13 (Observer) | `git revert -m 1 2767d7d` |
| A-05b (el editor adopta ids reales) | `git revert -m 1 3c3585e` |
| A-05c (e2e del editor) | `git revert -m 1 cc1d128` |

- Cada fusión agregó su entrada al final de `CAMBIOS_ADSI.md`, así que revertir una de en medio pedirá resolver ese
  archivo a mano (conservar la entrada o quitarla); el código y las pruebas no deberían chocar salvo que un cambio
  posterior haya tocado las mismas líneas.
- A-05b completa a A-05: si se revierte A-05b y se conserva A-05, cada autoguardado de un objeto nuevo lo recrea con
  otro id (sin duplicados). Revertir A-05 devuelve el defecto original (el guardado se lleva objetos de otros casos).
- La lista completa de fusiones y sus commits está en `EVIDENCIA_GIT.md`.

## Qué mirar primero si algo se revierte (de mayor a menor riesgo)

1. **#46 A-05**: cambia qué borra el guardado del mundo (borra los objetos y zonas que el cliente ya no manda). **No
   es opcional en la práctica:** el código original, al agregar objetos a un caso nuevo, le quita objetos a otro
   caso, incluso a uno publicado (medido en #54, también sobre `master`: el defecto está vivo ahí).
2. **#52 A-05b**: autoguardado del editor; ya tiene e2e (#54), pero una edición durante la petición no tiene prueba.
3. **#47 A-07**: cambia lo que copia una versión nueva; las rúbricas ya clonadas no se corrigen.
4. **#48 P-13**: la duda es de diseño, no de riesgo. Queda fusionado y anotado como «a decidir» (un único
   suscriptor); si más adelante aparece un segundo suscriptor, la duda se resuelve sola.
