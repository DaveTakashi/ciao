# DocMap: da 26.12.9 (v12.9) a 26.12.10 (v12.10) — prelievi, consegna firmata, faldone smarrito, previsioni

Ondata 2 della roadmap «verso lo stato dell'arte» (funzioni 1, 3, 5 e 7 scelte da Dave) e fine dell'ondata 1.
**Nessun dato cambia**: nessuna migrazione, nessuna chiave di memoria cambiata, nessuna tabella nuova sul server.
Il server ha **una sola rotta nuova**, pubblica e in sola lettura (`finder`, vedi sotto).

## Cosa cambia

### 1. Prelievi e consegne (⚙ Funzioni avanzate › Lavoro › Prelievi e consegne)

- **Nuovo prelievo** per qualsiasi motivo: verifica fiscale, richiesta del cliente, pratica interna, avvocato o
  tribunale, revisione / due diligence, digitalizzazione, trasloco, scarto, altro. Il motivo propone da solo lo stato
  da registrare, a chi vanno e la data di rientro (si possono cambiare).
- **Quali faldoni**: cliente (nome o Codice Multi), anni dal–al, ricerca libera, categoria o tag, codici incollati da
  Excel (un codice per riga), faldoni spuntati nell'Archivio. L'anteprima mostra quelli già fuori e quelli senza
  posizione; si toglie la spunta a quelli che non servono.
- **Percorso ottimizzato**: i faldoni sono messi nell'ordine del giro tra gli scaffali (stanza → armadio → ripiano,
  ripiani greci α β γ, SX prima di DX, numeri in ordine naturale) e il giro va «a serpentina» (un armadio in
  andata, il successivo in ritorno). Tempo stimato dal cronometro. I faldoni senza posizione vanno in fondo.
- **Uscite**: distinta stampata con le caselle per ogni tappa, modulo di consegna su carta, CSV, **Segna come
  prelevati** (uno stato per faldone, con il riferimento al prelievo).
