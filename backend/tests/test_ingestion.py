import zipfile
from pathlib import Path
from unittest.mock import MagicMock

from app.dao.dynamics_persistence_dao import DynamicsPersistenceDao
from app.dao.fonte_inteligencia_dao import FonteInteligenciaDao
from app.ingestion.base import NormalizedRecord
from app.ingestion.relint_adapter import RelintAdapter
from app.service.criminal_dynamics_service import CriminalDynamicsExtraction

DOCX_BODY = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    "<w:body>"
    "<w:p><w:r><w:t>Relato sobre Botafogo: furtos em pontos de ônibus.</w:t></w:r></w:p>"
    "<w:p><w:r><w:t>Fuga pela Avenida Marquês de Abrantes.</w:t></w:r></w:p>"
    "</w:body></w:document>"
)


def _make_docx(path: Path, name: str) -> Path:
    file_path = path / name
    with zipfile.ZipFile(file_path, "w") as archive:
        archive.writestr("word/document.xml", DOCX_BODY)
    return file_path


def test_relint_adapter_yields_normalized_records(tmp_path: Path) -> None:
    _make_docx(tmp_path, "Cópia de RI_015_2026_Praia_Botafogo_Marques_Abrantes.docx")
    _make_docx(tmp_path, "RI_010_2026_Rodoviaria_Terminal_Gentileza.docx")

    records = list(RelintAdapter().parse(tmp_path))

    assert {r.tipo_fonte for r in records} == {"relint"}
    ids = {r.id_registro_origem for r in records}
    assert "RI_015_2026_Praia_Botafogo_Marques_Abrantes" in ids
    assert "RI_010_2026_Rodoviaria_Terminal_Gentileza" in ids
    sample = next(r for r in records if r.id_registro_origem.startswith("RI_015"))
    assert "Botafogo" in sample.texto_narrativo
    assert sample.area_hint and "Praia Botafogo" in sample.area_hint
    assert sample.metadados["arquivo_origem"].startswith("Cópia de RI_015")
    assert sample.hash_conteudo and len(sample.hash_conteudo) == 64  # SHA-256 hex
    # Mesmo conteúdo em arquivo com nome diferente = mesmo hash.
    other = next(r for r in records if r.id_registro_origem.startswith("RI_010"))
    assert sample.hash_conteudo == other.hash_conteudo


def test_relint_adapter_different_content_yields_different_hash(tmp_path: Path) -> None:
    """Two docx with the same name but distinct text must have distinct hashes."""
    a = tmp_path / "a"
    b = tmp_path / "b"
    a.mkdir()
    b.mkdir()
    _make_docx(a, "Cópia de RI_001_2026_Foo.docx")
    body_2 = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>Conteúdo totalmente diferente.</w:t></w:r></w:p></w:body>"
        "</w:document>"
    )
    import zipfile as _zf

    with _zf.ZipFile(b / "Cópia de RI_001_2026_Foo.docx", "w") as archive:
        archive.writestr("word/document.xml", body_2)

    [ra] = list(RelintAdapter().parse(a))
    [rb] = list(RelintAdapter().parse(b))
    assert ra.id_registro_origem == rb.id_registro_origem
    assert ra.hash_conteudo != rb.hash_conteudo


def test_relint_adapter_strips_copia_prefix_for_stable_id(tmp_path: Path) -> None:
    _make_docx(tmp_path, "Cópia de RI_017_2026_Presidente_Vargas.docx")

    [record] = list(RelintAdapter().parse(tmp_path))

    assert record.id_registro_origem == "RI_017_2026_Presidente_Vargas"


def test_fonte_inteligencia_dao_inserts_when_absent() -> None:
    client = _supabase_client_mock(existing_rows=[], inserted=[{"id": "fonte-uuid-1"}])
    dao = FonteInteligenciaDao(client)
    record = NormalizedRecord(
        tipo_fonte="relint",
        id_registro_origem="RI_010_2026_Rodoviaria",
        texto_narrativo="texto",
        hash_conteudo="abc123",
        metadados={"arquivo_origem": "RI_010.docx"},
    )

    result = dao.upsert(record, area_id="area-uuid")

    assert result.created is True
    assert result.fonte_id == "fonte-uuid-1"
    insert_call = client.table.return_value.insert
    assert insert_call.called
    payload = insert_call.call_args.args[0]
    assert payload["tipo_fonte"] == "relint"
    assert payload["id_registro_origem"] == "RI_010_2026_Rodoviaria"
    assert payload["hash_conteudo"] == "abc123"
    assert payload["area_id"] == "area-uuid"


