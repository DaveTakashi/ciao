#!/bin/sh
# DocMap server (Python) - avvio su Linux / macOS. Uso: ./run_unix.sh [--config /percorso/config.php] [--port 8080] [--root /deploy]
# Altri comandi: ./run_unix.sh setup --data-dir /srv/docmap-data --user "davide,admin" --user "mario,editor"
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Creo l'ambiente Python in .venv ..."
  python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip >/dev/null
  .venv/bin/python -m pip install -r requirements.txt
fi
exec .venv/bin/python -m docmap_server "$@"
