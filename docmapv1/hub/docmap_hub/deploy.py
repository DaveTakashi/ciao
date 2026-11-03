"""Safe deploy of the web app (PHP on the hosting) by FTPS / SFTP.

``deploy --instance X --env staging|production [--dry-run]``:

1. builds the web deploy with ``tools/build_deploy.py`` in a temporary folder
   (base path, slug, domain, studio name from the environment's settings);
2. lists the remote files and reads the remote ``DEPLOY-MANIFEST.txt``
   (sha256 of every file, written by build_deploy) → plan: new / changed /
   unchanged / protected / obsolete files;
3. (not in dry-run) FIRST downloads a backup: every remote file that will be
   overwritten, the whole ``server-php/data/`` folder and the ``.htaccess``
   files, into ``<hub dir>/deploy-backups/<instance>/<env>/<stamp>/``;
   ``server-php/config.php`` goes into the vault (``db_config``) only if the
   customer allows key escrow, otherwise only its size/sha256 are recorded
   to check that the deploy did not touch it;
4. uploads the changed files (temporary name + rename), the manifest last;
5. health check: ``?r=ping`` must answer ``app_version`` == built version;
   on failure the previous files are uploaded again (rollback).

Never overwritten: ``server-php/config.php`` (not in the build anyway), anything
under ``server-php/data/`` that already exists, ``server-php/setup.php`` once
``config.php`` exists (setup already done), and ``.htaccess`` files edited by
hand on the server (remote content ≠ what the last deploy wrote), unless
``--overwrite-htaccess``. Nothing is ever deleted on the server: obsolete
files are only listed.

``promote --instance X`` deploys to production only the exact code last
verified on staging (same app version and same code hash).

Transports: FTPS (explicit TLS, certificate verified, protected data
channel) by default; plain FTP only with ``--insecure-ftp``; SFTP with
``paramiko`` if installed (host key verified against known_hosts).
"""

from __future__ import annotations

import ftplib
import hashlib
import io
import json
import os
import posixpath
import shutil
import ssl
import stat
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from . import licence as L
from .registry import RegistryError
from .runner import app_version_of, ping, run_build_deploy
from .vault import Vault, VaultKey, EscrowRefused

MANIFEST = "DEPLOY-MANIFEST.txt"
GENERATED_PER_ENV = {"docmap.config.js", ".htaccess", "404.html", "README-DEPLOY.md", "nginx-docmap.conf.example",
                     "robots.txt", MANIFEST}
HTACCESS = {".htaccess", "server-php/.htaccess"}
DATA_PREFIX = "server-php/data/"
CONFIG = "server-php/config.php"
SETUP = "server-php/setup.php"
NEVER_REPORT_OBSOLETE = (DATA_PREFIX, CONFIG, "server-php/setup.php.disabled", "server-php/config.")
LAST = ("docmap.config.js", "scan.html", "index.html", "server-php/api.php")


class DeployError(RegistryError):
    pass


def _now() -> str:
    return L.format_time(datetime.now(timezone.utc))


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def parse_manifest(text: str) -> dict[str, str]:
    out = {}
    for line in (text or "").splitlines():
        parts = line.strip().split("  ", 1)
        if len(parts) == 2 and len(parts[0]) == 64:
            out[parts[1]] = parts[0]
    return out


def code_hash(manifest: dict[str, str]) -> str:
    """Identity of the app code, independent from per-environment generated files."""
    lines = "".join(f"{s}  {p}\n" for p, s in sorted(manifest.items()) if p not in GENERATED_PER_ENV)
    return sha256_bytes(lines.encode("utf-8"))


# ---------------------------------------------------------------------------
# transports
# ---------------------------------------------------------------------------

class Remote:
    """Files under a root folder of the server; paths are relative, with '/'."""

    def list_files(self) -> dict[str, int]:
        raise NotImplementedError

    def read(self, rel: str) -> bytes | None:
        raise NotImplementedError

    def upload_bytes(self, data: bytes, rel: str) -> None:
        raise NotImplementedError

    def close(self) -> None:
        pass

    def download(self, rel: str, local: Path) -> bool:
        b = self.read(rel)
        if b is None:
            return False
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(b)
        return True

    def upload(self, local: Path, rel: str) -> None:
        self.upload_bytes(Path(local).read_bytes(), rel)


