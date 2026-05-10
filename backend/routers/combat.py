from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Header
from pydantic import BaseModel, ConfigDict, Field

from backend import combat_engine
from backend import state as app_state
from backend.engines.manager import (
    build_queue_for_session,
    next_turn_for_session,
    system_has_custom_logic_file,
)
from backend.history import save_snapshot
from backend.models import (
    ClearCombatRequest,
    CombatSession,
    LegendConfig,
    LogEntry,
    MatrixUseRequest,
    RollRequest,
    combat_session_public_payload,
)
from backend.paths import LOGS_DIR
from backend.routers.hardware import get_esp_manager
from backend.routers.ws import broadcast_roll_event, broadcast_state
from backend.routers.ws import broadcast_roll_request_status_to_player, broadcast_roll_request_to_gm
from backend.services.ai_chat_history import clear_history as clear_ai_chat_history
from backend.services.out_of_turn_roll_policy import player_may_roll_now
from backend.services import led_interceptor
from backend.services.dice import DiceManager, RollResult
from backend.services.initiative_roll import (
    apply_initiative_rolls_to_actor_list,
    initiative_roll_available,
    resolve_initiative_expression,
)
from backend.services.logger import (
    add_log,
    combat_history_archive_json,
    combat_history_archive_markdown,
)
from backend.services.matrix import MatrixManager
from backend.services.render_push import proactive_render_and_push


router = APIRouter(prefix="/api/combat", tags=["combat"])


class MatrixSelectionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actor_id: str = Field(..., min_length=1)
    cell_id: str = Field(..., min_length=1)
    slot_index: int = 0
    queued: bool = True


class MatrixGhostPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    matrix_ghost_global: bool | None = None
    actor_id: str | None = None
    row_ghost: bool | None = None


def _flush_matrix_queue_for_actor_ids(actor_ids: list[str]) -> None:
    """Emit log lines for queued matrix cells for the ending turn slot; clear those queues."""
    st = app_state.state
    sess = st.session
    ghost_glob = sess.matrix_ghost_global
    for aid in actor_ids:
        qraw = sess.matrix_cell_queue.get(aid)
        if not isinstance(qraw, list) or len(qraw) == 0:
            sess.matrix_cell_queue.pop(aid, None)
            continue
        actor = next((a for a in st.core.actors if a.id == aid), None)
        groups = sess.prerolls.get(aid)
        if not isinstance(groups, list):
            groups = []
        row_ghost = bool(sess.matrix_row_ghost.get(aid))
        if ghost_glob or row_ghost or actor is None:
            sess.matrix_cell_queue[aid] = []
            continue
        for raw in qraw:
            if not isinstance(raw, dict):
                continue
            cid = str(raw.get("cell_id") or "").strip()
            try:
                sidx = int(raw.get("slot_index", 0))
            except (TypeError, ValueError):
                sidx = 0
            parent, slot = MatrixManager.find_slot(groups, cid, sidx)
            if parent is None or slot is None:
                continue
            if slot.get("used"):
                continue
            results = slot.get("results") or []
            totals: list[Any] = []
            detail_lines: list[str] = []
            for r in results:
                if isinstance(r, dict):
                    totals.append(r.get("total"))
                    formula = str(r.get("formula", ""))
                    det_str = str(r.get("details", ""))
                    detail_lines.append(f"{formula} → {r.get('total')} ({det_str})")
            label = str(parent.get("label") or parent.get("rule_id") or cid)
            msg = f"Matrix «{label}» #{sidx + 1}: {' | '.join(str(x) for x in totals)}"
            add_log(
                "text",
                actor_id=actor.id,
                actor_name=actor.name,
                details={
                    "is_matrix_use": True,
                    "is_matrix_queue_flush": True,
                    "cell_id": cid,
                    "label": label,
                    "slot_index": sidx,
                    "totals": totals,
                    "breakdown": detail_lines,
                    "message": msg,
                },
            )
        sess.matrix_cell_queue[aid] = []

_dice = DiceManager()
_archive_warn = logging.getLogger("omniboard.combat_archive")


def _write_combat_archive_sync(md_text: str, json_text: str) -> None:
    archives_dir = LOGS_DIR / "archives"
    archives_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    suffix = uuid.uuid4().hex[:8]
    stem = archives_dir / f"combat_{stamp}_{suffix}"
    stem.with_suffix(".md").write_text(md_text, encoding="utf-8")
    stem.with_suffix(".json").write_text(json_text, encoding="utf-8")


