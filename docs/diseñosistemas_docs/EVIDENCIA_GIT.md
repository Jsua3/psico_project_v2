# Evidencia de Git de la serie ADSI

Generado el 2026-10-10 por `docs/diseñosistemas_docs/tools/git_evidence.py` a partir de `git` y `gh pr list`. No se edita a mano: se vuelve a generar.

## Resumen

- **Ramas locales de la serie:** 30.
- **Pull requests hacia `adsi/integracion`** (desde el #24): 29, más #31 → `master` (borrador para el CI oficial).
- **Commits de la pila** (`adsi/integracion..adsi/a09-timer-teardown`): 56, entre 2026-10-09 y 2026-10-10; merges en el rango: 0.
- **Autores del rango:** Jsua3: 42, Juan José Sua: 14.
- **Commits con coautoría de Claude** (`Co-Authored-By`): 56 de 56.

> **Lo que esta evidencia no muestra:** los commits están a nombre de una sola persona (con dos nombres de configuración, `Jsua3` y `Juan José Sua`) y de Claude como coautor. El plan (§12, punto 3) pedía que los cuatro integrantes se vieran en el historial; eso depende de que cada dueño de rama revise, apruebe o commitee desde su cuenta, y **no está hecho**.

## Pila de ramas y pull requests

Cada rama parte de la anterior de la pila y su PR apunta a `adsi/integracion` (GitHub Flow, Unidad 7). Se fusionan en este orden, con *merge commit* (no *squash*), para que la historia conserve cada cambio.

| PR | Rama | Estado | Cambio | Commit del código |
|---|---|---|---|---|
| [#24](https://github.com/Jsua3/psico_project_v2/pull/24) | `adsi/p01-ai-strategy` | OPEN | P-01 · Strategy + Adapter + Factory Method — proveedores del asistente de IA | `7a613e4` |
| [#25](https://github.com/Jsua3/psico_project_v2/pull/25) | `adsi/p04-report-builder` | OPEN | P-04 · Builder — reporte de cierre del intento | `e92994c` |
| [#26](https://github.com/Jsua3/psico_project_v2/pull/26) | `adsi/p08a-door-chain` | OPEN | P-08a · Chain of Responsibility — validación de puertas | `5a97362` |
| [#27](https://github.com/Jsua3/psico_project_v2/pull/27) | `adsi/p09-progress-iterator` | OPEN | P-09 · Iterator — recorrido de nodos del mapa de progreso | `d26ba11` |
| [#28](https://github.com/Jsua3/psico_project_v2/pull/28) | `adsi/p08b-http-error-chain` | OPEN | P-08b · Chain of Responsibility — errores HTTP del interceptor JWT | `a78ac70` |
| [#29](https://github.com/Jsua3/psico_project_v2/pull/29) | `adsi/p05-api-segregation` | OPEN | P-05 · Interface Segregation (SOLID) — APIs por rol en lugar de `SimulationService` de 50 métodos | `c9396fd` |
| [#30](https://github.com/Jsua3/psico_project_v2/pull/30) | `adsi/p06-cache-proxy` | OPEN | P-06 · Proxy (caché) — lista de casos publicados | `f8af374` |
| [#31](https://github.com/Jsua3/psico_project_v2/pull/31) | `adsi/integracion` → `master` | OPEN (borrador) | chore(adsi): rama de integración con las pruebas de Fase 0 y la documentación (borrador para el CI) | `—` |
| [#32](https://github.com/Jsua3/psico_project_v2/pull/32) | `adsi/p07-editor-commands` | OPEN | P-07 · Command + Composite — comandos del editor de mundo | `085a08a` |
| [#33](https://github.com/Jsua3/psico_project_v2/pull/33) | `adsi/a01-duplicados` | OPEN | A-01 · Código duplicado (Cut & Paste) — ayudantes JSON y de acotación del backend | `09beb04` |
| [#34](https://github.com/Jsua3/psico_project_v2/pull/34) | `adsi/a02-codigo-muerto` | OPEN | A-02 · Código muerto (Lava Flow / Boat Anchor) — borrado verificado | `44efdc7` |
| [#35](https://github.com/Jsua3/psico_project_v2/pull/35) | `adsi/p10-npc-motion-strategy` | OPEN | P-10 · Strategy — elección del destino de cada movimiento | `14fed1e` |
| [#36](https://github.com/Jsua3/psico_project_v2/pull/36) | `adsi/a03a-attempt-status` | OPEN | A-03a · Hard Code — `AttemptStatus` en lugar de textos sueltos | `67472dd` |
| [#37](https://github.com/Jsua3/psico_project_v2/pull/37) | `adsi/p12-attempt-state` | OPEN | P-12 · State — ciclo de vida del intento (versión liviana) | `cecdaa6` |
| [#38](https://github.com/Jsua3/psico_project_v2/pull/38) | `adsi/a03b-timing-constants` | OPEN | A-03b · Números mágicos — los tiempos de la pantalla de juego | `fb40b96` |
| [#39](https://github.com/Jsua3/psico_project_v2/pull/39) | `adsi/a03c-backend-constants` | OPEN | A-03c · Números mágicos — las reglas y escalas del intento en el backend | `b2487f5` |
| [#40](https://github.com/Jsua3/psico_project_v2/pull/40) | `adsi/a04-google-login-errors` | OPEN | A-04 · Exception Handling — `GoogleLoginView` deja de disfrazar un fallo de la base de datos | `2207f9c` |
| [#41](https://github.com/Jsua3/psico_project_v2/pull/41) | `adsi/a06-default-password-config` | OPEN | A-06 · Hard Code — la contraseña por defecto de los importados pasa a configuración | `e62a822` |
| [#42](https://github.com/Jsua3/psico_project_v2/pull/42) | `adsi/p03-clone-prototype` | OPEN | P-03 · Prototype — la copia de una versión de caso, declarada una sola vez | `c0a5de6` |
| [#43](https://github.com/Jsua3/psico_project_v2/pull/43) | `adsi/a01b-draw-primitives` | OPEN | A-01b · Cut & Paste — las primitivas de dibujo de las salas, una sola vez | `7f5c2cf` |
| [#44](https://github.com/Jsua3/psico_project_v2/pull/44) | `adsi/p14b-room-template-method` | OPEN | P-14b · Template Method — el esqueleto común de las salas del caso | `13dfb9c` |
| [#45](https://github.com/Jsua3/psico_project_v2/pull/45) | `adsi/p05b-authoring-facade` | OPEN | P-05b · Facade — `authoring_service` pasa a ser la puerta de un subsistema por responsabilidades | `d48f0be` |
| [#46](https://github.com/Jsua3/psico_project_v2/pull/46) | `adsi/a05-world-save-persistence` | OPEN | A-05 · Integridad del guardado del mundo — persiste borrados y zonas, y no se lleva objetos de otra sala | `8e01350` |
| [#47](https://github.com/Jsua3/psico_project_v2/pull/47) | `adsi/a07-clone-gaps` | OPEN | A-07 · Los olvidos del clon de versión — peso y estado de los criterios, versión de la rúbrica y esquema de mundo | `0e21e46` |
| [#48](https://github.com/Jsua3/psico_project_v2/pull/48) | `adsi/p13-attempt-completed-observer` | OPEN | P-13 · Observer — «un intento se completó» es una señal a la que progresión se suscribe | `4d7f813` |
| [#49](https://github.com/Jsua3/psico_project_v2/pull/49) | `adsi/l01-lsp-contracts` | OPEN | L-01 · Liskov (SOLID) — una misma suite de contrato recorre todas las implementaciones registradas | `fa2f07d` |
| [#50](https://github.com/Jsua3/psico_project_v2/pull/50) | `adsi/docs-informe-final` | OPEN | docs(adsi): informe de antipatrones y SOLID, patrones existentes y descartados, evidencia de Git | `—` |
| [#51](https://github.com/Jsua3/psico_project_v2/pull/51) | `adsi/a08-limpieza-verificada` | OPEN | A-08 · Limpieza verificada — tres imports sin uso y una copia exacta | `4fe342b` |
| [#52](https://github.com/Jsua3/psico_project_v2/pull/52) | `adsi/a05b-editor-adopta-ids` | OPEN | A-05b · El editor adopta los ids reales que el servidor da a lo nuevo | `b950969` |
| [#53](https://github.com/Jsua3/psico_project_v2/pull/53) | `adsi/a09-timer-teardown` | OPEN | A-09 · Un temporizador sin dueño hacía fallar el CI de forma intermitente | `b458dde` |

## Cómo se reproduce

```bash
python docs/diseñosistemas_docs/tools/git_evidence.py
git log --format='%h %an %ad %s' --date=short adsi/integracion..adsi/a09-timer-teardown
gh pr list --state all --limit 100 --json number,title,headRefName,baseRefName,state
```
