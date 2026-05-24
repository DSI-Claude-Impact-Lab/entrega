from functools import lru_cache
from typing import Any

from fastapi import Depends, HTTPException, status
from supabase import Client, create_client

from app.config.settings import Settings, get_settings


class SupabaseDao:
    """Thin generic CRUD wrapper around supabase-py.

    Services should use this for table access instead of touching the
    Supabase client directly. Server-side calls use the service-role key,
    so RLS is bypassed — services are responsible for any per-user
    authorization checks.
    """

    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_url or not settings.supabase_secret_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supabase is not configured",
            )
        self._client: Client = create_client(
            str(settings.supabase_url).rstrip("/"),
            settings.supabase_secret_key,
        )

    @property
    def client(self) -> Client:
        return self._client

    def select(
        self,
        table: str,
        *,
        columns: str = "*",
        filters: dict[str, Any] | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        query = self._client.table(table).select(columns)
        for column, value in (filters or {}).items():
            query = query.eq(column, value)
        if limit is not None:
            query = query.limit(limit)
        return query.execute().data or []

    def insert(
        self,
        table: str,
        row: dict[str, Any] | list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return self._client.table(table).insert(row).execute().data or []

    def update(
        self,
        table: str,
        *,
        match: dict[str, Any],
        values: dict[str, Any],
    ) -> list[dict[str, Any]]:
        query = self._client.table(table).update(values)
        for column, value in match.items():
            query = query.eq(column, value)
        return query.execute().data or []

    def delete(self, table: str, *, match: dict[str, Any]) -> list[dict[str, Any]]:
        query = self._client.table(table).delete()
        for column, value in match.items():
            query = query.eq(column, value)
        return query.execute().data or []


@lru_cache
def _build_dao(settings: Settings) -> SupabaseDao:
    return SupabaseDao(settings)


def get_supabase_dao(settings: Settings = Depends(get_settings)) -> SupabaseDao:
    return _build_dao(settings)
