-- DDL simplificado do modelo CompStat Rio.
-- Baseado em docs/compstat_data_model_simple.mmd.
-- Alvo: PostgreSQL / Supabase com PostGIS.

create extension if not exists pgcrypto;
create extension if not exists postgis;

create type tipo_fonte as enum (
  'relint',
  'disque_denuncia',
  'ouvidoria',
  'rede_social',
  'ocorrencia',
  'fator_urbano',
  'camera',
  'dominio_territorial',
  'psr_censo',
  'outro'
);

create type tipo_crime as enum (
  'furto',
  'roubo',
  'roubo_celular',
  'roubo_coletivo',
  'suspeita_roubo_furto',
  'trafico_drogas',
  'consumo_drogas',
  'outro',
  'nao_informado'
);

create type modo_deslocamento as enum (
  'a_pe',
  'moto',
  'bicicleta',
  'carro',
  'transporte_publico',
  'grupo',
  'nao_informado'
);

create type periodo_dia as enum (
  'madrugada',
  'manha',
  'pico_manha',
  'tarde',
  'pico_tarde',
  'noite',
  'fim_de_semana',
  'nao_informado'
);

create type tipo_facilitador as enum (
  'fuga',
  'visibilidade',
  'iluminacao',
  'obstrucao',
  'aglomeracao',
  'desordem_urbana',
  'receptacao',
  'mobilidade',
  'ponto_cego_camera',
  'vegetacao',
  'psr',
  'comercio_irregular',
  'retencao_trafego',
  'barreira_fisica_vulneravel',
  'tapume',
  'mobiliario',
  'outro',
  'nao_informado'
);

create type orgao_responsavel as enum (
  'COMLURB',
  'RioLuz',
  'SEOP',
  'SECONSERVA',
  'CET-Rio',
  'GM-Rio',
  'SMAS',
  'SMTR',
  'outro',
  'nao_informado'
);

create type nivel_confianca as enum (
  'baixo',
  'medio',
  'alto'
);

create type dominio_orcrim as enum (
  'CV',
  'TCP',
  'ADA',
  'Milicia'
);

create type status_recomendacao as enum (
  'rascunho',
  'validada',
  'em_execucao',
  'concluida',
  'descartada'
);

