"""HTTP layer (FastAPI / Starlette): the API on its path(s) and, optionally, the static files of a deploy folder from
the same origin with the deny rules of docmapv1/tests/php-router.php (the stand-in for the deployed .htaccess files):
  * any name starting with ".ht" → 403;
  * a folder (or a parent up to the root) whose .htaccess says "Require all denied" outside <FilesMatch>/<IfModule>/<If>
    blocks → 403 (so server-php/data/ is never served);
  * <FilesMatch "regex"> blocks containing "Require all denied" in the file's own folder → 403 for matching names
    (so config.php, *.sqlite, setup.php.disabled… are never served);
  * other *.php files are not executed (404); a folder with index.html serves it; anything else 404.
"""
from __future__ import annotations

import os
import re
from urllib.parse import unquote_to_bytes

from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request as SRequest
from starlette.responses import FileResponse, Response as SResponse

from .api import Request, handle
from .phpcompat import php_int
from .phpconfig import read_config_file

DEFAULT_API_PATHS = ("/studio-de/server-php/api.php", "/api")
ALL_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]

MIME = {
    ".html": "text/html; charset=UTF-8", ".htm": "text/html; charset=UTF-8", ".js": "text/javascript; charset=UTF-8",
    ".mjs": "text/javascript; charset=UTF-8", ".css": "text/css; charset=UTF-8", ".json": "application/json",
    ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=UTF-8",
    ".md": "text/plain; charset=UTF-8", ".xml": "application/xml", ".pdf": "application/pdf", ".wasm": "application/wasm",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".csv": "text/csv", ".zip": "application/zip",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _plain(status, text):
    return SResponse(text.encode("utf-8"), status_code=status, headers={"Content-Type": "text/html; charset=UTF-8"})


def _htaccess_denies(txt: str, here: bool, name: str) -> bool:
    outside = re.sub(r"<(FilesMatch|IfModule|If)\b.*?</\1>", "", txt, flags=re.S)
    outside = re.sub(r"^\s*#.*$", "", outside, flags=re.M)
    if re.search(r"^\s*Require all denied", outside, flags=re.M):
        return True
    if here:
        for pat, block in re.findall(r'<FilesMatch "([^"]+)">(.*?)</FilesMatch>', txt, flags=re.S):
            if "Require all denied" in block:
                try:
                    if re.search(pat, name):
                        return True
                except re.error:
                    continue
    return False


def static_response(root: str, path: str):
    """php-router.php, step by step. `path` is rawurldecode(parse_url(REQUEST_URI, PHP_URL_PATH))."""
    if ".." in path or "\x00" in path:
        return SResponse(b"", status_code=400)
    root = os.path.abspath(root).rstrip("/\\") or "/"
    rel = path.replace("\\", "/")
    file = os.path.normpath(os.path.join(root, rel.lstrip("/"))) if rel.strip("/") else root
    if os.path.commonpath([os.path.abspath(file), root]) != root:
        return SResponse(b"", status_code=400)
    name = rel.rstrip("/").rsplit("/", 1)[-1]
    if name.startswith(".ht"):
        return _plain(403, "Forbidden")
    d = file if os.path.isdir(file) else os.path.dirname(file)
    here = d
    while len(d) >= len(root):
        ht = os.path.join(d, ".htaccess")
        if os.path.isfile(ht):
            try:
                with open(ht, "r", encoding="utf-8", errors="replace") as f:
                    txt = f.read()
            except OSError:
                txt = ""
            if _htaccess_denies(txt, d == here, name):
                return _plain(403, "Forbidden")
        if d == root:
            break
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    if os.path.isfile(file) and not name.endswith(".php"):
        return FileResponse(file, headers={"Content-Type": MIME.get(os.path.splitext(file)[1].lower(), "application/octet-stream")})
    if os.path.isfile(file):
        return _plain(404, "Not found")   # PHP files are not executed by the Python server
    idx = os.path.join(file, "index.html")
    if os.path.isdir(file) and os.path.isfile(idx):
        return FileResponse(idx, headers={"Content-Type": MIME[".html"]})
    return _plain(404, "Not found")


def _body_cap(config_path):
    try:
        c = read_config_file(config_path)
        mb = php_int(c.get("max_body_mb", 20)) if isinstance(c, dict) else 20
    except Exception:   # noqa: BLE001
        mb = 20
    return max(0, mb * 1048576 + 1)


async def _read_body(request: SRequest, cap: int) -> bytes:
    chunks, n = [], 0
    async for chunk in request.stream():
        if chunk:
            chunks.append(chunk)
            n += len(chunk)
            if n > cap:
                break
    return b"".join(chunks)[:cap]


def create_app(config_path: str, root: str | None = None, api_paths=DEFAULT_API_PATHS) -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, title="DocMap server (Python)")
    paths = {p if p.startswith("/") else "/" + p for p in api_paths}

    @app.api_route("/{full_path:path}", methods=ALL_METHODS, include_in_schema=False)
    async def everything(request: SRequest, full_path: str):
        raw_path = request.scope.get("raw_path") or request.scope["path"].encode("utf-8")
        path = unquote_to_bytes(raw_path.split(b"?", 1)[0]).decode("utf-8", "surrogateescape")
        if path in paths:
            body = await _read_body(request, _body_cap(config_path))
            headers = {}
            for k, v in request.headers.raw:
                headers[k.decode("latin-1").lower()] = v.decode("utf-8", "surrogateescape")
            from .api import parse_query
            req = Request(request.method.upper(), parse_query(request.scope.get("query_string", b"")), headers, body,
                          request.client.host if request.client else None)
            res = await run_in_threadpool(handle, req, config_path)
            return SResponse(res.body, status_code=res.status, headers=dict(res.headers))
        if root:
            return await run_in_threadpool(static_response, root, path)
        return _plain(404, "Not found")

    return app
