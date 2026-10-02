# 06 — Navegación accesible — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `470a0a2` (rama `feat/personaje-v1-idle-walk`)
- **Severidad:** ALTA (WCAG 2.4.1, 2.4.2, 2.4.3, 4.1.2)
- **Categoría:** Accesibilidad / navegación por teclado y lector de pantalla
- **Alcance estimado:** 1 archivo nuevo + 7 editados; 4 specs nuevos

**Goal:** Que una persona que navega con teclado o lector de pantalla pueda saltar al contenido en cualquier pantalla, sepa en qué página está por el título, no quede atrapada en formularios o menús invisibles y pueda cerrar los diálogos de confirmación con Esc.

**Architecture:** Cinco arreglos independientes, uno por tarea:
1. Un `TitleStrategy` propio con un `title` por ruta.
2. Los enlaces de salto se resuelven por script: con `<base href="/">`, un `href="#main-content"` en `/portal/dashboard` navega a `/#main-content` (la portada) en vez de saltar. El clic se intercepta, busca `#main-content` o el primer `<main>` y mueve el foco allí.
3. En el login, el panel que no se ve recibe `inert` y los títulos de los paneles pasan a `h2`.
4. En el menú móvil del portal: `inert` cuando está cerrado, `aria-expanded`/`aria-controls` en el botón y Esc para cerrar.
5. El diálogo de confirmación: `role="alertdialog"`, foco atrapado con `cdkTrapFocus` (ya usado en el simulador), foco inicial en «Cancelar», Esc y clic fuera para cancelar.

**Tech Stack:** Angular 21 (router, signals, `@angular/cdk/a11y`), Jest 30.

**Spec:** Auditoría estética y técnica del 2026-09-29, problema de fondo 4 y tablas de portada, login y portal. Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias (`@angular/cdk` ya está instalado).
- No tocar `frontend/src/app/features/simulator/game-world.component.ts`, `player-motion.util.ts` ni `player-motion.util.spec.ts`.
- No cambiar el comportamiento visual de login ni del menú móvil: solo atributos de accesibilidad, etiquetas y la regla `h1 → h2`.
- Si un fragmento «Actual» no coincide con el archivo, DETENERSE y reportar.
- Textos visibles y etiquetas `aria` en español con tildes. Mensajes de commit en español con formato `tipo(ámbito): descripción`.

## Review Focus

- Pulsar Tab en `/portal/dashboard` y activar «Saltar al contenido principal»: la URL NO cambia y el foco queda en el contenido.
- «Saltar al juego» solo aparece dentro de un caso (`/portal/simulador/<id>`).
- Pestaña del navegador: dice el nombre de la página («Rúbricas · SIEP», «Iniciar sesión · SIEP»).
- Login: con el panel de acceso visible, Tab nunca entra a los campos invisibles de «Solicitar acceso».
- Menú móvil cerrado: Tab no recorre sus enlaces. Abierto: Esc lo cierra y el foco vuelve al botón.
- Diálogo de confirmación: al abrir, el foco va a «Cancelar»; Tab no sale del diálogo; Esc cancela salvo mientras dice «Procesando…».

## Problema

`frontend/src/app/app.component.ts:9-14` (actual):

```ts
  template: `
    <a class="psy-skip-link" href="#main-content">Saltar al contenido principal</a>
    <a class="psy-skip-link" href="#game-area">Saltar al juego</a>
    <app-notification-host />
    <router-outlet />
  `
```

`id="main-content"` solo existe en `simulation-play.component.ts:64` y `character-editor.component.ts:28`; `id="game-area"` solo en el simulador. `frontend/src/index.html:6` tiene `<base href="/">`.

`frontend/src/app/app.routes.ts`: ninguna ruta define `title`. `frontend/src/index.html:5` fija `SIEP | Sistema de Entrenamiento Psicosocial` para todas.

`frontend/src/app/app.config.ts:15-22` (actual):

```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([jwtInterceptor])),
    provideAnimationsAsync(),
    { provide: APP_INITIALIZER, useFactory: initializeAuth, multi: true }
  ]
};
```

