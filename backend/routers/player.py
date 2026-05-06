"""Player View API — лобби, управление кампаниями, бронирование персонажей."""
from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import JSONResponse

from backend import state as app_state
from backend.services.player_state import get_player_public_state
from backend.models import (
    Actor,
    ActiveCampaignRequest,
    CampaignCreateRequest,
    CampaignInfo,
    PlayerCharacterCreateRequest,
    PlayerCharacterImportRequest,
    PlayerCharacterSummary,
    PlayerClaimResponse,
    stat_cell_effective_scalar,
)
from backend.paths import (
    LOGS_DIR,
    get_actors_system_dir,
    get_campaign_players_dir,
    get_campaigns_system_dir,
)
from backend.routers.ws import (
    broadcast_roll_request_status_to_player,
    broadcast_roll_request_to_gm,
    broadcast_state,
    broadcast_whisper_event,
)
from backend.services.logger import add_log
from backend.services.dice import DiceManager
from backend.services.out_of_turn_roll_policy import player_may_roll_now
from backend.routers.ws import broadcast_roll_event

_dice = DiceManager()

router = APIRouter(prefix="/api/player", tags=["player"])


# ---------------------------------------------------------------------------
# Вспомогательные функции
# ---------------------------------------------------------------------------

def _load_actors_from_dir(players_dir) -> list[Actor]:
    actors: list[Actor] = []
    if players_dir is None or not players_dir.exists():
        return actors
    for f in sorted(players_dir.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            actors.append(Actor.model_validate(data))
        except Exception:
            continue
    return actors


# ---------------------------------------------------------------------------
# Информация о текущей сессии (для клиента без WS-соединения)
# ---------------------------------------------------------------------------

@router.get("/session")
async def get_player_session() -> dict:
    return {
        "system": app_state.state.core.system,
        "active_campaign_id": app_state.state.session.active_campaign_id,
        "is_combat_active": app_state.state.core.is_active,
        "round": app_state.state.core.round,
    }


@router.get("/combat-state")
async def get_player_combat_state(
    x_player_token: Optional[str] = Header(None),
) -> dict:
    """Public combat payload for Player View (never returns full GM state).

    If token is provided and recognized, response is personalized (own actor unmasked).
    """
    actor_id = app_state.token_to_actor.get(x_player_token) if x_player_token else None
    return get_player_public_state(app_state.state, actor_id)


@router.post("/log/whisper")
async def player_whisper(
    payload: dict,
    x_player_token: Optional[str] = Header(None),
) -> dict:
    """Player: add a secret text entry (visible only to the author and GM)."""
    if not x_player_token:
        raise HTTPException(status_code=403, detail="Missing token")
    actor_id = app_state.token_to_actor.get(x_player_token)
    if not actor_id:
        raise HTTPException(status_code=403, detail="Invalid token")
    # Ensure claim is still valid for this actor.
    if app_state.claimed_players.get(actor_id) != x_player_token:
        raise HTTPException(status_code=403, detail="Invalid token")

    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="text is required")

    actor = next((a for a in app_state.state.core.actors if a.id == actor_id), None)
    actor_name = actor.name if actor else actor_id

    add_log(
        "text",
        actor_id=actor_id,
        actor_name=actor_name,
        # Keep both keys: GM CombatLog expects `details.message`,
        # Player LogView prefers `details.text` (and already falls back to message).
        details={"text": text, "message": text},
        is_secret=True,
    )
    await broadcast_state()
    await broadcast_whisper_event(
        payload={
            "actor_id": actor_id,
            "actor_name": actor_name,
            "text": text,
            "is_secret": True,
        }
    )
    return {"ok": True}


