"""python -m docmap_server [serve] [--config PATH] [--host H] [--port N] [--root DIR] [--api-path P …]
python -m docmap_server setup --data-dir DIR --user "davide,admin" --user "mario,editor" [--config config.json] …
python -m docmap_server licence install FILE [--config PATH]   |   python -m docmap_server licence status [--config PATH]
python -m docmap_server sync-remote PROFILO.json [--dry-run] [--json] [--direction both|a-to-b|b-to-a]   (ponte server ⇄ server)
python -m docmap_server sync-remote --example PROFILO.json                                             (scrive un profilo di esempio)
"""
from __future__ import annotations

import argparse
import logging
import os
import sys

from .phpconfig import default_config_path


def _config_path(arg):
    return os.path.abspath(arg or os.environ.get("DOCMAP_CONFIG") or default_config_path())


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] not in ("serve", "setup", "licence", "sync-remote"):
        argv.insert(0, "serve")
    ap = argparse.ArgumentParser(prog="python -m docmap_server", description="DocMap shared online database (Python port of server-php/api.php)")
    sub = ap.add_subparsers(dest="cmd")
    s = sub.add_parser("serve", help="start the API server (default)")
    s.add_argument("--config", help="config.php or config.json (default: $DOCMAP_CONFIG, else ./config.json, else ./config.php)")
    s.add_argument("--host", default=os.environ.get("DOCMAP_HOST", "127.0.0.1"))
    s.add_argument("--port", type=int, default=int(os.environ.get("DOCMAP_PORT", "8080")))
    s.add_argument("--root", default=os.environ.get("DOCMAP_ROOT"), help="deploy folder served as static files from the same origin")
    s.add_argument("--api-path", action="append", help="URL path of the API (repeatable; default /studio-de/server-php/api.php and /api)")
    s.add_argument("--php-layout", action="store_true", help="with --root: every existing <dir>/api.php under the root is the API, with <dir>/config.php (as php -S does)")
    s.add_argument("--log-level", default="info")
    u = sub.add_parser("setup", help="create key, tokens and the configuration (like setup.php)")
    u.add_argument("--config", default=None, help="file to write (default: $DOCMAP_CONFIG or ./config.json); *.php = setup.php format")
    u.add_argument("--data-dir", required=True, help="absolute path of the database folder (better outside the web site)")
    u.add_argument("--user", action="append", help='"name,role" (role: admin, editor, viewer); repeatable')
    u.add_argument("--users", help='several "name,role" separated by ";" or new lines')
    u.add_argument("--studio-name", default="")
    u.add_argument("--allow-file", dest="allow_file", action="store_true", default=True, help="allow the desktop app from file:// (origin null) [default]")
    u.add_argument("--no-allow-file", dest="allow_file", action="store_false")
    u.add_argument("--format", choices=("json", "php"))
    li = sub.add_parser("licence", help="install or show the licence (only enforced with \"licence_required\": true)")
    lsub = li.add_subparsers(dest="licence_cmd", required=True)
    lin = lsub.add_parser("install", help="verify a .docmap-licence file and copy it into <data_dir>/licence/")
    lin.add_argument("file")
    lin.add_argument("--config", default=None)
    lst = lsub.add_parser("status", help="show the installed licence")
    lst.add_argument("--config", default=None)
    sr = sub.add_parser("sync-remote", help="sync two DocMap servers (web <-> local) through their API")
    sr.add_argument("profile", help="JSON profile with sides a and b (url, token, ...); state and sync-log/ are kept next to it")
    sr.add_argument("--dry-run", action="store_true", help="only compute and print the plan: nothing is written on either side")
    sr.add_argument("--json", action="store_true", help="print the report as JSON instead of the Italian summary")
    sr.add_argument("--direction", choices=("both", "a-to-b", "b-to-a"), default=None, help="default: the profile's, else both")
    sr.add_argument("--example", action="store_true", help="write an example profile at PROFILE and exit")
    a = ap.parse_args(argv)
    if a.cmd == "sync-remote":
        from .sync_remote import cli as sync_cli
        return sync_cli(a)
    if a.cmd == "licence":
        from .licence import cli
        return cli(a, _config_path(a.config))
    if a.cmd == "setup":
        from .setup_cmd import run_setup
        a.config = a.config or os.environ.get("DOCMAP_CONFIG") or "config.json"
        return run_setup(a)
    logging.basicConfig(level=getattr(logging, a.log_level.upper(), logging.INFO), format="%(asctime)s %(levelname)s %(message)s")
    import uvicorn
    from .web import DEFAULT_API_PATHS, create_app
    cfg = _config_path(a.config)
    app = create_app(cfg, a.root, a.api_path or DEFAULT_API_PATHS, php_layout=a.php_layout and bool(a.root))
    print("DocMap server (Python) — config %s — http://%s:%d%s" % (cfg, a.host, a.port, (a.api_path or DEFAULT_API_PATHS)[0]), flush=True)
    uvicorn.run(app, host=a.host, port=a.port, log_level=a.log_level.lower(), server_header=False, access_log=a.log_level.lower() == "debug")
    return 0


if __name__ == "__main__":
    sys.exit(main())
