#!/usr/bin/env python3
"""Motor de extração de dinâmica criminal sobre fonte_inteligencia.

Lê fonte_inteligencia (já populada pelos ETLs) e produz
extracao_dinamica_criminal + filhos via Claude.

Pula linhas que já têm extração para a versao_prompt atual. Use --reextract
para forçar reprocessamento.

Exemplos:
    uv run python scripts/ingest_dynamics.py --source relint
    uv run python scripts/ingest_dynamics.py --source disque_denuncia --limit 50
    uv run python scripts/ingest_dynamics.py --source all --reextract
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Iterator
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from supabase import Client, create_client  # noqa: E402

from app.config.settings import Settings  # noqa: E402
from app.dao.dynamics_persistence_dao import (  # noqa: E402
    DynamicsPersistenceDao,
    PersistenceResult,
)
from app.service.criminal_dynamics_service import (  # noqa: E402
    CriminalDynamicsService,
    DynamicsExtractionInput,
    SourceType,
)

VALID_SOURCES = ("relint", "disque_denuncia", "ouvidoria", "rede_social", "all")
SOURCE_BATCH = 1000


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extração de dinâmica criminal sobre fonte_inteligencia.",
    )
    parser.add_argument("--source", choices=VALID_SOURCES, default="relint")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limite de fontes a processar.",
    )
    parser.add_argument(
        "--reextract",
        action="store_true",
        help="Reprocessa fontes que já têm extração na versao_prompt atual.",
    )
    args = parser.parse_args()
    asyncio.run(_run(args))


async def _run(args: argparse.Namespace) -> None:
    settings = Settings()
    client = _build_client(settings)
    persistence = DynamicsPersistenceDao(client)
    service = CriminalDynamicsService(settings)

    sources = list(_iter_sources(client, args.source, args.limit))
    if not args.reextract and sources:
        existing = _ids_with_extraction(
            client, service.prompt_version, [s["id"] for s in sources]
        )
        sources = [s for s in sources if s["id"] not in existing]

    print(
        json.dumps(
            {
                "source": args.source,
                "to_process": len(sources),
                "prompt_version": service.prompt_version,
                "model": service.model,
            },
            ensure_ascii=False,
        )
    )

    ok = 0
    failed = 0
    for source in sources:
        log: dict = {
            "fonte_id": source["id"],
            "tipo_fonte": source["tipo_fonte"],
            "id_registro_origem": source.get("id_registro_origem"),
        }
        try:
            body = DynamicsExtractionInput(
                source_type=SourceType(source["tipo_fonte"]),
                text=source["texto_narrativo"],
                source_id=source.get("id_registro_origem"),
                metadata=source.get("metadados") or {},
            )
            extraction = await service.extract(body)
            result = persistence.persist(
                fonte_id=source["id"],
                extraction=extraction,
                modelo=service.model,
                versao_prompt=service.prompt_version,
                area_id=source.get("area_id"),
            )
            log["extraction"] = _summarize(result)
            ok += 1
        except Exception as exc:
            log["error"] = f"{type(exc).__name__}: {exc}"
            failed += 1
        print(json.dumps(log, ensure_ascii=False))

    print(
        json.dumps({"summary": {"ok": ok, "failed": failed}}, ensure_ascii=False),
        file=sys.stderr,
    )


def _iter_sources(
    client: Client, source: str, limit: int | None
) -> Iterator[dict]:
    columns = "id, tipo_fonte, id_registro_origem, texto_narrativo, area_id, metadados"
    fetched = 0
    offset = 0
    while True:
        query = client.table("fonte_inteligencia").select(columns).order("criado_em")
        if source != "all":
            query = query.eq("tipo_fonte", source)
        page_size = SOURCE_BATCH if limit is None else min(SOURCE_BATCH, limit - fetched)
        if page_size <= 0:
            return
        rows = query.range(offset, offset + page_size - 1).execute().data or []
        if not rows:
            return
        for row in rows:
            yield row
            fetched += 1
            if limit is not None and fetched >= limit:
                return
        if len(rows) < page_size:
            return
        offset += len(rows)


def _ids_with_extraction(
    client: Client, versao_prompt: str, ids: list[str]
) -> set[str]:
    if not ids:
        return set()
    existing: set[str] = set()
    for start in range(0, len(ids), 500):
        batch = ids[start : start + 500]
        rows = (
            client.table("extracao_dinamica_criminal")
            .select("fonte_id")
            .eq("versao_prompt", versao_prompt)
            .in_("fonte_id", batch)
            .execute()
            .data
            or []
        )
        existing.update(r["fonte_id"] for r in rows)
    return existing


def _summarize(result: PersistenceResult) -> dict[str, object]:
    return {
        "extracao_id": result.extracao_id,
        "eventos": result.eventos,
        "rotas_fuga": result.rotas_fuga,
        "facilitadores": result.facilitadores,
        "pontos_receptacao": result.pontos_receptacao,
    }


def _build_client(settings: Settings) -> Client:
    if not settings.supabase_url or not settings.supabase_secret_key:
        print("Configure SUPABASE_URL e SUPABASE_SECRET_KEY.", file=sys.stderr)
        raise SystemExit(2)
    return create_client(str(settings.supabase_url).rstrip("/"), settings.supabase_secret_key)


if __name__ == "__main__":
    main()
