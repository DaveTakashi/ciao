# DocMap — server Python (porting 1:1 di `server-php/api.php`)

> **Parità v12** (DocMap 26.12.0): stesso contratto di `api.php` v12 — `schema` 3 (tabella `access_log`, aggiunta in
> place da un database v11 o v10.1), tipi di record `archive` e `status_event`, rotte `access`, `last_seen`, `seen`,
> parametro `via` di `binder` / `location` / `resolve`, `status_events` e `status_types` nelle risposte di `binder` e
> `location`, `me.remember_minutes`, `ping.features` = `journal, device_info, locations, archives, access_log, status_events`.

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
 "journal_keep_days": 0, "journal_pulls": "changes",
 "access_keep_days": 365, "access_dedupe_seconds": 120, "remember_minutes": null}
```

Il significato delle chiavi è quello di `server-php/config.sample.php` (e di `docs/python/PORTING.md` §2).

Opzioni nuove della v12 (tutte facoltative, stessi valori predefiniti del PHP):

| Chiave | Predefinito | Cosa fa |
|---|---|---|
| `access_keep_days` | `365` | giorni di registro accessi conservati; le righe più vecchie si tolgono al massimo una volta al giorno; `0` = per sempre (e `seen` accetta visite di qualsiasi data) |
| `access_dedupe_seconds` | `120` | la stessa persona, dallo stesso dispositivo, sullo stesso record e nello stesso modo (`via`) entro questo tempo = una riga sola; per `seen`, un elemento rimandato con `at` entro ± questo tempo è registrato una volta; `0` = ogni lettura |
| `remember_minutes` | `null` | restituito da `me`: minuti di inattività dopo cui il telefono chiede di nuovo il PIN (`null` = decide il dispositivo, `0` = sempre, `480` = 8 ore, `43200` = 30 giorni, `-1` = finché non si esce). Un valore non numerico vale `null`, un numero con decimali è troncato (come `is_numeric` / `(int)` del PHP) |

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

### Non perdere mai la chiave

`aes_key` in `config.json` (o `config.php`) è la chiave AES-256 con cui il server cifra **ogni** record di
`docmap.sqlite`. Non esiste altrove: non è nel database, non è sul sito, Dave non ne ha una copia. Se il file si perde
(PC rotto, cartella cancellata, nuovo deploy che rigenera la configurazione con `setup`) il database resta lì ma è
**illeggibile per sempre**; un `setup` nuovo crea una chiave diversa (per questo si rifiuta di partire se trova già un
`docmap.sqlite`), e il server avvisa con `aes_key does not match the existing database`.

Cosa fare:

- **Installazione in sede (Windows)**: crea e stampa il **Kit di emergenza** (`installer-windows/GUIDA-INSTALLAZIONE.md`,
  §7bis): un file `.docmap-key` con la configurazione cifrata da un codice di recupero, più un foglio con quel codice e
  la passphrase dei backup. `kit-emergenza.ps1 -Recupera` (o `docmap_tools.py recupera-chiave --kit … `) ricostruisce
  `config.json` su un PC nuovo e il database vecchio si riapre. I backup dell'installer sono cifrati (`.docmap-backup`) e
  contengono anche la configurazione: con un backup e la passphrase si recupera tutto.
- **Server web (deploy)**: prima di cancellare o ricaricare un deploy copia `config.php`/`config.json` **e** la cartella
  dati in un posto sicuro; dopo il nuovo caricamento rimetti il **vecchio** file di configurazione invece di rifare il
  setup. Tieni una copia della configurazione in un gestore di password o cifrata (anche con `docmap_tools.py
  kit-emergenza --base <cartella con config\config.json>` si ottiene il file `.docmap-key` + il foglio da stampare).
- I codici di accesso (token) nel file sono solo impronte SHA-256: perderli non apre i dati a nessuno, ma senza
  `aes_key` nemmeno i codici giusti servono.

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
- le chiavi pubbliche fidate sono la costante `TRUSTED_LICENCE_KEYS` in `docmap_server/licence.py` **più** il file
  `docmap_server/trusted_keys.json` accanto al codice, nello stesso formato di `python -m docmap_hub export-public-key`
  (`{"keys": {"dmk…": "base64…"}}`). Il file lo mette il pacchetto personale del cliente
  (`installer-windows/docmap_tools.py pacchetto --chiave-pubblica …`, lo fa il hub con `cliente nuovo`): **non serve
  modificare il codice**. Modello delle minacce: il file sta nella cartella del **codice**, non in quella dei dati; chi
  può scrivere nel codice può già far eseguire qualsiasi cosa al server (nessun file lì è "meno sicuro" del codice),
  mentre chi può scrivere solo nei dati (un ripristino, una cartella sincronizzata, l'utente web di un hosting) non può
  aggiungere chiavi. In studio l'installazione rende `C:\DocMap\server` modificabile solo da amministratori e SYSTEM.
  Un file rovinato o una chiave non valida vengono **ignorati** (riga nel registro), mai un errore fatale: al massimo la
  licenza risulta "non valida" → sola lettura, mai dati persi. A parità di `key_id` vince la costante. `licence status`
  elenca le chiavi fidate e avvisa se non ce n'è nessuna;
- la chiave di configurazione `licence_public_keys` (`{"dmk…": "base64…"}`) serve **solo per test e sviluppo**: non
  usarla mai da un cliente (chi può modificare la configurazione potrebbe sostituire la chiave);
- lo stato è tenuto in memoria e ricontrollato al massimo ogni 10 minuti, oppure subito se il file cambia;
- `full` / `grace` (tolleranza) → tutto funziona; `read_only` / `invalid` → le scritture (`push`, `patch`,
  `token_create`, `token_revoke`, `journal_restore`) rispondono **403 `licence_read_only`**, mentre letture, `pull` ed
  esportazioni funzionano sempre (la licenza non blocca mai i dati). v12: i record `archive` e `status_event` passano da
  `push` e quindi sono bloccati come gli altri; `access` e `last_seen` sono letture e funzionano; **`seen`** (POST) è
  un record di controllo ("chi ha guardato cosa"), non una modifica dei dati: **funziona anche in sola lettura**, come
  la riga di `access_log` che ogni lettura di `binder` / `location` / `resolve` scrive (costante `LICENCE_AUDIT_WRITES`
  in `api.py`). I `status_event` non contano nel limite `limits.binders`;
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

## Sincronizzazione server ⇄ server (web ⇄ studio)

`python -m docmap_server sync-remote PROFILO.json [--dry-run] [--json] [--direction both|a-to-b|b-to-a]` tiene allineati
due server DocMap (il web PHP e il server Python dello studio, ma anche Python ⇄ Python o PHP ⇄ PHP) usando **solo
l'API**, come un client: token editor per lato, HTTP Basic facoltativo, `ca` per il certificato dello studio.
Guida passo passo in italiano (profilo, prova, pianificazione con `schtasks`, conflitti, errori, sicurezza):
**[GUIDA-SYNC-WEB-LOCALE.md](GUIDA-SYNC-WEB-LOCALE.md)**. Codice: `docmap_server/sync_remote.py` (solo libreria standard).

Note tecniche:

- Regole = quelle di `r_push`: confronto di `ts_ms(updated_at | deletedAt)`; stessa ora + stesso contenuto canonico
  (`canon`, `CANON_SKIP`, per le ubicazioni anche `code`/`level`) = allineato; stessa ora + contenuto diverso = conflitto,
  nessun lato toccato (resta in `open_conflicts` dello stato finché uno dei due lo modifica). Un `rejected/older` del server
  porta la versione più recente, che viene mandata all'altro lato (fino a 3 giri in più).
- Stato in `<profilo>.state.json` (scrittura atomica): cursori `seq` / `log_seq` per lato, spostati **solo** quando le
  novità di quel lato sono arrivate all'altro (direzione esclusa, errore o licenza `read_only` → il cursore resta);
  `known` = versione che i due lati condividono per ogni record (niente rimbalzi dei record appena mandati);
  id delle voci di registro mandate (niente rimbalzi del registro). Un giro interrotto si riprende: ciò che era già
  arrivato risulta allineato, applicati 0.
- Impostazioni condivise: LWW sul blocco come fa il server (`settings.updated_at` più recente); stessa ora e contenuto
  diverso = conflitto `settings/subset`. Registro attività: unione per `id` (come il client, `push.activity_log`); al primo
  giro si legge tutto lo storico (`log_since=0` dà le ultime 1000 voci, poi si pagina da `log_since=1`: per un registro di
  oltre 1000 voci la primissima, `seq` 1, non è raggiungibile dal contratto).
- Tipi `location` / `archive` / `status_event` non mandati a un server il cui `ping.features` non li elenca (contati come
  `skipped_unsupported`). Blocchi da `batch_records` (500) record e `batch_log` (1000) voci, ≤ 90% di `max_body_mb` del
  lato (predefinito 20); un 413 dimezza il blocco.
- Identità: `X-DocMap-Device: bridge-<uuid dello stato>`, `X-DocMap-Device-Name: bridge <name>`, `X-DocMap-App:
  docmap-bridge/1`, `operator` = `bridge <name>`. Sul server che riceve, `who` dei record è quello del ponte (il contratto
  `push` non porta l'autore per record); le tombstone conservano il loro `who`.
- Un solo giro per profilo alla volta (`<profilo>.lock`, ripreso se il processo non c'è più o dopo 6 ore).
- Registro locale `sync-log/sync-AAAA-MM.jsonl` (righe `start` / `end`). Uscita 0 / 1 (conflitti aperti, lato in sola
  lettura, record rifiutati) / 2 (errore). Mai ritentativi dopo 401/403/429 (non bloccare l'IP dello studio).

## Test

```sh
python3 tests/test_licence.py       # licenza: chiavi e licenze create con il hub, server con licence_required
python3 tests/test_trusted_keys.py  # trusted_keys.json: export del hub accettato, file rovinato / chiavi non valide ignorati
python3 tests/diff_test.py          # PHP vero e Python fianco a fianco (serve php 8 con pdo_sqlite)
python3 tests/test_sync_remote.py   # ponte sync-remote: PHP ⇄ Python e Python ⇄ Python veri, HTTPS con la CA dello studio
NODE_PATH=<node_modules con playwright> python3 tests/validate_python.py   # docs/python/tools/validate_schemas.py contro il Python
```

Suite Playwright completa (`docmapv1/tests/suite.js`, non modificata) con il Python al posto di `php -S`:
`sh tests/run_suite_python.sh` (finto `php` in `tests/php-shim/`; risultati in `SUITE-RESULTS.md`).

`diff_test.py` avvia `php -S … tests/php-router.php` e il server Python con la stessa chiave e gli stessi token, manda a
entrambi la stessa sequenza di richieste e confronta stato, JSON e header; poi confronta i due `docmap.sqlite`
(decifrati), apre la cartella dati del PHP con il Python e viceversa, prova il blocco per IP e l'aggiornamento di un
database v10.1 (1 → 2 → 3) e di un database v11.1 (2 → 3, anche con PHP v12 e Python v12 sulla stessa cartella dati).
Stato e risultati: `PROGRESS.md`.

## Differenze note rispetto al PHP

- `ping` restituisce `"php": "Python 3.x"` (versione dell'interprete) invece della versione di PHP; il resto è uguale.
- Le date sono interpretate nei formati ISO 8601 che i client usano (data, data+ora, frazioni, `Z`/`UTC`/`±hh:mm`);
  le espressioni relative di PHP (`now`, `tomorrow`, `@123`…) valgono 0 (= data non valida). Una data senza fuso è UTC
  (come `php -S` senza `date.timezone`).
- `substr()` del PHP taglia i byte: un nome operatore/dispositivo oltre 80/100 byte tagliato a metà di una lettera
  accentata viene salvato con il carattere `U+FFFD` invece dei byte spezzati (nel JSON il risultato è identico).
- I limiti di PHP (`post_max_size`, profondità JSON, ecc.) sono riprodotti solo dove contano per DocMap
  (`max_body_mb`, profondità 512).
