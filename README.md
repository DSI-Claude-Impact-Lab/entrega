# Claude Impact Lab - Entrega

Repositório consolidado da entrega do projeto CompStat Rio desenvolvido no Claude Impact Lab.

## Equipe

- **Nome da equipe:** DSI PUC-Rio - Equipe 1
- **Tema:** Segurança
- **Membros:**
  - Caio Siqueira
  - Eduardo Zacour
  - Paulo Vítor Libório
  - Radhanama Mesiano

## Links

- Aplicação publicada: https://claude-impact-lab.gtec-dsi.net/
- API publicada: https://claude-impact-lab.gtec-dsi.net/api
- Vídeo: https://youtu.be/y1TIQUmFAiQ

## Visão Geral

O projeto entrega uma plataforma CompStat para apoiar análise territorial, preparação de reuniões e tomada de decisão em segurança urbana no Rio de Janeiro. A solução combina um frontend Vite/React com mapa interativo, um backend Python/FastAPI, armazenamento relacional no Supabase/Postgres e integrações de IA para assistência analítica.

O objetivo operacional é permitir que uma equipe selecione áreas da Força Municipal, visualize evidências georreferenciadas, consulte um assistente contextualizado por dados, gere insumos de relatório e organize reuniões CompStat com anexos, metas, decisões e ações.

## Screenshots

<img width="1538" height="912" alt="Screenshot 2026-05-24 at 15 50 02" src="https://github.com/user-attachments/assets/78860548-6f8a-460d-85ee-2fb5665739ed" />
<img width="1538" height="912" alt="Screenshot 2026-05-24 at 15 50 25" src="https://github.com/user-attachments/assets/d04d1710-2653-46dd-a56c-9d630d4cffc9" />
<img width="1538" height="912" alt="Screenshot 2026-05-24 at 15 50 38" src="https://github.com/user-attachments/assets/43f1d5da-1da5-49c5-8c26-e474f8fb3a14" />
<img width="1538" height="912" alt="Screenshot 2026-05-24 at 15 50 48" src="https://github.com/user-attachments/assets/586dd59b-8ad1-46b6-a2d3-91420a52106c" />
<img width="1538" height="912" alt="Screenshot 2026-05-24 at 15 51 02" src="https://github.com/user-attachments/assets/462fd5ec-0135-4e85-aa6c-39edcb7c9b1a" />
<img width="1538" height="912" alt="Screenshot 2026-05-24 at 15 51 08" src="https://github.com/user-attachments/assets/fcaa60f9-3d40-4d06-b5c3-6e30b4217093" />
<img width="1538" height="912" alt="Screenshot 2026-05-24 at 15 51 17" src="https://github.com/user-attachments/assets/569fe620-89b3-4584-9341-cfa93c40908a" />
<img width="1538" height="912" alt="Screenshot 2026-05-24 at 15 51 25" src="https://github.com/user-attachments/assets/7c155702-bc8e-4e64-b3f7-b83f4a0653b9" />


## Estrutura

```text
.
├── backend/   # API Python com FastAPI
├── frontend/  # Aplicação web React + TypeScript + Vite
├── scripts/   # Script para atualizar a cópia a partir dos repos de trabalho
└── SNAPSHOT.md
```

Este repositório não usa submódulos. Os conteúdos de `backend` e `frontend` foram copiados para dentro desta entrega.

## Aplicação

A versão ao vivo está disponível em:

```text
https://claude-impact-lab.gtec-dsi.net/
```

Principais telas e funcionalidades:

- mapa operacional com Google Maps, camadas geográficas e heatmaps;
- visualização de ocorrências, denúncias, câmeras, fatores urbanos, facilitadores e territórios de grupos criminais;
- seleção de áreas da Força Municipal com score de risco e relatório por área;
- assistente CompStat com Claude, usando contexto do mapa e dos dados carregados pela aplicação;
- CRM de reuniões CompStat com anexos, notas, metas, decisões, ações e chat contextual da reunião;
- painel de planejamento para acompanhar responsabilidades, prazos, status de ações e metas.

## Backend

O backend foi desenvolvido em Python com FastAPI e fica em `backend/`.

Responsabilidades principais:

- expor endpoints REST sob `/api`;
- carregar configurações por variáveis de ambiente;
- consultar e persistir dados no Supabase/Postgres;
- servir dados georreferenciados para o mapa;
- gerar relatórios de áreas da Força Municipal;
- integrar chamadas ao Claude via Anthropic API;
- integrar OCR e predições via Replicate;
- manter rotas de reuniões CompStat, anexos, mensagens, metas, decisões e ações;
- fornecer scripts de ETL para carregar bases estruturadas e migrações SQL documentadas.

Endpoints relevantes:

```text
GET  /api/health
GET  /api/config-check
POST /api/chat
POST /api/claude/infer
GET  /api/geo/cameras
GET  /api/geo/urban-factors
GET  /api/geo/facilitators
GET  /api/geo/orcrim
GET  /api/geo/heat
GET  /api/geo/denuncias/heat
GET  /api/geo/areas-fm
GET  /api/geo/areas-fm/{area_id}/report
GET  /api/meetings
POST /api/meetings
POST /api/meetings/{meeting_id}/attachments
POST /api/meetings/{meeting_id}/messages
POST /api/meetings/{meeting_id}/metas
POST /api/meetings/{meeting_id}/decisoes
POST /api/meetings/{meeting_id}/acoes
POST /api/ocr/glm
POST /api/replicate/predictions
```

### Rodando o Backend Localmente

Requisitos:

- Python 3.12 ou superior;
- `uv`;
- variáveis de ambiente preenchidas a partir de `backend/.env.example`.

Comandos:

```bash
cd backend
cp .env.example .env
uv sync
uv run uvicorn app.config.main:app --reload
```

Teste de saúde:

```bash
curl http://127.0.0.1:8000/api/health
```

## Frontend

O frontend foi desenvolvido em React, TypeScript e Vite e fica em `frontend/`.

Stack principal:

- React 19;
- TypeScript;
- Vite;
- Tailwind CSS v4;
- shadcn/ui-style components;
- Google Maps via `@vis.gl/react-google-maps`;
- Deck.gl para heatmaps;
- `react-markdown` para renderização das respostas do assistente.

### Rodando o Frontend Localmente

Requisitos:

- Node.js 24;
- npm;
- variáveis de ambiente preenchidas a partir de `frontend/.env.example`.

Comandos:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Para apontar para um backend local:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Build de produção:

```bash
npm run build
```

## Autenticação

A camada de autenticação foi implementada no backend e no frontend (login, sessão e proteção das rotas sensíveis da API), mas foi **desabilitada na versão de demonstração** publicada em `https://claude-impact-lab.gtec-dsi.net/` para facilitar a avaliação da banca e dos parceiros sem necessidade de credenciais. Em ambiente produtivo basta reativar o middleware de autenticação e o guard de rotas — o esquema permanece presente no código.

## Relatórios

O relatório por área da Força Municipal (`GET /api/geo/areas-fm/{area_id}/report` + exportação `.docx` no frontend em `frontend/src/lib/areaReportDocx.ts`) segue o **template definido nas regras do CompStat**: estrutura de seções, métricas de risco, evidências georreferenciadas, recomendações operacionais e formato de apresentação obedecem ao padrão CompStat fornecido como referência pelo programa, de modo que o documento gerado pela aplicação possa ser usado diretamente como insumo nas reuniões.

## Dados e IA

A solução usa Supabase/Postgres para persistência e consulta dos dados estruturados. O backend contém migrações SQL e scripts de ETL para organizar as bases em tabelas consultáveis pela API.

O uso de IA fica concentrado no backend para evitar exposição de chaves no navegador. O frontend envia perguntas e contexto operacional para a API, e o backend chama o Claude com instruções para responder em português, usar evidências disponíveis e não inventar dados ausentes. Também foram previstos fluxos de OCR e predições via Replicate para apoiar extração de informação de documentos e imagens.

## Ingestão de Dados

A ingestão foi desenhada para suportar fontes heterogêneas (RELINT, Disque Denúncia, Ouvidoria 1746, censo PSR, ocorrências, câmeras, fatores urbanos, facilitadores, áreas da Força Municipal, domínio territorial) sem acoplar a aplicação a um formato específico de origem.

Camadas:

- `app/etl/` — um módulo por fonte (`etl_relints.py`, `etl_disque_denuncia.py`, `etl_ouvidoria_1746.py`, `etl_ocorrencias.py`, `etl_cameras.py`, `etl_fatores_urbanos.py`, `etl_facilitador.py`, `etl_dominio_territorial.py`, `etl_censo_psr.py`, `etl_areas_fm.py`, `etl_fonte_inteligencia.py`). Cada ETL faz parse do dataset bruto, normaliza colunas e geometria, e grava em tabelas tipadas via `psycopg` em lotes (`DEFAULT_BATCH_SIZE = 1000`) para suportar cargas de 100k+ linhas;
- `app/ingestion/base.py` — define o contrato `SourceAdapter` e o `NormalizedRecord` (tipo_fonte, id_registro_origem, texto_narrativo, hash_conteudo, metadados, area_hint, occurred_at). Toda fonte textual nova precisa apenas implementar esse protocolo para se integrar ao pipeline;
- `fonte_inteligencia` — tabela única que consolida o material textual de qualquer fonte. O `hash_conteudo` garante idempotência e o `tipo_fonte` preserva a procedência. Isso permite que o pipeline downstream (extração de dinâmica criminal, busca, contexto do chat) trate todas as fontes pelo mesmo schema;
- `app/dao/` + migrações SQL em `backend/docs/migrations/` — schema versionado (`001_dynamics_ingestion.sql`, `002_fonte_hash.sql`, `003_orgao_responsabilidade.sql`, `004_compstat_meetings.sql`). Cada novo subdomínio entra como uma migração isolada, sem reescrita das anteriores;
- `scripts/ingest_dynamics.py` — orquestrador que lê `fonte_inteligencia`, envia para o serviço de extração com Claude e persiste `extracao_dinamica_criminal` + tabelas filhas (eventos, rotas de fuga, facilitadores, pontos de receptação). Suporta `--source`, `--limit`, `--reextract` e versiona o prompt (`versao_prompt`) para reprocessamentos controlados.