async def _refresh_initiative_line_safe(session: CombatSession) -> None:
    try:
        await get_esp_manager().refresh_initiative_line(session)
    except Exception:
        pass


def _queue_initiative_line_refresh(background_tasks: BackgroundTasks) -> None:
    background_tasks.add_task(_refresh_initiative_line_safe, app_state.state)


class InitiativeSettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    initiative_include_character: bool | None = None
    initiative_include_enemy: bool | None = None
    initiative_include_ally: bool | None = None
    initiative_include_neutral: bool | None = None
    initiative_reroll_locked: bool | None = None
    initiative_show_per_actor_dice: bool | None = None


class InitiativeRollBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actor_ids: list[str] | None = Field(default=None)


def _initiative_roll_log_details(result: RollResult) -> dict[str, Any]:
    return {
        "expression": str(result.formula),
        "formula": str(result.formula),
        "total": int(result.total),
        "details": str(result.details),
        "is_glitch": bool(result.is_glitch),
        "is_crit_glitch": bool(result.is_crit_glitch),
        "is_initiative_roll": True,
    }


def _maybe_reroll_locked_initiative_on_new_round(prev_round: int) -> None:
    """Переброс инициативы в начале нового раунда (round вырос), если включён замок."""
    st = app_state.state
    if st.core.round <= prev_round:
        return
    if not st.session.initiative_reroll_locked:
        return
    if not st.core.is_active or not st.core.turn_queue:
        return
    if (st.core.engine_type or "").lower() == "popcorn":
        return
    system_name = (st.core.system or "").strip()
    if not initiative_roll_available(system_name):
        return
    expr = resolve_initiative_expression(system_name)
    if expr is None:
        return
    sess = st.session
    new_actors, rolls = apply_initiative_rolls_to_actor_list(
        list(st.core.actors),
        expr,
        only_actor_ids=None,
        include_character=sess.initiative_include_character,
        include_enemy=sess.initiative_include_enemy,
        include_ally=sess.initiative_include_ally,
        include_neutral=sess.initiative_include_neutral,
    )
    st.core.actors = new_actors
    if st.core.is_active and st.core.turn_queue:
        combat_engine.rebuild_turn_queue_after_initiative_reroll()
    for aid, aname, res in rolls:
        add_log(
            "roll",
            actor_id=aid,
            actor_name=aname,
            details=_initiative_roll_log_details(res),
        )


def _log_turn_progression(
    prev_round: int, prev_effects_by_actor: dict[str, dict[str, str]]
) -> None:
    """Mirror legacy combat_engine.next_turn logging (round, effects, turn starts)."""
    st = app_state.state
    if st.core.round > prev_round:
        add_log("round_start")
        # Пасы «бросок вне хода на этот раунд» действуют только в раунде, в котором выданы.
        r_now = int(st.core.round)
        st.session.actor_out_of_turn_round_pass = {
            aid: int(r)
            for aid, r in st.session.actor_out_of_turn_round_pass.items()
            if int(r) == r_now
        }
    for a in st.core.actors:
        prev_by_id = prev_effects_by_actor.get(a.id, {})
        new_ids = {e.id for e in a.effects}
        removed_ids = set(prev_by_id.keys()) - new_ids
        for eid in removed_ids:
            eff_name = prev_by_id.get(eid) or eid
            add_log(
                "effect_removed",
                actor_id=a.id,
                actor_name=a.name,
                details={"effect_name": eff_name},
            )
    for aid in combat_engine.current_turn_slot_actor_ids():
        actor = next((x for x in app_state.state.core.actors if x.id == aid), None)
        if actor:
            add_log("turn_start", actor_id=actor.id, actor_name=actor.name)


@router.get("/state")
async def get_state():
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


def _roll_log_details(body: RollRequest, result: RollResult) -> dict[str, Any]:
    """Serialize roll log details with JSON-safe primitive values only."""
    d: dict[str, Any] = {
        "expression": str(body.expression or "").strip(),
        "formula": str(result.formula),
        "total": int(result.total),
        "details": str(result.details),
        "is_glitch": bool(result.is_glitch),
        "is_crit_glitch": bool(result.is_crit_glitch),
    }
    if body.comment and str(body.comment).strip():
        d["comment"] = str(body.comment).strip()
    return d


