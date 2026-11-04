# Aggiornare DocMap dalla v12.3 alla v12.4 senza perdere i dati

La v12.4 (**26.12.4**) non ha migrazioni: stessi dati, schema locale 9, schema server 3. Novità:

- **Primo accesso** più semplice: pulsante 👁 per vedere il PIN o la password (su ogni campo password dell'app e del
  telefono); il **codice di accesso al server è facoltativo** e si aggiunge dopo; se è sbagliato i campi restano
  compilati e c'è **Continua senza codice**;
- **Verifica dopo l'aggiornamento** (Sincronizzazione › Server online): controlla file, schema, codice e dati del server;
- `api.php`: `ping` aggiunge `app_version` (solo un campo in più);
- `setup.php` non crea più una chiave nuova se trova un database esistente, e alla fine offre di scaricare la copia di
  `config.php`;
- guida nuova [`AGGIORNARE-IL-SERVER.md`](AGGIORNARE-IL-SERVER.md).

Chi è ancora sulla **v10.0** segue direttamente [`AGGIORNAMENTO-v10-v12.md`](AGGIORNAMENTO-v10-v12.md) con lo zip v12.4.

## Passi

Segui [`AGGIORNARE-IL-SERVER.md`](AGGIORNARE-IL-SERVER.md) §2: backup, carica `deploy/studio-de/` **sopra** quella
vecchia (senza cancellare la cartella), `api.php?r=ping` con `"app_version":"26.12.4"`, aggiorna il PC (stessa cartella),
**Verifica dopo l'aggiornamento**, ricarica i telefoni. **Informazioni su DocMap** → **26.12.4**.

## Tornare indietro

Rimetti i file della v12.3 (server e PC), senza toccare `config.php` e la cartella dati. La v12.3 ignora `app_version`.

## Per chi sviluppa

`srvCheckSteps()` (06g-server.js) costruisce le righe della verifica dalle risposte di `ping`, `me` e `pull`; il server
Python deve rispondere a `ping` anche con `app_version`. Occhio sulle password: `pwRevealScan()` (10-auth.js). Test: blocco
`@@STREAM-V124@@` di `tests/suite.js`.
