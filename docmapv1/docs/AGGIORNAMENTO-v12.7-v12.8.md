# DocMap: da 26.12.7 (v12.7) a 26.12.8 (v12.8) — Progetti di inventario

Novità grande: i **Progetti di inventario** (inventario rapido di archivi di cui non conosci il contenuto) e la scelta
dell'**indirizzo dei QR**. Nessun dato esistente cambia: le migrazioni sono solo additive.

## Cosa cambia

- **PC**: nuova voce **Progetti** nella barra in alto. Un progetto genera lotti di etichette per scatole e faldoni
  (`ROSSI24-S001`, `ROSSI24-0001`, la numerazione continua sempre), le stampa sul foglio scelto in Stampa, scarica il
  manifest QR7 del lotto, mostra il QR per aprire il progetto sul telefono e la **griglia di revisione** dei faldoni
  acquisiti (foto della costa, campi da correggere, «Conferma le proposte sicure»).
- **Telefono** (`scan.html?inv=…`): schermata **Scatola → Faldoni** con fotocamera sempre accesa, beep, foto
  automatica della costa, tag rapidi, barra degli anni, microfono (tieni premuto e parla), **Annulla** entro 10 s,
  coda che funziona anche senza rete.
- **Server** (`server-php/api.php`): nuove richieste `project`, `photo_put`, `photo`, `ai_spine`; le etichette non
  ancora scansionate vengono riconosciute («questa etichetta è del progetto …»). Le foto delle coste stanno, cifrate,
  nella cartella dati in `photos/`.
- **Impostazioni › Indirizzo dei QR**: l'indirizzo davanti al codice in ogni QR. Di predefinito resta
  `https://qr7.it/`; si può usare qualsiasi altro servizio. Se non lo tocchi non cambia niente.
- **Lettura AI della costa** (facoltativa, spenta finché non la configuri): vedi sotto.

## Dati

- PC: i progetti sono archivi con in più il campo `inv`; i faldoni acquisiti hanno il campo `inv` (stato, foto,
  proposta AI). Il database locale riceve due colonne nuove (`archives.inv_json`, `binders.inv_json`), aggiunte solo
  se mancano. Nessuna chiave di memoria cambia. Nuove chiavi solo sul telefono: `docmap_v26_inv_outbox`,
  `docmap_v26_inv_recent`, `docmap_v26_inv_prefs` e il database del browser `docmap_v26_inv` (foto in attesa).
- Server: nessuna migrazione dello schema. Le foto vanno in `<cartella dati>/photos/` (creata da sola).

## Passi

1. **Backup** sul PC (Salva backup) come sempre.
2. **PC**: doppio clic su `AGGIORNA-DOCMAP.bat` (oppure estrai lo zip nella **stessa cartella** di prima).
3. **Server web**: uguale a `AGGIORNARE-IL-SERVER.md`: carica i file **sopra** quelli vecchi senza cancellare la
   cartella, non toccare `server-php/config.php` né la cartella dati, non rieseguire `setup.php`. Con il hub: Deploy →
   «Siti da aggiornare». Controllo: `server-php/api.php?r=ping` → `"app_version":"26.12.8"` e `"inventory"` tra le
   funzioni.
4. **Telefoni**: si aggiornano riaprendo la pagina.

## Lettura AI della costa (facoltativa)

Serve il server online. In `server-php/config.php` aggiungi (vedi `config.sample.php`):

```php
'ai_provider' => 'anthropic',
'ai_api_key'  => 'la-tua-chiave',          // mai nel repository, mai nei backup condivisi
'ai_model'    => 'claude-opus-5-5',        // oppure 'claude-haiku-5-5', molto più economico
```

Prima di accenderla: la foto della costa viene inviata al fornitore dell'AI. Serve la nomina a responsabile del
trattamento (GDPR art. 28, bozza in `docs/commerciale/`) e va detto al cliente. Senza chiave tutto funziona lo stesso:
il telefono acquisisce foto e dati, la catalogazione si fa dal PC nella griglia di revisione.

## Tornare indietro

Ricarica i file della 26.12.7 (PC: `AGGIORNA-DOCMAP.bat ripristina`). I faldoni acquisiti restano faldoni normali
(il campo `inv` viene ignorato); la vista Progetti sparisce finché non torni alla 26.12.8. Le foto restano nella
cartella dati del server.
