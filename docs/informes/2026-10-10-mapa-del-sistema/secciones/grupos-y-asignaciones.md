## Grupos y asignación de casos (backend)

Un PROFESOR administra grupos de estudiantes y les asigna versiones publicadas de casos; el acceso de un ESTUDIANTE a un caso depende únicamente de pertenecer a un grupo activo que lo tenga asignado. No hay fechas de apertura/cierre, asignación individual ni auto-inscripción.

### Que hace hoy

- Grupos: el PROFESOR crea, renombra (nombre y/o código), lista y elimina sus propios grupos; el ADMIN solo puede LISTAR todos los grupos activos y no administra ninguno (backend_django/apps/grupos/views.py:22-31; backend_django/apps/grupos/tests/test_grupos.py:113-115).
- Estudiantes: se agregan por correo uno a uno (la cuenta debe existir y ser ESTUDIANTE) o por importación `.xlsx`, que crea las cuentas inexistentes y vincula las existentes (backend_django/apps/grupos/services.py:545-558, 422-465).
- Casos: el PROFESOR asigna a un grupo una `case_version` PUBLISHED de un caso activo; la lista de asignados sale ordenada por `assigned_at` descendente (backend_django/apps/grupos/services.py:480-493, 562-582).
- Catálogo del estudiante: `GET /api/simulation/cases` devuelve solo las versiones publicadas asignadas a algún grupo activo suyo (vacío si no está en ninguno) y `POST /api/simulation/attempts` responde 403 si el caso no está asignado a su grupo (backend_django/apps/simulation/services/game_service.py:93-139, 160-164).
- `GET /api/simulation/catalog` (menú del juego) NO filtra por grupo: lista todos los casos publicados con desbloqueo lineal por completitud (backend_django/apps/progression/catalog.py:12-43).
- El profesor revisa intentos solo de estudiantes de sus grupos activos; el ADMIN, de todos (backend_django/apps/simulation/services/instructor_service.py:32-58).

### Como esta construido

- App `backend_django/apps/grupos`: `views.py` (9 `APIView`), `services.py` (toda la lógica, SQL crudo y parser xlsx propio, ~590 líneas), `serializers.py` (5 validadores de entrada), `import_contract.py` (columnas y nombre de plantilla) y `models.py` (solo `Grupo`).
- Rutas declaradas en `backend_django/psychosim/urls.py:41-52`: `GET|POST /api/grupos`; `PUT|PATCH|DELETE /api/grupos/{id}`; `GET|POST /api/grupos/{id}/estudiantes`; `DELETE .../estudiantes/{estudianteId}`; `POST .../estudiantes/import[/]` (multipart, campo `file`); `GET /api/grupos/estudiantes/import/spec` y `/template`; `GET|POST /api/grupos/{id}/casos` (cuerpo `{caseVersionId}`); `DELETE .../casos/{caseVersionId}`. `backend_django/apps/grupos/urls.py` es una copia que ningún urlconf incluye.
- Datos: `grupos` (modelo `Grupo`, `managed=False`, FK `profesor`, `activo`, `codigo` único) más dos tablas sin modelo Django tocadas con SQL crudo: `grupo_estudiante(grupo_id, estudiante_id)` y `grupo_case_version(grupo_id, case_version_id, assigned_at)`, ambas con PK compuesta (backend_django/apps/grupos/models.py:1-22; backend_django/apps/grupos/migrations/0002_grupo_case_version.py:11-21).
- Django NO crea `grupos` ni `grupo_estudiante`: la migración 0001 no tiene operaciones y la 0003 es `managed=False`; salen del volcado `deploy/db_seed.sql:910-927` o de `backend_django/apps/simulation/management/commands/bootstrap_dev_db.py:14-31`. Solo `grupo_case_version` la crea una migración (`RunSQL ... IF NOT EXISTS`).
- Lecturas del dominio fuera de la app: acceso del estudiante en `game_service.py:93-121`, alcance docente en `instructor_service.py:32-43`, reportes en `backend_django/apps/reportes/services.py:38-43`.
- Respuestas con envoltorio `{success, message, data}` (backend_django/shared/response.py:16-26); fallos de negocio como `ValidationError` -> 400 y `NotFound` -> 404 (backend_django/shared/exceptions.py:58-85).
- Semillas: `backend_django/apps/simulation/management/commands/seed_demo_access.py:98-117` (grupo `SIEP-DEMO`) y `bootstrap_dev_db.py:397-421` (grupo `DEMO1`) asignan el caso SIM-VBG-001; el volcado `deploy/db_seed.sql:2738-2790` trae 3 grupos, 32 membresías y 0 asignaciones de caso.

