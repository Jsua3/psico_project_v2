# ADR-S3 · Política de contenido (CSP) y HTML del SPA

> **Estado:** aceptada · plan 03 (seguridad), SD-6 · tareas S2-3a, S2-3b y S2-4 · 2026-10-18.
> **Dónde vive:** `psychosim/settings/base.py` (la política y las banderas), `shared/spa.py` (la vista del HTML),
> `shared/static_files.py` (WhiteNoise sin el índice), `frontend/src/index.html` + `frontend/src/assets/boot.*` (el arranque),
> `frontend/e2e/csp-probe.e2e.ts` + `scripts/test-csp-probe.mjs` (la sonda, `npm run test:csp`).
> **Requisito que cierra:** RNF-002 (defensa en profundidad del navegador); hallazgos DJA-4, SF-05; SD-1 (el token vive en
> `localStorage`, así que un XSS que ejecute código lo leería: la CSP es la capa que lo hace difícil).

## Contexto

SIEP guarda el JWT en `localStorage` (SD-1). Un script ajeno que corra en la página podría leerlo. La primera defensa es que
Angular escapa todo lo que pinta (la aplicación no tiene ningún `innerHTML` con datos) y que el servidor rechaza el marcado
en el contexto, los objetivos, las pistas y los personajes (regla de texto plano) y la compuerta de publicación en todos los
demás textos (`DSL.TEXT_MARKUP`). La CSP es la segunda capa: aunque algo se colara, el navegador no ejecutaría código que la
página no declaró.

Django 6.1 trae la CSP nativa (`ContentSecurityPolicyMiddleware`, `SECURE_CSP`, `SECURE_CSP_REPORT_ONLY`, nonce perezoso por
petición). Angular acepta un nonce para los `<style>` que inyecta al arrancar (`ngCspNonce` en el elemento raíz). El HTML del
SPA, antes de esta tarea, tenía un `<style>`, un `<script>` y un `onclick` en línea y lo servía WhiteNoise crudo (sin pasar por
Django), así que ninguna política sin `'unsafe-inline'` habría dejado arrancar la página.

## Decisión (opción A)

1. **Cabecera de Django con nonce.** `SECURE_CSP` (tras `SIEP_CSP_ENFORCE`) lleva `CSP.NONCE` en `script-src` y `style-src`;
   el middleware lo sustituye por `'nonce-…'` con el nonce de la petición.
2. **El HTML sale SIEMPRE de la vista `spa_index`** (`shared/spa.py`): lee `index.html` del build, sustituye en TODAS sus
   apariciones el marcador `__SIEP_CSP_NONCE__` por el nonce de la petición (el mismo de la cabecera) y responde con
   `Cache-Control: no-store` (un nonce que se repite no protege). `frontend/src/index.html` trae el marcador en
   `<app-root ngCspNonce="__SIEP_CSP_NONCE__">`; el build de Angular lo copia a los `<script nonce>` que genera.
3. **WhiteNoise nunca sirve el HTML.** `WHITENOISE_INDEX_FILE = False` y `shared.static_files.SpaStaticFilesMiddleware`
   (una subclase de 10 líneas) saca `/index.html` de su tabla de archivos y de su búsqueda en disco: `/` y `/index.html` caen a
   la vista como cualquier ruta del cliente, aunque alguien vuelva a encender la bandera de WhiteNoise.
4. **El arranque no lleva código en línea.** La pantalla de «Cargando SIEP…» pasó a `assets/boot.css`,
   `assets/boot-noscript.css` y `assets/boot.js`; el `onclick` de «Recargar» es un oyente del script externo y el aviso de
   `<noscript>` usa una clase de la hoja externa. El CSS y el comportamiento se movieron tal cual; la única diferencia es que
   `boot.css` (2 kB, sin hash: WhiteNoise lo cachea 60 s) es una petición más antes del primer pintado.
