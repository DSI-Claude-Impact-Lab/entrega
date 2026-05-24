from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config.settings import Settings, get_settings
from app.service.claude_service import ClaudeService

router = APIRouter(prefix="/claude", tags=["claude"])


class ClaudeInferRequest(BaseModel):
    prompt: str
    system: str | None = None
    max_tokens: int = 800
    temperature: float = 0.2


@router.post("/infer")
async def claude_infer(
    body: ClaudeInferRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return await ClaudeService(settings).infer(
        prompt=body.prompt,
        system=body.system,
        max_tokens=body.max_tokens,
        temperature=body.temperature,
    )