@router.post("/roll")
async def roll_generic(body: RollRequest):
    """Системный бросок без привязки к актору ([stat] не подставляются)."""
    st = app_state.state
    expr = (body.expression or "").strip()
    if not expr:
        raise HTTPException(status_code=400, detail="expression is required")
    system_name = (st.core.system or "").strip()
    result = _dice.execute_roll(expr, system_name, None)
    if not body.is_preroll:
        log_details = dict(_roll_log_details(body, result))
        log_details["is_generic_roll"] = True
        add_log(
            "roll",
            actor_id=None,
            actor_name="GM",
            details=log_details,
            is_secret=bool(getattr(body, "is_secret", False)),
        )
    await save_snapshot()
    await broadcast_state()
    if getattr(body, "is_secret", False):
        await broadcast_roll_event(
            actor_id=None,
            payload={
                "actor_id": None,
                "actor_name": "GM",
                "is_secret": True,
                **result.model_dump(mode="json"),
            },
        )
    return result.model_dump(mode="json")


@router.post("/actors/{actor_id}/roll")
async def roll_for_actor(
    actor_id: str,
    body: RollRequest,
    x_player_token: str | None = Header(None),
):
    """Бросок кубов с подстановкой [stat] из актора; опционально без записи в лог (preroll)."""
    st = app_state.state
    actor = next((a for a in st.core.actors if a.id == actor_id), None)
    if actor is None:
        raise HTTPException(status_code=404, detail="actor not found")
    expr = (body.expression or "").strip()
    if not expr:
        raise HTTPException(status_code=400, detail="expression is required")
    system_name = (st.core.system or "").strip()
    result = _dice.execute_roll(expr, system_name, actor)

    is_secret = bool(getattr(body, "is_secret", False))
    is_player_roll = (
        x_player_token is not None
        and app_state.claimed_players.get(actor.id) == x_player_token
        and app_state.token_to_actor.get(x_player_token) == actor.id
    )
    if is_player_roll and not body.is_preroll and not player_may_roll_now(st, actor.id):
        raise HTTPException(status_code=403, detail="out-of-turn roll not permitted")
    if not body.is_preroll:
        add_log(
            "roll",
            actor_id=actor.id,
            actor_name=actor.name,
            details=_roll_log_details(body, result),
            is_secret=is_secret,
        )
    await save_snapshot()
    await broadcast_state()
    # Player rolls: always notify GM via roll_event (toast).
    # Secret rolls: also notify the author (and GM) via roll_event.
    if is_player_roll:
        await broadcast_roll_event(
            actor_id=None,
            payload={
                "actor_id": actor.id,
                "actor_name": actor.name,
                "is_secret": is_secret,
                **result.model_dump(mode="json"),
            },
        )
    if is_secret:
        await broadcast_roll_event(
            actor_id=actor.id,
            payload={
                "actor_id": actor.id,
                "actor_name": actor.name,
                "is_secret": True,
                **result.model_dump(mode="json"),
            },
        )
    return result.model_dump()


