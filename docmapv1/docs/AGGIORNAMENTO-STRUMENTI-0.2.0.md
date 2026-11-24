# Strumenti 0.2.0 — licenza dell'hub, crediti del piano, gettone del server remoto

Gli Strumenti leggono ora la **licenza firmata dall'hub**: il piano decide se si possono avviare lavori sul PC, se si
possono mandare al server remoto e quanti crediti ci sono al mese. **Finché non installi una licenza non cambia
niente**: tutto funziona come nella 0.1. Nessuna migrazione: ricette, lavori, crediti e registro restano come sono.

## Cosa fare

1. Chiudi gli Strumenti (chiudi la finestra nera).
2. Sostituisci la cartella `strumenti\` con quella dello zip nuovo (la cartella dati `%APPDATA%\DocMapStrumenti\` non si
   tocca). La prima volta `AVVIA-STRUMENTI.bat` installa una libreria in più (`cryptography`): serve Internet.
3. In basso: **0.2.0**.
4. Quando vuoi che valga la licenza: una volta sola la chiave pubblica dell'hub
   (`python -m docmap_strumenti licenza chiave chiave-pubblica.txt`, il file lo dà l'hub con `export-public-key`), poi
   Impostazioni › **Licenza** › scegli il file `.docmap-licence` del cliente.
5. Se il piano comprende il server remoto: Impostazioni › **Esecuzione remota** › indirizzo e gettone che ti ha dato
   il fornitore (il gettone lo crea l'hub).

## Cosa succede con la licenza

- Licenza valida con la funzione Strumenti: lavori e prove come prima; tetto dei crediti = quello del piano (o il tuo,
  se più basso).
- Scaduta oltre la tolleranza, sospesa o revocata: niente lavori nuovi né prove; **verifiche, ripresa, risultati e
  scarichi funzionano sempre**.

## Per tornare indietro

Rimetti la cartella `strumenti\` della 0.1.1: la licenza installata (`%APPDATA%\DocMapStrumenti\licenza\`) viene
ignorata e tutto torna come prima.
