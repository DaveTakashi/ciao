# Aggiornare il server online senza perdere niente

> Per chi carica i file su SiteGround (o su un altro hosting PHP). Vale dalla v12.4 in poi; per le versioni
> precedenti valgono gli stessi passi, senza il pulsante di verifica. Regole generali: [`AGGIORNAMENTI.md`](AGGIORNAMENTI.md).

## 1. Cosa c'è sul server e cosa non va mai toccato

| Dove | Cos'è | Nello zip? | Cosa fare quando aggiorni |
|---|---|---|---|
| `public_html/studio-de/` (file dell'app, `assets/`, `server-php/api.php`…) | il programma | sì | **sovrascrivi** con quelli nuovi |
| `public_html/studio-de/server-php/config.php` | la **chiave** del database e i codici di accesso | **no** | **non toccarlo**; tienine una copia fuori dal sito |
| `docmap-data/` o `docmap-data/<sito>/` (accanto a `public_html`, o `server-php/data/`; la cartella esatta è `data_dir` in `config.php`) | il **database** `docmap.sqlite*` (cifrato) | **no** | **non toccarlo** |
| `server-php/setup.php` | la prima installazione | sì | non aprirlo: con `config.php` presente è disattivato |

Il database è cifrato con la chiave di `config.php`: **senza quel file i dati ci sono ma non si leggono**. Per questo la
regola è una sola: **carica sopra, non cancellare la cartella**.

## 2. Ogni aggiornamento, in 5 passi

1. **Backup** (5 minuti):
   - sul PC: **Sincronizza con il server**, **Salva backup**, ⚙ › Database › **File .sqlite**;
   - sul server (File Manager di SiteGround): scarica `server-php/config.php` e la cartella `docmap-data/`. In
     alternativa Site Tools › Sicurezza › **Backup** › Crea backup.
2. **Carica i file**: dallo zip carica il **contenuto** di `deploy/studio-de/` dentro `public_html/studio-de/`, scegliendo
   **Sovrascrivi**. Non eliminare la cartella prima, non rinominarla.
3. **Controlla il server**: apri `https://docmap.pr-it.it/studio-de/server-php/api.php?r=ping`. Deve rispondere
   `"ok":true`, `"schema":3` e `"app_version"` con la versione nuova.
4. **Verifica dal PC**: aggiorna anche il PC (copia la nuova `docmapv1` sopra la vecchia), poi Sincronizzazione ›
   Server online › **Verifica dopo l'aggiornamento**. Le righe verdi sono a posto; per le gialle e rosse la riga stessa
   dice cosa fare. Se server e PC non coincidono premi **Sincronizza ora**.
5. **Telefoni**: ricarica la pagina. Utente e PIN restano: sono salvati nel browser del telefono, non nei file del server.

**Migrazioni**: non c'è niente da lanciare a mano. Ogni versione nuova di `api.php` aggiunge da sola le tabelle e i campi
che mancano alla prima chiamata, senza togliere niente (regola di [`AGGIORNAMENTI.md`](AGGIORNAMENTI.md)). Lo stesso fa
l'app sul PC con il suo database locale.

## 3. Se qualcosa è andato storto

| Cosa vedi | Cosa è successo | Cosa fare |
|---|---|---|
| `setup.php` dice "C'è già un database: non creo una chiave nuova" | la cartella è stata cancellata e con lei `config.php` | recupera `config.php` dal backup (§2.1 o backup di SiteGround) e rimettilo in `server-php/`: i dati tornano |
| la verifica dice "La chiave del server non corrisponde al database" | `config.php` è stato rigenerato (setup.php rieseguito) | rimetti il `config.php` originale; i dati non sono persi |
| la verifica dice "Il server non trova config.php o la cartella dei dati" | manca `config.php` o il percorso `data_dir` è sbagliato | rimetti `config.php`; **non** rieseguire `setup.php` |
| la verifica dice "Il server è vuoto ma questo dispositivo ha dei dati" | server nuovo, oppure dati sostituiti | se il server aveva dati, vedi le righe sopra; altrimenti **Sincronizza ora** li carica dal PC |
| il browser chiede di nuovo **Primo accesso su questo dispositivo** | utente e PIN stanno nel browser: altro browser, finestra in incognito, dati del sito cancellati, o indirizzo diverso (`www.`, `http://`) | crea di nuovo l'utente: i dati arrivano dal server con il codice di accesso (che puoi anche aggiungere dopo) |

Se non hai nessuna copia di `config.php`, i dati del server non si recuperano, ma ogni PC ne ha una copia completa:
ricomincia con `setup.php` (dopo aver spostato i vecchi `docmap.sqlite*`) e premi **Sincronizza con il server** dal PC
con i dati più recenti.

## 4. Verso l'hub centrale

L'hub Python centrale (licenze, istanze per cliente, backup cifrati) farà questi passi da solo: conserverà le chiavi e le
copie, aggiornerà le istanze e lancerà la stessa verifica. Fino ad allora questa pagina è la procedura (il piano
dell'hub è nel progetto Python, `docs/ROADMAP.md` del suo ramo).
