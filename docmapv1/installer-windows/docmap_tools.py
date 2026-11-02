#!/usr/bin/env python3
"""DocMap — strumenti per l'installazione in sede (Windows), parte in Python.

Gli script PowerShell (installa.ps1, backup.ps1, ripristina.ps1, aggiorna.ps1, disinstalla.ps1) fanno solo le cose
"di Windows" (attività pianificate, firewall, permessi, domande all'utente). Tutto il resto sta qui, in Python
standard (più `cryptography`/`uvicorn` solo per `cert` e `serve`, già installati nel venv del server), così si prova
anche su Linux: `python3 -m unittest discover -s docmapv1/installer-windows/tests`.

Cartella fissa (convenzione di Dave), qui chiamata BASE (predefinita C:\\DocMap):

    BASE\\app\\             programma web (index.html, scan.html, assets, vendor, docmap.config.js per la rete locale)
    BASE\\server\\          server Python (docmap_server, requirements.txt)        ← sostituita dagli aggiornamenti
    BASE\\venv\\            ambiente Python del server
    BASE\\strumenti\\       questi script                                         ← sostituita dagli aggiornamenti
    BASE\\config\\config.json   chiave AES e token (MAI sostituita)
    BASE\\dati\\            docmap.sqlite, licence\\, instance.json            (MAI sostituita)
    BASE\\certificati\\     certificato della rete locale (CA dello studio + certificato del server)
    BASE\\backup\\          docmap_AAAAMMGG_HHMM.zip (ultimi 30)
    BASE\\log\\             server.log, backup.log
    BASE\\impostazioni.json porta, nome dello studio, backup (MAI sostituita: si aggiungono solo le chiavi nuove)

Comandi (python docmap_tools.py <comando> --base C:\\DocMap ...):
    impostazioni     crea/completa impostazioni.json e stampa le impostazioni effettive (JSON)
    config-js        scrive BASE\\app\\docmap.config.js (modo web, API sulla stessa origine /api)
    indirizzi        stampa gli indirizzi IPv4 privati di questo PC
    cert             crea la CA dello studio (una volta) e (ri)emette il certificato del server se serve
    pagina-indirizzo scrive BASE\\LEGGIMI-INDIRIZZO.txt e BASE\\INDIRIZZO-QR.html
    backup           copia coerente di docmap.sqlite (API di backup di SQLite) + config in uno zip, conserva gli ultimi N
    elenco-backup    elenca i backup (più recenti prima)
    ripristina       ripristina uno zip di backup (conserva i dati attuali in una copia di sicurezza)
    verifica-zip     controlla uno zip di backup senza ripristinarlo
    ping             chiede ?r=ping al server (exit 0 se risponde ok)
    pacchetto        (sul PC di sviluppo) prepara la cartella/zip da portare in studio
    serve            avvia il server (HTTPS sulla rete locale + pagina del certificato in HTTP); lo usa l'attività pianificata
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import ipaddress
import json
import os
import re
import shutil
import socket
import sqlite3
import ssl
import sys
import tempfile
import time
import urllib.request
import zipfile

TOOLS_VERSION = "1.0.0"
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_BASE = r"C:\DocMap"

DEFAULT_SETTINGS = {
    "porta": 8443,                 # HTTPS: programma + API
    "porta_http": 8080,            # HTTP: solo la pagina per scaricare il certificato + rinvio a HTTPS (0 = spento)
    "nome_studio": "",
    "slug": "studio",
    "backup_da_tenere": 30,
    "seconda_destinazione": "",    # es. "E:\\BackupDocMap" (chiavetta USB) o "\\\\NAS\\backup\\docmap"
    "seconda_da_tenere": 30,
    "ora_backup": "12:30",
    "indirizzo_preferito": "",     # IP da mostrare se il PC ne ha più di uno (vuoto = scelto da solo)
}

BACKUP_RE = re.compile(r"^docmap_(\d{8})_(\d{4})(?:_(\d+))?\.zip$")
DB_NAME = "docmap.sqlite"
LAN_NETS = tuple(ipaddress.IPv4Network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
SQLITE_SIDE = ("docmap.sqlite", "docmap.sqlite-wal", "docmap.sqlite-shm", "docmap.sqlite-journal")


class ToolError(Exception):
    """Errore da mostrare all'utente (in italiano), senza traccia Python."""


# ---------------------------------------------------------------- percorsi e impostazioni

def paths(base: str) -> dict:
    b = os.path.abspath(base)
    j = lambda *p: os.path.join(b, *p)   # noqa: E731
    return {"base": b, "app": j("app"), "server": j("server"), "venv": j("venv"), "strumenti": j("strumenti"),
            "config_dir": j("config"), "config": j("config", "config.json"), "dati": j("dati"),
            "certificati": j("certificati"), "backup": j("backup"), "log": j("log"),
            "impostazioni": j("impostazioni.json"), "leggimi": j("LEGGIMI-INDIRIZZO.txt"), "pagina_qr": j("INDIRIZZO-QR.html"),
            "versioni": j("_versioni")}


