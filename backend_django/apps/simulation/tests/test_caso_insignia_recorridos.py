"""SIM-VBG-002 jugado de punta a punta por la API del juego (bloque K1): los 7 finales y los requisitos.

El documento se importa, se publica por la compuerta única (sin la lista ética, que es una constancia humana) y se asigna a
un estudiante, igual que hace la siembra con el caso original. Cada recorrido elige una respuesta por decisión; una
respuesta mala va dos veces, porque la primera solo gasta la segunda oportunidad. Lo que hay que explorar se hace por la
ruta real de interacción: antes se coloca al jugador junto al objeto, porque la caminata no es lo que aquí se prueba.
"""
import json
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import Grupo
from apps.simulation.casedef import validate
from apps.simulation.casedef.vocabulary import Bond
from apps.simulation.models import AttemptWorldState, CaseVersion, DecisionOption, MapObject, SimulationAttempt
from apps.simulation.services import case_state
from apps.simulation.services.authoring import gate, importing
from apps.simulation.services.competencies import link_unlinked_criteria
from apps.simulation.services.world_state import require_world_state

User = get_user_model()
DOCUMENTO = Path(validate.__file__).resolve().parents[1] / "data" / "cases" / "SIM-VBG-002.dsl.json"

#: Las 16 decisiones en orden, con su mejor respuesta.
MEJOR = {
    "N1": "n1-mirar-y-presentarse", "O1": "h1-pap-contencion", "N2": "n2-sala-de-escucha",
    "N3": "n3-acordar-con-el-medico", "O2": "h2-459-1257", "O3": "h3-integral-psicosocial",
    "N4": "n4-preguntar-que-saben", "N5": "n5-silencio-y-validar", "N6": "n6-resumir-y-conectar",
    "N7": "n7-no-mentir-y-avisar", "O4": "c1-riesgo-proteccion-derechos", "N8": "n8-partir-del-informe",
    "O5": "c2-2126-1098-1257", "N9": "n9-explicar-y-acompanar", "N10": "n10-valorar-red-familiar",
    "O6": "c3-integral-derechos",
}
#: Lo que la mejor respuesta de cada decisión pide haber explorado en su sala.
EXPLORAR = {
    "N2": ["enfermera"], "N3": ["hoja-ingreso"], "N6": ["trabajadora-social"], "N8": ["informe-hospital"],
    "N9": ["orientadora-juridica", "comisaria"],
}
_RELOJ = {"segundos": 0}


def _dos_veces(clave):
    """Una respuesta mala que SÍ queda registrada: la primera gasta la segunda oportunidad y la segunda avanza."""
    return [clave, clave]


@pytest.fixture(autouse=True)
def _reloj_deliberado(monkeypatch):
    """Cada respuesta es deliberada: el reloj avanza 3 s entre una y otra (si no, dos iguales serían un doble clic)."""
    _RELOJ["segundos"] = 0
    ahora = timezone.now
    monkeypatch.setattr(timezone, "now", lambda: ahora() + timedelta(seconds=_RELOJ["segundos"]))


@pytest.fixture
def version(db):
    admin = User.objects.create_user(email="k1_admin@x.com", password="x", nombre="Ad", apellido="K1", role="ADMIN")
    importado = importing.import_document(json.loads(DOCUMENTO.read_text(encoding="utf-8")), admin)
    version = CaseVersion.objects.select_related("simulation_case").get(pk=importado["caseVersionId"])
    link_unlinked_criteria(create=True)
    sello = gate.ensure_publishable(version, require_checklist=False)
    gate.mark_published(version, sello, admin)
    version.avisos_de_publicacion = sorted({aviso["code"] for aviso in sello.warnings})
    return version


