# Collaudo completo di Doc Location — da inizio a fine

> Per Dave. **Una sola scheda**, nell'ordine in cui le cose si fanno davvero: hub sul tuo PC → hosting → cliente
> finto → sito → etichette → telefoni → PC della sede → sincronizzazione → inventario → Strumenti → workstation e AI →
> licenze e marchio → aggiornamenti e ripristino. Valida per **hub 0.14.1, app 26.12.19, Strumenti 0.4.0, gateway
> workstation 0.1.1, strumenti di installazione 1.2.1** (zip `DocMap-hub-0.14.1-app-26.12.19-strumenti-0.4.0.zip`).
> Sostituisce la scheda vecchia a righe sparse: ogni passo dice tra parentesi la riga di prima (es. «ex B4»).

**Cosa è già stato provato prima di dartelo (2026-11-25, su Linux, non su Windows)**: zip estratto in una cartella
vuota, hub nuovo con passphrase, hosting finto con **Apache + PHP 8.3 + FTPS** come SiteGround, Prova del collegamento,
cliente «Studio grande · sede + online + demo» › **Attiva tutto** fino a «Tutto online e configurato», kit scaricato,
database fuori dalla cartella pubblica, `README-DEPLOY.md` vietato (403), primo accesso dal PC con il codice
dell'amministratore, import di 3 clienti finti con un faldone ciascuno, primo accesso da un telefono (Pixel 7 simulato)
dal QR `…/q/<codice>` con il codice della segreteria, «Preso» dal telefono visto dal PC, pacchetto della sede,
Strumenti con Tesseract (3 fatture TIFF → 3 cartelle per numero + Excel), gateway workstation con un Ollama finto e
profilo AI «workstation» provato dagli Strumenti. Più i 1.400 test automatici. **Mai provati**: Windows vero, SiteGround
vero, iPhone/Android veri, stampante, scansioni vere, Ollama vero con Inkling: per questo serve questa scheda.

## Come segnare i risultati

Per ogni passo metti ✅ o ❌. Per ogni ❌ manda nel thread **il numero del passo + una foto o uno screenshot** (es.
«4.3 ❌» + foto). Non serve spiegare. Se un passo si blocca, salta al blocco dopo: i blocchi sono indipendenti tranne
1-3 (servono a tutti). I tempi sono indicativi. I passi segnati *(facoltativo)* si possono rimandare.

## 0. Cosa preparare (prima, 15 min)

