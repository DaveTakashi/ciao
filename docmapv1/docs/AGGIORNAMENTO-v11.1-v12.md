# Aggiornare DocMap dalla v11.1 (o v11) alla v12 senza perdere i dati

La v12 (**26.12.0**) aggiunge **stati** su faldoni, documenti e scatole (preso, reinserito, dato al cliente, dato al
Comune fino al…, mancante) con **verifica al rientro** delle scatole, **più archivi** con la procedura **Configura
archivio**, **QR annidati**, **tag NFC** (Chrome su Android), una **ricerca** nuova con filtri, l'accesso
**Ricordami** sul telefono e il **registro accessi** ("Chi l'ha visto"). Per chi è ancora sulla v10.0 c'è la guida
diretta [`AGGIORNAMENTO-v10-v12.md`](AGGIORNAMENTO-v10-v12.md).

Le migrazioni sono automatiche e additive:

| Dove | Cosa si aggiunge da solo | Cosa resta uguale |
|---|---|---|
| PC (browser) | allo stato `archives: []`, `statusEvents: []`; in ogni faldone `archive_id` vuoto (= "Archivio principale") | chiavi di memoria (`docmap_v26_state`, IndexedDB `docmap_v26_sqlite`, `docmap_v26_srv`, cassaforte), stato schema 26.9, faldoni, clienti, ubicazioni, foto, registri |
| Database locale (.sqlite) | schema 8 → 9: tabelle `archives`, `status_events`, colonne `binders.archive_id`, `contents_items.item_id` | tutte le tabelle e colonne esistenti |
| Server (`docmap.sqlite`) | schema 2 → 3 alla prima chiamata: tabella `access_log`; tipi di record nuovi `archive`, `status_event` | record, token, `config.php`, chiave di cifratura, registro sincronizzazioni |
| CSV completo | una colonna in fondo, `archive_id` (30 colonne) | ordine e nomi delle colonne esistenti |

**Ordine giusto: prima il server, poi i PC, poi i telefoni.** Un PC v11.1 funziona con il server v12; un PC v12 con un
server v11.1 sincronizza faldoni, clienti e ubicazioni ma non può inviare archivi, stati e accessi.

## 1. Backup (con la v11.1)

1. Su ogni PC: **Sincronizza con il server**, **Salva backup**, ⚙ Funzioni avanzate › Database › **File .sqlite**.
   Conserva i file fuori dalla cartella di DocMap.
2. Annota il numero di faldoni, clienti e ubicazioni.
3. Copia da parte la cartella `docmapv1` di ogni PC (es. `docmapv1-v11.1-vecchia`).
4. Sul server scarica una copia della cartella dati (`docmap.sqlite*`) e di `server-php/config.php`.

## 2. Server

1. Carica **il contenuto** di `deploy/studio-de/` dello zip v12 sopra `public_html/studio-de/`, sovrascrivendo.
2. **Non cancellare** la cartella prima, **non toccare** la cartella dati, **non rieseguire** `setup.php`.
3. `…/server-php/api.php?r=ping`: `"ok":true`, `"schema":3`, fra le `features` anche `archives`, `access_log`,
   `status_events`.
4. Facoltativo, in `config.php` (valori predefiniti se mancano): `remember_minutes` (quanto resta collegato un telefono:
   `0` chiede sempre, `480` = 8 ore, `43200` = 30 giorni, `-1` mai scade; vuoto = decide il dispositivo),
   `access_keep_days` (giorni di registro accessi, predefinito 365), `access_dedupe_seconds` (letture ripetute unite,
   predefinito 120).

**Dopo** l'aggiornamento del server, togli la protezione della cartella se l'avevi messa (Site Tools › Sicurezza ›
**Directory protette** › elimina quella di `studio-de`): con la v12 i telefoni restano collegati da soli e la password
di SiteGround verrebbe chiesta di nuovo a ogni QR. I dati restano protetti da codici di accesso, PIN e cifratura.

## 3. Ogni PC

1. Chiudi DocMap, copia la nuova `docmapv1` **sopra quella vecchia, nella stessa cartella**, con lo stesso browser.
2. Riapri `index.html` e controlla in ⚙ › Impostazioni › Dati e sicurezza › **Informazioni su DocMap**: versione
   **26.12.1** (26.12.0 se installi la v12), database locale schema **9**, server schema **3** (pulsante **Verifica server**).
3. Numero di faldoni, clienti e ubicazioni uguale a quello annotato.
4. **Sincronizza con il server**.

## 4. Telefoni

Ricarica la pagina. Al primo accesso spunta **Ricordami su questo dispositivo** per non inserire il PIN a ogni
scansione (manuale §15). Dopo una scansione compare la scheda con gli **stati rapidi**.

## 5. Tornare indietro (rollback)

- **PC**: rimetti i file di `docmapv1-v11.1-vecchia` nella stessa cartella. La v11.1 ignora le colonne e i campi nuovi.
  Se mancano dati, **Ripristina da backup JSON** o il `.sqlite` del §1.
- **Server**: ricarica i file della v11.1 (senza toccare `config.php` e la cartella dati). Lo schema 3 resta leggibile:
  la v11.1 ignora la tabella `access_log` e i record `archive` / `status_event`.
- Stati, archivi e accessi restano salvati e ricompaiono tornando alla v12.

## 6. Per chi sviluppa

Regole in [`AGGIORNAMENTI.md`](AGGIORNAMENTI.md), prova a secco in [`CHECKLIST-COLLAUDO.md`](CHECKLIST-COLLAUDO.md) §8.
Contratto API aggiornato in [`API-CONTRACT.md`](API-CONTRACT.md) §11 (accessi) e §12 (stati). In `tests/suite.js`:
`@@STREAM-A@@` aggiorna un database server v11 sul posto, `@@STREAM-Q@@` e `@@STREAM-C@@` le migrazioni locali,
`@@STREAM-V12@@` i collegamenti fra i moduli.
