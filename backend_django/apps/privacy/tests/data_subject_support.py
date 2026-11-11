"""Ayudantes de las pruebas de los derechos del titular (S3-4): un mundo con una persona en TODAS las tablas con datos suyos, el
barrido de marcadores sobre TODO el esquema y el volcado de la base.

Los datos se construyen con los modelos y el API reales del proyecto. Cada texto de la persona lleva un marcador único de esta
ejecución (``secrets.token_hex``): ninguna contraseña, correo ni texto es un literal. El barrido busca los marcadores en TODAS las
columnas de texto y JSON de TODAS las tablas del esquema ``public`` (y en las bitácoras, descifradas): así atrapa lo que se
olvide, incluido ``context_json`` de la auditoría.
"""
import hashlib
import json
import secrets
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.grupos.models import CaseAssignment, Grupo, GrupoEstudiante
from apps.privacy.models import ConsentRecord
from apps.progression.models import StudentCaseCompletion
from apps.simulation.tests.case_exploration import explore_what_the_case_asks_for
from apps.simulation.models import (
    AttemptFeedback,
    AttemptHintView,
    AttemptWorldState,
    AuditLog,
    AuthoringAssistantUsage,
    CaseReview,
    CaseVersion,
    CriterionScore,
    DecisionOption,
    PublicationChecklist,
    PublicationChecklistItem,
    ReflectionJournal,
    Rubric,
    RubricCriterion,
    RubricEvaluation,
    SceneHint,
    SceneMap,
    SimulationAttempt,
    SimulationCase,
    SimulationNode,
    SimulationRubricAssignment,
)
from apps.simulation.services import attempt_report, crypto_service
from apps.users.models import AccessRequest
from apps.users.serializers import generate_access_token

User = get_user_model()

BASE = "/api/simulation"
CABECERA_DEL_INTENTO = "HTTP_X_SIEP_ATTEMPT_TOKEN"
IP_DE_LA_PERSONA = "203.0.113.17"


def marca():
    """Un marcador único de esta ejecución."""
    return secrets.token_hex(8)


def crear_cuenta(rol, etiqueta, *, clave=None):
    """Una cuenta con correo, nombre y apellido únicos. Con ``clave`` puede entrar de verdad."""
    sufijo = secrets.token_hex(4)
    return User.objects.create_user(
        email=f"{etiqueta}-{sufijo}@example.com",
        password=clave,
        nombre=f"Nom{sufijo}",
        apellido=f"Ape{sufijo}",
        role=rol,
    )


def _token_hash(texto):
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


class Entorno:
    """Lo que comparten los mundos: el ADMIN que ejecuta, un docente ajeno, otro estudiante y la versión publicada sembrada."""

    def __init__(self):
        self.version = CaseVersion.objects.get(simulation_case__code="SIM-VBG-001", status="PUBLISHED")
        self.admin = crear_cuenta("ADMIN", "admin")
        self.docente = crear_cuenta("PROFESOR", "docente")
        self.alumno = crear_cuenta("ESTUDIANTE", "alumno")
        self.nodo_inicial = SimulationNode.objects.filter(case_version=self.version, start_node=True).first()