### Reglas que aplica

- Roles: `GET /api/grupos` = PROFESOR o ADMIN; todo lo demás = solo PROFESOR, el ADMIN recibe 403 (backend_django/apps/grupos/views.py:22-26, 40-41, 61-62, 119-120; backend_django/shared/permissions.py:15-22).
- Propiedad: `_require_grupo` devuelve 404 si el grupo no existe y 400 (no 403) "No tiene permiso sobre este grupo" si es de otro profesor (services.py:90-96; test_grupos.py:282-293). Nadie, ni el ADMIN, puede operar el grupo de otro ni cambiar su `profesor`.
- Código: único global, incluidos los grupos inactivos; se valida al crear y al actualizar (services.py:498-499, 516-517). Eliminar es borrado físico del grupo, sus membresías y sus asignaciones y libera el código; no toca cuentas ni intentos (services.py:523-530; test_grupos.py:345-355).
- `Grupo.activo` nace en true y ninguna ruta lo cambia: el filtrado por `activo` (listados, acceso, alcance docente) solo reacciona a una edición directa en BD (backend_django/apps/grupos/models.py:17).
- Agregar estudiante: 404 si el correo no existe, 400 si el rol no es ESTUDIANTE; idempotente (`ON CONFLICT DO NOTHING`); búsqueda exacta, sin pasar a minúsculas (services.py:545-558). Quitar estudiante o caso también es idempotente y no valida existencia (services.py:533-541, 585-593).
- Un estudiante puede estar en varios grupos de distintos profesores; su acceso es la unión (`DISTINCT`) de los casos de todos sus grupos activos (game_service.py:93-105).
- Importación (services.py:278-316, 365-465): solo `.xlsx`, primera hoja; obligatorias `nombre`, `apellido`, `email`, opcional `password`; acepta alias de cabecera (correo, contraseña temporal; `N°`/`#` se ignoran, services.py:31-56). Cabeceras duplicadas, desconocidas o faltantes -> 400.
- Todo o nada: una fila con nombre/apellido/email vacío, dominio mal escrito (`gamil.com`...), correo repetido en el archivo o usuario existente con rol distinto produce 400 con `data.errors[{row, field, email, message}]` y no escribe nada (services.py:365-419; views.py:91-95; test_grupos.py:179-197).
- Cuenta nueva: `ESTUDIANTE`, `activo=true`, contraseña de la fila o `settings.IMPORTED_STUDENT_DEFAULT_PASSWORD` (variable de entorno homónima con valor por defecto fijo en código, backend_django/psychosim/settings/base.py:122-124); ese valor viaja en la respuesta (`defaultPassword`) y en la plantilla. Cuenta existente: se ignoran nombre, apellido y password del archivo y solo se vincula (services.py:430-443, 349).
- Contadores de la respuesta: `created`, `existing`, `assigned` (= `associated`, filas nuevas en el grupo), `skipped` (ya estaban), `duplicated` (siempre 0), `errors`, `students` (services.py:338-352, 445-454).
- Asignar caso: 404 si la versión no existe; 400 "Solo se pueden asignar casos publicados y activos" si `status != PUBLISHED` o `simulation_case.active` es falso; cualquier profesor puede asignar cualquier caso publicado (no hay propiedad de casos) y es idempotente (services.py:561-582).
- Cada versión se asigna por separado: publicar una versión nueva no archiva la anterior ni migra asignaciones (backend_django/apps/simulation/services/authoring/publication.py:57-85); solo el comando de semilla `backend_django/apps/simulation/management/commands/seed_caso_pdf.py:1415,1427` archiva versiones.
- Acceso: la pertenencia se exige al INICIAR (`start_attempt`, solo rol ESTUDIANTE; ADMIN exento; PROFESOR no puede iniciar por `IsEstudianteOrAdmin`) y al listar `/cases` (game_service.py:160-164; backend_django/apps/simulation/views/game_views.py:38-39). Retirar el caso o al estudiante no corta intentos abiertos: reanudar y jugar solo validan token y dueño (game_service.py:67-83, 206-219).
- Cuentas y casos: el alta de usuarios es solo ADMIN (backend_django/apps/users/views.py:123-135, 190-204), así que la importación del profesor es la otra vía de alta de cuentas ESTUDIANTE; autoría y publicación de casos son solo ADMIN (backend_django/apps/simulation/views/authoring_views.py:23-24).

