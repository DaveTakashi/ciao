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

**Hub 0.10 (modelli, hosting predefinito, Attiva tutto, kit)**

- [ ] C1. Impostazioni → **Hosting predefinito** con il vero account FTP di docmap.pr-it.it (FTPS, cartella `/`). Esito: ____
- [ ] C2. **Nuovo cliente** "Studio Prova Modello" con «Commercialista · online con demo» → **Crea il cliente**: indirizzi `docmap.pr-it.it/studio-prova-modello/` e `…-demo/`.
- [ ] C3. **Attiva tutto**: la cartella del cliente viene **creata dall'FTP** su SiteGround, demo e sito rispondono, percorso «6 di 6». Minuti: ____
- [ ] C4. **Kit di consegna**: apri `1-lettere-di-benvenuto.html`, stampa una pagina; con quel codice fai il primo accesso da un telefono.
- [ ] C5. Rifai «Nuovo cliente» con lo stesso nome: l'hub propone `…-2` (mai lo stesso sito).
- [ ] C6. «Salva come nuovo modello» dalle maschere e crea un cliente con quel modello.
- [ ] C7. Scheda del cliente → **Kit di consegna**: nel kit ci sono le due copie di config.php riprese da SiteGround.

**Hub 0.11 (elimina cliente, pacchetto pronto, più PC, sposta il sito)**

- [ ] H1. Scheda di un cliente di prova → **Elimina**: scrivi il nome, compare il nome del backup; il cliente sparisce, il sito online risponde ancora.
- [ ] H2. Cliente con sede e online → Postazioni → **Scarica il pacchetto della sede** → sul PC di prova `INSTALLA-SENZA-DOMANDE.bat`: nessuna domanda, licenza VALIDA, ponte attivo, `cliente\token-ponte.txt` non c'è più. Minuti: ____
- [ ] H3. Pacchetto di una postazione su un **secondo PC**: «DocMap - <studio>» apre il sito online; con il PC della sede **spento** si lavora lo stesso; riacceso, entro 10 minuti la sede ha i faldoni nuovi.
- [ ] H4. Sito → **Sposta il sito** verso `https://docmap.pr-it.it/prova/trasloco/`: faldoni presenti sul nuovo, il vecchio indirizzo (anche `…/q/<codice>`) rimanda al nuovo, kit con codici nuovi. Esito: ____
- [ ] H5. Dopo H4, sul PC della sede: `aggiorna-ponte\AGGIORNA-PONTE.bat` dal kit; un faldone nuovo in sede arriva sul nuovo indirizzo.

**Hub 0.11.1 (double check finale)**

