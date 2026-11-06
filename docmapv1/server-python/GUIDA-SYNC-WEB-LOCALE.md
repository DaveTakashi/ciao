# DocMap — sincronizzare il server web e il server dello studio

Guida semplice per Dave e per chi gestisce il PC dello studio. Comando: `python -m docmap_server sync-remote`.

## 1. Cosa fa, in una frase

Tiene **uguali due database DocMap**: quello online (il sito, per esempio su SiteGround) e quello installato in studio
(il server Python sul PC dello studio). Funziona in **entrambe le direzioni**: quello che fai sul web arriva in studio,
quello che fai in studio arriva sul web.

```
   SERVER WEB (online)            PONTE (sul PC dello studio)            SERVER DELLO STUDIO (locale)
   https://…/server-php/api.php  ⇄  sync-remote ogni 10 minuti  ⇄  https://127.0.0.1:8443/api
   telefoni fuori ufficio          legge da tutti e due, manda             PC e telefoni in ufficio
                                   a ciascuno ciò che gli manca
```

Il "ponte" è un piccolo programma che parla con i due server **come farebbe l'app**: con un codice di accesso
(token) per ciascun lato. Non tocca i file dei database: legge le novità di un lato e le manda all'altro.
Funziona con qualsiasi coppia: web PHP ⇄ studio Python (il caso normale), Python ⇄ Python, anche PHP ⇄ PHP.

**Cosa passa**: faldoni, clienti, ubicazioni, archivi, movimenti di stato, **eliminazioni**, impostazioni condivise
(nome dello studio, colori, livelli…) e registro attività.
**Cosa non passa** (resta di ciascun server): codici di accesso (token) e utenti, licenza, registro accessi
("chi ha guardato cosa"), registro sincronizzazioni del server. Ogni server tiene il proprio.

## 2. Quale direzione usare

| Situazione | Direzione | Opzione |
|---|---|---|
| Uso normale: si lavora sia sul web sia in studio | entrambe | (nessuna, è il predefinito) |
| **Dal web al locale**: il web è quello "buono", lo studio deve riceverne una copia (es. primo avvio dello studio) | solo A → B | `--direction a-to-b` |
| **Dal locale al web**: lo studio è quello "buono", il web deve riceverne una copia (es. pubblicare i dati dello studio) | solo B → A | `--direction b-to-a` |

Nel profilo il lato **A** è il web e il lato **B** è lo studio (puoi scegliere tu, basta ricordarlo: i nomi che scrivi
in `label` compaiono nei messaggi). Con una sola direzione l'altro lato **non viene mai modificato**; le sue novità
restano in attesa e partiranno alla prima sincronizzazione nell'altra direzione o in entrambe.

## 3. Preparazione sul PC dello studio (una volta sola)

### 3.0 Il modo automatico (consigliato, dal 2026-11-03)

Se il cliente è stato creato nel hub con `cliente nuovo --installazioni entrambe`, il suo **pacchetto personale**
contiene già il modello del profilo (indirizzo del sito, nessun codice) e tutto si riduce a:

1. **Sul sito**, durante `setup.php`, aggiungi alle persone la riga `ponte-sync,editor`; copia il token che compare e
   salvalo nella cassaforte del hub: `python -m docmap_hub cliente token-ponte --cliente "Studio Rossi" --salva`
   (per portarlo su chiavetta: `… --esporta E:\token-ponte.txt`).
2. **In studio**, alla fine di `installa.bat` rispondi **s** a *"La configuro adesso?"* e incolla il token (oppure
   più tardi: `C:\DocMap\strumenti\configura-sync.ps1`, anche con `-TokenFile E:\token-ponte.txt`).

Lo script crea da solo il codice `ponte-sync` sul server dello studio (il §3.1 per il lato studio non serve), la
cartella `C:\DocMap\sync` protetta (§3.2), il profilo (§3.3), fa la prova senza modifiche (§3.4) e crea l'attività ogni
10 minuti (§3.6). Il resto di questo capitolo è il **modo manuale**, utile per capire o per un caso particolare.

