# Contraste de la línea base PN3 con SIEP

Mide, ítem por ítem, qué tanto cumple el sistema la **línea base académica unificada** de la carrera ([`../baseline-pn3/`](../baseline-pn3): 26 RF, 8 RNF, 11 RN y 15 CU, «versión académica inicial») y qué requisitos y reglas propios tiene SIEP además de ella. La línea base es lo **mínimo obligatorio**; SIEP es más amplio.

- **Evaluación:** 2026-10-10 sobre el código de `master` (5ad59d1). **Redacción:** 2026-10-11.
- **Fuente de la línea base:** `RequisitosPN3.xlsx`, SHA-256 `49EC11A1046B263C1E7D47A40D55E601261A7D65E9CC4C25CBA68F33ACE260BE` (el mismo del original entregado por la carrera).
- **Alcance:** lectura de código y documentos; no se ejecutó ninguna prueba ni servidor.

## Resultado en una mirada

| Tipo | Cumple | Parcial | No cumple | Conflicto | No verificable | Total |
|---|---:|---:|---:|---:|---:|---:|
| Requisitos funcionales (RF) | 6 | 18 | 1 | 1 | 0 | 26 |
| Requisitos no funcionales (RNF) | 1 | 5 | 0 | 0 | 2 | 8 |
| Reglas de negocio (RN) | 3 | 4 | 0 | 4 | 0 | 11 |
| Casos de uso (CU) | 4 | 11 | 0 | 0 | 0 | 15 |
| **Total** | **14** | **38** | **1** | **5** | **2** | **60** |

Los cinco conflictos: **RF-15** (el lobby muestra casos no habilitados), **RN-07** (`forceNew` permite iniciar otro intento con uno en curso), **RN-08** (la retroalimentación pedagógica llega en el momento, no al terminar), **RN-09** (el total de rúbrica 1.0–5.0 es una calificación numérica) y **RN-10** (el docente crea cuentas por importación). Fuera de la línea base, el contraste dejó cinco defectos verificados (alcance por docente en reportes, dashboard y `student-report`; el guardado de un nodo vacía datos; credenciales demo y contraseña por defecto en claro): ver [`conflictos-y-decisiones.md`](conflictos-y-decisiones.md) §3.

## Qué hay en la carpeta

| Archivo | Para qué sirve |
|---|---|
| [`matriz-cumplimiento.md`](matriz-cumplimiento.md) | Resumen y una tabla por tipo: veredicto, verificación, evidencia principal, brecha, esfuerzo y si toca el esquema |
| [`detalle-por-requisito.md`](detalle-por-requisito.md) | Por ID: texto base, cláusulas con su evidencia `ruta:línea`, brecha, acción mínima, decisión requerida, terminología, pruebas y revisiones |
| [`conflictos-y-decisiones.md`](conflictos-y-decisiones.md) | Los 5 conflictos con opciones y recomendación, brechas en orden de ejecución, defectos hallados, 21 decisiones con valor por defecto y lo no verificable |
| [`glosario.md`](glosario.md) | Palabra de la línea base ↔ concepto de SIEP ↔ dónde vive, y las diferencias de vocabulario que confunden |
| [`extensiones-siep.md`](extensiones-siep.md) | Esquema de IDs propios (`SIEP-*`), catálogo candidato de lo que SIEP tiene más allá de la línea base, tabla de equivalencias con los IDs antiguos del equipo y ubicación de las propuestas C, E, F, G y J |
| [`decisiones-por-defecto.md`](decisiones-por-defecto.md) | Registro de lo que se decidió por defecto durante este trabajo, para que lo revise el usuario |
| `datos/` | Veredictos de cada evaluador y de cada lente de contraste (JSON), resoluciones y `veredictos.json` consolidado |
| `herramientas/` | `generar_matriz.py` (regenera la matriz y el detalle) y `verificar_citas.py` (comprueba que cada `ruta:línea` exista) |

## Método

1. Cada requisito se descompone en **cláusulas** (quién, qué, cuándo, restricción) y cada una recibe un veredicto con evidencia `ruta:línea`. El del ítem sale de ellas: *cumple* (todas las esenciales), *parcial* (al menos una sí y una no), *no cumple* (ninguna), *conflicto* (el sistema contradice una cláusula) o *no verificable* (no se decide leyendo código).
2. **Verificación adversarial:** todo «cumple» y todo «conflicto» pasa por dos lentes opuestos (*falso cumple*: ¿es demasiado generoso?; *falso incumple*: ¿es demasiado severo?). Los desacuerdos se resuelven leyendo el código y la resolución queda escrita en `datos/resoluciones.json`.
3. **Citas:** `verificar_citas.py` comprueba que cada `ruta:línea` exista y caiga dentro del archivo. Última corrida: 991 citas únicas, 0 sin archivo y 0 fuera de rango (15 rutas abreviadas se resuelven por sufijo único; 1 es de una biblioteca externa).

## Procedencia

- Agentes: `claude-sonnet-5-5` (evaluadores y lente «falso cumple») y `claude-haiku-5-5` (lente «falso incumple»).
- Los veredictos de 9 de los 10 grupos de evaluación se **recuperaron** de una corrida anterior abortada por límite de uso, porque el código evaluado es idéntico al de `master` en `backend_django/`, `frontend/src/` y `deploy/`. El grupo de autoría (RF-05..RF-11, CU-04, RN-02, RN-11) se evaluó de nuevo. El contraste de los lentes se hizo en esta corrida.
- Dos rutas de evidencia de `datos/evaluadores/g10-rnf-b.json` se corrigieron a mano: una apuntaba al volcado temporal del Excel (ahora es la tabla Markdown de la línea base) y un límite de línea estaba desfasado en una unidad.

## Regenerar

Desde `docs/requisitos/contraste-pn3/herramientas/`:

```bash
python -I generar_matriz.py --datos ../datos --base ../../baseline-pn3 --salida .. --fecha AAAA-MM-DD
python -I verificar_citas.py --veredictos ../datos/veredictos.json --raiz ../../../..
```

Para cambiar un veredicto se añade una entrada en `datos/resoluciones.json` (`{"RF-15": {"veredicto": "...", "nota": "..."}}`) y se regenera; la matriz no se edita a mano. Si cambia el Excel de la línea base, se regenera primero `../baseline-pn3/` (ver `docs/informes/2026-10-10-mapa-del-sistema/herramientas/xlsx_dump.py`).

## Relación con otros trabajos

- **Taller de DSL** (Ingeniería de Software II): `docs/diseno/dsl/`, a cargo de otra sesión y de Juan José Sua y Emerson Ángel Gómez (fases 1, 3 y 4) y Esteban Bonilla y Santiago Leyton (fase 2, OCL). Este contraste lo cita (RF-12, RN-05, RNF-07) pero no lo edita.
- **Propuestas C, E, F, G y J**: su ubicación frente a la línea base está en `extensiones-siep.md` §D; el desarrollo como requisitos formales va en `../propuestas/`.