- [ ] H6. Sposta un sito di prova **dentro la sua stessa cartella** (es. `…/prova/` → `…/prova/2026/`): il sito nuovo si apre (niente «troppi reindirizzamenti»), un QR stampato col vecchio indirizzo arriva al nuovo.
- [ ] H7. Su **iPhone con Safari** e su **Android con Chrome**: scansiona un'etichetta, primo accesso, scheda del faldone, «Preso» e ritorno. Su Windows prova anche con **Edge**.
- [ ] H8. Apri `https://<sito>/README-DEPLOY.md` nel browser: deve dire «Forbidden» (403).

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
- [ ] D7. **Inventario rapido** (app 26.12.8): sul PC Progetti › Nuovo progetto, genera 2 scatole e 20 faldoni, stampa. Attacca le etichette a 2 scatole e 10 faldoni veri. Dal telefono **Apri sul telefono** → scansiona la scatola, poi i faldoni uno dopo l'altro: beep e foto a ogni faldone, sotto i 5 secondi l'uno. Cronometra 10 faldoni: ______ s.
- [ ] D8. Inventario senza rete: spegni i dati a metà, continua a scansionare, riaccendi: «Tutto inviato» e sul PC la griglia di revisione ha tutti i faldoni con le foto.
- [ ] D9. (Solo con la chiave AI nel server) dorsi scritti a mano e a stampa: annota quante proposte sono giuste su 10: ______. Microfono: «fatture acquisti 2019» compila contenuto, tag e anno.
- [ ] D10. **App installabile** (app 26.12.9): Android/Chrome apri il sito → menu ⋮ › **Installa app**; iPhone/Safari → Condividi › **Aggiungi alla schermata Home**. Compare l'icona DocMap; aprendola, niente barra del browser. Sul PC (Chrome/Edge) l'icona ⊕ nella barra degli indirizzi installa il programma completo.
- [ ] D11. **Senza rete**: modalità aereo, apri l'icona: la pagina si apre (i dati del server, ovviamente, no: compare l'avviso). Riattiva la rete, riapri: tutto normale.
- [ ] D12. **Tempi misurati**: sul telefono cerca 10 faldoni (Cerca → apri) e cataloga 10 faldoni in un inventario; poi sotto la casella del codice **Tempi misurati › Copia i tempi** e incolla il testo nel messaggio a Claude. Obiettivo: trovare ≤ 15 s, catalogare ≤ 7 s (mediana).
- [ ] D13. **Tema scuro e Ctrl+K**: metti il telefono e Windows in tema scuro: DocMap diventa scuro, ma l'anteprima delle etichette e la stampa restano bianche. Sul PC premi Ctrl+K, scrivi un codice e premi Invio: si apre il faldone.
- [ ] D14. **Prelievo col telefono** (app 26.12.10): sul PC ⚙ › Lavoro › Prelievi e consegne › Nuovo prelievo, motivo «Verifica fiscale», un cliente con 5-10 faldoni: il percorso segue davvero gli scaffali? Annota le tappe sbagliate: ______. **Spunta col telefono**: inquadra il QR, accedi, scansiona i faldoni nel giro; uno di un altro cliente risulta «in più».
- [ ] D15. **Consegna firmata dal telefono**: a fine giro «Consegna con firma», firma col dito, scarica la ricevuta. Sul PC, dopo la sincronizzazione, la consegna compare nei prelievi e «Ricevuta» dice **Firma e ricevuta integre**. Ripeti con i dati spenti: tutto parte quando li riaccendi.
- [ ] D16. **Faldone smarrito**: sul PC Impostazioni › Faldone smarrito, metti un numero e attivalo, sincronizza. Da un telefono **di un'altra persona** (senza DocMap) inquadra un'etichetta: vede solo il contatto e i pulsanti; Chiama/WhatsApp partono col codice nel messaggio; nessun nome di cliente sullo schermo.
- [ ] D17. **Andamento e previsioni** dopo qualche settimana d'uso: i numeri del tempo risparmiato vi sembrano credibili con i vostri minuti? Annota i valori usati: ______.
- [ ] D18. **Promemoria**: con un faldone uscito con data di rientro passata, aprite Promemoria, scrivete l'e-mail e il telefono di chi lo ha, premete **E-mail** e **WhatsApp** dal PC: si aprono il programma di posta e WhatsApp col testo pronto? ______.
- [ ] D19. **Nuovo anno in un clic** (app 26.12.11): con una **copia** dei dati veri (o il cliente finto), ⚙ › Lavoro › Nuovo anno: l'elenco ha un faldone nuovo per ogni faldone dell'anno scorso? Titoli e anni giusti? Annota i casi sbagliati (titoli strani, clienti doppi): ______. Crea, stampa solo le nuove etichette su MRINK143, poi **Annulla**: tutto torna come prima.
- [ ] D20. **Dove lo metto?**: apri un faldone nuovo di un cliente che ha già faldoni: il primo posto proposto è quello giusto sullo scaffale vero? Con la capienza scritta in Impostazioni, un ripiano pieno lascia il posto a quello accanto? ______.
- [ ] D21. **Scarto**: ⚙ › Lavoro › Scarto, controllate le Regole con il commercialista o il consulente; la proposta 2026 vi sembra corretta? **Prepara il verbale**, stampatelo su carta: è leggibile e firmabile? (Non premete «Segna come distrutti» sui dati veri finché la distruzione non è avvenuta davvero.) ______.
- [ ] D22. **Ricerca a voce**: su PC con Chrome o Edge (microfono acceso) e sul telefono, dite «trovami le fatture di [cliente vero] del 2024»: trova il faldone? Provate un codice scandito («codice B L tre»). Annota le frasi non capite: ______.
- [ ] D23. **Stazione fissa** (app 26.12.13): progetto di prova in modalità *Stazione fissa*, telefono su un supporto (o appoggiato a una pila di libri) con la fotocamera accesa; passate 20 faldoni davanti alla fotocamera uno dopo l'altro. Secondi a faldone ______; faldoni letti due volte o saltati ______; la conferma grande si vede da 1 metro? ______.
- [ ] D24. **Lettore Bluetooth** (se ne avete uno o lo prendete in prova): collegatelo al telefono come tastiera, aprite il progetto e leggete 10 etichette senza toccare lo schermo. Tutte acquisite? ______. Stessa prova collegato al PC.
- [ ] D25. **Catena a due**: una persona scansiona con il telefono, l'altra al PC apre il progetto e preme **In diretta**: i faldoni compaiono entro pochi secondi con la foto? Correggete e confermate due faldoni mentre l'altra continua. ______.
- [ ] D26. **Verifica di una scatola**: dopo aver acquisito una scatola, togliete un faldone e mettetene uno di un'altra scatola; **Verifica una scatola** sul telefono: mancante e fuori posto giusti? **Sposta qui** funziona? La verifica compare nel PC (scheda Verifiche)? ______.
- [ ] D27. **Documenti**: progetto con *Livello documento*, generate e stampate un lotto *Documenti*; scansionate un faldone e 3 documenti dentro, poi un altro faldone. I documenti risultano nel faldone giusto? Su una costa vuota provate **Foto della prima pagina**. ______.
- [ ] D28. **Report di fine lavoro**: scrivete i prezzi del vostro preventivo nel progetto, aprite **Report di fine lavoro**, **Stampa** su carta e **Scarica CSV** in Excel: numeri, totale e IVA giusti, colonne leggibili? ______.
- [ ] D29. **AI locale** (facoltativa, PC con almeno 16 GB di RAM): installate Ollama da ollama.com, nel Prompt dei comandi `ollama pull qwen2.5vl:7b`; in Impostazioni › Inventario accendete il modello locale e premete **Prova**; poi nella revisione **Leggi con l'AI** su 10 faldoni fotografati. Secondi a foto ______; letture giuste ______ su 10.
- [ ] D30. **AI con una chiave vera** (solo dopo l'ok del legale sulle bozze in `docs/commerciale/`): nel `config.php` di prova `ai_provider` `anthropic` (o `openai_compatible`) con la chiave; acquisite 20 faldoni veri dal telefono: letture giuste ______ su 20, proposte «sicure» sbagliate ______, costo indicato dal fornitore ______.
- [ ] D31. **Rete che va e viene** (v12.14): sul telefono, inventario in corso, spegnete il Wi-Fi e i dati e scansionate 5 faldoni; la riga della coda dice «in attesa di rete». Riaccendete la rete: entro un minuto la coda si svuota da sola, senza toccare ↻. Sul PC i 5 faldoni ci sono tutti.
- [ ] D32. **Copia di sicurezza** (v12.14): senza rete scansionate 3 faldoni, toccate la riga della coda › **Salva copia di sicurezza** e mandate il file al PC (mail o cavo). Sul PC: progetto › Lavoro › **Importa dal telefono**: i 3 faldoni compaiono con la foto. Importate di nuovo lo stesso file: nessun doppione.
- [ ] D33. **Stima un lavoro** (v12.14): sul PC, Progetti › **Stima un lavoro**, scrivete i metri di uno scaffale vero; confrontate faldoni stimati e contati a mano, poi **Crea il progetto con questi numeri** e controllate le etichette proposte.
- [ ] D34. **Raffica** (v12.15, telefono Android con Chrome): accendete «Raffica» sotto i tag, aprite una scatola con 10 faldoni etichettati e inquadrate la fila di coste. Contate quanti faldoni entrano in una passata, quanti secondi servono per la scatola intera e se le foto mostrano la costa giusta di ogni faldone. Su iPhone deve dire che la raffica legge un codice alla volta.
- [ ] D35. **Obiettivo e ora di fine** (v12.15): progetto con i faldoni previsti; dopo 20 faldoni il telefono mostra quanto manca e l'ora di fine. Confrontate l'ora prevista con quella vera a fine giornata; nella scheda Lavoro del PC la stessa percentuale.
- [ ] D36. **Livello scatola** (v12.16): progetto con «Faldoni: nessuno»; per 5 scatole vere scansionate l'etichetta, scrivete quanti faldoni contengono, toccate 2 anni e un tag, scrivete una nota. Sul PC (scheda Lavoro › Scatole) i numeri, gli anni e le note sono giusti; il report fattura i faldoni contati. Quanti secondi a scatola?
- [ ] D37. **Faldoni senza etichetta** (v12.16): progetto con «Faldoni: alcuni»; in una scatola scansionate 3 faldoni etichettati e aggiungete 3 «Faldone senza etichetta» con la foto della costa. Sul PC ci sono 6 faldoni nella scatola, i 3 senza etichetta con la foto e la lettura AI.
- [ ] D38. **Foto della scatola aperta** (v12.16, Android con Chrome): scatola aperta con 6-8 faldoni etichettati, una sola foto. Quante etichette riconosce? I faldoni non ancora acquisiti compaiono subito, ognuno con la sua costa?
- [ ] D40. **Campi da controllare** (v12.17, con l'AI vera): leggete 20 coste vere; nella revisione guardate i campi in giallo. Erano davvero quelli sbagliati? Annotate quanti campi gialli erano giusti e quanti campi sbagliati non erano gialli.
- [ ] D41. **Vocabolario dei tag** (v12.17): nel progetto › Strumenti scrivete 5 tag con i sinonimi che usate davvero (es. «IVA = imposta valore aggiunto, liquidazioni»); dettate a voce un sinonimo e leggete con l'AI 10 coste: i tag finiscono su quello giusto? Dopo 30 faldoni guardate i **tag suggeriti**: hanno senso? C'è mai un nome di persona?
- [ ] D42. **Banco di prova** (v12.17): con almeno 20 faldoni confermati, avviate la prova con l'AI del server e (se c'è) con il modello locale; confrontate le due righe della tabella (giusti per campo, secondi, affidabilità) e scrivete quale userete.
- [ ] D39. **Etichette FUORI e DENTRO, codice grande** (v12.16): stampate un lotto di scatole con «Due etichette» e codice leggibile grande; incollate fuori e dentro. Si legge il numero da 2 metri? Il telefono riconosce entrambe come la stessa scatola?
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
- [ ] F6. **Hub 0.12, primo avvio**: avvia la cartella nuova; Panoramica dice «Hub aggiornato alla 0.12.0» e in Impostazioni › Backup c'è un backup «prima di una nuova versione».
- [ ] F7. Impostazioni › **Controllo dell'hub** › «Controlla adesso»: nessuna riga rossa; **Verifica** su un backup dice «Si può ripristinare».
- [ ] F8. Chiudi la pagina dell'hub, doppio clic su `hub\RIPRISTINA-BACKUP.bat`, scegli il backup più recente, scrivi `SI`: finisce con «Fatto»; in `%APPDATA%\DocMapHub\backups\` c'è la cartella `prima-del-ripristino-…`; riapri l'hub: clienti e licenze ci sono, stessa passphrase.
- [ ] F9. Clienti › **Situazione (Excel)**: il file si apre con un doppio clic in Excel, colonne separate, accenti giusti.

## G. Nome e marchio (15 min, app 26.12.12 + hub 0.13) — guida: `MARCHIO.md`

- [ ] G1. Dopo l'aggiornamento il PC mostra **Doc Location** (in alto, accesso, scheda del browser) e i dati sono tutti lì; un backup vecchio `DocMap_…json` si ripristina.
- [ ] G2. Sul telefono (sito online aggiornato con «Siti da aggiornare»): la pagina e l'app installata si chiamano Doc Location dopo una riapertura con la rete; i QR già stampati si aprono come prima.
- [ ] G3. Hub: un cliente di prova › **Marchio e prezzo** › Modifica, nome «Archivio Prova», sigla AP, un colore; «Siti da aggiornare» › aggiorna il sito di prova: il sito mostra solo «Archivio Prova» (nessun Doc Location), con quel colore.
- [ ] G4. Stesso cliente: preventivo Studio Pro con sconto 10%: la scheda dice 80,10 €/mese. Poi **Azzera**: torna al listino.
- [ ] G5. `python tools\brand.py imposta --nome "Prova Nome"` in una **copia** della cartella del programma, poi apri `index.html` della copia: si chiama «Prova Nome». (Non farlo nella cartella vera.)

## S. Strumenti (30 min, Strumenti 0.1.0) — guida: `STRUMENTI.md`

- [ ] S1. Doppio clic su `strumenti\AVVIA-STRUMENTI.bat`: la prima volta installa, poi si apre il browser con le Ricette.
- [ ] S2. Installa Tesseract (UB Mannheim, con l'italiano): Impostazioni › Lettura lo trova; **Prova** di «Fatture TIFF in una cartella per numero» su una fattura vera: il numero è giusto.
- [ ] S3. **Esegui** la stessa ricetta su una cartella di 20–50 fatture vere (una copia): le cartelle per numero sono giuste, i dubbi sono in Verifica. Annota quante erano da correggere: ____
- [ ] S4. **Verifica** solo con la tastiera (`↓`, `Invio`, `E`, `U`): tempo medio per documento ____ s; «Riprendi» completa il lavoro e il report Excel si apre.
- [ ] S5. «PDF scansionato in fatture» su un PDF vero di molte fatture: ogni fattura è un PDF a sé.
- [ ] S6. Sul server di Dave: `serve --remote` con HTTPS e un gettone; dal PC, Impostazioni › Esecuzione remota › Prova, poi un lavoro «sul server»: i risultati tornano nella cartella di arrivo.

## Dopo il collaudo

Mandami le righe ❌ con le foto. Io correggo, aggiorno questa scheda e `STATO.md` (sezione 4), e ogni problema diventa
una voce della FAQ (`MANUALE-UTENTE.md`, aiuto in app «Risoluzione problemi»). Quando A–F sono tutte ✅ il cliente
finto si può cancellare dal hub e si passa al primo cliente vero.
