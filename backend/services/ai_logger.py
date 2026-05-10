"""Append-only AI chat audit log + usage aggregator.

Each /api/ai/chat turn produces one structured JSONL record under
``data/logs/ai/<YYYY-MM-DD>.jsonl``. Records are written from a daemon
``threading.Thread`` so the request is never blocked on disk I/O (mirrors the
pattern used by the combat ``add_log`` writer in services/logger.py).

Records are intended to drive:
  * UI token-usage widgets ("today / 7-day" totals on the AI settings tab)
  * Local debugging — see exactly what we sent the provider when something
    misbehaves, including the system contract, condensed combat snapshot,
    tool calls, mutation outcomes, and provider latency
  * Future analytics — JSONL is trivial to ``jq | wc -l`` or ingest later.

Privacy note: the GM is the only user of this surface, and the data lives
purely on their disk. We log full message text so debugging is meaningful;
``data/logs/ai/`` is a sensitive directory and should not be shared raw.
"""
from __future__ import annotations

import json
import logging
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

from backend.paths import LOGS_DIR

_log = logging.getLogger(__name__)

AI_LOGS_DIR = LOGS_DIR / "ai"

# Cap retention so a long-running install doesn't slowly fill the disk. Anything
# older than this gets pruned on the next ``log_chat_turn`` call.
_RETENTION_DAYS = 60

# Hard ceiling on cached message snippets. Full prompts can be many KB; we keep
# the structural metadata + first ``_TEXT_CHARS`` chars of each user/assistant
# message as a debugging hint without bloating the JSONL too much.
_TEXT_CHARS = 2000


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _today_path(now: datetime | None = None) -> Path:
    n = now or _now_utc()
    return AI_LOGS_DIR / f"{n.strftime('%Y-%m-%d')}.jsonl"


def _truncate(s: Any, limit: int = _TEXT_CHARS) -> str:
    text = str(s if s is not None else "")
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def make_request_id() -> str:
    """Short opaque id pairing a request with its log record."""
    return uuid.uuid4().hex[:12]


def _summarize_messages(messages: Iterable[Any]) -> list[dict[str, Any]]:
    """Compact representation of the messages array we sent to the provider."""
    out: list[dict[str, Any]] = []
    for m in messages or []:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role", "?"))
        content = m.get("content")
        if isinstance(content, str):
            out.append({"role": role, "chars": len(content), "text": _truncate(content)})
        elif isinstance(content, list):
            joined = "".join(
                p.get("text", "") if isinstance(p, dict) else str(p) for p in content
            )
            out.append({"role": role, "chars": len(joined), "text": _truncate(joined)})
        else:
            out.append({"role": role, "chars": 0, "text": ""})
    return out


def _summarize_tool_calls(tool_calls: Any) -> list[dict[str, Any]]:
    """Per-call summary: name + args size + parsed action count when available."""
    if not isinstance(tool_calls, list):
        return []
    out: list[dict[str, Any]] = []
    for tc in tool_calls:
        if not isinstance(tc, dict):
            continue
        fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
        name = fn.get("name") if isinstance(fn, dict) else None
        raw_args = fn.get("arguments") if isinstance(fn, dict) else None
        args_chars = len(raw_args) if isinstance(raw_args, str) else 0
        actions_count: int | None = None
        if isinstance(raw_args, str):
            try:
                parsed = json.loads(raw_args)
                if isinstance(parsed, dict) and isinstance(parsed.get("actions"), list):
                    actions_count = len(parsed["actions"])
            except (json.JSONDecodeError, TypeError):
                pass
        out.append(
            {
                "name": name if isinstance(name, str) else "?",
                "args_chars": args_chars,
                "actions_count": actions_count,
            }
        )
    return out


