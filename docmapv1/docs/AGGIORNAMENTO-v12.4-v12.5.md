# Aggiornare DocMap dalla v12.4 alla v12.5 senza perdere i dati

La v12.5 (**26.12.5**) non ha migrazioni: stessi dati, schema locale 9, schema server 3, nessun campo nuovo. Cambiano
solo i file del programma (e il numero di versione in `api.php`). Novità: **correggere in fretta tante etichette**
(ad esempio stampate con il colore sbagliato).

- **La selezione resta**: in Modifica massiva cerchi, spunti, cancelli la ricerca, cerchi altro e spunti ancora. Le
  spunte non si perdono più e la barra dice quante righe selezionate la ricerca sta nascondendo.
- **Solo selezionati**: mostra tutte e sole le righe spuntate, ognuna modificabile. **Imposta colore** (e le altre
  operazioni) cambia tutti i selezionati, anche quelli nascosti dalla ricerca.
- La colonna **Colore** ora sta subito dopo la Categoria e i suggerimenti mostrano il quadratino del colore.
- Dopo **Salva modifiche**: **Stampa solo queste N etichette** mette in stampa solo i faldoni appena cambiati (se in
  stampa ce n'erano altri, prima chiede).
- In **Archivio**: con dei faldoni spuntati compaiono **Solo selezionati** e **Modifica i selezionati (N)**.

Chi è ancora sulla **v10.0** segue direttamente [`AGGIORNAMENTO-v10-v12.md`](AGGIORNAMENTO-v10-v12.md) con lo zip v12.5.

## Passi

Come sempre ([`AGGIORNARE-IL-SERVER.md`](AGGIORNARE-IL-SERVER.md) §2): backup, carica `deploy/studio-de/` **sopra**
quella vecchia (senza cancellare la cartella né `config.php`), `api.php?r=ping` con `"app_version":"26.12.5"`, poi il PC
(stessa cartella) e **Verifica dopo l'aggiornamento**, infine ricarica i telefoni. **Informazioni su DocMap** → **26.12.5**.

## Correggere i colori sbagliati (caso tipico)

1. **Archivio** › **Modifica massiva**.
2. Cerca un faldone (codice, cliente, Multi…), spunta; cancella la ricerca, cerca il successivo, spunta… finché ci sono tutti.
3. **Solo selezionati**: restano le righe scelte.
4. Colore uguale per tutti: **Imposta colore** › scegli › **Applica a N selezionati**. Colore diverso per riga: vai sulla
   cella **Colore** e scrivi (o scegli dai suggerimenti) il nuovo `#RRGGBB`.
5. **Salva modifiche** (o Ctrl+S). Un solo **Annulla** rimette tutto com'era.
6. **Stampa solo queste N etichette** › stampa come al solito.

## Tornare indietro

Rimetti i file della v12.4 (server e PC), senza toccare `config.php` e la cartella dati. Nessun dato da convertire.

## Per chi sviluppa

Tutto in `05d-bulk.js`: `BK.sel` non segue più i filtri (si tolgono solo gli id eliminati), `BK.onlySel`,
`bkSelected()` legge da `S.binders`, `BK.last` + `bkPrintLast()` (imposta `selected_for_print`), `bulkOpenSelected()`;
`UI.fSelOnly` in `filteredBinders()` (05-views.js, ignorato dentro la griglia); `c.sw` nei suggerimenti
(04b-typeahead.js). Nessuna modifica al contratto API oltre al numero di versione. Test: blocco `@@STREAM-V125@@` di
`tests/suite.js`.