5. **`optimization.styles.inlineCritical` apagado** en el build de producción (`angular.json`). Encendido, el build deja en el
   HTML un `<style>` de 17 kB y un `<script>` en línea que cambia el `media` de la hoja diferida (el HTML pasa de 2,6 kB a
   20 kB): con nonce funcionarían, pero son 17 kB sin caché en cada navegación (el HTML es `no-store`) y el único script en
   línea de la página. Apagado, la hoja global se carga con un `<link>` normal (con hash, cacheable) y el HTML no lleva ni un
   script ni un estilo en línea. El CSS crítico de esta aplicación es casi nulo: el HTML solo trae la pantalla de arranque.
6. **Google Identity Services recibe el nonce.** `LoginComponent` pone el nonce de la página (`CSP_NONCE`) en el `<script>` de
   Google: el script copia `document.currentScript.nonce` a la hoja `<style>` que inyecta (se leyó en el código de
   `accounts.google.com/gsi/client`); sin él, la política bloquea esa hoja.
7. **Dos banderas** (ver «Cómo se opera»): `SIEP_CSP_REPORT_ONLY` (ya existía) y `SIEP_CSP_ENFORCE` (apagada por defecto hasta
   que `npm run test:csp` no halle violaciones y el equipo la encienda en el despliegue).

### La política en vigor

```
default-src 'self'
script-src 'self' 'nonce-<petición>' https://accounts.google.com/gsi/client
style-src 'self' 'nonce-<petición>' https://accounts.google.com/gsi/style
style-src-attr 'unsafe-inline'            ← SOLO con GOOGLE_OAUTH_CLIENT_ID configurado
img-src 'self' data: blob:
font-src 'self'
media-src 'self'
worker-src 'self'
connect-src 'self' https://accounts.google.com/gsi/
frame-src https://accounts.google.com/gsi/
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
object-src 'none'
report-uri /api/security/csp-report
```

La inicial (S2-3a, la que se envía en modo reporte) es la que se propuso en el plan: `style-src` abierto con `'unsafe-inline'` y
sin nonce, y `blob:` también en `media-src` y `worker-src`. **Ajustada con lo que midió la sonda** (ver «La sonda»):

| Directiva | Qué deja pasar | Por qué |
|---|---|---|
| `script-src` | el propio origen, el nonce y el script de Google Identity Services | **Sin `'unsafe-inline'` y sin `'unsafe-eval'`, nunca.** El build no ejecuta `eval`: el único `new Function("return this")` es el rodeo de webpack para `globalThis`, que no corre porque `globalThis` existe |
| `style-src` | el propio origen, el nonce y la hoja de Google | **Sin `'unsafe-inline'`.** Angular (y con él Material, el CDK, Phaser y Konva) funciona con el nonce de `ngCspNonce`: la sonda no halló ningún `<style>` en línea sin nonce ni atributo `style=` de la aplicación en los cinco flujos. El plan B del plan 03 (`'unsafe-inline'` en los estilos de Angular) **no hizo falta** |
| `style-src-attr` | `'unsafe-inline'`, **solo con el acceso con Google configurado** | **El único permiso excepcional.** Google Identity Services escribe atributos `style=` con `innerHTML` (`/gsi/client`) y un atributo no puede llevar nonce. Medido con la sonda y un client id falso: 2 violaciones `style-src-attr`. Solo afecta a ATRIBUTOS; los `<style>` siguen exigiendo el nonce. Sin Google no hay botón, y la directiva no existe |
| `img-src` | propio, `data:`, `blob:` | **Los dos se usan** (modo `report-tight`, que los quita y mide): `data:` lo usan Phaser (texturas por defecto en base64), «Mi personaje» (la hoja compuesta del kit llega al CSS como data URL), la ficha y el editor; `blob:` lo usan el juego y la vista previa del editor (cientos de imágenes `blob:` por pantalla) |
| `media-src` | propio | el audio (Howler/Phaser) sale de `/assets/game/audio/…`. **`blob:` se retiró del plan inicial: la sonda no lo usó** |
| `worker-src` | propio | la aplicación no crea ningún worker (no hay `new Worker` en el build). **`blob:` se retiró: sin uso** |
| `font-src` | propio | las fuentes están en `/assets/fonts/` |
| `connect-src` | propio y `accounts.google.com/gsi/` | la API y los recursos son del mismo origen; Google lo pide su documentación |
| `frame-src` | `accounts.google.com/gsi/` | el botón de Google carga iframes suyos |
| `frame-ancestors` | `'none'` | nadie puede incrustar SIEP (con `X-Frame-Options: DENY`); solo rige en la cabecera que se aplica (en modo reporte los navegadores la ignoran) |
| `base-uri`, `form-action`, `object-src` | propio / propio / nada | sin `<base>` ajeno, sin formularios hacia fuera, sin plugins |
| `report-uri` | `/api/security/csp-report` | cada incumplimiento deja una línea `csp_violation` sin datos personales (S2-3a) |