def test_fonte_inteligencia_dao_skips_when_hash_already_present() -> None:
    client = _supabase_client_mock(existing_rows=[{"id": "fonte-existing", "area_id": None}])
    dao = FonteInteligenciaDao(client)
    record = NormalizedRecord(
        tipo_fonte="relint",
        id_registro_origem="RI_020_renomeado",
        texto_narrativo="texto",
        hash_conteudo="hash-igual",
        metadados={},
    )

    result = dao.upsert(record)

    assert result.created is False
    assert result.dedup_reason == "hash"
    assert result.fonte_id == "fonte-existing"
    assert not client.table.return_value.insert.called
    assert not client.table.return_value.update.called


def test_fonte_inteligencia_dao_updates_when_id_origem_present_but_hash_differs() -> None:
    # First lookup (hash) returns empty, second (id_origem) returns existing.
    client = _supabase_client_mock_sequence(
        existing_rows_sequence=[[], [{"id": "fonte-uuid-2", "area_id": None}]]
    )
    dao = FonteInteligenciaDao(client)
    record = NormalizedRecord(
        tipo_fonte="relint",
        id_registro_origem="RI_010_2026_Rodoviaria",
        texto_narrativo="texto novo (arquivo editado)",
        hash_conteudo="novo-hash",
        metadados={},
    )

    result = dao.upsert(record)

    assert result.created is False
    assert result.dedup_reason == "id_origem"
    assert result.fonte_id == "fonte-uuid-2"
    assert client.table.return_value.update.called


def test_dynamics_persistence_dao_maps_extraction_to_tables() -> None:
    extraction = CriminalDynamicsExtraction.model_validate(
        {
            "source_type": "relint",
            "summary": "Furtos com fuga a pé.",
            "events": [
                {
                    "crime_type": "furto",
                    "mobility_mode": "a_pe",
                    "time_window": {"period": "tarde"},
                    "evidence": {"text": "furto em ponto de ônibus", "confidence": "alto"},
                }
            ],
            "escape_routes": [
                {
                    "description": "fuga pela grade",
                    "path": "grade lateral",
                    "destination": "Campo de Santana",
                    "mobility_mode": "a_pe",
                    "facilitator_type": "fuga",
                }
            ],
            "facilitators": [
                {
                    "type": "barreira_fisica_vulneravel",
                    "description": "grade aberta",
                    "responsible_agency": "SECONSERVA",
                }
            ],
            "reception_points": ["camelódromo"],
            "confidence": "medio",
        }
    )
    client = _persistence_client_mock(extracao_id="ext-uuid-1")
    dao = DynamicsPersistenceDao(client)

    result = dao.persist(
        fonte_id="fonte-uuid",
        extraction=extraction,
        modelo="claude-sonnet-4-6",
        versao_prompt="dinamica_criminal_v1",
        area_id="area-uuid",
    )

    assert result.extracao_id == "ext-uuid-1"
    assert result.eventos == 1
    assert result.rotas_fuga == 1
    assert result.facilitadores == 1
    assert result.pontos_receptacao == 1

    table_calls = [call.args[0] for call in client.table.call_args_list]
    assert table_calls.count("extracao_dinamica_criminal") == 1
    assert "evento_criminal" in table_calls
    assert "rota_fuga" in table_calls
    assert "facilitador" in table_calls
    assert "ponto_receptacao" in table_calls


def _supabase_client_mock(
    *, existing_rows: list[dict], inserted: list[dict] | None = None
) -> MagicMock:
    client = MagicMock()
    table = client.table.return_value

    select_query = MagicMock()
    table.select.return_value = select_query
    select_query.eq.return_value = select_query
    select_query.limit.return_value = select_query
    select_query.execute.return_value = MagicMock(data=existing_rows)

    table.insert.return_value.execute.return_value = MagicMock(data=inserted or [])

    update_query = MagicMock()
    table.update.return_value = update_query
    update_query.eq.return_value = update_query
    update_query.execute.return_value = MagicMock(data=[])

    return client


def _supabase_client_mock_sequence(*, existing_rows_sequence: list[list[dict]]) -> MagicMock:
    client = MagicMock()
    table = client.table.return_value

    select_query = MagicMock()
    table.select.return_value = select_query
    select_query.eq.return_value = select_query
    select_query.limit.return_value = select_query
    select_query.execute.side_effect = [MagicMock(data=rows) for rows in existing_rows_sequence]

    table.insert.return_value.execute.return_value = MagicMock(data=[])

    update_query = MagicMock()
    table.update.return_value = update_query
    update_query.eq.return_value = update_query
    update_query.execute.return_value = MagicMock(data=[])

    return client


def _persistence_client_mock(*, extracao_id: str) -> MagicMock:
    client = MagicMock()
    table = client.table.return_value
    insert_query = MagicMock()
    table.insert.return_value = insert_query
    insert_query.execute.return_value = MagicMock(data=[{"id": extracao_id}])
    return client