class Mundo:
    """UNA persona con datos en cada tabla del inventario que puede tener datos suyos.

    Fue estudiante (jugó, escribió bitácoras, pidió una salida segura, la evaluaron) y hoy es docente (tiene un grupo, un caso,
    una revisión, una rúbrica y una lista de verificación). Los marcadores van en su correo, su nombre, su apellido, su
    bitácora y cada texto libre suyo. ``comentario`` va en el texto de un docente SOBRE ella: se conserva por decisión.
    """

    def __init__(self, etiqueta, entorno):
        self.etiqueta = etiqueta
        self.entorno = entorno
        self.m = {
            clave: marca()
            for clave in (
                "correo", "nombre", "apellido", "reflexion", "salida", "etiqueta", "nota", "evidencia", "pregunta", "agente",
                "comentario", "nota_ajena", "encuesta",
            )
        }
        self.clave = secrets.token_urlsafe(24)
        self.persona = User.objects.create_user(
            email=f"{self.m['correo']}@example.com",
            password=self.clave,
            nombre=f"Nom{self.m['nombre']}",
            apellido=f"Ape{self.m['apellido']}",
            role="ESTUDIANTE",
        )
        self.token = generate_access_token(self.persona)
        self._agente = f"agente-{self.m['agente']}"
        self._solicitudes()
        self._pertenencia_a_grupos()
        self._jugar()
        self._evaluaciones_recibidas()
        User.objects.filter(pk=self.persona.pk).update(role="PROFESOR")  # fue estudiante; hoy es docente
        self.persona.refresh_from_db()
        self._lo_que_hizo_como_docente()
        self._auditoria_antigua()
        ConsentRecord.objects.create(
            person=self.persona, consent_type="CONTENT_NOTICE", case_version=entorno.version, notice_version="v1"
        )

    # ── Marcadores ──────────────────────────────────────────────────────────────────────────────────────────────
    def marcadores_a_borrar(self):
        """Todo lo que la persona escribió o es: ninguno puede quedar tras suprimirla."""
        return [valor for clave, valor in self.m.items() if clave not in {"comentario", "nota_ajena"}]

    # ── La cuenta y sus solicitudes ─────────────────────────────────────────────────────────────────────────────
    def _solicitudes(self):
        for estado in ("PENDING", "REVIEWED"):
            AccessRequest.objects.create(
                nombre=self.persona.nombre, apellido=self.persona.apellido, email=self.persona.email, status=estado
            )

    # ── Lo que hizo como estudiante ─────────────────────────────────────────────────────────────────────────────
    def cliente(self):
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {self.token}")
        return cliente

    def _post(self, ruta, cuerpo):
        respuesta = self.cliente().post(
            ruta, cuerpo, format="json", REMOTE_ADDR=IP_DE_LA_PERSONA, HTTP_USER_AGENT=self._agente
        )
        assert respuesta.status_code == 200, (ruta, respuesta.status_code, respuesta.data)
        return respuesta.data["data"]

    def _pertenencia_a_grupos(self):
        entorno = self.entorno
        self.grupo_ajeno = Grupo.objects.create(
            nombre=f"Grupo ajeno {secrets.token_hex(3)}", codigo=f"GA-{secrets.token_hex(4)}", profesor=entorno.docente
        )
        GrupoEstudiante.objects.create(
            grupo=self.grupo_ajeno, estudiante=self.persona, status="ACTIVE", invited_by=entorno.docente,
            invited_at=timezone.now(),
        )
        CaseAssignment.objects.create(grupo=self.grupo_ajeno, case_version=entorno.version, assigned_by=entorno.docente)

    def _jugar(self):
        entorno = self.entorno
        inicio = self._post(f"{BASE}/attempts", {"caseVersionId": entorno.version.id})
        self.intento = inicio
        ruta = f"{BASE}/attempts/{inicio['attemptId']}"
        token = inicio["attemptToken"]
        self._post(
            f"{ruta}/reflections",
            {"attemptToken": token, "nodeId": inicio["currentNode"]["id"], "text": f"Reflexion {self.m['reflexion']}"},
        )
        mundo = self.cliente().get(
            f"{ruta}/world", REMOTE_ADDR=IP_DE_LA_PERSONA, HTTP_USER_AGENT=self._agente, **{CABECERA_DEL_INTENTO: token}
        )
        assert mundo.status_code == 200, mundo.data
        self._post(f"{ruta}/safe-exit", {"attemptToken": token, "reason": f"Necesito pausar {self.m['salida']}"})
        self._post(f"{ruta}/resume", {"attemptToken": token})
        # El caso 2.1 retiene la recomendada hasta explorar: se deja lo explorado y se elige por clase en la base.
        explore_what_the_case_asks_for(inicio["attemptId"])
        adecuada = DecisionOption.objects.filter(
            source_node_id=inicio["currentNode"]["id"], response_class="RECOMMENDED"
        ).order_by("id").values_list("id", flat=True).first()
        self._post(
            f"{ruta}/decisions",
            {
                "attemptToken": token, "decisionOptionId": adecuada, "evidenceOverride": True,
                "missingEvidence": [f"Etiqueta {self.m['etiqueta']}"],
            },
        )
        self.attempt = SimulationAttempt.objects.get(pk=inicio["attemptId"])
        self.token_del_intento = token
        mapa = SceneMap.objects.filter(case_version=entorno.version).first() or SceneMap.objects.create(
            case_version=entorno.version, node=entorno.nodo_inicial, map_key=f"MAP-{secrets.token_hex(4)}", title="Mapa de prueba"
        )
        pista = SceneHint.objects.create(scene_map=mapa, hint_order=1, text="Una pista de prueba")
        AttemptHintView.objects.create(attempt=self.attempt, hint=pista)
        AttemptWorldState.objects.get_or_create(attempt=self.attempt, defaults={"scene_map": mapa})
        attempt_report.freeze_report(self.attempt)  # copia el motivo de la salida segura en la línea de tiempo del informe
        # La encuesta breve (E6-3): el comentario es texto libre de la persona y se borra con ella.
        AttemptFeedback.objects.create(attempt=self.attempt, rating=4, comment=f"Me ayudó a ordenar lo que viví {self.m['encuesta']}")
        StudentCaseCompletion.objects.create(
            student_id=self.persona.pk, simulation_case_id=entorno.version.simulation_case_id,
            first_completed_at=timezone.now(),
        )

    def _evaluaciones_recibidas(self):
        entorno = self.entorno
        rubrica = Rubric.objects.create(name=f"Rubrica {secrets.token_hex(3)}", created_by=entorno.docente, case_version=entorno.version)
        criterio = RubricCriterion.objects.create(rubric=rubrica, competency="COM", title="Criterio", max_score=4, weight=1)
        self.evaluacion_recibida = RubricEvaluation.objects.create(
            attempt=self.attempt, rubric=rubrica, instructor=entorno.docente, total_score=3,
            comment=f"Buen trabajo {self.m['comentario']}", status="COMPLETE",
        )
        self.puntaje_recibido = CriterionScore.objects.create(
            rubric_evaluation=self.evaluacion_recibida, rubric_criterion=criterio, score=3, level="LOGRADO",
            comment=f"Criterio logrado {self.m['comentario']}",
        )

    # ── Lo que hizo como docente ────────────────────────────────────────────────────────────────────────────────
    def _lo_que_hizo_como_docente(self):
        entorno, persona = self.entorno, self.persona
        self.grupo = Grupo.objects.create(
            nombre=f"Grupo propio {secrets.token_hex(3)}", codigo=f"GP-{secrets.token_hex(4)}", profesor=persona
        )
        self.membresia_ajena = GrupoEstudiante.objects.create(
            grupo=self.grupo, estudiante=entorno.alumno, status="INVITED", invited_by=persona, invited_at=timezone.now()
        )
        self.caso = SimulationCase.objects.create(
            code=f"CASO-{secrets.token_hex(4)}", title=f"Caso propio {secrets.token_hex(3)}", created_by=persona
        )
        # El contador diario del asistente de IA de autoría (P5): una fila por docente y día.
        AuthoringAssistantUsage.objects.create(user=persona, day=date.today(), count=3)
        self.version_propia = CaseVersion.objects.create(
            simulation_case=self.caso, semantic_version="0.1.0", status="DRAFT", created_by=persona, last_edited_by=persona
        )
        self.asignacion_grupal = CaseAssignment.objects.create(
            grupo=self.grupo, case_version=self.version_propia, assigned_by=persona
        )
        self.asignacion_individual = CaseAssignment.objects.create(
            estudiante=persona, case_version=self.version_propia, assigned_by=entorno.docente
        )
        self.revision_propia = CaseReview.objects.create(
            case_version=self.version_propia, requested_by=persona, decided_by=persona, decision="APPROVED",
            decided_at=timezone.now(), note=f"Revisado {self.m['nota']}",
            content_reviewer=f"{persona.nombre} {persona.apellido}", content_reviewed_on=date.today(),
            content_reference="acta-1",
        )
        self.revision_ajena = CaseReview.objects.create(
            case_version=self.version_propia, requested_by=persona, decided_by=entorno.docente, decision="REJECTED",
            reason="FORMA", decided_at=timezone.now(), note=f"Nota del docente {self.m['nota_ajena']}",
            content_reviewer="Revisora ajena",
        )
        self.rubrica = Rubric.objects.create(
            name=f"Rubrica propia {secrets.token_hex(3)}", created_by=persona, case_version=self.version_propia
        )
        criterio = RubricCriterion.objects.create(rubric=self.rubrica, competency="COM", title="Criterio", max_score=4, weight=1)
        SimulationRubricAssignment.objects.create(case_version=self.version_propia, rubric=self.rubrica, assigned_by=persona)
        lista = PublicationChecklist.objects.create(case_version=self.version_propia, submitted_by=persona)
        self.punto = PublicationChecklistItem.objects.create(
            checklist=lista, code="ITEM-1", label="Un punto", evidence_note=f"Evidencia {self.m['evidencia']}"
        )
        # Un intento ajeno que ella sustituyó y una evaluación que ella dio: son datos de OTRA persona.
        nodo = entorno.nodo_inicial
        self.intento_ajeno = SimulationAttempt.objects.create(
            attempt_token_hash=_token_hash(secrets.token_hex(16)), case_version=entorno.version, student=entorno.alumno,
            current_node=nodo, status="REPLACED", replaced_by=persona, replace_reason="Motivo del docente",
            ended_at=timezone.now(),
        )
        self.evaluacion_dada = RubricEvaluation.objects.create(
            attempt=self.intento_ajeno, rubric=self.rubrica, instructor=persona, total_score=2,
            comment="Comentario de la docente sobre otra persona", status="COMPLETE",
        )
        CriterionScore.objects.create(
            rubric_evaluation=self.evaluacion_dada, rubric_criterion=criterio, score=2, level="EN_PROCESO",
            comment="Comentario de criterio",
        )

    # ── Una fila antigua del asistente, con el texto libre de la pregunta ───────────────────────────────────────
    def _auditoria_antigua(self):
        AuditLog.objects.create(
            actor=self.persona, actor_role="ESTUDIANTE", action="AI_ASSISTANT_QUERY", resource_type="SimulationAttempt",
            resource_id=str(self.attempt.id),
            context_json=json.dumps({"taxonomy": "asistente.consultar", "question": f"Pregunta {self.m['pregunta']}", "question_length": 12}),
            ip_address=IP_DE_LA_PERSONA, user_agent=self._agente, retention_until=timezone.now() + timedelta(days=360),
        )


