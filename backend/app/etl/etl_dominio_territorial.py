"""ETL: dominio_territorial - Extração 1.csv -> dominio_territorial."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import pandas as pd

from app.config.settings import Settings
from app.etl.base import (
    bulk_insert,
    etl_run,
    jsonable,
    map_dominio_orcrim,
    safe_str,
    to_jsonb,
)

log = logging.getLogger("compstat.etl.dominio_territorial")

CSV_GLOB = "outros dados/dominio_territorial*.csv"


def _find_csv(data_dir: Path) -> Path:
    matches = sorted(data_dir.glob(CSV_GLOB))
    if not matches:
        raise FileNotFoundError(f"No file matching {CSV_GLOB} in {data_dir}")
    return matches[0]


def run(settings: Settings) -> None:
    path = _find_csv(Path(settings.compstat_data_dir))
    df = pd.read_csv(path)

    with etl_run("dominio_territorial", str(path), settings=settings) as (conn, result):
        rows: list[tuple[Any, ...]] = []
        skipped = 0
        for record in df.to_dict(orient="records"):
            grupo = map_dominio_orcrim(record.get("dominio_orcrim"))
            nome = safe_str(record.get("nome_territorio"))
            wkt = safe_str(record.get("geometria"))
            if not (grupo and nome and wkt):
                skipped += 1
                continue
            metadados = {
                "raw_dominio_orcrim": safe_str(record.get("dominio_orcrim")),
            }
            rows.append(
                (
                    grupo,
                    nome,
                    f"SRID=4326;{wkt}",
                    to_jsonb(jsonable(metadados)),
                )
            )

        result.rows_read = len(df)
        result.rows_skipped = skipped

        # Source has legitimate duplicates of (grupo, nome) for non-contiguous
        # territories. There's no natural unique key here, so re-runs wipe
        # and reinsert to stay idempotent. Cheap: ~1.6k rows.
        with conn.cursor() as cur:
            cur.execute("truncate table dominio_territorial restart identity cascade")

        result.rows_inserted = bulk_insert(
            conn,
            table="dominio_territorial",
            columns=("grupo_dominio", "nome_territorio", "geometria", "metadados"),
            rows=rows,
            raw_columns={"geometria": "ST_GeographyFromText(%s)"},
        )
