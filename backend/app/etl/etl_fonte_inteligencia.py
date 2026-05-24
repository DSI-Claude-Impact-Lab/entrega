"""ETL derivado: fonte_inteligencia (relint + denuncia_disque).

`fonte_inteligencia` é a tabela narrativa que alimenta a extração de
dinâmica criminal. Aqui só consolidamos os textos já carregados nas
fontes brutas.

Dedup por hash do conteúdo. O hash do RELINT vem direto da tabela
relint (preenchido pelo etl_relints via RelintAdapter). Para denúncias,
calculamos o hash inline a partir do relato_redigido.

Run order: depois de etl_relints e etl_disque_denuncia.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

import psycopg

from app.config.settings import Settings
from app.etl.base import bulk_upsert, etl_run, jsonable, to_jsonb

log = logging.getLogger("compstat.etl.fonte_inteligencia")


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _iter_relints(conn: psycopg.Connection):
    with conn.cursor() as cur:
        cur.execute(
            "select id, area_id, arquivo_origem, texto_extraido, hash_conteudo, metadados "
            "from relint where texto_extraido is not null"
        )
        for row in cur.fetchall():
            hash_conteudo = row["hash_conteudo"] or _sha256(row["texto_extraido"])
            metadados = {
                "tabela": "relint",
                "relint_id": str(row["id"]),
                "arquivo_origem": row["arquivo_origem"],
            }
            yield (
                row["area_id"],
                "relint",
                row["arquivo_origem"],
                row["texto_extraido"],
                hash_conteudo,
                to_jsonb(jsonable(metadados)),
            )


def _iter_denuncias(conn: psycopg.Connection):
    with conn.cursor() as cur:
        cur.execute(
            "select id_denuncia_origem, area_id, relato_redigido "
            "from denuncia_disque where relato_redigido is not null"
        )
        for row in cur.fetchall():
            texto = row["relato_redigido"]
            yield (
                row["area_id"],
                "disque_denuncia",
                row["id_denuncia_origem"],
                texto,
                _sha256(texto),
                to_jsonb(jsonable({"tabela": "denuncia_disque"})),
            )


def run(settings: Settings) -> None:
    with etl_run("fonte_inteligencia", None, settings=settings) as (conn, result):
        rows: list[tuple[Any, ...]] = []
        for row in _iter_relints(conn):
            rows.append(row)
        relint_count = len(rows)
        for row in _iter_denuncias(conn):
            rows.append(row)
        denuncia_count = len(rows) - relint_count

        result.rows_read = len(rows)
        result.metadados["from_relint"] = relint_count
        result.metadados["from_denuncia"] = denuncia_count

        # Upsert por (tipo_fonte, hash_conteudo) — garante idempotência sem
        # precisar do delete prévio. O índice parcial cobre apenas linhas com
        # hash não-nulo, mas todas as inseridas aqui têm hash.
        result.rows_inserted = bulk_upsert(
            conn,
            table="fonte_inteligencia",
            columns=(
                "area_id",
                "tipo_fonte",
                "id_registro_origem",
                "texto_narrativo",
                "hash_conteudo",
                "metadados",
            ),
            rows=rows,
            conflict_target="tipo_fonte, hash_conteudo",
            update_columns=("area_id", "id_registro_origem", "texto_narrativo", "metadados"),
        )