Login (`frontend/src/app/features/login/login.component.html`): los dos formularios (`.form-container.sign-up` en la línea 17 y `.form-container.sign-in` en la 65) y los dos paneles (`.toggle-panel.toggle-left` en la 179 y `.toggle-panel.toggle-right` en la 215) están siempre en el DOM; el que no se ve solo está desplazado u opaco (`login.component.scss:469-490`, `:721-736`). Hay cuatro `<h1>`: líneas 29, 77, 210 y 246. La visibilidad depende de `showRegister()` (`login.component.ts:70`): con `true` se ven `sign-up` y `toggle-left`; con `false`, `sign-in` y `toggle-right`.

Menú móvil (`frontend/src/app/shared/layout/shell.component.ts:71` y `:116-126`, actual):

```html
        <section class="siep-mobile-nav" [class.is-open]="menuOpen" aria-label="Navegacion movil SIEP">
```

```html
          <button
            class="siep-menu-trigger"
            type="button"
            aria-label="Abrir menu de navegacion"
            [class.is-hidden]="menuOpen"
            (click)="toggleMenu()"
          >
```

Botón de cierre (`:76-81`): `aria-label="Cerrar menu de navegacion"`. `menuOpen` es un campo booleano (`shell.component.ts:~656`); `toggleMenu()` y `closeMenu()` están en `:713-720`.

Diálogo de confirmación (`frontend/src/app/shared/confirm/confirm-dialog.component.ts`, actual): `role="dialog"` en el fondo, sin foco inicial, sin atrapar el foco, sin Esc, sin cerrar por clic fuera, sin devolver el foco al cerrar, id de título fijo (`'app-confirm-dialog-title'`).

## Convenciones del repo

- Trampa de foco ya usada: `simulation-play.component.ts:1,59,96` (`import { A11yModule } from '@angular/cdk/a11y'`, `cdkTrapFocus [cdkTrapFocusAutoCapture]="true"`, `cdkFocusInitial`).
- Specs de componente con TestBed: `frontend/src/app/features/simulator/dialogue-panel.component.spec.ts`. Pruebas de fuente: `frontend/src/app/features/simulator/scene-renderer.registry.spec.ts`.
- Jest: `npm test --prefix frontend -- --runInBand <ruta del spec>`.

---

### Task 1: Título por página

**Files:**
- Create: `frontend/src/app/core/title/siep-title.strategy.ts`
- Create: `frontend/src/app/core/title/siep-title.strategy.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.config.ts`

**Interfaces:**
- Produces: `SiepTitleStrategy` y la constante `SIEP_DEFAULT_TITLE`.

- [ ] **Step 1: Escribir las pruebas**

```ts
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Route, Router, TitleStrategy, provideRouter } from '@angular/router';

import { routes } from '../../app.routes';
import { SIEP_DEFAULT_TITLE, SiepTitleStrategy } from './siep-title.strategy';

@Component({ standalone: true, template: '' })
class BlankComponent {}

describe('SiepTitleStrategy', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'con-titulo', title: 'Rúbricas', component: BlankComponent },
        { path: 'sin-titulo', component: BlankComponent },
      ]),
      { provide: TitleStrategy, useClass: SiepTitleStrategy },
    ],
  }));

  it('antepone el nombre de la página a SIEP', async () => {
    await TestBed.inject(Router).navigateByUrl('/con-titulo');
    expect(TestBed.inject(Title).getTitle()).toBe('Rúbricas · SIEP');
  });

  it('usa el título institucional si la ruta no define uno', async () => {
    await TestBed.inject(Router).navigateByUrl('/sin-titulo');
    expect(TestBed.inject(Title).getTitle()).toBe(SIEP_DEFAULT_TITLE);
  });
});

describe('rutas de la app', () => {
  function pages(list: Route[]): Route[] {
    return list.flatMap(route => [
      ...(route.loadComponent ? [route] : []),
      ...pages(route.children ?? []),
    ]);
  }

  it('toda página cargable tiene un título', () => {
    const untitled = pages(routes).filter(route => typeof route.title !== 'string' || !route.title.trim());
    expect(untitled.map(route => route.path)).toEqual([]);
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/core/title/siep-title.strategy.spec.ts`
Expected: FAIL (`Cannot find module './siep-title.strategy'`).