@pytest.fixture
def cliente(db, version):
    estudiante = User.objects.create_user(email="k1_est@x.com", password="x", nombre="Es", apellido="K1", role="ESTUDIANTE")
    profesor = User.objects.create_user(email="k1_prof@x.com", password="x", nombre="Pr", apellido="K1", role="PROFESOR")
    grupo = Grupo.objects.create(nombre="Grupo K1", codigo="K1", profesor=profesor)
    with connection.cursor() as cursor:
        cursor.execute("INSERT INTO grupo_estudiante (grupo_id, estudiante_id) VALUES (%s, %s)", [grupo.id, estudiante.id])
        cursor.execute("INSERT INTO case_assignments (grupo_id, case_version_id) VALUES (%s, %s)", [grupo.id, version.id])
    client = APIClient()
    client.force_authenticate(user=estudiante)
    return client


class Partida:
    """Un intento del estudiante sobre el caso, con las órdenes del juego que usan los recorridos."""

    def __init__(self, client, version, data=None):
        """Empieza un intento del estudiante o, si llega ``data``, usa el ensayo que la autora ya abrió."""
        self.client, self.version = client, version
        if data is None:
            data = client.post("/api/simulation/attempts", {"caseVersionId": version.id}, format="json").data["data"]
        self.id, self.token = data["attemptId"], data["attemptToken"]
        self.url = f"/api/simulation/attempts/{self.id}"
        self.estado = data
        self._claves = dict(DecisionOption.objects.filter(case_version=version).values_list("id", "option_key"))

    def mundo(self):
        return self.client.get(f"{self.url}/world", HTTP_X_SIEP_ATTEMPT_TOKEN=self.token).data["data"]

    def ofrecidas(self):
        """Las claves de las respuestas que el estudiante ve ahora."""
        return {self._claves[o["id"]] for o in self.mundo()["decisionOptions"]}

    def _junto_a(self, clave):
        """Sincroniza el mundo con la escena actual y deja al jugador junto al objeto ``clave`` de la sala."""
        estado = require_world_state(SimulationAttempt.all_objects.get(pk=self.id))
        objeto = MapObject.objects.get(scene_map_id=estado.scene_map_id, object_key=clave)
        AttemptWorldState.objects.filter(pk=estado.pk).update(player_x=objeto.position_x, player_y=objeto.position_y)

    def interactuar(self, clave):
        """Hablar con una persona o revisar un objeto de la sala, por la ruta real del juego."""
        self._junto_a(clave)
        respuesta = self.client.post(f"{self.url}/interactions/{clave}", {"attemptToken": self.token}, format="json")
        assert respuesta.status_code == 200, f"interacción {clave}: {respuesta.data}"
        return respuesta.data["data"]

    def cruzar(self, puerta, destino):
        self._junto_a(puerta)
        return self.client.post(
            f"{self.url}/enter-room", {"attemptToken": self.token, "targetNodeKey": destino, "doorKey": puerta}, format="json"
        )

    def responder(self, clave):
        _RELOJ["segundos"] += 3
        opcion = DecisionOption.objects.get(case_version=self.version, option_key=clave)
        return self.client.post(f"{self.url}/decisions", {
            "attemptToken": self.token, "decisionOptionId": opcion.id, "requestId": uuid.uuid4().hex,
        }, format="json")

    def decidir(self, clave):
        respuesta = self.responder(clave)
        assert respuesta.status_code == 200, f"decisión {clave}: {respuesta.data}"
        self.estado = respuesta.data["data"]["attempt"]
        return respuesta.data["data"]

    def jugar(self, hasta=None, **cambios):
        """Recorre las decisiones en orden con la mejor respuesta, salvo las de ``cambios`` (lista de claves por decisión).

        Antes de cada decisión explora lo que su mejor respuesta pide. Se detiene al llegar a la decisión ``hasta``.
        """
        pendientes = list(MEJOR)
        if "desde" in cambios:
            pendientes = pendientes[pendientes.index(cambios.pop("desde")):]
        for paso in pendientes:
            if paso == hasta:
                break
            for clave in EXPLORAR.get(paso, ()):
                self.interactuar(clave)
            for clave in cambios.get(paso, [MEJOR[paso]]):
                self.decidir(clave)
        return self.estado

    def hitos(self):
        return case_state.read(SimulationAttempt.all_objects.get(pk=self.id)).milestones

    def vinculo(self):
        return case_state.read(SimulationAttempt.all_objects.get(pk=self.id)).persona[0]

    def final(self):
        assert self.estado["status"] == "COMPLETED"
        return self.estado["completionReport"]["ending"]


