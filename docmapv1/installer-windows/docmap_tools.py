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
    BASE\\backup\\          docmap_AAAAMMGG_HHMM.docmap-backup (CIFRATI, ultimi 30; i vecchi .zip si ripristinano ancora)
    BASE\\log\\             server.log, backup.log
    BASE\\impostazioni.json porta, nome dello studio, backup (MAI sostituita: si aggiungono solo le chiavi nuove)

Comandi (python docmap_tools.py <comando> --base C:\\DocMap ...):
    impostazioni     crea/completa impostazioni.json e stampa le impostazioni effettive (JSON)
    config-js        scrive BASE\\app\\docmap.config.js (modo web, API sulla stessa origine /api)
    indirizzi        stampa gli indirizzi IPv4 privati di questo PC
    cert             crea la CA dello studio (una volta) e (ri)emette il certificato del server se serve
    pagina-indirizzo scrive BASE\\LEGGIMI-INDIRIZZO.txt e BASE\\INDIRIZZO-QR.html
    backup           copia coerente di docmap.sqlite (API di backup di SQLite) + config in uno zip CIFRATO
                     (.docmap-backup: AES-256-GCM a blocchi, chiave da passphrase con scrypt), conserva gli ultimi N
    elenco-backup    elenca i backup (più recenti prima)
    ripristina       ripristina un backup (.docmap-backup o vecchio .zip; conserva i dati attuali in una copia di sicurezza)
    verifica-zip     controlla un backup (.docmap-backup o .zip) senza ripristinarlo
    verifica-backup  apre l'ultimo backup in una cartella temporanea: integrità SQLite, chiave, conteggio dei record
    esporta-in-chiaro  (emergenza) decifra un .docmap-backup in uno zip NON cifrato, con conferma esplicita
    passphrase-backup  crea/mostra/cambia la passphrase dei backup (BASE\\config\\backup-passphrase.txt)
    kit-emergenza    crea il Kit di emergenza: file .docmap-key (config cifrata col codice di recupero) + pagina da stampare
    stato-kit        dice se il Kit di emergenza c'è ed è aggiornato
    recupera-chiave  ricostruisce config.json da un Kit di emergenza + codice di recupero (PC nuovo, config persa)
    ping             chiede ?r=ping al server (exit 0 se risponde ok)
    pacchetto        (sul PC di sviluppo) prepara la cartella/zip da portare in studio; con --chiave-pubblica,
                     --licenza, --nome-studio, --sync-modello diventa il pacchetto PERSONALE di un cliente (lo fa il hub)
    info-pacchetto   stampa i dati del cliente contenuti in un pacchetto (cliente/cliente.json), {} se generico
    abilita-licenza  mette "licence_required": true in config.json (dopo aver installato una licenza valida)
    configura-sync   crea il profilo del ponte web <-> locale (BASE\\sync\\sync-profile.json, solo amministratori),
                     un codice di accesso "ponte-sync" sul server dello studio e BASE\\sync\\sincronizza.bat
    serve            avvia il server (HTTPS sulla rete locale + pagina del certificato in HTTP); lo usa l'attività pianificata
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import shutil
import socket
import sqlite3
import ssl
import struct
import sys
import tempfile
import time
import urllib.request
import zipfile

TOOLS_VERSION = "1.2.0"
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

BACKUP_RE = re.compile(r"^docmap_(\d{8})_(\d{4})(?:_(\d+))?\.(zip|docmap-backup)$")
BACKUP_EXT = ".docmap-backup"     # backup cifrati (dalla versione 1.1.0 degli strumenti); ".zip" = vecchi backup in chiaro
DB_NAME = "docmap.sqlite"
LAN_NETS = tuple(ipaddress.IPv4Network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
SQLITE_SIDE = ("docmap.sqlite", "docmap.sqlite-wal", "docmap.sqlite-shm", "docmap.sqlite-journal")


class ToolError(Exception):
    """Errore da mostrare all'utente (in italiano), senza traccia Python."""


class PassphraseError(ToolError):
    """Passphrase (o codice di recupero) sbagliata: niente è stato cambiato. Codice di uscita 3."""


# ---------------------------------------------------------------- percorsi e impostazioni

def paths(base: str) -> dict:
    b = os.path.abspath(base)
    j = lambda *p: os.path.join(b, *p)   # noqa: E731
    return {"base": b, "app": j("app"), "server": j("server"), "venv": j("venv"), "strumenti": j("strumenti"),
            "config_dir": j("config"), "config": j("config", "config.json"), "dati": j("dati"),
            "certificati": j("certificati"), "backup": j("backup"), "log": j("log"),
            "impostazioni": j("impostazioni.json"), "leggimi": j("LEGGIMI-INDIRIZZO.txt"), "pagina_qr": j("INDIRIZZO-QR.html"),
            "versioni": j("_versioni"), "sync": j("sync")}


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


# ---------------------------------------------------------------- cifratura (backup .docmap-backup e kit .docmap-key)
#
# Formato (versione 1), uguale per i backup (magic DOCMAPBK) e per il kit di emergenza (magic DOCMAPKY):
#
#   intestazione, 58 byte, tutta usata come AAD di ogni blocco:
#     magic(8) | versione(1)=1 | kdf(1)=1 scrypt | log2(N)(1) | r(1) | p(1) | riservato(1)=0 | blocco(4, big endian)
#     | sale(16, casuale) | prefisso del nonce(7, casuale) | riservato(1)=0 | controllo(16)
#   chiave: scrypt(passphrase, sale, N=2^17, r=8, p=1) → 64 byte: i primi 32 = chiave AES-256-GCM, gli altri 32 = chiave
#     del "controllo" = HMAC-SHA256(chiave2, primi 42 byte dell'intestazione)[:16] → distingue "passphrase sbagliata" da
#     "file danneggiato" senza dire nulla della passphrase (è un'uscita di scrypt);
#   poi i blocchi: ognuno è AES-256-GCM(testo di `blocco` byte, l'ultimo anche più corto o vuoto) + tag 16 byte, con
#     nonce = prefisso(7) | numero del blocco(4, big endian) | 1 se è l'ultimo altrimenti 0 (costruzione "STREAM"):
#     blocchi scambiati, tolti, aggiunti o un file troncato non si decifrano. Memoria usata: due blocchi (1 MiB l'uno),
#     non tutto il database.

BK_MAGIC, KEY_MAGIC = b"DOCMAPBK", b"DOCMAPKY"
ENC_VERSION, KDF_SCRYPT = 1, 1
SCRYPT_LOG2N, SCRYPT_R, SCRYPT_P = 17, 8, 1        # 128 MiB e ~0,5 s per derivare la chiave: costoso per chi prova a indovinare
CHUNK_SIZE = 1 << 20
_HDR = struct.Struct(">8sBBBBBBI16s7sB")            # 42 byte + 16 di controllo
HEADER_LEN = _HDR.size + 16
TAG_LEN = 16
CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # base32 di Crockford: niente I, L, O, U (si confondono)
CODE_GROUPS, CODE_GROUP_LEN = 6, 5                 # 30 caratteri = 150 bit casuali
PASSPHRASE_MIN = 12


def _aesgcm():
    try:
        from cryptography.exceptions import InvalidTag
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        raise ToolError("Manca il pacchetto 'cryptography' (serve per i backup cifrati): usa il Python dell'ambiente del server "
                        "(C:\\DocMap\\venv\\Scripts\\python.exe).")
    return AESGCM, InvalidTag


def generate_code() -> str:
    """Codice casuale da 30 caratteri in 6 gruppi (XXXXX-XXXXX-…): passphrase dei backup e codice di recupero del kit."""
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_GROUPS * CODE_GROUP_LEN))
    return "-".join(raw[i:i + CODE_GROUP_LEN] for i in range(0, len(raw), CODE_GROUP_LEN))


def canonical_secret(s: str) -> str:
    """Forma usata per derivare la chiave. Un codice generato da DocMap si può scrivere con o senza trattini/spazi, in
    minuscolo, con O al posto di 0 o I/L al posto di 1: diventa sempre XXXXX-XXXXX-…. Una passphrase scelta a mano resta
    com'è (solo spazi iniziali/finali tolti e normalizzazione Unicode NFC)."""
    import unicodedata
    s = unicodedata.normalize("NFC", (s or "").strip())
    compact = re.sub(r"[\s\-]", "", s).upper().translate(str.maketrans({"O": "0", "I": "1", "L": "1"}))
    if len(compact) == CODE_GROUPS * CODE_GROUP_LEN and all(c in CODE_ALPHABET for c in compact):
        return "-".join(compact[i:i + CODE_GROUP_LEN] for i in range(0, len(compact), CODE_GROUP_LEN))
    return s


def _derive(secret: str, salt: bytes, log2n: int, r: int, p: int) -> bytes:
    n = 1 << log2n
    return hashlib.scrypt(canonical_secret(secret).encode("utf-8"), salt=salt, n=n, r=r, p=p,
                          maxmem=128 * r * (n + p + 2) + (1 << 20), dklen=64)


def _nonce(prefix: bytes, i: int, last: bool) -> bytes:
    return prefix + i.to_bytes(4, "big") + (b"\x01" if last else b"\x00")


def _read_full(f, n: int) -> bytes:
    out = b""
    while len(out) < n:
        b = f.read(n - len(out))
        if not b:
            break
        out += b
    return out


