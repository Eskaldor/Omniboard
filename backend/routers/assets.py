from __future__ import annotations

import shutil

from fastapi import APIRouter, File, HTTPException, UploadFile

from backend.paths import ASSETS_DIR


router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/{category}")
async def list_assets(category: str, system: str = None):
    if category not in ["portraits", "frames", "effects"]:
        raise HTTPException(status_code=400, detail="Invalid category")

    files_dict = {}

    # Default assets
    default_dir = ASSETS_DIR / "default" / category
    if default_dir.exists():
        for f in default_dir.iterdir():
            if f.is_file() and f.suffix.lower() in [".png", ".jpg", ".jpeg", ".gif", ".webp"]:
                files_dict[f.name] = f"/assets/default/{category}/{f.name}"

    # System assets
    if system:
        system_dir = ASSETS_DIR / "systems" / system / category
        if system_dir.exists():
            for f in system_dir.iterdir():
                if f.is_file() and f.suffix.lower() in [".png", ".jpg", ".jpeg", ".gif", ".webp"]:
                    files_dict[f.name] = f"/assets/systems/{system}/{category}/{f.name}"

    return list(files_dict.values())


@router.post("/{category}")
async def upload_asset(category: str, system: str = None, file: UploadFile = File(...)):
    if category not in ["portraits", "frames", "effects"]:
        raise HTTPException(status_code=400, detail="Invalid category")

    if system:
        target_dir = ASSETS_DIR / "systems" / system / category
        url_prefix = f"/assets/systems/{system}/{category}"
    else:
        target_dir = ASSETS_DIR / "default" / category
        url_prefix = f"/assets/default/{category}"

    target_dir.mkdir(parents=True, exist_ok=True)
    file_path = target_dir / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"url": f"{url_prefix}/{file.filename}"}


@router.delete("/{category}/{filename}")
async def delete_asset(category: str, filename: str, system: str = None):
    if category not in ["portraits", "frames", "effects"]:
        raise HTTPException(status_code=400, detail="Invalid category")

    if system:
        file_path = ASSETS_DIR / "systems" / system / category / filename
    else:
        file_path = ASSETS_DIR / "default" / category / filename

    if file_path.exists():
        file_path.unlink()
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="File not found")

