# Da 26.12.16 (v12.16) a 26.12.17 (v12.17) — lettura AI più affidabile e misurabile

Mette nel codice le fondamenta che il [briefing sul riconoscimento](https://claude.ai/artifact/6vVNg8CmEyoT7YYzgzs6TL)
chiedeva prima della «foto unica»: la fiducia di ogni campo, il vocabolario dei tag del cliente e un banco di prova per
misurare ogni fornitore AI. **Nessun dato cambia**: nessuna migrazione, nessuna chiave di memoria nuova. Il server
risponde due campi in più alla lettura AI (vedi «File»), quindi va aggiornato insieme all'app.

## Cosa cambia

### 1. Fiducia di ogni campo e campi da controllare

- Ogni lettura AI dice ora **quanto è sicura di ogni campo**: ditta, contenuto, anni, tipo, tag. Salva anche chi ha
  letto (server o modello locale), quale modello e quale **versione del prompt** (oggi 2).
- Nella revisione del PC i campi incerti (sotto il 60%) sono **in giallo** e c'è la riga «Da controllare: anni».
- Un faldone con un campo incerto va in **Da rivedere** e non viene mai confermato con «Conferma le proposte sicure».
- Le letture fatte prima di questa versione restano come sono: valgono con la loro fiducia unica.

### 2. Vocabolario dei tag del cliente (PC, pagina del progetto)

- Una riga per tag con le parole che valgono lo stesso tag: `IVA = imposta valore aggiunto, liquidazioni`. Maiuscole,
  accenti e punti non contano («I.V.A.» è già «IVA»).
- **Parole escluse**: non diventano mai tag (ci sono già «varie», «documenti», «archivio» e il nome del marchio).
- L'AI riceve i tag e i sinonimi; la risposta e le parole lette sulla costa tornano al tag giusto. Vale anche per la voce
  sul telefono.
- **Nuovi tag suggeriti**: parole lette su almeno 3 faldoni che non sono ancora tag. Un clic le aggiunge o le esclude per
  sempre. I nomi di persone e ditte non vengono mai suggeriti.
- I tag del vocabolario entrano tra i tag rapidi del telefono. Il vocabolario viaggia anche nei modelli di progetto.

### 3. Banco di prova della lettura AI (PC, pagina del progetto)

- Rilegge un campione di faldoni **già confermati** (la risposta giusta) con l'AI del server o con il modello locale.
- Mostra per ogni campo quante letture sono giuste, quanti faldoni erano tutti giusti, i secondi a faldone e
  l'**affidabilità** (tra le letture che l'AI dava per sicure, quante erano tutte giuste).
- Le prove restano nel progetto (ultime 12) per confrontare fornitori, modelli e prompt. Nessun faldone viene cambiato.

## File

Cambiano `assets/js/02f-inventory.js` (forma unica delle letture, vocabolario, banco di prova), `06q-inventory.js`
(campi gialli, conferma in blocco), `06qa-inventory-pro.js` (lettura dal PC, una sola funzione `ivqAiCall`),
`11f-inventory.js` (telefono: tag con il vocabolario, stato dopo la lettura), `assets/css-inventory.css`, `index.html`
(un file nuovo `assets/js/06qc-inventory-ai.js`), `02-core.js` e `sw.js` (versione). **Server**: `server-php/api.php` e
`server-python/docmap_server/api.py` chiedono e restituiscono `field_conf` (fiducia per campo) e `prompt_v`; un'app
vecchia li ignora, quindi l'ordine di aggiornamento non è critico.

## Dati

- Progetto (`archive.inv`): campi nuovi `vocab` (`syn` = tag con i sinonimi, `stop` = parole escluse) e `bench` (prove
  del banco). Le versioni vecchie li conservano senza usarli.
- Faldone (`inv.ai`): campi nuovi `field_conf`, `provider`, `prompt_v`. Nessun campo vecchio cambia significato.

## Passi

1. **Backup** sul PC (Salva backup) come sempre.
2. **PC**: doppio clic su `AGGIORNA-DOCMAP.bat` (oppure estrai lo zip nella **stessa cartella** di prima).
3. **Server web**: carica i file sopra quelli vecchi come in `AGGIORNARE-IL-SERVER.md` (non toccare `config.php` né la
   cartella dati). Controllo: `server-php/api.php?r=ping` → `"app_version":"26.12.17"`.
4. **Telefoni**: lasciate svuotare la coda, poi riaprite la pagina con la rete.

## Tornare indietro

Ricarica i file della 26.12.16 (PC: `AGGIORNA-DOCMAP.bat ripristina`). Tutti i dati restano: vocabolario, prove del banco
e fiducia per campo restano salvati senza essere mostrati; le letture tornano a una fiducia unica.
