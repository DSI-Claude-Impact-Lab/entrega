-- Migração 001: pipeline de ingestão de fontes não-estruturadas.
-- Idempotente. Aplicar uma única vez após compstat_schema.sql.

alter type tipo_fonte add value if not exists 'ouvidoria';
alter type tipo_fonte add value if not exists 'rede_social';

create unique index if not exists fonte_inteligencia_origem_unique
  on fonte_inteligencia (tipo_fonte, id_registro_origem)
  where id_registro_origem is not null;

create index if not exists idx_extracao_fonte_versao
  on extracao_dinamica_criminal (fonte_id, versao_prompt);
