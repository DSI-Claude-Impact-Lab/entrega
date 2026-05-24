"""Geo endpoints — cameras, orcrim domains, occurrence heatmap.

Backed by Supabase Postgres (PostGIS). All filtering and binning is done
in SQL — the app never streams 100k+ rows back. Endpoints are public:
they serve aggregated reference data, not user-specific output.
"""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.service.geo_service import GeoService

router = APIRouter(prefix="/geo", tags=["geo"])


class CameraOut(BaseModel):
    id: str
    area: str
    lat: float
    lng: float


class CameraListOut(BaseModel):
    count: int
    items: list[CameraOut]


class UrbanFactorOut(BaseModel):
    id: str
    type: str
    agency: str
    occurrence_type: str
    description: str
    street: str
    neighborhood: str
    lat: float
    lng: float


class UrbanFactorListOut(BaseModel):
    count: int
    items: list[UrbanFactorOut]


class FacilitatorOut(BaseModel):
    id: str
    urban_factor_id: str | None = None
    type: str = ""
    agency: str = ""
    description: str = ""
    evidence: str = ""
    confidence: str = ""
    street: str = ""
    neighborhood: str = ""
    lat: float
    lng: float


class FacilitatorListOut(BaseModel):
    count: int
    items: list[FacilitatorOut]


class OrcrimOut(BaseModel):
    name: str
    faction: str
    ring: list[list[float]]  # [[lat, lng], ...]


class OrcrimListOut(BaseModel):
    count: int
    items: list[OrcrimOut]


class HeatPoint(BaseModel):
    lat: float
    lng: float
    weight: int


class HeatOut(BaseModel):
    count: int
    sampled: int
    items: list[HeatPoint]


class RouteWaypointOut(BaseModel):
    id: str
    lat: float
    lng: float
    crime_type: str
    date: str | None = None
    street: str
    progress: float
    distance_m: float


class RouteWaypointListOut(BaseModel):
    count: int
    items: list[RouteWaypointOut]


class AreaFMOut(BaseModel):
    id: str
    name: str
    n_ocorrencias: int
    score: float
    ring: list[list[float]]


class AreaFMListOut(BaseModel):
    count: int
    items: list[AreaFMOut]


class AreaMonth(BaseModel):
    ano: int
    mes: int
    n: int


class AreaHourBucket(BaseModel):
    hour: int
    n: int


class AreaTopDelito(BaseModel):
    delito: str
    n: int


class AreaTopLogradouro(BaseModel):
    logradouro: str
    n: int


class AreaFatorRanking(BaseModel):
    orgao: str
    tipo: str
    n: int


class AreaBingo(BaseModel):
    logradouro: str
    orgao: str
    fator: str
    ocorrencias: int
    n_fatores: int


class AreaReportOut(BaseModel):
    id: str
    name: str
    total_ocorrencias: int
    last_month: AreaMonth | None = None
    previous_month: AreaMonth | None = None
    delta_pct: float | None = None
    peak_hour: int | None = None
    peak_hour_n: int | None = None
    dia_pico: str | None = None
    n_fatores_total: int = 0
    monthly_series: list[AreaMonth] = []
    hour_distribution: list[AreaHourBucket] = []
    top_delitos: list[AreaTopDelito] = []
    top_logradouros: list[AreaTopLogradouro] = []
    fatores_ranking: list[AreaFatorRanking] = []
    bingos: list[AreaBingo] = []
    dinamica: str = ""


@router.get("/cameras", response_model=CameraListOut)
def get_cameras(
    settings: Annotated[Settings, Depends(get_settings)],
) -> CameraListOut:
    rows = GeoService(settings).list_cameras()
    return CameraListOut(
        count=len(rows),
        items=[CameraOut(**row) for row in rows],
    )


@router.get("/urban-factors", response_model=UrbanFactorListOut)
def get_urban_factors(
    settings: Annotated[Settings, Depends(get_settings)],
    limit: Annotated[int, Query(ge=100, le=5000)] = 3000,
) -> UrbanFactorListOut:
    rows = GeoService(settings).list_urban_factors(limit=limit)
    return UrbanFactorListOut(
        count=len(rows),
        items=[UrbanFactorOut(**row) for row in rows],
    )


@router.get("/facilitators", response_model=FacilitatorListOut)
def get_facilitators(
    settings: Annotated[Settings, Depends(get_settings)],
    limit: Annotated[int, Query(ge=100, le=5000)] = 3000,
) -> FacilitatorListOut:
    rows = GeoService(settings).list_facilitators(limit=limit)
    return FacilitatorListOut(
        count=len(rows),
        items=[FacilitatorOut(**row) for row in rows],
    )


