"""ETL: 1746 (BigQuery datario.adm_central_atendimento_1746.chamado)
       -> sinal_risco_area (agregado por área FM × tipo_facilitador).

O 1746 não tem texto livre — só categoria/tipo/subtipo. Por isso ele
NÃO entra no pipeline fonte_inteligencia → Claude. O valor está no
volume: muitos chamados de "Iluminação Pública" numa área = validação
externa do fator urbano.

Estratégia:
  1. Query BigQuery filtrando tipos relevantes + janela de tempo +
     coordenadas dentro do Rio. Agrupa por (tipo, lat, lng) pra reduzir
     o volume transferido.
  2. Pra cada cluster, resolve area_id via AreaIndex (point-in-polygon).
  3. Soma chamados por (area_id, tipo_facilitador).
  4. Upsert em sinal_risco_area com pontuacao = total de chamados.
"""

from __future__ import annotations

import logging
import os
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from app.config.settings import Settings
from app.etl.base import bulk_insert, etl_run, load_area_index_full

log = logging.getLogger("compstat.etl.ouvidoria_1746")

# tipo do 1746 -> tipo_facilitador do CompStat.
TIPO_TO_FACILITADOR: dict[str, tuple[str, str]] = {
    "Iluminação Pública":                       ("iluminacao",       "RioLuz"),
    "Limpeza de logradouros":                   ("desordem_urbana",  "COMLURB"),
    "Manejo Arbóreo":                           ("vegetacao",        "COMLURB"),
    "Estacionamento irregular":                 ("mobilidade",       "SEOP"),
    "Limpeza e manutenção de praças e parques": ("desordem_urbana",  "COMLURB"),
    "Estrutura de Imóvel":                      ("obstrucao",        "SECONSERVA"),
    "Pavimentação":                             ("obstrucao",        "SECONSERVA"),
    "Vias públicas":                            ("obstrucao",        "SECONSERVA"),
    "Sinalização Gráfica":                      ("obstrucao",        "CET-Rio"),
}

DEFAULT_JANELA_DIAS = 180
RIO_BBOX = (-44.2, -23.2, -42.8, -22.4)  # lng_min, lat_min, lng_max, lat_max


def run(settings: Settings, *, janela_dias: int = DEFAULT_JANELA_DIAS) -> None:
    _ensure_gcp_env(settings)
    from google.cloud import bigquery

    client = bigquery.Client(project=settings.gcp_project_id)
    desde = date.today() - timedelta(days=janela_dias)
    tipos = list(TIPO_TO_FACILITADOR.keys())

    query = """
        select tipo, longitude, latitude, count(*) as chamados
        from `datario.adm_central_atendimento_1746.chamado`
        where data_inicio >= @desde
          and tipo in unnest(@tipos)
          and latitude is not null
          and longitude is not null
          and longitude between @lng_min and @lng_max
          and latitude between @lat_min and @lat_max
        group by tipo, longitude, latitude
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("desde", "DATE", desde),
            bigquery.ArrayQueryParameter("tipos", "STRING", tipos),
            bigquery.ScalarQueryParameter("lng_min", "FLOAT64", RIO_BBOX[0]),
            bigquery.ScalarQueryParameter("lat_min", "FLOAT64", RIO_BBOX[1]),
            bigquery.ScalarQueryParameter("lng_max", "FLOAT64", RIO_BBOX[2]),
            bigquery.ScalarQueryParameter("lat_max", "FLOAT64", RIO_BBOX[3]),
        ]
    )

    with etl_run(
        "ouvidoria_1746",
        f"bigquery://datario.adm_central_atendimento_1746.chamado?desde={desde}",
        settings=settings,
    ) as (conn, result):
        area_index = load_area_index_full(conn, settings)
        orgao_padrao = _load_orgao_padrao(conn)

        log.info("[etl:ouvidoria_1746] querying BigQuery (desde=%s, tipos=%d)", desde, len(tipos))
        job = client.query(query, job_config=job_config)
        rows = list(job.result())
        bytes_billed = job.total_bytes_billed or 0
        log.info(
            "[etl:ouvidoria_1746] BigQuery clusters=%d billed_mb=%.2f",
            len(rows),
            bytes_billed / (1024 * 1024),
        )
        result.metadados["bigquery_clusters"] = len(rows)
        result.metadados["bigquery_billed_mb"] = round(bytes_billed / (1024 * 1024), 2)
        result.metadados["janela_dias"] = janela_dias
        result.metadados["desde"] = desde.isoformat()

        # Aggregate by (area_id, tipo_facilitador).
        agg: dict[tuple[str, str], dict[str, Any]] = defaultdict(
            lambda: {"chamados": 0, "tipos_1746": set(), "orgaos": set()}
        )
        unresolved = 0
        for row in rows:
            facilitador, orgao = TIPO_TO_FACILITADOR[row.tipo]
            area_id = area_index.resolve_id(point=(row.longitude, row.latitude))
            if not area_id:
                unresolved += row.chamados
                continue
            cell = agg[(area_id, facilitador)]
            cell["chamados"] += row.chamados
            cell["tipos_1746"].add(row.tipo)
            cell["orgaos"].add(orgao)

        result.rows_read = sum(int(r.chamados) for r in rows)
        result.metadados["chamados_fora_de_area"] = unresolved
        result.metadados["agregados_area_x_facilitador"] = len(agg)

        # Reset previous ouvidoria signals to keep the ETL idempotent.
        with conn.cursor() as cur:
            cur.execute("delete from sinal_risco_area where fonte_sinal = 'ouvidoria'")

        sinal_rows: list[tuple[Any, ...]] = []
        for (area_id, facilitador), cell in agg.items():
            descricao = (
                f"{cell['chamados']} chamado(s) 1746 nos últimos {janela_dias} dias "
                f"({', '.join(sorted(cell['tipos_1746']))})"
            )
            orgao = _resolver_orgao(cell["orgaos"], facilitador, orgao_padrao)
            sinal_rows.append(
                (
                    area_id,
                    "ouvidoria",
                    facilitador,
                    orgao,
                    cell["chamados"],
                    descricao,
                )
            )

        result.rows_inserted = bulk_insert(
            conn,
            table="sinal_risco_area",
            columns=(
                "area_id",
                "fonte_sinal",
                "tipo_sinal",
                "orgao_responsavel",
                "pontuacao",
                "descricao",
            ),
            rows=sinal_rows,
        )


def _load_orgao_padrao(conn: Any) -> dict[str, str]:
    with conn.cursor() as cur:
        cur.execute("select tipo_facilitador, orgao_responsavel from dim_orgao_responsabilidade")
        return {row["tipo_facilitador"]: row["orgao_responsavel"] for row in cur.fetchall()}


def _resolver_orgao(orgaos_no_cluster: set[str], facilitador: str, padrao: dict[str, str]) -> str:
    if len(orgaos_no_cluster) == 1:
        return next(iter(orgaos_no_cluster))
    return padrao.get(facilitador, "nao_informado")


def _ensure_gcp_env(settings: Settings) -> None:
    cred = settings.google_application_credentials
    if cred and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred
    if not settings.gcp_project_id:
        raise RuntimeError("GCP_PROJECT_ID is not configured; needed to run BigQuery jobs.")
