"""ETL: fatores_urbanos.csv -> fator_urbano."""

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
    load_area_index,
    map_orgao_responsavel,
    map_tipo_facilitador,
    point_wkt,
    resolve_area_id,
    safe_int,
    safe_str,
    to_jsonb,
)

log = logging.getLogger("compstat.etl.fatores_urbanos")

CSV_NAME = "fatores_urbanos.csv"


def run(settings: Settings) -> None:
    path = Path(settings.compstat_data_dir) / CSV_NAME
    df = pd.read_csv(path, low_memory=False)

    with etl_run("fatores_urbanos", str(path), settings=settings) as (conn, result):
        area_index = load_area_index(conn)
        rows: list[tuple[Any, ...]] = []
        seen: set[int] = set()
        skipped = 0
        duplicates = 0

        for record in df.to_dict(orient="records"):
            fator_id = safe_int(record.get("id_resposta_ocorrencia"))
            if fator_id is None:
                skipped += 1
                continue
            if fator_id in seen:
                duplicates += 1
                continue
            seen.add(fator_id)

            tipo_descr = safe_str(record.get("tipo_ocorrencia_descricao")) or ""
            orgao_raw = safe_str(record.get("orgao_responsavel"))
            area_id = resolve_area_id(area_index, record.get("subarea_nome"))
            metadados = {
                "logradouro": safe_str(record.get("logradouro")),
                "numero_porta": safe_str(record.get("numero_porta")),
                "referencia": safe_str(record.get("referencia")),
                "observacao": safe_str(record.get("observacao")),
                "bairro_nome": safe_str(record.get("bairro_nome")),
                "subarea_nome": safe_str(record.get("subarea_nome")),
                "id_tipo_ocorrencia": safe_int(record.get("id_tipo_ocorrencia")),
                "tipo_ocorrencia_ativo": safe_str(record.get("tipo_ocorrencia_ativo")),
                "ocupacao_pessoa_descricao": safe_str(record.get("ocupacao_pessoa_descricao")),
                "valido": safe_str(record.get("valido")),
                "endereco_informado": safe_str(record.get("endereco_informado")),
                "ocorrencia_informacao": safe_str(record.get("ocorrencia_informacao")),
                "ocorrencia_orgao_nome": safe_str(record.get("ocorrencia_orgao_nome")),
            }
            rows.append(
                (
                    fator_id,
                    area_id,
                    map_tipo_facilitador(tipo_descr),
                    map_orgao_responsavel(orgao_raw),
                    tipo_descr or "nao_informado",
                    safe_str(record.get("observacao")),
                    point_wkt(record.get("coordenada_y"), record.get("coordenada_x")),
                    to_jsonb(jsonable(metadados)),
                )
            )

        result.rows_read = len(df)
        result.rows_skipped = skipped
        result.metadados["duplicates_in_source"] = duplicates
        result.metadados["areas_matched"] = sum(1 for r in rows if r[1] is not None)
        result.rows_inserted = bulk_upsert(
            conn,
            table="fator_urbano",
            columns=(
                "id",
                "area_id",
                "tipo_facilitador",
                "orgao_responsavel",
                "tipo_ocorrencia",
                "descricao",
                "geometria",
                "metadados",
            ),
            rows=rows,
            conflict_target="id",
            update_columns=(
                "area_id",
                "tipo_facilitador",
                "orgao_responsavel",
                "tipo_ocorrencia",
                "descricao",
                "geometria",
                "metadados",
            ),
            raw_columns={"geometria": "ST_GeographyFromText(%s)"},
        )
