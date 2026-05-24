from dataclasses import dataclass
from typing import Any

from supabase import Client

from app.ingestion.base import NormalizedRecord


@dataclass(frozen=True)
class UpsertResult:
    fonte_id: str
    tipo_fonte: str
    id_registro_origem: str
    created: bool
    dedup_reason: str | None = None  # 'hash' | 'id_origem' | None


class FonteInteligenciaDao:
    """Upsert idempotente em fonte_inteligencia.

    Ordem de dedup:
      1. hash_conteudo (detecta arquivos renomeados / re-ingestão).
      2. (tipo_fonte, id_registro_origem) (mesmo arquivo, conteúdo editado).
    """

    table = "fonte_inteligencia"

    def __init__(self, client: Client) -> None:
        self._client = client

    def upsert(self, record: NormalizedRecord, *, area_id: str | None = None) -> UpsertResult:
        if record.hash_conteudo:
            hit = self._find_by_hash(record.tipo_fonte, record.hash_conteudo)
            if hit is not None:
                return UpsertResult(
                    fonte_id=hit["id"],
                    tipo_fonte=record.tipo_fonte,
                    id_registro_origem=record.id_registro_origem,
                    created=False,
                    dedup_reason="hash",
                )

        existing = self._find_by_origem(record.tipo_fonte, record.id_registro_origem)
        payload: dict[str, Any] = {
            "tipo_fonte": record.tipo_fonte,
            "id_registro_origem": record.id_registro_origem,
            "texto_narrativo": record.texto_narrativo,
            "hash_conteudo": record.hash_conteudo,
            "metadados": record.metadados,
        }
        if area_id is not None:
            payload["area_id"] = area_id

        if existing is None:
            inserted = self._client.table(self.table).insert(payload).execute().data or []
            return UpsertResult(
                fonte_id=inserted[0]["id"],
                tipo_fonte=record.tipo_fonte,
                id_registro_origem=record.id_registro_origem,
                created=True,
            )

        self._client.table(self.table).update(payload).eq("id", existing["id"]).execute()
        return UpsertResult(
            fonte_id=existing["id"],
            tipo_fonte=record.tipo_fonte,
            id_registro_origem=record.id_registro_origem,
            created=False,
            dedup_reason="id_origem",
        )

    def get_text(self, fonte_id: str) -> tuple[str, str | None] | None:
        rows = (
            self._client.table(self.table)
            .select("texto_narrativo, area_id")
            .eq("id", fonte_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            return None
        return rows[0]["texto_narrativo"], rows[0].get("area_id")

    def _find_by_hash(self, tipo_fonte: str, hash_conteudo: str) -> dict[str, Any] | None:
        rows = (
            self._client.table(self.table)
            .select("id, area_id")
            .eq("tipo_fonte", tipo_fonte)
            .eq("hash_conteudo", hash_conteudo)
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None

    def _find_by_origem(self, tipo_fonte: str, id_registro_origem: str) -> dict[str, Any] | None:
        rows = (
            self._client.table(self.table)
            .select("id, area_id")
            .eq("tipo_fonte", tipo_fonte)
            .eq("id_registro_origem", id_registro_origem)
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None