| Direzione | Come si ottiene con il modo automatico |
|---|---|
| web ⇄ studio (entrambe) | predefinita |
| solo dal web allo studio | dopo la configurazione: `sync-remote C:\DocMap\sync\sync-profile.json --direction a-to-b` a mano, oppure cambia `"direction": "a-to-b"` nel profilo |
| solo dallo studio al web | come sopra con `b-to-a` |

Serve il server dello studio già installato con `installer-windows` (cartelle `C:\DocMap\venv`, `C:\DocMap\server`,
`C:\DocMap\certificati`). Tutti i comandi si danno in un **Prompt dei comandi aperto come amministratore**.

### 3.1 Un codice di accesso per il ponte su ogni lato

Il ponte ha bisogno di un token con ruolo **Può modificare** (editor) sul web **e** uno sul server dello studio.

1. Apri DocMap **sul web** con un utente amministratore: ⚙ Funzioni avanzate › Sincronizzazione › Server online ›
   **Codici di accesso** › **Nuovo codice**. Persona: `ponte-sync`. Ruolo: **Può modificare**. Copia il codice che
   compare: **viene mostrato una volta sola**.
2. Fai lo stesso aprendo DocMap **dal server dello studio** (l'indirizzo è in `C:\DocMap\LEGGIMI-INDIRIZZO.txt`).

Un token è una lunga sequenza di lettere e numeri: trattalo come una password. Se lo perdi, revocalo (stessa
schermata, **Revoca**) e creane un altro.

### 3.2 La cartella del ponte, protetta

```bat
mkdir C:\DocMap\sync
icacls C:\DocMap\sync /inheritance:r /grant:r *S-1-5-32-544:(OI)(CI)F *S-1-5-18:(OI)(CI)F
```

Così la cartella è leggibile **solo dagli amministratori e dal sistema** (come `C:\DocMap\config`). Non usare
`C:\DocMap\server`: viene sostituita a ogni aggiornamento.

### 3.3 Il profilo

```bat
cd /d C:\DocMap\server
C:\DocMap\venv\Scripts\python.exe -m docmap_server sync-remote --example C:\DocMap\sync\sync-profile.json
notepad C:\DocMap\sync\sync-profile.json
```

Compila (lascia il resto com'è):

```json
{
  "name": "Web ⇄ Studio",
  "a": {"label": "Web", "url": "https://docmap.pr-it.it/studio-de/server-php/api.php", "token": "<token del web>",
        "basic_user": "", "basic_pass": ""},
  "b": {"label": "Studio", "url": "https://127.0.0.1:8443/api", "token": "<token dello studio>",
        "ca": "C:\\DocMap\\certificati\\DocMap-CA-studio.crt"},
  "direction": "both"
}
```

- `url`: l'indirizzo dell'API. Web: quello dell'app + `server-php/api.php`. Studio: `https://127.0.0.1:8443/api`
  (il ponte gira sullo stesso PC; se la porta è diversa la trovi in `C:\DocMap\impostazioni.json`, voce `porta`).
- `basic_user` / `basic_pass`: solo se la cartella del sito è protetta con utente e password (protezione di SiteGround).
- `ca`: il certificato dello studio, così il ponte si fida del server dello studio **senza** spegnere i controlli
  HTTPS. Esiste anche `"insecure_lan": true` (non controlla il certificato), accettato solo per indirizzi della
  rete locale: usalo solo per una prova.
- **Token fuori dal file (facoltativo)**: lascia `"token": ""` e imposta le variabili d'ambiente di sistema
  `DOCMAP_SYNC_A_TOKEN` e `DOCMAP_SYNC_B_TOKEN` (e `DOCMAP_SYNC_A_BASIC_PASS` per la password della cartella).
  Hanno la precedenza sul file.

### 3.4 Prova senza cambiare niente

```bat
cd /d C:\DocMap\server
C:\DocMap\venv\Scripts\python.exe -m docmap_server sync-remote C:\DocMap\sync\sync-profile.json --dry-run
```

Mostra cosa **verrebbe** mandato in ciascuna direzione (quanti faldoni, clienti, ubicazioni, eliminazioni…), i
conflitti e gli avvisi. **Non scrive nulla** su nessuno dei due server. Leggi bene gli avvisi della prima volta:

- *"… è vuoto, riceverà una copia completa"*: normale al primo avvio di uno dei due lati.
- *"Prima sincronizzazione con dati su ENTRAMBI i lati"*: i due archivi verranno **fusi** record per record (vince
  la modifica più recente). Se uno dei due contiene dati di prova che non vuoi vedere sull'altro, fermati qui e usa
  una sola direzione (§2) oppure svuota prima quello di prova.

### 3.5 Prima sincronizzazione vera

Stesso comando senza `--dry-run`. Alla fine leggi l'**Esito**. Rilancialo subito: la seconda volta deve dire
*"Già allineati: …"* e *"Inviati …: niente"*.

### 3.6 Automatica ogni 10 minuti (Utilità di pianificazione)

Crea il file `C:\DocMap\sync\sincronizza.bat` con il Blocco note:

```bat
@echo off
cd /d C:\DocMap\server
C:\DocMap\venv\Scripts\python.exe -m docmap_server sync-remote C:\DocMap\sync\sync-profile.json > C:\DocMap\sync\ultimo-esito.txt 2>&1
```

Poi, nel Prompt dei comandi come amministratore:

```bat
schtasks /Create /TN "DocMap Sync Web-Locale" /TR "C:\DocMap\sync\sincronizza.bat" /SC MINUTE /MO 10 /RU SYSTEM /RL HIGHEST /F
```

- Ogni quanti minuti: il numero dopo `/MO` (5, 10, 15, 30…).
- Provarla subito: `schtasks /Run /TN "DocMap Sync Web-Locale"`, poi apri `C:\DocMap\sync\ultimo-esito.txt`.
- Sospenderla: `schtasks /Change /TN "DocMap Sync Web-Locale" /DISABLE` (riattivarla: `/ENABLE`).
- Toglierla: `schtasks /Delete /TN "DocMap Sync Web-Locale" /F`.

Se il giro precedente non è ancora finito, quello nuovo si ferma da solo ("un'altra sincronizzazione è in corso"):
non si sovrappongono mai.

## 4. Come si decide chi vince

Le **stesse regole** dei server e dell'app (`docs/SYNC.md` §1):

- per ogni record (un faldone, un cliente, un'ubicazione…) **vince la modifica più recente** (`updated_at`);
- un'eliminazione più recente della modifica elimina il record anche dall'altra parte; una modifica più recente
  dell'eliminazione lo fa tornare;
- stesso contenuto = niente da fare;
- **stessa ora esatta ma contenuto diverso = conflitto**: il ponte **non tocca nessuno dei due** e lo segnala.

Un conflitto compare nel riepilogo così:

```
CONFLITTI da risolvere (stessa ora, contenuto diverso: nessuno dei due è stato toccato): 1
   - binder BL123 b-… · Web: 2026-11-02T10:00:00.000Z · Studio: 2026-11-02T10:00:00.000Z
```

**Per risolverlo**: apri quel faldone in DocMap dal lato che ha la versione giusta e **salvalo di nuovo** (anche una
piccola correzione). Diventa il più recente e al giro dopo arriva dall'altra parte; il conflitto sparisce dall'elenco.
Finché resta aperto il ponte lo ripete a ogni giro.

Nota: il "più recente" dipende dagli orologi dei server. Se differiscono di oltre 2 minuti il ponte lo scrive negli avvisi.

## 5. Leggere il risultato e il registro

- **Ultimo giro**: `C:\DocMap\sync\ultimo-esito.txt` (il riepilogo in italiano).
- **Storico**: `C:\DocMap\sync\sync-log\sync-AAAA-MM.jsonl`, un file al mese, due righe per giro (`start` e `end`)
  con conteggi, conflitti, avvisi ed errori. Un giro con `start` ma senza `end` è stato interrotto (PC spento…):
  il giro dopo riprende da solo.
- **Sui server**: nel *Registro sincronizzazioni* dell'app (Server (tutti)) i giri del ponte compaiono con il
  dispositivo **"bridge Web ⇄ Studio"** e l'utente del suo token (`ponte-sync`).
- **Codice di uscita** (utile per strumenti di controllo): `0` tutto a posto · `1` completato ma da guardare
  (conflitti, un lato in sola lettura per la licenza, record rifiutati) · `2` non completato (errore).
- `--json` stampa lo stesso riepilogo in formato JSON.

## 6. Se qualcosa non va

| Messaggio | Cosa fare |
|---|---|
| *"… non risponde"* | Il server è spento o Internet è giù. Non serve fare nulla: le modifiche restano su ciascun lato e partono al giro dopo. |
| *"… ha rifiutato il token"* | Token sbagliato, incompleto o revocato: creane uno nuovo (§3.1) e mettilo nel profilo. **Non insistere**: troppi tentativi bloccano per un po' l'indirizzo dello studio. |
| *"… ha bloccato per un po' questo indirizzo"* | Troppi token sbagliati: aspetta i secondi indicati, poi correggi il token. |
| *"il token … non può scrivere"* | Il token è *Solo lettura*: serve *Può modificare*. |
| *"certificato HTTPS non accettato"* | Manca `"ca"` nel profilo (lato studio) o il certificato è stato rifatto: controlla il percorso `C:\DocMap\certificati\DocMap-CA-studio.crt`. |
| *"chiede utente e password della protezione della cartella"* | Compila `basic_user` / `basic_pass` del lato web. |
| *"… è in sola lettura per la licenza"* | Quel server non accetta modifiche finché la licenza non è rinnovata: il ponte continua a **leggere** da lui e a mandare all'altro; le modifiche per lui aspettano e partono da sole quando la licenza torna valida. |
| *"L'indirizzo di … è cambiato"* | Hai cambiato `url`: il ponte rifà un confronto completo con quel lato (è sicuro). |
| *"Un'altra sincronizzazione … è in corso"* | Normale se un giro è ancora attivo. Se resta per ore, sposta il file `sync-profile.lock` e rilancia. |

**Ripartire da zero** (per esempio dopo aver ripristinato un backup su uno dei due server): sposta altrove
`C:\DocMap\sync\sync-profile.state.json` e rilancia con `--dry-run`. Il ponte rifà il confronto completo; è
sicuro perché vince sempre il più recente e i pari restano conflitti.

## 7. Sicurezza

- Il profilo contiene i token: **mai** in una cartella condivisa, in Dropbox/OneDrive o allegato a una mail. Tienilo
  in `C:\DocMap\sync` con i permessi del §3.2 (su Linux: `chmod 600`; il ponte avvisa se il file è leggibile da altri).
- Usa un token **dedicato** al ponte (`ponte-sync`), così puoi revocarlo senza toccare quelli delle persone.
- Il ponte rifiuta `http://` verso Internet (il token viaggerebbe in chiaro) e accetta `insecure_lan` solo in rete locale.
- Il traffico verso indirizzi della rete locale non passa mai da un proxy.
- I dati viaggiano solo tra i due server, cifrati da HTTPS; su ciascun server restano cifrati come sempre.

## 8. Domande frequenti

**Il PC dello studio deve restare acceso?** Sì, il ponte gira lì. Da spento non si perde nulla: si sincronizza alla riaccensione.

**E se uno studio vuole tenere i dati solo in sede?** Non installare il ponte (o toglierlo con `schtasks /Delete`):
il server dello studio funziona da solo.

**Due ponti sullo stesso paio di server?** Meglio di no: uno basta. Se succede non si rompe nulla (le regole sono
le stesse), ma si fa lavoro doppio.

**Il chi ha modificato si conserva?** L'ora di ogni modifica sì (decide chi vince). Sul server che riceve, l'autore
registrato del record è il ponte (`bridge …`): l'autore originale resta nel registro attività, che passa insieme ai dati.