# ─── Publicación ──────────────────────────────────────────────────────────────

def test_el_caso_se_importa_y_pasa_la_compuerta_de_publicacion(version):
    assert (version.simulation_case.code, version.status) == ("SIM-VBG-002", "PUBLISHED")
    assert version.definition_hash and version.validated_at is not None
    assert version.nodes.count() == 18  # 16 decisiones, el cierre y la sala de escucha a la que se entra por la puerta
    assert DecisionOption.objects.filter(case_version=version).count() == 49


def test_los_avisos_de_publicacion_son_los_explicados(version):
    """La compuerta no bloquea nada y deja solo estos avisos, cada uno con su porqué:

    - la sala de escucha se alcanza por una puerta, no por una decisión (igual que la recepción del caso original);
    - con 16 decisiones hay demasiados caminos para enumerarlos: que los 7 finales se alcanzan lo prueban los recorridos;
    - ninguna respuesta declara competencias todavía, como en el caso original;
    - cuatro textos pasan su largo de lectura (V5): la narración del capítulo 1 y tres documentos que se leen en voz alta
      (``LARGOS_DE_LECTURA_CONOCIDOS`` en ``test_caso_insignia_documento``); recortarlos es decisión de Psicología.
    """
    sin_prefijo = sorted(codigo.rsplit(".", 1)[-1] for codigo in version.avisos_de_publicacion)
    assert sin_prefijo == ["READING_LENGTH", "UNREACHABLE_NODE", "competency-without-evidence", "ending-reachability-skipped"]


# ─── Los siete finales ────────────────────────────────────────────────────────

def test_final_protectora_integral(cliente, version):
    partida = Partida(cliente, version)
    partida.jugar()
    final = partida.final()
    assert final["key"] == "protectora"
    assert len(partida.hitos()) == 21  # los 11 originales y los 10 nuevos
    # «Elegiste:» del cierre (V4): el texto corto del botón que se pulsó, además del de la opción.
    elegida = partida.estado["completionReport"]["decisionReview"][0]["chosen"]
    assert elegida["label"] == "Mirar primero, confirmar la seguridad y presentarte a la familia"
    assert elegida["text"].startswith("Mirar primero: confirmar con el vigilante")
    assert not any("contraindicada" in frase or "con riesgo" in frase for frase in final["reason"])


def test_final_revictimizante_con_dos_respuestas_contraindicadas(cliente, version):
    partida = Partida(cliente, version)
    partida.jugar(O1=_dos_veces("h1-interrogar-victima"), O4=_dos_veces("c1-mediacion-perdon"))
    final = partida.final()
    assert final["key"] == "critica"
    assert "2 respuestas contraindicadas" in final["reason"]


def test_final_la_ruta_se_abandona_con_el_vinculo_roto(cliente, version):
    partida = Partida(cliente, version)
    partida.jugar(
        N8=_dos_veces("n8-instrumento-como-lista"), O5=_dos_veces("c2-eje-1448"), N9=_dos_veces("n9-entregar-hoja"),
        N10=_dos_veces("n10-solo-ella"), O6=["c3-valoracion-dependientes"],
    )
    assert partida.final()["key"] == "ruta_abandonada"
    assert partida.vinculo() == Bond.WITHDRAWN
    assert not {"relato_protegido", "ruta_acompanada"} & partida.hitos()
    # La protección de la comisaría estaba completa: lo que se perdió fue la confianza.
    assert {"riesgo_feminicidio_valorado", "medidas_proteccion_activadas", "asesoria_derechos_realizada"} <= partida.hitos()


