"""Plugins: extra AI providers and OCR engines as plain ``.py`` files, without changing the program.

Folder: ``ai.plugins_dir`` in the settings, else ``<data folder>/plugins`` (``%APPDATA%\\DocMapStrumenti\\plugins``).
Each file registers what it brings::

    from docmap_strumenti.ai import Provider, Request, AIError, register_provider, http, parse
    from docmap_strumenti.ocr_engines import OcrEngine, register_ocr

A broken plugin never stops the program: its error is listed by ``loaded()`` (settings screen, ``ai plugin``).
Only the administrator of the PC can put files there; treat them as code you trust.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_STATE: dict = {"dir": None, "files": []}


def folder(settings: dict, data_dir: Path | None) -> Path | None:
    d = (settings.get("ai") or {}).get("plugins_dir")
    if d:
        return Path(d).expanduser()
    return Path(data_dir) / "plugins" if data_dir else None


def load(settings: dict, data_dir: Path | None = None) -> list[dict]:
    """Imports every ``*.py`` of the plugin folder once (a file changed since the last load is imported again)."""
    d = folder(settings, data_dir)
    _STATE["dir"] = str(d) if d else None
    if not d or not d.is_dir():
        return _STATE["files"]
    seen = {f["file"]: f for f in _STATE["files"]}
    out = []
    for f in sorted(d.glob("*.py")):
        if f.name.startswith("_"):
            continue
        mt = f.stat().st_mtime
        old = seen.get(str(f))
        if old and old.get("mtime") == mt:
            out.append(old)
            continue
        name = "docmap_plugin_" + f.stem
        row = {"file": str(f), "name": f.stem, "mtime": mt, "ok": True, "error": ""}
        try:
            spec = importlib.util.spec_from_file_location(name, f)
            mod = importlib.util.module_from_spec(spec)
            sys.modules[name] = mod
            spec.loader.exec_module(mod)   # type: ignore[union-attr]
        except Exception as e:   # a broken plugin must not stop the tools
            row.update(ok=False, error=f"{type(e).__name__}: {e}"[:300])
        out.append(row)
    _STATE["files"] = out
    return out


def loaded() -> dict:
    return {"dir": _STATE["dir"], "files": [{k: v for k, v in f.items() if k != "mtime"} for f in _STATE["files"]]}
