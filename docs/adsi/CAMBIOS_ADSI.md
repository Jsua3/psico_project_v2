# Registro de cambios — Análisis y diseño de sistemas (ADSI)

Registro vivo de lo que se cambia en SIEP para la materia, con su justificación y evidencia.
Cada entrada enlaza a un commit de la rama `adsi/integracion`. El «antes» de todas las
comparaciones es el tag `adsi-baseline` (= `master` en `f39ab96`).

- **Equipo:** Juan José Sua, Emerson Ángel Gómez, Santiago Leyton, Esteban Bonilla.
- **Criterio:** se aplica un patrón solo donde aporta, con su justificación; lo evaluado y descartado también queda documentado.
- **Regla previa a cualquier refactor:** pruebas de caracterización en verde sobre el código original.

## Fase 0 — Línea base y red de seguridad (5 oct 2026)

### Línea base (`adsi-baseline`, `f39ab96`)

| Suite | Resultado |
|---|---|
| Backend `pytest` | 307 pasan |
| Frontend `ng test` (Vitest) | 1809 pasan, tras corregir un spec que usaba `jest.fn()` |
| `npm run build` | OK |

Medido en un entorno equivalente (Python 3.12, PostgreSQL 16, Node 24), no en el de CI. La confirmación oficial es la del workflow de GitHub Actions sobre el PR.

### Pruebas añadidas (no cambian código de producción)

| Commit | Qué fija | Cambio que protege |
|---|---|---|
| `c490c95` | `journal-panel.component.spec.ts`: `jest.fn()` → `vi.fn()` (sin esto `ng test` no compila) | — |
| `3c9cbc4` | Asistente de IA: URL, cabeceras, cuerpo, proveedor, contexto y auditoría (39 tests) | P-01 Strategy / Adapter / Factory Method |
| `bfe85cf` | Reporte de cierre: forma, conteos, competencias, recomendaciones, resumen (31 tests) | P-04 Builder |
| `9d1ff6c` | Puertas: `requiresTools`, `requiresNpcs` y orden de las reglas (24); orden BFS del mapa de progreso (7) | P-08a Chain of Responsibility, P-09 Iterator |
| `d962444` | Interceptor JWT: cabecera, 401, 403, sin conexión, login (23) | P-08b Chain of Responsibility |
| `d705b83` | Contrato HTTP de los 50 métodos de `SimulationService` (61) | P-05 Facade / Interface Segregation |
| `8bb4203` | Editor de mundo: 12 comandos, pila, autoguardado y acciones del inspector (80) | P-07 Command / Composite |

Resultado tras añadirlas: backend 408 pasan (+101), frontend 1973 pasan en 153 archivos (+164). Cada archivo se comprobó rompiendo el código a propósito: las pruebas fallan, luego se restauró.

### Hallazgos documentados por las pruebas (comportamiento actual, aún sin corregir)

1. **El autoguardado del editor de mundo muere tras un error de guardado.** `catchError` está fuera del `switchMap` y devuelve `EMPTY`: el flujo se completa y los cambios siguientes no se guardan solos hasta recargar.
2. **Guardado bajo el nodo equivocado.** Si se recarga otro nodo con un guardado pendiente (debounce de 1500 ms), se envía el estado de la sala anterior con el `nodeId` nuevo.
3. **La etiqueta de una zona de colisión no se puede deshacer.** `updateZoneLabel` apila un comando vacío y escribe la etiqueta directo en el estado.
4. **Borrar un objeto deja huérfano su diálogo.**
5. **Deshacer un borrado repone el elemento al final de la lista** (cambia el orden de dibujo).

Los puntos 1–4 entran al informe de antipatrones y 3–4 se corrigen dentro de P-07.

### Descartado o reformulado tras leer el código

Ver `FASE0_EVALUACION.md` (catálogo v2): P-02, P-14 y el Chain sobre filas de importación se descartan; P-03, P-05, P-07, P-09, P-11 y P-13 cambian de forma.

## Actualización del 9 oct 2026 — `master` avanza a `dd4eb89`

`master` incorporó 78 commits desde la línea base (personajes unificados y escala del mundo; backend sin cambios). Se trae a `adsi/integracion` con un *merge* y se crea el tag `adsi-baseline-2` (= `dd4eb89`) como «antes» de los cambios que toquen archivos modificados por esa tanda.

| Suite | Resultado sobre `master` + pruebas ADSI |
|---|---|
| Backend `pytest` | 408 pasan |
| Frontend `ng test` | 2094 pasan en 167 archivos |
| `test:visual-assets`, `test:kit`, `kit:check`, `test:world-art`, `ng build` | OK |

Las 265 pruebas de caracterización siguen válidas sin modificarse. El análisis completo de qué cambia en el catálogo (P-10, A-02, A-03 y el candidato verificado de Template Method en `case-pdf-rooms.renderer.ts`) está en `FASE0_EVALUACION.md` §8.

## Fase 1 — Cambios (pendiente)

_Cada cambio se registra aquí con: patrón o antipatrón, archivos, motivo, riesgo, commit y capturas antes/después._
