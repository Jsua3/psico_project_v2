# 14 — Pantalla de arranque y sesión que no bloquea — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Estado:** TODO
- **Commit base:** `02bbfe9` (rama `feat/ui-mes`). Independiente de los planes 09-13.
- **Severidad:** MEDIA (pantalla en blanco al abrir; con el backend lento, la app no aparece)
- **Categoría:** Estados de carga / rendimiento percibido
- **Alcance estimado:** 1 util nuevo, `index.html`, `app.config.ts`; 3 specs nuevos

**Goal:** Que al abrir SIEP se vea de inmediato una pantalla de arranque con la marca, que la aplicación no espere más de 1,5 s al servidor para pintarse y que, si algo impide arrancar, el usuario vea cómo recargar.

**Architecture:**
- **Pantalla de arranque:** hoy `<app-root>` está vacío. Mientras se descarga y ejecuta el bundle inicial (hasta ~850 KB) y se resuelve la sesión, la página queda en blanco. Se pone dentro de `<app-root>` una pantalla de arranque en HTML y CSS en línea: marca, «Cargando SIEP…» e indicador. Angular reemplaza el contenido de `<app-root>` al arrancar, así que desaparece sola, sin JavaScript. Aparece con 200 ms de retraso para no parpadear en cargas rápidas. Un script en línea muestra, a los 12 s, un aviso con «Recargar» por si el bundle no llega o falla el arranque. Con `<noscript>` se explica que hace falta JavaScript.
- **Sesión:** `APP_INITIALIZER` espera `firstValueFrom(auth.syncCurrentUser())`, es decir, un GET a `/api/auth/me`, antes de pintar nada. Sin embargo, `AuthService.currentUser` ya se inicializa desde el JWT de `localStorage`, y los guards solo miran el token, así que `/me` solo completa nombre y apellido. Se pasa a `provideAppInitializer` y se limita la espera con `settleWithin(…, 1500)`. Si `/me` tarda más, la app se pinta igual y el nombre llega cuando responda. Si `/me` falla con 401/403, `jwt.interceptor.ts` ya limpia la sesión y redirige al login, también después de pintar.

**Tech Stack:** Angular 21 (`provideAppInitializer`), HTML/CSS en línea, Jest 30.

**Spec:** Auditoría del 2026-09-29, «Pantalla de arranque» (prioridad del mes n.º 14). Este plan es autocontenido.

## Global Constraints

- Todas las rutas son relativas a la raíz del repo.
- No añadir dependencias ni archivos externos para la pantalla de arranque: todo en línea en `index.html`, salvo el favicon SVG que ya existe (`/assets/favicon-siep.svg`).
- Colores de la marca, copiados de `frontend/src/styles/styles.scss`: fondo `#F2F2F2`, azul `#004876`, texto atenuado `#5F6B76`.
- No cambiar la firma ni el comportamiento de `AuthService.syncCurrentUser()` ni de los guards.
- Textos visibles en español con tildes. Commits en español `tipo(ámbito): descripción`.
- Si un fragmento «Actual» no coincide con el archivo (drift), DETENERSE y reportar.

## Review Focus

- Con el backend caído, la app se pinta en ≤ 1,5 s más el tiempo del bundle, y la portada o el login son usables. El aviso de «sin conexión» del interceptor aparece una sola vez.
- Con un token vencido o inválido, igual se llega al login. No aparece un portal vacío que luego rebota.
- Con movimiento reducido, la pantalla de arranque no anima el indicador.
- Si el bundle nunca llega (servidor de estáticos caído a mitad de carga), a los 12 s aparece «Recargar» y funciona con teclado.
- En una carga rápida con caché, la pantalla de arranque no llega a verse (sin destello).

## Problema

`frontend/src/index.html` (líneas 16-18), actual:

```html
<body>
  <app-root></app-root>
</body>
```

`frontend/src/app/app.config.ts`, actual:

