# 10 — Validar al enviar en los formularios del portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `02bbfe9` (rama `feat/ui-mes`)
- **Depende de:** plan 09 (toca otras zonas de `users.component.ts` y `grupo-list.component.ts`; ejecutar después para evitar conflictos)
- **Severidad:** ALTA (el botón «Guardar» aparece deshabilitado sin decir por qué)
- **Categoría:** Usabilidad / formularios
- **Alcance estimado:** 1 util nuevo, 3 formularios; 2 specs nuevos

**Goal:** Que el botón «Guardar» esté siempre disponible y que, al pulsarlo con datos incompletos, cada campo diga qué falta y el foco vaya al primer campo con problema.

**Architecture:** Hoy los tres formularios del portal deshabilitan el envío con `[disabled]="form.invalid || saving()"`. Por eso el `markAllAsTouched()` que ya existe nunca se ejecuta, y no hay ningún `<mat-error>`. El cambio:
- El botón solo se deshabilita mientras se guarda.
- El manejador de envío marca los campos como tocados y mueve el foco con una utilidad nueva, `focusFirstInvalid(root)`.
- Cada campo con validación tiene su `<mat-error>`.
- En Usuarios, la contraseña pasa a validarse con validadores (obligatoria al crear, mínimo 8 caracteres) en lugar de mensajes en el banner superior.

**Tech Stack:** Angular 21 Reactive Forms, Angular Material 21 (`mat-error`, `mat-hint`), Jest 30.

**Spec:** Auditoría del 2026-09-29, tabla «Portal docente y administrativo», fila «"Guardar" se deshabilita con el formulario inválido sin decir por qué». Prioridad del mes n.º 9, parte de formularios. Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias.
- No cambiar los validadores existentes salvo la contraseña de Usuarios. No cambiar los payloads enviados al backend.
- El formulario del editor de casos (inputs propios, sin Material) queda fuera de este plan.
- Si un fragmento «Actual» no coincide con el archivo, DETENERSE y reportar.
- Mensajes de error en español con tildes, redactados como instrucción («Escribe el nombre.»). Commits en español `tipo(ámbito): descripción`.

## Review Focus

- Pulsar «Guardar» con el formulario vacío: se ven todos los mensajes de campo y el foco queda en el primer campo inválido.
- Mientras se guarda, el botón sigue deshabilitado y un doble clic no envía dos veces.
- En Usuarios, al editar un usuario existente, la contraseña vacía es válida; al crear uno, es obligatoria y debe tener 8 caracteres o más.
- En Rúbricas, los botones «Activar» y «Predeterminada» explican por qué están deshabilitados cuando la ponderación no suma 100 %.
- Un lector de pantalla lee el mensaje de error del campo: `mat-error` lo enlaza por `aria-describedby`.

## Problema (fragmentos actuales)

`frontend/src/app/features/admin/users.component.ts` (~línea 181):

```html
                <button class="psy-button psy-button--primary" type="submit" [disabled]="form.invalid || saving()">
```

`users.component.ts:257-263`:

```ts
  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    apellido: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    role: ['ESTUDIANTE' as UserRole, Validators.required],
    password: ['']
  });
```

`save()` valida la contraseña con mensajes en el banner de arriba de la página:

```ts
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos obligatorios.');
      return;
    }
    const selected = this.selectedUser();
    const value = this.form.getRawValue();
    const email = value.email.trim().toLowerCase();
    if (!selected && !value.password) {
      this.form.controls.password.markAsTouched();
      this.error.set('La contraseña es obligatoria al crear usuarios.');
      return;
    }
    if (!selected && value.password.length < 8) {
      this.form.controls.password.markAsTouched();
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
```

`frontend/src/app/features/admin/rubrics.component.ts` (~línea 143):

```html
                <button class="psy-button psy-button--primary" type="submit" [disabled]="form.invalid || saving()">
```

Y los botones «Activar» (~147) y «Predeterminada» (~153) se deshabilitan con `totalWeight() !== 100` sin ninguna explicación junto a ellos.

`frontend/src/app/features/grupos/grupo-list.component.ts` (~línea 93):

```html
              <button class="psy-button psy-button--primary" type="submit" [disabled]="form.invalid || saving()">
```

Y `crear()`/`actualizarGrupo()` empiezan con `if (this.form.invalid || this.saving()) return;` (salida silenciosa).

Ninguno de los tres formularios tiene `<mat-error>`.

## Convenciones del repo

- Formularios reactivos con `this.fb.group`/`this.fb.nonNullable.group` y `<mat-form-field appearance="outline">`.
- Specs que leen el código fuente: `frontend/src/styles/motion.contract.spec.ts`.
- Jest: `npm test --prefix frontend -- --runInBand <ruta>`.

