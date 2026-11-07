# Changelog di DocMap

Un solo elenco per tutti i componenti. Dettagli e istruzioni nelle guide `docs/AGGIORNAMENTO-*.md`.
Formato: versione · data · cosa cambia per chi la usa · dati/server.

## Da rilasciare

- (niente)

## 2026-11-06 — app 26.12.6, hub 0.8, consolidamento

- **Consolidamento** (2026-11-06): un solo ramo con app, server Python, installatore e hub; `tools/verifica-veloce.sh`,
  `tests/smoke.js`, CI pronta (`ci/docmap-ci.yml`), `CLAUDE.md`, `STATO.md`, questo file, `docs/RILASCIO.md`,
  `docs/COLLAUDO-REALE.md`. Nessuna modifica all'app né ai dati.

## App (PC, web, telefono) e server web

| Versione | Data | Novità | Dati / server |
|---|---|---|---|
| 26.12.7 (v12.7) | 2026-11-06 | `setup.php` propone una cartella dati **per ogni sito** (prima tutti i siti di un dominio ricevevano la stessa) e risponde in JSON al hub 0.9 («Configura il sito») | solo `server-php/setup.php`; nessuna migrazione (`AGGIORNAMENTO-v12.6-v12.7.md`) |
| 26.12.6 (v12.6) | 2026-11-06 | «Primi passi» nell'Archivio (7 passi rilevati dai dati, con guida), stato della sincronizzazione anche sul PC da `file://` («sincronizzato 5 min fa»), aggiornatore `AGGIORNA-DOCMAP.bat` (copia di sicurezza + ripristino), avviso licenza giallo/rosso, messaggi di licenza in italiano, aiuto «Licenza» e «Primi passi», bozze commerciali | `api.php` controlla la licenza solo con `licence_required` (siti del hub 0.8); nessuna migrazione |
| 26.12.5 (v12.5) | 2026-11-03 | selezione della modifica massiva che resta tra le ricerche, «Solo selezionati», colonna colore dopo la categoria, «Stampa solo queste N etichette», «Modifica i selezionati» negli archivi | nessuna modifica |
| 26.12.4 (v12.4) | 2026-11-03 | 👁 mostra password, codice di accesso al server facoltativo, «Verifica dopo l'aggiornamento», `setup.php` non crea una chiave nuova se esiste già un database | procedura `AGGIORNARE-IL-SERVER.md` |
| 26.12.3 (v12.3) | 2026-11-03 | stampa dei QR delle ubicazioni, etichettatrici a rotolo (~50 formati), striscia ubicazione + faldoni, QR + campo a scelta, 6 fogli Avery piccoli | nessuna |
| 26.12.2 (v12.2) | 2026-11-02 | avvisi che non si sovrappongono, motivi precisi di «Accesso negato», popup QR a una colonna sul telefono, conferma per azioni su ≥10 faldoni, ruoli visualizzatore/editor/admin | nessuna |
| 26.12.1 (v12.1) | 2026-11-02 | faldoni annidati nelle scatole, archivi e stati nella ricerca del telefono | `api.php` aggiornato, nessuna migrazione |
| 26.12.0 (v12) | 2026-11-02 | stati e prestiti con verifica del rientro, archivi e «Configura archivio», ubicazioni annidate, Web NFC, nuova ricerca, accesso ricordato sul telefono, registro accessi | locale schema 9, server schema 3 |
| 26.11.1 (v11.1) | 2026-11-01 | documentazione (indice, manuale, collaudo, Python), colore/tag dei clienti conservati | nessuna |
| 26.11.0 (v11) | 2026-11-01 | QR delle ubicazioni e modalità associazione, manifest con `;` finale, sync multi-dispositivo con registro | locale schema 8, server schema 2 |
| v10.1 | 2026-11-01 | database online su SiteGround (`server-php/api.php`), telefoni che salvano online | server schema 1 |
| v10 | 2026-11-01 | regole colore modificabili, import CSV unico (clienti + un faldone ciascuno) | locale schema 6 |
| v2–v9 | 2026-10/11 | MVP: archivio, mappa scaffali, motore etichette millimetrico, Codice Multi, registro clienti, foto armadi, modelli etichetta, PDF | — |

