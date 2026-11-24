# Da 26.12.14 (v12.14) a 26.12.15 (v12.15) — inventario più veloce: raffica e obiettivo

Rende più veloce l'inventario con il telefono e dice in ogni momento quando finirete. **Nessun dato cambia**: nessuna
migrazione, nessuna chiave di memoria nuova, **il server non cambia** (`api.php` e `api.py` cambiano solo il numero).

## Cosa cambia

### 1. Raffica: più etichette nella stessa inquadratura (telefono)

- Sotto i tag c'è **Raffica: più etichette nella stessa inquadratura** (spenta di serie, il telefono la ricorda).
- Accesa, inquadrate una fila di coste o una scatola aperta: ogni etichetta nuova diventa un faldone, **in ordine di
  numero**, con un solo segnale «N faldoni in una volta». Se nella stessa inquadratura c'è l'etichetta della scatola,
  la scatola viene presa per prima e i faldoni finiscono lì.
- **La foto di ogni faldone è la striscia della sua costa** (attorno al suo QR, tutta l'altezza): la lettura AI legge
  la costa giusta anche se nella foto ce n'erano altre.
- Le etichette già fatte che restano nell'inquadratura non suonano (niente «già acquisito» a ripetizione).
- Due etichette di scatola nella stessa inquadratura sono ambigue: la scatola non cambia, compare «Più scatole nella
  stessa inquadratura» e i faldoni vengono presi comunque nella scatola di prima.
- Funziona dove il browser legge più codici insieme (Chrome su Android, Edge). Su iPhone e sui browser senza lettore
  nativo il telefono legge un codice alla volta e lo dice sotto l'interruttore. Spenta, tutto è come prima.

### 2. Obiettivo del progetto e ora di fine

- Progetto › Modifica › **Faldoni previsti (obiettivo)**: facoltativo. «Stima un lavoro» › «Crea il progetto con questi
  numeri» lo scrive da solo (faldoni + documenti stimati).
- **Telefono**: barra sotto lo stato della coda: «120 di 300 previsti · 40% · mancano circa 24 min, fine verso le 11:40»
  al ritmo misurato in questa sessione.
- **PC**, scheda *Lavoro* del progetto: la stessa percentuale e il lavoro che manca al ritmo misurato nel progetto
  (mediana tra due faldoni, come nel report). Oltre l'obiettivo lo dice, per aggiornare il preventivo.

## File

Cambiano `assets/js/11b-assoc.js` (lettore della fotocamera: più codici per inquadratura, `emitAll`, `onCodes`),
`assets/js/02f-inventory.js` (`invProgress`, `invMinsText`, `invBurstOrder`, `invBurstCrop`, `invGrabFrame` con
ritaglio, `target` in `normalizeInv`), `11f-inventory.js` (telefono), `06q-inventory.js` (campo obiettivo),
`06qa-inventory-pro.js` e `06qb-inventory-tools.js` (scheda Lavoro, stima, aiuto), `assets/css-inventory.css`,
`02-core.js` e `sw.js` (versione), `server-php/api.php` e `server-python/docmap_server/api.py` (solo il numero).

## Dati

- Progetto (`archive.inv`): campo nuovo `target` (numero, 0 = nessun obiettivo). Viaggia con il progetto; le versioni
  vecchie lo conservano senza usarlo.
- Telefono: le preferenze del progetto (`docmap_v26_inv_prefs`, stessa chiave) ricordano anche `burst`.

## Passi

1. **Backup** sul PC (Salva backup) come sempre.
2. **PC**: doppio clic su `AGGIORNA-DOCMAP.bat` (oppure estrai lo zip nella **stessa cartella** di prima).
3. **Server web**: carica i file sopra quelli vecchi come in `AGGIORNARE-IL-SERVER.md` (non toccare `config.php` né la
   cartella dati). Controllo: `server-php/api.php?r=ping` → `"app_version":"26.12.15"`.
4. **Telefoni**: lasciate svuotare la coda, poi riaprite la pagina con la rete.

## Tornare indietro

Ricarica i file della 26.12.14 (PC: `AGGIORNA-DOCMAP.bat ripristina`). Tutti i dati restano; l'obiettivo resta nel
progetto senza essere mostrato e la raffica sparisce (il telefono legge un codice alla volta).
