<!-- BORRADOR: guía técnica para quien despliega; pendiente de revisión del equipo. -->

# Compuerta «antes de la primera cuenta real»

Comando: `npm run gate:primera-cuenta` (tarea S7-4 del plan 03, §11). Código: `scripts/gate-primera-cuenta.mjs`.

## Qué es y qué no es

- **Es** la evidencia con fecha de lo que se cumple de forma automática antes de abrir la primera cuenta real, y la lista de lo que queda para personas, con responsable y fecha en blanco.
- **Es** lo que se adjunta al PR de despliegue.
- **No es** un permiso para desplegar. Quien aprueba el despliegue sigue siendo una persona.
- **No** despliega, no cambia la configuración y no decide por Psicología ni por la institución.
- **Nunca imprime** un valor de variable de entorno, una URL con credenciales, un correo ni una IP de personas. Las variables se nombran cuando faltan; los valores no salen.

## Cómo correrla

1. Ten en tu terminal las variables del despliegue, con sus valores reales: `DJANGO_SECRET_KEY`, `REFLECTION_ENCRYPTION_KEY`, `REFLECTION_ACTIVE_KEY`, `REFLECTION_KEYS`, `JWT_SIGNING_KEY`, `DJANGO_ALLOWED_HOSTS`, `SIEP_TRUSTED_PROXIES` y `DATABASE_URL` (o `DB_PASSWORD`). Son las mismas que la plataforma. No pegues sus valores en ningún sitio. Los pasos de «entorno aportado» las reciben; en cambio `verify:estructural`, `verify:seguridad`, la sonda de CSP y la imagen corren como procesos hijos sin las variables de producción (`DATABASE_URL`, `DB_*`, `DJANGO_*`, `JWT_*`, `REFLECTION_*`, `EMAIL_*`, `GOOGLE_*`, `AI_*`, `RAILWAY_*`, `SIEP_ADMIN_PASSWORD`, `SIEP_TRUSTED_PROXIES`, `SIEP_HSTS_SECONDS` y `SIEP_ALLOWED_ASSET_HOSTS`): no las necesitan, no deben recibir secretos reales y los corredores de pruebas se niegan a correr con `DATABASE_URL` definido.
2. Desde la raíz del repositorio, con el venv del backend creado (`npm run up`):

   ```
   npm run gate:primera-cuenta -- --url https://TU-DOMINIO --out ..\compuerta-primera-cuenta.md
   ```

   De `--url` solo se usa el origen (esquema, dominio y puerto): una ruta se ignora y una URL con usuario o clave se rechaza sin repetirla. `--out` debe apuntar **fuera** del repositorio: sin `--out`, el informe va a la carpeta desde la que corriste `npm`, y si esa carpeta está dentro del repositorio la compuerta se niega a correr.
3. Opcionales: `--with-image` (construye la imagen; tarda minutos y necesita docker), `--with-csp` (construye el frontend y corre la sonda; tarda minutos y necesita Chromium), `--only id,id` (solo esos pasos automáticos; el informe queda INCOMPLETA) y `--strict`. **Cuando el informe va al PR de despliegue, corre con `--strict`:** una compuerta INCOMPLETA (sin fallas, pero con algo automático omitido) sale con código 3 en vez de 0, así que ni un script ni una persona la toma por buena sin darse cuenta.

El código de salida es 0 si ningún paso falló, 1 si alguno falló y 2 si la orden no se entiende; con `--strict`, además, 3 si no falló nada pero la compuerta quedó INCOMPLETA (las fallas siguen saliendo con 1). Tarda: `verify:estructural` y `verify:seguridad` corren sus suites completas.

## Qué escribe en la base real

Casi todo es solo lectura: la compuerta cuenta, mira y compara, pero no sella versiones, no marca cuentas y no cambia configuración. Hay una excepción, y la guía la dice para que quien despliega lo sepa antes de correr la compuerta contra producción:

- `fallos-429` e `ip-de-confianza` hacen intentos de inicio de sesión contra un correo inventado (`<hex>@gate.invalid`). Quedan filas de auditoría `sesion.fallar` con el hash del correo, nunca el correo; `fallos-429` deja además una fila `sesion.bloquear` al saltar el bloqueo, y ambos suman contadores del limitador. Es parte de la prueba.