def _read_json(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def _write_text_atomic(path, text):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp-" + os.urandom(4).hex()
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    os.replace(tmp, path)


def load_settings(base: str) -> dict:
    """Impostazioni effettive: predefiniti + impostazioni.json (le chiavi sconosciute restano, i tipi sbagliati no)."""
    s = dict(DEFAULT_SETTINGS)
    p = paths(base)["impostazioni"]
    if os.path.isfile(p):
        try:
            raw = _read_json(p)
        except (OSError, ValueError) as e:
            raise ToolError("impostazioni.json non è leggibile (%s): correggilo o spostalo altrove." % e)
        if not isinstance(raw, dict):
            raise ToolError("impostazioni.json deve contenere un oggetto JSON {...}.")
        for k, v in raw.items():
            if k in DEFAULT_SETTINGS and type(DEFAULT_SETTINGS[k]) is int:
                try:
                    v = int(v)
                except (TypeError, ValueError):
                    continue
            elif k in DEFAULT_SETTINGS and not isinstance(v, str):
                continue
            s[k] = v
    s["backup_da_tenere"] = max(1, s["backup_da_tenere"])
    s["seconda_da_tenere"] = max(1, s["seconda_da_tenere"])
    for k in ("porta", "porta_http"):
        if not (0 <= s[k] <= 65535):
            s[k] = DEFAULT_SETTINGS[k]
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", s["ora_backup"]):
        s["ora_backup"] = DEFAULT_SETTINGS["ora_backup"]
    return s


def ensure_settings(base: str, updates: dict | None = None) -> dict:
    """Crea impostazioni.json se manca; se c'è aggiunge solo le chiavi mancanti (e quelle in `updates`, se non vuote).
    Non cancella né cambia le chiavi già presenti, salvo `updates`."""
    p = paths(base)["impostazioni"]
    raw = {}
    if os.path.isfile(p):
        raw = _read_json(p)
        if not isinstance(raw, dict):
            raise ToolError("impostazioni.json deve contenere un oggetto JSON {...}.")
    changed = not os.path.isfile(p)
    for k, v in DEFAULT_SETTINGS.items():
        if k not in raw:
            raw[k] = v
            changed = True
    for k, v in (updates or {}).items():
        if v not in (None, "") and raw.get(k) != v:
            raw[k] = v
            changed = True
    if changed:
        _write_text_atomic(p, json.dumps(raw, ensure_ascii=False, indent=2) + "\n")
    return load_settings(base)


def slugify(name: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40].strip("-")
    return s or "studio"


def read_config(base: str) -> dict:
    p = paths(base)["config"]
    if not os.path.isfile(p):
        raise ToolError("Configurazione non trovata: %s (DocMap non è ancora installato?)" % p)
    try:
        c = _read_json(p)
    except (OSError, ValueError) as e:
        raise ToolError("config.json non è leggibile: %s" % e)
    if not isinstance(c, dict) or not c.get("data_dir"):
        raise ToolError("config.json non contiene data_dir.")
    return c


# ---------------------------------------------------------------- docmap.config.js e indirizzi

def config_js(settings: dict) -> str:
    cfg = {"mode": "web", "basePath": "/", "apiBase": "/api", "studioSlug": settings.get("slug") or "studio",
           "studioName": settings.get("nome_studio") or ""}
    return ("/* DocMap 2026 — configurazione per l'installazione in sede (rete locale), scritta da\n"
            "   installer-windows/docmap_tools.py (config-js) a ogni installazione/aggiornamento: non modificarla a mano.\n"
            "   mode \"web\": accesso con utente e PIN su ogni dispositivo; apiBase \"/api\": database del server sulla stessa origine. */\n"
            "window.DOCMAP_CONFIG = Object.freeze(" + json.dumps(cfg, ensure_ascii=False, indent=2) + ");\n")


def is_lan_ipv4(ip: str) -> bool:
    """Solo le reti private RFC 1918 (10/8, 172.16/12, 192.168/16): le stesse ammesse dalla CA dello studio."""
    try:
        a = ipaddress.IPv4Address(ip)
    except ValueError:
        return False
    return any(a in n for n in LAN_NETS)


def lan_ipv4_addresses() -> list:
    """IPv4 privati di questo PC; il primo è quello usato per uscire verso la rete (nessun pacchetto viene inviato)."""
    found = []
    for probe in ("192.168.0.1", "10.0.0.1", "8.8.8.8"):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                s.connect((probe, 9))
                ip = s.getsockname()[0]
            finally:
                s.close()
            if is_lan_ipv4(ip) and ip not in found:
                found.append(ip)
        except OSError:
            pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if is_lan_ipv4(ip) and ip not in found:
                found.append(ip)
    except OSError:
        pass
    return found


def choose_ip(ips: list, preferred: str = "") -> str:
    if preferred and preferred in ips:
        return preferred
    for prefix in ("192.168.", "10.", "172."):
        for ip in ips:
            if ip.startswith(prefix):
                return ip
    return ips[0] if ips else "127.0.0.1"


def urls(settings: dict, ip: str) -> dict:
    port, hport = settings["porta"], settings["porta_http"]
    https = "https://%s%s/" % (ip, "" if port == 443 else ":%d" % port)
    http = ("http://%s%s/" % (ip, "" if hport == 80 else ":%d" % hport)) if hport else ""
    return {"app": https, "api": https + "api", "certificato": http, "qr_dest": https + "q/{short_code}"}


# ---------------------------------------------------------------- certificati (rete locale)

CA_CERT, CA_KEY, SRV_CERT, SRV_KEY = "DocMap-CA-studio.crt", "ca.key", "server.crt", "server.key"
SERVER_DAYS = 800          # iOS accetta certificati di server fino a 825 giorni
RENEW_BEFORE_DAYS = 60


def _x509():
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
    except ImportError:
        raise ToolError("Manca il pacchetto 'cryptography': usa il Python dell'ambiente del server (BASE\\venv).")
    return x509, hashes, serialization, ec, ExtendedKeyUsageOID, NameOID


def cert_names(hostname: str, ips: list) -> tuple:
    """(nomi DNS, IP) da mettere nel certificato del server."""
    h = re.sub(r"[^A-Za-z0-9-]", "", (hostname or "").split(".")[0]).lower()
    dns = ["localhost"] + ([h, h + ".local"] if h else [])
    allip = ["127.0.0.1"] + [ip for ip in ips if is_lan_ipv4(ip)]
    return sorted(set(dns)), sorted(set(allip), key=lambda x: ipaddress.IPv4Address(x))


def ensure_certificates(cert_dir: str, studio: str, hostname: str, ips: list, now=None) -> dict:
    """Crea la CA dello studio se manca; (ri)emette il certificato del server se manca, se scade entro 60 giorni o se
    nomi/IP non coincidono più (es. l'IP del PC è cambiato). Restituisce {"ca_creata", "server_emesso", "dns", "ip", ...}.
    La CA ha "name constraints": vale solo per indirizzi della rete privata e per nomi .local/localhost/nome del PC,
    così anche se la sua chiave finisse in mani sbagliate non servirebbe a falsificare siti Internet."""
    x509, hashes, serialization, ec, EKU, NameOID = _x509()
    now = now or _dt.datetime.now(_dt.timezone.utc)
    os.makedirs(cert_dir, exist_ok=True)
    pca, pkey = os.path.join(cert_dir, CA_CERT), os.path.join(cert_dir, CA_KEY)
    psc, psk = os.path.join(cert_dir, SRV_CERT), os.path.join(cert_dir, SRV_KEY)
    dns, ipl = cert_names(hostname, ips)
    out = {"ca_creata": False, "server_emesso": False, "dns": dns, "ip": ipl, "ca": pca, "cert": psc, "key": psk}

    def pem_key(k):
        return k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())

    if not (os.path.isfile(pca) and os.path.isfile(pkey)):
        key = ec.generate_private_key(ec.SECP256R1())
        h = re.sub(r"[^A-Za-z0-9-]", "", (hostname or "").split(".")[0]).lower()
        permitted = [x509.IPAddress(ipaddress.IPv4Network(n)) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8")]
        permitted += [x509.DNSName("local"), x509.DNSName("localhost")] + ([x509.DNSName(h)] if h else [])
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, ("DocMap CA " + (studio or "studio"))[:64]),
                          x509.NameAttribute(NameOID.ORGANIZATION_NAME, "DocMap (installazione locale)")])
        ca = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
              .serial_number(x509.random_serial_number())
              .not_valid_before(now - _dt.timedelta(days=1)).not_valid_after(now + _dt.timedelta(days=3650))
              .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
              .add_extension(x509.KeyUsage(digital_signature=True, key_cert_sign=True, crl_sign=True, content_commitment=False,
                                           key_encipherment=False, data_encipherment=False, key_agreement=False,
                                           encipher_only=False, decipher_only=False), critical=True)
              .add_extension(x509.NameConstraints(permitted_subtrees=permitted, excluded_subtrees=None), critical=True)
              .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
              .sign(key, hashes.SHA256()))
        _write_bytes_private(pkey, pem_key(key))
        _write_bytes_private(pca, ca.public_bytes(serialization.Encoding.PEM))
        for stale in (psc, psk):          # un certificato vecchio firmato da un'altra CA non serve più
            if os.path.isfile(stale):
                os.replace(stale, stale + ".old")
        out["ca_creata"] = True
    with open(pca, "rb") as f:
        ca = x509.load_pem_x509_certificate(f.read())
    with open(pkey, "rb") as f:
        ca_key = serialization.load_pem_private_key(f.read(), password=None)
    # i nomi fuori dai "name constraints" della CA non possono stare nel certificato del server
    try:
        nc = ca.extensions.get_extension_for_class(x509.NameConstraints).value
        okdns = {d.value.lower() for d in nc.permitted_subtrees if isinstance(d, x509.DNSName)}
        dns = [d for d in dns if d in okdns or d.rsplit(".", 1)[-1] in okdns]
        out["dns"] = dns
    except x509.ExtensionNotFound:
        pass

    need = True
    if os.path.isfile(psc) and os.path.isfile(psk):
        try:
            with open(psc, "rb") as f:
                cur = x509.load_pem_x509_certificate(f.read())
            san = cur.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
            cur_dns = sorted(san.get_values_for_type(x509.DNSName))
            cur_ip = sorted((str(i) for i in san.get_values_for_type(x509.IPAddress)), key=lambda x: ipaddress.ip_address(x))
            expires = cur.not_valid_after_utc if hasattr(cur, "not_valid_after_utc") else cur.not_valid_after.replace(tzinfo=_dt.timezone.utc)
            need = not (cur_dns == dns and cur_ip == ipl and expires - now > _dt.timedelta(days=RENEW_BEFORE_DAYS)
                        and cur.issuer == ca.subject)
        except Exception:   # noqa: BLE001 — certificato illeggibile: si riemette
            need = True
    if need:
        key = ec.generate_private_key(ec.SECP256R1())
        cn = dns[1] if len(dns) > 1 else (ipl[-1] if ipl else "localhost")
        sans = [x509.DNSName(d) for d in dns] + [x509.IPAddress(ipaddress.IPv4Address(i)) for i in ipl]
        cert = (x509.CertificateBuilder()
                .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn[:64])])).issuer_name(ca.subject)
                .public_key(key.public_key()).serial_number(x509.random_serial_number())
                .not_valid_before(now - _dt.timedelta(days=1)).not_valid_after(now + _dt.timedelta(days=SERVER_DAYS))
                .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
                .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=False, key_cert_sign=False, crl_sign=False,
                                             content_commitment=False, data_encipherment=False, key_agreement=True,
                                             encipher_only=False, decipher_only=False), critical=True)
                .add_extension(x509.ExtendedKeyUsage([EKU.SERVER_AUTH]), critical=False)
                .add_extension(x509.SubjectAlternativeName(sans), critical=False)
                .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
                .sign(ca_key, hashes.SHA256()))
        _write_bytes_private(psk, pem_key(key))
        _write_bytes_private(psc, cert.public_bytes(serialization.Encoding.PEM) + ca.public_bytes(serialization.Encoding.PEM))
        out["server_emesso"] = True
    return out


