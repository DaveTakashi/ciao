# DocMap Hub: aggiornare alla 0.10 (modelli cliente, Attiva tutto, kit di consegna)

La 0.10 nasce dal secondo giro di autocritica (`docs/AUTOCRITICA-HUB-0.10.md`): un cliente online in **5 clic**
invece di 24. L'app resta la **26.12.7**: siti, PC e telefoni non cambiano.

## Cosa cambia per te

| Prima (0.9) | Adesso (0.10) |
|---|---|
| «Nuovo cliente»: nome, P.IVA, sede/online, poi 6 maschere da riempire | **Scegli un modello** (10 pronti) + nome e P.IVA → **Crea il cliente**. Le maschere si aprono solo se vuoi rivederle («Rivedi i passi») |
| Indirizzi, cartelle e accesso FTP scritti per ogni cliente | **Impostazioni → Hosting predefinito**, una volta sola: dominio, FTP, cartella base. Ogni cliente prende `dominio/<nome>/` e, se ha la demo, `dominio/<nome>-demo/` |
| 4 pulsanti del percorso (Pubblica, Configura, Pubblica in produzione, Configura) | **Attiva tutto**: un pulsante, gli stessi passi in fila, stop al primo errore. Solo su cartelle vuote |
| Un `config.php` da scaricare per ogni sito, codici delle persone da consegnare a mano | **Kit di consegna**: un solo zip con lettere di benvenuto (una per persona), scheda tecnica, scheda cliente e copie di `config.php` |
| — | I modelli si cambiano dalle maschere: **Salva nel modello** / **Salva come nuovo modello**; Impostazioni → Modelli cliente per rinominare, eliminare, scegliere quello proposto |
| — | FTP per cliente e FTP diverso per la demo, se servono (passo «Online» delle maschere) |

Comandi nuovi: `modelli` (`mostra`, `importa`, `elimina`, `predefinito`, `ripristina`), `hosting`,
`cliente da-modello`, `cliente attiva`, `cliente kit` (wiki §8).

## Passi (5 minuti)

1. Chiudi il hub. `run_windows.bat backup` (o Impostazioni → Backup → «Fai un backup adesso»).
2. Estrai `DocMap-hub-0.10.zip` e copia il contenuto **sopra** `C:\DocMapHub\` (sostituisci i file). La cartella dati
   `%APPDATA%\DocMapHub\` non si tocca.
3. Avvia: in basso a sinistra **v0.10.1**. Al primo avvio il registro passa allo **schema 4**: si aggiunge solo la
   tabella dei modelli; prima l'hub fa da solo una copia del registro in `backups\registro-prima-dello-schema-4-…`.
4. **Impostazioni → Hosting predefinito → Imposta adesso**: dominio (`https://docmap.pr-it.it/`), server e utente FTP,
   password (va in cassaforte), cartella base come la vede l'account FTP (di solito `/`), suffisso della demo (`-demo`).
5. Guarda **Impostazioni → Modelli cliente** e scegli quello da proporre per primo («Proponi per primo»).

## Dati e sicurezza

- **Nessun dato si sposta.** Clienti, siti, licenze e cassaforte restano come sono. I modelli valgono solo per i
  clienti creati da adesso; cambiare o eliminare un modello non tocca i clienti già creati.
- Le bozze e i JSON dell'AI della 0.5–0.9 si aprono come prima (FTP del cliente se c'è l'host, altrimenti nessuno).
- La password dell'hosting è cifrata con la chiave della cassaforte e viene ricifrata se cambi la passphrase.
- «Attiva tutto» **non sovrascrive** un sito già in uso: se nella cartella c'è DocMap si ferma (usa «Pubblica»).
- Due clienti non possono avere lo stesso indirizzo: le maschere lo bloccano (sarebbe lo stesso database).
- Se perdi il kit, rifallo dalla scheda del cliente («Kit di consegna»): le copie di `config.php` si riprendono
  dai siti via FTP (0.10.1).
- «Attiva tutto» si ferma anche se nella cartella c'è un altro sito (cartella non vuota, 0.10.1).
- Il **kit** contiene codici e chiavi del database in chiaro: l'hub non lo salva sul disco; scaricalo, consegnalo in
  modo sicuro e poi cancella la copia.

## Tornare indietro

Rimetti la cartella del programma della 0.9. Lo schema 4 aggiunge solo una tabella che la 0.9 ignora; l'hosting
predefinito è un'impostazione che la 0.9 non legge. I clienti creati con la 0.10 sono clienti normali.