Si `sellos-y-claves-compartidas` falla por versiones sin sello, el arreglo no lo hace la compuerta: corre `python manage.py seal_published_versions --strict` tras `migrate`, como en cada despliegue, y repite la compuerta.

## Tabla de comprobaciones

Las 27 filas de la sección 11 del plan y, al final, dos filas extra (los derechos del titular y la salud). La última columna es el paso que lo comprueba: su id, tal como aparece en el informe.

| Fila | Comprobación | Tipo | Quién | Tarea | Paso |
|---|---|---|---|---|---|
| 1 | `verify:estructural` y `verify:seguridad` en verde | automática | script | S0-1 | `verify-estructural`, `verify-seguridad` |
| 2 | `check --deploy` sin avisos fuera de los permanentes del baseline | automática (entorno aportado) | quien despliega | S2-2 | `check-deploy` |
| 3 | IP de confianza medida con un `X-Forwarded-For` falso. Límite: la compuerta no puede saber cuál es la IP verdadera del cliente, así que no detecta un `SIEP_TRUSTED_PROXIES` de MENOS (todo el aula compartiría contador); la medición del primer despliegue (S1-1) sigue siendo manual | automática | script | S1-1 | `ip-de-confianza` |
| 4 | Redirección 301/308 de http a https y HSTS en el escalón vigente (sin preload ni includeSubDomains) | semiautomática | script y quien despliega | S2-2 | `https-hsts` |
| 5 | CSP en vigor, medida con dos peticiones a la página (el nonce debe cambiar), con `object-src 'none'`, `frame-ancestors 'none'` y `base-uri 'self'`, sin `*`, `http:` ni `'unsafe-eval'` en las directivas de fuentes y sin `'unsafe-inline'` en `script-src` ni `style-src` (solo `style-src-attr` puede llevarlo, con el acceso con Google); cabeceras de seguridad y sonda sin violaciones (`--with-csp`) | automática | script y sonda | S2-4 | `cabeceras-csp`, `csp-sonda` |
| 6 | Seis intentos de inicio de sesión contra un correo inventado: cinco 401 y un 429 THROTTLED con Retry-After | automática | script | S1-2 | `fallos-429` |
| 7 | Ninguna versión publicada sin sello (solo lectura) y `force_password_change_for_shared_passwords --dry-run` sin pendientes | automática (entorno aportado) | script | S1-5 | `sellos-y-claves-compartidas` |
| 8 | Respaldo restaurado en una base vacía (runbook de E5-5) | manual | quien despliega | S7-4 | `respaldo-restaurado` |
| 9 | `SIEP_CONSENT_REQUIRED` encendida con el aviso vigente y el texto aprobado por Psicología | manual | Psicología | S3-2 | `consentimiento-aviso` |
| 10 | `DATA_TREATMENT`: texto y versión de la institución, o su decisión escrita de no usarlo | manual | institución | S3-2 | `tratamiento-de-datos` |
| 11 | Secretos generados, rotación hecha, gitleaks limpio sobre el historial y SD-10 decidida | manual | quien despliega | S5-3 | `secretos-y-rotacion` |
| 12 | Correo transaccional probado (aprobación e invitación) | manual | quien despliega | S7-4 | `correo-transaccional` |
| 13 | PostgreSQL según el plan 02 §9.2: rol sin superusuario ni DDL, red privada, TLS, scram-sha-256, respaldos cifrados, parches y registro de conexiones | manual | quien despliega | S7-4 | `postgresql` |
| 14 | Con el primer ADMIN: iniciar sesión, cambiar un usuario y exportar un reporte dejan sus filas en `GET /api/admin/audit` | manual | quien despliega | S4-1 | `auditoria-extremo-a-extremo` |
| 15 | Runbook de incidentes ensayado | manual | equipo | S7-5 | `runbook-incidentes` |
| 16 | `SIEP_CSP_ENFORCE=true` y `npm run test:csp -- --google` con el client id real, sin violaciones | manual | quien despliega | S2-4, SD-1 | `csp-enforce-google` |
| 17 | `SIEP_CONSENT_REQUIRED` con el costo medido con `load:aula` | manual | quien despliega | S3-2a, S3-2b | `consentimiento-costo` |
| 18 | Variables que `production.py` exige definidas y el arranque de producción las acepta | automática (entorno aportado) | script | S1-1, S5-1…S5-3, R1b | `variables-obligatorias` |
| 19 | Primer ADMIN creado con `create_admin` y clave temporal cambiada antes de que caduque | manual | quien despliega | R1b, R1b2 | `primer-admin` |
| 20 | Ninguna cuenta de demostración y al menos un ADMIN activo con la clave ya cambiada | automática (entorno aportado) | script | S5-4, S7-4 | `sin-cuentas-demo` |
| 21 | Tareas programadas en la plataforma: `purge_rate_limits`, `expire_temporary_passwords` y `purge_audit_logs` | manual | quien despliega | S1-2, S1-5, S4-2 | `tareas-programadas` |
| 22 | El rol de la aplicación no tiene UPDATE, DELETE ni TRUNCATE sobre `audit_logs` | automática (entorno aportado) | script | S4-2 | `rol-sin-escritura-en-auditoria` |
| 23 | Alerta sobre las líneas `throttle_backend_error` y `audit_write_failed` | manual | quien despliega | S1-2, S4-3 | `alertas` |
| 24 | `npm run test:image` verde sobre la imagen que se despliega (se corre con `--with-image`) | automática | script | S6-1 | `imagen` |
| 25 | `railway run` y la terminal del contenedor verificados para `create_admin` | manual | quien despliega | R1b2 | `railway-run` |
| 26 | `SIEP_ALLOWED_ASSET_HOSTS` decidida con la institución y reflejada en `img-src` | manual | institución | S2-6b | `hosts-de-activos` |
| 27 | Suite completa del backend con Python 3.14 (la imagen) en verde sobre el commit que se despliega | manual | quien despliega | punto de control | `suite-python-314` |
| extra | La institución definió el procedimiento y los plazos de los derechos del titular y la retención (SD-9), y los comandos se ensayaron con `--dry-run` (`docs/seguridad/derechos-del-titular.md`) | manual | institución | S3-4 | `derechos-del-titular` |
| extra | `GET /api/health` responde 200 | automática | script | C11 | `salud` |