def test_final_proteccion_lograda_duelo_desatendido(cliente, version):
    partida = Partida(cliente, version)
    partida.jugar(O3=["h3-pap-epicee"])  # aceptable: aplica EPICEE pero no acompaña el duelo
    final = partida.final()
    assert final["key"] == "duelo_desatendido"
    assert "duelo_acompanado" not in partida.hitos()
    # «Cómo llegaste aquí» dice lo que decidió este final (V4): no solo los hitos de la comisaría.
    assert "Faltó: Acompañar el duelo" in final["reason"]


def test_final_contencion_solida_proteccion_incompleta(cliente, version):
    partida = Partida(cliente, version)
    partida.jugar(O4=_dos_veces("c1-patrones-infancia"))
    final = partida.final()
    assert final["key"] == "proteccion_incompleta"
    assert {"familia_contenida", "epicee_aplicado", "duelo_acompanado"} <= partida.hitos()
    assert "medidas_proteccion_activadas" not in partida.hitos()
    assert any(frase.startswith("Faltó") for frase in final["reason"])


def test_final_riesgo_persistente(cliente, version):
    partida = Partida(cliente, version)
    partida.jugar(O3=["h3-pap-epicee"], O4=_dos_veces("c1-patrones-infancia"), O6=["c3-valoracion-dependientes"])
    assert partida.final()["key"] == "riesgo_persistente"
    assert not {"riesgo_feminicidio_valorado", "medidas_proteccion_activadas", "asesoria_derechos_realizada"} & partida.hitos()


def test_final_adecuada_con_brechas(cliente, version):
    partida = Partida(cliente, version)
    partida.jugar(O2=_dos_veces("h2-459-1448"), O5=_dos_veces("c2-eje-1448"))
    final = partida.final()
    assert final["key"] == "con_brechas"
    assert "2 respuestas con riesgo" in final["reason"]


def test_una_primera_respuesta_mala_no_cambia_el_final(cliente, version):
    partida = Partida(cliente, version)
    partida.jugar(N1=["n1-retirar-al-hermano", MEJOR["N1"]], N5=["n5-pasar-a-tramites", MEJOR["N5"]])
    assert partida.final()["key"] == "protectora"


# ─── Los requisitos: la mejor respuesta aparece solo cuando se exploró lo necesario ──────────────────

@pytest.mark.parametrize("paso, mejor, falta", [
    ("N2", "n2-sala-de-escucha", ["enfermera"]),
    ("N3", "n3-acordar-con-el-medico", ["hoja-ingreso"]),
    ("N6", "n6-resumir-y-conectar", ["trabajadora-social"]),
    ("N8", "n8-partir-del-informe", ["informe-hospital"]),
    ("N9", "n9-explicar-y-acompanar", ["orientadora-juridica", "comisaria"]),
])
def test_la_mejor_respuesta_aparece_al_explorar_lo_que_pide(cliente, version, paso, mejor, falta):
    partida = Partida(cliente, version)
    partida.jugar(hasta=paso)
    antes = partida.ofrecidas()
    assert mejor not in antes and len(antes) == 2  # las otras dos siguen ahí: nunca sin salida

    # Elegirla sin haber explorado no se puede.
    rechazo = partida.responder(mejor)
    assert rechazo.status_code == 400 and "no está disponible" in rechazo.data["message"]

    for clave in falta[:-1]:  # con solo una parte de lo pedido, todavía no
        partida.interactuar(clave)
        assert mejor not in partida.ofrecidas()
    ultima = partida.interactuar(falta[-1])
    assert mejor in {partida._claves[o["id"]] for o in ultima["world"]["decisionOptions"]}
    assert mejor in partida.ofrecidas()
    partida.decidir(mejor)


