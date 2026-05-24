"""Seed area_fm from the ESRI shapefile bundled with the CompStat dataset.

This must run before any fact-table ETL that resolves area_id by
point-in-polygon. After this runs, area_fm has one row per Força Municipal
subarea, with the polygon stored in `geometria`.

If the shapefile is missing, falls back to seeding area names from CSVs
(no geometry).
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from app.config.settings import Settings
from app.etl.base import (
    bulk_upsert,
    etl_run,
    jsonable,
    safe_str,
    shapefile_dir,
    to_jsonb,
)
from app.etl.geo import read_area_shapes

log = logging.getLogger("compstat.etl.areas_fm")

CAMERAS_CSV = "cameras_areas_fm.csv"
FATORES_CSV = "fatores_urbanos.csv"


def _collect_csv_area_names(data_dir: Path) -> set[str]:
    names: set[str] = set()

    cameras_path = data_dir / CAMERAS_CSV
    if cameras_path.exists():
        df = pd.read_csv(cameras_path, usecols=["nome_area_fm"])
        for value in df["nome_area_fm"].dropna():
            cleaned = safe_str(value)
            if cleaned:
                names.add(cleaned)

    fatores_path = data_dir / FATORES_CSV
    if fatores_path.exists():
        df = pd.read_csv(fatores_path, usecols=["subarea_nome"], low_memory=False)
        for value in df["subarea_nome"].dropna():
            cleaned = safe_str(value)
            if cleaned:
                names.add(cleaned)

    return names


def run(settings: Settings) -> None:
    data_dir = Path(settings.compstat_data_dir)
    shapes = read_area_shapes(shapefile_dir(settings))
    csv_names = _collect_csv_area_names(data_dir)

    with etl_run("areas_fm", str(data_dir), settings=settings) as (conn, result):
        rows: list[tuple[object, ...]] = []

        # 1. areas with polygons from the shapefile (primary source)
        shape_names_seen: set[str] = set()
        for shape in shapes:
            shape_names_seen.add(shape.nome)
            rows.append(
                (
                    shape.nome,
                    shape.wkt_with_srid,
                    to_jsonb(jsonable({"source": "shapefile"})),
                )
            )

        # 2. names that only appear in CSVs (no polygon available)
        for name in sorted(csv_names - shape_names_seen):
            rows.append(
                (
                    name,
                    None,
                    to_jsonb(jsonable({"source": "csv_seed"})),
                )
            )

        result.rows_read = len(rows)
        result.metadados["shapes_loaded"] = len(shapes)
        result.metadados["csv_only_names"] = len(csv_names - shape_names_seen)

        result.rows_inserted = bulk_upsert(
            conn,
            table="area_fm",
            columns=("nome", "geometria", "metadados"),
            rows=rows,
            conflict_target="nome",
            update_columns=("geometria",),
            raw_columns={"geometria": "ST_GeographyFromText(%s)"},
        )
