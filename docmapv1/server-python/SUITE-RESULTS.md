# Suite Playwright contro il server Python (fase F2)

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
