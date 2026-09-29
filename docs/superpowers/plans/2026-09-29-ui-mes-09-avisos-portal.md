# 09 — Avisos de error y éxito en el portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `02bbfe9` (rama `feat/ui-mes`, que sale de `feat/ui-semana` e incluye los arreglos de movimiento del PR #10)
- **Severidad:** ALTA (acciones que fallan o terminan sin que el usuario se entere)
- **Categoría:** Usabilidad / feedback
- **Alcance estimado:** 1 util nuevo, 2 archivos de infraestructura, 4 pantallas; 4 specs nuevos

**Goal:** Que toda acción del portal (guardar, publicar, clonar, eliminar, asignar) le diga al usuario si funcionó o por qué falló, con avisos accesibles que no se pierden detrás de los diálogos ni desaparecen mientras se leen.

**Architecture:** Ya existe `NotificationService` (lista de avisos con cierre automático) y `NotificationHostComponent`, pero casi ninguna pantalla los usa. El editor de casos descarta el error en 12 acciones. En Usuarios, el mensaje de éxito se borra en el mismo instante en que aparece. En Grupos se usa `window.confirm` y los mensajes salen en lugares que no se ven. El plan hace tres cosas:
1. Mejora la infraestructura: los errores no se cierran solos, los avisos se pausan con el cursor o el foco, tienen `role` por tipo, van por encima de los diálogos y no tapan el botón de cerrar sesión.
2. Crea `apiErrorMessage()`, que extrae el mensaje del backend y no duplica los avisos que ya muestra el interceptor (sin conexión, 401 y 403).
3. Conecta las cuatro pantallas.

**Tech Stack:** Angular 21 (signals, RxJS), Jest 30.

**Spec:** Auditoría del 2026-09-29, problema de fondo 3 («La interfaz no avisa lo que pasa») y tabla «Portal docente y administrativo». Prioridad del mes n.º 9. Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias.
- No cambiar la API de `NotificationService` de forma incompatible: `success`, `error`, `warning`, `info`, `show`, `dismiss`, `clear` y `messages$` siguen existiendo con la misma firma. `auth.guard.ts`, `jwt.interceptor.ts` y `character-editor.component.ts` ya la usan.
- Los errores de validación del cliente (campos) siguen en línea, junto al formulario; solo los resultados de acciones contra el servidor van a los avisos. La validación al enviar es el plan 10.
- No tocar `frontend/src/app/features/simulator/game-world.component.ts`, `player-motion.util.ts` ni su spec.
- Si un fragmento «Actual» no coincide con el archivo (drift), DETENERSE y reportar.
- Textos visibles en español con tildes. Commits en español `tipo(ámbito): descripción`.

## Review Focus

- Un error del servidor al guardar en el editor de casos muestra un aviso rojo con el mensaje del backend, y el aviso no se cierra solo.
- Sin conexión, aparece un único aviso (el del interceptor), no dos.
- Un aviso abierto mientras hay un diálogo de confirmación queda visible por encima del fondo oscuro.
- Mientras el cursor está sobre un aviso, o el foco está en su botón de cerrar, el aviso no desaparece.
- Un lector de pantalla anuncia los errores de inmediato (`role="alert"`) y el resto con cortesía (`role="status"`), sin duplicar el anuncio.

## Problema

`frontend/src/app/core/notifications/notification.service.ts` (actual): cada aviso se cierra a los 5000 ms con un `setTimeout` que no se puede pausar, y `error()` también se cierra solo.

```ts
  show(type: NotificationType, text: string, autoCloseMs = 5000): void {
    const message: NotificationMessage = { id: this.nextId++, type, text };
    this.messagesSubject.next([...this.messagesSubject.value, message]);

    if (autoCloseMs > 0) {
      setTimeout(() => this.dismiss(message.id), autoCloseMs);
    }
  }
```

`frontend/src/app/shared/notifications/notification-host.component.ts` (actual): un solo `aria-live="polite"` para todo, incluidos los errores, y un botón «x» de 28×28.

`frontend/src/styles/styles.scss` (`.siep-notifications`, ~línea 235): `top: 16px; right: 16px; z-index: 400;`. Queda debajo del diálogo de confirmación (`z-index: 1200`, `confirm-dialog.component.ts`) y tapa el botón de cerrar sesión del topbar.

`frontend/src/app/features/simulator/case-editor.component.ts`: doce llamadas terminan en `error: () => this.busy.set(false)` (en `saveNode`, `saveDecision`, `saveMap`, `saveObject`, `saveTool`, `saveChecklist`, los cuatro `confirmDelete*`, `publish` y `clone`). No hay mensaje de éxito, y «Publicar» (línea ~58) no pide confirmación. El diálogo tiene `confirmLabel="Eliminar"` fijo (línea ~531).

