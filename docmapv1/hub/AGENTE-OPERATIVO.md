# Istruzioni per l'agente AI che usa DocMap Hub sul PC di Dave

Leggi prima la wiki completa: `../docs/WIKI-HUB.md` (capitolo 9 = regole per te, capitolo 6 = ricette, capitolo 8 = tutti i comandi).

In breve:

1. Lavora in questa cartella (`hub\`) con `run_windows.bat <comando>` oppure `.venv\Scripts\python.exe -m docmap_hub <comando>`.
2. Controlla `run_windows.bat accesso-automatico stato`: deve essere ATTIVO. Se è spento chiedi a Dave di lanciare
   `run_windows.bat accesso-automatico attiva`; non chiedergli la passphrase in chat e non scriverla su file.
3. Nessun comando deve aspettare la tastiera: usa `--yes` dove previsto, le variabili `DOCMAP_HUB_FTP_PASSWORD` e
   `DOCMAP_HUB_BRIDGE_TOKEN` per i segreti nuovi (svuotale subito dopo), mai `--field password=?`.
4. `deploy` e `promote`: sempre `--dry-run` prima. Procedi con `--yes` solo se la prova mostra i file del sito
   (`Sul server: N file`, N > 0 per un sito esistente) e nessuna riga "ATTENZIONE".
5. Non cancellare e non ruotare niente senza richiesta esplicita: `vault delete`, `env delete`, `keygen --rotate`,
   `customer set --purge`. Non toccare a mano `%APPDATA%\DocMapHub\`.
6. Non mostrare segreti (`vault reveal`, `cliente scheda --con-segreti`) se Dave non lo chiede.
7. Dopo ogni cliente nuovo, rinnovo o modifica della cassaforte: `run_windows.bat backup` e ricorda a Dave di copiarlo su USB.
8. Esito: codice di uscita 0 = riuscito; errori su stderr iniziano con "Errore:". Verifica con `status`, `cliente elenco`, `licence list`.
9. Il hub non crea cartelle/SSL/account FTP sull'hosting e non installa sul PC del cliente: spiega a Dave quei passi
   (guida `../docs/GUIDA-NUOVO-CLIENTE.md`). Dalla 0.9 **lancia lui `setup.php`** (`configura-sito`): non chiedere
   mai a Dave di copiare token a mano.
10. (0.5) Per preparare un cliente nuovo puoi produrre il JSON `docmap-progetto/1`: il prompt completo si legge nella pagina
    (**Crea progetto con AI → Vedi il prompt**) o da `GET /api/pipeline/prompt`. Non mettere password nel JSON
    (`{{PASSWORD_FTP}}`); Dave lo incolla, controlla le maschere e conferma lui.
11. (0.6) Il deploy dal gestionale ha due tempi: prova e conferma. Non confermare mai al posto di Dave: prepara la prova,
    fagli leggere il piano. I backup automatici dell'hub sono in `%APPDATA%\DocMapHub\backups\` (`docmap-hub-auto-*`):
    non cancellare a mano quelli fatti prima di un aggiornamento (`registro-prima-…`).
12. (0.7) Sospendere, revocare o cambiare i limiti di una licenza è una decisione commerciale di Dave: non farlo
    mai di tua iniziativa. Per spostare l'hub usa `esporta-hub` / `importa-hub` (passphrase dell'esportazione separata
    dal file). Non pubblicare mai nella cartella `licenze/` file diversi da quelli prodotti dall'hub.
14. (0.10) Cliente nuovo: parti da un **modello** (`modelli`, poi `cliente da-modello --nome … --piva … --modello …`).
    `--attiva` pubblica e configura solo su cartelle vuote; usalo solo se Dave ha chiesto di mettere online il cliente.
    Il kit (`--kit-out`, `cliente kit`) contiene codici e chiavi in chiaro: scrivilo solo dove dice Dave (chiavetta) e
    non lasciarne copie. Non cambiare l'hosting predefinito né i modelli senza che Dave lo chieda.
13. (0.9) Per sapere cosa manca a un cliente: `cliente percorso --cliente "Nome"` (o la scheda nella pagina): fai o
    proponi **solo il prossimo passo**. `configura-sito --instance … --env staging|production --config-out <file>`
    subito dopo il primo deploy di un sito (una volta sola; i codici vanno in cassaforte; `config.php` va al cliente,
    non lasciarlo sul PC). `licence push "<installazione>"` dopo ogni cambio di licenza deciso da Dave.
    `aggiorna-siti` aggiorna tutti i siti di produzione: chiedi prima a Dave e prova la versione su uno staging.
