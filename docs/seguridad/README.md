<!-- BORRADOR: índice para quien opera SIEP y para la institución. Los textos dependen de la aprobación de Psicología y de la institución (SD-8, SD-9, SD-14). -->

# Seguridad de SIEP: dónde está cada cosa

Este índice reúne lo que dejó el plan 03 de seguridad. Cada documento lo comprueba una prueba del repositorio (cita solo comandos, rutas, variables y archivos que existen).

## Para operar la plataforma

| Documento | Para qué sirve |
|---|---|
| [`incidentes.md`](incidentes.md) | Qué hacer en los primeros diez minutos de un incidente: cuenta comprometida, clave perdida, llave filtrada, alguien probando contraseñas, apagar una función, entregar evidencia. Se ensaya con una prueba automática. |
| [`derechos-del-titular.md`](derechos-del-titular.md) | Cómo atender a una persona que pide ver, llevarse o borrar lo que SIEP guarda de ella (`export_personal_data`, `erase_personal_data`) y cómo se borra lo que ya venció (`purge_expired_data`). |
| [`inventario-de-datos.md`](inventario-de-datos.md) | Qué guarda cada columna de cada tabla, para qué, por cuánto tiempo y por dónde sale. Se regenera con `python -m apps.privacy.inventory --write`. |
| [`../operacion/rotacion-de-secretos.md`](../operacion/rotacion-de-secretos.md) | Cómo rotar la llave de las sesiones, la de las reflexiones y las demás. |
| [`../operacion/parches.md`](../operacion/parches.md) | Calendario de parches y cómo leer el escaneo de la imagen. |

## Antes de abrir la primera cuenta real

[`compuerta-primera-cuenta.md`](compuerta-primera-cuenta.md): `npm run gate:primera-cuenta -- --url https://TU-DOMINIO --strict --out RUTA.md` corre lo automático y deja el informe que se adjunta al PR de despliegue, con la lista de lo manual (responsable y fecha por ítem). **No es un permiso para desplegar.**

## Cómo se verifica

| Comando | Qué comprueba |
|---|---|
| `npm run verify:seguridad` | Pruebas de seguridad, `check --deploy`, acciones fijadas por SHA, auditorías de dependencias, el bundle sin código de desarrollo ni secretos y, si están instaladas, gitleaks y el escaneo de la imagen. |
| `npm run test:csp` | La política de contenido en vigor contra el build de producción: cero violaciones (`-- --google` agrega el acceso con Google). |
| `npm run test:image` | La imagen se construye, corre sin root, sin pytest y responde `GET /api/health`. |
| `npm run test:api:e2e` | La matriz HTTP contra un servidor real, con el bloque de abuso (tokens hostiles, cuerpos, CORS, salida limpia). |
| `npm run load:aula` | Carga de un aula: mide el costo del limitador y del consentimiento. |

## Lo que decide la institución o Psicología (apagado por defecto)

Estas funciones existen y están **apagadas** hasta que alguien con autoridad entregue el texto o el plazo:

- **Aviso de contenido sensible** (`SIEP_CONSENT_REQUIRED`): el mecanismo está en el servidor y en el cliente; falta el texto aprobado por Psicología y medir el costo con `npm run load:aula`.
- **Autorización de tratamiento de datos** (`SIEP_DATA_TREATMENT_CONSENT_REQUIRED`, SD-8): falta el texto y su versión.
- **Plazos de retención y procedimiento de derechos del titular** (SD-9): hoy solo la auditoría tiene plazo (mínimo 360 días); `SIEP_RETENTION_ACCESS_REQUEST_DAYS` está vacía.
- **Dominio institucional** para el acceso con Google (SD-14).
- **Política de contenido en vigor** (`SIEP_CSP_ENFORCE`): se enciende tras repetir la sonda con el client id real de Google.
- **Historial de Git** (SD-10): se acepta mientras el repositorio sea privado y se rotan esas cuentas antes de abrirlo.
