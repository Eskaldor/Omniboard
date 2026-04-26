"""
ESP32 hardware miniatures manager — mDNS discovery + HTTP /update payloads.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
import threading
import time
from typing import Any, Iterable

import httpx
from zeroconf import ServiceBrowser, ServiceListener, Zeroconf

from backend.services.logger import log_esp_warning


def sanitize_mac_for_filename(mac: str) -> str:
    """For filenames and URLs: colons → underscores (AA:BB:CC -> AA_BB_CC)."""
    return mac.replace(":", "_")


_HTTP_SERVICE_TYPE = "_http._tcp.local."
_OMNIMINI_PREFIX = "omnimini-"


def _parse_omnimini_id(service_name: str) -> str | None:
    """Parse `omnimini-<id>` from an mDNS instance name (e.g. omnimini-abc._http._tcp.local.)."""
    label = service_name.split(".", 1)[0]
    if not label.startswith(_OMNIMINI_PREFIX):
        return None
    rest = label[len(_OMNIMINI_PREFIX) :]
    return rest or None


def _pick_ipv4_preferred(addresses: list[str]) -> str | None:
    v4: list[str] = []
    v6: list[str] = []
    for raw in addresses:
        try:
            ip = ipaddress.ip_address(raw)
        except ValueError:
            continue
        if isinstance(ip, ipaddress.IPv4Address):
            v4.append(raw)
        else:
            v6.append(raw)
    if v4:
        return v4[0]
    return v6[0] if v6 else None


def _resolve_omnimini_host(esp_id: str) -> str | None:
    host = f"{_OMNIMINI_PREFIX}{esp_id}.local"
    try:
        infos = socket.getaddrinfo(host, 80, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP)
    except OSError:
        return None
    for _fam, _type, _proto, _canon, sockaddr in infos:
        if not sockaddr:
            continue
        addr = sockaddr[0]
        if isinstance(addr, str):
            return addr
    return None


class _OmniminiListener(ServiceListener):
    def __init__(self, manager: ESPManager) -> None:
        self._mgr = manager

    def add_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        self._mgr._sync_on_service_added(zc, type_, name)

    def remove_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        self._mgr._sync_on_service_removed(name)

    def update_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        self._mgr._sync_on_service_added(zc, type_, name)


class ESPManager:
    """Manage Omnimini devices: mDNS discovery and HTTP POST /update."""

    SERVER_PORT = 80
    MDNS_SERVICE_TYPE = _HTTP_SERVICE_TYPE

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.active_minis: dict[str, str] = {}
        self._known_ids: set[str] = set()
        self._online: dict[str, bool] = {}
        self._zeroconf: Zeroconf | None = None
        self._browser: ServiceBrowser | None = None
        self._listener: _OmniminiListener | None = None
        self._http: httpx.AsyncClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._initiative_line_actor_ids: dict[str, str] = {}

    @property
    def devices(self) -> dict[str, dict[str, Any]]:
        return self.get_all()

    def get_active_minis(self) -> dict[str, str]:
        with self._lock:
            return dict(self.active_minis)

    def get_all(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            out: dict[str, dict[str, Any]] = {}
            for eid, ip in self.active_minis.items():
                online = self._online.get(eid, True)
                out[eid] = {
                    "mac": eid,
                    "ip": ip,
                    "name": f"{_OMNIMINI_PREFIX}{eid}",
                    "status": "online" if online else "offline",
                    "last_seen": "just now",
                }
            return out

    def reset_initiative_line_binding(self, esp_id: str) -> None:
        self._initiative_line_actor_ids.pop(esp_id, None)

    @staticmethod
    def get_local_ip() -> str:
        """Local IP for img_url (miniature downloads PNG over HTTP)."""
        try:
            ip = socket.gethostbyname(socket.gethostname())
            if ip and ip != "127.0.0.1":
                return ip
        except (socket.gaierror, OSError):
            pass
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s_udp:
                s_udp.settimeout(0.5)
                s_udp.connect(("8.8.8.8", 80))
                return s_udp.getsockname()[0] or "127.0.0.1"
        except OSError:
            return "127.0.0.1"

    def _sync_on_service_added(self, zc: Zeroconf, type_: str, name: str) -> None:
        eid = _parse_omnimini_id(name)
        if not eid:
            return
        info = zc.get_service_info(type_, name, timeout=3000)
        if not info:
            return
        ip = _pick_ipv4_preferred(info.parsed_addresses())
        if not ip:
            return
        with self._lock:
            was_online = self._online.get(eid, False)
            self.active_minis[eid] = ip
            self._online[eid] = True
        if not was_online:
            self._schedule_bound_actor_boot_push(eid)

    def _sync_on_service_removed(self, name: str) -> None:
        eid = _parse_omnimini_id(name)
        if not eid:
            return
        with self._lock:
            self.active_minis.pop(eid, None)
            self._online.pop(eid, None)

    async def startup(self) -> None:
        self._loop = asyncio.get_running_loop()
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=httpx.Timeout(20.0))
        if self._zeroconf is not None:
            return
        self._zeroconf = Zeroconf()
        self._listener = _OmniminiListener(self)
        self._browser = ServiceBrowser(self._zeroconf, self.MDNS_SERVICE_TYPE, listener=self._listener)

    async def shutdown(self) -> None:
        if self._browser is not None:
            self._browser.cancel()
            self._browser = None
        if self._zeroconf is not None:
            self._zeroconf.close()
            self._zeroconf = None
        self._listener = None
        if self._http is not None:
            await self._http.aclose()
            self._http = None
        self._loop = None

    def _schedule_bound_actor_boot_push(self, esp_id: str) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        loop.call_soon_threadsafe(
            lambda: asyncio.create_task(self._push_bound_actor_on_boot(esp_id))
        )

    async def _push_bound_actor_on_boot(self, esp_id: str) -> None:
        try:
            from backend import state as app_state
            from backend.services.hardware_triggers import find_hardware_trigger
            from backend.services.render_push import proactive_render_and_push

            actor = next(
                (
                    a
                    for a in app_state.state.core.actors
                    if (getattr(a, "miniature_id", None) or "").strip() == esp_id
                ),
                None,
            )
            if actor is None:
                return
            system = (getattr(app_state.state.core, "system", "") or "").strip() or "D&D 5e"
            rule = find_hardware_trigger(system, "miniature_bind")
            await proactive_render_and_push(
                actor.id,
                mac=esp_id,
                transition=rule.transition if rule else None,
                transition_color=rule.transition_color if rule else None,
            )
        except Exception:
            pass

    async def refresh_initiative_line(self, combat_session) -> None:
        """Refresh miniatures bound to relative positions in the initiative queue."""
        queue = list(getattr(combat_session.core, "turn_queue", []) or [])
        if not queue:
            self._initiative_line_actor_ids.clear()
            return

        try:
            from backend.led_resolver import resolve_led_payload_for_profile
            from backend.services.render_push import proactive_render_and_push
            from backend.storage.miniatures_store import load_all as load_miniatures
        except Exception:
            return

        slot_minis = [
            mini
            for mini in load_miniatures()
            if getattr(mini, "binding_mode", "actor") == "slot"
        ]
        if not slot_minis:
            return

        current_index = int(getattr(combat_session.core, "current_index", 0) or 0)
        queue_len = len(queue)
        tasks = []
        for mini in slot_minis:
            try:
                slot_index = int(mini.slot_index)
            except (TypeError, ValueError):
                continue
            target_index = (current_index + slot_index) % queue_len
            actor_id = queue[target_index]
            if not actor_id:
                continue
            if self._initiative_line_actor_ids.get(mini.id) == actor_id:
                continue
            self._initiative_line_actor_ids[mini.id] = actor_id
            led_payload = None
            if (
                getattr(mini, "slot_led_mode", "actor") == "custom"
                and (getattr(mini, "slot_led_profile_id", None) or "").strip()
            ):
                led_payload = resolve_led_payload_for_profile(
                    actor_id,
                    str(mini.slot_led_profile_id),
                )
            tasks.append(
                proactive_render_and_push(
                    actor_id,
                    mac=mini.id,
                    led_payload=led_payload,
                    transition="wipe_right",
                    transition_color="#FFFFFF",
                )
            )

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _resolve_ip(self, esp_id: str) -> str | None:
        with self._lock:
            ip = self.active_minis.get(esp_id)
        if ip:
            return ip
        return await asyncio.to_thread(_resolve_omnimini_host, esp_id)

    async def send_update(self, esp_id: str, payload: dict[str, Any]) -> bool:
        self._known_ids.add(esp_id)
        if self._http is None:
            await self.startup()
        assert self._http is not None
        ip = await self._resolve_ip(esp_id)
        if not ip:
            log_esp_warning("Omnimini %s: no IP (mDNS / .local not resolved)", esp_id)
            with self._lock:
                self._online[esp_id] = False
            return False
        url = f"http://{ip}/update"
        try:
            r = await self._http.post(url, json=payload)
            r.raise_for_status()
        except httpx.RequestError as exc:
            log_esp_warning("Omnimini %s: HTTP request failed (%s): %s", esp_id, url, exc)
            with self._lock:
                self._online[esp_id] = False
            return False
        except httpx.HTTPStatusError as exc:
            log_esp_warning(
                "Omnimini %s: HTTP error %s from %s",
                esp_id,
                exc.response.status_code,
                url,
            )
            with self._lock:
                self._online[esp_id] = False
            return False
        with self._lock:
            self.active_minis[esp_id] = ip
            self._online[esp_id] = True
        return True

    async def blink_led(self, esp_id: str) -> bool:
        return await self.send_update(
            esp_id,
            {
                "led": {
                    "mode": "blink",
                    "colors": ["#FF0000", "#000000"],
                    "speed": 500,
                    "brightness": 255,
                },
            },
        )

    async def announce_image_update(
        self,
        esp_id: str,
        image_filename: str,
        screen_bri: int = 200,
        led_payload: dict[str, Any] | None = None,
        transition: str | None = None,
        transition_color: str | None = None,
    ) -> bool:
        base_url = f"http://{self.get_local_ip()}:{self.SERVER_PORT}"
        img_url = f"{base_url}/api/render/output/{image_filename}?t={int(time.time())}"
        led: dict[str, Any] = (
            led_payload
            if led_payload is not None
            else {
                "mode": "static",
                "colors": ["#000000"],
                "speed": 0,
                "brightness": 0,
            }
        )
        payload: dict[str, Any] = {
            "img_url": img_url,
            "screen_bri": max(0, min(255, screen_bri)),
            "led": led,
        }
        if transition and transition != "none":
            payload["transition"] = transition
            if transition_color:
                payload["transition_params"] = {"color": transition_color}

        # ESP32 may hold the HTTP response until a screen transition finishes.
        self._known_ids.add(esp_id)
        ip = await self._resolve_ip(esp_id)
        if not ip:
            log_esp_warning("Omnimini %s: no IP (mDNS / .local not resolved)", esp_id)
            with self._lock:
                self._online[esp_id] = False
            return False

        url = f"http://{ip}/update"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(20.0)) as client:
                r = await client.post(url, json=payload)
                r.raise_for_status()
        except httpx.RequestError as exc:
            log_esp_warning("Omnimini %s: HTTP request failed (%s): %s", esp_id, url, exc)
            with self._lock:
                self._online[esp_id] = False
            return False
        except httpx.HTTPStatusError as exc:
            log_esp_warning(
                "Omnimini %s: HTTP error %s from %s",
                esp_id,
                exc.response.status_code,
                url,
            )
            with self._lock:
                self._online[esp_id] = False
            return False

        with self._lock:
            self.active_minis[esp_id] = ip
            self._online[esp_id] = True
        return True

    _SLEEP_PAYLOAD: dict[str, Any] = {
        "screen_bri": 0,
        "led": {
            "mode": "static",
            "colors": ["#000000"],
            "brightness": 0,
            "speed": 0,
        },
    }

    async def sleep_all(self, extra_ids: Iterable[str] | None = None) -> None:
        """Turn off TFT backlight and LEDs on every discovered Omnimini."""
        active = set(self.get_active_minis().keys())
        extras = {s.strip() for s in (extra_ids or ()) if (s or "").strip()}
        all_targets = self._known_ids.union(active).union(extras)
        if not all_targets:
            return
        tasks = [self.send_update(eid, self._SLEEP_PAYLOAD) for eid in all_targets]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def test_screen(self, esp_id: str) -> bool:
        return await self.send_update(
            esp_id,
            {
                "screen_bri": 200,
                "led": {
                    "mode": "static",
                    "colors": ["#00FF00"],
                    "speed": 0,
                    "brightness": 255,
                },
            },
        )
