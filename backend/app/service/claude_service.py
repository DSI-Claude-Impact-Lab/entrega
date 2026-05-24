from typing import Any

from app.config.settings import Settings
from app.integrations.claude_client import ClaudeClient


class ClaudeService:
    def __init__(self, settings: Settings) -> None:
        self._client = ClaudeClient(settings.anthropic_api_key, settings.claude_model)

    async def infer(
        self,
        *,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 800,
        temperature: float = 0.2,
    ) -> dict[str, Any]:
        result = await self._client.infer(
            prompt=prompt,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return {"status": "ok", **result}
