#!/usr/bin/env python3
"""Build the all-in-one zip for Dave (DocMap-hub-<version>.zip) and check it before anyone downloads it.

    python3 docmapv1/tools/crea-zip.py --out DIR            build + check, zip in DIR
    python3 docmapv1/tools/crea-zip.py --check FILE.zip     check an existing zip only

Content: every file tracked by git under docmapv1/ except the test folders, plus files made here:
  INIZIA-QUI.html               start page (from docs/INIZIA-QUI.md)
  guide/*.html                  the user guides as HTML, opened with a double click
  MANIFEST-SHA256.txt           one line per file: sha256 and path
Checks (any failure → exit 1, no zip left behind as "good"):
  zip CRC, required files, no forbidden files (real data, keys, databases, tests), .bat/.ps1 with CRLF,
  extraction in a temporary folder, the hub imports there with the right version and finds tools/,
  server-python/ and installer-windows/ beside it (the 0.10.2 problem), manifest matches the content.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import io
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # docmapv1/
REPO = ROOT.parent
SKIP = re.compile(r"^(tests/|ci/|hub/tests/|server-python/tests/|installer-windows/tests/)")
FORBIDDEN = re.compile(r"(^|/)(dati-studio/|\.venv/|__pycache__/)|\.(sqlite3?|db|docmap-key|docmap-backup|pem|key)$"
                       r"|(^|/)config\.php$|(^|/)\.env$")
REQUIRED = [
    "INIZIA-QUI.html", "MANIFEST-SHA256.txt", "guide/DOMANDE-FREQUENTI.html", "guide/WIKI-HUB.html",
    "hub/run_windows.bat", "hub/RACCOGLI-INFO.bat", "hub/requirements.txt", "hub/docmap_hub/__init__.py",
    "tools/build_deploy.py", "server-php/api.php", "server-php/setup.php", "server-python/docmap_server/__init__.py",
    "installer-windows/installa.bat", "installer-windows/installa.ps1", "installer-windows/docmap_tools.py",
    "index.html", "scan.html", "docmap.config.js", "CHANGELOG.md", "STATO.md",
]
# (source in docmapv1/, name in guide/)
GUIDES = [
    ("docs/INIZIA-QUI.md", "INIZIA-QUI.html"),
    ("docs/DOMANDE-FREQUENTI.md", "DOMANDE-FREQUENTI.html"),
    ("docs/WIKI-HUB.md", "WIKI-HUB.html"),
    ("docs/GUIDA-NUOVO-CLIENTE.md", "GUIDA-NUOVO-CLIENTE.html"),
    ("installer-windows/GUIDA-INSTALLAZIONE.md", "GUIDA-INSTALLAZIONE-SEDE.html"),
    ("server-python/GUIDA-SYNC-WEB-LOCALE.md", "GUIDA-SYNC-WEB-LOCALE.html"),
    ("docs/MANUALE-UTENTE.md", "MANUALE-UTENTE.html"),
    ("docs/COLLAUDO-REALE.md", "COLLAUDO-REALE.html"),
    ("docs/AGGIORNAMENTO-v12.7-v12.8.md", "AGGIORNAMENTO-v12.7-v12.8.html"),
    ("docs/AGGIORNAMENTO-v12.8-v12.9.md", "AGGIORNAMENTO-v12.8-v12.9.html"),
    ("docs/AGGIORNAMENTO-v12.9-v12.10.md", "AGGIORNAMENTO-v12.9-v12.10.html"),
]
CSS = """:root{--fg:#1d232b;--mut:#5b6672;--line:#d9dee4;--bg:#fff;--box:#f4f6f8;--acc:#0b6bcb}
@media (prefers-color-scheme:dark){:root{--fg:#e6e9ed;--mut:#9aa5b1;--line:#333b45;--bg:#14181d;--box:#1e242b;--acc:#5aa7f0}}
body{margin:0 auto;max-width:960px;padding:24px 16px 80px;font:16px/1.55 system-ui,"Segoe UI",Arial,sans-serif;color:var(--fg);background:var(--bg)}
h1{font-size:1.8rem}h2{margin-top:2em;border-bottom:2px solid var(--line);padding-bottom:4px}h3{margin-top:1.5em}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.94rem;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}th{background:var(--box)}
code{font-family:Consolas,"Cascadia Mono",monospace;font-size:.88em;background:var(--box);padding:1px 4px;border-radius:3px}
pre{background:var(--box);padding:10px 12px;border-radius:6px;overflow-x:auto}pre code{padding:0;background:none}
blockquote{margin:14px 0;padding:8px 14px;border-left:4px solid var(--acc);background:var(--box);border-radius:4px}
a{color:var(--acc)}.top{font-size:.9rem;color:var(--mut)}@media print{body{max-width:none}}"""


class ZipError(Exception):
    pass


def versions() -> dict:
    hub = re.search(r'__version__ = "([^"]+)"', (ROOT / "hub/docmap_hub/__init__.py").read_text("utf-8")).group(1)
    app = re.search(r"APP_VERSION = '([^']+)'", (ROOT / "assets/js/02-core.js").read_text("utf-8")).group(1)
    return {"hub": hub, "app": app}


def tracked_files() -> list[str]:
    out = subprocess.check_output(["git", "-C", str(REPO), "ls-files", "docmapv1"], text=True)
    rel = [p[len("docmapv1/"):] for p in out.splitlines() if p.startswith("docmapv1/")]
    return sorted(p for p in rel if not SKIP.match(p) and (ROOT / p).is_file())


def md_to_html(text: str, title: str, back: bool) -> str:
    try:
        import markdown
        body = markdown.markdown(text, extensions=["tables", "fenced_code", "toc"])
    except ImportError:                              # agents without python-markdown: still readable
        body = f"<pre>{html.escape(text)}</pre>"
    # links between guides: FOO.md → FOO.html when the guide is in the zip
    names = {Path(src).name: dst for src, dst in GUIDES}
    body = re.sub(r'href="([^"#]*?)([A-Z0-9-]+\.md)(#[^"]*)?"',
                  lambda m: f'href="{names[m.group(2)]}{m.group(3) or ""}"' if m.group(2) in names else m.group(0),
                  body)
    nav = '<p class="top"><a href="../INIZIA-QUI.html">← Inizia qui</a></p>' if back else ""
    return (f'<!doctype html><html lang="it"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title>'
            f"<style>{CSS}</style></head><body>{nav}{body}</body></html>")


def generated(v: dict) -> dict[str, bytes]:
    files = {}
    for src, dst in GUIDES:
        text = (ROOT / src).read_text("utf-8")
        title = (text.lstrip().splitlines() or ["DocMap"])[0].lstrip("# ").strip()
        files[f"guide/{dst}"] = md_to_html(text, title, back=dst != "INIZIA-QUI.html").encode("utf-8")
    upd = ROOT / "docs" / f"AGGIORNAMENTO-HUB-{v['hub']}.md"
    if upd.exists():
        files["guide/AGGIORNAMENTO-HUB.html"] = md_to_html(upd.read_text("utf-8"), upd.stem, back=True).encode("utf-8")
    start = (ROOT / "docs/INIZIA-QUI.md").read_text("utf-8")
    start = start.replace("# DocMap · Inizia qui",
                          f"# DocMap · Inizia qui\n\nHub **{v['hub']}** · app **{v['app']}** · zip del "
                          f"{date.today().isoformat()}", 1)
    page = md_to_html(start, "DocMap · Inizia qui", back=False)
    files["INIZIA-QUI.html"] = page.replace('href="', 'href="guide/').replace('href="guide/http', 'href="http') \
        .replace('href="guide/#', 'href="#').encode("utf-8")
    files["guide/INIZIA-QUI.html"] = md_to_html(start, "DocMap · Inizia qui", back=False).encode("utf-8")
    return files


def build(out_dir: Path) -> Path:
    v = versions()
    top = f"DocMap-hub-{v['hub']}"
    content: dict[str, bytes] = {p: (ROOT / p).read_bytes() for p in tracked_files()}
    content.update(generated(v))
    content["MANIFEST-SHA256.txt"] = "".join(
        f"{hashlib.sha256(b).hexdigest()}  {p}\n" for p, b in sorted(content.items())).encode("utf-8")
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / f"{top}.zip"
    tmp = out_dir / f".{top}.zip.partial"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(content):
            info = zipfile.ZipInfo(f"{top}/{p}", date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, content[p])
    try:
        check(tmp, expect_top=top, expect_version=v["hub"])
    except ZipError:
        tmp.replace(out_dir / f"{top}.NON-VALIDO.zip")
        raise
    tmp.replace(dest)
    return dest


def check(path: Path, expect_top: str | None = None, expect_version: str | None = None) -> dict:
    with zipfile.ZipFile(path) as z:
        bad = z.testzip()
        if bad:
            raise ZipError(f"file rovinato nello zip: {bad}")
        names = [n for n in z.namelist() if not n.endswith("/")]
        tops = {n.split("/", 1)[0] for n in names}
        if len(tops) != 1:
            raise ZipError(f"lo zip deve avere una sola cartella principale, ne ha {sorted(tops)}")
        top = tops.pop()
        if expect_top and top != expect_top:
            raise ZipError(f"cartella principale {top}, attesa {expect_top}")
        rel = {n[len(top) + 1:]: n for n in names}
        missing = [r for r in REQUIRED if r not in rel]
        if missing:
            raise ZipError("mancano: " + ", ".join(missing))
        forbidden = [r for r in rel if FORBIDDEN.search(r) or SKIP.match(r)]
        if forbidden:
            raise ZipError("file che non devono stare nello zip: " + ", ".join(forbidden[:10]))
        lf = [r for r in rel if r.endswith((".bat", ".ps1")) and b"\n" in z.read(rel[r]).replace(b"\r\n", b"")]
        if lf:
            raise ZipError("file per Windows senza a capo CRLF: " + ", ".join(lf))
        manifest = {}
        for line in z.read(rel["MANIFEST-SHA256.txt"]).decode("utf-8").splitlines():
            h, p = line.split("  ", 1)
            manifest[p] = h
        for r, n in rel.items():
            if r == "MANIFEST-SHA256.txt":
                continue
            if manifest.get(r) != hashlib.sha256(z.read(n)).hexdigest():
                raise ZipError(f"impronta diversa dal manifest: {r}")
        if set(manifest) != set(rel) - {"MANIFEST-SHA256.txt"}:
            raise ZipError("manifest e contenuto non coincidono")
        with tempfile.TemporaryDirectory() as td:
            z.extractall(td)
            hub = Path(td) / top / "hub"
            probe = ("import sys; sys.path.insert(0, '.'); from docmap_hub import __version__ as v; "
                     "from docmap_hub.runner import build_deploy_script, server_python_dir; "
                     "from docmap_hub.onboarding import installer_dir; from docmap_hub.service import Hub; "
                     "reg = Hub().registry; "
                     "print(v); print(build_deploy_script(reg)); print(server_python_dir(reg)); "
                     "print(installer_dir(reg))")
            env = dict(os.environ, DOCMAP_HUB_DIR=str(Path(td) / "dati-hub"))
            r = subprocess.run([sys.executable, "-I", "-c", probe], cwd=hub, capture_output=True, text=True, env=env)
            if r.returncode != 0:
                raise ZipError("l'hub estratto non si avvia: " + (r.stderr.strip().splitlines() or ["?"])[-1])
            got = r.stdout.split("\n")
            if expect_version and got[0] != expect_version:
                raise ZipError(f"versione dell'hub {got[0]}, attesa {expect_version}")
            root = str(Path(td) / top)
            for line in got[1:4]:
                if not line.startswith(root):
                    raise ZipError(f"l'hub estratto cerca fuori dallo zip: {line}")
            r = subprocess.run([sys.executable, "-I", "-c",
                                "import sys; sys.path.insert(0, '.'); from docmap_hub.cli import main; "
                                "sys.exit(main(['info']))"], cwd=hub, capture_output=True,
                               text=True, env=env)
            if r.returncode != 0 or got[0] not in r.stdout:
                raise ZipError("«run_windows.bat info» non funziona nello zip estratto: " + r.stderr.strip()[-300:])
    return {"top": top, "files": len(names), "size": path.stat().st_size}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--out", help="cartella dove scrivere lo zip")
    g.add_argument("--check", help="controlla soltanto uno zip esistente")
    a = ap.parse_args(argv)
    try:
        if a.check:
            r = check(Path(a.check))
            print(f"OK {a.check}: {r['files']} file, {r['size'] / 1048576:.1f} MB")
        else:
            dest = build(Path(a.out))
            r = check(dest)
            print(f"OK {dest}: {r['files']} file, {r['size'] / 1048576:.1f} MB (controllato)")
    except ZipError as e:
        print(f"ZIP NON VALIDO: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
