# Patrones que SIEP ya tenía, patrones aplicados y patrones evaluados y descartados

Material para la sección de análisis de patrones (Unidad 5: «identificar los patrones implementados y decidir si se
utilizan sus ventajas») y para la de patrones descartados. El principio rector del plan es que **no se fuerzan los
23 patrones**: lo que no encaja se documenta con su razón, y eso también cuenta como análisis. Las referencias a
archivos se comprobaron contra el código del 10 de octubre de 2026.

---

## 1. Patrones que el proyecto ya usaba (no se tocaron)

| Patrón | Dónde | Evidencia |
|---|---|---|
| **Command** (con deshacer/rehacer) | `frontend/.../world-editor/world-editor.store.ts` | interfaz `EditorCommand` y 15 clases (13 comandos simples, `MacroCommand` y `DeleteObjectWithDialogueCommand`, estos dos de P-07); la pila de deshacer vive en el store |
| **Strategy con registro** | `frontend/.../simulator/scene-renderer.registry.ts` | `resolveSceneRenderer(mapKey)` elige el renderer de la sala entre los registrados; el juego no sabe cuál es |
| **Decorator** | `backend_django/apps/simulation/services/audit_service.py` (`@auditable`) | se aplica a las 22 operaciones de autoría y a 5 del servicio del juego; el registro se escribe después de la operación y sus errores no llegan a quien llama (REGLA-006) |
| **Observer** | `frontend/.../world-editor.store.ts` (RxJS: `Subject` + `debounceTime` del autoguardado) | y, desde P-13, la señal `attempt_completed` en el backend |
| **Singleton** | servicios `providedIn: 'root'` de Angular (17 archivos) y `settings` de Django | idiomático; un Singleton manual sería ruido |
| **Adapter** | `SimulationService` desenvuelve el sobre `ApiResponse`; `crypto_service`; los *callbacks* Phaser → Angular del mundo | |
| **Facade** | los módulos `*_service.py` del backend | de forma implícita; **P-05b** la hizo explícita en autoría |

## 2. Patrones aplicados en este trabajo

| Unidad | Patrón | Cambio | Dónde |
|---|---|---|---|
| 2 · Creacionales | Factory Method | P-01 | `create_provider` / `provider_class` en `ai_providers.py` |
| | Builder | P-04 | `build_completion_report` |
| | Prototype (declarativo) | P-03, A-07 | `case_cloning.py` |
| 2 · Estructurales | Adapter | P-01 | un adaptador por API de IA |
| | Facade | P-05b | `authoring_service.py` |
| | Proxy (caché) | P-06 | lista de casos publicados |
| | Composite | P-07 | `MacroCommand` |
| 3 · Comportamiento | Strategy | P-01, P-10 | proveedores de IA; destino de cada movimiento |
| | Chain of Responsibility | P-08a, P-08b | puertas del mundo; errores HTTP del interceptor |
| | Iterator | P-09 | recorrido del mapa de progreso |
| | Command | P-07 | `SetZoneLabelCommand` |
| | State (liviano) | P-12 | ciclo de vida del intento |
| | Template Method | P-14b | `CaseRoom.render` |
| | Observer | P-13 | `attempt_completed` |
| 6 · SOLID | ISP | P-05 | APIs por rol |
| | LSP | L-01 | suites de contrato por registro |

## 3. Evaluados y NO aplicados (con la razón)

| Patrón / cambio | Veredicto | Razón |
|---|---|---|
| **Singleton** (manual) | No aplicar | ya existe de forma idiomática (`providedIn: 'root'`, `settings`); uno manual sería ruido |
| **Bridge** | No aplicar | no hay dos dimensiones que varíen de forma independiente hoy |
| **Visitor** | No aplicar | no hay una jerarquía de elementos sobre la que sumar operaciones |
| **Interpreter** | No aplicar | no hay un lenguaje ni una gramática en el dominio |
| **Flyweight** | Ya presente en parte | las texturas compuestas de avatar se crean una vez por preset |
| **P-02 · Factory de parsers de importación** | Retirado | el frontend ni el serializador ofrecen CSV: el error estaba en el README; un Factory con un solo formato es especulativo |
| **P-08 sobre las filas de importación** | Descartado | una cadena que corta en el primer error cambiaría el contrato (hoy acumula errores por fila) |
| **P-09 sobre `_detect_cycle`** | Descartado | arreglar su recursión es un cambio de comportamiento |
| **P-11 · Strategy de finales** | **No hecho** | con un solo caso es código para un futuro hipotético, y antes habría que decidir qué final tienen los demás casos: es una decisión de producto |
| **P-14 original** (Template Method sobre `renderHospitalEnvironment`) | Retirado | era código muerto; se sustituyó por P-14b sobre los renderers que sí se usan |
| **P-15 · State en `SimulationPlayComponent`** | No hecho | el cambio con más valor conceptual y el más riesgoso: 55 archivos de prueba leen el código fuente como texto (FASE0 §3.4) y habría que reescribirlos primero |
| **P-16 · Mediator** (puente Phaser ↔ Angular) | No hecho | rompe los `game-world.*.contract.spec` |
| **P-17 · Memento** (`localStorage`) | No hecho | valor moderado; el backend ya es la fuente de verdad del intento |
| **P-18 · Abstract Factory** (familia por mapa) | No hecho | toca más de 20 archivos con `isHospitalMap/isComisariaMap` |
| **P-19 · Factory Method** de marcadores | No hecho | mucho código visual con orden de prioridad |
| **P-20 · Chain/Command** de teclas | No hecho | depende de P-15 |

> **Nota sobre los «No hecho».** Quedan así por riesgo y por falta de red de seguridad, no porque se hayan
> descartado en principio: P-15 a P-20 son el trabajo que seguiría si el equipo quisiera cubrir Memento,
> Mediator y Abstract Factory en una tercera sustentación. El plan (§4.2) los marcó como opcionales «solo si el
> tiempo y el riesgo lo permiten».
