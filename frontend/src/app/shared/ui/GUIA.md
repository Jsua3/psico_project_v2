# Guía de `shared/ui`

Biblioteca de componentes del lenguaje visual de SIEP (plan visual, fase F2). Toda pantalla nueva o migrada usa
estas piezas en vez de inventar un botón, un campo, un vacío, un cargador o un diálogo. Cada pieza está en la
galería de desarrollo (`/dev/ui`, solo con `ng serve`), en sus estados y en las dos pieles (portal y juego), y
tiene pruebas de comportamiento junto a su código.

Se importa desde `src/app/shared/ui` (el `index.ts` exporta todo). Los estilos salen de los tokens `--ds-*` y de los
mixins de `src/styles/mixins` (`@use 'mixins' as m;`).

## Reglas que no se negocian

- **Controles nativos.** Botones y enlaces son atributos sobre `<button>` y `<a>` (`button[ui-button]`); los campos
  envuelven controles nativos marcados con `uiControl`. Nada clicable sobre un `div`.
- **Deshabilitado con motivo.** `disabledReason="…"` en vez de `disabled`: el control sigue enfocable, el motivo se
  lee por `aria-describedby` y aparece en un globo con el ratón. Nunca `pointer-events: none`.
- **Un estado a la vez.** Todo bloque que pide datos resuelve carga, error, vacío y listo con `uiDataState()`: el
  vacío y el error no pueden coexistir.
- **Tokens, no literales.** Ni colores, ni tamaños de letra, ni capas (`z-index`) escritos a mano; `npm run ui:lint`
  no puede subir.
- **Sin estilos en línea** (atributo `style=`): la política de contenido (CSP) futura los prohíbe. Las vinculaciones
  `[style.--variable]` sí valen.
- **Objetivos de 44 px** (nunca menos de 24 px) y texto de 12 px o más.
- **Textos en español con tildes y tuteo.** Las etiquetas de enums salen de `labels.ts`; los textos de los estados,
  de `state-copy.ts`. Lo que roce contenido clínico lo fija Psicología.

## Piezas

