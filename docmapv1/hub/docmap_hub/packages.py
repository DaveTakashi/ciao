"""Downloadable packages for a client (v0.5).

* **Postazione** (one per named PC, e.g. "PC Luigi"): a small zip that connects that PC to the studio server:
  it installs the studio certificate for the current Windows user (from ``http://<server>:8080/``, the page the
  installer already serves), creates a desktop shortcut "DocMap" (Edge in app mode when present) and records the
  workstation identity. No admin rights, no data, no secrets.
* **Server di sede**: the per-client installer built by the onboarding (``clienti/<slug>/sede/*.zip``).
* **Autoinstall web**: the built web site as a zip (``clienti/<slug>/online/<env>/*.zip``) with a short Italian
  "how to upload" note, for hosts where the hub has no FTP access. Built on demand when missing.
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from . import __version__
from . import licence as L
from .registry import RegistryError


def _slug(text: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", text or "").strip("-").lower()
    return s[:40] or "postazione"


def _server_url(reg, project_id: str) -> str:
    for i in reg.list_instances():
        if i.get("project_id") != project_id:
            continue
        for e in reg.list_environments(i["id"]):
            if e["kind"] == "studio-python" and e["name"] == "production" and e.get("url"):
                return e["url"]
    return ""


def _online_url(reg, project_id: str) -> str:
    """v0.11: the production web site of the project (the reference copy when the customer is online)."""
    for i in reg.list_instances():
        if i.get("project_id") != project_id:
            continue
        for e in reg.list_environments(i["id"]):
            if e["kind"] == "web-php" and e["name"] == "production" and e.get("url"):
                return e["url"]
    return ""


PS1 = r"""# DocMap - collega questo PC a DocMap dello studio (nessun diritto di amministratore richiesto).
# v0.11: con il sito online il collegamento principale e il SITO (funziona anche se il PC server e spento);
# se c'e anche il server in sede si aggiunge "DocMap (ufficio)", piu veloce in rete locale.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $here 'postazione.json') | ConvertFrom-Json
Write-Host ''
Write-Host "DocMap - postazione '$($cfg.postazione)' di $($cfg.cliente)" -ForegroundColor Cyan
Write-Host ''
$desk = [Environment]::GetFolderPath('Desktop')
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
function New-Collegamento([string]$name, [string]$url) {
  if ($edge) {
    $sh = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desk "$name.lnk"))
    $sh.TargetPath = $edge; $sh.Arguments = "--app=$url"; $sh.Description = "DocMap ($($cfg.postazione))"; $sh.Save()
  } else {
    Set-Content -Encoding ASCII -Path (Join-Path $desk "$name.url") -Value "[InternetShortcut]`r`nURL=$url"
  }
}
$online = [string]$cfg.indirizzo_online
$url = [string]$cfg.indirizzo_server
$aperto = $null
if ($online) {
  Write-Host "1. Collegamento al sito online: $online"
  New-Collegamento "DocMap - $($cfg.nome_studio)" $online
  Write-Host '   Fatto: funziona da qui, da casa e dal telefono, anche se il PC server dello studio e spento.' -ForegroundColor Green
  $aperto = $online
}
if ($url -or -not $online) {
  if (-not $url) {
    Write-Host "Scrivi l'indirizzo del server DocMap dello studio."
    Write-Host "Lo trovi sul PC server nel file C:\DocMap\LEGGIMI-INDIRIZZO.txt (es. https://192.168.1.20:8443/)."
    $url = Read-Host 'Indirizzo'
  }
  $url = $url.Trim()
  if ($url -notmatch '^https://') { $url = 'https://' + $url.TrimStart('/') }
  if (-not $url.EndsWith('/')) { $url += '/' }
  $u = [Uri]$url
  $certUrl = "http://$($u.Host):$($cfg.porta_certificato)/DocMap-CA-studio.crt"
  Write-Host "2. Server in ufficio: scarico il certificato dello studio da $certUrl"
  $tmp = Join-Path $env:TEMP 'DocMap-CA-studio.crt'
  $ok = $true
  try { Invoke-WebRequest -UseBasicParsing -Uri $certUrl -OutFile $tmp -TimeoutSec 15 }
  catch {
    $ok = $false
    Write-Host "   Il server in ufficio non risponde ($($_.Exception.Message))." -ForegroundColor Yellow
    if ($online) { Write-Host '   Non e un problema: usa il collegamento al sito. Per aggiungere anche quello dell''ufficio rilancia questo file con il PC server acceso.' }
    else { Write-Host 'Controlla che il PC server sia acceso e che questo PC sia sulla stessa rete, poi riprova.' -ForegroundColor Red; Read-Host 'Invio per chiudere'; exit 1 }
  }
  if ($ok) {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($tmp)
    Write-Host "   Certificato: $($cert.Subject)"
    Write-Host "   Impronta:    $($cert.Thumbprint)"
    Write-Host '   (deve coincidere con quella stampata sul PC server in LEGGIMI-INDIRIZZO.txt)'
    Write-Host '   Lo installo per il tuo utente Windows: conferma con "Si" nella finestra di Windows.'
    Import-Certificate -FilePath $tmp -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
    $nome = if ($online) { "DocMap (ufficio) - $($cfg.nome_studio)" } else { "DocMap - $($cfg.nome_studio)" }
    New-Collegamento $nome $url
    if (-not $aperto) { $aperto = $url }
  }
}
$dir = Join-Path $env:LOCALAPPDATA 'DocMap'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$cfg | Add-Member -NotePropertyName indirizzo_usato -NotePropertyValue $aperto -Force
$cfg | Add-Member -NotePropertyName collegata_il -NotePropertyValue (Get-Date).ToString('s') -Force
$cfg | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $dir 'postazione.json')
Write-Host ''
Write-Host "Fatto. Apri 'DocMap' dal desktop ed entra con il tuo utente e il codice della tua lettera di benvenuto." -ForegroundColor Green
if ($aperto) { Start-Process $aperto }
Read-Host 'Invio per chiudere'
"""

BAT = ("@echo off\r\nrem DocMap - collega questo PC al server dello studio\r\ncd /d \"%~dp0\"\r\n"
       "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0collega-questo-pc.ps1\"\r\n")


def workstation_zip(hub, wid: str) -> tuple[str, bytes]:
    reg = hub.registry
    w = reg.get_workstation(wid)
    if w["status"] == "revoked":
        raise RegistryError("Postazione revocata: non si possono generare client.")
    p = reg.get_project(w["project_id"])
    c = reg.get_customer(p["customer_id"])
    url = _server_url(reg, p["id"])
    online = _online_url(reg, p["id"])
    studio = (p["data"] or {}).get("nome_studio") or c["name"]
    cfg = {"formato": "docmap-postazione/1", "postazione": w["name"], "etichetta": w.get("tag") or "",
           "workstation_id": w["id"], "cliente": c["name"], "customer_id": c["id"], "progetto": p["name"],
           "project_id": p["id"], "nome_studio": studio, "indirizzo_server": url, "indirizzo_online": online,
           "porta_certificato": 8080,
           "preparato_da": f"DocMap Hub {__version__}", "preparato_il": L.format_time(datetime.now(timezone.utc))}
    if online:
        leggimi = (f"DocMap - postazione \"{w['name']}\" ({c['name']})\r\n\r\n"
                   "Cosa fa: collega questo PC a DocMap dello studio. Non installa programmi e non contiene dati.\r\n\r\n"
                   "1. Estrai questo zip (tasto destro > Estrai tutto).\r\n"
                   "2. Fai doppio clic su collega-questo-pc.bat.\r\n"
                   f"3. Sul desktop compare \"DocMap\": apre il sito {online}\r\n"
                   "   Funziona anche se il PC server dello studio e spento, da casa e dal telefono.\r\n"
                   "4. Entra con il tuo utente e il codice della tua lettera di benvenuto.\r\n"
                   + (f"\r\nIn ufficio c'e anche il server {url}: con il PC server acceso il file aggiunge\r\n"
                      "\"DocMap (ufficio)\" (installa il certificato dello studio per il tuo utente, conferma \"Si\").\r\n"
                      if url else ""))
    else:
        leggimi = (f"DocMap - postazione \"{w['name']}\" ({c['name']})\r\n\r\n"
                   "Cosa fa: collega questo PC al server DocMap dello studio. Non installa programmi e non contiene dati.\r\n\r\n"
                   "1. Il PC server dello studio deve essere acceso e questo PC nella stessa rete.\r\n"
                   "2. Estrai questo zip (tasto destro > Estrai tutto).\r\n"
                   "3. Fai doppio clic su collega-questo-pc.bat.\r\n"
                   + ("4. Se chiede l'indirizzo, copialo dal PC server: C:\\DocMap\\LEGGIMI-INDIRIZZO.txt.\r\n" if not url else
                      f"4. Indirizzo del server: {url}\r\n")
                   + "5. Conferma \"Si\" quando Windows chiede di installare il certificato dello studio.\r\n"
                   "6. Sul desktop compare \"DocMap\": aprilo ed entra con il tuo utente.\r\n\r\n"
                   "Il certificato viene installato solo per il tuo utente Windows. Per toglierlo: certmgr.msc >\r\n"
                   "Autorita di certificazione radice attendibili > DocMap CA.\r\n")
    buf = io.BytesIO()
    folder = f"DocMap-{_slug(c['name'])}-{_slug(w['name'])}"
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{folder}/LEGGIMI.txt", leggimi)
        z.writestr(f"{folder}/postazione.json", json.dumps(cfg, ensure_ascii=False, indent=2) + "\n")
        z.writestr(f"{folder}/collega-questo-pc.ps1", "\ufeff" + PS1.replace("\n", "\r\n"))
        z.writestr(f"{folder}/collega-questo-pc.bat", BAT)
    reg.update_workstation(w["id"], log_action="workstation.build", built_at=cfg["preparato_il"])
    return folder + ".zip", buf.getvalue()


def client_dir(hub, customer_id: str) -> Path:
    from .onboarding import Onboarding
    return Onboarding(hub).client_dir(hub.registry.get_customer(customer_id))


def sede_zip(hub, customer_id: str) -> Path | None:
    d = client_dir(hub, customer_id) / "sede"
    zs = sorted(d.glob("*.zip")) if d.is_dir() else []
    return zs[-1] if zs else None


def web_zip_path(hub, env: dict) -> Path:
    cust = hub.registry.customer_of_env(env)
    d = client_dir(hub, cust["id"])
    return d / "online" / env["name"] / f"DocMap-{d.name}-online-{env['name']}.zip"


AUTOINSTALL_NOTE = """DocMap - pacchetto "autoinstall web" per {url}

