"""DocMap shared online database — Python port of server-php/api.php (v11, DM_SCHEMA 2), 1:1.

Every function below mirrors the PHP function of the same name (see docmapv1/server-php/api.php, the executable spec):
same routes (?r=<route>), same parameters (JSON body first, then query), same JSON, status codes, error codes and
headers, same SQLite file (docmap.sqlite in data_dir) with the same encryption-at-rest blobs, HMAC indexes and
canonical hashes. One request = one `Ctx` (like one PHP process): config re-read, a fresh SQLite connection, the body
parsed lazily (a bad body only fails the routes that read it, exactly like body() in PHP).

This module is synchronous (sqlite3); web.py runs it in a worker thread.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import platform
import re
import sqlite3
import time
from urllib.parse import unquote_to_bytes

from . import licence
from .crypto import CryptoError, dec as _dec, enc as _enc, hidx as _hidx
from .phpcompat import (
    PhpWarning, akey, ascii_lower, ascii_upper, b64decode_strict, canon, elvis, is_arr, is_scalar, iso_ms, jenc,
    json_decode, now_iso, pget, php_array_values, php_empty, php_int, php_str, php_trim, php_truthy, strnatcasecmp,
    substr_bytes, ts_ms,
)
from .phpconfig import read_config_file

log = logging.getLogger("docmap")

DM_API = "docmap-php"
DM_API_VERSION = 1
DM_TYPES = ("binder", "client", "location")
DM_ROLES = {"viewer": 1, "editor": 2, "admin": 3}
DM_MOBILE_FIELDS = ("archive_state", "contents_items", "room_code", "cabinet_code", "shelf_code", "sector_code", "notes",
                    "tags", "location_id", "location_code")
DM_LOC_SC = re.compile(r"dm26L[A-Za-z0-9]{8}$")
DM_PULL_PAGE = 2000
DM_LOG_PAGE = 1000
DM_MAX_RECORD = 262144
DM_SCHEMA = 2
DM_JOURNAL_PAGE, DM_JOURNAL_PAGE_MAX, DM_JOURNAL_ITEMS_LIST = 50, 200, 500

QR_RE = re.compile(r"[A-Za-z0-9_-]{1,40}$")
ID_RE = re.compile(r"[A-Za-z0-9._:@-]{1,100}$")
REVOKE_RE = re.compile(r"db:([0-9a-f]{16})$")
DAY_RE = re.compile(r"\d{4}-\d{2}-\d{2}$")
BEARER_RE = re.compile(r"Bearer\s+(\S+)$", re.I)
CTRL_RE = re.compile(r"[\x00-\x1F\x7F]")

PING_RUNTIME = "Python " + ".".join(platform.python_version_tuple()[:2])

CREATE_SQL = """CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS records (type TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
      who TEXT NOT NULL DEFAULT '', payload BLOB, seq INTEGER NOT NULL DEFAULT 0, k_short TEXT, k_code TEXT, k_cab TEXT, PRIMARY KEY (type, id));
    CREATE INDEX IF NOT EXISTS records_seq ON records (seq);
    CREATE INDEX IF NOT EXISTS records_short ON records (k_short);
    CREATE INDEX IF NOT EXISTS records_code ON records (k_code);
    CREATE INDEX IF NOT EXISTS records_cab ON records (k_cab);
    CREATE TABLE IF NOT EXISTS changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, at TEXT NOT NULL, device TEXT, who TEXT);
    CREATE TABLE IF NOT EXISTS settings_shared (key TEXT PRIMARY KEY, json BLOB, updated_at TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS activity_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, at TEXT, payload BLOB);
    CREATE TABLE IF NOT EXISTS auth_fail (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tokens (id TEXT PRIMARY KEY, token_sha256 TEXT NOT NULL UNIQUE, user TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT, revoked_at TEXT);"""

MIGRATIONS = {
    2: """CREATE TABLE IF NOT EXISTS sync_journal (jid INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, route TEXT NOT NULL, token_id TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT '', k_user TEXT, k_device TEXT, n_sent INTEGER NOT NULL DEFAULT 0, n_accepted INTEGER NOT NULL DEFAULT 0,
            n_rejected INTEGER NOT NULL DEFAULT 0, n_conflicts INTEGER NOT NULL DEFAULT 0, n_same INTEGER NOT NULL DEFAULT 0, n_items INTEGER NOT NULL DEFAULT 0,
            seq_from INTEGER, seq_to INTEGER, meta BLOB);
          CREATE INDEX IF NOT EXISTS sync_journal_at ON sync_journal (at);
          CREATE INDEX IF NOT EXISTS sync_journal_user ON sync_journal (k_user);
          CREATE INDEX IF NOT EXISTS sync_journal_device ON sync_journal (k_device);
          CREATE TABLE IF NOT EXISTS sync_journal_items (jid INTEGER NOT NULL, n INTEGER NOT NULL, type TEXT NOT NULL, id TEXT NOT NULL, k_code TEXT, action TEXT NOT NULL,
            client_updated_at TEXT, prev_updated_at TEXT, new_updated_at TEXT, prev_hash TEXT, new_hash TEXT, payload BLOB, PRIMARY KEY (jid, n));
          CREATE INDEX IF NOT EXISTS sync_journal_items_rec ON sync_journal_items (type, id);
          CREATE INDEX IF NOT EXISTS sync_journal_items_code ON sync_journal_items (k_code);""",
}

CORS_ALLOW_HEADERS = "Content-Type, X-DocMap-Token, Authorization, If-Match, X-DocMap-Device, X-DocMap-Device-Name, X-DocMap-App"


class ApiError(Exception):
    def __init__(self, status, code, message, extra=None, headers=None):
        super().__init__(message)
        self.status = status
        self.code_name = code
        self.message = message
        self.extra = extra or {}
        self.headers = headers or {}


def fail(status, code, message, extra=None, headers=None):
    raise ApiError(status, code, message, extra, headers)


def jdec(s):
    """json_decode($s, true) returning None on error."""
    try:
        return json_decode(s)
    except (ValueError, UnicodeError, RecursionError):
        return None


def valid_id(v):
    return isinstance(v, str) and ID_RE.match(v) is not None


def sha256_raw(s: str) -> str:
    """hash('sha256', $s) where $s may come from a header (bytes kept through surrogateescape)."""
    return hashlib.sha256(s.encode("utf-8", "surrogateescape")).hexdigest()


# ---------------------------------------------------------------- request / response
class Request:
    """What PHP would see in $_SERVER / $_GET / php://input."""

    def __init__(self, method, query, headers, raw_body, remote_addr):
        self.method = method                 # REQUEST_METHOD
        self.get = query                     # $_GET (PHP array model)
        self.headers = headers               # lower-case name → value (str, undecodable bytes surrogate-escaped)
        self.raw = raw_body                  # bytes (already capped at max_body_mb MB + 1 by the caller)
        self.remote_addr = remote_addr

    def server(self, name, default=None):
        """$_SERVER['HTTP_X_FOO'] → header 'x-foo'."""
        if name.startswith("HTTP_"):
            return self.headers.get(name[5:].lower().replace("_", "-"), default)
        if name == "REMOTE_ADDR":
            return self.remote_addr if self.remote_addr is not None else default
        if name == "REQUEST_METHOD":
            return self.method
        return default


class Response:
    def __init__(self, status, headers, body: bytes):
        self.status = status
        self.headers = headers   # list of (name, value)
        self.body = body


def parse_query(qs):
    """$_GET as PHP builds it (parse_str): '+' = space, %XX, last value wins, key[] / key[x] arrays,
    '.' and ' ' in the base name become '_'. qs: the raw query string (bytes or str)."""
    out = {}
    if not qs:
        return out
    if isinstance(qs, str):
        qs = qs.encode("utf-8", "surrogateescape")
    dec = lambda x: unquote_to_bytes(x.replace(b"+", b" ")).decode("utf-8", "surrogateescape")   # noqa: E731
    for part in qs.split(b"&"):
        if part == b"":
            continue
        k, _, v = part.partition(b"=")
        k, v = dec(k), dec(v)
        k = k.lstrip(" ")
        if k == "":
            continue
        m = re.match(r"([^\[]*)((?:\[[^\]]*\])+)(.*)$", k, re.S)
        if m and m.group(1) != "":
            base = re.sub(r"[ .]", "_", m.group(1))
            subs = re.findall(r"\[([^\]]*)\]", m.group(2))
            cur = out.get(base)
            if not isinstance(cur, dict):
                cur = {}
                out[base] = cur
            for i, s in enumerate(subs):
                last = i == len(subs) - 1
                if s == "":
                    key = max([x for x in cur if isinstance(x, int)] + [-1]) + 1
                else:
                    key = int(s) if re.fullmatch(r"0|-?[1-9][0-9]*", s) else s
                if last:
                    cur[key] = v
                else:
                    nxt = cur.get(key)
                    if not isinstance(nxt, dict):
                        nxt = {}
                        cur[key] = nxt
                    cur = nxt
        else:
            k = re.sub(r"[ .\[]", "_", k)
            out[k] = v
    return out


# ---------------------------------------------------------------- per-request context (= one PHP process)
class Ctx:
    def __init__(self, req: Request, config_path: str):
        self.req = req
        self.config_path = config_path
        self.headers = {}          # header() calls: lower name → (Name, value)
        self._body = None
        self.c = None
        self.db = None

    def header(self, name, value):
        self.headers[name.lower()] = (name, value)

    # ---- out() ----
    def out(self, status, body, headers=None):
        self.header("Content-Type", "application/json; charset=utf-8")
        self.header("Cache-Control", "no-store")
        self.header("X-Content-Type-Options", "nosniff")
        self.header("Referrer-Policy", "no-referrer")
        for k, v in (headers or {}).items():
            self.header(k, v)
        return Response(status, list(self.headers.values()), jenc(body).encode("utf-8", "surrogateescape"))

    def empty(self, status):
        """http_response_code(204); exit; — PHP still sends its default Content-type."""
        if "content-type" not in self.headers:
            self.header("Content-type", "text/html; charset=UTF-8")
        return Response(status, list(self.headers.values()), b"")

    # ---- config ----
    def load_config(self):
        f = self.config_path
        if not f or not os.path.isfile(f):
            fail(500, "config", "config.php missing: open setup.php once (or copy config.sample.php to config.php).")
        try:
            c = read_config_file(f)
        except Exception:   # a config.php that does not parse = a PHP fatal error
            log.exception("docmap: cannot read the configuration")
            raise
        if not isinstance(c, dict):
            fail(500, "config", "config.php must return an array.")
        defaults = {"data_dir": "", "aes_key": "", "tokens": {}, "allowed_origins": {}, "max_fails": 5, "lock_seconds": 60,
                    "max_body_mb": 20, "studio_name": "", "journal_keep_days": 0, "journal_pulls": "changes"}
        for k, v in defaults.items():
            if k not in c:
                c[k] = v
        key = b64decode_strict(php_str(c["aes_key"]))
        if key is None or len(key) != 32:
            fail(500, "config", "Encryption key missing or invalid: aes_key must be 32 random bytes in base64 (setup.php creates it). The API does not run without encryption.")
        dd = c["data_dir"]
        if dd == "" or not isinstance(dd, str) or not os.path.isdir(dd) or not os.access(dd, os.W_OK):
            if dd is not None and not isinstance(dd, str):
                php_str(dd)
            fail(500, "config", "data_dir missing or not writable (see config.php).")
        c["_key"] = key
        self.c = c
        return c

    # ---- body / param ----
    def body(self):
        if self._body is not None:
            return self._body
        mx = php_int(self.c["max_body_mb"]) * 1048576
        raw = self.req.raw[:max(0, mx + 1)]
        if len(raw) > mx:
            fail(413, "too_large", "request too large")
        if php_trim(raw.decode("latin-1")) == "":
            self._body = {}
            return self._body
        j = jdec(raw)
        if not isinstance(j, dict):
            fail(400, "bad_json", "body must be a JSON object")
        self._body = j
        return j

    def param(self, k, dflt=None):
        b = self.body()
        if k in b:
            return b[k]
        v = self.req.get.get(k)
        return dflt if v is None else v

    def client_ip(self):
        return php_str(self.req.server("REMOTE_ADDR", "?"))

    # ---- crypto helpers bound to the key ----
    def enc(self, plain, aad):
        return _enc(self.c["_key"], plain, aad)

    def dec(self, blob, aad):
        try:
            return _dec(self.c["_key"], blob, aad)
        except CryptoError as e:
            if str(e) == "unreadable":
                fail(500, "crypto", "stored payload unreadable")
            fail(500, "crypto", "stored payload does not match the key (wrong aes_key?)")

    def hidx(self, v):
        return _hidx(self.c["_key"], v)


# ---------------------------------------------------------------- CORS
def cors(ctx: Ctx, c):
    origin = php_str(ctx.req.server("HTTP_ORIGIN", ""))
    if origin == "":
        return
    host = php_str(ctx.req.server("HTTP_HOST", ""))
    same = host != "" and re.match(r"https?://" + re.escape(host) + r"$", origin, re.I | re.S) is not None
    if same:
        return
    allowed = [php_str(x) for x in php_array_values(c["allowed_origins"])]
    if origin not in allowed:
        fail(403, "origin", "origin not allowed (allowed_origins in config.php)")
    ctx.header("Access-Control-Allow-Origin", origin)
    ctx.header("Vary", "Origin")
    ctx.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    ctx.header("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS)
    ctx.header("Access-Control-Expose-Headers", "ETag, Retry-After")
    ctx.header("Access-Control-Max-Age", "600")


# ---------------------------------------------------------------- database
def _exec_script(db, sql):
    for stmt in sql.split(";"):
        if stmt.strip():
            db.execute(stmt)


def open_db(ctx: Ctx):
    c = ctx.c
    path = c["data_dir"].rstrip("/\\") + os.sep + "docmap.sqlite"
    db = sqlite3.connect(path, timeout=8.0, isolation_level=None, check_same_thread=False)
    db.row_factory = sqlite3.Row
    ctx.db = db
    db.execute("PRAGMA busy_timeout = 8000")
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("PRAGMA synchronous = NORMAL")
    _exec_script(db, CREATE_SQL)
    row = db.execute("SELECT v FROM meta WHERE k = 'key_check'").fetchone()
    if row is None:
        db.execute("INSERT OR IGNORE INTO meta (k, v) VALUES ('key_check', ?), ('schema', '1'), ('created_at', ?)",
                   (base64.b64encode(ctx.enc("docmap-key-check", "meta/key_check")).decode("ascii"), now_iso()))
    else:
        ok = False
        try:
            b = b64decode_strict(php_str(row[0]))
            ok = b is not None and _dec(c["_key"], b, "meta/key_check") == "docmap-key-check"
        except Exception:   # noqa: BLE001
            ok = False
        if not ok:
            fail(500, "config", "aes_key does not match the existing database (restore the original key from your backup of config.php).")
    db_migrate(db)
    return db


def _meta_schema(db):
    r = db.execute("SELECT v FROM meta WHERE k = 'schema'").fetchone()
    v = r[0] if r else None
    return php_int(v if php_truthy(v) else 1)


def db_migrate(db):
    cur = _meta_schema(db)
    if cur >= DM_SCHEMA:
        return
    db.execute("BEGIN IMMEDIATE")
    try:
        cur = _meta_schema(db)
        for n, sql in sorted(MIGRATIONS.items()):
            if n > cur:
                _exec_script(db, sql)
                cur = n
        db.execute("INSERT INTO meta (k, v) VALUES ('schema', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", (str(cur),))
        db.execute("INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)", ("migrated_%d_at" % cur, now_iso()))
        db.execute("COMMIT")
    except BaseException:
        _rollback(db)
        raise


def _rollback(db):
    try:
        db.execute("ROLLBACK")
    except Exception:   # noqa: BLE001
        pass


def max_seq(db):
    return int(db.execute("SELECT COALESCE(MAX(seq), 0) FROM changes").fetchone()[0])


def max_log_seq(db):
    return int(db.execute("SELECT COALESCE(MAX(seq), 0) FROM activity_log").fetchone()[0])


# ---------------------------------------------------------------- auth
def auth(ctx: Ctx, need):
    db, c = ctx.db, ctx.c
    k = "ip:" + ctx.client_ip()
    now = int(time.time())
    row = db.execute("SELECT n, until FROM auth_fail WHERE k = ?", (k,)).fetchone()
    if row and php_int(row["until"]) > now:
        left = php_int(row["until"]) - now
        fail(429, "locked", "too many wrong tokens: retry later", {"retry_in": left}, {"Retry-After": str(left)})
    tok = php_str(ctx.req.server("HTTP_X_DOCMAP_TOKEN", ""))
    if tok == "":
        h = php_str(ctx.req.server("HTTP_AUTHORIZATION", ""))
        m = BEARER_RE.match(h)
        if m:
            tok = m.group(1)
    if tok == "":
        bt = pget(ctx.body(), "_token", "")
        if isinstance(bt, str):
            tok = bt
    if tok == "":
        fail(401, "token_missing", "access token missing (header X-DocMap-Token)")
    hsh = sha256_raw(tok)
    who = None
    tokens = c["tokens"]
    items = tokens.items() if isinstance(tokens, dict) else enumerate(php_array_values(tokens))
    for i, t in items:
        if not isinstance(t, dict):
            continue
        if t.get("token_sha256") is not None:
            th = ascii_lower(php_str(t["token_sha256"]))
        elif t.get("token") is not None:
            th = sha256_raw(php_str(t["token"]))
        else:
            th = ""
        if th != "" and hmac.compare_digest(th.encode("utf-8", "surrogateescape"), hsh.encode("ascii")) and php_empty(t.get("disabled")):
            role = t.get("role")
            who = {"user": php_str(pget(t, "user", "user" + str(i))),
                   "role": role if isinstance(role, str) and role in DM_ROLES else "viewer", "token_id": "cfg:" + str(i)}
    if not who:
        r = db.execute("SELECT id, user, role FROM tokens WHERE token_sha256 = ? AND revoked_at IS NULL", (hsh,)).fetchone()
        if r:
            who = {"user": r["user"], "role": r["role"] if r["role"] in DM_ROLES else "viewer", "token_id": "db:" + php_str(r["id"])}
    if not who:
        n = (php_int(row["n"]) if row else 0) + 1
        mx = max(1, php_int(c["max_fails"]))
        until = now + min(900, php_int(c["lock_seconds"]) * (2 ** min(10, n - mx))) if n >= mx else 0
        db.execute("INSERT INTO auth_fail (k, n, until, at) VALUES (?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = excluded.n, until = excluded.until, at = excluded.at",
                   (k, n, until, now))
        log.warning("docmap: wrong token from %s", ctx.client_ip())
        fail(401, "token_invalid", "access token not valid", {"left": max(0, mx - n)})
    if row:
        db.execute("DELETE FROM auth_fail WHERE k = ?", (k,))
    if DM_ROLES[who["role"]] < DM_ROLES[need]:
        fail(403, "forbidden", "role " + who["role"] + " cannot do this (needs " + need + ")")
    return who


# ---------------------------------------------------------------- records
def rec_aad(type_, id_):
    return "records/" + type_ + "/" + id_


def rec_load(db, type_, id_):
    return db.execute("SELECT * FROM records WHERE type = ? AND id = ?", (type_, id_)).fetchone()


def rec_data(ctx, row):
    d = jdec(ctx.dec(row["payload"], rec_aad(row["type"], row["id"])))
    return d if isinstance(d, dict) else {}


def rec_public(ctx, row):
    d = rec_data(ctx, row)
    if php_int(row["deleted"]):
        return {"type": row["type"], "id": row["id"], "code": php_str(pget(d, "code", "")), "deletedAt": row["updated_at"],
                "who": row["who"], "deleted": True}
    d["id"] = row["id"]
    d["updated_at"] = row["updated_at"]
    return {"type": row["type"], "id": row["id"], "updated_at": row["updated_at"], "who": row["who"], "data": d}


def rec_write(ctx, type_, id_, updated, deleted, who, data, device):
    """Write one record (or tombstone) and log the change. Must run inside a transaction."""
    db = ctx.db
    cur = db.execute("INSERT INTO changes (type, id, updated_at, at, device, who) VALUES (?, ?, ?, ?, ?, ?)",
                     (type_, id_, updated, now_iso(), device, who))
    seq = int(cur.lastrowid)
    ks = kc = kk = None
    if type_ == "binder" and not deleted:
        ks = ctx.hidx(php_str(pget(data, "short_code", "")))
        kc = ctx.hidx(ascii_upper(php_trim(php_str(pget(data, "speaking_code", "")))))
        room = php_str(pget(data, "room_code", ""))
        cab = php_str(pget(data, "cabinet_code", ""))
        kk = ctx.hidx(room + "\x1f" + cab) if (room != "" or cab != "") else None
    elif type_ == "location" and not deleted:
        ks = ctx.hidx(php_str(pget(data, "short_code", "")))
        kc = ctx.hidx(ascii_upper(php_trim(php_str(pget(data, "code", "")))))
    data = dict(data)
    data.pop("updated_at", None)
    db.execute("""INSERT INTO records (type, id, updated_at, deleted, who, payload, seq, k_short, k_code, k_cab) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(type, id) DO UPDATE SET updated_at = excluded.updated_at, deleted = excluded.deleted, who = excluded.who, payload = excluded.payload, seq = excluded.seq,
      k_short = excluded.k_short, k_code = excluded.k_code, k_cab = excluded.k_cab""",
               (type_, id_, updated, 1 if deleted else 0, who, ctx.enc(jenc(data), rec_aad(type_, id_)), seq, ks, kc, kk))
    return seq


def log_insert(ctx, e):
    id_ = pget(e, "id", "")
    if not valid_id(id_):
        return False
    at = e.get("at") if isinstance(e.get("at"), str) else now_iso()
    cur = ctx.db.execute("INSERT OR IGNORE INTO activity_log (id, at, payload) VALUES (?, ?, ?)",
                         (id_, at, ctx.enc(jenc(e), "activity/" + id_)))
    return cur.rowcount > 0


# ---------------------------------------------------------------- v11 journal
def cut_str(v, n):
    if not is_scalar(v):
        return ""
    v = php_str(v)
    try:
        v.encode("utf-8")
    except UnicodeEncodeError:   # invalid UTF-8 (from a header): preg_replace /u gives null
        return ""
    v = CTRL_RE.sub("", v)
    return php_trim(v[:n])


def client_info(ctx):
    b = ctx.body()
    d = b.get("_device") if is_arr(b.get("_device")) else {}
    h = lambda k: php_str(ctx.req.server(k, ""))   # noqa: E731
    if pget(d, "id") is not None:
        idv = d["id"]
    else:
        idv = h("HTTP_X_DOCMAP_DEVICE") if h("HTTP_X_DOCMAP_DEVICE") != "" else pget(b, "deviceId", "")
    id_ = cut_str(idv, 100)
    if pget(d, "name") is not None:
        namev = d["name"]
    else:
        namev = unquote_to_bytes(h("HTTP_X_DOCMAP_DEVICE_NAME").encode("utf-8", "surrogateescape")).decode("utf-8", "surrogateescape")
    name = cut_str(namev, 80)
    app = cut_str(d["app"] if pget(d, "app") is not None else h("HTTP_X_DOCMAP_APP"), 40)
    return {"device_id": id_ if id_ != "" else "unknown", "device_name": name if name != "" else "unknown",
            "app_version": app if app != "" else "unknown"}


def rec_code(d):
    if not d:
        return ""
    for k in ("speaking_code", "code", "full_code", "location_code", "multi_code", "name"):
        v = d.get(k) if isinstance(d, dict) else None
        if v is not None and is_scalar(v) and php_trim(php_str(v)) != "":
            return cut_str(v, 100)
    return ""


def same_content(type_, a, b):
    if type_ == "location":
        a = {k: v for k, v in a.items() if k not in ("code", "level")}
        b = {k: v for k, v in b.items() if k not in ("code", "level")}
    return jenc(canon(a)) == jenc(canon(b))


def jr_hash(data):
    return None if data is None else hashlib.sha256(jenc(canon(data)).encode("utf-8", "surrogateescape")).hexdigest()


def jr_tomb_hash(type_, id_, at):
    return hashlib.sha256(("deleted:" + type_ + "/" + id_ + "@" + at).encode("utf-8", "surrogateescape")).hexdigest()


def jr_new(route, who, ci, extra=None):
    return {"route": route, "who": who, "ci": ci, "extra": extra if extra is not None else {}, "items": [], "seq_from": None, "seq_to": None,
            "n": {"sent": 0, "accepted": 0, "rejected": 0, "conflicts": 0, "same": 0}}


def jr_item(j, type_, id_, action, o=None):
    it = {"type": type_, "id": id_, "action": action}
    for k, v in (o or {}).items():
        if k not in it:
            it[k] = v
    j["items"].append(it)


def jr_write(ctx, j):
    db = ctx.db
    who, ci = j["who"], j["ci"]
    meta = {"user": php_str(pget(who, "user", "")), "device_id": ci["device_id"], "device_name": ci["device_name"], "app_version": ci["app_version"],
            "operator": php_str(pget(j["extra"], "operator", "")), "ip": ctx.client_ip(), "extra": j["extra"]}
    n = j["n"]
    cur = db.execute("INSERT INTO sync_journal (at, route, token_id, role, k_user, k_device, n_sent, n_accepted, n_rejected, n_conflicts, n_same, n_items, seq_from, seq_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (now_iso(), j["route"], php_str(pget(who, "token_id", "")), php_str(pget(who, "role", "")),
                      ctx.hidx("user/" + ascii_lower(php_str(pget(who, "user", "")))), ctx.hidx("device/" + ci["device_id"]),
                      n["sent"], n["accepted"], n["rejected"], n["conflicts"], n["same"], len(j["items"]), j["seq_from"], j["seq_to"]))
    jid = int(cur.lastrowid)
    db.execute("UPDATE sync_journal SET meta = ? WHERE jid = ?", (ctx.enc(jenc(meta), "journal/" + str(jid)), jid))
    for i, it in enumerate(j["items"]):
        code = php_str(pget(it, "code", ""))
        pl = {"code": code, "reason": php_str(pget(it, "reason", "")), "prev": it.get("prev"), "new": it.get("new"), "extra": it.get("extra")}
        db.execute("INSERT INTO sync_journal_items (jid, n, type, id, k_code, action, client_updated_at, prev_updated_at, new_updated_at, prev_hash, new_hash, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                   (jid, i + 1, it["type"], it["id"], ctx.hidx(ascii_upper(php_trim(code))) if code != "" else None, it["action"],
                    it.get("client_updated_at"), it.get("prev_updated_at"), it.get("new_updated_at"), it.get("prev_hash"), it.get("new_hash"),
                    ctx.enc(jenc(pl), "journal/%d/%d" % (jid, i + 1))))
    return jid