@router.post("/roll-requests/{request_id}/resolve")
async def resolve_roll_request(request_id: str, payload: dict):
    """Resolve a pending out-of-turn roll request.

    Body: { decision: 'approve_once' | 'deny' | 'grant_actor_round' }
    grant_actor_round — этому актёру разрешить броски вне хода до конца текущего раунда + выполнить этот бросок.
    """
    decision = str(payload.get("decision") or "").strip().lower()
    if decision not in ("approve_once", "deny", "grant_actor_round"):
        raise HTTPException(status_code=422, detail="invalid decision")

    st = app_state.state
    req = st.session.pending_roll_requests.pop(request_id, None)
    if not isinstance(req, dict):
        raise HTTPException(status_code=404, detail="request not found")

    actor_id = str(req.get("actor_id") or "").strip()
    expr = str(req.get("expression") or "").strip()
    comment = str(req.get("comment") or "").strip() or None
    is_secret = bool(req.get("is_secret") is True)

    if not actor_id or not expr:
        raise HTTPException(status_code=422, detail="invalid request payload")

    actor = next((a for a in st.core.actors if a.id == actor_id), None)
    actor_name = actor.name if actor else str(req.get("actor_name") or actor_id)

    if decision == "deny":
        await broadcast_state()
        await broadcast_roll_request_status_to_player(
            actor_id=actor_id,
            payload={"request_id": request_id, "status": "denied"},
        )
        return {"ok": True, "status": "denied"}

    if actor is None:
        await broadcast_state()
        await broadcast_roll_request_status_to_player(
            actor_id=actor_id,
            payload={"request_id": request_id, "status": "denied", "reason": "actor not found"},
        )
        return {"ok": True, "status": "denied"}

    if decision == "grant_actor_round":
        st.session.actor_out_of_turn_round_pass[actor.id] = int(st.core.round)

    system_name = (st.core.system or "").strip()
    result = _dice.execute_roll(expr, system_name, actor)
    details = dict(_roll_log_details(RollRequest(expression=expr, comment=comment), result))
    add_log(
        "roll",
        actor_id=actor.id,
        actor_name=actor.name,
        details=details,
        is_secret=is_secret,
    )
    await save_snapshot()
    await broadcast_state()

    # GM toast always; player gets roll_event too (no HTTP response on approval flow).
    await broadcast_roll_event(
        actor_id=None,
        payload={"actor_id": actor.id, "actor_name": actor_name, "is_secret": is_secret, **result.model_dump(mode="json")},
    )
    await broadcast_roll_event(
        actor_id=actor.id,
        payload={"actor_id": actor.id, "actor_name": actor_name, "is_secret": is_secret, **result.model_dump(mode="json")},
    )

    await broadcast_roll_request_status_to_player(
        actor_id=actor.id,
        payload={"request_id": request_id, "status": "approved"},
    )
    return {"ok": True, "status": "approved", "result": result.model_dump(mode="json")}


@router.patch("/initiative/settings")
async def patch_initiative_settings(body: InitiativeSettingsPatch):
    st = app_state.state
    patch = body.model_dump(exclude_unset=True)
    for key, val in patch.items():
        setattr(st.session, key, val)
    await save_snapshot()
    await broadcast_state()
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/initiative/roll")
async def roll_initiative(background_tasks: BackgroundTasks, body: InitiativeRollBody = Body(default_factory=InitiativeRollBody)):
    st = app_state.state
    system_name = (st.core.system or "").strip()
    if not initiative_roll_available(system_name):
        raise HTTPException(
            status_code=400,
            detail="initiative_roll is disabled for this system (none)",
        )
    expr = resolve_initiative_expression(system_name)
    if expr is None:
        raise HTTPException(status_code=400, detail="initiative_roll unavailable")

    raw_ids = body.actor_ids
    only: set[str] | None = None
    if raw_ids is not None:
        only = {str(x).strip() for x in raw_ids if str(x).strip()}
        known = {a.id for a in st.core.actors}
        unknown = only - known
        if unknown:
            raise HTTPException(status_code=400, detail="unknown actor_ids")

    sess = st.session
    new_actors, rolls = apply_initiative_rolls_to_actor_list(
        list(st.core.actors),
        expr,
        only_actor_ids=only,
        include_character=sess.initiative_include_character,
        include_enemy=sess.initiative_include_enemy,
        include_ally=sess.initiative_include_ally,
        include_neutral=sess.initiative_include_neutral,
    )
    st.core.actors = new_actors
    if st.core.is_active and st.core.turn_queue:
        combat_engine.reorder_turn_queue()

    for aid, aname, res in rolls:
        add_log(
            "roll",
            actor_id=aid,
            actor_name=aname,
            details=_initiative_roll_log_details(res),
        )

    await save_snapshot()
    await broadcast_state()
    _queue_initiative_line_refresh(background_tasks)

    payload = combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )
    payload["initiative_roll_results"] = [
        {"actor_id": aid, "actor_name": aname, **res.model_dump(mode="json")}
        for aid, aname, res in rolls
    ]
    return payload


@router.post("/matrix/generate")
async def matrix_generate():
    """Сгенерировать предброски матрицы для всех акторов по matrix.json (ADR-4 override)."""
    st = app_state.state
    prerolls = MatrixManager.build_prerolls(st, _dice)
    st.session.prerolls = prerolls
    st.session.matrix_cell_queue = {}
    await save_snapshot()
    await broadcast_state()
    return {"prerolls": prerolls}


