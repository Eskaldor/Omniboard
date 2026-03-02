from __future__ import annotations

from pathlib import Path


DATA_DIR = Path("data/systems")

ASSETS_DIR = Path("data/assets")
DEFAULT_ASSETS_DIR = ASSETS_DIR / "default"
SYSTEMS_ASSETS_DIR = ASSETS_DIR / "systems"

ACTORS_DIR = Path("data/actors")
ENCOUNTERS_DIR = Path("data/encounters")
RENDER_DIR = Path("data/render")
LOCALES_DIR = Path("data/locales")
LOGS_DIR = Path("data/logs")


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    DEFAULT_ASSETS_DIR.mkdir(exist_ok=True)
    (DEFAULT_ASSETS_DIR / "portraits").mkdir(exist_ok=True)
    (DEFAULT_ASSETS_DIR / "frames").mkdir(exist_ok=True)
    (DEFAULT_ASSETS_DIR / "effects").mkdir(exist_ok=True)
    SYSTEMS_ASSETS_DIR.mkdir(exist_ok=True)

    ACTORS_DIR.mkdir(parents=True, exist_ok=True)
    ENCOUNTERS_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    LOCALES_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


# Keep behavior consistent with old main.py: directories exist at import time.
ensure_dirs()

