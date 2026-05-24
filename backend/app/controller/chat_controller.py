from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.config.settings import Settings, get_settings
from app.service.chat_service import ChatRequest, ChatService

router = APIRouter(tags=["chat"])


@router.post("/chat")
async def chat(
    body: ChatRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return await ChatService(settings).chat(body)