class LocalRemote(Remote):
    """A folder on this PC (protocol 'local': tests, or a mounted share)."""

    def __init__(self, root: str | Path):
        self.root = Path(root)
        if not self.root.is_dir():
            raise DeployError(f"Cartella di destinazione inesistente: {self.root}")

    def list_files(self):
        out = {}
        for p in self.root.rglob("*"):
            if p.is_file() and not p.name.endswith(".dmtmp"):
                out[p.relative_to(self.root).as_posix()] = p.stat().st_size
        return out

    def read(self, rel):
        p = self.root / rel
        return p.read_bytes() if p.is_file() else None

    def upload_bytes(self, data, rel):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_name(p.name + ".dmtmp")
        tmp.write_bytes(data)
        os.replace(tmp, p)


class _FTP_TLS(ftplib.FTP_TLS):
    """FTPS with TLS session reuse on the data channel (required by many servers)."""

    def ntransfercmd(self, cmd, rest=None):
        conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            conn = self.context.wrap_socket(conn, server_hostname=self.host, session=self.sock.session)
        return conn, size


def resolve_ftp_root(ftp, root: str) -> tuple[str, str | None]:
    """Find the site folder as the FTP account sees it.

    Hosting panels (SiteGround and others) show full paths such as ``/docmap.example.it/public_html/studio``,
    but an FTP account whose home is ``/docmap.example.it/public_html/`` is closed inside it and sees that
    folder as ``/studio``. If ``root`` does not exist, try its shorter tails (dropping leading folders) and
    use the first one that exists. Returns (root to use, note for the log or None).
    """
    def exists(path: str) -> bool:
        try:
            ftp.cwd(path)
            return True
        except ftplib.error_perm:
            return False
        finally:
            try:
                ftp.cwd("/")
            except Exception:
                pass

    if root == "/" or exists(root):
        return root, None
    parts = [p for p in root.strip("/").split("/") if p]
    for i in range(1, len(parts)):
        cand = "/" + "/".join(parts[i:])
        if exists(cand):
            return cand, (f"La cartella {root} non esiste per questo account FTP (la sua cartella home è già "
                          f"dentro il percorso): uso {cand}. Correggi la cartella remota nella cassaforte in {cand}.")
    return root, (f"La cartella {root} non esiste sul server FTP: verrà creata. Se il sito esiste già, la cartella "
                  "remota è sbagliata (va scritta come la vede l'account FTP, a partire dalla sua cartella home).")


