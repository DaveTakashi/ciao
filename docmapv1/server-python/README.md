# DocMap — server Python (porting 1:1 di `server-php/api.php`)

Questo è il database online condiviso di DocMap riscritto in Python (FastAPI + uvicorn + cryptography).
Fa **esattamente** quello che fa `server-php/api.php`: stesse rotte (`?r=<rotta>` su un solo indirizzo), stessi
parametri, stesso JSON, stessi codici HTTP ed `error.code`, stessi header (CORS, `ETag`, `no-store`…), stessa
cifratura dei dati e **lo stesso file `docmap.sqlite`**. Il front-end (PC, web app, telefono) non si accorge del cambio.

Si può passare da PHP a Python, e tornare indietro, sulla **stessa cartella dati** con la **stessa chiave**:
basta puntare il server Python al `config.php` esistente (o a un `config.json` con le stesse chiavi).

Requisiti: Python 3.11 o più recente. Pacchetti: `fastapi`, `uvicorn`, `cryptography` (hanno tutti le wheel per
Windows: nessun compilatore).

## Avvio su Windows

1. Installa Python da <https://www.python.org/> (spunta "Add python.exe to PATH").
2. Doppio clic su `run_windows.bat`, oppure da un prompt dei comandi:

```bat
run_windows.bat --config C:\DocMap\config.php --port 8080
```

La prima volta crea l'ambiente `.venv` e installa i pacchetti di `requirements.txt`.

## Avvio su Linux / macOS

```sh
./run_unix.sh --config /srv/docmap/config.php --port 8080
```

Oppure a mano: `pip install -r requirements.txt` e poi `python3 -m docmap_server --config ... --port 8080`
(da questa cartella, o con questa cartella nel `PYTHONPATH`).

## Configurazione

Il server legge, nell'ordine: l'opzione `--config <file>`, la variabile d'ambiente `DOCMAP_CONFIG`, poi
`config.json` e infine `config.php` nella cartella corrente. Il file viene **riletto a ogni richiesta**, come fa il PHP.

- `config.php`: quello scritto da `setup.php` (o a mano da `config.sample.php`) va bene così com'è. Il file **non viene
  eseguito**: il server legge l'array restituito da `return [...]` / `return array(...)` (stringhe, numeri, `true` /
  `false` / `null`, array annidati, commenti).
- `config.json`: stesse chiavi, per esempio:

```json
{"data_dir": "C:\\DocMapData", "aes_key": "<32 byte in base64>",
 "tokens": [{"user": "davide", "role": "admin", "token_sha256": "<64 hex>"}],
 "allowed_origins": ["null"], "max_fails": 5, "lock_seconds": 60, "max_body_mb": 20, "studio_name": "",
 "journal_keep_days": 0, "journal_pulls": "changes"}
```

Il significato delle chiavi è quello di `server-php/config.sample.php` (e di `docs/python/PORTING.md` §2).

### Prima installazione (al posto di `setup.php`)

```sh
python -m docmap_server setup --data-dir /srv/docmap-data --user "davide,admin" --user "mario,editor" --studio-name "Studio Rossi"
```

Crea la cartella dati (con `.htaccess` e `index.html` di protezione, come `setup.php`), una chiave AES-256 casuale e un
codice di accesso (token) per persona, scrive `config.json` (o `config.php` nel formato di `setup.php` con
`--config percorso/config.php` o `--format php`) e **mostra i token una sola volta**: nel file resta solo il loro SHA-256.
Si rifiuta di partire se il file di configurazione esiste già. Opzioni: `--users "a,admin;b,editor"`,
`--no-allow-file` (non ammette il programma sul PC da `file://`).

**Conserva una copia della configurazione al sicuro**: senza `aes_key` il database e i suoi backup non si leggono.

## Opzioni del server

| Opzione | Predefinito | Cosa fa |
|---|---|---|
| `--config FILE` | `$DOCMAP_CONFIG`, `./config.json`, `./config.php` | file di configurazione |
| `--host H` / `--port N` | `127.0.0.1` / `8080` | indirizzo di ascolto (anche `DOCMAP_HOST`, `DOCMAP_PORT`) |
| `--api-path P` (ripetibile) | `/studio-de/server-php/api.php` e `/api` | percorsi su cui risponde l'API (`?r=<rotta>`) |
| `--root DIR` | nessuno | serve anche i file statici di una cartella di deploy dalla stessa origine |
| `--log-level` | `info` | `debug` mostra anche le richieste |

Con `--root`, i file del deploy (web app, `scan.html`, …) sono serviti con le **stesse regole di
`tests/php-router.php`** (che imitano i `.htaccess`): 403 per i nomi `.ht*`, per le cartelle con `Require all denied`
(es. `server-php/data/`) e per i file bloccati da `<FilesMatch>` (es. `config.php`, `*.sqlite`); i file `.php` non vengono
eseguiti (404). `config.php` e `data/` non vengono quindi mai serviti.

In produzione mettilo dietro un proxy HTTPS (IIS, nginx, Caddy…): il token viaggia negli header.

## Gancio per la licenza

`docmap_server/licence.py` contiene `current_mode()`, che oggi restituisce sempre `'full'`. Viene chiamata dopo
l'autenticazione per ogni rotta di **scrittura** (`push`, `patch`, `token_create`, `token_revoke`, `journal_restore`):
se restituisce `'read_only'` la scrittura viene rifiutata con HTTP 403 e `error.code = "licence_read_only"`, mentre
le letture continuano a funzionare. Il controllo vero della licenza va scritto lì dentro, senza toccare `api.py`.

## Test

```sh
python3 tests/diff_test.py          # PHP vero e Python fianco a fianco (serve php 8 con pdo_sqlite)
NODE_PATH=<node_modules con playwright> python3 tests/validate_python.py   # docs/python/tools/validate_schemas.py contro il Python
```

`diff_test.py` avvia `php -S … tests/php-router.php` e il server Python con la stessa chiave e gli stessi token, manda a
entrambi la stessa sequenza di richieste e confronta stato, JSON e header; poi confronta i due `docmap.sqlite`
(decifrati), apre la cartella dati del PHP con il Python e viceversa, prova il blocco per IP e l'aggiornamento di un
database v10.1. Stato e risultati: `PROGRESS.md`.

## Differenze note rispetto al PHP

- `ping` restituisce `"php": "Python 3.x"` (versione dell'interprete) invece della versione di PHP; il resto è uguale.
- Le date sono interpretate nei formati ISO 8601 che i client usano (data, data+ora, frazioni, `Z`/`UTC`/`±hh:mm`);
  le espressioni relative di PHP (`now`, `tomorrow`, `@123`…) valgono 0 (= data non valida). Una data senza fuso è UTC
  (come `php -S` senza `date.timezone`).
- `substr()` del PHP taglia i byte: un nome operatore/dispositivo oltre 80/100 byte tagliato a metà di una lettera
  accentata viene salvato con il carattere `U+FFFD` invece dei byte spezzati (nel JSON il risultato è identico).
- I limiti di PHP (`post_max_size`, profondità JSON, ecc.) sono riprodotti solo dove contano per DocMap
  (`max_body_mb`, profondità 512).
