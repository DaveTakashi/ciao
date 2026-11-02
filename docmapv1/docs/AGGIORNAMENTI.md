# DocMap — procedura standard di aggiornamento (v11 e successive)

Ogni nuova versione di DocMap deve potersi installare **sopra la precedente senza perdere dati**. Questo documento è
la procedura che vale sempre; ogni rilascio aggiunge una guida specifica `docs/AGGIORNAMENTO-vX-vY.md` (esempi:
`AGGIORNAMENTO-v10-v10.1.md`, `AGGIORNAMENTO-v10.1-v11.md`, `AGGIORNAMENTO-v11-v11.1.md`, `AGGIORNAMENTO-v11.1-v12.md` e la guida diretta `AGGIORNAMENTO-v10-v12.md`) con le sole differenze. Elenco di tutti i documenti:
`INDICE.md`; prova a secco dell'aggiornamento su una copia: `CHECKLIST-COLLAUDO.md` §8; versione per compiti:
`MANUALE-UTENTE.md` §12.

## Per chi usa DocMap

1. **Backup** con la versione vecchia: **Salva backup** (JSON) + file `.sqlite` completo (contiene le foto). Annota il
   numero di faldoni e clienti. Copia la cartella `docmapv1` vecchia da parte.
2. **Se usi il database online**: dal PC fai **Sincronizza con il server** prima di aggiornare, e scarica dal server
   una copia della cartella dati (`docmap.sqlite*`) e di `config.php`.
3. **Aggiorna prima il server** (punto 6), poi i PC, poi i telefoni: i client vecchi funzionano con il server nuovo, non il contrario.
4. **Sostituisci i file nello stesso percorso** (stessa cartella, stesso browser) e riapri `index.html`.
5. **Controlla**: versione in Impostazioni, numero di faldoni e clienti, un paio di faldoni e foto.
6. **Server** (se la versione lo richiede): carica la nuova cartella `deploy/studio-de/` sopra la vecchia **senza
   cancellare** `server-php/config.php` né la cartella dati; non rieseguire `setup.php`. Le note della versione dicono
   se l'API va aggiornata. Prova `server-php/api.php?r=ping` (campo `schema`).
7. **Sincronizza** di nuovo dal PC e prova un telefono.
8. **Tornare indietro**: rimetti la cartella vecchia nello stesso percorso; se serve ripristina il backup JSON / `.sqlite`.

## Per chi sviluppa (regole del rilascio)

- Non rinominare mai le chiavi di memoria (`docmap_v26_state`, il database IndexedDB, `docmap_v26_vault*`,
  `docmap_v26_srv`): una chiave nuova = dati "spariti" per l'utente.
- Migrazioni **solo additive** e idempotenti (`migrate()` in 02-core.js, `dbMigrate` in 06-db.js, schema del server in
  `api.php`): campi nuovi con valore predefinito, niente campi tolti o cambiati di significato. Se una modifica non è
  additiva serve una conversione automatica + una guida dedicata + l'approvazione di Dave.
- Il server deve accettare i client della versione precedente per almeno un rilascio (stesso contratto
  `API-CONTRACT.md`, campi nuovi facoltativi).
- Ogni rilascio porta nella suite un **test che apre i dati della versione precedente** (stato salvato con la forma
  vecchia) e ne verifica il contenuto, più il test di sincronizzazione con il server se il contratto è cambiato.
- Aggiorna `APP_VERSION`, `AGENTS.md`, `MODELLO-DATI.md` (sezione della versione) e scrivi
  `docs/AGGIORNAMENTO-vX-vY.md` con: backup, sostituzione nello stesso percorso, controlli, passi sul server,
  rollback.
