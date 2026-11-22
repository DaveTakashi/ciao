# Suite Playwright contro il server Python (fasi F2 e F5)

`docmapv1/tests/suite.js` **non è stato modificato**. Le sezioni W, X e J avviano `php -S …`: con
`tests/run_suite_python.sh` la cartella `tests/php-shim/` va per prima nel `PATH` e il finto `php`:

- `php -S host:porta -t root router` → avvia il **server Python** (`--php-layout`: ogni `<cartella>/api.php` del deploy
  usa il `config.php` accanto, riletto a ogni richiesta, come fa PHP);
- `setup.php` (l'installatore via web, che il Python non ha: il suo equivalente è `python -m docmap_server setup`) e
  un `api.php` con contenuto **diverso** da quello attuale (X e J partono dall'`api.php` v10.1 del commit 68ae170) →
  inoltrati a un vero `php -S` interno; così X e J diventano "cartella dati creata dal PHP v10.1, poi server Python
  sullo stesso `docmap.sqlite`";
- `php -r …` e ogni altro comando → il vero `php`.

Comando: `NODE_PATH=/opt/node22/lib/node_modules:<jsqr+pngjs> sh docmapv1/server-python/tests/run_suite_python.sh`
(`DOCMAP_SHIM_LEGACY_PHP=0` = anche l'`api.php` v10.1 va al Python).

## Risultati (2 novembre 2026)

| Esecuzione | Totale suite | W (v10.1) | X (v11) | J (v11) | Richieste servite dal PHP |
|---|---|---|---|---|---|
| PHP vero (`node suite.js`) | 1093 ok, 0 falliti | tutti ok | tutti ok | tutti ok | tutte |
| Python (shim, predefinito) | **1093 ok, 0 falliti** | tutti ok | tutti ok | tutti ok | 2 × `setup.php`, 6 × `api.php` v10.1 prima dell'aggiornamento |
| Python "puro" (`DOCMAP_SHIM_LEGACY_PHP=0`) | 1092 ok, 1 fallito | tutti ok | tutti ok | 1 fallito | 2 × `setup.php` |

Errori di pagina/console: `none` in tutte e tre le esecuzioni.

L'unico fallimento della modalità "pura" è **inerente allo shim, non un difetto del Python**:
`J: v10.1 API (git 68ae170) holds the data of today: schema 1, no journal` controlla che il **vecchio** `api.php` v10.1
crei un database di schema 1 senza registro; con tutto al Python il "vecchio server" è già il v11 (schema 2, `journal_id`).
Nella modalità predefinita quel passo gira sul vero PHP v10.1 e l'aggiornamento in place fatto poi dal Python passa.

Nessun difetto del server Python trovato dalla suite: nessuna modifica ad `api.py` è stata necessaria.

## Risultati v12 (fase F5, 2 novembre 2026)

Suite v12 (`suite.js` del merge 16270a2, 1232 controlli; nuove sezioni Q "stati" e A "ricerca, registro accessi, accesso
senza PIN"). `jsqr` e `pngjs` reinstallati in una cartella di appoggio e aggiunti a `NODE_PATH`.

| Esecuzione | Comando | Risultato |
|---|---|---|
| PHP vero, ambiente così com'è | `cd docmapv1/tests && node suite.js` | **interrotta** nella sezione A: 2 falliti, poi `TimeoutError` (nessuna riga RESULT) |
| PHP vero, `opcache.revalidate_freq=0` | `PHP_INI_SCAN_DIR=/etc/php/8.3/cli/conf.d:<dir con 99-revalidate.ini> node suite.js` | **1232 ok, 0 falliti**, errori `none` |
| Python (shim, predefinito) | `NODE_PATH=/opt/node22/lib/node_modules:<jsqr+pngjs> sh docmapv1/server-python/tests/run_suite_python.sh` | 1. esecuzione: 1231 ok, 1 fallito (vedi sotto) · 2. esecuzione: **1232 ok, 0 falliti**, errori `none` |

**Perché il PHP "così com'è" si ferma.** La sezione A riscrive `config.php` (`remember_minutes` 480, poi 0) e lo legge
subito dopo. `php -S` (SAPI cli-server) ha l'opcache attivo con `opcache.revalidate_freq = 2`: per 2 secondi continua a
usare il `config.php` precedente, `me` restituisce ancora `remember_minutes: null` e i due controlli "policy dal
config.php" falliscono; il telefono resta quindi senza schermata di accesso e il `page.fill('#sc-user')` successivo va in
timeout, che interrompe la suite. È l'ambiente (lo stesso effetto annotato in `PROGRESS.md` per `diff_test.py`), non
un difetto di `api.php`: con `opcache.revalidate_freq=0`, impostato solo da variabile d'ambiente, la suite PHP passa
tutta. Il server Python rilegge la configurazione a ogni richiesta, come PHP senza opcache.

**L'unico fallimento della 1. esecuzione Python** è `web mode: state, log and SQLite encrypted at rest` della sezione
M (stream v10, solo browser, prima di ogni sezione con server): il controllo cerca `/Barbieri|WEBX|8642/` in tutto il
`localStorage` e ogni tanto trova `8642` dentro testo cifrato in base64 casuale. Non coinvolge il server.

**Lo shim con le sezioni di aggiornamento v12.** Lo shim manda al vero PHP gli `api.php` diversi dall'attuale: nella
suite v12 sono il v10.1 (git 68ae170, sezioni X, J e A) e il v11 / v11.1 (git 58a53e0, sezione A: "il server che lo
studio ha oggi"). Quando la suite copia sopra l'`api.php` attuale, le richieste passano al Python, che aggiorna in place
il database creato dal PHP vecchio (schema 2 → 3, oppure 1 → 2 → 3): è proprio il caso "dati dell'era v11.1 → Python
v12". Richieste servite dal vero PHP nella 1. esecuzione: 10 a `api.php` storici (prima dell'aggiornamento) e 3 a
`setup.php`; tutto il resto (sezioni W, X, J, Q, A, C, compresi `access`, `last_seen`, `seen`, `status_event`, `via`,
`remember_minutes`) dal Python.