def jr_prune(ctx):
    db, c = ctx.db, ctx.c
    days = php_int(c["journal_keep_days"])
    if days <= 0:
        return
    r = db.execute("SELECT v FROM meta WHERE k = 'journal_pruned_at'").fetchone()
    last = php_str(r[0]) if r and php_truthy(r[0]) else ""
    if last != "" and ts_ms(last) > ts_ms(now_iso()) - 86400000:
        return
    cut = iso_ms(ts_ms(now_iso()) - days * 86400000)
    db.execute("BEGIN IMMEDIATE")
    try:
        db.execute("DELETE FROM sync_journal_items WHERE jid IN (SELECT jid FROM sync_journal WHERE at < ?)", (cut,))
        db.execute("DELETE FROM sync_journal WHERE at < ?", (cut,))
        db.execute("INSERT INTO meta (k, v) VALUES ('journal_pruned_at', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", (now_iso(),))
        db.execute("COMMIT")
    except BaseException:
        _rollback(db)
        raise


def jr_meta(ctx, row):
    m = jdec(ctx.dec(row["meta"], "journal/" + str(row["jid"]))) if php_truthy(row["meta"]) else None
    return m if isinstance(m, dict) else {}


def jr_payload(ctx, it):
    p = jdec(ctx.dec(it["payload"], "journal/%s/%s" % (it["jid"], it["n"]))) if php_truthy(it["payload"]) else None
    return p if isinstance(p, dict) else {}