@router.patch("/matrix/selection")
async def matrix_patch_selection(body: MatrixSelectionPatch):
    """Toggle queued matrix cell for ``POST /next-turn`` flush."""
    st = app_state.state
    aid = body.actor_id.strip()
    actor = next((a for a in st.core.actors if a.id == aid), None)
    if actor is None:
        raise HTTPException(status_code=404, detail="actor not found")
    cid = body.cell_id.strip()
    q = st.session.matrix_cell_queue.setdefault(aid, [])
    token = {"cell_id": cid, "slot_index": int(body.slot_index)}

    def _same(item: dict[str, Any]) -> bool:
        return (
            str(item.get("cell_id") or "").strip() == cid
            and int(item.get("slot_index", 0)) == int(body.slot_index)
        )

    if body.queued:
        if not any(isinstance(x, dict) and _same(x) for x in q):
            q.append(token)
    else:
        st.session.matrix_cell_queue[aid] = [x for x in q if not (isinstance(x, dict) and _same(x))]
        if len(st.session.matrix_cell_queue[aid]) == 0:
            st.session.matrix_cell_queue.pop(aid, None)
    await save_snapshot()
    await broadcast_state()
    return {"ok": True}


@router.patch("/matrix/ghost")
async def matrix_patch_ghost(body: MatrixGhostPatch):
    """Global or per-actor ghost mode for matrix queue logging."""
    st = app_state.state
    if body.matrix_ghost_global is not None:
        st.session.matrix_ghost_global = bool(body.matrix_ghost_global)
    aid = (body.actor_id or "").strip()
    if aid and body.row_ghost is not None:
        if body.row_ghost:
            st.session.matrix_row_ghost[aid] = True
        else:
            st.session.matrix_row_ghost.pop(aid, None)
    await save_snapshot()
    await broadcast_state()
    return {"ok": True}


@router.post("/actors/{actor_id}/matrix/use")
async def matrix_use_preroll(actor_id: str, body: MatrixUseRequest):
    """Пометить слот матрицы использованным и записать строку в лог."""
    st = app_state.state
    actor = next((a for a in st.core.actors if a.id == actor_id), None)
    if actor is None:
        raise HTTPException(status_code=404, detail="actor not found")
    groups = st.session.prerolls.get(actor_id)
    if not isinstance(groups, list):
        raise HTTPException(status_code=400, detail="no matrix prerolls for actor")
    rule_id = (body.rule_id or "").strip()
    target, slot = MatrixManager.find_slot(groups, rule_id, body.index)
    if target is None or slot is None:
        raise HTTPException(status_code=404, detail="rule not found")
    if slot.get("used"):
        raise HTTPException(status_code=400, detail="slot already used")
    slot["used"] = True
    results = slot.get("results") or []
    totals: list[Any] = []
    for r in results:
        if isinstance(r, dict) and "total" in r:
            totals.append(r.get("total"))
    label = str(target.get("label") or rule_id)
    msg = f"Matrix «{label}» #{body.index + 1}: {', '.join(str(x) for x in totals)}"
    add_log(
        "text",
        actor_id=actor.id,
        actor_name=actor.name,
        details={
            "is_matrix_use": True,
            "rule_id": rule_id,
            "label": label,
            "index": body.index,
            "totals": totals,
            "message": msg,
        },
    )
    await save_snapshot()
    await broadcast_state()
    return {"ok": True}


@router.patch("/system")
async def update_combat_system(payload: dict, background_tasks: BackgroundTasks):
    system_name = (payload.get("system") or "").strip()
    if not system_name:
        raise HTTPException(status_code=400, detail="system is required")
    await save_snapshot()
    tq = list(app_state.state.core.turn_queue)
    idx = app_state.state.core.current_index
    current_actor_id = tq[idx] if tq and 0 <= idx < len(tq) else None
    app_state.state.core.system = system_name
    new_queue = build_queue_for_session(app_state.state)
    app_state.state.core.turn_queue = new_queue
    if current_actor_id and current_actor_id in new_queue:
        app_state.state.core.current_index = new_queue.index(current_actor_id)
    else:
        app_state.state.core.current_index = (
            min(idx, len(new_queue) - 1) if new_queue else 0
        )
    await save_snapshot()
    await broadcast_state()
    _queue_initiative_line_refresh(background_tasks)
    return {"system": app_state.state.core.system}


