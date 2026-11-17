# DocMap · Inizia qui

Questo zip contiene **tutto DocMap**: il programma per il tuo PC (l'**hub**), l'app, il sito per l'hosting, il server
per il PC dell'ufficio del cliente (la **sede**), l'installatore per Windows e tutte le guide. Non serve scaricare
nient'altro.

> **In una frase.** Installi l'hub **solo sul tuo PC**. Dall'hub crei ogni cliente, metti online il suo sito con un
> clic e scarichi i pacchetti da installare sui PC del cliente. Il riferimento di ogni cliente è il **sito online**:
> PC e telefoni lavorano lì, anche se il PC dell'ufficio è spento.

## 1. Prima di tutto (2 minuti)

1. **Sblocca lo zip.** Tasto destro sullo zip › **Proprietà** › in basso spunta **Sblocca** › OK. Così Windows non
   blocca i file `.bat` dopo l'estrazione.
2. **Estrai tutto.** Tasto destro › **Estrai tutto…** › cartella **`C:\DocMapHub\`**. Non aprire i file da dentro lo
   zip e non spostare le sottocartelle: `hub`, `tools`, `server-php`, `server-python`, `installer-windows` devono
   restare una accanto all'altra.
3. **Python.** Serve Python **3.11 o più recente** (consigliato 3.13) da <https://www.python.org/downloads/>.
   Durante l'installazione spunta **«Add python.exe to PATH»**.

## 2. Avvia l'hub

Apri `C:\DocMapHub\DocMap-hub-<versione>\hub\` e fai doppio clic su **`run_windows.bat`**. La prima volta prepara
l'ambiente Python (qualche minuto), poi si apre il browser sulla pagina dell'hub. In basso a sinistra vedi la versione.

- **Prima volta in assoluto**: l'hub chiede una **passphrase**. Scrivila su carta e mettila in cassaforte: firma le
  licenze e apre la cassaforte dei codici.
- **Avevi già un hub**: i tuoi dati sono in `%APPDATA%\DocMapHub\` e restano lì. Il nuovo programma li usa da solo e
  non richiede la passphrase se avevi attivato «Ricorda su questo PC».
- Subito dopo: **Impostazioni › Backup › Fai un backup adesso**.

## 3. Il lavoro di tutti i giorni

| Cosa vuoi fare | Dove, nell'hub | Guida |
|---|---|---|
| Collegare l'hosting (una volta sola) | Impostazioni › **Hosting predefinito** | [Wiki](WIKI-HUB.md) §6.000 |
| Cliente nuovo, online in 5 clic | **Nuovo cliente** › modello › **Attiva tutto** › scarica il **kit** | [Wiki](WIKI-HUB.md) §6.000 |
| Installare il server nell'ufficio del cliente | Scheda del cliente › Postazioni › **Scarica il pacchetto della sede**, poi sul PC `INSTALLA-SENZA-DOMANDE.bat` | [Guida nuovo cliente](GUIDA-NUOVO-CLIENTE.md) §3 |
| Altri PC dell'ufficio | Scheda del cliente › Postazioni › una postazione per PC › scarica il pacchetto, sul PC `collega-questo-pc.bat` | Wiki §6.16 |
| Spostare un sito su un altro dominio o un'altra cartella | Clic sul sito › **Sposta il sito** | Wiki §6.17 |
| Ripartire da zero con un cliente | Scheda del cliente › **Elimina** (backup prima) | Wiki §6.15 |
| Rinnovare o sospendere una licenza | **Licenze** › clic sulla licenza | Wiki §6.7, §6.14 |
| Qualcosa non va | `hub\RACCOGLI-INFO.bat`, poi leggi le domande frequenti | [Domande frequenti](DOMANDE-FREQUENTI.md) |

## 4. Le guide (in `guide\`, si aprono con un doppio clic)

| File | Per |
|---|---|
| [`INIZIA-QUI.html`](INIZIA-QUI.md) | questa pagina |
| [`DOMANDE-FREQUENTI.html`](DOMANDE-FREQUENTI.md) | problemi comuni e come chiedere aiuto |
| [`WIKI-HUB.html`](WIKI-HUB.md) | tutte le funzioni dell'hub, passo per passo |
| [`GUIDA-NUOVO-CLIENTE.html`](GUIDA-NUOVO-CLIENTE.md) | il percorso completo di un cliente (hub, sito, sede, telefoni) |
| [`GUIDA-INSTALLAZIONE-SEDE.html`](../installer-windows/GUIDA-INSTALLAZIONE.md) | installazione sul PC dell'ufficio del cliente |
| [`GUIDA-SYNC-WEB-LOCALE.html`](../server-python/GUIDA-SYNC-WEB-LOCALE.md) | come il sito e il server dell'ufficio restano allineati |
| [`MANUALE-UTENTE.html`](MANUALE-UTENTE.md) | l'app DocMap per chi la usa in studio |
| [`COLLAUDO-REALE.html`](COLLAUDO-REALE.md) | la scheda delle prove sui dispositivi veri |
| `AGGIORNAMENTO-HUB.html` | cosa cambia in questa versione e come aggiornare |

Le stesse guide, in formato testo, sono in `docs\` (e `installer-windows\`, `server-python\`).

## 5. Cosa non si perde mai

- Ogni aggiornamento dell'hub sostituisce **solo il programma** (`C:\DocMapHub\…`). Chiavi, licenze, cassaforte e
  clienti restano in `%APPDATA%\DocMapHub\`.
- L'hub fa un backup ogni 24 ore e prima di ogni operazione rischiosa (eliminare un cliente, spostare un sito).
- Le etichette stampate puntano a `https://qr7.it/<codice>` e restano valide per sempre, anche se sposti il sito.

## 6. Controllo dello zip

`MANIFEST-SHA256.txt` elenca ogni file con la sua impronta. Lo zip è stato estratto e provato prima di essere
pubblicato: l'hub si avvia, trova `tools`, `server-php`, `server-python` e `installer-windows`.
