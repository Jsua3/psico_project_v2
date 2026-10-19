<!-- BORRADOR: textos pendientes de la aprobación de Psicología. Lo técnico lo ensaya backend_django/apps/security/tests/test_runbook_incidentes.py. -->

# Runbook de incidentes

Para quien opera SIEP. Cada fila dice qué escribir.

**Nunca** pegues una clave, una llave, un token o un correo completo en un chat, un ticket o un correo. Las claves se escriben solo en el panel de variables de la plataforma o en la terminal de quien despliega.

## Primero, esto (los diez primeros minutos)

1. **Confirma qué pasó:** quién lo ve, desde cuándo, y qué cuenta, función o llave está implicada. Anota la hora.
2. **Contén:** haz la acción de la tabla que corresponda. Si no sabes cuál, cierra las sesiones de la persona afectada (fila 1, paso 1).
3. **Preserva la evidencia:** no borres ni edites nada. Mira la auditoría (fila 7) antes de cambiar algo.
4. **Avisa a quien decide** (ver «Quién decide y a quién se avisa»).
5. **Anota el incidente:** qué pasó, cuándo, qué hiciste y a quién avisaste, en el registro que defina la institución.

## Si pasa X, haz Y

`{id}` es el número de la cuenta. Las rutas las usa el ADMIN de la plataforma con su sesión; los comandos y las variables, quien despliega.

| Fila | Si pasa X | Haz Y |
|---|---|---|
| 1 | **Una cuenta parece comprometida.** | (1) `POST /api/admin/users/{id}/revoke-sessions`: cierra sus sesiones. (2) `PUT /api/admin/users/{id}` con sus datos actuales y `password`: queda con clave temporal. (3) Si sigue sospechosa: `PATCH /api/admin/users/{id}/status` con `{"activo": false}`. (4) Revisa su actividad: `GET /api/admin/audit?actorId={id}`. |
| 2 | **Una persona perdió el acceso o su clave temporal caducó.** | `PATCH /api/admin/users/{id}/status` con `{"activo": true}` aprueba la cuenta y manda una temporal nueva por correo. Si responde `APPROVAL_EMAIL_FAILED`, el correo no salió: revisa `EMAIL_HOST_USER` y `EMAIL_HOST_PASSWORD` en `docs/operacion/rotacion-de-secretos.md`. |
| 3 | **El único ADMIN perdió su clave, o su temporal caducó.** | En su terminal: `python manage.py create_admin --reset --email CORREO`, con la clave en `SIEP_ADMIN_PASSWORD`, nunca como argumento. Detalle en `docs/operacion/despliegue-railway.md`, sección 4. |
| 4 | **Se filtró una llave o una contraseña.** | Llave de firma `JWT_SIGNING_KEY`: rótala; cierra **todas** las sesiones. Otras llaves: `docs/operacion/rotacion-de-secretos.md`. Clave de una persona: fila 1, paso 2. Luego revisa la auditoría. |
| 5 | **Alguien prueba contraseñas** (muchos `429` o `account_throttled`). | (1) `GET /api/admin/audit?action=sesion.bloquear` y `python manage.py security_report --days 1` (solo recuentos). (2) Si la persona real está bloqueada: `python manage.py unblock_login --email CORREO`, y con `--ip IP` si hace falta. (3) Si sigue, pide a quien despliega que bloquee la IP fuera de SIEP. **No** apagues `SIEP_THROTTLE_ENABLED`. |
| 6 | **Hay que apagar una función ya.** | Pon su bandera (tabla abajo) en `false` en el panel y reinicia el servicio: sin reinicio, no surte efecto. |
| 7 | **Hay que entregar evidencia.** | `GET /api/admin/audit` con `actorId`, `action`, `from`, `to` (ISO 8601), `page` y `pageSize` (hasta 200). Guarda la respuesta tal cual. `python manage.py security_report --days N` solo da recuentos. |

### Tabla de banderas