@router.post("/undo")
async def undo_combat():
    changed = combat_engine.undo()
    if changed:
        await broadcast_state()
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/redo")
async def redo_combat():
    changed = combat_engine.redo()
    if changed:
        await broadcast_state()
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/next-turn")
async def next_turn(background_tasks: BackgroundTasks, payload: dict = Body(default_factory=dict)):
    raw_target = payload.get("target_actor_id")
    if isinstance(raw_target, str):
        target_actor_id = raw_target.strip() or None
    else:
        target_actor_id = None

    st = app_state.state
    # Classic next-turn needs a queue; manual mode uses the same endpoint for row clicks and "next round"
    if not st.core.turn_queue and not st.core.is_manual_mode:
        return {"error": "Queue empty"}

    prev_ids = combat_engine.current_turn_slot_actor_ids()
    # Snapshot is RAM-only; keep it in-request for correct Undo/Redo semantics.
    await save_snapshot()
    prev_round = st.core.round
    prev_effects_by_actor: dict[str, dict[str, str]] = {
        a.id: {e.id: e.name for e in a.effects} for a in st.core.actors
    }
    _flush_matrix_queue_for_actor_ids(list(prev_ids))
    app_state.state = next_turn_for_session(st, target_actor_id)
    _log_turn_progression(prev_round, prev_effects_by_actor)
    _maybe_reroll_locked_initiative_on_new_round(prev_round)

    if app_state.state.core.round > prev_round:
        app_state.state.session.prerolls = MatrixManager.build_prerolls(app_state.state, _dice)
        app_state.state.session.matrix_cell_queue = {}

    # Second snapshot captures the new state (still RAM-only and fast).
    await save_snapshot()

    # UI must see the new turn before any hardware/render side effects.
    async def _reset_prev_leds(ids: list[str]) -> None:
        await asyncio.gather(
            *[led_interceptor.reset_actor_led_to_default(aid) for aid in ids],
            return_exceptions=True,
        )

    async def _process_turn_start_leds(ids: list[str]) -> None:
        await asyncio.gather(
            *[led_interceptor.process_led_trigger(aid, "turn_start") for aid in ids],
            return_exceptions=True,
        )

    async def _run_turn_side_effects(prev_actor_ids: list[str], current_actor_ids: list[str]) -> None:
        await asyncio.gather(
            _reset_prev_leds(prev_actor_ids),
            _process_turn_start_leds(current_actor_ids),
            *[proactive_render_and_push(aid) for aid in current_actor_ids],
            return_exceptions=True,
        )

    current_ids = list(combat_engine.current_turn_slot_actor_ids())
    await broadcast_state()
    background_tasks.add_task(_run_turn_side_effects, list(prev_ids), current_ids)
    _queue_initiative_line_refresh(background_tasks)

    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/prev-turn")
async def prev_turn(background_tasks: BackgroundTasks):
    st = app_state.state
    if not st.core.turn_queue:
        return {"error": "Queue empty"}

    await save_snapshot()
    st.core.current_index = (st.core.current_index - 1) % len(st.core.turn_queue)
    await save_snapshot()
    await broadcast_state()
    _queue_initiative_line_refresh(background_tasks)

    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/start")
