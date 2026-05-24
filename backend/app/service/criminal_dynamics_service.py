import json
import re
from enum import StrEnum
from typing import Any

from fastapi import HTTPException, status
from pydantic import BaseModel, Field, ValidationError

from app.config.settings import Settings
from app.service.claude_service import ClaudeService


class SourceType(StrEnum):
    RELINT = "relint"
    DISQUE_DENUNCIA = "disque_denuncia"
    OUVIDORIA = "ouvidoria"
    REDE_SOCIAL = "rede_social"
    OCORRENCIA = "ocorrencia"
    FATOR_URBANO = "fator_urbano"
    CAMERA = "camera"
    DOMINIO_TERRITORIAL = "dominio_territorial"
    PSR_CENSO = "psr_censo"
    OUTRO = "outro"


class CrimeType(StrEnum):
    FURTO = "furto"
    ROUBO = "roubo"
    ROUBO_CELULAR = "roubo_celular"
    ROUBO_COLETIVO = "roubo_coletivo"
    SUSPEITA_ROUBO_FURTO = "suspeita_roubo_furto"
    TRAFICO_DROGAS = "trafico_drogas"
    CONSUMO_DROGAS = "consumo_drogas"
    OUTRO = "outro"
    NAO_INFORMADO = "nao_informado"


class MobilityMode(StrEnum):
    A_PE = "a_pe"
    MOTO = "moto"
    BICICLETA = "bicicleta"
    CARRO = "carro"
    TRANSPORTE_PUBLICO = "transporte_publico"
    GRUPO = "grupo"
    NAO_INFORMADO = "nao_informado"


class TimePeriod(StrEnum):
    MADRUGADA = "madrugada"
    MANHA = "manha"
    PICO_MANHA = "pico_manha"
    TARDE = "tarde"
    PICO_TARDE = "pico_tarde"
    NOITE = "noite"
    FIM_DE_SEMANA = "fim_de_semana"
    NAO_INFORMADO = "nao_informado"


class FacilitatorType(StrEnum):
    FUGA = "fuga"
    VISIBILIDADE = "visibilidade"
    ILUMINACAO = "iluminacao"
    OBSTRUCAO = "obstrucao"
    AGLOMERACAO = "aglomeracao"
    DESORDEM_URBANA = "desordem_urbana"
    RECEPTACAO = "receptacao"
    MOBILIDADE = "mobilidade"
    PONTO_CEGO_CAMERA = "ponto_cego_camera"
    VEGETACAO = "vegetacao"
    PSR = "psr"
    COMERCIO_IRREGULAR = "comercio_irregular"
    RETENCAO_TRAFEGO = "retencao_trafego"
    BARREIRA_FISICA_VULNERAVEL = "barreira_fisica_vulneravel"
    TAPUME = "tapume"
    MOBILIARIO = "mobiliario"
    OUTRO = "outro"
    NAO_INFORMADO = "nao_informado"


class ResponsibleAgency(StrEnum):
    COMLURB = "COMLURB"
    RIOLUZ = "RioLuz"
    SEOP = "SEOP"
    SECONSERVA = "SECONSERVA"
    CET_RIO = "CET-Rio"
    GM_RIO = "GM-Rio"
    SMAS = "SMAS"
    SMTR = "SMTR"
    OUTRO = "outro"
    NAO_INFORMADO = "nao_informado"


class ConfidenceLevel(StrEnum):
    BAIXO = "baixo"
    MEDIO = "medio"
    ALTO = "alto"


class Evidence(BaseModel):
    text: str = Field(..., description="Trecho literal ou quase literal que sustenta a extração.")
    confidence: ConfidenceLevel = ConfidenceLevel.MEDIO


class TimeWindow(BaseModel):
    period: TimePeriod = TimePeriod.NAO_INFORMADO
    description: str | None = None
    evidence: Evidence | None = None


class CriminalEvent(BaseModel):
    crime_type: CrimeType = CrimeType.NAO_INFORMADO
    location: str | None = None
    target: str | None = None
    modus_operandi: str | None = None
    mobility_mode: MobilityMode = MobilityMode.NAO_INFORMADO
    time_window: TimeWindow | None = None
    evidence: Evidence | None = None


class EscapeRoute(BaseModel):
    description: str
    origin: str | None = None
    path: str | None = None
    destination: str | None = None
    mobility_mode: MobilityMode = MobilityMode.NAO_INFORMADO
    facilitator_type: FacilitatorType = FacilitatorType.FUGA
    evidence: Evidence | None = None