Usalo quando l'hub non ha l'accesso FTP: carichi tu i file dal pannello dell'hosting.

1. Nel pannello dell'hosting (es. SiteGround > Site Tools > File Manager) apri la cartella del sito:
   {path}
   (creala se non esiste). NON cancellare una cartella che contiene già DocMap: i dati sono in server-php/data/.
2. Carica questo zip nella cartella e usa "Estrai" (Extract). Sovrascrivi i file se richiesto.
3. Apri {url}server-php/setup.php e segui le schermate: crea la chiave e gli utenti.
   setup.php non crea mai una chiave nuova se trova già un database.
4. Apri {url} ed entra. Nel DocMap Hub premi "Controlla tutto": lo stato diventa Online.

Dettagli tecnici in README-DEPLOY.md (dentro questo zip).
"""


def build_web_zip(hub, env_id: str, log=print) -> Path:
    """(Re)build the web site of an environment and zip it with the autoinstall note."""
    from .runner import run_build_deploy
    reg = hub.registry
    env = reg.get_environment(env_id)
    if env["kind"] != "web-php":
        raise RegistryError("L'autoinstall web esiste solo per i siti online (web-php).")
    s = env.get("settings") or {}
    url = env.get("url") or ""
    zp = web_zip_path(hub, env)
    site = zp.parent / "sito"
    zp.parent.mkdir(parents=True, exist_ok=True)
    parts = urlsplit(url)
    res = run_build_deploy(site, base_path=s.get("base_path") or parts.path or "/", slug=s.get("slug") or "studio",
                           domain=s.get("domain") or (f"{parts.scheme}://{parts.netloc}" if parts.netloc else "https://example.invalid"),
                           studio_name=s.get("studio_name") or "", reg=reg)
    tmp = zp.with_suffix(".tmp")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("LEGGIMI-AUTOINSTALL.txt", AUTOINSTALL_NOTE.format(url=url or "(indirizzo del sito)/",
                                                                      path=s.get("base_path") or parts.path or "/").replace("\n", "\r\n"))
        for f in sorted(site.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(site).as_posix())
    tmp.replace(zp)
    reg.log("package.web", "environment", env["id"], {"version": res.get("version")})
    log(f"Pacchetto autoinstall pronto: {zp.name} (versione {res.get('version') or '?'})")
    return zp


# ---------------------------------------------------------------------------
# v0.11: «pronto da installare» — the office package with the bridge code inside
# ---------------------------------------------------------------------------

QUICK_BAT = ("@echo off\r\n"
             "rem DocMap - installazione in sede SENZA DOMANDE (pacchetto pronto del hub).\r\n"
             "rem Nome dello studio, licenza e collegamento al sito sono gia dentro il pacchetto.\r\n"
             "setlocal\r\ncd /d \"%~dp0\"\r\n"
             "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0installa.ps1\" -NonChiedere -Admin admin %*\r\n"
             "pause\r\nendlocal\r\n")


def bridge_token(hub, vk, customer_id: str) -> str | None:
    """The ``ponte-sync`` code of the customer's production web site (None when there is no such site yet)."""
    from .sitesetup import BRIDGE_USER
    from .vault import Vault
    reg, vault = hub.registry, Vault(hub.registry)
    for e in reg.list_environments():
        if e["customer_id"] == customer_id and e["kind"] == "web-php" and e["name"] == "production":
            d = vault.get(vk, e["id"], "admin_token", BRIDGE_USER, reason="pacchetto della sede", required=False)
            if d and d.get("token"):
                return d["token"]
    return None


