# Da 26.12.13 (v12.13) a 26.12.14 (v12.14) — inventario che non perde niente e stima del lavoro

Rende più solido l'inventario con il telefono (coda che non si ferma e non perde niente, copia di sicurezza) e aggiunge
la stima rapida di un lavoro sul PC. **Nessun dato cambia**: nessuna migrazione, nessuna chiave di memoria cambiata,
**il server non cambia** (`api.php` e `api.py` cambiano solo il numero di versione).

## Cosa cambia

### 1. La coda del telefono non si ferma e non perde niente

- **Server occupato** (errore 5xx), **troppe richieste** (429) o **rete assente**: il lavoro aspetta e riprova da solo con
  pause crescenti (5 s, 10 s, 20 s … fino a 5 minuti; se il server dice quanto aspettare con `Retry-After`, si aspetta
  almeno quello). Prima un errore 5xx fermava la coda finché qualcuno non toccava ↻. Quando torna la rete riparte subito.
- **Accesso scaduto** (401): la coda si ferma con «Accesso scaduto»; rientra e tocca ↻. Niente viene scartato.
- **Lettura AI**: dopo 3 tentativi falliti la lettura si abbandona (il faldone resta salvato, si può leggere dal PC).
- **Un rifiuto vero** del server (dati non validi) segna solo quel faldone, con il motivo; gli altri vanno avanti.
- **Memoria del telefono piena**: prima il faldone poteva restare solo sullo schermo e perdersi. Ora la scansione viene
  annullata con «Memoria del telefono piena» (l'etichetta si può riscansionare più tardi) e le nuove acquisizioni si
  fermano finché c'è spazio. Il programma prima prova da solo a liberare spazio nella copia locale dei faldoni recenti.
- **Foto già inviate**: tolte dal telefono da sole (restano le 30 più recenti, per sicurezza).
- **Memoria protetta**: il telefono chiede al browser di non cancellare i dati del programma quando serve spazio
  (`navigator.storage.persist`), e controlla lo spazio usato ogni 25 faldoni.

### 2. Stato della coda e copia di sicurezza (telefono)

Tocca la riga dello stato della coda: faldoni e letture AI in attesa, il più vecchio, memoria usata e protetta,
**Riprova adesso** e **Salva copia di sicurezza** (file `.json` con i faldoni non ancora inviati e le loro foto).
Sul PC: Progetti › progetto › scheda *Lavoro* › **Importa dal telefono**. Un faldone già presente si aggiorna solo se la
copia è più recente: importare due volte non crea doppioni. Con il server configurato le foto si caricano anche lì.

### 3. Stima un lavoro (PC)

Progetti › **Stima un lavoro**: metri di scaffale o scatole → faldoni, documenti, ore, giornate, faldoni all'ora,
etichette da stampare con la scorta, importo con i prezzi di Impostazioni › Inventario (`invPrices()`, decisione D23).
I secondi a faldone partono dalla mediana dei vostri progetti passati. **Crea il progetto con questi numeri** apre un
progetto con le etichette già calcolate. Valori di partenza in `INV_EST_DEFAULT` (`assets/js/02f-inventory.js`).

## File

Nuovo `assets/js/06qb-inventory-tools.js` (stima, importazione della copia). Cambiano `index.html`,
`assets/js/02f-inventory.js` (`invEstimate`, `invPaceHistory`, `invRescueParse`), `06q-inventory.js`,
`06qa-inventory-pro.js`, `11f-inventory.js` (telefono), `assets/css-inventory.css`, `02-core.js` e `sw.js` (versione),
`server-php/api.php` e `server-python/docmap_server/api.py` (solo il numero di versione).

## Dati

- Telefono: chiave nuova `docmap_v26_inv_sent` (elenco delle foto già ricevute dal server, solo per pulire). I lavori in
  coda (`docmap_v26_inv_outbox`) possono avere i campi in più `next` (quando riprovare) e `tries`: le versioni vecchie li
  ignorano.
- Copia di sicurezza: formato `docmap-inv-rescue` versione 1 (`project`, `recs` solo faldoni e scatole `inv-…`, `photos`
  solo immagini). Il PC rifiuta tutto il resto.
- Registro attività: riga `inventory.rescue` a ogni importazione.

## Passi

1. **Backup** sul PC (Salva backup) come sempre.
2. **PC**: doppio clic su `AGGIORNA-DOCMAP.bat` (oppure estrai lo zip nella **stessa cartella** di prima).
3. **Server web**: carica i file sopra quelli vecchi come in `AGGIORNARE-IL-SERVER.md` (non toccare `config.php` né la
   cartella dati). Controllo: `server-php/api.php?r=ping` → `"app_version":"26.12.14"`.
4. **Telefoni**: prima di aggiornare, lascia che la coda si svuoti (stato «tutto inviato»); poi riapri la pagina con la rete.

## Tornare indietro

Ricarica i file della 26.12.13 (PC: `AGGIORNA-DOCMAP.bat ripristina`). Tutti i dati restano; la chiave
`docmap_v26_inv_sent` viene ignorata. Una coda con pause in corso riparte al primo ↻.