class FTPRemote(Remote):
    def __init__(self, host: str, port: int, user: str, password: str, root: str, *, tls: bool = True,
                 cafile: str | None = None, timeout: float = 30.0):
        self.root = "/" + root.strip("/") if root.strip("/") else "/"
        if tls:
            ctx = ssl.create_default_context(cafile=cafile)
            ctx.minimum_version = ssl.TLSVersion.TLSv1_2
            self.ftp = _FTP_TLS(context=ctx, timeout=timeout)
        else:
            self.ftp = ftplib.FTP(timeout=timeout)
        self.ftp.encoding = "utf-8"
        try:
            self.ftp.connect(host, int(port))
            if tls:
                self.ftp.auth()
            self.ftp.login(user, password)
            if tls:
                self.ftp.prot_p()
        except ssl.SSLError as exc:
            raise DeployError(f"FTPS: connessione cifrata non riuscita ({exc}). Controlla il certificato del server "
                              "(campo 'cafile' nella cassaforte per un certificato privato).")
        except ftplib.error_perm as exc:
            raise DeployError(f"FTP: accesso rifiutato ({exc}).")
        except OSError as exc:
            raise DeployError(f"FTP: server non raggiungibile ({exc}).")
        self.ftp.set_pasv(True)
        self._mlsd = True
        self._dirs: set[str] = set()
        self.root, self.root_note = resolve_ftp_root(self.ftp, self.root)

    def _abs(self, rel: str) -> str:
        return posixpath.join(self.root, rel) if rel else self.root

    def _walk(self, path: str, prefix: str, out: dict) -> None:
        entries = []
        if self._mlsd:
            try:
                entries = [(n, f.get("type"), int(f.get("size", 0) or 0))
                           for n, f in self.ftp.mlsd(path, facts=["type", "size"])]
            except ftplib.error_perm as exc:
                if str(exc)[:3] == "550":
                    return
                self._mlsd = False
        if not self._mlsd:
            entries = self._list_fallback(path)
        for name, typ, size in entries:
            if name in (".", "..") or typ in ("cdir", "pdir"):
                continue
            rel = f"{prefix}{name}"
            if typ == "dir":
                self._walk(posixpath.join(path, name), rel + "/", out)
            elif typ == "file" and not name.endswith(".dmtmp"):
                out[rel] = size

    def _list_fallback(self, path: str):
        lines: list[str] = []
        try:
            self.ftp.retrlines("LIST -a " + path, lines.append)
        except ftplib.error_perm:
            return []
        out = []
        for ln in lines:
            parts = ln.split(None, 8)
            if len(parts) < 9:
                continue
            typ = "dir" if ln.startswith("d") else ("file" if ln.startswith("-") else "other")
            try:
                size = int(parts[4])
            except ValueError:
                size = 0
            out.append((parts[8], typ, size))
        return out

    def list_files(self):
        out: dict[str, int] = {}
        self._walk(self.root, "", out)
        return out

    def read(self, rel):
        buf = io.BytesIO()
        try:
            self.ftp.retrbinary("RETR " + self._abs(rel), buf.write)
        except ftplib.error_perm as exc:
            if str(exc)[:3] == "550":
                return None
            raise
        return buf.getvalue()

    def _mkdirs(self, rel_dir: str) -> None:
        cur = self.root
        for part in [p for p in rel_dir.split("/") if p]:
            cur = posixpath.join(cur, part)
            if cur in self._dirs:
                continue
            try:
                self.ftp.mkd(cur)
            except ftplib.error_perm:
                pass
            self._dirs.add(cur)

    def upload_bytes(self, data, rel):
        self._mkdirs(posixpath.dirname(rel))
        dst = self._abs(rel)
        tmp = dst + ".dmtmp"
        self.ftp.storbinary("STOR " + tmp, io.BytesIO(data))
        try:
            self.ftp.rename(tmp, dst)
        except ftplib.error_perm:
            # some servers refuse to rename over an existing file: the old one is in the backup
            try:
                self.ftp.delete(dst)
            except ftplib.error_perm:
                pass
            self.ftp.rename(tmp, dst)

    def close(self):
        try:
            self.ftp.quit()
        except Exception:
            try:
                self.ftp.close()
            except Exception:
                pass


class SFTPRemote(Remote):
    def __init__(self, host: str, port: int, user: str, password: str, root: str, *, known_hosts: Path,
                 trust_new_host_key: bool = False, timeout: float = 30.0):
        try:
            import paramiko  # optional dependency
        except ImportError:
            raise DeployError("Per SFTP serve la libreria 'paramiko': nella cartella del hub esegui "
                              ".venv\\Scripts\\python.exe -m pip install paramiko  (oppure usa FTPS).")
        self.root = "/" + root.strip("/") if root.strip("/") else "/"
        self.client = paramiko.SSHClient()
        self.client.load_system_host_keys()
        known_hosts.parent.mkdir(parents=True, exist_ok=True)
        if known_hosts.exists():
            self.client.load_host_keys(str(known_hosts))
        seen = {}

        class _Policy(paramiko.MissingHostKeyPolicy):
            def missing_host_key(self, client, hostname, key):
                fp = "SHA256:" + __import__("base64").b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
                seen["fp"] = fp
                if not trust_new_host_key:
                    raise DeployError(f"SFTP: chiave del server {hostname} sconosciuta ({key.get_name()} {fp}). "
                                      "Verifica l'impronta con il provider (SiteGround: Site Tools › Dev › SSH) e "
                                      "ripeti con --trust-host-key per memorizzarla.")
                client.get_host_keys().add(hostname, key.get_name(), key)
                client.save_host_keys(str(known_hosts))

        self.client.set_missing_host_key_policy(_Policy())
        try:
            self.client.connect(host, port=int(port), username=user, password=password, timeout=timeout,
                                allow_agent=False, look_for_keys=False)
        except DeployError:
            raise
        except Exception as exc:
            raise DeployError(f"SFTP: connessione non riuscita ({exc}).")
        self.sftp = self.client.open_sftp()

    def _abs(self, rel):
        return posixpath.join(self.root, rel) if rel else self.root

    def list_files(self):
        out = {}

        def walk(path, prefix):
            try:
                items = self.sftp.listdir_attr(path)
            except IOError:
                return
            for a in items:
                rel = prefix + a.filename
                if stat.S_ISDIR(a.st_mode or 0):
                    walk(posixpath.join(path, a.filename), rel + "/")
                elif not a.filename.endswith(".dmtmp"):
                    out[rel] = a.st_size or 0
        walk(self.root, "")
        return out

    def read(self, rel):
        buf = io.BytesIO()
        try:
            self.sftp.getfo(self._abs(rel), buf)
        except IOError:
            return None
        return buf.getvalue()

    def upload_bytes(self, data, rel):
        cur = self.root
        for part in [p for p in posixpath.dirname(rel).split("/") if p]:
            cur = posixpath.join(cur, part)
            try:
                self.sftp.mkdir(cur)
            except IOError:
                pass
        dst = self._abs(rel)
        tmp = dst + ".dmtmp"
        self.sftp.putfo(io.BytesIO(data), tmp)
        try:
            self.sftp.posix_rename(tmp, dst)
        except IOError:
            try:
                self.sftp.remove(dst)
            except IOError:
                pass
            self.sftp.rename(tmp, dst)

    def close(self):
        try:
            self.client.close()
        except Exception:
            pass


