"""ETL: df_ocorrencias_tratado.csv -> ocorrencia_criminal.

Source has ~115k rows. The CSV file name has accents and spaces, so we
look up by glob.
"""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

import pandas as pd

from app.config.settings import Settings
from app.etl.base import (
    bulk_upsert,
    etl_run,
    jsonable,
    load_area_index_full,
    map_tipo_crime,
    point_wkt,
    safe_float,
    safe_int,
    safe_str,
    to_jsonb,
)

log = logging.getLogger("compstat.etl.ocorrencias")

CSV_GLOB = "df_ocorrencias*.csv"


def _find_csv(data_dir: Path) -> Path:
    matches = sorted(data_dir.glob(CSV_GLOB))
    if not matches:
        raise FileNotFoundError(f"No file matching {CSV_GLOB} in {data_dir}")
    return matches[0]


def _parse_data_fato(value: object) -> date | None:
    text = safe_str(value)
    if not text:
        return None
    try:
        parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
    except (ValueError, TypeError):
        return None
    if pd.isna(parsed):
        return None
    return parsed.date()


def _parse_hora(value: object) -> int | None:
    # CSV stores hora as "HH:MM:SS" (e.g. "20:00:00") or sometimes as int.
    hora = safe_int(value)
    if hora is None:
        text = safe_str(value)
        if text and ":" in text:
            try:
                hora = int(text.split(":", 1)[0])
            except ValueError:
                return None
    if hora is None:
        return None
    if 0 <= hora <= 23:
        return hora
    return None


def run(settings: Settings) -> None:
    path = _find_csv(Path(settings.compstat_data_dir))
    df = pd.read_csv(path, low_memory=False)

    with etl_run("ocorrencias", str(path), settings=settings) as (conn, result):
        area_index = load_area_index_full(conn, settings)
        rows: list[tuple[object, ...]] = []
        skipped = 0
        with_area = 0
        for record in df.to_dict(orient="records"):
            id_hash = safe_str(record.get("id_criptografado"))
            if not id_hash:
                skipped += 1
                continue
            tipo_crime = map_tipo_crime(record.get("desc_delito"), record.get("delito"))
            lon = safe_float(record.get("longitude"))
            lat = safe_float(record.get("latitude"))
            point = (lon, lat) if lon is not None and lat is not None else None
            area_id = area_index.resolve_id(point=point)
            if area_id:
                with_area += 1
            metadados = {
                "aisp": safe_str(record.get("aisp")),
                "risp": safe_str(record.get("risp")),
                "locf": safe_str(record.get("locf")),
                "dia_semana": safe_str(record.get("dia_semana")),
                "delito_codigo": safe_int(record.get("delito")),
            }
            rows.append(
                (
                    id_hash,
                    area_id,
                    safe_int(record.get("ano")),
                    safe_int(record.get("mes")),
                    tipo_crime,
                    safe_str(record.get("desc_delito")),
                    _parse_data_fato(record.get("data")),
                    _parse_hora(record.get("hora")),
                    point_wkt(lon, lat),
                    to_jsonb(jsonable(metadados)),
                )
            )

        result.rows_read = len(df)
        result.rows_skipped = skipped
        result.metadados["rows_with_area"] = with_area
        result.rows_inserted = bulk_upsert(
            conn,
            table="ocorrencia_criminal",
            columns=(
                "id_hash",
                "area_id",
                "ano",
                "mes",
                "tipo_crime",
                "descricao_delito",
                "data_fato",
                "hora_fato",
                "geometria",
                "metadados",
            ),
            rows=rows,
            conflict_target="id_hash",
            update_columns=(
                "area_id",
                "ano",
                "mes",
                "tipo_crime",
                "descricao_delito",
                "data_fato",
                "hora_fato",
                "geometria",
                "metadados",
            ),
            raw_columns={"geometria": "ST_GeographyFromText(%s)"},
            batch_size=2000,
        )
