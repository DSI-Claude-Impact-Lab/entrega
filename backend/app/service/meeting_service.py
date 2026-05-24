from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.config.settings import Settings


class MeetingService:
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
            self._ensure_schema(conn)
            yield conn
        finally:
            conn.close()

    def _ensure_schema(self, conn: psycopg.Connection) -> None:
        with conn.cursor() as cur:
            cur.execute(_SCHEMA_SQL)

    def list_meetings(self) -> list[dict[str, Any]]:
        with self._conn() as conn:
            return self._load_meetings(conn)

    def upsert_meeting(self, data: dict[str, Any]) -> dict[str, Any]:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into compstat_meeting (
                  id, titulo, data, local, participantes, areas_fm, notas, status
                ) values (
                  %(id)s::uuid, %(titulo)s, %(data)s, %(local)s, %(participantes)s,
                  %(areas_fm)s, %(notas)s, %(status)s
                )
                on conflict (id) do update set
                  titulo = excluded.titulo,
                  data = excluded.data,
                  local = excluded.local,
                  participantes = excluded.participantes,
                  areas_fm = excluded.areas_fm,
                  notas = excluded.notas,
                  status = excluded.status,
                  atualizada_em = now()
                """,
                _meeting_params(data),
            )
            return self.get_meeting(data["id"], conn=conn)

    def patch_meeting(self, meeting_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        allowed = {
            "titulo": "titulo",
            "data": "data",
            "local": "local",
            "participantes": "participantes",
            "areasFM": "areas_fm",
            "notas": "notas",
            "status": "status",
        }
        sets: list[str] = []
        params: dict[str, Any] = {"id": meeting_id}
        for key, column in allowed.items():
            if key in data:
                sets.append(f"{column} = %({column})s")
                params[column] = data[key]
        if not sets:
            return self.get_meeting(meeting_id)
        sets.append("atualizada_em = now()")
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"update compstat_meeting set {', '.join(sets)} where id = %(id)s::uuid",
                params,
            )
            return self.get_meeting(meeting_id, conn=conn)

    def delete_meeting(self, meeting_id: str) -> None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute("delete from compstat_meeting where id = %s::uuid", (meeting_id,))

    def upsert_child(
        self,
        table: str,
        meeting_id: str,
        item_id: str,
        data: dict[str, Any],
    ) -> dict[str, Any] | None:
        spec = _CHILD_SPECS[table]
        columns = ["id", "meeting_id", *spec]
        params = {"id": item_id, "meeting_id": meeting_id, **data}
        insert_cols = ", ".join(columns)
        placeholders = ", ".join(f"%({column})s" for column in columns)
        updates = ", ".join(f"{column} = excluded.{column}" for column in spec)
        if "atualizada_em" in spec:
            updates = f"{updates}, atualizada_em = now()"
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                insert into {table} ({insert_cols})
                values ({placeholders})
                on conflict (id) do update set {updates}
                """,
                params,
            )
            return self.get_meeting(meeting_id, conn=conn)

    def patch_child(
        self,
        table: str,
        meeting_id: str,
        item_id: str,
        data: dict[str, Any],
    ) -> dict[str, Any] | None:
        spec = set(_CHILD_SPECS[table])
        sets: list[str] = []
        params: dict[str, Any] = {"id": item_id, "meeting_id": meeting_id}
        for key, value in data.items():
            if key in spec:
                sets.append(f"{key} = %({key})s")
                params[key] = value
        if "atualizada_em" in spec:
            sets.append("atualizada_em = now()")
        if not sets:
            return self.get_meeting(meeting_id)
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                update {table}
                   set {", ".join(sets)}
                 where id = %(id)s::uuid and meeting_id = %(meeting_id)s::uuid
                """,
                params,
            )
            return self.get_meeting(meeting_id, conn=conn)

    def delete_child(self, table: str, meeting_id: str, item_id: str) -> dict[str, Any] | None:
        with self._conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"delete from {table} where id = %s::uuid and meeting_id = %s::uuid",
                (item_id, meeting_id),
            )
            return self.get_meeting(meeting_id, conn=conn)

    def get_meeting(
        self,
        meeting_id: str,
        *,
        conn: psycopg.Connection | None = None,
    ) -> dict[str, Any] | None:
        owns_conn = conn is None
        if owns_conn:
            ctx = self._conn()
            conn = ctx.__enter__()
        try:
            meetings = self._load_meetings(conn, meeting_id=meeting_id)
            return meetings[0] if meetings else None
        finally:
            if owns_conn:
                ctx.__exit__(None, None, None)

    def _load_meetings(
        self,
        conn: psycopg.Connection,
        *,
        meeting_id: str | None = None,
    ) -> list[dict[str, Any]]:
        where = "where id = %s::uuid" if meeting_id else ""
        params = (meeting_id,) if meeting_id else ()
        with conn.cursor() as cur:
            cur.execute(
                f"""
                select *
                  from compstat_meeting
                  {where}
                 order by data desc, criada_em desc
                """,
                params,
            )
            meetings = [_meeting_out(row) for row in cur.fetchall()]
            if not meetings:
                return []
            ids = [m["id"] for m in meetings]
            by_id = {m["id"]: m for m in meetings}
            for table, key, mapper in _LOAD_CHILDREN:
                cur.execute(
                    f"select * from {table} where meeting_id = any(%s::uuid[]) order by criada_em",
                    (ids,),
                )
                for row in cur.fetchall():
                    target = by_id[str(row["meeting_id"])]
                    if key in {"metas", "decisoes", "acoes"}:
                        target["plano"][key].append(mapper(row))
                    else:
                        target[key].append(mapper(row))
            return meetings


def _meeting_params(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": data["id"],
        "titulo": data.get("titulo") or "Reunião sem título",
        "data": data.get("data") or "",
        "local": data.get("local") or "",
        "participantes": data.get("participantes") or "",
        "areas_fm": data.get("areasFM") or [],
        "notas": data.get("notas") or "",
        "status": data.get("status") or "rascunho",
    }


def _iso(value: Any) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _meeting_out(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "titulo": row["titulo"],
        "data": row["data"],
        "local": row["local"],
        "participantes": row["participantes"],
        "areasFM": row["areas_fm"] or [],
        "notas": row["notas"],
        "anexos": [],
        "mensagens": [],
        "plano": {"metas": [], "decisoes": [], "acoes": []},
        "status": row["status"],
        "criadaEm": _iso(row["criada_em"]),
        "atualizadaEm": _iso(row["atualizada_em"]),
    }


def _attachment_out(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "nome": row["nome"],
        "tipo": row["tipo"],
        "tamanho": row["tamanho"],
        "conteudo": row["conteudo"],
        "ehTexto": row["eh_texto"],
        "criadoEm": _iso(row["criada_em"]),
    }


def _message_out(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "role": row["role"],
        "content": row["content"],
        "ts": _iso(row["ts"]),
    }


def _meta_out(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "titulo": row["titulo"],
        "metrica": row["metrica"],
        "responsavel": row["responsavel"],
        "prazo": row["prazo"],
        "status": row["status"],
        "criadaEm": _iso(row["criada_em"]),
        "atualizadaEm": _iso(row["atualizada_em"]),
    }


def _decisao_out(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "titulo": row["titulo"],
        "contexto": row["contexto"],
        "responsavel": row["responsavel"],
        "criadaEm": _iso(row["criada_em"]),
    }


def _acao_out(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "titulo": row["titulo"],
        "descricao": row["descricao"],
        "responsavel": row["responsavel"],
        "orgao": row["orgao"],
        "prazo": row["prazo"],
        "status": row["status"],
        "areaFM": row["area_fm"],
        "criadaEm": _iso(row["criada_em"]),
        "atualizadaEm": _iso(row["atualizada_em"]),
    }


_CHILD_SPECS = {
    "compstat_meeting_attachment": ("nome", "tipo", "tamanho", "conteudo", "eh_texto"),
    "compstat_meeting_message": ("role", "content", "ts"),
    "compstat_meeting_meta": ("titulo", "metrica", "responsavel", "prazo", "status"),
    "compstat_meeting_decision": ("titulo", "contexto", "responsavel"),
    "compstat_meeting_action": (
        "titulo",
        "descricao",
        "responsavel",
        "orgao",
        "prazo",
        "status",
        "area_fm",
    ),
}

_LOAD_CHILDREN = (
    ("compstat_meeting_attachment", "anexos", _attachment_out),
    ("compstat_meeting_message", "mensagens", _message_out),
    ("compstat_meeting_meta", "metas", _meta_out),
    ("compstat_meeting_decision", "decisoes", _decisao_out),
    ("compstat_meeting_action", "acoes", _acao_out),
)


_SCHEMA_SQL = """
create table if not exists compstat_meeting (
  id uuid primary key,
  titulo text not null,
  data text not null default '',
  local text not null default '',
  participantes text not null default '',
  areas_fm text[] not null default '{}',
  notas text not null default '',
  status text not null default 'rascunho'
    check (status in ('rascunho', 'agendada', 'concluida')),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create table if not exists compstat_meeting_attachment (
  id uuid primary key,
  meeting_id uuid not null references compstat_meeting(id) on delete cascade,
  nome text not null,
  tipo text not null default '',
  tamanho int not null default 0,
  conteudo text not null default '',
  eh_texto boolean not null default false,
  criada_em timestamptz not null default now()
);

create table if not exists compstat_meeting_message (
  id uuid primary key,
  meeting_id uuid not null references compstat_meeting(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  ts timestamptz not null default now(),
  criada_em timestamptz not null default now()
);

create table if not exists compstat_meeting_meta (
  id uuid primary key,
  meeting_id uuid not null references compstat_meeting(id) on delete cascade,
  titulo text not null,
  metrica text not null default '',
  responsavel text not null default '',
  prazo text not null default '',
  status text not null default 'pendente'
    check (status in ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create table if not exists compstat_meeting_decision (
  id uuid primary key,
  meeting_id uuid not null references compstat_meeting(id) on delete cascade,
  titulo text not null,
  contexto text not null default '',
  responsavel text not null default '',
  criada_em timestamptz not null default now()
);

create table if not exists compstat_meeting_action (
  id uuid primary key,
  meeting_id uuid not null references compstat_meeting(id) on delete cascade,
  titulo text not null,
  descricao text not null default '',
  responsavel text not null default '',
  orgao text not null default '',
  prazo text not null default '',
  area_fm text not null default '',
  status text not null default 'pendente'
    check (status in ('pendente', 'em_andamento', 'concluida', 'bloqueada', 'cancelada')),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index if not exists idx_compstat_meeting_data on compstat_meeting(data);
create index if not exists idx_compstat_meeting_attachment_meeting
  on compstat_meeting_attachment(meeting_id);
create index if not exists idx_compstat_meeting_message_meeting
  on compstat_meeting_message(meeting_id, criada_em);
create index if not exists idx_compstat_meeting_meta_meeting
  on compstat_meeting_meta(meeting_id, status);
create index if not exists idx_compstat_meeting_decision_meeting
  on compstat_meeting_decision(meeting_id);
create index if not exists idx_compstat_meeting_action_meeting
  on compstat_meeting_action(meeting_id, status, orgao);
"""
