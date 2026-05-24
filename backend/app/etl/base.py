"""Shared utilities for ETL pipelines.

The ETLs talk to Postgres directly (psycopg) instead of going through
PostgREST/supabase-py — bulk inserts of 100k+ rows over HTTP are too slow.
The Supabase service-role connection bypasses RLS, which is the expected
behavior for server-side batch ingestion.
"""

from __future__ import annotations

import json
import logging
import math
import re
import unicodedata
from collections.abc import Iterable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.config.settings import Settings, get_settings

log = logging.getLogger("compstat.etl")

DEFAULT_BATCH_SIZE = 1000


class ETLConfigError(RuntimeError):
    pass


@contextmanager
def get_conn(settings: Settings | None = None) -> Iterator[psycopg.Connection]:
    """Open a Postgres connection using the Supabase direct URL.

    Autocommit is OFF so each ETL run controls its own transaction.
    """
    settings = settings or get_settings()
    url = settings.resolved_database_url
    if not url:
        raise ETLConfigError(
            "DATABASE_URL is not configured. Set SUPABASE_PASSWORD + SUPABASE_URL or DATABASE_URL."
        )
    conn = psycopg.connect(url, row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def chunked(iterable: Iterable[Any], size: int = DEFAULT_BATCH_SIZE) -> Iterator[list[Any]]:
    batch: list[Any] = []
    for item in iterable:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def bulk_insert(
    conn: psycopg.Connection,
    table: str,
    columns: Sequence[str],
    rows: Iterable[Sequence[Any]],
    *,
    batch_size: int = DEFAULT_BATCH_SIZE,
    raw_columns: dict[str, str] | None = None,
) -> int:
    """Plain INSERT, no conflict handling. Use when there is no natural key."""
    raw_columns = raw_columns or {}
    placeholders = [raw_columns.get(c, "%s") for c in columns]
    cols_sql = ", ".join(f'"{c}"' for c in columns)
    sql = f"insert into {table} ({cols_sql}) values ({', '.join(placeholders)})"
    total = 0
    with conn.cursor() as cur:
        for batch in chunked(rows, batch_size):
            cur.executemany(sql, batch)
            total += len(batch)
    return total


def bulk_upsert(
    conn: psycopg.Connection,
    table: str,
    columns: Sequence[str],
    rows: Iterable[Sequence[Any]],
    *,
    conflict_target: str,
    update_columns: Sequence[str] | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    raw_columns: dict[str, str] | None = None,
) -> int:
    """INSERT ... ON CONFLICT ... DO UPDATE, batched via executemany.

    `raw_columns` maps a column name to an SQL expression that wraps the
    placeholder, used for geometry columns: e.g.
    `{"geometria": "ST_GeographyFromText(%s)"}`.
    """
    raw_columns = raw_columns or {}
    placeholders = []
    for col in columns:
        if col in raw_columns:
            placeholders.append(raw_columns[col])
        else:
            placeholders.append("%s")
    cols_sql = ", ".join(f'"{c}"' for c in columns)
    placeholders_sql = ", ".join(placeholders)

    if update_columns is None:
        update_columns = [c for c in columns if c not in conflict_target]
    update_sql = (
        ", ".join(f'"{c}" = excluded."{c}"' for c in update_columns) if update_columns else ""
    )

    if update_sql:
        on_conflict = f"on conflict ({conflict_target}) do update set {update_sql}"
    else:
        on_conflict = f"on conflict ({conflict_target}) do nothing"

    sql = f"insert into {table} ({cols_sql}) values ({placeholders_sql}) {on_conflict}"

    total = 0
    with conn.cursor() as cur:
        for batch in chunked(rows, batch_size):
            cur.executemany(sql, batch)
            total += len(batch)
    return total


def to_jsonb(value: Any) -> Jsonb:
    return Jsonb(value if value is not None else {})


def safe_float(value: Any) -> float | None:
    """Coerce a value to float, accepting comma-decimal and NaN."""
    if value is None:
        return None
    if isinstance(value, float):
        return None if math.isnan(value) else value
    if isinstance(value, int):
        return float(value)
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return None
    text = text.replace(",", ".")
    try:
        f = float(text)
        return None if math.isnan(f) else f
    except ValueError:
        return None


def safe_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, float):
        if math.isnan(value):
            return None
        return int(value)
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def safe_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    return text or None