Esse desenho permite expansão e modularidade:

- **Nova fonte textual** = novo adapter implementando `SourceAdapter` + um ETL que grava em `fonte_inteligencia`. A extração de dinâmica, o chat e o mapa passam a enxergar a fonte automaticamente;
- **Nova base estruturada** = novo módulo `etl_*.py` + migração SQL própria + endpoint `geo` ou DAO correspondente. Nenhum ETL existente precisa ser tocado;
- **Nova versão de prompt** = bump em `versao_prompt` e re-execução com `--reextract`, mantendo o histórico das versões anteriores;
- **Idempotência** = `hash_conteudo` em `fonte_inteligencia` evita duplicação ao reprocessar dumps das fontes originais.

## Uso do Claude no Desenvolvimento

O projeto foi construído com apoio intensivo do Claude Code como par de programação:

- **Levantamento e design**: brainstorming do escopo CompStat, modelagem do schema (fonte unificada + tabelas por subdomínio), decisão por ETLs com `psycopg` direto em vez de PostgREST por performance em cargas em lote, e definição da divisão frontend/backend para manter as chaves de IA fora do navegador;
- **Geração de código**: estrutura do backend FastAPI (controllers, services, DAOs, integrations), adapters ETL por fonte, componentes do frontend React (mapa, heatmaps, painéis, CRM de reuniões), além de migrações SQL e workflows do GitHub Actions;
- **Refino iterativo**: revisão de PRs, identificação de bugs, ajuste de prompts do assistente, padronização de erros HTTP, e organização do repositório de entrega consolidada (este diretório);
- **Documentação**: README, `AGENTS.md`, comentários estratégicos em pontos não-óbvios (por exemplo, a justificativa do uso de `psycopg` em `app/etl/base.py`) e o material auxiliar usado pela equipe.

A escolha do Claude Code permitiu cobrir as quatro frentes (dados, backend, frontend, deploy) com uma equipe pequena dentro do prazo do laboratório.

## Uso do Claude no Chat do Sistema

O Claude também atua em tempo de execução dentro da própria aplicação, em dois fluxos distintos:

1. **Assistente CompStat (chat operacional)** — endpoint `POST /api/chat`, implementado em `app/service/chat_service.py`. O frontend envia o histórico de mensagens junto com o contexto operacional atual (área da Força Municipal selecionada, camadas ativas no mapa, reunião CompStat em foco). O backend monta um system prompt que (i) força resposta em português, (ii) restringe o modelo a usar apenas o contexto fornecido, (iii) pede que ele declare lacunas em vez de inventar dados, e (iv) injeta o `context` serializado em JSON antes da conversa. A chamada usa `AsyncAnthropic` em `app/integrations/claude_client.py`, com timeouts e mapeamento de erros para 502/504 quando a API externa falha;
2. **Chat contextual de reunião** — dentro do CRM de reuniões CompStat, cada reunião tem seu próprio thread (`POST /api/meetings/{meeting_id}/messages`). O contexto adicional inclui anexos, metas, decisões e ações da reunião, permitindo que o modelo apoie a preparação e o follow-up sem que o usuário precise repetir o estado da reunião;
3. **Extração estruturada offline** — `scripts/ingest_dynamics.py` + `app/service/criminal_dynamics_service.py` usam o Claude para transformar texto bruto de `fonte_inteligencia` (RELINT, Disque Denúncia, Ouvidoria, redes sociais) em registros estruturados de dinâmica criminal: eventos, rotas de fuga, facilitadores e pontos de receptação. A versão do prompt é versionada (`versao_prompt`) para permitir reprocessamento controlado quando o prompt evolui.

O modelo, a chave e os parâmetros (temperatura, max_tokens) ficam exclusivamente no backend; o frontend nunca conhece a credencial Anthropic.

## Deploy

A aplicação publicada foi implantada em servidor DigitalOcean com Caddy como proxy/servidor web.

Arquitetura de deploy:

- frontend compilado pelo Vite e servido em `/`;
- backend FastAPI servido sob `/api`;
- Caddy roteando frontend e API no mesmo domínio;
- systemd mantendo o processo da API;
- GitHub Actions executando testes/build e envio dos artefatos para o servidor;
- Supabase usado como banco gerenciado.

Nenhum segredo de deploy, chave de API, token ou senha está versionado neste repositório. Os arquivos `.env.example` documentam apenas os nomes das variáveis necessárias.
