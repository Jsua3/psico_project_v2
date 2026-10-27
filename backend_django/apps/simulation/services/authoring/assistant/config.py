"""Configuración del asistente de autoría, leída de ``django.conf.settings`` (``AI_AUTHORING_*``)."""
from dataclasses import dataclass

from django.conf import settings


@dataclass(frozen=True)
class AuthoringAssistantConfig:
    enabled: bool
    provider: str
    api_key: str
    model_fast: str
    model_capable: str
    daily_limit: int
    monthly_limit: int
    timeout_seconds: int = 60
    max_tokens_propose: int = 8000

    def __repr__(self) -> str:
        """Igual que el repr de un dataclass, pero con la clave enmascarada: nunca se imprime."""
        campos = ", ".join(
            f"{name}={'***' if name == 'api_key' and self.api_key else getattr(self, name)!r}"
            for name in self.__dataclass_fields__
        )
        return f"AuthoringAssistantConfig({campos})"

    __str__ = __repr__


def current() -> AuthoringAssistantConfig:
    """La configuración vigente; se lee en cada llamada para que ``override_settings`` funcione."""
    return AuthoringAssistantConfig(
        enabled=bool(getattr(settings, "AI_AUTHORING_ENABLED", False)),
        provider=getattr(settings, "AI_AUTHORING_PROVIDER", "anthropic"),
        api_key=getattr(settings, "AI_AUTHORING_API_KEY", ""),
        model_fast=getattr(settings, "AI_AUTHORING_MODEL_FAST", "claude-haiku-5-5"),
        model_capable=getattr(settings, "AI_AUTHORING_MODEL_CAPABLE", "claude-opus-5-5"),
        daily_limit=int(getattr(settings, "AI_AUTHORING_DAILY_LIMIT_PER_USER", 200)),
        monthly_limit=int(getattr(settings, "AI_AUTHORING_MONTHLY_LIMIT", 3000)),
        timeout_seconds=int(getattr(settings, "AI_AUTHORING_TIMEOUT_SECONDS", 60)),
        max_tokens_propose=int(getattr(settings, "AI_AUTHORING_MAX_TOKENS_PROPOSE", 8000)),
    )
