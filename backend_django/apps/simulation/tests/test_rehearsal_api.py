"""A2 · Tarea 7 — las rutas de autoría del ensayo y el bloque ``rehearsal`` que lee el panel de la autora.

``POST/GET/PATCH /api/authoring/cases/<versionId>/rehearsal[/<attemptId>]``: la docente dueña del caso (o el ADMIN) abre su
borrador en el juego real, sin sello ni validador, y el bloque le dice por qué una respuesta no aparece, qué comentarios se
dicen, qué lleva explorado y qué puede marcar. Un PATCH valida todo antes de escribir.
"""
import json
from types import SimpleNamespace
from unittest import mock

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from rest_framework.test import APIClient

from apps.simulation.models import (
    AttemptEvent,
    AttemptStatus,
    AttemptWorldState,
    CaseCharacter,
    ClinicalTool,
    DecisionOption,
    MapObject,
    SceneMap,
    SimulationAttempt,
    SimulationNode,
)
from apps.simulation.services import game_service, option_availability, rehearsal
from shared.jsonutils import read_map

User = get_user_model()
AUTHORING = "/api/authoring/cases"
GAME = "/api/simulation"
TOKEN_HEADER = "HTTP_X_SIEP_ATTEMPT_TOKEN"


def _usuario(email, role):
    return User.objects.create_user(email=email, password="x", nombre="Nom", apellido="Ape", role=role)


