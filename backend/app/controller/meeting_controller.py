from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException

from app.config.settings import Settings, get_settings
from app.service.meeting_service import MeetingService

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.get("")
def list_meetings(
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    items = MeetingService(settings).list_meetings()
    return {"count": len(items), "items": items}


@router.post("")
def create_meeting(
    payload: Annotated[dict[str, Any], Body()],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    meeting = MeetingService(settings).upsert_meeting(payload)
    return {"item": meeting}


@router.patch("/{meeting_id}")
def patch_meeting(
    meeting_id: str,
    payload: Annotated[dict[str, Any], Body()],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    meeting = MeetingService(settings).patch_meeting(meeting_id, payload)
    if not meeting:
        raise HTTPException(status_code=404, detail="meeting not found")
    return {"item": meeting}


@router.delete("/{meeting_id}")
def delete_meeting(
    meeting_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    MeetingService(settings).delete_meeting(meeting_id)
    return {"status": "ok"}


@router.post("/{meeting_id}/attachments")
def upsert_attachment(
    meeting_id: str,
    payload: Annotated[dict[str, Any], Body()],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    service = MeetingService(settings)
    meeting = service.upsert_child(
        "compstat_meeting_attachment",
        meeting_id,
        payload["id"],
        {
            "nome": payload.get("nome") or "",
            "tipo": payload.get("tipo") or "",
            "tamanho": int(payload.get("tamanho") or 0),
            "conteudo": payload.get("conteudo") or "",
            "eh_texto": bool(payload.get("ehTexto")),
        },
    )
    return _meeting_or_404(meeting)


@router.delete("/{meeting_id}/attachments/{item_id}")
def delete_attachment(
    meeting_id: str,
    item_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return _delete_child(settings, "compstat_meeting_attachment", meeting_id, item_id)


@router.post("/{meeting_id}/messages")
def upsert_message(
    meeting_id: str,
    payload: Annotated[dict[str, Any], Body()],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    service = MeetingService(settings)
    meeting = service.upsert_child(
        "compstat_meeting_message",
        meeting_id,
        payload["id"],
        {
            "role": payload.get("role"),
            "content": payload.get("content") or "",
            "ts": payload.get("ts"),
        },
    )
    return _meeting_or_404(meeting)


@router.delete("/{meeting_id}/messages")
def clear_messages(
    meeting_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    service = MeetingService(settings)
    with service._conn() as conn, conn.cursor() as cur:
        cur.execute(
            "delete from compstat_meeting_message where meeting_id = %s::uuid",
            (meeting_id,),
        )
        meeting = service.get_meeting(meeting_id, conn=conn)
    return _meeting_or_404(meeting)


@router.post("/{meeting_id}/metas")
def upsert_meta(
    meeting_id: str,
    payload: Annotated[dict[str, Any], Body()],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return _upsert_plan_item(settings, "compstat_meeting_meta", meeting_id, payload)


@router.patch("/{meeting_id}/metas/{item_id}")
def patch_meta(
    meeting_id: str,
    item_id: str,
    payload: Annotated[dict[str, Any], Body()],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return _patch_plan_item(settings, "compstat_meeting_meta", meeting_id, item_id, payload)


@router.delete("/{meeting_id}/metas/{item_id}")
def delete_meta(
    meeting_id: str,
    item_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return _delete_child(settings, "compstat_meeting_meta", meeting_id, item_id)


@router.post("/{meeting_id}/decisoes")
def upsert_decision(
    meeting_id: str,
    payload: Annotated[dict[str, Any], Body()],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return _upsert_plan_item(settings, "compstat_meeting_decision", meeting_id, payload)


@router.patch("/{meeting_id}/decisoes/{item_id}")
def patch_decision(
    meeting_id: str,
    item_id: str,
    payload: Annotated[dict[str, Any], Body()],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return _patch_plan_item(settings, "compstat_meeting_decision", meeting_id, item_id, payload)


@router.delete("/{meeting_id}/decisoes/{item_id}")
def delete_decision(
    meeting_id: str,
    item_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return _delete_child(settings, "compstat_meeting_decision", meeting_id, item_id)


@router.post("/{meeting_id}/acoes")
def upsert_action(
    meeting_id: str,
    payload: Annotated[dict[str, Any], Body()],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return _upsert_plan_item(settings, "compstat_meeting_action", meeting_id, payload)


@router.patch("/{meeting_id}/acoes/{item_id}")
def patch_action(
    meeting_id: str,
    item_id: str,
    payload: Annotated[dict[str, Any], Body()],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return _patch_plan_item(settings, "compstat_meeting_action", meeting_id, item_id, payload)


@router.delete("/{meeting_id}/acoes/{item_id}")
def delete_action(
    meeting_id: str,
    item_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return _delete_child(settings, "compstat_meeting_action", meeting_id, item_id)


def _upsert_plan_item(
    settings: Settings,
    table: str,
    meeting_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    service = MeetingService(settings)
    meeting = service.upsert_child(table, meeting_id, payload["id"], _plan_payload(table, payload))
    return _meeting_or_404(meeting)


def _patch_plan_item(
    settings: Settings,
    table: str,
    meeting_id: str,
    item_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    service = MeetingService(settings)
    meeting = service.patch_child(table, meeting_id, item_id, _plan_payload(table, payload))
    return _meeting_or_404(meeting)


def _delete_child(
    settings: Settings,
    table: str,
    meeting_id: str,
    item_id: str,
) -> dict[str, Any]:
    meeting = MeetingService(settings).delete_child(table, meeting_id, item_id)
    return _meeting_or_404(meeting)


def _meeting_or_404(meeting: dict[str, Any] | None) -> dict[str, Any]:
    if not meeting:
        raise HTTPException(status_code=404, detail="meeting not found")
    return {"item": meeting}


def _plan_payload(table: str, payload: dict[str, Any]) -> dict[str, Any]:
    data = dict(payload)
    if "areaFM" in data:
        data["area_fm"] = data.pop("areaFM")
    allowed = {
        "compstat_meeting_meta": {"titulo", "metrica", "responsavel", "prazo", "status"},
        "compstat_meeting_decision": {"titulo", "contexto", "responsavel"},
        "compstat_meeting_action": {
            "titulo",
            "descricao",
            "responsavel",
            "orgao",
            "prazo",
            "status",
            "area_fm",
        },
    }[table]
    return {key: value for key, value in data.items() if key in allowed}
