# Aggiornare DocMap Hub alla 0.7

Data: 5 novembre 2026. Vale per chi ha l'hub **0.6**, **0.5** o **0.3.x** (si passa direttamente alla 0.7; per i
passaggi precedenti valgono anche le guide [0.6](AGGIORNAMENTO-HUB-0.6.md) e [0.3 → 0.5](AGGIORNAMENTO-HUB-0.3-0.5.md)).

## In breve

- **Nessun dato si perde.** La 0.7 non cambia la struttura del registro: aggiunge solo impostazioni. Le licenze già
  emesse restano valide e identiche.
- **Controllo delle licenze dal gestionale**, nel pannello di ogni licenza:
  - **Sospendi**: l'installazione passa in **sola lettura** (si consulta, si stampa, si esporta; non si modifica);
  - **Riattiva**: torna come prima, con la stessa scadenza (se è passata, indichi di quanti mesi prolungarla);
  - **Revoca**: per la fine del contratto; sola lettura, rinnovi bloccati finché non la riattivi;
  - **Modifica**: utenti, faldoni, archivi, funzioni, scadenza, giorni di tolleranza;
  - **Rinnovo automatico**: licenze brevi (es. 35 giorni) che l'hub rinnova da solo, eventualmente fino a una data.
  Ogni modifica è una **nuova licenza firmata** che sostituisce la precedente: la storia resta tutta visibile.
- **Canale delle licenze**: l'hub mette le licenze firmate in una cartella `licenze/` del **tuo** sito. Ogni server
  DocMap (versione nuova) la scarica da solo ogni 6 ore e la installa solo se è più recente. Così una sospensione o un
  rinnovo arrivano al cliente **senza toccare il suo PC**.
- **Esporta tutto l'hub** in un solo file cifrato con una passphrase (Impostazioni → Backup dell'hub), da importare su un
  PC nuovo con `run_windows.bat importa-hub FILE`.

## Passi

1. Chiudi l'hub (Ctrl+C nella finestra nera). Per scrupolo: `run_windows.bat backup` e copia lo zip sulla chiavetta.
2. Estrai `DocMap-hub-0.7.zip` in una cartella temporanea, apri `DocMap-hub-0.7\` e **copia tutto il contenuto dentro
   `C:\DocMapHub\`** scegliendo **«Sostituisci i file nella destinazione»**. Non cancellare `C:\DocMapHub\hub\.venv\`.
3. Doppio clic su `C:\DocMapHub\hub\run_windows.bat`. Controlla in basso a sinistra **v0.7.0**.

## Impostare il canale delle licenze (una volta)

1. Ti serve un sito **tuo**, sempre online, con accesso FTP: per esempio `https://docmap.pr-it.it/`.
   Se non c'è ancora nel gestionale, crea un cliente «QR7 (interno)» con un'installazione «Sito QR7» e aggiungi il sito
   con **Aggiungi sito o server** (sito online). Salva l'accesso FTP nella sua scheda (**Accessi in cassaforte**).
2. **Impostazioni → Canale delle licenze → Imposta il canale**: scegli quel sito.
3. Premi **Pubblica adesso**. Le licenze emesse prima del canale vengono riemesse identiche con l'indirizzo del canale
   dentro (servono al server per sapere dove guardare) e pubblicate.
4. Da qui in poi ogni licenza nuova o cambiata viene pubblicata da sola mentre la cassaforte è aperta; se è chiusa, la
   **Panoramica** ti dice quante sono «da pubblicare».

Nella cartella `licenze/` del sito l'hub mette anche un `.htaccess` che impedisce di elencare i file. I nomi dei file
sono casuali e i file non contengono password: solo i dati della licenza, firmati. Il deploy non tocca mai quella cartella.

## Cosa serve sui server dei clienti