# ── Barrido y volcado ────────────────────────────────────────────────────────────────────────────────────────────
def barrer(marcadores):
    """``[(tabla, columna)]`` donde aparece algún marcador: en TODAS las columnas de texto y JSON de TODAS las tablas de ``public``
    y en las bitácoras cifradas, ya descifradas."""
    patrones = [f"%{marcador}%" for marcador in marcadores]
    hallazgos = set()
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' "
            "AND data_type IN ('character varying', 'character', 'text', 'json', 'jsonb') ORDER BY 1, 2"
        )
        for tabla, columna in cursor.fetchall():
            cursor.execute(f'SELECT count(*) FROM "{tabla}" WHERE "{columna}"::text ILIKE ANY(%s)', [patrones])
            if cursor.fetchone()[0]:
                hallazgos.add((tabla, columna))
    for fila in ReflectionJournal.objects.all():
        try:
            texto = crypto_service.decrypt(
                fila.encrypted_text, key_ref=fila.encryption_key_ref, attempt_id=fila.attempt_id, node_id=fila.node_id
            )
        except Exception:  # noqa: BLE001  (una bitácora que no se descifra no tiene marcadores que buscar)
            continue
        if any(marcador in texto for marcador in marcadores):
            hallazgos.add(("reflection_journals", "encrypted_text (descifrado)"))
    return sorted(hallazgos)


def volcado():
    """Cada tabla de ``public`` con sus filas como JSON, ordenadas: dos volcados iguales = no cambió ni una fila."""
    resultado = {}
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1"
        )
        for (tabla,) in cursor.fetchall():
            cursor.execute(f'SELECT row_to_json(t)::text FROM "{tabla}" t')
            resultado[tabla] = sorted(fila[0] for fila in cursor.fetchall())
    return resultado