- [ ] **Il tuo PC Windows** (quello dell'hub) con Chrome o Edge e **Python 3.13** da <https://www.python.org/downloads/>
      (durante l'installazione spunta **«Add python.exe to PATH»**).
- [ ] Un **secondo PC Windows** di prova (va bene un portatile vecchio) per la «sede», stessa rete, con Python 3.13.
- [ ] Su SiteGround: il **dominio** dei siti (es. `https://docmap.pr-it.it/`) e un **account FTP** che veda la cartella
      del dominio. Dati: server FTP, utente, password. Una cartella di prova vuota va bene (`/collaudo/`).
- [ ] Un foglio **MRINK143** (A4, 4 etichette 105×148) e qualche foglio bianco; 2 scatole e una decina di faldoni veri.
- [ ] Un telefono **Android** con Chrome e un **iPhone** con Safari.
- [ ] Una **chiavetta USB** per i backup.
- [ ] *(facoltativo)* La workstation Kubuntu con Ollama, per il blocco 10.

## 1. Lo zip e l'hub sul tuo PC (15 min) — guida: `INIZIA-QUI.html`

- [ ] 1.1 Tasto destro sullo zip › Proprietà › spunta **Sblocca** › OK. Poi **Estrai tutto…** in `C:\DocMapHub\`.
      **Atteso**: c'è la cartella `C:\DocMapHub\DocMap-hub-0.14.1\` con dentro `hub`, `tools`, `server-php`,
      `server-python`, `installer-windows`, `strumenti`, `workstation`, `guide` e `INIZIA-QUI.html`.
- [ ] 1.2 Doppio clic su `INIZIA-QUI.html`. **Atteso**: pagina formattata (titoli, tabelle), in alto «Hub 0.14.1 · app
      26.12.19 · Strumenti 0.4.0 · gateway workstation 0.1.1»; i link alle guide si aprono.
- [ ] 1.3 Doppio clic su `hub\run_windows.bat` (ex A1). **Atteso**: la prima volta prepara Python per qualche minuto,
      poi si apre il browser su `http://127.0.0.1:47823/` (o la porta dopo) con «Prima configurazione».
- [ ] 1.4 Scegli la **passphrase** (almeno 12 caratteri), scrivila **su carta**, spunta «Ricorda su questo PC», **Crea e
      entra** (ex A2). **Atteso**: Panoramica «Buongiorno, ecco la situazione»; in basso a sinistra **v0.14.1**.
- [ ] 1.5 Impostazioni › Backup › seconda cartella = la chiavetta; **Fai un backup adesso** (ex A2-A3). **Atteso**:
      l'avviso «I backup dell'hub sono solo su questo PC» sparisce dalla Panoramica.
- [ ] 1.6 Chiudi la finestra nera e riapri `run_windows.bat` (ex A4). **Atteso**: entra senza chiedere la passphrase.
- [ ] 1.7 Impostazioni › **Controllo dell'hub** › «Controlla adesso» (ex F7). **Atteso**: nessuna riga rossa.

## 2. L'hosting, una volta sola (10 min) — guida: `WIKI-HUB.html` §6.000

- [ ] 2.1 Impostazioni › **Hosting predefinito** › Imposta adesso (ex C1): dominio, **FTPS**, server, utente, password
      FTP, cartella base (quella che l'FTP vede come cartella del dominio, di solito `/`) › Salva.
- [ ] 2.2 **Prova il collegamento** (nuovo nella 0.14.1). **Atteso**: «✓ Collegamento riuscito: nella cartella / ci sono
      N elementi». Se dice ✗: annota il messaggio (password, server, certificato) e correggi con Modifica.

## 3. Il cliente finto «Studio Collaudo», online in un clic (20 min) — guida: `GUIDA-NUOVO-CLIENTE.html`

- [ ] 3.1 Panoramica › **Nuovo cliente** › «Studio Collaudo», modello **«Studio grande · sede + online + demo»** ›
      **Crea il cliente** (ex B1, C2). **Atteso**: «Cliente creato» e l'elenco dei 5 passi.
- [ ] 3.2 **Attiva tutto** (ex B3-B5, C3). **Atteso**: in pochi minuti «Tutto online e configurato · 5 passi fatti».
      Su SiteGround (File Manager) ci sono le cartelle `studio-collaudo` e `studio-collaudo-demo`; il database sta in
      `docmap-data/…` **fuori** da `public_html`. Minuti: ____
- [ ] 3.3 **Scarica il kit di consegna** (ex C4, C7). **Atteso**: uno zip con `1-lettere-di-benvenuto.html` (una pagina
      per persona con indirizzo e codice), `2-scheda-tecnica.html`, `3-scheda-cliente.html`, `config/` con due
      `config.php`. Mettilo sulla chiavetta.
- [ ] 3.4 Nel browser: `https://<dominio>/studio-collaudo/server-php/api.php?r=ping` (ex B4). **Atteso**: testo che
      contiene `"app_version":"26.12.19"` e `"Licenza valida."`.
- [ ] 3.5 `https://<dominio>/studio-collaudo/README-DEPLOY.md` (ex H8). **Atteso**: «Forbidden» (403).
- [ ] 3.6 Nuovo cliente con lo **stesso nome** (ex C5). **Atteso**: l'hub propone `studio-collaudo-2`, mai lo stesso
      sito. Poi Scheda del cliente › **Elimina** questo secondo (ex H1): scrivi il nome, compare il backup, sparisce.

## 4. Il sito dal PC: primo accesso, clienti, etichette (30 min) — guida: `MANUALE-UTENTE.html`

- [ ] 4.1 Apri `https://<dominio>/studio-collaudo/` in Chrome. **Atteso**: «Primo accesso su questo dispositivo».
      Nome utente, PIN (due volte) e il **codice dell'amministratore** dalla lettera «titolare» del kit › Crea e accedi.
      **Atteso**: Archivio vuoto, in alto «Online · sincronizzato ora».
- [ ] 4.2 «Primi passi» › nome dello studio (ex F5). **Atteso**: il passo si spunta da solo.
- [ ] 4.3 **Importa** un CSV con 5-10 clienti finti nel formato del tuo elenco (`TIPO;Codice Multi;Ragione_soc;…`) ›
      Conferma abbinamento › spunta «Crea anche un faldone per ogni cliente» › Importa. **Atteso**: N clienti nuovi
      con Multi, luogo e categoria giusti; un faldone ciascuno; codici `dm26…` sotto «SHORT CODE».
- [ ] 4.4a ⚙ › **Esporta e Salva** › **Scarica manifest_qr7_dm26.csv** e aprilo con il Blocco note. **Atteso**: ogni
      riga ha `final_destination` = `https://<dominio>/studio-collaudo/q/dm26…` (l'indirizzo di **questo** sito, mai
      `…/studio-de/…`). Caricalo su qr7.it: senza questo passo i QR stampati non sanno dove andare (5.1).
- [ ] 4.4 Stampa Etichette › **Stampa Prova di Calibrazione (Quasi Bianca)** su carta normale, sovrapponila al foglio
      MRINK143 controluce (ex E1). **Atteso**: i bordi coincidono (±1 mm). Correzione usata: ____
- [ ] 4.5 Archivio › spunta 8 faldoni › Vai alla stampa › foglio MRINK143, «Etichetta informazioni» › stampa al 100%
      (ex E2). **Atteso**: 8 etichette leggibili, Multi grande, linee di taglio tenui; il telefono legge i QR.
- [ ] 4.6 **Scarica PDF** e stampalo da Acrobat al 100%, non «adatta alla pagina» (ex E3). **Atteso**: identico.
- [ ] 4.7 Tema scuro di Windows: l'app diventa scura, anteprima e stampa restano bianche; **Ctrl+K**, scrivi un codice,
      Invio: si apre il faldone (ex D13).
- [ ] 4.8 Prova lo stesso indirizzo con **Edge** (ex H7). **Atteso**: uguale a Chrome.

## 5. I telefoni (30 min) — guida: `MANUALE-UTENTE.html` › Telefono

- [ ] 5.1 **Android/Chrome**: inquadra un'etichetta stampata (ex D1). **Atteso**: si apre il sito sul faldone (dal QR
      `qr7.it/<codice>`, grazie al manifest di 4.4a; se qr7.it non è ancora aggiornato apri a mano
      `https://<dominio>/studio-collaudo/q/<codice>`) con «Primo accesso su questo telefono»: nome, PIN, il codice della **segreteria** dal kit ›
      Crea e accedi › la scheda del faldone con Multi e ragione sociale.
- [ ] 5.2 Chiudi Chrome, inquadra un **altro** QR. **Atteso**: entra **senza PIN** («Ricordami»).
- [ ] 5.3 **Preso** sul faldone (ex D3). Sul PC, Archivio (aspetta la sincronizzazione, pochi secondi). **Atteso**:
      «Prelevati» = 1 e il faldone in «Fuori archivio»; dal telefono **Reinserito** → torna a 0.
- [ ] 5.4 **iPhone/Safari**: 5.1-5.3 di nuovo (ex D2, H7).
- [ ] 5.5 Dati del telefono spenti, segna «Preso», riaccendi (ex D4). **Atteso**: lo stato arriva al PC da solo.
- [ ] 5.6 Menu ⋮ › **Installa app** (Android) / Condividi › **Aggiungi alla schermata Home** (iPhone) (ex D10).
      **Atteso**: icona Doc Location, si apre senza barra del browser. In modalità aereo la pagina si apre con l'avviso
      «senza rete» (ex D11).
- [ ] 5.7 Il codice della lettera «collaboratori» (sola lettura): primo accesso su un altro telefono. **Atteso**: vede il
      faldone ma non ha i pulsanti per cambiarlo.
- [ ] 5.8 *(facoltativo)* NFC su Android: scrivi un tag e leggilo (ex D5). Faldone smarrito: Impostazioni › Faldone
      smarrito con un numero, poi un telefono **senza accesso** inquadra un QR: vede solo il contatto, nessun nome di
      cliente (ex D16).

## 6. Il PC della sede e la sincronizzazione (40 min) — guida: `GUIDA-INSTALLAZIONE-SEDE.html`

- [ ] 6.1 Hub › Studio Collaudo › **Postazioni** › **Scarica il pacchetto della sede**, copialo sul PC di prova ed
      estrailo (ex H2, C1-sede).
- [ ] 6.2 Doppio clic su `INSTALLA-SENZA-DOMANDE.bat`, accetta la richiesta di amministratore. **Atteso**: nessuna
      domanda; alla fine scrive l'indirizzo `https://<ip-del-pc>:8443/` (annotalo: ______); licenza **VALIDA**; ponte
      attivo; il file `cliente\token-ponte.txt` non c'è più. Minuti: ____
- [ ] 6.3 Nell'hub, scheda del cliente: scrivi quell'indirizzo nel passo «Doc Location installato sul PC dello studio»
      › Controlla. **Atteso**: il percorso del cliente arriva a «9 di 9».
- [ ] 6.4 Riavvia il PC di prova (ex C3-sede). **Atteso**: Doc Location riparte da solo.
- [ ] 6.5 Dal tuo PC apri l'indirizzo della sede (ex C4-sede). **Atteso**: il browser chiede il certificato dello
      studio; con la pagina del certificato si installa e poi niente avviso rosso.
- [ ] 6.6 `powershell -ExecutionPolicy Bypass -File C:\DocMap\strumenti\licenza.ps1` sul PC di prova (ex C5-sede).
      **Atteso**: cliente, piano Studio Pro, scadenza.
- [ ] 6.7 Crea un faldone in sede; entro 10 minuti c'è sul sito online, e viceversa (ex C7-sede). Spegni la sede,
      lavora sul sito, riaccendi: entro 10 minuti la sede ha i faldoni nuovi (ex H3).
- [ ] 6.8 `backup.ps1` sul PC di prova: c'è un file `.docmap-backup`; stampa il **Kit di emergenza** (ex C6-sede).
- [ ] 6.9 Il telefono collegato al Wi-Fi della sede apre l'indirizzo della sede con il certificato (ex D6).

## 7. Inventario rapido di un archivio (40 min) — guida: `MANUALE-UTENTE.html` › Progetti

- [ ] 7.1 PC › **Progetti** › Nuovo progetto, 2 scatole e 20 faldoni › stampa (ex D7). Attacca le etichette a 2 scatole
      e 10 faldoni veri.
- [ ] 7.2 Telefono › **Apri sul telefono** › scansiona la scatola, poi i faldoni uno dopo l'altro. **Atteso**: beep e
      foto a ogni faldone. Secondi per 10 faldoni: ______ (obiettivo: sotto 5 s l'uno).
- [ ] 7.3 Dati spenti a metà, continua, riaccendi (ex D8, D31). **Atteso**: la coda si svuota da sola entro un minuto;
      sul PC la revisione ha tutti i faldoni con le foto.
- [ ] 7.4 Sul PC **In diretta** mentre l'altra persona scansiona (ex D25). **Atteso**: i faldoni compaiono in pochi
      secondi con la foto.
- [ ] 7.5 Verifica di una scatola: togli un faldone, mettine uno di un'altra scatola › **Verifica una scatola** (ex
      D26). **Atteso**: mancante e fuori posto giusti.
- [ ] 7.6 **Report di fine lavoro** con i prezzi del tuo preventivo › Stampa e Scarica CSV (ex D28). **Atteso**: numeri,
      totale e IVA giusti; il CSV si apre in Excel con le colonne separate.
- [ ] 7.7 *(facoltativo)* Raffica su Android (ex D34), stazione fissa (ex D23), lettore Bluetooth (ex D24), livello
      scatola (ex D36), faldoni senza etichetta (ex D37), foto della scatola aperta (ex D38), etichette FUORI e DENTRO
      con codice grande (ex D39), documenti nel faldone (ex D27), stima di un lavoro (ex D33), copia di sicurezza dal
      telefono (ex D32), obiettivo e ora di fine (ex D35).

## 8. Il lavoro di tutti i giorni (30 min, facoltativo il primo giorno)

- [ ] 8.1 Prelievo per «Verifica fiscale» di un cliente con 5-10 faldoni (ex D14): il percorso segue gli scaffali?
      Spunta col telefono; un faldone di un altro cliente risulta «in più».
- [ ] 8.2 **Consegna con firma** dal telefono, ricevuta scaricata; sul PC «Firma e ricevuta integre» (ex D15).
- [ ] 8.3 Promemoria di un faldone in ritardo: E-mail e WhatsApp con il testo pronto (ex D18).
- [ ] 8.4 **Nuovo anno** su una copia dei dati: un faldone nuovo per ogni faldone dell'anno scorso, poi **Annulla** (ex D19).
- [ ] 8.5 **Dove lo metto?** propone lo scaffale giusto (ex D20). **Scarto**: proposta e verbale stampato leggibile (ex D21; mai «Segna come distrutti» sui dati veri).
- [ ] 8.6 **Ricerca a voce**: «trovami le fatture di [cliente] del 2024» su PC e telefono (ex D22). Tempi misurati › Copia i tempi e incollali nel thread (ex D12).

## 9. Strumenti: ricette per i documenti (30 min) — guida: `STRUMENTI.html`

- [ ] 9.1 Installa **Tesseract** per Windows (UB Mannheim) con l'**italiano** (ex S2).
- [ ] 9.2 Doppio clic su `strumenti\AVVIA-STRUMENTI.bat` (ex S1). **Atteso**: la prima volta installa, poi il browser
      su `http://127.0.0.1:8091/` con le Ricette. Impostazioni › Lettura trova Tesseract con `ita`.
- [ ] 9.3 Copia 20-50 fatture TIFF vere in una cartella di prova › ricetta **«Fatture TIFF in una cartella per numero»**
      › Prova su una, poi Esegui (ex S3). **Atteso**: una cartella per numero, un Excel, i dubbi in Verifica. Da
      correggere: ____
- [ ] 9.4 **Verifica** solo da tastiera (`↓`, `Invio`, `E`, `U`) (ex S4). Secondi a documento: ____
- [ ] 9.5 «PDF scansionato in fatture» su un PDF vero di più fatture (ex S5). **Atteso**: una fattura per PDF.
- [ ] 9.6 Nell'app (sito o PC, come amministratore) ⚙ › **Strumenti** (ex S7): con gli Strumenti spenti spiega come
      avviarli; avviati dice la versione 0.4.0; incolla il collegamento con la chiave: compaiono i lavori da verificare.
- [ ] 9.7 *(facoltativo)* Licenza negli Strumenti (ex S8), server remoto e gettone dall'hub (ex S6, S9, S10).

## 10. Workstation e AI (45 min, facoltativo) — guida: `WORKSTATION-INSTALLAZIONE.html`, `AI-FORNITORI.html`

- [ ] 10.1 Sulla Kubuntu: Inkling 2 Mini in Ollama, poi copia la cartella `workstation` e
      `cp workstation.esempio.json workstation.json` (ex S11). In `workstation.json` metti in `models` il nome che
      Ollama usa per Inkling. `python3 -m docmap_workstation controlla`. **Atteso**: «OK ollama … inkling-2-mini» (vLLM
      nell'esempio è spento: nessuna riga rossa) e la GPU.
- [ ] 10.2 `python3 -m docmap_workstation token-nuovo --nome strumenti-studio` e copia il gettone; avvia il gateway
      (`serve` o il servizio systemd della guida).
- [ ] 10.3 Strumenti › Impostazioni › **Workstation**: indirizzo `http://<ip-kubuntu>:8095` e gettone › Controlla
      adesso (ex S12). **Atteso**: ok, modello `inkling-2-mini`, coda.
- [ ] 10.4 Impostazioni › AI › profilo `ocr` = Le mie workstation, `inkling-2-mini`, riserva `predefinito` › **Prova**
      (ex S13). **Atteso**: risponde la workstation. Spegni il gateway e riprova: risponde la riserva.
- [ ] 10.5 Ricetta con OCR «modello AI» su 20 scansioni vere (ex S14): testo giusto? secondi a pagina ____; confronto
      con Tesseract: `python -m docmap_strumenti ai confronta …` (ex S18), manda `risultati.csv`.
- [ ] 10.6 Profilo **cascata** e **confronto** (ex S16, S17); chiavi vere OpenAI/Gemini/Claude se le hai (ex S15).
- [ ] 10.7 AI nell'app per i dorsi (ex D9, D29, D30, D40-D42) solo dopo l'ok del legale sulle bozze `docs/commerciale/`.

## 11. Licenze e marchio (20 min) — guida: `WIKI-HUB.html` §6.7, `MARCHIO.html`

- [ ] 11.1 Hub › Licenze › la licenza online di Studio Collaudo › **Sospendi** (ex B6). **Atteso**: entro pochi secondi
      il sito mostra l'avviso rosso, si legge e si esporta, non si salva. **Riattiva**: torna normale.
- [ ] 11.2 Cliente › **Marchio e prezzo** › nome «Archivio Prova», sigla AP, un colore › Siti da aggiornare (ex G3).
      **Atteso**: il sito mostra solo «Archivio Prova». Preventivo Studio Pro −10% = 80,10 €/mese, poi **Azzera** (ex G4).
- [ ] 11.3 Clienti › **Situazione (Excel)** (ex F9). **Atteso**: si apre in Excel, colonne separate, accenti giusti.

## 12. Aggiornare e ripristinare (30 min) — guida: `AGGIORNAMENTO-HUB.html`

- [ ] 12.1 **Aggiornatore del PC**: metti lo zip nuovo in Download, doppio clic su `AGGIORNA-DOCMAP.bat` (ex F4).
      **Atteso**: chiede il backup, mette la versione vecchia in `DocMap-copie\`, riapre con gli stessi dati.
      `AGGIORNA-DOCMAP.bat ripristina` rimette quella di prima.
- [ ] 12.2 Con i **dati veri** della v10 (su una copia): `AGGIORNAMENTO-v10-v12.md`, poi stessi faldoni e clienti (ex F1, G1).
- [ ] 12.3 **Verifica dopo l'aggiornamento** dal PC contro il sito di prova (ex F3). **Atteso**: tutte righe verdi.
- [ ] 12.4 Hub: chiudi la pagina, `hub\RIPRISTINA-BACKUP.bat`, il backup più recente, scrivi `SI` (ex F8).
      **Atteso**: «Fatto», cartella `prima-del-ripristino-…`, riaprendo clienti e licenze ci sono.
- [ ] 12.5 Sede: `ripristina.ps1` con il backup di 6.8 (ex F2). **Atteso**: i faldoni ci sono.
- [ ] 12.6 *(facoltativo)* **Sposta il sito** in un'altra cartella (ex H4-H6): i QR vecchi arrivano al nuovo indirizzo.

## Dopo il collaudo

Mandami le righe ❌ con le foto (anche tutte insieme). Io correggo, aggiorno questa scheda e `STATO.md`, e ogni problema
diventa una voce delle domande frequenti. Quando i blocchi 1-6 sono tutti ✅, Studio Collaudo si può eliminare dall'hub
(scheda del cliente › Elimina) e si passa al primo cliente vero.

## Appendice: dalle righe vecchie ai passi nuovi

| Righe vecchie | Passi |
|---|---|
| A1-A5 (hub) | 1.3-1.7 |
| B1-B7, C1-C7 (cliente, Attiva tutto, kit) | 2.1-3.6 |
| H1-H8 (elimina, sede, sposta, telefoni, 403) | 3.5, 3.6, 5.4, 6.1-6.7, 12.6 |
| C1-C7 della sede (installazione) | 6.1-6.8 |
| D1-D6, D10-D13, D16 (telefoni) | 4.7, 5.1-5.8, 6.9 |
| D7-D9, D23-D39 (inventario) | 7.1-7.7, 10.7 |
| D14-D22 (lavoro di tutti i giorni) | 8.1-8.6 |
| D29, D30, D40-D42 (AI nell'app) | 10.7 |
| E1-E4 (stampa) | 4.4-4.6 (E4 etichettatrice: facoltativa) |
| F1-F9 (aggiornamento e ripristino) | 1.7, 4.2, 11.3, 12.1-12.5 |
| G1-G5 (marchio) | 11.2, 12.2 (G2 e G5: facoltativi) |
| S1-S18 (Strumenti, workstation) | 9.1-10.6 |
