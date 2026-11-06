# Collaudo reale di DocMap — la scheda unica

> Per Dave. Una mattina (2-3 ore) con un **cliente finto**, un **PC Windows di prova**, un **sottodominio di prova**,
> la stampante e due telefoni. Tutto quello che c'è qui è provato solo su Linux con test automatici: questa scheda
> serve a scoprire cosa cambia sui dispositivi veri. Valida per **app 26.12.7, hub 0.9, strumenti di installazione 1.2.0**.

**Come riportare i risultati**: per ogni riga metti ✅ oppure ❌. Per ogni ❌ fai una foto o uno screenshot del
messaggio e incollalo nel thread del progetto con il numero della riga (es. "B4 ❌" + foto). Non serve spiegare: basta
il numero e l'immagine. Se un passo si blocca, salta al blocco successivo.

## Cosa preparare

- [ ] PC di Dave con l'**hub 0.9** (`python/DocMap-hub-0.9.zip`) e Python 3.11+.
- [ ] Un **PC Windows di prova** (va bene un portatile vecchio) collegato alla stessa rete, con Python 3.11+.
- [ ] Un **sottodominio di prova** su SiteGround, es. `prova.docmap.pr-it.it`, con un account FTP dedicato.
- [ ] Un foglio **MRINK143** (A4, 4 etichette 105×148) e qualche foglio bianco.
- [ ] Un telefono **Android** con Chrome e un **iPhone** con Safari. Un tag **NFC** (facoltativo).
- [ ] Una chiavetta USB per i backup.

## A. Hub sul PC di Dave (20 min) — guida: `GUIDA-NUOVO-CLIENTE.md` §0, `WIKI-HUB.md`

- [ ] A1. Estrai lo zip in `C:\DocMapHub\`, doppio clic su `hub\run_windows.bat`: si apre la pagina del hub nel browser.
- [ ] A2. Se è la prima volta la pagina chiede **una** passphrase (crea chiave e cassaforte). Passphrase **su carta**. Impostazioni → Backup: scegli la chiavetta come **seconda cartella** (l'avviso in Panoramica sparisce).
- [ ] A3. Copia lo zip del backup sulla chiavetta.
- [ ] A4. «Ricorda su questo PC» attivo: chiudi e riapri il hub, **non** chiede la passphrase.
- [ ] A5. In basso a sinistra c'è `v0.9.0` (o `run_windows.bat info` dice `DocMap Hub 0.9.0`).

## B. Cliente finto "Studio Prova" (20 min) — guida: `GUIDA-NUOVO-CLIENTE.md` §1-2

- [ ] B1. Dalla pagina del hub: **Nuovo cliente** → "Studio Prova", spunta **Sito online** e **Server in sede** → maschere → sito = il sottodominio di prova, staging = una sua sottocartella, dati FTP → **Conferma**. Annota quanti minuti ci hai messo: ____
- [ ] B2. Si apre la scheda con il **Percorso del cliente** («1 di N»). Il hub ha creato pacchetto per il PC e siti.
- [ ] B3. Prossimo passo **Pubblica** (FTPS): il piano mostra i file, conferma, finisce senza errori.
- [ ] B4. Prossimo passo **Configura il sito** → «Configura adesso»: finisce con «Sito configurato», i codici sono in Scheda → Accessi, **Scarica config.php** funziona. Nel File Manager di SiteGround il database sta in `docmap-data/<nome-del-sito>` **fuori** da `public_html`. `.../server-php/api.php?r=ping` mostra `"app_version":"26.12.7"`.
- [ ] B5. **Pubblica in produzione** + **Configura il sito** di produzione: percorso del sito completato senza copiare nessun codice a mano.
- [ ] B6. **Licenza sul sito subito**: Licenze → la licenza online → **Sospendi**: entro pochi secondi il hub dice «sola lettura» e nel sito compare l'avviso rosso (si legge e si esporta tutto, non si salva). **Riattiva**: torna «valida».
- [ ] B7. Deploy → **Siti da aggiornare** mostra i siti con versione vecchia (se ce ne sono) e li aggiorna in fila.

## C. Installazione in sede sul PC di prova (30 min) — guida: `installer-windows/GUIDA-INSTALLAZIONE.md` §4

- [ ] C1. Copia il pacchetto di "Studio Prova" sul PC di prova, doppio clic su `installa.bat`, accetta la richiesta di amministratore.
- [ ] C2. L'installazione finisce e scrive l'indirizzo `https://<ip-del-pc>:...`. Annota l'indirizzo: ________
- [ ] C3. Riavvia il PC di prova: DocMap riparte da solo (attività "DocMap Server").
- [ ] C4. Dal PC di Dave apri l'indirizzo: il browser chiede il certificato dello studio, si installa con la pagina del certificato, poi DocMap si apre **senza avviso rosso**.
- [ ] C5. La licenza è installata da sola: `powershell -ExecutionPolicy Bypass -File C:\DocMap\strumenti\licenza.ps1` mostra cliente, piano e scadenza.
- [ ] C6. Backup: lancia `backup.ps1` (o aspetta quello automatico), il file `.docmap-backup` è nella cartella backup. Stampa il **Kit di emergenza**.
- [ ] C7. Sincronizzazione sede ⇄ web: crea un faldone in sede, entro 10 minuti compare sul sito di prova (e viceversa).

