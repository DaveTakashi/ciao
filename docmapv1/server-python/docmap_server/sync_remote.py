"""Server-to-server sync bridge: `python -m docmap_server sync-remote PROFILO.json [--dry-run] [--json] [--direction …]`.

The bridge is an API client of BOTH sides (same contract as the desktop client, docs/API-CONTRACT.md), so it works
PHP ⇄ Python, Python ⇄ Python and PHP ⇄ PHP. Standard library only (urllib + ssl), plus the PHP-compatible helpers of
phpcompat.py so that timestamps and content hashes are compared exactly as the servers compare them.

One run:
  1. ping + me on both sides (reachable? token valid? role editor/admin? licence read_only? clocks?)
  2. pull A since cursorA and B since cursorB (all pages), activity log since logCursorA / logCursorB
  3. plan, record by record, with the server's own LWW rules (ts_ms of updated_at / deletedAt; equal time + same
     canonical content = aligned; equal time + different content = conflict, nobody touched)
  4. push the winners in batches (≤ batch_records records, ≤ ~90% of max_body_mb; 413 → split), A→B then B→A;
     a server reply `rejected/older` carries the newer version, which is then sent the other way (extra round)
  5. after each direction succeeded: save its cursors in the state file (atomic replace) → an interrupted run is
     resumable and idempotent (what was already delivered comes back as "same", applied 0)

State (next to the profile): <profilo>.state.json — cursors, the version both sides are known to share for each record
(echo suppression, like SRV.known of the client), open conflicts, ids of log entries we pushed (echo suppression).
Journal: sync-log/sync-AAAA-MM.jsonl next to the profile (one "start" and one "end" line per run).
Exit codes: 0 ok · 1 finished but something to look at (conflicts, read-only side, invalid records) · 2 error.
"""
from __future__ import annotations

import base64
import hashlib
import ipaddress
import json
import os
import socket
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone

from .phpcompat import canon, jenc, ts_ms

BRIDGE_APP = "docmap-bridge/1"
TYPE_ORDER = ("archive", "location", "client", "binder", "status_event")   # archives before locations before binders (06g)
TYPE_FEATURE = {"location": "locations", "archive": "archives", "status_event": "status_events"}
TYPE_IT = {"binder": "faldoni", "client": "clienti", "location": "ubicazioni", "archive": "archivi", "status_event": "movimenti di stato"}
LOG_SKIP = 999999999999          # log_since that returns no activity-log rows (record loop)
LOG_PAGE = 1000                  # DM_LOG_PAGE of the server
ECHO_CAP = 20000
LOCK_STALE_S = 6 * 3600
DEFAULT_PROFILE = {
    "name": "Web ⇄ Studio",
    "a": {"label": "Web (online)", "url": "https://esempio.it/studio-de/server-php/api.php", "token": "", "token_env": "DOCMAP_SYNC_A_TOKEN",
          "basic_user": "", "basic_pass": "", "basic_pass_env": "DOCMAP_SYNC_A_BASIC_PASS", "ca": "", "insecure_lan": False, "max_body_mb": 20},
    "b": {"label": "Studio (locale)", "url": "https://127.0.0.1:8443/api", "token": "", "token_env": "DOCMAP_SYNC_B_TOKEN",
          "basic_user": "", "basic_pass": "", "ca": "C:\\DocMap\\certificati\\DocMap-CA-studio.crt", "insecure_lan": False, "max_body_mb": 20},
    "direction": "both",
    "sync_settings": True,
    "sync_activity_log": True,
}


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (int(time.time() * 1000) % 1000)


class SideError(Exception):
    """A side answered with an error (or did not answer). `kind`: network, tls, http, json."""

    def __init__(self, side, kind, message, status=None, code=None, body=None):
        super().__init__(message)
        self.side, self.kind, self.message, self.status, self.code, self.body = side, kind, message, status, code, body


class BridgeAbort(Exception):
    pass


# ---------------------------------------------------------------- record helpers (same rules as the server)
def rkey(type_, id_):
    return type_ + "/" + id_


def item_ts(it):
    return ts_ms(it["deletedAt"] if it.get("deleted") else it.get("updated_at", ""))


def item_iso(it):
    return it["deletedAt"] if it.get("deleted") else it.get("updated_at", "")


def content_hash(type_, data):
    """SHA-256 of the canonical JSON = what same_content() compares (CANON_SKIP; for locations also code, level)."""
    d = dict(data) if isinstance(data, dict) else {}
    if type_ == "location":
        d.pop("code", None)
        d.pop("level", None)
    return hashlib.sha256(jenc(canon(d)).encode("utf-8", "surrogateescape")).hexdigest()


def item_sig(it):
    if it.get("deleted"):
        return [item_ts(it), "deleted"]
    return [item_ts(it), content_hash(it["type"], it.get("data"))]


def item_code(it):
    if it.get("deleted"):
        return str(it.get("code") or "")
    d = it.get("data") or {}
    for k in ("speaking_code", "code", "full_code", "location_code", "multi_code", "name"):
        v = d.get(k)
        if isinstance(v, (str, int, float)) and str(v).strip():
            return str(v)[:100]
    return ""


def norm_pulled(r, deleted):
    if deleted:
        return {"type": r.get("type"), "id": r.get("id"), "code": r.get("code", ""), "deletedAt": r.get("deletedAt", ""),
                "who": r.get("who", ""), "deleted": True}
    return {"type": r.get("type"), "id": r.get("id"), "updated_at": r.get("updated_at", ""), "who": r.get("who", ""), "data": r.get("data") or {}}