def _write_bytes_private(path, data: bytes):
    tmp = path + ".tmp-" + os.urandom(4).hex()
    with open(tmp, "wb") as f:
        f.write(data)
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    os.replace(tmp, path)


# ---------------------------------------------------------------- pagina dell'indirizzo

def address_texts(settings: dict, ip: str, all_ips: list) -> tuple:
    u = urls(settings, ip)
    others = [i for i in all_ips if i != ip]
    lines = [
        "DocMap - indirizzo nella rete dello studio",
        "==========================================",
        "",
        "Programma (PC e telefoni collegati al Wi-Fi/rete dello studio):",
        "    " + u["app"],
        "",
    ]
    if u["certificato"]:
        lines += ["Prima volta su ogni telefono/PC: installa il certificato dello studio da",
                  "    " + u["certificato"],
                  "(spiegazione nella pagina e in GUIDA-INSTALLAZIONE.md, sezione 5).", ""]
    lines += ["Destinazione dei QR dei faldoni (DocMap > Impostazioni > Destinazione finale):",
              "    " + u["qr_dest"], "",
              "Indirizzo del database per DocMap sul PC (Sincronizzazione > Server online):",
              "    " + u["api"], ""]
    if others:
        lines += ["Altri indirizzi di questo PC (se il primo non funziona): " + ", ".join(others), ""]
    lines += ["Se l'indirizzo cambia (router nuovo, IP diverso), riavvia il PC: il certificato si aggiorna da solo;",
              "poi apri di nuovo questo file. Consiglio: chiedi a chi gestisce il router un IP fisso per questo PC.",
              "", "Scritto il " + time.strftime("%d/%m/%Y %H:%M") + "."]
    txt = "\r\n".join(lines) + "\r\n"

    def esc(s):
        return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    studio = esc(settings.get("nome_studio") or "DocMap")
    cert_block = ""
    if u["certificato"]:
        cert_block = ('<section><h2>1 · Una volta per dispositivo: il certificato</h2><div class="qr" data-url="%s"></div>'
                      '<p class="u">%s</p><p>Inquadra con la fotocamera, apri la pagina e segui le istruzioni.</p></section>'
                      % (esc(u["certificato"]), esc(u["certificato"])))
    html = """<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DocMap · indirizzo</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;color:#0F172A;margin:24px}h1{font-size:22px}h2{font-size:16px}
main{display:flex;gap:32px;flex-wrap:wrap}section{border:1px solid #CBD5E1;border-radius:12px;padding:16px;width:300px}
.qr svg{width:260px;height:260px}.u{font-family:Consolas,monospace;font-size:15px;word-break:break-all}
@media print{button{display:none}}</style></head>
<body><h1>DocMap · %s</h1><p>Da appendere vicino alla stampante: collega il telefono al Wi-Fi dello studio e inquadra.</p>
<main>%s<section><h2>%s · DocMap</h2><div class="qr" data-url="%s"></div><p class="u">%s</p>
<p>Si apre DocMap: primo accesso con nome utente, PIN e codice di accesso ricevuto dall'amministratore.</p></section></main>
<p><button onclick="print()">Stampa</button></p>
<script src="app/assets/js/01-qr.js"></script>
<script>document.querySelectorAll('.qr').forEach(function(d){ try { d.innerHTML = DMQR.svg(d.getAttribute('data-url'), {ecl:'M'}); } catch(e){ d.textContent = '(QR non disponibile: usa l\\'indirizzo scritto sotto)'; } });</script>
</body></html>
""" % (studio, cert_block, "2" if cert_block else "", esc(u["app"]), esc(u["app"]))
    return txt, html


