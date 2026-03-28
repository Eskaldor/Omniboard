from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from backend.services.esp_manager import ESPManager

router = APIRouter(prefix="/api/hardware", tags=["Hardware"])

_esp = ESPManager()


def get_esp_manager() -> ESPManager:
    return _esp


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
