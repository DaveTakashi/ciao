# Registro di avanzamento (roadmap Python e hub)

> Per ripartire: leggi l'ultima voce, poi [`ROADMAP.md`](ROADMAP.md) §3. Branch di lavoro: `claude/project-thread-iqsptc`
> (nato da `claude/project-thread-cz53ct` = v11.1, commit `32c3485`). Una voce per passo, la più recente in fondo.
> Formato: data e ora UTC · fase · cosa è stato fatto · file · prova eseguita · prossimo passo.

## 2026-11-01 23:50 · F0 · Roadmap

- Fatto: scritti `docs/ROADMAP.md` (fasi F0–F10, cancelli, decisioni D1–D7) e questo registro.
- Ambiente usato: Python 3 con `fastapi 0.162.0`, `uvicorn 0.54.0`, `cryptography 50.0.1`; PHP CLI con `pdo_sqlite` e
  `openssl` (per i test differenziali); Node 22 + Playwright per la suite.
- Prossimo passo: F1, porting di `server-php/api.php` in `server-python/` seguendo `docs/python/PORTING.md`.

## 2026-11-02 00:05 · F3 · Hub locale v0.1

- Fatto: `hub/` (pacchetto `docmap_hub`): verificatore `licence.py` (Ed25519, JSON canonico, modi `full` / `grace` /
  `read_only` / `invalid`, mai blocco), chiavi cifrate con rotazione, registro SQLite con migrazioni additive, CLI in
  italiano (`init`, `keygen`, `customer`, `reseller`, `instance`, `licence issue/renew/verify`, `backup`, `web`), pagina
  locale su 127.0.0.1, piani in `plans.json` (trial, studio, studio_pro, conto_terzi, appliance, reseller).
- Commit: 327a7dc, a77429f, c7e27e5. Guida: `hub/README.md` (§6 = contratto di integrazione col server).
- Prova: `cd docmapv1/hub && python -m unittest discover -s tests` → 39 test OK (Linux, Python 3.13). Non ancora provato su Windows.
- Prossimo passo: integrare `licence.py` nel server Python (dopo F1), chiave pubblica come costante, licenza in
  `<data_dir>/licence/licence.docmap-licence`, scritture → 403 `licence_read_only` quando in sola lettura.

## 2026-11-02 00:40 · F1 · Server Python 1:1 (cancello superato)

- Fatto: `server-python/` (pacchetto `docmap_server`): tutte le rotte di `api.php`, stessa cifratura, stessi hash, stesso
  `docmap.sqlite`; legge `config.php` senza eseguirlo o `config.json`; `python -m docmap_server setup` = `setup.php`;
  serve anche i file del deploy con le regole di `php-router.php`; aggancio licenza `docmap_server/licence.py` (oggi `full`).
- Commit fino a 5fff7e3. Guida: `server-python/README.md` (con le differenze note dal PHP); dettagli in `server-python/PROGRESS.md`.
- Prove (rifatte dal coordinatore): `python3 docmapv1/server-python/tests/diff_test.py` → 5 test OK (149 coppie di
  richieste identiche, database identici dopo decifratura, passaggio PHP⇄Python sulla stessa cartella dati, blocco IP,
  aggiornamento di un database v10.1); `NODE_PATH=/opt/node22/lib/node_modules python3 docmapv1/server-python/tests/validate_python.py`
  → "all checks passed".
- Differenze note: `ping` risponde `"php": "Python 3.x"`; date relative PHP (`now`, `@123`) rifiutate; nomi troncati a
  metà lettera accentata salvati con U+FFFD (JSON identico).
- Prossimo passo: integrazione licenze (F3) e suite Playwright W/X/J contro Python (F2) senza modificare `tests/suite.js`.

## 2026-11-02 01:30 · F3 + F2 · Licenze nel server e suite contro Python

