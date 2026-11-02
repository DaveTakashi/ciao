#!/usr/bin/env python3
"""Tests of the server-to-server bridge `python -m docmap_server sync-remote` (docmap_server/sync_remote.py).

  python3 docmapv1/server-python/tests/test_sync_remote.py        (stdlib unittest; needs php 8 + pdo_sqlite and the server's requirements)

Real servers: the PHP `server-php/api.php` under `php -S … tests/php-router.php` (as diff_test.py does) and the Python
port, each with its OWN data folder, AES key and tokens, seeded with different data (binders, clients, locations,
archives, status events, tombstones, settings, activity log). The bridge runs as a subprocess, exactly as a scheduled
task would. "Identical" = pull?since=0 of both sides gives the same set of (type, id) → (ts, canonical content hash).
"""
import base64
import hashlib
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
PYROOT = os.path.dirname(HERE)
DOCMAP = os.path.dirname(PYROOT)
SRV_PHP = os.path.join(DOCMAP, "server-php")
ROUTER = os.path.join(DOCMAP, "tests", "php-router.php")
PHP_API = "/studio-de/server-php/api.php"
sys.path.insert(0, PYROOT)

from docmap_server.sync_remote import content_hash  # noqa: E402

T0 = datetime.now(timezone.utc) - timedelta(days=2)


