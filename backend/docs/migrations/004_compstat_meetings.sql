-- Migração 004: CRM de reuniões CompStat e plano de ação.
-- Idempotente. Sem autenticação/RLS para a demo.

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