# ---------------------------------------------------------------- routes
def r_ping():
    return {"ok": True, "api": DM_API, "version": DM_API_VERSION, "schema": DM_SCHEMA, "features": ["journal", "device_info", "locations"],
            "server_time": now_iso(), "php": PING_RUNTIME}


def r_pull(ctx, who=None):
    db, c = ctx.db, ctx.c
    since = max(0, php_int(ctx.param("since", 0)))
    log_since = max(0, php_int(ctx.param("log_since", 0)))
    db.execute("BEGIN")
    try:
        rows = db.execute("SELECT * FROM records WHERE seq > ? ORDER BY seq LIMIT %d" % (DM_PULL_PAGE + 1), (since,)).fetchall()
        more = len(rows) > DM_PULL_PAGE
        if more:
            rows.pop()
        records, tombs, last = [], [], since
        for r in rows:
            p = rec_public(ctx, r)
            if p.get("deleted"):
                del p["deleted"]
                tombs.append(p)
            else:
                records.append(p)
            last = max(last, php_int(r["seq"]))
        seq = last if more else max_seq(db)
        settings = None
        sr = db.execute("SELECT * FROM settings_shared WHERE key = 'subset' AND seq > ?", (since,)).fetchone()
        if sr:
            settings = {"updated_at": sr["updated_at"], "data": jdec(ctx.dec(sr["json"], "settings/subset"))}
        if log_since == 0:
            lrows = db.execute("SELECT * FROM (SELECT * FROM activity_log ORDER BY seq DESC LIMIT %d) ORDER BY seq" % DM_LOG_PAGE).fetchall()
        else:
            lrows = db.execute("SELECT * FROM activity_log WHERE seq > ? ORDER BY seq LIMIT %d" % DM_LOG_PAGE, (log_since,)).fetchall()
        lg, log_seq = [], log_since
        for r in lrows:
            e = jdec(ctx.dec(r["payload"], "activity/" + php_str(r["id"])))
            if isinstance(e, dict):
                lg.append(e)
            log_seq = max(log_seq, php_int(r["seq"]))
        if len(lg) < DM_LOG_PAGE:
            log_seq = max(log_seq, max_log_seq(db))
        counts = None
        if since == 0:
            counts = {"records": int(db.execute("SELECT COUNT(*) FROM records WHERE deleted = 0").fetchone()[0]),
                      "tombstones": int(db.execute("SELECT COUNT(*) FROM records WHERE deleted = 1").fetchone()[0])}
        db.execute("COMMIT")
    except BaseException:
        if db.in_transaction:
            _rollback(db)
        raise
    jid = None
    mode = php_str(c["journal_pulls"])
    if who is not None and (mode == "all" or (mode != "none" and (records or tombs or settings or since == 0))):
        jr = jr_new("pull", who, client_info(ctx), {"since": since, "more": more})
        jr["seq_from"] = since
        jr["seq_to"] = seq
        jr["n"]["sent"] = len(records) + len(tombs)
        for r in records:
            jr_item(jr, r["type"], r["id"], "pull", {"code": rec_code(r["data"]), "new_updated_at": r["updated_at"], "new_hash": jr_hash(r["data"])})
        for t in tombs:
            jr_item(jr, t["type"], t["id"], "pull-delete", {"code": php_str(pget(t, "code", "")), "new_updated_at": t["deletedAt"],
                                                             "new_hash": jr_tomb_hash(t["type"], t["id"], t["deletedAt"])})
        if settings:
            jr_item(jr, "settings", "subset", "pull", {"new_updated_at": settings["updated_at"],
                                                       "new_hash": jr_hash(settings["data"]) if is_arr(settings["data"]) else None})
        db.execute("BEGIN IMMEDIATE")
        try:
            jid = jr_write(ctx, jr)
            db.execute("COMMIT")
        except BaseException:
            _rollback(db)
            raise
    return {"seq": seq, "more": more, "records": records, "tombstones": tombs, "settings": settings, "activity_log": lg, "log_seq": log_seq,
            "counts": counts, "server_time": now_iso(), "journal_id": jid}