def test_n7_pide_haber_acordado_con_el_medico_en_n3(cliente, version):
    sin_acuerdo = Partida(cliente, version)
    sin_acuerdo.jugar(hasta="N7", N3=_dos_veces("n3-que-lo-diga-el-medico"))
    assert "equipo_coordinado" not in sin_acuerdo.hitos()
    assert sin_acuerdo.ofrecidas() == {"n7-decirlo-a-solas", "n7-decir-que-esta-bien"}
    # La enfermera lo deja ver al acercarse, sin decir cuál es la condición.
    assert any("Nadie me dejó dicho" in c["line"] for c in sin_acuerdo.mundo()["comments"])


def test_n7_ofrece_la_mejor_respuesta_con_el_acuerdo_de_n3(cliente, version):
    con_acuerdo = Partida(cliente, version)
    con_acuerdo.jugar(hasta="N7")
    assert "equipo_coordinado" in con_acuerdo.hitos()
    assert "n7-no-mentir-y-avisar" in con_acuerdo.ofrecidas()
    assert not any("Nadie me dejó dicho" in c["line"] for c in con_acuerdo.mundo()["comments"])


def test_con_el_vinculo_roto_n8_y_n9_piden_recuperarlo(cliente, version):
    partida = Partida(cliente, version)
    partida.jugar(hasta="N8", N7=_dos_veces("n7-decirlo-a-solas"), O4=_dos_veces("c1-patrones-infancia"))
    assert partida.vinculo() == Bond.WITHDRAWN

    partida.interactuar("informe-hospital")
    assert "n8-partir-del-informe" not in partida.ofrecidas()  # leyó el informe, pero la confianza está rota
    assert any("Pregunte lo que tenga que preguntar" in c["line"] for c in partida.mundo()["comments"])

    # Una respuesta que la cuida (O5) recupera el vínculo, y en N9 la mejor respuesta vuelve a aparecer.
    partida.jugar(desde="N8", hasta="N9", N8=_dos_veces("n8-instrumento-como-lista"))
    assert partida.vinculo() == Bond.GUARDED
    for clave in EXPLORAR["N9"]:
        partida.interactuar(clave)
    assert "n9-explicar-y-acompanar" in partida.ofrecidas()


def test_lo_hablado_en_la_sala_de_espera_vale_para_la_decision_siguiente(cliente, version):
    """O1 y N2 ocurren en la misma sala (``salaId``): hablar con la enfermera durante O1 ya cuenta para N2."""
    partida = Partida(cliente, version)
    partida.jugar(hasta="O1")
    partida.interactuar("enfermera")
    partida.decidir(MEJOR["O1"])
    assert "n2-sala-de-escucha" in partida.ofrecidas()


# ─── El ensayo del borrador: así lo juega la docente antes de publicar ───────

AUTORIA = "/api/authoring/cases"


@pytest.fixture
def ensayo(db):
    """El documento importado por la ruta de autoría y un ensayo abierto por su dueña, sin publicar el caso."""
    docente = User.objects.create_user(email="k1_doc@x.com", password="x", nombre="Do", apellido="K1", role="PROFESOR")
    client = APIClient()
    client.force_authenticate(user=docente)
    importado = client.post(f"{AUTORIA}/import", DOCUMENTO.read_bytes(), content_type="application/json")
    assert importado.status_code in (200, 201), importado.data
    version = CaseVersion.objects.get(pk=importado.data["data"]["caseVersionId"])
    abierto = client.post(f"{AUTORIA}/{version.id}/rehearsal", {}, format="json")
    assert abierto.status_code in (200, 201), abierto.data
    return Partida(client, version, abierto.data["data"])


def _en_el_panel(partida, clave):
    """Cómo ve el panel de la autora la respuesta ``clave`` en la escena actual del ensayo."""
    bloque = partida.client.get(f"{AUTORIA}/{partida.version.id}/rehearsal/{partida.id}").data["data"]["rehearsal"]
    return next(o for o in bloque["options"] if partida._claves[o["id"]] == clave)