def _cliente(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _mapa(version, node, key, sala, *, ambient=None, person=None, objects=()):
    # El caso recién creado ya trae el mapa de su escena de inicio: se reutiliza.
    scene_map, _ = SceneMap.objects.update_or_create(
        node=node,
        defaults=dict(
            case_version=version, map_key=key, title=key, width=640, height=480, spawn_x=50, spawn_y=50,
            ambient_json=json.dumps({"salaId": sala, **(ambient or {})}),
        ),
    )
    MapObject.objects.filter(scene_map=scene_map).delete()
    for object_key, label, kind in objects:
        MapObject.objects.create(scene_map=scene_map, object_key=object_key, label=label, object_type=kind)
    return scene_map


@pytest.fixture
def mundo(db):
    """Un borrador SIN sello: escena de inicio con gente, un objeto, un personaje de ambiente y respuestas con requisito."""
    profesora = _usuario("prof_a2t7@x.com", "PROFESOR")
    otra = _usuario("otra_a2t7@x.com", "PROFESOR")
    admin = _usuario("admin_a2t7@x.com", "ADMIN")
    estudiante = _usuario("est_a2t7@x.com", "ESTUDIANTE")
    creado = _cliente(profesora).post(AUTHORING, {"title": "Caso para ensayar"}, format="json")
    assert creado.status_code == 200, creado.data
    cv = creado.data["data"]["caseVersionId"]
    from apps.simulation.models import CaseVersion

    version = CaseVersion.objects.get(pk=cv)
    inicio = SimulationNode.objects.get(case_version=version, start_node=True)
    segunda = SimulationNode.objects.create(
        case_version=version, node_key="segunda", title="Segunda escena", narrative="Segunda.", position_x=2, position_y=2
    )
    final = SimulationNode.objects.create(
        case_version=version, node_key="fin", title="Final", narrative="Fin.", terminal_node=True, position_x=3, position_y=3
    )
    abuela = CaseCharacter.objects.create(case_version=version, character_key="abuela", display_name="Abuela")
    ClinicalTool.objects.create(case_version=version, tool_code="linterna", label="Linterna")
    ClinicalTool.objects.create(case_version=version, tool_code="libreta", label="Libreta")
    mapa_inicio = _mapa(
        version, inicio, "mapa-inicio", "sala-a",
        ambient={"ambientNpcs": [{"key": "vecina", "name": "La vecina", "x": 10, "y": 10, "interactionRadius": 40}]},
        objects=[("foto", "Una foto", "OBJECT"), ("escondida", "Nota escondida", "NOTE")],
    )
    MapObject.objects.create(
        scene_map=mapa_inicio, object_key="abuela-obj", label="Abuela de la casa", object_type="PERSON", character=abuela
    )
    MapObject.objects.filter(scene_map=mapa_inicio, object_key="escondida").update(visible=False)
    _mapa(version, segunda, "mapa-segunda", "sala-b", objects=[("tio", "El tío", "PERSON"), ("foto-b", "Foto b", "OBJECT")])
    gated = DecisionOption.objects.create(
        case_version=version, option_key="preguntar", source_node=inicio, target_node=segunda, text="Preguntar por la casa",
        response_class="RECOMMENDED", requires_json=json.dumps({"talked": "abuela-obj"}),
    )
    libre = DecisionOption.objects.create(
        case_version=version, option_key="seguir", source_node=inicio, target_node=segunda, text="Seguir adelante",
        response_class="ACCEPTABLE",
    )
    roto = DecisionOption.objects.create(
        case_version=version, option_key="roto", source_node=inicio, target_node=final, text="Opción rota",
        response_class="RISKY", requires_json="{no es json",
    )
    DecisionOption.objects.create(
        case_version=version, option_key="a-fin", source_node=segunda, target_node=final, text="Terminar",
        response_class="RECOMMENDED",
    )
    inicio.comments_json = json.dumps([
        {"personaje": "abuela", "linea": "Mira la foto.", "cuando": {"inspected": "foto"}},
        {"personaje": "abuela", "linea": "Pasa, pasa."},
    ])
    inicio.save()
    return SimpleNamespace(
        version=version, profesora=profesora, otra=otra, admin=admin, estudiante=estudiante, inicio=inicio,
        segunda=segunda, final=final, gated=gated, libre=libre, roto=roto, mapa_inicio=mapa_inicio,
    )


def _abrir(mundo, user=None, **body):
    response = _cliente(user or mundo.profesora).post(f"{AUTHORING}/{mundo.version.id}/rehearsal", body, format="json")
    return response


def _ensayo(mundo, user=None, **body):
    response = _abrir(mundo, user, **body)
    assert response.status_code == 200, response.data
    return response.data["data"]


def _ajustar(mundo, ensayo, cuerpo, user=None):
    return _cliente(user or mundo.profesora).patch(
        f"{AUTHORING}/{mundo.version.id}/rehearsal/{ensayo['attemptId']}", cuerpo, format="json"
    )


def _leer(mundo, ensayo, user=None):
    response = _cliente(user or mundo.profesora).get(f"{AUTHORING}/{mundo.version.id}/rehearsal/{ensayo['attemptId']}")
    assert response.status_code == 200, response.data
    return response.data["data"]["rehearsal"]


def _foto(attempt_id):
    """Todo lo que un PATCH podría tocar, para comparar antes y después."""
    attempt = SimulationAttempt.all_objects.get(pk=attempt_id)
    world = AttemptWorldState.objects.filter(attempt_id=attempt_id).first()
    return (
        attempt.current_node_id,
        None if world is None else (
            world.scene_map_id, world.flags_json, world.inventory_json, world.inspected_object_keys_json,
            world.used_tool_keys_json,
        ),
        list(AttemptEvent.objects.filter(attempt_id=attempt_id).values_list("id", flat=True)),
    )


# ─── Abrir ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_el_dueno_abre_el_ensayo_de_un_borrador_sin_sello_en_la_escena_pedida(mundo):
    assert mundo.version.status == "DRAFT"

    data = _ensayo(mundo, desde=mundo.segunda.id)

    assert data["currentNode"]["id"] == mundo.segunda.id
    assert data["attemptToken"] and data["status"] == "IN_PROGRESS"
    assert data["rehearsal"]["sceneId"] == mundo.segunda.id
    attempt = SimulationAttempt.all_objects.get(pk=data["attemptId"])
    assert attempt.is_rehearsal and attempt.student_id == mundo.profesora.id
    # El token sirve en el juego real, por sus mismas rutas.
    juego = _cliente(mundo.profesora).get(
        f"{GAME}/attempts/{data['attemptId']}", **{TOKEN_HEADER: data["attemptToken"]}
    )
    assert juego.status_code == 200, juego.data


def test_sin_desde_empieza_en_la_escena_de_inicio(mundo):
    data = _ensayo(mundo)

    assert data["currentNode"]["id"] == mundo.inicio.id
    assert [p["nodeId"] for p in data["rehearsal"]["path"]] == [mundo.inicio.id]


def test_el_admin_tambien_ensaya_un_caso_ajeno(mundo):
    assert _ensayo(mundo, user=mundo.admin)["currentNode"]["id"] == mundo.inicio.id


def test_un_estudiante_recibe_403_y_un_docente_ajeno_403(mundo):
    assert _abrir(mundo, mundo.estudiante).status_code == 403
    ajeno = _abrir(mundo, mundo.otra)
    assert ajeno.status_code == 403
    assert not SimulationAttempt.all_objects.filter(is_rehearsal=True).exists()


def test_un_anonimo_recibe_401(mundo):
    assert APIClient().post(f"{AUTHORING}/{mundo.version.id}/rehearsal", {}, format="json").status_code == 401


def test_desde_debe_ser_una_escena_de_la_version(mundo):
    otro = _cliente(mundo.profesora).post(AUTHORING, {"title": "Otro caso"}, format="json").data["data"]["caseVersionId"]
    ajena = SimulationNode.objects.get(case_version_id=otro, start_node=True)

    for desde in (999999, ajena.id):
        response = _abrir(mundo, desde=desde)
        assert response.status_code == 400, response.data
        assert response.data["field"] == "desde"
    assert not SimulationAttempt.all_objects.filter(is_rehearsal=True).exists()


def test_una_version_sin_escena_de_inicio_da_404(mundo):
    SimulationNode.objects.filter(pk=mundo.inicio.id).update(start_node=False)

    assert _abrir(mundo).status_code == 404


def test_abrir_otro_ensayo_reemplaza_el_anterior(mundo):
    primero = _ensayo(mundo)

    segundo = _ensayo(mundo, desde=mundo.segunda.id)

    viejo = SimulationAttempt.all_objects.get(pk=primero["attemptId"])
    assert viejo.status == AttemptStatus.REPLACED
    assert viejo.replaced_by_id == mundo.profesora.id
    assert viejo.replace_reason == "Reemplazado por un ensayo nuevo"
    assert SimulationAttempt.all_objects.filter(
        is_rehearsal=True, status__in=("IN_PROGRESS", "PAUSED"), case_version=mundo.version
    ).count() == 1
    assert segundo["attemptId"] != primero["attemptId"]


def test_dos_aperturas_simultaneas_dejan_uno_abierto(mundo):
    # Otra pestaña ya abrió su ensayo, pero este pedido no lo ve al cerrar los anteriores: la creación choca con el índice único.
    rival, token_rival = game_service.start_rehearsal_attempt(mundo.version, mundo.profesora, mundo.inicio)
    real = rehearsal._open_rehearsals
    llamadas = []

    def sin_ver_al_rival(actor, version):
        llamadas.append(1)
        return real(actor, version).none() if len(llamadas) == 1 else real(actor, version)

    with mock.patch.object(rehearsal, "_open_rehearsals", side_effect=sin_ver_al_rival):
        response = _abrir(mundo)

    assert response.status_code == 200, response.data
    abiertos = SimulationAttempt.all_objects.filter(
        is_rehearsal=True, status__in=("IN_PROGRESS", "PAUSED"), case_version=mundo.version
    )
    assert [a.id for a in abiertos] == [rival.id]
    # El ganador responde con su juego y un token nuevo (el anterior ya no sirve).
    data = response.data["data"]
    assert data["attemptId"] == str(rival.id) and data["attemptToken"] != token_rival
    assert "rehearsal" in data


def test_un_integrity_error_sin_ganador_no_se_traga(mundo):
    with mock.patch.object(game_service, "start_rehearsal_attempt", side_effect=IntegrityError("otra cosa")):
        with pytest.raises(IntegrityError):
            rehearsal.start(mundo.version, mundo.profesora, None)


# ─── El bloque ─────────────────────────────────────────────────────────────────────────────────────────────────────
def test_block_dice_por_que_no_aparece_una_respuesta(mundo):
    block = _ensayo(mundo)["rehearsal"]

    por_id = {o["id"]: o for o in block["options"]}
    assert set(por_id) == {mundo.gated.id, mundo.libre.id, mundo.roto.id}
    gated = por_id[mundo.gated.id]
    assert gated["offered"] is False and gated["retainedBy"] == "facts"
    assert gated["missing"] == [{"kind": "talked", "key": "abuela-obj", "label": "Abuela de la casa"}]
    assert gated["text"] == "Preguntar por la casa"
    libre = por_id[mundo.libre.id]
    assert libre["offered"] is True and libre["retainedBy"] is None and libre["missing"] == []
    roto = por_id[mundo.roto.id]
    assert roto["offered"] is False and roto["retainedBy"] == "broken" and roto["missing"] == []


def test_una_respuesta_retenida_por_una_condicion_sin_hechos_dice_condition(mundo):
    DecisionOption.objects.filter(pk=mundo.gated.id).update(requires_json=json.dumps({"milestone": "hito-x"}))

    gated = next(o for o in _ensayo(mundo)["rehearsal"]["options"] if o["id"] == mundo.gated.id)

    assert gated["offered"] is False and gated["retainedBy"] == "condition" and gated["missing"] == []


def test_block_trae_todos_los_comentarios_con_due_y_missing(mundo):
    comments = _ensayo(mundo)["rehearsal"]["comments"]

    assert [c["index"] for c in comments] == [0, 1]
    pedido, libre = comments
    assert pedido == {
        "index": 0, "personaje": "abuela", "line": "Mira la foto.", "due": False,
        "missing": [{"kind": "inspected", "key": "foto", "label": "Una foto"}],
    }
    assert libre["due"] is True and libre["missing"] == [] and libre["line"] == "Pasa, pasa."


def test_block_persona_hitos_y_camino(mundo):
    block = _ensayo(mundo)["rehearsal"]

    assert block["persona"]["bond"] and block["persona"]["activation"] and block["persona"]["label"]
    assert block["milestones"] == []
    assert block["path"] == [{"nodeId": mundo.inicio.id, "title": mundo.inicio.title}]


def test_block_explored_explorable_y_scenes(mundo):
    block = _ensayo(mundo)["rehearsal"]

    assert block["explored"] == {"talked": [], "inspected": [], "has": [], "used": []}
    assert {(e["kind"], e["key"], e["label"]) for e in block["explorable"]} == {
        ("talked", "abuela-obj", "Abuela de la casa"),
        ("talked", "vecina", "La vecina"),
        ("inspected", "abuela-obj", "Abuela de la casa"),
        ("inspected", "foto", "Una foto"),
        ("has", "linterna", "Linterna"),
        ("has", "libreta", "Libreta"),
        ("used", "linterna", "Linterna"),
        ("used", "libreta", "Libreta"),
    }
    assert block["scenes"] == [
        {"id": mundo.inicio.id, "key": "inicio", "title": mundo.inicio.title, "start": True, "terminal": False},
        {"id": mundo.segunda.id, "key": "segunda", "title": "Segunda escena", "start": False, "terminal": False},
        {"id": mundo.final.id, "key": "fin", "title": "Final", "start": False, "terminal": True},
    ]
    editor = _cliente(mundo.profesora).get(f"{AUTHORING}/{mundo.version.id}/editor").data["data"]
    assert [s["id"] for s in block["scenes"]] == [n["id"] for n in editor["nodes"]]


def test_get_devuelve_el_bloque_para_recargar_el_borrador(mundo):
    ensayo = _ensayo(mundo)
    DecisionOption.objects.filter(pk=mundo.libre.id).update(text="Seguir, con otro texto")

    block = _leer(mundo, ensayo)

    assert next(o for o in block["options"] if o["id"] == mundo.libre.id)["text"] == "Seguir, con otro texto"


# ─── PATCH ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_patch_explorado_hace_aparecer_la_respuesta_y_el_comentario(mundo):
    ensayo = _ensayo(mundo)

    response = _ajustar(mundo, ensayo, {"explorado": {"talked": ["abuela-obj"], "inspected": ["foto"]}})

    assert response.status_code == 200, response.data
    block = response.data["data"]["rehearsal"]
    assert next(o for o in block["options"] if o["id"] == mundo.gated.id)["offered"] is True
    assert all(c["due"] for c in block["comments"])
    assert block["explored"]["talked"] == ["abuela-obj"] and block["explored"]["inspected"] == ["foto"]
    # El juego real ve lo mismo: la respuesta se ofrece al estudiante-docente.
    juego = _cliente(mundo.profesora).get(f"{GAME}/attempts/{ensayo['attemptId']}", **{TOKEN_HEADER: ensayo["attemptToken"]})
    assert mundo.gated.id in [o["id"] for o in juego.data["data"]["currentNode"]["options"]]


def test_patch_explorado_reemplaza_lo_de_la_sala_y_conserva_lo_de_otras(mundo):
    ensayo = _ensayo(mundo)
    # Una exploración vieja de otra sala y la del mapa actual, tal como las deja el juego.
    attempt = SimulationAttempt.all_objects.get(pk=ensayo["attemptId"])
    from apps.simulation.services import world_state as ws

    state = ws.require_world_state(attempt)
    option_availability.record_fact(state, "talked", "abuela-obj")
    state.inspected_object_keys_json = json.dumps(["tio", "foto"])
    flags = read_map(state.flags_json)
    flags["viewedNpcKeys"] = ["tio", "abuela-obj"]
    state.flags_json = json.dumps(flags)
    state.inventory_json = json.dumps(["linterna"])
    state.save()

    response = _ajustar(mundo, ensayo, {"explorado": {"talked": ["vecina"], "has": ["libreta"], "used": []}})

    assert response.status_code == 200, response.data
    state = AttemptWorldState.objects.get(attempt_id=ensayo["attemptId"])
    flags = read_map(state.flags_json)
    # Lo de esta sala es exactamente lo pedido; lo de otras salas (``tio``) sigue.
    assert flags["viewedNpcKeys"] == ["tio", "vecina"]
    assert json.loads(state.inspected_object_keys_json) == ["tio"]
    assert flags[option_availability.EXPLORED_KEY]["sala-a"] == {"talked": ["vecina"], "inspected": []}
    assert not flags.get(option_availability.BEFORE_KEY)
    assert json.loads(state.inventory_json) == ["libreta"] and json.loads(state.used_tool_keys_json) == []
    block = response.data["data"]["rehearsal"]
    assert block["explored"] == {"talked": ["vecina"], "inspected": [], "has": ["libreta"], "used": []}


def test_patch_irA_mueve_la_escena_y_el_mundo_a_su_mapa(mundo):
    ensayo = _ensayo(mundo)

    response = _ajustar(mundo, ensayo, {"irA": mundo.segunda.id})

    assert response.status_code == 200, response.data
    block = response.data["data"]["rehearsal"]
    assert block["sceneId"] == mundo.segunda.id
    assert [o["id"] for o in block["options"]] != [o.id for o in (mundo.gated, mundo.libre, mundo.roto)]
    assert [p["nodeId"] for p in block["path"]] == [mundo.inicio.id, mundo.segunda.id]
    attempt = SimulationAttempt.all_objects.get(pk=ensayo["attemptId"])
    assert attempt.current_node_id == mundo.segunda.id
    state = AttemptWorldState.objects.get(attempt_id=attempt.id)
    assert state.scene_map.node_id == mundo.segunda.id
    juego = _cliente(mundo.profesora).get(f"{GAME}/attempts/{attempt.id}", **{TOKEN_HEADER: ensayo["attemptToken"]})
    assert juego.data["data"]["currentNode"]["id"] == mundo.segunda.id


def test_patch_irA_y_explorado_juntos_marcan_la_sala_nueva(mundo):
    ensayo = _ensayo(mundo)

    response = _ajustar(mundo, ensayo, {"irA": mundo.segunda.id, "explorado": {"talked": ["tio"]}})

    assert response.status_code == 200, response.data
    assert response.data["data"]["rehearsal"]["explored"]["talked"] == ["tio"]


def test_patch_persona_e_hitos(mundo):
    from apps.simulation.services import case_rules

    mundo.version.rules = json.dumps({"milestones": [{"key": "vinculo", "label": "Vínculo"}]})
    mundo.version.save()
    assert case_rules.rules_of(mundo.version).milestones
    ensayo = _ensayo(mundo)

    response = _ajustar(mundo, ensayo, {"persona": {"bond": "OPEN", "activation": "CRISIS"}, "hitos": ["vinculo"]})

    assert response.status_code == 200, response.data
    block = response.data["data"]["rehearsal"]
    assert block["persona"]["bond"] == "OPEN" and block["persona"]["activation"] == "CRISIS"
    assert block["milestones"] == ["vinculo"]
    # Solo el vínculo: la activación se queda como estaba.
    otra = _ajustar(mundo, ensayo, {"persona": {"bond": "WITHDRAWN"}, "hitos": []}).data["data"]["rehearsal"]
    assert otra["persona"]["bond"] == "WITHDRAWN" and otra["persona"]["activation"] == "CRISIS"
    assert otra["milestones"] == []


@pytest.mark.parametrize("cuerpo, field", [
    ({"explorado": {"talked": ["nadie"]}}, "explorado"),
    ({"explorado": {"inspected": ["escondida"]}}, "explorado"),          # un objeto no visible no se puede marcar
    ({"explorado": {"has": ["tijeras"]}}, "explorado"),
    ({"explorado": {"talked": ["tio"]}}, "explorado"),                  # una persona de OTRA sala
    ({"explorado": {"talked": "abuela-obj"}}, "explorado"),
    ({"explorado": {"mirado": ["foto"]}}, "explorado"),
    ({"persona": {"bond": "FELIZ"}}, "persona"),
    ({"persona": {"humor": "OPEN"}}, "persona"),
    ({"hitos": ["no_declarado"]}, "hitos"),
    ({"irA": 999999}, "irA"),
])
def test_patch_invalido_da_400_y_no_cambia_nada(mundo, cuerpo, field):
    ensayo = _ensayo(mundo)
    assert _ajustar(mundo, ensayo, {"explorado": {"talked": ["abuela-obj"]}}).status_code == 200
    antes = _foto(ensayo["attemptId"])

    # Un cuerpo con una parte válida y otra inválida tampoco escribe la válida.
    response = _ajustar(mundo, ensayo, {**cuerpo, "explorado": cuerpo.get("explorado", {"inspected": ["foto"]})})

    assert response.status_code == 400, response.data
    assert response.data["field"] == field
    assert _foto(ensayo["attemptId"]) == antes


def test_un_hito_no_declarado_con_una_parte_valida_no_escribe_nada(mundo):
    ensayo = _ensayo(mundo)
    antes = _foto(ensayo["attemptId"])

    response = _ajustar(mundo, ensayo, {"explorado": {"talked": ["abuela-obj"]}, "hitos": ["no_declarado"]})

    assert response.status_code == 400 and response.data["field"] == "hitos"
    assert _foto(ensayo["attemptId"]) == antes


def test_patch_sobre_un_intento_que_no_es_ensayo_o_ya_cerrado(mundo):
    ensayo = _ensayo(mundo)
    _ensayo(mundo)  # reemplaza al primero: queda REPLACED

    cerrado = _ajustar(mundo, ensayo, {"hitos": []})
    assert cerrado.status_code == 409 and cerrado.data["code"] == "REHEARSAL_CLOSED"
    leer = _cliente(mundo.profesora).get(f"{AUTHORING}/{mundo.version.id}/rehearsal/{ensayo['attemptId']}")
    assert leer.status_code == 409

    # Un intento NORMAL (id existente, no es ensayo) es como si no existiera.
    normal = SimulationAttempt.objects.create(
        student=mundo.estudiante, case_version=mundo.version, current_node=mundo.inicio, attempt_token_hash="h-normal"
    )
    gone = _ajustar(mundo, {"attemptId": str(normal.id)}, {"hitos": []})
    assert gone.status_code == 404 and gone.data["code"] == "REHEARSAL_GONE"
    inexistente = _ajustar(mundo, {"attemptId": "6f1d9b7e-5c2a-4c1e-9d7b-0a3c2e1f4a55"}, {"hitos": []})
    assert inexistente.status_code == 404 and inexistente.data["code"] == "REHEARSAL_GONE"


def test_el_ensayo_de_otra_persona_o_de_otra_version_no_se_lee_ni_se_ajusta(mundo):
    del_admin = _ensayo(mundo, user=mundo.admin)

    # La docente dueña pide el ensayo del ADMIN: para ella no existe.
    assert _ajustar(mundo, del_admin, {"hitos": []}).status_code == 404
    assert _cliente(mundo.profesora).get(
        f"{AUTHORING}/{mundo.version.id}/rehearsal/{del_admin['attemptId']}"
    ).status_code == 404
    # Una docente ajena no entra a una ruta del caso (403) ni a la de un caso suyo con un ensayo que no es de esa versión.
    assert _ajustar(mundo, del_admin, {"hitos": []}, user=mundo.otra).status_code == 403
    suyo = _cliente(mundo.otra).post(AUTHORING, {"title": "Otro"}, format="json").data["data"]["caseVersionId"]
    cruzado = _cliente(mundo.otra).patch(f"{AUTHORING}/{suyo}/rehearsal/{del_admin['attemptId']}", {"hitos": []}, format="json")
    assert cruzado.status_code == 404 and cruzado.data["code"] == "REHEARSAL_GONE"


def test_un_estudiante_no_ajusta_ni_lee_un_ensayo(mundo):
    ensayo = _ensayo(mundo)

    assert _ajustar(mundo, ensayo, {"hitos": []}, user=mundo.estudiante).status_code == 403
    assert _cliente(mundo.estudiante).get(
        f"{AUTHORING}/{mundo.version.id}/rehearsal/{ensayo['attemptId']}"
    ).status_code == 403


def test_el_bloque_no_viaja_en_las_rutas_del_juego(mundo):
    ensayo = _ensayo(mundo)

    juego = _cliente(mundo.profesora).get(f"{GAME}/attempts/{ensayo['attemptId']}", **{TOKEN_HEADER: ensayo["attemptToken"]})

    assert "rehearsal" not in juego.data["data"]


# ─── Avisos ────────────────────────────────────────────────────────────────────────────────────────────────────────
def test_warnings_de_escena_sin_respuestas_y_respuesta_sin_destino(mundo):
    sin_nada = SimulationNode.objects.create(
        case_version=mundo.version, node_key="vacia", title="Vacía", narrative="Nada.", position_x=5, position_y=5
    )
    ensayo = _ensayo(mundo, desde=sin_nada.id)

    warnings = ensayo["rehearsal"]["warnings"]

    assert "Esta escena no tiene respuestas ni es un final: el estudiante se quedaría aquí." in warnings
    assert "Esta escena todavía no tiene sala: el estudiante la vería sin escenario." in warnings
    # Una escena completa no avisa de nada.
    assert _ajustar(mundo, ensayo, {"irA": mundo.segunda.id}).data["data"]["rehearsal"]["warnings"] == []
    # Un final sin respuestas no es un aviso.
    assert "no tiene respuestas" not in " ".join(
        _ajustar(mundo, ensayo, {"irA": mundo.final.id}).data["data"]["rehearsal"]["warnings"]
    )


def test_una_respuesta_sin_destino_avisa():
    node = SimpleNamespace(terminal_node=False)
    opciones = [SimpleNamespace(text="Sin rumbo", target_node_id=None), SimpleNamespace(text="Con rumbo", target_node_id=4)]

    assert rehearsal._warnings(node, opciones, has_map=True) == [
        "«Sin rumbo»: Esta respuesta aún no lleva a ninguna escena. En el caso real, el estudiante se quedaría aquí."
    ]


# ─── Cierre del ensayo ─────────────────────────────────────────────────────────────────────────────────────────────
def test_discard_for_version_borra_los_ensayos_y_sus_hijos(mundo):
    ensayo = _ensayo(mundo)
    _ajustar(mundo, ensayo, {"explorado": {"talked": ["abuela-obj"]}})
    otro_caso = _cliente(mundo.profesora).post(AUTHORING, {"title": "Otro"}, format="json").data["data"]["caseVersionId"]
    del_otro = _ensayo(SimpleNamespace(version=SimpleNamespace(id=otro_caso), profesora=mundo.profesora))
    normal = SimulationAttempt.objects.create(
        student=mundo.estudiante, case_version=mundo.version, current_node=mundo.inicio, attempt_token_hash="h-normal-2"
    )

    borrados = rehearsal.discard_for_version(mundo.version.id)

    assert borrados == 1
    assert not SimulationAttempt.all_objects.filter(pk=ensayo["attemptId"]).exists()
    assert not AttemptEvent.objects.filter(attempt_id=ensayo["attemptId"]).exists()
    assert not AttemptWorldState.objects.filter(attempt_id=ensayo["attemptId"]).exists()
    assert SimulationAttempt.all_objects.filter(pk=del_otro["attemptId"]).exists()
    assert SimulationAttempt.objects.filter(pk=normal.pk).exists()
