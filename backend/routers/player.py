"""Player View API — лобби, управление кампаниями, бронирование персонажей."""
from __future__ import annotations

import json
import secrets
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Header

from backend import state as app_state
from backend.models import (
    Actor,
    ActiveCampaignRequest,
    CampaignCreateRequest,
    CampaignInfo,
    PlayerCharacterCreateRequest,
    PlayerCharacterImportRequest,
    PlayerCharacterSummary,
    PlayerClaimResponse,
)
from backend.paths import get_actors_system_dir, get_campaign_players_dir, get_campaigns_system_dir
from backend.routers.ws import broadcast_state

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
    """Вернуть полные данные персонажа (только владельцу по токену)."""
    token = app_state.claimed_players.get(actor_id)
    if token is None:
        raise HTTPException(status_code=404, detail="No claim for this actor")
    if not x_player_token or token != x_player_token:
        raise HTTPException(status_code=403, detail="Invalid token")

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