def iso(sec):
    """A fixed instant T0 + sec seconds (ms precision), so both sides can be given exactly the same time."""
    return (T0 + timedelta(seconds=sec)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


NOPROXY = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class Srv:
    def __init__(self, work, name, kind):
        self.name, self.kind = name, kind
        self.dir = os.path.join(work, name)
        self.data = os.path.join(self.dir, "data")
        os.makedirs(self.data)
        self.key = os.urandom(32)
        self.tok = {"admin": "adm-%s-%s" % (name, os.urandom(8).hex()), "editor": "ed-%s-%s" % (name, os.urandom(8).hex()),
                    "viewer": "vw-%s-%s" % (name, os.urandom(8).hex())}
        self.port = free_port()
        self.log = open(os.path.join(self.dir, "server.log"), "ab")
        self.licence_required = False
        if kind == "php":
            self.root = os.path.join(self.dir, "root")
            sp = os.path.join(self.root, "studio-de", "server-php")
            os.makedirs(os.path.join(sp, "data"))
            shutil.copy(os.path.join(SRV_PHP, "api.php"), sp)
            shutil.copy(os.path.join(SRV_PHP, ".htaccess"), sp)
            self.config = os.path.join(sp, "config.php")
            self.api = PHP_API
        else:
            self.config = os.path.join(self.dir, "config.json")
            self.api = "/api"
        self.write_config()
        self.start()

    def write_config(self, licence_required=False):
        toks = [{"user": "u" + r, "role": r, "token_sha256": hashlib.sha256(t.encode()).hexdigest()} for r, t in self.tok.items()]
        if self.kind == "php":
            body = ", ".join("['user' => '%s', 'role' => '%s', 'token_sha256' => '%s']" % (t["user"], t["role"], t["token_sha256"]) for t in toks)
            txt = ("<?php\nif (!defined('DOCMAP_API')) { http_response_code(404); exit; }\nreturn ['data_dir' => %s, 'aes_key' => '%s',\n"
                   "  'tokens' => [%s], 'allowed_origins' => ['null'], 'max_fails' => 1000, 'lock_seconds' => 1, 'max_body_mb' => 20,\n"
                   "  'studio_name' => 'Web %s'];\n") % (json.dumps(self.data), base64.b64encode(self.key).decode(), body, self.name)
        else:
            cfg = {"data_dir": self.data, "aes_key": base64.b64encode(self.key).decode(), "tokens": toks, "allowed_origins": ["null"],
                   "max_fails": 1000, "lock_seconds": 1, "max_body_mb": 20, "studio_name": "Studio " + self.name}
            if licence_required:
                cfg["licence_required"] = True
                cfg["licence_public_keys"] = {}          # TESTS ONLY: no trusted key and no licence file → read_only
            txt = json.dumps(cfg)
        with open(self.config, "w", encoding="utf-8") as f:
            f.write(txt)
        t = time.time() + 10 + Srv._bump
        Srv._bump += 10
        os.utime(self.config, (t, t))

    _bump = 0

    def start(self):
        if self.kind == "php":
            cmd = ["php", "-S", "127.0.0.1:%d" % self.port, "-t", self.root, ROUTER]
        else:
            cmd = [sys.executable, "-m", "docmap_server", "serve", "--config", self.config, "--port", str(self.port), "--log-level", "warning"]
        self.proc = subprocess.Popen(cmd, cwd=PYROOT, stdout=self.log, stderr=self.log)
        for _ in range(150):
            try:
                NOPROXY.open(self.url_of("ping"), timeout=2).read()
                return
            except Exception:   # noqa: BLE001
                time.sleep(0.1)
        raise RuntimeError(self.name + " did not start")

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        self.log.close()

    @property
    def base(self):
        return "http://127.0.0.1:%d%s" % (self.port, self.api)

    def url_of(self, route, **q):
        return self.base + "?r=" + route + "".join("&%s=%s" % kv for kv in q.items())

    def call(self, route, body=None, role="editor", **q):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.url_of(route, **q), data=data, method="POST" if data is not None else "GET")
        req.add_header("X-DocMap-Token", self.tok[role])
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with NOPROXY.open(req, timeout=20) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"null")

    def push(self, records=(), tombstones=(), settings=None, log=()):
        s, b = self.call("push", {"records": list(records), "tombstones": list(tombstones), "settings": settings,
                                  "activity_log": list(log), "deviceId": "dev-test", "operator": "Test"})
        assert s == 200, b
        return b

    def snapshot(self):
        """(type/id) → [ts or 'del:'+deletedAt, content hash], plus settings and log ids, from a full pull."""
        out, since, settings = {}, 0, None
        while True:
            s, b = self.call("pull", role="viewer", since=since, log_since=999999999999)
            assert s == 200, b
            for r in b["records"]:
                out[r["type"] + "/" + r["id"]] = [r["updated_at"], content_hash(r["type"], r["data"])]
            for t in b["tombstones"]:
                out[t["type"] + "/" + t["id"]] = ["del:" + t["deletedAt"], "deleted"]
            settings = b["settings"] or settings
            since = b["seq"]
            if not b["more"]:
                break
        logs, ls = set(), 0
        while True:
            s, b = self.call("pull", role="viewer", since=since, log_since=ls)
            ids = [e["id"] for e in b["activity_log"]]
            logs.update(ids)
            if len(ids) < 1000:
                break
            ls = b["log_seq"]
        return {"items": out, "settings": settings and [settings["updated_at"], content_hash("settings", settings["data"])], "log": logs}

    def dbhash(self):
        """Hash of the DATA tables (records, changes, settings, activity log, tokens): what a sync could change.
        sync_journal / access_log are left out on purpose: every pull is journaled by the server, also in a dry run."""
        con = sqlite3.connect("file:%s?mode=ro" % os.path.join(self.data, "docmap.sqlite"), uri=True)
        h = hashlib.sha256()
        for t, order in (("records", "type, id"), ("changes", "seq"), ("settings_shared", "key"), ("activity_log", "seq"), ("tokens", "id")):
            try:
                for row in con.execute("SELECT * FROM %s ORDER BY %s" % (t, order)):
                    h.update(repr(row).encode())
            except sqlite3.OperationalError:
                pass
        con.close()
        return h.hexdigest()


def rec(type_, id_, sec, **data):
    d = {"id": id_}
    d.update(data)
    return {"type": type_, "id": id_, "updated_at": iso(sec), "data": d}


def tomb(type_, id_, sec, code=""):
    return {"type": type_, "id": id_, "code": code, "deletedAt": iso(sec), "who": "Test"}


def logentry(id_, sec, action="binder.edit"):
    return {"id": id_, "at": iso(sec), "who": "Test", "action": action, "source": "test", "summary": "voce " + id_}


