# Aggiornare DocMap dalla v12.1 alla v12.2

La v12.2 (**26.12.2**) cambia **solo i file del programma**: nessuna migrazione, `api.php` e il database del server sono
quelli della v12.1 (schema 3). Chi è sulla v10.0 usa direttamente [`AGGIORNAMENTO-v10-v12.md`](AGGIORNAMENTO-v10-v12.md).

Novità:
- la barra in alto non sovrappone più gli avvisi ("Accesso negato", "Da esportare"): se non c'è spazio i menu vanno su
  una seconda riga;
- **Accesso negato** dice il motivo preciso (nessun codice, codice non valido, ruolo insufficiente, blocco del sito) e
  cosa fare; il riquadro **Server online** è in cima a Sincronizzazione;
- il popup del QR di un faldone su telefono è su una colonna;
- conferma prima delle azioni su 10 o più faldoni (manuale §18);
- link **Gestione completa** sul telefono per gli admin; tabella dei ruoli (manuale §17);
- **Crea in serie** spiegato con un esempio, il significato delle colonne, esempi pronti e il riepilogo per livello;
- aiuto nuovo: "Come provo la mappatura delle ubicazioni" e "Quale sincronizzazione uso", guida
  [`GUIDA-SINCRONIZZAZIONE.md`](GUIDA-SINCRONIZZAZIONE.md).

## Passi

1. **Backup** come sempre ([`AGGIORNAMENTI.md`](AGGIORNAMENTI.md)).
2. **Server**: carica il contenuto di `deploy/studio-de/` sopra `public_html/studio-de/` (non cancellare la cartella,
   non toccare la cartella dati, non rieseguire `setup.php`). `api.php?r=ping` → `"schema":3`.
3. **PC**: copia la nuova `docmapv1` sopra la vecchia nella stessa cartella; **Informazioni su DocMap** → **26.12.2**.
4. **Telefoni**: ricarica la pagina.
5. **Tornare indietro**: rimetti i file della v12.1; nessun dato da ripristinare.
