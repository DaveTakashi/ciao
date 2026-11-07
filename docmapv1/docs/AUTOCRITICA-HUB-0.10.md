# Autocritica del hub, secondo giro: nuovo cliente in 5 clic (hub 0.10, 2026-11-06)

Domanda di Dave dopo la 0.9: «25 clic sono comunque tanti: si può fare più rapido, magari con dei template?». Risposta:
sì. Con un modello e l'hosting predefinito un cliente online passa da **24 clic a 5**. Qui sotto: dove andavano i clic,
cosa ho cambiato, come l'ho provato e cosa resta.

## 1. Dove andavano i 25 clic della 0.9

| Fase | Clic | Perché |
|---|---|---|
| Primo avvio del hub | 1 | una volta nella vita del hub, non per cliente |
| Creazione del cliente | 8 | «Nuovo cliente», «Avanti», 5 × «Avanti» nelle maschere, «Conferma». Si scrivevano a mano i 2 indirizzi |
| Messa online | 16 | 4 passi × 4 clic: Pubblica prova, Configura prova, Pubblica produzione, Configura produzione |
| Non contato | 1 modulo per sito | l'accesso FTP (host, utente, password, cartella) era aggiunto da uno script nella prova |

## 2. Cosa ho cambiato (hub 0.10)

