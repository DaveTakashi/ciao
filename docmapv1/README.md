# DocMap 2026 (DM26) — versione 26.12.0

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
| aggiornare dalla v11.1 alla v12 | [`docs/AGGIORNAMENTO-v11.1-v12.md`](docs/AGGIORNAMENTO-v11.1-v12.md) |
| aggiornare dalla v11 alla v11.1 | [`docs/AGGIORNAMENTO-v11-v11.1.md`](docs/AGGIORNAMENTO-v11-v11.1.md) (regole generali: [`docs/AGGIORNAMENTI.md`](docs/AGGIORNAMENTI.md)) |
| pubblicare il sito e il database online | [`docs/DEPLOY-WEB.md`](docs/DEPLOY-WEB.md) |
| sviluppare (JavaScript) | [`AGENTS.md`](AGENTS.md) |
| portare il server in Python | [`docs/HANDOFF_PROMPT.md`](docs/HANDOFF_PROMPT.md), [`docs/python/PORTING.md`](docs/python/PORTING.md) |

## Cosa c'è nella cartella

```
index.html          il programma (doppio clic)
scan.html           la pagina che si apre scansionando un QR (telefono)
docmap.config.js    modalità: local (predefinita) o web
assets/, vendor/    codice, stili, caratteri, sql.js (tutto incluso, niente Internet)
server-php/         il database online condiviso (api.php, setup.php) per SiteGround
tools/              build_deploy.py (cartella da caricare sul sito) e altri strumenti
tests/              test automatici (solo per chi sviluppa)
docs/               documentazione (inizia da docs/INDICE.md)
```

## Test (solo per chi sviluppa)

```
cd tests && npm i playwright jsqr pngjs && pip install pypdfium2 && node suite.js
```

Servono anche PHP 8 con `pdo_sqlite` e `openssl` per le sezioni del server. La suite apre l'app in Chromium e fa circa 1050 controlli, in circa 6 minuti. Deve finire con `0 failed` ed `errors: none`. Dettagli in [`AGENTS.md`](AGENTS.md).
