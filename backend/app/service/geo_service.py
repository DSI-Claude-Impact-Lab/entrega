"""Geo queries against Supabase Postgres (PostGIS).

Replaces the previous CSV-loading layer for the /geo/* endpoints. All
aggregation (heatmap binning, faction filtering) is pushed to SQL so we
never pull the full 114k occurrence rows into the app process.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.config.settings import Settings

log = logging.getLogger(__name__)

# Mapping from the public query alias to the value stored in
# `ocorrencia_criminal.descricao_delito` (the original DataRio label).
_DELITO_ALIAS_TO_DESCRICAO: dict[str, list[str]] = {
    "transeunte": ["Roubo a transeunte"],
    "celular": ["Roubo de aparelho celular"],
    "coletivo": ["Roubo em coletivo"],
}

# Rio de Janeiro municipal bounding box, matching the previous CSV-based
# endpoint (lng_min, lat_min, lng_max, lat_max). Used to drop rows from
# upstream feeds that include points outside the city.
_RIO_BBOX_ENVELOPE = "ST_MakeEnvelope(-43.85, -23.10, -43.05, -22.70, 4326)"


class GeoService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @contextmanager
    def _conn(self) -> Iterator[psycopg.Connection]:
        url = self._settings.resolved_database_url
        if not url:
            raise RuntimeError(
                "DATABASE_URL is not configured (set SUPABASE_PASSWORD or DATABASE_URL)."
            )
        conn = psycopg.connect(url, autocommit=True, row_factory=dict_row)
        try:
            yield conn
        finally:
            conn.close()

    def list_cameras(self) -> list[dict[str, Any]]:
        sql = f"""
            select
              id::text as id,
              coalesce(metadados->>'nome_area_fm', '') as area,
              ST_Y(geometria::geometry) as lat,
              ST_X(geometria::geometry) as lng
            from camera
            where geometria is not null
              and geometria::geometry && {_RIO_BBOX_ENVELOPE}
            order by id
        """
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()

    def list_urban_factors(self, limit: int = 3000) -> list[dict[str, Any]]:
        sql = f"""
            select
              id::text as id,
              tipo_facilitador::text as type,
              orgao_responsavel::text as agency,
              tipo_ocorrencia as occurrence_type,
              coalesce(descricao, '') as description,
              coalesce(metadados->>'logradouro', '') as street,
              coalesce(metadados->>'bairro_nome', '') as neighborhood,
              ST_Y(geometria::geometry) as lat,
              ST_X(geometria::geometry) as lng
            from fator_urbano
            where geometria is not null
              and geometria::geometry && {_RIO_BBOX_ENVELOPE}
            order by id
            limit %s
        """
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(sql, (limit,))
            return cur.fetchall()

    def list_facilitators(self, limit: int = 3000) -> list[dict[str, Any]]:
        sql = f"""
            with positioned as (
              select
                f.id,
                f.fator_urbano_id,
                f.tipo_facilitador,
                f.orgao_responsavel,
                f.descricao,
                f.evidencia_texto,
                f.confianca,
                f.criado_em,
                coalesce(fu.metadados->>'logradouro', '') as street,
                coalesce(fu.metadados->>'bairro_nome', a.nome, '') as neighborhood,
                coalesce(
                  fu.geometria::geometry,
                  ST_PointOnSurface(a.geometria::geometry)
                ) as geometry
              from facilitador f
              left join fator_urbano fu on fu.id = f.fator_urbano_id
              left join area_fm a on a.id = f.area_id
              where f.extracao_id is not null
            )
            select
              id::text as id,
              fator_urbano_id::text as urban_factor_id,
              tipo_facilitador::text as type,
              orgao_responsavel::text as agency,
              descricao as description,
              coalesce(evidencia_texto, '') as evidence,
              confianca::text as confidence,
              street,
              neighborhood,
              ST_Y(geometry) as lat,
              ST_X(geometry) as lng
            from positioned
            where geometry is not null
              and geometry && {_RIO_BBOX_ENVELOPE}
            order by criado_em desc, id
            limit %s
        """
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(sql, (limit,))
            return cur.fetchall()

    def denuncia_heatmap(
        self,
        *,
        hour_min: int | None = None,
        hour_max: int | None = None,
        max_points: int = 8000,
        bin_precision: int = 3,
    ) -> dict[str, Any]:
        """Denúncias heatmap with optional hour-of-day filter.

        The hour is extracted from `data_denuncia` (timestamptz).
        """
        h_min, h_max = _normalize_hour_range(hour_min, hour_max)

        universe_sql = f"""
            select count(*) as c
            from denuncia_disque
            where geometria is not null
              and geometria::geometry && {_RIO_BBOX_ENVELOPE}
        """
        bin_sql = f"""
            select
              round(ST_Y(geometria::geometry)::numeric, %s) as lat,
              round(ST_X(geometria::geometry)::numeric, %s) as lng,
              count(*) as weight
            from denuncia_disque
            where geometria is not null
              and geometria::geometry && {_RIO_BBOX_ENVELOPE}
              and (
                %s::int is null
                or (data_denuncia is not null
                    and extract(hour from data_denuncia)::int between %s and %s)
              )
            group by 1, 2
            order by weight desc
            limit %s
        """
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(universe_sql)
            total = cur.fetchone()["c"]
            cur.execute(
                bin_sql,
                (bin_precision, bin_precision, h_min, h_min, h_max, max_points),
            )
            rows = cur.fetchall()

        items = [
            {
                "lat": float(r["lat"]),
                "lng": float(r["lng"]),
                "weight": int(r["weight"]),
            }
            for r in rows
        ]
        return {"count": int(total), "sampled": len(items), "items": items}

    def route_waypoints(
        self,
        *,
        start_lat: float,
        start_lng: float,
        end_lat: float,
        end_lng: float,
        limit: int = 8,
        corridor_m: int = 300,
    ) -> dict[str, Any]:
        if limit <= 0:
            return {"count": 0, "items": []}

        sql = """
            with params as (
              select
                ST_SetSRID(ST_MakePoint(%s, %s), 4326) as start_geom,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326) as end_geom
            ),
            route_line as (
              select
                ST_MakeLine(start_geom, end_geom) as geom,
                start_geom,
                end_geom
              from params
            ),
            candidates as (
              select
                o.id_hash as id,
                o.descricao_delito as crime_type,
                o.data_fato,
                coalesce(o.metadados->>'locf', '') as street,
                ST_Y(o.geometria::geometry) as lat,
                ST_X(o.geometria::geometry) as lng,
                ST_LineLocatePoint(r.geom, o.geometria::geometry) as progress,
                ST_Distance(o.geometria, r.geom::geography) as distance_m
              from ocorrencia_criminal o
              cross join route_line r
              where o.geometria is not null
                and o.geometria::geometry && ST_Expand(r.geom, 0.02)
                and ST_DWithin(o.geometria, r.geom::geography, %s)
                and not ST_DWithin(o.geometria, r.start_geom::geography, 80)
                and not ST_DWithin(o.geometria, r.end_geom::geography, 80)
            ),
            bucketed as (
              select
                *,
                width_bucket(progress, 0.0, 1.0, %s) as bucket,
                row_number() over (
                  partition by width_bucket(progress, 0.0, 1.0, %s)
                  order by distance_m asc, data_fato desc nulls last
                ) as rn
              from candidates
              where progress > 0.03 and progress < 0.97
            )
            select
              id,
              crime_type,
              data_fato,
              street,
              lat,
              lng,
              progress,
              distance_m
            from bucketed
            where rn = 1
            order by progress
            limit %s
        """
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                sql,
                (
                    start_lng,
                    start_lat,
                    end_lng,
                    end_lat,
                    corridor_m,
                    limit,
                    limit,
                    limit,
                ),
            )
            rows = cur.fetchall()

        items = [
            {
                "id": r["id"],
                "lat": float(r["lat"]),
                "lng": float(r["lng"]),
                "crime_type": r["crime_type"] or "",
                "date": r["data_fato"].isoformat() if r["data_fato"] else None,
                "street": r["street"] or "",
                "progress": float(r["progress"]),
                "distance_m": float(r["distance_m"]),
            }
            for r in rows
        ]
        return {"count": len(items), "items": items}

    def list_orcrim_polygons(self, faction: str | None = None) -> list[dict[str, Any]]:
        sql = f"""
            select
              nome_territorio as name,
              grupo_dominio::text as faction,
              ST_AsGeoJSON(geometria::geometry)::jsonb as geojson
            from dominio_territorial
            where geometria is not null
              and geometria::geometry && {_RIO_BBOX_ENVELOPE}
              and (
                %s::text is null
                or lower(grupo_dominio::text) = lower(%s)
              )
            order by nome_territorio
        """
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(sql, (faction, faction))
            rows = cur.fetchall()

        results: list[dict[str, Any]] = []
        for row in rows:
            ring = _first_ring_lat_lng(row["geojson"])
            if len(ring) < 3:
                continue
            results.append({"name": row["name"], "faction": row["faction"], "ring": ring})
        return results

    def heatmap(
        self,
        *,
        year: int | None = None,
        delito: str | None = None,
        hour_min: int | None = None,
        hour_max: int | None = None,
        max_points: int = 8000,
        bin_precision: int = 3,
    ) -> dict[str, Any]:
        """Aggregated heatmap points; binning + filtering happen in Postgres.

        hour_min/hour_max are inclusive (e.g. 18..22 keeps 18h, 19h, 20h, 21h, 22h).
        If only one is set, the other defaults to the same value (single-hour filter).
        Rows with NULL hora_fato are excluded when any hour bound is set.
        """
        descricoes: list[str] | None = None
        if delito and delito != "all":
            descricoes = _DELITO_ALIAS_TO_DESCRICAO.get(delito)
            if descricoes is None:
                # Unknown alias — return empty rather than error to match the
                # old CSV behavior, which silently dropped unknown filters.
                return {"count": 0, "sampled": 0, "items": []}

        h_min, h_max = _normalize_hour_range(hour_min, hour_max)

        # The old endpoint reported `count = len(rows_loaded_from_csv)` — i.e.
        # the total bbox-filtered universe before year/delito filters were
        # applied. We mirror that semantics here so the frontend's "X de Y"
        # label stays consistent.
        universe_sql = f"""
            select count(*) as c
            from ocorrencia_criminal
            where geometria is not null
              and geometria::geometry && {_RIO_BBOX_ENVELOPE}
        """
        bin_sql = f"""
            select
              round(ST_Y(geometria::geometry)::numeric, %s) as lat,
              round(ST_X(geometria::geometry)::numeric, %s) as lng,
              count(*) as weight
            from ocorrencia_criminal
            where geometria is not null
              and geometria::geometry && {_RIO_BBOX_ENVELOPE}
              and (%s::int is null or ano = %s)
              and (
                %s::text[] is null
                or descricao_delito = any(%s::text[])
              )
              and (
                %s::int is null
                or (hora_fato is not null and hora_fato between %s and %s)
              )
            group by 1, 2
            order by weight desc
            limit %s
        """
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(universe_sql)
            total = cur.fetchone()["c"]
            cur.execute(
                bin_sql,
                (
                    bin_precision,
                    bin_precision,
                    year,
                    year,
                    descricoes,
                    descricoes,
                    h_min,  # sentinel: NULL means no filter
                    h_min,
                    h_max,
                    max_points,
                ),
            )
            rows = cur.fetchall()

        items = [
            {
                "lat": float(r["lat"]),
                "lng": float(r["lng"]),
                "weight": int(r["weight"]),
            }
            for r in rows
        ]
        return {"count": int(total), "sampled": len(items), "items": items}

    def list_areas_fm(self) -> list[dict[str, Any]]:
        """All FM areas with polygon + occurrence count + computed risk score.

        Score: occurrences normalized 0-1 across areas using log1p to compress
        outliers. Areas without geometry are dropped (can't render on map).
        """
        sql = f"""
            with counts as (
              select area_id, count(*)::int as n
              from ocorrencia_criminal
              where geometria is not null
                and geometria::geometry && {_RIO_BBOX_ENVELOPE}
              group by area_id
            ),
            base as (
              select
                a.id::text as id,
                a.nome as name,
                coalesce(c.n, 0) as n_ocorrencias,
                ST_AsGeoJSON(a.geometria::geometry)::jsonb as geojson
              from area_fm a
              left join counts c on c.area_id = a.id
              where a.geometria is not null
            ),
            scored as (
              select
                id, name, n_ocorrencias, geojson,
                ln(1 + n_ocorrencias) as raw_score
              from base
            ),
            normed as (
              select
                id, name, n_ocorrencias, geojson,
                case
                  when max(raw_score) over () = 0 then 0.0
                  else raw_score / nullif(max(raw_score) over (), 0)
                end as score
              from scored
            )
            select * from normed
            order by n_ocorrencias desc
        """
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()

        results: list[dict[str, Any]] = []
        for row in rows:
            ring = _first_ring_lat_lng(row["geojson"])
            if len(ring) < 3:
                continue
            results.append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "n_ocorrencias": int(row["n_ocorrencias"]),
                    "score": float(row["score"] or 0.0),
                    "ring": ring,
                }
            )
        return results

    def area_fm_report(self, area_id: str) -> dict[str, Any]:
        """Per-area report.

        Includes: total + monthly delta + peak hour + top delitos +
        top logradouros + day distribution + fatores ranking + bingos
        (logradouros with overlapping urban factors) + a rule-based
        "dinamica criminal" synthesis text.
        """
        meta_sql = "select id::text as id, nome as name from area_fm where id = %s"
        total_sql = """
            select count(*)::int as n
            from ocorrencia_criminal
            where area_id = %s::uuid
        """
        # full monthly series, last 24 months that have data
        monthly_series_sql = """
            select ano, mes, n
            from (
              select ano, mes, count(*)::int as n
              from ocorrencia_criminal
              where area_id = %s::uuid
                and ano is not null
                and mes is not null
              group by ano, mes
              order by ano desc, mes desc
              limit 24
            ) t
            order by ano, mes
        """
        # last 2 calendar months with any occurrence
        recent_sql = """
            with months as (
              select ano, mes
              from ocorrencia_criminal
              where area_id = %s::uuid and ano is not null and mes is not null
              group by ano, mes
              order by ano desc, mes desc
              limit 2
            ),
            counts as (
              select ano, mes, count(*)::int as n
              from ocorrencia_criminal
              where area_id = %s::uuid and ano is not null and mes is not null
              group by ano, mes
            )
            select c.ano, c.mes, c.n
            from counts c
            join months m using (ano, mes)
            order by ano desc, mes desc
        """
        peak_hour_sql = """
            select hora_fato as hour, count(*)::int as n
            from ocorrencia_criminal
            where area_id = %s::uuid and hora_fato is not null
            group by hora_fato
            order by n desc, hora_fato asc
            limit 1
        """
        hour_dist_sql = """
            select hora_fato as hour, count(*)::int as n
            from ocorrencia_criminal
            where area_id = %s::uuid and hora_fato is not null
            group by hora_fato
            order by hora_fato
        """
        top_delitos_sql = """
            select descricao_delito as delito, count(*)::int as n
            from ocorrencia_criminal
            where area_id = %s::uuid and descricao_delito is not null
            group by descricao_delito
            order by n desc
            limit 5
        """
        top_logr_sql = """
            select
              lower(trim(metadados->>'locf')) as key,
              max(metadados->>'locf') as raw,
              count(*)::int as n
            from ocorrencia_criminal
            where area_id = %s::uuid
              and metadados->>'locf' is not null
              and length(trim(metadados->>'locf')) > 1
            group by key
            order by n desc
            limit 10
        """
        dia_sql = """
            select metadados->>'dia_semana' as dia, count(*)::int as n
            from ocorrencia_criminal
            where area_id = %s::uuid
              and metadados->>'dia_semana' is not null
            group by 1
            order by n desc
        """
        fatores_sql = """
            select
              orgao_responsavel::text as orgao,
              tipo_ocorrencia as tipo,
              count(*)::int as n
            from fator_urbano
            where area_id = %s::uuid
            group by orgao_responsavel, tipo_ocorrencia
            order by n desc
            limit 10
        """
        fatores_total_sql = "select count(*)::int as n from fator_urbano where area_id = %s::uuid"
        bingo_sql = """
            with logr as (
              select
                lower(trim(metadados->>'locf')) as key,
                max(metadados->>'locf') as raw,
                count(*)::int as n
              from ocorrencia_criminal
              where area_id = %s::uuid
                and metadados->>'locf' is not null
                and length(trim(metadados->>'locf')) > 1
              group by 1
              order by n desc
              limit 15
            ),
            fat as (
              select
                lower(trim(metadados->>'logradouro')) as key,
                max(metadados->>'logradouro') as raw,
                max(orgao_responsavel::text) as orgao,
                max(tipo_ocorrencia) as tipo,
                count(*)::int as n
              from fator_urbano
              where area_id = %s::uuid
                and metadados->>'logradouro' is not null
              group by 1
            )
            select
              coalesce(logr.raw, fat.raw) as logradouro,
              logr.n as ocorrencias,
              fat.orgao as orgao,
              fat.tipo as fator,
              fat.n as n_fatores
            from logr
            join fat on fat.key = logr.key
            order by logr.n desc
            limit 8
        """
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(meta_sql, (area_id,))
            meta = cur.fetchone()
            if not meta:
                return {}
            cur.execute(total_sql, (area_id,))
            total = cur.fetchone()["n"]
            cur.execute(recent_sql, (area_id, area_id))
            recent = cur.fetchall()
            cur.execute(monthly_series_sql, (area_id,))
            monthly_rows = cur.fetchall()
            cur.execute(peak_hour_sql, (area_id,))
            peak = cur.fetchone()
            cur.execute(hour_dist_sql, (area_id,))
            hour_dist = cur.fetchall()
            cur.execute(top_delitos_sql, (area_id,))
            top = cur.fetchall()
            cur.execute(top_logr_sql, (area_id,))
            top_logr_rows = cur.fetchall()
            cur.execute(dia_sql, (area_id,))
            dia_rows = cur.fetchall()
            cur.execute(fatores_sql, (area_id,))
            fatores_rows = cur.fetchall()
            cur.execute(fatores_total_sql, (area_id,))
            fatores_total = cur.fetchone()["n"]
            cur.execute(bingo_sql, (area_id, area_id))
            bingo_rows = cur.fetchall()

        last_month = recent[0] if len(recent) > 0 else None
        prev_month = recent[1] if len(recent) > 1 else None
        delta_pct: float | None = None
        if last_month and prev_month and prev_month["n"] > 0:
            delta_pct = (last_month["n"] - prev_month["n"]) / prev_month["n"] * 100

        def _month_dict(row: dict[str, Any] | None) -> dict[str, int] | None:
            if not row:
                return None
            return {
                "ano": int(row["ano"]),
                "mes": int(row["mes"]),
                "n": int(row["n"]),
            }

        top_logradouros = [
            {"logradouro": _clean_locf(r["raw"]), "n": int(r["n"])}
            for r in top_logr_rows
            if _clean_locf(r["raw"])
        ]
        # dedup again after cleaning, since "Avenida X" and "Avenida avenida X"
        # collapse to the same display string
        merged_logr: dict[str, int] = {}
        for item in top_logradouros:
            key = item["logradouro"].casefold()
            merged_logr[key] = merged_logr.get(key, 0) + item["n"]
        top_logradouros = [
            {"logradouro": _title_case(k), "n": v}
            for k, v in sorted(merged_logr.items(), key=lambda kv: kv[1], reverse=True)
        ][:10]

        dia_distribution = [
            {"dia": (r["dia"] or "").strip(), "n": int(r["n"])} for r in dia_rows
        ]
        dia_pico = dia_distribution[0]["dia"] if dia_distribution else None

        fatores_ranking = [
            {"orgao": r["orgao"], "tipo": r["tipo"], "n": int(r["n"])} for r in fatores_rows
        ]

        bingos = [
            {
                "logradouro": _title_case(r["logradouro"] or ""),
                "orgao": r["orgao"] or "",
                "fator": r["fator"] or "",
                "ocorrencias": int(r["ocorrencias"] or 0),
                "n_fatores": int(r["n_fatores"] or 0),
            }
            for r in bingo_rows
        ]

        dinamica = _build_dinamica(
            total=int(total),
            top_delitos=[{"delito": r["delito"], "n": int(r["n"])} for r in top],
            top_logradouros=top_logradouros,
            peak_hour=int(peak["hour"]) if peak else None,
            dia_pico=dia_pico,
            delta_pct=delta_pct,
            n_fatores=int(fatores_total or 0),
            n_bingos=len(bingos),
        )

        return {
            "id": meta["id"],
            "name": meta["name"],
            "total_ocorrencias": int(total),
            "last_month": _month_dict(last_month),
            "previous_month": _month_dict(prev_month),
            "delta_pct": delta_pct,
            "peak_hour": int(peak["hour"]) if peak else None,
            "peak_hour_n": int(peak["n"]) if peak else None,
            "dia_pico": dia_pico,
            "n_fatores_total": int(fatores_total or 0),
            "monthly_series": [
                {"ano": int(r["ano"]), "mes": int(r["mes"]), "n": int(r["n"])}
                for r in monthly_rows
            ],
            "hour_distribution": [
                {"hour": int(r["hour"]), "n": int(r["n"])} for r in hour_dist
            ],
            "top_delitos": [
                {"delito": r["delito"], "n": int(r["n"])} for r in top
            ],
            "top_logradouros": top_logradouros,
            "fatores_ranking": fatores_ranking,
            "bingos": bingos,
            "dinamica": dinamica,
        }

    def health(self) -> dict[str, Any]:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                "select "
                "(select count(*) from camera) as cameras, "
                "(select count(*) from dominio_territorial) as orcrim, "
                "(select count(*) from ocorrencia_criminal) as occurrences, "
                "(select count(*) from fator_urbano) as urban_factors, "
                "(select count(*) from denuncia_disque) as denuncias, "
                "(select count(*) from facilitador) as facilitators"
            )
            return cur.fetchone()


_DUP_RE = None  # placeholder so the import below stays at the top


def _normalize_hour_range(
    hour_min: int | None, hour_max: int | None
) -> tuple[int | None, int | None]:
    """Resolve the (hour_min, hour_max) pair into clamped 0-23 bounds.

    Returns (None, None) when no filter is requested. When only one bound
    is given, treats it as a single-hour filter.
    """
    if hour_min is None and hour_max is None:
        return (None, None)
    lo = hour_min if hour_min is not None else hour_max
    hi = hour_max if hour_max is not None else hour_min
    assert lo is not None and hi is not None  # narrowing for mypy
    lo = max(0, min(23, int(lo)))
    hi = max(0, min(23, int(hi)))
    if lo > hi:
        lo, hi = hi, lo
    return (lo, hi)


def _clean_locf(value: str | None) -> str:
    """Normalize `locf` strings like 'Avenida avenida brasil' -> 'Avenida Brasil'."""
    if not value:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    parts = text.split()
    if len(parts) >= 2 and parts[0].casefold() == parts[1].casefold():
        parts = parts[1:]
    return " ".join(parts)


def _title_case(value: str) -> str:
    return " ".join(w[:1].upper() + w[1:].lower() if w else w for w in value.split())


def _build_dinamica(
    *,
    total: int,
    top_delitos: list[dict[str, Any]],
    top_logradouros: list[dict[str, Any]],
    peak_hour: int | None,
    dia_pico: str | None,
    delta_pct: float | None,
    n_fatores: int,
    n_bingos: int,
) -> str:
    parts: list[str] = []
    parts.append(
        f"Área concentra {total:,} ocorrências registradas.".replace(",", ".")
    )
    if top_delitos:
        d = top_delitos[0]
        pct = (d["n"] / total * 100) if total > 0 else 0
        parts.append(
            f"Crime predominante: {d['delito']} ({d['n']:,} casos, "
            f"{pct:.0f}% do total).".replace(",", ".")
        )
    if len(top_delitos) >= 2:
        parts.append(
            f"Segundo padrão: {top_delitos[1]['delito']} "
            f"({top_delitos[1]['n']:,} casos).".replace(",", ".")
        )
    if peak_hour is not None:
        parts.append(
            f"Janela de pico {peak_hour:02d}h"
            + (f", concentrada às {dia_pico}." if dia_pico else ".")
        )
    elif dia_pico:
        parts.append(f"Dia de pico {dia_pico}.")
    if top_logradouros:
        top3 = ", ".join(t["logradouro"] for t in top_logradouros[:3])
        parts.append(f"Corredores críticos: {top3}.")
    if delta_pct is not None:
        signal = "alta" if delta_pct > 0 else "queda"
        parts.append(
            f"Último mês mostra {signal} de {abs(delta_pct):.1f}% vs mês anterior."
        )
    if n_fatores:
        parts.append(
            f"{n_fatores} fatores urbanos mapeados na área."
        )
    if n_bingos:
        parts.append(
            f"{n_bingos} bingos (logradouros com sobreposição crime + fator urbano) "
            "indicam intervenções de alto impacto."
        )
    return " ".join(parts)


def _first_ring_lat_lng(geojson: dict[str, Any] | None) -> list[list[float]]:
    """Extract the outer ring of a (Multi)Polygon GeoJSON as [[lat, lng], ...].

    GeoJSON stores coordinates as [lng, lat]; the frontend expects [lat, lng].
    """
    if not geojson:
        return []
    geom_type = geojson.get("type")
    coords = geojson.get("coordinates")
    if geom_type == "Polygon" and coords:
        outer = coords[0]
    elif geom_type == "MultiPolygon" and coords:
        outer = coords[0][0] if coords[0] else []
    else:
        return []
    out: list[list[float]] = []
    for pair in outer:
        if not isinstance(pair, list | tuple) or len(pair) < 2:
            continue
        lng, lat = pair[0], pair[1]
        out.append([float(lat), float(lng)])
    return out