- [ ] **Step 2: Implementar la estrategia**

`frontend/src/app/core/title/siep-title.strategy.ts`:

```ts
import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const SIEP_DEFAULT_TITLE = 'SIEP | Sistema de Entrenamiento Psicosocial';

/** Título de pestaña por página: «<Página> · SIEP». Lo anuncian los lectores de pantalla. */
@Injectable({ providedIn: 'root' })
export class SiepTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    this.title.setTitle(pageTitle ? `${pageTitle} · SIEP` : SIEP_DEFAULT_TITLE);
  }
}
```

- [ ] **Step 3: Registrar la estrategia**

En `app.config.ts`, cambiar el import del router a:

```ts
import { TitleStrategy, provideRouter } from '@angular/router';
```

añadir:

```ts
import { SiepTitleStrategy } from './core/title/siep-title.strategy';
```

y, dentro de `providers`, justo debajo de `provideRouter(routes),`:

```ts
    { provide: TitleStrategy, useClass: SiepTitleStrategy },
```

- [ ] **Step 4: Títulos en las rutas**

En `app.routes.ts`, añadir la propiedad `title` a cada ruta con `loadComponent` (inmediatamente después de `path`):

| `path` | `title` |
| --- | --- |
| `''` (portada) | `'Inicio'` |
| `'login'` | `'Iniciar sesión'` |
| `'portal'` (shell) | `'Portal'` |
| `'dashboard'` | `'Panel'` |
| `'jugar'` | `'Sala de simulación'` |
| `'simulador'` | `'Catálogo de casos'` |
| `'simulador/:caseVersionId'` | `'Simulación'` |
| `'personaje'` | `'Mi personaje'` |
| `'casos'` | `'Gestión de casos'` |
| `'casos/:caseVersionId/editor'` | `'Editor de caso'` |
| `'docente/trazabilidad'` | `'Trazabilidad docente'` |
| `'rubricas'` | `'Rúbricas'` |
| `'grupos'` | `'Grupos'` |
| `'reportes'` | `'Reportes'` |
| `'admin/usuarios'` | `'Usuarios'` |

Ejemplo del resultado:

```ts
  {
    path: 'login',
    title: 'Iniciar sesión',
    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent)
  },
```

NO añadir `title` a las rutas `redirectTo`.

- [ ] **Step 5: Pruebas y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/core/title/siep-title.strategy.spec.ts`
Expected: PASS (3 pruebas).

```bash
git add frontend/src/app/core/title frontend/src/app/app.routes.ts frontend/src/app/app.config.ts
git commit -m "feat(a11y): título de pestaña por página"
```

---

### Task 2: Enlaces de salto que funcionan

**Files:**
- Modify: `frontend/src/app/app.component.ts`
- Create: `frontend/src/app/app.component.spec.ts`
- Modify: `frontend/src/styles/styles.scss` (junto al bloque `/** Skip links … */`, línea ~648)

**Interfaces:**
- Produces: `AppComponent.skipTo(event: Event, targetId: string): void` y `AppComponent.isGameRoute` (signal computado).

- [ ] **Step 1: Escribir las pruebas**

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

describe('AppComponent: enlaces de salto', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [provideRouter([])],
  }));

  afterEach(() => document.querySelectorAll('[data-test-target]').forEach(node => node.remove()));

  function render() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('lleva el foco al primer <main> sin navegar', () => {
    const main = document.createElement('main');
    main.setAttribute('data-test-target', '');
    document.body.appendChild(main);

    const link = render().nativeElement.querySelector('a.psy-skip-link') as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(main);
  });

  it('prefiere #main-content cuando existe', () => {
    const main = document.createElement('main');
    main.setAttribute('data-test-target', '');
    const content = document.createElement('div');
    content.id = 'main-content';
    content.setAttribute('data-test-target', '');
    document.body.append(main, content);

    const link = render().nativeElement.querySelector('a.psy-skip-link') as HTMLAnchorElement;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(content);
  });

  it('solo ofrece «Saltar al juego» dentro de un caso', () => {
    const links = render().nativeElement.querySelectorAll('a.psy-skip-link');
    expect(links.length).toBe(1);
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/app.component.spec.ts`
Expected: FAIL (el clic no se intercepta y hay dos enlaces).

