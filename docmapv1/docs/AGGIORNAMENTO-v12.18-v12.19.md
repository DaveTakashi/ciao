# Da 26.12.18 (v12.18) a 26.12.19 (v12.19) — pronti per il collaudo completo

Versione di **correzioni** trovate rifacendo tutto il percorso vero (hub → cliente nuovo → sito su hosting con FTPS →
telefono → sede → Strumenti → workstation) prima del primo collaudo completo di Dave. **Nessun dato si perde**: nessuna
migrazione dello schema, nessuna chiave del browser nuova, il server del sito cambia solo il numero di versione. L'unico
valore che cambia da solo è la destinazione dei QR di un sito online, e solo se era rimasta quella di partenza (sotto).

Va con **hub 0.14.1** ([`AGGIORNAMENTO-HUB-0.14.1.md`](AGGIORNAMENTO-HUB-0.14.1.md)), Strumenti **0.4.0** (invariati),
gateway workstation **0.1.1**, strumenti di installazione **1.2.1**.

## Cosa cambia

- **Archivio › «Prelevati»** conta anche i faldoni segnati **«Preso»** dal telefono (i movimenti della v12). Prima il
  numero restava a 0 finché non si usava il vecchio «Preleva» del PC; «Reinserito» lo riporta giù.
- **QR aperti dal telefono**: il sito non chiede più `q/brand.js` all'indirizzo sbagliato (era un errore 404 nella
  console a ogni QR, innocuo ma confondeva i controlli). Serve ripubblicare il sito (`.htaccess` nuovo).
- **Indirizzo dei QR sul sito online**: un sito pubblicato dall'hub conosce il suo indirizzo; se la «Destinazione» dei
  QR (Impostazioni) era rimasta quella di partenza (il vecchio sito pilota `…/studio-de/q/…`), diventa
  `https://<dominio>/<cartella-del-cliente>/q/{short_code}`. Così il **manifest per qr7.it** manda ogni etichetta al
  sito giusto. Una destinazione scritta a mano dallo studio non cambia. Serve ripubblicare il sito.
- **Pacchetto della sede**: niente più file `__pycache__` / `.pyc` dentro lo zip (restavano dal controllo della licenza).
- **Zip completo**: le guide in `guide\*.html` ora sono **formattate** (titoli, tabelle, link); nello zip 0.14.0 erano
  testo grezzo. Il nome del file dice tutte le versioni: `DocMap-hub-0.14.1-app-26.12.19-strumenti-0.4.0.zip`.

## Come si aggiorna

1. Copia di sicurezza come sempre (Esporta e Salva › backup), poi `AGGIORNA-DOCMAP.bat` con lo zip nuovo.
2. Sito online: hub › Deploy › **Siti da aggiornare** (porta il `.htaccess` nuovo e il numero di `api.php`).
3. Il PC della sede non deve fare niente di speciale: il prossimo pacchetto dall'hub è già pulito.

## Controllo dopo l'aggiornamento

- `…/server-php/api.php?r=ping` dice `"app_version":"26.12.19"`.
- Dal telefono: segna «Preso» un faldone; sul PC, Archivio, «Prelevati» = 1.
- Impostazioni › Destinazione dei QR: dice l'indirizzo di questo sito seguito da `q/{short_code}`.

## Ritorno indietro

Come ogni versione: `AGGIORNA-DOCMAP.bat ripristina` sul PC; nell'hub, Pubblica con la versione di prima. I dati non
sono cambiati, quindi si torna indietro senza conversioni.

## File

`assets/js/05-views.js` (conteggio «Prelevati»), `assets/js/02-core.js` (versione e destinazione dei QR del sito, in `migrate()`) e `sw.js` (versione), `tools/build_deploy.py`
(regola `q/brand.js` nel `.htaccess` e nell'esempio nginx; `qrDest` in `docmap.config.js`), `server-php/api.php` e `server-python/docmap_server/api.py`
(solo il numero), `installer-windows/docmap_tools.py` (1.2.1, pacchetto senza `__pycache__`), `tools/crea-zip.py`
(guide formattate obbligatorie, nome dello zip con tutte le versioni). Test `tests/v1219.js`, riga nuova in `tests/v129.js`.