`frontend/src/app/features/admin/users.component.ts`:
- `save()` fija `this.message.set(...)` y enseguida llama a `this.editUser(saved)`, que ejecuta `this.message.set('')`.
- Si falla `confirmToggleStatus()`, el diálogo queda abierto con el error detrás.

`frontend/src/app/features/grupos/grupo-list.component.ts`:
- `eliminarGrupo` y `quitarEstudiante` usan `window.confirm` (líneas ~718 y ~733).
- Crear, editar y borrar un grupo no confirman el éxito.
- `copiarCodigo`, `asignarCaso` y `quitarCaso` escriben en `mensajeEstudiante`, que solo se ve dentro del detalle o del formulario de agregar estudiante.

`frontend/src/app/features/admin/rubrics.component.ts`: los resultados de guardar, asignar y activar se escriben en un banner arriba de la página (`message`, líneas ~327-424), lejos del botón pulsado.

## Objetivo

- `NotificationService`:
  - Éxito e información se cierran a los 5 s; las advertencias a los 8 s; los errores no se cierran solos.
  - Se pausan con `pause(id)` y `resume(id)`.
  - Como máximo quedan 4 avisos a la vez; al llegar el quinto se quita el más antiguo.
- Host:
  - `role="alert"` para los errores y `role="status"` para el resto.
  - Pausa con `mouseenter`/`focusin` y reanuda con `mouseleave`/`focusout`.
  - Botón de cierre de 44×44 con ícono `close`.
- Estilos:
  - Los avisos van abajo a la derecha, con `z-index: 1300`.
  - Entran con opacidad y 8 px de desplazamiento en 200 ms (`@starting-style`).
- `apiErrorMessage(err, fallback)`:
  - Devuelve el `message` del backend, luego `detail`, y si no hay ninguno el texto de respaldo.
  - Devuelve `null` si el interceptor ya avisó (estado 0, 401, 403 o un error que no es HTTP).
- Pantallas:
  - Cada acción contra el servidor termina en un aviso de éxito o de error.
  - Publicar pide confirmación.
  - Los `window.confirm` pasan a `app-confirm-dialog`.

## Convenciones del repo

- Diálogo de confirmación: patrón de `users.component.ts` (signal `statusConfirmTarget` y `<app-confirm-dialog [open] … (cancel) (confirm)>`), componente en `frontend/src/app/shared/confirm/confirm-dialog.component.ts` (inputs `open`, `title`, `message`, `confirmLabel`, `loading`).
- Token de curva: `--psy-ease-out: cubic-bezier(0.23, 1, 0.32, 1);` en `frontend/src/styles/styles.scss`.
- Specs de componente con TestBed: `frontend/src/app/shared/confirm/confirm-dialog.component.spec.ts`. Para pasar inputs signal se usa el helper `writeInputSignal` de ese spec, porque `setInput` no funciona con este ts-jest.
- Jest: `npm test --prefix frontend -- --runInBand <ruta>`.

---

### Task 1: Servicio de avisos con pausa, persistencia de errores y tope

**Files:**
- Modify: `frontend/src/app/core/notifications/notification.service.ts`
- Create: `frontend/src/app/core/notifications/notification.service.spec.ts`

**Interfaces:**
- Produces: `NotificationService.pause(id: number): void`, `NotificationService.resume(id: number): void`, `MAX_NOTIFICATIONS = 4`. `show(type, text, autoCloseMs?)`: si no se pasa `autoCloseMs`, se usa el valor por tipo: success/info 5000, warning 8000, error 0 (no se cierra solo).

- [ ] **Step 1: Escribir las pruebas**

```ts
import { firstValueFrom } from 'rxjs';

import { MAX_NOTIFICATIONS, NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new NotificationService();
  });

  afterEach(() => jest.useRealTimers());

  async function texts(): Promise<string[]> {
    return (await firstValueFrom(service.messages$)).map(m => m.text);
  }

  it('los avisos de éxito se cierran a los 5 s', async () => {
    service.success('Guardado');
    jest.advanceTimersByTime(4999);
    expect(await texts()).toEqual(['Guardado']);
    jest.advanceTimersByTime(1);
    expect(await texts()).toEqual([]);
  });

  it('las advertencias duran 8 s', async () => {
    service.warning('Cuidado');
    jest.advanceTimersByTime(7999);
    expect(await texts()).toEqual(['Cuidado']);
    jest.advanceTimersByTime(1);
    expect(await texts()).toEqual([]);
  });

  it('los errores no se cierran solos', async () => {
    service.error('Falló');
    jest.advanceTimersByTime(60_000);
    expect(await texts()).toEqual(['Falló']);
  });

  it('pausar conserva el tiempo restante y reanudar lo retoma', async () => {
    service.success('Guardado');
    const [{ id }] = await firstValueFrom(service.messages$);
    jest.advanceTimersByTime(3000);
    service.pause(id);
    jest.advanceTimersByTime(10_000);
    expect(await texts()).toEqual(['Guardado']);
    service.resume(id);
    jest.advanceTimersByTime(1999);
    expect(await texts()).toEqual(['Guardado']);
    jest.advanceTimersByTime(1);
    expect(await texts()).toEqual([]);
  });

  it(`no mantiene más de ${MAX_NOTIFICATIONS} avisos: descarta el más antiguo`, async () => {
    for (let i = 1; i <= MAX_NOTIFICATIONS + 1; i++) service.error(`E${i}`);
    expect(await texts()).toEqual(['E2', 'E3', 'E4', 'E5']);
  });

  it('dismiss cancela el temporizador pendiente', async () => {
    service.success('Guardado');
    const [{ id }] = await firstValueFrom(service.messages$);
    service.dismiss(id);
    jest.advanceTimersByTime(5000);
    expect(await texts()).toEqual([]);
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/core/notifications/notification.service.spec.ts`
Expected: FAIL (`MAX_NOTIFICATIONS` no existe; el error se cierra a los 5 s).

