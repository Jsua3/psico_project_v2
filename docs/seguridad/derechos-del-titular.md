<!-- BORRADOR: textos pendientes de la aprobación de Psicología y de la institución (SD-9). Lo técnico lo comprueba backend_django/apps/privacy/tests/test_derechos_del_titular_doc.py. -->

# Derechos del titular y retención de datos

Para quien opera SIEP y no programa. Explica cómo atender a una persona que pide **ver, llevarse o borrar** lo que SIEP guarda de ella, y cómo se borra lo que ya venció.

**Esto no es asesoría jurídica.** Los plazos, el procedimiento y lo que la ley obliga los define la institución (SD-9, pendiente). Aquí están las herramientas y lo que hacen hoy; la lista de lo que decide la institución está al final.

## Qué hay

Tres comandos, que se ejecutan en la terminal del servicio (como `create_admin`). No hay pantallas ni rutas nuevas.

| Comando | Para qué |
|---|---|
| `export_personal_data` | Saca a un archivo todo lo que SIEP guarda de una persona. |
| `erase_personal_data` | Suprime la identidad de una persona: su cuenta queda con un seudónimo y sus textos se borran. |
| `purge_expired_data` | Borra lo vencido: contadores del limitador, auditoría pasada de su plazo y, si la institución lo configuró, solicitudes de acceso ya resueltas. |

Qué guarda SIEP, columna por columna, está en `docs/seguridad/inventario-de-datos.md`. Qué se hace con cada columna al suprimir está en `backend_django/apps/privacy/data_subject.py` y se explica abajo.

## Antes de empezar

1. **La institución recibe la petición y verifica quién la hace.** SIEP no verifica identidades. No ejecutes nada sin esa verificación.
2. Necesitas: la terminal del servicio; el **correo de un administrador activo** (`--executed-by CORREO_DEL_ADMIN`), que queda anotado por su número de cuenta y no por su correo; y el correo (`--email CORREO`) o el número de cuenta (`--user-id NÚMERO`) de la persona.
3. **Siempre `--dry-run` primero.** Cuenta lo que haría y no escribe nada, ni siquiera la auditoría. Para hacerlo de verdad se añade `--confirm`; sin él, el comando se niega.
4. La salida de los comandos nunca trae correos, nombres ni textos: solo números de cuenta y recuentos. El archivo de la exportación sí trae datos sensibles: trátalo como tal.
5. Todo queda en la auditoría, con el número de la cuenta de la persona y el del administrador, sin datos personales: `datos.exportar`, `datos.suprimir` y `datos.depurar`. El ADMIN las consulta con `GET /api/admin/audit` y el filtro `action`.

## Exportar los datos de una persona

```
python manage.py export_personal_data --email CORREO --executed-by CORREO_DEL_ADMIN --dry-run
python manage.py export_personal_data --email CORREO --executed-by CORREO_DEL_ADMIN --confirm --out RUTA.json
```

El archivo (`--out`) trae, en JSON: su cuenta (sin la contraseña), sus grupos y asignaciones, sus intentos y todo lo que hizo en ellos, **sus bitácoras de reflexión descifradas**, las evaluaciones que recibió, sus consentimientos, sus solicitudes de acceso y la auditoría de sus acciones con su IP y su navegador. Si además fue docente, trae lo suyo (los grupos que enseña, los casos que escribió, las evaluaciones que dio), pero **nunca los datos de otra persona**.

- El archivo debe ser **nuevo**: el comando se niega a sobrescribir uno que exista. En Linux queda con permisos solo para quien lo creó.
- Nunca sale por la pantalla.
- Entrégalo por un canal seguro de la institución y **borra tu copia** cuando la persona lo haya recibido. No lo pegues en un chat, un ticket ni un correo.

## Suprimir la identidad de una persona

```
python manage.py erase_personal_data --email CORREO --executed-by CORREO_DEL_ADMIN --dry-run
python manage.py erase_personal_data --email CORREO --executed-by CORREO_DEL_ADMIN --confirm
```

Pasos: (1) con `--dry-run`, revisa el resumen por tabla; (2) pide la aprobación que la institución haya definido; (3) repite con `--confirm`; (4) vuelve a correr con `--dry-run`: debe decir que la cuenta ya estaba suprimida y no mostrar cambios.

**No se puede deshacer.** Ante la duda, no ejecutes y pregunta.

Qué hace, en palabras:

- **La cuenta** conserva su fila, pero su nombre, su apellido y su correo pasan a un seudónimo con su número (`Cuenta eliminada-NÚMERO` y `eliminada-NÚMERO@invalid`, que no es un correo real). Su contraseña queda inutilizable, la cuenta queda inactiva, sin marcas de contraseña temporal, y **se cierran todas sus sesiones**: no puede entrar y su sesión de antes deja de valer.
- **Sus solicitudes de acceso** con su correo quedan anonimizadas: solo se conserva su estado y sus fechas.
- **Sus bitácoras de reflexión** se borran.
- **El motivo escrito de una salida segura** se quita de su línea de tiempo y de su informe congelado, y las etiquetas de evidencia saltada se quitan de su línea de tiempo; el resto del informe queda.
- **La auditoría de sus acciones** conserva qué pasó y cuándo, pero pierde la IP y el navegador. Si había texto libre antiguo del asistente de IA, también se quita.
- **Lo que escribió como docente**: la nota de una revisión de caso que decidió, el nombre de quien revisó el contenido y las notas de evidencia de una lista de verificación se borran o se reemplazan por el seudónimo.
- **No se suprime a un administrador**: quítale el rol primero.
- Repetir el comando sobre una cuenta ya suprimida no falla ni cambia nada.