### Limites y deuda conocida

- Sin ventanas de tiempo ni plazos: `grupo_case_version` solo guarda `assigned_at` (para ordenar). Sin asignación a estudiantes individuales ni inscripción por código (el `codigo` es una etiqueta única, no una llave de ingreso).
- Reportes sin control de propiedad: `GET /api/reportes/grupo/{id}[/export]` exige PROFESOR o ADMIN pero no comprueba que el grupo sea del profesor; cualquier profesor ve estudiantes y puntajes de cualquier grupo (backend_django/apps/reportes/services.py:155-168; backend_django/apps/reportes/views.py:28-46).
- Membresía sin consentimiento: cualquier profesor puede sumar a su grupo a cualquier estudiante existente por correo y con ello acceder a sus intentos y reflexiones descifradas (services.py:545-558 -> instructor_service.py:32-58, 125-133). El 404 frente al 400 además revela qué correos existen y con qué rol.
- La plantilla descargada trae una fila de ejemplo; subirla sin editar crea una cuenta real con contraseña conocida y la prueba lo da por bueno (services.py:237-240; test_grupos.py:224-239).
- Contraseña compartida sin cambio propio: no hay endpoint de cambio de contraseña del usuario (backend_django/apps/users/urls.py:13-18); solo el ADMIN la cambia (users/serializers.py:83-84). El importador no aplica el mínimo de 8 caracteres que sí exige el alta por ADMIN (users/serializers.py:54, 131).
- Parser xlsx propio con `xml.etree`, sin límite de filas ni de tamaño; un xlsx corrupto puede lanzar `ParseError`/`KeyError` no capturados (500) (services.py:126-201). Código muerto: `REQUIRED_IMPORT_FIELDS` (services.py:57), la clave `duplicated` y el segundo `return` de views.py:97.
- Longitudes: el volcado de producción define `nombre` varchar(150) y `codigo` varchar(30) (deploy/db_seed.sql:920-923); modelo y `bootstrap_dev_db` dicen 255/50 y los serializers no limitan, así que un valor largo fallaría en BD con 500.
- Inconsistencias de lectura: `listar_casos_asignados` muestra versiones ya no publicadas o inactivas que el estudiante no ve; `/catalog` muestra casos que el estudiante no puede iniciar (403).
- Sin auditoría de altas, bajas ni asignaciones (el módulo no usa `@auditable`); N+1 en listados (conteo por grupo, 2 consultas por caso); el listado del profesor no define orden.
- Sin transferencia de profesor ni reactivación por API: un grupo cuyo profesor deja el sistema queda inaccesible.
- Pruebas: 25 en `test_grupos.py` y 8 en `test_imported_password_setting.py`; no cubren retirar caso, GET de casos, rechazo de caso no publicado, `import/spec` ni grupos inactivos.