- [ ] **Step 2: Implementar**

Reemplazar el contenido de `frontend/src/app/app.component.ts` por:

```ts
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { NotificationHostComponent } from './shared/notifications/notification-host.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NotificationHostComponent],
  template: `
    <a class="psy-skip-link" href="#main-content" (click)="skipTo($event, 'main-content')">Saltar al contenido principal</a>
    @if (isGameRoute()) {
      <a class="psy-skip-link" href="#game-area" (click)="skipTo($event, 'game-area')">Saltar al juego</a>
    }
    <app-notification-host />
    <router-outlet />
  `
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Solo dentro de un caso existe #game-area. */
  readonly isGameRoute = computed(() => /\/portal\/simulador\/\d+/.test(this.url()));

  /**
   * Con <base href="/">, un href="#x" navega a "/#x" (la portada). Se
   * intercepta el clic y se mueve el foco al destino o, si no existe, al
   * primer <main> de la página.
   */
  skipTo(event: Event, targetId: string): void {
    event.preventDefault();
    const target = document.getElementById(targetId) ?? document.querySelector<HTMLElement>('main');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
  }
}
```

- [ ] **Step 3: Sin contorno grande en el contenedor enfocado por script**

En `styles.scss`, justo después del bloque `.psy-skip-link:focus, .skip-link:focus { … }`, añadir:

```scss
/* Destino de los enlaces de salto: recibe el foco por script, sin contorno de control. */
main[tabindex="-1"]:focus,
#main-content:focus {
  outline: none;
}
```

- [ ] **Step 4: Pruebas y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/app.component.spec.ts`
Expected: PASS (3 pruebas).

```bash
git add frontend/src/app/app.component.ts frontend/src/app/app.component.spec.ts frontend/src/styles/styles.scss
git commit -m "fix(a11y): los enlaces de salto enfocan el contenido en vez de navegar a la portada"
```

---

### Task 3: Login sin formularios invisibles enfocables

**Files:**
- Modify: `frontend/src/app/features/login/login.component.html:17`, `:65`, `:179`, `:210`, `:215`, `:246`
- Modify: `frontend/src/app/features/login/login.component.scss:694-698`
- Create: `frontend/src/app/features/login/login.a11y.spec.ts`

- [ ] **Step 1: Escribir la prueba**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(__dirname, 'login.component.html'), 'utf-8');
const scss = readFileSync(join(__dirname, 'login.component.scss'), 'utf-8');

describe('login: accesibilidad de los paneles', () => {
  it('el formulario y el panel que no se ven son inertes', () => {
    expect(html).toContain('<div class="form-container sign-up" [attr.inert]="showRegister() ? null : \'\'">');
    expect(html).toContain('<div class="form-container sign-in" [attr.inert]="showRegister() ? \'\' : null">');
    expect(html).toContain('<div class="toggle-panel toggle-left" [attr.inert]="showRegister() ? null : \'\'">');
    expect(html).toContain('<div class="toggle-panel toggle-right" [attr.inert]="showRegister() ? \'\' : null">');
  });

  it('solo los formularios tienen h1; los paneles usan h2', () => {
    expect((html.match(/<h1\b/g) ?? []).length).toBe(2);
    expect(html).toContain('<h2>¡Bienvenido de nuevo!</h2>');
    expect(html).toContain('<h2>¿Nuevo en {{ brand.shortName }}?</h2>');
    expect(scss).toContain('.toggle-panel h2 {');
    expect(scss).not.toContain('.toggle-panel h1 {');
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/features/login/login.a11y.spec.ts`
Expected: FAIL.

- [ ] **Step 2: `inert` en los paneles**