### Qué pasa con cada tabla

Esta tabla la comprueba una prueba contra las reglas del código: si una regla cambia, la prueba obliga a actualizarla.

| Tabla | Qué guarda | Al suprimir |
|---|---|---|
| `users` | La cuenta: nombre, apellido, correo, rol, contraseña | se reemplaza por un valor que no identifica a nadie; el resto se conserva |
| `access_requests` | Solicitudes de acceso con su nombre y correo | se reemplaza por un valor que no identifica a nadie; el resto se conserva |
| `grupos` | Grupos que enseña | se conserva |
| `grupo_estudiante` | Pertenencia a un grupo y quién la invitó | se conserva |
| `case_assignments` | Casos asignados a ella o por ella | se conserva |
| `simulation_cases` | Casos que escribió | se conserva |
| `case_versions` | Versiones de caso que creó o editó | se conserva |
| `case_reviews` | Revisiones de caso que pidió o decidió | se reemplaza por un valor que no identifica a nadie y se vacía; el resto se conserva |
| `rubrics` | Rúbricas que creó | se conserva |
| `simulation_rubric_assignments` | Rúbricas que asignó a un caso | se conserva |
| `publication_checklists` | Listas de verificación que envió | se conserva |
| `publication_checklist_items` | Notas de evidencia de esas listas | se anula |
| `simulation_attempts_v2` | Sus intentos y su estado | se reemplaza por un valor que no identifica a nadie; el resto se conserva |
| `attempt_events` | Línea de tiempo de cada intento | se reemplaza por un valor que no identifica a nadie; el resto se conserva |
| `attempt_hint_views` | Pistas que pidió | se conserva |
| `attempt_reports` | Informe congelado de cada intento | se limpia el texto escrito por la persona; el resto se conserva |
| `reflection_journals` | Sus bitácoras de reflexión (cifradas) | se borra la fila |
| `attempt_world_states` | Estado del mundo de cada intento | se conserva |
| `student_case_completion` | Casos que completó | se conserva |
| `rubric_evaluations` | Evaluaciones docentes que recibió o dio | se conserva |
| `criterion_scores` | Puntaje y comentario de cada criterio | se conserva |
| `audit_logs` | Auditoría de sus acciones | se anula y se limpia el texto escrito por la persona; el resto se conserva |
| `consent_records` | Aviso de contenido que vio y aceptó | se conserva |

### Qué se conserva y por qué

- **Lo que hizo** (intentos, decisiones, eventos, pistas, informes, evaluaciones, pertenencia a grupos y autoría) queda como dato agregado enlazado a una cuenta que **ya es un seudónimo**: sin el nombre ni el correo, no identifica a nadie. La institución decide si también quiere borrarlo (ver abajo).
- **El consentimiento** queda como evidencia de que el aviso de contenido se mostró y se aceptó (ETH-01).
- **La auditoría** queda porque es la evidencia de quién hizo qué (se conserva 360 días como mínimo); solo pierde la IP y el navegador de la persona.
- **El contenido del programa** (casos, rúbricas, grupos) no se borra: solo su autoría queda con el seudónimo.
- **Los comentarios que un docente escribió sobre la persona** (evaluaciones) se conservan: pueden nombrarla y el comando no los edita. Es una decisión de la institución.

## Depurar lo vencido

```
python manage.py purge_expired_data --executed-by CORREO_DEL_ADMIN --dry-run
python manage.py purge_expired_data --executed-by CORREO_DEL_ADMIN --confirm
```

Borra, y solo da recuentos:

- Los **contadores del limitador** cuya ventana ya no se lee (lo mismo que `purge_rate_limits`).
- La **auditoría pasada de su plazo** (lo mismo que `purge_audit_logs`; el plazo nunca baja de 360 días).
- Las **solicitudes de acceso ya resueltas** más viejas que `SIEP_RETENTION_ACCESS_REQUEST_DAYS` días, contados desde que se resolvieron. **Vacía o en 0 no se borra ninguna**: el plazo lo define la institución. Una solicitud pendiente nunca se borra.

Se puede programar a diario en la plataforma de despliegue; entonces ya no hace falta programar por separado `purge_rate_limits` ni `purge_audit_logs` (sí `expire_temporary_passwords`). El repositorio no lo programa: el comando programado lleva `--confirm` y el correo del administrador que ejecuta. Compruébalo en el panel.

## Con qué cuenta de la base se ejecutan