async def start_combat(background_tasks: BackgroundTasks):
    await save_snapshot()
    app_state.state.core.is_active = True
    app_state.state.core.round = 1
    app_state.state.core.turn_queue = build_queue_for_session(app_state.state)
    app_state.state.core.current_index = 0
    add_log("combat_start")
    await save_snapshot()
    await broadcast_state()
    _queue_initiative_line_refresh(background_tasks)
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/end")
async def end_combat():
    await save_snapshot()
    combat_engine.end_combat(add_log)
    history = list(app_state.state.session.history)
    md_text = combat_history_archive_markdown(history)
    json_text = combat_history_archive_json(history)
    try:
        await asyncio.to_thread(_write_combat_archive_sync, md_text, json_text)
    except Exception:
        _archive_warn.warning("combat log archive write failed", exc_info=True)
    await save_snapshot()
    await broadcast_state()
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/reset")
async def reset_combat():
    await save_snapshot()
    combat_engine.reset_combat_state()
    # Clear log files
    (LOGS_DIR / "latest_combat.json").write_text("[]", encoding="utf-8")
    (LOGS_DIR / "latest_combat.md").write_text("", encoding="utf-8")
    await save_snapshot()
    await broadcast_state()
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/clear")
async def clear_combat(body: ClearCombatRequest = Body(default_factory=ClearCombatRequest)):
    """Clear the table: optional pinned retention; disk logs cleared; undo stack preserved."""
    st = app_state.state
    actors = list(st.core.actors)
    if body.keep_pinned:
        removed = [a for a in actors if not getattr(a, "is_pinned", False)]
        retained_for_minis = [a for a in actors if getattr(a, "is_pinned", False)]
    else:
        removed = actors
        retained_for_minis = []
    retained_mini_ids = {
        mid
        for mid in (
            str(getattr(a, "miniature_id", None) or "").strip()
            for a in retained_for_minis
        )
        if mid
    }
    removed_miniature_ids = {
        mid
        for mid in (
            str(getattr(a, "miniature_id", None) or "").strip()
            for a in removed
        )
        if mid
    }
    removed_miniature_ids -= retained_mini_ids

    await save_snapshot()
    combat_engine.clear_combat_state(keep_pinned=body.keep_pinned)

    (LOGS_DIR / "latest_combat.json").write_text("[]", encoding="utf-8")
    (LOGS_DIR / "latest_combat.md").write_text("", encoding="utf-8")

    # Chat lives "in scope of combat" but on its own file (state_ai_chat.json) —
    # clear it together so a fresh combat starts with a clean conversation.
    clear_ai_chat_history()

    await save_snapshot()
    await broadcast_state()
    if removed_miniature_ids:
        await get_esp_manager().sleep_all(only_ids=removed_miniature_ids)
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.patch("/settings")
async def update_combat_settings(payload: dict):
    await save_snapshot()
    if "enable_logging" in payload:
        app_state.state.session.enable_logging = bool(payload["enable_logging"])
    if "autosave_enabled" in payload:
        app_state.state.session.autosave_enabled = bool(payload["autosave_enabled"])
    if "table_centered" in payload:
        app_state.state.display.table_centered = bool(payload["table_centered"])
    if "sticky_first_column" in payload:
        app_state.state.display.sticky_first_column = bool(payload["sticky_first_column"])
    if "sticky_last_column" in payload:
        app_state.state.display.sticky_last_column = bool(payload["sticky_last_column"])
    if "show_macros_column" in payload:
        app_state.state.display.show_macros_column = bool(payload["show_macros_column"])
    if "sheet_mode" in payload:
        raw_mode = str(payload.get("sheet_mode") or "").strip().lower()
        if raw_mode in ("raw", "universal", "system"):
            app_state.state.display.sheet_mode = raw_mode
    if "selected_layout_id" in payload:
        sid = str(payload.get("selected_layout_id") or "").strip()
        if sid:
            app_state.state.display.selected_layout_id = sid
    if "is_manual_mode" in payload:
        app_state.state.core.is_manual_mode = bool(payload["is_manual_mode"])
    if "engine_type" in payload and not system_has_custom_logic_file(app_state.state.core.system):
        raw = str(payload.get("engine_type") or "").strip().lower()
        if raw in ("standard", "phase", "popcorn"):
            app_state.state.core.engine_type = raw
    if "screen_brightness" in payload:
        # 1–100 (%); нормализация и миграция с 0–255 — в HardwareState
        app_state.state.hardware.screen_brightness = int(payload["screen_brightness"])
    if "allow_out_of_turn_rolls" in payload:
        app_state.state.session.allow_out_of_turn_rolls = bool(payload["allow_out_of_turn_rolls"])

    await save_snapshot()
    # Persist current state of settings immediately to disk (non-blocking)
    await app_state.save_state_async()
    await broadcast_state()
    return {
        "enable_logging": app_state.state.session.enable_logging,
        "autosave_enabled": app_state.state.session.autosave_enabled,
        "table_centered": app_state.state.display.table_centered,
        "sticky_first_column": app_state.state.display.sticky_first_column,
        "sticky_last_column": app_state.state.display.sticky_last_column,
        "show_macros_column": app_state.state.display.show_macros_column,
        "sheet_mode": app_state.state.display.sheet_mode,
        "selected_layout_id": app_state.state.display.selected_layout_id,
        "is_manual_mode": app_state.state.core.is_manual_mode,
        "engine_type": app_state.state.core.engine_type,
        "screen_brightness": app_state.state.hardware.screen_brightness,
        "allow_out_of_turn_rolls": app_state.state.session.allow_out_of_turn_rolls,
    }


