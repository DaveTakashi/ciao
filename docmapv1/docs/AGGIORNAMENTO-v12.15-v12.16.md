# Da 26.12.15 (v12.15) a 26.12.16 (v12.16) — inventario per scatole e faldoni, tutte le modalità

Permette di fare l'inventario come conviene a ogni archivio: scatola per scatola, faldone per faldone, con etichette
fuori e dentro la scatola, con faldoni senza etichetta, con il codice leggibile grande o nascosto. Prepara anche i dati
per i futuri modelli di riconoscimento (vedi `docs/RICONOSCIMENTO.md`). **Nessun dato cambia**: nessuna migrazione dei
dati, nessuna chiave di memoria nuova, **il server non cambia** (`api.php` e `api.py` cambiano solo il numero).

## Cosa cambia

### 1. Come è etichettato l'archivio (PC, Progetto › Modifica)

- **Scatole**: un'etichetta fuori (come prima) · **due etichette uguali, FUORI e DENTRO** · nessuna etichetta (i
  faldoni si catturano senza scatola).
- **Faldoni**: tutti etichettati (come prima) · alcuni etichettati · **nessuno: si conta la scatola**.
- **Codice leggibile sull'etichetta**: grande (consigliato, scritto molto in grande) · normale · nascosto (solo QR).
- **Scrivi anche il codice del QR (dm26…) in piccolo**: sì o no.
- Sotto le scelte una riga spiega cosa succede con quella combinazione. Le stesse scelte compaiono nella stampa delle
  etichette (con l'anteprima) e la stampa le ricorda per il progetto.

### 2. Livello scatola (telefono)

- Dopo aver letto l'etichetta della scatola compare il riquadro **Scatola …**: **Faldoni nella scatola** (contati a
  mano, con − e +), **Foto della scatola aperta** e, se i faldoni non sono tutti etichettati, **Faldone senza etichetta**.
- La foto della scatola aperta resta nel progetto e ricorda dove sta ogni etichetta riconosciuta nella foto: è la base
  per riconoscere in futuro tutti i faldoni da una sola foto. Le etichette del progetto che si vedono nella foto
  diventano faldoni subito.
- **Faldone senza etichetta**: un tocco crea il faldone con un codice nuovo mai usato, la foto della costa e la lettura
  AI come gli altri. L'etichetta si può stampare dopo (o mai).
- Con «Nessuno: si conta la scatola» tag e anni valgono per la scatola, e c'è una nota per la scatola.

### 3. Report, prezzo e dati per l'addestramento (PC)

- Il report del progetto mostra i faldoni **contati** accanto a quelli acquisiti; il CSV ha le colonne
  `faldoni_contati` e `faldoni_senza_etichetta`. Il prezzo a faldone usa i faldoni contati quando sono di più.
- Scheda Strumenti: tabella **Scatole** e **Dati per l'addestramento** (file JSON Lines, foto facoltative).
- Aiuto: nuova voce «Inventario: tutte le modalità» con la tabella di quando usare quale.

## File

Cambiano `assets/js/02f-inventory.js` (`inv.plan`, scatole, foto delle scatole, registro dei riconoscitori, dati per
l'addestramento), `11f-inventory.js` (telefono), `06q-inventory.js` (scelte del progetto, stampa FUORI/DENTRO, codice
grande o nascosto), `06qa-inventory-pro.js` e `06qb-inventory-tools.js` (report, tabella scatole, esportazione, aiuto),
`assets/css-inventory.css`, `02-core.js` e `sw.js` (versione), `server-php/api.php` e
`server-python/docmap_server/api.py` (solo il numero). Nuovo `docs/RICONOSCIMENTO.md`.

## Dati

- Progetto (`archive.inv`): campo nuovo `plan` (`box`, `binder`, `code`, `short`). Senza `plan` vale come prima
  (un'etichetta fuori, tutti i faldoni etichettati, codice normale).
- Scatola (ubicazione del progetto): campo nuovo `inv` (`count`, `years`, `tags`, `note`, `shots`). Viaggia con
  l'ubicazione; le versioni vecchie lo conservano senza usarlo.
- Faldone senza etichetta: un faldone normale con un codice nuovo e `inv.nolabel = 1`.
- PC con il database locale: la colonna `inv_json` delle ubicazioni viene **aggiunta solo se manca** (come per archivi e
  faldoni). Niente viene cancellato o riscritto.

## Passi

1. **Backup** sul PC (Salva backup) come sempre.
2. **PC**: doppio clic su `AGGIORNA-DOCMAP.bat` (oppure estrai lo zip nella **stessa cartella** di prima).
3. **Server web**: carica i file sopra quelli vecchi come in `AGGIORNARE-IL-SERVER.md` (non toccare `config.php` né la
   cartella dati). Controllo: `server-php/api.php?r=ping` → `"app_version":"26.12.16"`.
4. **Telefoni**: lasciate svuotare la coda, poi riaprite la pagina con la rete.

## Tornare indietro

Ricarica i file della 26.12.15 (PC: `AGGIORNA-DOCMAP.bat ripristina`). Tutti i dati restano: i faldoni senza etichetta
restano faldoni normali, le scelte del progetto, i conteggi e le foto delle scatole restano salvati senza essere mostrati.