def push_form(it):
    if it.get("deleted"):
        return "t", {"type": it["type"], "id": it["id"], "code": it.get("code", ""), "deletedAt": it["deletedAt"], "who": it.get("who", "")}
    return "r", {"type": it["type"], "id": it["id"], "updated_at": it["updated_at"], "data": it["data"]}


def settings_sig(s):
    return [ts_ms(s.get("updated_at", "")), hashlib.sha256(jenc(canon(s.get("data") or {})).encode("utf-8", "surrogateescape")).hexdigest()]


# ---------------------------------------------------------------- files
def _private_open(path, mode):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | (os.O_APPEND if "a" in mode else os.O_TRUNC), 0o600)
    return os.fdopen(fd, mode, encoding="utf-8")


def atomic_write_json(path, obj):
    tmp = path + ".tmp-%d" % os.getpid()
    with _private_open(tmp, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def paths_for(profile_path):
    base = os.path.abspath(profile_path)
    stem = base[:-5] if base.lower().endswith(".json") else base
    d = os.path.dirname(base)
    return {"profile": base, "state": stem + ".state.json", "lock": stem + ".lock", "logdir": os.path.join(d, "sync-log")}


def is_local_host(host):
    if not host:
        return False
    if host.lower() in ("localhost",) or host.lower().endswith(".local") or host.lower().endswith(".lan"):
        return True
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        return "." not in host        # single-label LAN name (e.g. PC-STUDIO)
    return ip.is_private or ip.is_loopback or ip.is_link_local


# ---------------------------------------------------------------- one side (HTTP client)
class Side:
    def __init__(self, key, cfg, device, base_dir):
        self.key = key
        self.label = str(cfg.get("label") or ("Lato " + key.upper()))
        url = str(cfg.get("url") or "").strip()
        if not url:
            raise BridgeAbort("Profilo: manca l'indirizzo (url) del lato %s (%s)." % (key.upper(), self.label))
        p = urllib.parse.urlsplit(url)
        if p.scheme not in ("http", "https") or not p.netloc:
            raise BridgeAbort("Profilo: indirizzo non valido per %s: %s (serve https://…/api oppure …/server-php/api.php)." % (self.label, url))
        q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if k != "r"]
        self.url = urllib.parse.urlunsplit((p.scheme, p.netloc, p.path, urllib.parse.urlencode(q), ""))
        self.host = p.hostname or ""
        self.local = is_local_host(self.host)
        if p.scheme == "http" and not self.local and not cfg.get("allow_http"):
            raise BridgeAbort("%s: indirizzo http:// su Internet rifiutato (il token viaggerebbe in chiaro). Usa https://." % self.label)
        env = cfg.get("token_env") or ("DOCMAP_SYNC_%s_TOKEN" % key.upper())
        self.token = os.environ.get(env) or str(cfg.get("token") or "")
        if not self.token:
            raise BridgeAbort("Manca il token del lato %s (%s): mettilo nel profilo (\"token\") o nella variabile d'ambiente %s." % (key.upper(), self.label, env))
        user = str(cfg.get("basic_user") or "")
        pw = os.environ.get(cfg.get("basic_pass_env") or ("DOCMAP_SYNC_%s_BASIC_PASS" % key.upper())) or str(cfg.get("basic_pass") or "")
        self.basic = ("Basic " + base64.b64encode((user + ":" + pw).encode("utf-8")).decode()) if user else None
        self.timeout = float(cfg.get("timeout") or 60)
        self.max_body = int(float(cfg.get("max_body_mb") or 20) * 1024 * 1024 * 0.9)
        self.device = device
        ctx = None
        if p.scheme == "https":
            ca = str(cfg.get("ca") or "")
            if cfg.get("insecure_lan"):
                if not self.local:
                    raise BridgeAbort("%s: \"insecure_lan\" vale solo per indirizzi della rete locale, non per %s." % (self.label, self.host))
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
            elif ca:
                ca = ca if os.path.isabs(ca) else os.path.join(base_dir, ca)
                if not os.path.isfile(ca):
                    raise BridgeAbort("%s: file del certificato (ca) non trovato: %s" % (self.label, ca))
                ctx = ssl.create_default_context(cafile=ca)
            else:
                ctx = ssl.create_default_context()
        handlers = [urllib.request.HTTPSHandler(context=ctx)] if ctx else []
        if self.local:
            handlers.append(urllib.request.ProxyHandler({}))     # never send LAN traffic to a proxy
        self.opener = urllib.request.build_opener(*handlers)
        self.read_only = False
        self.features = []
        self.me = {}
        self.licence = None

    def _url(self, route, query):
        q = {"r": route}
        q.update(query or {})
        return self.url + ("&" if "?" in self.url else "?") + urllib.parse.urlencode(q)

    def call(self, route, body=None, query=None, auth=True, retries=2):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        attempt = 0
        while True:
            attempt += 1
            req = urllib.request.Request(self._url(route, query), data=data, method="POST" if data is not None else "GET")
            req.add_header("Accept", "application/json")
            if data is not None:
                req.add_header("Content-Type", "application/json")
            if auth:
                req.add_header("X-DocMap-Token", self.token)
            if self.basic:
                req.add_header("Authorization", self.basic)
            req.add_header("X-DocMap-Device", self.device["id"])
            req.add_header("X-DocMap-Device-Name", urllib.parse.quote(self.device["name"], safe=""))
            req.add_header("X-DocMap-App", BRIDGE_APP)
            try:
                with self.opener.open(req, timeout=self.timeout) as r:
                    raw = r.read()
                    status = r.status
            except urllib.error.HTTPError as e:
                raw, status = e.read(), e.code
                hdr = e.headers
            except ssl.SSLError as e:
                raise SideError(self.key, "tls", "%s: certificato HTTPS non accettato (%s). Per il server dello studio indica nel profilo "
                                "\"ca\" = il file DocMap-CA-studio.crt." % (self.label, getattr(e, "reason", None) or e)) from None
            except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError) as e:
                reason = getattr(e, "reason", e)
                if isinstance(reason, ssl.SSLError):
                    raise SideError(self.key, "tls", "%s: certificato HTTPS non accettato (%s). Per il server dello studio indica nel profilo "
                                    "\"ca\" = il file DocMap-CA-studio.crt." % (self.label, getattr(reason, "reason", None) or reason)) from None
                if attempt <= retries:
                    time.sleep(2 * attempt)
                    continue
                raise SideError(self.key, "network", "%s non risponde (%s): controlla che il server sia acceso e raggiungibile da questo PC. "
                                "Dettaglio: %s" % (self.label, self.url, reason)) from None
            else:
                hdr = None
            try:
                js = json.loads(raw.decode("utf-8")) if raw else None
            except (ValueError, UnicodeError):
                js = None
            if status == 200 and isinstance(js, dict):
                return js
            if status in (502, 503, 504) and attempt <= retries:
                time.sleep(2 * attempt)
                continue
            raise self._error(status, js, hdr)

    def _error(self, status, js, hdr):
        err = js.get("error") if isinstance(js, dict) and isinstance(js.get("error"), dict) else {}
        code = err.get("code")
        L = self.label
        if code is None:
            if status == 401:
                msg = "%s chiede utente e password della protezione della cartella (HTTP Basic): compila basic_user / basic_pass nel profilo." % L
            elif status == 404:
                msg = "%s: indirizzo dell'API non trovato (404). Controlla l'url nel profilo (es. …/server-php/api.php oppure https://…:8443/api)." % L
            else:
                msg = "%s: risposta non valida (HTTP %s, non è JSON di DocMap). Controlla l'indirizzo." % (L, status)
            return SideError(self.key, "json", msg, status)
        if code in ("token_missing", "token_invalid"):
            msg = "%s ha rifiutato il token (401 %s): controlla il codice di accesso nel profilo o creane uno nuovo (ruolo editor)." % (L, code)
        elif code == "forbidden":
            msg = "%s: il token non ha i permessi necessari (serve il ruolo editor o admin)." % L
        elif code == "licence_read_only":
            msg = "%s è in SOLA LETTURA per la licenza (%s): non riceve modifiche finché la licenza non è rinnovata." % (L, err.get("message_it") or err.get("message") or "")
        elif code == "licence_limit":
            msg = "%s: limite della licenza raggiunto (%s)." % (L, err.get("message_it") or err.get("message") or "")
        elif code == "locked":
            ra = hdr.get("Retry-After") if hdr is not None else None
            msg = "%s ha bloccato per un po' questo indirizzo dopo troppi token sbagliati: riprova tra %s secondi." % (L, ra or "alcuni")
        elif code == "too_large":
            msg = "%s: richiesta troppo grande (413)." % L
        elif code in ("config", "crypto"):
            msg = "%s: problema di configurazione del server (%s: %s)." % (L, code, err.get("message", ""))
        else:
            msg = "%s: errore %s %s (%s)." % (L, status, code, err.get("message", ""))
        return SideError(self.key, "http", msg, status, code, js)


