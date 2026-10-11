# Plan de marcado inicial

> Generado el 2026-10-11. Cada fila es una prueba que un evaluador del contraste señaló como respaldo de un requisito (`pruebas_existentes` de `contraste-pn3/datos/veredictos.json`). «Existe» comprueba el archivo y el nombre en el árbol actual. Adoptar la convención = añadir el marcador sugerido a esas pruebas; es un cambio mecánico y sin efecto en el comportamiento.

- Entradas de los evaluadores: **310** · pruebas señaladas: **300** (nombre verificado: 66; archivo existe, por líneas: 233; archivo sí y nombre no: 0; archivo inexistente: 0; sin ruta: 1) · **huecos declarados: 10**.

## Pruebas a marcar

| ID | Archivo | Prueba o líneas | Existe | Marcador sugerido |
|---|---|---|---|---|
| RF-01 | `backend_django/apps/users/tests/test_auth.py` | (login ok, credenciales malas, inactivo, claims, /me con y… | sí (archivo; por líneas) | @pytest.mark.req("RF-01") |
| RF-01 | `backend_django/apps/users/tests/test_google_login_contract.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RF-01") |
| RF-01 | `backend_django/apps/users/tests/test_models.py` | :8-33 | sí (archivo; por líneas) | @pytest.mark.req("RF-01") |
| RF-01 | `scripts/api-e2e.mjs` | :104-134 y :182-188 (login por rol y 401) | sí (archivo; por líneas) | describe/it con «[RF-01]» al inicio del título |
| RF-01 | `frontend/src/app/core/auth/jwt.interceptor.spec.ts` | , token.utils.spec.ts, http-error-chain.spec.ts | sí (archivo; por líneas) | describe/it con «[RF-01]» al inicio del título |
| RF-01 | `frontend/src/app/features/login/login.a11y.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-01]» al inicio del título |
| RF-01 | `frontend/e2e/full-case.e2e.ts` | :37-38 (login de estudiante por UI) | sí (archivo; por líneas) | describe/it con «[RF-01]» al inicio del título |
| RF-02 | `scripts/api-e2e.mjs` | :136-180 (matriz 200/403 por rol: simulation/cases, reporte… | sí (archivo; por líneas) | describe/it con «[RF-02]» al inicio del título |
| RF-02 | `backend_django/apps/users/tests/test_auth.py` | :114-137 (register 401 sin sesion y 403 para no admin) | sí (archivo; por líneas) | @pytest.mark.req("RF-02") |
| RF-02 | `backend_django/apps/grupos/tests/test_grupos.py` | :113-115 (ADMIN no crea grupos) | sí (archivo; por líneas) | @pytest.mark.req("RF-02") |
| RF-02 | `backend_django/apps/simulation/tests/test_authoring.py` | , test_instructor.py, test_rubrics.py (casos 403) | sí (archivo; por líneas) | @pytest.mark.req("RF-02") |
| RF-03 | `backend_django/apps/users/tests/test_auth.py` | :166-249, :318-362 | sí (archivo; por líneas) | @pytest.mark.req("RF-03") |
| RF-03 | `backend_django/apps/users/tests/test_access_requests.py` | :86-103 | sí (archivo; por líneas) | @pytest.mark.req("RF-03") |
| RF-03 | `frontend/src/app/features/admin/users.validation.spec.ts` | , users.validation.dom.spec.ts, users.feedback.spec.ts | sí (archivo; por líneas) | describe/it con «[RF-03]» al inicio del título |
| RF-03 | `frontend/src/app/features/admin/forms-validation.contract.spec.ts` | , portal-feedback.contract.spec.ts | sí (archivo; por líneas) | describe/it con «[RF-03]» al inicio del título |
| RF-03 | `scripts/api-e2e.mjs` | :166-170 (ADMIN GET /admin/users 200) | sí (archivo; por líneas) | describe/it con «[RF-03]» al inicio del título |
| RF-04 | `backend_django/apps/grupos/tests/test_grupos.py` | test_create_grupo_201 | sí (nombre verificado) | @pytest.mark.req("RF-04") |
| RF-04 | `backend_django/apps/grupos/tests/test_grupos.py` | test_create_duplicate_codigo_400 | sí (nombre verificado) | @pytest.mark.req("RF-04") |
| RF-04 | `backend_django/apps/grupos/tests/test_grupos.py` | test_add_student_increments_total | sí (nombre verificado) | @pytest.mark.req("RF-04") |
| RF-04 | `backend_django/apps/grupos/tests/test_grupos.py` | test_add_non_student_400 | sí (nombre verificado) | @pytest.mark.req("RF-04") |
| RF-04 | `backend_django/apps/grupos/tests/test_grupos.py` | test_add_student_to_foreign_group_400 | sí (nombre verificado) | @pytest.mark.req("RF-04") |
| RF-04 | `backend_django/apps/grupos/tests/test_grupos.py` | test_remove_student_from_group | sí (nombre verificado) | @pytest.mark.req("RF-04") |
| RF-04 | `backend_django/apps/grupos/tests/test_grupos.py` | test_list_students_in_group | sí (nombre verificado) | @pytest.mark.req("RF-04") |
| RF-04 | `frontend/src/app/features/grupos/grupo-list.feedback.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-04]» al inicio del título |
| RF-05 | `backend_django/apps/simulation/tests/test_authoring.py` | test_create_case_builds_editable_draft | sí (nombre verificado) | @pytest.mark.req("RF-05") |
| RF-05 | `backend_django/apps/simulation/tests/test_authoring.py` | test_create_case_forbidden_for_profesor | sí (nombre verificado) | @pytest.mark.req("RF-05") |
| RF-05 | `backend_django/apps/simulation/tests/test_authoring.py` | test_editor_forbidden_for_profesor | sí (nombre verificado) | @pytest.mark.req("RF-05") |
| RF-05 | `backend_django/apps/simulation/tests/test_authoring.py` | test_authoring_case_list_includes_drafts | sí (nombre verificado) | @pytest.mark.req("RF-05") |
| RF-05 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_los_codigos_de_caso_se_normalizan_y_no_se_repiten | sí (nombre verificado) | @pytest.mark.req("RF-05") |
| RF-06 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_actualizar_un_nodo | sí (nombre verificado) | @pytest.mark.req("RF-06") |
| RF-06 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_eliminar_un_nodo | sí (nombre verificado) | @pytest.mark.req("RF-06") |
| RF-06 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_crear_y_eliminar_un_mapa | sí (nombre verificado) | @pytest.mark.req("RF-06") |
| RF-06 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_actualizar_un_mapa_cambia_su_nodo_y_audita_con_el_mapa | sí (nombre verificado) | @pytest.mark.req("RF-06") |
| RF-06 | `backend_django/apps/simulation/tests/test_authoring.py` | test_clone_and_create_node | sí (nombre verificado) | @pytest.mark.req("RF-06") |
| RF-07 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_crear_actualizar_y_eliminar_un_objeto | sí (nombre verificado) | @pytest.mark.req("RF-07") |
| RF-07 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_crear_actualizar_y_eliminar_un_dialogo | sí (nombre verificado) | @pytest.mark.req("RF-07") |
| RF-07 | `backend_django/apps/simulation/tests/test_authoring.py` | test_world_save_persists_dialogue_with_choices | sí (nombre verificado) | @pytest.mark.req("RF-07") |
| RF-08 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_crear_actualizar_y_eliminar_una_decision | sí (nombre verificado) | @pytest.mark.req("RF-08") |
| RF-08 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_las_decisiones_invalidas_se_rechazan_con_su_mensaje | sí (nombre verificado) | @pytest.mark.req("RF-08") |
| RF-08 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_una_decision_sin_clave_recibe_una_generada_con_los_nod… | sí (nombre verificado) | @pytest.mark.req("RF-08") |
| RF-09 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_crear_actualizar_y_eliminar_una_decision | sí (nombre verificado) | @pytest.mark.req("RF-09") |
| RF-09 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_publicar_con_errores_de_validacion_se_rechaza_y_los_no… | sí (nombre verificado) | @pytest.mark.req("RF-09") |
| RF-10 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_una_decision_sin_retroalimentacion_la_guarda_vacia | sí (nombre verificado) | @pytest.mark.req("RF-10") |
| RF-10 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_crear_actualizar_y_eliminar_una_decision | sí (nombre verificado) | @pytest.mark.req("RF-10") |
| RF-12 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_la_validacion_del_mundo_exige_una_salida_segura | sí (nombre verificado) | @pytest.mark.req("RF-12") |
| RF-12 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_publicar_con_errores_de_validacion_se_rechaza_y_los_no… | sí (nombre verificado) | @pytest.mark.req("RF-12") |
| RF-12 | `backend_django/apps/simulation/tests/test_authoring.py` | test_validate_world | sí (nombre verificado) | @pytest.mark.req("RF-12") |
| RF-12 | `backend_django/apps/simulation/tests/test_authoring.py` | test_checklist_full_then_publish | sí (nombre verificado) | @pytest.mark.req("RF-12") |
| RF-12 | `backend_django/apps/simulation/tests/test_authoring.py` | test_editor_forbidden_for_profesor | sí (nombre verificado) | @pytest.mark.req("RF-12") |
| RF-12 | `frontend/src/app/features/simulator/world-editor/world-editor.store.commands.spec.ts` | (validate) | sí (archivo; por líneas) | describe/it con «[RF-12]» al inicio del título |
| RF-13 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_publicar_deja_la_version_publicada_con_su_fecha | sí (nombre verificado) | @pytest.mark.req("RF-13") |
| RF-13 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_publicar_una_version_ya_publicada_se_rechaza | sí (nombre verificado) | @pytest.mark.req("RF-13") |
| RF-13 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_una_version_archivada_tampoco_se_modifica_ni_se_publica | sí (nombre verificado) | @pytest.mark.req("RF-13") |
| RF-13 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_ninguna_mutacion_sobre_una_version_publicada_pasa_ni_d… | sí (nombre verificado) | @pytest.mark.req("RF-13") |
| RF-13 | `backend_django/apps/simulation/tests/test_authoring.py` | test_publish_blocked_without_checklist | sí (nombre verificado) | @pytest.mark.req("RF-13") |
| RF-13 | `backend_django/apps/simulation/tests/test_authoring.py` | test_create_case_forbidden_for_profesor | sí (nombre verificado) | @pytest.mark.req("RF-13") |
| RF-13 | `frontend/src/app/features/simulator/case-editor.feedback.spec.ts` | (confirmación y errores de publicar) | sí (archivo; por líneas) | describe/it con «[RF-13]» al inicio del título |
| RF-14 | `backend_django/apps/grupos/tests/test_grupos.py` | test_assign_case_to_group | sí (nombre verificado) | @pytest.mark.req("RF-14") |
| RF-14 | `backend_django/apps/grupos/tests/test_grupos.py` | test_assign_case_to_foreign_group_400 | sí (nombre verificado) | @pytest.mark.req("RF-14") |
| RF-14 | `frontend/src/app/features/grupos/grupo-list.feedback.spec.ts` | (describe 'asignar y retirar casos', líneas 307-364) | sí (archivo; por líneas) | describe/it con «[RF-14]» al inicio del título |
| RF-14 | `backend_django/apps/simulation/tests/test_game.py` | test_cases_lists_only_assigned_for_students | sí (nombre verificado) | @pytest.mark.req("RF-14") |
| RF-15 | `backend_django/apps/simulation/tests/test_game.py` | :73 (test_cases_lists_only_assigned_for_students) | sí (archivo; por líneas) | @pytest.mark.req("RF-15") |
| RF-15 | `backend_django/apps/simulation/tests/test_game.py` | :83 (test_start_attempt_requires_group_case_assignment) | sí (archivo; por líneas) | @pytest.mark.req("RF-15") |
| RF-15 | `backend_django/apps/progression/tests/test_catalog.py` | :45 (fija que un estudiante sin grupo ve los publicados: co… | sí (archivo; por líneas) | @pytest.mark.req("RF-15") |
| RF-15 | `frontend/src/app/core/api/cached-simulation.service.spec.ts` | (clave de caché por usuario y rol) | sí (archivo; por líneas) | describe/it con «[RF-15]» al inicio del título |
| RF-15 | `frontend/src/app/features/simulator/simulation-catalog.component.spec.ts` | (solo rótulos en español) | sí (archivo; por líneas) | describe/it con «[RF-15]» al inicio del título |
| RF-15 | `frontend/src/app/features/simulator/game-menu.component.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-15]» al inicio del título |
| RF-16 | `frontend/src/app/features/simulator/intro-gate.util.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-16]» al inicio del título |
| RF-16 | `frontend/src/app/features/simulator/case-intro-scene.component.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-16]» al inicio del título |
| RF-16 | `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-16]» al inicio del título |
| RF-16 | `frontend/src/app/features/simulator/simulation-play.orientation.contract.spec.ts` | :29 (asegura que el objetivo por escena NO se muestra) | sí (archivo; por líneas) | describe/it con «[RF-16]» al inicio del título |
| RF-16 | `frontend/e2e/no-chatbot.e2e.ts` | (recorre consentimiento, intro y contexto) | sí (archivo; por líneas) | describe/it con «[RF-16]» al inicio del título |
| RF-17 | `backend_django/apps/simulation/tests/test_game.py` | :126 (recorrido completo hasta terminal) | sí (archivo; por líneas) | @pytest.mark.req("RF-17") |
| RF-17 | `backend_django/apps/simulation/tests/test_game.py` | :191 (inadecuada pide reintento) | sí (archivo; por líneas) | @pytest.mark.req("RF-17") |
| RF-17 | `backend_django/apps/simulation/tests/test_game.py` | :239 (riesgosa pide reintento) | sí (archivo; por líneas) | @pytest.mark.req("RF-17") |
| RF-17 | `backend_django/apps/simulation/tests/test_game.py` | :299 (segunda mala avanza) | sí (archivo; por líneas) | @pytest.mark.req("RF-17") |
| RF-17 | `backend_django/apps/simulation/tests/test_world.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RF-17") |
| RF-17 | `backend_django/apps/simulation/tests/test_attempt_lifecycle_contract.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RF-17") |
| RF-17 | `frontend/e2e/full-case.e2e.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-17]» al inicio del título |
| RF-18 | `frontend/src/app/features/simulator/game-help.component.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-18]» al inicio del título |
| RF-18 | `frontend/src/app/features/simulator/game-help.content.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-18]» al inicio del título |
| RF-18 | `frontend/src/app/features/simulator/help-memory.util.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-18]» al inicio del título |
| RF-18 | `backend_django/apps/simulation/tests/test_ai_assistant.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RF-18") |
| RF-18 | `backend_django/apps/simulation/tests/test_ai_provider_contract.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RF-18") |
| RF-18 | `frontend/e2e/no-chatbot.e2e.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-18]» al inicio del título |
| RF-19 | `backend_django/apps/simulation/tests/test_safe_pause.py` | (pausa sin cierre, idempotencia, resume conserva nodo y mét… | sí (archivo; por líneas) | @pytest.mark.req("RF-19") |
| RF-19 | `backend_django/apps/simulation/tests/test_attempt_lifecycle_contract.py` | :206-238,270-334 | sí (archivo; por líneas) | @pytest.mark.req("RF-19") |
| RF-19 | `backend_django/apps/simulation/tests/test_caso_pdf.py` | :207-218 (sala por puerta persiste tras recargar) | sí (archivo; por líneas) | @pytest.mark.req("RF-19") |
| RF-19 | `backend_django/apps/simulation/tests/test_world.py` | :307 (enter_room persiste) | sí (archivo; por líneas) | @pytest.mark.req("RF-19") |
| RF-19 | `frontend/e2e/full-case.e2e.ts` | :87-115 (recarga IN_PROGRESS y PAUSED conserva intento, nod… | sí (archivo; por líneas) | describe/it con «[RF-19]» al inicio del título |
| RF-19 | `frontend/e2e/safe-exit.e2e.ts` | :64-105 (pausar y reanudar en todos los estados jugables) | sí (archivo; por líneas) | describe/it con «[RF-19]» al inicio del título |
| RF-20 | `backend_django/apps/simulation/tests/test_game.py` | :66-70,126-189 (cifrado en reposo, bloqueo al terminar, rec… | sí (archivo; por líneas) | @pytest.mark.req("RF-20") |
| RF-20 | `backend_django/apps/simulation/tests/test_safe_pause.py` | :79-102,105-135 | sí (archivo; por líneas) | @pytest.mark.req("RF-20") |
| RF-20 | `backend_django/apps/simulation/tests/test_attempt_lifecycle_contract.py` | :37-41,104,241-267 | sí (archivo; por líneas) | @pytest.mark.req("RF-20") |
| RF-20 | `backend_django/apps/simulation/tests/test_instructor.py` | :108-120 (reflexión descifrada en la traza) | sí (archivo; por líneas) | @pytest.mark.req("RF-20") |
| RF-20 | `backend_django/shared/tests/test_dependency_compat.py` | :29-46 | sí (archivo; por líneas) | @pytest.mark.req("RF-20") |
| RF-20 | `frontend/src/app/features/simulator/journal-panel.component.spec.ts` | (solo salida segura y trazabilidad; ningún e2e escribe y gu… | sí (archivo; por líneas) | describe/it con «[RF-20]» al inicio del título |
| RF-21 | `backend_django/apps/simulation/tests/test_attempt_duration.py` | :12-39 | sí (archivo; por líneas) | @pytest.mark.req("RF-21") |
| RF-21 | `backend_django/apps/simulation/tests/test_game.py` | :438-476 (tiempo activo solo en intentos terminados) | sí (archivo; por líneas) | @pytest.mark.req("RF-21") |
| RF-21 | `backend_django/apps/simulation/tests/test_completion_report_contract.py` | :170,315,336 | sí (archivo; por líneas) | @pytest.mark.req("RF-21") |
| RF-21 | `backend_django/apps/simulation/tests/test_progress_map_order_contract.py` | :149-162 | sí (archivo; por líneas) | @pytest.mark.req("RF-21") |
| RF-21 | `backend_django/apps/simulation/tests/test_safe_pause.py` | :236-246 | sí (archivo; por líneas) | @pytest.mark.req("RF-21") |
| RF-21 | `backend_django/apps/simulation/tests/test_instructor.py` | :108-120 | sí (archivo; por líneas) | @pytest.mark.req("RF-21") |
| RF-21 | `backend_django/apps/simulation/tests/test_game.py` | :88-123 (detalle del evento de decisión) | sí (archivo; por líneas) | @pytest.mark.req("RF-21") |
| RF-22 | `backend_django/apps/simulation/tests/test_game.py` | :126-169 (recorrido completo hasta COMPLETED con completion… | sí (archivo; por líneas) | @pytest.mark.req("RF-22") |
| RF-22 | `backend_django/apps/simulation/tests/test_attempt_lifecycle_contract.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RF-22") |
| RF-22 | `backend_django/apps/simulation/tests/test_attempt_completed_signal.py` | :107-176 | sí (archivo; por líneas) | @pytest.mark.req("RF-22") |
| RF-22 | `backend_django/apps/progression/tests/test_completion_hook.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RF-22") |
| RF-22 | `backend_django/apps/simulation/tests/test_completion_report_builder.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RF-22") |
| RF-22 | `backend_django/apps/simulation/tests/test_completion_report_contract.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RF-22") |
| RF-22 | `backend_django/apps/simulation/tests/test_caso_pdf.py` | :329-422 (finales del caso PDF) | sí (archivo; por líneas) | @pytest.mark.req("RF-22") |
| RF-22 | `backend_django/apps/simulation/tests/test_rubrics.py` | :87-110 | sí (archivo; por líneas) | @pytest.mark.req("RF-22") |
| RF-22 | `backend_django/apps/simulation/tests/test_instructor.py` | :146-169 (guardar evaluacion por rubrica) | sí (archivo; por líneas) | @pytest.mark.req("RF-22") |
| RF-23 | `backend_django/apps/simulation/tests/test_game.py` | :381-410 (linea de tiempo del reporte) | sí (archivo; por líneas) | @pytest.mark.req("RF-23") |
| RF-23 | `backend_django/apps/simulation/tests/test_game.py` | :479-500 (student-report y acceso ajeno) | sí (archivo; por líneas) | @pytest.mark.req("RF-23") |
| RF-23 | `backend_django/apps/simulation/tests/test_game.py` | :554-662 (reintentos y recomendaciones del reporte) | sí (archivo; por líneas) | @pytest.mark.req("RF-23") |
| RF-23 | `backend_django/apps/simulation/tests/test_completion_report_contract.py` | :233-308 | sí (archivo; por líneas) | @pytest.mark.req("RF-23") |
| RF-23 | `frontend/src/app/features/simulator/attempt-outcome.component.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-23]» al inicio del título |
| RF-23 | `frontend/src/app/core/api/simulation.service.spec.ts` | :78-87 | sí (archivo; por líneas) | describe/it con «[RF-23]» al inicio del título |
| RF-24 | `backend_django/apps/simulation/tests/test_game.py` | :413 test_attempt_history_lists_own_attempts | sí (archivo; por líneas) | @pytest.mark.req("RF-24") |
| RF-24 | `backend_django/apps/simulation/tests/test_game.py` | :438 historial con REPLACED y tiempo activo | sí (archivo; por líneas) | @pytest.mark.req("RF-24") |
| RF-24 | `backend_django/apps/simulation/tests/test_game.py` | :479 y :495 student-report propio y ajeno (403) | sí (archivo; por líneas) | @pytest.mark.req("RF-24") |
| RF-24 | `frontend/src/app/features/simulator/attempt-history-duration.util.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-24]» al inicio del título |
| RF-24 | `frontend/src/app/features/simulator/simulation-catalog.component.spec.ts` | :32 etiquetas de estado | sí (archivo; por líneas) | describe/it con «[RF-24]» al inicio del título |
| RF-25 | `backend_django/apps/simulation/tests/test_instructor.py` | :92 recent prohibido a estudiante | sí (archivo; por líneas) | @pytest.mark.req("RF-25") |
| RF-25 | `backend_django/apps/simulation/tests/test_instructor.py` | :96 recent con alias anónimo | sí (archivo; por líneas) | @pytest.mark.req("RF-25") |
| RF-25 | `backend_django/apps/simulation/tests/test_instructor.py` | :108 traza con eventos, mundo y reflexión descifrada | sí (archivo; por líneas) | @pytest.mark.req("RF-25") |
| RF-25 | `backend_django/apps/simulation/tests/test_instructor.py` | :123 profesor ajeno recibe 403 en traza | sí (archivo; por líneas) | @pytest.mark.req("RF-25") |
| RF-25 | `backend_django/apps/simulation/tests/test_instructor.py` | :172 reintentos en la traza | sí (archivo; por líneas) | @pytest.mark.req("RF-25") |
| RF-25 | `frontend/src/app/features/simulator/instructor-trace.reconsidered.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RF-25]» al inicio del título |
| RF-26 | `backend_django/apps/reportes/tests/test_reportes.py` | :81 y :85 reportes prohibidos a estudiante | sí (archivo; por líneas) | @pytest.mark.req("RF-26") |
| RF-26 | `backend_django/apps/reportes/tests/test_reportes.py` | :133 grupo inexistente 404 | sí (archivo; por líneas) | @pytest.mark.req("RF-26") |
| RF-26 | `backend_django/apps/reportes/tests/test_reportes.py` | :147 bloque de simulación | sí (archivo; por líneas) | @pytest.mark.req("RF-26") |
| RF-26 | `backend_django/apps/reportes/tests/test_reportes.py` | :185 CSV | sí (archivo; por líneas) | @pytest.mark.req("RF-26") |
| RF-26 | `backend_django/apps/reportes/tests/test_estados_contract.py` | :73 contadores por estado | sí (archivo; por líneas) | @pytest.mark.req("RF-26") |
| RF-26 | `backend_django/apps/reportes/tests/test_reemplazo_vs_salida_segura.py` | :111 | sí (archivo; por líneas) | @pytest.mark.req("RF-26") |
| RNF-01 | `backend_django/apps/users/tests/test_models.py` | :7-23 | sí (archivo; por líneas) | @pytest.mark.req("RNF-01") |
| RNF-01 | `backend_django/apps/users/tests/test_auth.py` | :318-345 (cambio de contraseña con hash y verificación) | sí (archivo; por líneas) | @pytest.mark.req("RNF-01") |
| RNF-01 | `backend_django/shared/tests/test_dependency_compat.py` | :49-66 (vectores bcrypt y formato $2b$10$) | sí (archivo; por líneas) | @pytest.mark.req("RNF-01") |
| RNF-01 | `backend_django/apps/grupos/tests/test_imported_password_setting.py` | :51-77 | sí (archivo; por líneas) | @pytest.mark.req("RNF-01") |
| RNF-02 | `Verificación manual descrita en docs/operacion/despliegue-railway.md:…` | Verificación manual descrita en docs/operacion/despliegue-r… | sin ruta | — |
| RNF-03 | `frontend/e2e/vertical-quality.e2e.ts` | (4 viewports, Axe + geometría, en CI por PR) | sí (archivo; por líneas) | describe/it con «[RNF-03]» al inicio del título |
| RNF-03 | `frontend/e2e/full-case.e2e.ts` | (4 viewports, nocturno) | sí (archivo; por líneas) | describe/it con «[RNF-03]» al inicio del título |
| RNF-03 | `frontend/e2e/guided-first-minute.e2e.ts` | y frontend/e2e/safe-exit.e2e.ts (1366x768 y 844x390, @orien… | sí (archivo; por líneas) | describe/it con «[RNF-03]» al inicio del título |
| RNF-03 | `frontend/e2e/lobby.e2e.ts` | :110-121 | sí (archivo; por líneas) | describe/it con «[RNF-03]» al inicio del título |
| RNF-03 | `frontend/src/app/features/simulator/game-world.touch.contract.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-03]» al inicio del título |
| RNF-03 | `frontend/src/app/features/simulator/simulation-play.orientation.contract.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-03]» al inicio del título |
| RNF-03 | `frontend/src/app/shared/layout/shell.a11y.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-03]» al inicio del título |
| RNF-04 | `frontend/e2e/vertical-quality.e2e.ts` | + frontend/e2e/support/quality-gates.ts (Axe + geometría, 1… | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/e2e/full-case.e2e.ts` | :218 y :230 (Axe en la última supervisión y el desenlace, n… | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/src/styles/contrast.contract.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/src/styles/a11y-bloque-h.contract.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/src/styles/contrast.util.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/src/app/app.component.spec.ts` | (enlaces de salto) | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/src/app/features/login/login.a11y.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/src/app/features/public/landing.a11y.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/src/app/shared/layout/shell.a11y.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/src/app/features/simulator/simulation-play.a11y-review.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/src/app/features/simulator/keyboard-focus.util.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/src/app/features/simulator/keyboard-capture.contract.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-04 | `frontend/e2e/safe-exit.e2e.ts` |  | sí (archivo; por líneas) | describe/it con «[RNF-04]» al inicio del título |
| RNF-05 | `backend_django/apps/simulation/tests/test_game.py` | (flujo funcional de decisiones, sin medir tiempos) | sí (archivo; por líneas) | @pytest.mark.req("RNF-05") |
| RNF-05 | `backend_django/apps/simulation/tests/test_world.py` | (mundo y puertas, sin medir tiempos) | sí (archivo; por líneas) | @pytest.mark.req("RNF-05") |
| RNF-05 | `frontend/src/app/features/simulator/game-world.frame-budget.spec.ts` | (contrato de texto, no mide) | sí (archivo; por líneas) | describe/it con «[RNF-05]» al inicio del título |
| RNF-05 | `frontend/src/app/features/simulator/game-world.orientation.contract.spec.ts` | :52-81 (contrato de texto de update()) | sí (archivo; por líneas) | describe/it con «[RNF-05]» al inicio del título |
| RNF-05 | `frontend/src/app/features/simulator/intro-audio.budget.spec.ts` | (peso del audio largo ≤ 2,8 MB) | sí (archivo; por líneas) | describe/it con «[RNF-05]» al inicio del título |
| RNF-05 | `frontend/src/app/app.config.spec.ts` | :15 (AUTH_SYNC_BUDGET_MS = 1500) | sí (archivo; por líneas) | describe/it con «[RNF-05]» al inicio del título |
| RNF-05 | `frontend/src/app/features/simulator/player-motion.util.spec.ts` | (velocidad independiente de los fps) | sí (archivo; por líneas) | describe/it con «[RNF-05]» al inicio del título |
| RNF-06 | `backend_django/apps/simulation/tests/test_safe_pause.py` | (pausa y reanudación con el mismo attemptId: continuidad de… | sí (archivo; por líneas) | @pytest.mark.req("RNF-06") |
| RNF-06 | `backend_django/apps/simulation/tests/test_attempt_lifecycle.py` | y test_attempt_lifecycle_contract.py (transiciones de estad… | sí (archivo; por líneas) | @pytest.mark.req("RNF-06") |
| RNF-06 | `scripts/test-runner-support.test.mjs` | (readiness del stack de pruebas, no del despliegue) | sí (archivo; por líneas) | describe/it con «[RNF-06]» al inicio del título |
| RNF-06 | `.github/workflows/e2e-full-case.yml` | (nocturno contra stack efímero de CI, no contra producción) | sí (archivo; por líneas) | describe/it con «[RNF-06]» al inicio del título |
| RNF-07 | `backend_django/apps/simulation/tests/test_attempt_completed_signal.py` | :192-201 (AST: game_service no importa progresión) | sí (archivo; por líneas) | @pytest.mark.req("RNF-07") |
| RNF-07 | `frontend/src/app/core/api/api-boundaries.contract.spec.ts` | (fronteras de las APIs por rol) | sí (archivo; por líneas) | describe/it con «[RNF-07]» al inicio del título |
| RNF-07 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | (45 pruebas de caracterización de la fachada de autoría) | sí (archivo; por líneas) | @pytest.mark.req("RNF-07") |
| RNF-07 | `backend_django/apps/simulation/tests/test_clone_version_contract.py` | (contrato del CopySpec) | sí (archivo; por líneas) | @pytest.mark.req("RNF-07") |
| RNF-07 | `backend_django/apps/simulation/tests/test_shared_helper_call_sites.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RNF-07") |
| RNF-07 | `backend_django/apps/simulation/tests/test_ai_provider_lsp_contract.py` | y frontend/src/app/features/simulator/scene-renderer.lsp.sp… | sí (archivo; por líneas) | @pytest.mark.req("RNF-07") |
| RNF-08 | `backend_django/apps/simulation/tests/test_deploy_schema_contract.py` | (valores de los TextChoices contra los CHECK del volcado) | sí (archivo; por líneas) | @pytest.mark.req("RNF-08") |
| RNF-08 | `backend_django/apps/simulation/tests/test_upgrade_attempt_replaced.py` | (script de upgrade y CHECK contra Postgres real) | sí (archivo; por líneas) | @pytest.mark.req("RNF-08") |
| RNF-08 | `backend_django/apps/simulation/tests/test_attempt_lifecycle.py` | y test_attempt_lifecycle_contract.py (matriz operación × es… | sí (archivo; por líneas) | @pytest.mark.req("RNF-08") |
| RNF-08 | `backend_django/apps/simulation/tests/test_world_authority.py` | (matriz negativa de autoridad del servidor) | sí (archivo; por líneas) | @pytest.mark.req("RNF-08") |
| RNF-08 | `backend_django/apps/simulation/tests/test_world_save_persistence.py` | y test_authoring.py:195-215 (guardado de mundo; revisión in… | sí (archivo; por líneas) | @pytest.mark.req("RNF-08") |
| RNF-08 | `backend_django/apps/simulation/tests/test_clone_version_contract.py` | y test_completion_report_contract.py | sí (archivo; por líneas) | @pytest.mark.req("RNF-08") |
| RNF-08 | `backend_django/apps/reportes/tests/test_estados_contract.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RNF-08") |
| RNF-08 | `backend_django/apps/progression/tests/test_models.py` | (UNIQUE de completado) | sí (archivo; por líneas) | @pytest.mark.req("RNF-08") |
| RN-01 | `frontend/src/app/features/simulator/simulation-catalog.component.spec.ts` | :47 (ortografía del texto «diagnóstico automático») | sí (archivo; por líneas) | describe/it con «[RN-01]» al inicio del título |
| RN-01 | `backend_django/apps/simulation/tests/test_caso_pdf.py` | (el caso sembrado) | sí (archivo; por líneas) | @pytest.mark.req("RN-01") |
| RN-01 | `frontend/e2e/consent-gate.e2e.ts` | (aviso de contenido previo al caso) | sí (archivo; por líneas) | describe/it con «[RN-01]» al inicio del título |
| RN-01 | `frontend/e2e/no-chatbot.e2e.ts` | (asistente apagado por defecto) | sí (archivo; por líneas) | describe/it con «[RN-01]» al inicio del título |
| RN-02 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_las_decisiones_invalidas_se_rechazan_con_su_mensaje | sí (nombre verificado) | @pytest.mark.req("RN-02") |
| RN-02 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_publicar_con_errores_de_validacion_se_rechaza_y_los_no… | sí (nombre verificado) | @pytest.mark.req("RN-02") |
| RN-03 | `backend_django/apps/simulation/tests/test_game.py` | test_start_attempt_requires_group_case_assignment | sí (nombre verificado) | @pytest.mark.req("RN-03") |
| RN-03 | `backend_django/apps/simulation/tests/test_game.py` | test_cases_lists_only_assigned_for_students | sí (nombre verificado) | @pytest.mark.req("RN-03") |
| RN-03 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_publicar_una_version_ya_publicada_se_rechaza | sí (nombre verificado) | @pytest.mark.req("RN-03") |
| RN-04 | `backend_django/apps/simulation/tests/test_game.py` | test_cases_lists_only_assigned_for_students | sí (nombre verificado) | @pytest.mark.req("RN-04") |
| RN-04 | `backend_django/apps/simulation/tests/test_game.py` | test_start_attempt_requires_group_case_assignment | sí (nombre verificado) | @pytest.mark.req("RN-04") |
| RN-04 | `backend_django/apps/progression/tests/test_catalog.py` | (fija el catálogo del lobby sin filtro de asignación) | sí (archivo; por líneas) | @pytest.mark.req("RN-04") |
| RN-05 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_publicar_con_errores_de_validacion_se_rechaza_y_los_no… | sí (nombre verificado) | @pytest.mark.req("RN-05") |
| RN-05 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_la_validacion_del_mundo_exige_una_salida_segura | sí (nombre verificado) | @pytest.mark.req("RN-05") |
| RN-05 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_ninguna_mutacion_sobre_una_version_publicada_pasa_ni_d… | sí (nombre verificado) | @pytest.mark.req("RN-05") |
| RN-05 | `backend_django/apps/simulation/tests/test_authoring.py` | test_checklist_full_then_publish | sí (nombre verificado) | @pytest.mark.req("RN-05") |
| RN-05 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_publicar_deja_la_version_publicada_con_su_fecha | sí (nombre verificado) | @pytest.mark.req("RN-05") |
| RN-06 | `backend_django/apps/simulation/tests/test_attempt_lifecycle_contract.py` | :270 forceNew cierra el abierto como REPLACED | sí (archivo; por líneas) | @pytest.mark.req("RN-06") |
| RN-06 | `backend_django/apps/simulation/tests/test_attempt_lifecycle_contract.py` | :284 forceNew no toca los cerrados | sí (archivo; por líneas) | @pytest.mark.req("RN-06") |
| RN-06 | `backend_django/apps/simulation/tests/test_safe_pause.py` | :214 | sí (archivo; por líneas) | @pytest.mark.req("RN-06") |
| RN-06 | `backend_django/apps/reportes/tests/test_reemplazo_vs_salida_segura.py` | :94 | sí (archivo; por líneas) | @pytest.mark.req("RN-06") |
| RN-06 | `backend_django/apps/simulation/tests/test_upgrade_attempt_replaced.py` |  | sí (archivo; por líneas) | @pytest.mark.req("RN-06") |
| RN-07 | `backend_django/apps/simulation/tests/test_attempt_lifecycle_contract.py` | :298 sin forzar devuelve el abierto (cumple) | sí (archivo; por líneas) | @pytest.mark.req("RN-07") |
| RN-07 | `backend_django/apps/simulation/tests/test_attempt_lifecycle_contract.py` | :270 forceNew reemplaza al abierto (fija el conflicto) | sí (archivo; por líneas) | @pytest.mark.req("RN-07") |
| RN-07 | `backend_django/apps/simulation/tests/test_safe_pause.py` | :200 | sí (archivo; por líneas) | @pytest.mark.req("RN-07") |
| RN-07 | `backend_django/apps/simulation/tests/test_safe_pause.py` | :214 | sí (archivo; por líneas) | @pytest.mark.req("RN-07") |
| RN-07 | `backend_django/apps/simulation/tests/test_game.py` | :438 | sí (archivo; por líneas) | @pytest.mark.req("RN-07") |
| RN-07 | `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts` | :237 | sí (archivo; por líneas) | describe/it con «[RN-07]» al inicio del título |
| RN-07 | `frontend/src/app/core/api/simulation.service.contract.spec.ts` | :170 | sí (archivo; por líneas) | describe/it con «[RN-07]» al inicio del título |
| RN-08 | `backend_django/apps/simulation/tests/test_game.py` | :119-123 (feedback.message en la respuesta de la decision) | sí (archivo; por líneas) | @pytest.mark.req("RN-08") |
| RN-08 | `backend_django/apps/simulation/tests/test_game.py` | :164, 218, 278 (feedback presente; aviso de segunda oportun… | sí (archivo; por líneas) | @pytest.mark.req("RN-08") |
| RN-08 | `backend_django/apps/simulation/tests/test_game.py` | :318-324 (retryRequired true/false) | sí (archivo; por líneas) | @pytest.mark.req("RN-08") |
| RN-08 | `backend_django/apps/simulation/tests/test_game.py` | :527-535 (la clasificacion llega en el feedback posterior a… | sí (archivo; por líneas) | @pytest.mark.req("RN-08") |
| RN-08 | `frontend/src/app/features/simulator/simulation-play.supervision.spec.ts` | :72-340 | sí (archivo; por líneas) | describe/it con «[RN-08]» al inicio del título |
| RN-08 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | (immediateFeedback en autoria) | sí (archivo; por líneas) | @pytest.mark.req("RN-08") |
| RN-09 | `backend_django/apps/simulation/tests/test_instructor.py` | :146-169 (fija totalScore == 3.0 con puntajes 3) | sí (archivo; por líneas) | @pytest.mark.req("RN-09") |
| RN-09 | `backend_django/apps/simulation/tests/test_rubrics.py` | :51-110 | sí (archivo; por líneas) | @pytest.mark.req("RN-09") |
| RN-09 | `backend_django/apps/simulation/tests/test_shared_helper_call_sites.py` | :160 | sí (archivo; por líneas) | @pytest.mark.req("RN-09") |
| RN-09 | `frontend/src/app/core/api/simulation.service.contract.spec.ts` | :95 | sí (archivo; por líneas) | describe/it con «[RN-09]» al inicio del título |
| RN-10 | `backend_django/apps/users/tests/test_auth.py` | :114-163 y :177-197 (solo ADMIN crea) | sí (archivo; por líneas) | @pytest.mark.req("RN-10") |
| RN-10 | `backend_django/apps/users/tests/test_access_requests.py` | :50-103 | sí (archivo; por líneas) | @pytest.mark.req("RN-10") |
| RN-10 | `backend_django/apps/users/tests/test_auth.py` | :287-296 (Google no crea cuentas) | sí (archivo; por líneas) | @pytest.mark.req("RN-10") |
| RN-10 | `backend_django/apps/grupos/tests/test_grupos.py` | :144-175, :179-197, :200-239, :242-247 (fijan la creacion d… | sí (archivo; por líneas) | @pytest.mark.req("RN-10") |
| RN-10 | `backend_django/apps/grupos/tests/test_imported_password_setting.py` | :47-117 | sí (archivo; por líneas) | @pytest.mark.req("RN-10") |
| RN-11 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_crear_actualizar_y_eliminar_una_decision | sí (nombre verificado) | @pytest.mark.req("RN-11") |
| CU-01 | `backend_django/apps/users/tests/test_auth.py` | :30-111 | sí (archivo; por líneas) | @pytest.mark.req("CU-01") |
| CU-01 | `backend_django/apps/users/tests/test_google_login_contract.py` |  | sí (archivo; por líneas) | @pytest.mark.req("CU-01") |
| CU-01 | `frontend/e2e/full-case.e2e.ts` | :37-38, lobby.e2e.ts:39, consent-gate.e2e.ts:58 (login de e… | sí (archivo; por líneas) | describe/it con «[CU-01]» al inicio del título |
| CU-01 | `frontend/src/app/features/login/login.a11y.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-01]» al inicio del título |
| CU-01 | `scripts/api-e2e.mjs` | :116-134 | sí (archivo; por líneas) | describe/it con «[CU-01]» al inicio del título |
| CU-02 | `backend_django/apps/users/tests/test_auth.py` | :166-249, :318-362 | sí (archivo; por líneas) | @pytest.mark.req("CU-02") |
| CU-02 | `backend_django/apps/users/tests/test_access_requests.py` | :50-103 | sí (archivo; por líneas) | @pytest.mark.req("CU-02") |
| CU-02 | `frontend/src/app/features/admin/users.validation.spec.ts` | , users.validation.dom.spec.ts, users.feedback.spec.ts | sí (archivo; por líneas) | describe/it con «[CU-02]» al inicio del título |
| CU-02 | `frontend/src/app/features/admin/forms-validation.contract.spec.ts` | , portal-feedback.contract.spec.ts | sí (archivo; por líneas) | describe/it con «[CU-02]» al inicio del título |
| CU-03 | `backend_django/apps/grupos/tests/test_grupos.py` | (test_create_grupo_201, test_add_student_increments_total,… | sí (archivo; por líneas) | @pytest.mark.req("CU-03") |
| CU-03 | `frontend/src/app/features/grupos/grupo-list.feedback.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-03]» al inicio del título |
| CU-03 | `frontend/src/app/features/grupos/grupo-list.validation.dom.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-03]» al inicio del título |
| CU-04 | `backend_django/apps/simulation/tests/test_authoring.py` | test_create_case_builds_editable_draft | sí (nombre verificado) | @pytest.mark.req("CU-04") |
| CU-04 | `backend_django/apps/simulation/tests/test_authoring.py` | test_checklist_full_then_publish | sí (nombre verificado) | @pytest.mark.req("CU-04") |
| CU-04 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_publicar_un_borrador_completo_deja_rastro | sí (nombre verificado) | @pytest.mark.req("CU-04") |
| CU-04 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_guardar_el_mundo_actualiza_el_mapa_y_crea_objetos_con_… | sí (nombre verificado) | @pytest.mark.req("CU-04") |
| CU-05 | `backend_django/apps/simulation/tests/test_authoring.py` | test_checklist_full_then_publish | sí (nombre verificado) | @pytest.mark.req("CU-05") |
| CU-05 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_publicar_con_errores_de_validacion_se_rechaza_y_los_no… | sí (nombre verificado) | @pytest.mark.req("CU-05") |
| CU-05 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_checklist_publicar_y_clonar_dejan_su_rastro | sí (nombre verificado) | @pytest.mark.req("CU-05") |
| CU-05 | `backend_django/apps/simulation/tests/test_authoring_operations_contract.py` | test_el_checklist_completo_queda_completo_y_el_parcial_pend… | sí (nombre verificado) | @pytest.mark.req("CU-05") |
| CU-05 | `frontend/src/app/features/simulator/case-editor.feedback.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-05]» al inicio del título |
| CU-06 | `backend_django/apps/grupos/tests/test_grupos.py` | test_assign_case_to_group | sí (nombre verificado) | @pytest.mark.req("CU-06") |
| CU-06 | `backend_django/apps/grupos/tests/test_grupos.py` | test_assign_case_to_foreign_group_400 | sí (nombre verificado) | @pytest.mark.req("CU-06") |
| CU-06 | `backend_django/apps/simulation/tests/test_game.py` | test_cases_lists_only_assigned_for_students | sí (nombre verificado) | @pytest.mark.req("CU-06") |
| CU-06 | `backend_django/apps/simulation/tests/test_game.py` | test_start_attempt_requires_group_case_assignment | sí (nombre verificado) | @pytest.mark.req("CU-06") |
| CU-06 | `frontend/src/app/features/grupos/grupo-list.feedback.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-06]» al inicio del título |
| CU-07 | `backend_django/apps/simulation/tests/test_game.py` | :73 | sí (archivo; por líneas) | @pytest.mark.req("CU-07") |
| CU-07 | `backend_django/apps/simulation/tests/test_game.py` | :83 | sí (archivo; por líneas) | @pytest.mark.req("CU-07") |
| CU-07 | `frontend/src/app/features/simulator/simulation-play.consent-gate.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-07]» al inicio del título |
| CU-07 | `frontend/src/app/features/simulator/intro-gate.util.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-07]» al inicio del título |
| CU-07 | `frontend/e2e/lobby.e2e.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-07]» al inicio del título |
| CU-08 | `backend_django/apps/simulation/tests/test_game.py` | :126 | sí (archivo; por líneas) | @pytest.mark.req("CU-08") |
| CU-08 | `backend_django/apps/simulation/tests/test_world.py` |  | sí (archivo; por líneas) | @pytest.mark.req("CU-08") |
| CU-08 | `backend_django/apps/simulation/tests/test_attempt_lifecycle.py` |  | sí (archivo; por líneas) | @pytest.mark.req("CU-08") |
| CU-08 | `backend_django/apps/simulation/tests/test_attempt_duration.py` |  | sí (archivo; por líneas) | @pytest.mark.req("CU-08") |
| CU-08 | `frontend/e2e/full-case.e2e.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-08]» al inicio del título |
| CU-09 | `frontend/src/app/features/simulator/game-help.component.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-09]» al inicio del título |
| CU-09 | `frontend/src/app/features/simulator/game-help.content.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-09]» al inicio del título |
| CU-09 | `frontend/src/app/features/simulator/help-memory.util.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-09]» al inicio del título |
| CU-09 | `frontend/e2e/no-chatbot.e2e.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-09]» al inicio del título |
| CU-10 | `backend_django/apps/simulation/tests/test_safe_pause.py` |  | sí (archivo; por líneas) | @pytest.mark.req("CU-10") |
| CU-10 | `backend_django/apps/simulation/tests/test_attempt_lifecycle_contract.py` | :206-238,298-334 | sí (archivo; por líneas) | @pytest.mark.req("CU-10") |
| CU-10 | `frontend/e2e/full-case.e2e.ts` | :87-115 | sí (archivo; por líneas) | describe/it con «[CU-10]» al inicio del título |
| CU-10 | `frontend/e2e/safe-exit.e2e.ts` | :64-105 | sí (archivo; por líneas) | describe/it con «[CU-10]» al inicio del título |
| CU-10 | `frontend/src/app/features/simulator/simulation-play.safe-exit.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-10]» al inicio del título |
| CU-10 | `frontend/src/app/features/simulator/simulation-catalog.component.spec.ts` | :32-39 (solo la etiqueta del estado) | sí (archivo; por líneas) | describe/it con «[CU-10]» al inicio del título |
| CU-11 | `backend_django/apps/simulation/tests/test_game.py` | :126-189 | sí (archivo; por líneas) | @pytest.mark.req("CU-11") |
| CU-11 | `backend_django/apps/simulation/tests/test_instructor.py` | :108-120 | sí (archivo; por líneas) | @pytest.mark.req("CU-11") |
| CU-11 | `backend_django/apps/simulation/tests/test_safe_pause.py` | :79-102 | sí (archivo; por líneas) | @pytest.mark.req("CU-11") |
| CU-11 | `frontend/e2e/living-world.e2e.ts` | :83-94 (la bitácora atrapa el foco) | sí (archivo; por líneas) | describe/it con «[CU-11]» al inicio del título |
| CU-11 | `frontend/e2e/vertical-quality.e2e.ts` | :52-59 (solo abre y cierra) | sí (archivo; por líneas) | describe/it con «[CU-11]» al inicio del título |
| CU-12 | `backend_django/apps/simulation/tests/test_game.py` | :126-169 | sí (archivo; por líneas) | @pytest.mark.req("CU-12") |
| CU-12 | `backend_django/apps/simulation/tests/test_attempt_completed_signal.py` | :107-176 | sí (archivo; por líneas) | @pytest.mark.req("CU-12") |
| CU-12 | `backend_django/apps/simulation/tests/test_attempt_lifecycle_contract.py` |  | sí (archivo; por líneas) | @pytest.mark.req("CU-12") |
| CU-12 | `backend_django/apps/simulation/tests/test_caso_pdf.py` | :329-422 | sí (archivo; por líneas) | @pytest.mark.req("CU-12") |
| CU-12 | `frontend/src/app/features/simulator/simulation-play.supervision.spec.ts` | :149-340 | sí (archivo; por líneas) | describe/it con «[CU-12]» al inicio del título |
| CU-13 | `backend_django/apps/simulation/tests/test_game.py` | :381 reporte con timeline | sí (archivo; por líneas) | @pytest.mark.req("CU-13") |
| CU-13 | `backend_django/apps/simulation/tests/test_game.py` | :479 student-report | sí (archivo; por líneas) | @pytest.mark.req("CU-13") |
| CU-13 | `backend_django/apps/simulation/tests/test_completion_report_contract.py` |  | sí (archivo; por líneas) | @pytest.mark.req("CU-13") |
| CU-13 | `backend_django/apps/simulation/tests/test_completion_report_builder.py` |  | sí (archivo; por líneas) | @pytest.mark.req("CU-13") |
| CU-13 | `frontend/src/app/features/simulator/attempt-outcome.component.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-13]» al inicio del título |
| CU-14 | `backend_django/apps/simulation/tests/test_instructor.py` | :96 | sí (archivo; por líneas) | @pytest.mark.req("CU-14") |
| CU-14 | `backend_django/apps/simulation/tests/test_instructor.py` | :108 | sí (archivo; por líneas) | @pytest.mark.req("CU-14") |
| CU-14 | `backend_django/apps/simulation/tests/test_instructor.py` | :123 | sí (archivo; por líneas) | @pytest.mark.req("CU-14") |
| CU-14 | `backend_django/apps/simulation/tests/test_instructor.py` | :146 | sí (archivo; por líneas) | @pytest.mark.req("CU-14") |
| CU-14 | `frontend/src/app/features/simulator/instructor-trace.reconsidered.spec.ts` |  | sí (archivo; por líneas) | describe/it con «[CU-14]» al inicio del título |
| CU-15 | `backend_django/apps/reportes/tests/test_reportes.py` | :147 | sí (archivo; por líneas) | @pytest.mark.req("CU-15") |
| CU-15 | `backend_django/apps/reportes/tests/test_reportes.py` | :185 | sí (archivo; por líneas) | @pytest.mark.req("CU-15") |
| CU-15 | `backend_django/apps/reportes/tests/test_estados_contract.py` | :73 | sí (archivo; por líneas) | @pytest.mark.req("CU-15") |

## Huecos de prueba que señalaron los evaluadores

Cada fila es una prueba que **no existe** y que el evaluador echó en falta; son la lista de partida para escribir pruebas nuevas (con TDD) al cerrar las brechas del contraste.

| ID | Veredicto | Hueco |
|---|---|---|
| RF-01 | cumple | Sin prueba de cierre de sesion (logout) en frontend ni backend |
| RF-02 | parcial | Sin pruebas de roleGuard/menu en frontend; sin prueba de 403 para PROFESOR/ESTUDIANTE en /api/admin/users* |
| RF-25 | parcial | No hay prueba de profesor ajeno para student-report, dashboard ni reportes |
| RF-26 | parcial | No hay prueba de profesor ajeno sobre reportes |
| RNF-02 | parcial | Ninguna automática para HTTPS o settings de producción |
| RNF-07 | parcial | No hay import-linter, eslint-boundaries ni prueba de arquitectura general en .github/workflows/ci.yml |
| RNF-08 | parcial | Sin pruebas de concurrencia ni de transacciones con transaction=True (prohibido por settings/test.py:9) |
| RN-07 | conflicto | No hay prueba de concurrencia |
| RN-10 | conflicto | Sin prueba que afirme que el PROFESOR no crea cuentas |
| CU-01 | parcial | Sin e2e de login de PROFESOR o ADMIN por UI ni de menu por rol |