- **Col telefono**: «Spunta col telefono» mostra un QR; il telefono (dopo l'accesso) mostra la prossima tappa e
  spunta i faldoni man mano che si scansionano. Faldoni doppi rifiutati, faldoni non in elenco segnalati come «in
  più». Se la pagina si ricarica l'elenco resta (fino a 8 ore). Funziona anche **senza rete**: stati e firme
  aspettano in coda e partono appena torna la rete.

### 3. Consegna con firma e catena di custodia

- **Consegna con firma** (PC con mouse, dito o penna, oppure telefono): nome di chi riceve, documento facoltativo,
  firma. Al rientro: **Rientro firmato**. Ogni consegna e ogni rientro registrano uno stato per faldone (storia del
  faldone, sincronizzata ovunque) e stampano una **ricevuta** con l'**impronta SHA-256**: se qualcuno cambia
  qualcosa dopo, il PC lo vede («Attenzione: l'impronta non corrisponde»).
- La firma è una **prova interna** (chi, cosa, quando), **non** una firma elettronica qualificata.
- Consegne firmate dai telefoni: compaiono nella pagina dei prelievi; la ricevuta si ristampa e si verifica dal PC.

### 5. Faldone smarrito (Impostazioni › Faldone smarrito)

- Se qualcuno trova un faldone fuori posto e inquadra il QR, **senza accedere** vede solo il contatto scelto dallo
  studio (nome, telefono, WhatsApp, e-mail, messaggio) e i pulsanti **Chiama, WhatsApp, SMS, E-mail** con il codice
  dell'etichetta già scritto. **Nessun dato del faldone** è mostrato e la pagina non dice se il codice esiste.
- Spento di serie. Il contatto viaggia con le impostazioni condivise (sincronizzazione), così vale sul server e sui
  telefoni. In alternativa l'installatore può scriverlo in `docmap.config.js` (`finder: {name, phone, email, whatsapp, note}`).
- Server: rotta pubblica `api.php?r=finder&c=<codice>` (solo GET, nessun token, restituisce solo il contatto).

### 7. Andamento e previsioni (⚙ Funzioni avanzate › Lavoro › Andamento e previsioni)

- **Tempo risparmiato** (questo mese, 12 mesi, da sempre, prossimi 3 mesi) in ore e in euro: ogni consultazione vale
  i minuti per cercare un faldone senza DocMap meno il tempo misurato dal cronometro; ogni faldone catalogato idem.
  I valori (minuti, costo orario, capienza) si cambiano in «Come è calcolato».
- **Attività per settimana** e **previsioni** per consultazioni, uscite e nuovi faldoni: DocMap prova 9 modelli
  (settimana scorsa, media, tendenza lineare, livellamento esponenziale, Holt, stagionalità di 4/13/52 settimane e
  Holt-Winters) e usa quello che ha sbagliato meno sulle ultime settimane; mostra il modello, l'errore medio e una
  fascia 80%. Con meno di 8 settimane di dati non prevede.
- **Capienza**: con la capienza indicata stima il mese in cui l'archivio sarà pieno.
- **Suggerimenti dai dati**: faldoni in ritardo o fuori da più di 30 giorni, senza posizione, i più richiesti (da
  tenere a portata di mano), fermi da un anno (archivio di deposito), anni oltre i 10 anni (**da verificare** prima di
  qualsiasi scarto: DocMap non decide lo scarto e non è conservazione a norma), ricerca lenta, backup, picchi previsti.

### Fine dell'ondata 1

- **Oggi** in cima all'Archivio (dopo i «Primi passi»): cosa c'è da fare oggi e le azioni del proprio profilo
  (consultazione, operatore, amministratore). Si nasconde e resta nascosto su quel dispositivo.
- **Annulla al posto della domanda**: eliminare un faldone, un cliente, un prelievo o un archivio vuoto avviene subito
  con **Annulla** per 9 secondi. Chi preferisce la domanda: Impostazioni › Eliminazioni › «Chiedi sempre conferma
  prima di eliminare». Più faldoni insieme e le posizioni con faldoni dentro chiedono sempre.
- **Stati vuoti che spiegano**: «Nessun faldone corrisponde ai filtri» dice perché e offre «Togli ricerca e filtri»,
  «Cerca ovunque» e «Crea …»; in Stati, «Tutto in archivio» spiega come esce un faldone.

## File nuovi

`assets/js/02j-pick.js`, `02k-finder.js`, `06r-pick.js`, `06s-finder.js`, `06t-insights.js`, `06u-wave1.js`,
`11g-pick.js`, `11h-finder.js`, `assets/css-pick.css`. Cambiano anche `index.html`, `scan.html`, `02-core.js`,
`02d-status.js`, `06j-status.js`, `06c-clients.js`, `06l-archives.js`, `09-actions.js`, `sw.js`,
`server-php/api.php` (e il server Python). Il deploy (`tools/build_deploy.py`, hub «Invia ai siti») li copia da solo.

## Dati

- Prelievi: `S.picks` nel salvataggio del PC (anche nei backup JSON e nel ripristino); la catena di custodia vera sono
  gli **stati** dei faldoni, già sincronizzati ovunque. Firme: nell'archivio foto del telefono e sul server (`photo_put`,
  cifrate, mai sovrascritte).
- Impostazioni nuove: `finder`, `finderAt` (condivise), `insights`, `confirmDeletes` (solo su quel PC).
- Telefono: chiavi nuove `docmap_v26_pick_active`, `docmap_v26_pick_sig_outbox`; PC: `docmap_today_v1` (solo preferenza).

## Passi

1. **Backup** sul PC (Salva backup) come sempre.
2. **PC**: doppio clic su `AGGIORNA-DOCMAP.bat` (oppure estrai lo zip nella **stessa cartella** di prima).
3. **Server web**: come in `AGGIORNARE-IL-SERVER.md`: carica i file **sopra** quelli vecchi, senza cancellare la
   cartella, senza toccare `server-php/config.php` né la cartella dati, senza rieseguire `setup.php`. Con il hub:
   Deploy → «Siti da aggiornare». Controllo: `server-php/api.php?r=ping` → `"app_version":"26.12.10"` e `"finder"`
   tra le `features`.
4. **Telefoni**: riapri la pagina una volta con la rete.
5. Se volete il **faldone smarrito**: Impostazioni › Faldone smarrito, poi «Sincronizza con il server».

## Tornare indietro

Ricarica i file della 26.12.9 (PC: `AGGIORNA-DOCMAP.bat ripristina`). I prelievi restano nel salvataggio e vengono
ignorati; gli stati registrati (uscite, consegne, rientri) restano nella storia dei faldoni perché sono stati normali.
Il server 26.12.9 non ha la rotta `finder`: la pagina del telefono semplicemente non mostra il contatto.