---

### Task 1: Utilidad para enfocar el primer campo inválido

**Files:**
- Create: `frontend/src/app/shared/forms/focus-first-invalid.util.ts`
- Create: `frontend/src/app/shared/forms/focus-first-invalid.util.spec.ts`

**Interfaces:**
- Produces: `focusFirstInvalid(root: HTMLElement): boolean` (true si encontró y enfocó un campo).

- [ ] **Step 1: Escribir las pruebas**

```ts
import { focusFirstInvalid } from './focus-first-invalid.util';

describe('focusFirstInvalid', () => {
  afterEach(() => document.body.replaceChildren());

  function mount(html: string): HTMLElement {
    const root = document.createElement('form');
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  }

  it('enfoca el primer control inválido en orden del documento', () => {
    const root = mount(`
      <input id="ok" class="ng-valid">
      <textarea id="bad-1" class="ng-invalid"></textarea>
      <input id="bad-2" class="ng-invalid">
    `);
    expect(focusFirstInvalid(root)).toBe(true);
    expect(document.activeElement?.id).toBe('bad-1');
  });

  it('también enfoca un mat-select inválido', () => {
    const root = mount(`<mat-select id="sel" class="ng-invalid" tabindex="0"></mat-select>`);
    expect(focusFirstInvalid(root)).toBe(true);
    expect(document.activeElement?.id).toBe('sel');
  });

  it('devuelve false si no hay campos inválidos', () => {
    const root = mount(`<input class="ng-valid">`);
    expect(focusFirstInvalid(root)).toBe(false);
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/shared/forms/focus-first-invalid.util.spec.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Implementar**

```ts
/** Controles de formulario reactivo que Angular marca como inválidos. */
const INVALID_CONTROL = 'input.ng-invalid, textarea.ng-invalid, select.ng-invalid, mat-select.ng-invalid';

/**
 * Mueve el foco al primer control inválido dentro de `root`. Se usa al enviar
 * un formulario incompleto, para que teclado y lector de pantalla lleguen al problema.
 */
export function focusFirstInvalid(root: HTMLElement): boolean {
  const target = root.querySelector<HTMLElement>(INVALID_CONTROL);
  if (!target) return false;
  target.focus();
  return true;
}
```

Run: `npm test --prefix frontend -- --runInBand src/app/shared/forms/focus-first-invalid.util.spec.ts`
Expected: PASS (3 pruebas).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/shared/forms
git commit -m "feat(forms): utilidad para enfocar el primer campo inválido"
```

---

### Task 2: Usuarios

**Files:**
- Modify: `frontend/src/app/features/admin/users.component.ts`
- Create: `frontend/src/app/features/admin/forms-validation.contract.spec.ts`

- [ ] **Step 1: Escribir la prueba de contrato (bloque de Usuarios)**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

function source(relative: string): string {
  return readFileSync(join(__dirname, relative), 'utf-8');
}