- [ ] **Step 2: Implementar**

Reemplazar el contenido de `notification.service.ts` por:

```ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationMessage {
  id: number;
  type: NotificationType;
  text: string;
}

/** Máximo de avisos visibles a la vez; al superarlo se descarta el más antiguo. */
export const MAX_NOTIFICATIONS = 4;

/** Duración por tipo. Los errores (0) esperan a que el usuario los cierre (WCAG 2.2.1). */
const AUTO_CLOSE_MS: Record<NotificationType, number> = {
  success: 5000,
  info: 5000,
  warning: 8000,
  error: 0,
};

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 1;
  private readonly timers = new Map<number, Timer>();
  private readonly messagesSubject = new BehaviorSubject<NotificationMessage[]>([]);
  readonly messages$ = this.messagesSubject.asObservable();

  show(type: NotificationType, text: string, autoCloseMs = AUTO_CLOSE_MS[type]): void {
    const message: NotificationMessage = { id: this.nextId++, type, text };
    const next = [...this.messagesSubject.value, message];
    while (next.length > MAX_NOTIFICATIONS) {
      const dropped = next.shift()!;
      this.clearTimer(dropped.id);
    }
    this.messagesSubject.next(next);

    if (autoCloseMs > 0) {
      this.timers.set(message.id, { handle: null, remaining: autoCloseMs, startedAt: 0 });
      this.resume(message.id);
    }
  }

  success(text: string): void {
    this.show('success', text);
  }

  error(text: string): void {
    this.show('error', text);
  }

  warning(text: string): void {
    this.show('warning', text);
  }

  info(text: string): void {
    this.show('info', text);
  }

  /** Detiene el cierre automático (cursor o foco sobre el aviso). */
  pause(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle === null) return;
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
  }

  /** Retoma el cierre automático con el tiempo que quedaba. */
  resume(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle !== null) return;
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.messagesSubject.next(this.messagesSubject.value.filter(message => message.id !== id));
  }

  clear(): void {
    for (const id of this.timers.keys()) this.clearTimer(id);
    this.messagesSubject.next([]);
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer?.handle) clearTimeout(timer.handle);
    this.timers.delete(id);
  }
}
```

Run: `npm test --prefix frontend -- --runInBand src/app/core/notifications/notification.service.spec.ts`
Expected: PASS (6 pruebas).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/notifications
git commit -m "feat(ui): avisos con pausa, errores persistentes y tope de 4"
```

---

### Task 2: Host y estilos de los avisos

**Files:**
- Modify: `frontend/src/app/shared/notifications/notification-host.component.ts`
- Modify: `frontend/src/styles/styles.scss` (bloque `.siep-notifications` / `.siep-notification*`, ~líneas 235-281)
- Create: `frontend/src/app/shared/notifications/notification-host.component.spec.ts`

**Interfaces:**
- Consumes: `pause`, `resume`, `dismiss` de la Task 1.

- [ ] **Step 1: Escribir las pruebas**

```ts
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../../core/notifications/notification.service';
import { NotificationHostComponent } from './notification-host.component';

