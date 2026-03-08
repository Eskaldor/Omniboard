"""
ESP32 hardware miniatures manager — global state of connected devices.
"""
from __future__ import annotations

import asyncio
import json
import logging
import socket
from typing import Any

logger = logging.getLogger(__name__)

# Глобальное состояние: MAC -> info dict. Пустой по умолчанию; заполняется через discovery.
connected_devices: dict[str, dict[str, Any]] = {}

DISCOVERY_LISTEN_PORT = 8266
DISCOVERY_BROADCAST_PORT = 4210


class DiscoveryProtocol(asyncio.DatagramProtocol):
    """Слушает UDP порт 8266, при получении JSON с mac, ip, name добавляет/обновляет устройство в connected_devices."""

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        try:
            raw = data.decode("utf-8").strip()
            obj = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            return
        mac = obj.get("mac")
        ip = obj.get("ip") or (addr[0] if addr else "")
        name = obj.get("name")
        if not mac or not ip:
            return
        connected_devices[mac] = {
            **connected_devices.get(mac, {}),
            "mac": mac,
            "ip": ip,
            "name": name or connected_devices.get(mac, {}).get("name", ""),
            "status": "online",
            "last_seen": "just now",
        }


class ESPManager:
    """Управление подключёнными ESP32-миниатюрами."""

    UDP_PORT = 4210
    SERVER_PORT = 8001
    _transport: asyncio.DatagramTransport | None = None

    @staticmethod
    def get_local_ip() -> str:
        """Определить локальный IP сервера для формирования img_url (минька скачивает картинку по HTTP)."""
        try:
            ip = socket.gethostbyname(socket.gethostname())
            if ip and ip != "127.0.0.1":
                return ip
        except (socket.gaierror, OSError):
            pass
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.settimeout(0.5)
                s.connect(("8.8.8.8", 80))
                return s.getsockname()[0] or "127.0.0.1"
        except (OSError, socket.error):
            return "127.0.0.1"

    @property
    def devices(self) -> dict[str, dict[str, Any]]:
        return connected_devices

    def get_all(self) -> dict[str, dict[str, Any]]:
        return dict(connected_devices)

    async def start_discovery_listener(self) -> None:
        """Запустить UDP-слушатель на 0.0.0.0:8266 для приёма ответов устройств."""
        loop = asyncio.get_running_loop()
        self._transport, _ = await loop.create_datagram_endpoint(
            lambda: DiscoveryProtocol(),
            local_addr=("0.0.0.0", DISCOVERY_LISTEN_PORT),
        )

    def stop_discovery_listener(self) -> None:
        """Остановить слушатель discovery."""
        if self._transport:
            self._transport.close()
            self._transport = None

    def broadcast_discovery_ping(self) -> None:
        """Отправить широковещательный UDP-пакет «discover» на 255.255.255.255:4210."""
        payload = json.dumps({"cmd": "discover"}).encode("utf-8")
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        try:
            sock.sendto(payload, ("255.255.255.255", DISCOVERY_BROADCAST_PORT))
        finally:
            sock.close()

    def send_command(self, mac: str, payload: dict) -> None:
        """
        Отправить JSON-команду на устройство по UDP.
        payload должен строго соответствовать формату прошивки:
        {
          "img_url": "строка (URL к PNG)",
          "screen_bri": число (0-255),
          "led": { "mode", "colors": ["#HEX"], "speed", "brightness" }
        }
        """
        info = connected_devices.get(mac)
        if not info:
            raise ValueError(f"Device not found: {mac}")
        ip = info.get("ip")
        if not ip:
            raise ValueError(f"No IP for device: {mac}")
        data = json.dumps(payload, ensure_ascii=False)
        logger.info("ESP UDP send to %s (%s): %s", mac, ip, data)
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.sendto(data.encode("utf-8"), (ip, self.UDP_PORT))
        finally:
            sock.close()

    def blink_led(self, mac: str) -> None:
        """Тест LED: режим blink, красный/чёрный, speed 500 ms, brightness 255."""
        self.send_command(mac, {
            "led": {
                "mode": "blink",
                "colors": ["#FF0000", "#000000"],
                "speed": 500,
                "brightness": 255,
            },
        })

    def announce_image_update(
        self,
        mac: str,
        image_filename: str,
        screen_bri: int = 200,
    ) -> None:
        """
        Уведомить миньку об обновлении картинки: формирует img_url по локальному IP
        и отправляет пакет с screen_bri (по умолчанию 200).
        """
        base_url = f"http://{self.get_local_ip()}:{self.SERVER_PORT}"
        img_url = f"{base_url}/api/render/output/{image_filename}"
        payload = {
            "img_url": img_url,
            "screen_bri": max(0, min(255, screen_bri)),
            "led": {
                "mode": "static",
                "colors": ["#000000"],
                "speed": 0,
                "brightness": 0,
            },
        }
        self.send_command(mac, payload)

    def test_screen(self, mac: str) -> None:
        """Тест экрана: минимальный пакет (без img_url), LED static зелёный."""
        self.send_command(mac, {
            "screen_bri": 200,
            "led": {
                "mode": "static",
                "colors": ["#00FF00"],
                "speed": 0,
                "brightness": 255,
            },
        })