describe('formularios: validar al enviar — Usuarios', () => {
  const users = source('users.component.ts');

  it('el botón solo se deshabilita mientras guarda', () => {
    expect(users).not.toContain('[disabled]="form.invalid || saving()"');
    expect(users).toMatch(/type="submit" \[disabled\]="saving\(\)"/);
  });

  it('cada campo explica su error', () => {
    for (const text of ['Escribe el nombre.', 'Escribe el apellido.', 'Escribe el correo.', 'Escribe un correo válido.', 'Elige un rol.', 'La contraseña es obligatoria al crear un usuario.', 'Usa al menos 8 caracteres.']) {
      expect(users).toContain(text);
    }
    expect(users).toContain('<mat-hint>Mínimo 8 caracteres.</mat-hint>');
  });

  it('la contraseña se valida con validadores según crear/editar', () => {
    expect(users).toContain('private setPasswordRules(creating: boolean): void {');
    expect(users).not.toContain("this.error.set('La contraseña es obligatoria al crear usuarios.');");
    expect(users).toContain('focusFirstInvalid(this.host.nativeElement);');
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/features/admin/forms-validation.contract.spec.ts`
Expected: FAIL.

- [ ] **Step 2: Imports e inyección**

Añadir `ElementRef` al import de `@angular/core`, y:

```ts
import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';
```

En la clase: `private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);`

- [ ] **Step 3: Reglas de contraseña**

Añadir el método:

```ts
  /** Al crear, la contraseña es obligatoria; al editar, vacía significa «no cambiarla». */
  private setPasswordRules(creating: boolean): void {
    const password = this.form.controls.password;
    password.setValidators(creating ? [Validators.required, Validators.minLength(8)] : [Validators.minLength(8)]);
    password.updateValueAndValidity({ emitEvent: false });
  }
```

Llamarlo:
- Como primera línea de `ngOnInit()` (línea ~273): `this.setPasswordRules(true);`.
- En `newUser()`, después de `this.form.reset({ … });`: `this.setPasswordRules(true);`.
- En `editUser(user)`, después de `this.form.reset({ … });`: `this.setPasswordRules(false);`.

- [ ] **Step 4: `save()` valida con el formulario**

Reemplazar el bloque actual (desde `if (this.form.invalid) {` hasta el segundo `return; }` de la contraseña, citado en «Problema») por:

```ts
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement);
      return;
    }
    const selected = this.selectedUser();
    const value = this.form.getRawValue();
    const email = value.email.trim().toLowerCase();
```

- [ ] **Step 5: Plantilla**

Botón: `[disabled]="form.invalid || saving()"` → `[disabled]="saving()"`.

Añadir `<mat-error>` dentro de cada `mat-form-field`, después del control:

```html
                <input matInput formControlName="nombre">
                <mat-error>Escribe el nombre.</mat-error>
```

```html
                <input matInput formControlName="apellido">
                <mat-error>Escribe el apellido.</mat-error>
```

```html
                <input matInput formControlName="email" type="email">
                @if (form.controls.email.hasError('required')) {
                  <mat-error>Escribe el correo.</mat-error>
                } @else {
                  <mat-error>Escribe un correo válido.</mat-error>
                }
```

```html
                </mat-select>
                <mat-error>Elige un rol.</mat-error>
```

```html
                <input matInput formControlName="password" type="password" autocomplete="new-password">
                <mat-hint>Mínimo 8 caracteres.</mat-hint>
                @if (form.controls.password.hasError('required')) {
                  <mat-error>La contraseña es obligatoria al crear un usuario.</mat-error>
                } @else {
                  <mat-error>Usa al menos 8 caracteres.</mat-error>
                }
```

- [ ] **Step 6: Pruebas y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/features/admin/forms-validation.contract.spec.ts`
Expected: PASS del bloque Usuarios.

```bash
git add frontend/src/app/features/admin/users.component.ts frontend/src/app/features/admin/forms-validation.contract.spec.ts
git commit -m "fix(usuarios): validar al enviar con mensajes por campo"
```

---

### Task 3: Rúbricas

**Files:**
- Modify: `frontend/src/app/features/admin/rubrics.component.ts`
- Modify: `frontend/src/app/features/admin/forms-validation.contract.spec.ts`

- [ ] **Step 1: Añadir el bloque de prueba**

Al final del spec:

```ts
describe('formularios: validar al enviar — Rúbricas', () => {
  const rubrics = source('rubrics.component.ts');

  it('el botón Guardar solo se deshabilita mientras guarda', () => {
    expect(rubrics).not.toContain('[disabled]="form.invalid || saving()"');
  });

  it('cada campo explica su error', () => {
    for (const text of ['Escribe el nombre de la rúbrica.', 'Escribe la versión.', 'Escribe el nombre del criterio.', 'El peso va de 0 a 100.', 'El orden empieza en 1.']) {
      expect(rubrics).toContain(text);
    }
    expect(rubrics).toContain('focusFirstInvalid(this.host.nativeElement);');
  });

  it('explica por qué Activar y Predeterminada están deshabilitados', () => {
    expect(rubrics).toContain('id="rubric-weight-hint"');
    expect(rubrics).toContain('Para activarla o hacerla predeterminada, la ponderación debe sumar 100 %.');
    expect((rubrics.match(/\[attr\.aria-describedby\]="totalWeight\(\) !== 100 \? 'rubric-weight-hint' : null"/g) ?? []).length).toBe(2);
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/features/admin/forms-validation.contract.spec.ts`
Expected: FAIL del bloque Rúbricas.

- [ ] **Step 2: Implementar**

1. Imports: `ElementRef` en `@angular/core`, y `import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';`. En la clase: `private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);`.
2. En `save()`, en el bloque inicial:

```ts
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
```

reemplazar por:

```ts
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement);
      return;
    }
```

3. Botón Guardar: `[disabled]="form.invalid || saving()"` → `[disabled]="saving()"`.
4. `<mat-error>` en los campos (después de cada control):
   - `formControlName="name"`: `<mat-error>Escribe el nombre de la rúbrica.</mat-error>`
   - `formControlName="version"`: `<mat-error>Escribe la versión.</mat-error>`
   - `formControlName="title"` (criterio): `<mat-error>Escribe el nombre del criterio.</mat-error>`
   - `formControlName="weight"`: `<mat-error>El peso va de 0 a 100.</mat-error>`
   - `formControlName="displayOrder"`: `<mat-error>El orden empieza en 1.</mat-error>`
5. Explicación de la ponderación. Justo debajo del `<div class="weight-line" …>…</div>` existente añadir:

```html
              @if (totalWeight() !== 100) {
                <p id="rubric-weight-hint" class="weight-hint">Para activarla o hacerla predeterminada, la ponderación debe sumar 100 %.</p>
              }
```

   En los botones «Activar» y «Predeterminada», añadir `[attr.aria-describedby]="totalWeight() !== 100 ? 'rubric-weight-hint' : null"`.

   En los estilos del componente, junto a `.weight-line`, añadir:

```css
    .weight-hint { margin: 4px 0 0; color: var(--psy-muted); font-size: .85rem; }
```

- [ ] **Step 3: Pruebas y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/features/admin/forms-validation.contract.spec.ts`
Expected: PASS de ambos bloques.

```bash
git add frontend/src/app/features/admin/rubrics.component.ts frontend/src/app/features/admin/forms-validation.contract.spec.ts
git commit -m "fix(rubricas): validar al enviar y explicar la regla del 100 %"
```

---

### Task 4: Grupos

**Files:**
- Modify: `frontend/src/app/features/grupos/grupo-list.component.ts`
- Modify: `frontend/src/app/features/admin/forms-validation.contract.spec.ts`

- [ ] **Step 1: Añadir el bloque de prueba**

```ts
describe('formularios: validar al enviar — Grupos', () => {
  const grupos = source('../grupos/grupo-list.component.ts');

  it('el formulario de grupo valida al enviar', () => {
    expect(grupos).not.toContain('[disabled]="form.invalid || saving()"');
    expect(grupos).toContain('Escribe el nombre del grupo.');
    expect(grupos).toContain('Escribe el código del grupo.');
    expect(grupos).toContain('private invalidGroupForm(): boolean {');
  });
});
```

Run: FAIL esperado del bloque Grupos.

- [ ] **Step 2: Implementar**

1. Imports: `import { focusFirstInvalid } from '../../shared/forms/focus-first-invalid.util';` (`ElementRef` ya está importado). En la clase: `private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);`.
2. Añadir el método:

```ts
  /** true (y marca y enfoca) si el formulario del grupo tiene errores. */
  private invalidGroupForm(): boolean {
    if (!this.form.invalid) return false;
    this.form.markAllAsTouched();
    focusFirstInvalid(this.host.nativeElement);
    return true;
  }
