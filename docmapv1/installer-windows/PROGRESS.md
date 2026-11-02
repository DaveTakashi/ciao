# installer-windows — avanzamento (F4, installazione in sede su Windows)

> Guida per lo studio e per Dave: `GUIDA-INSTALLAZIONE.md`. Cartella fissa `C:\DocMap\`. Nessun file fuori da
> `docmapv1/installer-windows/` è stato modificato (server-python invariato: il lancio in rete locale è in `docmap_tools.py serve`).

## Stato (2026-11-02)

### Fatto
- `installa.bat` → `installa.ps1` (ExecutionPolicy Bypass, si rilancia da amministratore): Python ≥ 3.11 (non Store;
  spiega come installarlo, offre `winget`), pacchetto (o lo prepara dal repository), backup se è un aggiornamento,
  `C:\DocMap\{app,server,strumenti}` (le versioni sostituite vanno in `_versioni\`, ultime 3), `venv` + `requirements.txt`
  (anche offline da `server\wheels`), `impostazioni.json`, `python -m docmap_server setup` (dati `C:\DocMap\dati`,
  config `C:\DocMap\config\config.json`, codice admin mostrato e salvato in `config\PRIMO-CODICE-ADMIN.txt`),
  `docmap.config.js` (web, `apiBase:"/api"`), certificato, ACL (Admin+SYSTEM) su config/dati/backup/certificati,
  firewall solo profilo **Privato** (avvisa se la rete è Pubblica), attività "DocMap Server" (SYSTEM, all'avvio + controllo
  ogni 5 min, nessun NSSM) e "DocMap Backup" (giornaliera), avvio, `?r=ping`, `LEGGIMI-INDIRIZZO.txt` + `INDIRIZZO-QR.html`.
  Rieseguirlo = aggiornamento (mai `dati`, `config`, certificati, impostazioni); se il ping fallisce torna alla versione precedente.
  Rifiuta di creare una chiave nuova se esiste `dati\docmap.sqlite` senza config.
- **HTTPS in rete locale** (necessario: su `http://192.168.x.x` il browser non dà WebCrypto, quindi il login web di
  DocMap non funzionerebbe): CA dello studio con *name constraints* (solo 10/8, 172.16/12, 192.168/16, 127/8, `.local`,
  `localhost`, nome del PC), certificato del server ≤ 800 giorni (limite iOS 825) rinnovato da solo all'avvio se cambia
  l'IP o scade entro 60 giorni; pagina HTTP sulla porta 8080 per scaricare il certificato (istruzioni Android/iPhone/PC),
  tutto il resto rinviato a HTTPS 8443. Riscritture del `.htaccess` (`/q/<codice>` → `scan.html`, `/q/assets/…`) e header
  di sicurezza sui file statici; le risposte dell'API restano quelle del server.