def seed_a(s):
    s.push(records=[rec("archive", "ar-a1", 10, name="Storico web", levels=[]),
                    rec("location", "lo-a1", 11, code="A1", name="Armadio web", kind="cabinet", parent_id="", seg="A1", level=0),
                    rec("client", "cl-a1", 12, name="Cliente Web Srl"),
                    rec("binder", "b-a1", 13, speaking_code="BA1", binder_title="Faldone web 1", location_id="lo-a1", archive_id="ar-a1"),
                    rec("binder", "b-a2", 14, speaking_code="BA2", binder_title="Faldone web 2"),
                    rec("binder", "b-a-gone", 15, speaking_code="BAX", binder_title="Da eliminare"),
                    rec("status_event", "se-a1", 16, at=iso(16), target_type="binder", target_id="b-a1", status="OUT")],
           settings={"updated_at": iso(20), "data": {"studioName": "Studio Web", "destTemplate": "x"}},
           log=[logentry("lg-a1", 13), logentry("lg-a2", 14)])
    s.push(tombstones=[tomb("binder", "b-a-gone", 30, "BAX")])


def seed_b(s):
    s.push(records=[rec("location", "lo-b1", 40, code="B1", name="Armadio studio", kind="cabinet", parent_id="", seg="B1", level=0),
                    rec("client", "cl-b1", 41, name="Cliente Studio Spa"),
                    rec("binder", "b-b1", 42, speaking_code="BB1", binder_title="Faldone studio 1", location_id="lo-b1"),
                    rec("binder", "b-b2", 43, speaking_code="BB2", binder_title="Faldone studio 2"),
                    rec("status_event", "se-b1", 44, at=iso(44), target_type="binder", target_id="b-b1", status="IN")],
           tombstones=[tomb("binder", "b-b-old", 45, "BBOLD")],
           log=[logentry("lg-b1", 42)])


class Base(unittest.TestCase):
    kinds = ("php", "py")

    def setUp(self):
        self.work = tempfile.mkdtemp(prefix="docmap-bridge-")
        self.A = Srv(self.work, "A" + self.kinds[0], self.kinds[0])
        self.B = Srv(self.work, "B" + self.kinds[1], self.kinds[1])
        self.prof = os.path.join(self.work, "bridge", "sync-profile.json")
        os.makedirs(os.path.dirname(self.prof))
        self.write_profile()

    def tearDown(self):
        self.A.stop()
        self.B.stop()
        trash = os.path.join(PYROOT, "_trash")
        os.makedirs(trash, exist_ok=True)
        shutil.move(self.work, os.path.join(trash, "test-bridge-" + os.path.basename(self.work)))

    def write_profile(self, **over):
        p = {"name": "Prova", "a": {"label": "Web", "url": self.A.base + "?r=", "token": self.A.tok["editor"]},
             "b": {"label": "Studio", "url": self.B.base, "token_env": "TEST_B_TOKEN"}, "direction": "both"}
        for k, v in over.items():
            if k in ("a", "b"):
                p[k].update(v)
            else:
                p[k] = v
        with open(self.prof, "w", encoding="utf-8") as f:
            json.dump(p, f)

    def bridge(self, *args, env=None):
        e = dict(os.environ, TEST_B_TOKEN=self.B.tok["editor"], PYTHONDONTWRITEBYTECODE="1")
        e.update(env or {})
        r = subprocess.run([sys.executable, "-m", "docmap_server", "sync-remote", self.prof, "--json"] + list(args),
                           cwd=PYROOT, env=e, capture_output=True, text=True, timeout=120)
        try:
            rep = json.loads(r.stdout)
        except ValueError:
            rep = None
        return r.returncode, rep, r

    def assertConverged(self):
        sa, sb = self.A.snapshot(), self.B.snapshot()
        self.assertEqual(sa["items"], sb["items"])
        self.assertEqual(sa["settings"], sb["settings"])
        self.assertEqual(sa["log"], sb["log"])
        return sa

    def applied(self, rep):
        return rep["result"]["a_to_b"]["applied"] + rep["result"]["b_to_a"]["applied"]