def open_remote(secret: dict, *, insecure_ftp: bool = False, known_hosts: Path | None = None,
                trust_new_host_key: bool = False) -> Remote:
    proto = secret.get("protocol", "ftps")
    if proto == "local":
        return LocalRemote(secret["remote_path"])
    if proto == "ftp" and not insecure_ftp:
        raise DeployError("Il protocollo FTP senza cifratura manda password e file in chiaro: rifiutato. "
                          "Usa FTPS (consigliato) o SFTP; solo se il provider non offre altro, aggiungi --insecure-ftp.")
    if proto in ("ftps", "ftp"):
        return FTPRemote(secret["host"], secret.get("port", 21), secret["user"], secret["password"],
                         secret["remote_path"], tls=(proto == "ftps"), cafile=secret.get("cafile") or None)
    if proto == "sftp":
        return SFTPRemote(secret["host"], secret.get("port", 22), secret["user"], secret["password"],
                          secret["remote_path"], known_hosts=known_hosts or Path("known_hosts"),
                          trust_new_host_key=trust_new_host_key)
    raise DeployError(f"Protocollo non supportato: {proto}")


# ---------------------------------------------------------------------------
# build and plan
# ---------------------------------------------------------------------------

@dataclass
class Build:
    dir: Path
    version: str | None
    manifest: dict[str, str]
    code_hash: str
    tmp: tempfile.TemporaryDirectory | None = field(default=None, repr=False)

    def files(self) -> list[str]:
        return sorted(self.manifest) + [MANIFEST]

    def local_sha(self, rel: str) -> str:
        if rel == MANIFEST:
            return sha256_bytes((self.dir / MANIFEST).read_bytes())
        return self.manifest[rel]

    def cleanup(self):
        if self.tmp is not None:
            self.tmp.cleanup()
            self.tmp = None


def build_for(hub, env: dict) -> Build:
    s = env.get("settings") or {}
    td = tempfile.TemporaryDirectory(prefix="docmap-hub-build-")
    target = Path(td.name) / "site"
    try:
        res = run_build_deploy(target, base_path=s.get("base_path") or "/", slug=s.get("slug") or "studio",
                               domain=s.get("domain") or "https://example.invalid",
                               studio_name=s.get("studio_name") or "", reg=hub.registry)
    except Exception:
        td.cleanup()
        raise
    man = parse_manifest((target / MANIFEST).read_text("utf-8"))
    version = res["version"] or app_version_of(target / "server-php" / "api.php")
    return Build(target, version, man, code_hash(man), td)