def encrypt_stream(src, dst, secret: str, magic: bytes = BK_MAGIC, log2n: int | None = None, chunk_size: int | None = None) -> int:
    """Cifra il flusso `src` in `dst` (file aperti in binario). Restituisce i byte in chiaro letti."""
    AESGCM, _ = _aesgcm()
    if not canonical_secret(secret):
        raise ToolError("Passphrase vuota.")
    log2n = SCRYPT_LOG2N if log2n is None else log2n
    chunk = CHUNK_SIZE if chunk_size is None else chunk_size
    salt, prefix = os.urandom(16), os.urandom(7)
    head = _HDR.pack(magic, ENC_VERSION, KDF_SCRYPT, log2n, SCRYPT_R, SCRYPT_P, 0, chunk, salt, prefix, 0)
    dk = _derive(secret, salt, log2n, SCRYPT_R, SCRYPT_P)
    head += hmac.new(dk[32:], head, hashlib.sha256).digest()[:16]
    aes = AESGCM(dk[:32])
    dst.write(head)
    total, i = 0, 0
    cur = _read_full(src, chunk)
    while True:
        nxt = _read_full(src, chunk)
        last = not nxt
        dst.write(aes.encrypt(_nonce(prefix, i, last), cur, head))
        total += len(cur)
        if last:
            return total
        cur, i = nxt, i + 1


def read_header(f, magic: bytes | None = None) -> dict:
    head = _read_full(f, HEADER_LEN)
    if len(head) < HEADER_LEN or head[:8] not in (BK_MAGIC, KEY_MAGIC):
        raise ToolError("Il file non è un backup cifrato né un kit di DocMap (intestazione non riconosciuta).")
    mg, ver, kdf, log2n, r, p, _res, chunk, salt, prefix, _res2 = _HDR.unpack(head[:_HDR.size])
    if magic is not None and mg != magic:
        raise ToolError("Questo file è un %s, non un %s." % (_KIND[mg], _KIND[magic]))
    if ver != ENC_VERSION or kdf != KDF_SCRYPT:
        raise ToolError("Formato del file non supportato (versione %d): aggiorna gli strumenti di DocMap." % ver)
    if not (10 <= log2n <= 20 and 1 <= r <= 16 and 1 <= p <= 4 and 128 * r * (1 << log2n) <= (1 << 30)
            and 16 <= chunk <= (1 << 26)):
        raise ToolError("Intestazione del file danneggiata (parametri non validi).")
    return {"magic": mg, "log2n": log2n, "r": r, "p": p, "chunk": chunk, "salt": salt, "prefix": prefix, "head": head}


_KIND = {BK_MAGIC: "backup cifrato di DocMap (.docmap-backup)", KEY_MAGIC: "kit di emergenza di DocMap (.docmap-key)"}


def decrypt_stream(src, dst, secrets_to_try, magic: bytes = BK_MAGIC) -> tuple:
    """Decifra `src` in `dst`. `secrets_to_try`: una passphrase o una lista (si provano in ordine, conta solo il controllo
    nell'intestazione: nessun dato viene scritto con una passphrase sbagliata). Errori:
      PassphraseError  nessuna passphrase va bene (o intestazione alterata);
      ToolError        file danneggiato, manomesso o troncato (`dst` può contenere una parte: chi chiama la scarta).
    Restituisce (byte in chiaro, passphrase che ha aperto il file)."""
    AESGCM, InvalidTag = _aesgcm()
    h = read_header(src, magic)
    if isinstance(secrets_to_try, str):
        secrets_to_try = [secrets_to_try]
    key = used = None
    for sec in secrets_to_try:
        if not sec:
            continue
        dk = _derive(sec, h["salt"], h["log2n"], h["r"], h["p"])
        if hmac.compare_digest(hmac.new(dk[32:], h["head"][:_HDR.size], hashlib.sha256).digest()[:16], h["head"][_HDR.size:]):
            key, used = dk[:32], sec
            break
    if key is None:
        what = "Codice di recupero sbagliato" if magic == KEY_MAGIC else "Passphrase dei backup sbagliata"
        raise PassphraseError(what + " (oppure l'intestazione del file è stata alterata): nulla è stato cambiato.")
    aes = AESGCM(key)
    n = h["chunk"] + TAG_LEN
    total, i = 0, 0
    buf = _read_full(src, n)
    while True:
        nxt = src.read(1)
        last = not nxt
        if len(buf) < TAG_LEN or (not last and len(buf) != n):
            raise ToolError("File danneggiato o troncato (blocco %d): non si può decifrare." % (i + 1))
        try:
            pt = aes.decrypt(_nonce(h["prefix"], i, last), buf, h["head"])
        except InvalidTag:
            raise ToolError("File danneggiato o manomesso (blocco %d non autentico): non si può usare." % (i + 1))
        dst.write(pt)
        total += len(pt)
        if last:
            return total, used
        buf, i = nxt + _read_full(src, n - 1), i + 1


