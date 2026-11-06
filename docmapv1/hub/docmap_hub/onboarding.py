"""``cliente nuovo``: onboarding of a new client in one step (CLI and web page).

One call takes the client's data and which installations it needs:

* ``sede``   — studio-python on the client's PC (installer-windows, ``C:\\DocMap``);
* ``online`` — web-php on a domain (the client's or Dave's, e.g. ``https://docmap.pr-it.it/studio-rossi/``),
  with optional ``staging``; FTP access stored in the vault.

and does, idempotently (a second run never duplicates customers, instances, environments or licences):

1. customer (found again by VAT number, else by exact name), key escrow flag;
2. one instance per installation (``notes = onboarding:sede|online``) and its environments
   (sede: ``production`` studio-python; online: ``production`` + optional ``staging`` web-php);
3. FTP credentials in the vault (production, and staging with its own remote folder);
4. a licence per instance, only if the instance has no licence still valid (renewals: ``licence renew``);
5. outputs under ``<hub dir>/clienti/<slug>/``:

   - ``chiave-pubblica.json``  the hub's public keys (export-public-key);
   - ``licenze/``              copies of the current licence files;
   - ``sede/DocMap-<slug>-sede[.zip]``  per-client installer package (installer-windows ``pacchetto`` with
     ``--chiave-pubblica``, ``--licenza``, ``--nome-studio``, ``--sync-modello`` when online is chosen too, and the guide);
   - ``online/<env>/sito/`` + ``online/<env>/DocMap-<slug>-online-<env>.zip``  web deploy built with
     ``tools/build_deploy.py`` (invoked, never modified), ready for ``deploy`` or manual FTP upload;
   - ``sync-modello.json``     template of the web ⇄ local bridge profile (no tokens);
   - ``scheda-cliente.html``   printable client sheet, no secrets, no external assets;
   - ``cliente.json``          what was created (ids, files), no secrets.

Packages are built once; ``rigenera=True`` moves the old ones to ``clienti/<slug>/_trash/<stamp>/`` and builds new
ones (e.g. after a licence renewal or a new DocMap version). The client sheet is rewritten at every run.
"""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from . import licence as L
from .registry import RegistryError
from .runner import DOCMAPV1, run_build_deploy
from .vault import Vault, VaultKey, validate as validate_secret

INSTALLS = ("sede", "online")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")
BRIDGE_USER = "ponte-sync"


