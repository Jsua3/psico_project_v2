# SIEP — Estrategia de stack, esquema de base de datos y despliegue

Fecha: 2026-10-04 · Estado: **actualizaciones ejecutadas en la rama `chore/actualizar-stack` (sin mergear)**; esquema (§4) y despliegue (§7) pendientes. Ver §9.
Alcance: (1) qué actualizar y por qué, (2) quién debe ser dueño del esquema de Postgres,
(3) si conviene cambiar de stack (Laravel + Filament), (4) cómo desplegar de forma
profesional y barata, (5) plan de ejecución.

> **Convención de evidencia.** Cada afirmación se marca como **[repo]** (verificada en este
> repositorio el 2026-10-04), **[fuente]** (tomada de una página externa, enlazada al final;
> los precios y plazos caducan: confirmar en la página oficial antes de pagar o planificar) o
> **[estimación]** (juicio propio, sin medición). Las cifras de horas/días son estimaciones.

---

## 1. Resumen ejecutivo

| # | Decisión | Veredicto |
|---|---|---|
| D1 | ¿Cambiar de stack (Django → Laravel + Filament)? | **No.** Quedarse en Django y actualizar. Confianza media (ver §5) |
| D2 | ¿Quién es dueño del esquema de Postgres? | **Django**, mediante migraciones con una baseline (§4, opción A) |
| D3 | ¿Qué actualizar ya? | **Hecho en rama (§9):** Django **6.1.1** (decisión del usuario: «lo más actual»; la propuesta era 5.2 LTS), psycopg 3, Python 3.14, Node 24, Angular 22, Vitest, Phaser 4, PostgreSQL 18 en pruebas |
| D4 | ¿Dónde desplegar? | **Hetzner** (VPS ~6 USD/mes) con Docker Compose + Caddy + respaldos + CI/CD; staging gratis opcional (§7) |
| D5 | ¿Panel de administración generado (Django admin / Unfold / Filament)? | **Aplazar.** Hoy los CRUD ya existen en Angular; hay una trampa técnica con el usuario personalizado (§5.4) |
| D6 | ¿Y el siguiente salto? | Django **6.2 LTS** cuando salga (abril 2027, soporte hasta 2030) y Angular 22 + Vitest (§6) |

Orden de ejecución propuesto: **Fase 0** red de seguridad → **Fase 1** actualizaciones →
**Fase 2** esquema → **Fase 3** infraestructura → **Fase 4** frontend (§6). Unas 2–3 semanas
de calendario con una sola línea de trabajo **[estimación]**.

---

## 2. Estado actual del stack

| Capa | Hoy | Soporte / estado | Acción |
|---|---|---|---|
| Backend | Django **5.1.8**, DRF 3.15.2, simplejwt 5.3.1, psycopg2-binary 2.9.10, gunicorn 23 (WSGI, 3 workers) | Django 5.1: fin de soporte de seguridad el 3-dic-2025 **[fuente]** | Actualizar (§3) |
| Lenguaje backend | Python 3.13 | Vigente | Mantener |
| BD | PostgreSQL 16 (Compose de desarrollo) | Vigente hasta nov-2028 **[fuente: endoflife]** | Mantener (Django 6.1 exige PG ≥ 15 **[fuente]**) |
| Frontend | Angular 21, Phaser 3.90, Konva 10, Howler, `zone.js` | Angular 22 salió el 3-jun-2026; el 21 sigue soportado **[fuente]** | Subir a 22 en Fase 4 |
| Tests frontend | Jest 30 vía builder experimental de Angular | Jest/WTR deprecados en Angular 21 a favor de Vitest **[fuente]** | Migrar a Vitest (Fase 4) |
| Build | `node:20-alpine` en el Dockerfile; el CI usa Node 24 | Node 20 EOL desde 30-abr-2026 **[fuente]** | Node 24 LTS (soporte hasta abr-2028) |
| Despliegue | Solo Railway (`railway.json`, `docs/operacion/despliegue-railway.md`) | Plan gratis de Railway: 1 USD/mes de crédito tras el trial **[fuente]** | Hetzner (§7) |
| Esquema BD | Volcado `deploy/db_seed.sql` (41 tablas) + 3 scripts manuales en `deploy/upgrades/` | Ver §4 | Django como dueño |

Tamaño **[repo]**: backend Python ≈ 10.900 líneas sin tests (≈ 1.900 son comandos de
semilla/bootstrap), 68 rutas, 249 funciones de prueba, SQL crudo (`connection.cursor`) en
10 puntos de `grupos/services.py` y `reportes/services.py`; frontend ≈ 58.000 líneas TS.

---

## 3. Registro de cambios propuestos