def point_wkt(lon: Any, lat: Any) -> str | None:
    f_lon = safe_float(lon)
    f_lat = safe_float(lat)
    if f_lon is None or f_lat is None:
        return None
    if not (-180 <= f_lon <= 180) or not (-90 <= f_lat <= 90):
        return None
    return f"SRID=4326;POINT({f_lon} {f_lat})"


def normalize_text(value: Any) -> str | None:
    """Lowercase, strip, remove accents — for fuzzy enum/area matching."""
    if value is None:
        return None
    text = safe_str(value)
    if text is None:
        return None
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


@dataclass
class ETLResult:
    dataset: str
    source_path: str | None
    status: str = "running"
    rows_read: int = 0
    rows_inserted: int = 0
    rows_skipped: int = 0
    error: str | None = None
    metadados: dict[str, Any] = field(default_factory=dict)
    _run_id: str | None = None

    def fail(self, error: str) -> None:
        self.status = "failed"
        self.error = error

    def ok(self) -> None:
        if self.status == "running":
            self.status = "ok"


@contextmanager
def etl_run(
    dataset: str,
    source_path: str | Path | None = None,
    *,
    settings: Settings | None = None,
) -> Iterator[tuple[psycopg.Connection, ETLResult]]:
    """Open a connection + create an etl_run row + auto-finalize.

    Usage:
        with etl_run("ocorrencias", path) as (conn, result):
            result.rows_read = ...
            bulk_upsert(conn, ...)
            result.rows_inserted = ...
    """
    settings = settings or get_settings()
    result = ETLResult(dataset=dataset, source_path=str(source_path) if source_path else None)

    with get_conn(settings) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "insert into etl_run (dataset, source_path, status) "
                "values (%s, %s, 'running') returning id",
                (dataset, result.source_path),
            )
            row = cur.fetchone()
            result._run_id = str(row["id"]) if row else None

        log.info("[etl:%s] start (run_id=%s)", dataset, result._run_id)
        try:
            yield conn, result
            result.ok()
        except Exception as exc:
            result.fail(f"{type(exc).__name__}: {exc}")
            log.exception("[etl:%s] failed", dataset)
            with conn.cursor() as cur:
                cur.execute(
                    "update etl_run set status = %s, error = %s, "
                    "rows_read = %s, rows_inserted = %s, rows_skipped = %s, "
                    "metadados = %s, finished_at = now() where id = %s",
                    (
                        result.status,
                        result.error,
                        result.rows_read,
                        result.rows_inserted,
                        result.rows_skipped,
                        to_jsonb(result.metadados),
                        result._run_id,
                    ),
                )
                conn.commit()
            raise
        with conn.cursor() as cur:
            cur.execute(
                "update etl_run set status = %s, rows_read = %s, "
                "rows_inserted = %s, rows_skipped = %s, metadados = %s, "
                "finished_at = now() where id = %s",
                (
                    result.status,
                    result.rows_read,
                    result.rows_inserted,
                    result.rows_skipped,
                    to_jsonb(result.metadados),
                    result._run_id,
                ),
            )
        log.info(
            "[etl:%s] %s read=%d inserted=%d skipped=%d",
            dataset,
            result.status,
            result.rows_read,
            result.rows_inserted,
            result.rows_skipped,
        )


def load_area_index(conn: psycopg.Connection) -> dict[str, str]:
    """Return a map of normalized area name -> area_fm.id (uuid as str).

    Pure name-based lookup. For geometric resolution use load_area_index_full.
    """
    index: dict[str, str] = {}
    with conn.cursor() as cur:
        cur.execute("select id, nome from area_fm")
        for row in cur.fetchall():
            key = normalize_text(row["nome"])
            if key:
                index[key] = str(row["id"])
    return index


def resolve_area_id(area_index: dict[str, str], name: Any) -> str | None:
    key = normalize_text(name)
    return area_index.get(key) if key else None


def compstat_root(settings: Settings) -> Path:
    """Parent of the configured `dados/` directory — root of the dataset bundle."""
    return Path(settings.compstat_data_dir).parent


def shapefile_dir(settings: Settings) -> Path:
    return compstat_root(settings) / "sh_area_forca"


def relints_dir(settings: Settings) -> Path:
    return compstat_root(settings) / "relints"


def load_area_index_full(conn: psycopg.Connection, settings: Settings) -> Any:
    """Build a full AreaIndex with shapefile polygons + DB ids."""
    from app.etl.geo import build_area_index, read_area_shapes

    shapes = read_area_shapes(shapefile_dir(settings))
    index = build_area_index(shapes)
    with conn.cursor() as cur:
        cur.execute("select id, nome from area_fm")
        for row in cur.fetchall():
            index.add_db_id(row["nome"], str(row["id"]))
    return index