| Pieza | Uso | Notas |
|---|---|---|
| `UiButton` | `<button ui-button variant="primary" size="md" icon="save" [loading]="guardando()" [disabledReason]="motivo()">Guardar</button>` | variantes `primary`, `secondary`, `ghost`, `danger`; tamaños `sm`, `md`, `lg`; también `<a ui-button>`. El indicador de carga aparece a los 150 ms (`UI_BUTTON_SPINNER_DELAY_MS`) sin cambiar el ancho. |
| `UiIconButton` | `<button ui-icon-button icon="close" label="Cerrar"></button>` | `label` obligatorio (nombre accesible y globo). Es `type="button"` por defecto. |
| `UiLink` | `<a ui-link href="…">Ayuda</a>`, `<a ui-link external href="…">` | el externo abre otra pestaña con `rel` seguro y lo anuncia. |
| `UiSpinner` | `<ui-spinner label="Cargando casos" />` | decorativo sin `label`. |
| `UiField` + `UiControl` | `<ui-field label="Correo" hint="…" [error]="error()" required><input uiControl type="email" /></ui-field>` | etiqueta asociada, ayuda→error en el mismo renglón, `aria-invalid`, `aria-required`; `revealable` para contraseñas. |
| `UiCheck`, `UiSwitch` | `<label ui-check><input type="checkbox" /> Recordarme</label>`, `<input type="checkbox" uiSwitch />` | toda la fila es el objetivo; el interruptor es `role="switch"`. |
| `UiCard` | `<ui-card>`, `<a ui-card href>`, `<button ui-card>` | clicable solo como enlace o botón. |
| `UiStat` | `<ui-stat label="Intentos" [value]="12" hint="Últimos 30 días" />` | números con formato es-CO. |
| `UiBadge` | `<ui-badge tone="success">Publicado</ui-badge>` | siempre con texto; tonos `neutral`, `info`, `success`, `warning`, `danger`. |
| `UiPageHeader`, `UiPageActions` | `<ui-page-header eyebrow="Docencia" title="Grupos" description="…"><button ui-button uiPageActions>Nuevo</button></ui-page-header>` | el ÚNICO `h1` de la pantalla. |
| `UiSection` | `<ui-section title="Intentos recientes">…</ui-section>` (`[level]="3"` si va anidada) | región nombrada por su título. |
| `UiSkeleton`, `loadingPhase` | `fase = loadingPhase(this.cargando)`; `@if (fase() === 'skeleton') { <ui-skeleton shape="card" /> }` | formas `line`, `text`, `card`, `stat`, `row`, `chart`, `avatar`; < 150 ms nada, visible ≥ 300 ms. |
| `UiProgress` | `<ui-progress label="Escenas completadas" [value]="3" [max]="5" />` | sin `value` es indeterminada. |
| `UiRouteProgress` | `<ui-route-progress />` bajo la barra (F3) | aparece si la navegación tarda más de 120 ms (`UI_ROUTE_PROGRESS_DELAY_MS`). |
| `uiDataState`, `errorKindFromStatus` | `estado = uiDataState({ loading, error, isEmpty })` (en un contexto de inyección) | `pending` (< 150 ms: se sigue viendo lo que había) → `loading` (esqueleto, ≥ 300 ms) → `error` → `empty` → `ready`; la regla de tiempos ya va dentro: no hace falta `loadingPhase` aparte. |
| `UiEmptyState` | `<ui-empty-state kind="first-use" title="Aún no tienes grupos" actionLabel="Crear grupo" (action)="crear()" />`, `<ui-empty-state kind="no-results" withAction (action)="limpiar()" />` | clases `first-use`, `no-results`, `restricted`; pixel art del juego (VD-8); la acción solo aparece si se pide. |
| `UiErrorState`, `UiRetryTracker` | `<ui-error-state [kind]="errorKindFromStatus(err.status)" [status]="err.status" (retry)="cargar()" />` | `blocking` para errores de página; foco al título tras un reintento fallido. |
| `UiTooltip`, `UiTooltipController`, `injectUiTooltip` | `<button ui-button uiTooltip="Descarga el reporte en PDF">Exportar</button>` | 400 ms con ratón, al instante con teclado, nunca con un toque; complementa, no nombra. |
| `UiMenu` | `<ui-menu label="Cuenta" icon="account_circle" [items]="items" (itemSelected)="elegir($event)" />` | `iconOnly` para «Más acciones»; el panel vive dentro del componente (D9). |
| `UiTabs`, `UiTab` | `<ui-tabs label="Secciones" [(selected)]="tab"><ng-template uiTab="resumen" label="Resumen">…</ng-template></ui-tabs>` | una sola parada de tabulación; paneles inertes. |
| `UiDialog`, `UiDialogFrame`, `UiDialogActions`, `UiConfirmDialog` | `inject(UiDialog).open(MiDialogo, { data })`, `.confirm({ title, message, confirmLabel, tone: 'danger' })`, `.sheet(MiHoja, { side: 'end' })` | el contenido usa `<ui-dialog-frame title="…">` y `uiDialogActions` en los botones del pie. |
| `UiDialog.consequence`, `UiConsequenceDialog` | `inject(UiDialog).consequence({ title, consequence, continueLabel, proceedLabel })` → `'continue' | 'proceed'` | nombra lo que se pierde; «Continuar» es primaria, tiene el foco y es lo que devuelve Esc (RN-07). **Nunca** para la Salida segura (REGLA-004). |
| `UiScopeNotice`, `SCOPE_NOTICE_DRAFT_TEXT` | `<ui-scope-notice />` en acceso, aviso previo y resultado (F4-2, F6-2, F6-6) | frase de RN-01 en **borrador** visible hasta que Psicología fije el texto (decisión 17); fuera de los textos validados. |
| `UiToastHost` | `<ui-toast-host />` una vez en la app (F3) | pinta `NotificationService`; nunca roba el foco. |
| `UiTable`, `UiTableTable`, `UiTableRow`, `UiTableEmpty`, `UiTableError` | `<ui-table label="Intentos" [state]="estado()"><table ui-table>…<tr uiRow [selected]="…">…</table><ui-empty-state uiTableEmpty … /><ui-error-state uiTableError … /></ui-table>` | densidad `compact`; desborde señalizado y desplazable con teclado. |
| `describeHostWith` | `describeHostWith(() => this.motivo() ? this.motivoId : null)` | suma un id a `aria-describedby` sin borrar los ajenos (para componentes nuevos). |

