"""ETL: cameras_areas_fm.csv -> camera + area_fm link."""

from __future__ import annotations

import logging
import re
from pathlib import Path

import pandas as pd

from app.config.settings import Settings
from app.etl.base import (
    bulk_upsert,
    etl_run,
    jsonable,
    load_area_index,
    resolve_area_id,
    safe_str,
    to_jsonb,
)

log = logging.getLogger("compstat.etl.cameras")

CSV_NAME = "cameras_areas_fm.csv"

_POINT_RE = re.compile(r"POINT\s*\(\s*(-?\d+\.\d+)\s+(-?\d+\.\d+)\s*\)", flags=re.IGNORECASE)


def _wkt_from_geometry_cell(value: object) -> str | None:
    text = safe_str(value)
    if not text:
        return None
    match = _POINT_RE.search(text)
    if not match:
        return None
    lon, lat = match.group(1), match.group(2)
    return f"SRID=4326;POINT({lon} {lat})"


def run(settings: Settings) -> None:
    path = Path(settings.compstat_data_dir) / CSV_NAME
    df = pd.read_csv(path)

    with etl_run("cameras", str(path), settings=settings) as (conn, result):
        area_index = load_area_index(conn)

        rows: list[tuple[object, ...]] = []
        skipped = 0
        for record in df.to_dict(orient="records"):
            camera_id = safe_str(record.get("id_ponto"))
            if not camera_id:
                skipped += 1
                continue
            geometria = _wkt_from_geometry_cell(record.get("geometry"))
            area_id = resolve_area_id(area_index, record.get("nome_area_fm"))
            metadados = {
                "nome_area_fm": safe_str(record.get("nome_area_fm")),
            }
            rows.append(
                (
                    camera_id,
                    area_id,
                    safe_str(record.get("id_trecho")),
                    geometria,
                    to_jsonb(jsonable(metadados)),
                )
            )

        result.rows_read = len(df)
        result.rows_skipped = skipped
        result.rows_inserted = bulk_upsert(
            conn,
            table="camera",
            columns=("id", "area_id", "id_trecho", "geometria", "metadados"),
            rows=rows,
            conflict_target="id",
            update_columns=("area_id", "id_trecho", "geometria", "metadados"),
            raw_columns={"geometria": "ST_GeographyFromText(%s)"},
        )
        result.metadados["areas_matched"] = sum(1 for r in rows if r[1] is not None)