`SIEP_THROTTLE_ENABLED` y `SIEP_SESSION_EPOCH_ENFORCE` se apagan **solo** con `false` (o `0`, `no`, `off`); un valor mal escrito las deja encendidas.

| Variable | Por defecto | Al apagarla (`false`) | Riesgo |
|---|---|---|---|
| `AI_ASSISTANT_ENABLED` | apagada | El asistente de IA responde 404. | Encendida, la pregunta y el contexto del caso salen a un proveedor externo. |
| `SIEP_EXPOSE_API_DOCS` | apagada | `/schema/` y `/swagger-ui.html` responden 404. | Solo lo ve un ADMIN con sesión; es para desarrollo. |
| `SIEP_CSP_ENFORCE` | apagada | La política de contenido solo informa, no bloquea. | El navegador deja pasar lo que la política impediría. |
| `SIEP_CSP_REPORT_ONLY` | encendida | Quita la cabecera de informe. | Si `SIEP_CSP_ENFORCE` también está apagada, no queda ninguna política. |
| `SIEP_CONSENT_REQUIRED` | apagada | El mundo deja de pedir el aviso aceptado. | Se juega sin consentimiento al aviso de contenido. |
| `SIEP_DATA_TREATMENT_CONSENT_REQUIRED` | apagada | Deja de pedir la autorización de tratamiento de datos. | Se trata información sin autorización. Encenderla sin `SIEP_DATA_TREATMENT_NOTICE_VERSION` impide arrancar. |
| `SIEP_THROTTLE_ENABLED` | encendida | El limitador deja de bloquear: no hay `429`. | Se pueden probar contraseñas sin freno. **No la apagues** salvo emergencia. |
| `SIEP_SESSION_EPOCH_ENFORCE` | encendida | Los tokens de antes de cerrar sesiones siguen valiendo. | Una sesión robada no se corta. **Nunca en producción.** |

Las demás banderas de `backend_django/psychosim/settings/base.py` (por ejemplo `SIEP_ATTEMPT_START_STRICT`) son del juego: no las toques sin que lo pida Psicología.

## Quién decide y a quién se avisa

- **La institución** fija los plazos legales. El consejo citó **15 días hábiles** para avisar a la Superintendencia de Industria y Comercio (SIC) por fuentes secundarias. **Ese plazo no está confirmado**: la institución debe verificarlo.
- **Psicología** decide el impacto sobre el estudiantado y el texto de cualquier aviso a personas.
- **Quien despliega** ejecuta lo técnico. **El ADMIN de la plataforma** opera las cuentas.
- **Una persona pide ver, llevarse o borrar sus datos** (no es un incidente, pero llega por el mismo canal): sigue `docs/seguridad/derechos-del-titular.md`.
- Contactos: (la institución las completa).

## Qué NO hacer

- No apagues `SIEP_THROTTLE_ENABLED` ni `SIEP_SESSION_EPOCH_ENFORCE` para «ver si se arregla».
- No pegues claves, llaves, tokens ni correos completos en chats, tickets o correos. No pongas una clave como argumento de un comando.
- No edites ni borres filas de `audit_logs`: la base lo rechaza. Si alguien lo intenta, es un incidente.
- No rotes `JWT_SIGNING_KEY` sin avisar: todas las personas tendrán que volver a entrar.

## Ensayo

- `backend_django/apps/security/tests/test_runbook_incidentes.py` ensaya las filas 1, 2, 3, 5, 6 y 7 paso a paso y comprueba que cada comando, ruta, variable y archivo citado existe. La fila 4 es texto, salvo el `PUT` de la fila 1.
- Se corre desde la raíz del repositorio: `npm run test:backend -- apps/security/tests/test_runbook_incidentes.py`. Repítelo tras cada cambio en este documento, en las cuentas, las sesiones, la auditoría o las banderas.
- A diario, en la plataforma de despliegue, deben correr `python manage.py purge_rate_limits`, `python manage.py expire_temporary_passwords` y `python manage.py purge_audit_logs`. El repositorio no las programa: compruébalo en el panel.
