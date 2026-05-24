"""Lightweight shapefile / WKT helpers for ETL.

Reads ESRI Shapefiles using only stdlib so we don't pull in GDAL/fiona.
Supports POLYGON shapes (type 5), which is what area_fm uses.

The Rio bounding box filter removes obviously bogus coordinates.
"""

from __future__ import annotations

import logging
import math
import re
import struct
import unicodedata
import zipfile
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree as ET

log = logging.getLogger("compstat.etl.geo")

RIO_BBOX = (-44.2, -23.2, -42.8, -22.4)
DOCX_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


@dataclass(frozen=True)
class AreaShape:
    nome: str
    rings: list[list[tuple[float, float]]]
    wkt_with_srid: str


@dataclass
class AreaIndex:
    """Geometric + fuzzy lookup for area_fm rows."""

    shapes: list[AreaShape] = field(default_factory=list)
    by_normalized_name: dict[str, AreaShape] = field(default_factory=dict)
    aliases: dict[str, str] = field(default_factory=dict)
    db_ids_by_normalized: dict[str, str] = field(default_factory=dict)

    def add_db_id(self, nome: str, area_id: str) -> None:
        key = normalize_key(nome)
        self.db_ids_by_normalized[key] = area_id

    def resolve_id(
        self,
        *,
        name: str | None = None,
        point: tuple[float, float] | None = None,
    ) -> str | None:
        # 1. exact / fuzzy name
        if name:
            key = normalize_key(name)
            if key in self.db_ids_by_normalized:
                return self.db_ids_by_normalized[key]
            aliased = self.aliases.get(key)
            if aliased and aliased in self.db_ids_by_normalized:
                return self.db_ids_by_normalized[aliased]
        # 2. point-in-polygon
        if point is not None:
            for shape in self.shapes:
                if _point_in_any_ring(point, shape.rings):
                    return self.db_ids_by_normalized.get(normalize_key(shape.nome))
        return None

    def best_area_for_text(self, text: str) -> AreaShape | None:
        normalized = normalize_key(text)
        best_score = 0
        best: AreaShape | None = None
        for shape in self.shapes:
            tokens = [t for t in normalize_key(shape.nome).split() if len(t) > 2]
            if not tokens:
                continue
            score = sum(1 for t in tokens if t in normalized)
            if score > best_score:
                best_score = score
                best = shape
        return best if best_score >= 2 else None


# Default alias map between camera CSV names and the shapefile canonical names.
DEFAULT_AREA_ALIASES: dict[str, str] = {
    "rua lauro muller avenida general severiano avenida venceslau bras": "rio sul",
    "presidente vargas campo santana central": (
        "presidente vargas campo de santana central do brasil cinelandia"
    ),
    "presidente vargas campo de santana central cinelandia": (
        "presidente vargas campo de santana central do brasil cinelandia"
    ),
}


def read_area_shapes(shapefile_dir: Path) -> list[AreaShape]:
    """Read areas_forca_municipal.shp / .dbf as AreaShape list."""
    dbf = shapefile_dir / "areas_forca_municipal.dbf"
    shp = shapefile_dir / "areas_forca_municipal.shp"
    if not dbf.exists() or not shp.exists():
        log.warning("Shapefile not found in %s", shapefile_dir)
        return []
    names = _read_dbf_names(dbf)
    polygons = _read_shp_polygons(shp)
    shapes: list[AreaShape] = []
    for name, rings in zip(names, polygons, strict=False):
        if not name or not rings:
            continue
        shapes.append(AreaShape(nome=name, rings=rings, wkt_with_srid=polygon_ewkt(rings)))
    return shapes


def build_area_index(shapes: list[AreaShape]) -> AreaIndex:
    index = AreaIndex(shapes=shapes, aliases=dict(DEFAULT_AREA_ALIASES))
    for shape in shapes:
        index.by_normalized_name[normalize_key(shape.nome)] = shape
    return index