- **Server di sede (Python)**: lo scaricamento automatico c'è nel server della versione che accompagna l'hub 0.7. I
  pacchetti di sede preparati da ora in poi (Crea progetto con AI, Nuovo cliente) lo contengono già. Per uno studio già
  installato: prepara il pacchetto nuovo e aggiorna con `C:\DocMap\strumenti\aggiorna.ps1 -Pacchetto <zip>` (backup,
  sostituzione, controllo, ritorno automatico). Serve `"licence_required": true` nella configurazione del server, come
  già previsto dall'installazione.
  A mano, in qualunque momento: `python -m docmap_server licence update` (scarica subito) e
  `python -m docmap_server licence status` (mostra anche l'indirizzo del canale).
- **Server già installati con la versione vecchia**: vanno ancora in sola lettura con una licenza sospesa (la licenza
  sospesa è già scaduta e senza tolleranza, apposta), ma il file va installato a mano: scaricalo dal pannello della
  licenza e `python -m docmap_server licence install FILE`.
- **Siti online in PHP (SiteGround)**: con la 0.7 il server PHP non controllava la licenza. **Aggiornamento:** dalla
  app 26.12.6 + hub 0.8 la controlla (vedi `AGGIORNAMENTO-v12.5-v12.6.md`).
- Un server **non accetta mai una licenza più vecchia** di quella installata (né dal canale né con `licence install`):
  così nessuno può rimettere una vecchia licenza annuale dopo una sospensione. Solo un amministratore, consapevolmente,
  può forzarla con `licence install FILE --force`.

## Rinnovo automatico: come funziona

- Lo attivi dal pannello della licenza: durata (es. 35 giorni), «rinnova quando mancano» (es. 10 giorni), «fino al»
  (facoltativo, es. fine del contratto). Con «Passa subito a una licenza breve» la licenza annuale viene sostituita
  subito da una breve.
- L'hub rinnova mentre è aperto e sbloccato (controlla ogni 30 minuti) e pubblica nel canale. Se il cliente non paga,
  spegni il rinnovo o sospendi: l'installazione va in sola lettura da sola alla fine del periodo più la tolleranza.
- Attenzione alla tolleranza: se l'hub resta spento per settimane, le installazioni la usano. Scegli durata + tolleranza
  più lunghe delle tue assenze.

## Se qualcosa non va (ritorno alla 0.6)

1. Chiudi l'hub. Estrai `DocMap-hub-0.6.zip` (in `python\vecchie-versioni\`) sopra `C:\DocMapHub\` («Sostituisci»).
2. Il registro è lo stesso. Le licenze emesse con la 0.7 restano nel registro e valide; la 0.6 non mostra lo stato
   «sospesa» (la vede come scaduta) e non pubblica nel canale.

## Note tecniche

- Formato della licenza: campi facoltativi `status` (`active|suspended|revoked`), `resume` (date da ripristinare) e
  `update_url` (dove scaricare la prossima). I verificatori vecchi li ignorano; per questo una licenza sospesa è anche
  già scaduta con `grace_days` 0. `licence_verify.py` del server resta copia identica di `hub/docmap_hub/licence.py`.
- `issued_at` cresce sempre per installazione: il server installa solo una licenza emessa dopo la sua.
- Nuovo modulo `hub/docmap_hub/licensing.py`; API `POST /api/instances/<id>/licence/suspend|revoke|reactivate|modify|renew-short`,
  `POST /api/instances/<id>/licence/autorenew`, `GET|POST /api/licence-channel`, `POST /api/licence-channel/publish`,
  `POST /api/export`. CLI: `licence suspend|revoke|reactivate|publish`, `esporta-hub`, `importa-hub`.
- Esportazione cifrata: scrypt + AES-256-GCM (stessi parametri della cassaforte), file `.docmap-hub`; l'importazione
  scrive solo in una cartella dati **vuota**.
- Test automatici: hub 112 (Linux, Python 3.13, compresi FTP/FTPS reali), server Python `test_licence` 9,
  `test_licence_channel` 3. **Non ancora provato su Windows.**