@router.patch("/legend")
async def update_legend(payload: dict):
    await save_snapshot()
    legend_keys = {"player", "enemy", "ally", "neutral"}
    if any(k in payload for k in legend_keys):
        app_state.state.display.legend = LegendConfig(
            **{k: payload.get(k, getattr(app_state.state.display.legend, k)) for k in legend_keys}
        )
    if "show_group_colors" in payload:
        app_state.state.display.show_group_colors = bool(payload["show_group_colors"])
    if "show_faction_colors" in payload:
        app_state.state.display.show_faction_colors = bool(payload["show_faction_colors"])
    await save_snapshot()
    await broadcast_state()
    return {
        "legend": app_state.state.display.legend,
        "show_group_colors": app_state.state.display.show_group_colors,
        "show_faction_colors": app_state.state.display.show_faction_colors,
    }


@router.post("/log/note")
async def add_log_note(payload: dict):
    message = (payload.get("message") or "").strip()
    add_log("text", details={"message": message, "is_gm_note": True})
    await broadcast_state()
    return {"status": "ok"}


@router.delete("/log")
async def clear_combat_log():
    app_state.state.session.history = []
    (LOGS_DIR / "latest_combat.json").write_text("[]", encoding="utf-8")
    (LOGS_DIR / "latest_combat.md").write_text("", encoding="utf-8")
    await broadcast_state()
    return {"status": "ok"}


@router.post("/load")
async def load_combat(payload: dict, background_tasks: BackgroundTasks):
    await save_snapshot()

    # Полный вложенный снимок (экспорт / автосейв); иначе — плоский legacy-энкаунтер.
    if isinstance(payload, dict) and isinstance(payload.get("core"), dict):
        pinned_actors = [a for a in app_state.state.core.actors if getattr(a, "is_pinned", False)]
        pinned_ids = {a.id for a in pinned_actors}
        try:
            loaded = CombatSession.model_validate(payload)
        except Exception as e:
            raise HTTPException(status_code=422, detail=str(e))
        new_actors = [a for a in loaded.core.actors if a.id not in pinned_ids]
        app_state.state = loaded.model_copy(
            update={
                "core": loaded.core.model_copy(
                    update={"actors": pinned_actors + new_actors}
                )
            }
        )
        await save_snapshot()
        await broadcast_state()
        _queue_initiative_line_refresh(background_tasks)
        return combat_session_public_payload(
            app_state.state,
            initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
        )

    actors_data = payload.get("actors", [])
    from backend.models import Actor  # local import: avoid bloating module import graph

    # Keep pinned actors; they are not replaced by the loaded encounter
    pinned_actors = [a for a in app_state.state.core.actors if getattr(a, "is_pinned", False)]
    pinned_ids = {a.id for a in pinned_actors}

    try:
        new_actors = [
            Actor(**a) if isinstance(a, dict) else a
            for a in actors_data
            if (a.get("id") if isinstance(a, dict) else getattr(a, "id", None)) not in pinned_ids
        ]
        app_state.state.core.actors = pinned_actors + new_actors
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    history_data = payload.get("history", [])
    try:
        app_state.state.session.history = [LogEntry(**h) for h in history_data]
    except Exception:
        app_state.state.session.history = []

    round_val = payload.get("round")
    if round_val is not None and isinstance(round_val, (int, float)):
        app_state.state.core.round = max(1, int(round_val))
    elif app_state.state.session.history:
        app_state.state.core.round = max(
            (e.round for e in app_state.state.session.history), default=1
        )
    else:
        app_state.state.core.round = 1

    actor_ids = {a.id for a in app_state.state.core.actors}
    turn_queue = payload.get("turn_queue")
    if isinstance(turn_queue, list) and len(turn_queue) > 0:
        app_state.state.core.turn_queue = [aid for aid in turn_queue if aid in actor_ids]
        app_state.state.core.current_index = max(
            0,
            min(int(payload.get("current_index", 0)), len(app_state.state.core.turn_queue) - 1),
        )
        app_state.state.core.is_active = bool(payload.get("is_active", False))
    else:
        app_state.state.core.turn_queue = []
        app_state.state.core.current_index = 0
        app_state.state.core.is_active = False

    await save_snapshot()
    await broadcast_state()
    _queue_initiative_line_refresh(background_tasks)
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )
