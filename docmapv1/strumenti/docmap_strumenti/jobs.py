"""Job queue, credits and audit trail (one SQLite file, ``strumenti.sqlite``, in the data folder).

* A job = a recipe (frozen copy, with its version) + input / output folders, run by a worker thread.
  States: queued → running → (waiting_review → queued …) → done | failed | cancelled.
* Credits: every block reports what it consumes (pages, OCR pages, AI calls, HTTP calls); the ledger converts it
  into credits with the costs of the settings, and stops a job when a tenant has used its monthly credits.
* Review: people's corrections are written to the job state and to the audit trail; each audit row carries the hash
  of the previous one (a chain: changing an old row breaks every hash after it).
"""

from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import threading
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from . import engine as E
from . import recipe as RC
from .items import OK, REVIEW, SKIP, Item

SCHEMA = 1
DEFAULT_COSTS = {"page": 0, "ocr_page": 1, "ai_call": 10, "http_call": 1}
JOB_FIELDS = ("id", "name", "recipe_id", "recipe_version", "status", "mode", "tenant", "input_dir", "output_dir",
              "created", "started", "finished", "progress", "totals", "meters", "credits", "error", "remote_url",
              "remote_job", "user")


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


class CreditsExhausted(E.Cancelled):
    pass


class QueueError(RuntimeError):
    pass