def plan(build: Build, remote_files: dict[str, int], remote_manifest: dict[str, str], read_remote,
         overwrite_htaccess: bool = False) -> dict:
    """Decide what to upload. ``read_remote(rel)`` is used only for small protected files."""
    upload, unchanged, protected = [], [], []
    for rel in build.files():
        if rel == MANIFEST:
            continue  # decided after the loop
        lsha = build.local_sha(rel)
        exists = rel in remote_files
        lsize = (build.dir / rel).stat().st_size
        if rel.startswith(DATA_PREFIX) and exists:
            protected.append({"path": rel, "why": "cartella dati: mai sovrascritta"})
            continue
        if rel == SETUP and CONFIG in remote_files:
            protected.append({"path": rel, "why": "setup già fatto (config.php presente): setup.php non si ricarica"})
            continue
        if not exists:
            upload.append({"path": rel, "why": "nuovo", "exists": False})
            continue
        if rel in HTACCESS:
            body = read_remote(rel)
            rsha = sha256_bytes(body) if body is not None else None
            if rsha == lsha:
                unchanged.append(rel)
                continue
            deployed = remote_manifest.get(rel)
            if rsha is not None and rsha != deployed and not overwrite_htaccess:
                protected.append({"path": rel, "why": "modificato a mano sul server: non sovrascritto "
                                                     "(usa --overwrite-htaccess per sostituirlo)"})
                continue
            upload.append({"path": rel, "why": "modificato", "exists": True})
            continue
        if remote_manifest.get(rel) == lsha and remote_files.get(rel) == lsize:
            unchanged.append(rel)
        else:
            upload.append({"path": rel, "why": "modificato" if remote_manifest else "da verificare (nessun manifest "
                                                                                     "sul server)", "exists": True})
    if upload or MANIFEST not in remote_files or remote_manifest != {k: v for k, v in build.manifest.items()}:
        upload.append({"path": MANIFEST, "why": "manifest", "exists": MANIFEST in remote_files})
    else:
        unchanged.append(MANIFEST)
    local = set(build.files())
    obsolete = sorted(r for r in remote_files if r not in local and not r.startswith(NEVER_REPORT_OBSOLETE))

    def order(item):
        p = item["path"]
        if p == MANIFEST:
            return (3, p)
        if p in LAST:
            return (2, LAST.index(p))
        return (1, p)
    upload.sort(key=order)
    return {"upload": upload, "unchanged": sorted(unchanged), "protected": protected, "obsolete": obsolete}


# ---------------------------------------------------------------------------
# deploy / promote
# ---------------------------------------------------------------------------

def _ftp_secret(vault: Vault, vk: VaultKey, env: dict) -> dict:
    return vault.get(vk, env["id"], "ftp", reason="deploy")


