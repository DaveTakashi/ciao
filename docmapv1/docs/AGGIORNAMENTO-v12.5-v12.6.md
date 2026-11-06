# Aggiornare DocMap dalla v12.5 alla v12.6 senza perdere i dati

La v12.6 (**26.12.6**) non ha migrazioni: stessi dati, schema locale 9, schema server 3. Cambiano i file del programma,
`server-php/api.php` e `server-php/setup.php`. Novità:

- **Primi passi**: in cima all'Archivio un riquadro con 7 passi (nome dello studio, clienti, primo faldone, foglio di
  prova, prime etichette, backup, server facoltativo). Si spuntano da soli; **Guidami** avvia la guida. **Nascondi** lo
  toglie (si ritrova in Impostazioni › Dati e sicurezza › Informazioni su DocMap). Manuale §20.
- **Stato della sincronizzazione sempre visibile**: anche sul PC aperto da `file://`, se hai configurato «Sincronizza
  con il server», in alto compare «Server: sincronizzato 5 min fa» oppure «3 da inviare al server».
- **Aggiornamento con un doppio clic sul PC**: `AGGIORNA-DOCMAP.bat` nella cartella di DocMap (manuale §12). Da questa
  versione in poi le prossime si installano così.
- **Licenza controllata anche dal sito online** (solo per i siti costruiti dal hub 0.8, che contengono
  `server-php/trusted_keys.json`). Licenza scaduta oltre la tolleranza, sospesa o revocata → il sito non accetta
  modifiche ma lascia leggere, cercare ed esportare tutto; nell'app compare un avviso giallo o rosso (manuale §21).
  **I siti fatti a mano, come `studio-de`, non cambiano**: senza `'licence_required' => true` in `config.php` il
  controllo è spento.

## Passi (studio-de, sito esistente)

1. Backup: **Salva backup** sul PC e **Sincronizza con il server**.
2. Server: carica `deploy/studio-de/` **sopra** la cartella del sito (senza cancellarla, senza toccare `config.php` né la
   cartella dati, senza rieseguire `setup.php`). `server-php/api.php?r=ping` deve dire `"app_version":"26.12.6"`.
3. PC (dalla v12.5): estrai lo zip **sopra** la cartella di sempre come le altre volte (questa è l'ultima volta a mano:
   l'aggiornatore arriva con questa versione). Poi riapri `index.html`: **Informazioni su DocMap** → **26.12.6**.
4. **Verifica dopo l'aggiornamento** (Sincronizzazione › Server online): tutte le righe verdi. Ricarica i telefoni.

Ritorno indietro: rimetti la cartella vecchia (o `AGGIORNA-DOCMAP.bat ripristina` dalle prossime versioni) e,
sul sito, l'`api.php` della v12.5. Nessun dato da convertire.

## Siti nuovi fatti dal hub (0.8)

Il hub mette nel sito la sua **chiave pubblica** e la **licenza** dell'installazione; `setup.php` vede la chiave e scrive
`'licence_required' => true` in `config.php`. Ogni **deploy** consegna anche la licenza corrente (una sospensione, una
riattivazione o un rinnovo arrivano così); se la licenza ha l'indirizzo del canale, il sito lo legge da solo al massimo
ogni 6 ore. Per un sito già installato che deve iniziare a controllare la licenza: deploy dal hub 0.8, poi aggiungi a
mano `'licence_required' => true,` in `server-php/config.php`.

## Per chi sviluppa

- `api.php`: blocco `licence` (funzioni `lic_*`), stesse risposte del server Python (test `server-python/tests/diff_licence_test.py`,
  201 confronti PHP ⇄ Python) e, solo PHP, la licenza fornita col sito (`server-php/licence.docmap-licence`) installata
  quando è più recente. Richiede l'estensione `sodium` (presente in PHP 7.2+).
- App: `assets/js/06o-licence.js` (avviso + messaggi + stato sync su `file://`), `06p-firststeps.js`, `css-licence.css`,
  `css-firststeps.css`. Test `tests/v126.js` (con un `api.php` vero).
- `tools/build_deploy.py --trusted-keys --licence`, `AGGIORNA-DOCMAP.bat` + `tools/aggiorna-app.ps1`.