**Imágenes de fondo de otro host.** `ambient.backgroundImage` de un caso puede apuntar a un `https` de una lista blanca
configurable (`SIEP_ALLOWED_ASSET_HOSTS`, S2-6b). Cada host de esa lista entra tal cual a `img-src` de las dos políticas
(`https://<host>`), así que quien amplíe la lista amplía también la política: lo que SF-22 pide es que una URL ajena no la
cargue el navegador de cada estudiante sin que alguien lo decida. Un valor que no sea un nombre de host (con esquema,
puerto, ruta o comodín) impide arrancar.

## Opciones descartadas

- **B · `security.autoCsp` de Angular** (hashes de los scripts en un `<meta>`): solo cubre scripts, un `<meta>` no admite
  `frame-ancestors` ni `report-uri`, no sirve para los estilos que Angular inyecta, y deja el HTML estático sin nonce.
- **C · CSP estática con `'unsafe-inline'`** (la que ya enviaba el modo reporte): lo más sencillo y lo más débil; un XSS
  ejecutaría código en línea sin que la política lo notara.
- **D · nonce por el token `CSP_NONCE` de Angular** para cuando el HTML se cachea (CDN): no aplica; el HTML es `no-store` y lo
  escribe Django. Si algún día un CDN cachea el HTML habría que repensarlo.
- **E · `'strict-dynamic'`**: no hace falta; ningún script crea otros scripts con nonce, y rompería la expectativa de que lo
  que no lleva nonce ni es del propio origen no corre.
- **F · `'unsafe-inline'` en todo `style-src`** para acomodar a Google: abre los `<style>` de cualquier XSS para resolver un
  problema que son solo atributos de un tercero. Se prefirió `style-src-attr` y, además, solo con Google configurado.

## La sonda (qué mide y qué no)

`npm run test:csp` (`scripts/test-csp-probe.mjs`) levanta una BD desechable (las mismas guardas que `test:e2e`), siembra el caso
demo, construye el frontend de **producción** y lo sirve con Django por el mismo camino del despliegue (WhiteNoise para los
estáticos, `spa_index` para el HTML) con `psychosim.settings.csp_probe`. `ng serve` no sirve de base: el servidor de
desarrollo de Angular no manda ninguna cabecera de CSP. Playwright recorre **cinco flujos** y tres comprobaciones más:

