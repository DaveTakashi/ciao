# DocMap Hub: aggiornare alla 0.9 (con l'app 26.12.7)

La 0.9 nasce dall'autocritica del hub (`docs/AUTOCRITICA-HUB-0.9.md`): meno passaggi, niente codici copiati a mano,
licenze che arrivano subito ai siti, un solo pulsante per aggiornare tutti i siti.

## Cosa cambia per te

| Prima (0.8) | Adesso (0.9) |
|---|---|
| «Nuovo cliente» creava solo l'anagrafica; il percorso guidato era solo dietro «Crea progetto con AI» | **Nuovo cliente** apre le stesse 6 maschere guidate, **senza AI**. L'AI resta per chi ha già il JSON |
| Dopo il deploy aprivi `setup.php` nel browser, scrivevi le persone, copiavi ogni codice e lo salvavi in cassaforte con un comando | **Configura il sito**: l'hub lancia `setup.php` da solo e mette i codici **direttamente in cassaforte** (admin, ponte-sync se c'è la sede, persone del progetto) |
| Dovevi ricordarti a che punto era ogni cliente | **Percorso del cliente** nella scheda: passi fatti, **prossimo passo** con il suo pulsante. In Panoramica una riga per ogni cliente ancora a metà |
| Sospendere una licenza non cambiava il sito finché non rifacevi il deploy o il canale la consegnava | La licenza nuova (sospensione, riattivazione, rinnovo, modifica) viene **caricata subito** sui siti online (FTP) e l'hub ti dice cosa risponde il sito («sola lettura», «valida») |
| Una nuova versione = un deploy a mano per ogni sito | Deploy → **Siti da aggiornare**: tutti in fila, con il solito backup e ritorno automatico, **stop al primo errore** |
| Tutti i siti dello stesso dominio (`studio-rossi`, `studio-rossi-prova`, `studio-verdi`…) ricevevano da `setup.php` la **stessa** cartella dati proposta | Ogni sito ha la **sua** cartella: `docmap-data/<nome-del-sito>` (il sito nella radice del dominio resta su `docmap-data`) |

Comandi nuovi (stesse cose dalla riga di comando): `configura-sito`, `licence push`, `aggiorna-siti`,
`cliente percorso` (wiki §8).

## Passi (5 minuti)

1. Chiudi il hub. `run_windows.bat backup` (o Impostazioni → Backup → «Fai un backup adesso»).
2. Estrai `DocMap-hub-0.9.zip` e copia il contenuto **sopra** `C:\DocMapHub\` (sostituisci i file). La cartella dati
   `%APPDATA%\DocMapHub\` (chiavi, registro, cassaforte) non si tocca. Nessuna migrazione del registro.
3. Avvia: in basso a sinistra deve comparire **v0.9.0** (oppure `run_windows.bat info`).
4. **Siti già configurati**: niente da fare. `config.php` e i dati restano dove sono; il percorso del cliente li vede
   «configurati» se in cassaforte c'è almeno un codice (`admin_token`) di quel sito. Se li avevi solo su carta,
   salvane uno da Scheda → Accessi.
5. Aggiorna i siti alla 26.12.7 quando vuoi: Deploy → «Siti da aggiornare» (prima prova su uno staging). Il deploy
   aggiorna solo il programma: `config.php`, dati e `.htaccess` modificati restano.

## Dati e sicurezza

- **Nessun dato si sposta.** La nuova cartella proposta vale solo per i siti configurati da adesso. Un sito che ha già
  `config.php` continua a usare la sua cartella.
- Se ricarichi da zero un sito in una sottocartella e hai perso `config.php`, `setup.php` ora ti avvisa che nella
  vecchia cartella comune `docmap-data` c'è un database: rimetti la copia di `config.php` invece di continuare.
- `config.php` contiene la chiave del database: l'hub la tiene **solo** con la custodia autorizzata dal cliente; senza,
  alla fine di «Configura il sito» la scarichi una volta e la consegni al cliente (dalla riga di comando:
  `--config-out E:\config.php`).
- `setup.php` resta una pagina «una volta sola»: chi la apre per primo la usa. Configurare subito dopo il deploy (come
  fa ora il percorso) riduce il tempo in cui è aperta.

## Tornare indietro

Rimetti la cartella del programma della 0.8 (dal backup o dallo zip vecchio in `python/vecchie-versioni/`). Il registro
è lo stesso: la 0.8 ignora le righe nuove (impostazioni `site.setup.*`). I siti alla 26.12.7 funzionano anche con il
hub 0.8.
