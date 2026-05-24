"""Apply the CompStat DDL to Supabase Postgres.

Runs docs/compstat_schema.sql as one transaction. The DDL is mostly
idempotent (`create extension if not exists`, `create type ... if not exists`
not supported — types are guarded below).
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

import psycopg

from app.etl.base import get_conn, read_sql_file

log = logging.getLogger("compstat.etl.apply_schema")

SCHEMA_FILE = Path(__file__).resolve().parents[2] / "docs" / "compstat_schema.sql"

_ENUM_GUARD = re.compile(
    r"create type\s+(?P<name>\w+)\s+as\s+enum\s*\((?P<body>.*?)\);",
    flags=re.DOTALL | re.IGNORECASE,
)


def _guard_enums(sql: str) -> str:
    """Wrap each `create type ... as enum (...)` in a do-block guard so
    re-applying the schema doesn't fail when the type already exists."""

    def replace(match: re.Match[str]) -> str:
        name = match.group("name")
        body = match.group("body").strip()
        return (
            f"do $$ begin\n"
            f"  if not exists (select 1 from pg_type where typname = '{name}') then\n"
            f"    create type {name} as enum ({body});\n"
            f"  end if;\n"
            f"end $$;"
        )

    return _ENUM_GUARD.sub(replace, sql)


def _guard_tables(sql: str) -> str:
    """Convert plain `create table foo (...)` into `create table if not exists`.

    Indexes are already idempotent via `create index if not exists` — but the
    DDL uses plain `create index`. Patch those too.
    """
    sql = re.sub(
        r"\bcreate\s+table\s+(?!if not exists)",
        "create table if not exists ",
        sql,
        flags=re.IGNORECASE,
    )
    sql = re.sub(
        r"\bcreate\s+index\s+(?!if not exists)",
        "create index if not exists ",
        sql,
        flags=re.IGNORECASE,
    )
    return sql


def make_idempotent(sql: str) -> str:
    return _guard_tables(_guard_enums(sql))


def apply_schema(*, schema_file: Path = SCHEMA_FILE) -> None:
    sql = read_sql_file(schema_file)
    sql = make_idempotent(sql)
    log.info("Applying schema from %s", schema_file)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
    log.info("Schema applied OK")


def list_tables() -> list[str]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select tablename from pg_tables where schemaname = 'public' order by tablename"
            )
            return [row["tablename"] for row in cur.fetchall()]


def drop_all() -> None:
    """Destructive — drops every CompStat table + enum. Use only against a dev DB."""
    tables = [
        "etl_run",
        "recomendacao_acao",
        "sinal_risco_area",
        "ponto_receptacao",
        "facilitador",
        "rota_fuga",
        "evento_criminal",
        "extracao_dinamica_criminal",
        "fonte_inteligencia",
        "censo_psr",
        "dominio_territorial",
        "camera",
        "fator_urbano",
        "relint",
        "denuncia_disque",
        "ocorrencia_criminal",
        "area_fm",
    ]
    types = [
        "status_recomendacao",
        "dominio_orcrim",
        "nivel_confianca",
        "orgao_responsavel",
        "tipo_facilitador",
        "periodo_dia",
        "modo_deslocamento",
        "tipo_crime",
        "tipo_fonte",
    ]
    with get_conn() as conn:
        with conn.cursor() as cur:
            for table in tables:
                cur.execute(psycopg.sql.SQL("drop table if exists {} cascade").format(
                    psycopg.sql.Identifier(table)
                ))
            for typename in types:
                cur.execute(psycopg.sql.SQL("drop type if exists {} cascade").format(
                    psycopg.sql.Identifier(typename)
                ))
    log.info("Dropped CompStat tables and enums")
