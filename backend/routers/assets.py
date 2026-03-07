from __future__ import annotations

import json
import re
import shutil

from PIL import Image
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.models import BarProfileConfig
from backend.paths import ASSETS_DIR


router = APIRouter(prefix="/api/assets", tags=["assets"])

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ttf", ".otf"}

# Only list files that match: lowercase id + allowed extension (excludes .DS_Store, etc.)
ASSET_FILENAME_RE = re.compile(r"^[a-z0-9_-]+\.(png|jpg|jpeg|webp|gif|ttf|otf)$")


def _safe_filename(name: str) -> bool:
    """Ensure filename is a single basename, no path traversal."""
    if not name or ".." in name or "/" in name or "\\" in name:
        return False
    return name.strip() == name and len(name) <= 255


@router.get("/effects/{filename}")
async def get_effect_icon(filename: str, system: str = None):
    """Asset Override: serve effect icon. Lookup order: system folder → default/effects → assets/effects."""
    if not _safe_filename(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    paths_to_try = []
    if system and system.strip() and ".." not in system and "/" not in system and "\\" not in system:
        paths_to_try.append(ASSETS_DIR / "systems" / system.strip() / "effects" / filename)
    paths_to_try.append(ASSETS_DIR / "default" / "effects" / filename)
    paths_to_try.append(ASSETS_DIR / "effects" / filename)
    for p in paths_to_try:
        if p.is_file():
            return FileResponse(p)
    raise HTTPException(status_code=404, detail="Effect icon not found")


def _load_bar_config(config_path) -> BarProfileConfig | None:
    """Загружает BarProfileConfig из config.json. Возвращает None при ошибке."""
    if not config_path.is_file():
        return None
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
        return BarProfileConfig.model_validate(data)
    except (OSError, ValueError, Exception):
        return None


@router.get("/bars")
async def list_bar_profiles(system: str | None = None):
    """
    Сканирует data/assets/default/bars/ и при наличии system — data/assets/systems/{system}/bars/.
    В каждой подпапке читает config.json, парсит в BarProfileConfig. Возвращает объединённый список.
    Если конфигов нет — возвращает один дефолтный (id=default).
    """
    result: list[BarProfileConfig] = []
    seen_ids: set[str] = set()

    for base_dir in [
        ASSETS_DIR / "default" / "bars",
        ASSETS_DIR / "systems" / system / "bars" if system and system.strip() and ".." not in system else None,
    ]:
        if base_dir is None or not base_dir.is_dir():
            continue
        for sub in base_dir.iterdir():
            if not sub.is_dir():
                continue
            config_path = sub / "config.json"
            cfg = _load_bar_config(config_path)
            if cfg and cfg.id not in seen_ids:
                seen_ids.add(cfg.id)
                result.append(cfg)

    if not result:
        result = [BarProfileConfig(id="default", name="default")]
    return result


@router.post("/bars")
async def save_bar_profile(config: BarProfileConfig, system: str | None = None):
    """
    Сохраняет конфиг в data/assets/default/bars/{config.id}/config.json
    или в data/assets/systems/{system}/bars/{config.id}/config.json при указании system.
    Создаёт директории при необходимости.
    """
    if not config.id or ".." in config.id or "/" in config.id or "\\" in config.id:
        raise HTTPException(status_code=400, detail="Invalid bar profile id")
    if system and (".." in system or "/" in system or "\\" in system):
        raise HTTPException(status_code=400, detail="Invalid system name")

    if system and system.strip():
        target_dir = ASSETS_DIR / "systems" / system.strip() / "bars" / config.id
    else:
        target_dir = ASSETS_DIR / "default" / "bars" / config.id

    target_dir.mkdir(parents=True, exist_ok=True)
    config_path = target_dir / "config.json"
    config_path.write_text(config.model_dump_json(indent=2), encoding="utf-8")
    return {"status": "ok", "id": config.id}


ALLOWED_BAR_TEXTURE_TYPES = {"bg", "fg", "mask", "overlay"}


@router.post("/bars/{bar_id}/textures")
async def upload_bar_texture(
    bar_id: str,
    texture_type: str = Form(...),
    file: UploadFile = File(...),
    system: str | None = None,
):
    """
    Загружает текстуру (bg, fg, mask, overlay) для профиля бара.
    При переданном system — в data/assets/systems/{system}/bars/{bar_id}/, иначе в data/assets/default/bars/{bar_id}/.
    Сохранение в PNG через Pillow; папки создаются при необходимости.
    """
    if not bar_id or ".." in bar_id or "/" in bar_id or "\\" in bar_id:
        raise HTTPException(status_code=400, detail="Invalid bar_id")
    if texture_type not in ALLOWED_BAR_TEXTURE_TYPES:
        raise HTTPException(status_code=400, detail="texture_type must be one of: bg, fg, mask, overlay")
    if system and (".." in system or "/" in system or "\\" in system):
        raise HTTPException(status_code=400, detail="Invalid system name")

    if system and system.strip():
        target_dir = ASSETS_DIR / "systems" / system.strip() / "bars" / bar_id
    else:
        target_dir = ASSETS_DIR / "default" / "bars" / bar_id

    target_dir.mkdir(parents=True, exist_ok=True)
    out_path = target_dir / f"{texture_type}.png"

    try:
        img = Image.open(file.file)
        img.save(out_path, format="PNG")
    except Exception:
        file.file.seek(0)
        with open(out_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

    return {"status": "ok", "type": texture_type}


@router.get("/bars/{bar_id}/textures/{texture_type}")
async def get_bar_texture(
    bar_id: str,
    texture_type: str,
    system: str | None = None,
):
    """
    Возвращает файл текстуры (bg.png, fg.png, mask.png, overlay.png).
    Приоритет: data/assets/systems/{system}/bars/{bar_id}/ затем data/assets/default/bars/{bar_id}/.
    """
    if not bar_id or ".." in bar_id or "/" in bar_id or "\\" in bar_id:
        raise HTTPException(status_code=400, detail="Invalid bar_id")
    if texture_type not in ALLOWED_BAR_TEXTURE_TYPES:
        raise HTTPException(status_code=400, detail="texture_type must be one of: bg, fg, mask, overlay")
    if system and (".." in system or "/" in system or "\\" in system):
        raise HTTPException(status_code=400, detail="Invalid system name")

    paths_to_try = []
    if system and system.strip():
        paths_to_try.append(ASSETS_DIR / "systems" / system.strip() / "bars" / bar_id / f"{texture_type}.png")
    paths_to_try.append(ASSETS_DIR / "default" / "bars" / bar_id / f"{texture_type}.png")

    for p in paths_to_try:
        if p.is_file():
            return FileResponse(p)

    raise HTTPException(status_code=404, detail="Texture not found")


@router.get("/{category}")
async def list_assets(category: str, system: str = None):
    if category not in ["portraits", "frames", "effects", "fonts", "bars"]:
        raise HTTPException(status_code=400, detail="Invalid category")

    files_dict = {}

    # Default assets
    default_dir = ASSETS_DIR / "default" / category
    if default_dir.exists():
        for f in default_dir.iterdir():
            if f.is_file() and ASSET_FILENAME_RE.fullmatch(f.name):
                files_dict[f.name] = f"/assets/default/{category}/{f.name}"

    # System assets
    if system:
        system_dir = ASSETS_DIR / "systems" / system / category
        if system_dir.exists():
            for f in system_dir.iterdir():
                if f.is_file() and ASSET_FILENAME_RE.fullmatch(f.name):
                    files_dict[f.name] = f"/assets/systems/{system}/{category}/{f.name}"

    return list(files_dict.values())


@router.post("/{category}")
async def upload_asset(category: str, system: str = None, overwrite: bool = False, file: UploadFile = File(...)):
    if category not in ["portraits", "frames", "effects", "fonts", "bars"]:
        raise HTTPException(status_code=400, detail="Invalid category")

    if system:
        target_dir = ASSETS_DIR / "systems" / system / category
        url_prefix = f"/assets/systems/{system}/{category}"
    else:
        target_dir = ASSETS_DIR / "default" / category
        url_prefix = f"/assets/default/{category}"

    target_dir.mkdir(parents=True, exist_ok=True)
    file_path = target_dir / file.filename
    if file_path.exists() and not overwrite:
        raise HTTPException(status_code=409, detail="Asset with this ID already exists")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"url": f"{url_prefix}/{file.filename}"}


@router.delete("/{category}/{filename}")
async def delete_asset(category: str, filename: str, system: str = None):
    if category not in ["portraits", "frames", "effects", "fonts", "bars"]:
        raise HTTPException(status_code=400, detail="Invalid category")

    if system:
        file_path = ASSETS_DIR / "systems" / system / category / filename
    else:
        file_path = ASSETS_DIR / "default" / category / filename

    if file_path.exists():
        file_path.unlink()
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="File not found")

