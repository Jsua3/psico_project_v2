"""RF-027 — Contextual AI Assistant view.

Restricciones críticas:
- NO revelar respuestas correctas antes de que el estudiante haya tomado una decisión.
- Mantenerse en el scope del caso actual.
- Registrar todas las interacciones en audit_logs via audit_service.append().
"""
import json
import logging

from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.simulation.services import audit_service

logger = logging.getLogger(__name__)

_AUDIT_RETENTION_DAYS = 360


class AIAssistantView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        attempt_id = request.data.get('attempt_id')
        question = request.data.get('question', '').strip()
        current_node_id = request.data.get('current_node_id')
        decision_already_taken = request.data.get('decision_already_taken', False)

        if not question or not attempt_id:
            return Response({'error': 'Parámetros incompletos'}, status=400)

        try:
            from apps.simulation.models import SimulationAttempt
            attempt = SimulationAttempt.objects.select_related(
                'case_version__simulation_case'
            ).get(id=attempt_id, student=request.user)
        except Exception as exc:
            logger.warning('AIAssistant: attempt not found: %s', exc)
            return Response({'error': 'Intento no encontrado'}, status=404)

        case_context = self._build_context(attempt, current_node_id, decision_already_taken)

        try:
            response_text = self._call_llm(question, case_context)
        except NotImplementedError:
            response_text = (
                'El asistente de IA no está configurado en este entorno. '
                'Configure AI_ASSISTANT_PROVIDER en las variables de entorno.'
            )
        except Exception as exc:
            logger.error('AIAssistant LLM error: %s', exc)
            response_text = 'Error al consultar el asistente. Intente más tarde.'

        # Registrar en audit_logs (nunca interrumpe la respuesta)
        self._write_audit(request, attempt_id, question, current_node_id, decision_already_taken, response_text)

        return Response({'response': response_text})

    # ------------------------------------------------------------------
    # Context builder
    # ------------------------------------------------------------------

    def _build_context(self, attempt, node_id, decision_taken):
        """Construye el context prompt sin revelar opciones correctas antes de decidir."""
        case_title = ''
        try:
            case_title = attempt.case_version.simulation_case.title
        except Exception:
            case_title = 'Caso desconocido'

        restriction = (
            'Puedes mencionar el resultado de la decisión tomada.'
            if decision_taken
            else (
                'NO puedes revelar qué decisión es la más adecuada. '
                'Solo puedes orientar conceptualmente sobre teoría psicosocial.'
            )
        )

        return (
            f'Eres un asistente de apoyo para estudiantes de psicología social en el simulador SIEP.\n'
            f'Caso actual: {case_title}\n'
            f'Nodo actual: {node_id}\n'
            f'Estado: el estudiante {"ya tomó" if decision_taken else "NO ha tomado aún"} '
            f'una decisión en este nodo.\n\n'
            f'{restriction}\n\n'
            f'Responde SOLO sobre el contenido del caso actual. '
            f'No respondas preguntas fuera del scope del caso.'
        )

    # ------------------------------------------------------------------
    # LLM caller — soporta openai y anthropic
    # ------------------------------------------------------------------

    def _call_llm(self, question: str, context: str) -> str:
        provider = getattr(settings, 'AI_ASSISTANT_PROVIDER', 'openai').lower()
        api_key = getattr(settings, 'AI_ASSISTANT_API_KEY', '')
        model = getattr(settings, 'AI_ASSISTANT_MODEL', 'gpt-4o-mini')

        if not api_key:
            raise NotImplementedError('AI_ASSISTANT_API_KEY no configurado')

        if provider == 'anthropic':
            import anthropic  # optional dependency
            client = anthropic.Anthropic(api_key=api_key)
            message = client.messages.create(
                model=model,
                max_tokens=512,
                system=context,
                messages=[{'role': 'user', 'content': question}],
            )
            return message.content[0].text

        # Default: openai-compatible
        import openai  # optional dependency
        client = openai.OpenAI(api_key=api_key)
        completion = client.chat.completions.create(
            model=model,
            max_tokens=512,
            messages=[
                {'role': 'system', 'content': context},
                {'role': 'user', 'content': question},
            ],
        )
        return completion.choices[0].message.content or ''

    # ------------------------------------------------------------------
    # Audit
    # ------------------------------------------------------------------

    def _write_audit(self, request, attempt_id, question, node_id, decision_taken, response_text):
        try:
            user = request.user
            actor_id = str(user.id) if getattr(user, 'id', None) is not None else None
            actor_role = getattr(user, 'role', None) or 'STUDENT'
            forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
            ip = forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')
            user_agent = request.META.get('HTTP_USER_AGENT', '')
            ctx = {
                'question': question[:500],
                'node': node_id,
                'decision_taken': decision_taken,
                'response_length': len(response_text),
            }
            now = timezone.now()
            audit_service.append(
                actor_id=actor_id,
                actor_role=actor_role,
                action='AI_ASSISTANT_QUERY',
                resource_type='SimulationAttempt',
                resource_id=str(attempt_id),
                context=ctx,
                ip_address=ip,
                user_agent=user_agent,
                occurred_at=now,
            )
        except Exception as exc:
            logger.warning('AIAssistant: audit log failed: %s', exc)
