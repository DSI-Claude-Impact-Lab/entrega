import json
from typing import Any, Literal

from pydantic import BaseModel

from app.config.settings import Settings
from app.integrations.claude_client import ClaudeClient

DEFAULT_CHAT_SYSTEM = (
    "You are a concise public-sector decision-support assistant for the CompStat Rio "
    "application. Answer in Portuguese by default. Use only the provided application "
    "context and the conversation. If the user asks for data that is not present, say "
    "what is missing and suggest the next useful query or analysis. Keep recommendations "
    "grounded, auditable, and practical for municipal managers."
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context: dict[str, Any] | list[Any] | str | None = None
    system: str | None = None
    max_tokens: int = 900
    temperature: float = 0.2


def build_chat_system_prompt(body: ChatRequest) -> str:
    base = body.system or DEFAULT_CHAT_SYSTEM
    if body.context is None:
        return base
    if isinstance(body.context, str):
        context_text = body.context
    else:
        context_text = json.dumps(body.context, ensure_ascii=False, indent=2)
    return f"{base}\n\nApplication context:\n{context_text}"


class ChatService:
    def __init__(self, settings: Settings) -> None:
        self._client = ClaudeClient(settings.anthropic_api_key, settings.claude_model)

    async def chat(self, body: ChatRequest) -> dict[str, Any]:
        result = await self._client.chat(
            messages=[message.model_dump() for message in body.messages],
            system=build_chat_system_prompt(body),
            max_tokens=body.max_tokens,
            temperature=body.temperature,
        )
        return {"status": "ok", **result}
