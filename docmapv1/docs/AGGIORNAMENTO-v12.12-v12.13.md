# Da 26.12.12 (v12.12) a 26.12.13 (v12.13) — inventario fasi 3 e 4, lettura AI con qualsiasi fornitore

Fasi 3 e 4 dei Progetti di inventario (documento di fattibilità del 2026-11-22): stazione fissa, catena a due persone,
verifica delle scatole, lettore Bluetooth, livello documento, modelli di progetto, prezzi, report di fine lavoro con
fatturazione e statistiche per operatore; lettura AI agnostica (anche un modello locale, nessuna foto fuori dallo studio).
**Nessun dato cambia**: nessuna migrazione, nessuna chiave di memoria cambiata, nessuna tabella nuova, **nessuna rotta
nuova sul server**. I campi nuovi stanno dentro i record che esistono già e hanno sempre un valore predefinito.

## Cosa cambia

### 1. Modalità nuove (progetto › Modifica › Modalità)

- **Stazione fissa**: telefono su un supporto (o webcam), la persona passa i faldoni davanti alla fotocamera. Conferma
  grande e colorata a ogni lettura, tag / anni / voce chiusi in «Tag, anni e voce», lo stesso codice non viene riletto
  per 8 secondi (niente doppioni se il faldone resta davanti alla fotocamera).
- **Catena a due persone**: una persona scansiona, l'altra al PC preme **In diretta** nella scheda *Lavoro* del
  progetto: i faldoni nuovi compaiono da soli ogni 4 secondi (con il server online), si correggono e si confermano.

### 2. Lettore Bluetooth o USB

Un lettore collegato come tastiera funziona sul telefono (e sul PC) senza toccare nessun campo: i caratteri arrivati
molto in fretta (meno di 60 ms l'uno dall'altro) e chiusi da Invio valgono come una scansione. Chi scrive a mano è più
lento e non viene confuso con il lettore. Il campo per scrivere il codice funziona come prima.

### 3. Livello documento e etichette jolly

- Progetto › **Livello documento**: si possono generare lotti **Documenti** (sull'etichetta la parola «DOCUMENTO») e
  **Jolly** (diventano faldone o documento alla prima scansione). Usano la stessa numerazione dei faldoni: un numero
  non torna mai.
- Telefono: scansiona il faldone, poi i documenti che contiene (ognuno collegato al suo faldone); riscansionare un
  faldone chiude la cartella. La foto di un documento è la prima pagina e l'AI la legge come tale.
- Costa vuota: **Foto della prima pagina** aggiunge una seconda foto al faldone appena acquisito; l'AI legge quella.
- PC: filtro *Livello* (Tutto / Faldoni / Documenti) nella revisione; i documenti mostrano «Documento in …».

### 4. Verifica di una scatola (telefono)

**Verifica una scatola** → scansiona la scatola e poi tutto quello che c'è dentro: trovati / attesi, **mancanti**,
**fuori posto** (con la scatola dove risultavano) e sconosciuti. **Sposta qui** corregge la posizione con un tocco.
**Chiudi la verifica** scrive una riga nel registro attività (`inventory.verify`), che il PC mostra nella scheda
*Verifiche* e nel report. Al cambio di scatola il telefono mostra il riepilogo della scatola appena chiusa.

### 5. Modelli di progetto

*Nuovo progetto › Parti da un modello*: commercialista, ente pubblico, studio legale, azienda, condominio, trasloco
(tag rapidi, anni attesi, modalità, livello documento). **Salva come modello** (scheda *Lavoro*) crea un modello dello
studio; si cancellano in **Impostazioni › Inventario**.

### 6. Prezzi e report di fine lavoro

- **Un posto solo per ogni prezzo**: i prezzi generali in **Impostazioni › Inventario** (di serie 1,20 € a faldone,
  2,50 € a scatola, 0,40 € a documento, quota fissa 0, IVA 22%: valori di esempio, da cambiare); i prezzi del preventivo
  di un cliente nel **progetto** (campo vuoto = prezzo generale). Il codice li legge sempre da `invPrices()` in
  `assets/js/02f-inventory.js`.
- **Report di fine lavoro** (scheda *Lavoro*): periodo, totali, stato, tempo mediano a faldone, lettura AI, etichette
  generate / stampate / non usate, fatturazione indicativa (imponibile, IVA, totale), operatori (faldoni, documenti, da
  rivedere, ritmo), scatole con gli anni, verifiche. **Stampa** e **Scarica CSV**. Non è una fattura.

### 7. Lettura AI con qualsiasi fornitore (server e PC)

- **Server** (`config.php`, chiave `ai_provider`): `''` spento (di serie) · `anthropic` (Claude) · `openai_compatible`
  (qualsiasi servizio con l'API OpenAI e le immagini: `ai_base_url`, `ai_api_key`, `ai_model`) · `ollama` (modello di
  visione su un PC della sede con Ollama o LM Studio: `ai_base_url` di serie `http://127.0.0.1:11434/v1`, nessuna
  chiave; esempio `ai_model` `qwen2.5vl:7b`). Esempi in `server-php/config.sample.php`.
- **PC**: **Leggi con l'AI** nella revisione legge le foto non ancora lette, una alla volta, fermabile. Usa il server
  online se ha l'AI accesa; altrimenti il **modello locale** di **Impostazioni › Inventario** (indirizzo, modello,
  pulsante **Prova**). Riempie solo i campi vuoti. Se il programma si apre da un sito (`https://…`) e non dal file sul PC, Ollama va avviato con la variabile `OLLAMA_ORIGINS` che contiene l'indirizzo del sito (LM Studio: opzione «Enable CORS»), altrimenti il browser blocca la risposta.
