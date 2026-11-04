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
9. Il hub non crea cartelle/SSL/account FTP sull'hosting, non lancia `setup.php` e non installa sul PC del cliente:
   spiega a Dave quei passi (guida `../docs/GUIDA-NUOVO-CLIENTE.md`).
10. (0.5) Per preparare un cliente nuovo puoi produrre il JSON `docmap-progetto/1`: il prompt completo si legge nella pagina
    (**Crea progetto con AI → Vedi il prompt**) o da `GET /api/pipeline/prompt`. Non mettere password nel JSON
    (`{{PASSWORD_FTP}}`); Dave lo incolla, controlla le maschere e conferma lui.