describe('NotificationHostComponent', () => {
  let service: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NotificationHostComponent] });
    service = TestBed.inject(NotificationService);
  });

  function render() {
    const fixture = TestBed.createComponent(NotificationHostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('los errores se anuncian como alerta y el resto como estado', () => {
    service.error('Falló');
    service.success('Guardado');
    const fixture = render();
    const items = Array.from(fixture.nativeElement.querySelectorAll('.siep-notification')) as HTMLElement[];
    expect(items.map(i => i.getAttribute('role'))).toEqual(['alert', 'status']);
    expect(fixture.nativeElement.querySelector('[aria-live]')).toBeNull();
  });

  it('pausa con el cursor o el foco y reanuda al salir', () => {
    const pause = jest.spyOn(service, 'pause');
    const resume = jest.spyOn(service, 'resume');
    service.info('Hola');
    const fixture = render();
    const item = fixture.nativeElement.querySelector('.siep-notification') as HTMLElement;
    item.dispatchEvent(new Event('mouseenter'));
    item.dispatchEvent(new Event('mouseleave'));
    item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(pause).toHaveBeenCalledTimes(2);
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it('el botón de cerrar tiene nombre accesible y quita el aviso', () => {
    service.error('Falló');
    const fixture = render();
    const button = fixture.nativeElement.querySelector('.siep-notification button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Cerrar aviso');
    button.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.siep-notification').length).toBe(0);
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/shared/notifications/notification-host.component.spec.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar el host**

Reemplazar el contenido de `notification-host.component.ts` por:

```ts
import { AsyncPipe, NgClass } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NotificationService } from '../../core/notifications/notification.service';

@Component({
  selector: 'app-notification-host',
  standalone: true,
  imports: [AsyncPipe, NgClass, MatIconModule],
  template: `
    <section class="siep-notifications" aria-label="Mensajes del sistema">
      @for (message of notifications.messages$ | async; track message.id) {
        <article
          class="siep-notification"
          [ngClass]="'siep-notification--' + message.type"
          [attr.role]="message.type === 'error' ? 'alert' : 'status'"
          (mouseenter)="notifications.pause(message.id)"
          (mouseleave)="notifications.resume(message.id)"
          (focusin)="notifications.pause(message.id)"
          (focusout)="notifications.resume(message.id)"
        >
          <p>{{ message.text }}</p>
          <button type="button" aria-label="Cerrar aviso" (click)="notifications.dismiss(message.id)">
            <mat-icon aria-hidden="true">close</mat-icon>
          </button>
        </article>
      }
    </section>
  `
})
export class NotificationHostComponent {
  readonly notifications = inject(NotificationService);
}
```

- [ ] **Step 3: Estilos**

En `styles.scss`, reemplazar el bloque `.siep-notifications { … }` por:

```scss
.siep-notifications {
  position: fixed;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  z-index: 1300; /* por encima de app-confirm-dialog (1200) */
  display: grid;
  gap: 10px;
  width: min(380px, calc(100vw - 32px));
  pointer-events: none;
}
```

En `.siep-notification { … }`, añadir al final del bloque:

```scss
  transition: opacity 200ms var(--psy-ease-out), transform 200ms var(--psy-ease-out);

  @starting-style {
    opacity: 0;
    transform: translateY(8px);
  }
```

Reemplazar el bloque `.siep-notification button { … }` por:

```scss
.siep-notification button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: -10px -10px -10px 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: currentColor;
  cursor: pointer;
}
```

(La regla global de `prefers-reduced-motion` ya reduce la transición a 1 ms.)

- [ ] **Step 4: Pruebas y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/shared/notifications/notification-host.component.spec.ts src/app/core/notifications`
Expected: PASS.

```bash
git add frontend/src/app/shared/notifications frontend/src/styles/styles.scss
git commit -m "fix(a11y): avisos con role por tipo, pausa al leer y por encima de los diálogos"
```

---

### Task 3: Mensaje de error de la API

**Files:**
- Create: `frontend/src/app/core/api/api-error.util.ts`
- Create: `frontend/src/app/core/api/api-error.util.spec.ts`

**Interfaces:**
- Produces: `apiErrorMessage(err: unknown, fallback: string): string | null`.

- [ ] **Step 1: Escribir las pruebas**

```ts
import { HttpErrorResponse } from '@angular/common/http';

import { apiErrorMessage } from './api-error.util';

function httpError(status: number, error: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error });
}

describe('apiErrorMessage', () => {
  it('usa el mensaje del backend', () => {
    expect(apiErrorMessage(httpError(400, { message: 'El código ya existe.' }), 'Respaldo')).toBe('El código ya existe.');
  });

  it('usa detail cuando no hay message (DRF)', () => {
    expect(apiErrorMessage(httpError(404, { detail: 'No encontrado.' }), 'Respaldo')).toBe('No encontrado.');
  });

  it('usa el respaldo si el cuerpo no trae texto', () => {
    expect(apiErrorMessage(httpError(500, null), 'No fue posible guardar.')).toBe('No fue posible guardar.');
    expect(apiErrorMessage(httpError(400, { message: '   ' }), 'Respaldo')).toBe('Respaldo');
  });

  it('devuelve null cuando el interceptor ya avisó', () => {
    for (const status of [0, 401, 403]) {
      expect(apiErrorMessage(httpError(status, { message: 'x' }), 'Respaldo')).toBeNull();
    }
    expect(apiErrorMessage(new Error('boom'), 'Respaldo')).toBeNull();
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/core/api/api-error.util.spec.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Implementar**

```ts
import { HttpErrorResponse } from '@angular/common/http';

/** Estados que `jwtInterceptor` ya comunica con su propio aviso. */
const HANDLED_BY_INTERCEPTOR = new Set([0, 401, 403]);

/**
 * Texto para mostrarle al usuario tras un error de la API, o `null` si el
 * interceptor ya avisó (sin conexión, sesión inválida, sin permisos, error no HTTP).
 */
export function apiErrorMessage(err: unknown, fallback: string): string | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  if (HANDLED_BY_INTERCEPTOR.has(err.status)) return null;
  const body = err.error as { message?: unknown; detail?: unknown } | null;
  for (const candidate of [body?.message, body?.detail]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}
```

Run: `npm test --prefix frontend -- --runInBand src/app/core/api/api-error.util.spec.ts`
Expected: PASS (4 pruebas).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/api/api-error.util.ts frontend/src/app/core/api/api-error.util.spec.ts
git commit -m "feat(api): mensaje de error de la API sin duplicar los avisos del interceptor"
```

---

### Task 4: Editor de casos

**Files:**
- Modify: `frontend/src/app/features/simulator/case-editor.component.ts`
- Create: `frontend/src/app/features/simulator/case-editor.feedback.spec.ts`

**Interfaces:**
- Consumes: `NotificationService`, `apiErrorMessage`.
- Produces: método privado `runAction(call: Observable<CaseEditorView>, success: string, fallback: string): void`.

- [ ] **Step 1: Escribir la prueba de contrato**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'case-editor.component.ts'), 'utf-8');

describe('editor de casos: feedback de acciones', () => {
  it('ninguna acción descarta el error en silencio', () => {
    expect(source).not.toContain('error: () => this.busy.set(false)');
  });

  it('todas las acciones pasan por runAction con éxito y error', () => {
    expect(source).toContain('private runAction(call: Observable<CaseEditorView>, success: string, fallback: string): void {');
    expect((source.match(/this\.runAction\(/g) ?? []).length).toBe(12);
    expect(source).toContain('this.notify.success(success);');
    expect(source).toContain('const text = apiErrorMessage(err, fallback);');
  });

  it('publicar pide confirmación', () => {
    expect(source).toMatch(/confirmPublish\(caseVersionId: number\)/);
    expect(source).toContain('(click)="confirmPublish(model.caseVersionId)"');
    expect(source).toContain(`[confirmLabel]="confirmState()?.confirmLabel ?? 'Eliminar'"`);
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/case-editor.feedback.spec.ts`
Expected: FAIL.

- [ ] **Step 2: Inyección e imports**

Añadir los imports (si `Observable` ya se importa de `rxjs`, sumar solo lo que falte):

```ts
import { Observable } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { apiErrorMessage } from '../../core/api/api-error.util';
```

Junto a `private readonly fb = inject(FormBuilder);` (línea ~753) añadir:

```ts
  private readonly notify = inject(NotificationService);
```

- [ ] **Step 3: Helper `runAction`**

Justo antes de `private refresh(model: CaseEditorView) {` (línea ~1094) añadir:

```ts
  /** Ejecuta una acción del editor y le dice al usuario si funcionó o por qué falló. */
  private runAction(call: Observable<CaseEditorView>, success: string, fallback: string): void {
    this.busy.set(true);
    call.subscribe({
      next: editor => {
        this.refresh(editor);
        this.notify.success(success);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const text = apiErrorMessage(err, fallback);
        if (text) this.notify.error(text);
      },
    });
  }
```

- [ ] **Step 4: Usarlo en las doce acciones**

En cada método, reemplazar el par `this.busy.set(true);` + `….subscribe({ next: e => this.refresh(e), error: () => this.busy.set(false) });` por una llamada a `runAction` con estos textos (conservar la lógica que arma `body` y `call`):

| Método | Llamada |
| --- | --- |
| `saveNode` | `this.runAction(call, 'Nodo guardado.', 'No fue posible guardar el nodo.');` |
| `saveDecision` | `this.runAction(call, 'Decisión guardada.', 'No fue posible guardar la decisión.');` |
| `saveMap` | `this.runAction(call, 'Mapa guardado.', 'No fue posible guardar el mapa.');` |
| `saveObject` | `this.runAction(call, 'Objeto guardado.', 'No fue posible guardar el objeto.');` |
| `saveTool` | `this.runAction(call, 'Herramienta guardada.', 'No fue posible guardar la herramienta.');` |
| `saveChecklist` | `this.runAction(this.simulationService.updateChecklist(caseVersionId, this.checklistForm.value), 'Lista de verificación guardada.', 'No fue posible guardar la lista de verificación.');` |
| `confirmDeleteNode` (dentro del callback) | `this.runAction(this.simulationService.deleteNode(caseVersionId, node.id), 'Nodo eliminado.', 'No fue posible eliminar el nodo.');` |
| `confirmDeleteMap` | `this.runAction(this.simulationService.deleteMap(caseVersionId, map.id), 'Mapa eliminado.', 'No fue posible eliminar el mapa.');` |
| `confirmDeleteObject` | `this.runAction(this.simulationService.deleteObject(caseVersionId, obj.id), 'Objeto eliminado.', 'No fue posible eliminar el objeto.');` |
| `confirmDeleteTool` | `this.runAction(this.simulationService.deleteTool(caseVersionId, tool.id), 'Herramienta eliminada.', 'No fue posible eliminar la herramienta.');` |
| `publish` | `this.runAction(this.simulationService.publishCase(caseVersionId), 'Caso publicado.', 'No fue posible publicar el caso.');` |
| `clone` | `this.runAction(this.simulationService.cloneCaseVersion(caseVersionId), 'Se creó una nueva versión del caso.', 'No fue posible clonar la versión.');` |

Ejemplo de resultado para `saveNode`:

```ts
    const call = p?.kind === 'node-edit'
      ? this.simulationService.updateNode(caseVersionId, (p as { node: NodeEditorState }).node.id, body)
      : this.simulationService.createNode(caseVersionId, body);
    this.runAction(call, 'Nodo guardado.', 'No fue posible guardar el nodo.');
```

Si algún método de `simulationService` usado aquí no devuelve `Observable<CaseEditorView>` (el compilador lo dirá), DETENERSE y reportar.

- [ ] **Step 5: Confirmar antes de publicar**

1. Ampliar el tipo del estado de confirmación (línea ~761). Reemplazar:

```ts
  readonly confirmState = signal<{ title: string; message: string; run: () => void } | null>(null);
```

por:

```ts
  readonly confirmState = signal<{ title: string; message: string; run: () => void; confirmLabel?: string } | null>(null);
```
2. `openConfirm` acepta la etiqueta:

```ts
  private openConfirm(title: string, message: string, run: () => void, confirmLabel?: string) {
    this.confirmState.set({ title, message, run, confirmLabel });
  }
```

3. Añadir, justo antes de `publish(caseVersionId: number) {`:

```ts
  confirmPublish(caseVersionId: number) {
    this.openConfirm(
      'Publicar caso',
      'Los estudiantes asignados verán esta versión en su catálogo. ¿Publicarla ahora?',
      () => this.publish(caseVersionId),
      'Publicar',
    );
  }
```

4. En la plantilla, el botón «Publicar» (línea ~58) pasa de `(click)="publish(model.caseVersionId)"` a `(click)="confirmPublish(model.caseVersionId)"`.
5. En `<app-confirm-dialog>` (línea ~531), reemplazar `confirmLabel="Eliminar"` por `[confirmLabel]="confirmState()?.confirmLabel ?? 'Eliminar'"`.

- [ ] **Step 6: Pruebas, build y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/features/simulator/case-editor.feedback.spec.ts`
Expected: PASS.

Run: `npm run build:frontend`
Expected: OK.

```bash
git add frontend/src/app/features/simulator/case-editor.component.ts frontend/src/app/features/simulator/case-editor.feedback.spec.ts
git commit -m "fix(casos): el editor avisa el resultado de cada acción y confirma antes de publicar"
```

---

### Task 5: Usuarios, Grupos y Rúbricas

**Files:**
- Modify: `frontend/src/app/features/admin/users.component.ts`
- Modify: `frontend/src/app/features/grupos/grupo-list.component.ts`
- Modify: `frontend/src/app/features/admin/rubrics.component.ts`
- Create: `frontend/src/app/features/admin/portal-feedback.contract.spec.ts`

- [ ] **Step 1: Escribir la prueba de contrato**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

function source(relative: string): string {
  return readFileSync(join(__dirname, relative), 'utf-8');
}

describe('portal: feedback de acciones', () => {
  const users = source('users.component.ts');
  const grupos = source('../grupos/grupo-list.component.ts');
  const rubrics = source('rubrics.component.ts');

  it('Usuarios avisa el éxito con un aviso que no se borra', () => {
    expect(users).toContain("this.notify.success(selected ? 'La información se guardó correctamente.' : 'Usuario creado correctamente.');");
    expect(users).not.toContain("this.message.set(selected ? 'La información se guardó correctamente.'");
  });

  it('Usuarios cierra el diálogo si falla el cambio de estado', () => {
    expect(users).toMatch(/error: \(err: unknown\) => \{\s*this\.statusConfirmTarget\.set\(null\);/);
  });

  it('Grupos ya no usa window.confirm', () => {
    expect(grupos).not.toMatch(/\bconfirm\(`/);
    expect(grupos).toContain('<app-confirm-dialog');
  });

  it('Grupos avisa crear, editar, borrar, copiar y asignar', () => {
    for (const text of ['Grupo creado.', 'Grupo actualizado.', 'Grupo eliminado.', 'Caso asignado al grupo.', 'Caso retirado del grupo.']) {
      expect(grupos).toContain(`this.notify.success('${text}')`);
    }
    expect(grupos).toContain('this.notify.success(`Código ${grupo.codigo} copiado al portapapeles.`)');
  });

  it('Rúbricas avisa el resultado de sus acciones', () => {
    expect(rubrics).toContain("this.notify.success('Rúbrica guardada.')");
    expect(rubrics).toContain("this.notify.success('Rúbrica asignada a la simulación.')");
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/features/admin/portal-feedback.contract.spec.ts`
Expected: FAIL.

- [ ] **Step 2: Usuarios**

En `users.component.ts`:
1. Imports: `import { NotificationService } from '../../core/notifications/notification.service';` y `import { apiErrorMessage } from '../../core/api/api-error.util';`. En la clase: `private readonly notify = inject(NotificationService);`.
2. En `save()`, dentro de `next`, reemplazar:

```ts
        this.message.set(selected ? 'La información se guardó correctamente.' : 'Usuario creado correctamente.');
```

por:

```ts
        this.notify.success(selected ? 'La información se guardó correctamente.' : 'Usuario creado correctamente.');
```

y el `error` de `save()`:

```ts
      error: error => {
        this.error.set(error?.error?.message || 'No fue posible guardar los cambios.');
        this.saving.set(false);
      }
```

por:

```ts
      error: (err: unknown) => {
        const text = apiErrorMessage(err, 'No fue posible guardar los cambios.');
        if (text) this.notify.error(text);
        this.saving.set(false);
      }
```

3. En `confirmToggleStatus()`, `next`: reemplazar `this.message.set(saved.activo ? 'Usuario activado correctamente.' : 'Usuario desactivado correctamente.');` por `this.notify.success(saved.activo ? 'Usuario activado correctamente.' : 'Usuario desactivado correctamente.');`. El `error`:

```ts
      error: error => {
        this.error.set(error?.error?.message || 'No fue posible actualizar el estado del usuario.');
        this.saving.set(false);
      }
```

por:

```ts
      error: (err: unknown) => {
        this.statusConfirmTarget.set(null);
        const text = apiErrorMessage(err, 'No fue posible actualizar el estado del usuario.');
        if (text) this.notify.error(text);
        this.saving.set(false);
      }
```

Las validaciones de cliente de `save()` («Revisa los campos obligatorios.», contraseña) siguen en `this.error` (en línea).

- [ ] **Step 3: Grupos**

En `grupo-list.component.ts`:
1. Imports: `NotificationService`, `apiErrorMessage` y `ConfirmDialogComponent` (`../../shared/confirm/confirm-dialog.component`). Añadir `ConfirmDialogComponent` al arreglo `imports` del componente. En la clase: `private readonly notify = inject(NotificationService);` y:

```ts
  /** Acción destructiva pendiente de confirmar. */
  readonly pendingConfirm = signal<{ title: string; message: string; confirmLabel: string; run: () => void } | null>(null);

  runPendingConfirm(): void {
    const pending = this.pendingConfirm();
    this.pendingConfirm.set(null);
    pending?.run();
  }
```

2. La plantilla tiene varios elementos de primer nivel. Al final de la plantilla, justo antes del backtick que la cierra (línea ~346, la línea `` `, ``), añadir:

```html
    <app-confirm-dialog
      [open]="!!pendingConfirm()"
      [title]="pendingConfirm()?.title ?? 'Confirmar'"
      [message]="pendingConfirm()?.message ?? ''"
      [confirmLabel]="pendingConfirm()?.confirmLabel ?? 'Confirmar'"
      (cancel)="pendingConfirm.set(null)"
      (confirm)="runPendingConfirm()"
    />
```

3. `eliminarGrupo`: reemplazar la línea con `if (!confirm(…)) return;` para que el método solo abra el diálogo y mueva el resto a un método privado:

```ts
  eliminarGrupo(grupo: Grupo) {
    this.pendingConfirm.set({
      title: 'Borrar grupo',
      message: `¿Borrar el grupo "${grupo.nombre}"? Se quitarán sus estudiantes y casos asignados. Esta acción no se puede deshacer.`,
      confirmLabel: 'Borrar',
      run: () => this.borrarGrupo(grupo),
    });
  }

  private borrarGrupo(grupo: Grupo) {
    this.error.set('');
    this.grupoService.eliminar(grupo.id).subscribe({
      next: () => {
        this.grupos.update(list => list.filter(g => g.id !== grupo.id));
        if (this.grupoActivo()?.id === grupo.id) this.grupoActivo.set(null);
        if (this.editandoGrupo()?.id === grupo.id) this.cancelarEdicion();
        this.notify.success('Grupo eliminado.');
      },
      error: (err: unknown) => {
        const text = apiErrorMessage(err, 'No fue posible borrar el grupo.');
        if (text) this.notify.error(text);
      }
    });
  }
```

4. `quitarEstudiante`: mismo patrón. El diálogo tiene el título «Quitar estudiante», el mensaje `` `¿Quitar a ${student.nombre} ${student.apellido} del grupo?` `` y la etiqueta «Quitar». El método privado `retirarEstudiante(grupo, student)` contiene la suscripción actual, con `next` terminando en `this.notify.success('Estudiante retirado del grupo.');` en lugar de `mensajeEstudiante`, y `error` usando `apiErrorMessage(err, 'No fue posible quitar al estudiante.')` + `this.notify.error`.
5. `crear()`: en `next`, añadir `this.notify.success('Grupo creado.');`. En `error`, reemplazar `this.error.set('No fue posible crear el grupo.');` por:

```ts
        const text = apiErrorMessage(err, 'No fue posible crear el grupo.');
        if (text) this.notify.error(text);
```

(con la firma `error: (err: unknown) => {`).
6. `actualizarGrupo()`: en `next`, añadir `this.notify.success('Grupo actualizado.');`. En `error`, reemplazar la línea de `this.error.set(err.error?.message || …)` por el mismo patrón con `'No fue posible actualizar el grupo.'`.
7. `copiarCodigo()`:
   - `done` debe hacer `this.notify.success(`Código ${grupo.codigo} copiado al portapapeles.`);`.
   - `fail` debe hacer `this.notify.info(`Código del grupo: ${grupo.codigo}`);`.
   - Ninguno de los dos toca `mensajeEstudiante`.
8. `asignarCaso()`:
   - En `next`, añadir `this.notify.success('Caso asignado al grupo.');`.
   - En `error`, reemplazar las dos líneas de `mensajeEstudiante`/`mensajeEsError` por el patrón `apiErrorMessage(err, 'No fue posible asignar el caso al grupo.')` + `notify.error`.
9. `quitarCaso()`: igual, con `'Caso retirado del grupo.'` y `'No fue posible retirar el caso del grupo.'`.

Los mensajes de «agregar estudiante», importar Excel y descargar la plantilla se quedan en `mensajeEstudiante`: están junto a su formulario.

- [ ] **Step 4: Rúbricas**

En `rubrics.component.ts`:
1. Añadir `NotificationService` y `apiErrorMessage` (imports e `inject`).
2. En los tres flujos de acción:

| Flujo | Éxito | Respaldo del error |
| --- | --- | --- |
| Guardar (~327/333) | `this.notify.success('Rúbrica guardada.')` | `'No fue posible guardar la rúbrica.'` |
| Asignar (~362/366) | `this.notify.success('Rúbrica asignada a la simulación.')` | `'No fue posible asignar la rúbrica.'` |
| `withSelected` (~411-426, activar y predeterminar) | `this.notify.success(success)` (el parámetro `success` del método) | `'No fue posible actualizar la rúbrica.'` |

   - En cada `next`, reemplazar `this.message.set(<texto>); this.messageIsError.set(false);` por la llamada de éxito correspondiente.
   - En cada `error`, reemplazar `this.message.set(err.error?.message || <respaldo>); this.messageIsError.set(true);` por `const text = apiErrorMessage(err, <respaldo>); if (text) this.notify.error(text);`.
3. Los errores de carga (~271, ~285) se quedan en el banner.

- [ ] **Step 5: Pruebas, build y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/features/admin/portal-feedback.contract.spec.ts`
Expected: PASS.

Run: `npm run test:frontend` y `npm run build:frontend`
Expected: todo en verde. Si alguna prueba existente esperaba el texto en el banner, actualizarla para que espere la llamada a `NotificationService` (y anotarlo en el reporte).

```bash
git add frontend/src/app/features/admin frontend/src/app/features/grupos
git commit -m "fix(portal): Usuarios, Grupos y Rúbricas avisan el resultado de cada acción"
```

## Límites

- NO tocar `jwt.interceptor.ts` ni `auth.guard.ts`.
- NO cambiar los mensajes de validación de campos (plan 10).
- NO rediseñar los banners de carga de página (errores al abrir una pantalla).
- NO añadir Material Snackbar ni otra librería de avisos.

## Verificación

- **Mecánica:** los 5 specs nuevos; `npm run test:frontend` y `npm run build:frontend` en verde.
- **Revisión en vivo** (`npm run up`, http://localhost:4200, cuenta de administrador):
  - Editor de casos: guardar un nodo muestra «Nodo guardado.». Detener el backend y guardar: aparece un único aviso de conexión, no dos. Con el backend activo, provocar un error de validación del servidor (p. ej. clave de nodo duplicada): aparece el mensaje del backend y no desaparece solo.
  - «Publicar» abre un diálogo con el botón «Publicar».
  - Usuarios: guardar un usuario muestra el aviso y este se mantiene 5 s. Con el cursor encima no se va.
  - Grupos: borrar un grupo abre el diálogo propio (no el del navegador). Tras borrar aparece «Grupo eliminado.».
  - Con un diálogo de confirmación abierto, un aviso queda visible por encima del fondo oscuro, abajo a la derecha, sin tapar el botón de cerrar sesión.
  - Con NVDA o Narrador, un error se anuncia al aparecer.
- **Hecho cuando:** ninguna acción del portal termina en silencio.
