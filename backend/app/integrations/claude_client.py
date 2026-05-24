from typing import Any

from anthropic import APIError, APITimeoutError, AsyncAnthropic
from fastapi import HTTPException, status


class ClaudeClient:
    def __init__(self, api_key: str | None, model: str) -> None:
        self.api_key = api_key
        self.model = model

    def _client(self) -> AsyncAnthropic:
        if not self.api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Anthropic API key is not configured",
            )
        return AsyncAnthropic(api_key=self.api_key, timeout=120)

    async def infer(
        self,
        *,
        prompt: str,
        system: str | None = None,
        max_tokens: int = 800,
        temperature: float = 0.2,
    ) -> dict[str, Any]:
        try:
            response = await self._client().messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system or "You are a concise public-sector decision-support assistant.",
                messages=[{"role": "user", "content": prompt}],
            )
        except APITimeoutError as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Claude request timed out",
            ) from exc
        except APIError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Claude request failed",
            ) from exc

        text = "\n".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        return {
            "model": response.model,
            "text": text,
            "usage": response.usage.model_dump() if response.usage else None,
        }

    async def chat(
        self,
        *,
        messages: list[dict[str, str]],
        system: str,
        max_tokens: int = 900,
        temperature: float = 0.2,
    ) -> dict[str, Any]:
        try:
            response = await self._client().messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=messages,
            )
        except APITimeoutError as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Claude request timed out",
            ) from exc
        except APIError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Claude request failed",
            ) from exc

        text = "\n".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        return {
            "model": response.model,
            "text": text,
            "usage": response.usage.model_dump() if response.usage else None,
        }
