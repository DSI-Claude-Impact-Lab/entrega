# Agent Instructions

This is the backend repository for the DSI / PUC-Rio CompStat Rio hackathon
submission.

Before changing code, read:

1. `README.md`
2. `/home/csiqueira/dsi-claude-impact-lab/general-proceedings/docs/event-brief-rio.md`
3. `/home/csiqueira/dsi-claude-impact-lab/general-proceedings/docs/challenge-compstat-rio.md`
4. `/home/csiqueira/dsi-claude-impact-lab/general-proceedings/logs/`

Rules:

- Do not commit secrets.
- Do not print secrets in logs or responses.
- Keep Claude outputs grounded in structured evidence.
- Prefer small, auditable endpoints over large opaque prompt-only flows.

Useful commands:

```bash
uv sync
uv run ruff check .
uv run pytest
uv run uvicorn app.config.main:app --reload
```
