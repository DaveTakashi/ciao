#!/usr/bin/env python3
"""Product brand (white label): read, check, change and apply ``brand.js``, the single source of the brand.

    python3 tools/brand.py mostra                         show the brand in use
    python3 tools/brand.py controlla                      check brand.js and that the files made from it are up to date
    python3 tools/brand.py applica                        rewrite the files made from brand.js (web app manifests)
    python3 tools/brand.py imposta --nome "Archivio Rossi" --sigla AR --colore "#0a5c8a" --sito https://…
                                                          change brand.js, then applica (one command to rebrand)
    python3 tools/brand.py imposta --da rivenditore.json  same, from a JSON file with the fields to change

Every component reads the brand through the same file:
  app (browser)       assets/js/00-brand.js       → global BRAND
  PHP server          server-php/brand.php        → dm_brand()
  Python (hub, server, installer, tools)          → this module, ``load(root)`` / ``parse(text)``
The hub writes a merged copy (product brand + reseller brand) into every site and package it builds (``render``).
Guide for people: docs/MARCHIO.md.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # docmapv1/
FILE = "brand.js"
VAR = "window.DOCMAP_BRAND"

# Neutral values used only when brand.js is missing or a field is empty: never a product name.
DEFAULTS: dict = {
    "product_name": "Archivio documenti",
    "short_name": "",
    "mark": "",
    "edition": "",
    "tagline": {"it": "", "en": ""},
    "logo_url": "",
    "primary_color": "",
    "vendor_name": "",
    "vendor_legal": "",
    "vendor_vat": "",
    "vendor_address": "",
    "website": "",
    "support_email": "",
    "support_phone": "",
    "privacy_url": "",
    "terms_url": "",
    "copyright": "",
    "hub_name": "Hub",
    "file_prefix": "",
    "languages": ["it", "en"],
    "default_language": "it",
}
# Languages the program has dictionaries for (assets/js i18n, help, hub texts). A brand can offer a subset.
SUPPORTED_LANGUAGES = ("it", "en")
# Keys of the licence "branding" object (hub reseller) mapped to brand keys: same names on purpose.
LICENCE_KEYS = ("product_name", "logo_url", "primary_color", "support_email")
FORBIDDEN_KEYS = ("qr_base", "qrBase", "qr_domain")   # the QR address is per installation, never part of a brand

HEADER = """/* Product brand: the ONLY place where the product name, logo, colours, contacts, web site and legal texts live.
   Read by the app (assets/js/00-brand.js), the PHP server (server-php/brand.php), the Python server, the installer
   and the hub (Python: tools/brand.py and the readers built on it). Guide: docs/MARCHIO.md.

   Format (do not change it): one line «window.DOCMAP_BRAND =», then a pure JSON object, then «;». No comments
   inside the JSON, so PHP and Python can read it without a JavaScript engine. Change it with
       python3 tools/brand.py imposta --nome "Nuovo nome"      (or edit by hand, then: python3 tools/brand.py controlla)
   The QR address is NOT here on purpose: it is a setting of each installation (docmap.config.js qrBase /
   Impostazioni › Indirizzo dei QR, qr7.it by default), never tied to the brand. */