Cada cambio lleva su razón, su riesgo y cómo se verifica. IDs estables para referenciarlos en
commits y en el plan.

| ID | Cambio | Por qué | Riesgo | Verificación |
|---|---|---|---|---|
| C1 | Django 5.1.8 → **5.2 LTS** (parche más reciente) | 5.1 ya no recibe parches de seguridad; 5.2 LTS dura hasta abril 2028 **[fuente]** | Bajo (salto menor) | Suite backend completa con `-W error::DeprecationWarning` |
| C2 | DRF 3.15.2 → 3.17+/3.18, simplejwt 5.3.1 → 5.5.x, drf-spectacular, whitenoise, `cryptography`, `bcrypt`, `google-auth` al día | Versiones de 2024; `cryptography` y `bcrypt` están en la ruta de autenticación y cifrado | Bajo-medio | Suite + prueba de descifrado de reflexiones (Fase 0) |
| C3 | `psycopg2-binary` → **psycopg 3** | Driver recomendado para proyectos nuevos; Django lo soporta con el mismo `ENGINE` **[fuente]** | Bajo | Suite + e2e |
| C4 | Dockerfile: Node 20 → **24 LTS** | Node 20 está sin parches | Muy bajo | `npm run build` en CI |
| C5 | Borrar restos de Spring (`proxy.spring.json`, comentarios y README que citan Flyway) | El backend Spring no existe; confunde y engaña | Muy bajo | grep limpio |
| C6 | **Django como dueño del esquema** (§4) | Elimina tres fuentes de verdad y los incidentes por deriva | Medio (único cambio con riesgo de datos) | Diff de esquema vacío + suite con migraciones reales |
| C7 | Quitar el acoplamiento a Railway de `production.py` (`RAILWAY_PUBLIC_DOMAIN`) y fijar workers de gunicorn según RAM | Despliegue portable | Bajo | Arranque en Compose local |
| C8 | Añadir **Dependabot/Renovate semanal** + `pip-audit` y `npm audit` en CI | Evita volver a quedar obsoletos | Muy bajo | PRs automáticos |
| C9 | Angular 21 → **22**, Jest → **Vitest** | Mantenerse en la versión vigente y en el runner oficial | Medio (suite de ~790 archivos de frontend) | Suite + build + e2e Playwright |
| C10 | Django 5.2 → **6.2 LTS** (abril 2027) | LTS con soporte hasta abril 2030 **[fuente]** | Bajo si la red de seguridad existe | Suite |

**No se propone ahora:** Phaser 4 (renderer reescrito; SIEP tiene renderers de pixel art
propios y archivos de ~3.000 líneas: fase aparte con capturas antes/después), `zone.js` →
zoneless (riesgo con Phaser, beneficio no medido), Python 3.14, Postgres 18.

---

## 4. Esquema de BD: por qué Django debe ser el dueño

### 4.1 Situación actual **[repo]**

Hay **tres fuentes de verdad** del esquema y ninguna es la que Django versiona:

1. `deploy/db_seed.sql`: volcado con 41 tablas, 6 `CHECK`, secuencias y la tabla
   `flyway_schema_history` de un backend que ya no existe. Es lo que se restaura en producción.
2. `bootstrap_dev_db` (467 líneas): crea las tablas para desarrollo y pruebas. Su propio
   docstring de prueba admite que **no replica los `CHECK` de producción**.
3. Los modelos Django: **28 modelos con `managed = False`** repartidos en 8 archivos. Las
   migraciones son `CreateModel` con `managed: False`, es decir, no ejecutan DDL; los tests
   corren con `--nomigrations`.

Consecuencias ya ocurridas (documentadas en `docs/operacion/despliegue-railway.md`):

- La "pausa segura" daba **500** en producción porque el `CHECK` viejo no admitía `PAUSED`.
- Empezar un intento nuevo con `forceNew` daba **500** porque el `CHECK` no admitía `REPLACED`.
- Hablar con NPC ambientales daba **400** porque faltaba un dato en `scene_maps.ambient_json`.
- Hay que aplicar scripts SQL a mano **antes** de hacer push: un error de orden rompe producción.
- Existe `test_deploy_schema_contract.py`, que parsea con regex el volcado SQL solo para
  detectar esa deriva: es el síntoma de que el diseño depende de un parche.

### 4.2 Opciones

