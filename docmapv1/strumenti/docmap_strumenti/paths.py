"""Where the tools keep their data: recipes, job queue, job folders, settings, audit trail."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ENV_DIR = "DOCMAP_STRUMENTI_DIR"


def default_data_dir() -> Path:
    """``%APPDATA%\\DocMapStrumenti`` on Windows, ``~/.docmap-strumenti`` elsewhere, or ``$DOCMAP_STRUMENTI_DIR``."""
    env = os.environ.get(ENV_DIR)
    if env:
        return Path(env).expanduser()
    if sys.platform.startswith("win"):
        appdata = os.environ.get("APPDATA")
        if appdata:
            return Path(appdata) / "DocMapStrumenti"
    return Path.home() / ".docmap-strumenti"


def ensure(data_dir: str | os.PathLike | None = None) -> Path:
    d = Path(data_dir).expanduser() if data_dir else default_data_dir()
    for sub in ("", "ricette", "lavori", "caricati"):
        (d / sub).mkdir(parents=True, exist_ok=True)
    return d