def deploy(hub, vk: VaultKey | None, instance: str, env_name: str, *, dry_run: bool = False,
           insecure_ftp: bool = False, overwrite_htaccess: bool = False, trust_host_key: bool = False,
           pinger=None, health_tries: int = 5, health_delay: float = 3.0, build: Build | None = None,
           remote: Remote | None = None, log=lambda m: None, _promote_of: str | None = None,
           expect_code_hash: str | None = None) -> dict:
    reg = hub.registry
    env = reg.get_environment(instance, env_name)
    if env["kind"] != "web-php":
        raise DeployError(f"Il deploy FTP vale per gli ambienti web-php; {env['name']} è {env['kind']}.")
    if not env.get("api_url"):
        raise DeployError("L'ambiente non ha l'indirizzo dell'API (api_url): serve per il controllo dopo il deploy.")
    vault = Vault(reg)
    pinger = pinger or (lambda url, auth: ping(url, timeout=10, basic_auth=auth))
    basic = None
    if vk is not None:
        ba = vault.get(vk, env["id"], "basic_auth", reason="deploy (controllo)", required=False)
        basic = (ba["user"], ba["password"]) if ba else None
    own_build = build is None
    if own_build:
        log("Costruisco il deploy con tools/build_deploy.py …")
        build = build_for(hub, env)
    log(f"Versione costruita: {build.version} · codice {build.code_hash[:12]}")
    if expect_code_hash and expect_code_hash != build.code_hash:
        if own_build:
            build.cleanup()
        raise DeployError("Il codice è cambiato dopo la prova (dry-run): rifai la prova e conferma di nuovo.")
    own_remote = remote is None
    deploy_id = reg.add_deploy(env["id"], build.version, build.code_hash, dry_run)
    result: dict = {"deploy_id": deploy_id, "env": env["name"], "version": build.version,
                    "code_hash": build.code_hash, "dry_run": dry_run}
    try:
        if own_remote:
            if vk is None:
                raise DeployError("Cassaforte chiusa: servono le credenziali FTP.")
            sec = _ftp_secret(vault, vk, env)
            log(f"Mi collego a {sec.get('host', sec.get('remote_path'))} ({sec.get('protocol')}) …")
            remote = open_remote(sec, insecure_ftp=insecure_ftp, known_hosts=hub.dir / "known_hosts",
                                 trust_new_host_key=trust_host_key)
        note = getattr(remote, "root_note", None)
        if note:
            log("ATTENZIONE: " + note)
            result["root_note"] = note
        remote_files = remote.list_files()
        rman_bytes = remote.read(MANIFEST)
        rman = parse_manifest(rman_bytes.decode("utf-8", "replace")) if rman_bytes else {}
        remote_version = None
        api = remote.read("server-php/api.php") if "server-php/api.php" in remote_files else None
        if api:
            import re
            m = re.search(rb"DM_APP_VERSION\s*=\s*'([^']+)'", api)
            remote_version = m.group(1).decode() if m else None
        log(f"Sul server: {len(remote_files)} file, versione {remote_version or 'sconosciuta (sito nuovo o cartella sbagliata)'}")
        p = plan(build, remote_files, rman, remote.read, overwrite_htaccess)
        result.update(plan=p, remote_version=remote_version, remote_file_count=len(remote_files))
        log(f"Da caricare: {len(p['upload'])} · invariati: {len(p['unchanged'])} · protetti: {len(p['protected'])}"
            f" · obsoleti (non cancellati): {len(p['obsolete'])}")
        if dry_run:
            reg.finish_deploy(deploy_id, "dry-run", {"upload": len(p["upload"]), "protected": p["protected"]})
            result["status"] = "dry-run"
            return result

        # 1) backup FIRST
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        bdir = hub.dir / "deploy-backups" / env["instance_id"] / env["name"] / stamp
        bdir.mkdir(parents=True, exist_ok=True)
        log(f"Backup del server in {bdir} …")
        before = {}
        for item in p["upload"]:
            if item["exists"]:
                if remote.download(item["path"], bdir / "before" / item["path"]):
                    before[item["path"]] = True
        data_files = [r for r in remote_files if r.startswith(DATA_PREFIX)]
        for r in data_files:
            remote.download(r, bdir / "data" / r[len(DATA_PREFIX):])
        for h in HTACCESS | {DATA_PREFIX + ".htaccess"}:
            if h in remote_files and not (bdir / "before" / h).exists():
                remote.download(h, bdir / "htaccess" / h)
        cfg_info = None
        if CONFIG in remote_files:
            body = remote.read(CONFIG)
            cfg_info = {"size": len(body), "sha256": sha256_bytes(body)} if body is not None else None
            if body is not None and vk is not None:
                try:
                    vault.put(vk, env["id"], "db_config", {"content": body.decode("utf-8", "replace"),
                                                          "format": "php", "sha256": cfg_info["sha256"]},
                              label=CONFIG)
                    cfg_info["in_vault"] = True
                except EscrowRefused:
                    cfg_info["in_vault"] = False  # GDPR: key escrow off → only size/sha256 recorded
            body = None
        (bdir / "backup.json").write_text(json.dumps(
            {"at": _now(), "env_id": env["id"], "env": env["name"], "remote_version": remote_version,
             "built_version": build.version, "before": sorted(before), "data_files": len(data_files),
             "config_php": cfg_info, "plan": p}, ensure_ascii=False, indent=1, default=str), "utf-8")
        reg.update_environment(env["id"], last_backup_at=_now())
        result["backup_dir"] = str(bdir)

        # 2) upload
        done = []
        try:
            for i, item in enumerate(p["upload"], 1):
                remote.upload(build.dir / item["path"], item["path"])
                done.append(item["path"])
                if i % 25 == 0:
                    log(f"  caricati {i}/{len(p['upload'])}")
        except Exception as exc:
            log(f"Errore durante il caricamento: {exc} → ripristino")
            rb = _rollback(remote, bdir, before, done)
            reg.finish_deploy(deploy_id, "rolled-back", {"error": str(exc), "rollback": rb})
            raise DeployError(f"Caricamento interrotto ({exc}): file precedenti ripristinati "
                              f"({len(rb['restored'])}). Backup in {bdir}.")
        log(f"Caricati {len(done)} file. Controllo {env['api_url']}?r=ping …")

        # 3) health check
        hp = None
        for attempt in range(max(1, health_tries)):
            hp = pinger(env["api_url"], basic)
            if hp.get("ok") and hp.get("app_version") == build.version:
                break
            if attempt + 1 < health_tries:
                time.sleep(health_delay)
        result["health"] = hp
        cfg_after = None
        if cfg_info:
            body = remote.read(CONFIG)
            cfg_after = sha256_bytes(body) if body is not None else None
            result["config_php_untouched"] = cfg_after == cfg_info["sha256"]
        if not (hp and hp.get("ok") and hp.get("app_version") == build.version):
            log("Controllo fallito → ripristino dei file precedenti")
            rb = _rollback(remote, bdir, before, done)
            hp2 = pinger(env["api_url"], basic)
            result.update(status="rolled-back", rollback=rb, health_after_rollback=hp2)
            reg.finish_deploy(deploy_id, "rolled-back", {"health": hp, "rollback": rb, "after": hp2})
            reg.update_environment(env["id"], log_action="deploy.rollback", status="error" if not hp2.get("ok") else "running",
                                   app_version=hp2.get("app_version"), last_check=_now())
            raise DeployError(
                f"Dopo il caricamento il server non risponde con la versione {build.version} "
                f"(risposta: {hp.get('app_version') if hp else None}, {hp.get('error') if hp else ''}). "
                f"Ho rimesso i {len(rb['restored'])} file precedenti; backup in {bdir}."
                + (f" File nuovi lasciati sul server: {len(rb['new_left'])}." if rb["new_left"] else ""))

        fields = {"deployed_version": build.version, "app_version": build.version, "last_deploy_at": _now(),
                  "status": "running", "last_check": _now()}
        if env["name"] == "staging":
            fields.update(verified_version=build.version, verified_code_hash=build.code_hash, verified_at=_now())
        reg.update_environment(env["id"], log_action="deploy.ok", **fields)
        reg.finish_deploy(deploy_id, "ok", {"uploaded": done, "protected": p["protected"],
                                            "promote_of": _promote_of})
        result["status"] = "ok"
        result["uploaded"] = done
        log(f"Deploy riuscito: {env['name']} ora è alla versione {build.version}.")
        return result
    except Exception as exc:
        row = reg.conn.execute("SELECT status FROM deploys WHERE id=?", (deploy_id,)).fetchone()
        if row and row[0] == "running":
            reg.finish_deploy(deploy_id, "failed", {"error": str(exc)})
        raise
    finally:
        if own_remote and remote is not None:
            remote.close()
        if own_build:
            build.cleanup()