def _prune_old_files(now: datetime | None = None) -> None:
    """Delete JSONL files older than ``_RETENTION_DAYS``. Best-effort, never raises."""
    n = now or _now_utc()
    cutoff = n - timedelta(days=_RETENTION_DAYS)
    try:
        if not AI_LOGS_DIR.is_dir():
            return
        for p in AI_LOGS_DIR.glob("*.jsonl"):
            try:
                stem = p.stem  # YYYY-MM-DD
                d = datetime.strptime(stem, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                if d < cutoff:
                    p.unlink(missing_ok=True)
            except (ValueError, OSError):
                continue
    except OSError:
        pass


def log_chat_turn(record: dict[str, Any]) -> None:
    """Append a structured record for one /api/ai/chat turn (non-blocking)."""

    def _write() -> None:
        try:
            AI_LOGS_DIR.mkdir(parents=True, exist_ok=True)
            line = json.dumps(record, ensure_ascii=False)
            with _today_path().open("a", encoding="utf-8") as f:
                f.write(line + "\n")
            _prune_old_files()
        except OSError as e:
            _log.warning("ai_logger write failed: %s", e)

    threading.Thread(target=_write, daemon=True).start()


def build_turn_record(
    *,
    request_id: str,
    mode: str,
    model: str,
    system: str,
    sent_messages: list[dict[str, Any]] | None,
    payload_tools: list[dict[str, Any]] | None,
    response_status: int,
    response_data: dict[str, Any] | None,
    response_text: str,
    tool_calls: list[dict[str, Any]] | None,
    mutations_summary: list[str] | None,
    latency_ms: int,
    error: str | None = None,
) -> dict[str, Any]:
    """Assemble the JSONL record. Pure (no I/O) so it's easy to unit-test."""
    usage_block: dict[str, int] | None = None
    if isinstance(response_data, dict):
        u = response_data.get("usage")
        if isinstance(u, dict):
            picked: dict[str, int] = {}
            for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
                v = u.get(key)
                if isinstance(v, bool):
                    continue
                if isinstance(v, int):
                    picked[key] = v
                elif isinstance(v, float) and v.is_integer():
                    picked[key] = int(v)
            usage_block = picked or None

    tool_offered = []
    if isinstance(payload_tools, list):
        for t in payload_tools:
            if isinstance(t, dict):
                fn = t.get("function") if isinstance(t.get("function"), dict) else {}
                tool_offered.append(fn.get("name") if isinstance(fn, dict) else None)

    return {
        "ts": _now_utc().isoformat().replace("+00:00", "Z"),
        "request_id": request_id,
        "mode": mode,
        "model": model,
        "system": system,
        "request": {
            "messages": _summarize_messages(sent_messages or []),
            "message_count": len(sent_messages or []),
            "tools_offered": [n for n in tool_offered if n],
        },
        "response": {
            "status": response_status,
            "latency_ms": latency_ms,
            "content_chars": len(response_text or ""),
            "content_excerpt": _truncate(response_text or ""),
            "tool_calls": _summarize_tool_calls(tool_calls),
            "usage": usage_block,
            "error": error,
        },
        "mutations": {
            "applied_count": sum(
                1 for ln in (mutations_summary or []) if not ln.startswith("⚠")
            ),
            "warnings_count": sum(
                1 for ln in (mutations_summary or []) if ln.startswith("⚠")
            ),
            "lines": mutations_summary or [],
        },
    }


# ---------------------------------------------------------------------------
# Aggregation for the UI
# ---------------------------------------------------------------------------


def _iter_recent_records(days: int) -> Iterable[dict[str, Any]]:
    """Yield records from the last ``days`` daily files (oldest first)."""
    if not AI_LOGS_DIR.is_dir():
        return
    now = _now_utc()
    files: list[Path] = []
    for delta in range(days):
        day = now - timedelta(days=delta)
        p = AI_LOGS_DIR / f"{day.strftime('%Y-%m-%d')}.jsonl"
        if p.is_file():
            files.append(p)
    files.sort()
    for path in files:
        try:
            with path.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        yield json.loads(line)
                    except json.JSONDecodeError:
                        continue
        except OSError:
            continue


def _zero_bucket() -> dict[str, int]:
    return {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def _accumulate(bucket: dict[str, int], rec: dict[str, Any]) -> None:
    bucket["calls"] += 1
    usage = (rec.get("response") or {}).get("usage") if isinstance(rec, dict) else None
    if not isinstance(usage, dict):
        return
    for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
        v = usage.get(k)
        if isinstance(v, int):
            bucket[k] += v


def get_usage_summary(window_days: int = 7) -> dict[str, Any]:
    """Aggregate token usage for the AI settings UI.

    Returns a dict with ``today``, ``window`` (last ``window_days``), and the
    most recent call's usage block + timestamp + mode for an at-a-glance read.
    """
    today = _zero_bucket()
    window = _zero_bucket()
    last_call: dict[str, Any] | None = None

    today_str = _now_utc().strftime("%Y-%m-%d")
    for rec in _iter_recent_records(window_days):
        _accumulate(window, rec)
        ts = rec.get("ts") if isinstance(rec, dict) else None
        if isinstance(ts, str) and ts.startswith(today_str):
            _accumulate(today, rec)
        # Most recent record wins (records are yielded oldest-first across files
        # but appended-order within a file).
        last_call = {
            "ts": rec.get("ts"),
            "mode": rec.get("mode"),
            "model": rec.get("model"),
            "usage": (rec.get("response") or {}).get("usage"),
            "latency_ms": (rec.get("response") or {}).get("latency_ms"),
            "applied_count": (rec.get("mutations") or {}).get("applied_count", 0),
        }

    return {
        "today": today,
        "window": {**window, "days": window_days},
        "last_call": last_call,
    }