| Opción | Descripción | A favor | En contra |
|---|---|---|---|
| **A. Django dueño (recomendada)** | Quitar `managed=False`, declarar constraints en los modelos, generar una migración baseline desde el esquema real y marcarla como aplicada (`--fake`); a partir de ahí todo cambio es `makemigrations` + `migrate` automático en el despliegue | Una sola fuente de verdad; la BD de pruebas se construye con las mismas migraciones y por tanto con los mismos `CHECK`; `makemigrations --check` detecta deriva en CI; entorno nuevo = `migrate`, sin restaurar volcados; camino documentado por Django para BD heredadas **[fuente]** | Requiere un trabajo cuidadoso de baseline y verificación (≈ 3–5 días **[estimación]**); `--fake-initial` solo compara nombres de tabla, no columnas **[fuente]** |
| **B. Runner de SQL propio** | Mantener `managed=False` y crear una tabla de control (`schema_ledger`) que aplique `deploy/upgrades/*.sql` en orden al desplegar | Barato (≈ 1 día **[estimación]**); elimina el "aplicar a mano" | Mantiene las tres fuentes de verdad y el test regex; los modelos pueden seguir divergiendo del SQL |
| **C. Herramienta externa** (Flyway, dbmate, Atlas, sqitch) con modelos `unmanaged` | Migraciones SQL versionadas fuera de Django | Control total del SQL; neutral respecto al lenguaje del backend | Sigue habiendo dos fuentes (SQL y modelos) → necesita pruebas de deriva; añade una herramienta; el equipo ya salió de Flyway una vez |
| **D. Statu quo + más pruebas** | Seguir con volcado + scripts + test de contrato | Costo inicial cero | El costo crece con cada cambio de esquema; los incidentes anteriores son su historial |

Variante de A: en vez de un único baseline, convertir app por app (primero `users`).
Reduce el riesgo por paso pero prolonga la dualidad; con 41 tablas pequeñas y una suite de
249 pruebas, **recomiendo el baseline único**.

### 4.3 Por qué A es la mejor para SIEP

1. **Elimina la causa de los tres incidentes**, no los síntomas. Los tres fueron "el modelo y
   la BD no coinciden". Con migraciones, un `TextChoices` nuevo y su `CHECK` viajan en el
   mismo commit.
2. **Las pruebas pasan a ver lo que ve producción.** Hoy la BD de pruebas se construye con
   un script que no replica los `CHECK`. Con A se construye con las migraciones.
3. **Despliegue sin pasos manuales.** `migrate` corre antes de arrancar la app; desaparece la
   regla "aplica los scripts antes de hacer push".
4. **Es la opción de menor costo de oportunidad.** Es el mismo trabajo que cualquier otro
   camino exigiría (en Laravel, la baseline equivalente también habría que escribirla), pero
   sin reescribir el backend.
5. **No es un candado.** El esquema queda versionado y documentado en el repo; la base de datos
   es el contrato. Si en el futuro se cambia de backend, una BD con historial es más fácil de
   portar que un volcado huérfano. Esto es independiente de D1.
6. **Soporte de la herramienta.** Es el flujo recomendado por Django para BD heredadas:
   `inspectdb` → limpiar modelos → `makemigrations` → `migrate --fake-initial` **[fuente]**.

### 4.4 Riesgos de A y su mitigación

