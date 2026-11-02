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
| `--php-layout` | spento | con `--root`: ogni `<cartella>/api.php` esistente del deploy è l'API e usa `<cartella>/config.php` (come `php -S`) |
| `--log-level` | `info` | `debug` mostra anche le richieste |

Con `--root`, i file del deploy (web app, `scan.html`, …) sono serviti con le **stesse regole di
`tests/php-router.php`** (che imitano i `.htaccess`): 403 per i nomi `.ht*`, per le cartelle con `Require all denied`
(es. `server-php/data/`) e per i file bloccati da `<FilesMatch>` (es. `config.php`, `*.sqlite`); i file `.php` non vengono
eseguiti (404). `config.php` e `data/` non vengono quindi mai serviti.

In produzione mettilo dietro un proxy HTTPS (IIS, nginx, Caddy…): il token viaggia negli header.

## Licenza

Il controllo della licenza è **disattivato** finché la configurazione non contiene `"licence_required": true`
(`'licence_required' => true` in `config.php`). Così un aggiornamento non mette mai in sola lettura uno studio che già
usa il server, e senza quella chiave il comportamento resta identico a `api.php`.

Con il controllo attivo:

- la licenza è `<data_dir>/licence/licence.docmap-licence`, l'identità dell'installazione `<data_dir>/instance.json`
  (`{"instance_id": "…"}`; se manca, il server adotta l'`instance_id` della prima licenza valida e lo scrive);
- la firma è verificata con `docmap_server/licence_verify.py`, **copia identica** di `hub/docmap_hub/licence.py`
  (non modificarla qui: si aggiorna ricopiandola; `tests/test_licence.py` controlla che le due copie coincidano);
- le chiavi pubbliche fidate sono la costante `TRUSTED_LICENCE_KEYS` in `docmap_server/licence.py` (da
  `export-public-key` del hub). La chiave di configurazione `licence_public_keys` (`{"dmk…": "base64…"}`) serve **solo
  per test e sviluppo**: non usarla mai da un cliente (chi può modificare la configurazione potrebbe sostituire la chiave);
- lo stato è tenuto in memoria e ricontrollato al massimo ogni 10 minuti, oppure subito se il file cambia;
- `full` / `grace` (tolleranza) → tutto funziona; `read_only` / `invalid` → le scritture (`push`, `patch`,
  `token_create`, `token_revoke`, `journal_restore`) rispondono **403 `licence_read_only`**, mentre letture, `pull` ed
  esportazioni funzionano sempre (la licenza non blocca mai i dati);
- limiti: un `push` che creerebbe faldoni oltre `limits.binders` (intero push rifiutato) e un `token_create` per un nuovo
  utente oltre `limits.users` (utenti = nomi distinti con un token attivo) rispondono **403 `licence_limit`**; modificare
  o eliminare resta sempre possibile;
- `me` contiene un oggetto `licence` (modo, messaggio in italiano, giorni rimasti, limiti, funzioni, marchio, cliente,
  piano, scadenza); `ping` ne contiene uno ridotto, senza dati del cliente. Senza `licence_required` l'oggetto non c'è.

Comandi:

```sh
python -m docmap_server licence install studio-rossi.docmap-licence --config /srv/docmap/config.json
python -m docmap_server licence status --config /srv/docmap/config.json
```

`install` verifica il file (firma e installazione), lo copia nella cartella dati conservando il precedente come
`licence.prev.docmap-licence` e mostra lo stato; un file non valido viene rifiutato e la licenza attuale resta.
Il server in esecuzione vede la nuova licenza da solo, senza riavvio.

## Test

```sh
python3 tests/test_licence.py       # licenza: chiavi e licenze create con il hub, server con licence_required
python3 tests/diff_test.py          # PHP vero e Python fianco a fianco (serve php 8 con pdo_sqlite)
NODE_PATH=<node_modules con playwright> python3 tests/validate_python.py   # docs/python/tools/validate_schemas.py contro il Python
```

Suite Playwright completa (`docmapv1/tests/suite.js`, non modificata) con il Python al posto di `php -S`:
`sh tests/run_suite_python.sh` (finto `php` in `tests/php-shim/`; risultati in `SUITE-RESULTS.md`).

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