```ts
import { APP_INITIALIZER, ApplicationConfig, inject } from '@angular/core';
…
function initializeAuth() {
  const auth = inject(AuthService);
  return () => firstValueFrom(auth.syncCurrentUser());
}
…
    { provide: APP_INITIALIZER, useFactory: initializeAuth, multi: true }
```

`APP_INITIALIZER` está obsoleto desde Angular 19. `syncCurrentUser()` ya atrapa sus errores y devuelve `of(null)`, pero una petición colgada (sin respuesta del servidor) retiene el arranque hasta que el navegador la corta.

---

### Task 1: La sesión se valida sin bloquear el arranque más de 1,5 s

**Files:**
- Create: `frontend/src/app/core/auth/settle-within.util.ts`
- Create: `frontend/src/app/core/auth/settle-within.util.spec.ts`
- Create: `frontend/src/app/app.config.spec.ts`
- Modify: `frontend/src/app/app.config.ts`

**Interfaces:**
- Consumes: `AuthService.syncCurrentUser(): Observable<User | null>` (sin cambios).
- Produces: `settleWithin<T>(work: Promise<T>, budgetMs: number): Promise<T | undefined>`.

- [ ] **Step 1: Escribir los specs que fallan**

Crear `frontend/src/app/core/auth/settle-within.util.spec.ts`:

```ts
import { settleWithin } from './settle-within.util';

describe('settleWithin', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('devuelve el resultado si llega dentro del plazo y no deja temporizadores', async () => {
    await expect(settleWithin(Promise.resolve('ok'), 1500)).resolves.toBe('ok');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('no espera más del plazo; el trabajo sigue en segundo plano', async () => {
    let finish!: (value: string) => void;
    const work = new Promise<string>(resolve => { finish = resolve; });
    const result = settleWithin(work, 1500);

    jest.advanceTimersByTime(1500);
    await expect(result).resolves.toBeUndefined();

    finish('tarde');
    await expect(work).resolves.toBe('tarde');
  });

  it('un fallo no bloquea el arranque', async () => {
    await expect(settleWithin(Promise.reject(new Error('red')), 1500)).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
});
```

Crear `frontend/src/app/app.config.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'app.config.ts'), 'utf-8');

describe('app.config: arranque', () => {
  it('valida la sesión sin bloquear el primer pintado más de 1,5 s', () => {
    expect(source).not.toContain('APP_INITIALIZER');
    expect(source).toContain('const AUTH_SYNC_BUDGET_MS = 1500;');
    expect(source).toMatch(
      /provideAppInitializer\(\(\) => \{\s*const auth = inject\(AuthService\);\s*return settleWithin\(firstValueFrom\(auth\.syncCurrentUser\(\)\), AUTH_SYNC_BUDGET_MS\);\s*\}\)/,
    );
  });
});
```

- [ ] **Step 2: Ejecutar los specs y verlos fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/core/auth/settle-within.util.spec.ts src/app/app.config.spec.ts`
Expected: FAIL (módulo inexistente; el contrato encuentra `APP_INITIALIZER`).

- [ ] **Step 3: Crear el util**

Crear `frontend/src/app/core/auth/settle-within.util.ts`:

```ts
/**
 * Espera `work` como mucho `budgetMs`. Si llega a tiempo devuelve su valor; si
 * no, o si falla, devuelve `undefined` sin cancelar el trabajo, que sigue en
 * segundo plano. Sirve para que un inicializador no retenga el primer pintado.
 */
export function settleWithin<T>(work: Promise<T>, budgetMs: number): Promise<T | undefined> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(undefined), budgetMs);
    work.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}