def normalize_key(value: str | None) -> str:
    if not value:
        return ""
    nfkd = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(ch for ch in nfkd if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", ascii_text.lower()).strip()


def valid_rio_point(lon: float | None, lat: float | None) -> tuple[float, float] | None:
    if lon is None or lat is None or not math.isfinite(lon) or not math.isfinite(lat):
        return None
    min_lon, min_lat, max_lon, max_lat = RIO_BBOX
    if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat:
        return (lon, lat)
    return None


def polygon_ewkt(rings: list[list[tuple[float, float]]]) -> str:
    rendered = []
    for ring in rings:
        closed = ring if ring and ring[0] == ring[-1] else [*ring, ring[0]]
        rendered.append("(" + ", ".join(f"{lon} {lat}" for lon, lat in closed) + ")")
    return "SRID=4326;POLYGON(" + ", ".join(rendered) + ")"


def _point_in_any_ring(
    point: tuple[float, float], rings: list[list[tuple[float, float]]]
) -> bool:
    return any(_point_in_ring(point, ring) for ring in rings)


def _point_in_ring(point: tuple[float, float], ring: list[tuple[float, float]]) -> bool:
    lon, lat = point
    if len(ring) < 3:
        return False
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        intersects = (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi
        if intersects:
            inside = not inside
        j = i
    return inside


# --- DBF / SHP raw readers --------------------------------------------------


def _read_dbf_names(path: Path) -> list[str]:
    """Read the first text-y field that contains an area name."""
    data = path.read_bytes()
    num_records = int.from_bytes(data[4:8], "little")
    header_len = int.from_bytes(data[8:10], "little")
    record_len = int.from_bytes(data[10:12], "little")
    fields: list[tuple[str, int]] = []
    offset = 32
    while data[offset] != 0x0D:
        desc = data[offset : offset + 32]
        name = desc[:11].split(b"\x00", 1)[0].decode("latin1")
        fields.append((name, desc[16]))
        offset += 32

    names = []
    pos = header_len
    for _ in range(num_records):
        record = data[pos : pos + record_len]
        pos += record_len
        if record[:1] == b"*":
            continue
        cursor = 1
        values = {}
        for field_name, length in fields:
            raw = record[cursor : cursor + length]
            cursor += length
            values[field_name] = raw.decode("utf-8", "replace").strip()
        names.append(
            values.get("nome_subar")
            or values.get("nome_subarea")
            or values.get("nome")
            or ""
        )
    return [name for name in names if name]


def _read_shp_polygons(path: Path) -> list[list[list[tuple[float, float]]]]:
    data = path.read_bytes()
    pos = 100
    polygons: list[list[list[tuple[float, float]]]] = []
    while pos < len(data):
        if pos + 8 > len(data):
            break
        content_length_words = struct.unpack(">i", data[pos + 4 : pos + 8])[0]
        content_bytes = content_length_words * 2
        content = data[pos + 8 : pos + 8 + content_bytes]
        pos += 8 + content_bytes

        if len(content) < 4:
            continue
        shape_type = struct.unpack("<i", content[:4])[0]
        if shape_type != 5:  # only POLYGON
            continue
        num_parts, num_points = struct.unpack("<2i", content[36:44])
        parts = list(struct.unpack(f"<{num_parts}i", content[44 : 44 + 4 * num_parts]))
        points_offset = 44 + 4 * num_parts
        points = [
            struct.unpack(
                "<2d", content[points_offset + i * 16 : points_offset + (i + 1) * 16]
            )
            for i in range(num_points)
        ]
        rings = []
        for idx, start in enumerate(parts):
            end = parts[idx + 1] if idx + 1 < len(parts) else num_points
            rings.append(points[start:end])
        polygons.append(rings)
    return polygons


# --- DOCX reader ------------------------------------------------------------


def extract_docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", DOCX_NS):
        text = "".join(node.text or "" for node in paragraph.findall(".//w:t", DOCX_NS)).strip()
        if text:
            paragraphs.append(text)
    return "\n".join(paragraphs)


def iter_docx_files(dir_path: Path) -> Iterator[Path]:
    if not dir_path.exists():
        return
    yield from sorted(dir_path.glob("*.docx"))
