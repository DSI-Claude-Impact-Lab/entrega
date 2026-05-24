"""ETL: disk_denuncia.csv -> denuncia_disque.

Source has ~83k rows, semicolon-separated, latin-1 encoded, comma decimal
separator on lat/lng. The CSV has dotted column names (`assuntos.classe`)
which pandas keeps verbatim — we map them to flat fields.
"""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from app.config.settings import Settings
from app.etl.base import (
    bulk_upsert,
    etl_run,
    jsonable,
    load_area_index_full,
    parse_disque_decimal,
    point_wkt,
    safe_str,
    to_jsonb,
    truncate,
)

log = logging.getLogger("compstat.etl.disque_denuncia")

CSV_NAME = "disk_denuncia.csv"
DATE_FORMATS = ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M", "%d/%m/%Y %H:%M:%S")


def _parse_datetime(value: Any) -> datetime | None:
    text = safe_str(value)
    if not text:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:
        parsed = pd.to_datetime(text, errors="coerce")
    except (ValueError, TypeError):
        return None
    if pd.isna(parsed):
        return None
    return parsed.to_pydatetime()


def run(settings: Settings) -> None:
    path = Path(settings.compstat_data_dir) / CSV_NAME
    df = pd.read_csv(
        path,
        sep=";",
        encoding="latin-1",
        low_memory=False,
        dtype=str,
        keep_default_na=False,
    )

    with etl_run("disque_denuncia", str(path), settings=settings) as (conn, result):
        area_index = load_area_index_full(conn, settings)
        rows: list[tuple[Any, ...]] = []
        seen: set[str] = set()
        skipped = 0
        duplicates = 0
        with_area = 0
        for record in df.to_dict(orient="records"):
            id_origem = safe_str(record.get("id_denuncia"))
            if not id_origem:
                skipped += 1
                continue
            if id_origem in seen:
                duplicates += 1
                continue
            seen.add(id_origem)

            lat = parse_disque_decimal(record.get("latitude"))
            lng = parse_disque_decimal(record.get("longitude"))
            point = (lng, lat) if lng is not None and lat is not None else None
            area_id = area_index.resolve_id(
                name=record.get("bairro_logradouro"), point=point
            )
            if area_id:
                with_area += 1
            metadados = {
                "tipo_logradouro": safe_str(record.get("tipo_logradouro")),
                "logradouro": safe_str(record.get("logradouro")),
                "numero_logradouro": safe_str(record.get("numero_logradouro")),
                "complemento_logradouro": safe_str(record.get("complemento_logradouro")),
                "subbairro_logradouro": safe_str(record.get("subbairro_logradouro")),
                "referencia_logradouro": safe_str(record.get("referencia_logradouro")),
                "municipio": safe_str(record.get("municipio")),
                "estado": safe_str(record.get("estado")),
                "orgao_id": safe_str(record.get("orgaos.id")),
                "orgao_nome": safe_str(record.get("orgaos.nome")),
                "orgao_tipo": safe_str(record.get("orgaos.tipo")),
                "id_classe": safe_str(record.get("id_classe")),
                "id_tipo": safe_str(record.get("id_tipo")),
            }
            rows.append(
                (
                    id_origem,
                    area_id,
                    safe_str(record.get("numero_denuncia")),
                    _parse_datetime(record.get("data_denuncia")),
                    _parse_datetime(record.get("data_difusao")),
                    safe_str(record.get("bairro_logradouro")),
                    safe_str(record.get("classe") or record.get("assuntos.classe")),
                    safe_str(record.get("tipo") or record.get("assuntos.tipos.tipo")),
                    safe_str(record.get("assunto_principal")),
                    safe_str(record.get("status_denuncia")),
                    truncate(safe_str(record.get("relato_redacted")), 10000),
                    point_wkt(lng, lat),
                    to_jsonb(jsonable(metadados)),
                )
            )

        result.rows_read = len(df)
        result.rows_skipped = skipped
        result.metadados["duplicates_in_source"] = duplicates
        result.metadados["rows_with_area"] = with_area
        result.rows_inserted = bulk_upsert(
            conn,
            table="denuncia_disque",
            columns=(
                "id_denuncia_origem",
                "area_id",
                "numero_denuncia",
                "data_denuncia",
                "data_difusao",
                "bairro",
                "classe",
                "tipo_denuncia",
                "assunto_principal",
                "status_denuncia",
                "relato_redigido",
                "geometria",
                "metadados",
            ),
            rows=rows,
            conflict_target="id_denuncia_origem",
            update_columns=(
                "area_id",
                "numero_denuncia",
                "data_denuncia",
                "data_difusao",
                "bairro",
                "classe",
                "tipo_denuncia",
                "assunto_principal",
                "status_denuncia",
                "relato_redigido",
                "geometria",
                "metadados",
            ),
            raw_columns={"geometria": "ST_GeographyFromText(%s)"},
            batch_size=2000,
        )