| Riesgo | Mitigación |
|---|---|
| `--fake-initial` marca como aplicado sin verificar columnas | **Diff de esquema obligatorio** (paso 4) antes de dar el cambio por bueno |
| Modelo con FK `unmanaged` no serializa bien el estado (ticket Django #29177) **[fuente]** | Regenerar las migraciones desde cero con modelos ya gestionados; revisar el resultado a mano |
| Tablas sin modelo (`flyway_schema_history`, posibles tablas legacy) | Inventariar con `inspectdb`; decidir caso a caso; la de Flyway se elimina al final |
| Entornos en estados distintos (Railway, volumen local viejo de `psychosim-db`) | Procedimiento por entorno con respaldo previo (paso 8) |
| Historial `django_migrations` ya poblado con migraciones "falsas" | Resetear el historial de las apps del proyecto y registrar la baseline (variante validada en un spike de 1 día **[estimación]**) |
| Colisión con la otra sesión que edita modelos | Rama aparte, ventana de merge acordada; el baseline va **después** de que se asienten los cambios de modelos en curso |

### 4.5 Pasos de ejecución de A

0. **Red de seguridad** (Fase 0, §6): prueba "golden master" de las 68 rutas y prueba de
   descifrado de todas las filas de `reflection_journals`. Sin esto, no se toca el esquema.
1. **Respaldo** `pg_dump` de cada entorno y `pg_dump --schema-only` de referencia.
2. **Alinear modelos** con el esquema real: quitar `managed=False`; declarar los 6 `CHECK`
   como `CheckConstraint`, además de índices, unicidad y `db_column`; revisar PK que
   `inspectdb` no detecte.
3. **Generar** la baseline (`0001`) y las migraciones posteriores (los tres scripts de
   `deploy/upgrades/` quedan absorbidos o como `RunSQL` idempotentes).
4. **Verificar equivalencia:** crear una BD vacía con `migrate`, volcar `--schema-only` y
   compararla con el esquema de referencia normalizado. La diferencia debe ser vacía salvo
   las exclusiones nombradas (p. ej. `flyway_schema_history`, orden de columnas).
5. **Pruebas:** quitar `--nomigrations`; reducir `bootstrap_dev_db` a **solo datos**;
   retirar o reconvertir `test_deploy_schema_contract.py`.
6. **CI:** `makemigrations --check --dry-run`, `migrate` sobre Postgres vacío y el diff del
   paso 4 como job.
7. **Release:** el arranque del contenedor corre `python manage.py migrate --noinput` antes
   de gunicorn (con respaldo previo en producción).
8. **Despliegue por entorno:** respaldo → aplicar los scripts de `upgrades/` que falten
   (son idempotentes) → registrar la baseline (`migrate --fake`) → verificar → continuar.
9. **Retirar** `deploy/db_seed.sql` como fuente de esquema; conservar un fixture de datos
   demo (usuarios, caso `SIM-VBG-001`).

Criterios de aceptación: diff de esquema vacío; `makemigrations --check` limpio; suite
backend verde con migraciones reales; 3 entornos migrados sin pérdida de filas (conteos por
tabla antes/después); descifrado de reflexiones intacto.

---

## 5. ¿Cambiar de stack? Django → Laravel 13 + Filament 5

Decisión de reescritura, difícil de revertir. Se pasó por un **consejo en modo económico**
(prueba de fuga del encuadre + 3 asientos aislados: Autopsia, Contrario asignado y Evidencia
externa, con modelos distintos; sin ronda de refutación ni asiento Contador, de modo que no
hay cifras de costo medidas).

Opciones evaluadas con la misma forma y extensión:

- **1.** Django 5.2 LTS (Python 3.13, DRF, psycopg 3), Django dueño del esquema.
- **2.** Laravel 13 (PHP 8.3+), migraciones de Laravel dueñas del esquema, Filament 5 para
  paneles de administración, misma API que consume el Angular actual.
- **3.** Opción 1 más un panel de administración generado (Django admin o Unfold) para
  usuarios, grupos y rúbricas, en lugar de las pantallas equivalentes de Angular.

### 5.1 Qué cambia y qué no

- **No cambia:** el frontend (≈ 58.000 líneas TS con Phaser, Konva y Angular) se conserva en
  cualquier opción. Laravel solo sería una API.
- **Filament solo reemplazaría** las pantallas CRUD ya existentes en Angular **[repo]**:
  `admin/users.component.ts`, `admin/rubrics.component.ts` y `grupos/grupo-list.component.ts`
  (pueden existir otras menores no inventariadas). Las pantallas centrales del producto (editor de casos,
  editor de mundo, traza del instructor, simulación) son a medida y quedan en Angular.
- **Habría que portar:** ≈ 10.900 líneas de Python, 68 rutas, 249 pruebas (pytest, que no
  sobreviven al cambio de lenguaje) y 10 puntos de SQL crudo.

### 5.2 Hechos técnicos de una portación **[fuente]** salvo indicación

| Punto | Hecho |
|---|---|
| Hashes de contraseña | El código actual escribe `$2b$` **[repo]**; `Hash::check` de Laravel lanza excepción con hashes que no sean `$2y$` salvo configuración específica |
| Cifrado de reflexiones | AES-GCM con IV de 12 bytes antepuesto, clave SHA-256(secreto)[:32] **[repo]**. El `Crypt` de Laravel usa otro formato (JSON base64 con `iv`/`value`/`mac`/`tag`): habría que escribir `openssl_decrypt` a mano. Es viable porque el esquema ya fue diseñado para ser portable |
| Login JWT | Sanctum no emite JWT; mantener el contrato exigiría un fork comunitario (`php-open-source-saver/jwt-auth`) o código propio |
| Soporte | Laravel 13: seguridad hasta 2028-03-17; PHP 8.3: seguridad hasta 2027-12-31; Laravel 14 esperado en el 1T de 2027 (pronóstico no confirmado), con PHP ≥ 8.4 → otro salto dentro del horizonte |
| Django | 5.2 LTS hasta abril 2028; **6.2 LTS (abril 2027) hasta abril 2030**; DRF 3.18 y Unfold ya declaran soporte para Django 6.1 |
| Seguridad de paneles | Filament: 10 avisos entre mayo y septiembre 2026 (3 altos); Django admin: 3 incidencias de admin entre 33 en 2026. Ninguno es decisivo |
| Evidencia de costo de reescritura | No se halló ningún caso Django→Laravel con costos medidos. Hay evidencia anecdótica en ambos sentidos (Spolsky contra reescribir; Basecamp a favor; migraciones asistidas por LLM de Airbnb y Google, que son mecánicas y dentro de un mismo lenguaje) |

### 5.3 El argumento más fuerte a favor de reescribir, y el más fuerte en contra

- **A favor (Contrario asignado):** a 2–3 años, Laravel entrega migraciones dueñas del
  esquema, convenciones fuertes para un equipo rotativo y paneles declarativos; la
  portación es verificable porque ya existen tests y e2e; y el equipo ya portó este mismo
  backend una vez. **[repo]** confirma ese último punto: la migración Spring → Django se hizo
  el **2026-05-30** (tareas T1–T17 "Spring-faithful"). Es la mejor razón para creer que el
  costo en tiempo es bajo.
- **En contra (Autopsia):** esa misma rapidez es el riesgo. El único oráculo que sobrevive al
  cambio de lenguaje es el API e2e, que **[repo]** cubre unas 10 de las 68 rutas y solo
  comprueba códigos de estado; las pruebas en PHP las escribirían los mismos agentes que el
  código, y una prueba escrita para pasar contra el código nuevo no mide equivalencia. Lo que
  ese oráculo no ve (motor del DAG y puntuación, SQL crudo de reportes, cifrado, objetos JSON
  vacíos que PHP serializa como `[]`) llegaría a producción, y la primera función de la BETA
  se construiría encima.

**Por qué no gana el argumento a favor:**
(a) lo que Laravel ofrece sobre el esquema (migraciones dueñas) es exactamente la opción A, que
se obtiene en Django con una fracción del costo; (b) los paneles CRUD que Filament
sustituiría ya existen y funcionan; (c) la ventaja de soporte es nula o negativa (Django 6.2
LTS llega a 2030; Laravel/PHP exigen otro salto antes de 2028); (d) la suposición central
del caso a favor (que el equipo domina PHP) **no está verificada**.

### 5.4 La opción 3 (panel generado) tiene una trampa verificable

El admin de Django exige que el modelo de usuario defina `is_staff`, `has_perm` y
`has_module_perms` **[fuente]**. El `CustomUser` actual **[repo]** no los tiene
(tabla con columnas fijas, sin `PermissionsMixin`). Es resoluble (propiedades derivadas de
`role`), pero no es "encender el admin". Además Django documenta el admin como herramienta
interna para personal de confianza, no como front-end. **Se aplaza** hasta que el número de
pantallas CRUD justifique el costo; hoy no lo justifica.

### 5.5 Veredicto del consejo

**Quedarse en Django y actualizar (opción 1).** Confianza **media**: los asientos se dividen
sobre un hecho que nadie tiene —la experiencia del equipo en PHP— y una prueba barata lo
resuelve (abajo). Reversibilidad: seguir en Django es reversible a costo casi nulo; la
reescritura tiene su punto de no retorno en el **commit que borra `backend_django/`** y en la
primera escritura de producción del backend nuevo sobre `reflection_journals`.

**Qué haría cambiar la decisión** (falsadores de los asientos):

1. El equipo confirma que no hay quien mantenga Python pero sí PHP, o que la institución
   exige un stack PHP.
2. Un spike de 1–2 días que porte a Laravel el login JWT, el descifrado de una reflexión real
   y un endpoint con SQL crudo, y corra el e2e actual sin tocar Angular, sale **limpio**
   (tumba la objeción de costo).
3. Al correr las 249 pruebas bajo Django 6.1 con `-W error::DeprecationWarning` falla una
   fracción grande (tumbaría "actualizar es barato").
4. La necesidad de pantallas CRUD de administración crece más allá de lo que Angular a
   medida puede sostener (reabre la opción 3, no la 2).

**Lo que el consejo no puede saber:** tamaño y habilidades del equipo; si hay usuarios
reales hoy; si la institución impone un stack; el plazo. Los tres asientos corrieron sobre
modelos distintos (Opus, Fable, Sonnet), pero siguen siendo modelos y esto rompe un encuadre
inicial; **no es validación externa**. El asiento de evidencia externa sí usó búsqueda web.

**Mejora que salió de la autopsia y vale para cualquier camino:** antes de tocar nada, crear un
**oráculo diferencial** (Fase 0): respuestas "golden master" de las 68 rutas sobre la BD
semilla y descifrado de todas las filas cifradas. Protege la actualización de Django, la
baseline del esquema y, si algún día se reabre D1, cualquier portación.

---

## 6. Plan de ejecución

Todas las duraciones son **[estimación]** y suponen una sola línea de trabajo. Cada fase termina
con la suite verde y un commit/PR propio. Trabajar en una rama o worktree aparte, porque otra
sesión modifica el código.

| Fase | Contenido | Duración | Depende de |
|---|---|---|---|
| **0. Red de seguridad** | Golden master de 68 rutas; prueba de descifrado de reflexiones; Dependabot + `pip-audit`/`npm audit` (C8) | 1–2 días | — |
| **1. Actualizaciones** | C1–C5 (Django 5.2, dependencias, psycopg 3, Node 24, limpieza de Spring) | 1–2 días | F0 |
| **2. Esquema** | C6 (baseline, diff, migraciones automáticas) | 3–5 días | F1 y merge de los cambios de modelos en curso |
| **3. Infraestructura** | C7 + Hetzner (§7): Compose, Caddy, respaldos, CI/CD, staging opcional | 3–4 días (paralela a F2 en lo que no toque modelos) | F1 |
| **4. Frontend** | C9: Angular 22 y Vitest | 2–4 días | F1 |
| **5. Django 6.2 LTS** | C10 | 1–2 días, abril 2027 | F2 |

Calendario de revisión recurrente: Django 6.2 LTS (abr-2027), Node 24 EOL (abr-2028),
Django 5.2 EOL (abr-2028), Postgres 16 EOL (nov-2028), Angular mayor cada ~6 meses.

---

## 7. Despliegue (resumen de la investigación)

Opciones evaluadas el 2026-10-04 (precios de blogs agregadores **[fuente]**, verificar):

| Opción | Costo/mes | Veredicto |
|---|---|---|
| **Hetzner CX23** (2 vCPU, 4 GB) | ≈ 6 USD (5,99 €) | **Elegida.** Siempre encendido, control total, requiere operación |
| Cloud Run + Neon Free | 0 | Buena para staging; cold starts y GCP pide tarjeta |
| Railway Hobby | ≈ 5–8 | Actual; cero operación, pero no gratis |
| Oracle Always Free | 0 | Descartada: recortó de 4 OCPU/24 GB a 2/12 y termina instancias |
| Fly.io / Render / Koyeb / Supabase | ver costos | Sin plan gratis útil para algo siempre encendido |
| Azure for Students | 0 mientras dure el crédito | Complemento, no plan a largo plazo |

Diseño propuesto en Hetzner: Compose (app, Postgres, Caddy con HTTPS automático), `pg_dump`
diario a almacenamiento externo con restauración probada, despliegue por GitHub Actions
(SSH o registro de imágenes) al hacer merge a `master`, `migrate` automático (§4), *healthcheck*
y logs rotados.

**Decisiones abiertas:** región del servidor y cumplimiento de protección de datos (hay
reflexiones cifradas de estudiantes); si SIEP tiene usuarios reales hoy; dominio.

---

## 8. Preguntas abiertas para el equipo

1. ¿Cuántas personas mantendrán SIEP y con qué experiencia en Python y en PHP?
2. ¿Hay usuarios reales en producción hoy (Railway), o solo desarrollo?
3. ¿La institución exige un stack, una región de alojamiento o una política de datos?
4. ¿Hay plazo (entrega, evaluación, BETA)?

---

## 9. Ejecución de las actualizaciones (2026-10-04)

Decisión del usuario: quedarse en Django y actualizar todo a lo más actual. Se ejecutó en
`.worktrees/actualizar-stack`, rama `chore/actualizar-stack`, **sin mergear a `master`** y
sin push. Commits (de `92354c2` a `d687c7d`): vectores de cifrado → backend → infra → CI →
Angular 22 → Vitest → dependencias → Phaser 4 → scripts/README → arreglo «Reanudar» → limpieza.

### 9.1 Versiones (antes → después)

| Pieza | Antes | Después |
|---|---|---|
| Django | 5.1.8 | **6.1.1** |
| DRF / simplejwt | 3.15.2 / 5.3.1 | **3.18.1 / 5.5.1** |
| cryptography / bcrypt | 43.0.3 / 4.2.0 | **50.0.2 / 5.0.0** |
| Driver de BD | psycopg2-binary 2.9 | **psycopg 3.3.6** |
| gunicorn / whitenoise / pytest | 23 / 6.7 / 8.3 | **26.2 / 6.12 / 9.1** |
| Python (Docker, CI, dev-up) | 3.13 | **3.14** (dev-up acepta 3.12–3.14) |
| Node (Docker) | 20 (sin soporte) | **24 LTS** (`npm ci`) |
| PostgreSQL (BD de pruebas) | 16 | **18** (desarrollo sigue en 16, ver 9.4) |
| Angular | 21.2 | **22.2.1** (builders `@angular/build`) |
| TypeScript | 5.9 | **6.0.3** (7.0.2 bloqueado por el peer de Angular 22) |
| Tests frontend | Jest 30 + ts-jest | **Vitest 5.0.3** (`@angular/build:unit-test`, jsdom) |
| Phaser | 3.90 | **4.2.1** |
| konva / Playwright / axe-core | 10.3 / 1.60 / 4.12 | **10.7 / 1.63 / 4.13** |

### 9.2 Verificación (hechos medidos, no estimados)

- **Backend:** 297 pruebas verdes antes → **303** después (6 de vectores fijos), también con
  `-W error::DeprecationWarning`, en Python 3.14 + PG 18. API e2e 16/16.
- **Frontend:** 1802 → **1806** pruebas verdes (4 nuevas), 76/76 de assets de personajes,
  build limpio (bundle inicial 472 → 487 kB, presupuesto 850 kB).
- **E2E con Phaser 4** (Chromium real): 20/20 del CI; los 4 `@full-case` (las seis decisiones
  completas en 4 viewports); `@orientation` 9 OK + 1 omitido por diseño + 0 fallos.
- **Imagen de producción:** construye, sirve el SPA, la API da 401 sin token y el **login con el
  hash bcrypt de la semilla funciona**; `userId` del JWT sigue numérico.
- **Volcado de producción:** `deploy/db_seed.sql` restaura sin errores en PostgreSQL 18.6.
- **Seguridad:** `pip-audit` sobre las versiones anteriores: **27 avisos únicos** (17 Django,
  6 cryptography, 2 DRF, 1 simplejwt, 1 pytest); sobre las nuevas: **0**, también transitivas.
  `npm audit`: 0. Ambos quedan como job de CI y Dependabot semanal.

### 9.3 Problemas que la actualización destapó (todos resueltos)

| Problema | Causa | Resolución |
|---|---|---|
| Claim `userId` del JWT pasó a texto | simplejwt 5.5 hace `str(user_id)` | Se conserva el contrato numérico (`serializers.py`); el frontend lo tipa como `number` |
| Prueba de historial rota | psycopg 3 escribe el UUID sin guiones en el SQL | La prueba compara sin guiones |
| `EMAIL_BACKEND` deprecado | Django 6.1 introduce `MAILERS`; se retira en 7.0 | Migrado a `MAILERS` |
| Prueba de `scene-checklist-card` (140 ≠ 70) | Angular 22 encola dos `afterNextRender`; el mock de geometría era estático | El mock sigue al scroll; la intención del test no cambia |
| **«Reanudar» no hacía nada tras una pausa segura** (e2e determinista) | `busy()` seguía activo durante dos GET encadenados y `resumeCurrentAttempt()` descartaba el toque **en silencio** (bug **preexistente**, visible ahora por un servidor de desarrollo más lento) | El toque se encola y se atiende al terminar la recarga; 4 pruebas unitarias (2 fallan sin el arreglo) |
| 503 avisos `NG0955` (claves duplicadas en `@for`) | La «Trazabilidad» de la bitácora usaba `track stage` y el backend recorta los títulos a 14 caracteres (`progress_map_node`), dejando dos nodos como «Consultorio: …» | `track $index`; el recorte sigue pendiente (9.5) |
| `test:frontend` con `--runInBand` | Vitest no tiene ese flag | Eliminado del script raíz |

### 9.4 Decisiones tomadas y por qué

- **Django 6.1 y no 5.2 LTS:** el usuario pidió «lo más actual». 6.1 recibe parches ~16 meses;
  la LTS 6.2 sale en abril 2027 (soporte hasta 2030), con el mismo esfuerzo de salto que desde 5.2.
- **Python 3.14 en Docker y CI:** la suite completa pasa; el venv local de 3.13 sigue válido.
- **PostgreSQL 18 solo en pruebas:** el volumen de desarrollo es persistente y subir de mayor
  exige `pg_dump`/restore de los datos de cada persona; no se tocó sin avisar.
- **Phaser 4:** el inventario de APIs afectadas (FX, máscaras, pipelines, `renderer.snapshot`)
  dio cero usos; solo 2 ajustes de **tipos** (`fillPoints`, `createLayer`). El e2e real y una
  captura confirman que el render del juego es correcto.
- **TypeScript 6.0.3:** `@angular/compiler-cli@22.2.1` exige `>=6.0 <6.1`.
- **`isolate: true` en Vitest:** sin él los relojes falsos se contaminan entre archivos; la suite
  tarda ~60 s en vez de ~7 s. Prioriza corrección.

### 9.5 Pendiente

1. **Revisar y mergear** la rama (o abrir PR). Antes de empujar, el CI en Linux es el juez final.
2. **Fin de línea en Windows:** con `core.autocrlf=true` y sin `.gitattributes`, 12 pruebas de
   «contrato de código fuente» (51 specs leen `.ts` con `
` literal) fallan localmente aunque
   pasan en CI y con los archivos en LF. Preexistente en `master`. Solución recomendada:
   `.gitattributes` con `eol=lf` (cambia cómo se escriben los archivos de cada colaborador).
3. **Recorte de etiquetas** del mapa de progreso a 14 caracteres (`game_dtos.progress_map_node`):
   «Consultorio: protección y marco» y «Consultorio: acción técnica y ética» se ven iguales.
4. **BD de desarrollo** a PostgreSQL 18 (dump/restore) y alinear `docker-compose.yml`.
5. **Fase 2 (esquema, §4)** y **Fase 3 (Hetzner, §7)** siguen como estaban.
6. **Angular 22 deja `changeDetection: Eager` explícito** en ~30 componentes (migración
   automática que conserva el comportamiento); migrar a `OnPush` es una mejora futura.
7. Endurecimiento de producción detectado por `check --deploy`: `X-Frame-Options`, HSTS.
8. **Django 6.2 LTS** en abril 2027.

---

## 10. Fuentes

Consultadas el 2026-10-04 salvo indicación.

- Django: [fechas de soporte](https://endoflife.date/django) · [descargas y LTS](https://www.djangoproject.com/download/) · [guía EOL](https://tuxcare.com/blog/django-eol-guide-2026/) · [BD heredada y `--fake-initial`](https://micropyramid.com/blog/how-to-create-initial-django-migrations-for-existing-schema/) · [ticket #29177](https://code.djangoproject.com/ticket/29177)
- DRF/psycopg: [DRF 3.17](https://newreleases.io/project/pypi/djangorestframework/release/3.17.0) · [simplejwt](https://pypi.org/project/djangorestframework-simplejwt/) · [psycopg 3 en Django](https://dev.to/jimmyyeung/upgrade-to-django-5-with-psycopg3-4e8b)
- Node: [calendario LTS](https://endoflife.ai/article-nodejs-eol) · [Node 20 EOL](https://dev.to/matheus_releaserun/nodejs-20-end-of-life-migration-playbook-for-april-30-2026-2onh)
- Angular: [Angular 22](https://frontendminds.com/blog/angular-latest-version-2026) · [Angular 21, Vitest y zoneless](https://www.angulararchitects.io/blog/whats-new-in-angular-21-signal-forms-zone-less-vitest-angular-aria-cli-with-mcp-server/)
- Phaser: [Phaser 3 vs 4](https://phaser.io/news/2026/05/phaser-3-vs-phaser-4) · [guía de migración](https://phaser.io/news/2026/04/migrating-from-phaser-3-to-phaser-4-what-you-need-to-know)
- Laravel/Filament: [Laravel 13 notas](https://laravel.com/docs/13.x/releases) · [Filament v5](https://filamentphp.com/insights/danharrin-filament-v5-blueprint) · [Hashing](https://laravel.com/docs/13.x/hashing) · [Encryption](https://laravel.com/docs/13.x/encryption) · [Sanctum](https://laravel.com/docs/13.x/sanctum) · [php-open-source-saver/jwt-auth](https://github.com/PHP-Open-Source-Saver/jwt-auth) · [PHP versiones](https://www.php.net/supported-versions.php)
- Reescrituras: [Spolsky, 2000](https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/) · [Airbnb, migración con LLM](https://www.infoq.com/news/2025/03/airbnb-llm-test-migration) · [Google, migraciones con IA](https://arxiv.org/abs/2501.06972)
- Despliegue: [Railway](https://www.srvrlss.io/provider/railway/) · [Oracle recorta el free tier](https://terminalbytes.com/oracle-cloud-free-tier-changes-2026/) · [Fly.io](https://fly.io/docs/about/pricing/) · [Render](https://render.com/docs/free) · [Hetzner](https://comparedge.com/tools/hetzner/pricing) · [Cloud Run](https://cloud.google.com/run/pricing) · [Neon](https://neon.com/faqs/free-plan-limits-and-quotas) · [Koyeb](https://github.com/robhunter/agentdeals/pull/2209) · [Supabase](https://supabase.com/pricing) · [GitHub Student Pack](https://creditforstartups.com/students/github-student-developer-pack)