## Migración: clase heredada → componente nuevo

| Hoy | Mañana | Cuándo |
|---|---|---|
| `.psy-button`, `.psy-button--primary` | `button[ui-button]` (`variant="primary"`) | F4–F8, pantalla por pantalla |
| `.psy-button--ghost`, `.psy-button--glass` | `button[ui-button] variant="ghost"` (el vidrio solo en la barra, F3) | F3–F8 |
| `.siep-btn-primary`, `.siep-btn-secondary` | `button[ui-button]` primario o secundario | F4–F8 |
| `.psy-icon-button`, `mat-icon-button` | `button[ui-icon-button]` con `label` | F3–F8 |
| `.psy-eyebrow`, `.psy-title`, `.psy-subtitle` | `ui-page-header` (`eyebrow`, `title`, `description`) | F4–F8 |
| `.psy-section` | `ui-section` | F4–F8 |
| `.psy-card`, `.siep-card`, `mat-card` | `ui-card` (`a[ui-card]` si toda la tarjeta lleva a otro sitio) | F5, F7 |
| `.psy-chip`, `mat-chip` (estado) | `ui-badge` con texto de `labels.ts` | F5, F7 |
| `.psy-skeleton` | `ui-skeleton` + `loadingPhase()` | F5–F8 |
| `mat-progress-bar` | `ui-progress` (o `ui-route-progress` para la navegación) | F3–F8 |
| `mat-form-field`, `mat-select` | `ui-field` + `uiControl` sobre `<input>`/`<select>` nativos | F4, F7, F8 |
| `mat-table` | `ui-table` sobre `<table>` nativa | F7 |
| `app-confirm-dialog` | `UiDialog.confirm()` | F5–F8 |
| `app-notification-host` (`.siep-notification`) | `ui-toast-host` | F3 |
| `<p>` sueltos de «no hay datos» o «error» | `ui-empty-state` / `ui-error-state` con `uiDataState()` | F5, F7 |

Al migrar una pantalla: se borra la clase heredada en el mismo cambio (si nadie más la usa) y `npm run ui:lint` debe
bajar o quedarse igual.

## Lista de «se ve profesional» (plan visual §7)

Por pantalla, antes de darla por hecha:

- [ ] un solo `h1` (`ui-page-header`) y título de pestaña;
- [ ] los cuatro estados de datos resueltos con `uiDataState()` (carga, error, vacío, listo);
- [ ] hover, foco, pulsado y deshabilitado **con motivo** en todo lo interactivo;
- [ ] solo tokens (sin literales de color, tamaño de letra ni capas);
- [ ] sin claves ni enums crudos a la vista (`labels.ts`) y con tildes;
- [ ] responsivo en 390, 1024 y 1440 px, sin texto recortado;
- [ ] teclado completo (Tab, Esc, flechas donde corresponda) y cursor correcto;
- [ ] sin errores en la consola;
- [ ] Axe WCAG 2.2 AA sin hallazgos serios ni críticos en su piel;
- [ ] en la galería, si se creó o cambió una pieza de `shared/ui`.
