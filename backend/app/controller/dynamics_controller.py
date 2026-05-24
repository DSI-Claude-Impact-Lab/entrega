from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config.settings import Settings, get_settings
from app.service.criminal_dynamics_service import (
    CriminalDynamicsExtraction,
    CriminalDynamicsService,
    DynamicsExtractionInput,
    get_taxonomy,
)

router = APIRouter(prefix="/dynamics", tags=["criminal-dynamics"])


class DynamicsExtractionResponse(BaseModel):
    status: Literal["ok"]
    extraction: CriminalDynamicsExtraction


@router.get("/taxonomy")
async def dynamics_taxonomy() -> dict[str, list[str]]:
    return get_taxonomy()


@router.post("/extract")
async def extract_dynamics(
    body: DynamicsExtractionInput,
    settings: Annotated[Settings, Depends(get_settings)],
) -> DynamicsExtractionResponse:
    extraction = await CriminalDynamicsService(settings).extract(body)
    return DynamicsExtractionResponse(status="ok", extraction=extraction)
