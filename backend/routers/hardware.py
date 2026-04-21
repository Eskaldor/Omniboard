from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.models import MiniatureEntry
from backend.storage.miniatures_store import load_all as load_miniatures, save_all as save_miniatures
from backend.services.esp_manager import ESPManager

router = APIRouter(prefix="/api/hardware", tags=["Hardware"])

_esp = ESPManager()


def get_esp_manager() -> ESPManager:
    return _esp


class MiniatureUpdate(BaseModel):
    name: Optional[str] = None
    mac: Optional[str] = None
    notes: Optional[str] = None


@router.get("/miniatures")
async def list_miniatures():
    """Глобальный список записей об Omnimini (data/miniatures.json)."""
    return load_miniatures()


@router.post("/miniatures")
async def create_miniature(entry: MiniatureEntry):
    items = load_miniatures()
    eid = (entry.id or "").strip()
    if not eid:
        raise HTTPException(status_code=400, detail="id is required")
    if any(m.id == eid for m in items):
        raise HTTPException(status_code=409, detail="miniature id already exists")
    items.append(entry.model_copy(update={"id": eid}))
    save_miniatures(items)
    return entry


@router.patch("/miniatures/{mini_id:path}")
async def update_miniature(mini_id: str, body: MiniatureUpdate):
    """Обновить запись по id (path — для MAC с двоеточиями)."""
    target = (mini_id or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="id is required")
    items = load_miniatures()
    idx = next((i for i, m in enumerate(items) if m.id == target), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="miniature not found")
    patch = body.model_dump(exclude_unset=True)
    updated = MiniatureEntry.model_validate({**items[idx].model_dump(), **patch, "id": target})
    items[idx] = updated
    save_miniatures(items)
    return updated


@router.delete("/miniatures/{mini_id:path}")
async def delete_miniature(mini_id: str):
    target = (mini_id or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="id is required")
    items = load_miniatures()
    next_items = [m for m in items if m.id != target]
    if len(next_items) == len(items):
        raise HTTPException(status_code=404, detail="miniature not found")
    save_miniatures(next_items)
    return {"status": "ok"}


@router.put("/miniatures")
async def replace_miniatures(entries: list[MiniatureEntry]):
    """Полная замена списка (массовый импорт / сброс)."""
    seen: set[str] = set()
    out: list[MiniatureEntry] = []
    for e in entries:
        eid = (e.id or "").strip()
        if not eid or eid in seen:
            continue
        seen.add(eid)
        out.append(e.model_copy(update={"id": eid}))
    save_miniatures(out)
    return out


@router.get("/")
async def list_devices():
    """All discovered Omnimini devices (id → info; `mac` field mirrors id for legacy UI)."""
    return _esp.get_all()


@router.get("/scan")
async def scan():
    """Current `active_minis` map (id → IP) from mDNS; browser runs continuously in the background."""
    return {"active_minis": _esp.get_active_minis()}


@router.post("/discover")
async def discover():
    """Legacy name: UDP discover is removed; returns current mDNS state (no network ping)."""
    return {
        "status": "ok",
        "active_minis": _esp.get_active_minis(),
        "devices": _esp.get_all(),
    }


@router.post("/{mac}/update")
async def push_update(mac: str, body: dict[str, Any]) -> dict[str, str]:
    """POST the same JSON the firmware expects at `http://<device>/update`."""
    ok = await _esp.send_update(mac, body)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Device unreachable or unknown: {mac}")
    return {"status": "ok"}


@router.post("/{mac}/blink")
async def blink_led(mac: str):
    """Pulse LED test on the miniature (`mac` path segment is the Omnimini id)."""
    ok = await _esp.blink_led(mac)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Device unreachable or unknown: {mac}")
    return {"status": "ok"}


@router.post("/{mac}/test")
async def test_screen(mac: str):
    """Screen test on the miniature."""
    ok = await _esp.test_screen(mac)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Device unreachable or unknown: {mac}")
    return {"status": "ok"}
