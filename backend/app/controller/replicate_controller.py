from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, HttpUrl

from app.config.settings import Settings, get_settings
from app.service.replicate_service import ReplicateService

router = APIRouter(tags=["replicate"])


class ReplicatePredictionRequest(BaseModel):
    version: str
    input: dict[str, Any]
    wait_seconds: int | None = 30


class GlmOcrRequest(BaseModel):
    image: HttpUrl
    task: Literal["text", "formula", "table", "json"] = "text"
    custom_prompt: str = ""
    max_new_tokens: int = 4096


class SegmentRequest(BaseModel):
    image_url: HttpUrl
    prompt: str | None = None
    points: list[list[float]] | None = None
    boxes: list[list[float]] | None = None


@router.get("/replicate/account")
async def replicate_account(
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return await ReplicateService(settings).account_summary()


@router.post("/replicate/predictions")
async def replicate_prediction(
    body: ReplicatePredictionRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return await ReplicateService(settings).create_prediction(
        version=body.version,
        input_payload=body.input,
        wait_seconds=body.wait_seconds,
    )


@router.post("/ocr/glm")
async def glm_ocr(
    body: GlmOcrRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return await ReplicateService(settings).glm_ocr(
        image_url=str(body.image),
        task=body.task,
        custom_prompt=body.custom_prompt,
        max_new_tokens=body.max_new_tokens,
    )


@router.post("/segment")
async def segment_image(
    body: SegmentRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return await ReplicateService(settings).segment(
        body.model_dump(mode="json", exclude_none=True),
    )
