"""Where the hub keeps its data (keys, registry, issued licence files)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ENV_DIR = "DOCMAP_HUB_DIR"


def default_data_dir() -> Path:
    """``%APPDATA%\\DocMapHub`` on Windows, ``~/.docmap-hub`` elsewhere,
    overridden by the ``DOCMAP_HUB_DIR`` environment variable."""
    env = os.environ.get(ENV_DIR)
    if env:
        return Path(env).expanduser()
    if sys.platform.startswith("win"):
        appdata = os.environ.get("APPDATA")
        if appdata:
            return Path(appdata) / "DocMapHub"
    return Path.home() / ".docmap-hub"


def resolve(data_dir: str | os.PathLike | None) -> Path:
    return Path(data_dir).expanduser() if data_dir else default_data_dir()


def ensure(data_dir: Path) -> Path:
    for sub in ("", "keys", "issued", "backups"):
        (data_dir / sub).mkdir(parents=True, exist_ok=True)
    return data_dir