```

- [ ] **Step 4: Cambiar `app.config.ts`**

Reemplazar el contenido completo de `frontend/src/app/app.config.ts` por:

```ts
import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { TitleStrategy, provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { jwtInterceptor } from './core/auth/jwt.interceptor';
import { AuthService } from './core/auth/auth.service';
import { settleWithin } from './core/auth/settle-within.util';
import { SiepTitleStrategy } from './core/title/siep-title.strategy';

/**
 * Lo máximo que el arranque espera a `/api/auth/me`. El usuario ya sale del JWT
 * (los guards solo miran el token): `/me` completa nombre y apellido y, si falla
 * con 401/403, el interceptor limpia la sesión y lleva al login aunque ya se haya pintado.
 */
const AUTH_SYNC_BUDGET_MS = 1500;

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    { provide: TitleStrategy, useClass: SiepTitleStrategy },
    provideHttpClient(withInterceptors([jwtInterceptor])),
    provideAnimationsAsync(),
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      return settleWithin(firstValueFrom(auth.syncCurrentUser()), AUTH_SYNC_BUDGET_MS);
    }),
  ]
};
```

- [ ] **Step 5: Ejecutar los specs y verlos pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/core/auth/settle-within.util.spec.ts src/app/app.config.spec.ts src/app/app.component.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/auth/settle-within.util.ts frontend/src/app/core/auth/settle-within.util.spec.ts frontend/src/app/app.config.ts frontend/src/app/app.config.spec.ts
git commit -m "perf(arranque): validar la sesión sin retener el primer pintado más de 1,5 s"
```

---

### Task 2: Pantalla de arranque en `index.html`

**Files:**
- Modify: `frontend/src/index.html`
- Create: `frontend/src/app/boot-splash.contract.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada (HTML estático que Angular reemplaza al arrancar).

- [ ] **Step 1: Escribir el spec que falla**

Crear `frontend/src/app/boot-splash.contract.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(__dirname, '../index.html'), 'utf-8');

