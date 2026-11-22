# DocMap Hub: aggiornare alla 0.8

Novità della 0.8: i **siti online (web-php)** costruiti dal hub contengono la chiave pubblica del hub e la licenza
corrente dell'installazione, così il server PHP (app 26.12.6) **controlla la licenza** come il server Python.

- **Nuovo cliente** con installazione online: il sito ha già tutto; `setup.php` attiva il controllo da solo.
- **Deploy / promozione**: ogni deploy porta la licenza corrente (sospensione, riattivazione, rinnovo). I due file non
  cambiano l'identità del codice, quindi la promozione staging → production continua a funzionare anche se la licenza
  è cambiata nel frattempo.
- Un'installazione senza licenza emessa, o un hub senza chiave, produce un sito come prima (nessun controllo).

## Passi

Come sempre (`WIKI-HUB.md` §3): chiudi il hub, `run_windows.bat backup`, estrai `DocMap-hub-0.8.zip` e copia il contenuto
sopra `C:\DocMapHub\` (sostituisci i file), `run_windows.bat info` → `DocMap Hub 0.8.0`. Dati, chiavi e cassaforte in
`%APPDATA%\DocMapHub\` non si toccano.

Per un sito già installato (creato con la 0.7) che deve iniziare a controllare la licenza: deploy dalla 0.8, poi aggiungi
`'licence_required' => true,` in `server-php/config.php` del sito (via FTP). Prima di farlo controlla nel pannello che
la licenza dell'installazione sia **valida**: altrimenti il sito passa subito in sola lettura (i dati restano leggibili).