class PhpPython(Base):
    def test_01_dry_run_changes_nothing(self):
        seed_a(self.A)
        seed_b(self.B)
        ha, hb = self.A.dbhash(), self.B.dbhash()
        code, rep, r = self.bridge("--dry-run")
        self.assertEqual(code, 0, r.stdout + r.stderr)
        self.assertTrue(rep["dry_run"])
        p = rep["plan"]["a_to_b"]["types"]
        self.assertEqual(p["binder"], {"records": 2, "tombstones": 1})
        self.assertEqual(p["archive"]["records"], 1)
        self.assertEqual(p["location"]["records"], 1)
        self.assertEqual(p["client"]["records"], 1)
        self.assertEqual(p["status_event"]["records"], 1)
        self.assertTrue(rep["plan"]["a_to_b"]["settings"])
        self.assertEqual(rep["plan"]["a_to_b"]["log"], 2)
        q = rep["plan"]["b_to_a"]["types"]
        self.assertEqual(q["binder"], {"records": 2, "tombstones": 1})
        self.assertEqual(rep["plan"]["b_to_a"]["log"], 1)
        self.assertTrue(any("ENTRAMBI" in w for w in rep["warnings"]), rep["warnings"])
        self.assertEqual((self.A.dbhash(), self.B.dbhash()), (ha, hb))
        self.assertFalse(os.path.exists(self.prof[:-5] + ".state.json"))
        # Italian summary works too
        r2 = subprocess.run([sys.executable, "-m", "docmap_server", "sync-remote", self.prof, "--dry-run"], cwd=PYROOT,
                            env=dict(os.environ, TEST_B_TOKEN=self.B.tok["editor"]), capture_output=True, text=True)
        self.assertIn("PROVA: nessuna modifica", r2.stdout)
        self.assertIn("Da inviare Web → Studio", r2.stdout)
        self.assertEqual((self.A.dbhash(), self.B.dbhash()), (ha, hb))

    def test_02_converge_then_idempotent(self):
        seed_a(self.A)
        seed_b(self.B)
        code, rep, r = self.bridge()
        self.assertEqual(code, 0, r.stdout + r.stderr)
        self.assertEqual(rep["result"]["a_to_b"]["applied"], 7)     # 6 records + 1 tombstone
        snap = self.assertConverged()
        self.assertEqual(len(snap["items"]), 13)
        self.assertEqual(snap["items"]["binder/b-a-gone"][1], "deleted")
        self.assertEqual(snap["log"], {"lg-a1", "lg-a2", "lg-b1"})
        ha, hb = self.A.dbhash(), self.B.dbhash()
        code, rep, r = self.bridge()
        self.assertEqual(code, 0, r.stdout)
        self.assertEqual(self.applied(rep), 0)
        self.assertEqual(rep["plan"]["a_to_b"]["types"], {})
        self.assertEqual(rep["plan"]["b_to_a"]["types"], {})
        self.assertEqual((rep["plan"]["a_to_b"]["log"], rep["plan"]["b_to_a"]["log"]), (0, 0))
        self.assertEqual((self.A.dbhash(), self.B.dbhash()), (ha, hb))
        # local journal: one start + one end line per run
        logs = os.listdir(os.path.join(self.work, "bridge", "sync-log"))
        with open(os.path.join(self.work, "bridge", "sync-log", logs[0]), encoding="utf-8") as f:
            ev = [json.loads(x)["event"] for x in f]
        self.assertEqual(ev, ["start", "end", "start", "end"])
        # server journals show the bridge as the device
        s, b = self.B.call("journal", role="admin")
        self.assertTrue(any((it.get("device") or {}).get("name") == "bridge Prova" and it["route"] == "push" for it in b["items"]), b)

    def test_03_direction_only(self):
        seed_a(self.A)
        seed_b(self.B)
        ha = self.A.dbhash()
        code, rep, r = self.bridge("--direction", "a-to-b")
        self.assertEqual(code, 0, r.stdout)
        self.assertEqual(self.A.dbhash(), ha)                   # nothing written on A
        sa, sb = self.A.snapshot(), self.B.snapshot()
        for k, v in sa["items"].items():
            self.assertEqual(sb["items"][k], v, k)
        self.assertNotIn("binder/b-b1", sa["items"])
        hb = self.B.dbhash()
        code, rep, r = self.bridge("--direction", "b-to-a")
        self.assertEqual(code, 0, r.stdout)
        self.assertEqual(self.B.dbhash(), hb)                   # nothing written on B
        self.assertConverged()
        code, rep, r = self.bridge()
        self.assertEqual((code, self.applied(rep)), (0, 0))

    def test_04_deletions_and_concurrent_edits(self):
        seed_a(self.A)
        seed_b(self.B)
        self.assertEqual(self.bridge()[0], 0)
        # deletion on B propagates to A; edit on A newer than edit on B wins on both; B newer wins on both
        self.B.push(tombstones=[tomb("binder", "b-a2", 100, "BA2")])
        self.A.push(records=[rec("binder", "b-b1", 110, speaking_code="BB1", binder_title="modificato sul web (più recente)", location_id="lo-b1")])
        self.B.push(records=[rec("binder", "b-b1", 105, speaking_code="BB1", binder_title="modificato in studio (più vecchio)", location_id="lo-b1")])
        self.A.push(records=[rec("client", "cl-b1", 120, name="Cliente web vecchio")])
        self.B.push(records=[rec("client", "cl-b1", 125, name="Cliente studio nuovo")])
        code, rep, r = self.bridge()
        self.assertEqual(code, 0, r.stdout)
        snap = self.assertConverged()
        self.assertEqual(snap["items"]["binder/b-a2"][1], "deleted")
        s, b = self.B.call("binder", code="BB1")
        self.assertEqual(b["binder"]["binder_title"], "modificato sul web (più recente)")
        self.assertEqual(snap["items"]["client/cl-b1"][0], iso(125))

    def test_05_exact_tie_is_conflict(self):
        seed_a(self.A)
        seed_b(self.B)
        self.assertEqual(self.bridge()[0], 0)
        self.A.push(records=[rec("binder", "b-a1", 200, speaking_code="BA1", binder_title="versione WEB")])
        self.B.push(records=[rec("binder", "b-a1", 200, speaking_code="BA1", binder_title="versione STUDIO")])
        self.A.push(records=[rec("binder", "b-b2", 201, speaking_code="BB2", binder_title="altra modifica")])   # non-conflicting
        ha_tie = self.A.snapshot()["items"]["binder/b-a1"]
        hb_tie = self.B.snapshot()["items"]["binder/b-a1"]
        code, rep, r = self.bridge("--dry-run")
        self.assertEqual(code, 1, r.stdout)
        self.assertEqual([c["id"] for c in rep["conflicts"]], ["b-a1"])
        code, rep, r = self.bridge()
        self.assertEqual(code, 1, r.stdout)
        self.assertEqual([(c["id"], c["reason"], c["code"]) for c in rep["conflicts"]], [("b-a1", "tie", "BA1")])
        self.assertEqual(rep["result"]["a_to_b"]["applied"], 1)
        sa, sb = self.A.snapshot(), self.B.snapshot()
        self.assertEqual(sa["items"]["binder/b-a1"], ha_tie)
        self.assertEqual(sb["items"]["binder/b-a1"], hb_tie)
        self.assertNotEqual(ha_tie, hb_tie)
        self.assertEqual(sa["items"]["binder/b-b2"], sb["items"]["binder/b-b2"])
        # still open on the next run (exit 1, nothing applied); resolved by saving it again on one side
        code, rep, r = self.bridge()
        self.assertEqual((code, self.applied(rep), len(rep["open_conflicts"])), (1, 0, 1))
        self.A.push(records=[rec("binder", "b-a1", 300, speaking_code="BA1", binder_title="versione WEB decisa")])
        code, rep, r = self.bridge()
        self.assertEqual((code, rep["open_conflicts"]), (0, []), r.stdout)
        self.assertConverged()

    def test_06_interrupted_then_resume(self):
        many = [rec("binder", "b-many-%03d" % i, 500 + i, speaking_code="M%03d" % i, binder_title="faldone %d" % i) for i in range(25)]
        self.A.push(records=many)
        seed_b(self.B)
        self.write_profile(batch_records=5)
        code, rep, r = self.bridge(env={"DOCMAP_SYNC_TEST_EXIT_AFTER_PUSHES": "1"})
        self.assertEqual(code, 9, r.stdout + r.stderr)          # crashed right after the first push batch
        self.assertEqual(sum(1 for k in self.B.snapshot()["items"] if k.startswith("binder/b-many")), 5)
        code, rep, r = self.bridge()
        self.assertEqual(code, 0, r.stdout + r.stderr)         # the lock of the crashed run was taken over
        self.assertEqual(rep["result"]["a_to_b"]["applied"], 20)
        self.assertConverged()
        code, rep, r = self.bridge()
        self.assertEqual((code, self.applied(rep)), (0, 0))
        with open(os.path.join(self.work, "bridge", "sync-log", os.listdir(os.path.join(self.work, "bridge", "sync-log"))[0]), encoding="utf-8") as f:
            ev = [json.loads(x)["event"] for x in f]
        self.assertEqual(ev, ["start", "start", "end", "start", "end"])   # the interrupted run has no "end"

    def test_07_errors_exit_2(self):
        seed_a(self.A)
        self.write_profile(a={"token": "sbagliato"})
        code, rep, r = self.bridge()
        self.assertEqual(code, 2)
        self.assertIn("ha rifiutato il token", " ".join(rep["errors"]))
        self.write_profile(a={"token": self.A.tok["editor"]}, b={"url": "http://127.0.0.1:%d/api" % free_port()})
        code, rep, r = self.bridge()
        self.assertEqual(code, 2)
        self.assertIn("non risponde", " ".join(rep["errors"]))
        self.write_profile(b={"url": self.B.base, "token_env": "NESSUNA_VARIABILE"})
        code, rep, r = self.bridge()
        self.assertEqual(code, 2)
        self.assertIn("Manca il token", " ".join(rep["errors"]))
        # viewer token cannot write
        self.write_profile(b={"token_env": "TEST_B_VIEWER"})
        code, rep, r = self.bridge(env={"TEST_B_VIEWER": self.B.tok["viewer"]})
        self.assertEqual(code, 2)
        self.assertIn("non può scrivere", " ".join(rep["errors"]))
        # a viewer token is fine when that side only gives data
        code, rep, r = self.bridge("--direction", "b-to-a", env={"TEST_B_VIEWER": self.B.tok["viewer"]})
        self.assertEqual(code, 0, r.stdout)
        # http:// to a public host is refused (token in clear)
        self.write_profile(a={"url": "http://docmap.example.com/api"})
        code, rep, r = self.bridge()
        self.assertEqual(code, 2)
        self.assertIn("http://", " ".join(rep["errors"]))