def test_el_borrador_se_ensaya_de_principio_a_fin_sin_publicar(ensayo):
    assert ensayo.version.status != "PUBLISHED"
    ensayo.jugar()
    assert ensayo.final()["key"] == "protectora"
    assert len(ensayo.hitos()) == 21


def test_el_panel_del_ensayo_explica_por_que_no_aparece_la_mejor_respuesta(ensayo):
    ensayo.jugar(hasta="N2")
    retenida = _en_el_panel(ensayo, "n2-sala-de-escucha")
    assert retenida["offered"] is False and retenida["retainedBy"] == "facts"
    assert retenida["missing"] == [{"kind": "talked", "key": "enfermera", "label": "Enfermera de urgencias"}]

    ensayo.interactuar("enfermera")
    ofrecida = _en_el_panel(ensayo, "n2-sala-de-escucha")
    assert ofrecida["offered"] is True and ofrecida["retainedBy"] is None

    # N7 sin el acuerdo de N3: lo que falta es un hito, y el panel lo marca como otra condición (sin nada que explorar).
    ensayo.jugar(desde="N2", hasta="N7", N3=_dos_veces("n3-que-lo-diga-el-medico"))
    por_hito = _en_el_panel(ensayo, "n7-no-mentir-y-avisar")
    assert por_hito["offered"] is False and por_hito["retainedBy"] == "condition" and por_hito["missing"] == []


# ─── Objetos y salas ─────────────────────────────────────────────────────────

def test_la_sala_de_escucha_esta_cerrada_hasta_que_la_enfermera_la_abre(cliente, version):
    partida = Partida(cliente, version)
    partida.jugar(hasta="N2")

    cerrada = partida.cruzar("puerta-sala-escucha", "c1-sala-escucha")
    assert cerrada.status_code == 400 and "cerrada con llave" in str(cerrada.data)

    partida.interactuar("enfermera")
    abierta = partida.cruzar("puerta-sala-escucha", "c1-sala-escucha")
    assert abierta.status_code == 200, abierta.data
    assert abierta.data["data"]["map"]["key"] == "hosp-sala-escucha-c1"
    assert "pañuelos" in partida.interactuar("agua-panuelos")["interaction"]["interactionText"]

    regreso = partida.cruzar("puerta-sala-espera", "c1-lugar-para-hablar")
    assert regreso.status_code == 200, regreso.data
    assert regreso.data["data"]["map"]["key"] == "hosp-sala-espera-2"
    # Entrar y salir no avanza el caso; la mejor respuesta sigue ofrecida.
    assert partida.ofrecidas() >= {"n2-sala-de-escucha"}
    partida.decidir("n2-sala-de-escucha")
    assert "entorno_preparado" in partida.hitos()


def test_la_abuela_reacciona_a_la_noticia_segun_el_vinculo(cliente, version):
    cuidada = Partida(cliente, version)
    cuidada.jugar(hasta="N5")
    lineas = [c["line"] for c in cuidada.mundo()["comments"]]
    assert any("te busca la mano" in linea for linea in lineas)
    assert not any("Ustedes lo sabían" in linea for linea in lineas)
    assert all(set(c) == {"id", "objectKey", "line", "emotion", "gesture"} for c in cuidada.mundo()["comments"])


def test_cada_respuesta_trae_la_reaccion_de_alguien_de_la_sala(cliente, version):
    partida = Partida(cliente, version)
    primera = partida.decidir(MEJOR["N1"])["reaction"]
    assert primera["objectKey"] == "hermano-mayor" and primera["gesture"] == "se-acerca" and primera["line"]
    segunda = partida.decidir(MEJOR["O1"])["reaction"]
    assert segunda["objectKey"] == "abuela" and segunda["line"].startswith("(La abuela respira un poco más despacio")
