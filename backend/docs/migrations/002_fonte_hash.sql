-- Migração 002: dedup de fontes não-estruturadas por hash do conteúdo.
-- Aplica para fonte_inteligencia (texto narrativo) e relint (arquivo).
-- Índices unique não-parciais para compatibilidade com ON CONFLICT.
-- NULL != NULL no Postgres, então linhas sem hash continuam sendo aceitas.

-- fonte_inteligencia: hash(texto_narrativo) por tipo_fonte
alter table fonte_inteligencia
  add column if not exists hash_conteudo text;

drop index if exists fonte_inteligencia_hash_unique;
create unique index if not exists fonte_inteligencia_hash_unique
  on fonte_inteligencia (tipo_fonte, hash_conteudo);

create index if not exists idx_fonte_inteligencia_hash
  on fonte_inteligencia (hash_conteudo);

-- relint: hash(texto_extraido) substitui arquivo_origem como chave de dedup,
-- para que renomear o arquivo não cause duplicata.
alter table relint
  add column if not exists hash_conteudo text;

alter table relint
  drop constraint if exists relint_arquivo_origem_key;

drop index if exists relint_hash_unique;
create unique index if not exists relint_hash_unique
  on relint (hash_conteudo);
