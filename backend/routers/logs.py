from __future__ import annotations

import os
import platform
import subprocess

from fastapi import APIRouter

from backend.paths import LOGS_DIR


router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.post("/open_folder")
async def open_logs_folder():
    path = str(LOGS_DIR.absolute())
    if platform.system() == "Windows":
        os.startfile(path)  # type: ignore[attr-defined]
    elif platform.system() == "Darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])
    return {"status": "ok"}