# ---------------------------------------------------------------- backup e ripristino

def backup_name(now: _dt.datetime, existing=()) -> str:
    base = "docmap_%s" % now.strftime("%Y%m%d_%H%M")
    name, n = base + ".zip", 2
    while name in existing:
        name = "%s_%d.zip" % (base, n)
        n += 1
    return name


def list_backups(folder: str) -> list:
    """Zip di backup in `folder`, dal più recente al più vecchio (ordine dal nome: data, ora, progressivo)."""
    if not folder or not os.path.isdir(folder):
        return []
    out = []
    for n in os.listdir(folder):
        m = BACKUP_RE.match(n)
        if m and os.path.isfile(os.path.join(folder, n)):
            out.append(((m.group(1), m.group(2), int(m.group(3) or 1)), n))
    return [n for _, n in sorted(out, reverse=True)]


def apply_retention(folder: str, keep: int, trash: str | None = None) -> list:
    """Tiene gli ultimi `keep` backup; gli altri vengono eliminati (o spostati in `trash`, se indicato).
    Tocca solo i file col nome docmap_AAAAMMGG_HHMM[_N].zip. Restituisce i nomi tolti."""
    keep = max(1, int(keep))
    removed = []
    for n in list_backups(folder)[keep:]:
        p = os.path.join(folder, n)
        if trash:
            os.makedirs(trash, exist_ok=True)
            os.replace(p, os.path.join(trash, n))
        else:
            os.remove(p)
        removed.append(n)
    return removed