def r_push(ctx, who):
    db, c = ctx.db, ctx.c
    b = ctx.body()
    device = substr_bytes(php_str(pget(b, "deviceId", "")), 100)
    op = substr_bytes(php_trim(php_str(pget(b, "operator", ""))), 80)
    label = op if op != "" else who["user"]
    applied = same = logged = 0
    rejected = []
    ci = client_info(ctx)
    jr = jr_new("push", who, ci, {"operator": op})

    def bad(type_, id_, reason, u):
        jr_item(jr, substr_bytes(type_, 40) if isinstance(type_, str) else "", substr_bytes(id_, 100) if isinstance(id_, str) else "",
                "rejected-invalid", {"reason": reason, "client_updated_at": u})

    db.execute("BEGIN IMMEDIATE")
    try:
        for r in php_array_values(pget(b, "records", {})):
            jr["n"]["sent"] += 1
            type_ = pget(r, "type", "")
            id_ = pget(r, "id", "")
            data = pget(r, "data", None)
            u = php_str(pget(r, "updated_at", None) if pget(r, "updated_at", None) is not None else pget(data, "updated_at", ""))
            if not (isinstance(type_, str) and type_ in DM_TYPES) or not valid_id(id_) or not isinstance(data, dict) or ts_ms(u) <= 0:
                rejected.append({"type": php_str(type_), "id": id_ if isinstance(id_, str) else "", "reason": "invalid"})
                bad(type_, id_, "invalid", u)
                continue
            if len(jenc(data).encode("utf-8", "surrogateescape")) > DM_MAX_RECORD:
                rejected.append({"type": type_, "id": id_, "reason": "too_large"})
                bad(type_, id_, "too_large", u)
                continue
            data = dict(data)
            data["id"] = id_
            cur = rec_load(db, type_, id_)
            cur_data = rec_data(ctx, cur) if cur and not php_int(cur["deleted"]) else None
            prev_hash = (jr_tomb_hash(type_, id_, cur["updated_at"]) if php_int(cur["deleted"]) else jr_hash(cur_data)) if cur else None
            if cur:
                lt, rt = ts_ms(cur["updated_at"]), ts_ms(u)
                if rt == lt and not php_int(cur["deleted"]) and same_content(type_, cur_data, data):
                    same += 1
                    jr["n"]["same"] += 1
                    continue
                if rt <= lt:
                    rejected.append({"type": type_, "id": id_, "server_updated_at": cur["updated_at"], "reason": "tie" if rt == lt else "older",
                                     "current": rec_public(ctx, cur)})
                    if rt == lt:
                        jr["n"]["conflicts"] += 1
                    jr_item(jr, type_, id_, "conflict" if rt == lt else "rejected-older", {
                        "code": elvis(rec_code(data), rec_code(cur_data)), "reason": "tie" if rt == lt else "older", "client_updated_at": u,
                        "prev_updated_at": cur["updated_at"], "new_updated_at": cur["updated_at"], "prev_hash": prev_hash, "new_hash": jr_hash(data),
                        "prev": cur_data, "new": data, "extra": {"server_deleted": True} if php_int(cur["deleted"]) else None})
                    continue
            rec_write(ctx, type_, id_, u, False, label, data, device)
            applied += 1
            jr_item(jr, type_, id_, "update" if cur_data is not None else "create", {
                "code": rec_code(data), "reason": "resurrect" if cur and php_int(cur["deleted"]) else "", "client_updated_at": u,
                "prev_updated_at": cur["updated_at"] if cur else None, "new_updated_at": u, "prev_hash": prev_hash, "new_hash": jr_hash(data),
                "prev": cur_data, "new": data})
        for t in php_array_values(pget(b, "tombstones", {})):
            jr["n"]["sent"] += 1
            type_ = pget(t, "type", "")
            id_ = pget(t, "id", "")
            d = php_str(pget(t, "deletedAt", ""))
            if not (isinstance(type_, str) and type_ in DM_TYPES) or not valid_id(id_) or ts_ms(d) <= 0:
                rejected.append({"type": php_str(type_), "id": id_ if isinstance(id_, str) else "", "reason": "invalid"})
                bad(type_, id_, "invalid", d)
                continue
            cur = rec_load(db, type_, id_)
            cur_data = rec_data(ctx, cur) if cur and not php_int(cur["deleted"]) else None
            if cur:
                lt, rt = ts_ms(cur["updated_at"]), ts_ms(d)
                if php_int(cur["deleted"]) and rt <= lt:
                    same += 1
                    jr["n"]["same"] += 1
                    continue
                if not php_int(cur["deleted"]) and rt <= lt:
                    rejected.append({"type": type_, "id": id_, "server_updated_at": cur["updated_at"], "reason": "tie" if rt == lt else "older",
                                     "current": rec_public(ctx, cur)})
                    if rt == lt:
                        jr["n"]["conflicts"] += 1
                    jr_item(jr, type_, id_, "conflict" if rt == lt else "rejected-older", {
                        "code": elvis(rec_code(cur_data), cut_str(pget(t, "code", ""), 100)), "reason": ("tie" if rt == lt else "older") + "_delete",
                        "client_updated_at": d, "prev_updated_at": cur["updated_at"], "new_updated_at": cur["updated_at"], "prev_hash": jr_hash(cur_data),
                        "new_hash": jr_tomb_hash(type_, id_, d), "prev": cur_data, "new": None})
                    continue
            tcode = substr_bytes(php_str(pget(t, "code", "")), 100)
            rec_write(ctx, type_, id_, d, True, substr_bytes(php_str(pget(t, "who", label)), 80), {"code": tcode}, device)
            applied += 1
            jr_item(jr, type_, id_, "delete", {
                "code": elvis(rec_code(cur_data), tcode), "client_updated_at": d, "prev_updated_at": cur["updated_at"] if cur else None, "new_updated_at": d,
                "prev_hash": jr_hash(cur_data) if cur_data is not None else (jr_tomb_hash(type_, id_, cur["updated_at"]) if cur else None),
                "new_hash": jr_tomb_hash(type_, id_, d), "prev": cur_data, "new": None})
        settings_applied = False
        s = pget(b, "settings", None)
        if isinstance(s, dict) and isinstance(pget(s, "data", None), dict) and ts_ms(pget(s, "updated_at", "")) > 0:
            old_row = db.execute("SELECT updated_at, json FROM settings_shared WHERE key = 'subset'").fetchone()
            old = old_row["updated_at"] if old_row else False
            if old is False or ts_ms(s["updated_at"]) > ts_ms(old):
                old_data = jdec(ctx.dec(old_row["json"], "settings/subset")) if old_row else None
                jr_item(jr, "settings", "subset", "update" if old_row else "create", {
                    "client_updated_at": php_str(s["updated_at"]), "prev_updated_at": old if php_truthy(old) else None, "new_updated_at": php_str(s["updated_at"]),
                    "prev_hash": jr_hash(old_data) if is_arr(old_data) else None, "new_hash": jr_hash(s["data"]),
                    "prev": old_data if is_arr(old_data) else None, "new": s["data"]})
                cur = db.execute("INSERT INTO changes (type, id, updated_at, at, device, who) VALUES (?, ?, ?, ?, ?, ?)",
                                 ("settings", "subset", s["updated_at"], now_iso(), device, label))
                seq = int(cur.lastrowid)
                db.execute("INSERT INTO settings_shared (key, json, updated_at, seq) VALUES ('subset', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, seq = excluded.seq",
                           (ctx.enc(jenc(s["data"]), "settings/subset"), php_str(s["updated_at"]), seq))
                settings_applied = True
        for e in php_array_values(pget(b, "activity_log", {}))[:5000]:
            if isinstance(e, dict) and log_insert(ctx, e):
                logged += 1
        jr["n"]["accepted"] = applied
        jr["n"]["rejected"] = len(rejected)
        jr["seq_to"] = max_seq(db)
        for k, v in (("logged", logged), ("settings_applied", settings_applied), ("device_body", device)):
            if k not in jr["extra"]:
                jr["extra"][k] = v
        jid = jr_write(ctx, jr)
        db.execute("COMMIT")
    except BaseException:
        _rollback(db)
        raise
    jr_prune(ctx)
    return {"applied": applied, "same": same, "rejected": rejected, "settings_applied": settings_applied, "logged": logged, "seq": max_seq(db),
            "server_time": now_iso(), "journal_id": jid}