Notas sobre la tabla:

1. Las filas 14 y 27 son manuales: la 14 solo se puede hacer con el primer ADMIN ya creado (la compuerta no usa credenciales) y la 27 es la suite completa del backend con Python 3.14 (el de la imagen), que tarda más de diez minutos y se corre aparte.
2. La fila 22 figura como manual en la sección de requisitos del plan, pero la tarea S7-4 pide comprobarla con SQL contra la base real: por eso aquí es automática con entorno aportado.
3. La tarea S7-4 numera la comprobación de salud como (12) y el correo como 12b. En el plan, la fila 12 es el correo: cada paso lleva aquí su fila del plan, y la salud es la fila extra.
4. Los pasos manuales salen siempre como pendientes. Los confirma la persona responsable escribiendo su nombre y la fecha en el informe: la compuerta nunca los da por hechos.

## Qué hacer ante cada resultado

- **ok**: nada que hacer. El informe lo registra con su detalle.
- **falla**: no sigas adelante. Corrige lo que dice el detalle y vuelve a correr la compuerta entera: un informe con fallas no se adjunta. Si `ip-de-confianza` falla, la IP de confianza no coincide con los proxies reales: mídela otra vez (S1-1) y corrige `SIEP_TRUSTED_PROXIES`. Si `variables-obligatorias` falla, el arranque nombra la causa: corrige la variable, no el valor.
- **omitida**: falta algo que el detalle nombra (una variable por su nombre, una herramienta, `--url` o un `--with-…`). Complétalo y vuelve a correr. Mientras una comprobación automática esté omitida, la línea final dice INCOMPLETA y el informe no es evidencia completa (con `--strict`, además, la orden sale con 3). También queda omitida `verify-seguridad` (o `verify-estructural`) si alguno de sus pasos opcionales no corrió, por ejemplo `gitleaks` sin instalar: el detalle dice cuáles.
- **pendiente**: la persona responsable de la fila lo confirma y escribe su nombre y la fecha en el informe.

## Cómo adjuntar el informe al PR de despliegue

1. Corre la compuerta desde el commit que vas a desplegar, con el árbol limpio. El informe dice el commit y si el árbol tenía cambios sin confirmar: un informe de árbol sucio no sirve como evidencia.
2. Adjunta el archivo al PR de despliegue, con el veredicto final a la vista, y llena el responsable y la fecha de cada fila manual.
3. Revisa el archivo antes de publicarlo. El script no imprime valores, pero el informe lleva el dominio y el commit.
