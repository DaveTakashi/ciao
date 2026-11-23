# Doc Location: da 26.12.11 (v12.11) a 26.12.12 (v12.12) — nuovo nome, marchio in un solo file, lingue

Il programma si chiama **Doc Location**. Il nome però **non è più scritto nel codice**: sta solo in `brand.js`, e si
cambia con un comando (guida completa: [`MARCHIO.md`](MARCHIO.md)). Così un rivenditore può dare un'istanza ai suoi
clienti con il proprio nome, logo e colore (white label).

**Nessun dato cambia**: nessuna migrazione, chiavi di memoria del browser invariate (`docmap_v26_*`), stessi file di
backup e di sincronizzazione, **nessuna rotta nuova sul server** (cambia solo il numero di versione). I QR già stampati
funzionano come prima: l'indirizzo resta `https://qr7.it/{short_code}` (o quello scelto in Impostazioni).

## Cosa cambia per chi usa il programma

- Nome **Doc Location** (sigla **DL**) in alto, nella pagina di accesso, sul telefono, nei PDF, nell'aiuto e nei
  messaggi. Nel titolo della finestra: «Doc Location — Archivio fisico-digitale …».
- I file scaricati iniziano con `DocLocation_` (es. `DocLocation_workspace.json`, `DocLocation_etichette_….pdf`).
  I backup vecchi `DocMap_…json` si aprono e si ripristinano come prima.
- **Informazioni su Doc Location** (Impostazioni) mostra chi dà assistenza: nome, P.IVA, e-mail, telefono, sito.
- Lingue: italiano e inglese, come prima. Se un marchio offre una sola lingua, il selettore IT/EN sparisce.
- Il nome dell'app installata sul telefono o sul PC (icona) diventa «Doc Location» dopo il primo aggiornamento della pagina.

## Cosa resta con il nome tecnico DocMap (apposta)

Cartella `C:\DocMap`, `AGGIORNA-DOCMAP.bat`, `docmap.config.js`, `DocMap-copie`, attività di Windows «DocMap Sync
Web-Locale», cartelle dei dati, formati dei file e codici `dm26…` sui QR. Sono collegati a dati e impianti già
installati: cambiarli farebbe perdere dati. Elenco e motivi: `MARCHIO.md` §4.

## File nuovi

`brand.js` (il marchio), `assets/js/00-brand.js` (lo legge l'app), `server-php/brand.php` (lo legge il sito),
`tools/brand.py` (cambia il nome), `tools/brand-sweep.js` e `tools/brand_sweep_py.py` (controlli per chi scrive codice).
Cambiano quasi tutti i file `assets/js/*.js` (testi), `index.html`, `scan.html`, `sw.js`, i due `*.webmanifest`
(generati da `brand.js`), `server-php/setup.php`, `server-php/api.php` e il server Python (numero di versione).
Il deploy (`tools/build_deploy.py`, hub «Siti da aggiornare») li copia da solo e scrive il marchio di ogni cliente.

## Passi

1. **Backup** sul PC (Salva backup) come sempre.
2. **PC**: doppio clic su `AGGIORNA-DOCMAP.bat` (oppure estrai lo zip nella **stessa cartella** di prima). Il file
   `brand.js` deve esserci: senza, il programma parte lo stesso con il nome neutro «Archivio documenti».
3. **Server web**: come in `AGGIORNARE-IL-SERVER.md`: carica i file **sopra** quelli vecchi (anche `brand.js` e
   `server-php/brand.php`), senza toccare `server-php/config.php` né la cartella dati, senza rieseguire `setup.php`.
   Con l'hub: Deploy → «Siti da aggiornare» (scrive anche il marchio del cliente). Controllo:
   `server-php/api.php?r=ping` → `"app_version":"26.12.12"`.
4. **Telefoni**: riapri la pagina una volta con la rete.

## Tornare indietro

Ricarica i file della 26.12.11 (PC: `AGGIORNA-DOCMAP.bat ripristina`). Nessun dato è cambiato: torna solo il nome
DocMap. Il server 26.12.11 funziona uguale (nessuna rotta nuova). `brand.js` rimasto nella cartella non dà fastidio.