def _sqlite_backup(src_path: str, dst_path: str) -> dict:
    """Copia coerente con l'API di backup di SQLite (funziona anche mentre il server scrive, WAL compreso)."""
    src = sqlite3.connect(src_path, timeout=30)
    try:
        dst = sqlite3.connect(dst_path)
        try:
            src.backup(dst, pages=256, sleep=0.05)
            dst.execute("PRAGMA journal_mode=DELETE")
            res = dst.execute("PRAGMA integrity_check").fetchone()[0]
            tables = [r[0] for r in dst.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
            counts = {}
            for t in tables:
                counts[t] = dst.execute('SELECT COUNT(*) FROM "%s"' % t.replace('"', '""')).fetchone()[0]
        finally:
            dst.close()
    finally:
        src.close()
    if res != "ok":
        raise ToolError("Il controllo di integrità della copia non è riuscito (%s): backup annullato." % res)
    return counts


def _sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def make_backup(base: str, dest: str | None = None, keep: int | None = None, now=None, second: str | None = None) -> dict:
    """Crea BASE\\backup\\docmap_AAAAMMGG_HHMM.zip con:
         docmap.sqlite (copia coerente), config/config.json, dati/<altri file: licence/, instance.json…>,
         impostazioni.json, MANIFEST.json (data, versione, sha256, righe per tabella).
       Poi tiene gli ultimi `keep` e copia lo zip nella seconda destinazione (se c'è), con la stessa regola."""
    p = paths(base)
    s = load_settings(base)
    cfg = read_config(base)
    data_dir = cfg["data_dir"]
    dest = dest or p["backup"]
    keep = s["backup_da_tenere"] if keep is None else keep
    second = s["seconda_destinazione"] if second is None else second
    now = now or _dt.datetime.now()
    os.makedirs(dest, exist_ok=True)
    name = backup_name(now, set(os.listdir(dest)))
    final = os.path.join(dest, name)
    tmpdir = tempfile.mkdtemp(prefix="docmap-backup-", dir=dest)
    manifest = {"formato": 1, "creato": now.strftime("%Y-%m-%dT%H:%M:%S"), "host": socket.gethostname(),
                "strumenti": TOOLS_VERSION, "data_dir": data_dir, "file": {}, "righe": {}}
    try:
        db = os.path.join(data_dir, DB_NAME)
        entries = []
        if os.path.isfile(db):
            copy = os.path.join(tmpdir, DB_NAME)
            manifest["righe"] = _sqlite_backup(db, copy)
            entries.append((copy, DB_NAME))
        else:
            manifest["nota"] = "docmap.sqlite non esiste ancora (nessun dato inviato al server)"
        entries.append((p["config"], "config/config.json"))
        if os.path.isfile(p["impostazioni"]):
            entries.append((p["impostazioni"], "impostazioni.json"))
        for root, dirs, files in os.walk(data_dir):
            dirs[:] = sorted(d for d in dirs if not d.startswith("_prima-del-ripristino"))
            for f in sorted(files):
                full = os.path.join(root, f)
                rel = os.path.relpath(full, data_dir).replace(os.sep, "/")
                if rel in SQLITE_SIDE or ".tmp" in f:
                    continue
                entries.append((full, "dati/" + rel))
        tmpzip = os.path.join(tmpdir, name)
        with zipfile.ZipFile(tmpzip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for src, arc in entries:
                manifest["file"][arc] = _sha256_file(src)
                z.write(src, arc)
            z.writestr("MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        verify_zip(tmpzip)
        os.replace(tmpzip, final)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    removed = apply_retention(dest, keep)
    out = {"zip": final, "nome": name, "byte": os.path.getsize(final), "tolti": removed, "righe": manifest["righe"],
           "seconda": None, "seconda_errore": None}
    if second:
        try:
            os.makedirs(second, exist_ok=True)
            tmp = os.path.join(second, name + ".parziale")
            shutil.copyfile(final, tmp)
            os.replace(tmp, os.path.join(second, name))
            apply_retention(second, s["seconda_da_tenere"])
            out["seconda"] = os.path.join(second, name)
        except OSError as e:
            out["seconda_errore"] = "Copia nella seconda destinazione %s non riuscita: %s" % (second, e)
    return out


def verify_zip(zpath: str) -> dict:
    """Controlla uno zip di backup: CRC, MANIFEST, sha256 dei file, integrità di docmap.sqlite. Restituisce il MANIFEST."""
    if not os.path.isfile(zpath):
        raise ToolError("File non trovato: %s" % zpath)
    try:
        with zipfile.ZipFile(zpath) as z:
            bad = z.testzip()
            if bad:
                raise ToolError("Lo zip è danneggiato (file %s)." % bad)
            names = set(z.namelist())
            if "MANIFEST.json" not in names or "config/config.json" not in names:
                raise ToolError("Questo zip non è un backup di DocMap (mancano MANIFEST.json o config/config.json).")
            man = json.loads(z.read("MANIFEST.json").decode("utf-8"))
            for arc, digest in man.get("file", {}).items():
                if arc not in names or hashlib.sha256(z.read(arc)).hexdigest() != digest:
                    raise ToolError("Il file %s nello zip non corrisponde al MANIFEST." % arc)
            for n in names:
                if n.startswith("/") or ".." in n.split("/") or ":" in n:
                    raise ToolError("Percorso non ammesso nello zip: %s" % n)
            if DB_NAME in names:
                tmpdir = tempfile.mkdtemp(prefix="docmap-verify-")
                try:
                    z.extract(DB_NAME, tmpdir)
                    con = sqlite3.connect(os.path.join(tmpdir, DB_NAME))
                    try:
                        res = con.execute("PRAGMA integrity_check").fetchone()[0]
                    finally:
                        con.close()
                finally:
                    shutil.rmtree(tmpdir, ignore_errors=True)
                if res != "ok":
                    raise ToolError("Il database nello zip non supera il controllo di integrità (%s)." % res)
    except zipfile.BadZipFile:
        raise ToolError("Il file non è uno zip valido: %s" % zpath)
    return man


def restore_backup(base: str, zpath: str, now=None) -> dict:
    """Ripristina uno zip di backup. Il server deve essere FERMO (lo fa ripristina.ps1).
    - i dati attuali (docmap.sqlite*, licence/, instance.json, …) vanno in dati\\_prima-del-ripristino_AAAAMMGG_HHMMSS\\
      insieme alla config attuale: non si cancella niente;
    - si rimettono il database e i file di dati dello zip;
    - config.json: se la chiave aes_key dello zip è diversa da quella attuale si rimette quella dello zip (senza la
      sua chiave il database ripristinato non si leggerebbe); altrimenti resta la config attuale."""
    man = verify_zip(zpath)
    p = paths(base)
    cfg = read_config(base)
    data_dir = cfg["data_dir"]
    now = now or _dt.datetime.now()
    safety = os.path.join(data_dir, "_prima-del-ripristino_" + now.strftime("%Y%m%d_%H%M%S"))
    os.makedirs(safety, exist_ok=False)
    moved = []
    for n in sorted(os.listdir(data_dir)):
        if n.startswith("_prima-del-ripristino") or n in (".htaccess", "index.html"):
            continue
        os.replace(os.path.join(data_dir, n), os.path.join(safety, n))
        moved.append(n)
    shutil.copyfile(p["config"], os.path.join(safety, "config.json"))
    try:
        config_restored = _restore_files(zpath, p, cfg, data_dir)
    except Exception:
        # qualcosa è andato storto: si rimettono i dati di prima
        for n in os.listdir(data_dir):
            if n.startswith("_prima-del-ripristino") or n in (".htaccess", "index.html"):
                continue
            junk = os.path.join(safety, "_ripristino-non-riuscito")
            os.makedirs(junk, exist_ok=True)
            os.replace(os.path.join(data_dir, n), os.path.join(junk, n))
        for n in moved:
            os.replace(os.path.join(safety, n), os.path.join(data_dir, n))
        shutil.copyfile(os.path.join(safety, "config.json"), p["config"])
        raise
    return {"copia_di_sicurezza": safety, "spostati": moved, "config_ripristinata": config_restored,
            "backup_del": man.get("creato"), "righe": man.get("righe", {})}


def _restore_files(zpath, p, cfg, data_dir) -> bool:
    config_restored = False
    with zipfile.ZipFile(zpath) as z:
        zcfg = json.loads(z.read("config/config.json").decode("utf-8-sig"))
        for n in z.namelist():
            if n == DB_NAME:
                target = os.path.join(data_dir, DB_NAME)
            elif n.startswith("dati/") and not n.endswith("/"):
                rel = n[len("dati/"):]
                if rel in (".htaccess", "index.html") and os.path.exists(os.path.join(data_dir, rel)):
                    continue
                target = os.path.join(data_dir, *rel.split("/"))
            else:
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with z.open(n) as src, open(target + ".tmp-r", "wb") as dst:
                shutil.copyfileobj(src, dst)
            os.replace(target + ".tmp-r", target)
        if zcfg.get("aes_key") != cfg.get("aes_key"):
            zcfg["data_dir"] = data_dir      # la cartella dati è quella di questa installazione
            _write_text_atomic(p["config"], json.dumps(zcfg, ensure_ascii=False, indent=2) + "\n")
            config_restored = True
    return config_restored


# ---------------------------------------------------------------- ping

def ping(url: str, cafile: str | None = None, timeout: float = 5.0, insecure: bool = False) -> dict:
    """GET <url>?r=ping. Con `cafile` verifica il certificato con la CA dello studio (il nome 127.0.0.1 è nel certificato)."""
    u = url + ("&" if "?" in url else "?") + "r=ping"
    ctx = None
    if u.startswith("https:"):
        if insecure:
            ctx = ssl._create_unverified_context()   # noqa: S323 — solo per diagnosi esplicita (--insecure)
        else:
            ctx = ssl.create_default_context(cafile=cafile) if cafile and os.path.isfile(cafile) else ssl.create_default_context()
    req = urllib.request.Request(u, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:   # noqa: S310
        body = json.loads(r.read().decode("utf-8"))
    if not (isinstance(body, dict) and body.get("ok") is True):
        raise ToolError("Il server ha risposto ma non 'ok': %r" % (body,))
    return body


def ping_wait(url, cafile=None, seconds=60.0, insecure=False):
    deadline = time.time() + seconds
    last = None
    while True:
        try:
            return ping(url, cafile, insecure=insecure)
        except Exception as e:   # noqa: BLE001
            last = e
        if time.time() >= deadline:
            raise ToolError("Il server non risponde a %s (%s)." % (url, last))
        time.sleep(2)


# ---------------------------------------------------------------- pacchetto (sul PC di sviluppo)

INSTALLER_FILES = ["installa.bat", "installa.ps1", "comune.ps1", "backup.ps1", "ripristina.ps1", "aggiorna.ps1",
                   "disinstalla.ps1", "licenza.ps1", "docmap_tools.py", "GUIDA-INSTALLAZIONE.md"]


def build_package(out: str, make_zip: bool = False, repo_docmap: str | None = None) -> dict:
    """Prepara la cartella da portare in studio:
         <out>/installa.bat, *.ps1, docmap_tools.py, GUIDA-INSTALLAZIONE.md, VERSIONE.txt
         <out>/app/      ← tools/build_deploy.py --no-server --base-path / (poi docmap.config.js viene riscritto in studio)
         <out>/server/   ← server-python/docmap_server + requirements.txt (+ wheels/ se presente in installer-windows/)
    Non cancella niente: `out` deve essere nuova o vuota."""
    docmap = os.path.abspath(repo_docmap or os.path.dirname(HERE))
    if not os.path.isfile(os.path.join(docmap, "tools", "build_deploy.py")):
        raise ToolError("Non trovo tools/build_deploy.py: il comando 'pacchetto' va eseguito dal repository.")
    out = os.path.abspath(out)
    if os.path.exists(out) and os.listdir(out):
        raise ToolError("La cartella %s esiste e non è vuota: scegline una nuova." % out)
    os.makedirs(out, exist_ok=True)
    import subprocess
    r = subprocess.run([sys.executable, os.path.join(docmap, "tools", "build_deploy.py"), os.path.join(out, "app"),
                        "--no-server", "--base-path", "/", "--slug", "studio"], capture_output=True, text=True)
    if r.returncode != 0:
        raise ToolError("build_deploy.py non riuscito: " + (r.stderr or r.stdout))
    _write_text_atomic(os.path.join(out, "app", "docmap.config.js"), config_js(dict(DEFAULT_SETTINGS)))
    srv_src = os.path.join(docmap, "server-python")
    shutil.copytree(os.path.join(srv_src, "docmap_server"), os.path.join(out, "server", "docmap_server"),
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    shutil.copyfile(os.path.join(srv_src, "requirements.txt"), os.path.join(out, "server", "requirements.txt"))
    wheels = os.path.join(HERE, "wheels")
    if os.path.isdir(wheels):
        shutil.copytree(wheels, os.path.join(out, "server", "wheels"))
    for f in INSTALLER_FILES:
        shutil.copyfile(os.path.join(HERE, f), os.path.join(out, f))
    version = app_version(docmap)
    _write_text_atomic(os.path.join(out, "VERSIONE.txt"), "DocMap %s · strumenti %s · %s\n"
                       % (version, TOOLS_VERSION, time.strftime("%Y-%m-%d")))
    manifest = []
    for root, dirs, files in os.walk(out):
        dirs.sort()
        for f in sorted(files):
            full = os.path.join(root, f)
            manifest.append("%s  %s" % (_sha256_file(full), os.path.relpath(full, out).replace(os.sep, "/")))
    _write_text_atomic(os.path.join(out, "PACCHETTO-MANIFEST.txt"), "\n".join(manifest) + "\n")
    res = {"cartella": out, "versione": version, "file": len(manifest) + 1, "zip": None}
    if make_zip:
        zp = out.rstrip("/\\") + ".zip"
        with zipfile.ZipFile(zp, "w", compression=zipfile.ZIP_DEFLATED) as z:
            for root, dirs, files in os.walk(out):
                dirs.sort()
                for f in sorted(files):
                    full = os.path.join(root, f)
                    z.write(full, os.path.relpath(full, out).replace(os.sep, "/"))
        res["zip"] = zp
    return res


def app_version(docmap: str) -> str:
    try:
        with open(os.path.join(docmap, "assets", "js", "02-core.js"), encoding="utf-8") as f:
            m = re.search(r"APP_VERSION\s*=\s*'([^']+)'", f.read())
        return m.group(1) if m else "?"
    except OSError:
        return "?"


def check_package(folder: str) -> list:
    """Cosa manca in una cartella di pacchetto (lista vuota = va bene)."""
    need = ["app/index.html", "app/scan.html", "app/assets/js/01-qr.js", "server/requirements.txt",
            "server/docmap_server/__main__.py", "server/docmap_server/api.py"] + INSTALLER_FILES
    return [n for n in need if not os.path.isfile(os.path.join(folder, *n.split("/")))]


# ---------------------------------------------------------------- serve (attività pianificata)

QR_PATH = re.compile(r"^/q/[A-Za-z0-9_-]{1,40}/?$")
QR_ASSET = re.compile(r"^/q/((?:assets|vendor)/.+|docmap\.config\.js)$")
CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; "
       "base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
STATIC_HEADERS = [(b"x-content-type-options", b"nosniff"), (b"referrer-policy", b"no-referrer"), (b"x-frame-options", b"DENY"),
                  (b"x-robots-tag", b"noindex, nofollow"), (b"permissions-policy", b"camera=(self), microphone=(), geolocation=(), payment=()"),
                  (b"content-security-policy", CSP.encode("ascii")), (b"cache-control", b"no-cache")]


def rewrite_path(path: str) -> str:
    """Le stesse riscritture del .htaccess del deploy: /q/<codice> → /scan.html, /q/assets/… → /assets/…"""
    if QR_PATH.match(path):
        return "/scan.html"
    m = QR_ASSET.match(path)
    if m:
        return "/" + m.group(1)
    return path


def lan_middleware(app, api_paths):
    """ASGI: riscritture dei QR e header di sicurezza per i file statici (le risposte dell'API restano identiche)."""
    api = set(api_paths)

    async def wrapped(scope, receive, send):
        if scope.get("type") != "http":
            return await app(scope, receive, send)
        path = scope.get("path", "")
        if path in api:
            return await app(scope, receive, send)
        new = rewrite_path(path)
        if new != path:
            scope = dict(scope)
            scope["path"] = new
            scope["raw_path"] = new.encode("utf-8")

        async def send2(msg):
            if msg.get("type") == "http.response.start":
                have = {k.lower() for k, _ in msg.get("headers", [])}
                msg = dict(msg)
                msg["headers"] = list(msg.get("headers", [])) + [(k, v) for k, v in STATIC_HEADERS if k not in have]
            await send(msg)
        return await app(scope, receive, send2)
    return wrapped


CERT_PAGE = """<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DocMap · certificato dello studio</title>
<style>body{{font-family:system-ui,sans-serif;max-width:640px;margin:16px auto;padding:0 16px;color:#0F172A}}
a.b{{display:inline-block;background:#2563EB;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;margin:6px 0}}
li{{margin:6px 0}}</style></head><body>
<h1>DocMap · {studio}</h1>
<p>Per usare DocMap in modo protetto (HTTPS) questo dispositivo deve fidarsi del <b>certificato dello studio</b>.
Si fa <b>una volta sola</b> per dispositivo.</p>
<p><a class="b" href="/DocMap-CA-studio.crt">1. Scarica il certificato</a></p>
<h2>Android</h2><ol><li>Apri il file scaricato oppure: Impostazioni › Sicurezza › Altre impostazioni › <i>Installa da memoria</i> ›
<i>Certificato CA</i> (il nome del menu cambia un po' da telefono a telefono: cerca "certificato" nelle Impostazioni).</li>
<li>Conferma "Installa comunque".</li></ol>
<h2>iPhone / iPad</h2><ol><li>Scarica con <b>Safari</b> e scegli "Consenti".</li><li>Impostazioni › <i>Profilo scaricato</i> › Installa.</li>
<li>Impostazioni › Generali › Info › <i>Impostazioni attendibilità certificati</i> › attiva "DocMap CA".</li></ol>
<h2>PC Windows</h2><ol><li>Apri il file › Installa certificato › Computer locale › "Autorità di certificazione radice attendibili".</li></ol>
<p><a class="b" href="{app}">2. Apri DocMap</a></p>
<p style="color:#475569;font-size:14px">Impronta SHA-256 del certificato (per chi vuole controllare):<br><code style="word-break:break-all">{fp}</code></p>
</body></html>
"""


def cert_app(cert_file: str, https_url: str, studio: str):
    """Piccola app ASGI in HTTP: pagina del certificato e /DocMap-CA-studio.crt; tutto il resto → HTTPS."""
    with open(cert_file, "rb") as f:
        pem = f.read()
    try:
        x509 = _x509()[0]
        from cryptography.hazmat.primitives import hashes
        fp = x509.load_pem_x509_certificate(pem).fingerprint(hashes.SHA256()).hex(":").upper()
    except Exception:   # noqa: BLE001
        fp = "?"

    def esc(s):
        return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    async def app(scope, receive, send):
        if scope.get("type") != "http":
            return
        path = scope.get("path", "/")
        host = ""
        for k, v in scope.get("headers", []):
            if k == b"host":
                host = v.decode("latin-1").rsplit(":", 1)[0]
        target = https_url
        if host and re.fullmatch(r"[A-Za-z0-9.-]{1,253}", host):
            target = re.sub(r"^https://[^/:]+", "https://" + host, https_url)
        if path in ("/", "/certificato", "/certificato/"):
            body = CERT_PAGE.format(studio=esc(studio or "studio"), app=esc(target), fp=esc(fp)).encode("utf-8")
            hdr = [(b"content-type", b"text/html; charset=utf-8"), (b"cache-control", b"no-store")]
            status = 200
        elif path == "/DocMap-CA-studio.crt":
            body, status = pem, 200
            hdr = [(b"content-type", b"application/x-x509-ca-cert"),
                   (b"content-disposition", b'attachment; filename="DocMap-CA-studio.crt"')]
        else:
            q = scope.get("query_string", b"").decode("latin-1")
            loc = target.rstrip("/") + path + ("?" + q if q else "")
            body, status, hdr = b"", 302, [(b"location", loc.encode("utf-8", "replace"))]
        hdr.append((b"content-length", str(len(body)).encode()))
        await send({"type": "http.response.start", "status": status, "headers": hdr})
        await send({"type": "http.response.body", "body": body})
    return app


def serve(base: str, host: str = "0.0.0.0") -> int:
    """Avvia il server per la rete locale (lo lancia l'attività pianificata "DocMap Server")."""
    import asyncio
    import logging
    import logging.handlers
    p = paths(base)
    s = load_settings(base)
    os.makedirs(p["log"], exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(os.path.join(p["log"], "server.log"), maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)
    log = logging.getLogger("docmap.lan")
    if p["server"] not in sys.path:
        sys.path.insert(0, p["server"])
    import uvicorn
    from docmap_server.web import create_app
    api_paths = ("/api",)
    ips = lan_ipv4_addresses()
    c = ensure_certificates(p["certificati"], s["nome_studio"], socket.gethostname(), ips)
    log.info("avvio: ip=%s certificato=%s (nuovo=%s)", ips, c["cert"], c["server_emesso"])
    ip = choose_ip(ips, s["indirizzo_preferito"])
    try:   # aggiorna il foglio dell'indirizzo se l'IP è cambiato
        txt, html = address_texts(s, ip, ips)
        _write_text_atomic(p["leggimi"], txt)
        _write_text_atomic(p["pagina_qr"], html)
    except OSError as e:
        log.warning("LEGGIMI-INDIRIZZO.txt non aggiornato: %s", e)
    app = lan_middleware(create_app(p["config"], p["app"], api_paths), api_paths)
    servers = [uvicorn.Server(uvicorn.Config(app, host=host, port=s["porta"], ssl_certfile=c["cert"], ssl_keyfile=c["key"],
                                             log_config=None, server_header=False, access_log=False, proxy_headers=False))]
    if s["porta_http"]:
        servers.append(uvicorn.Server(uvicorn.Config(cert_app(c["ca"], urls(s, ip)["app"], s["nome_studio"]), host=host,
                                                     port=s["porta_http"], log_config=None, server_header=False,
                                                     access_log=False, proxy_headers=False)))

    async def run_all():
        await asyncio.gather(*(sv.serve() for sv in servers))
    asyncio.run(run_all())
    log.info("server fermato")
    return 0


# ---------------------------------------------------------------- riga di comando

def _print_json(obj):
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="docmap_tools.py", description="DocMap — strumenti per l'installazione in sede")
    ap.add_argument("--base", default=os.environ.get("DOCMAP_BASE") or DEFAULT_BASE, help="cartella di DocMap (C:\\DocMap)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("impostazioni")
    a.add_argument("--nome-studio")
    a.add_argument("--porta", type=int)
    a.add_argument("--json", action="store_true")
    sub.add_parser("config-js")
    sub.add_parser("indirizzi")
    sub.add_parser("cert")
    sub.add_parser("pagina-indirizzo")
    b = sub.add_parser("backup")
    b.add_argument("--dest")
    b.add_argument("--tieni", type=int)
    sub.add_parser("elenco-backup")
    r = sub.add_parser("ripristina")
    r.add_argument("zip")
    v = sub.add_parser("verifica-zip")
    v.add_argument("zip")
    pi = sub.add_parser("ping")
    pi.add_argument("--url")
    pi.add_argument("--attendi", type=float, default=0, help="secondi di attesa massima (riprova ogni 2 s)")
    pi.add_argument("--insecure", action="store_true", help="non verificare il certificato (solo diagnosi)")
    pk = sub.add_parser("pacchetto")
    pk.add_argument("--out", required=True)
    pk.add_argument("--zip", action="store_true")
    ck = sub.add_parser("controlla-pacchetto")
    ck.add_argument("cartella")
    sub.add_parser("serve")
    a = ap.parse_args(argv)
    base = a.base
    try:
        if a.cmd == "impostazioni":
            upd = {}
            if a.nome_studio:
                upd["nome_studio"] = a.nome_studio.strip()[:120]
                upd["slug"] = slugify(a.nome_studio)
            if a.porta:
                upd["porta"] = a.porta
            _print_json(ensure_settings(base, upd))
        elif a.cmd == "config-js":
            s = load_settings(base)
            _write_text_atomic(os.path.join(paths(base)["app"], "docmap.config.js"), config_js(s))
            print("Scritto " + os.path.join(paths(base)["app"], "docmap.config.js"))
        elif a.cmd == "indirizzi":
            ips = lan_ipv4_addresses()
            s = load_settings(base)
            _print_json({"indirizzi": ips, "scelto": choose_ip(ips, s["indirizzo_preferito"]), "nome_pc": socket.gethostname()})
        elif a.cmd == "cert":
            s = load_settings(base)
            _print_json(ensure_certificates(paths(base)["certificati"], s["nome_studio"], socket.gethostname(), lan_ipv4_addresses()))
        elif a.cmd == "pagina-indirizzo":
            s = load_settings(base)
            ips = lan_ipv4_addresses()
            ip = choose_ip(ips, s["indirizzo_preferito"])
            txt, html = address_texts(s, ip, ips)
            _write_text_atomic(paths(base)["leggimi"], txt)
            _write_text_atomic(paths(base)["pagina_qr"], html)
            print(txt)
        elif a.cmd == "backup":
            res = make_backup(base, a.dest, a.tieni)
            _print_json(res)
            if res["seconda_errore"]:
                print(res["seconda_errore"], file=sys.stderr)
                return 4
        elif a.cmd == "elenco-backup":
            p = paths(base)
            for n in list_backups(p["backup"]):
                print(os.path.join(p["backup"], n))
        elif a.cmd == "ripristina":
            _print_json(restore_backup(base, a.zip))
        elif a.cmd == "verifica-zip":
            _print_json(verify_zip(a.zip))
        elif a.cmd == "ping":
            s = load_settings(base)
            url = a.url or "https://127.0.0.1:%d/api" % s["porta"]
            ca = os.path.join(paths(base)["certificati"], CA_CERT)
            cafile = ca if url.startswith("https:") else None   # controllato a ogni tentativo: il server può crearlo all'avvio
            body = ping_wait(url, cafile, a.attendi, a.insecure) if a.attendi else ping(url, cafile, insecure=a.insecure)
            _print_json(body)
        elif a.cmd == "pacchetto":
            _print_json(build_package(a.out, a.zip))
        elif a.cmd == "controlla-pacchetto":
            miss = check_package(a.cartella)
            if miss:
                print("Mancano: " + ", ".join(miss), file=sys.stderr)
                return 5
            print("Pacchetto completo.")
        elif a.cmd == "serve":
            return serve(base)
    except ToolError as e:
        print("Errore: %s" % e, file=sys.stderr)
        return 2
    except Exception as e:   # noqa: BLE001 — i ps1 mostrano il messaggio
        print("Errore imprevisto: %s: %s" % (type(e).__name__, e), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
