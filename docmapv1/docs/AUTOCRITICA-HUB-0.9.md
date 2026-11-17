# Autocritica del hub: analisi, prove, correzioni (hub 0.9, 2026-11-06)

Domanda di Dave: «siamo sicuri che l'Hub Center sia semplice, lineare, solido, ben documentato e pronto a scalare come
prodotto?». Risposta breve: **no, non lo era abbastanza**. Funzionava, ma chiedeva troppi passaggi a mano, copiava
codici segreti a mano, non diceva mai «adesso fai questo», e aveva un difetto vero sulla cartella dati dei siti. Qui
sotto: come l'ho provato, cosa ho trovato, cosa ho corretto, cosa resta.

## 1. Come l'ho provato

Non solo test automatici: ho **simulato un hosting vero** sul server di sviluppo (PHP 8.3 reale dietro HTTPS con un
certificato, cartelle `public_html/<sito>` come su SiteGround) e ho fatto i percorsi come li farebbe Dave:

1. hub nuovo → cliente nuovo con sito online e staging → deploy staging → `setup.php` → promozione → `setup.php` di
   produzione, prima dalla riga di comando (come dice la guida), poi **dalla pagina del hub nel browser** (Playwright),
   contando i clic;
2. sospensione della licenza → cosa risponde il sito;
3. secondo cliente sullo stesso dominio → cosa propone `setup.php`;
4. nuova versione → quanti passaggi per aggiornare tutti i siti.

Non si può simulare qui: Windows (installatore, DPAPI, servizi), SiteGround vero (FTPS, `.htaccess`, layout delle
cartelle), telefoni e stampanti. Quelle righe restano in `COLLAUDO-REALE.md`.

## 2. Cosa ho trovato

| # | Problema | Gravità | Prova |
|---|---|---|---|
| 1 | `setup.php` proponeva a **tutti i siti dello stesso dominio la stessa cartella dati** (`docmap-data` accanto a `public_html`). Con il modello «un sito per studio sotto docmap.pr-it.it» il secondo studio trovava il database del primo e si bloccava; se il primo non l'aveva ancora creato, due studi avrebbero scritto nello stesso file con chiavi diverse | **alta** (dati) | staging e produzione di Studio Rossi ricevevano la stessa proposta |
| 2 | Dopo ogni deploy: aprire `setup.php`, scrivere le persone, **copiare a mano 2+ codici segreti**, scaricare `config.php`, salvarli con comandi `vault set` / `cliente token-ponte --salva`. Due volte (prova e produzione) | alta (attrito + errori) | ~11 azioni per sito, 3 segreti a mano |
| 3 | **Sospendere una licenza non sospendeva il sito**: il sito restava «Licenza valida» finché non rifacevi il deploy o il canale (se impostato) la consegnava | **alta** (controllo commerciale) | dopo `licence suspend` il ping diceva `"mode":"full"` |
| 4 | Il pulsante «Nuovo cliente» creava solo l'anagrafica; il percorso guidato (maschere, licenze, pacchetti, siti) era raggiungibile solo **passando da un'AI esterna** (copia prompt → chat → incolla JSON) | media | per un cliente servivano ~18 azioni + una chat |
| 5 | Nessun «a che punto sono»: per ogni cliente bisognava ricordarsi quali passi mancavano (deploy? setup? ponte?) | media (scala) | con 50 clienti è ingestibile |
| 6 | Nuova versione = deploy a mano sito per sito | media (scala) | N siti = 3N clic |
| 7 | Documentazione in ritardo: il README del hub diceva 0.5, la guida «nuovo cliente» partiva da 5 comandi da riga di comando che la pagina fa già in un modulo | bassa | — |
| 8 | Backup del hub solo sullo stesso PC, senza avviso | media | nessuna segnalazione in Panoramica |

## 3. Cosa ho corretto (hub 0.9 + app 26.12.7)

