import pytest

from app.controller.system_controller import health
from app.integrations.claude_client import ClaudeClient
from app.service.chat_service import ChatRequest, ChatService


@pytest.mark.anyio
async def test_health() -> None:
    assert await health() == {"status": "ok"}


@pytest.mark.anyio
async def test_chat(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_chat(self: ClaudeClient, **kwargs: object) -> dict[str, object]:
        assert kwargs["messages"] == [{"role": "user", "content": "O que devo priorizar?"}]
        assert "Application context" in kwargs["system"]
        return {"model": "test-model", "text": "Priorize a area com maior risco.", "usage": None}

    monkeypatch.setattr(ClaudeClient, "chat", fake_chat)

    from app.config.settings import Settings

    body = ChatRequest.model_validate(
        {
            "messages": [{"role": "user", "content": "O que devo priorizar?"}],
            "context": {"area": "Centro", "risk_score": 87},
        }
    )
    result = await ChatService(Settings(anthropic_api_key="test")).chat(body)
    assert result["text"] == "Priorize a area com maior risco."