class PythonPython(Base):
    kinds = ("py", "py")

    def test_python_python(self):
        seed_a(self.A)
        seed_b(self.B)
        code, rep, r = self.bridge()
        self.assertEqual(code, 0, r.stdout + r.stderr)
        self.assertConverged()
        self.A.push(tombstones=[tomb("location", "lo-b1", 600, "B1")])
        code, rep, r = self.bridge()
        self.assertEqual((code, rep["result"]["a_to_b"]["applied"], rep["result"]["b_to_a"]["applied"]), (0, 1, 0))
        snap = self.assertConverged()
        self.assertEqual(snap["items"]["location/lo-b1"][1], "deleted")
        code, rep, r = self.bridge()
        self.assertEqual((code, self.applied(rep)), (0, 0))

    def test_licence_read_only_side(self):
        seed_a(self.A)
        seed_b(self.B)
        self.B.write_config(licence_required=True)           # B: licence required, none installed → read_only
        hb = self.B.dbhash()
        code, rep, r = self.bridge()
        self.assertEqual(code, 1, r.stdout + r.stderr)
        self.assertEqual(rep["read_only_sides"], ["Studio"])
        self.assertEqual(self.B.dbhash(), hb)                 # nothing pushed to B
        self.assertEqual(rep["result"]["a_to_b"]["applied"], 0)
        self.assertEqual(rep["result"]["b_to_a"]["applied"], 6)     # still pulled from B and pushed to A
        self.assertIn("binder/b-b1", self.A.snapshot()["items"])
        # licence back: the pending A → B changes go now (A's cursor did not move)
        self.B.write_config(licence_required=False)
        code, rep, r = self.bridge()
        self.assertEqual(code, 0, r.stdout)
        self.assertConverged()


