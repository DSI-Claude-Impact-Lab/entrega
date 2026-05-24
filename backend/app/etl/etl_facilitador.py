"""ETL derivado: facilitador (a partir de fator_urbano).

Cada `fator_urbano` vira um `facilitador` com `fator_urbano_id` setado e
sem `extracao_id`. A constraint `facilitador_tem_origem` exige um dos dois.

Run order: depois de etl_fatores_urbanos.
"""

from __future__ import annotations

import logging
from typing import Any

from app.config.settings import Settings
from app.etl.base import bulk_insert, etl_run

log = logging.getLogger("compstat.etl.facilitador")


def run(settings: Settings) -> None:
    with etl_run("facilitador", None, settings=settings) as (conn, result):
        with conn.cursor() as cur:
            cur.execute(
                "select id, area_id, tipo_facilitador, orgao_responsavel, "
                "tipo_ocorrencia, descricao "
                "from fator_urbano"
            )
            source_rows = cur.fetchall()

        rows: list[tuple[Any, ...]] = []
        for row in source_rows:
            rows.append(
                (
                    row["id"],
                    row["area_id"],
                    row["tipo_facilitador"],
                    row["orgao_responsavel"],
                    row["descricao"] or row["tipo_ocorrencia"] or "nao_informado",
                    "alto",
                )
            )

        result.rows_read = len(rows)

        # Same idempotency strategy as fonte_inteligencia: delete rows derived
        # from fator_urbano, then re-insert.
        with conn.cursor() as cur:
            cur.execute(
                "delete from facilitador where fator_urbano_id is not null "
                "and extracao_id is null"
            )

        result.rows_inserted = bulk_insert(
            conn,
            table="facilitador",
            columns=(
                "fator_urbano_id",
                "area_id",
                "tipo_facilitador",
                "orgao_responsavel",
                "descricao",
                "confianca",
            ),
            rows=rows,
        )
