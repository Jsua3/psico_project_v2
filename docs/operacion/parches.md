# Calendario de parches

Qué versiones vigila el proyecto, cuál usa hoy, dónde se anuncian las nuevas y quién las aplica. Cada versión de la tabla se lee del archivo que la fija; cuando cambia, cambian también su fila y su fecha de revisión. La prueba `backend_django/shared/tests/test_parches_doc.py` compara esta tabla con esos archivos y falla si no coinciden.

**Responsable: quien despliega.** Psicología no interviene en ninguna de estas versiones.

## Versiones vigiladas

| Paquete | Versión que usa hoy | De dónde se lee | Dónde se anuncian las nuevas | Responsable | Última revisión |
|---|---|---|---|---|---|
| `Django` | 6.1.2 | `backend_django/requirements.txt` | djangoproject.com (notas de versión y avisos de seguridad) | quien despliega | 2026-10-18 |
| `djangorestframework` | 3.18.3 | `backend_django/requirements.txt` | django-rest-framework.org y GitHub del proyecto (releases) | quien despliega | 2026-10-18 |
| `djangorestframework-simplejwt` | 5.5.1 | `backend_django/requirements.txt` | GitHub del proyecto (releases) | quien despliega | 2026-10-18 |
| `cryptography` | 50.0.2 | `backend_django/requirements.txt` | GitHub del proyecto (releases) y pypi.org | quien despliega | 2026-10-18 |
| `bcrypt` | 5.0.0 | `backend_django/requirements.txt` | GitHub del proyecto (releases) y pypi.org | quien despliega | 2026-10-18 |
| `google-auth` | 2.62.0 | `backend_django/requirements.txt` | GitHub del proyecto (releases) y pypi.org | quien despliega | 2026-10-19 |
| `gunicorn` | 26.2.0 | `backend_django/requirements.txt` | gunicorn.org y GitHub del proyecto (releases) | quien despliega | 2026-10-18 |
| `whitenoise` | 6.12.0 | `backend_django/requirements.txt` | GitHub del proyecto (releases) y pypi.org | quien despliega | 2026-10-18 |
| `@angular/core` | 22.2.6 | `frontend/package.json` (rango `^22.2.6`) | angular.dev (blog de versiones) | quien despliega | 2026-11-11 |
| `Node` | 24 | `.nvmrc` y `NODE_VERSION` de `.github/workflows/ci.yml` | nodejs.org (calendario de versiones) | quien despliega | 2026-10-18 |
| `PostgreSQL` | 18 | `docker-compose.yml` (imagen `postgres:18-alpine`; la versión menor la fija la imagen) | postgresql.org (noticias y avisos de seguridad) | quien despliega | 2026-10-18 |

Angular se muestra con el mínimo de su rango en `frontend/package.json`; el archivo de bloqueo fija la exacta.

## Django 6.1.3 (anunciado para el 2026-11-03)

Cuando salga Django 6.1.3, se aplica el mismo día, en este orden:

1. Subir `Django==6.1.3` en `backend_django/requirements.txt` y actualizar en esta tabla su versión y su fecha de revisión.
2. Correr la suite completa del backend: `npm run test:backend`.
3. Correr la compuerta de seguridad: `npm run verify:seguridad`. `pip-audit` y `npm audit` deben seguir en cero altas.
4. Anotar la fecha y el resultado en el ledger del plan de seguridad.

## Node 24 → 26 (2026-10-28)

Node 24 es LTS hasta el 2026-10-28. Ese día el proyecto pasa a Node 26 en estos archivos:

- `.nvmrc`: de `24` a `26`.
- `.github/workflows/ci.yml` y `.github/workflows/e2e-full-case.yml`: `NODE_VERSION` de `'24'` a `'26'`.
- `package.json` y `frontend/package.json`: `engines` ya admite `^24.15.0 || >=26.0.0`, así que el salto no lo exige; el día del cambio se decide si se quita 24.

La imagen del contenedor ya compila el frontend con `node:26-alpine` (`Dockerfile`), así que ese archivo no cambia.

<!-- BORRADOR: texto técnico para quien despliega; pendiente de revisión del equipo. -->
## Escaneo de la imagen

`npm run verify:seguridad` escanea la imagen que se despliega (paso `image-scan`, opcional: necesita `trivy` o `grype` y la variable `SIEP_IMAGE` con el nombre de la imagen; sin ellos se omite y lo dice). Hazlo cada vez que se reconstruye la imagen, y con cada parche de la tabla de arriba.

- **Bloquea** una vulnerabilidad de severidad alta o crítica **con corrección disponible**: lo corregible se arregla actualizando el paquete o refrescando la imagen base y volviendo a construir. El mensaje dice a qué versión actualizar («con corrección disponible: actualiza …»).
- **No bloquea** la que **no tiene corrección**: no se puede arreglar. Se informa en la consola (`aviso: … sin corrección disponible`) y se vuelve a mirar en el siguiente parche.
- Si una vulnerabilidad con corrección de verdad no se puede aplicar todavía (la corrección no llegó a la imagen base, o el código afectado no se alcanza), se registra con su motivo en `scripts/image-scan-allowlist.json`: cada entrada lleva un `motivo`, y se quita cuando la actualización ya se puede aplicar.

## Reglas

- Ninguna dependencia nueva sin motivo y licencia anotados en el ledger del plan de seguridad.
- Quien sube una versión actualiza en el mismo cambio su fila de la tabla y la fecha de revisión.
- `pip-audit` y `npm audit` deben seguir en cero altas: `npm run verify:seguridad` lo comprueba.
- El escaneo de la imagen no debe dejar altas ni críticas con corrección disponible (sección anterior).