class TlsStudioCa(unittest.TestCase):
    """Side B as installed in a studio: HTTPS with the certificate of the studio CA made by installer-windows/docmap_tools.py
    (same function the installer uses). The bridge must accept it with "ca" = DocMap-CA-studio.crt, refuse it without,
    and accept "insecure_lan" only for a LAN address."""

    def test_https_with_studio_ca(self):
        sys.dont_write_bytecode = True                      # never write __pycache__ into installer-windows (another team's folder)
        sys.path.insert(0, os.path.join(DOCMAP, "installer-windows"))
        import docmap_tools                                 # noqa: E402
        work = tempfile.mkdtemp(prefix="docmap-bridge-tls-")
        A = Srv(work, "Aphp", "php")
        B = Srv(work, "Bpy", "py")
        B.stop()                                            # restart B with TLS on the same config
        certs = os.path.join(work, "certificati")
        c = docmap_tools.ensure_certificates(certs, "Studio Prova", "pc-studio", ["127.0.0.1"])
        B.log = open(os.path.join(B.dir, "server-tls.log"), "ab")
        code = ("import uvicorn; from docmap_server.web import create_app; "
                "uvicorn.run(create_app(%r, None, ['/api']), host='127.0.0.1', port=%d, ssl_certfile=%r, ssl_keyfile=%r, log_level='warning')"
                % (B.config, B.port, c["cert"], c["key"]))
        B.proc = subprocess.Popen([sys.executable, "-c", code], cwd=PYROOT, stdout=B.log, stderr=B.log)
        ca = os.path.join(certs, "DocMap-CA-studio.crt")
        try:
            import ssl
            ctx = ssl.create_default_context(cafile=ca)
            op = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx))
            for _ in range(150):
                try:
                    op.open("https://127.0.0.1:%d/api?r=ping" % B.port, timeout=2).read()
                    break
                except Exception:   # noqa: BLE001
                    time.sleep(0.1)
            seed_a(A)
            prof = os.path.join(work, "p.json")

            def run(bcfg):
                with open(prof, "w", encoding="utf-8") as f:
                    json.dump({"name": "TLS", "a": {"label": "Web", "url": A.base, "token": A.tok["editor"]},
                               "b": dict({"label": "Studio", "url": "https://127.0.0.1:%d/api" % B.port, "token": B.tok["editor"]}, **bcfg)}, f)
                r = subprocess.run([sys.executable, "-m", "docmap_server", "sync-remote", prof, "--json"], cwd=PYROOT, capture_output=True, text=True)
                return r.returncode, json.loads(r.stdout)

            code1, rep = run({})                            # no CA → refused, clear message
            self.assertEqual(code1, 2)
            self.assertIn("certificato", " ".join(rep["errors"]))
            code1, rep = run({"ca": ca})
            self.assertEqual(code1, 0, rep)
            self.assertEqual(rep["result"]["a_to_b"]["applied"], 7)
            code1, rep = run({"insecure_lan": True})        # allowed on 127.0.0.1
            self.assertEqual((code1, rep["result"]["a_to_b"]["applied"]), (0, 0))
            with open(prof, "w", encoding="utf-8") as f:
                json.dump({"a": {"url": "https://docmap.example.com/api", "token": "x", "insecure_lan": True}, "b": {"url": "https://127.0.0.1/api", "token": "y"}}, f)
            r = subprocess.run([sys.executable, "-m", "docmap_server", "sync-remote", prof], cwd=PYROOT, capture_output=True, text=True)
            self.assertEqual(r.returncode, 2)
            self.assertIn("insecure_lan", r.stdout)
        finally:
            A.stop()
            B.stop()
            trash = os.path.join(PYROOT, "_trash")
            os.makedirs(trash, exist_ok=True)
            shutil.move(work, os.path.join(trash, "test-bridge-" + os.path.basename(work)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