@router.post("/roll/request")
async def request_player_roll(
    payload: dict,
    x_player_token: Optional[str] = Header(None),
) -> dict:
    """Запрос броска из Player View вне своего хода.

    Сразу исполняет бросок, если свой ход, включён глобальный режим без запросов,
    или у актора есть «пас на текущий раунд» от GM. Иначе — pending и WS мастеру.
    """
    if not x_player_token:
        raise HTTPException(status_code=403, detail="Missing token")
    actor_id = app_state.token_to_actor.get(x_player_token)
    if not actor_id:
        raise HTTPException(status_code=403, detail="Invalid token")
    if app_state.claimed_players.get(actor_id) != x_player_token:
        raise HTTPException(status_code=403, detail="Invalid token")

    expression = str(payload.get("expression") or "").strip()
    if not expression:
        raise HTTPException(status_code=422, detail="expression is required")
    comment = str(payload.get("comment") or "").strip() or None
    is_secret = bool(payload.get("is_secret") is True)

    st = app_state.state
    actor = next((a for a in st.core.actors if a.id == actor_id), None)
    if actor is None:
        raise HTTPException(status_code=404, detail="Actor not found in combat")

    if player_may_roll_now(st, actor_id):
        # Execute immediately (same semantics as /api/combat/actors/{id}/roll).
        system_name = (st.core.system or "").strip()
        result = _dice.execute_roll(expression, system_name, actor)
        if True:
            details = {
                "expression": expression,
                "formula": str(result.formula),
                "total": int(result.total),
                "details": str(result.details),
                "is_glitch": bool(result.is_glitch),
                "is_crit_glitch": bool(result.is_crit_glitch),
            }
            if comment:
                details["comment"] = comment
            add_log(
                "roll",
                actor_id=actor.id,
                actor_name=actor.name,
                details=details,
                is_secret=is_secret,
            )
        await broadcast_state()
        # GM toast on every player roll; secret rolls also toast to the author.
        await broadcast_roll_event(
            actor_id=None,
            payload={"actor_id": actor.id, "actor_name": actor.name, "is_secret": is_secret, **result.model_dump(mode="json")},
        )
        if is_secret:
            await broadcast_roll_event(
                actor_id=actor.id,
                payload={"actor_id": actor.id, "actor_name": actor.name, "is_secret": True, **result.model_dump(mode="json")},
            )
        return JSONResponse(
            status_code=200,
            content={"status": "approved", "result": result.model_dump(mode="json")},
        )

    # Create pending request
    import uuid
    from datetime import datetime

    request_id = uuid.uuid4().hex
    req_payload = {
        "request_id": request_id,
        "actor_id": actor.id,
        "actor_name": actor.name,
        "expression": expression,
        "comment": comment,
        "is_secret": is_secret,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    st.session.pending_roll_requests[request_id] = req_payload
    await broadcast_state()
    await broadcast_roll_request_to_gm(payload=req_payload)
    await broadcast_roll_request_status_to_player(
        actor_id=actor.id,
        payload={"request_id": request_id, "status": "pending"},
    )
    return JSONResponse(status_code=202, content={"status": "pending", "request_id": request_id})


# ---------------------------------------------------------------------------
# Управление кампаниями (GM)
# ---------------------------------------------------------------------------

@router.get("/campaigns", response_model=list[CampaignInfo])
async def list_campaigns() -> list[CampaignInfo]:
    """Список кампаний для текущей игровой системы."""
    system = app_state.state.core.system
    system_dir = get_campaigns_system_dir(system)
    if system_dir is None or not system_dir.exists():
        return []

    result: list[CampaignInfo] = []
    for campaign_dir in sorted(system_dir.iterdir()):
        if not campaign_dir.is_dir():
            continue
        players_dir = campaign_dir / "players"
        player_count = len(list(players_dir.glob("*.json"))) if players_dir.exists() else 0
        result.append(CampaignInfo(
            id=campaign_dir.name,
            system=system,
            player_count=player_count,
        ))
    return result


@router.post("/campaigns", response_model=CampaignInfo, status_code=201)
async def create_campaign(body: CampaignCreateRequest) -> CampaignInfo:
    """Создать новую папку кампании с пустой директорией персонажей."""
    players_dir = get_campaign_players_dir(body.system, body.id)
    if players_dir is None:
        raise HTTPException(status_code=400, detail="Invalid system or campaign id")
    if players_dir.exists():
        raise HTTPException(status_code=409, detail="Campaign already exists")
    players_dir.mkdir(parents=True, exist_ok=True)
    return CampaignInfo(id=body.id, system=body.system, player_count=0)


@router.patch("/active-campaign")
async def set_active_campaign(body: ActiveCampaignRequest) -> dict:
    """GM: установить активную кампанию (или сбросить → None)."""
    if body.campaign_id is not None:
        players_dir = get_campaign_players_dir(
            app_state.state.core.system, body.campaign_id
        )
        if players_dir is None:
            raise HTTPException(status_code=400, detail="Invalid campaign id")
        if not players_dir.parent.exists():
            raise HTTPException(status_code=404, detail="Campaign not found")

    app_state.state.session.active_campaign_id = body.campaign_id
    await broadcast_state()
    return {"active_campaign_id": body.campaign_id}


# ---------------------------------------------------------------------------
# Лобби
# ---------------------------------------------------------------------------

@router.get("/lobby", response_model=list[PlayerCharacterSummary])
async def get_lobby(
    x_player_token: Optional[str] = Header(None),
) -> list[PlayerCharacterSummary]:
    """Список персонажей активной кампании с флагом занятости."""
    system = app_state.state.core.system
    campaign_id = app_state.state.session.active_campaign_id
    if not campaign_id:
        return []

    players_dir = get_campaign_players_dir(system, campaign_id)
    actors = _load_actors_from_dir(players_dir)

    result: list[PlayerCharacterSummary] = []
    for actor in actors:
        existing_token = app_state.claimed_players.get(actor.id)
        is_claimed = existing_token is not None
        # Если вызывающий — владелец этого слота, считаем его свободным для него
        is_mine = x_player_token is not None and existing_token == x_player_token
        result.append(PlayerCharacterSummary(
            id=actor.id,
            name=actor.name,
            portrait=actor.portrait,
            role=actor.role,
            system=system,
            is_claimed=is_claimed and not is_mine,
        ))
    return result


# ---------------------------------------------------------------------------
# Бронирование персонажей
# ---------------------------------------------------------------------------

@router.post("/claim/{actor_id}", response_model=PlayerClaimResponse)
async def claim_actor(
    actor_id: str,
    x_player_token: Optional[str] = Header(None),
) -> PlayerClaimResponse:
    """Забронировать персонажа и получить сессионный токен."""
    existing_token = app_state.claimed_players.get(actor_id)

    # Idempotent: тот же игрок перебронирует своего персонажа
    if existing_token is not None:
        if x_player_token and existing_token == x_player_token:
            return PlayerClaimResponse(token=existing_token, actor_id=actor_id)
        raise HTTPException(status_code=409, detail="Actor already claimed by another player")

    # Проверяем, что персонаж существует в кампании
    system = app_state.state.core.system
    campaign_id = app_state.state.session.active_campaign_id
    if not campaign_id:
        raise HTTPException(status_code=404, detail="No active campaign set")

    players_dir = get_campaign_players_dir(system, campaign_id)
    if players_dir is None:
        raise HTTPException(status_code=400, detail="Invalid campaign path")

    actor_exists = any(
        json.loads(f.read_text(encoding="utf-8")).get("id") == actor_id
        for f in players_dir.glob("*.json")
        if f.is_file()
    )
    if not actor_exists:
        raise HTTPException(status_code=404, detail="Actor not found in campaign")

    # Если у этого игрока уже есть другой персонаж — освобождаем его
    if x_player_token and x_player_token in app_state.token_to_actor:
        old_actor_id = app_state.token_to_actor.pop(x_player_token)
        app_state.claimed_players.pop(old_actor_id, None)

    token = secrets.token_urlsafe(16)
    app_state.claimed_players[actor_id] = token
    app_state.token_to_actor[token] = actor_id
    return PlayerClaimResponse(token=token, actor_id=actor_id)


@router.get("/actor/{actor_id}")
async def get_player_actor(
    actor_id: str,
    x_player_token: Optional[str] = Header(None),
) -> dict:
    """Вернуть полные данные персонажа (только владельцу по токену).

    Источник истины — **живой стейт боя** (`app_state.state.core.actors`):
    GM-овские правки `actions` / `actions_panel_override` / `sheet_profile_id`
    в мини-карточке во время сессии живут именно там и не пишутся в файл
    кампании. Если актёра в бою нет (например, бой ещё не начат или GM не
    добавлял его в очередь) — fallback на файл кампании, чтобы игрок мог
    открыть лист уже в лобби.
    """
    token = app_state.claimed_players.get(actor_id)
    if token is None:
        raise HTTPException(status_code=404, detail="No claim for this actor")
    if not x_player_token or token != x_player_token:
        raise HTTPException(status_code=403, detail="Invalid token")

    # 1) Live combat state — приоритет. Включает GM-правки макросов и группировки.
    actors = getattr(app_state.state.core, "actors", None) or []
    for a in actors:
        if getattr(a, "id", None) == actor_id:
            return a.model_dump(mode="json")

    # 2) Fallback — файл кампании (актёр ещё не добавлен в бой).
    system = app_state.state.core.system
    campaign_id = app_state.state.session.active_campaign_id
    if not campaign_id:
        raise HTTPException(status_code=404, detail="No active campaign")

    players_dir = get_campaign_players_dir(system, campaign_id)
    if players_dir is None or not players_dir.exists():
        raise HTTPException(status_code=404, detail="Campaign not found")

    for f in players_dir.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if data.get("id") == actor_id:
                actor = Actor.model_validate(data)
                return actor.model_dump(mode="json")
        except Exception:
            continue

    raise HTTPException(status_code=404, detail="Actor file not found")


@router.delete("/claim/{actor_id}")
async def unclaim_actor(
    actor_id: str,
    x_player_token: Optional[str] = Header(None),
) -> dict:
    """Освободить персонажа (игрок уходит или меняет персонажа)."""
    existing_token = app_state.claimed_players.get(actor_id)
    if existing_token is None:
        raise HTTPException(status_code=404, detail="No active claim for this actor")
    if not x_player_token or existing_token != x_player_token:
        raise HTTPException(status_code=403, detail="Invalid token")

    del app_state.claimed_players[actor_id]
    app_state.token_to_actor.pop(existing_token, None)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Управление персонажами кампании (GM)
# ---------------------------------------------------------------------------

def _campaign_players_dir_or_404(system: str, campaign_id: str | None):
    if not campaign_id:
        raise HTTPException(status_code=404, detail="No active campaign")
    players_dir = get_campaign_players_dir(system, campaign_id)
    if players_dir is None:
        raise HTTPException(status_code=400, detail="Invalid campaign path")
    return players_dir


@router.get("/characters")
async def list_campaign_characters() -> list[dict]:
    """GM: полный список персонажей активной кампании."""
    system = app_state.state.core.system
    campaign_id = app_state.state.session.active_campaign_id
    players_dir = _campaign_players_dir_or_404(system, campaign_id)
    return [a.model_dump(mode="json") for a in _load_actors_from_dir(players_dir)]


@router.post("/characters", status_code=201)
async def create_campaign_character(body: PlayerCharacterCreateRequest) -> dict:
    """GM: создать нового персонажа и сохранить в активную кампанию."""
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")

    system = app_state.state.core.system
    campaign_id = app_state.state.session.active_campaign_id
    players_dir = _campaign_players_dir_or_404(system, campaign_id)
    players_dir.mkdir(parents=True, exist_ok=True)

    actor = Actor(
        id=str(uuid.uuid4()),
        name=name,
        role=body.role,
        portrait=body.portrait,
        is_revealed=True,
    )
    (players_dir / f"{actor.id}.json").write_text(
        actor.model_dump_json(indent=2), encoding="utf-8"
    )
    return actor.model_dump(mode="json")


@router.post("/characters/import")
async def import_campaign_character(body: PlayerCharacterImportRequest) -> dict:
    """GM: скопировать актора из ростера или боя в активную кампанию."""
    system = app_state.state.core.system
    campaign_id = app_state.state.session.active_campaign_id
    players_dir = _campaign_players_dir_or_404(system, campaign_id)

    actor: Actor | None = None

    if body.source == "combat":
        actor = next(
            (a for a in app_state.state.core.actors if a.id == body.actor_id), None
        )
    else:
        # Ищем в системном ростере
        actors_dir = get_actors_system_dir(system)
        if actors_dir and actors_dir.exists():
            for f in actors_dir.glob("*.json"):
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    if data.get("id") == body.actor_id:
                        actor = Actor.model_validate(data)
                        break
                except Exception:
                    continue

    if actor is None:
        raise HTTPException(status_code=404, detail="Actor not found")

    players_dir.mkdir(parents=True, exist_ok=True)
    (players_dir / f"{actor.id}.json").write_text(
        actor.model_dump_json(indent=2), encoding="utf-8"
    )
    return actor.model_dump(mode="json")


# ---------------------------------------------------------------------------
# Отчёт о бое + синхронизация данных кампании (GM)
# ---------------------------------------------------------------------------

def _stat_effective_value(cell) -> float | None:
    """Извлечь эффективное числовое значение стата (StatValue или plain number)."""
    try:
        v = stat_cell_effective_scalar(cell)
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


_ROLE_EMOJI: dict[str, str] = {
    "character": "🛡️",
    "ally": "🤝",
    "enemy": "⚔️",
    "neutral": "◆",
}


def _build_combat_report_md(
    *,
    system: str,
    campaign_id: str,
    rounds: int,
    actor_diffs: list[dict],
) -> str:
    """Сформировать Markdown-отчёт о завершённом бое."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    total_actors = len(actor_diffs)
    actors_changed = sum(1 for d in actor_diffs if d.get("changes"))
    total_changes = sum(len(d.get("changes", [])) for d in actor_diffs)

    lines: list[str] = [
        f"# ⚔️ Отчёт о бое",
        "",
        f"> 🕐 **{now}**  ",
        f"> 📚 **Система:** {system}  ",
        f"> 🗺️ **Кампания:** {campaign_id}  ",
        f"> 🔄 **Раундов:** {rounds}",
        "",
        "---",
        "",
        "## 📊 Итоги боя",
        "",
        "| | |",
        "|:---|---:|",
        f"| Участников | **{total_actors}** |",
        f"| С изменениями | **{actors_changed}** |",
        f"| Всего изменений | **{total_changes}** |",
        "",
        "---",
        "",
        "## 📋 Изменения персонажей",
        "",
    ]

    for diff in actor_diffs:
        name = diff["name"]
        role = diff.get("role", "")
        changes = diff.get("changes", [])
        emoji = _ROLE_EMOJI.get(role, "◆")

        lines.append(f"### {emoji} {name}")
        if role:
            lines.append(f"*{role}*")
        lines.append("")

        if changes:
            lines.append("| Характеристика | До | После | Δ |")
            lines.append("|:---|---:|---:|:---:|")
            for ch in changes:
                stat_name = ch["stat_name"]
                old_v = ch["old"]
                new_v = ch["new"]
                delta = ch["delta"]
                if delta > 0:
                    delta_str = f"**▲ +{delta:.0f}**"
                    new_fmt = f"**{new_v}**"
                elif delta < 0:
                    delta_str = f"**▼ {delta:.0f}**"
                    new_fmt = f"**{new_v}**"
                else:
                    delta_str = "—"
                    new_fmt = str(new_v)
                lines.append(f"| {stat_name} | {old_v} | {new_fmt} | {delta_str} |")
        else:
            lines.append("*нет изменений в отслеживаемых статах*")

        lines.append("")

    return "\n".join(lines)


@router.post("/combat-report")
async def generate_combat_report() -> dict:
    """GM: сформировать отчёт о бое, сохранить .md и обновить файлы кампании.

    1. Считает diff живых акторов vs сохранённых файлов кампании.
    2. Генерирует Markdown-отчёт.
    3. Сохраняет report в data/logs/combat_report_<timestamp>.md.
    4. Перезаписывает файлы campaign/players/<id>.json актуальными данными.
    """
    system = app_state.state.core.system
    campaign_id = app_state.state.session.active_campaign_id
    if not campaign_id:
        raise HTTPException(status_code=404, detail="No active campaign")

    players_dir = get_campaign_players_dir(system, campaign_id)
    if players_dir is None or not players_dir.exists():
        raise HTTPException(status_code=404, detail="Campaign players dir not found")

    # Индекс файлов кампании: actor_id -> Actor (до боя)
    campaign_actors: dict[str, Actor] = {
        a.id: a for a in _load_actors_from_dir(players_dir)
    }

    # Живые акторы из боя (источник истины для перезаписи)
    live_actors: dict[str, Actor] = {a.id: a for a in app_state.state.core.actors}

    # Строим дифф
    actor_diffs: list[dict] = []
    for actor_id, before in campaign_actors.items():
        after = live_actors.get(actor_id)
        if after is None:
            # Актор не участвовал в бою — изменений нет
            actor_diffs.append({"name": before.name, "role": before.role, "changes": []})
            continue

        before_stats = before.model_dump(mode="json").get("stats") or {}
        after_stats = after.model_dump(mode="json").get("stats") or {}
        all_keys = set(before_stats.keys()) | set(after_stats.keys())

        changes: list[dict] = []
        for key in sorted(all_keys):
            old_v = _stat_effective_value(before_stats.get(key))
            new_v = _stat_effective_value(after_stats.get(key))
            if old_v is None and new_v is None:
                continue
            if old_v == new_v:
                continue
            delta = (new_v or 0) - (old_v or 0)
            changes.append({
                "stat_name": key,
                "old": int(old_v) if old_v is not None and old_v == int(old_v) else old_v,
                "new": int(new_v) if new_v is not None and new_v == int(new_v) else new_v,
                "delta": delta,
            })

        actor_diffs.append({"name": after.name, "role": after.role, "changes": changes})

    # Генерируем Markdown
    rounds = app_state.state.core.round
    md = _build_combat_report_md(
        system=system,
        campaign_id=campaign_id,
        rounds=rounds,
        actor_diffs=actor_diffs,
    )

    # Сохраняем отчёт на диск
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"combat_report_{timestamp}.md"
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = LOGS_DIR / filename
    report_path.write_text(md, encoding="utf-8")

    # Перезаписываем файлы кампании актуальными данными
    actors_written = 0
    for actor_id, after in live_actors.items():
        if actor_id not in campaign_actors:
            # Актора не было в кампании — пропускаем
            continue
        out_path = players_dir / f"{actor_id}.json"
        out_path.write_text(after.model_dump_json(indent=2), encoding="utf-8")
        actors_written += 1

    return {
        "filename": filename,
        "markdown": md,
        "actors_written": actors_written,
    }