describe('index.html: pantalla de arranque', () => {
  it('vive dentro de <app-root> para que Angular la reemplace al arrancar', () => {
    expect(html).toMatch(/<app-root>\s*<div class="siep-boot" role="status">/);
    expect(html).toContain('<p class="siep-boot__label">Cargando SIEP…</p>');
  });

  it('aparece con retraso para no destellar en cargas rápidas y respeta el movimiento reducido', () => {
    expect(html).toContain('animation: siep-boot-in 240ms ease-out 200ms both;');
    expect(html).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.siep-boot__bar::after \{ animation: none;/);
  });

  it('ofrece recargar si el arranque se atasca y avisa sin JavaScript', () => {
    expect(html).toContain('<div class="siep-boot__slow" hidden>');
    expect(html).toContain('<button type="button" class="siep-boot__reload" onclick="location.reload()">Recargar</button>');
    expect(html).toMatch(/setTimeout\(function \(\) \{[\s\S]*?\.siep-boot__slow[\s\S]*?\}, 12000\);/);
    expect(html).toContain('<noscript>');
  });

  it('usa los colores de la marca', () => {
    for (const color of ['#F2F2F2', '#004876', '#5F6B76']) expect(html).toContain(color);
  });
});
```

- [ ] **Step 2: Ejecutar el spec y verlo fallar**

Run: `npm test --prefix frontend -- --runInBand src/app/boot-splash.contract.spec.ts`
Expected: FAIL (4 pruebas).

- [ ] **Step 3: Estilos en línea**

En `frontend/src/index.html`, justo antes de `</head>`, añadir:

```html
  <style>
    /* Pantalla de arranque: se ve mientras llega el bundle; Angular la reemplaza al arrancar. */
    .siep-boot {
      position: fixed;
      inset: 0;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 14px;
      background: #F2F2F2;
      color: #5F6B76;
      font: 500 15px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
      text-align: center;
      animation: siep-boot-in 240ms ease-out 200ms both;
    }
    .siep-boot__mark { display: block; width: 64px; height: 64px; }
    .siep-boot__label { margin: 0; }
    .siep-boot__bar {
      position: relative;
      width: 120px;
      height: 3px;
      border-radius: 999px;
      background: rgba(0, 72, 118, .14);
      overflow: hidden;
    }
    .siep-boot__bar::after {
      content: '';
      position: absolute;
      inset: 0;
      width: 40%;
      border-radius: inherit;
      background: #004876;
      animation: siep-boot-slide 1100ms cubic-bezier(.65, 0, .35, 1) infinite;
    }
    .siep-boot__slow { display: grid; gap: 10px; justify-items: center; max-width: 30ch; }
    .siep-boot__slow[hidden] { display: none; }
    .siep-boot__slow p { margin: 0; }
    .siep-boot__reload {
      min-height: 44px;
      padding: 0 20px;
      border: 0;
      border-radius: 999px;
      background: #004876;
      color: #FFFFFF;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .siep-boot__reload:focus-visible { outline: 3px solid #0B5A8A; outline-offset: 3px; }
    @keyframes siep-boot-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes siep-boot-slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
    @media (prefers-reduced-motion: reduce) {
      .siep-boot__bar::after { animation: none; width: 100%; opacity: .5; }
    }
  </style>
```

- [ ] **Step 4: Marcado y script**

Reemplazar:

```html
<body>
  <app-root></app-root>
</body>
```

por:

```html
<body>
  <app-root>
    <div class="siep-boot" role="status">
      <img class="siep-boot__mark" src="/assets/favicon-siep.svg" alt="" width="64" height="64">
      <p class="siep-boot__label">Cargando SIEP…</p>
      <div class="siep-boot__bar" aria-hidden="true"></div>
      <div class="siep-boot__slow" hidden>
        <p>Esto está tardando más de lo normal. Revisa tu conexión y vuelve a intentarlo.</p>
        <button type="button" class="siep-boot__reload" onclick="location.reload()">Recargar</button>
      </div>
    </div>
  </app-root>
  <noscript>
    <p style="margin:0;padding:24px;font:500 16px/1.5 system-ui,sans-serif;color:#101820;background:#F2F2F2;text-align:center">
      SIEP necesita JavaScript para funcionar. Actívalo en tu navegador y recarga la página.
    </p>
  </noscript>
  <script>
    // Si a los 12 s Angular todavía no reemplazó la pantalla de arranque, ofrecer recargar.
    setTimeout(function () {
      var slow = document.querySelector('.siep-boot .siep-boot__slow');
      if (slow) slow.hidden = false;
    }, 12000);
  </script>
</body>
```

- [ ] **Step 5: Ejecutar el spec y verlo pasar**

Run: `npm test --prefix frontend -- --runInBand src/app/boot-splash.contract.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build:frontend`
Expected: sin errores. Comprobar que `frontend/dist/**/index.html` conserva el bloque `siep-boot` y el `<script>` en línea (el builder inyecta sus propios `<script type="module">` después).

- [ ] **Step 7: e2e de humo**

Run: `npm run test:e2e -- lobby fonts`
Expected: PASS. Ambos arrancan la app desde cero y esperan contenido real, así que confirman que Angular reemplaza la pantalla de arranque.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/index.html frontend/src/app/boot-splash.contract.spec.ts
git commit -m "feat(arranque): pantalla de arranque con marca, aviso de recarga y noscript"
```

---

## Verificación final

- [ ] `npm run test:frontend` → todo en verde.
- [ ] `npm run build:frontend` → sin errores ni avisos nuevos de presupuesto.
- [ ] **Comprobación a mano** (Chrome, `npm start --prefix frontend`):
  1. DevTools → Network → *Slow 3G*, recargar la portada: aparece la marca con «Cargando SIEP…» y la barra, sin pantalla en blanco. Luego se reemplaza por la portada.
  2. Sin limitación y con caché: recargar varias veces; la pantalla de arranque no llega a verse.
  3. Con sesión iniciada, detener el backend (`docker stop` del contenedor de la API) y recargar `/portal/dashboard`: el portal se pinta en unos 1,5 s y aparece un único aviso de conexión.
  4. DevTools → Network → bloquear `main-*.js`, recargar: a los 12 s aparece «Esto está tardando más de lo normal» con «Recargar». Tab lo enfoca con anillo visible y Enter recarga.
  5. DevTools → Rendering → *Emulate prefers-reduced-motion: reduce*: la barra queda fija.
  6. DevTools → Settings → desactivar JavaScript: se lee el mensaje de `<noscript>`.