La auditoría es de solo añadir: la base rechaza `UPDATE` y `DELETE` sobre `audit_logs` salvo dentro de una ventana que abren solo los comandos de mantenimiento. Esa ventana **no sirve si la cuenta de la base no tiene el privilegio**. Por eso hay dos cuentas distintas:

- **La cuenta de la aplicación** (la que atiende las peticiones) **no** debe tener `UPDATE`, `DELETE` ni `TRUNCATE` sobre `audit_logs` (fila 22 de la compuerta). Es la protección si alguien se apodera de la aplicación.
- **Una cuenta de mantenimiento**, solo para la terminal de quien despliega, con esos privilegios, es la que necesitan `erase_personal_data`, `purge_expired_data`, `purge_audit_logs` y `migrate`. Con la cuenta de la aplicación esos comandos fallan con `permission denied for table audit_logs`; la supresión no cambia nada (es atómica) y la depuración de cada noche falla sin ruido.

Hoy SIEP lee **un solo** `DATABASE_URL`: para correr esos comandos, quien despliega lo cambia en su terminal por el de la cuenta de mantenimiento, solo en esa sesión. Crear la cuenta y decidir cómo se programa la depuración (con qué cuenta y con qué aviso si falla) es una decisión del despliegue, y queda en la lista de la compuerta (filas 21 y 22).

## Lo que decide la institución (SD-9)

SIEP trae las herramientas; **no inventa obligaciones legales**. La institución debe definir:

- Quién recibe las peticiones y **quién verifica la identidad** de quien pide.
- Los **plazos de respuesta** a la persona.
- Los **plazos de retención** por tabla. Hoy solo la auditoría tiene uno (360 días como mínimo); lo demás se conserva hasta que alguien lo suprima.
- Si se **conservan las evaluaciones docentes** de una persona suprimida, y si se conservan o se borran los comentarios que los docentes escribieron sobre ella.
- Cuánto se conservan las solicitudes de acceso ya resueltas (`SIEP_RETENTION_ACCESS_REQUEST_DAYS`).
- Qué se hace con las copias de seguridad de la base y con los correos ya enviados.
- Quién aprueba una supresión antes de ejecutarla y cómo se le responde a la persona.

## Lo que este procedimiento no cubre

- **Quien solo pidió acceso y nunca tuvo cuenta**: los comandos de la persona buscan una cuenta. Su solicitud solo se borra por el plazo de arriba.
- **Las solicitudes de acceso hechas con otro correo** distinto del que tiene hoy la cuenta no se encuentran: se buscan por el correo actual.
- **Un docente con grupos activos**: sus grupos y sus casos se conservan, pero quedan a nombre de una cuenta inactiva que nadie puede usar. SIEP no tiene hoy cómo pasarlos a otro docente: la institución decide qué hacer con ellos antes de suprimirlo.
- **`--executed-by` declara quién ejecuta, no lo autentica.** Queda en la auditoría con el número de esa cuenta, pero quien tiene la terminal del servicio podría declarar a otro administrador: la defensa es limitar quién tiene esa terminal.
- **Los intentos fallidos de entrar a su cuenta** quedan en la auditoría (`sesion.fallar`) con la IP de quien intentó: no son filas suyas, y no se tocan.
- **Las copias de seguridad** de la base de datos y los correos que SIEP ya envió quedan fuera: decide la plataforma y la institución.
- **Una cuenta suprimida no se reactiva ni se edita** desde la pantalla de usuarios: el servidor responde 409 `ACCOUNT_ERASED`. Así nadie le vuelve a poner un nombre y un correo al historial que se seudonimizó.
- Si la persona pide acceso otra vez con el mismo correo, se crea una cuenta **nueva**: el correo quedó libre.

## Ensayo

- `backend_django/apps/privacy/tests/test_data_subject_erase.py` ensaya la supresión con una persona que tiene datos en todas las tablas y con un barrido de todo el esquema: tras suprimirla no queda ni su correo, ni su nombre, ni un texto suyo, y los datos de otra persona siguen intactos.
- `backend_django/apps/privacy/tests/test_data_subject_export.py`, `backend_django/apps/privacy/tests/test_data_subject_commands.py` y `backend_django/apps/privacy/tests/test_purge_expired.py` ensayan la exportación, los comandos y la depuración.
- `backend_django/apps/privacy/tests/test_data_subject_cobertura.py` obliga a decidir qué se hace con cada columna nueva del inventario: sin regla, ni la prueba ni el comando de suprimir pasan.
- `backend_django/apps/privacy/tests/test_derechos_del_titular_doc.py` comprueba que este documento solo cita comandos, variables y archivos que existen y que la tabla de arriba dice lo mismo que las reglas.
- `backend_django/apps/users/tests/test_cuenta_suprimida.py` comprueba que el panel no reactiva ni edita una cuenta suprimida y `backend_django/apps/simulation/tests/test_safe_exit_reason_limit.py` que el motivo escrito de una salida segura se recorta a 500 caracteres.
- Se corren desde la raíz del repositorio: `npm run test:backend -- apps/privacy`.
