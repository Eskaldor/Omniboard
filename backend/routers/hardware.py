from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.services.esp_manager import ESPManager

router = APIRouter(prefix="/api/hardware", tags=["Hardware"])

_esp = ESPManager()


@router.get("/")
async def list_devices():
    """Список всех подключённых устройств (MAC -> info)."""
    return _esp.get_all()


@router.post("/discover")
async def discover():
    """Отправить широковещательный discover-запрос; устройства ответят на порт 8266."""
    _esp.broadcast_discovery_ping()
    return {"status": "ok"}


@router.post("/{mac}/blink")
async def blink_led(mac: str):
    """Моргнуть LED на устройстве."""
    try:
        _esp.blink_led(mac)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{mac}/test")
async def test_screen(mac: str):
    """Тест экрана на устройстве."""
    try:
        _esp.test_screen(mac)
        return {"status": "ok"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