## D. Telefoni (30 min) — guida: `CHECKLIST-COLLAUDO.md` §4

- [ ] D1. **Android**: inquadra un QR di prova, primo accesso con il codice del foglio. Chiudi Chrome, inquadra un altro QR: si apre **senza PIN**.
- [ ] D2. **iPhone**: lo stesso con Safari.
- [ ] D3. Dal telefono **Preso** su un faldone; sul PC, dopo la sincronizzazione, è in **Fuori archivio**; poi **Reinserito**.
- [ ] D4. Spegni i dati del telefono, segna uno stato, riaccendi: lo stato arriva al server.
- [ ] D5. (Facoltativo) **NFC** su Android: scrivi un tag e leggilo.
- [ ] D6. Il telefono in sede (stessa rete Wi-Fi del PC di prova) apre DocMap con il certificato dello studio.

## E. Stampa (30 min) — guida: `CHECKLIST-COLLAUDO.md` §1, `MANUALE-UTENTE.md` §19

- [ ] E1. Prova di calibrazione "quasi bianca" su un foglio normale, sovrapposta al foglio MRINK143 controluce: i bordi coincidono (±1 mm). Annota la correzione usata: ________
- [ ] E2. Un foglio MRINK143 con 8 etichette: testo leggibile, QR letti dal telefono, linee di taglio tenui.
- [ ] E3. **Scarica PDF** e stampalo da Acrobat al 100% (non "adatta alla pagina"): stesso risultato.
- [ ] E4. (Se hai un'etichettatrice) una sola etichetta dal formato giusto. Annota modello e formato: ________

## F. Aggiornamento e ripristino (20 min) — guida: `CHECKLIST-COLLAUDO.md` §7-8

- [ ] F1. Sul PC di Dave, con i dati veri della v10: segui `AGGIORNAMENTO-v10-v12.md`; dopo, stesso numero di faldoni e clienti.
- [ ] F2. Sul PC di prova: ripristina il backup `.docmap-backup` di C6 con `ripristina.ps1`: i faldoni ci sono.
- [ ] F3. Dal PC: **Verifica dopo l'aggiornamento** contro il sito di prova: tutte le righe verdi.
- [ ] F4. **Aggiornatore del PC** (app 26.12.6): metti lo zip nuovo in Download, doppio clic su `AGGIORNA-DOCMAP.bat`: chiede il backup, copia la versione vecchia in `DocMap-copie\`, riapre DocMap con la versione nuova e gli stessi dati. Poi `AGGIORNA-DOCMAP.bat ripristina` rimette la versione di prima.
- [ ] F5. **Primi passi** (app 26.12.6): in un browser nuovo (o in una finestra InPrivate) il riquadro nell'Archivio si spunta da solo man mano che fai i passi.

## Dopo il collaudo

Mandami le righe ❌ con le foto. Io correggo, aggiorno questa scheda e `STATO.md` (sezione 4), e ogni problema diventa
una voce della FAQ (`MANUALE-UTENTE.md`, aiuto in app «Risoluzione problemi»). Quando A–F sono tutte ✅ il cliente
finto si può cancellare dal hub e si passa al primo cliente vero.