# ---------------------------------------------------------------- the bridge
class Bridge:
    def __init__(self, profile_path, direction=None, dry_run=False, out=None):
        self.paths = paths_for(profile_path)
        self.dry_run = dry_run
        self.out = out or sys.stdout
        self.warnings, self.errors, self.conflicts, self.rejected = [], [], [], []
        self.report = {}
        self.pushes = 0
        self.test_exit_after = int(os.environ.get("DOCMAP_SYNC_TEST_EXIT_AFTER_PUSHES") or 0)   # tests only: simulate a crash
        try:
            with open(self.paths["profile"], encoding="utf-8-sig") as f:
                self.profile = json.load(f)
        except FileNotFoundError:
            raise BridgeAbort("Profilo non trovato: %s (crealo con: python -m docmap_server sync-remote --example %s)."
                              % (self.paths["profile"], self.paths["profile"])) from None
        except ValueError as e:
            raise BridgeAbort("Profilo %s non leggibile (JSON non valido): %s" % (self.paths["profile"], e)) from None
        if not isinstance(self.profile, dict) or not isinstance(self.profile.get("a"), dict) or not isinstance(self.profile.get("b"), dict):
            raise BridgeAbort("Profilo %s: servono le sezioni \"a\" e \"b\"." % self.paths["profile"])
        self.direction = direction or self.profile.get("direction") or "both"
        if self.direction not in ("both", "a-to-b", "b-to-a"):
            raise BridgeAbort("Direzione non valida: %s (both, a-to-b, b-to-a)." % self.direction)
        self.batch = max(1, min(500, int(self.profile.get("batch_records") or 500)))
        self.batch_log = max(1, min(1000, int(self.profile.get("batch_log") or 1000)))
        self.do_settings = self.profile.get("sync_settings", True) is not False
        self.do_log = self.profile.get("sync_activity_log", True) is not False
        self.state = self._load_state()
        name = str(self.profile.get("name") or "Ponte DocMap")
        self.device = {"id": self.state["device_id"], "name": ("bridge " + name)[:80]}
        self.operator = ("bridge " + name)[:80]
        base_dir = os.path.dirname(self.paths["profile"])
        self.sides = {"a": Side("a", self.profile["a"], self.device, base_dir), "b": Side("b", self.profile["b"], self.device, base_dir)}
        self._check_permissions()

    # -------------------------------------------------- state
    def _load_state(self):
        st = None
        try:
            with open(self.paths["state"], encoding="utf-8") as f:
                st = json.load(f)
        except FileNotFoundError:
            pass
        except ValueError:
            raise BridgeAbort("File di stato %s danneggiato: spostalo altrove e rilancia (si riparte da una fusione completa, "
                              "che è sicura: vince sempre il più recente)." % self.paths["state"]) from None
        if not isinstance(st, dict) or st.get("version") != 1:
            st = {"version": 1, "device_id": "bridge-" + str(uuid.uuid4()), "a": {}, "b": {}, "known": {}, "open_conflicts": {},
                  "settings_known": None, "log_pushed": {"a": [], "b": []}, "runs": 0}
        for k in ("a", "b"):
            st.setdefault(k, {})
            st.setdefault("log_pushed", {}).setdefault(k, [])
        st.setdefault("known", {})
        st.setdefault("open_conflicts", {})
        return st

    def _save_state(self):
        if not self.dry_run:
            atomic_write_json(self.paths["state"], self.state)

    def _check_permissions(self):
        if os.name == "posix":
            try:
                if os.stat(self.paths["profile"]).st_mode & 0o077:
                    self.warnings.append("Il profilo %s è leggibile da altri utenti: chmod 600 (contiene i token)." % self.paths["profile"])
            except OSError:
                pass

    # -------------------------------------------------- journal + lock
    def journal(self, obj):
        try:
            os.makedirs(self.paths["logdir"], exist_ok=True)
            fn = os.path.join(self.paths["logdir"], "sync-%s.jsonl" % datetime.now(timezone.utc).strftime("%Y-%m"))
            with _private_open(fn, "a") as f:
                f.write(json.dumps(obj, ensure_ascii=False, sort_keys=True) + "\n")
        except OSError as e:
            self.warnings.append("Registro locale non scritto: %s" % e)

    def _lock(self):
        """One run per profile at a time (a scheduled task may overlap a manual run). A lock left by a crashed run
        (process gone, or older than 6 hours) is taken over."""
        lk = self.paths["lock"]
        for _ in range(3):
            try:
                fd = os.open(lk, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                os.write(fd, json.dumps({"pid": os.getpid(), "at": now_iso()}).encode())
                os.close(fd)
                return True
            except FileExistsError:
                try:
                    with open(lk, encoding="utf-8") as f:
                        pid = int(json.load(f).get("pid") or 0)
                except (OSError, ValueError, AttributeError):
                    pid = 0
                try:
                    stale = time.time() - os.stat(lk).st_mtime > LOCK_STALE_S
                except OSError:
                    continue
                if stale or not pid_alive(pid):
                    try:
                        os.remove(lk)
                    except OSError:
                        pass
                    continue
                return False
        return False

    def _unlock(self):
        try:
            os.remove(self.paths["lock"])
        except OSError:
            pass

    # -------------------------------------------------- pulls
    def check_side(self, s):
        ping = s.call("ping", auth=False)
        s.features = ping.get("features") or []
        s.server_time = ping.get("server_time")
        lic = ping.get("licence") if isinstance(ping.get("licence"), dict) else None
        s.me = s.call("me")
        if isinstance(s.me.get("licence"), dict):
            lic = s.me["licence"]
        s.licence = lic
        if lic and str(lic.get("mode")) in ("read_only", "invalid"):
            s.read_only = True
        return ping

    def pull_records(self, s):
        cur = int(self.state[s.key].get("seq") or 0)
        since, items, settings, counts, pages = cur, {}, None, None, 0
        while True:
            r = s.call("pull", query={"since": since, "log_since": LOG_SKIP})
            pages += 1
            if since == 0 and isinstance(r.get("counts"), dict):
                counts = r["counts"]
            for rec in r.get("records") or []:
                if isinstance(rec, dict) and rec.get("type") and rec.get("id"):
                    items[rkey(rec["type"], rec["id"])] = norm_pulled(rec, False)
            for t in r.get("tombstones") or []:
                if isinstance(t, dict) and t.get("type") and t.get("id"):
                    items[rkey(t["type"], t["id"])] = norm_pulled(t, True)
            if isinstance(r.get("settings"), dict):
                settings = r["settings"]
            nseq = int(r.get("seq") or since)
            if not r.get("more") or nseq <= since or pages > 100000:
                since = nseq
                break
            since = nseq
        return {"from": cur, "to": since, "items": items, "settings": settings, "counts": counts}

    def pull_log(self, s, rec_seq):
        cur = int(self.state[s.key].get("log_seq") or 0)
        ls, out, seen = cur, [], set()

        def take(r):
            n = 0
            for e in r.get("activity_log") or []:
                if isinstance(e, dict) and isinstance(e.get("id"), str) and e["id"] not in seen:
                    seen.add(e["id"])
                    out.append(e)
                n += 1
            return n

        r = s.call("pull", query={"since": rec_seq, "log_since": ls})
        n = take(r)
        end = int(r.get("log_seq") or ls)
        if cur == 0 and n >= LOG_PAGE:
            # first run on a big log: log_since=0 only gives the newest 1000 entries → also page the history from seq 1
            ls = 1
            while True:
                r = s.call("pull", query={"since": rec_seq, "log_since": ls})
                n = take(r)
                nl = int(r.get("log_seq") or ls)
                end = max(end, nl)
                if n < LOG_PAGE or nl <= ls:
                    break
                ls = nl
        elif n >= LOG_PAGE:
            ls = end
            while True:
                r = s.call("pull", query={"since": rec_seq, "log_since": ls})
                n = take(r)
                nl = int(r.get("log_seq") or ls)
                end = max(end, nl)
                if n < LOG_PAGE or nl <= ls:
                    break
                ls = nl
        return {"from": cur, "to": end, "entries": out}

    # -------------------------------------------------- plan
    def plan(self, pa, pb):
        known, openc = self.state["known"], self.state["open_conflicts"]
        to = {"a": {}, "b": {}}               # to["b"] = items to send to B (coming from A)
        aligned = 0
        new_conflicts = []
        da, db = pa["items"], pb["items"]
        for key in sorted(set(da) | set(db)):
            ia, ib = da.get(key), db.get(key)
            if ia is not None and ib is not None:
                sa, sb = item_sig(ia), item_sig(ib)
                if sa == sb:
                    aligned += 1
                    known[key] = sa
                    openc.pop(key, None)
                elif sa[0] > sb[0]:
                    to["b"][key] = ia
                    openc.pop(key, None)
                elif sb[0] > sa[0]:
                    to["a"][key] = ib
                    openc.pop(key, None)
                else:
                    new_conflicts.append(self._conflict(key, ia, ib, "tie"))
            else:
                it, dest = (ia, "b") if ia is not None else (ib, "a")
                if known.get(key) == item_sig(it):
                    aligned += 1
                    continue
                to[dest][key] = it
                if key in openc:
                    openc.pop(key, None)        # edited again on one side: the next push decides
        return to, aligned, new_conflicts

    def _conflict(self, key, ia, ib, reason):
        t, _, i = key.partition("/")
        c = {"type": t, "id": i, "code": item_code(ia) or item_code(ib), "reason": reason,
             "a_updated_at": item_iso(ia), "b_updated_at": item_iso(ib),
             "a_deleted": bool(ia.get("deleted")), "b_deleted": bool(ib.get("deleted")), "seen_at": now_iso()}
        self.state["open_conflicts"][key] = c
        return c

    def plan_log(self, la, lb):
        ida = {e["id"] for e in la["entries"]}
        idb = {e["id"] for e in lb["entries"]}
        lp = self.state["log_pushed"]
        echo_a, echo_b = set(lp["a"]), set(lp["b"])
        to_b = [e for e in la["entries"] if e["id"] not in idb and e["id"] not in echo_a]
        to_a = [e for e in lb["entries"] if e["id"] not in ida and e["id"] not in echo_b]
        # echoes seen again: drop them from the lists (they have done their job)
        lp["a"] = [x for x in lp["a"] if x not in ida]
        lp["b"] = [x for x in lp["b"] if x not in idb]
        return {"a": to_a, "b": to_b}

    # -------------------------------------------------- push
    def _batches(self, items, dest):
        s = self.sides[dest]
        cur, size = [], 200
        for it in items:
            n = len(json.dumps(push_form(it)[1], ensure_ascii=False).encode("utf-8")) + 2
            if cur and (len(cur) >= self.batch or size + n > s.max_body):
                yield cur
                cur, size = [], 200
            cur.append(it)
            size += n
        if cur:
            yield cur

    def _push_call(self, dest, items, settings=None, log=None):
        s = self.sides[dest]
        body = {"records": [], "tombstones": [], "settings": settings, "activity_log": log or [], "deviceId": self.device["id"], "operator": self.operator}
        for it in items:
            k, f = push_form(it)
            body["records" if k == "r" else "tombstones"].append(f)
        try:
            res = s.call("push", body=body)
        except SideError as e:
            if e.code == "too_large" and len(items) > 1:
                h = len(items) // 2
                r1 = self._push_call(dest, items[:h], settings, log)
                r2 = self._push_call(dest, items[h:])
                return {"applied": r1["applied"] + r2["applied"], "same": r1["same"] + r2["same"], "rejected": r1["rejected"] + r2["rejected"],
                        "settings_applied": r1.get("settings_applied"), "logged": r1.get("logged", 0) + r2.get("logged", 0)}
            raise
        self.pushes += 1
        if self.test_exit_after and self.pushes >= self.test_exit_after:
            os._exit(9)                                  # tests only: crash right after a successful push
        return res

    def push_dir(self, src, dest, items, settings, log, res):
        """Send items (dict key → item) to `dest`. Returns the items `dest` refused as older together with its newer
        version (key → current), to be sent back to `src`."""
        known = self.state["known"]
        sup = self.sides[dest].features
        back = {}
        ordered = sorted(items.values(), key=lambda it: (1 if it.get("deleted") else 0,
                                                        TYPE_ORDER.index(it["type"]) if it["type"] in TYPE_ORDER else 99, it["id"]))
        send = []
        for it in ordered:
            feat = TYPE_FEATURE.get(it["type"])
            if feat and sup and feat not in sup:
                res["skipped_unsupported"] += 1
                continue
            send.append(it)
        pending_settings, pending_log = settings, list(log or [])
        batches = list(self._batches(send, dest))
        if not batches and (pending_settings or pending_log):
            batches = [[]]
        for i, batch in enumerate(batches):
            lg = pending_log[:self.batch_log]
            pending_log = pending_log[self.batch_log:]
            r = self._push_call(dest, batch, pending_settings, lg)
            if pending_settings is not None:
                res["settings_applied"] = bool(r.get("settings_applied"))
                if r.get("settings_applied"):
                    self.state["settings_known"] = settings_sig(pending_settings)
            pending_settings = None
            res["applied"] += int(r.get("applied") or 0)
            res["same"] += int(r.get("same") or 0)
            res["logged"] += int(r.get("logged") or 0)
            if lg:
                self.state["log_pushed"][dest] = (self.state["log_pushed"][dest] + [e["id"] for e in lg])[-ECHO_CAP:]
            rej = {}
            for x in r.get("rejected") or []:
                if isinstance(x, dict):
                    rej[rkey(str(x.get("type")), str(x.get("id")))] = x
            for it in batch:
                key = rkey(it["type"], it["id"])
                x = rej.get(key)
                if x is None:
                    known[key] = item_sig(it)
                    continue
                reason = x.get("reason")
                cur = x.get("current")
                if reason == "older" and isinstance(cur, dict):
                    res["rejected_older"] += 1
                    curn = norm_pulled(cur, bool(cur.get("deleted")))
                    back[key] = curn
                elif reason == "tie" and isinstance(cur, dict):
                    res["rejected_tie"] += 1
                    curn = norm_pulled(cur, bool(cur.get("deleted")))
                    pair = (it, curn) if src == "a" else (curn, it)
                    self.conflicts.append(self._conflict(key, pair[0], pair[1], "tie"))
                else:
                    res["invalid"] += 1
                    self.rejected.append({"type": it["type"], "id": it["id"], "code": item_code(it), "to": dest, "reason": reason})
            while pending_log and i == len(batches) - 1:
                lg = pending_log[:self.batch_log]
                pending_log = pending_log[self.batch_log:]
                r = self._push_call(dest, [], None, lg)
                res["logged"] += int(r.get("logged") or 0)
                self.state["log_pushed"][dest] = (self.state["log_pushed"][dest] + [e["id"] for e in lg])[-ECHO_CAP:]
        return back

    # -------------------------------------------------- run
    def run(self):
        started = now_iso()
        A, B = self.sides["a"], self.sides["b"]
        allow = {"b": self.direction in ("both", "a-to-b"), "a": self.direction in ("both", "b-to-a")}   # allow[dest]
        self.report = {"profile": self.profile.get("name") or "", "profile_file": self.paths["profile"], "dry_run": self.dry_run,
                       "direction": self.direction, "started_at": started, "device_id": self.device["id"],
                       "sides": {k: {"label": s.label, "url": s.url} for k, s in self.sides.items()},
                       "plan": {}, "result": {}, "conflicts": self.conflicts, "rejected": self.rejected,
                       "warnings": self.warnings, "errors": self.errors}
        if not self.dry_run and not self._lock():
            self.errors.append("Un'altra sincronizzazione con questo profilo è in corso (file %s). Se non è vero, "
                               "sposta quel file e rilancia." % self.paths["lock"])
            return self._finish()
        self.journal({"event": "start", "at": started, "profile": self.paths["profile"], "dry_run": self.dry_run, "direction": self.direction})
        try:
            self._run(A, B, allow)
        except SideError as e:
            self.errors.append(e.message)
        except BridgeAbort as e:
            self.errors.append(str(e))
        finally:
            if not self.dry_run:
                self._unlock()
        return self._finish()

    def _run(self, A, B, allow):
        for s in (A, B):
            self.check_side(s)
            self.report["sides"][s.key].update({"user": s.me.get("user"), "role": s.me.get("role"), "server_time": s.server_time,
                                                "features": s.features, "licence_mode": (s.licence or {}).get("mode")})
        for s in (A, B):
            if s.url != self.state[s.key].get("url"):
                if self.state[s.key].get("url"):
                    self.warnings.append("L'indirizzo di %s è cambiato: si riparte da una fusione completa con quel lato (sicura)." % s.label)
                self.state[s.key] = {"url": s.url}
        dt = abs(ts_ms(A.server_time or "") - ts_ms(B.server_time or ""))
        if A.server_time and B.server_time and dt > 120000:
            self.warnings.append("Gli orologi dei due server differiscono di %d secondi: \"vince il più recente\" dipende dagli orologi, "
                                 "correggili." % (dt // 1000))
        for dest in ("a", "b"):
            s = self.sides[dest]
            if not allow[dest]:
                continue
            if s.me.get("role") not in ("editor", "admin"):
                raise BridgeAbort("%s: il token è di tipo '%s' e non può scrivere: serve un token editor (o admin)." % (s.label, s.me.get("role")))
            if s.read_only:
                self.warnings.append("%s è in sola lettura per la licenza: questa volta non riceve modifiche (si legge soltanto)." % s.label)
        pa, pb = self.pull_records(A), self.pull_records(B)
        la = lb = None
        if self.do_log:
            la, lb = self.pull_log(A, pa["to"]), self.pull_log(B, pb["to"])
        for s, p in ((A, pa), (B, pb)):
            self.report["sides"][s.key].update({"seq_from": p["from"], "seq_to": p["to"], "pulled": len(p["items"]),
                                                "log_pulled": len((la if s is A else lb)["entries"]) if self.do_log else 0})
        first = not self.state.get("runs")
        if first:
            na = (pa["counts"] or {}).get("records", 0) + (pa["counts"] or {}).get("tombstones", 0) if pa["counts"] else len(pa["items"])
            nb = (pb["counts"] or {}).get("records", 0) + (pb["counts"] or {}).get("tombstones", 0) if pb["counts"] else len(pb["items"])
            if na and nb:
                self.warnings.append("Prima sincronizzazione con dati su ENTRAMBI i lati (%s: %d, %s: %d): verranno fusi record per record, "
                                     "vince la modifica più recente; i record con la stessa ora e contenuto diverso restano come sono "
                                     "e sono segnalati come conflitti." % (A.label, na, B.label, nb))
            elif na or nb:
                src, dst = (A, B) if na else (B, A)
                self.warnings.append("Prima sincronizzazione: %s è vuoto, riceverà una copia completa da %s (%d elementi)." % (dst.label, src.label, na or nb))
        to, aligned, newc = self.plan(pa, pb)
        self.conflicts.extend(newc)
        st = {"a": None, "b": None}
        if self.do_settings:
            sa, sb = pa["settings"], pb["settings"]
            sk = self.state.get("settings_known")
            if sa and sb:
                ga, gb = settings_sig(sa), settings_sig(sb)
                if ga == gb:
                    self.state["settings_known"] = ga
                elif ga[0] > gb[0]:
                    st["b"] = sa
                elif gb[0] > ga[0]:
                    st["a"] = sb
                else:
                    self.conflicts.append({"type": "settings", "id": "subset", "code": "impostazioni condivise", "reason": "tie",
                                           "a_updated_at": sa.get("updated_at"), "b_updated_at": sb.get("updated_at"), "seen_at": now_iso()})
            elif sa and settings_sig(sa) != sk:
                st["b"] = sa
            elif sb and settings_sig(sb) != sk:
                st["a"] = sb
        logs = self.plan_log(la, lb) if self.do_log else {"a": [], "b": []}
        self.report["aligned"] = aligned
        self.report["first_run"] = first
        for src, dest in (("a", "b"), ("b", "a")):
            name = "%s_to_%s" % (src, dest)
            p = {}
            for it in to[dest].values():
                d = p.setdefault(it["type"], {"records": 0, "tombstones": 0})
                d["tombstones" if it.get("deleted") else "records"] += 1
            self.report["plan"][name] = {"types": p, "settings": st[dest] is not None, "log": len(logs[dest]),
                                         "enabled": allow[dest], "target_read_only": self.sides[dest].read_only}
        if self.dry_run:
            return
        # ---------------- push, A→B then B→A (+ up to 3 rounds for versions a server revealed as newer)
        res = {d: {"applied": 0, "same": 0, "rejected_older": 0, "rejected_tie": 0, "invalid": 0, "logged": 0, "settings_applied": None,
                   "skipped_unsupported": 0, "skipped_read_only": 0, "error": None} for d in ("a", "b")}
        self.report["result"] = {"a_to_b": res["b"], "b_to_a": res["a"]}
        ok = {"a": True, "b": True}
        queue = {"a": dict(to["a"]), "b": dict(to["b"])}
        first_round = True
        for _round in range(4):
            if not queue["a"] and not queue["b"] and not first_round:
                break
            for src, dest in (("a", "b"), ("b", "a")):
                items = queue[dest]
                queue[dest] = {}
                stt = st[dest] if first_round else None
                lg = logs[dest] if first_round else []
                if not allow[dest]:
                    continue
                if not ok[dest]:
                    continue
                if self.sides[dest].read_only:
                    res[dest]["skipped_read_only"] += len(items)
                    ok[dest] = False
                    continue
                if not items and stt is None and not lg:
                    continue
                try:
                    back = self.push_dir(src, dest, items, stt, lg, res[dest])
                except SideError as e:
                    ok[dest] = False
                    res[dest]["error"] = e.message
                    if e.code == "licence_read_only":
                        self.sides[dest].read_only = True
                        self.warnings.append(e.message)
                        res[dest]["skipped_read_only"] += len(items)
                    else:
                        self.errors.append(e.message)
                    continue
                if allow[src]:
                    for k, v in back.items():
                        queue[src][k] = v
                elif back:
                    self.warnings.append("%s ha %d versioni più recenti che non arrivano a %s con questa direzione (%s)."
                                         % (self.sides[dest].label, len(back), self.sides[src].label, self.direction))
                self._save_state()          # known / log echoes so far (cursors only below)
            first_round = False
        # ---------------- cursors: a source's cursor moves only when its changes reached the other side
        pulled = {"a": (pa, la), "b": (pb, lb)}
        for src, dest in (("a", "b"), ("b", "a")):
            if allow[dest] and ok[dest]:
                p, lg = pulled[src]
                self.state[src]["seq"] = p["to"]
                if lg is not None:
                    self.state[src]["log_seq"] = lg["to"]
        self.state["runs"] = int(self.state.get("runs") or 0) + 1
        self.state["last_run_at"] = now_iso()
        self._save_state()

    # -------------------------------------------------- output
    def _finish(self):
        oc = list(self.state["open_conflicts"].values())
        self.report["open_conflicts"] = oc
        ro = [s.label for s in self.sides.values() if s.read_only]
        self.report["read_only_sides"] = ro
        if self.errors:
            code = 2
        elif oc or self.conflicts or self.rejected or ro:
            code = 1
        else:
            code = 0
        self.report["exit"] = code
        self.report["ok"] = code == 0
        self.report["ended_at"] = now_iso()
        j = dict(self.report)
        j["event"] = "end"
        self.journal(j)
        return code

    def summary_it(self):
        r = self.report
        A, B = self.sides["a"].label, self.sides["b"].label
        L = []
        L.append("DocMap · sincronizzazione %s ⇄ %s%s" % (A, B, "  [PROVA: nessuna modifica]" if r.get("dry_run") else ""))
        L.append("Direzione: %s" % {"both": "entrambe", "a-to-b": "solo %s → %s" % (A, B), "b-to-a": "solo %s → %s" % (B, A)}[r["direction"]])
        for k in ("a", "b"):
            s = r["sides"].get(k, {})
            if "user" in s:
                L.append("  %s: utente %s (%s), letti %s cambiamenti%s%s" % (s["label"], s.get("user"), s.get("role"), s.get("pulled", "?"),
                         ", %s voci di registro" % s.get("log_pulled") if s.get("log_pulled") else "",
                         ", LICENZA IN SOLA LETTURA" if s["label"] in r.get("read_only_sides", []) else ""))
        for w in r["warnings"]:
            L.append("Attenzione: " + w)
        if "aligned" in r:
            L.append("Già allineati: %d" % r["aligned"])
        for name, (x, y) in (("a_to_b", (A, B)), ("b_to_a", (B, A))):
            p = r["plan"].get(name)
            if not p:
                continue
            parts = []
            for t in TYPE_ORDER + tuple(sorted(set(p["types"]) - set(TYPE_ORDER))):
                if t in p["types"]:
                    d = p["types"][t]
                    s = "%d %s" % (d["records"], TYPE_IT.get(t, t))
                    if d["tombstones"]:
                        s += " (+%d eliminazioni)" % d["tombstones"]
                    parts.append(s)
            if p["settings"]:
                parts.append("impostazioni condivise")
            if p["log"]:
                parts.append("%d %s di registro" % (p["log"], "voce" if p["log"] == 1 else "voci"))
            what = ", ".join(parts) if parts else "niente"
            flag = "" if p["enabled"] else "  (direzione esclusa)"
            L.append("%s %s → %s: %s%s" % ("Da inviare" if r["dry_run"] else "Inviati", x, y, what, flag))
            res = r["result"].get(name)
            if res and any(res[k] for k in ("applied", "same", "rejected_older", "rejected_tie", "invalid", "logged", "skipped_read_only", "skipped_unsupported")):
                L.append("   esito: %d applicati, %d già uguali, %d rifiutati perché più vecchi (riportati indietro), %d conflitti, %d non validi, %d voci di registro"
                         % (res["applied"], res["same"], res["rejected_older"], res["rejected_tie"], res["invalid"], res["logged"]))
                if res["skipped_read_only"]:
                    L.append("   non inviati (sola lettura): %d" % res["skipped_read_only"])
                if res["skipped_unsupported"]:
                    L.append("   non inviati (il server non conosce quel tipo, va aggiornato): %d" % res["skipped_unsupported"])
        oc = r.get("open_conflicts") or []
        if oc:
            L.append("CONFLITTI da risolvere (stessa ora, contenuto diverso: nessuno dei due è stato toccato): %d" % len(oc))
            for c in oc[:50]:
                L.append("   - %s %s %s · %s: %s%s · %s: %s%s" % (c["type"], c.get("code") or "", c["id"], A, c.get("a_updated_at"),
                         " (eliminato)" if c.get("a_deleted") else "", B, c.get("b_updated_at"), " (eliminato)" if c.get("b_deleted") else ""))
            L.append("   Per risolvere: apri il record in DocMap sul lato giusto e salvalo di nuovo: diventa il più recente e passa dall'altra parte.")
        for x in r.get("rejected") or []:
            L.append("Rifiutato da %s: %s %s %s (%s)" % (self.sides[x["to"]].label, x["type"], x.get("code") or "", x["id"], x.get("reason")))
        for e in r["errors"]:
            L.append("ERRORE: " + e)
        L.append({0: "Esito: tutto a posto.", 1: "Esito: completato, ma c'è qualcosa da controllare (vedi sopra).",
                  2: "Esito: NON completato (vedi errore). Rilanciare è sicuro: riprende da dove si era fermato."}[r["exit"]])
        return "\n".join(L)


def pid_alive(pid):
    if pid <= 0:
        return False
    if os.name == "nt":                     # os.kill would terminate the process on Windows
        import ctypes
        k = ctypes.windll.kernel32
        h = k.OpenProcess(0x1000, False, pid)   # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        code = ctypes.c_ulong()
        ok = k.GetExitCodeProcess(h, ctypes.byref(code))
        k.CloseHandle(h)
        return bool(ok) and code.value == 259    # STILL_ACTIVE
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def write_example(path):
    if os.path.exists(path):
        print("Esiste già: %s (non lo sovrascrivo)." % path)
        return 2
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    with _private_open(path, "w") as f:
        json.dump(DEFAULT_PROFILE, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("Profilo di esempio scritto in %s: aprilo con il Blocco note e compila url e token dei due lati." % path)
    return 0


def cli(a):
    if a.example:
        return write_example(a.profile)
    try:
        br = Bridge(a.profile, direction=a.direction, dry_run=a.dry_run)
    except BridgeAbort as e:
        if a.json:
            print(json.dumps({"ok": False, "exit": 2, "errors": [str(e)]}, ensure_ascii=False, indent=1))
        else:
            print("ERRORE: " + str(e))
        return 2
    code = br.run()
    if a.json:
        print(json.dumps(br.report, ensure_ascii=False, indent=1, sort_keys=True))
    else:
        print(br.summary_it())
    sys.stdout.flush()
    return code
