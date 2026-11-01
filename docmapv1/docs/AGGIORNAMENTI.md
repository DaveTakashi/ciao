# DocMap — procedura standard di aggiornamento (v11 e successive)

Ogni nuova versione di DocMap deve potersi installare **sopra la precedente senza perdere dati**. Questo documento è
la procedura che vale sempre; ogni rilascio aggiunge una guida specifica `docs/AGGIORNAMENTO-vX-vY.md` (esempio:
`AGGIORNAMENTO-v10-v10.1.md`) con le sole differenze.

## Per chi usa DocMap

1. **Backup** con la versione vecchia: **Salva backup** (JSON) + file `.sqlite` completo (contiene le foto). Annota il
   numero di faldoni e clienti. Copia la cartella `docmapv1` vecchia da parte.
2. **Se usi il database online**: dal PC fai **Sincronizza con il server** prima di aggiornare, e scarica dal server
   una copia della cartella dati (`docmap.sqlite*`) e di `config.php`.
3. **Sostituisci i file nello stesso percorso** (stessa cartella, stesso browser) e riapri `index.html`.
4. **Controlla**: versione in Impostazioni, numero di faldoni e clienti, un paio di faldoni e foto.
5. **Server** (se la versione lo richiede): carica la nuova cartella `deploy/studio-de/` sopra la vecchia **senza
   cancellare** `server-php/config.php` né la cartella dati; non rieseguire `setup.php`. Le note della versione dicono
   se l'API va aggiornata.
6. **Sincronizza** di nuovo dal PC e prova un telefono.
7. **Tornare indietro**: rimetti la cartella vecchia nello stesso percorso; se serve ripristina il backup JSON / `.sqlite`.

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
