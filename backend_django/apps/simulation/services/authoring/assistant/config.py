"""Configuración del asistente de autoría, leída de ``django.conf.settings`` (``AI_AUTHORING_*``)."""
from dataclasses import dataclass

from django.conf import settings

from apps.simulation.services.ai_providers import PROVIDERS


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
    # Generación del caso por etapas (C1). Los valores por defecto son los que dejó la medición real de la tarea 1.
    model_generate: str = "claude-fable-5-2"
    generate_timeout_seconds: int = 100
    generations_per_day: int = 5
    generation_max_calls: int = 20
    generate_max_tokens: int = 16000
    generate_effort_skeleton: str = "high"
    generate_effort_scene: str = "medium"
    generate_fallbacks: str = "default"
    generations_global_per_day: int = 30

    @property
    def generation_ready(self) -> bool:
        """Encendida, con un proveedor que sabe generar por etapas y con qué llamar (clave, o el falso, que no usa ninguna)."""
        provider = (self.provider or "").strip().lower()
        if not self.enabled or not hasattr(PROVIDERS.get(provider), "complete_structured"):
            return False
        return bool(self.api_key or provider == "fake")

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
        model_generate=getattr(settings, "AI_AUTHORING_MODEL_GENERATE", "claude-fable-5-2"),
        generate_timeout_seconds=int(getattr(settings, "AI_AUTHORING_GENERATE_TIMEOUT_SECONDS", 100)),
        generations_per_day=int(getattr(settings, "AI_AUTHORING_GENERATIONS_PER_DAY", 5)),
        generation_max_calls=int(getattr(settings, "AI_AUTHORING_GENERATION_MAX_CALLS", 20)),
        generate_max_tokens=int(getattr(settings, "AI_AUTHORING_GENERATE_MAX_TOKENS", 16000)),
        generate_effort_skeleton=getattr(settings, "AI_AUTHORING_GENERATE_EFFORT_SKELETON", "high"),
        generate_effort_scene=getattr(settings, "AI_AUTHORING_GENERATE_EFFORT_SCENE", "medium"),
        generate_fallbacks=getattr(settings, "AI_AUTHORING_GENERATE_FALLBACKS", "default"),
        generations_global_per_day=int(getattr(settings, "AI_AUTHORING_GENERATIONS_GLOBAL_PER_DAY", 30)),
    )