## Hub (PC di Dave)

| Versione | Data | Novità |
|---|---|---|
| 0.10.1 | 2026-11-07 | terzo giro di autocritica (`AUTOCRITICA-HUB-0.10.md` §4bis): il kit rifatto dalla scheda riprende le copie di `config.php` dai siti via FTP (perdere il kit non fa perdere la chiave); «Attiva tutto» si ferma su cartelle non vuote (anche un altro sito), controlla solo il sito attivato, uno per cliente alla volta. Registro invariato (schema 4) |
| 0.10 | 2026-11-06 | secondo giro di autocritica (`docs/AUTOCRITICA-HUB-0.10.md`): **modelli cliente** (10 predefiniti; salva nel modello / come nuovo / elimina / proponi / ripristina), **hosting predefinito** (dominio + FTP una volta, password cifrata), FTP del cliente e FTP della demo personalizzabili, **Attiva tutto** (solo cartelle vuote, stop al primo errore), **kit di consegna** (lettere di benvenuto, scheda tecnica, copie di config.php, mai su disco), demo facoltativa, indirizzi mai condivisi tra clienti, `cliente da-modello --attiva`. Cliente online: 24 clic → 5. Registro **schema 4** (solo la tabella `customer_templates`, copia automatica prima) |
| 0.9 | 2026-11-06 | dall'autocritica del hub (`docs/AUTOCRITICA-HUB-0.9.md`): **Nuovo cliente** guidato senza AI, **Percorso del cliente** con prossimo passo e pulsante (anche in Panoramica), **Configura il sito** (setup.php lanciato dal hub, codici in cassaforte), licenza **inviata subito** ai siti dopo ogni cambio (`licence push`), **Siti da aggiornare** in fila con stop al primo errore (`aggiorna-siti`), `cliente percorso`, avviso backup solo su questo PC. Registro invariato |
| 0.8 | 2026-11-06 | i siti online portano chiave pubblica e licenza corrente (ogni deploy consegna sospensioni e rinnovi), senza cambiare l'identità del codice per la promozione |
| 0.7 | 2026-11-05 | licenze a distanza (sospendi/riattiva/revoca/modifica), rinnovo automatico breve, canale delle licenze, esportazione cifrata `.docmap-hub` |
| 0.6 | 2026-11-05 | deploy e promozione dal gestionale con rollback automatico, cassaforte e segreti per sito, backup automatici |
| 0.5 | 2026-11-04 | «Crea progetto con AI», postazioni con nome |
| 0.4 | 2026-11-04 | nuovo gestionale per cliente, ricerca Ctrl+K, «Ricorda su questo PC» |
| 0.3.x | 2026-11-03 | `cliente nuovo` in un comando, sync automatica sede ⇄ web, accesso automatico, porta che non si scontra |
| 0.2 | 2026-11-03 | ambienti staging/prod/demo, cassaforte, porte, deploy FTP/SFTP con rollback |
| 0.1 | 2026-11-02 | chiavi Ed25519 e licenze firmate |

## Server Python e installatore Windows

| Versione | Data | Novità |
|---|---|---|
| server 1.0.0 / strumenti 1.2.0 | 2026-11-03 | parità con PHP 26.12.5, chiavi fidate da file, pacchetto personale per cliente, licenza automatica, ponte web ⇄ sede |
| strumenti 1.1.0 | 2026-11-03 | backup cifrati `.docmap-backup`, Kit di emergenza, verifica settimanale dei backup |
| server (F1–F5) | 2026-11-02 | porting 1:1 di `api.php`, suite completa verde contro Python, `sync-remote` |