| # | Cambio | Effetto |
|---|---|---|
| 1 | **Modelli cliente**: 10 predefiniti (commercialista online / con demo / sede + online / solo sede, studio grande, conto terzi online e sede + online, prova gratuita 30 giorni, cliente di un rivenditore, appliance). Si scelgono nel modulo «Nuovo cliente»; **Salva nel modello**, **Salva come nuovo modello**, rinomina, elimina, «proponi per primo», «ripristina i predefiniti» | le 6 maschere sono già compilate: si scrivono solo nome e P.IVA |
| 2 | **Hosting predefinito** (Impostazioni): dominio + un account FTP + cartella base, una volta sola. Password cifrata con la chiave della cassaforte | indirizzo `dominio/<nome>/`, cartella `/<nome>/` e demo `<nome>-demo` dal nome del cliente («S.r.l.» e simili tolti); nessuna password da scrivere |
| 3 | FTP **personalizzabile**: per un cliente «FTP del cliente» (il suo hosting) e, se serve, **un altro FTP per la demo**; oppure «nessun FTP» (autoinstall a mano) | il caso normale è veloce, le eccezioni restano possibili |
| 4 | **Attiva tutto**: in fila pubblica demo → configura demo → pubblica in produzione la versione provata → configura → controlla. **Solo su cartelle vuote**, stop al primo errore, ogni deploy con backup e ritorno automatico | 16 clic → 2 (il pulsante è anche la conferma, con l'elenco dei passi davanti) |
| 5 | **Kit di consegna**: un solo zip con una lettera di benvenuto per persona (indirizzo, codice, primo accesso), la scheda tecnica (tutti i codici, anche `ponte-sync`), la scheda cliente e le copie di `config.php`. Tenuto in memoria dal hub, mai scritto sul suo disco | 2 download → 1, e le persone hanno già la loro lettera |
| 6 | **Demo facoltativa** nel modello (spunta «Sito demo» nelle maschere: indirizzo e cartella si compilano da soli) | i clienti standard non hanno passi in più |
| 7 | Riga di comando: `cliente da-modello --nome … --attiva --kit-out E:\` fa **tutto in un comando**; `modelli`, `hosting`, `cliente attiva`, `cliente kit` | per l'agente e per le automazioni |

### Difetti trovati nel secondo giro (e corretti)

| Problema | Correzione |
|---|---|
| Due clienti con nomi simili («Studio Neri», «Studio Neri S.r.l.») potevano finire **sullo stesso indirizzo**, cioè sullo stesso database | il modello sceglie una cartella libera (`studio-neri-2`) e le maschere **bloccano** un indirizzo già usato da un altro cliente |
| «Attiva tutto» su un cliente rifatto avrebbe potuto sovrascrivere un sito già in uso | prima di ogni pubblicazione fa la prova: se nella cartella c'è già DocMap si ferma e rimanda a «Pubblica» con il piano |
| Cambiando la passphrase della cassaforte la password dell'hosting sarebbe diventata illeggibile | viene ricifrata insieme agli altri segreti (test) |
| Il kit veniva offerto anche quando «Attiva tutto» si fermava al primo passo (vuoto) | solo se c'è almeno un codice o una copia di config.php |
| Il pacchetto per una cartella locale non creava la cartella del sito nuovo (via FTP sì) | ora la crea come l'FTP (solo se esiste la cartella sopra) |

## 3. Come l'ho provato

- **Test automatici**: 17 nuovi (`hub/tests/test_v10_modelli.py`), con `setup.php` vero su `php -S`: modelli, hosting
  cifrato e ricifrato, indirizzi unici, FTP del cliente e FTP della demo, ordine di «Attiva tutto», stop al primo
  errore, cartella con DocMap non toccata, contenuto del kit. Tutti i 142 test del hub passano.
- **Nel browser** (Playwright) contro **PHP 8.3 vero dietro HTTPS**, con il deploy vero (88 file) e `setup.php` vero:

| Clic | Cosa |
|---|---|
| 1 | Nuovo cliente (nome e P.IVA si scrivono) |
| 1 | modello «Commercialista · online con demo» (0 se è quello proposto) |
| 1 | Crea il cliente |
| 1 | Attiva tutto |
| 1 | Scarica il kit di consegna |
| (1) | Apri il cliente (facoltativo) |

Risultato: sito e demo pubblicati, configurati, controllati; percorso «6 di 6»; kit con 2 lettere, scheda tecnica e
2 copie di `config.php`; nessun codice copiato. **Prima 24 clic per cliente (più il modulo FTP), ora 5** (4 con il
modello proposto). Dalla riga di comando: 1 comando.

## 4bis. Terzo giro (hub 0.10.1, 2026-11-07)

Riletto il codice nuovo cercando i casi in cui si perde qualcosa o si tocca il sito sbagliato.

| Problema | Correzione |
|---|---|
| Le copie di `config.php` (chiave del database) esistevano **solo nel kit appena fatto**: chiudendo la finestra, riavviando il hub o dopo 40 attività la copia era persa (e senza custodia l'hub non la conserva) | il **Kit di consegna** dalla scheda del cliente (o `cliente kit`) **riprende le copie dai siti via FTP**; se un sito non risponde il kit lo dice (LEGGIMI e scheda tecnica). Perdere il kit non è più un problema |
| «Attiva tutto» si fermava solo se nella cartella c'era **DocMap**: in una cartella con **un altro sito** (nome già usato sull'hosting) avrebbe aggiunto i suoi file | si ferma se la cartella **non è vuota**, qualunque cosa contenga; il sito che c'era resta com'è (test) |
| Il passo «Controlla che risponda» interrogava **tutti i siti di tutti i clienti** (lento con centinaia di clienti) | controlla solo il sito appena attivato |
| Doppio clic o seconda scheda su «Attiva tutto» avrebbero avviato **due pubblicazioni insieme** | un solo «Attiva tutto» per cliente: il secondo segue quello già in corso |

Prova: 145 test del hub (3 nuovi), verifica veloce completa; kit rifatto con `cliente kit` su un cliente della
simulazione: due copie di `config.php` riprese dai siti.

## 4. Cosa resta (onesto)

- **Da provare davvero** (righe C1–C6 in `COLLAUDO-REALE.md`): l'hosting predefinito su SiteGround in FTPS, la cartella
  del cliente creata dall'FTP, «Attiva tutto» su un sito vero, il kit stampato.
- Con l'hosting predefinito su un **sottodominio comune** (`docmap.pr-it.it/<cliente>/`) non serve più niente sul
  pannello di SiteGround per cliente: la cartella la crea il deploy, l'SSL è quello del dominio, l'FTP è uno. Un
  **dominio del cliente** (`archivio.studiorossi.it`) invece richiede ancora dominio, SSL e account a mano.
- La **sede** resta il passo più lungo (Windows: `installa.bat`). Il kit porta già il codice `ponte-sync` nella scheda
  tecnica; prossimo: il pacchetto della sede che lo contiene cifrato, così la chiavetta sparisce.
- Il kit contiene codici in chiaro: va consegnato in modo sicuro e cancellato dopo (lo dicono il kit e la pagina).
- Da provare su SiteGround (C7 in `COLLAUDO-REALE.md`): rifare il kit dalla scheda e trovare le copie di config.php.