def sede_ready_zip(hub, vk, customer_id: str) -> tuple[str, bytes, bool]:
    """The office package as built by the onboarding, plus (in memory only, never on the hub disk):
    ``cliente/token-ponte.txt`` — the bridge code, read by installa.ps1 and deleted after use — and
    ``INSTALLA-SENZA-DOMANDE.bat``. Returns (name, bytes, has_bridge_code)."""
    f = sede_zip(hub, customer_id)
    if not f or not f.is_file():
        raise RegistryError("Pacchetto della sede non ancora preparato: scheda del cliente → Rigenera i pacchetti.")
    tok = bridge_token(hub, vk, customer_id) if vk is not None else None
    src = zipfile.ZipFile(f)
    names = src.namelist()
    root = names[0].split("/", 1)[0] + "/" if names and "/" in names[0] else ""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for info in src.infolist():
            if info.filename in (f"{root}cliente/token-ponte.txt", f"{root}INSTALLA-SENZA-DOMANDE.bat"):
                continue
            z.writestr(info, src.read(info.filename))
        z.writestr(f"{root}INSTALLA-SENZA-DOMANDE.bat", QUICK_BAT)
        if tok:
            z.writestr(f"{root}cliente/token-ponte.txt", tok + "\r\n")
    src.close()
    hub.registry.log("package.download", "sede", customer_id, {"file": f.name, "bridge_code": bool(tok)})
    return f.name, buf.getvalue(), bool(tok)
