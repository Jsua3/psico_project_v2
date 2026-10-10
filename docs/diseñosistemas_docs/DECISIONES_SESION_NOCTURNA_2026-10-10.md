# Decisiones de la sesión autónoma del 9 al 10 de octubre de 2026

**Para qué existe este documento.** El 9 de octubre (~23:07) se pidió a Claude trabajar «en todo el plan» sin
supervisión hasta las 8:00 del 10 de octubre y dejar claro, al final, qué hizo, en qué tuvo dudas y qué decidió por
su cuenta, para que el equipo diga si está de acuerdo. Esta es esa cuenta. No es un entregable de la materia: si el
equipo no la quiere en el repositorio, se borra este archivo y no cambia nada más.

## Reglas que se aplicaron

- Nada se fusionó en `adsi/integracion` ni en `master`. Sin `--force`, sin `--no-verify`.
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
| #52 | **A-05b** el editor adopta los ids reales tras guardar | **Sí**, acotado (frontend) | Sin esto A-05 deja filas que cambian de id en cada autoguardado. Duda: toca el camino del autoguardado y **no hay e2e del editor**; lo cubren 6 pruebas del store, las 115 del editor y la suite completa. Solo adopta `id` y `mapObjectId`, por clave. |
| #53 | **A-09** un temporizador sin dueño hacía fallar el CI | No | El job de frontend de #51 (que no toca el frontend) falló con las 2376 pruebas en verde; se re-ejecutó una vez para comprobar la hipótesis (pasó) y se arregló la causa en su rama. Se editaron **7 specs** (solo su `afterEach`) y tres líneas del componente (un campo, una asignación y un elemento en `ngOnDestroy`); ninguna aserción. No se silenció el error. |

Además: `tools/codeshot.py` ganó ancho de numeración para números de línea de cuatro cifras (las capturas del «antes»
de P-05b salían cortadas).

## Lo que se verificó en la punta de la pila (`adsi/a09-timer-teardown`)

- Backend: **855** pruebas en verde y `manage.py check` limpio.
- Frontend: **2383** pruebas en 179 archivos; `ng build` correcto.
- Corrida local completa de extremo a extremo: matriz API **16/16**; Playwright **33 en verde y 1 omitida** a propósito
  por el propio spec (`guided-first-minute`, variante táctil 844x390). Incluye cuatro recorridos del caso completo
  (escritorio 1600 y 1366, móvil 390 y 412) y los de salida segura.
- CI de GitHub (consultado una vez, sin sondeo): todos los PR de #24 a #49 y de #51 a #53 con las seis comprobaciones
  en verde; #50 corría de nuevo tras unirle la punta. #51 falló una vez por la intermitencia que A-09 corrige y
  pasó al re-ejecutarse con el mismo código.

## Lo que NO se hizo, y por qué

| Pendiente | Por qué no |
|---|---|
| **P-11** Strategy de finales | Con un solo caso sería código para un futuro hipotético, y antes hay que decidir qué final tienen los demás casos. Hallazgo: `compute_ending` aplica las reglas y los textos del caso del PDF a cualquier caso; uno distinto solo puede terminar en «Riesgo Persistente» o, con dos decisiones críticas, en «Crítico», y nunca en «Integral» ni «Con brechas». |
| **P-15 a P-20** (State del componente de juego, Mediator, Memento, Abstract Factory, Factory Method, Chain/Command) | Riesgo alto: los contract-specs leen el texto fuente y habría que reescribirlos antes; no hay pase visual. Los patrones de cada unidad de la materia ya tienen su aplicación (ver `PATRONES_EXISTENTES_Y_DESCARTADOS.md`). |
| Contraseña por defecto de los importados | Seguridad: el riesgo de fondo (la misma contraseña para todos) es de diseño; A-06 solo la movió a configuración. |
| `requests` en `requirements.txt` | Cambio de dependencias: hoy el inicio de sesión con Google siempre responde «proveedor no instalado». |
| Hallazgos de robustez (`create_object`/`create_tool` → 500 sin campos NOT NULL; `update_dialogue` sin `lines` borra líneas; `create_case` sin auditoría; `get_completion_report` de un intento pausado; `patrol` empieza en el punto 1) | Cada uno cambia comportamiento y no hay una referencia clara de lo que se espera; quedan escritos en el registro. |
| Autoría de los cuatro integrantes en Git | Depende de que cada dueño de rama revise, apruebe o commitee desde su cuenta. |

## Cómo descartar una decisión

La pila es **lineal**: cada rama contiene a la anterior (verificado con `git merge-base --is-ancestor`).

- **Después de fusionar** (con merge commit): `git revert -m 1 <commit de la fusión>`; sin `--force`.
- **Antes de fusionar**, un PR de en medio no se puede quitar sin que cambien los siguientes: hay que reconstruir las
  ramas posteriores sobre la anterior, con ramas nuevas. Es trabajo mecánico y se puede pedir.
- A-05b completa a A-05: si se descarta A-05b y se conserva A-05, cada autoguardado de un objeto nuevo lo recrea con
  otro id (sin duplicados).

## Qué revisar primero (de mayor a menor riesgo)

1. **#46 A-05**: cambia qué borra el guardado del mundo (borra los objetos y zonas que el cliente ya no manda).
2. **#52 A-05b**: autoguardado del editor sin e2e propio; una edición durante la petición no tiene prueba.
3. **#47 A-07**: cambia lo que copia una versión nueva; las rúbricas ya clonadas no se corrigen.
4. **#48 P-13**: la duda es de diseño, no de riesgo.