```

3. `crear()`: `if (this.form.invalid || this.saving()) return;` → `if (this.saving() || this.invalidGroupForm()) return;`.
4. `actualizarGrupo()`: `if (!grupo || this.form.invalid || this.saving()) return;` → `if (!grupo || this.saving() || this.invalidGroupForm()) return;`.
5. Botón: `[disabled]="form.invalid || saving()"` → `[disabled]="saving()"`.
6. `<mat-error>`: tras `formControlName="nombre"` → `<mat-error>Escribe el nombre del grupo.</mat-error>`; tras `formControlName="codigo"` → `<mat-error>Escribe el código del grupo.</mat-error>`.

- [ ] **Step 3: Pruebas, suite, build y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/features/admin/forms-validation.contract.spec.ts`
Expected: PASS (3 bloques).

Run: `npm run test:frontend` y `npm run build:frontend`
Expected: todo en verde.

```bash
git add frontend/src/app/features/grupos/grupo-list.component.ts frontend/src/app/features/admin/forms-validation.contract.spec.ts
git commit -m "fix(grupos): validar al enviar el formulario de grupo"
```

## Límites

- NO tocar los formularios del editor de casos, del editor de mundo ni los de agregar estudiante o importar Excel en Grupos.
- NO cambiar el backend ni los payloads.
- NO quitar la protección `saving()` contra doble envío.

## Verificación

- **Mecánica:** los dos specs nuevos; `npm run test:frontend` y `npm run build:frontend` en verde.
- **Revisión en vivo** (`npm run up`, cuenta de administrador y de docente):
  - Usuarios → «Crear usuario» → «Guardar» con todo vacío: aparecen los mensajes bajo cada campo y el foco queda en «Nombre». Escribir una contraseña de 5 caracteres muestra «Usa al menos 8 caracteres.». Al editar un usuario existente con la contraseña vacía, guarda sin error.
  - Rúbricas: con una ponderación de 90 %, junto a los botones aparece «Para activarla o hacerla predeterminada, la ponderación debe sumar 100 %.».
  - Grupos: «Crear grupo» vacío muestra los dos mensajes y enfoca el nombre.
  - Con un lector de pantalla, al llegar al campo con error se lee el mensaje.
- **Hecho cuando:** ningún botón de guardar del portal queda deshabilitado sin explicación.