- L'operatore non aspetta mai l'AI: il telefono crea il faldone subito e la lettura arriva dopo (come nella 26.12.8).
- Con un fornitore in cloud foto e parole dettate escono dallo studio: serve la nomina a sub-responsabile (bozze in
  `docs/commerciale/NOMINA-SUBRESPONSABILE-AI-BOZZA.md` e `INFORMATIVA-INVENTARIO-AI-BOZZA.md`, da far vedere al legale).
  Con `ollama` in sede o con il modello locale del PC nessuna foto esce dallo studio.

## File nuovi

`assets/js/06qa-inventory-pro.js` (scheda *Lavoro*, report, diretta, AI dal PC, Impostazioni › Inventario). Cambiano
`index.html`, `assets/js/02f-inventory.js` (modello, prezzi, modelli, report, prompt AI), `06q-inventory.js` (PC),
`11f-inventory.js` (telefono), `assets/css-inventory.css`, `02-core.js` e `sw.js` (versione), `server-php/api.php`,
`server-php/config.sample.php` e il server Python (`api.py`: fornitori AI, `kind`, `project&detail=1`). Il deploy
(`tools/build_deploy.py`, hub «Invia ai siti») li copia da solo.

## Dati

- Progetto (`archive.inv`): `mode` anche `station` / `chain`; `doc` (sì/no); `price` (prezzi del preventivo, vuoti =
  generali); `template`. Lotti: `kind` anche `doc` / `any`.
- Faldone (`inv`): `lvl: 'doc'` e `parent` per i documenti, `ph2` per la seconda foto.
- Impostazioni del PC: `invPrices`, `invTemplates`, `invAi` (restano su quel PC, nel salvataggio e nei backup JSON; non
  viaggiano con la sincronizzazione). I prezzi di un progetto viaggiano con il progetto.
- Telefono: le preferenze del progetto ricordano anche la cartella aperta e la scelta jolly (stessa chiave di prima).

## Passi

1. **Backup** sul PC (Salva backup) come sempre.
2. **PC**: doppio clic su `AGGIORNA-DOCMAP.bat` (oppure estrai lo zip nella **stessa cartella** di prima).
3. **Server web**: come in `AGGIORNARE-IL-SERVER.md`: carica i file **sopra** quelli vecchi, senza cancellare la
   cartella, senza toccare `server-php/config.php` né la cartella dati, senza rieseguire `setup.php`. Con il hub:
   Deploy → «Siti da aggiornare». Controllo: `server-php/api.php?r=ping` → `"app_version":"26.12.13"`.
4. **Solo se vuoi un fornitore AI diverso**: aggiungi a `config.php` le chiavi `ai_provider`, `ai_model` ed
   eventualmente `ai_base_url` / `ai_api_key` (vedi `config.sample.php`). Senza modifiche tutto resta come prima.
5. **Telefoni**: riapri la pagina una volta con la rete.

## Tornare indietro

Ricarica i file della 26.12.12 (PC: `AGGIORNA-DOCMAP.bat ripristina`). Tutti i faldoni e i documenti restano. Un progetto
in *Stazione fissa* o *Catena* si apre come *Cattura ora*, un lotto *Documenti* / *Jolly* come lotto di faldoni; i campi
nuovi restano nei record e tornano visibili rifacendo l'aggiornamento. Con `ai_provider` `openai_compatible` o `ollama`
il server 26.12.12 risponde «AI spenta»: rimetti `anthropic` o `''`.