def encrypt_file(src_path: str, dst_path: str, secret: str, magic: bytes = BK_MAGIC, **kw) -> None:
    tmp = dst_path + ".tmp-" + os.urandom(4).hex()
    try:
        with open(src_path, "rb") as s, open(tmp, "wb") as d:
            encrypt_stream(s, d, secret, magic, **kw)
        os.replace(tmp, dst_path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def decrypt_file(src_path: str, dst_path: str, secrets_to_try, magic: bytes = BK_MAGIC) -> str:
    """Decifra in `dst_path` solo se tutto il file è autentico (altrimenti `dst_path` non viene creato).
    Restituisce la passphrase che ha aperto il file."""
    if not os.path.isfile(src_path):
        raise ToolError("File non trovato: %s" % src_path)
    tmp = dst_path + ".tmp-" + os.urandom(4).hex()
    try:
        with open(src_path, "rb") as s, open(tmp, "wb") as d:
            _, used = decrypt_stream(s, d, secrets_to_try, magic)
        os.replace(tmp, dst_path)
        return used
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def secret_opens(path: str, secret: str) -> bool:
    """True se `secret` apre il file (controlla solo l'intestazione: niente viene decifrato o scritto)."""
    try:
        with open(path, "rb") as f:
            h = read_header(f)
    except (OSError, ToolError):
        return False
    dk = _derive(secret, h["salt"], h["log2n"], h["r"], h["p"])
    return hmac.compare_digest(hmac.new(dk[32:], h["head"][:_HDR.size], hashlib.sha256).digest()[:16], h["head"][_HDR.size:])


def is_encrypted(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            return f.read(8) in (BK_MAGIC, KEY_MAGIC)
    except OSError:
        return False


# ---------------------------------------------------------------- passphrase dei backup e kit di emergenza

PASSPHRASE_FILE = "backup-passphrase.txt"
KIT_STATE_FILE = "kit-emergenza.json"
PASSPHRASE_HEADER = (
    "# DocMap - passphrase dei backup cifrati (.docmap-backup). NON cancellare, NON inviare per email.\n"
    "# La usa il backup automatico (attivita' \"DocMap Backup\", utente SYSTEM). La cartella config e' leggibile solo\n"
    "# dagli amministratori. Una copia stampata sta nel Kit di emergenza (kit-emergenza.ps1).\n"
    "# Prima riga senza # = passphrase attuale; le righe dopo = passphrase precedenti (per aprire i backup vecchi).\n")


def _fp(secret: str) -> str:
    """Impronta corta (8 caratteri) per riconoscere una passphrase o una chiave sulla carta, senza rivelarla."""
    return hashlib.sha256(b"docmap-impronta/" + canonical_secret(secret).encode("utf-8")).hexdigest()[:8].upper()


def passphrase_path(base: str) -> str:
    return os.path.join(paths(base)["config_dir"], PASSPHRASE_FILE)


def read_passphrases(base: str) -> list:
    """[attuale, precedenti…] dal file della passphrase (lista vuota se manca)."""
    pp = passphrase_path(base)
    if not os.path.isfile(pp):
        return []
    with open(pp, "r", encoding="utf-8-sig") as f:
        lines = [ln.strip() for ln in f.read().splitlines()]
    out = []
    for ln in lines:
        if ln and not ln.startswith("#") and ln not in out:
            out.append(ln)
    return out


def _write_passphrases(base: str, items: list) -> None:
    os.makedirs(paths(base)["config_dir"], exist_ok=True)
    _write_bytes_private(passphrase_path(base), (PASSPHRASE_HEADER + "\n".join(items) + "\n").encode("utf-8"))


def ensure_passphrase(base: str) -> tuple:
    """(passphrase attuale, creata_adesso). La crea (codice casuale) se manca: i backup sono sempre cifrati."""
    cur = read_passphrases(base)
    if cur:
        return cur[0], False
    pp = generate_code()
    _write_passphrases(base, [pp])
    return pp, True


def set_passphrase(base: str, new: str) -> dict:
    """Nuova passphrase attuale; le precedenti restano nel file per aprire i backup già fatti."""
    new = canonical_secret(new)
    if len(new) < PASSPHRASE_MIN:
        raise ToolError("Passphrase troppo corta: almeno %d caratteri (meglio il codice generato da DocMap)." % PASSPHRASE_MIN)
    items = [new] + [x for x in read_passphrases(base) if canonical_secret(x) != new]
    _write_passphrases(base, items)
    return {"impronta": _fp(new), "precedenti": len(items) - 1}


def remember_passphrase(base: str, secret: str) -> bool:
    """Aggiunge `secret` come passphrase precedente (es. dopo il ripristino di un backup di un altro PC)."""
    secret = canonical_secret(secret)
    have = [canonical_secret(x) for x in read_passphrases(base)]
    if not secret or secret in have:
        return False
    if not have:
        _write_passphrases(base, [secret])
    else:
        _write_passphrases(base, read_passphrases(base) + [secret])
    return True


def _passphrase_candidates(base: str, given: str | None = None) -> list:
    out = []
    for c in ([given] if given else []) + [os.environ.get("DOCMAP_PASSPHRASE") or ""] + read_passphrases(base):
        if c and canonical_secret(c) not in [canonical_secret(x) for x in out]:
            out.append(c)
    return out


def kit_status(base: str) -> dict:
    """{"stato": "ok" | "mancante" | "da-rifare", ...}: "da-rifare" se dopo il kit sono cambiate passphrase o chiave."""
    p = paths(base)
    st = os.path.join(p["config_dir"], KIT_STATE_FILE)
    out = {"stato": "mancante", "creato": None, "file": None}
    if not os.path.isfile(st):
        return out
    try:
        k = _read_json(st)
    except (OSError, ValueError):
        return out
    out.update({"creato": k.get("creato"), "file": k.get("file")})
    pps = read_passphrases(base)
    try:
        key = read_config(base).get("aes_key") or ""
    except ToolError:
        key = ""
    same = (pps and k.get("impronta_passphrase") == _fp(pps[0])) and (key and k.get("impronta_chiave") == _fp(key))
    out["stato"] = "ok" if same else "da-rifare"
    return out


# ---------------------------------------------------------------- backup e ripristino

def backup_name(now: _dt.datetime, existing=(), ext: str = BACKUP_EXT) -> str:
    """docmap_AAAAMMGG_HHMM<ext>; se c'è già (con qualunque estensione) docmap_AAAAMMGG_HHMM_2<ext>, …"""
    stems = {os.path.splitext(n)[0] for n in existing if BACKUP_RE.match(n)} | set(existing)
    base = "docmap_%s" % now.strftime("%Y%m%d_%H%M")
    stem, n = base, 2
    while stem in stems or stem + ext in stems:
        stem = "%s_%d" % (base, n)
        n += 1
    return stem + ext


def list_backups(folder: str) -> list:
    """Backup (.docmap-backup e vecchi .zip) in `folder`, dal più recente al più vecchio (data, ora, progressivo)."""
    if not folder or not os.path.isdir(folder):
        return []
    out = []
    for n in os.listdir(folder):
        m = BACKUP_RE.match(n)
        if m and os.path.isfile(os.path.join(folder, n)):
            out.append(((m.group(1), m.group(2), int(m.group(3) or 1), m.group(4) != "zip"), n))
    return [n for _, n in sorted(out, reverse=True)]


def apply_retention(folder: str, keep: int, trash: str | None = None) -> list:
    """Tiene gli ultimi `keep` backup; gli altri vengono eliminati (o spostati in `trash`, se indicato).
    Tocca solo i file col nome docmap_AAAAMMGG_HHMM[_N].docmap-backup / .zip. Restituisce i nomi tolti."""
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
            # un solo passo (pages=-1): copia un'istantanea coerente con un blocco di lettura; in WAL chi scrive non
            # si ferma. A piccoli passi invece la copia ricomincia a ogni scrittura di un altro processo e con un server
            # sempre occupato non finirebbe mai (visto nei test).
            src.backup(dst, pages=-1)
            dst.execute("PRAGMA journal_mode=DELETE")
            res = dst.execute("PRAGMA integrity_check").fetchone()[0]
            counts = _table_counts(dst)
        finally:
            dst.close()
    finally:
        src.close()
    if res != "ok":
        raise ToolError("Il controllo di integrità della copia non è riuscito (%s): backup annullato." % res)
    return counts


def _table_counts(con) -> dict:
    tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    return {t: con.execute('SELECT COUNT(*) FROM "%s"' % t.replace('"', '""')).fetchone()[0] for t in tables}


def _sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


class _HashWriter:
    def __init__(self):
        self.h = hashlib.sha256()

    def write(self, b):
        self.h.update(b)


def make_backup(base: str, dest: str | None = None, keep: int | None = None, now=None, second: str | None = None) -> dict:
    """Crea BASE\\backup\\docmap_AAAAMMGG_HHMM.docmap-backup: uno zip CIFRATO con la passphrase dei backup
    (BASE\\config\\backup-passphrase.txt, creata se manca) che contiene
         docmap.sqlite (copia coerente), config/config.json, dati/<altri file: licence/, instance.json…>,
         impostazioni.json, MANIFEST.json (data, versione, sha256, righe per tabella).
       Lo zip in chiaro esiste solo per un momento in una cartella temporanea dentro la cartella del backup (accessibile
       solo agli amministratori) e viene tolto subito. Il file cifrato viene riletto e decifrato per controllo prima di
       prendere il suo nome definitivo. Poi tiene gli ultimi `keep` e copia il file nella seconda destinazione (se c'è)."""
    p = paths(base)
    s = load_settings(base)
    cfg = read_config(base)
    passphrase, created = ensure_passphrase(base)
    _aesgcm()                                   # errore chiaro subito se manca cryptography
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
        tmpzip = os.path.join(tmpdir, "backup.zip")
        with zipfile.ZipFile(tmpzip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for src, arc in entries:
                manifest["file"][arc] = _sha256_file(src)
                z.write(src, arc)
            z.writestr("MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        verify_zip(tmpzip)
        tmpenc = os.path.join(tmpdir, name)
        encrypt_file(tmpzip, tmpenc, passphrase)
        hw = _HashWriter()                       # rilettura: il file cifrato si decifra e dà esattamente lo zip
        with open(tmpenc, "rb") as f:
            decrypt_stream(f, hw, passphrase)
        if hw.h.hexdigest() != _sha256_file(tmpzip):
            raise ToolError("Controllo del backup cifrato non riuscito: backup annullato.")
        os.replace(tmpenc, final)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    removed = apply_retention(dest, keep)
    out = {"file": final, "zip": final, "nome": name, "cifrato": True, "byte": os.path.getsize(final), "tolti": removed,
           "righe": manifest["righe"], "passphrase_creata": created, "impronta_passphrase": _fp(passphrase),
           "kit": kit_status(base)["stato"], "seconda": None, "seconda_errore": None}
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
    """Controlla uno zip di backup IN CHIARO: CRC, MANIFEST, sha256 dei file, integrità di docmap.sqlite. Restituisce il MANIFEST."""
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
                tmpdir = tempfile.mkdtemp(prefix="docmap-verify-", dir=os.path.dirname(os.path.abspath(zpath)))
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


def _workdir(base: str) -> str:
    """Cartella per i file decifrati temporanei: dentro BASE\\backup (solo amministratori) se esiste, altrimenti TEMP."""
    b = paths(base)["backup"]
    try:
        os.makedirs(b, exist_ok=True)
        return tempfile.mkdtemp(prefix="_decifrato-", dir=b)
    except OSError:
        return tempfile.mkdtemp(prefix="docmap-decifrato-")


class _Opened:
    """with _Opened(base, file, passphrase) as (zip_in_chiaro, passphrase_usata): decifra se serve, poi pulisce."""

    def __init__(self, base, path, passphrase=None):
        self.base, self.path, self.given = base, path, passphrase
        self.tmp = None

    def __enter__(self):
        if not os.path.isfile(self.path):
            raise ToolError("File non trovato: %s" % self.path)
        if not is_encrypted(self.path):
            return self.path, None
        cands = _passphrase_candidates(self.base, self.given)
        if not cands:
            raise PassphraseError("Questo backup è cifrato e su questo PC non c'è nessuna passphrase dei backup: "
                                  "scrivila (la trovi nel Kit di emergenza stampato).")
        self.tmp = _workdir(self.base)
        out = os.path.join(self.tmp, "backup.zip")
        try:
            return out, decrypt_file(self.path, out, cands, BK_MAGIC)
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *exc):
        if self.tmp:
            shutil.rmtree(self.tmp, ignore_errors=True)
        return False


def verify_backup_file(base: str, path: str, passphrase: str | None = None) -> dict:
    """verify_zip per .docmap-backup (decifrato in una cartella temporanea) e per i vecchi .zip."""
    with _Opened(base, path, passphrase) as (zp, used):
        man = verify_zip(zp)
    man = dict(man)
    man["cifrato"] = used is not None
    return man


def export_plain(base: str, path: str, out: str, passphrase: str | None = None) -> dict:
    """EMERGENZA: scrive lo zip NON cifrato di un .docmap-backup (chi lo ha legge i dati: la chiave è dentro)."""
    if not is_encrypted(path):
        raise ToolError("Il file non è un backup cifrato (.docmap-backup).")
    if os.path.exists(out):
        raise ToolError("%s esiste già: scegli un altro nome." % out)
    with _Opened(base, path, passphrase) as (zp, _used):
        man = verify_zip(zp)
        shutil.copyfile(zp, out + ".parziale")
        os.replace(out + ".parziale", out)
    return {"zip_in_chiaro": out, "backup_del": man.get("creato"), "byte": os.path.getsize(out)}


def restore_backup(base: str, zpath: str, now=None, passphrase: str | None = None) -> dict:
    """Ripristina un backup (.docmap-backup cifrato o vecchio .zip). Il server deve essere FERMO (lo fa ripristina.ps1).
    - prima si decifra e si controlla tutto: con una passphrase sbagliata o un file danneggiato non si tocca niente;
    - i dati attuali (docmap.sqlite*, licence/, instance.json, …) vanno in dati\\_prima-del-ripristino_AAAAMMGG_HHMMSS\\
      insieme alla config attuale: non si cancella niente;
    - si rimettono il database e i file di dati dello zip;
    - config.json: se la chiave aes_key dello zip è diversa da quella attuale si rimette quella dello zip (senza la
      sua chiave il database ripristinato non si leggerebbe); altrimenti resta la config attuale;
    - se la passphrase usata non è tra quelle di questo PC viene aggiunta come "precedente" (backup di un altro PC)."""
    with _Opened(base, zpath, passphrase) as (zp, used):
        res = _restore_plain_zip(base, zp, now)
    res["cifrato"] = used is not None
    res["passphrase_aggiunta"] = bool(used) and remember_passphrase(base, used)
    return res


def _restore_plain_zip(base: str, zpath: str, now=None) -> dict:
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


# ---------------------------------------------------------------- verifica del backup (apre il database con la chiave)

VERIFY_STATE = "verifica-backup.json"


def _load_server_crypto(base: str):
    """docmap_server/crypto.py (dec), da BASE\\server o dal repository; se non c'è, la stessa logica qui sotto."""
    import importlib.util
    for d in (paths(base)["server"], os.path.join(os.path.dirname(HERE), "server-python")):
        f = os.path.join(d, "docmap_server", "crypto.py")
        if os.path.isfile(f):
            spec = importlib.util.spec_from_file_location("_docmap_server_crypto", f)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod.dec
    AESGCM, InvalidTag = _aesgcm()

    def dec(key, blob, aad):
        if isinstance(blob, str):
            blob = blob.encode("latin-1", "replace")
        blob = bytes(blob)
        if len(blob) < 29 or blob[:1] != b"\x01":
            raise ValueError("unreadable")
        return AESGCM(key).decrypt(blob[1:13], blob[29:] + blob[13:29], aad.encode("utf-8")).decode("utf-8")
    return dec


def check_database_key(base: str, db_path: str, aes_key_b64: str, sample: int = 200) -> dict:
    """Apre docmap.sqlite in sola lettura con la chiave: controllo della chiave (meta/key_check, lo stesso del server),
    conteggio dei record per tipo e lettura di un campione di record (decifrati davvero)."""
    import base64
    import binascii
    dec = _load_server_crypto(base)
    out = {"chiave": "nessun controllo", "record_per_tipo": {}, "record_letti": 0, "record_illeggibili": 0}
    try:
        key = base64.b64decode(aes_key_b64 or "", validate=True)
    except (binascii.Error, ValueError):
        key = b""
    if len(key) != 32:
        out["chiave"] = "non valida"
        return out
    con = sqlite3.connect("file:%s?mode=ro" % db_path.replace("?", "%3F"), uri=True)
    try:
        names = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "meta" in names:
            row = con.execute("SELECT v FROM meta WHERE k = 'key_check'").fetchone()
            if row is not None:
                try:
                    ok = dec(key, base64.b64decode(row[0]), "meta/key_check") == "docmap-key-check"
                except Exception:   # noqa: BLE001 — chiave sbagliata o dato illeggibile
                    ok = False
                out["chiave"] = "ok" if ok else "sbagliata"
        cols = {r[1] for r in con.execute("PRAGMA table_info(records)")} if "records" in names else set()
        if {"type", "id", "payload", "deleted"} <= cols:          # tabella del server DocMap
            for t, n in con.execute("SELECT type, COUNT(*) FROM records WHERE deleted = 0 GROUP BY type ORDER BY type"):
                out["record_per_tipo"][t] = n
            if out["chiave"] != "sbagliata":
                for t, i, pl in con.execute("SELECT type, id, payload FROM records WHERE deleted = 0 AND payload IS NOT NULL "
                                            "ORDER BY RANDOM() LIMIT ?", (sample,)):
                    try:
                        json.loads(dec(key, pl, "records/%s/%s" % (t, i)))
                        out["record_letti"] += 1
                    except Exception:   # noqa: BLE001
                        out["record_illeggibili"] += 1
    finally:
        con.close()
    return out


def verify_latest_backup(base: str, path: str | None = None, passphrase: str | None = None,
                         if_older_days: float | None = None, now=None) -> dict:
    """Verifica completa dell'ultimo backup (o di `path`): decifra in una cartella temporanea, controlla lo zip e il
    MANIFEST, PRAGMA integrity_check, apre il database con la chiave contenuta NEL BACKUP (controllo della chiave e
    lettura di record) e confronta quella chiave con quella attuale. Scrive il risultato in BASE\\log\\verifica-backup.json.
    Con `if_older_days` non fa niente se l'ultima verifica riuscita ha meno di quei giorni (uso: backup giornaliero)."""
    p = paths(base)
    now = now or _dt.datetime.now()
    state = os.path.join(p["log"], VERIFY_STATE)
    if if_older_days is not None and os.path.isfile(state):
        try:
            last = _read_json(state)
            when = _dt.datetime.strptime(last.get("verificato", ""), "%Y-%m-%dT%H:%M:%S")
            if last.get("esito") == "ok" and now - when < _dt.timedelta(days=if_older_days):
                return {"saltata": True, "ultima": last.get("verificato"), "esito": "ok", "file": last.get("file")}
        except (OSError, ValueError, TypeError):
            pass
    res = {"verificato": now.strftime("%Y-%m-%dT%H:%M:%S"), "esito": "errore", "file": path, "saltata": False}
    try:
        if not path:
            lst = list_backups(p["backup"])
            if not lst:
                raise ToolError("Nessun backup in %s." % p["backup"])
            path = os.path.join(p["backup"], lst[0])
            res["file"] = path
        with _Opened(base, path, passphrase) as (zp, used):
            man = verify_zip(zp)
            res.update({"cifrato": used is not None, "creato": man.get("creato"), "host": man.get("host"),
                        "righe": man.get("righe", {}), "integrita": "ok"})
            with zipfile.ZipFile(zp) as z:
                zcfg = json.loads(z.read("config/config.json").decode("utf-8-sig"))
                tmp = tempfile.mkdtemp(prefix="docmap-verifica-", dir=os.path.dirname(zp))
                try:
                    if DB_NAME in z.namelist():
                        z.extract(DB_NAME, tmp)
                        k = check_database_key(base, os.path.join(tmp, DB_NAME), zcfg.get("aes_key", ""))
                    else:
                        k = {"chiave": "nessun database", "record_per_tipo": {}, "record_letti": 0, "record_illeggibili": 0}
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
        res.update(k)
        try:
            res["chiave_uguale_a_quella_attuale"] = zcfg.get("aes_key") == read_config(base).get("aes_key")
        except ToolError:
            res["chiave_uguale_a_quella_attuale"] = None
        if k["chiave"] in ("sbagliata", "non valida"):
            raise ToolError("La chiave contenuta nel backup NON apre il suo database (%s)." % k["chiave"])
        if k["record_illeggibili"]:
            raise ToolError("%d record del backup non si decifrano con la sua chiave." % k["record_illeggibili"])
        res["esito"] = "ok"
    except ToolError as e:
        res["errore"] = str(e)
        _save_verify_state(state, res)
        raise
    _save_verify_state(state, res)
    return res


def _save_verify_state(state, res):
    try:
        _write_text_atomic(state, json.dumps(res, ensure_ascii=False, indent=2) + "\n")
    except OSError:
        pass


# ---------------------------------------------------------------- kit di emergenza

def _esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def make_kit(base: str, out: str | None = None, now=None, code: str | None = None) -> dict:
    """Crea il Kit di emergenza:
      <out>.docmap-key  config.json (chiave aes_key, data_dir, impronte dei codici di accesso) + passphrase dei backup,
                        cifrati con un CODICE DI RECUPERO nuovo (stesso formato dei backup): si può tenere ovunque
                        (chiavetta, email a se stessi, cloud) perché senza il codice è illeggibile;
      <out>.html        pagina da STAMPARE (e poi togliere dal PC): codice di recupero, passphrase dei backup, impronte,
                        istruzioni. Va in cassaforte.
    Registra in config\\kit-emergenza.json le impronte, così backup e installazione sanno se il kit va rifatto."""
    p = paths(base)
    cfg = read_config(base)
    s = load_settings(base)
    pp, _ = ensure_passphrase(base)
    pps = read_passphrases(base)
    now = now or _dt.datetime.now()
    if not out:
        out = os.path.join(p["config_dir"], "kit-emergenza", "DocMap-kit-%s.docmap-key" % now.strftime("%Y%m%d_%H%M%S"))
    if not out.endswith(".docmap-key"):
        out += ".docmap-key"
    out = os.path.abspath(out)
    page = out[:-len(".docmap-key")] + ".html"
    for f in (out, page):
        if os.path.exists(f):
            raise ToolError("%s esiste già: scegli un altro nome." % f)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    code = canonical_secret(code) if code else generate_code()
    payload = {"tipo": "docmap-kit-emergenza", "formato": 1, "creato": now.strftime("%Y-%m-%dT%H:%M:%S"),
               "host": socket.gethostname(), "studio": s.get("nome_studio") or "", "strumenti": TOOLS_VERSION,
               "config": cfg, "passphrase_backup": pps, "impronta_chiave": _fp(cfg.get("aes_key") or "")}
    import io as _io
    buf = _io.BytesIO()
    encrypt_stream(_io.BytesIO(json.dumps(payload, ensure_ascii=False).encode("utf-8")), buf, code, KEY_MAGIC)
    _write_bytes_private(out, buf.getvalue())
    html = kit_page(payload, code, os.path.basename(out))
    _write_bytes_private(page, html.encode("utf-8"))
    state = {"creato": payload["creato"], "file": out, "impronta_passphrase": _fp(pp),
             "impronta_chiave": payload["impronta_chiave"], "impronta_codice": _fp(code)}
    _write_text_atomic(os.path.join(p["config_dir"], KIT_STATE_FILE), json.dumps(state, ensure_ascii=False, indent=2) + "\n")
    return {"kit": out, "pagina": page, "impronta_chiave": payload["impronta_chiave"], "impronta_passphrase": _fp(pp),
            "impronta_codice": _fp(code)}


def kit_page(payload: dict, code: str, kit_name: str) -> str:
    studio = _esc(payload.get("studio") or "DocMap")
    groups = "".join("<span>%s</span>" % _esc(g) for g in code.split("-"))
    pps = payload.get("passphrase_backup") or []
    cur = _esc(pps[0]) if pps else "(nessuna)"
    prev = ""
    if len(pps) > 1:
        prev = "<p class=small>Passphrase precedenti (per backup più vecchi): " + ", ".join(
            "<code>%s</code>" % _esc(x) for x in pps[1:]) + "</p>"
    created = _esc(payload.get("creato", "").replace("T", " "))
    return """<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DocMap · Kit di emergenza</title>
<style>
:root{--ink:#0F172A;--muted:#475569;--line:#94A3B8;--warn:#B45309}
body{font-family:system-ui,"Segoe UI",sans-serif;color:var(--ink);background:#fff;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.45}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:22px 0 8px}
.box{border:2px solid var(--ink);border-radius:10px;padding:14px 16px;margin:12px 0}
.code{display:flex;flex-wrap:wrap;gap:10px;font-family:Consolas,"Courier New",monospace;font-size:26px;font-weight:700;letter-spacing:2px}
.code span{border:1px solid var(--line);border-radius:6px;padding:4px 8px}
.pp{font-family:Consolas,"Courier New",monospace;font-size:20px;font-weight:700;word-break:break-all}
.small{font-size:13px;color:var(--muted)}.warn{color:var(--warn);font-weight:600}
ol li{margin:5px 0}.sign{margin-top:28px;display:flex;gap:24px;flex-wrap:wrap}.sign div{flex:1;min-width:220px;border-top:1px solid var(--ink);padding-top:4px;font-size:13px}
@media print{button{display:none}body{margin:0 auto}}
</style></head><body>
<h1>DocMap · Kit di emergenza</h1>
<p><b>%(studio)s</b> · creato il %(created)s sul PC <b>%(host)s</b></p>
<p class=warn>Stampa questa pagina (2 copie), mettila in cassaforte e poi elimina il file dal PC. Non fotografarla e non inviarla per email.</p>

<div class=box><h2 style="margin-top:0">1 · Codice di recupero</h2>
<div class=code>%(groups)s</div>
<p class=small>Apre il file <code>%(kit)s</code> (chiave del database e passphrase dei backup). Maiuscole/minuscole e trattini non contano; 0 e O, 1 e I/L sono la stessa cosa.</p></div>

<div class=box><h2 style="margin-top:0">2 · Passphrase dei backup</h2>
<p class=pp>%(pp)s</p>%(prev)s
<p class=small>Apre i file <code>docmap_AAAAMMGG_HHMM.docmap-backup</code> (cartella <code>C:\\DocMap\\backup</code>, chiavetta, NAS).</p></div>

<p class=small>Impronte per controllo: chiave del database <b>%(fpk)s</b> · passphrase dei backup <b>%(fpp)s</b>.
Se un giorno il programma mostra impronte diverse, questo foglio è vecchio: crea un kit nuovo.</p>

<h2>Cosa fare se…</h2>
<ol>
<li><b>Il PC si rompe o viene rubato.</b> Installa DocMap su un PC nuovo (<code>installa.bat</code>), poi
<code>C:\\DocMap\\strumenti\\ripristina.ps1</code>: scegli l'ultimo backup (dalla chiavetta/NAS) e, quando lo chiede, scrivi la
<b>passphrase dei backup</b> (riquadro 2). Il backup contiene anche la chiave del database.</li>
<li><b>Il database c'è ma la configurazione (config.json) è persa o cambiata.</b> Esegui
<code>C:\\DocMap\\strumenti\\kit-emergenza.ps1 -Recupera</code>, indica il file <code>.docmap-key</code> e scrivi il
<b>codice di recupero</b> (riquadro 1): la chiave torna al suo posto e il database si riapre.</li>
<li><b>Non trovi più il file .docmap-key.</b> Basta un backup e la passphrase del riquadro 2 (caso 1). Poi crea un kit nuovo.</li>
<li><b>Hai perso questo foglio.</b> Finché il PC funziona: crea subito un kit nuovo (<code>kit-emergenza.ps1</code>); quello vecchio non serve più.</li>
</ol>
<p class=small>Il file <code>.docmap-key</code> è cifrato: puoi tenerne copie su chiavetta, NAS o email a te stesso. Senza il codice di
recupero è illeggibile. Questo foglio invece va tenuto come le chiavi dell'ufficio: chi ha il foglio e un backup legge i dati.</p>
<div class=sign><div>Conservato in (luogo)</div><div>Data e firma</div></div>
<p><button onclick="print()">Stampa</button></p>
</body></html>
""" % {"studio": studio, "created": created, "host": _esc(payload.get("host", "")), "groups": groups, "kit": _esc(kit_name),
       "pp": cur, "prev": prev, "fpk": _esc(payload.get("impronta_chiave", "")), "fpp": _esc(_fp(pps[0]) if pps else "")}


def read_kit(kit_path: str, code: str) -> dict:
    import io as _io
    if not os.path.isfile(kit_path):
        raise ToolError("File del kit non trovato: %s" % kit_path)
    buf = _io.BytesIO()
    with open(kit_path, "rb") as f:
        decrypt_stream(f, buf, [code], KEY_MAGIC)
    try:
        payload = json.loads(buf.getvalue().decode("utf-8"))
    except ValueError:
        raise ToolError("Il kit è stato decifrato ma il contenuto non è valido.")
    if payload.get("tipo") != "docmap-kit-emergenza" or not isinstance(payload.get("config"), dict):
        raise ToolError("Il file non è un Kit di emergenza di DocMap.")
    return payload


def recover_key(base: str, kit_path: str, code: str, replace: bool = False, now=None) -> dict:
    """Ricostruisce BASE\\config\\config.json dal kit (chiave aes_key e codici di accesso dell'epoca) con la cartella dati
    di QUESTA installazione, e rimette le passphrase dei backup. Se c'è già una config con un'altra chiave serve
    `replace` (quella attuale va in config\\_prima-del-recupero_<data>.json, non si cancella). Dice se il database
    presente in dati\\ si apre con la chiave recuperata."""
    p = paths(base)
    payload = read_kit(kit_path, code)
    cfg = dict(payload["config"])
    now = now or _dt.datetime.now()
    data_dir = p["dati"]
    if os.path.isfile(p["config"]):
        try:
            cur = read_config(base)
            data_dir = cur.get("data_dir") or data_dir
        except ToolError:
            cur = {}
        if cur.get("aes_key") and cur.get("aes_key") != cfg.get("aes_key") and not replace:
            raise ToolError("In questo PC c'è già una configurazione con un'altra chiave (%s, nel kit %s). Per sostituirla "
                            "ripeti con --sostituisci (-Sostituisci nello script): quella attuale viene conservata."
                            % (_fp(cur["aes_key"]), _fp(cfg.get("aes_key") or "")))
        old = os.path.join(p["config_dir"], "_prima-del-recupero_%s.json" % now.strftime("%Y%m%d_%H%M%S"))
        shutil.copyfile(p["config"], old)
    else:
        old = None
    cfg["data_dir"] = data_dir
    os.makedirs(p["config_dir"], exist_ok=True)
    _write_bytes_private(p["config"], (json.dumps(cfg, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    added = 0
    for x in payload.get("passphrase_backup") or []:
        added += 1 if remember_passphrase(base, x) else 0
    db = os.path.join(data_dir, DB_NAME)
    res = {"config": p["config"], "config_precedente": old, "kit_del": payload.get("creato"), "studio": payload.get("studio"),
           "impronta_chiave": _fp(cfg.get("aes_key") or ""), "passphrase_aggiunte": added, "database": None}
    if os.path.isfile(db):
        res["database"] = check_database_key(base, db, cfg.get("aes_key", ""), sample=50)
    return res


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
    # mai attraverso un proxy (impostazioni di Windows o variabili d'ambiente): il server è su questo PC o in rete locale
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx))
    with opener.open(req, timeout=timeout) as r:   # noqa: S310
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


# ---------------------------------------------------------------- pacchetto personale del cliente (dal hub)

TRUSTED_KEYS_NAME = "trusted_keys.json"          # server\docmap_server\trusted_keys.json: chiavi pubbliche delle licenze
CLIENT_DIR = "cliente"                           # <pacchetto>\cliente\: dati del cliente (niente segreti)
CLIENT_INFO = "cliente.json"
LICENCE_NAME = "licence.docmap-licence"
SYNC_TEMPLATE = "sync-profile.template.json"
SYNC_PROFILE = "sync-profile.json"
SYNC_BAT = "sincronizza.bat"
SYNC_TASK = "DocMap Sync Web-Locale"
BRIDGE_USER = "ponte-sync"
SECRET_FIELDS = ("token", "basic_pass")
_KEY_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")


def _valid_key_b64(v) -> bool:
    import base64
    import binascii
    if not isinstance(v, str) or not v.strip() or len(v) > 100:
        return False
    try:
        return len(base64.b64decode(v.strip(), validate=True)) == 32
    except (binascii.Error, ValueError):
        return False


def read_public_keys_file(path: str) -> dict:
    """Chiavi pubbliche dal file di `python -m docmap_hub export-public-key` ({"keys": {id: base64}}). ToolError se il
    file non è leggibile o non contiene nessuna chiave valida; le chiavi non valide fanno fallire (meglio subito, sul PC
    di Dave, che in studio con la licenza "non valida")."""
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            obj = json.load(f)
    except (OSError, ValueError) as e:
        raise ToolError("File della chiave pubblica non leggibile (%s): %s" % (path, e))
    keys = obj.get("keys") if isinstance(obj, dict) else None
    if not isinstance(keys, dict) or not keys:
        raise ToolError("Il file %s non è un'esportazione di 'docmap_hub export-public-key --format json' (manca \"keys\")." % path)
    bad = [str(k) for k, v in keys.items() if not (_KEY_ID_RE.match(str(k)) and _valid_key_b64(v))]
    if bad:
        raise ToolError("Chiavi pubbliche non valide nel file %s: %s" % (path, ", ".join(bad)))
    return {str(k): v.strip() for k, v in keys.items()}


def _load_verifier(server_pkg_dir: str):
    """Il verificatore delle licenze del server impacchettato (licence_verify.py), se `cryptography` è disponibile."""
    import importlib.util
    f = os.path.join(server_pkg_dir, "licence_verify.py")
    if not os.path.isfile(f):
        return None
    try:
        name = "_dm_licence_verify_pkg"
        spec = importlib.util.spec_from_file_location(name, f)
        mod = importlib.util.module_from_spec(spec)
        sys.modules[name] = mod          # dataclass lo cerca in sys.modules
        try:
            spec.loader.exec_module(mod)
        finally:
            sys.modules.pop(name, None)
        return mod
    except ImportError:          # niente cryptography in questo Python: si controlla solo la chiave
        return None


def check_licence_file(path: str, keys: dict, server_pkg_dir: str | None = None) -> dict:
    """Controlla un .docmap-licence prima di metterlo nel pacchetto: firma (se si può) con le chiavi del pacchetto."""
    try:
        with open(path, "rb") as f:
            raw = f.read()
        obj = json.loads(raw.decode("utf-8-sig"))
        lic = obj["licence"]
        kid = obj["key_id"]
    except (OSError, ValueError, KeyError, TypeError, UnicodeDecodeError) as e:
        raise ToolError("File di licenza non valido (%s): %s" % (path, e))
    if keys and kid not in keys:
        raise ToolError("La licenza è firmata con la chiave %s, che non è tra le chiavi pubbliche del pacchetto." % kid)
    out = {"licence_id": lic.get("licence_id"), "instance_id": lic.get("instance_id"), "plan": lic.get("plan"),
           "expires_at": lic.get("expires_at"), "customer": (lic.get("customer") or {}).get("name"), "verificata": False}
    mod = _load_verifier(server_pkg_dir) if (server_pkg_dir and keys) else None
    if mod is not None:
        st = mod.verify(raw, keys)
        if not st.signature_ok or st.mode == "invalid":
            raise ToolError("La licenza non supera la verifica del server: %s" % (st.reasons,))
        out.update(verificata=True, mode=st.mode)
    return out


def sync_template(obj) -> dict:
    """Normalizza il modello del profilo del ponte (solo il lato web: indirizzo, nome, utente della cartella protetta).
    Rifiuta un modello che contiene segreti: i codici non viaggiano nel pacchetto."""
    if not isinstance(obj, dict) or not isinstance(obj.get("a"), dict):
        raise ToolError("Modello di sincronizzazione non valido: serve un oggetto con il lato \"a\" (il sito web).")
    a = obj["a"]
    for side in ("a", "b"):
        for k in SECRET_FIELDS:
            if isinstance(obj.get(side), dict) and str(obj[side].get(k) or "").strip():
                raise ToolError("Il modello di sincronizzazione contiene un segreto (%s.%s): toglilo, i codici si inseriscono "
                                "in studio con configura-sync." % (side, k))
    url = str(a.get("url") or "").strip()
    from urllib.parse import urlsplit
    u = urlsplit(url)
    if u.scheme != "https" or not u.hostname:
        raise ToolError("Indirizzo del sito non valido nel modello (serve https://…/server-php/api.php): %r" % url)
    return {"formato": 1, "name": str(obj.get("name") or "Web ⇄ Studio")[:120],
            "a": {"label": str(a.get("label") or "Web (online)")[:60], "url": url,
                  "basic_user": str(a.get("basic_user") or "")[:120]},
            "direction": obj.get("direction") if obj.get("direction") in ("both", "a-to-b", "b-to-a") else "both",
            "ogni_minuti": max(5, min(240, int(obj.get("ogni_minuti") or 10)))}


def package_info(folder: str) -> dict:
    """cliente/cliente.json di un pacchetto ({} se il pacchetto è generico), con i percorsi assoluti dei file presenti."""
    d = os.path.join(folder, CLIENT_DIR)
    f = os.path.join(d, CLIENT_INFO)
    if not os.path.isfile(f):
        return {}
    try:
        info = _read_json(f)
    except (OSError, ValueError) as e:
        raise ToolError("cliente.json non leggibile nel pacchetto: %s" % e)
    if not isinstance(info, dict):
        raise ToolError("cliente.json non valido nel pacchetto.")
    lic = os.path.join(d, LICENCE_NAME)
    tpl = os.path.join(d, SYNC_TEMPLATE)
    info["file_licenza"] = lic if os.path.isfile(lic) else None
    info["file_modello_sync"] = tpl if os.path.isfile(tpl) else None
    return info


# ---------------------------------------------------------------- licenza obbligatoria e ponte web <-> locale (in studio)

def _write_config(base: str, cfg: dict) -> None:
    """Riscrive config.json in modo atomico (stessa cartella: i permessi solo-amministratori si ereditano)."""
    p = paths(base)["config"]
    tmp = p + ".tmp-" + os.urandom(4).hex()
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n")
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    os.replace(tmp, p)


def enable_licence_required(base: str) -> dict:
    """"licence_required": true in config.json (da fare DOPO aver installato una licenza valida, altrimenti il server
    passa in sola lettura). Non cambia nient'altro."""
    cfg = read_config(base)
    if cfg.get("licence_required") is True:
        return {"licence_required": True, "cambiato": False}
    cfg["licence_required"] = True
    _write_config(base, cfg)
    return {"licence_required": True, "cambiato": True}


def add_bridge_token(base: str, user: str = BRIDGE_USER) -> str:
    """Crea (o rinnova) il codice di accesso del ponte sul server dello studio: ruolo editor, nella config solo l'impronta
    SHA-256 (come fa setup). Il server rilegge config.json a ogni richiesta: vale subito. Restituisce il codice in chiaro."""
    import base64
    cfg = read_config(base)
    tok = base64.b64encode(os.urandom(24)).decode("ascii").translate(str.maketrans("+/", "-_")).rstrip("=")
    entry = {"user": user, "role": "editor", "token_sha256": hashlib.sha256(tok.encode("ascii")).hexdigest()}
    tokens = cfg.get("tokens")
    if isinstance(tokens, dict):
        tokens = list(tokens.values())
    if not isinstance(tokens, list):
        tokens = []
    tokens = [t for t in tokens if not (isinstance(t, dict) and t.get("user") == user)] + [entry]
    cfg["tokens"] = tokens
    _write_config(base, cfg)
    return tok


def sync_bat(base: str) -> str:
    p = paths(base)
    venv_py = os.path.join(p["venv"], "Scripts", "python.exe")
    prof = os.path.join(p["sync"], SYNC_PROFILE)
    esito = os.path.join(p["sync"], "ultimo-esito.txt")
    return "\r\n".join(["@echo off", "rem DocMap - ponte web <-> studio (creato da configura-sync; lo avvia l'attivita '%s')" % SYNC_TASK,
                        'cd /d "%s"' % p["server"],
                        '"%s" -m docmap_server sync-remote "%s" > "%s" 2>&1' % (venv_py, prof, esito), ""])


def make_sync_profile(base: str, template: dict, web_token: str, local_token: str, basic_pass: str = "") -> dict:
    """Scrive BASE\\sync\\sync-profile.json (lato a = sito web dal modello, lato b = server dello studio su 127.0.0.1 con il
    certificato dello studio) e BASE\\sync\\sincronizza.bat. Il file contiene i codici: si crea con permessi privati
    (0600; in Windows la cartella sync viene ristretta agli amministratori da configura-sync.ps1). Se l'indirizzo del sito
    cambia, lo stato della sincronizzazione precedente viene spostato in sync\\_vecchi\\ (si riparte da zero)."""
    t = sync_template(template)
    if not (web_token or "").strip():
        raise ToolError("Manca il codice di accesso (token) del sito web per il ponte.")
    if any(c.isspace() for c in web_token.strip()) or len(web_token.strip()) > 200:
        raise ToolError("Il codice del sito web non sembra un token DocMap (contiene spazi o è troppo lungo).")
    p = paths(base)
    s = load_settings(base)
    os.makedirs(p["sync"], exist_ok=True)
    prof_path = os.path.join(p["sync"], SYNC_PROFILE)
    state = prof_path[:-len(".json")] + ".state.json"
    moved = None
    if os.path.isfile(prof_path):
        try:
            old_url = (_read_json(prof_path).get("a") or {}).get("url")
        except (OSError, ValueError, AttributeError):
            old_url = None
        if old_url != t["a"]["url"] and os.path.isfile(state):
            old_dir = os.path.join(p["sync"], "_vecchi")
            os.makedirs(old_dir, exist_ok=True)
            moved = os.path.join(old_dir, "%s.%s" % (os.path.basename(state), time.strftime("%Y%m%d_%H%M%S")))
            os.replace(state, moved)
    prof = {"name": t["name"],
            "a": {"label": t["a"]["label"], "url": t["a"]["url"], "token": web_token.strip(),
                  "basic_user": t["a"]["basic_user"], "basic_pass": basic_pass or "", "ca": "", "insecure_lan": False,
                  "max_body_mb": 20},
            "b": {"label": "Studio (locale)", "url": "https://127.0.0.1:%d/api" % s["porta"], "token": local_token,
                  "basic_user": "", "basic_pass": "", "ca": os.path.join(p["certificati"], CA_CERT), "insecure_lan": False,
                  "max_body_mb": 20},
            "direction": t["direction"], "sync_settings": True, "sync_activity_log": True}
    _write_bytes_private(prof_path, (json.dumps(prof, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    bat = os.path.join(p["sync"], SYNC_BAT)
    _write_bytes_private(bat, sync_bat(base).encode("utf-8"))
    return {"profilo": prof_path, "bat": bat, "sito": t["a"]["url"], "studio": prof["b"]["url"], "direzione": t["direction"],
            "ogni_minuti": t["ogni_minuti"], "attivita": SYNC_TASK, "utente_ponte": BRIDGE_USER, "stato_precedente_spostato": moved}


def configure_sync(base: str, template_path: str | None, web_token: str, basic_pass: str = "") -> dict:
    """configura-sync: modello (BASE\\sync\\sync-profile.template.json o quello indicato) + codice del sito →
    codice "ponte-sync" nuovo sul server dello studio + profilo + sincronizza.bat."""
    p = paths(base)
    tp = template_path or os.path.join(p["sync"], SYNC_TEMPLATE)
    try:
        tpl = _read_json(tp)
    except (OSError, ValueError) as e:
        raise ToolError("Modello della sincronizzazione non trovato o non leggibile (%s): %s. Serve il pacchetto personale "
                        "del cliente preparato dal hub, oppure indica --modello." % (tp, e))
    t = sync_template(tpl)          # prima di toccare config.json
    if not os.path.isfile(p["config"]):
        raise ToolError("DocMap non è ancora configurato in %s: installa prima il server." % p["config"])
    local = add_bridge_token(base)
    res = make_sync_profile(base, t, web_token, local, basic_pass)
    if template_path and os.path.abspath(template_path) != os.path.abspath(os.path.join(p["sync"], SYNC_TEMPLATE)):
        shutil.copyfile(template_path, os.path.join(p["sync"], SYNC_TEMPLATE))
    return res


# ---------------------------------------------------------------- pacchetto (sul PC di sviluppo)

INSTALLER_FILES = ["installa.bat", "installa.ps1", "comune.ps1", "backup.ps1", "ripristina.ps1", "aggiorna.ps1",
                   "disinstalla.ps1", "licenza.ps1", "kit-emergenza.ps1", "configura-sync.ps1", "docmap_tools.py",
                   "GUIDA-INSTALLAZIONE.md"]


def build_package(out: str, make_zip: bool = False, repo_docmap: str | None = None, public_keys: str | None = None,
                  licence: str | None = None, studio_name: str | None = None, sync_model: str | None = None,
                  client_info: dict | None = None, documents=()) -> dict:
    """Prepara la cartella da portare in studio:
         <out>/installa.bat, *.ps1, docmap_tools.py, GUIDA-INSTALLAZIONE.md, VERSIONE.txt
         <out>/app/      ← tools/build_deploy.py --no-server --base-path / (poi docmap.config.js viene riscritto in studio)
         <out>/server/   ← server-python/docmap_server + requirements.txt (+ wheels/ se presente in installer-windows/)
    Pacchetto PERSONALE di un cliente (lo prepara il hub con 'cliente nuovo'):
         public_keys → <out>/server/docmap_server/trusted_keys.json (le licenze di Dave si verificano senza toccare codice)
         licence     → <out>/cliente/licence.docmap-licence (installa.ps1 la installa e attiva licence_required)
         studio_name, client_info → <out>/cliente/cliente.json (installa.ps1 propone il nome dello studio)
         sync_model  → <out>/cliente/sync-profile.template.json (solo indirizzo del sito: i codici si inseriscono in studio)
         documents   → copiati nella radice del pacchetto (es. GUIDA-NUOVO-CLIENTE.md, scheda del cliente)
    Non cancella niente: `out` deve essere nuova o vuota."""
    docmap = os.path.abspath(repo_docmap or os.path.dirname(HERE))
    if not os.path.isfile(os.path.join(docmap, "tools", "build_deploy.py")):
        raise ToolError("Non trovo tools/build_deploy.py: il comando 'pacchetto' va eseguito dal repository.")
    out = os.path.abspath(out)
    if os.path.exists(out) and os.listdir(out):
        raise ToolError("La cartella %s esiste e non è vuota: scegline una nuova." % out)
    keys = read_public_keys_file(public_keys) if public_keys else None
    if licence and not keys:
        raise ToolError("Con --licenza serve anche --chiave-pubblica: senza, il server dello studio non potrebbe verificarla.")
    tpl = None
    if sync_model:
        try:
            tpl = sync_template(_read_json(sync_model))
        except (OSError, ValueError) as e:
            raise ToolError("Modello di sincronizzazione non leggibile (%s): %s" % (sync_model, e))
    for d in documents or ():
        if not os.path.isfile(d):
            raise ToolError("Documento da includere non trovato: %s" % d)
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
    guida_sync = os.path.join(srv_src, "GUIDA-SYNC-WEB-LOCALE.md")
    if os.path.isfile(guida_sync):   # guida del ponte web <-> locale (sync-remote), accanto alla guida di installazione
        shutil.copyfile(guida_sync, os.path.join(out, "GUIDA-SYNC-WEB-LOCALE.md"))
    guida_cliente = os.path.join(docmap, "docs", "GUIDA-NUOVO-CLIENTE.md")
    if os.path.isfile(guida_cliente):
        shutil.copyfile(guida_cliente, os.path.join(out, "GUIDA-NUOVO-CLIENTE.md"))
    wheels = os.path.join(HERE, "wheels")
    if os.path.isdir(wheels):
        shutil.copytree(wheels, os.path.join(out, "server", "wheels"))
    for f in INSTALLER_FILES:
        shutil.copyfile(os.path.join(HERE, f), os.path.join(out, f))
    for d in documents or ():
        shutil.copyfile(d, os.path.join(out, os.path.basename(d)))
    personal = None
    if keys:
        _write_text_atomic(os.path.join(out, "server", "docmap_server", TRUSTED_KEYS_NAME),
                           json.dumps({"format": 1, "keys": keys}, indent=2, sort_keys=True) + "\n")
    if keys or licence or studio_name or tpl or client_info:
        cdir = os.path.join(out, CLIENT_DIR)
        os.makedirs(cdir, exist_ok=True)
        personal = dict(client_info or {})
        personal.update({"formato": 1, "creato": time.strftime("%Y-%m-%d"), "chiavi_pubbliche": sorted(keys or {})})
        if studio_name:
            personal["nome_studio"] = studio_name.strip()[:120]
        if licence:
            personal["licenza"] = check_licence_file(licence, keys, os.path.join(out, "server", "docmap_server"))
            shutil.copyfile(licence, os.path.join(cdir, LICENCE_NAME))
        if tpl:
            personal["sync"] = {"sito": tpl["a"]["url"], "ogni_minuti": tpl["ogni_minuti"]}
            _write_text_atomic(os.path.join(cdir, SYNC_TEMPLATE), json.dumps(tpl, ensure_ascii=False, indent=2) + "\n")
        _write_text_atomic(os.path.join(cdir, CLIENT_INFO), json.dumps(personal, ensure_ascii=False, indent=2) + "\n")
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
    res = {"cartella": out, "versione": version, "file": len(manifest) + 1, "zip": None,
           "personale": bool(personal), "chiavi_pubbliche": sorted(keys or {}),
           "licenza": (personal or {}).get("licenza"), "sync": bool(tpl)}
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


def _getpass(prompt):
    import getpass
    return getpass.getpass(prompt)


def _ask_secret(prompt, path, base=None):
    """Per i comandi a mano: se il file è cifrato, nessuna passphrase nota (DOCMAP_PASSPHRASE, file di questo PC) lo
    apre e c'è un terminale, la chiede senza mostrarla. Gli script .ps1 passano invece DOCMAP_PASSPHRASE."""
    if not (sys.stdin.isatty() and os.path.isfile(path) and is_encrypted(path)):
        return None
    if base and any(secret_opens(path, c) for c in _passphrase_candidates(base)):
        return None
    return _getpass(prompt)


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
    r = sub.add_parser("ripristina", help="ripristina un backup (.docmap-backup o .zip); passphrase da DOCMAP_PASSPHRASE o dal file")
    r.add_argument("zip")
    v = sub.add_parser("verifica-zip")
    v.add_argument("zip")
    vb = sub.add_parser("verifica-backup", help="decifra e controlla l'ultimo backup (integrità, chiave, record)")
    vb.add_argument("--file", help="backup da verificare (predefinito: il più recente in BASE\\backup)")
    vb.add_argument("--se-scaduta", type=float, metavar="GIORNI", help="non fa niente se l'ultima verifica riuscita è più recente")
    ex = sub.add_parser("esporta-in-chiaro", help="EMERGENZA: decifra un .docmap-backup in uno zip NON cifrato")
    ex.add_argument("file")
    ex.add_argument("--out", required=True)
    ex.add_argument("--conferma", default="", help='deve essere "ESPORTA IN CHIARO" (altrimenti lo chiede)')
    pp = sub.add_parser("passphrase-backup", help="passphrase dei backup cifrati")
    g = pp.add_mutually_exclusive_group()
    g.add_argument("--crea", action="store_true", help="la crea se manca (predefinito)")
    g.add_argument("--mostra", action="store_true", help="stampa la passphrase attuale")
    g.add_argument("--nuova", action="store_true", help="ne genera una nuova (le precedenti restano per i backup vecchi)")
    g.add_argument("--imposta", action="store_true", help="usa quella in DOCMAP_PASSPHRASE (o chiesta) come nuova passphrase")
    ke = sub.add_parser("kit-emergenza", help="crea il Kit di emergenza (.docmap-key + pagina da stampare)")
    ke.add_argument("--out", help="file .docmap-key da creare (predefinito: BASE\\config\\kit-emergenza\\DocMap-kit-<data>.docmap-key)")
    sub.add_parser("stato-kit")
    rk = sub.add_parser("recupera-chiave", help="ricostruisce config.json da un kit + codice di recupero (DOCMAP_CODICE o chiesto)")
    rk.add_argument("--kit", required=True)
    rk.add_argument("--sostituisci", action="store_true", help="sostituisce una config esistente con un'altra chiave (la conserva)")
    pi = sub.add_parser("ping")
    pi.add_argument("--url")
    pi.add_argument("--attendi", type=float, default=0, help="secondi di attesa massima (riprova ogni 2 s)")
    pi.add_argument("--insecure", action="store_true", help="non verificare il certificato (solo diagnosi)")
    pk = sub.add_parser("pacchetto")
    pk.add_argument("--out", required=True)
    pk.add_argument("--zip", action="store_true")
    pk.add_argument("--chiave-pubblica", help="file di 'python -m docmap_hub export-public-key' → server/docmap_server/trusted_keys.json")
    pk.add_argument("--licenza", help="file .docmap-licence del cliente (installato da installa.ps1)")
    pk.add_argument("--nome-studio", help="nome dello studio proposto da installa.ps1")
    pk.add_argument("--sync-modello", help="modello del profilo del ponte web <-> locale (senza codici)")
    pk.add_argument("--cliente-json", help="altri dati del cliente (JSON, niente segreti) da mettere in cliente/cliente.json")
    pk.add_argument("--documento", action="append", default=[], help="file da copiare nella radice del pacchetto (ripetibile)")
    ip_ = sub.add_parser("info-pacchetto")
    ip_.add_argument("cartella")
    sub.add_parser("abilita-licenza")
    cs = sub.add_parser("configura-sync", help="profilo del ponte web <-> locale; token del sito da DOCMAP_SYNC_TOKEN_WEB, "
                                               "--token-web-file o chiesto")
    cs.add_argument("--modello", help="modello (predefinito: BASE\\sync\\sync-profile.template.json)")
    cs.add_argument("--token-web-file", help="file di testo con il token del sito (es. su chiavetta)")
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
            _print_json(restore_backup(base, a.zip, passphrase=_ask_secret("Passphrase dei backup: ", a.zip, base)))
        elif a.cmd == "verifica-zip":
            _print_json(verify_backup_file(base, a.zip, _ask_secret("Passphrase dei backup: ", a.zip, base)))
        elif a.cmd == "verifica-backup":
            try:
                res = verify_latest_backup(base, a.file, None, a.se_scaduta)
            except PassphraseError:
                raise
            except ToolError as e:
                print(json.dumps({"esito": "errore", "errore": str(e)}, ensure_ascii=False))
                print("Errore: %s" % e, file=sys.stderr)
                return 6
            _print_json(res)
        elif a.cmd == "esporta-in-chiaro":
            frase = "ESPORTA IN CHIARO"
            conf = a.conferma
            if conf != frase and sys.stdin.isatty():
                print("ATTENZIONE: lo zip in chiaro contiene il database E la sua chiave: chi lo ha legge tutti i dati.\n"
                      "Usalo solo per un'emergenza e cancellalo appena possibile. Per continuare scrivi: " + frase, file=sys.stderr)
                conf = input("> ").strip()
            if conf != frase:
                raise ToolError('Esportazione annullata: serve la conferma esplicita --conferma "%s".' % frase)
            _print_json(export_plain(base, a.file, a.out, _ask_secret("Passphrase dei backup: ", a.file, base)))
        elif a.cmd == "passphrase-backup":
            if a.mostra:
                cur = read_passphrases(base)
                if not cur:
                    raise ToolError("Nessuna passphrase dei backup su questo PC (si crea al primo backup o con --crea).")
                print(cur[0])
            elif a.nuova:
                _print_json(set_passphrase(base, generate_code()))
            elif a.imposta:
                new = os.environ.get("DOCMAP_PASSPHRASE") or (_getpass("Nuova passphrase dei backup: ") if sys.stdin.isatty() else "")
                _print_json(set_passphrase(base, new))
            else:
                pp_, created = ensure_passphrase(base)
                _print_json({"creata": created, "impronta": _fp(pp_), "file": passphrase_path(base)})
        elif a.cmd == "kit-emergenza":
            _print_json(make_kit(base, a.out))
        elif a.cmd == "stato-kit":
            _print_json(kit_status(base))
        elif a.cmd == "recupera-chiave":
            code = os.environ.get("DOCMAP_CODICE") or (_getpass("Codice di recupero: ") if sys.stdin.isatty() else "")
            if not code:
                raise PassphraseError("Serve il codice di recupero (variabile DOCMAP_CODICE o scritto a richiesta).")
            _print_json(recover_key(base, a.kit, code, a.sostituisci))
        elif a.cmd == "ping":
            s = load_settings(base)
            url = a.url or "https://127.0.0.1:%d/api" % s["porta"]
            ca = os.path.join(paths(base)["certificati"], CA_CERT)
            cafile = ca if url.startswith("https:") else None   # controllato a ogni tentativo: il server può crearlo all'avvio
            body = ping_wait(url, cafile, a.attendi, a.insecure) if a.attendi else ping(url, cafile, insecure=a.insecure)
            _print_json(body)
        elif a.cmd == "pacchetto":
            info = None
            if a.cliente_json:
                info = _read_json(a.cliente_json)
                if not isinstance(info, dict):
                    raise ToolError("--cliente-json deve contenere un oggetto JSON.")
            _print_json(build_package(a.out, a.zip, public_keys=a.chiave_pubblica, licence=a.licenza,
                                      studio_name=a.nome_studio, sync_model=a.sync_modello, client_info=info,
                                      documents=a.documento))
        elif a.cmd == "info-pacchetto":
            _print_json(package_info(a.cartella))
        elif a.cmd == "abilita-licenza":
            _print_json(enable_licence_required(base))
        elif a.cmd == "configura-sync":
            tok = os.environ.get("DOCMAP_SYNC_TOKEN_WEB", "")
            if not tok and a.token_web_file:
                try:
                    with open(a.token_web_file, "r", encoding="utf-8-sig") as f:
                        lines = f.read().strip().splitlines()
                    tok = lines[0].strip() if lines else ""
                except OSError as e:
                    raise ToolError("File del token non leggibile: %s" % e)
            if not tok and sys.stdin.isatty():
                tok = _getpass("Codice di accesso (token) del sito web per il ponte: ").strip()
            _print_json(configure_sync(base, a.modello, tok, os.environ.get("DOCMAP_SYNC_BASIC_PASS", "")))
        elif a.cmd == "controlla-pacchetto":
            miss = check_package(a.cartella)
            if miss:
                print("Mancano: " + ", ".join(miss), file=sys.stderr)
                return 5
            print("Pacchetto completo.")
        elif a.cmd == "serve":
            return serve(base)
    except PassphraseError as e:
        print("Errore: %s" % e, file=sys.stderr)
        return 3
    except ToolError as e:
        print("Errore: %s" % e, file=sys.stderr)
        return 2
    except Exception as e:   # noqa: BLE001 — i ps1 mostrano il messaggio
        print("Errore imprevisto: %s: %s" % (type(e).__name__, e), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
