import hashlib
import re
import unicodedata
import zipfile
from collections.abc import Iterator
from pathlib import Path
from xml.etree import ElementTree as ET

from app.ingestion.base import NormalizedRecord

_DOCX_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
_FILENAME_PREFIX = re.compile(r"^(c[oó]pia\s+de\s+)", flags=re.IGNORECASE)


class RelintAdapter:
    tipo_fonte = "relint"

    def parse(self, source: Path) -> Iterator[NormalizedRecord]:
        path = Path(source)
        if path.is_dir():
            paths = sorted(path.glob("*.docx"))
        else:
            paths = [path]

        for docx_path in paths:
            text = _extract_docx_text(docx_path)
            if not text:
                continue
            id_origem = _stable_id_from_filename(docx_path.name)
            yield NormalizedRecord(
                tipo_fonte=self.tipo_fonte,
                id_registro_origem=id_origem,
                texto_narrativo=text,
                hash_conteudo=_sha256(text),
                metadados={
                    "arquivo_origem": docx_path.name,
                    "tamanho_bytes": docx_path.stat().st_size,
                    "sha256_arquivo": _sha256_file(docx_path),
                },
                area_hint=_area_hint_from_filename(id_origem),
            )


def _extract_docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    paragraphs = []
    for paragraph in root.findall(".//w:p", _DOCX_NS):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", _DOCX_NS)).strip()
        if text:
            paragraphs.append(text)
    return "\n".join(paragraphs)


def _stable_id_from_filename(filename: str) -> str:
    stem = Path(filename).stem
    return _FILENAME_PREFIX.sub("", stem).strip()


def _area_hint_from_filename(stable_id: str) -> str | None:
    match = re.match(r"^RI_\d+_\d+_(.+)$", stable_id)
    if not match:
        return None
    raw = match.group(1).replace("_", " ").strip()
    normalized = unicodedata.normalize("NFKD", raw)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)) or None


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