class Store:
    """The SQLite database. One connection per call (threads), WAL mode, short transactions."""

    def __init__(self, data_dir: Path):
        self.dir = Path(data_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.path = self.dir / "strumenti.sqlite"
        self._lock = threading.RLock()
        with self.db() as c:
            c.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY, name TEXT, recipe_id TEXT, recipe_version INTEGER, status TEXT, mode TEXT,
              tenant TEXT, input_dir TEXT, output_dir TEXT, created TEXT, started TEXT, finished TEXT,
              progress TEXT, totals TEXT, meters TEXT, credits INTEGER DEFAULT 0, error TEXT,
              remote_url TEXT, remote_job TEXT, user TEXT);
            CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
            CREATE TABLE IF NOT EXISTS ledger (
              id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, month TEXT, tenant TEXT, job_id TEXT, kind TEXT,
              qty INTEGER, credits INTEGER);
            CREATE INDEX IF NOT EXISTS ledger_tm ON ledger(tenant, month);
            CREATE TABLE IF NOT EXISTS tokens (
              hash TEXT PRIMARY KEY, tenant TEXT, label TEXT, plan TEXT, credits_month INTEGER, created TEXT,
              revoked TEXT);
            CREATE TABLE IF NOT EXISTS audit (
              id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, job_id TEXT, item_id TEXT, user TEXT, action TEXT,
              detail TEXT, old TEXT, new TEXT, prev TEXT, hash TEXT);
            CREATE INDEX IF NOT EXISTS audit_job ON audit(job_id, item_id);
            """)
            c.execute("INSERT OR IGNORE INTO meta(k, v) VALUES ('schema', ?)", (str(SCHEMA),))

    def db(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        c.row_factory = sqlite3.Row
        return _Conn(c)

    # -- jobs -----------------------------------------------------------------------------------------------------
    def job_dir(self, job_id: str) -> Path:
        return self.dir / "lavori" / job_id

    def create(self, rec: dict, input_dir: str, output_dir: str, tenant: str = "local", mode: str = "local",
               name: str = "", user: str = "", variables: dict | None = None, status: str = "queued") -> dict:
        rec = RC.validate(rec)
        jid = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(3)
        d = self.job_dir(jid)
        d.mkdir(parents=True, exist_ok=True)
        (d / "ricetta.json").write_text(json.dumps(rec, ensure_ascii=False, indent=2), "utf-8")
        (d / "variabili.json").write_text(json.dumps(variables or {}, ensure_ascii=False), "utf-8")
        out = output_dir or str(d / "uscita")
        with self.db() as c:
            c.execute("INSERT INTO jobs(id, name, recipe_id, recipe_version, status, mode, tenant, input_dir, output_dir,"
                      " created, progress, totals, meters, user) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                      (jid, name or rec["name"], rec["id"], rec["version"], status, mode, tenant, input_dir, out,
                       now(), "{}", "{}", "{}", user))
        return self.get(jid)

    def get(self, jid: str) -> dict:
        with self.db() as c:
            r = c.execute("SELECT * FROM jobs WHERE id = ?", (jid,)).fetchone()
        if r is None:
            raise QueueError("lavoro non trovato")
        d = dict(r)
        for k in ("progress", "totals", "meters"):
            try:
                d[k] = json.loads(d[k] or "{}")
            except ValueError:
                d[k] = {}
        return d

    def list(self, tenant: str | None = None, limit: int = 100) -> list[dict]:
        q = "SELECT id FROM jobs" + (" WHERE tenant = ?" if tenant else "") + " ORDER BY created DESC LIMIT ?"
        with self.db() as c:
            ids = [r[0] for r in c.execute(q, ((tenant, limit) if tenant else (limit,))).fetchall()]
        return [self.get(i) for i in ids]

    def update(self, jid: str, **kw) -> None:
        if not kw:
            return
        for k in ("progress", "totals", "meters"):
            if k in kw and not isinstance(kw[k], str):
                kw[k] = json.dumps(kw[k], ensure_ascii=False)
        bad = set(kw) - set(JOB_FIELDS)
        if bad:
            raise ValueError(f"unknown job fields {bad}")
        with self.db() as c:
            c.execute("UPDATE jobs SET " + ", ".join(f"{k} = ?" for k in kw) + " WHERE id = ?", (*kw.values(), jid))

    def next_queued(self) -> str | None:
        with self._lock, self.db() as c:
            r = c.execute("SELECT id FROM jobs WHERE status = 'queued' ORDER BY created LIMIT 1").fetchone()
            if r is None:
                return None
            n = c.execute("UPDATE jobs SET status = 'running', started = COALESCE(started, ?) WHERE id = ? AND status = 'queued'",
                          (now(), r[0])).rowcount
            return r[0] if n else None

    # -- state of a job (items) -----------------------------------------------------------------------------------
    def state_file(self, jid: str) -> Path:
        return self.job_dir(jid) / "stato.json"

    def items(self, jid: str) -> tuple[dict, list[Item]]:
        f = self.state_file(jid)
        if not f.is_file():
            return {}, []
        return E.load_state(f)

    def save_items(self, jid: str, st: dict, items: list[Item]) -> None:
        st = dict(st, items=[it.to_dict() for it in items], totals=E.count(items))
        E._save_json(self.state_file(jid), st)
        self.update(jid, totals=st["totals"])

    # -- credits --------------------------------------------------------------------------------------------------
    def costs(self, settings: dict) -> dict:
        return {**DEFAULT_COSTS, **((settings.get("credits") or {}).get("costs") or {})}

    def used(self, tenant: str, m: str | None = None) -> int:
        with self.db() as c:
            r = c.execute("SELECT COALESCE(SUM(credits), 0) FROM ledger WHERE tenant = ? AND month = ?",
                          (tenant, m or month())).fetchone()
        return int(r[0])

    def limit(self, tenant: str, settings: dict) -> int | None:
        if tenant == "local":
            v = (settings.get("credits") or {}).get("local_month")
            return int(v) if v not in (None, "") else None
        with self.db() as c:
            r = c.execute("SELECT credits_month FROM tokens WHERE tenant = ? AND revoked IS NULL ORDER BY created DESC",
                          (tenant,)).fetchone()
        return None if r is None or r[0] is None else int(r[0])

    def charge(self, tenant: str, jid: str, kind: str, qty: int, settings: dict) -> int:
        cost = int(self.costs(settings).get(kind, 0)) * qty
        if cost:
            lim = self.limit(tenant, settings)
            with self._lock:
                if lim is not None and self.used(tenant) + cost > lim:
                    raise CreditsExhausted(f"crediti del mese finiti ({lim}): ricarica o aspetta il mese prossimo")
                with self.db() as c:
                    c.execute("INSERT INTO ledger(at, month, tenant, job_id, kind, qty, credits) VALUES (?,?,?,?,?,?,?)",
                              (now(), month(), tenant, jid, kind, qty, cost))
                    c.execute("UPDATE jobs SET credits = credits + ? WHERE id = ?", (cost, jid))
        return cost

    def usage(self, tenant: str | None = None) -> list[dict]:
        q = ("SELECT tenant, month, kind, SUM(qty) qty, SUM(credits) credits FROM ledger"
             + (" WHERE tenant = ?" if tenant else "") + " GROUP BY tenant, month, kind ORDER BY month DESC, tenant, kind")
        with self.db() as c:
            return [dict(r) for r in c.execute(q, (tenant,) if tenant else ()).fetchall()]

    # -- tokens (remote tenants) ----------------------------------------------------------------------------------
    def token_create(self, tenant: str, label: str = "", plan: str = "", credits_month: int | None = None) -> str:
        tok = "dms_" + secrets.token_urlsafe(32)
        with self.db() as c:
            c.execute("INSERT INTO tokens(hash, tenant, label, plan, credits_month, created) VALUES (?,?,?,?,?,?)",
                      (_h(tok), tenant, label, plan, credits_month, now()))
        return tok

    def token_check(self, tok: str) -> dict | None:
        if not tok:
            return None
        with self.db() as c:
            r = c.execute("SELECT tenant, label, plan, credits_month FROM tokens WHERE hash = ? AND revoked IS NULL",
                          (_h(tok),)).fetchone()
        return dict(r) if r else None

    def token_revoke(self, tenant: str) -> int:
        with self.db() as c:
            return c.execute("UPDATE tokens SET revoked = ? WHERE tenant = ? AND revoked IS NULL", (now(), tenant)).rowcount

    def tokens(self) -> list[dict]:
        with self.db() as c:
            return [dict(r) for r in c.execute("SELECT tenant, label, plan, credits_month, created, revoked FROM tokens "
                                               "ORDER BY created").fetchall()]

    # -- audit trail ----------------------------------------------------------------------------------------------
    def audit(self, jid: str, item_id: str, user: str, action: str, detail: dict, old: dict | None, new: dict | None) -> dict:
        with self._lock, self.db() as c:
            r = c.execute("SELECT hash FROM audit ORDER BY id DESC LIMIT 1").fetchone()
            prev = r[0] if r else ""
            row = {"at": now(), "job_id": jid, "item_id": item_id, "user": user, "action": action,
                   "detail": json.dumps(detail, ensure_ascii=False, sort_keys=True),
                   "old": json.dumps(old, ensure_ascii=False, sort_keys=True) if old is not None else "",
                   "new": json.dumps(new, ensure_ascii=False, sort_keys=True) if new is not None else ""}
            row["prev"] = prev
            row["hash"] = _h(prev + "|" + "|".join(row[k] for k in ("at", "job_id", "item_id", "user", "action", "detail", "old", "new")))
            c.execute("INSERT INTO audit(at, job_id, item_id, user, action, detail, old, new, prev, hash) VALUES "
                      "(?,?,?,?,?,?,?,?,?,?)", tuple(row[k] for k in ("at", "job_id", "item_id", "user", "action",
                                                                     "detail", "old", "new", "prev", "hash")))
        return row

    def audit_rows(self, jid: str | None = None, item_id: str | None = None) -> list[dict]:
        q, a = "SELECT * FROM audit", []
        if jid:
            q += " WHERE job_id = ?"
            a.append(jid)
            if item_id:
                q += " AND item_id = ?"
                a.append(item_id)
        with self.db() as c:
            return [dict(r) for r in c.execute(q + " ORDER BY id", a).fetchall()]

    def audit_verify(self) -> tuple[bool, int]:
        """(chain intact, rows checked)."""
        prev = ""
        n = 0
        with self.db() as c:
            for r in c.execute("SELECT * FROM audit ORDER BY id"):
                n += 1
                h = _h(prev + "|" + "|".join(r[k] or "" for k in ("at", "job_id", "item_id", "user", "action", "detail", "old", "new")))
                if r["prev"] != prev or r["hash"] != h:
                    return False, n
                prev = r["hash"]
        return True, n


class _Conn:
    """sqlite3 connection that closes on ``with`` exit (sqlite3's own context manager only commits)."""

    def __init__(self, c):
        self.c = c

    def __enter__(self):
        return self.c

    def __exit__(self, *a):
        self.c.close()


def _h(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# -- review operations ----------------------------------------------------------------------------------------------

REVIEW_ACTIONS = ("certify", "set", "reject", "reopen", "undo")


def review_list(store: Store, jid: str, include_done: bool = False) -> list[dict]:
    st, items = store.items(jid)
    out = []
    for it in items:
        if it.status == REVIEW or (include_done and it.meta.get("reviewed_by")):
            out.append(_item_view(it))
    return out


def _item_view(it: Item) -> dict:
    d = it.to_dict()
    d["text"] = it.text[:20000]
    d["meta"] = {k: v for k, v in it.meta.items() if k not in ("words",)}
    d["has_words"] = bool(it.meta.get("words"))
    return d


def review_apply(store: Store, jid: str, item_id: str, action: str, user: str = "", fields: dict | None = None,
                 cls: str | None = None, tags: list | None = None, note: str = "") -> dict:
    """A person's decision on one item. ``certify``: values are right (all, or the ``fields`` given, corrected);
    ``set``: change values without closing; ``reject``: exclude the file from the output; ``reopen``: back to the
    queue; ``undo``: restore the item as it was before the last decision."""
    if action not in REVIEW_ACTIONS:
        raise QueueError("azione non valida")
    job = store.get(jid)
    if job["status"] == "running":
        raise QueueError("il lavoro sta girando: aspetta che si fermi alla verifica")
    st, items = store.items(jid)
    idx = next((i for i, x in enumerate(items) if x.id == item_id), None)
    if idx is None:
        raise QueueError("file non trovato nel lavoro")
    it = items[idx]
    old = it.to_dict()
    if action == "undo":
        rows = [r for r in store.audit_rows(jid, item_id) if r["action"] != "undo" and r["old"]]
        undone = {json.loads(r["detail"]).get("undo_of") for r in store.audit_rows(jid, item_id) if r["action"] == "undo"}
        rows = [r for r in rows if r["hash"] not in undone]
        if not rows:
            raise QueueError("niente da annullare")
        last = rows[-1]
        items[idx] = Item.from_dict(json.loads(last["old"]))
        store.save_items(jid, st, items)
        store.audit(jid, item_id, user, "undo", {"undo_of": last["hash"]}, old, items[idx].to_dict())
        return _item_view(items[idx])
    for k, v in (fields or {}).items():
        k = str(k).strip()
        if not k:
            continue
        prev = it.fields.get(k) if isinstance(it.fields.get(k), dict) else {}
        machine = {kk: prev.get(kk) for kk in ("v", "conf", "by")} if prev and prev.get("by") != "human" else prev.get("machine")
        it.fields[k] = {"v": v, "conf": 1.0, "by": "human", "certified": action == "certify", "user": user, "at": now(),
                        **({"machine": machine} if machine else {})}
    if cls is not None:
        it.cls = str(cls)
    if tags is not None:
        it.tags = [str(t) for t in tags if str(t).strip()]
    if action == "certify":
        for k, f in it.fields.items():
            if isinstance(f, dict) and not f.get("certified"):
                f["certified"] = True
                f["certified_by"] = user
        it.status = OK
        it.meta["reviewed"] = True
        it.meta["reviewed_by"] = user
        it.meta["reviewed_at"] = now()
        it.flags = []
    elif action == "reject":
        it.status = SKIP
        it.meta["reviewed"] = True
        it.meta["reviewed_by"] = user
        it.meta["rejected"] = True
    elif action == "reopen":
        it.status = REVIEW
        it.meta["reviewed"] = False
    if note:
        it.meta.setdefault("notes", []).append({"user": user, "at": now(), "text": note[:1000]})
    items[idx] = it
    store.save_items(jid, st, items)
    store.audit(jid, item_id, user, action, {"fields": fields or {}, "cls": cls, "tags": tags, "note": note}, old, it.to_dict())
    return _item_view(it)


# -- worker ---------------------------------------------------------------------------------------------------------

class Queue:
    """Runs queued jobs on ``workers`` threads. ``settings`` is read again for every job (changes apply at once)."""

    def __init__(self, store: Store, settings_fn, workers: int = 1, remote_runner=None):
        self.store = store
        self.settings_fn = settings_fn
        self.workers = max(1, int(workers))
        self.remote_runner = remote_runner
        self._stop = threading.Event()
        self._cancel: dict[str, threading.Event] = {}
        self._threads: list[threading.Thread] = []
        self._wake = threading.Event()

    def start(self) -> None:
        # a job left «running» by a crash or a closed window goes back to the queue (it resumes from its last step)
        with self.store.db() as c:
            c.execute("UPDATE jobs SET status = 'queued' WHERE status = 'running'")
        for i in range(self.workers):
            t = threading.Thread(target=self._loop, name=f"strumenti-worker-{i}", daemon=True)
            t.start()
            self._threads.append(t)

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        for ev in self._cancel.values():
            ev.set()

    def poke(self) -> None:
        self._wake.set()

    def cancel(self, jid: str) -> None:
        j = self.store.get(jid)
        if j["status"] in ("queued", "waiting_review"):
            self.store.update(jid, status="cancelled", finished=now())
        ev = self._cancel.get(jid)
        if ev:
            ev.set()

    def resume(self, jid: str) -> None:
        j = self.store.get(jid)
        if j["status"] not in ("waiting_review", "failed", "cancelled"):
            raise QueueError("il lavoro non è fermo")
        st, items = self.store.items(jid)
        if j["status"] == "waiting_review":
            for it in items:   # whatever a person did not look at goes on as it is, still marked
                if it.status == REVIEW and not it.meta.get("reviewed"):
                    it.meta["gate_skipped"] = True
            self.store.save_items(jid, st, items)
        if j["mode"] == "remote" and j.get("remote_job") and j["status"] == "waiting_review":
            (self.store.job_dir(jid) / "riprendi-remoto").write_text("1", "utf-8")
        self.store.update(jid, status="queued", error="")
        self.poke()

    def _loop(self) -> None:
        while not self._stop.is_set():
            jid = self.store.next_queued()
            if not jid:
                self._wake.wait(1.0)
                self._wake.clear()
                continue
            try:
                self.run_job(jid)
            except Exception:   # never kill the worker thread
                self.store.update(jid, status="failed", error=traceback.format_exc()[-800:], finished=now())

    def run_job(self, jid: str) -> None:
        job = self.store.get(jid)
        settings = self.settings_fn()
        if job["mode"] == "remote":
            if not self.remote_runner:
                raise QueueError("esecuzione remota non configurata")
            ev = self._cancel.setdefault(jid, threading.Event())
            try:
                self.remote_runner(self.store, job, settings, ev)
            finally:
                self._cancel.pop(jid, None)
            return
        d = self.store.job_dir(jid)
        rec = json.loads((d / "ricetta.json").read_text("utf-8"))
        try:
            variables = json.loads((d / "variabili.json").read_text("utf-8"))
        except (OSError, ValueError):
            variables = {}
        ev = self._cancel.setdefault(jid, threading.Event())
        last = [0.0]

        def progress(si, step, done, total):
            t = time.time()
            if t - last[0] > 0.5 or done == total:
                last[0] = t
                self.store.update(jid, progress={"step_index": si, "step": step, "done": done, "total": total,
                                                 "steps": len(rec["steps"])})

        def meter(kind, n):
            self.store.charge(job["tenant"], jid, kind, n, settings)

        ctx = E.Context(d, Path(job["input_dir"]) if job["input_dir"] else None, Path(job["output_dir"]), settings,
                        meter=meter, cancel=ev, progress=progress, variables=variables)
        eng = E.Engine(rec, ctx)
        sf = self.store.state_file(jid)
        try:
            if sf.is_file():
                st, items = E.load_state(sf)
                start = int(st.get("next_step") or 0)
                ctx.reports = list(st.get("reports") or [])
                for it in items:          # people's decisions are final: the gate does not stop them again
                    if it.meta.get("gate_skipped"):
                        it.meta["reviewed"] = True
            else:
                items, start = eng.collect(), 0
                E._save_json(sf, eng.state(items, 0, "running"))
            res = eng.run(items, start, sf)
            self.store.update(jid, status=res["status"], totals=res["totals"], meters=_merge(job["meters"], res["meters"]),
                              finished=now() if res["status"] == "done" else None, error="")
        except CreditsExhausted as e:
            self.store.update(jid, status="failed", error=str(e), finished=now())
        except E.Cancelled:
            self.store.update(jid, status="cancelled", finished=now())
        except (E.JobError, RC.RecipeError) as e:
            self.store.update(jid, status="failed", error=str(e), finished=now())
        finally:
            self._cancel.pop(jid, None)


def _merge(a: dict, b: dict) -> dict:
    out = dict(a or {})
    for k, v in (b or {}).items():
        out[k] = out.get(k, 0) + v
    return out
