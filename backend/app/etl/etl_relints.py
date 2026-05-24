"""ETL: relints/*.docx -> relint.

Delega o parsing dos .docx para RelintAdapter (strategy de ingestão de
fontes não-estruturadas). Dedup por hash_conteudo (renomear arquivo não
gera duplicata).
"""

from __future__ import annotations

import logging
from typing import Any

from app.config.settings import Settings
from app.etl.base import (
    bulk_upsert,
    etl_run,
    jsonable,
    load_area_index_full,
    relints_dir,
    to_jsonb,
)
from app.etl.geo import normalize_key
from app.ingestion.relint_adapter import RelintAdapter

log = logging.getLogger("compstat.etl.relints")


def run(settings: Settings) -> None:
    docs_dir = relints_dir(settings)
    adapter = RelintAdapter()

    with etl_run("relints", str(docs_dir), settings=settings) as (conn, result):
        area_index = load_area_index_full(conn, settings)
        rows: list[tuple[Any, ...]] = []
        unmatched = 0
        skipped = 0
        for record in adapter.parse(docs_dir):
            try:
                arquivo = record.metadados.get("arquivo_origem", record.id_registro_origem)
                hint = f"{arquivo}\n{record.texto_narrativo[:1200]}"
                best = area_index.best_area_for_text(hint)
                area_id = (
                    area_index.db_ids_by_normalized.get(normalize_key(best.nome))
                    if best
                    else None
                )
                if not area_id:
                    unmatched += 1

                metadados = {
                    **record.metadados,
                    "id_registro_origem": record.id_registro_origem,
                    "char_count": len(record.texto_narrativo),
                    "matched_area_name": best.nome if best else None,
                    "area_hint": record.area_hint,
                }
                rows.append(
                    (
                        arquivo,
                        area_id,
                        record.texto_narrativo,
                        record.hash_conteudo,
                        to_jsonb(jsonable(metadados)),
                    )
                )
            except Exception as exc:
                log.warning("Failed to parse record %s: %s", record.id_registro_origem, exc)
                skipped += 1
                continue

        result.rows_read = len(rows)
        result.rows_skipped = skipped
        result.metadados["unmatched_area"] = unmatched
        result.rows_inserted = bulk_upsert(
            conn,
            table="relint",
            columns=("arquivo_origem", "area_id", "texto_extraido", "hash_conteudo", "metadados"),
            rows=rows,
            conflict_target="hash_conteudo",
            update_columns=("arquivo_origem", "area_id", "texto_extraido", "metadados"),
        )