- Fatto (F3): `server-python/docmap_server/licence_verify.py` = copia identica di `hub/docmap_hub/licence.py` (un test lo
  controlla); `licence.py` applica la licenza **solo se** la config ha `"licence_required": true` (le installazioni
  esistenti non cambiano comportamento). In sola lettura le scritture rispondono 403 `licence_read_only`; oltre i limiti
  403 `licence_limit` (faldoni nuovi nel push, utenti in `token_create`); stato in `me` e `ping`; comandi
  `python -m docmap_server licence install <file>` e `licence status`. Chiavi fidate: costante `TRUSTED_LICENCE_KEYS`
  (vuota finché Dave non esporta la sua chiave pubblica dall'hub).
- Fatto (F2): opzione `--php-layout`, shim `server-python/tests/php-shim/php` e `tests/run_suite_python.sh`: la suite
  intera gira contro Python senza toccare `tests/suite.js`. Risultati in `server-python/SUITE-RESULTS.md`.
- Commit: 20574fd, 9fe919d, 4d02363.
- Prove: `test_licence.py` 9 OK e `diff_test.py` 5 OK (rifatte dal coordinatore); validatore "all checks passed";
  suite: PHP 1093/1093, Python 1093/1093 (W, X, J verdi; solo `setup.php` e l'api.php v10.1 storico passano ancora dal
  PHP vero). Tutto-Python: 1092/1093, l'unico errore è atteso (la prova "server v10.1 crea schema 1" non ha senso se il
  "vecchio server" è Python v11).
- Prossimo passo: F4 installazione in sede su Windows (provare `run_windows.bat` di `hub/` e `server-python/` su un PC
  vero, servizio Windows, backup automatico), poi F5 quando la v12 cambia `api.php`.

## 2026-11-02 00:55 · F5 · Avviso dal thread v12

- Il thread v12 annuncia (non ancora pubblicato su `claude/project-thread-cz53ct` alle 00:55) queste modifiche al server
  da portare in Python: `DM_SCHEMA 3` con tabella `access_log`; tipi record `archive` e `status_event` (solo aggiunte,
  annullo con `undo_of`, LWW); rotte `access`, `last_seen`, `seen` con parametro `via`; opzioni config
  `access_keep_days`, `access_dedupe_seconds`, `remember_minutes`; `me.remember_minutes`; `binder`/`location` con
  `status_events` e `status_types`; nuove `features` in `ping`; CSV a 30 colonne (`archive_id`), SQLite locale schema 9.
  Riferimento: `docs/API-CONTRACT.md` §11 e §12, `openapi.yaml`, `archive.schema.json`, `status_event.schema.json`.
- Prossimo passo: quando è pubblicato, merge del branch v12 in `claude/project-thread-iqsptc` e porting in `server-python/`
  con estensione di `diff_test.py`.

## 2026-11-02 01:20 · F4 · Kit di installazione Windows (scritto, non provato su Windows)