def binder_pack(ctx, row):
    p = rec_public(ctx, row)
    b = p["data"]
    sib = []
    if php_truthy(row["k_cab"]):
        for r in ctx.db.execute("SELECT * FROM records WHERE type = 'binder' AND deleted = 0 AND k_cab = ? AND id <> ? LIMIT 400", (row["k_cab"], row["id"])).fetchall():
            d = rec_data(ctx, r)
            sib.append({"speaking_code": php_str(pget(d, "speaking_code", "")), "shelf_code": php_str(pget(d, "shelf_code", "")),
                        "sector_code": php_str(pget(d, "sector_code", "")), "location_code": php_str(pget(d, "location_code", ""))})
    return {"binder": b, "etag": row["updated_at"], "siblings": sib}


def r_binder(ctx):
    qr = php_trim(php_str(ctx.param("qr", "")))
    code = ascii_upper(php_trim(php_str(ctx.param("code", ""))))
    if qr != "" and not QR_RE.match(qr):
        fail(400, "invalid", "qr")
    if qr == "" and code == "":
        fail(400, "invalid", "qr or code required")
    row = ctx.db.execute("SELECT * FROM records WHERE type = 'binder' AND deleted = 0 AND " + ("k_short" if qr != "" else "k_code") + " = ? ORDER BY updated_at DESC LIMIT 1",
                         (ctx.hidx(qr if qr != "" else code),)).fetchone()
    if not row:
        fail(404, "not_found", "binder not found")
    return binder_pack(ctx, row)


