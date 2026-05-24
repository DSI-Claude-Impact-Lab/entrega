"""CLI entry point for CompStat ETLs.

Usage:
    uv run python -m app.etl.cli apply-schema
    uv run python -m app.etl.cli list-tables
    uv run python -m app.etl.cli run <dataset>
    uv run python -m app.etl.cli run-all
    uv run python -m app.etl.cli drop-all          # destructive

Datasets, in dependency order:
    areas_fm, cameras, dominio_territorial, fatores_urbanos,
    ocorrencias, disque_denuncia, censo_psr, relints,
    facilitador (derived from fator_urbano),
    fonte_inteligencia (derived from relint + denuncia_disque)
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections.abc import Callable

from app.config.settings import Settings, get_settings
from app.etl import apply_schema as apply_schema_mod
from app.etl import (
    etl_areas_fm,
    etl_cameras,
    etl_censo_psr,
    etl_disque_denuncia,
    etl_dominio_territorial,
    etl_facilitador,
    etl_fatores_urbanos,
    etl_fonte_inteligencia,
    etl_ocorrencias,
    etl_ouvidoria_1746,
    etl_relints,
)

DATASETS: dict[str, Callable[[Settings], None]] = {
    "areas_fm": etl_areas_fm.run,
    "cameras": etl_cameras.run,
    "ocorrencias": etl_ocorrencias.run,
    "disque_denuncia": etl_disque_denuncia.run,
    "fatores_urbanos": etl_fatores_urbanos.run,
    "dominio_territorial": etl_dominio_territorial.run,
    "censo_psr": etl_censo_psr.run,
    "relints": etl_relints.run,
    "facilitador": etl_facilitador.run,
    "fonte_inteligencia": etl_fonte_inteligencia.run,
    "ouvidoria_1746": etl_ouvidoria_1746.run,
}

# `run-all` runs the structured-data ETLs in FK order. Unstructured sources
# (relints, ouvidoria, redes sociais) and derived tables that depend on them
# (fonte_inteligencia) must be triggered with `run <dataset>` after the
# corresponding upstream is loaded.
DEFAULT_RUN_ORDER = [
    "areas_fm",
    "cameras",
    "dominio_territorial",
    "fatores_urbanos",
    "ocorrencias",
    "disque_denuncia",
    "censo_psr",
    "facilitador",
]


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def cmd_apply_schema(_: argparse.Namespace) -> int:
    apply_schema_mod.apply_schema()
    return 0


def cmd_list_tables(_: argparse.Namespace) -> int:
    tables = apply_schema_mod.list_tables()
    for t in tables:
        print(t)
    return 0


def cmd_drop_all(args: argparse.Namespace) -> int:
    if not args.yes:
        print("Refusing to drop without --yes.", file=sys.stderr)
        return 2
    apply_schema_mod.drop_all()
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    settings = get_settings()
    if args.dataset not in DATASETS:
        print(f"Unknown dataset: {args.dataset}", file=sys.stderr)
        print(f"Available: {', '.join(sorted(DATASETS))}", file=sys.stderr)
        return 2
    DATASETS[args.dataset](settings)
    return 0


def cmd_run_all(_: argparse.Namespace) -> int:
    settings = get_settings()
    for name in DEFAULT_RUN_ORDER:
        logging.info("=== running %s ===", name)
        DATASETS[name](settings)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="compstat-etl")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("apply-schema", help="Run docs/compstat_schema.sql against the DB").set_defaults(
        func=cmd_apply_schema
    )
    sub.add_parser("list-tables", help="List public tables in the DB").set_defaults(
        func=cmd_list_tables
    )

    drop = sub.add_parser("drop-all", help="DROP every CompStat table and enum (dev only)")
    drop.add_argument("--yes", action="store_true", help="confirm destructive action")
    drop.set_defaults(func=cmd_drop_all)

    run = sub.add_parser("run", help="Run a single dataset ETL")
    run.add_argument("dataset", choices=sorted(DATASETS))
    run.set_defaults(func=cmd_run)

    sub.add_parser("run-all", help="Run all dataset ETLs in dependency order").set_defaults(
        func=cmd_run_all
    )

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _setup_logging(args.verbose)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