En `login.component.html`:
- Línea 17: `<div class="form-container sign-up">` → `<div class="form-container sign-up" [attr.inert]="showRegister() ? null : ''">`
- Línea 65: `<div class="form-container sign-in">` → `<div class="form-container sign-in" [attr.inert]="showRegister() ? '' : null">`
- Línea 179: `<div class="toggle-panel toggle-left">` → `<div class="toggle-panel toggle-left" [attr.inert]="showRegister() ? null : ''">`
- Línea 215: `<div class="toggle-panel toggle-right">` → `<div class="toggle-panel toggle-right" [attr.inert]="showRegister() ? '' : null">`

(Los elementos `inert` salen del orden de tabulación y del árbol de accesibilidad; el formulario visible conserva su `h1`.)

- [ ] **Step 3: Títulos de los paneles a `h2`**

- Línea 210: `<h1>¡Bienvenido de nuevo!</h1>` → `<h2>¡Bienvenido de nuevo!</h2>`
- Línea 246: `<h1>¿Nuevo en {{ brand.shortName }}?</h1>` → `<h2>¿Nuevo en {{ brand.shortName }}?</h2>`

En `login.component.scss:694-698`, reemplazar:

```scss
.toggle-panel h1 {
  color: #fff;
  font-size: 1.55rem;
  margin: 0 0 10px;
}
```

por (incluye el peso que antes heredaba de `.auth-container h1`):

```scss
.toggle-panel h2 {
  color: #fff;
  font-size: 1.55rem;
  font-weight: 800;
  margin: 0 0 10px;
}
```

- [ ] **Step 4: Pruebas y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/features/login/login.a11y.spec.ts`
Expected: PASS.

```bash
git add frontend/src/app/features/login
git commit -m "fix(a11y): el login no deja enfocar el panel oculto y usa un solo h1 por vista"
```

---

### Task 4: Menú móvil del portal

**Files:**
- Modify: `frontend/src/app/shared/layout/shell.component.ts` (imports, `:71`, `:76-81`, `:116-126`, métodos `:713-720`)
- Create: `frontend/src/app/shared/layout/shell.a11y.spec.ts`

- [ ] **Step 1: Escribir la prueba**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'shell.component.ts'), 'utf-8');

describe('shell: menú móvil accesible', () => {
  it('el panel cerrado es inerte y está identificado', () => {
    expect(source).toMatch(/class="siep-mobile-nav"[^>]*id="siep-mobile-nav"/);
    expect(source).toContain('[attr.inert]="menuOpen ? null : \'\'"');
    expect(source).toContain('aria-label="Navegación móvil SIEP"');
  });

  it('el botón anuncia su estado y a qué controla', () => {
    expect(source).toContain('aria-controls="siep-mobile-nav"');
    expect(source).toContain('[attr.aria-expanded]="menuOpen"');
    expect(source).toContain('aria-label="Abrir menú de navegación"');
    expect(source).toContain('aria-label="Cerrar menú de navegación"');
  });

  it('Esc cierra el menú y devuelve el foco al botón', () => {
    expect(source).toContain("@HostListener('document:keydown.escape')");
    expect(source).toMatch(/onEscape\(\): void \{\s*if \(!this\.menuOpen\) return;\s*this\.closeMenu\(\);\s*this\.menuTrigger\?\.nativeElement\.focus\(\);/);
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/shared/layout/shell.a11y.spec.ts`
Expected: FAIL.

- [ ] **Step 2: Imports**

Cambiar la línea `import { Component, OnDestroy, computed, inject, signal } from '@angular/core';` por:

```ts
import { Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
```

- [ ] **Step 3: Panel del menú**

Línea 71, reemplazar por:

```html
        <section
          class="siep-mobile-nav"
          id="siep-mobile-nav"
          [class.is-open]="menuOpen"
          [attr.inert]="menuOpen ? null : ''"
          aria-label="Navegación móvil SIEP"
        >
```

En el botón de cierre (líneas 76-81), cambiar `aria-label="Cerrar menu de navegacion"` por `aria-label="Cerrar menú de navegación"`.

- [ ] **Step 4: Botón que abre el menú**