| Prueba | Qué hace |
|---|---|
| 0 · cabeceras | el HTML trae la política del modo, el nonce del HTML es el de `script-src` y `style-src`, dos peticiones traen nonces distintos, `no-store`, sin `'unsafe-inline'` ni `'unsafe-eval'` en scripts ni en `<style>` |
| 1 · canario | inyecta en la página un `<script>` en línea y un `onerror` en línea (lo que haría un XSS de DOM): con la política en vigor **no se ejecutan** y el navegador y el servidor registran la violación (`script-src-elem` y `script-src-attr`); sin él, una sonda sin política también diría «cero violaciones» |
| 2 · acceso | portada, entrada, solicitud de acceso, una clave mala (401) y la entrada buena |
| 2b · Google (`--google`) | con un client id **falso** y con internet: el script de Google carga, pinta su botón y no hay violaciones |
| 3 · portal del estudiante | panel, catálogo, «Mi personaje», invitaciones, cambio de contraseña y las pantallas de error |
| 4 · sala del juego | la sala (Phaser), la ficha, el aviso de contenido, la introducción, el contexto y un caso en marcha con movimiento (audio, texturas) |
| 5 · editor del docente | las nueve pestañas del editor del caso, el editor de mundo (Konva) y la vista previa (Phaser) |
| 6 · reporte | del reporte del grupo al del estudiante, con la **descarga del CSV** (URL `blob:`) |
| 7 · texto con `<script>` | un caso publicado con `<script>alert(1)</script>` e `<img onerror>` en todos sus textos (sembrado en la BD: la API y la compuerta de publicación lo impiden) se ve como texto en el catálogo, la ficha, el juego, la lista de casos y el editor: ningún `alert`, ninguna ejecución, ninguna violación |

Cada flujo captura tres canales y falla con la lista de violaciones (directiva, recurso bloqueado **sin consulta**, ruta de
la página): el evento `securitypolicyviolation` del navegador, los mensajes de consola «Refused to…» y las líneas
`csp_violation` del servidor (que prueban de paso que el informe llega de punta a punta).

**Modos:** `enforce` (por defecto: la política en vigor), `report` (la de reporte que hoy envía producción), `report-strict`
(la política en vigor como solo reporte: mide qué rompería antes de encenderla) y `report-tight` (la en vigor sin `data:` ni
`blob:`: mide cuáles de esos permisos se usan de verdad).

### Lo que midió (2026-10-18, Chromium 151, GPU)

| Corrida | Resultado |
|---|---|
| HTML **de antes** (inline) + política de reporte inicial | 16 filas, todas `script-src-elem` / `inline` (dos por carga de página: el script de arranque y el de CSS crítico); los estilos en línea los permitía `'unsafe-inline'` |
| HTML de antes + política en vigor | 34 filas: lo anterior más `style-src-elem` / `inline` en cada pantalla (Angular no puede inyectar sus estilos sin nonce); la sala del juego no llegó a cargar |
| HTML nuevo + política de reporte inicial (`report`) | 0 violaciones, 8 pruebas verdes |
| HTML nuevo + política en vigor como solo reporte (`report-strict`) | 0 violaciones |
| HTML nuevo + política en vigor (`enforce`) | 0 violaciones, 8 pruebas verdes |
| `report-tight` (sin `data:` ni `blob:`) | `img-src` `data` (juego, ficha, editor, «Mi personaje») y `img-src` `blob` (juego y editor); `media-src` y `worker-src`: nada |
| `--google` (client id falso) con la política sin ajustar | 3 violaciones en `/gsi/client`: `style-src-elem` (la hoja de Google, sin nonce) y `style-src-attr` ×2 |
| `--google` con la política final y el nonce en el script de Google | 0 violaciones; el botón se ve |

**Controles negativos** (`--control`): empeoran la política a propósito y la sonda **debe** ponerse en rojo por el motivo
esperado (el orquestador lo comprueba; sale 0 si la sonda lo vio, 1 si siguió en verde):

| Control | Qué hace | Qué vio la sonda |
|---|---|---|
| `sin-nonce` | quita el nonce de la política | `style-src-elem` bloqueado decenas de veces en cada pantalla (Angular no puede inyectar sus estilos) y el nonce de la cabecera que no cuadra con el HTML |
| `sin-politica` | no envía ninguna CSP | «sin política» y el canario que SE EJECUTÓ (script y manejador) |
| `script-inline` | `'unsafe-inline'` en `script-src` (sin nonce, que lo anularía) | `'unsafe-inline'` en scripts y el canario que SE EJECUTÓ |

### Lo que la sonda NO verificó