def _rollback(remote: Remote, bdir: Path, before: dict, done: list[str]) -> dict:
    restored, failed = [], []
    for rel in done:
        if rel in before:
            try:
                remote.upload(bdir / "before" / rel, rel)
                restored.append(rel)
            except Exception as exc:  # keep going: restore as much as possible
                failed.append({"path": rel, "error": str(exc)})
    new_left = [rel for rel in done if rel not in before]
    return {"restored": restored, "failed": failed, "new_left": new_left}


def promote(hub, vk: VaultKey | None, instance: str, **kw) -> dict:
    reg = hub.registry
    staging = reg.get_environment(instance, "staging")
    prod = reg.get_environment(instance, "production")
    if staging["kind"] != "web-php" or prod["kind"] != "web-php":
        raise DeployError("promote vale tra staging e production di tipo web-php.")
    if not staging.get("verified_version") or not staging.get("verified_code_hash"):
        raise DeployError("Nessuna versione verificata su staging: fai prima 'deploy --env staging' "
                          "e prova lo staging.")
    build = kw.pop("build", None)
    own = build is None
    if own:
        build = build_for(hub, prod)
    try:
        if build.version != staging["verified_version"] or build.code_hash != staging["verified_code_hash"]:
            raise DeployError(
                f"Il codice da pubblicare (versione {build.version}, codice {build.code_hash[:12]}) non è quello "
                f"provato su staging (versione {staging['verified_version']}, codice "
                f"{staging['verified_code_hash'][:12]}, {staging.get('verified_at')}). "
                "Rifai prima il deploy su staging e provalo.")
        return deploy(hub, vk, instance, "production", build=build, _promote_of=staging["id"], **kw)
    finally:
        if own:
            build.cleanup()