Reemplazar las líneas 116-122:

```html
          <button
            class="siep-menu-trigger"
            type="button"
            aria-label="Abrir menu de navegacion"
            [class.is-hidden]="menuOpen"
            (click)="toggleMenu()"
          >
```

por:

```html
          <button
            #menuTrigger
            class="siep-menu-trigger"
            type="button"
            aria-label="Abrir menú de navegación"
            aria-controls="siep-mobile-nav"
            [attr.aria-expanded]="menuOpen"
            [class.is-hidden]="menuOpen"
            (click)="toggleMenu()"
          >
```

- [ ] **Step 5: Esc cierra y devuelve el foco**

En la clase, justo encima de `toggleMenu(): void {`, añadir:

```ts
  @ViewChild('menuTrigger') private menuTrigger?: ElementRef<HTMLButtonElement>;

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.menuOpen) return;
    this.closeMenu();
    this.menuTrigger?.nativeElement.focus();
  }

```

- [ ] **Step 6: Pruebas y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/shared/layout/shell.a11y.spec.ts src/app/shared/layout/shell.component.spec.ts`
Expected: PASS.

```bash
git add frontend/src/app/shared/layout
git commit -m "fix(a11y): menú móvil inerte al cerrarse, con estado anunciado y cierre con Esc"
```

---

### Task 5: Diálogo de confirmación

**Files:**
- Modify: `frontend/src/app/shared/confirm/confirm-dialog.component.ts`
- Create: `frontend/src/app/shared/confirm/confirm-dialog.component.spec.ts`

**Interfaces:**
- Consumes: inputs y outputs actuales (`open`, `title`, `message`, `confirmLabel`, `loading`, `cancel`, `confirm`); no cambian, así que `users.component.ts` y `case-editor.component.ts` no se tocan.

- [ ] **Step 1: Escribir las pruebas**

```ts
import { TestBed } from '@angular/core/testing';

