from __future__ import annotations

from pathlib import Path


DATA_DIR = Path("data/systems")


def _safe_system_file_path(system_name: str, file_name: str) -> Path | None:
    if not (system_name and str(system_name).strip()):
        return None
    name = str(system_name).strip()
    if ".." in name or "/" in name or "\\" in name:
        return None
    path = (DATA_DIR / name / file_name).resolve()
    try:
        path.relative_to(DATA_DIR.resolve())
    except ValueError:
        return None
    return path


def get_system_mechanics_path(system_name: str) -> Path | None:
    """Path to ``data/systems/<system>/mechanics.json`` if the name is safe."""
    return _safe_system_file_path(system_name, "mechanics.json")


def get_system_matrix_path(system_name: str) -> Path | None:
    """Path to ``data/systems/<system>/matrix.json`` if the name is safe."""
    return _safe_system_file_path(system_name, "matrix.json")


def get_system_columns_path(system_name: str) -> Path | None:
    """Path to ``data/systems/<system>/columns.json`` if the name is safe and the file may exist."""
    return _safe_system_file_path(system_name, "columns.json")

ASSETS_DIR = Path("data/assets")
DEFAULT_ASSETS_DIR = ASSETS_DIR / "default"
SYSTEMS_ASSETS_DIR = ASSETS_DIR / "systems"

ACTORS_DIR = Path("data/actors")


def get_actors_system_dir(system_name: str) -> Path | None:
    """``data/actors/<system_name>`` only if ``system_name`` is a safe single segment (no ``..`` / slashes)."""
    name = (system_name or "").strip()
    if not name or ".." in name or "/" in name or "\\" in name:
        return None
    path = (ACTORS_DIR / name).resolve()
    try:
        path.relative_to(ACTORS_DIR.resolve())
    except ValueError:
        return None
    return path
ENCOUNTERS_DIR = Path("data/encounters")
RENDER_DIR = Path("data/render")
LOCALES_DIR = Path("data/locales")
LOGS_DIR = Path("data/logs")
MINIATURES_PATH = Path("data/miniatures.json")


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    DEFAULT_ASSETS_DIR.mkdir(exist_ok=True)
    (DEFAULT_ASSETS_DIR / "portraits").mkdir(exist_ok=True)
    (DEFAULT_ASSETS_DIR / "frames").mkdir(exist_ok=True)
    (DEFAULT_ASSETS_DIR / "effects").mkdir(exist_ok=True)
    (DEFAULT_ASSETS_DIR / "fonts").mkdir(exist_ok=True)
    (DEFAULT_ASSETS_DIR / "config").mkdir(parents=True, exist_ok=True)
    (ASSETS_DIR / "effects").mkdir(exist_ok=True)
    SYSTEMS_ASSETS_DIR.mkdir(exist_ok=True)

    ACTORS_DIR.mkdir(parents=True, exist_ok=True)
    ENCOUNTERS_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    LOCALES_DIR.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    MINIATURES_PATH.parent.mkdir(parents=True, exist_ok=True)


# Keep behavior consistent with old main.py: directories exist at import time.
ensure_dirs()

