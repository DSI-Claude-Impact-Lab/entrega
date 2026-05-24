# Claude Impact Lab - Entrega

Repositorio consolidado da entrega do projeto CompStat Rio desenvolvido no Claude Impact Lab.

Aplicacao publicada: https://claude-impact-lab.gtec-dsi.net/

API publicada: https://claude-impact-lab.gtec-dsi.net/api

## Visao Geral

O projeto entrega uma plataforma CompStat para apoiar analise territorial, preparacao de reunioes e tomada de decisao em seguranca publica no Rio de Janeiro. A solucao combina um frontend Vite/React com mapa interativo, um backend Python/FastAPI, armazenamento relacional no Supabase/Postgres e integracoes de IA para assistencia analitica.

O objetivo operacional e permitir que uma equipe selecione areas da Forca Municipal, visualize evidencias georreferenciadas, consulte um assistente contextualizado por dados, gere insumos de relatorio e organize reunioes CompStat com anexos, metas, decisoes e acoes.

## Estrutura

```text
.
├── backend/   # API Python com FastAPI
├── frontend/  # Aplicacao web React + TypeScript + Vite
├── scripts/   # Script para atualizar a copia a partir dos repos de trabalho
└── SNAPSHOT.md
```

Este repositorio nao usa submodulos. Os conteudos de `backend` e `frontend` foram copiados para dentro desta entrega.

## Aplicacao

A versao ao vivo esta disponivel em:

```text
https://claude-impact-lab.gtec-dsi.net/
```

Principais telas e funcionalidades:

- mapa operacional com Google Maps, camadas geograficas e heatmaps;
- visualizacao de ocorrencias, denuncias, cameras, fatores urbanos, facilitadores e territorios de grupos criminais;
- selecao de areas da Forca Municipal com score de risco e relatorio por area;
- assistente CompStat com Claude, usando contexto do mapa e dos dados carregados pela aplicacao;
- CRM de reunioes CompStat com anexos, notas, metas, decisoes, acoes e chat contextual da reuniao;
- painel de planejamento para acompanhar responsabilidades, prazos, status de acoes e metas.

## Backend

O backend foi desenvolvido em Python com FastAPI e fica em `backend/`.

Responsabilidades principais:

- expor endpoints REST sob `/api`;
- carregar configuracoes por variaveis de ambiente;
- consultar e persistir dados no Supabase/Postgres;
- servir dados georreferenciados para o mapa;
- gerar relatorios de areas da Forca Municipal;
- integrar chamadas ao Claude via Anthropic API;
- integrar OCR e predicoes via Replicate;
- manter rotas de reunioes CompStat, anexos, mensagens, metas, decisoes e acoes;
- fornecer scripts de ETL para carregar bases estruturadas e migracoes SQL documentadas.

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
- variaveis de ambiente preenchidas a partir de `backend/.env.example`.

Comandos:

```bash
cd backend
cp .env.example .env
uv sync
uv run uvicorn app.config.main:app --reload
```

Teste de saude:

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
- `react-markdown` para renderizacao das respostas do assistente.

### Rodando o Frontend Localmente

Requisitos:

- Node.js 24;
- npm;
- variaveis de ambiente preenchidas a partir de `frontend/.env.example`.

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

Build de producao:

```bash
npm run build
```

## Dados e IA

A solucao usa Supabase/Postgres para persistencia e consulta dos dados estruturados. O backend contem migracoes SQL e scripts de ETL para organizar as bases em tabelas consultaveis pela API.

O uso de IA fica concentrado no backend para evitar exposicao de chaves no navegador. O frontend envia perguntas e contexto operacional para a API, e o backend chama o Claude com instrucoes para responder em portugues, usar evidencias disponiveis e nao inventar dados ausentes. Tambem foram previstos fluxos de OCR e predicoes via Replicate para apoiar extracao de informacao de documentos e imagens.

## Deploy

A aplicacao publicada foi implantada em servidor DigitalOcean com Caddy como proxy/servidor web.

Arquitetura de deploy:

- frontend compilado pelo Vite e servido em `/`;
- backend FastAPI servido sob `/api`;
- Caddy roteando frontend e API no mesmo dominio;
- systemd mantendo o processo da API;
- GitHub Actions executando testes/build e envio dos artefatos para o servidor;
- Supabase usado como banco gerenciado.

Nenhum segredo de deploy, chave de API, token ou senha esta versionado neste repositorio. Os arquivos `.env.example` documentam apenas os nomes das variaveis necessarias.

## Validacao

Para validar a entrega publicada:

1. Acesse https://claude-impact-lab.gtec-dsi.net/
2. Abra a tela `Mapa`.
3. Verifique carregamento das camadas, heatmap e areas da Forca Municipal.
4. Selecione uma area e confira score, indicadores e relatorio.
5. Use o assistente CompStat para perguntar sobre riscos, evidencias ou proximas acoes.
6. Abra `Reunioes` e verifique criacao/edicao de reuniao, anexos, chat contextual, metas, decisoes e acoes.
7. Abra `Planejamento` e confira o acompanhamento consolidado de acoes e metas.

Para validar localmente:

1. Suba o backend com `uv run uvicorn app.config.main:app --reload`.
2. Suba o frontend com `npm run dev`.
3. Configure `VITE_API_BASE_URL=http://127.0.0.1:8000`.
4. Execute os testes do backend com `uv run pytest`.
5. Execute lint/build do frontend com `npm run lint` e `npm run build`.

## Atualizacao da Copia

Enquanto o frontend ainda estiver em desenvolvimento, atualize esta entrega a partir dos repositorios de trabalho com:

```bash
./scripts/sync-from-working-repos.sh
```

O script copia novamente `../backend` e `../frontend` para este repositorio, sem submodulos e sem trazer `.git`, `.env`, `node_modules`, `dist`, `.venv`, caches ou logs. Ao final, ele atualiza `SNAPSHOT.md` com os commits de origem usados na entrega.

Tambem e possivel informar caminhos customizados:

```bash
BACKEND_SRC=/caminho/backend FRONTEND_SRC=/caminho/frontend ./scripts/sync-from-working-repos.sh
```