def _brief(r, d):
    return {"id": r["id"], "code": php_str(pget(d, "code", "")), "name": php_str(pget(d, "name", "")), "kind": php_str(pget(d, "kind", "")),
            "seg": php_str(pget(d, "seg", "")), "level": php_int(pget(d, "level", 0))}


def loc_pack(ctx, row):
    db = ctx.db
    p = rec_public(ctx, row)
    l = p["data"]
    path, seen = [], set()
    pid = php_str(pget(l, "parent_id", ""))
    while pid != "" and pid not in seen and len(path) < 16:
        seen.add(pid)
        r = rec_load(db, "location", pid)
        if not r or php_int(r["deleted"]):
            break
        d = rec_data(ctx, r)
        path.insert(0, _brief(r, d))
        pid = php_str(pget(d, "parent_id", ""))
    kids, binders, n = [], [], 0
    for r in db.execute("SELECT * FROM records WHERE type = 'location' AND deleted = 0").fetchall():
        d = rec_data(ctx, r)
        if php_str(pget(d, "parent_id", "")) == row["id"]:
            kids.append(_brief(r, d))
    for r in db.execute("SELECT * FROM records WHERE type = 'binder' AND deleted = 0").fetchall():
        d = rec_data(ctx, r)
        if php_str(pget(d, "location_id", "")) != row["id"]:
            continue
        n += 1
        if len(binders) < 500:
            binders.append({"id": r["id"], "speaking_code": php_str(pget(d, "speaking_code", "")), "company_name": php_str(pget(d, "company_name", "")),
                            "binder_title": php_str(pget(d, "binder_title", "")), "color_hex": php_str(pget(d, "color_hex", "")),
                            "short_code": php_str(pget(d, "short_code", ""))})
    from functools import cmp_to_key
    kids.sort(key=cmp_to_key(lambda a, b: strnatcasecmp(a["seg"], b["seg"])))
    binders.sort(key=cmp_to_key(lambda a, b: strnatcasecmp(a["speaking_code"], b["speaking_code"])))
    return {"location": l, "etag": row["updated_at"], "path": path, "children": kids, "binders": binders, "count": n}


def loc_find(ctx, qr, id_, code):
    db = ctx.db
    if id_ != "":
        if not valid_id(id_):
            fail(400, "invalid", "id")
        r = rec_load(db, "location", id_)
        return r if r and not php_int(r["deleted"]) else None
    return db.execute("SELECT * FROM records WHERE type = 'location' AND deleted = 0 AND " + ("k_short" if qr != "" else "k_code") + " = ? ORDER BY updated_at DESC LIMIT 1",
                      (ctx.hidx(qr if qr != "" else code),)).fetchone()


def r_location(ctx):
    qr = php_trim(php_str(ctx.param("qr", "")))
    id_ = php_trim(php_str(ctx.param("id", "")))
    code = ascii_upper(php_trim(php_str(ctx.param("code", ""))))
    if qr != "" and not QR_RE.match(qr):
        fail(400, "invalid", "qr")
    if qr == "" and id_ == "" and code == "":
        fail(400, "invalid", "qr, id or code required")
    row = loc_find(ctx, qr, id_, code)
    if not row:
        fail(404, "not_found", "location not found")
    return loc_pack(ctx, row)


def r_resolve(ctx):
    qr = php_trim(php_str(ctx.param("qr", "")))
    if not QR_RE.match(qr):
        fail(400, "invalid", "qr")
    if DM_LOC_SC.match(qr):
        row = loc_find(ctx, qr, "", "")
        if not row:
            fail(404, "not_found", "location not found")
        return {"type": "location", **loc_pack(ctx, row)}
    row = ctx.db.execute("SELECT * FROM records WHERE type = 'binder' AND deleted = 0 AND k_short = ? ORDER BY updated_at DESC LIMIT 1", (ctx.hidx(qr),)).fetchone()
    if not row:
        fail(404, "not_found", "binder not found")
    return {"type": "binder", **binder_pack(ctx, row)}


