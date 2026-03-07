from __future__ import annotations

import re
import shutil

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

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