- Fatto: `installer-windows/` con `installa.bat`/`installa.ps1` (cartelle in `C:\DocMap\`, Python ≥3.11, setup del
  server, firewall solo rete privata, attività pianificate "DocMap Server" e "DocMap Backup"), `backup.ps1`,
  `ripristina.ps1`, `aggiorna.ps1` (rollback automatico se il ping fallisce), `disinstalla.ps1`, `licenza.ps1`,
  `docmap_tools.py` (logica testabile), `GUIDA-INSTALLAZIONE.md`.
- Scelta importante: in LAN serve **HTTPS** (su `http://192.168…` il browser non dà WebCrypto e il login web fallisce).
  L'installer crea un'autorità di certificazione dello studio limitata agli indirizzi privati; app e API su `https:8443`,
  pagina per scaricare il certificato su `http:8080`. Ogni telefono/PC installa il certificato una volta.
- Commit: e8555d3, 9a35589, b37deba.
- Prova: `cd docmapv1/installer-windows && python3 -m unittest discover -s tests` → 37 OK (1 saltato, il parser
  PowerShell vero gira solo dove c'è `pwsh`), rifatta dal coordinatore. Test del server ancora verdi.
- Non provato: nessuna esecuzione reale su Windows, certificato su Android/iPhone, backup su NAS. **Backup non cifrati**
  (lo zip contiene la chiave): da fare un backup cifrato con passphrase.
- Prossimo passo: Dave prova su un PC Windows di prova con la sola guida (cancello F4); intanto F5 (porting v12).

## 2026-11-02 · F5 · Server Python alla pari con api.php v12

- Fatto: `server-python/docmap_server/api.py` porta 1:1 le modifiche v12 di `api.php` (merge 16270a2): schema 3 con
  `access_log` (migrazione additiva, anche 1 → 2 → 3), tipi `archive` e `status_event` (indici HMAC `st/b|l/…`,
  `stbox/…`), `status_events` / `status_types` in `binder` e `location`, rotte `access`, `last_seen`, `seen`, parametro
  `via`, opzioni `access_keep_days`, `access_dedupe_seconds`, `remember_minutes`, `me.remember_minutes`, nuove `features`.
- Licenza: in sola lettura `push` (anche `status_event` / `archive`) resta bloccato; `access`, `last_seen` e **`seen`**
  funzionano (`seen` è un record di controllo di una lettura, non una modifica dei dati). Documentato nel README.
- Prove: `diff_test.py` 7 OK (nuovi `test_1b_v12` e `test_6_upgrade_v11`: database v11.1 portato a schema 3 da PHP v12 e
  da Python v12, anche sulla stessa cartella dati); `validate_python.py` "all checks passed"; `test_licence.py` 9 OK.
  Suite: Python 1232/1232; PHP 1232/1232 con `opcache.revalidate_freq=0` (con l'opcache predefinito la sezione A si ferma:
  rilegge `config.php` prima dei 2 s di opcache). Dettagli in `server-python/SUITE-RESULTS.md`.
- Differenze note col PHP: invariate (ping `php`, date relative PHP non interpretate, UTF-8 tagliato) + `at` di `seen`
  segue la stessa regola delle date.
- Prossimo passo: chiedere a chi cura `suite.js` di attendere > 2 s (o cambiare mtime) dopo ogni riscrittura di
  `config.php` nella sezione A.

## 2026-11-02 02:35 · Punto della notte (coordinatore)

- Fasi chiuse su Linux: F0, F1, F2, F3, F5. F4 scritta ma da provare su Windows. Prove rifatte dal coordinatore:
  `diff_test.py` 7 OK, `test_licence.py` 9 OK, hub 39 OK, installer 37 OK.
- Serve Dave per andare avanti: (1) provare `installer-windows/GUIDA-INSTALLAZIONE.md` su un PC Windows di prova
  (cancello F4); (2) creare la sua chiave dell'hub (`hub/README.md`) ed esportare la chiave pubblica da mettere in
  `TRUSTED_LICENCE_KEYS`; (3) confermare le decisioni D1–D7 di `ROADMAP.md` §5 e la scelta HTTPS in LAN.
- Lavori successivi possibili senza Dave: backup cifrati con passphrase nell'installer; aggancio nativo
  `DOCMAP_TEST_SERVER_CMD` in `suite.js` (file del thread v12).

## 2026-11-02 11:05 · F5 · v12.1 (26.12.1) portata in Python

- Fatto: merge di v12.1 (ab1de62) e porting in `server-python/docmap_server/api.py` (`loc_pack`): risposta `location`
  con `nested_binders` (faldoni di tutte le ubicazioni sotto quella richiesta, con `location_id` e `location_code`,
  ordinati per `location_code` e `speaking_code`, massimo 1000), `nested_count`, ed eventi di stato dei faldoni annidati.
- Prove: `diff_test.py` 7 OK (senza la modifica fallisce sulle risposte `location`: le coppie esistenti coprono già
  ubicazioni annidate); `test_licence.py` 9 OK; `validate_python.py` "all checks passed". Suite Playwright non rifatta.
- Prossimo passo: invariato (prova Windows, chiave dell'hub, backup cifrati, `.exe`).

## 2026-11-02 23:45 · Ponte server ⇄ server `sync-remote` (web ⇄ studio)

- Fatto: `python -m docmap_server sync-remote PROFILO.json` (`server-python/docmap_server/sync_remote.py`): un client
  dell'API di **entrambi** i server (PHP ⇄ Python, Python ⇄ Python, PHP ⇄ PHP) che tiene uguali web e studio nelle due
  direzioni (`--direction a-to-b` = dal web al locale, `b-to-a` = dal locale al web), con `--dry-run` (nessuna scrittura),
  `--json`, registro locale `sync-log/`, uscita 0/1/2. Stesse regole del server: vince il più recente; stessa ora e
  contenuto diverso = conflitto segnalato, nessun lato toccato. Passano record, eliminazioni, impostazioni condivise
  (vince il blocco più recente) e registro attività (unione per id); non passano token, licenza, registro accessi.
  Cursori salvati solo dopo l'invio riuscito: un giro interrotto riprende, un secondo giro applica 0.
- Guida per Dave e lo studio: `server-python/GUIDA-SYNC-WEB-LOCALE.md` (token, profilo, prova, `schtasks` ogni 10 minuti
  con `C:\DocMap\venv\Scripts\python.exe` e `C:\DocMap\server`, conflitti, errori, sicurezza).
- Prove: `test_sync_remote.py` 10 OK (PHP vero + Python veri, HTTPS con la CA dello studio dell'installer);
  `diff_test.py` 7 OK; `test_licence.py` 9 OK; `validate_python.py` "all checks passed".
- Prossimo passo: prova sul PC dello studio contro il sito vero, prima con `--dry-run`.

## 2026-11-03 11:10 · Installer in sede: backup cifrati e Kit di emergenza (strumenti 1.1.0)

- Fatto: i backup di `installer-windows` sono ora **cifrati** (`docmap_AAAAMMGG_HHMM.docmap-backup`: stesso zip di prima,
  AES-256-GCM a blocchi da 1 MiB con nonce per blocco e flag "ultimo", chiave scrypt N=2^17 r=8 p=1 dalla passphrase dei
  backup in `C:\DocMap\config\backup-passphrase.txt`, file con ACL Administrators+SYSTEM, non DPAPI: motivazione in
  `installer-windows/PROGRESS.md`). Si possono tenere ovunque (chiavetta, NAS, cloud). I vecchi `.zip` si ripristinano
  ancora; nessuna opzione per backup in chiaro, solo `esporta-in-chiaro` di emergenza con conferma esplicita.
- **Kit di emergenza** (`kit-emergenza.ps1`, `docmap_tools.py kit-emergenza` / `recupera-chiave`): file `.docmap-key`
  (config con `aes_key` + passphrase dei backup, cifrati con un codice di recupero) e foglio HTML da stampare con codice e
  passphrase. Proposto alla fine di `installa.ps1`; `installa.ps1` con un database senza config propone il recupero dal
  kit. `ripristina.ps1` chiede la passphrase se il backup viene da un altro PC (sbagliata = nulla cambia).
- **`verifica-backup`** settimanale dentro il backup giornaliero: decifra l'ultimo backup, `integrity_check`, apre il
  database con la chiave del backup (key_check di `docmap_server/crypto.py`) e decifra fino a 200 record; esito in
  `log\backup.log` (`VERIFICA OK` / `VERIFICA NON RIUSCITA`). Guida: `GUIDA-INSTALLAZIONE.md` §7, §7bis, §7ter;
  `server-python/README.md` "Non perdere mai la chiave".
- Prove: installer 58 test OK (19 nuovi in `tests/test_backup_cifrati.py`, compreso il server Python vero: config persa →
  kit → il server riapre il database) con Python 3.13 e 3.11 (venv); `diff_test.py` 7 OK, `test_licence.py` 9 OK,
  `test_setup.py` 2 OK, `test_sync_remote.py` 10 OK. Pacchetto ricostruito: DocMap 26.12.4 · strumenti 1.1.0.
- Non provato: esecuzione degli script su Windows (richiesta della passphrase, ACL ereditate, stampa del foglio).
- Prossimo passo: Dave prova installazione → kit stampato → backup → `ripristina.ps1` su un secondo PC con la passphrase.

## 2026-11-03 11:45 · F7 (anticipo) · Hub 0.2: ambienti, cassaforte, porte, deploy, stato

- Fatto: `hub/` diventa il centro di gestione di tutte le installazioni. Per ogni installazione ambienti `production`,
  `staging`, `demo-*` (tipi `web-php` sul sito via FTP, `local-python` sul PC di Dave avviato dal hub, `studio-python`
  monitorato). **Cassaforte** cifrata (scrypt + AES-256-GCM, passphrase = quella della chiave di firma, di serie) per
  FTP, codici di accesso, superadmin, password della cartella, config del database; **custodia della chiave spenta di
  serie** (GDPR: senza consenso il hub non tiene `aes_key` né copia i dati veri sul PC di Dave); ogni lettura registrata.
  **Porte** 18400-18999 con prova reale e spostamento automatico se occupate. **Staging/demo** con i dati veri copiati in
  una sola direzione con `sync-remote` (mai verso production), demo a scadenza archiviate in `_trash`. **Deploy**
  FTPS/SFTP: piano (dry-run), backup prima di tutto, caricamento dei soli file cambiati, controllo `app_version`,
  ripristino automatico; `config.php`, `data/`, `setup.php` dopo il setup e `.htaccess` personalizzati mai sovrascritti;
  `promote` pubblica in production solo il codice verificato su staging. **Stato** di tutto con `check-all` in parallelo.
  Pagina locale con schede Istanze & ambienti, Cassaforte, Deploy, Porte, Stato.
- File: `hub/docmap_hub/{registry,vault,ports,runner,envs,deploy,health,web_ops,web,cli,service}.py`, `hub/README.md`
  §8–§12, `hub/PROGRESS.md`. `licence.py` invariato (identico a `server-python/docmap_server/licence_verify.py`).
- Prove: hub 61 test OK (39 di prima + 22 nuovi: cassaforte, porte con socket occupati, server-python vero con setup,
  avvio, spostamento di porta, copia dati, demo e archiviazione, deploy su server FTP/FTPS locale con pyftpdlib —
  protetti, backup, ripristino, promote —, pagina web), 1 saltato (IPv6). `server-python/tests/test_licence.py` OK.
- Non provato: niente su Windows (taskkill, SO_EXCLUSIVEADDRUSE, percorsi), FTPS verso SiteGround vero, SFTP (paramiko
  non installato nel contenitore).
- Prossimo passo: Dave prova sul suo PC `run_windows.bat server-check`, `vault init`, un ambiente staging locale e un
  `deploy --dry-run` verso una cartella di prova su SiteGround.

## 2026-11-03 — Nuovo cliente in pochi passi (hub 0.3, strumenti 1.2.0, chiavi fidate senza modificare il codice)
- **Server Python**: le chiavi pubbliche delle licenze si leggono anche da `docmap_server/trusted_keys.json` (accanto al
  codice, non nei dati; stesso formato di `export-public-key`). File rovinato o chiave non valida → ignorati con una riga
  nel registro, mai fatale. `licence status` mostra le chiavi fidate. `DM_APP_VERSION` 26.12.5 (unione con l'app v12.5).
- **Installer 1.2.0**: `pacchetto --chiave-pubblica --licenza --nome-studio --sync-modello --documento` = pacchetto
  personale del cliente (cartella `cliente\`, nessun segreto); `installa.ps1` installa la licenza e attiva
  `licence_required`, mostra lo stato, propone la sincronizzazione; nuovo `configura-sync.ps1` (token del sito nascosto o
  da file, codice `ponte-sync` creato sul server della sede, profilo in `C:\DocMap\sync` solo amministratori, prova
  `--dry-run`, attività "DocMap Sync Web-Locale" ogni 10 minuti); `licenza.ps1 -Attiva` per i rinnovi; `C:\DocMap`
  modificabile solo dagli amministratori; un aggiornamento con pacchetto generico conserva `trusted_keys.json`.
- **Hub 0.3**: `cliente nuovo` (riga di comando e scheda **Nuovo cliente** della pagina): cliente, installazioni sede/online,
  ambienti production/staging, FTP in cassaforte, licenze, pacchetto per la sede, siti per l'hosting (build_deploy.py
  invocato), **scheda cliente** stampabile senza segreti; idempotente, `--rigenera`; `cliente scheda [--con-segreti]`,
  `cliente token-ponte --salva/--esporta`, `cliente elenco`.
- **Guida**: `docs/GUIDA-NUOVO-CLIENTE.md` (passi 0–8, dove sta ogni codice), copiata nel pacchetto e nella cartella del cliente.
- Test (Linux): hub 71 (5 saltati: FTP/SFTP/IPv6), installer 70 (1 saltato: pwsh), server: diff_test 7, test_licence 9,
  test_trusted_keys 9, test_setup 2, test_sync_remote 10, validate_python "all checks passed".
- Non provato: Windows reale (icacls, attività del ponte, licenza automatica), hosting reale, telefoni.

## 2026-11-03 16:00 — Hub 0.3.1: cartella FTP "come la vede l'account" (deploy studio-de)

- Problema visto da Dave: l'account FTP `docmap@…` ha la home in `/docmap.pr-it.it/public_html/` (chiuso lì dentro), ma in
  cassaforte la cartella era `/docmap.pr-it.it/public_html/studio-de/` → il hub non trovava il sito ("? → 26.12.5",
  82 file nuovi) e, confermando, avrebbe creato un albero di cartelle sbagliato.
- `deploy.resolve_ftp_root`: se la cartella non esiste prova le sue code più corte (`/public_html/studio-de`, `/studio-de`)
  e usa la prima che esiste, con avviso; se nessuna esiste avvisa che verrà creata. Il piano mostra file e versione
  trovati sul server; il pulsante «Conferma il deploy» è ora sopra l'elenco (prima era in fondo a 82 righe).
- Segnaposto/aiuti: cartella "come la vede l'account FTP", es. `/studio-rossi`.
- Test: hub 74 OK (1 saltato IPv6), con FTP/FTPS reali (pyftpdlib) e il nuovo `tests/test_v03_ftp_root.py` (3).