def r_patch(ctx, who):
    db = ctx.db
    b = ctx.body()
    id_ = pget(b, "id", "")
    patch = pget(b, "patch", None)
    if not valid_id(id_) or not isinstance(patch, dict):
        fail(400, "invalid", "id and patch required")
    for k in patch.keys():
        if not (isinstance(k, str) and k in DM_MOBILE_FIELDS):
            fail(422, "field_not_allowed", "field not allowed from mobile", {"field": php_str(k)})
    patch = dict(patch)
    if pget(b, "base_updated_at", None) is not None:
        base = php_str(b["base_updated_at"])
    else:
        base = php_str(ctx.req.server("HTTP_IF_MATCH", "")).strip('"')
    force = not php_empty(pget(b, "force"))
    ci = client_info(ctx)
    label = elvis(substr_bytes(php_trim(php_str(pget(b, "operator", ""))), 80), who["user"])
    jr = jr_new("patch", who, ci, {"operator": label, "base_updated_at": base, "forced": force, "fields": list(patch.keys())})
    jr["n"]["sent"] = 1
    conflict = None
    jid = None
    db.execute("BEGIN IMMEDIATE")
    try:
        row = rec_load(db, "binder", id_)
        if not row or php_int(row["deleted"]):
            fail(404, "not_found", "binder not found")
        prev = rec_data(ctx, row)
        if not force and base != row["updated_at"]:
            cur = binder_pack(ctx, row)
            tried = dict(prev)
            for k, v in patch.items():
                tried[k] = v
            jr["n"]["rejected"] = 1
            jr["n"]["conflicts"] = 1
            jr_item(jr, "binder", id_, "conflict", {"code": rec_code(prev), "reason": "stale_base", "client_updated_at": base, "prev_updated_at": row["updated_at"],
                                                    "new_updated_at": row["updated_at"], "prev_hash": jr_hash(prev), "new_hash": jr_hash(tried), "prev": prev,
                                                    "new": tried, "extra": {"patch": dict(patch)}})
            jr_write(ctx, jr)
            db.execute("COMMIT")
            conflict = {"current": cur["binder"], "current_etag": row["updated_at"]}
        if conflict is None:
            data = dict(prev)
            if "location_id" in patch:
                lid = php_trim(patch["location_id"]) if isinstance(patch["location_id"], str) else ""
                if lid != "":
                    if not valid_id(lid):
                        fail(422, "invalid_location", "location_id")
                    lr = rec_load(db, "location", lid)
                    if not lr or php_int(lr["deleted"]):
                        fail(422, "invalid_location", "location not found", {"location_id": lid})
                    patch["location_code"] = php_str(pget(rec_data(ctx, lr), "code", ""))
                elif "location_code" not in patch or not isinstance(patch["location_code"], str):
                    patch["location_code"] = ""
                patch["location_id"] = lid
            elif "location_code" in patch:
                fail(422, "field_not_allowed", "location_code only together with location_id", {"field": "location_code"})
            for k, v in patch.items():
                data[k] = v
            now = ts_ms(now_iso())
            old = ts_ms(row["updated_at"])
            at = iso_ms(max(now, old + 1))
            if pget(b, "deviceId", None) is not None:
                devsrc = b["deviceId"]
            else:
                devsrc = ci["device_id"] if ci["device_id"] != "unknown" else "mobile"
            rec_write(ctx, "binder", id_, at, False, label, data, substr_bytes(php_str(devsrc), 100))
            jr["n"]["accepted"] = 1
            jr_item(jr, "binder", id_, "update", {"code": rec_code(data), "reason": "forced" if force else "", "client_updated_at": base, "prev_updated_at": row["updated_at"],
                                                  "new_updated_at": at, "prev_hash": jr_hash(prev), "new_hash": jr_hash(data), "prev": prev, "new": data,
                                                  "extra": {"patch": dict(patch)}})
            e = dict(b["log"]) if isinstance(pget(b, "log", None), dict) else {}
            defaults = {"id": os.urandom(16).hex(), "action": "binder.edit", "source": "mobile", "who": label,
                        "target": {"type": "binder", "id": id_, "code": php_str(pget(data, "speaking_code", ""))},
                        "summary": "Modificato da mobile il faldone " + php_str(pget(data, "speaking_code", ""))}
            for k, v in defaults.items():
                if k not in e:
                    e[k] = v
            e["at"] = at
            det = dict(e["details"]) if isinstance(pget(e, "details", None), dict) else {}
            if "patch" not in det:
                det["patch"] = dict(patch)
            e["details"] = det
            det["base_updated_at"] = row["updated_at"]
            det["new_updated_at"] = at
            det["forced"] = force
            det["token_user"] = who["user"]
            log_insert(ctx, e)
            jr["seq_to"] = max_seq(db)
            jid = jr_write(ctx, jr)
            db.execute("COMMIT")
    except BaseException:
        _rollback(db)
        raise
    if conflict is not None:
        fail(409, "conflict", "binder changed meanwhile", conflict)
    row = rec_load(db, "binder", id_)
    p = binder_pack(ctx, row)
    return {"binder": p["binder"], "etag": row["updated_at"], "journal_id": jid, "hash": jr_hash(rec_data(ctx, row))}