- **El inicio de sesión con Google con un client id real.** La sonda usa uno falso: prueba que la política deja cargar el
  script, el botón y la hoja de Google, no el flujo de entrada (el token de Google, la ventana emergente y la cabecera
  `Cross-Origin-Opener-Policy` de S2-1). Se comprueba a mano al encender la política en el despliegue.
- **Otros navegadores** (Firefox, Safari): solo se corrió Chromium. `style-src-attr` lo entienden Chrome 75+, Firefox 105+ y
  Safari 15.4+; en uno anterior, los atributos de Google quedarían bloqueados.
- **Funciones que los flujos no recorren** (subir o cambiar la apariencia en «Mi personaje», importar `.xlsx`, los
  diálogos de cada NPC, etc.).
- **HTTPS y las cabeceras del borde** de Railway.
- Que `media-src 'self'` y `worker-src 'self'` basten en TODAS las funciones: se midieron en los cinco flujos y se dedujeron
  del código (no hay `new Worker` ni `load.video` en el build). Si una función nueva los necesita, la sonda o el informe
  `csp_violation` lo dirán.

## Consecuencias y cómo se opera

- **Encender:** `SIEP_CSP_ENFORCE=true`. La cabecera de reporte se omite (dos cabeceras con la misma política informarían
  cada violación dos veces). **Apagar:** quitarla; no hay nada que esperar en los navegadores. **Antes de encender**, correr
  `npm run test:csp` y, con internet, `npm run test:csp -- --google` (la política cambia con el client id: el permiso de
  atributos solo existe con él).
- **Vigilar:** las líneas `csp_violation` con `"disposition": "enforce"` son cosas que la política bloqueó a una persona
  real (`security_report`, S4-3, las resumirá).
- **Una dependencia nueva que inyecte estilos o scripts en línea** romperá la sonda (y, encendida, la página): la sonda es la
  compuerta. No se corrige añadiendo `'unsafe-inline'`.
- **El HTML ya no se cachea** (`no-store`): cada navegación pide 2,6 kB; los bundles con hash siguen cacheados.
- **`check --deploy`:** `django.template.context_processors.csp` está en `TEMPLATES` para que Django no avise
  (`security.W027`) cuando la política lleva nonce; el baseline de `scripts/security-check-baseline.json` no cambia.
- **El servidor de desarrollo** (`ng serve`) no manda CSP y deja el marcador sin sustituir (`ngCspNonce="__SIEP_CSP_NONCE__"`);
  los estilos de Angular llevan ese texto como nonce, que ninguna política comprueba. Es inocuo.
- **El HTML que no es del SPA no lleva nonce.** Hoy solo hay uno: la API navegable de DRF (`REST_FRAMEWORK` no fija
  `DEFAULT_RENDERER_CLASSES`, así que un navegador que abra `/api/…` recibe una página con `<script>` y `<style>` en línea).
  Con la política en vigor sale degradada; el SPA no la usa y la sonda no la recorre. Dejar solo `JSONRenderer` la
  cerraría (decisión pendiente, fuera de esta tarea).
- **Hallazgo de entrada de datos** (fuera de esta tarea): la API de autoría acepta marcado en el título del caso, en el título
  y la narrativa de las escenas, en el texto y la retroalimentación inmediata de las opciones y en las etiquetas y textos de
  los objetos (solo el contexto, los objetivos, las pistas y los personajes pasan por la regla de texto plano); la compuerta
  de publicación lo rechaza (`DSL.TEXT_MARKUP`), de modo que un borrador sí puede llevarlo. S2-6 podría aplicar la misma
  regla al escribir.
- **Tareas que dependen de esta:** S2-6b (la lista blanca de imágenes de fondo se refleja en `img-src`, hecho al fusionar
  las ramas) y S4-3 (`security_report` cuenta las violaciones).
- **API navegable de DRF:** `DEFAULT_RENDERER_CLASSES` es solo `JSONRenderer` (hallazgo del agente de la sonda): la página
  HTML de DRF lleva `<script>` y `<style>` en línea y la política en vigor la degradaría; el SPA, las pruebas y `curl` hablan JSON.
