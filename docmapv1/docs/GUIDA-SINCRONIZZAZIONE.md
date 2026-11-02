# Guida alla sincronizzazione: PC locale ⇄ web app ⇄ telefoni

> Versione 26.12.2. Per chi usa DocMap ogni giorno. Spiega **quale** sincronizzazione usare e i passi in **entrambi i
> sensi**. Dettagli tecnici: [`SYNC.md`](SYNC.md) e [`API-CONTRACT.md`](API-CONTRACT.md).

## 1. Le tre "copie" dell'archivio

| Dove | Cos'è | Dove stanno i dati |
|---|---|---|
| **PC locale** | `C:\DocMap\docmapv1\index.html` aperto con doppio clic (`file://`) | nel browser di quel PC (Chrome/Edge) |
| **Web app** | `https://docmap.pr-it.it/studio-de/` aperta nel browser | sul **server** (database online cifrato) + una copia cifrata nel browser per lavorare anche senza rete |
| **Telefono** | la pagina che si apre inquadrando un QR | sul server; il telefono tiene una copia cifrata per la ricerca senza rete |

Le tre copie restano allineate in due modi. **Usa il primo** se hai il server online; il secondo serve solo a chi non ce l'ha.

## 2. Modo consigliato: il database online (server)

Il server è il punto d'incontro: PC locale, web app e telefoni mandano lì le modifiche e prendono quelle degli altri.
Vince la modifica più recente di ogni faldone; i casi dubbi (stesso faldone cambiato da due parti) li decidi tu.
Ogni sincronizzazione finisce nel **Registro sincronizzazioni** (chi, quando, cosa), utile in caso di contestazioni.

### 2.1 Una volta sola: collegare il PC locale al server

1. Sul PC apri DocMap › **Sincronizzazione**. In cima c'è il riquadro **Server online**.
2. **Indirizzo del server**: `https://docmap.pr-it.it/studio-de/server-php/api.php`.
3. **Codice di accesso (token)**: quello **admin** che `setup.php` ti ha mostrato (o uno creato da ⚙ Sincronizzazione ›
   **Codici di accesso**). Un codice per persona o dispositivo: così sai chi ha fatto cosa e puoi revocarlo.
4. **Salva**, poi **Prova connessione**: deve rispondere che il server è raggiungibile e il codice è valido.
5. **Sincronizza con il server**.
   - Se il server è vuoto DocMap chiede **"Carica il mio archivio sul server (prima volta)"** e mostra quanti faldoni,
     clienti ed eliminazioni invierà → **conferma**. È il passaggio **locale → web** iniziale.
   - Se il server ha già dati, li confronta con i tuoi e unisce.

### 2.2 Tutti i giorni

| Voglio… | Cosa faccio |
|---|---|
| **dal PC locale al web** (le mie modifiche arrivano a web app e telefoni) | sul PC: **Sincronizza con il server** |
| **dal web al PC locale** (ricevere quello che hanno fatto telefoni e web app) | sul PC: **Sincronizza con il server** (è lo stesso pulsante: manda e riceve) |
| lavorare dalla **web app** | niente: si sincronizza da sola ogni pochi secondi; l'indicatore in alto dice **Online · sincronizzato** |
| lavorare dal **telefono** | niente: salva direttamente sul server; senza rete mette in coda e invia appena torna |

**Regola semplice**: sul PC premi **Sincronizza con il server** quando inizi e quando finisci di lavorare.

### 2.3 Se qualcosa non va

| Indicatore o messaggio | Significato | Cosa fare |
|---|---|---|
| **In attesa (n)** | n modifiche non ancora inviate | Sincronizza; se resta, guarda il messaggio sotto il riquadro |
| **Offline** | il server non risponde (rete) | riprova più tardi: DocMap ritenta da solo |
| **Accesso negato** | il server non accetta il codice di questo browser | il riquadro **Server online** dice il motivo preciso e cosa fare: di solito incolla un codice valido in **Nuovo codice di accesso** |
| **Online · sola lettura** | il codice è "viewer" | chiedi all'admin un codice "editor" |
| finestra **Conflitti da decidere** | lo stesso faldone è cambiato in due posti | scegli quale versione tenere, per ogni faldone |

## 3. Senza server: scambio con un file cifrato

Serve se il server non c'è o non è raggiungibile. Il file contiene faldoni, clienti, ubicazioni, eliminazioni e
registro, cifrati con una **passphrase** (almeno 8 caratteri) che comunichi a voce, mai nello stesso canale del file.

### 3.1 Dal PC locale alla web app

1. PC › Sincronizzazione › **Scambio con un file** › **Copia export per web app**: scegli *Tutto l'archivio* la prima
   volta, poi *Solo modifiche dall'ultima sincronizzazione*; spunta **Cifra con passphrase** → **Scarica file**.
2. Web app › Sincronizzazione › **Importa dati da client locale** › **Scegli file…** → passphrase → **Analizza**.
3. DocMap mostra cosa cambia (nuovi, aggiornati, eliminati, da decidere) → **Applica**.

### 3.2 Dalla web app al PC locale

1. Web app › Sincronizzazione › **Esporta per il client locale** → passphrase → **Scarica file**.
2. PC › Sincronizzazione › **Importa dati dalla web app** › **Scegli file…** → passphrase → **Analizza** → **Applica**.

## 4. Domande frequenti

- **Posso usare entrambi i modi?** Sì, ma non serve: con il server usa solo **Sincronizza con il server**.
- **Le foto degli armadi?** Restano su ogni PC (non vanno sul server né nel file): fanne il backup `.sqlite`.
- **Ho cancellato per errore?** Ogni azione ha **Annulla** per qualche secondo; poi Registro attività e backup.
- **Due PC in studio?** Collega entrambi al server (§2.1) con due codici diversi; ognuno sincronizza quando inizia e
  quando finisce.
- **Python in sede** (installazione sul PC dello studio al posto di SiteGround): stessa sincronizzazione, cambia solo
  l'indirizzo del server. Lo prepara il progetto Python.