# --- enum mappers -----------------------------------------------------------

_CRIME_NAME_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"roubo.*celular|celular"), "roubo_celular"),
    (re.compile(r"roubo.*coletivo|coletivo"), "roubo_coletivo"),
    (re.compile(r"roubo"), "roubo"),
    (re.compile(r"furto"), "furto"),
    (re.compile(r"suspeita"), "suspeita_roubo_furto"),
    (re.compile(r"trafico|tráfico"), "trafico_drogas"),
    (re.compile(r"consumo.*drogas|drogas.*consumo"), "consumo_drogas"),
]


def map_tipo_crime(desc: Any, codigo: Any = None) -> str:
    """Map a 'desc_delito' string (and optional numeric code) to the enum."""
    text = safe_str(desc)
    if text:
        nt = normalize_text(text) or ""
        for pattern, value in _CRIME_NAME_PATTERNS:
            if pattern.search(nt):
                return value
    code = safe_int(codigo)
    if code is not None:
        # Known DataRio delito codes: 15=Roubo a transeunte, 16=Roubo em coletivo,
        # 19=Roubo de aparelho celular.
        return {15: "roubo", 16: "roubo_coletivo", 19: "roubo_celular"}.get(code, "outro")
    return "nao_informado"


_FACILITATOR_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"vegeta"), "vegetacao"),
    (re.compile(r"iluminac|mal iluminad"), "iluminacao"),
    (re.compile(r"comercio irregular|comercio.*obstru"), "comercio_irregular"),
    (re.compile(r"estacionamento irregular|trafego|retencao"), "retencao_trafego"),
    (re.compile(r"lixo|entulho|sujeira"), "desordem_urbana"),
    (re.compile(r"mobiliario|esconderijo|mobiliário"), "mobiliario"),
    (re.compile(r"tapume"), "tapume"),
    (re.compile(r"grade|barreira|abertura|portao"), "barreira_fisica_vulneravel"),
    (re.compile(r"ponto cego|camera"), "ponto_cego_camera"),
    (re.compile(r"psr|morador.*rua"), "psr"),
    (re.compile(r"aglomera"), "aglomeracao"),
    (re.compile(r"recepta"), "receptacao"),
    (re.compile(r"obstru|visibili"), "visibilidade"),
]


def map_tipo_facilitador(descricao: Any) -> str:
    nt = normalize_text(descricao)
    if not nt:
        return "nao_informado"
    for pattern, value in _FACILITATOR_PATTERNS:
        if pattern.search(nt):
            return value
    return "outro"


_AGENCY_VALUES = {
    "comlurb": "COMLURB",
    "rioluz": "RioLuz",
    "seop": "SEOP",
    "seconserva": "SECONSERVA",
    "cet-rio": "CET-Rio",
    "cetrio": "CET-Rio",
    "gm-rio": "GM-Rio",
    "gmrio": "GM-Rio",
    "smas": "SMAS",
    "smtr": "SMTR",
}


def map_orgao_responsavel(value: Any) -> str:
    nt = normalize_text(value)
    if not nt:
        return "nao_informado"
    key = nt.replace(" ", "")
    return _AGENCY_VALUES.get(nt) or _AGENCY_VALUES.get(key) or "outro"


_DOMINIO_VALUES = {
    "cv": "CV",
    "tcp": "TCP",
    "ada": "ADA",
    "milicia": "Milicia",
    "milícia": "Milicia",
}


def map_dominio_orcrim(value: Any) -> str | None:
    nt = normalize_text(value)
    if not nt:
        return None
    return _DOMINIO_VALUES.get(nt)


def parse_disque_decimal(value: Any) -> float | None:
    """disk_denuncia stores '-22,899555' (comma decimal). Some rows have
    leading/trailing spaces or stray characters."""
    return safe_float(value)


def truncate(text: str | None, limit: int) -> str | None:
    if text is None:
        return None
    return text if len(text) <= limit else text[:limit]


def read_sql_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def jsonable(value: Any) -> Any:
    """Recursively coerce NaN / numpy types to JSON-safe values."""
    if value is None:
        return None
    if isinstance(value, float):
        return None if math.isnan(value) else value
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [jsonable(v) for v in value]
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        return str(value)
