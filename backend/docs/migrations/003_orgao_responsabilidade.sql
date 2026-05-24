-- Migração 003: tabela de referência tipo_facilitador → órgão responsável
-- + backfill consolidado de orgao_responsavel onde está nao_informado.
-- Idempotente.

-- 1. Tabela de referência (source of truth do briefing).
create table if not exists dim_orgao_responsabilidade (
  tipo_facilitador tipo_facilitador primary key,
  orgao_responsavel orgao_responsavel not null,
  contexto text,
  observacao text
);

-- 2. Coluna orgao_responsavel em sinal_risco_area (faltava).
alter table sinal_risco_area
  add column if not exists orgao_responsavel orgao_responsavel
    not null default 'nao_informado';

create index if not exists idx_sinal_orgao
  on sinal_risco_area (orgao_responsavel);

-- 3. Seed do dim_orgao_responsabilidade (matriz do briefing).
insert into dim_orgao_responsabilidade (tipo_facilitador, orgao_responsavel, contexto, observacao) values
  ('iluminacao',                 'RioLuz',     null,                 'Iluminação pública (matriz briefing)'),
  ('vegetacao',                  'COMLURB',    null,                 'Manejo arbóreo / vegetação obstruindo visão'),
  ('desordem_urbana',            'COMLURB',    null,                 'Lixo/entulho, limpeza de logradouros'),
  ('mobilidade',                 'SEOP',       'estacionamento',     'Estacionamento irregular forçando pedestre à pista'),
  ('retencao_trafego',           'CET-Rio',    null,                 'Pontos de retenção de tráfego'),
  ('aglomeracao',                'SMTR',       'transporte_publico', 'Ponto de ônibus / aglomeração no transporte'),
  ('obstrucao',                  'SECONSERVA', null,                 'Calçada estreita, mobiliário desviando pedestre'),
  ('mobiliario',                 'SECONSERVA', null,                 'Refúgio: mobiliário abandonado'),
  ('tapume',                     'SECONSERVA', null,                 'Refúgio: tapumes'),
  ('barreira_fisica_vulneravel', 'SECONSERVA', null,                 'Grade aberta, vão usado pra fuga'),
  ('comercio_irregular',         'SEOP',       null,                 'Ambulante sem licença obstruindo'),
  ('psr',                        'SMAS',       null,                 'Pessoa em situação de rua'),
  ('ponto_cego_camera',          'GM-Rio',     null,                 'Câmera ausente / pendência CIVITAS'),
  ('receptacao',                 'SEOP',       null,                 'Receptação / comércio irregular'),
  ('visibilidade',               'SECONSERVA', null,                 'Visibilidade reduzida — escopo SECONSERVA'),
  ('fuga',                       'GM-Rio',     null,                 'Aspectos operacionais de fuga'),
  ('outro',                      'outro',      null,                 'Genérico'),
  ('nao_informado',              'nao_informado', null,              'Placeholder')
on conflict (tipo_facilitador) do update
  set orgao_responsavel = excluded.orgao_responsavel,
      contexto = excluded.contexto,
      observacao = excluded.observacao;

-- 4. Backfill: sinal_risco_area
update sinal_risco_area s
   set orgao_responsavel = d.orgao_responsavel
  from dim_orgao_responsabilidade d
 where s.tipo_sinal = d.tipo_facilitador::text
   and s.orgao_responsavel = 'nao_informado';

-- 5. Backfill: facilitador (extrações Claude com órgão não inferido)
update facilitador f
   set orgao_responsavel = d.orgao_responsavel
  from dim_orgao_responsabilidade d
 where f.tipo_facilitador = d.tipo_facilitador
   and f.orgao_responsavel = 'nao_informado';

-- 6. Backfill: fator_urbano (CSV original com órgão vazio)
update fator_urbano fu
   set orgao_responsavel = d.orgao_responsavel
  from dim_orgao_responsabilidade d
 where fu.tipo_facilitador = d.tipo_facilitador
   and fu.orgao_responsavel = 'nao_informado';
