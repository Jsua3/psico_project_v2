# GAME-DOOR-ENTRY-01 — entrada canónica de puertas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evitar que el cliente decida la posición de destino al cruzar una puerta; el backend debe usar únicamente `entryX` y `entryY` autorados en los metadatos de la puerta validada.

**Architecture:** `_validate_door` devolverá los metadatos de la puerta canónica una vez validados destino, proximidad y requisitos. `enter_room` extraerá de ese objeto las coordenadas de entrada y rechazará metadatos incompletos. El endpoint y Angular conservarán `targetNodeKey` y `doorKey`, pero eliminarán `entryX`/`entryY` del contrato cliente-servidor.

**Tech Stack:** Django/DRF + pytest, Angular HttpClient + Jest, Playwright E2E aislado.

---

### Task 1: Contrato backend que ignora coordenadas del cliente

**Files:**

- Modify: `backend_django/apps/simulation/services/world_service.py`
- Modify: `backend_django/apps/simulation/tests/test_world.py`
- Modify: `backend_django/apps/simulation/tests/test_world_authority.py`
- Modify: `backend_django/apps/simulation/tests/test_caso_pdf.py`

- [ ] **Step 1: Escribir regresión roja**

En `test_world.py`, entrar por `puerta-sala-escucha` tras cumplir `familia-crisis`, enviando deliberadamente `entryX: 99999` y `entryY: -50`. La respuesta debe ser 200 y la posición debe ser el destino autorado `(160, 452)`, no una coordenada clampada del cliente. Añadir el caso equivalente sin `entryX`/`entryY`, que debe seguir devolviendo `(160, 452)`.

```python
resp = c.post(DOOR.format(attempt_id), {
    "attemptToken": token,
    "targetNodeKey": "hospital-sala-escucha",
    "doorKey": "puerta-sala-escucha",
    "entryX": 99999,
    "entryY": -50,
}, format="json")
assert resp.status_code == 200
assert resp.data["data"]["player"] == {"x": 160, "y": 452}
```

- [ ] **Step 2: Ejecutar rojo**

Run: `npm run test:backend -- apps/simulation/tests/test_world.py apps/simulation/tests/test_world_authority.py apps/simulation/tests/test_caso_pdf.py -q`

Expected: FAIL porque `enter_room` clampa los campos enviados por cliente.

- [ ] **Step 3: Implementar entrada autorada**

Cambiar la firma a:

```python
def enter_room(attempt_id, attempt_token, target_node_key, actor, door_key=None):
```

Hacer que `_validate_door(...)` retorne `meta` tras validar sus requisitos. Añadir un helper que acepte solamente enteros finitos autorados y falle cerrado:

```python
def _door_entry(meta, target):
    try:
        entry_x = int(meta["entryX"])
        entry_y = int(meta["entryY"])
    except (KeyError, TypeError, ValueError):
        raise ValidationError("La puerta no tiene una entrada autorada válida")
    return (_clamp(entry_x, 0, target.width or 960), _clamp(entry_y, 0, target.height or 540))
```

Usar solo ese resultado para `state.player_x` y `state.player_y`. Actualizar los tests existentes para que no dependan de coordenadas enviadas por cliente; conservar uno que las envíe manipuladas como regresión.

- [ ] **Step 4: Verificar verde**

Run: `npm run test:backend -- apps/simulation/tests/test_world.py apps/simulation/tests/test_world_authority.py apps/simulation/tests/test_caso_pdf.py -q`

Expected: PASS; una entrada manipulada no modifica el spawn de destino.

- [ ] **Step 5: Commit**

```powershell
git add backend_django/apps/simulation/services/world_service.py backend_django/apps/simulation/tests/test_world.py backend_django/apps/simulation/tests/test_world_authority.py backend_django/apps/simulation/tests/test_caso_pdf.py
git commit -m "fix(game): derivar entrada de puerta en backend"
```

### Task 2: Eliminar las coordenadas del contrato Angular

**Files:**

- Modify: `frontend/src/app/core/api/simulation.service.ts`
- Modify: `frontend/src/app/core/api/simulation.service.spec.ts`
- Modify: `frontend/src/app/features/simulator/simulation-play.component.ts`

- [ ] **Step 1: Escribir prueba roja de request**

En `simulation.service.spec.ts`, comprobar que `enterRoom('attempt-1', 'token', 'hospital-sala-escucha', 'puerta-sala-escucha')` hace POST con exactamente `attemptToken`, `targetNodeKey` y `doorKey`, sin `entryX` ni `entryY`.

- [ ] **Step 2: Ejecutar rojo**

Run: `npm test --prefix frontend -- --runInBand src/app/core/api/simulation.service.spec.ts`

Expected: FAIL porque el servicio exige y serializa coordenadas del cliente.

- [ ] **Step 3: Implementar contrato mínimo**

Cambiar el servicio a:

```ts
enterRoom(attemptId: string, attemptToken: string, targetNodeKey: string, doorKey: string) {
  return this.http.post<ApiResponse<SimulationWorldState>>(`${this.API}/attempts/${attemptId}/enter-room`, {
    attemptToken, targetNodeKey, doorKey,
  }).pipe(map(response => response.data));
}
```

En `SimulationPlayComponent`, eliminar `entryX`/`entryY` de `meta` y llamar `enterRoom(game.attemptId, game.attemptToken, target, door.key)`. Los eventos Phaser `enterRoom` pueden seguir incluyendo coordenadas para transiciones visuales, pero no se serializan hacia la API.

- [ ] **Step 4: Verificar verde**

Run: `npm test --prefix frontend -- --runInBand src/app/core/api/simulation.service.spec.ts`

Run: `npm run build:frontend`

Expected: PASS y build limpio.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/app/core/api/simulation.service.ts frontend/src/app/core/api/simulation.service.spec.ts frontend/src/app/features/simulator/simulation-play.component.ts
git commit -m "fix(game): no enviar entradas de puerta desde cliente"
```

### Task 3: Gate integrado y evidencia

**Files:**

- Modify: `docs/audits/2026-07-11-calidad-9-10-evidencia.md`

- [ ] **Step 1: Ejecutar gates**

Run:

```powershell
npm run test:backend -- apps/simulation/tests/test_world.py apps/simulation/tests/test_world_authority.py apps/simulation/tests/test_caso_pdf.py -q
npm run test:frontend
npm run test:e2e
```

Expected: todos verdes; el E2E aislado conserva el recorrido de entrada de caso y world.

- [ ] **Step 2: Documentar límite y evidencia**

Registrar que la posición de entrada es servidor-autoritativa y que los valores enviados por cliente se ignoran. Mantener explícito que la validación de hitbox de jugador completo y la paridad Tiled/backend son trabajos distintos, aún pendientes.

- [ ] **Step 3: Commit**

```powershell
git add docs/audits/2026-07-11-calidad-9-10-evidencia.md
git commit -m "docs(audit): registrar puerta con entrada autoritativa"
```

## Revisión del plan

- El plan cierra una sola fuente de autoridad: el spawn al cruzar una puerta.
- `doorKey` y `targetNodeKey` siguen siendo validados contra el mapa actual y no se amplía la superficie de datos clínicos.
- La prueba manipulada demuestra el riesgo original y la prueba sin coordenadas confirma el contrato nuevo.