| # | Correzione | Verificata |
|---|---|---|
| 1 | `setup.php`: cartella **per sito** (`docmap-data/<sito>`), avviso se nella vecchia cartella comune c'è un database | PHP vero: due siti → due cartelle |
| 2 | **Configura il sito**: l'hub lancia `setup.php` (modalità JSON) e mette i codici **in cassaforte**: `admin`, `ponte-sync` se c'è la sede, le persone del progetto. `config.php` in cassaforte solo con custodia autorizzata, altrimenti un pulsante per scaricarlo e consegnarlo | PHP vero: codici salvati, token valido sull'API, mai due volte |
| 3 | **Licenza ai siti subito**: dopo sospendi/riattiva/rinnova/modifica l'hub carica la licenza via FTP su ogni sito online dell'installazione e legge cosa risponde | PHP vero: «sola lettura» dopo la sospensione, «valida» dopo la riattivazione, in pochi secondi |
| 4 | **Nuovo cliente** = percorso guidato senza AI (nome, P.IVA, sito/sede → 6 maschere → conferma). Resta «Solo anagrafica» per le trattative e l'AI per chi ha il JSON | browser |
| 5 | **Percorso del cliente**: passi fatti e **prossimo passo con il suo pulsante** (Pubblica, Configura, Pubblica in produzione, Controlla…). In Panoramica una riga per ogni cliente a metà | browser: percorso completato seguendo solo il pulsante |
| 6 | **Siti da aggiornare**: elenco dei siti di produzione più vecchi della versione del hub, aggiornati in fila con backup e ritorno automatico, **stop al primo errore** | test automatico |
| 7 | Guide riallineate: README del hub, `GUIDA-NUOVO-CLIENTE.md` (prima la pagina, poi la riga di comando), wiki, `AGENTE-OPERATIVO.md` | — |
| 8 | Panoramica: avviso «backup solo su questo PC» finché non scegli una seconda cartella | browser |

### Passaggi prima e dopo (cliente nuovo con sito online + staging, misurato)

| | Prima (0.8) | Dopo (0.9) |
|---|---|---|
| Creare cliente, licenze, siti | ~18 azioni + chat con un'AI | 1 modulo + 6 «Avanti» + Conferma |
| Pubblicare e configurare prova e produzione | ~28 azioni, 2 volte `setup.php` nel browser | 4 pulsanti del percorso (+ conferma del piano) |
| Segreti copiati a mano | 6 (2 token × 2 siti + 2 config.php) | **0** (solo il download di `config.php` per il cliente) |
| Totale misurato nel browser | ~46 azioni | **25 clic**, dal primo avvio del hub al percorso completato |
| Sospendere un cliente | effetto al prossimo deploy / canale | effetto in secondi (verificato) |
| Aggiornare 50 siti | ~150 clic | 2 clic + attesa |

## 4. Cosa resta (onesto)

- **Sede (PC dello studio)**: resta il passo più lungo (installa.bat, ~10 domande, Kit di emergenza, certificato sui
  telefoni, `configura-sync.ps1` con il token del ponte su chiavetta). È Windows: non l'ho potuto simulare. Prossimo
  miglioramento: il pacchetto della sede che porta già il token del ponte cifrato, così sparisce la chiavetta.
- **Hosting**: creare cartelle, SSL e account FTP su SiteGround resta a mano (SiteGround non offre un'API per questo).
- **Codici delle persone**: sono in cassaforte, ma consegnarli a ognuno è ancora a mano. Prossimo: una «lettera di
  benvenuto» stampabile per persona con il QR del primo accesso.
- **Da provare davvero** (righe aggiunte in `COLLAUDO-REALE.md`): «Configura il sito» e «Invia ai siti» su SiteGround
  in FTPS; la cartella proposta da `setup.php` con il `DOCUMENT_ROOT` reale di SiteGround.
- **Scala commerciale**: con 390–890 €/anno per studio, «centinaia di migliaia di euro l'anno» vogliono dire
  **250–500 studi**. Con la 0.9 un cliente online si attiva in pochi minuti e le operazioni ricorrenti (rinnovi,
  sospensioni, aggiornamenti) sono di massa. Mancano ancora, in ordine di impatto: (1) installazione in sede senza
  chiavetta, (2) pannello per i rivenditori (ognuno gestisce i suoi clienti), (3) incassi e rinnovi collegati ai
  pagamenti, (4) l'hub su un server (oggi è sul PC di Dave: un solo operatore, un solo punto di rottura, mitigato dai
  backup e dall'esportazione cifrata).

## 5. Per chi riprende il lavoro

Codice nuovo: `hub/docmap_hub/sitesetup.py` (configura sito, licenza ai siti, aggiornamento in fila),
`hub/docmap_hub/journey.py` (percorso), pagina in `hub/docmap_hub/ui/app.js` (cerca «v0.9»), `server-php/setup.php`
(modalità JSON e cartella per sito). Test: `hub/tests/test_v09_percorso.py` (usa PHP vero se c'è).
