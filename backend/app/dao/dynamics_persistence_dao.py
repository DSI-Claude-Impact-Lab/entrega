from dataclasses import dataclass
from typing import Any

from supabase import Client

from app.service.criminal_dynamics_service import (
    CriminalDynamicsExtraction,
    CriminalEvent,
    EscapeRoute,
    Facilitator,
)


@dataclass(frozen=True)
class PersistenceResult:
    extracao_id: str
    eventos: int
    rotas_fuga: int
    facilitadores: int
    pontos_receptacao: int


class DynamicsPersistenceDao:
    """Grava o resultado de CriminalDynamicsService nas tabelas derivadas."""

    def __init__(self, client: Client) -> None:
        self._client = client

    def persist(
        self,
        *,
        fonte_id: str,
        extraction: CriminalDynamicsExtraction,
        modelo: str | None,
        versao_prompt: str,
        area_id: str | None = None,
    ) -> PersistenceResult:
        extracao_row = {
            "fonte_id": fonte_id,
            "area_id": area_id,
            "resumo": extraction.summary,
            "confianca": extraction.confidence.value,
            "modelo": modelo,
            "versao_prompt": versao_prompt,
        }
        inserted = (
            self._client.table("extracao_dinamica_criminal")
            .insert(extracao_row)
            .execute()
            .data
            or []
        )
        if not inserted:
            raise RuntimeError("extracao_dinamica_criminal insert returned no rows")
        extracao_id: str = inserted[0]["id"]

        eventos = [_event_row(extracao_id, area_id, event) for event in extraction.events]
        rotas = [_route_row(extracao_id, area_id, route) for route in extraction.escape_routes]
        facilitadores = [
            _facilitator_row(extracao_id, area_id, item) for item in extraction.facilitators
        ]
        receptacoes = [
            _reception_row(extracao_id, area_id, local)
            for local in extraction.reception_points
            if local and local.strip()
        ]

        self._insert_many("evento_criminal", eventos)
        self._insert_many("rota_fuga", rotas)
        self._insert_many("facilitador", facilitadores)
        self._insert_many("ponto_receptacao", receptacoes)

        return PersistenceResult(
            extracao_id=extracao_id,
            eventos=len(eventos),
            rotas_fuga=len(rotas),
            facilitadores=len(facilitadores),
            pontos_receptacao=len(receptacoes),
        )

    def has_extraction(self, fonte_id: str, versao_prompt: str) -> bool:
        rows = (
            self._client.table("extracao_dinamica_criminal")
            .select("id")
            .eq("fonte_id", fonte_id)
            .eq("versao_prompt", versao_prompt)
            .limit(1)
            .execute()
            .data
            or []
        )
        return bool(rows)

    def _insert_many(self, table: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        self._client.table(table).insert(rows).execute()


def _event_row(
    extracao_id: str, area_id: str | None, event: CriminalEvent
) -> dict[str, Any]:
    evidence_text = event.evidence.text if event.evidence else None
    confidence = event.evidence.confidence.value if event.evidence else "medio"
    period = event.time_window.period.value if event.time_window else "nao_informado"
    return {
        "extracao_id": extracao_id,
        "area_id": area_id,
        "tipo_crime": event.crime_type.value,
        "modo_deslocamento": event.mobility_mode.value,
        "periodo_dia": period,
        "modus_operandi": event.modus_operandi,
        "evidencia_texto": evidence_text,
        "confianca": confidence,
    }


def _route_row(
    extracao_id: str, area_id: str | None, route: EscapeRoute
) -> dict[str, Any]:
    evidence_text = route.evidence.text if route.evidence else None
    confidence = route.evidence.confidence.value if route.evidence else "medio"
    return {
        "extracao_id": extracao_id,
        "area_id": area_id,
        "caminho": route.path or route.description,
        "destino": route.destination,
        "modo_deslocamento": route.mobility_mode.value,
        "evidencia_texto": evidence_text,
        "confianca": confidence,
    }


def _facilitator_row(
    extracao_id: str, area_id: str | None, facilitator: Facilitator
) -> dict[str, Any]:
    evidence_text = facilitator.evidence.text if facilitator.evidence else None
    confidence = facilitator.evidence.confidence.value if facilitator.evidence else "medio"
    return {
        "extracao_id": extracao_id,
        "area_id": area_id,
        "tipo_facilitador": facilitator.type.value,
        "orgao_responsavel": facilitator.responsible_agency.value,
        "descricao": facilitator.description,
        "evidencia_texto": evidence_text,
        "confianca": confidence,
    }


def _reception_row(extracao_id: str, area_id: str | None, local: str) -> dict[str, Any]:
    return {
        "extracao_id": extracao_id,
        "area_id": area_id,
        "local": local.strip(),
        "confianca": "medio",
    }
