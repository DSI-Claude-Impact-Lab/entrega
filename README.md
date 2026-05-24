# Claude Impact Lab - Entrega

Repositório consolidado da entrega do projeto CompStat Rio desenvolvido no Claude Impact Lab.

## Equipe

- **Nome da equipe:** DSI PUC-Rio - Equipe 1
- **Tema:** Segurança
- **Membros:**
  - Caio Siqueira
  - Eduardo Zacour
  - Paulo Vítor Libório
  - Radhanama Messiano

## Links

- Aplicação publicada: https://claude-impact-lab.gtec-dsi.net/
- API publicada: https://claude-impact-lab.gtec-dsi.net/api
- Vídeo: https://youtu.be/y1TIQUmFAiQ

## Visão Geral

O projeto entrega uma plataforma CompStat para apoiar análise territorial, preparação de reuniões e tomada de decisão em segurança urbana no Rio de Janeiro. A solução combina um frontend Vite/React com mapa interativo, um backend Python/FastAPI, armazenamento relacional no Supabase/Postgres e integrações de IA para assistência analítica.

O objetivo operacional é permitir que uma equipe selecione áreas da Força Municipal, visualize evidências georreferenciadas, consulte um assistente contextualizado por dados, gere insumos de relatório e organize reuniões CompStat com anexos, metas, decisões e ações.

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

## Dados e IA

A solução usa Supabase/Postgres para persistência e consulta dos dados estruturados. O backend contém migrações SQL e scripts de ETL para organizar as bases em tabelas consultáveis pela API.

O uso de IA fica concentrado no backend para evitar exposição de chaves no navegador. O frontend envia perguntas e contexto operacional para a API, e o backend chama o Claude com instruções para responder em português, usar evidências disponíveis e não inventar dados ausentes. Também foram previstos fluxos de OCR e predições via Replicate para apoiar extração de informação de documentos e imagens.

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
