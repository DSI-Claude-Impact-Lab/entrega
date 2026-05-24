# DSI CompStat Rio Backend

FastAPI backend for the DSI / PUC-Rio Claude Impact Lab CompStat Rio project.

Production URL:

```text
https://claude-impact-lab.gtec-dsi.net/api
```

The Vite frontend is served from the same DigitalOcean host:

```text
https://claude-impact-lab.gtec-dsi.net/
```

## Features

- FastAPI app served under `/api`.
- Supabase data access via `supabase-py` (service role).
- Replicate token smoke check.
- GLM-OCR endpoint through Replicate.
- Claude inference endpoint using Anthropic API.
- Deployment via GitHub Actions to the DigitalOcean event server.
- Caddy reverse proxy + systemd service.

## Data Model

The proposed Supabase/Postgres model is documented in DBML format for dbdiagram:

```text
docs/compstat_data_model.dbml
```

There is also a simplified Mermaid ER diagram in Portuguese for quick discussion:

```text
docs/compstat_data_model_simple.mmd
```

The simplified PostgreSQL/Supabase DDL is here:

```text
docs/compstat_schema.sql
```

It covers the structured source datasets and the normalized criminal-dynamics
layer extracted from RELINT and Disque Denuncia narratives.

## Challenge Direction

Use this backend for secret-bearing and AI calls. The frontend should not call
Anthropic or Replicate directly.

The current CompStat MVP target is:

```text
select Forca Municipal area
-> show evidence/risk factors
-> ask Claude for grounded recommendations
-> generate a draft area report section
```

Keep Claude prompts grounded in structured evidence from the challenge data.

## Local Setup

```bash
cp .env.example .env
uv sync
uv run uvicorn app.config.main:app --reload
```

Health:

```bash
curl http://127.0.0.1:8000/api/health
```

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Backend health |
| GET | `/api/config-check` | Checks required server env presence |
| GET | `/api/replicate/account` | Replicate token smoke check |
| POST | `/api/replicate/predictions` | Generic Replicate prediction call |
| POST | `/api/ocr/glm` | GLM-OCR document/image OCR through Replicate |
| POST | `/api/claude/infer` | Claude inference |
| POST | `/api/chat` | Conversational chat endpoint for the frontend, with optional app context |
| GET | `/api/dynamics/taxonomy` | Criminal dynamics enum taxonomy for filters |
| POST | `/api/dynamics/extract` | Extract structured criminal dynamics from RELINT/Disque Denuncia text |
| POST | `/api/segment` | Placeholder shape for Replicate SAM2 image segmentation |

Claude inference:

```bash
curl https://claude-impact-lab.gtec-dsi.net/api/claude/infer \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Summarize why this case should be prioritized."}'
```

GLM-OCR:

```bash
curl https://claude-impact-lab.gtec-dsi.net/api/ocr/glm \
  -H "Content-Type: application/json" \
  -d '{
    "image": "https://example.com/document-image.jpg",
    "task": "text",
    "max_new_tokens": 4096
  }'
```

Supported `task` values:

- `text`
- `formula`
- `table`
- `json`

For `json`, pass extraction instructions or a schema-like description in
`custom_prompt`.

Chat:

```bash
curl https://claude-impact-lab.gtec-dsi.net/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Explique a area prioritaria."}
    ],
    "context": {
      "area": "Centro",
      "risk_score": 87
    }
  }'
```

The frontend sends conversation history and can include structured CompStat
context later.

Criminal dynamics extraction:

```bash
curl https://claude-impact-lab.gtec-dsi.net/api/dynamics/extract \
  -H "Content-Type: application/json" \
  -d '{
    "source_type": "relint",
    "source_id": "RI_017",
    "area_fm": "Presidente Vargas - Campo de Santana",
    "text": "Autores furtam pedestres nos pontos de ônibus e fogem pela grade lateral em direção ao Campo de Santana."
  }'
```

The extractor returns filterable enums plus evidence text for events, escape
routes, facilitators, reception points, and unresolved questions.