def r_journal(ctx, who):
    db = ctx.db
    admin = who["role"] == "admin"
    entry = php_int(ctx.param("entry", 0))
    where, args = [], []
    user = php_trim(php_str(ctx.param("user", ""))) if admin else who["user"]
    if user != "":
        where.append("k_user = ?")
        args.append(ctx.hidx("user/" + ascii_lower(user)))
    if entry > 0:
        where.append("jid = ?")
        args.append(entry)
    else:
        frm = php_trim(php_str(ctx.param("from", "")))
        to = php_trim(php_str(ctx.param("to", "")))
        if DAY_RE.match(to):
            to += "T23:59:59.999Z"
        if frm != "":
            where.append("at >= ?")
            args.append(frm)
        if to != "":
            where.append("at <= ?")
            args.append(to)
        dev = php_trim(php_str(ctx.param("device", "")))
        if dev != "":
            where.append("k_device = ?")
            args.append(ctx.hidx("device/" + dev))
        route = php_trim(php_str(ctx.param("route", "")))
        if route != "":
            where.append("route = ?")
            args.append(route)
        before = php_int(ctx.param("before", 0))
        if before > 0:
            where.append("jid < ?")
            args.append(before)
    rec = php_trim(php_str(ctx.param("record", "")))
    code = ascii_upper(php_trim(php_str(ctx.param("code", ""))))
    iw, ia = [], []
    if rec != "":
        iw.append("id = ?")
        ia.append(rec)
    if code != "":
        iw.append("k_code = ?")
        ia.append(ctx.hidx(code))
    if iw:
        where.append("jid IN (SELECT jid FROM sync_journal_items WHERE " + " AND ".join(iw) + ")")
        args.extend(ia)
    limit = max(1, min(DM_JOURNAL_PAGE_MAX, php_int(ctx.param("limit", DM_JOURNAL_PAGE))))
    rows = db.execute("SELECT * FROM sync_journal" + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY jid DESC LIMIT %d" % (limit + 1), args).fetchall()
    more = len(rows) > limit
    if more:
        rows.pop()
    if entry > 0 and not rows:
        fail(404, "not_found", "journal entry not found")
    items = []
    for r in rows:
        m = jr_meta(ctx, r)
        e = {"jid": php_int(r["jid"]), "at": r["at"], "route": r["route"], "token_id": r["token_id"], "role": r["role"], "user": php_str(pget(m, "user", "")),
             "device": {"id": php_str(pget(m, "device_id", "unknown")), "name": php_str(pget(m, "device_name", "unknown")), "app": php_str(pget(m, "app_version", "unknown"))},
             "operator": php_str(pget(m, "operator", "")), "extra": m.get("extra"),
             "counts": {"sent": php_int(r["n_sent"]), "accepted": php_int(r["n_accepted"]), "rejected": php_int(r["n_rejected"]),
                        "conflicts": php_int(r["n_conflicts"]), "same": php_int(r["n_same"])},
             "items_total": php_int(r["n_items"]), "seq_from": None if r["seq_from"] is None else php_int(r["seq_from"]),
             "seq_to": None if r["seq_to"] is None else php_int(r["seq_to"])}
        if admin:
            e["ip"] = php_str(pget(m, "ip", ""))
        sq = "SELECT * FROM sync_journal_items WHERE jid = ?" + (" AND " + " AND ".join(iw) if iw else "") + " ORDER BY n LIMIT %d" % (20000 if entry > 0 else DM_JOURNAL_ITEMS_LIST)
        e["records"] = []
        for it in db.execute(sq, [php_int(r["jid"])] + ia).fetchall():
            p = jr_payload(ctx, it)
            x = {"n": php_int(it["n"]), "type": it["type"], "id": it["id"], "code": php_str(pget(p, "code", "")), "action": it["action"],
                 "reason": php_str(pget(p, "reason", "")), "client_updated_at": it["client_updated_at"], "prev_updated_at": it["prev_updated_at"],
                 "new_updated_at": it["new_updated_at"], "prev_hash": it["prev_hash"], "new_hash": it["new_hash"]}
            if entry > 0:
                x["prev"] = p.get("prev")
                x["new"] = p.get("new")
                x["extra"] = p.get("extra")
            e["records"].append(x)
        items.append(e)
    return {"items": items, "more": more, "next_before": php_int(rows[-1]["jid"]) if more and rows else None, "server_time": now_iso()}


def r_journal_restore(ctx, who):
    db = ctx.db
    jid = php_int(ctx.param("jid", 0))
    n = php_int(ctx.param("n", 0))
    ver = php_str(ctx.param("version", "prev"))
    if jid <= 0 or n <= 0 or ver not in ("prev", "new"):
        fail(422, "invalid", "jid, n and version prev|new required")
    db.execute("BEGIN IMMEDIATE")
    try:
        it = db.execute("SELECT * FROM sync_journal_items WHERE jid = ? AND n = ?", (jid, n)).fetchone()
        if not it:
            fail(404, "not_found", "journal item not found")
        type_, id_ = it["type"], it["id"]
        if type_ not in DM_TYPES or not valid_id(id_):
            fail(422, "invalid", "this item cannot be restored (type " + php_str(type_) + ")")
        p = jr_payload(ctx, it)
        data = p.get(ver)
        if data is not None and not is_arr(data):
            fail(422, "invalid", "no stored version")
        if data is None and it["action"] in ("pull", "pull-delete", "rejected-invalid"):
            fail(422, "invalid", "this item holds no version to restore")
        cur = rec_load(db, type_, id_)
        cur_data = rec_data(ctx, cur) if cur and not php_int(cur["deleted"]) else None
        at = iso_ms(max(ts_ms(now_iso()), ts_ms(cur["updated_at"]) + 1 if cur else 0))
        code = elvis(rec_code(data), rec_code(cur_data), php_str(pget(p, "code", "")))
        ci = client_info(ctx)
        jr = jr_new("journal_restore", who, ci, {"source": {"jid": jid, "n": n, "version": ver}})
        jr["n"]["sent"] = 1
        jr["n"]["accepted"] = 1
        if data is not None:
            data = dict(data) if isinstance(data, dict) else {i: x for i, x in enumerate(data)}
            data["id"] = id_
            data.pop("updated_at", None)
            rec_write(ctx, type_, id_, at, False, who["user"], data, ci["device_id"])
        else:
            rec_write(ctx, type_, id_, at, True, who["user"], {"code": code}, ci["device_id"])
        jr_item(jr, type_, id_, "restore", {"code": code, "reason": "journal %d/%d %s" % (jid, n, ver), "prev_updated_at": cur["updated_at"] if cur else None,
                                            "new_updated_at": at,
                                            "prev_hash": jr_hash(cur_data) if cur_data is not None else (jr_tomb_hash(type_, id_, cur["updated_at"]) if cur else None),
                                            "new_hash": jr_hash(data) if data is not None else jr_tomb_hash(type_, id_, at), "prev": cur_data, "new": data})
        jr["seq_to"] = max_seq(db)
        new_jid = jr_write(ctx, jr)
        log_insert(ctx, {"id": os.urandom(16).hex(), "at": at, "who": who["user"], "action": "sync.restore", "source": "sync",
                         "target": {"type": type_, "id": id_, "code": code},
                         "summary": "Ripristinata dal registro sincronizzazioni una versione di " + (code if code != "" else id_) + " (voce %d/%d)" % (jid, n),
                         "details": {"journal_id": jid, "n": n, "version": ver, "new_journal_id": new_jid, "new_updated_at": at, "deleted": data is None}})
        db.execute("COMMIT")
    except BaseException:
        _rollback(db)
        raise
    return {"ok": True, "type": type_, "id": id_, "updated_at": at, "deleted": data is None, "journal_id": new_jid, "seq": max_seq(db)}


def r_tokens(ctx):
    items = []
    tokens = ctx.c["tokens"]
    pairs = tokens.items() if isinstance(tokens, dict) else enumerate(php_array_values(tokens))
    for i, t in pairs:
        if isinstance(t, dict):
            items.append({"id": "cfg:" + str(i), "user": php_str(pget(t, "user", "")), "role": php_str(pget(t, "role", "")), "source": "config",
                          "revoked_at": "config" if not php_empty(t.get("disabled")) else None})
    for r in ctx.db.execute("SELECT id, user, role, created_at, created_by, revoked_at FROM tokens ORDER BY created_at").fetchall():
        items.append({"id": "db:" + php_str(r["id"]), "user": r["user"], "role": r["role"], "source": "database", "created_at": r["created_at"],
                      "created_by": r["created_by"], "revoked_at": r["revoked_at"]})
    return {"items": items}


def valid_user_name(user: str) -> bool:
    """/^[\\p{L}\\p{N} ._@-]{1,60}$/u"""
    import unicodedata
    if not (1 <= len(user) <= 60) and not (len(user) == 61 and user.endswith("\n")):
        return False
    if user.endswith("\n"):
        user = user[:-1]
        if not user:
            return False
    try:
        user.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return all(ch in " ._@-" or unicodedata.category(ch)[0] in "LN" for ch in user)


def r_token_create(ctx, who):
    user = php_trim(php_str(ctx.param("user", "")))
    role = php_str(ctx.param("role", "editor"))
    if not valid_user_name(user) or role not in DM_ROLES:
        fail(422, "invalid", "user (1-60 chars) and role viewer|editor|admin required")
    tok = base64.b64encode(os.urandom(24)).decode("ascii").translate(str.maketrans("+/", "-_")).rstrip("=")
    id_ = os.urandom(8).hex()
    ctx.db.execute("INSERT INTO tokens (id, token_sha256, user, role, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
                   (id_, hashlib.sha256(tok.encode("ascii")).hexdigest(), user, role, now_iso(), who["user"]))
    return {"id": "db:" + id_, "user": user, "role": role, "token": tok}


def r_token_revoke(ctx):
    id_ = php_str(ctx.param("id", ""))
    m = REVOKE_RE.match(id_)
    if not m:
        fail(422, "invalid", 'only database tokens (db:…) can be revoked here; config tokens: set "disabled" => true in config.php')
    cur = ctx.db.execute("UPDATE tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", (now_iso(), m.group(1)))
    if not cur.rowcount:
        fail(404, "not_found", "token not found")
    return {"ok": True}


# ---------------------------------------------------------------- dispatch
READS = {"me": "viewer", "pull": "viewer", "binder": "viewer", "location": "viewer", "resolve": "viewer", "tokens": "admin", "journal": "editor"}
WRITES = {"push": "editor", "patch": "editor", "token_create": "admin", "token_revoke": "admin", "journal_restore": "admin"}


def handle(req: Request, config_path: str) -> Response:
    """The dispatcher at the bottom of api.php."""
    ctx = Ctx(req, config_path)
    try:
        try:
            route = php_str(req.get.get("r", ""))
            method = req.method or "GET"
            if route == "ping":
                try:
                    cors(ctx, ctx.load_config())
                except Exception:   # noqa: BLE001
                    pass
                if method == "OPTIONS":
                    return ctx.empty(204)
                return ctx.out(200, r_ping())
            c = ctx.load_config()
            cors(ctx, c)
            if method == "OPTIONS":
                return ctx.empty(204)
            if route not in READS and route not in WRITES:
                fail(404, "no_route", "unknown route")
            if route in WRITES and method != "POST":
                fail(405, "method", "use POST")
            if method not in ("GET", "POST"):
                fail(405, "method", "use GET or POST")
            db = open_db(ctx)
            who = auth(ctx, READS.get(route) or WRITES[route])
            if route in WRITES and licence.current_mode() != "full":
                fail(403, "licence_read_only", licence.READ_ONLY_MESSAGE)
            etag = False
            if route == "me":
                res = {"user": who["user"], "role": who["role"], "token_id": who["token_id"], "studio_name": php_str(c["studio_name"]), "server_time": now_iso()}
            elif route == "pull":
                res = r_pull(ctx, who)
            elif route == "push":
                res = r_push(ctx, who)
            elif route == "binder":
                res = r_binder(ctx)
                etag = True
            elif route == "location":
                res = r_location(ctx)
                etag = True
            elif route == "resolve":
                res = r_resolve(ctx)
            elif route == "patch":
                res = r_patch(ctx, who)
                etag = True
            elif route == "tokens":
                res = r_tokens(ctx)
            elif route == "token_create":
                res = r_token_create(ctx, who)
            elif route == "journal":
                res = r_journal(ctx, who)
            elif route == "journal_restore":
                res = r_journal_restore(ctx, who)
            else:
                res = r_token_revoke(ctx)
            if etag:
                ctx.header("ETag", '"' + php_str(res["etag"]) + '"')
            del db
            return ctx.out(200, res)
        except ApiError as e:
            err = {"code": e.code_name, "message": e.message}
            for k, v in e.extra.items():
                err[k] = v
            body = {"error": err}
            for k, v in e.extra.items():
                if k in ("current", "current_etag"):
                    body[k] = v
            return ctx.out(e.status, body, e.headers)
        except Exception as e:   # noqa: BLE001
            log.error("docmap api: %s: %s", type(e).__name__, e, exc_info=not isinstance(e, PhpWarning))
            return ctx.out(500, {"error": {"code": "server_error", "message": "internal error (details in the PHP error log)"}})
    finally:
        if ctx.db is not None:
            try:
                ctx.db.close()
            except Exception:   # noqa: BLE001
                pass
