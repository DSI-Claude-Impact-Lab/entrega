"""ETL: CPSR_2020_2022_2024.xlsx -> censo_psr.

The Excel sheet has 160+ columns of demographic data — only a handful map
to dedicated table columns; the rest is preserved verbatim in metadados.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import pandas as pd

from app.config.settings import Settings
from app.etl.base import (
    bulk_upsert,
    etl_run,
    jsonable,
    load_area_index_full,
    point_wkt,
    safe_float,
    safe_int,
    safe_str,
    to_jsonb,
)

log = logging.getLogger("compstat.etl.censo_psr")

XLSX_NAME = "outros dados/CPSR_2020_2022_2024.xlsx"

CORE_COLUMNS = {
    "Chave_única",
    "Latitude",
    "Longitude",
    "Ano",
}


def run(settings: Settings) -> None:
    path = Path(settings.compstat_data_dir) / XLSX_NAME
    xl = pd.ExcelFile(path)
    df = xl.parse(xl.sheet_names[0])

    extra_cols = [c for c in df.columns if c not in CORE_COLUMNS]

    with etl_run("censo_psr", str(path), settings=settings) as (conn, result):
        area_index = load_area_index_full(conn, settings)
        rows: list[tuple[Any, ...]] = []
        seen: set[str] = set()
        skipped = 0
        duplicates = 0
        with_area = 0
        for record in df.to_dict(orient="records"):
            chave = safe_str(record.get("Chave_única"))
            if not chave:
                skipped += 1
                continue
            if chave in seen:
                duplicates += 1
                continue
            seen.add(chave)

            lon = safe_float(record.get("Longitude"))
            lat = safe_float(record.get("Latitude"))
            point = (lon, lat) if lon is not None and lat is not None else None
            area_id = area_index.resolve_id(point=point)
            if area_id:
                with_area += 1
            ano = safe_int(record.get("Ano"))
            metadados = {col: record.get(col) for col in extra_cols}
            rows.append(
                (
                    chave,
                    area_id,
                    ano,
                    point_wkt(lon, lat),
                    to_jsonb(jsonable(metadados)),
                )
            )

        result.rows_read = len(df)
        result.rows_skipped = skipped
        result.metadados["duplicates_in_source"] = duplicates
        result.metadados["extra_columns"] = len(extra_cols)
        result.metadados["rows_with_area"] = with_area
        result.rows_inserted = bulk_upsert(
            conn,
            table="censo_psr",
            columns=("chave_origem", "area_id", "ano_censo", "geometria", "metadados"),
            rows=rows,
            conflict_target="chave_origem",
            update_columns=("area_id", "ano_censo", "geometria", "metadados"),
            raw_columns={"geometria": "ST_GeographyFromText(%s)"},
            batch_size=2000,
        )
