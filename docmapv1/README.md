# DocMap 2026 (DM26) — versione 26.12.6

Archivio fisico-digitale dello studio. Ogni faldone ha:

- un codice parlante (es. `BL1`);
- un cliente;
- una posizione sullo scaffale o un'ubicazione in una scatola (es. `MAG1-A1-S1-R1-B04`);
- un QR statico `https://qr7.it/dm26XXXXXXXX`;
- un'etichetta stampata al millimetro (predefinito il foglio MRINK143).

Sul PC funziona **offline**, con un doppio clic e senza installare niente. Il **database online** dello studio (su SiteGround) è facoltativo: con lui telefoni e browser lavorano direttamente online e i PC si allineano quando vuoi.

## Avvio rapido

1. Estrai lo zip in una cartella fissa (es. `C:\DocMap\`), non aprirlo da dentro lo zip.
2. Fai doppio clic su `docmapv1/index.html`.
3. Usa **Chrome** o **Edge**, sempre lo stesso browser: i dati restano in quel browser.
4. Il pulsante **?** in alto (o F1) apre la guida con le azioni guidate. Versione e stato del server: ⚙ › Impostazioni ›
   Dati e sicurezza › **Informazioni su DocMap**.
5. Fai spesso **Salva backup** (pulsante in alto).

## Dove trovare le istruzioni

| Ti serve… | Leggi |
|---|---|
| fare una cosa passo passo (import clienti, stampa, PDF, ubicazioni, server, sincronizzazione, backup, problemi) | [`docs/MANUALE-UTENTE.md`](docs/MANUALE-UTENTE.md) |
| la mappa di tutti i documenti e chi li deve leggere | [`docs/INDICE.md`](docs/INDICE.md) |
| capire una parola (faldone, ubicazione, token, tombstone…) | [`docs/GLOSSARIO.md`](docs/GLOSSARIO.md) |
| la descrizione completa di ogni funzione | [`docs/RIFERIMENTO-FUNZIONI.md`](docs/RIFERIMENTO-FUNZIONI.md) |
| le prove da fare a mano (stampante, telefoni, SiteGround, ripristino) | [`docs/CHECKLIST-COLLAUDO.md`](docs/CHECKLIST-COLLAUDO.md) |
| aggiornare dalla **v10.0** direttamente alla v12 | [`docs/AGGIORNAMENTO-v10-v12.md`](docs/AGGIORNAMENTO-v10-v12.md) |
| aggiornare il server online senza perdere niente | [`docs/AGGIORNARE-IL-SERVER.md`](docs/AGGIORNARE-IL-SERVER.md) |
| aggiornare dalla v12.4 alla v12.5 | [`docs/AGGIORNAMENTO-v12.4-v12.5.md`](docs/AGGIORNAMENTO-v12.4-v12.5.md) |
| aggiornare dalla v12.3 alla v12.4 | [`docs/AGGIORNAMENTO-v12.3-v12.4.md`](docs/AGGIORNAMENTO-v12.3-v12.4.md) |
| aggiornare dalla v12.5 alla v12.6 (e poi con un doppio clic su `AGGIORNA-DOCMAP.bat`) | [`docs/AGGIORNAMENTO-v12.5-v12.6.md`](docs/AGGIORNAMENTO-v12.5-v12.6.md) |
| listino, condizioni, GDPR, garanzia QR, demo (bozze) | [`docs/commerciale/README.md`](docs/commerciale/README.md) |
| aggiornare dalla v12.2 alla v12.3 | [`docs/AGGIORNAMENTO-v12.2-v12.3.md`](docs/AGGIORNAMENTO-v12.2-v12.3.md) |
| aggiornare dalla v12.1 alla v12.2 | [`docs/AGGIORNAMENTO-v12.1-v12.2.md`](docs/AGGIORNAMENTO-v12.1-v12.2.md) |
| stampare con etichettatrici a nastro / rotolo | [`docs/MANUALE-UTENTE.md`](docs/MANUALE-UTENTE.md) §19 |
| sincronizzare PC locale, web app e telefoni | [`docs/GUIDA-SINCRONIZZAZIONE.md`](docs/GUIDA-SINCRONIZZAZIONE.md) |
| aggiornare dalla v12 alla v12.1 | [`docs/AGGIORNAMENTO-v12-v12.1.md`](docs/AGGIORNAMENTO-v12-v12.1.md) |
| aggiornare dalla v11.1 alla v12 | [`docs/AGGIORNAMENTO-v11.1-v12.md`](docs/AGGIORNAMENTO-v11.1-v12.md) |
| aggiornare dalla v11 alla v11.1 | [`docs/AGGIORNAMENTO-v11-v11.1.md`](docs/AGGIORNAMENTO-v11-v11.1.md) (regole generali: [`docs/AGGIORNAMENTI.md`](docs/AGGIORNAMENTI.md)) |
| pubblicare il sito e il database online | [`docs/DEPLOY-WEB.md`](docs/DEPLOY-WEB.md) |
| sapere a che punto siamo (versioni, test, cose da provare) | [`STATO.md`](STATO.md), [`CHANGELOG.md`](CHANGELOG.md) |
| provare tutto su Windows, SiteGround, stampante e telefoni | [`docs/COLLAUDO-REALE.md`](docs/COLLAUDO-REALE.md) |
| sviluppare (JavaScript) | [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md) |
| portare il server in Python | [`docs/HANDOFF_PROMPT.md`](docs/HANDOFF_PROMPT.md), [`docs/python/PORTING.md`](docs/python/PORTING.md) |

## Cosa c'è nella cartella

```
index.html          il programma (doppio clic)
scan.html           la pagina che si apre scansionando un QR (telefono)
docmap.config.js    modalità: local (predefinita) o web
assets/, vendor/    codice, stili, caratteri, sql.js (tutto incluso, niente Internet)
server-php/         il database online condiviso (api.php, setup.php) per SiteGround
server-python/      lo stesso server in Python, per l'installazione in sede
installer-windows/  installazione in sede su Windows (C:\DocMap)
hub/                DocMap Hub: clienti, licenze, deploy (PC di Dave)
ci/                 test automatici su GitHub (file da attivare)
tools/              build_deploy.py (cartella da caricare sul sito) e altri strumenti
tests/              test automatici (solo per chi sviluppa)
docs/               documentazione (inizia da docs/INDICE.md)
```

## Test (solo per chi sviluppa)

Controllo veloce di tutto (~3 minuti, da fare prima di ogni push): `bash tools/verifica-veloce.sh`.
Suite completa dell'app (prima di ogni rilascio, ~35 minuti):

```
cd tests && npm i playwright jsqr pngjs && pip install pypdfium2 && node suite.js
```

Servono anche PHP 8 con `pdo_sqlite` e `openssl` per le sezioni del server. La suite apre l'app in Chromium e fa circa 1370 controlli, in circa 35 minuti. Deve finire con `0 failed` ed `errors: none`. Dettagli in [`AGENTS.md`](AGENTS.md).