@router.get("/orcrim", response_model=OrcrimListOut)
def get_orcrim(
    settings: Annotated[Settings, Depends(get_settings)],
    faction: Annotated[
        str | None,
        Query(description="Filter by faction (CV, Milicia, TCP, ADA)"),
    ] = None,
) -> OrcrimListOut:
    rows = GeoService(settings).list_orcrim_polygons(faction)
    return OrcrimListOut(count=len(rows), items=[OrcrimOut(**row) for row in rows])


@router.get("/heat", response_model=HeatOut)
def get_heat(
    settings: Annotated[Settings, Depends(get_settings)],
    year: Annotated[int | None, Query(ge=2018, le=2030)] = None,
    delito: Annotated[
        Literal["transeunte", "celular", "coletivo", "all"] | None, Query()
    ] = "all",
    hour_min: Annotated[
        int | None,
        Query(ge=0, le=23, description="Lower bound (inclusive) for hora_fato 0-23."),
    ] = None,
    hour_max: Annotated[
        int | None,
        Query(ge=0, le=23, description="Upper bound (inclusive) for hora_fato 0-23."),
    ] = None,
    max_points: Annotated[int, Query(ge=100, le=20000)] = 8000,
    bin_precision: Annotated[
        int,
        Query(
            ge=2,
            le=4,
            description="Lat/lng decimal places used for binning (3 ≈ 111m).",
        ),
    ] = 3,
) -> HeatOut:
    """Aggregated weighted points for a Google Maps heatmap layer.

    Binning and counting run server-side via PostGIS, so the response
    stays small (<= max_points) even with 100k+ underlying occurrences.
    `weight` is the number of incidents in each lat/lng bin.

    Hour filter is inclusive on both bounds. Pass only `hour_min` (or
    only `hour_max`) to filter a single hour. Rows with NULL hora_fato
    (~0.02%) are excluded when any hour bound is set.
    """
    result = GeoService(settings).heatmap(
        year=year,
        delito=delito,
        hour_min=hour_min,
        hour_max=hour_max,
        max_points=max_points,
        bin_precision=bin_precision,
    )
    return HeatOut(**result)


@router.get("/route-waypoints", response_model=RouteWaypointListOut)
def get_route_waypoints(
    settings: Annotated[Settings, Depends(get_settings)],
    start_lat: Annotated[float, Query(ge=-90, le=90)],
    start_lng: Annotated[float, Query(ge=-180, le=180)],
    end_lat: Annotated[float, Query(ge=-90, le=90)],
    end_lng: Annotated[float, Query(ge=-180, le=180)],
    limit: Annotated[int, Query(ge=0, le=12)] = 8,
    corridor_m: Annotated[int, Query(ge=100, le=1500)] = 300,
) -> RouteWaypointListOut:
    result = GeoService(settings).route_waypoints(
        start_lat=start_lat,
        start_lng=start_lng,
        end_lat=end_lat,
        end_lng=end_lng,
        limit=limit,
        corridor_m=corridor_m,
    )
    return RouteWaypointListOut(**result)


@router.get("/denuncias/heat", response_model=HeatOut)
def get_denuncias_heat(
    settings: Annotated[Settings, Depends(get_settings)],
    hour_min: Annotated[
        int | None,
        Query(ge=0, le=23, description="Lower bound (inclusive) for hour of data_denuncia."),
    ] = None,
    hour_max: Annotated[
        int | None,
        Query(ge=0, le=23, description="Upper bound (inclusive) for hour of data_denuncia."),
    ] = None,
    max_points: Annotated[int, Query(ge=100, le=20000)] = 8000,
    bin_precision: Annotated[int, Query(ge=2, le=4)] = 3,
) -> HeatOut:
    result = GeoService(settings).denuncia_heatmap(
        hour_min=hour_min,
        hour_max=hour_max,
        max_points=max_points,
        bin_precision=bin_precision,
    )
    return HeatOut(**result)


@router.get("/areas-fm", response_model=AreaFMListOut)
def get_areas_fm(
    settings: Annotated[Settings, Depends(get_settings)],
) -> AreaFMListOut:
    rows = GeoService(settings).list_areas_fm()
    return AreaFMListOut(count=len(rows), items=[AreaFMOut(**row) for row in rows])


@router.get("/areas-fm/{area_id}/report", response_model=AreaReportOut)
def get_area_fm_report(
    area_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
) -> AreaReportOut:
    data = GeoService(settings).area_fm_report(area_id)
    if not data:
        raise HTTPException(status_code=404, detail="area_fm not found")
    return AreaReportOut(**data)


@router.get("/health")
def geo_health(
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, object]:
    try:
        counts = GeoService(settings).health()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"db unavailable: {exc}") from exc
    return {
        "cameras": int(counts["cameras"]),
        "orcrim": int(counts["orcrim"]),
        "occurrences": int(counts["occurrences"]),
        "urban_factors": int(counts["urban_factors"]),
        "denuncias": int(counts["denuncias"]),
        "facilitators": int(counts["facilitators"]),
    }
