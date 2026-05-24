from typing import Annotated

from fastapi import APIRouter, Depends

from app.config.settings import Settings, get_settings

router = APIRouter(tags=["system"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/config-check")
async def config_check(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, bool]:
    return {
        "supabase_url": bool(settings.supabase_url),
        "supabase_secret_key": bool(settings.supabase_secret_key),
        "replicate_api_token": bool(settings.replicate_api_token),
        "glm_ocr_model_version": bool(settings.glm_ocr_model_version),
        "anthropic_api_key": bool(settings.anthropic_api_key),
        "claude_model": bool(settings.claude_model),
    }