-- area_fm.geometria é nullable: o seed inicial parte só dos nomes de área
-- (cameras_areas_fm, fatores_urbanos.subarea_nome). Os polígonos são
-- carregados depois (ex.: shapefile ou união convexa dos pontos).
create table area_fm (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  geometria geography(Geometry, 4326),
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create table ocorrencia_criminal (
  id_hash text primary key,
  area_id uuid references area_fm(id) on delete set null,
  ano int,
  mes int,
  tipo_crime tipo_crime not null default 'nao_informado',
  descricao_delito text,
  data_fato date,
  hora_fato int check (hora_fato between 0 and 23),
  geometria geography(Point, 4326),
  metadados jsonb not null default '{}'::jsonb,
  importado_em timestamptz not null default now()
);

create table denuncia_disque (
  id_denuncia_origem text primary key,
  area_id uuid references area_fm(id) on delete set null,
  numero_denuncia text,
  data_denuncia timestamptz,
  data_difusao timestamptz,
  bairro text,
  classe text,
  tipo_denuncia text,
  assunto_principal text,
  status_denuncia text,
  relato_redigido text,
  geometria geography(Point, 4326),
  metadados jsonb not null default '{}'::jsonb,
  importado_em timestamptz not null default now()
);

create table relint (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references area_fm(id) on delete set null,
  arquivo_origem text not null,
  texto_extraido text not null,
  hash_conteudo text,
  metadados jsonb not null default '{}'::jsonb,
  importado_em timestamptz not null default now()
);

create table fator_urbano (
  id bigint primary key,
  area_id uuid references area_fm(id) on delete set null,
  tipo_facilitador tipo_facilitador not null default 'nao_informado',
  orgao_responsavel orgao_responsavel not null default 'nao_informado',
  tipo_ocorrencia text not null,
  descricao text,
  geometria geography(Point, 4326),
  metadados jsonb not null default '{}'::jsonb,
  importado_em timestamptz not null default now()
);

create table camera (
  id uuid primary key,
  area_id uuid references area_fm(id) on delete set null,
  id_trecho text,
  geometria geography(Point, 4326),
  metadados jsonb not null default '{}'::jsonb,
  importado_em timestamptz not null default now()
);

-- Sem unique(grupo, nome): um mesmo território aparece várias vezes na
-- fonte quando a área é descontínua (polígonos separados). Re-runs do ETL
-- usam TRUNCATE + INSERT para manter idempotência.
create table dominio_territorial (
  id uuid primary key default gen_random_uuid(),
  grupo_dominio dominio_orcrim not null,
  nome_territorio text not null,
  geometria geography(Geometry, 4326) not null,
  metadados jsonb not null default '{}'::jsonb,
  importado_em timestamptz not null default now()
);

create table censo_psr (
  chave_origem text primary key,
  area_id uuid references area_fm(id) on delete set null,
  ano_censo int,
  geometria geography(Point, 4326),
  metadados jsonb not null default '{}'::jsonb,
  importado_em timestamptz not null default now()
);

create table fonte_inteligencia (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references area_fm(id) on delete set null,
  tipo_fonte tipo_fonte not null,
  id_registro_origem text,
  texto_narrativo text not null,
  hash_conteudo text,
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create table extracao_dinamica_criminal (
  id uuid primary key default gen_random_uuid(),
  fonte_id uuid not null references fonte_inteligencia(id) on delete cascade,
  area_id uuid references area_fm(id) on delete set null,
  resumo text not null,
  confianca nivel_confianca not null default 'medio',
  modelo text,
  versao_prompt text not null default 'dinamica_criminal_v1',
  criado_em timestamptz not null default now()
);

create table evento_criminal (
  id uuid primary key default gen_random_uuid(),
  extracao_id uuid not null references extracao_dinamica_criminal(id) on delete cascade,
  area_id uuid references area_fm(id) on delete set null,
  tipo_crime tipo_crime not null default 'nao_informado',
  modo_deslocamento modo_deslocamento not null default 'nao_informado',
  periodo_dia periodo_dia not null default 'nao_informado',
  modus_operandi text,
  evidencia_texto text,
  confianca nivel_confianca not null default 'medio',
  criado_em timestamptz not null default now()
);

create table rota_fuga (
  id uuid primary key default gen_random_uuid(),
  extracao_id uuid not null references extracao_dinamica_criminal(id) on delete cascade,
  area_id uuid references area_fm(id) on delete set null,
  caminho text,
  destino text,
  modo_deslocamento modo_deslocamento not null default 'nao_informado',
  evidencia_texto text,
  confianca nivel_confianca not null default 'medio',
  criado_em timestamptz not null default now()
);

create table facilitador (
  id uuid primary key default gen_random_uuid(),
  extracao_id uuid references extracao_dinamica_criminal(id) on delete cascade,
  fator_urbano_id bigint references fator_urbano(id) on delete set null,
  area_id uuid references area_fm(id) on delete set null,
  tipo_facilitador tipo_facilitador not null,
  orgao_responsavel orgao_responsavel not null default 'nao_informado',
  descricao text not null,
  evidencia_texto text,
  confianca nivel_confianca not null default 'medio',
  criado_em timestamptz not null default now(),
  constraint facilitador_tem_origem check (
    extracao_id is not null or fator_urbano_id is not null
  )
);

create table ponto_receptacao (
  id uuid primary key default gen_random_uuid(),
  extracao_id uuid not null references extracao_dinamica_criminal(id) on delete cascade,
  area_id uuid references area_fm(id) on delete set null,
  local text not null,
  evidencia_texto text,
  confianca nivel_confianca not null default 'medio',
  criado_em timestamptz not null default now()
);

create table sinal_risco_area (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references area_fm(id) on delete cascade,
  fonte_sinal tipo_fonte not null,
  tipo_sinal text not null,
  orgao_responsavel orgao_responsavel not null default 'nao_informado',
  pontuacao numeric(8, 2) not null check (pontuacao >= 0),
  descricao text,
  criado_em timestamptz not null default now()
);

-- Source of truth: tipo_facilitador → órgão responsável (matriz do briefing).
-- Usado pra normalizar orgao_responsavel em facilitador, fator_urbano,
-- sinal_risco_area e recomendacao_acao.
create table dim_orgao_responsabilidade (
  tipo_facilitador tipo_facilitador primary key,
  orgao_responsavel orgao_responsavel not null,
  contexto text,
  observacao text
);

create table recomendacao_acao (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references area_fm(id) on delete cascade,
  sinal_risco_id uuid references sinal_risco_area(id) on delete set null,
  orgao_responsavel orgao_responsavel not null default 'nao_informado',
  acao text not null,
  status status_recomendacao not null default 'rascunho',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table compstat_meeting (
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

create table compstat_meeting_attachment (
  id uuid primary key,
  meeting_id uuid not null references compstat_meeting(id) on delete cascade,
  nome text not null,
  tipo text not null default '',
  tamanho int not null default 0,
  conteudo text not null default '',
  eh_texto boolean not null default false,
  criada_em timestamptz not null default now()
);

create table compstat_meeting_message (
  id uuid primary key,
  meeting_id uuid not null references compstat_meeting(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  ts timestamptz not null default now(),
  criada_em timestamptz not null default now()
);

create table compstat_meeting_meta (
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

create table compstat_meeting_decision (
  id uuid primary key,
  meeting_id uuid not null references compstat_meeting(id) on delete cascade,
  titulo text not null,
  contexto text not null default '',
  responsavel text not null default '',
  criada_em timestamptz not null default now()
);

create table compstat_meeting_action (
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

-- Auditoria de execução de ETLs. Cada run do CLI grava aqui um registro.
create table etl_run (
  id uuid primary key default gen_random_uuid(),
  dataset text not null,
  source_path text,
  status text not null check (status in ('running', 'ok', 'failed')),
  rows_read int not null default 0,
  rows_inserted int not null default 0,
  rows_skipped int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadados jsonb not null default '{}'::jsonb
);

create index idx_area_fm_geometria on area_fm using gist (geometria);

create index idx_ocorrencia_area on ocorrencia_criminal (area_id);
create index idx_ocorrencia_ano_mes on ocorrencia_criminal (ano, mes);
create index idx_ocorrencia_tipo_crime on ocorrencia_criminal (tipo_crime);
create index idx_ocorrencia_data_hora on ocorrencia_criminal (data_fato, hora_fato);
create index idx_ocorrencia_geometria on ocorrencia_criminal using gist (geometria);

create index idx_denuncia_area on denuncia_disque (area_id);
create index idx_denuncia_data on denuncia_disque (data_denuncia);
create index idx_denuncia_tipo on denuncia_disque (tipo_denuncia);
create index idx_denuncia_classe on denuncia_disque (classe);
create index idx_denuncia_geometria on denuncia_disque using gist (geometria);

create index idx_relint_area on relint (area_id);
create index idx_relint_arquivo on relint (arquivo_origem);
create unique index relint_hash_unique on relint (hash_conteudo);

create index idx_fator_area on fator_urbano (area_id);
create index idx_fator_tipo on fator_urbano (tipo_facilitador);
create index idx_fator_orgao on fator_urbano (orgao_responsavel);
create index idx_fator_geometria on fator_urbano using gist (geometria);

create index idx_camera_area on camera (area_id);
create index idx_camera_trecho on camera (id_trecho);
create index idx_camera_geometria on camera using gist (geometria);

create index idx_dominio_grupo on dominio_territorial (grupo_dominio);
create index idx_dominio_geometria on dominio_territorial using gist (geometria);

create index idx_censo_psr_area on censo_psr (area_id);
create index idx_censo_psr_ano on censo_psr (ano_censo);
create index idx_censo_psr_geometria on censo_psr using gist (geometria);

create index idx_fonte_inteligencia_area on fonte_inteligencia (area_id);
create index idx_fonte_inteligencia_tipo on fonte_inteligencia (tipo_fonte);
create index idx_fonte_inteligencia_origem on fonte_inteligencia (tipo_fonte, id_registro_origem);
create unique index fonte_inteligencia_origem_unique
  on fonte_inteligencia (tipo_fonte, id_registro_origem)
  where id_registro_origem is not null;
create unique index fonte_inteligencia_hash_unique
  on fonte_inteligencia (tipo_fonte, hash_conteudo);
create index idx_fonte_inteligencia_hash on fonte_inteligencia (hash_conteudo);

create index idx_extracao_area on extracao_dinamica_criminal (area_id);
create index idx_extracao_fonte on extracao_dinamica_criminal (fonte_id);
create index idx_extracao_confianca on extracao_dinamica_criminal (confianca);
create index idx_extracao_fonte_versao on extracao_dinamica_criminal (fonte_id, versao_prompt);

create index idx_evento_extracao on evento_criminal (extracao_id);
create index idx_evento_area on evento_criminal (area_id);
create index idx_evento_filtros on evento_criminal (tipo_crime, modo_deslocamento, periodo_dia);

create index idx_rota_extracao on rota_fuga (extracao_id);
create index idx_rota_area on rota_fuga (area_id);
create index idx_rota_modo on rota_fuga (modo_deslocamento);

create index idx_facilitador_extracao on facilitador (extracao_id);
create index idx_facilitador_fator on facilitador (fator_urbano_id);
create index idx_facilitador_area on facilitador (area_id);
create index idx_facilitador_filtros on facilitador (tipo_facilitador, orgao_responsavel);

create index idx_receptacao_extracao on ponto_receptacao (extracao_id);
create index idx_receptacao_area on ponto_receptacao (area_id);

create index idx_sinal_area on sinal_risco_area (area_id);
create index idx_sinal_fonte_tipo on sinal_risco_area (fonte_sinal, tipo_sinal);
create index idx_sinal_pontuacao on sinal_risco_area (pontuacao desc);
create index idx_sinal_orgao on sinal_risco_area (orgao_responsavel);

create index idx_recomendacao_area on recomendacao_acao (area_id);
create index idx_recomendacao_sinal on recomendacao_acao (sinal_risco_id);
create index idx_recomendacao_orgao_status on recomendacao_acao (orgao_responsavel, status);

create index idx_compstat_meeting_data on compstat_meeting(data);
create index idx_compstat_meeting_attachment_meeting
  on compstat_meeting_attachment(meeting_id);
create index idx_compstat_meeting_message_meeting
  on compstat_meeting_message(meeting_id, criada_em);
create index idx_compstat_meeting_meta_meeting
  on compstat_meeting_meta(meeting_id, status);
create index idx_compstat_meeting_decision_meeting
  on compstat_meeting_decision(meeting_id);
create index idx_compstat_meeting_action_meeting
  on compstat_meeting_action(meeting_id, status, orgao);

create index idx_etl_run_dataset on etl_run (dataset, started_at desc);
create index idx_etl_run_status on etl_run (status);