- `backup.ps1` + `docmap_tools.py backup`: API di backup di SQLite **in un solo passo** (a piccoli passi, con un altro
  processo che scrive di continuo, la copia ricominciava all'infinito: visto nei test), `PRAGMA integrity_check`,
  `journal_mode=DELETE` nella copia, zip `docmap_AAAAMMGG_HHMM[_N].zip` con config, impostazioni, licenza, instance.json e
  `MANIFEST.json` (sha256, righe per tabella); ultimi 30; seconda destinazione facoltativa (USB/NAS) con propria ritenzione,
  errore lì = backup principale comunque fatto (codice 4) e scritto in `log\backup.log`.
- `ripristina.ps1` + `ripristina`: verifica (CRC, MANIFEST, percorsi, integrità), conferma scrivendo RIPRISTINA, copia di
  lavoro dello zip (il backup preventivo potrebbe toglierlo per la ritenzione), backup dello stato attuale, stop, dati
  attuali in `dati\_prima-del-ripristino_<data>\`, se la chiave è diversa rimette anche la config (con `data_dir` locale),
  in caso di errore rimette i dati di prima; riavvio e ping.
- `aggiorna.ps1 -Pacchetto <zip|cartella>`: controllo → backup → stop → sostituzione → pip → riavvio → ping 90 s →
  ritorno automatico alla versione precedente (anche se un passo intermedio va in errore).
- `disinstalla.ps1`: ultimo backup, toglie attività, regole firewall e (chiedendo) il certificato; non cancella nulla e
  dice dove sono dati, config e backup. `licenza.ps1`: `licence install|status` del server.
- `docmap_tools.py pacchetto --out DIR [--zip]`: `build_deploy.py --no-server --base-path /` + server + script + guida +
  `VERSIONE.txt` + `PACCHETTO-MANIFEST.txt`.
- Script `.ps1` in UTF-8 **con BOM** e CRLF (`.gitattributes`), solo sintassi di Windows PowerShell 5.1.

### Prove (Linux, 2026-11-02)
- `python3 -m unittest discover -s docmapv1/installer-windows/tests` → **Ran 37 tests, OK (skipped=1)** con Python 3.13
  (lo skip è il parser `pwsh`, non disponibile); 27 test di `docmap_tools` OK anche con Python 3.11 (venv + requirements.txt).
  Coprono: impostazioni (predefiniti, BOM, valori errati, aggiunta chiavi senza sovrascrivere), nomi e ritenzione dei
  backup, backup con scritture continue in WAL (3 backup coerenti), seconda destinazione e suo errore, zip manomessi/estranei/
  con `..`, ripristino (stessa chiave, chiave diversa, errore a metà → dati rimessi), riscritture e header ASGI, certificati
  (creazione, nessun cambio, cambio IP, rinnovo, name constraints, verifica TLS con `ssl` di Python e rifiuto di un'altra CA),
  **server completo** (pacchetto → `C:\DocMap` finta → `setup` → `serve` in un altro processo: ping HTTPS verificato con la CA,
  app, `/q/<codice>`, `docmap.config.js`, `.htaccess` 403, API `me` con token e origine, 401 con token errato, pagina del
  certificato e rinvio 302 con l'Host del telefono, backup a server acceso), pacchetto e zip.
- Lint PowerShell (`tests/test_powershell_lint.py`, 10 test): BOM/CRLF, parentesi e stringhe, niente sintassi PS7, comandi
  sconosciuti (refusi), sottocomandi di `docmap_tools` esistenti, elenco file del pacchetto coerente.
- Server invariato, prove richieste verdi: `diff_test.py` 5 OK, `test_licence.py` 9 OK, `validate_python.py` "all checks passed".
- `pwsh`: scaricabile da GitHub ma l'esecuzione del binario scaricato è stata negata dal sistema di permessi della sessione:
  il test `test_pwsh_parser` parte da solo dove `pwsh` è installato.

### Da fare / non provato
- **Esecuzione reale su Windows 10/11** di tutti i `.ps1` (attività pianificate, firewall, icacls, elevazione, winget,
  `Get-CimInstance` per fermare anche il secondo processo del `python.exe` del venv, trigger con ripetizione di 3650 giorni).
- Certificato dello studio su telefoni veri (Android/Chrome, iPhone/Safari) e Chrome/Edge di altri PC; name constraints.
- Backup su NAS con utente SYSTEM; installazione offline con `wheels`.
- Backup cifrati (la roadmap dice "backup cifrato automatico"): oggi lo zip contiene la config con la chiave → va
  custodito; possibile seguito: zip cifrato con una passphrase dello studio (AES-GCM con `cryptography`).
- Parser `pwsh` sugli script (basta installare PowerShell 7 e rilanciare i test).

### Prossimo passo
Dave prova su un PC Windows di prova seguendo solo `GUIDA-INSTALLAZIONE.md` (cancello F4): installazione, telefono
Android + iPhone, riavvio del PC, backup alle 12:30, `ripristina.ps1`, `aggiorna.ps1` con un pacchetto nuovo,
`disinstalla.ps1`. Annotare qui ogni differenza.

## Comandi di prova

```sh
python3 -m unittest discover -s docmapv1/installer-windows/tests -v
python3 docmapv1/installer-windows/docmap_tools.py pacchetto --out ../DocMap-installer-prova --zip
# server invariato:
python3 docmapv1/server-python/tests/diff_test.py
python3 docmapv1/server-python/tests/test_licence.py
NODE_PATH=/opt/node22/lib/node_modules python3 docmapv1/server-python/tests/validate_python.py
```

## Registro
- 2026-11-02 · prima stesura degli script, `docmap_tools.py`, guida (commit e8555d3).
- 2026-11-02 · 27 test di `docmap_tools`; backup SQLite in un passo solo (commit 9a35589).
- 2026-11-02 · lint PowerShell, ping senza proxy, correzioni (cast della versione di Python, argomenti vuoti in PS 5.1,
  cartella corrente prima di spostare `strumenti`, database senza config), PROGRESS completo.