class OnboardingError(RegistryError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def slugify(text: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40].strip("-")
    return s or "cliente"


def norm_vat(v: str | None) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", v or "").upper()


def installer_dir(reg) -> Path:
    cands = []
    if reg.get_setting("installer_dir"):
        cands.append(Path(reg.get_setting("installer_dir")))
    if reg.get_setting("docmap_dir"):
        cands.append(Path(reg.get_setting("docmap_dir")) / "installer-windows")
    cands.append(DOCMAPV1 / "installer-windows")
    for c in cands:
        if (c / "docmap_tools.py").is_file():
            return c.resolve()
    raise OnboardingError("Cartella installer-windows non trovata. Indicala con: settings set installer_dir "
                          "C:\\percorso\\docmapv1\\installer-windows")


def guide_file(reg) -> Path | None:
    cands = []
    if reg.get_setting("docmap_dir"):
        cands.append(Path(reg.get_setting("docmap_dir")) / "docs" / "GUIDA-NUOVO-CLIENTE.md")
    cands.append(DOCMAPV1 / "docs" / "GUIDA-NUOVO-CLIENTE.md")
    return next((c for c in cands if c.is_file()), None)


def api_url_web(url: str) -> str:
    return url.rstrip("/") + "/server-php/api.php"


def _check_web_url(url: str, what: str) -> str:
    u = (url or "").strip()
    parts = urlsplit(u)
    if parts.scheme != "https" or not parts.hostname:
        raise OnboardingError(f"{what}: serve l'indirizzo completo in https, es. https://docmap.pr-it.it/studio-rossi/ "
                              f"oppure https://archivio.studiorossi.it/ (ricevuto: {u or 'vuoto'}).")
    if parts.query or parts.fragment:
        raise OnboardingError(f"{what}: niente ?… o #… nell'indirizzo.")
    return u if u.endswith("/") else u + "/"


@dataclass
class ClienteNuovo:
    nome: str
    piano: str
    piva: str | None = None
    email: str | None = None
    rivenditore: str | None = None
    custodia_chiave: bool = False
    installazioni: tuple = ("sede",)
    nome_studio: str | None = None
    url_online: str | None = None
    url_staging: str | None = None
    url_sede: str | None = None
    ftp: dict | None = None                  # host, user, password, protocol, port, remote_path
    ftp_cartella_staging: str | None = None
    note: str | None = None
    extra: dict = field(default_factory=dict)
    licenza_kw: dict = field(default_factory=dict)   # v0.5: months / limits for a newly issued licence

    def validate(self, hub) -> None:
        if not (self.nome or "").strip():
            raise OnboardingError("Il nome del cliente è obbligatorio.")
        inst = tuple(dict.fromkeys(self.installazioni or ()))
        if not inst or any(i not in INSTALLS for i in inst):
            raise OnboardingError("Installazioni: scegli sede, online oppure entrambe.")
        self.installazioni = inst
        if self.piano not in hub.plans:
            raise OnboardingError(f"Piano sconosciuto: '{self.piano}'. Piani: {', '.join(hub.plans)}.")
        if self.rivenditore:
            hub.registry.get_reseller(self.rivenditore)
        if "online" in inst:
            if not self.url_online:
                raise OnboardingError("Per l'installazione online serve l'indirizzo (--url-online).")
            self.url_online = _check_web_url(self.url_online, "Indirizzo online")
            if self.url_staging:
                self.url_staging = _check_web_url(self.url_staging, "Indirizzo di staging")
                if self.url_staging == self.url_online:
                    raise OnboardingError("Staging e production devono avere indirizzi diversi.")
        else:
            if self.url_online or self.url_staging or self.ftp:
                raise OnboardingError("Indirizzo online e FTP servono solo con l'installazione online.")
        if self.ftp:
            self.ftp = validate_secret("ftp", self.ftp)
            if self.url_staging and not self.ftp_cartella_staging:
                raise OnboardingError("Con lo staging indica anche la sua cartella FTP (--ftp-cartella-staging), "
                                      "diversa da quella di production.")
            if self.ftp_cartella_staging and self.ftp_cartella_staging.rstrip("/") == str(self.ftp["remote_path"]).rstrip("/"):
                raise OnboardingError("La cartella FTP di staging deve essere diversa da quella di production.")
        if not hub.keys.active_id:
            raise OnboardingError("Nessuna chiave di firma: esegui prima 'keygen'.")


class Onboarding:
    def __init__(self, hub, log=print):
        self.hub = hub
        self.reg = hub.registry
        self.vault = Vault(self.reg)
        self.log = log

    # -- registry ----------------------------------------------------------
    def find_customer(self, nome: str, piva: str | None) -> dict | None:
        rows = self.reg.list_customers()
        if norm_vat(piva):
            hit = [c for c in rows if norm_vat(c.get("vat_id")) == norm_vat(piva)]
            if len(hit) > 1:
                raise OnboardingError(f"Più clienti con la P.IVA {piva}: sistemali prima ('customer list').")
            if hit:
                return self.reg.get_customer(hit[0]["id"])
        hit = [c for c in rows if c["name"].strip().lower() == nome.strip().lower()]
        if len(hit) > 1:
            raise OnboardingError(f"Più clienti chiamati '{nome}': indica la P.IVA.")
        if hit and norm_vat(piva) and norm_vat(hit[0].get("vat_id")) and norm_vat(hit[0]["vat_id"]) != norm_vat(piva):
            raise OnboardingError(f"Esiste già un cliente '{nome}' con un'altra P.IVA ({hit[0]['vat_id']}).")
        return self.reg.get_customer(hit[0]["id"]) if hit else None

    def find_instance(self, customer_id: str, role: str) -> dict | None:
        r = self.reg.conn.execute("SELECT id FROM instances WHERE customer_id=? AND notes=?",
                                  (customer_id, f"onboarding:{role}")).fetchone()
        return self.reg.get_instance(r[0]) if r else None

    def _env(self, inst_id: str, name: str) -> dict | None:
        try:
            return self.reg.get_environment(inst_id, name)
        except RegistryError:
            return None

    def _ensure_web_env(self, inst_id: str, name: str, url: str, studio_name: str) -> tuple[dict, bool]:
        from .envs import EnvManager
        e = self._env(inst_id, name)
        if e is None:
            return EnvManager(self.hub).add_remote(inst_id, name, "web-php", url, studio_name=studio_name), True
        if e["kind"] != "web-php":
            raise OnboardingError(f"L'ambiente {name} esiste già ma è di tipo {e['kind']}.")
        if (e.get("url") or "") != url or (e.get("settings") or {}).get("studio_name") != studio_name:
            parts = urlsplit(url)
            s = dict(e.get("settings") or {})
            s.update({"base_path": parts.path or "/", "domain": f"{parts.scheme}://{parts.netloc}",
                      "slug": parts.path.strip("/").split("/")[-1] or s.get("slug") or "studio", "studio_name": studio_name})
            e = self.reg.update_environment(e["id"], log_action="env.update", url=url, api_url=api_url_web(url), settings=s)
        return e, False

    # -- main --------------------------------------------------------------
    def run(self, req: ClienteNuovo, *, key=None, passphrase: str | None = None, vk: VaultKey | None = None,
            rigenera: bool = False, build: bool = True) -> dict:
        """``key`` = (key_id, private key) already loaded (web page) or ``passphrase`` to load it (CLI)."""
        req.validate(self.hub)
        if req.ftp and vk is None:
            if not self.vault.initialized:
                raise OnboardingError("Per salvare l'accesso FTP serve la cassaforte: esegui prima 'vault init'.")
            raise OnboardingError("Per salvare l'accesso FTP serve la cassaforte aperta (passphrase della cassaforte).")
        if key is None:
            if passphrase is None:
                raise OnboardingError("Serve la passphrase della chiave di firma per emettere le licenze.")
            key = self.hub.keys.load_private(passphrase)   # fails early on a wrong passphrase
        studio_name = (req.nome_studio or req.nome).strip()[:120]
        rep: dict = {"created": [], "reused": [], "licences": {}, "instances": {}, "envs": {}, "files": {}, "warnings": []}

        # 1. customer
        cust = self.find_customer(req.nome, req.piva)
        if cust is None:
            cust = self.reg.add_customer(req.nome.strip(), req.piva or None, req.email or None, req.rivenditore or None,
                                         req.note or None)
            rep["created"].append(f"cliente {cust['name']} ({cust['id']})")
        else:
            rep["reused"].append(f"cliente {cust['name']} ({cust['id']})")
        if bool(cust.get("key_escrow")) != bool(req.custodia_chiave):
            if not req.custodia_chiave and self.vault.escrowed_count(cust["id"]):
                raise OnboardingError("La cassaforte contiene configurazioni del database di questo cliente: per spegnere la "
                                      "custodia usa 'customer set --key-escrow off --purge'.")
            cust = self.reg.set_key_escrow(cust["id"], bool(req.custodia_chiave))
            rep["created"].append(f"custodia della chiave {'attiva' if req.custodia_chiave else 'spenta'}")

        # 2. instances + environments
        for role in req.installazioni:
            inst = self.find_instance(cust["id"], role)
            if inst is None:
                inst = self.reg.add_instance(cust["id"], f"{cust['name']} — {role}",
                                             "onprem" if role == "sede" else "cloud", notes=f"onboarding:{role}")
                rep["created"].append(f"installazione {role} ({inst['id']})")
            else:
                rep["reused"].append(f"installazione {role} ({inst['id']})")
            rep["instances"][role] = inst["id"]
            envs = {}
            if role == "sede":
                e = self._env(inst["id"], "production")
                if e is None:
                    from .envs import api_url_from
                    e = self.reg.add_environment(inst["id"], "production", "studio-python", url=req.url_sede or None,
                                                 api_url=api_url_from(req.url_sede, "studio-python"),
                                                 settings={"studio_name": studio_name})
                    rep["created"].append("ambiente sede/production (studio-python)")
                elif req.url_sede and e.get("url") != req.url_sede:
                    from .envs import api_url_from
                    e = self.reg.update_environment(e["id"], log_action="env.update", url=req.url_sede,
                                                    api_url=api_url_from(req.url_sede, "studio-python"))
                envs["production"] = e["id"]
            else:
                e, new = self._ensure_web_env(inst["id"], "production", req.url_online, studio_name)
                (rep["created"] if new else rep["reused"]).append("ambiente online/production (web-php)")
                envs["production"] = e["id"]
                if req.url_staging:
                    e2, new = self._ensure_web_env(inst["id"], "staging", req.url_staging, studio_name + " (prova)")
                    (rep["created"] if new else rep["reused"]).append("ambiente online/staging (web-php)")
                    envs["staging"] = e2["id"]
                if req.ftp:
                    for name, data in (("production", req.ftp),
                                       ("staging", dict(req.ftp, remote_path=req.ftp_cartella_staging))):
                        if name not in envs:
                            continue
                        had = self.vault.has(envs[name], "ftp")
                        self.vault.put(vk, envs[name], "ftp", data)
                        (rep["reused"] if had else rep["created"]).append(
                            f"accesso FTP di {name} in cassaforte" + (" (riscritto con i dati indicati)" if had else ""))
            rep["envs"][role] = envs

        # 3. licences (only when no licence is still valid)
        key_id, priv = key
        now = _now()
        for role, iid in rep["instances"].items():
            last = self.reg.latest_licence(iid)
            if last and L.parse_time(last["expires_at"]) > now:
                rep["reused"].append(f"licenza {role} valida fino al {last['expires_at'][:10]}")
                rep["licences"][role] = last["id"]
            else:
                res = self.hub.issue_with_key(key_id, priv, iid, req.piano, **(req.licenza_kw or {}))
                rep["licences"][role] = res["licence"]["licence_id"]
                rep["created"].append(f"licenza {role} piano {req.piano} fino al {res['licence']['expires_at'][:10]}")

        # 4. outputs
        cdir = self.client_dir(cust)
        rep["slug"], rep["dir"], rep["customer_id"] = cdir.name, str(cdir), cust["id"]
        self._write_outputs(cust, rep, req, studio_name, rigenera, build)
        self.reg.log("onboarding.run", "customer", cust["id"],
                     {"installazioni": list(req.installazioni), "rigenera": rigenera, "dir": str(cdir)})
        return rep

    # -- outputs -----------------------------------------------------------
    def client_dir(self, cust: dict) -> Path:
        root = self.hub.dir / "clienti"
        root.mkdir(exist_ok=True)
        for f in root.glob("*/cliente.json"):
            try:
                if json.loads(f.read_text("utf-8")).get("customer_id") == cust["id"]:
                    return f.parent
            except (OSError, ValueError):
                continue
        base = slugify(cust["name"])
        d = root / base
        if d.exists():
            d = root / f"{base}-{cust['id'][-6:]}"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _trash(self, cdir: Path, names: list[str]) -> str | None:
        present = [n for n in names if (cdir / n).exists()]
        if not present:
            return None
        dst = cdir / "_trash" / _now().strftime("%Y%m%d-%H%M%S")
        dst.mkdir(parents=True, exist_ok=True)
        for n in present:
            shutil.move(str(cdir / n), str(dst / n))
        return str(dst)

    def _write_outputs(self, cust: dict, rep: dict, req: ClienteNuovo, studio_name: str, rigenera: bool, build: bool):
        cdir = Path(rep["dir"])
        slug = cdir.name
        if rigenera:
            moved = self._trash(cdir, ["sede", "online"])
            if moved:
                rep["files"]["vecchi_pacchetti"] = moved
        pk = cdir / "chiave-pubblica.json"
        pk.write_text(self.hub.keys.export("json"), "utf-8", newline="\n")
        rep["files"]["chiave_pubblica"] = str(pk)
        ldir = cdir / "licenze"
        ldir.mkdir(exist_ok=True)
        lic_files = {}
        for role, lid in rep["licences"].items():
            rec = self.reg.get_licence(lid)
            f = ldir / f"{role}-{self.hub.licence_filename(rec['licence'])}"
            if not f.exists():
                f.write_text(rec["file_text"], "utf-8", newline="\n")
            lic_files[role] = f
            rep["files"][f"licenza_{role}"] = str(f)
        sync_model = None
        if "sede" in rep["instances"] and "online" in rep["instances"]:
            sync_model = cdir / "sync-modello.json"
            sync_model.write_text(json.dumps(
                {"formato": 1, "name": f"Web ⇄ Studio — {cust['name']}"[:120],
                 "a": {"label": "Web (online)", "url": api_url_web(req.url_online), "basic_user": ""},
                 "direction": "both", "ogni_minuti": 10}, ensure_ascii=False, indent=2) + "\n", "utf-8", newline="\n")
            rep["files"]["sync_modello"] = str(sync_model)
        guide = guide_file(self.reg)
        if guide:
            shutil.copyfile(guide, cdir / guide.name)
            rep["files"]["guida"] = str(cdir / guide.name)
        if build and "sede" in rep["instances"]:
            rep["files"].update(self._build_sede(cust, rep, slug, studio_name, pk, lic_files["sede"], sync_model, guide))
        if build and "online" in rep["instances"]:
            rep["files"].update(self._build_online(rep, slug))
        manifest = {"formato": 1, "customer_id": cust["id"], "slug": slug, "nome": cust["name"],
                    "aggiornato": L.format_time(_now()), "installazioni": rep["instances"], "ambienti": rep["envs"],
                    "licenze": rep["licences"], "file": {k: v for k, v in rep["files"].items()}}
        (cdir / "cliente.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf-8", newline="\n")
        scheda = cdir / "scheda-cliente.html"
        scheda.write_text(scheda_html(self.hub, cust["id"]), "utf-8", newline="\n")
        rep["files"]["scheda"] = str(scheda)

    def _build_sede(self, cust, rep, slug, studio_name, pk, lic, sync_model, guide) -> dict:
        out = Path(rep["dir"]) / "sede" / f"DocMap-{slug}-sede"
        if (out.with_suffix(".zip")).exists() or out.exists():
            rep["reused"].append("pacchetto di installazione in sede (già costruito: --rigenera per rifarlo)")
            return {"pacchetto_sede": str(out), "pacchetto_sede_zip": str(out.with_suffix(".zip"))}
        out.parent.mkdir(parents=True, exist_ok=True)
        tools = installer_dir(self.reg) / "docmap_tools.py"
        with tempfile.TemporaryDirectory(prefix="docmap-hub-pkg-") as td:
            info = Path(td) / "cliente.json"
            info.write_text(json.dumps({"cliente": cust["name"], "customer_id": cust["id"],
                                        "instance_id": rep["instances"]["sede"],
                                        "instance_id_online": rep["instances"].get("online"),
                                        "piano": self.reg.get_licence(rep["licences"]["sede"])["plan"],
                                        "preparato_da": "DocMap Hub"}, ensure_ascii=False), "utf-8")
            cmd = [sys.executable, str(tools), "pacchetto", "--out", str(out), "--zip", "--chiave-pubblica", str(pk),
                   "--licenza", str(lic), "--nome-studio", studio_name, "--cliente-json", str(info)]
            if sync_model:
                cmd += ["--sync-modello", str(sync_model)]
            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600,
                               env=dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1"))
        if r.returncode != 0:
            raise OnboardingError("Pacchetto di installazione non costruito: " + (r.stderr or r.stdout).strip()[-600:])
        rep["created"].append("pacchetto di installazione in sede")
        self.log(f"Pacchetto in sede: {out}.zip")
        return {"pacchetto_sede": str(out), "pacchetto_sede_zip": str(out) + ".zip"}

    def _build_online(self, rep, slug) -> dict:
        files = {}
        for name, env_id in rep["envs"]["online"].items():
            e = self.reg.get_environment(env_id)
            s = e.get("settings") or {}
            d = Path(rep["dir"]) / "online" / name
            site, zp = d / "sito", d / f"DocMap-{slug}-online-{name}.zip"
            if zp.exists():
                rep["reused"].append(f"sito online {name} (già costruito: --rigenera per rifarlo)")
            else:
                d.mkdir(parents=True, exist_ok=True)
                from .deploy import site_licence_files
                tk, lic = site_licence_files(self.hub, e, d)
                res = run_build_deploy(site, base_path=s.get("base_path") or "/", slug=s.get("slug") or "studio",
                                       domain=s.get("domain") or "https://example.invalid", studio_name=s.get("studio_name") or "",
                                       reg=self.reg, trusted_keys=tk, licence=lic)
                with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
                    for f in sorted(site.rglob("*")):
                        if f.is_file():
                            z.write(f, f.relative_to(site).as_posix())
                rep["created"].append(f"sito online {name} (versione {res.get('version') or '?'})")
                self.log(f"Sito online {name}: {zp}")
            files[f"sito_{name}"] = str(site)
            files[f"sito_{name}_zip"] = str(zp)
        return files

    # -- bridge token ------------------------------------------------------
    def web_env(self, customer: str) -> dict:
        cust = self.reg.get_customer(customer)
        inst = self.find_instance(cust["id"], "online")
        if inst is None:
            raise OnboardingError(f"{cust['name']} non ha un'installazione online creata con 'cliente nuovo'.")
        return self.reg.get_environment(inst["id"], "production")

    def save_bridge_token(self, vk: VaultKey, customer: str, token: str) -> dict:
        token = (token or "").strip()
        if not token or any(c.isspace() for c in token) or len(token) > 200:
            raise OnboardingError("Token non valido: incollalo esattamente come lo mostra setup.php (una sola riga).")
        env = self.web_env(customer)
        return self.vault.put(vk, env["id"], "admin_token", {"user": BRIDGE_USER, "role": "editor", "token": token},
                              label=BRIDGE_USER)

    def export_bridge_token(self, vk: VaultKey, customer: str, out: Path) -> Path:
        env = self.web_env(customer)
        data = self.vault.get(vk, env["id"], "admin_token", BRIDGE_USER, reason="esporta token del ponte per l'installazione")
        out = Path(out)
        fd = os.open(str(out), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(data["token"] + "\n")
        return out


# ---------------------------------------------------------------------------
# client sheet (printable, no external assets)
# ---------------------------------------------------------------------------

SHEET_CSS = """
*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font:13px/1.45 system-ui,Segoe UI,Arial,sans-serif}
main{max-width:900px;margin:0 auto;padding:18px}h1{font-size:21px;margin:0 0 2px}h2{font-size:15px;margin:18px 0 6px;
border-bottom:2px solid #0a5c8a;padding-bottom:2px;color:#0a5c8a}table{border-collapse:collapse;width:100%;margin:4px 0}
th,td{border:1px solid #c9ced6;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef2f6;width:28%}
code{font:12px ui-monospace,Consolas,monospace;word-break:break-all}.mut{color:#555}.warn{border:2px solid #b3261e;
padding:8px;color:#b3261e;margin:10px 0}ul.check{list-style:none;padding-left:0}ul.check li:before{content:"\\2610  ";
font-size:15px}.ok{color:#1d7a3a}.no{color:#b3261e}@media print{main{padding:0}h2{break-after:avoid}table{break-inside:avoid}}
@media (prefers-color-scheme:dark){@media screen{body{background:#14181f;color:#e6e9ef}th{background:#1c222b}
th,td{border-color:#2c3440}.mut{color:#9aa4b2}h2{color:#5fb0e0;border-color:#5fb0e0}}}
"""


def _e(v) -> str:
    return html.escape("" if v is None else str(v), quote=True)


def _row(k, v, raw=False) -> str:
    return f"<tr><th>{_e(k)}</th><td>{v if raw else _e(v)}</td></tr>"


def scheda_html(hub, customer: str, secrets: dict | None = None) -> str:
    """Printable sheet. ``secrets`` (env_id → list of {kind,label,data}) only when explicitly requested."""
    reg = hub.registry
    vault = Vault(reg)
    ob = Onboarding(hub, log=lambda *_: None)
    cust = reg.get_customer(customer)
    reseller = reg.get_reseller(cust["reseller_id"])["name"] if cust.get("reseller_id") else None
    insts = {r: ob.find_instance(cust["id"], r) for r in INSTALLS}
    others = [i for i in reg.list_instances(cust["id"]) if i["id"] not in {x["id"] for x in insts.values() if x}]
    cdir = None
    root = hub.dir / "clienti"
    for f in root.glob("*/cliente.json") if root.exists() else []:
        try:
            if json.loads(f.read_text("utf-8")).get("customer_id") == cust["id"]:
                cdir = f.parent
        except (OSError, ValueError):
            pass
    files = {}
    if cdir and (cdir / "cliente.json").exists():
        files = json.loads((cdir / "cliente.json").read_text("utf-8")).get("file") or {}
    now = _now()
    out = [f"<!doctype html><html lang='it'><head><meta charset='utf-8'><meta name='viewport' "
           f"content='width=device-width,initial-scale=1'><title>Scheda cliente · {_e(cust['name'])}</title>"
           f"<style>{SHEET_CSS}</style></head><body><main>",
           f"<h1>DocMap — Scheda cliente: {_e(cust['name'])}</h1>",
           f"<div class='mut'>Preparata dal DocMap Hub il {now.strftime('%d/%m/%Y %H:%M')} UTC. "
           "Questa scheda <b>non contiene codici segreti</b>: dice dove sono custoditi.</div>"]
    if secrets is not None:
        out.append("<div class='warn'><b>ATTENZIONE: questa copia CONTIENE CODICI SEGRETI</b> (chiesta con la passphrase "
                   "della cassaforte). Stampala, mettila in cassaforte ed elimina il file.</div>")
    out.append("<h2>1. Cliente</h2><table>")
    out += [_row("Nome", cust["name"]), _row("Partita IVA", cust.get("vat_id") or "—"), _row("Email", cust.get("email") or "—"),
            _row("Rivenditore", reseller or "nessuno (cliente diretto)"),
            _row("Custodia della chiave del database", "ATTIVA (consenso scritto del cliente, GDPR art. 28)"
                 if cust.get("key_escrow") else "spenta: la chiave del database resta solo dal cliente"),
            _row("Codice cliente (hub)", f"<code>{_e(cust['id'])}</code>", raw=True)]
    out.append("</table>")

    out.append("<h2>2. Installazioni, licenze e indirizzi</h2>")
    for role, inst in insts.items():
        if not inst:
            continue
        lic = reg.latest_licence(inst["id"])
        st = hub.status_of(lic["file_text"]) if lic else None
        title = "In sede (PC del cliente, rete locale)" if role == "sede" else "Online (sito web)"
        out.append(f"<table><tr><th colspan='2' style='width:auto'>{_e(title)}</th></tr>")
        out.append(_row("Codice installazione (instance_id)", f"<code>{_e(inst['id'])}</code>", raw=True))
        if lic:
            out.append(_row("Licenza", f"piano <b>{_e(lic['plan'])}</b>, valida fino al <b>{_e(lic['expires_at'][:10])}</b> "
                                       f"(+{_e(lic['licence'].get('grace_days'))} giorni di tolleranza) · stato "
                                       f"{_e(st.message_it if st else '?')} · id <code>{_e(lic['id'][:8])}</code>", raw=True))
            lim = lic["licence"].get("limits") or {}
            out.append(_row("Limiti", ", ".join(f"{k} {('illimitato' if v is None else v)}" for k, v in sorted(lim.items())) or "—"))
        else:
            out.append(_row("Licenza", "nessuna"))
        for e in reg.list_environments(inst["id"]):
            if role == "sede":
                url = e.get("url") or "dopo l'installazione: vedi C:\\DocMap\\LEGGIMI-INDIRIZZO.txt (https://IP-del-PC:8443/)"
                out.append(_row(f"Ambiente {e['name']}", f"indirizzo in rete locale: {_e(url)}", raw=True))
            else:
                out.append(_row(f"Ambiente {e['name']}", f"<code>{_e(e.get('url'))}</code><br><span class='mut'>API: "
                                                         f"{_e(e.get('api_url'))}</span>", raw=True))
        out.append("</table>")
    if others:
        out.append("<p class='mut'>Altre installazioni registrate a mano: " +
                   ", ".join(f"{_e(i['label'])} (<code>{_e(i['id'])}</code>)" for i in others) + "</p>")

    out.append("<h2>3. Cosa installare e dove</h2><table>")
    if insts["sede"]:
        out.append(_row("PC del cliente (sede)", "pacchetto personale <code>" + _e(Path(files.get("pacchetto_sede_zip", "sede/…zip")).name)
                        + "</code> su chiavetta → estrai → doppio clic su <b>installa.bat</b>. Installa in <code>C:\\DocMap</code>, "
                        "licenza compresa (si installa da sola). Telefoni: certificato dello studio (pagina "
                        "http://IP-del-PC:8080/).", raw=True))
    if insts["online"]:
        for e in reg.list_environments(insts["online"]["id"]):
            z = files.get(f"sito_{e['name']}_zip")
            out.append(_row(f"Hosting ({e['name']})", f"<code>{_e(e.get('url'))}</code> ← hub: <code>deploy --instance "
                            f"{_e(insts['online']['id'][:8])} --env {_e(e['name'])}</code>" +
                            (f" oppure carica a mano <code>{_e(Path(z).name)}</code>" if z else "") +
                            ", poi apri <code>server-php/setup.php</code> una volta.", raw=True))
    if insts["sede"] and insts["online"]:
        out.append(_row("Sincronizzazione web ⇄ sede", "sul PC del cliente, ogni 10 minuti (attività “DocMap Sync Web-Locale”, "
                        "creata da installa.bat o da <code>configura-sync.ps1</code>).", raw=True))
    out.append("</table>")

    out.append("<h2>4. Codici e dove sono custoditi</h2><table><tr><th>Codice</th><th style='width:auto'>Dove si trova · "
               "chi lo ha</th></tr>")

    def in_vault(env_id, kind, label=""):
        return "<span class='ok'>sì</span>" if env_id and vault.has(env_id, kind, label) else "<span class='no'>non ancora</span>"
    rows = [("Chiave di firma delle licenze", "solo sul PC di Dave (hub, cifrata con la passphrase) + backup del hub su chiavetta"),
            ("Chiave pubblica", "nel pacchetto (server/docmap_server/trusted_keys.json) e in chiave-pubblica.json: non è segreta")]
    if insts["sede"]:
        rows += [("Licenza (sede)", "file nel pacchetto → installato in C:\\DocMap\\dati\\licence\\ · copia nel hub"),
                 ("Chiave del database (sede)", "solo sul PC del cliente (C:\\DocMap\\config\\config.json, solo amministratori) "
                  "+ <b>Kit di emergenza</b> stampato dal cliente (codice di recupero) " +
                  ("+ cassaforte del hub (custodia attiva)" if cust.get("key_escrow") else "· NON nel hub (custodia spenta)")),
                 ("Codice amministratore (sede)", "mostrato una volta da installa.bat → gestore di password del cliente"),
                 ("Passphrase dei backup (sede)", "sul PC del cliente + foglio del Kit di emergenza")]
    if insts["online"]:
        envs = {e["name"]: e for e in reg.list_environments(insts["online"]["id"])}
        pe = envs.get("production", {}).get("id")
        rows += [("Accesso FTP (online)", f"cassaforte del hub: production {in_vault(pe, 'ftp')}" +
                  (f", staging {in_vault(envs['staging']['id'], 'ftp')}" if "staging" in envs else "")),
                 ("Chiave del database (online)", "nel file server-php/config.php sul hosting (creato da setup.php) "
                  + ("+ copia in cassaforte (custodia attiva)" if cust.get("key_escrow") else "· scaricane una copia per il cliente")),
                 ("Codici di accesso del sito (token)", "mostrati una volta da setup.php → admin: cassaforte del hub "
                  f"{in_vault(pe, 'admin_token', 'admin')}"),
                 (f"Token del ponte ({BRIDGE_USER}, online)", f"creato da setup.php → cassaforte del hub {in_vault(pe, 'admin_token', BRIDGE_USER)}"
                  " → inserito una volta sul PC della sede (C:\\DocMap\\sync, solo amministratori)" if insts["sede"] else
                  f"cassaforte del hub {in_vault(pe, 'admin_token', BRIDGE_USER)}")]
    for k, v in rows:
        out.append(f"<tr><td>{_e(k)}</td><td>{v}</td></tr>")
    out.append("</table>")

    if secrets is not None:
        out.append("<h2>Codici segreti (copia riservata)</h2><table>")
        for env_id, items in secrets.items():
            for it in items:
                vals = ", ".join(f"{_e(k)}: <code>{_e(v)}</code>" for k, v in sorted(it["data"].items())
                                 if k not in ("content",))
                out.append(_row(f"{it['env']} · {it['kind']}{(' · ' + it['label']) if it['label'] else ''}", vals, raw=True))
        out.append("</table>")

    out.append("<h2>5. Prossimi passi</h2><ul class='check'>")
    steps = []
    if insts["online"]:
        envs = [e["name"] for e in reg.list_environments(insts["online"]["id"])]
        steps += ["Hosting: cartella o sottodominio creato, certificato SSL attivo, account FTP dedicato salvato in cassaforte"]
        if "staging" in envs:
            steps += ["Deploy su staging (hub: deploy --env staging), setup.php una volta, prova", "Promozione: hub promote"]
        else:
            steps += ["Deploy su production (hub: deploy --env production)"]
        steps += [f"setup.php una volta: persone e ruoli, includere la riga <code>{BRIDGE_USER},editor</code>"
                  if insts["sede"] else "setup.php una volta: persone e ruoli",
                  "Codici mostrati da setup.php salvati in cassaforte (admin" + (f", {BRIDGE_USER}" if insts["sede"] else "") + ")",
                  "Scaricata una copia di server-php/config.php (al cliente; in cassaforte solo con custodia attiva)",
                  "Prova: …/server-php/api.php?r=ping risponde ok; config.php e data/ non si aprono (403/404)"]
    if insts["sede"]:
        steps += ["Pacchetto personale copiato su chiavetta (zip in sede/)", "installa.bat sul PC del cliente; codice admin consegnato",
                  "Kit di emergenza stampato e consegnato al cliente (cassaforte)", "Certificato dello studio sui telefoni",
                  "Licenza: stato VALIDA alla fine dell'installazione"]
    if insts["sede"] and insts["online"]:
        steps += [f"Token {BRIDGE_USER} sul PC della sede (installa.bat o configura-sync.ps1): prova e attività ogni 10 minuti",
                  "Dopo 10 minuti: C:\\DocMap\\sync\\ultimo-esito.txt senza errori"]
    steps += ["Scheda stampata e archiviata; promemoria del rinnovo licenza in agenda"]
    out += [f"<li>{s}</li>" for s in steps]
    out.append("</ul><p class='mut'>Guida completa: GUIDA-NUOVO-CLIENTE.md (nella cartella del cliente e nel pacchetto).</p>")
    out.append("</main></body></html>")
    return "\n".join(out)


def collect_secrets(hub, vk: VaultKey, customer: str) -> dict:
    """All vault secrets of the client's environments (for the sheet WITH secrets). Logged as a reveal."""
    reg = hub.registry
    vault = Vault(reg)
    cust = reg.get_customer(customer)
    out: dict = {}
    for inst in reg.list_instances(cust["id"]):
        for e in reg.list_environments(inst["id"]):
            for s in vault.list(env_id=e["id"]):
                data = vault.get(vk, e["id"], s["kind"], s["label"], reason="scheda cliente con segreti")
                out.setdefault(e["id"], []).append({"env": f"{inst['label']} · {e['name']}", "kind": s["kind"],
                                                    "label": s["label"], "data": data})
    return out


def write_scheda(hub, customer: str, secrets: dict | None = None) -> Path:
    ob = Onboarding(hub, log=lambda *_: None)
    cust = hub.registry.get_customer(customer)
    d = ob.client_dir(cust)
    if secrets is None:
        p = d / "scheda-cliente.html"
        p.write_text(scheda_html(hub, cust["id"]), "utf-8", newline="\n")
        return p
    p = d / "scheda-cliente-CON-SEGRETI.html"
    data = scheda_html(hub, cust["id"], secrets).encode("utf-8")
    tmp = p.with_name(p.name + ".tmp")
    fd = os.open(str(tmp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    os.replace(tmp, p)
    hub.registry.log("onboarding.scheda_segreti", "customer", cust["id"], {"file": str(p)})
    return p
