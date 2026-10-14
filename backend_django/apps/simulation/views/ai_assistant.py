"""RF-027: contextual assistant for the simulator.

The assistant is deliberately constrained: before a decision is taken it can
explain concepts and ask reflective questions, but it must not reveal which
option is correct.

It is OFF by default (settings.AI_ASSISTANT_ENABLED): it would send the question
and the case context to an external provider. Errors go through the project's
exception handler, so they use the usual ``{success: false, message}`` envelope.
"""
import logging
import uuid

from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from shared.permissions import policy_permission

from apps.simulation.services import audit_service
from apps.simulation.services.ai_providers import DEFAULT_PROVIDER, AIProvider, NotConfigured, provider_class

logger = logging.getLogger(__name__)


class AIAssistantView(APIView):
    permission_classes = [policy_permission("account", "self")]

    def post(self, request):
        # Primero la bandera: apagado, la ruta no distingue peticiones válidas de
        # inválidas ni dice por qué (sin nombres de variables internas).
        if not getattr(settings, "AI_ASSISTANT_ENABLED", False):
            raise NotFound("El asistente no está disponible")

        attempt_id = request.data.get("attempt_id")
        question = (request.data.get("question") or "").strip()
        current_node_id = request.data.get("current_node_id")
        decision_already_taken = self._as_bool(request.data.get("decision_already_taken", False))

        if not attempt_id or not question:
            raise ValidationError("Parámetros incompletos")
        try:
            attempt_id = uuid.UUID(str(attempt_id))
        except ValueError:
            raise ValidationError("El identificador del intento no es válido")

        from apps.simulation.models import SimulationAttempt
        attempt = (
            SimulationAttempt.objects.select_related("case_version__simulation_case")
            .filter(id=attempt_id, student=request.user)
            .first()
        )
        if attempt is None:
            raise NotFound("Intento no encontrado")

        context = self._build_context(attempt, current_node_id, decision_already_taken)
        try:
            response_text = self._call_llm(question, context)
        except NotConfigured:
            # La pista de configuración va al registro del servidor, no al jugador.
            logger.warning("AIAssistant habilitado pero sin clave de proveedor (AI_ASSISTANT_API_KEY)")
            response_text = "El asistente aún no está configurado. Consulta a tu docente."
        except Exception as exc:  # pragma: no cover - external provider
            logger.warning("AIAssistant provider error: %s", exc)
            response_text = "No pude consultar el asistente en este momento. Intenta de nuevo más tarde."

        self._write_audit(request, str(attempt_id), question, current_node_id, decision_already_taken, response_text)
        return Response({"response": response_text})

    @staticmethod
    def _as_bool(value) -> bool:
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "si"}
        return bool(value)

    def _build_context(self, attempt, node_id, decision_taken) -> str:
        try:
            case_title = attempt.case_version.simulation_case.title
        except Exception:
            case_title = "Caso SIEP"

        if decision_taken:
            restriction = (
                "El estudiante ya tomo una decision. Puedes explicar retroalimentacion "
                "conceptual sin dar calificaciones numericas ni etiquetas de respuesta."
            )
        else:
            restriction = (
                "El estudiante NO ha tomado una decision en este punto. No reveles la "
                "respuesta correcta ni indiques que opcion elegir. Orienta con preguntas, "
                "criterios eticos, conceptos de PAP y rutas institucionales."
            )

        return (
            "Eres un asistente pedagogico para estudiantes de psicologia social en SIEP.\n"
            f"Caso actual: {case_title}\n"
            f"Nodo actual: {node_id or 'sin nodo'}\n"
            f"{restriction}\n\n"
            "Mantente dentro del caso actual. Usa lenguaje breve, claro y formativo. "
            "Si falta informacion, sugiere que el estudiante hable con NPCs o use herramientas del caso."
        )

    def create_provider(self) -> AIProvider:
        """Método de fábrica (Factory Method): decide qué proveedor concreto se usa.

        Lee la configuración y devuelve un ``AIProvider``. Una subclase (o una
        prueba) puede sobreescribirlo para usar otro proveedor sin red.
        """
        name = getattr(settings, "AI_ASSISTANT_PROVIDER", DEFAULT_PROVIDER)
        api_key = getattr(settings, "AI_ASSISTANT_API_KEY", "").strip()
        model = getattr(settings, "AI_ASSISTANT_MODEL", "gpt-4o-mini").strip()
        if not api_key:
            raise NotConfigured()
        return provider_class(name)(api_key, model)

    def _call_llm(self, question: str, context: str) -> str:
        return self.create_provider().complete(context, question)

    def _write_audit(self, request, attempt_id, question, node_id, decision_taken, response_text):
        try:
            user = request.user
            actor_id = str(user.id) if getattr(user, "id", None) is not None else None
            actor_role = getattr(user, "role", None) or "STUDENT"
            forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
            ip = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR")
            audit_service.append(
                actor_id=actor_id,
                actor_role=actor_role,
                action="AI_ASSISTANT_QUERY",
                resource_type="SimulationAttempt",
                resource_id=str(attempt_id),
                context={
                    "question": question[:500],
                    "node": node_id,
                    "decision_taken": decision_taken,
                    "response_length": len(response_text or ""),
                },
                ip_address=ip,
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                occurred_at=timezone.now(),
            )
        except Exception as exc:  # pragma: no cover - audit never blocks UX
            logger.warning("AIAssistant audit failed: %s", exc)

