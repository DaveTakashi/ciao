# Da 26.12.17 (v12.17) a 26.12.18 (v12.18) — la sezione «Strumenti»

Arrivano gli **Strumenti** (programma nuovo `strumenti\`, guida [`STRUMENTI.md`](STRUMENTI.md)) e la loro porta
dentro l'app: ⚙ › **Strumenti**, solo per l'amministratore. **Nessun dato cambia**: nessuna migrazione, il server del
sito cambia solo il numero di versione.

## Cosa cambia

- **⚙ › Strumenti** (solo amministratore; chi ha il ruolo «consultazione» o «modifica» non la vede): dice se gli
  Strumenti sono avviati su questo PC e con quale versione, li apre, mostra quanti lavori aspettano una **verifica** e
  quanti documenti ci sono da controllare, gli ultimi lavori e i crediti del mese. Se non sono avviati spiega come
  avviarli (`strumenti\AVVIA-STRUMENTI.bat`).
- Per vedere i lavori da verificare e aprire gli Strumenti senza chiave: incollate una volta il **collegamento con la
  chiave** (quello che si apre con `AVVIA-STRUMENTI.bat`). Resta **solo su quel PC** (non va nei backup, nella
  sincronizzazione né sul server). «Dimentica la chiave» lo toglie.
- Dal **sito online** il browser non permette di controllare gli Strumenti del PC: la pagina lo dice e il pulsante
  «Apri gli Strumenti» funziona lo stesso sul PC dove sono installati.
- Gli Strumenti 0.1.1 rispondono a due indirizzi in più per l'app: `/api/ping` (senza chiave: solo «sono avviato» e
  la versione) e `/api/summary` (con la chiave: lavori da verificare). Nient'altro è raggiungibile da un'altra pagina.

## Come si aggiorna

1. Copia di sicurezza come sempre (Esporta e Salva › backup), poi `AGGIORNA-DOCMAP.bat` con lo zip nuovo.
2. Sito online: «Siti da aggiornare» nell'hub (cambia solo il numero in `api.php`).
3. Strumenti: prima installazione con [`AGGIORNAMENTO-STRUMENTI-0.1.0.md`](AGGIORNAMENTO-STRUMENTI-0.1.0.md) (vale anche
   per la 0.1.1: si sostituisce solo la cartella `strumenti\`, i dati in `%APPDATA%\DocMapStrumenti\` restano).

## File

Nuovo `assets/js/06zs-strumenti.js` (caricato da `index.html` dopo `06z-voice.js`); `02-core.js` e `sw.js` (versione);
`server-php/api.php` e `server-python/docmap_server/api.py` (solo il numero). Chiave nuova del browser
`docmap_strumenti` (solo il collegamento agli Strumenti di quel PC); nessuna chiave vecchia cambia.
