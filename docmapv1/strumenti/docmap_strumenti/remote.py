"""Remote execution: a light PC sends the files to a worker elsewhere (the hub, a server of yours) and gets back
the results. Same API on both sides: the remote worker is this same program started with ``serve --remote``.

    local job (mode "remote")  ──zip of the input──▶  POST /api/jobs/upload      (remote queues and runs it)
                               ◀──status, progress──  GET  /api/jobs/<id>
                               ── review decisions ─▶  POST /api/jobs/<id>/items/<item>   (proxied by the local UI)
                               ◀──zip of the output──  GET  /api/jobs/<id>/download
"""

from __future__ import annotations

import base64
import json
import os
import socket
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from . import engine as E

CHUNK = 1024 * 1024


class RemoteError(RuntimeError):
    pass


def _req(base: str, path: str, token: str, data=None, headers: dict | None = None, method: str | None = None,
         timeout: float = 60, raw: bool = False, length: int | None = None):
    url = base.rstrip("/") + path
    h = {"Authorization": "Bearer " + token, "Accept": "application/json", **(headers or {})}
    if length is not None:
        h["Content-Length"] = str(length)
    req = urllib.request.Request(url, data=data, headers=h, method=method or ("POST" if data is not None else "GET"))
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode("utf-8")).get("error") or ""
        except (ValueError, UnicodeError):
            msg = ""
        raise RemoteError(f"server remoto: {msg or 'errore HTTP %d' % e.code}") from None
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as e:
        raise RemoteError(f"server remoto non raggiungibile ({getattr(e, 'reason', e)})") from None
    if raw:
        return r
    with r:
        body = r.read()
    try:
        return json.loads(body.decode("utf-8")) if body else {}
    except (ValueError, UnicodeError):
        raise RemoteError("risposta del server remoto non valida") from None


def ping(settings: dict) -> dict:
    rm = settings.get("remote") or {}
    if not rm.get("url"):
        raise RemoteError("indirizzo del server remoto non impostato")
    return _req(rm["url"], "/api/info", rm.get("token") or "", timeout=15)


def zip_inputs(rec: dict, input_dir: Path, out: Path) -> int:
    files = E.list_inputs(input_dir, rec["input"]["patterns"], rec["input"]["recursive"], rec["input"]["exclude"])
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as z:
        for f in files:
            rel = f.relative_to(input_dir).as_posix()
            z.write(f, rel)
            for side in (f.with_name(f.name + ".txt"),):        # sidecar texts travel with their file
                if side.is_file() and side != f:
                    z.write(side, side.relative_to(input_dir).as_posix())
    return len(files)


def safe_extract(zpath: Path, dest: Path, max_bytes: int | None = None) -> list[str]:
    """Extracts without ever writing outside ``dest`` (no ``..``, no absolute paths)."""
    dest = Path(dest).resolve()
    dest.mkdir(parents=True, exist_ok=True)
    out = []
    total = 0
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            name = info.filename.replace("\\", "/")
            if info.is_dir() or not name or name.startswith("/") or ".." in name.split("/") or ":" in name:
                continue
            total += info.file_size
            if max_bytes and total > max_bytes:
                raise RemoteError("archivio troppo grande")
            target = (dest / name).resolve()
            if not str(target).startswith(str(dest)):
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, open(target, "wb") as f:
                while True:
                    b = src.read(CHUNK)
                    if not b:
                        break
                    f.write(b)
            out.append(name)
    return out


def zip_dir(src: Path, out: Path) -> Path:
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as z:
        for p in sorted(Path(src).rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(src).as_posix())
    return out


def submit(settings: dict, rec: dict, input_dir: Path, name: str = "", variables: dict | None = None) -> dict:
    rm = settings.get("remote") or {}
    with tempfile.TemporaryDirectory() as td:
        zp = Path(td) / "ingresso.zip"
        n = zip_inputs(rec, Path(input_dir), zp)
        if n == 0:
            raise RemoteError("nessun file da inviare nella cartella di partenza")
        size = zp.stat().st_size
        with open(zp, "rb") as f:
            res = _req(rm["url"], "/api/jobs/upload", rm.get("token") or "", data=f, length=size, timeout=600,
                       headers={"Content-Type": "application/zip",
                                "X-Recipe-B64": base64.b64encode(json.dumps(rec, ensure_ascii=False).encode("utf-8")).decode("ascii"),
                                "X-Job-Name": base64.b64encode((name or rec["name"]).encode("utf-8")).decode("ascii"),
                                "X-Vars-B64": base64.b64encode(json.dumps(variables or {}).encode("utf-8")).decode("ascii")})
    return res.get("job") or {}


def run_remote(store, job: dict, settings: dict, cancel) -> None:
    """Queue.remote_runner: upload (once), follow the remote job, bring the output home."""
    rm = settings.get("remote") or {}
    url, tok = job.get("remote_url") or rm.get("url"), rm.get("token") or ""
    if not url:
        store.update(job["id"], status="failed", error="server remoto non impostato (Impostazioni › Esecuzione remota)")
        return
    jid = job["id"]
    d = store.job_dir(jid)
    rec = json.loads((d / "ricetta.json").read_text("utf-8"))
    try:
        variables = json.loads((d / "variabili.json").read_text("utf-8"))
    except (OSError, ValueError):
        variables = {}
    try:
        rid = job.get("remote_job")
        if not rid:
            r = submit({"remote": {"url": url, "token": tok}}, rec, Path(job["input_dir"]), job["name"], variables)
            rid = r.get("id")
            if not rid:
                raise RemoteError("il server remoto non ha creato il lavoro")
            store.update(jid, remote_job=rid, remote_url=url)
        elif job.get("status") == "running" and (d / "riprendi-remoto").is_file():
            _req(url, f"/api/jobs/{rid}/resume", tok, data=b"{}", headers={"Content-Type": "application/json"})
            (d / "riprendi-remoto").unlink()
        poll = float(rm.get("poll_s") or 3)
        while True:
            if cancel.is_set():
                try:
                    _req(url, f"/api/jobs/{rid}/cancel", tok, data=b"{}", headers={"Content-Type": "application/json"})
                finally:
                    store.update(jid, status="cancelled", finished=_now())
                return
            r = _req(url, f"/api/jobs/{rid}", tok).get("job") or {}
            store.update(jid, progress=r.get("progress") or {}, totals=r.get("totals") or {}, meters=r.get("meters") or {})
            st = r.get("status")
            if st == "waiting_review":
                store.update(jid, status="waiting_review")
                return
            if st in ("failed", "cancelled"):
                store.update(jid, status=st, error="remoto: " + (r.get("error") or ""), finished=_now())
                return
            if st == "done":
                break
            cancel.wait(poll)
        out = Path(job["output_dir"])
        resp = _req(url, f"/api/jobs/{rid}/download", tok, raw=True, timeout=600)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip", dir=d) as tf:
            with resp:
                while True:
                    b = resp.read(CHUNK)
                    if not b:
                        break
                    tf.write(b)
            tmp = Path(tf.name)
        try:
            files = safe_extract(tmp, out)
        finally:
            os.unlink(tmp)
        store.update(jid, status="done", finished=_now(), error="",
                     totals={**(r.get("totals") or {}), "downloaded": len(files)})
    except RemoteError as e:
        store.update(jid, status="failed", error=str(e), finished=_now())


def _now() -> str:
    from .jobs import now
    return now()