import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ConfirmDialogComponent] }));

  function render(loading = false) {
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('loading', loading);
    fixture.componentRef.setInput('message', 'Se eliminará el grupo.');
    fixture.detectChanges();
    const cancelSpy = jest.fn();
    fixture.componentInstance.cancel.subscribe(cancelSpy);
    return { fixture, cancelSpy, root: fixture.nativeElement as HTMLElement };
  }

  it('se anuncia como alerta con título y descripción', () => {
    const { root } = render();
    const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('aria-modal')).toBe('true');
    const describedBy = panel.getAttribute('aria-describedby') as string;
    expect(root.querySelector(`#${describedBy}`)?.textContent).toContain('Se eliminará el grupo.');
  });

  it('Esc cancela', () => {
    const { root, cancelSpy } = render();
    root.querySelector('[role="alertdialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('Esc no cancela mientras procesa', () => {
    const { root, cancelSpy } = render(true);
    root.querySelector('[role="alertdialog"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelSpy).not.toHaveBeenCalled();
  });

  it('clic en el fondo cancela; clic dentro del panel no', () => {
    const { root, cancelSpy } = render();
    (root.querySelector('[role="alertdialog"]') as HTMLElement).click();
    expect(cancelSpy).not.toHaveBeenCalled();
    (root.querySelector('.confirm-backdrop') as HTMLElement).click();
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('el foco inicial va a «Cancelar» y queda atrapado en el panel', () => {
    const { root } = render();
    const [cancelButton] = Array.from(root.querySelectorAll('button'));
    expect(cancelButton.textContent).toContain('Cancelar');
    expect(cancelButton.hasAttribute('cdkFocusInitial')).toBe(true);
    expect(root.querySelector('[cdkTrapFocus]')).not.toBeNull();
  });

  it('dos diálogos no comparten ids', () => {
    const first = render().root.querySelector('h3')!.id;
    const second = render().root.querySelector('h3')!.id;
    expect(first).not.toBe(second);
  });
});
```

Run: `npm test --prefix frontend -- --runInBand src/app/shared/confirm/confirm-dialog.component.spec.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar**

En `confirm-dialog.component.ts`:

Imports:

```ts
import { A11yModule } from '@angular/cdk/a11y';
import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

let nextConfirmDialogId = 0;
```

En el decorador: `imports: [MatIconModule, A11yModule],`.

Reemplazar la plantilla completa por:

```html
    @if (open()) {
      <div class="confirm-backdrop" (click)="onBackdropClick($event)" (keydown.escape)="onEscape()">
        <div
          class="confirm-panel"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-labelledby]="dialogTitleId"
          [attr.aria-describedby]="dialogMessageId"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
        >
          <h3 [id]="dialogTitleId">{{ title() }}</h3>
          <p [id]="dialogMessageId">{{ message() }}</p>
          <div class="confirm-actions">
            <button
              type="button"
              class="psy-button psy-button--ghost"
              cdkFocusInitial
              (click)="cancel.emit()"
              [disabled]="loading()"
            >
              Cancelar
            </button>
            <button
              type="button"
              class="psy-button psy-button--primary"
              (click)="confirm.emit()"
              [disabled]="loading()"
            >
              @if (loading()) {
                Procesando…
              } @else {
                {{ confirmLabel() }}
              }
            </button>
          </div>
        </div>
      </div>
    }
```

En la clase, reemplazar `readonly dialogTitleId = 'app-confirm-dialog-title';` por:

```ts
  private readonly instanceId = ++nextConfirmDialogId;
  readonly dialogTitleId = `app-confirm-dialog-title-${this.instanceId}`;
  readonly dialogMessageId = `app-confirm-dialog-message-${this.instanceId}`;
```

y añadir al final de la clase:

```ts
  onEscape(): void {
    if (!this.loading()) this.cancel.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.loading()) this.cancel.emit();
  }
```

Los estilos no cambian.

- [ ] **Step 3: Pruebas, suite completa, build y commit**

Run: `npm test --prefix frontend -- --runInBand src/app/shared/confirm/confirm-dialog.component.spec.ts`
Expected: PASS (6 pruebas).

Run: `npm run test:frontend` y `npm run build:frontend`
Expected: todo en verde.

```bash
git add frontend/src/app/shared/confirm
git commit -m "fix(a11y): diálogo de confirmación con foco atrapado, Esc y cierre por clic fuera"
```

## Límites

- NO cambiar estilos ni animaciones del login, del menú móvil ni del diálogo (salvo `.toggle-panel h2`).
- NO sustituir `window.confirm` de Grupos en este plan (es otro trabajo).
- NO tocar `game-route.util.ts` (tiene su propia semántica para el modo juego).
- NO añadir `id="main-content"` al `<main>` del shell: ya existe dentro del simulador y del editor de personaje, y un id duplicado rompería el salto.

## Verificación

- **Mecánica:** los cuatro specs nuevos y `shell.component.spec.ts` en verde; `npm run test:frontend` y `npm run build:frontend` en verde.
- **Revisión con teclado** (`npm run up`, http://localhost:4200):
  - En `/portal/dashboard`, pulsar Tab una vez y Enter sobre «Saltar al contenido principal»: la URL sigue siendo `/portal/dashboard` y el siguiente Tab cae en el contenido, no en la barra lateral.
  - Dentro de un caso: aparecen los dos enlaces de salto; «Saltar al juego» lleva al área del juego.
  - La pestaña del navegador cambia de nombre al navegar (Panel, Catálogo de casos, Rúbricas…).
  - Login: Tab recorre solo los campos visibles. Pulsar «Solicitar acceso» y repetir: ahora solo los del registro.
  - Con la ventana a menos de 920 px: con el menú cerrado, Tab no entra al menú. Abrirlo, pulsar Esc: se cierra y el foco vuelve al botón.
  - En Usuarios, desactivar un usuario: el foco va a «Cancelar», Tab no sale del diálogo, Esc lo cierra y el foco vuelve al botón que lo abrió.
  - Con un lector de pantalla (NVDA o Narrador): al abrir el diálogo se lee el título y el mensaje.
- **Hecho cuando:** todas las comprobaciones anteriores se cumplen solo con teclado.