"""

_RE = re.compile(r"window\.DOCMAP_BRAND\s*=\s*(\{.*\})\s*;?\s*$", re.S)
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


class BrandError(ValueError):
    pass


def parse(text: str) -> dict:
    """The JSON object inside a brand.js text (raises BrandError)."""
    m = _RE.search(text.lstrip("﻿"))
    if not m:
        raise BrandError("brand.js: manca «window.DOCMAP_BRAND = {…};»")
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        raise BrandError(f"brand.js: JSON non valido ({e.msg}, riga {e.lineno})") from None
    if not isinstance(data, dict):
        raise BrandError("brand.js: deve essere un oggetto JSON")
    return data


def normalize(data: dict | None) -> dict:
    """Defaults + data, with derived values filled (short_name, file_prefix, copyright)."""
    b = json.loads(json.dumps(DEFAULTS))
    for k, v in (data or {}).items():
        if k in FORBIDDEN_KEYS or v is None:
            continue
        if k == "tagline" and isinstance(v, str):
            v = {lang: v for lang in SUPPORTED_LANGUAGES}
        if k == "tagline" and isinstance(v, dict):
            b["tagline"].update({str(x): str(y) for x, y in v.items()})
            continue
        b[k] = v
    if not str(b.get("product_name") or "").strip():
        b["product_name"] = DEFAULTS["product_name"]
    b["short_name"] = b.get("short_name") or b["product_name"]
    b["file_prefix"] = b.get("file_prefix") or re.sub(r"[^A-Za-z0-9]+", "", b["product_name"]) or "Archivio"
    b["vendor_name"] = b.get("vendor_name") or b["product_name"]
    langs = [x for x in (b.get("languages") or []) if x in SUPPORTED_LANGUAGES] or ["it"]
    b["languages"] = langs
    if b.get("default_language") not in langs:
        b["default_language"] = langs[0]
    return b


def load(root: str | Path | None = None, override: dict | None = None) -> dict:
    """Brand of a program folder (docmapv1/, an installed app/ or a deployed site). Missing file → neutral brand."""
    p = Path(root or ROOT) / FILE
    try:
        data = parse(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        data = {}
    return normalize(merge(data, override))


# Fields that say WHO sells the product: when an override changes the product name (a reseller), none of them is
# inherited from the base brand, so a reseller's customer never sees the original vendor's site, mail or logo.
IDENTITY_KEYS = ("short_name", "mark", "logo_url", "primary_color", "vendor_name", "vendor_legal", "vendor_vat",
                 "vendor_address", "website", "support_email", "support_phone", "privacy_url", "terms_url", "file_prefix")


def merge(base: dict, override: dict | None) -> dict:
    """base + override (e.g. the reseller branding of the hub); empty override values do not erase base values.
    A new product_name drops the base IDENTITY_KEYS (they come only from the override, or are derived)."""
    out = dict(base or {})
    if override and str(override.get("product_name") or "").strip() and override["product_name"] != out.get("product_name"):
        for k in IDENTITY_KEYS:
            out.pop(k, None)
    for k, v in (override or {}).items():
        if v in (None, "") or k in FORBIDDEN_KEYS:
            continue
        if k == "tagline" and isinstance(v, dict) and isinstance(out.get("tagline"), dict):
            v = {**out["tagline"], **{x: y for x, y in v.items() if y}}
        out[k] = v
    return out


def validate(data: dict) -> list[str]:
    """Problems of a brand (empty list = good). ``data`` is what brand.js contains (not normalized)."""
    errs = []
    unknown = sorted(set(data) - set(DEFAULTS))
    if unknown:
        errs.append("campi sconosciuti: " + ", ".join(unknown) + " (vedi docs/MARCHIO.md)")
    for k in FORBIDDEN_KEYS:
        if k in data:
            errs.append(f"«{k}» non va nel marchio: l'indirizzo dei QR si sceglie per installazione (docmap.config.js)")
    name = data.get("product_name")
    if not isinstance(name, str) or not name.strip() or len(name) > 60:
        errs.append("product_name: obbligatorio, al massimo 60 caratteri")
    for k in ("product_name", "short_name", "mark", "vendor_name", "hub_name"):
        if re.search(r"[<>&\"'\\{}]", str(data.get(k, "") or "")):
            errs.append(f"{k}: niente < > & \" ' \\ {{ }} (il nome finisce in pagine web, PDF e file)")
    for k in ("short_name", "mark", "edition", "logo_url", "primary_color", "vendor_name", "vendor_legal", "vendor_vat",
              "vendor_address", "website", "support_email", "support_phone", "privacy_url", "terms_url", "copyright",
              "hub_name", "file_prefix", "default_language"):
        if k in data and not isinstance(data[k], str):
            errs.append(f"{k}: deve essere un testo")
    if len(str(data.get("mark", ""))) > 4:
        errs.append("mark: al massimo 4 caratteri (la sigla nel riquadro in alto a sinistra)")
    if len(str(data.get("short_name", ""))) > 24:
        errs.append("short_name: al massimo 24 caratteri (nome sotto l'icona del telefono)")
    col = data.get("primary_color", "")
    if col and not _HEX.match(str(col)):
        errs.append("primary_color: vuoto oppure nel formato #RRGGBB")
    for k in ("website", "privacy_url", "terms_url"):
        v = str(data.get(k, "") or "")
        if v and not re.match(r"^https?://[^\s\"'<>]+$", v):
            errs.append(f"{k}: indirizzo http(s):// oppure vuoto")
    logo = str(data.get("logo_url", "") or "")
    if logo and not re.match(r"^(https://|data:image/(png|svg\+xml|jpeg|webp);base64,|[A-Za-z0-9_./-]+\.(png|svg|jpg|jpeg|webp)$)", logo):
        errs.append("logo_url: percorso di un'immagine (es. assets/icons/logo.svg), https:// oppure data:image/…")
    if logo.startswith(("../", "/")) or ".." in logo.split("/"):
        errs.append("logo_url: percorso relativo dentro la cartella del programma")
    mail = str(data.get("support_email", "") or "")
    if mail and not re.match(r"^[^@\s,;?&]+@[^@\s,;?&]+\.[^@\s,;?&]+$", mail):
        errs.append("support_email: un solo indirizzo semplice")
    fp = str(data.get("file_prefix", "") or "")
    if fp and not re.match(r"^[A-Za-z0-9_-]{1,32}$", fp):
        errs.append("file_prefix: solo lettere, cifre, - e _ (nomi dei file e degli zip)")
    tag = data.get("tagline", {})
    if not isinstance(tag, (dict, str)):
        errs.append("tagline: testo oppure {\"it\": …, \"en\": …}")
    langs = data.get("languages", DEFAULTS["languages"])
    if not isinstance(langs, list) or not langs or any(x not in SUPPORTED_LANGUAGES for x in langs):
        errs.append("languages: elenco non vuoto fra " + ", ".join(SUPPORTED_LANGUAGES))
    elif data.get("default_language", langs[0]) not in langs:
        errs.append("default_language: deve essere una delle languages")
    return errs


def render(data: dict) -> str:
    """brand.js text for ``data`` (what the hub writes into each site and package)."""
    body = json.dumps(data, ensure_ascii=False, indent=2)
    return HEADER + VAR + " =\n" + body + "\n;\n"


def copyright_text(b: dict, year: int | None = None) -> str:
    return (b.get("copyright") or "").replace("{year}", str(year or date.today().year)).replace("{vendor}", b.get("vendor_name", ""))


def tagline(b: dict, lang: str = "it") -> str:
    t = b.get("tagline") or {}
    return t.get(lang) or t.get(b.get("default_language", "it")) or ""


# ------------------------------------------------------------------ files made from brand.js

def manifests(b: dict) -> dict[str, str]:
    """The two web app manifests (installable app, v12.9) for brand ``b`` (normalized)."""
    icons = [{"src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
             {"src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
             {"src": "assets/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]
    lang = b["default_language"]
    words = {"it": ("archivio", "telefono", "Archivio fisico: faldoni, scaffali, etichette e QR.",
                    "Cerca, scansiona e cataloga i faldoni dal telefono."),
             "en": ("archive", "phone", "Physical archive: binders, shelves, labels and QR codes.",
                    "Search, scan and catalogue binders from the phone.")}[lang]
    pc = {"id": "./index.html", "name": f"{b['product_name']} — {words[0]}", "short_name": b["short_name"],
          "description": words[2], "lang": lang, "dir": "ltr", "start_url": "./index.html", "scope": "./",
          "display": "standalone", "background_color": "#F1F5F9", "theme_color": "#0F172A", "icons": icons}
    ph = {"id": "./scan.html", "name": f"{b['product_name']} — {words[1]}", "short_name": b["short_name"],
          "description": words[3], "lang": lang, "dir": "ltr", "start_url": "./scan.html", "scope": "./",
          "display": "standalone", "orientation": "portrait", "background_color": "#0F172A", "theme_color": "#0F172A",
          "icons": icons}
    dump = lambda o: json.dumps(o, ensure_ascii=False, indent=2) + "\n"
    return {"manifest.webmanifest": dump(pc), "scan.webmanifest": dump(ph)}


def derived_files(root: str | Path | None = None, brand: dict | None = None) -> dict[str, str]:
    """Every file whose content comes from the brand: {relative path: text}."""
    return manifests(brand or load(root))


def apply(root: str | Path | None = None, brand: dict | None = None) -> list[str]:
    """Rewrite the derived files in ``root``; returns the ones that changed."""
    root = Path(root or ROOT)
    changed = []
    for rel, text in derived_files(root, brand).items():
        p = root / rel
        old = p.read_text(encoding="utf-8") if p.exists() else None
        if old != text:
            p.write_text(text, encoding="utf-8", newline="\n")
            changed.append(rel)
    return changed


def check(root: str | Path | None = None) -> list[str]:
    root = Path(root or ROOT)
    try:
        data = parse((root / FILE).read_text(encoding="utf-8"))
    except (FileNotFoundError, BrandError) as e:
        return [str(e)]
    errs = validate(data)
    for rel, text in derived_files(root).items():
        p = root / rel
        if not p.exists() or p.read_text(encoding="utf-8") != text:
            errs.append(f"{rel} non corrisponde a brand.js: lancia «python3 tools/brand.py applica»")
    return errs


# ------------------------------------------------------------------ command line

SET_OPTIONS = {   # option → brand key
    "nome": "product_name", "nome_breve": "short_name", "sigla": "mark", "edizione": "edition", "logo": "logo_url",
    "colore": "primary_color", "fornitore": "vendor_name", "ragione_sociale": "vendor_legal", "piva": "vendor_vat",
    "indirizzo": "vendor_address", "sito": "website", "email_assistenza": "support_email",
    "telefono_assistenza": "support_phone", "privacy": "privacy_url", "condizioni": "terms_url",
    "copyright": "copyright", "nome_hub": "hub_name", "prefisso_file": "file_prefix",
    "lingua_predefinita": "default_language",
}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="brand.py", description="Marchio del prodotto (white label): brand.js")
    ap.add_argument("--cartella", default=str(ROOT), help="cartella del programma (predefinita: docmapv1/)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("mostra", help="mostra il marchio in uso")
    sub.add_parser("controlla", help="controlla brand.js e i file che ne derivano")
    sub.add_parser("applica", help="riscrive i file che derivano da brand.js")
    p = sub.add_parser("imposta", help="cambia brand.js e riscrive i file derivati")
    for opt in SET_OPTIONS:
        p.add_argument("--" + opt.replace("_", "-"))
    p.add_argument("--slogan-it")
    p.add_argument("--slogan-en")
    p.add_argument("--lingue", help="es. it,en")
    p.add_argument("--da", help="file JSON con i campi da cambiare (stessi nomi di brand.js)")
    a = ap.parse_args(argv)
    root = Path(a.cartella)

    if a.cmd == "mostra":
        print(json.dumps(load(root), ensure_ascii=False, indent=2))
        return 0
    if a.cmd == "controlla":
        errs = check(root)
        for e in errs:
            print("  ✗ " + e)
        if not errs:
            b = load(root)
            print(f"  ✓ brand.js valido: «{b['product_name']}», lingue {', '.join(b['languages'])}; file derivati aggiornati")
        return 1 if errs else 0
    if a.cmd == "applica":
        ch = apply(root)
        print("Aggiornati: " + (", ".join(ch) if ch else "nessuno (già allineati)"))
        return 0

    # imposta
    path = root / FILE
    data = parse(path.read_text(encoding="utf-8")) if path.exists() else {}
    patch: dict = {}
    if a.da:
        patch.update(json.loads(Path(a.da).read_text(encoding="utf-8-sig")))
    for opt, key in SET_OPTIONS.items():
        v = getattr(a, opt)
        if v is not None:
            patch[key] = v
    if a.slogan_it is not None or a.slogan_en is not None:
        tag = dict(data.get("tagline") or {})
        if a.slogan_it is not None:
            tag["it"] = a.slogan_it
        if a.slogan_en is not None:
            tag["en"] = a.slogan_en
        patch["tagline"] = tag
    if a.lingue:
        patch["languages"] = [x.strip() for x in a.lingue.split(",") if x.strip()]
    new = {**data, **patch}
    errs = validate(new)
    if errs:
        for e in errs:
            print("  ✗ " + e)
        print("Nulla è cambiato.")
        return 1
    path.write_text(render(new), encoding="utf-8", newline="\n")
    ch = apply(root)
    print(f"Marchio: «{new['product_name']}». Scritto {FILE}" + (", " + ", ".join(ch) if ch else ""))
    print("Ricorda: rifai lo zip (tools/crea-zip.py) e ripubblica i siti dall'hub per portare il marchio ai clienti.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
