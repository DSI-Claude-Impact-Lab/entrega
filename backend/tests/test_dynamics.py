import pytest

from app.controller.dynamics_controller import dynamics_taxonomy
from app.service.criminal_dynamics_service import (
    CriminalDynamicsExtraction,
    _parse_json_object,
)


@pytest.mark.anyio
async def test_dynamics_taxonomy_exposes_filter_enums() -> None:
    payload = await dynamics_taxonomy()

    assert "fuga" in payload["facilitator_type"]
    assert "barreira_fisica_vulneravel" in payload["facilitator_type"]
    assert "moto" in payload["mobility_mode"]
    assert "RioLuz" in payload["responsible_agency"]


def test_dynamics_schema_accepts_escape_route_facilitator() -> None:
    extraction = CriminalDynamicsExtraction.model_validate(
        {
            "source_type": "relint",
            "source_id": "RI_017",
            "area_fm": "Presidente Vargas - Campo de Santana",
            "summary": "Autores furtam pedestres e fogem por abertura na grade.",
            "events": [
                {
                    "crime_type": "furto",
                    "location": "pontos de ônibus da Av. Presidente Vargas",
                    "target": "pedestres",
                    "modus_operandi": "subtração rápida em área de alto fluxo",
                    "mobility_mode": "a_pe",
                    "evidence": {
                        "text": "furtos em pontos de ônibus com evasão pelo Campo de Santana",
                        "confidence": "alto",
                    },
                }
            ],
            "escape_routes": [
                {
                    "description": "fuga pela grade lateral em direção ao Campo de Santana",
                    "path": "grade lateral",
                    "destination": "Campo de Santana",
                    "mobility_mode": "a_pe",
                    "facilitator_type": "fuga",
                }
            ],
            "facilitators": [
                {
                    "type": "barreira_fisica_vulneravel",
                    "description": "abertura na grade permite passagem rápida",
                    "location": "grade lateral do Campo de Santana",
                    "effect": "facilita dispersão após o furto",
                    "responsible_agency": "SECONSERVA",
                }
            ],
            "confidence": "alto",
        }
    )

    assert extraction.escape_routes[0].facilitator_type == "fuga"
    assert extraction.facilitators[0].type == "barreira_fisica_vulneravel"


def test_parse_json_object_from_markdown_fence() -> None:
    payload = _parse_json_object('```json\n{"source_type": "relint", "summary": "ok"}\n```')

    assert payload == {"source_type": "relint", "summary": "ok"}
