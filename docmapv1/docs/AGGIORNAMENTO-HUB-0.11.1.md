# DocMap Hub: aggiornare alla 0.11.1 (correzioni del double check finale)

La 0.11.1 corregge quello che è emerso dal controllo finale prima della reinstallazione su Windows. L'app resta la
**26.12.7** (siti, PC e telefoni non cambiano) e il registro resta allo **schema 4**: nessuna migrazione.

## Cosa cambia per te

| Prima (0.11.0) | Adesso (0.11.1) |
|---|---|
| **Sposta il sito** dentro una sottocartella del sito vecchio (`…/studio-de/` → `…/studio-de/2026/`) rendeva il sito nuovo irraggiungibile («troppi reindirizzamenti») | Il vecchio indirizzo rimanda **solo le pagine di DocMap** (pagine, `/q/<codice>`, programma, API): il sito nuovo nella sottocartella funziona, e un sito vecchio alla radice del dominio non «ruba» più le altre cartelle |
| Se il primo «Attiva tutto» si fermava al controllo (es. SSL del dominio non ancora attivo) il secondo diceva «c'è già DocMap» e restava bloccato | Se nella cartella c'è **esattamente** la versione caricata dal tentativo precedente e il sito non è ancora configurato, «Attiva tutto» **riprende da lì** |
| Pagina **Attività** del hub vuota con «errore interno» | Funziona; tutte le voci hanno un nome in italiano |
| Impostazioni del hub più larga dello schermo sul telefono | Sta nello schermo |
| `INSTALLA-SENZA-DOMANDE.bat` / `installa.bat` aperti da dentro lo zip: errore poco chiaro | Messaggio: «Prima estrai TUTTO lo zip» |
| Python vecchio (3.10 o meno): errore incomprensibile | Messaggio chiaro: serve Python 3.11 o successivo |
| `README-DEPLOY.md` e `DEPLOY-MANIFEST.txt` leggibili dal web | Bloccati (403) dal nuovo `.htaccess` |

## Passi (5 minuti)

1. Chiudi il hub. Impostazioni → Backup → «Fai un backup adesso» (o `run_windows.bat backup`).
2. Estrai **tutto** `DocMap-hub-0.11.1.zip` in `C:\DocMapHub\` (sostituisci i file; la cartella dati
   `%APPDATA%\DocMapHub\` non si tocca). Tieni insieme `hub`, `tools`, `installer-windows`, `server-python`.
3. Avvia `hub\run_windows.bat`: in basso a sinistra **v0.11.1**.
4. Facoltativo: «Siti da aggiornare» → pubblica sui siti esistenti per avere il nuovo `.htaccess` (se un `.htaccess`
   è stato modificato a mano il hub non lo sovrascrive e te lo dice).

## Dati e sicurezza

- Nessun dato si sposta con l'aggiornamento: registro, cassaforte e licenze restano come sono.
- Un sito già spostato con la 0.11.0 **in un'altra cartella o dominio** funziona già bene. Solo se l'hai spostato
  **dentro la sua stessa cartella** sostituisci a mano il `.htaccess` del vecchio sito (o rifai lo spostamento con la 0.11.1).

## Tornare indietro

Estrai di nuovo `python/vecchie-versioni/DocMap-hub-0.11.0.zip` sopra `C:\DocMapHub\`: i dati sono compatibili.
