# DocMap: da 26.12.8 (v12.8) a 26.12.9 (v12.9) — app installabile e cronometro

Novità piccole e sicure, primi passi della roadmap «verso lo stato dell'arte» (ondate 0 e 1). **Nessun dato cambia**:
nessuna migrazione, nessuna chiave di memoria nuova per i dati, nessuna modifica del server oltre al numero di versione.

## Cosa cambia

- **App installabile (PWA)**: quando DocMap si apre da un sito `https://` (SiteGround, sede con HTTPS), il browser
  offre **Installa app** (Chrome, Edge, Android) oppure **Condividi › Aggiungi alla schermata Home** (iPhone, Safari).
  Compare un'icona come un'app vera. Il telefono installa la pagina del telefono (`scan.html`), il PC il programma
  completo (`index.html`).
- **Si apre anche senza rete**: il browser tiene una copia dei soli file del programma. Con la rete si usa sempre la
  versione sul server (un aggiornamento si vede subito alla riapertura); senza rete si apre l'ultima copia. I dati e
  le richieste al server (`server-php/api.php`) non vengono **mai** copiati né serviti dalla copia: senza rete restano
  valide le regole di prima (coda offline dell'inventario, avvisi «server non raggiungibile»).
- **Cronometro dei tempi reali**: DocMap misura quanto ci vuole a **trovare un faldone** (dalla prima lettera scritta
  nella ricerca all'apertura del faldone, su PC e telefono) e a **catalogare un faldone** nell'inventario (tempo tra
  due faldoni di seguito). Le pause oltre 2 minuti non contano.
  - PC: **Impostazioni › Informazioni su DocMap › Dettagli e assistenza › Tempi misurati** (anche dentro «Copia dati
    per l'assistenza»).
  - Telefono: **Tempi misurati** sotto la casella del codice; nell'inventario, accanto ai totali, «N s a faldone».
  - Restano **solo su quel dispositivo** e sono solo durate: mai nomi, codici o clienti. **Copia i tempi** per
    mandarli, **Azzera** per ricominciare.
- Da `file://` (doppio clic su `index.html`) non cambia niente: i browser non permettono l'installazione da un file.
- **Nuovo stile grafico (ondata 1)**: tutti i colori, le misure e le ombre stanno in un solo file
  (`assets/css-tokens.css`). In chiaro l'aspetto resta quello di prima.
- **Tema scuro**: segue il sistema (Windows, Android, iPhone) oppure si sceglie in **Impostazioni › Aspetto**
  (Automatico, Chiaro, Scuro); sul telefono sotto «Tempi misurati». La scelta vale per quel dispositivo. Etichette,
  anteprime dei fogli e stampe restano **sempre chiare**.
- **Cerca ovunque (Ctrl+K)**: sul PC premi **Ctrl+K** (⌘K sul Mac) o la lente 🔍 in alto: una sola casella per faldoni,
  clienti, pagine e azioni (nuovo faldone, backup, tema…). Frecce per scegliere, Invio per aprire, Esc per chiudere.

## File nuovi

`sw.js`, `manifest.webmanifest`, `scan.webmanifest` (accanto a `index.html`), `assets/icons/` (4 icone),
`assets/js/02g-pwa.js`, `assets/js/02h-timing.js`, `assets/js/02i-theme.js`, `assets/js/04d-palette.js`,
`assets/css-tokens.css`. Cambiano anche tutti gli altri `assets/*.css`: caricali tutti. Il deploy (`tools/build_deploy.py`, hub «Invia ai siti») li copia
da solo e aggiunge al `.htaccess` il tipo dei file `.webmanifest`.

## Passi

1. **Backup** sul PC (Salva backup) come sempre.
2. **PC**: doppio clic su `AGGIORNA-DOCMAP.bat` (oppure estrai lo zip nella **stessa cartella** di prima).
3. **Server web**: come in `AGGIORNARE-IL-SERVER.md`: carica i file **sopra** quelli vecchi, senza cancellare la
   cartella, senza toccare `server-php/config.php` né la cartella dati, senza rieseguire `setup.php`. Con il hub:
   Deploy → «Siti da aggiornare». Controllo: `server-php/api.php?r=ping` → `"app_version":"26.12.9"`.
   Se carichi a mano, carica anche il `.htaccess` nuovo (riga `AddType application/manifest+json .webmanifest`).
4. **Telefoni**: riapri la pagina una volta con la rete; poi, se vuoi, installala (vedi sopra).

## Spegnere l'installazione

In `docmap.config.js` del sito aggiungi `pwa: false` (accanto a `mode`). Alla riapertura successiva non si registra
più; per togliere anche la copia già fatta: impostazioni del browser › Dati del sito › Elimina.

## Tornare indietro

Ricarica i file della 26.12.8 (PC: `AGGIORNA-DOCMAP.bat ripristina`). I file nuovi possono restare: senza
`02g-pwa.js` nelle pagine nessuno li usa. Un telefono che aveva installato l'app la riapre dalla rete con la versione
vecchia; i tempi misurati restano nel browser e vengono ignorati.
