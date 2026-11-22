# Aggiornare DocMap Hub da 0.3.x a 0.5

Data: 4 novembre 2026. Vale per chi ha già l'hub 0.3, 0.3.1 o 0.3.2 sul PC.

## In breve

- **Nessun dato si perde.** Chiavi, cassaforte, clienti e licenze stanno in `%APPDATA%\DocMapHub\` e non vengono
  toccati dalla sostituzione del programma.
- Al primo avvio l'hub **fa da solo una copia del registro** (`%APPDATA%\DocMapHub\backups\registro-prima-dello-schema-3-da-2-<data>.sqlite3`)
  e poi lo aggiorna aggiungendo tabelle e colonne nuove (schema 3). Non cancella e non modifica niente di quello che c'era.
- Ogni cliente che aveva installazioni riceve un **progetto** chiamato «DocMap <nome del cliente>» con dentro le sue
  installazioni. Lo puoi rinominare dalla scheda del cliente.
- I comandi della riga di comando sono **gli stessi** di prima. Le pagine della 0.3 restano raggiungibili da
  **Strumenti classici**.

## Cosa cambia per te

| Prima (0.3) | Adesso (0.5) |
|---|---|
| La finestra nera chiedeva la passphrase, poi la chiedeva di nuovo il browser | La chiede **solo il browser**, una volta. Con **Ricorda su questo PC** non la chiede più |
| Schede per strumento (Licenze, Istanze, Cassaforte…) | **Gestionale per cliente**: Panoramica, Clienti → scheda del cliente con progetto, siti, postazioni, licenze, accessi, storico |
| Nuovo cliente con un modulo lungo | **Crea progetto con AI**: copi il prompt, l'AI ti fa le domande, incolli il JSON, controlli 6 maschere, confermi |
| Un solo pacchetto per la sede | Pacchetto del **server di sede** + un **client per ogni postazione** con nome («PC Luigi», «Sala studio») |
| Sito solo via FTP | Anche **Autoinstall web**: zip del sito da caricare a mano dal pannello dell'hosting |
| — | Ricerca globale **Ctrl+K**, tema chiaro/scuro, storico leggibile con i nomi |

## Passi

1. Chiudi l'hub (nella finestra nera premi Ctrl+C) e ogni comando in corso.
2. Per scrupolo: `run_windows.bat backup` e copia lo zip sulla chiavetta.
3. Estrai `DocMap-hub-0.5.zip` in una cartella temporanea, apri la cartella `DocMap-hub-0.5\` e **copia tutto il suo
   contenuto dentro `C:\DocMapHub\`**, scegliendo **«Sostituisci i file nella destinazione»**.
   Non cancellare `C:\DocMapHub\hub\.venv\`.
4. Doppio clic su `C:\DocMapHub\hub\run_windows.bat`. Si apre il browser:
   - se avevi attivato l'**accesso automatico** entri direttamente;
   - altrimenti scrivi la passphrase nella pagina e spunta **Ricorda su questo PC** se vuoi che non la chieda più.
5. Controlla: in basso a sinistra c'è **v0.5.0**; in **Clienti** ci sono tutti i tuoi clienti con il loro progetto;
   in **Licenze** le stesse licenze di prima.

## Se qualcosa non va (ritorno alla 0.3.2)

1. Chiudi l'hub.
2. Rimetti il programma vecchio: estrai `DocMap-hub-0.3.2.zip` sopra `C:\DocMapHub\` («Sostituisci»).
3. Il registro aggiornato funziona anche con la 0.3.2 (le colonne nuove vengono ignorate). Se vuoi comunque il
   registro esatto di prima: rinomina `%APPDATA%\DocMapHub\registry.sqlite3` in `registry-0.5.sqlite3` e copia al suo
   posto il file `backups\registro-prima-dello-schema-3-da-2-<data>.sqlite3`, rinominandolo `registry.sqlite3`.
   Attenzione: così perdi solo ciò che hai fatto con la 0.5 (progetti, postazioni, bozze).

## Note tecniche

- Registro: schema 3 = `projects`, `workstations`, `drafts`, colonne `customers.extra_json` e `customers.status`,
  `instances.project_id`, indice sugli eventi. Migrazione additiva, rilanciabile.
- La pagina ora è un'applicazione (`hub/docmap_hub/ui/`) che parla con `/api/...` sulla stessa porta, con token
  anti-CSRF in ogni scrittura e niente risorse esterne (il font Inter viene da `assets/fonts` del pacchetto).
- «Ricorda su questo PC» usa lo stesso file dell'accesso automatico (`accesso-automatico.json`, cifrato con DPAPI per
  il tuo utente Windows). Si spegne da **Impostazioni** o con `run_windows.bat accesso-automatico disattiva`.
- Test automatici: 97 (Linux, Python 3.13, compresi FTP/FTPS reali su server di prova). **Non ancora provato su Windows.**