class Facilitator(BaseModel):
    type: FacilitatorType
    description: str
    location: str | None = None
    effect: str | None = None
    responsible_agency: ResponsibleAgency = ResponsibleAgency.NAO_INFORMADO
    intervention_hint: str | None = None
    evidence: Evidence | None = None


class CriminalDynamicsExtraction(BaseModel):
    source_type: SourceType
    source_id: str | None = None
    area_fm: str | None = None
    summary: str
    events: list[CriminalEvent] = Field(default_factory=list)
    escape_routes: list[EscapeRoute] = Field(default_factory=list)
    facilitators: list[Facilitator] = Field(default_factory=list)
    reception_points: list[str] = Field(default_factory=list)
    unresolved_questions: list[str] = Field(default_factory=list)
    confidence: ConfidenceLevel = ConfidenceLevel.MEDIO


class DynamicsExtractionInput(BaseModel):
    source_type: SourceType
    text: str = Field(..., min_length=20)
    source_id: str | None = None
    area_fm: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    max_items: int = Field(default=8, ge=1, le=20)


PROMPT_VERSION = "dinamica_criminal_v1"


class CriminalDynamicsService:
    def __init__(self, settings: Settings) -> None:
        self._claude = ClaudeService(settings)
        self._model = settings.claude_model

    @property
    def model(self) -> str:
        return self._model

    @property
    def prompt_version(self) -> str:
        return PROMPT_VERSION

    async def extract(self, body: DynamicsExtractionInput) -> CriminalDynamicsExtraction:
        result = await self._claude.infer(
            prompt=self._build_prompt(body),
            system=SYSTEM_PROMPT,
            max_tokens=8000,
            temperature=0,
        )
        raw_text = result.get("text") or ""
        payload = _parse_json_object(raw_text)
        try:
            return CriminalDynamicsExtraction.model_validate(payload)
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "message": (
                        "Claude returned JSON that does not match the criminal dynamics schema"
                    ),
                    "errors": exc.errors(),
                },
            ) from exc

    def _build_prompt(self, body: DynamicsExtractionInput) -> str:
        schema = CriminalDynamicsExtraction.model_json_schema()
        taxonomy = get_taxonomy()
        return (
            "Extraia o 'filme' da dinâmica criminal do texto abaixo e devolva somente JSON.\n"
            "Use enums exatamente como definidos. Quando não houver evidência, use "
            "'nao_informado' ou listas vazias. Não invente fatos.\n\n"
            "Regras importantes:\n"
            "- Rota de fuga é por onde o autor evade.\n"
            "- Facilitador de fuga é o elemento físico/ambiental/operacional que torna a fuga "
            "mais fácil, como grade aberta, passagem, tapume, vegetação, ponto cego ou retenção.\n"
            "- Preserve evidência textual curta para cada extração relevante.\n"
            "- Prefira poucos itens fortes a muitos itens fracos.\n\n"
            f"source_type: {body.source_type}\n"
            f"source_id: {body.source_id or ''}\n"
            f"area_fm: {body.area_fm or ''}\n"
            f"metadata: {json.dumps(body.metadata, ensure_ascii=False)}\n"
            f"max_items_por_lista: {body.max_items}\n\n"
            f"Taxonomia:\n{json.dumps(taxonomy, ensure_ascii=False, indent=2)}\n\n"
            f"Schema JSON esperado:\n{json.dumps(schema, ensure_ascii=False, indent=2)}\n\n"
            "Texto fonte:\n"
            f"{body.text}"
        )


def get_taxonomy() -> dict[str, list[str]]:
    return {
        "source_type": _enum_values(SourceType),
        "crime_type": _enum_values(CrimeType),
        "mobility_mode": _enum_values(MobilityMode),
        "time_period": _enum_values(TimePeriod),
        "facilitator_type": _enum_values(FacilitatorType),
        "responsible_agency": _enum_values(ResponsibleAgency),
        "confidence": _enum_values(ConfidenceLevel),
    }


def _enum_values(enum_type: type[StrEnum]) -> list[str]:
    return [item.value for item in enum_type]


def _parse_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
    if fenced:
        cleaned = fenced.group(1)
    elif not cleaned.startswith("{"):
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            cleaned = cleaned[start : end + 1]

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Claude did not return valid JSON for criminal dynamics extraction",
        ) from exc

    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Claude returned JSON, but the top-level value is not an object",
        )
    return parsed


SYSTEM_PROMPT = (
    "Você é um analista de inteligência territorial do CompStat Rio. "
    "Sua tarefa é transformar relatos qualitativos em dados estruturados e auditáveis. "
    "Responda apenas com JSON válido, sem markdown e sem comentários."
)
