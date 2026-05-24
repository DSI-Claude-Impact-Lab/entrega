"""Data access layer (Supabase / Postgres)."""

from app.dao.supabase_dao import SupabaseDao, get_supabase_dao

__all__ = ["SupabaseDao", "get_supabase_dao"]
