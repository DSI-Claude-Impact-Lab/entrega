from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol


@dataclass(frozen=True)
class NormalizedRecord:
    tipo_fonte: str
    id_registro_origem: str
    texto_narrativo: str
    hash_conteudo: str
    metadados: dict[str, Any] = field(default_factory=dict)
    area_hint: str | None = None
    occurred_at: datetime | None = None


class SourceAdapter(Protocol):
    tipo_fonte: str

    def parse(self, source: Any) -> Iterator[NormalizedRecord]: ...
