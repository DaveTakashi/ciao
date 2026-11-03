# DocMap Hub — PROGRESS

## Fatto (v0.1)
- `docmap_hub/licence.py` — formato + verificatore offline standalone (solo `cryptography`): `verify()`, `check_limits()`, `sign_licence()`, `canonical_json()`. Copia identica in `server-python/docmap_server/licence_verify.py` (non modificarlo qui senza ricopiarlo).
- `keys.py` (Ed25519, PKCS8 cifrato con passphrase, rotazione con `key_id`, export json/base64/pem).
- `registry.py` (SQLite, migrazioni additive `meta.schema_version`, audit log `events`).
- `service.py` (emissione, rinnovo, backup zip), `cli.py` (tutti i comandi, messaggi in italiano), `plans.json`.
- `web.py` (pagina 127.0.0.1, login con passphrase tenuta solo in memoria come hash scrypt, CSRF, controllo Host).

## Fatto (v0.2, 2026-11-03) — gestione di tutte le installazioni
- Registro: migrazione 2 (additiva) → `environments` (production / staging / demo-*, tipi web-php · local-python · studio-python, versione, porta, stato, ultimo controllo/deploy/backup, scadenza), `port_reservations` (porta = chiave primaria: mai due ambienti sulla stessa porta), `secrets`, `deploys`, `settings`, `customers.key_escrow` (predefinito 0).
- `vault.py`: cassaforte scrypt (N=2^15) + AES-256-GCM con AAD ambiente|tipo|etichetta; tipi db_config, admin_token, superadmin, ftp, basic_auth, note; custodia chiave per cliente (spenta = niente aes_key né config); ogni lettura nel registro (`vault.reveal` con motivo); cambio passphrase; export/import cifrati; dentro `backup`.
- `ports.py`: intervallo 18400-18999 configurabile, prova reale (connessione + bind 127.0.0.1/0.0.0.0/::1/::, SO_EXCLUSIVEADDRUSE su Windows), spostamento automatico all'avvio (`port.move`), rilascio all'eliminazione.
- `runner.py`: ambienti local-python = `python -m docmap_server setup/serve` in `envs/<istanza>/<ambiente>/`, PID file, avvio con attesa del ping e nuovo tentativo su altra porta, arresto dell'albero di processi, web app costruita con build_deploy (servita con `--root`).
- `envs.py`: create-local (codici in cassaforte), clone-data via `sync-remote` a una direzione (profilo senza token: passano in variabili d'ambiente; mai verso production; richiede custodia attiva), demo a scadenza, purge-expired e delete che **spostano** in `_trash`, production protetta da `--production --confirm "<nome>"`.
- `deploy.py`: build in cartella temporanea, piano col manifest sha256 remoto, backup prima di tutto (file sostituiti, `data/`, `.htaccess`; `config.php` in cassaforte solo con custodia, altrimenti solo impronta), caricamento atomico (.dmtmp + rinomina), controllo `app_version`, ripristino automatico; protetti config.php, data/, setup.php dopo il setup, .htaccess modificati a mano; FTPS esplicito (TLS ≥1.2, sessione TLS riusata sul canale dati), FTP solo con `--insecure-ftp`, SFTP con paramiko facoltativo (known_hosts, `--trust-host-key`), trasporto `local` per prove; `promote` solo con stesso codice verificato su staging.
- `health.py`: check-all in parallelo con timeout (rete separata dal database: la pagina non si blocca), righe di stato con licenza, versione, ultimo backup.
- CLI: `vault …`, `customer set --key-escrow`, `env …` (add/set/create-local/start/stop/status/clone-data/demo create/purge-expired/delete/list), `ports …`, `deploy`, `promote`, `status`, `check-all`, `settings`, `server-check`.
- Pagina: schede Licenze, Istanze & ambienti, Cassaforte (mostra = passphrase di nuovo), Deploy (piano → conferma), Porte, Stato; operazioni lunghe come lavori in sottofondo con pagina che si aggiorna.
- README §8–§12 (italiano, comandi Windows).

## Da fare (prossime versioni)
- Prova reale su Windows (run_windows.bat, avvio/arresto ambienti con taskkill, porte con SO_EXCLUSIVEADDRUSE, FTPS verso SiteGround, SFTP con paramiko).
- Deploy verso `studio-python` (aggiornamento del server in studio: oggi solo monitorato), backup cifrato dei `deploy-backups`, `last_backup_at` letto dai server (installer) invece che dal solo deploy.
- Facoltativo: revoca licenze, comando `restore`, export CSV, gestione `plans.json` dalla pagina, avvio automatico degli ambienti locali all'accensione.

## Prossimo passo esatto
- Dave: `run_windows.bat server-check`, `vault init`, registrare production/staging di uno studio, `deploy --dry-run` verso lo staging su SiteGround.

## Test
`cd docmapv1/hub && DOCMAP_HUB_TEST_DEPS=<cartella con pyftpdlib e pyOpenSSL> python -m unittest discover -s tests -v` — ultimo risultato: 61 test OK, 1 saltato (IPv6 ::1 non disponibile nel contenitore) — Python 3.13, cryptography 50, pyftpdlib 2.2, pyOpenSSL 26.4, fastapi+uvicorn per gli ambienti locali, Linux. Senza `DOCMAP_HUB_TEST_DEPS` i test FTP/FTPS vengono saltati.
