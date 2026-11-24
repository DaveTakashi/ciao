# Strumenti: ricette per i documenti (versione 0.1.0)

> Per chi usa gli Strumenti (Dave, operatori, amministratori) e per chi li sviluppa. Parte 1 in italiano semplice,
> parte 2 tecnica. Il codice sta in `strumenti/`; il manuale per sviluppatori è [`../strumenti/README.md`](../strumenti/README.md).

## Parte 1 — Per chi lo usa

### 1.1 Cosa sono

Gli **Strumenti** lavorano su cartelle di file: scansioni TIFF, PDF, immagini, testi, tabelle. Fanno cose come:

- dividere un PDF o un TIFF di molte pagine in pagine o in documenti;
- leggere il testo (OCR, anche di dattiloscritti) e trovare numeri, date, importi, partite IVA, codici fiscali, IBAN;
- mettere ogni file nella cartella giusta (per numero di fattura, per cliente, per tipo);
- convertire tra formati (PDF, TIFF, PNG, JPEG, WEBP, testo, Markdown, CSV, Excel, JSON);
- pulire le scansioni (raddrizzare, bianco e nero, contrasto, TIFF G4 leggeri);
- chiedere a una persona **solo i casi incerti**, con una schermata veloce da tastiera;
- chiamare un'AI (Claude, servizi compatibili OpenAI, Ollama sul PC) o un servizio vostro (per esempio un server Python).

Ogni lavoro si descrive con una **ricetta**: una lista di **passi**, ognuno è un **blocco** (20 blocchi base) con le sue
impostazioni. Combinando i blocchi si coprono centinaia di casi. Ci sono **11 ricette pronte** da copiare e adattare.

Gli Strumenti sono un programma a parte (non cambiano l'archivio né i suoi dati). Si aprono nel browser del PC.
Il collegamento con l'app (sezione «Strumenti» per l'amministratore) arriverà in una versione successiva.

### 1.2 Avvio su Windows

1. Serve Python 3.10 o più recente (consigliato 3.13), lo stesso dell'hub.
2. Doppio clic su `strumenti\AVVIA-STRUMENTI.bat`. La prima volta prepara l'ambiente (qualche minuto), poi apre il
   browser all'indirizzo `http://127.0.0.1:8091/#k=…`. La chiave dopo `#k=` protegge la pagina: non condividerla.
3. I dati (ricette, lavori, impostazioni, registro) stanno in `%APPDATA%\DocMapStrumenti\`. Si può scegliere un'altra
   cartella con `--dati` o con la variabile `DOCMAP_STRUMENTI_DIR`.

**OCR con Tesseract (consigliato).** Senza Tesseract gli Strumenti leggono il testo dei PDF digitali, dei file di testo e
delle tabelle, e possono usare l'AI o un servizio esterno; per le scansioni serve un motore OCR. Su Windows: installare
Tesseract (installer «UB Mannheim»), con la lingua **italiana**. Gli Strumenti lo trovano da soli in
`C:\Program Files\Tesseract-OCR\`; altrimenti si scrive il percorso in Impostazioni › Lettura.

### 1.3 Le schermate

- **Ricette**: elenco delle vostre ricette e di quelle pronte. «Usa questa» crea una copia vostra.
- **Editor**: i passi uno sotto l'altro. Per ogni passo: apri, sposta, duplica, spegni, elimina; «Aggiungi un passo» mostra
  i blocchi per categoria con la spiegazione. Ogni salvataggio crea una **versione nuova** (le vecchie restano).
- **Prova**: scegli un file di esempio (dal PC o caricato) e vedi cosa fa ogni passo: testo letto, campi trovati con la
  loro affidabilità, dove finirebbe il file. **La prova non tocca niente**: lavora su una copia.
- **Esegui**: cartella di partenza, cartella di arrivo, nome del lavoro, dove eseguirlo (qui o sul server remoto).
- **Lavori**: la coda, l'avanzamento, i risultati, «Scarica» (zip), «Annulla», «Riprendi».
- **Verifica**: i documenti da controllare, uno alla volta, con l'immagine accanto ai campi.
- **Impostazioni**: lettura (OCR), AI, servizi esterni, esecuzione remota, crediti, tasti, sistema.

### 1.4 La verifica veloce

Quando una ricetta ha il passo «Verifica a mano», il lavoro si **ferma** dopo quel passo e i documenti incerti (o tutti,
se scelto) vanno in Verifica. Per ognuno: l'immagine, i campi letti con la percentuale di affidabilità (verde, giallo,
rosso), i valori alternativi trovati, i motivi del dubbio.

| Tasto (predefinito) | Cosa fa |
|---|---|
| `↓` o `J` / `↑` o `K` | documento successivo / precedente |
| `Invio` | **certifica** i valori (anche dentro un campo appena corretto) e passa al successivo |
| `E` | modifica il primo campo |
| `1` … `9` | sceglie una delle risposte pronte (per esempio il tipo di documento) |
| `Maiusc` + `1` … `9` | aggiunge o toglie un tag |
| `X` | scarta il documento (non va nella cartella di arrivo; resta nel report come scartato) |
| `U` | annulla l'ultima azione |
| `+` / `-` / `0` | ingrandisci, rimpicciolisci, adatta |
| `PagGiù` o `N` / `PagSu` o `P` | pagina successiva / precedente del documento |
| `?` | l'elenco dei tasti |

I tasti si cambiano in Impostazioni › Tasti. Un valore **certificato** non viene mai più sovrascritto da una macchina: il
valore della macchina resta visibile accanto. Ogni azione finisce nel **registro** (chi, quando, prima e dopo) con una
catena di impronte che rivela modifiche fatte a mano al registro. Finita la verifica, «Riprendi» completa il lavoro.

### 1.5 Esempi (ricette pronte)

| Ricetta | Cosa fa |
|---|---|
| Fatture TIFF in una cartella per numero | raddrizza, legge, trova numero e data, verifica i dubbi, copia l'originale in `<numero>/`, report Excel |
| PDF multipagina in pagine singole | un PDF per pagina, nome `<file>_p001.pdf` |
| TIFF multipagina in PNG | una PNG per pagina |
| PDF scansionato in fatture | divide un PDF unico dove cambia il numero di fattura (o alle pagine bianche) |
| Immagini in un PDF | unisce le immagini di ogni cartella in un PDF |
| Scansioni leggere (TIFF G4) | bianco e nero, raddrizzate, compresse G4 |
| Documenti per tipo | classifica (fattura, contratto, F24, …) con parole chiave e mette in cartelle |
| Cerca parole e report | cerca parole (anche con errori di OCR e senza accenti), tag, report |
| Doppia lettura del numero | due letture diverse, se non concordano va in verifica |
| Assegna a mano | una persona sceglie tipo e tag con i tasti `1`–`9` |
| Tabelle in Excel | CSV, JSON e simili in Excel |

### 1.6 Variabili nei nomi

Nei nomi di cartelle e file si scrivono le variabili tra graffe: `{numero}/{file}`, `{cliente|slug}/{anno}/{name}_{page:03}.pdf`.

- Del file: `{file}` (nome con estensione), `{name}` (senza), `{ext}`, `{src_dir}` (sotto-cartella di partenza), `{page}`,
  `{pages}`; del lavoro: `{date}`, `{time}`, `{job}`; i campi letti: `{numero}`, `{data}`, …; `{cls}` (tipo), `{n:04}`
  (contatore 0001, 0002, …).
- Filtri: `|upper`, `|lower`, `|title`, `|slug`, `|digits`, `|trim`, `|first:5`, `|last:4`, `|pad:6`, `|default:SENZA`.
- Un valore diventa sempre **un solo nome** (una `/` dentro un numero come `12/2024` diventa `12_2024`): nessun valore
  può creare cartelle o uscire dalla cartella di arrivo.
- Se un campo manca il file va in `_senza-valore/` (o in `_da_verificare/` se il documento era da verificare).

### 1.7 Dove gira il lavoro: qui, sul server, o in automatico

Un PC lento può mandare il lavoro al **server remoto** (per esempio il server di Dave): Impostazioni › Esecuzione
remota, indirizzo e gettone. Per ogni ricetta: «qui», «sul server» o «automatico» (sul server se i file superano N MB, o
sempre). I file partono in uno zip, il server esegue la stessa ricetta, i risultati tornano nella cartella di arrivo; la
verifica dei documenti si fa lo stesso dal PC. Cosa è permesso lo decide la licenza (`licence.modes`).

Sul server: `python -m docmap_strumenti serve --remote --host 0.0.0.0 --cert cert.pem --key key.pem`, e un **gettone per
cliente**: `python -m docmap_strumenti token crea --cliente studio-rossi --crediti 5000`. Un cliente con il gettone può
solo mandare zip e vedere i propri lavori: non vede le cartelle del server, le impostazioni, né i lavori degli altri.

### 1.8 Crediti

Ogni azione costosa consuma crediti: pagina elaborata 0, pagina letta con OCR 1, chiamata AI 10, chiamata a un servizio
1 (costi modificabili in Impostazioni › Crediti). Ogni gettone può avere un tetto al mese; finiti i crediti il lavoro si
ferma con un messaggio chiaro (i file già fatti restano). `consumi` e la scheda Crediti mostrano i consumi per cliente e
per mese. I prezzi in euro non stanno qui: stanno solo nel listino (`hub/docmap_hub/plans.json`).

### 1.9 Privacy

Con OCR locale (Tesseract) i documenti non lasciano il PC. Con l'AI o un servizio esterno il documento (immagine e/o
testo) va a quel fornitore: serve la nomina a responsabile (bozze GDPR in `docs/commerciale/`). Ollama sul PC tiene tutto
in sede. Le chiavi e i gettoni stanno solo in `impostazioni.json` (mai nelle ricette, mai mostrati nel browser).

## Parte 2 — Tecnica

### 2.1 Architettura

```
browser (ui/index.html, app.js) ──HTTP+X-Key──▶ server.py ──▶ jobs.Queue ──▶ engine.Engine ──▶ blocks/*
                                                   │                │             │
                                                   │                │             └─ providers (OCR, AI, HTTP), media, validators
                                                   │                └─ strumenti.sqlite: jobs, ledger, tokens, audit
                                                   └─ remote.py ──HTTP+Bearer──▶ un altro server.py --remote
```

- Solo libreria standard per il server (`ThreadingHTTPServer`); dipendenze: Pillow, pypdf, pypdfium2, numpy, openpyxl
  (facoltative: reportlab per testo→PDF, python-docx, Tesseract come programma esterno).
- Pagina senza risorse esterne, CSP `script-src 'self'`; in locale la chiave in `chiave-locale.txt` (fragment `#k=`,
  header `X-Key`) e controllo dell'header Host (contro il DNS rebinding).

### 2.2 Formato della ricetta (`docmap-ricetta/1`)

```json
{"format": "docmap-ricetta/1", "id": "fatture-tiff-per-numero", "version": 3, "name": "…", "description": "…",
 "input": {"patterns": ["*.tif", "*.tiff"], "recursive": true}, "run_on": "local|remote|auto", "vars": {},
 "steps": [{"id": "leggi", "block": "ocr", "with": {"engine": "auto"}, "when": "ext in tif,tiff", "enabled": true}]}
```

Salvate in `ricette/<id>/vN.json`: ogni versione resta, «archivia» sposta la cartella in `_archiviata-<id>-<data>`.
`RC.validate` controlla blocchi, parametri (tipi, scelte, minimi e massimi, espressioni regolari) e condizioni, con
messaggi in italiano.

**Condizioni** (`when`): `campo == valore`, `!=`, `~ regex`, `!~`, `>`, `<`, `>=`, `<=`, `is empty`, `is not empty`,
`in a,b,c`, unite con `and` / `or`. Campi speciali: `pages`, `page`, `ext`, `cls`, `text`, `tags`, `status`,
`conf.<campo>`.

### 2.3 Il documento in lavorazione (Item)

`id, path, src, page, pages, text, text_conf, text_by, fields{nome: {v, conf, by, certified, choices, alt, machine}},
tags, cls, status (ok|review|error|skip), flags, out, group, meta, log`. Un errore in un file mette solo quel file in
`error`: gli altri continuano.

### 2.4 I blocchi

| Categoria | Blocchi |
|---|---|
| File e cartelle | `filter`, `rename` (anche sul posto, con `rinominati.csv` per tornare indietro) |
| Pagine e segmenti | `split_pages`, `segment` (ogni N pagine, pagina bianca, parola, cambio di valore, campo), `merge` |
| Conversione | `convert` (pdf, tiff, png, jpeg, webp, txt, md, csv, xlsx, json, jsonl), `image` (raddrizza, ruota, ritaglia, grigi, bianco e nero Otsu, contrasto, rumore, nitidezza, dimensione) |
| Lettura | `ocr` (auto, text, tesseract, ai, remote, mock), `search` (fuzzy, senza accenti, tag) |
| Campi e dati | `extract` (regex, after, between, keyword, number_range, date, amount, piva, cf, iban, email, filename, ai), `classify`, `lookup` (CSV/Excel), `set`, `tag` |
| Controllo | `check` (obbligatori, affidabilità minima, regole, concordanza di più letture, univocità), `review` (pausa per la verifica a mano) |
| Esterni | `ai` (più campi con affidabilità, classe, tag), `http` (servizio vostro) |
| Uscita | `route` (copia o sposta, più destinazioni, conflitti), `report` (xlsx, csv, json, jsonl, md) |

`python -m docmap_strumenti blocchi` li elenca; l'interfaccia genera i moduli dai parametri (`registry.P`).

### 2.5 Contratto di un servizio esterno (blocco `http`, OCR `remote`)

In Impostazioni › Servizi esterni: nome → `{url, token, timeout, max_mb}`. Richiesta `POST` JSON con
`Authorization: Bearer <token>`:

```json
{"op": "estrai", "id": "…", "src": "fatture/a.tif", "page": 1, "fields": {"numero": "12"}, "tags": [], "cls": "",
 "extra": {"cliente": "Rossi"}, "text": "… (se send_text)", "file": {"name": "a.tif", "data": "<base64>"}}
```

Risposta JSON (tutto facoltativo): `fields` (`{"numero": {"value": "12", "confidence": 0.93}}` o `{"numero": "12"}`),
`text` + `conf`, `tags`, `cls`, `file` (`{"name", "data"}` base64: sostituisce il file), `flags` (motivi per la verifica).
Per l'OCR remoto (`op: "ocr"`): `{"text": "…", "conf": 0.88, "words": […]}`.

### 2.6 API del server

Locale (header `X-Key`): `GET /api/info`, `blocks`, `templates`, `recipes`, `recipes/<id>`, `settings`, `usage`,
`jobs`, `jobs/<id>`, `jobs/<id>/items`, `jobs/<id>/items/<iid>/image`, `jobs/<id>/download`, `jobs/<id>/outputs`,
`jobs/<id>/audit`, `fs`; `POST /api/validate`, `recipes`, `recipes/<id>/archive`, `sample`, `preview`, `jobs`,
`jobs/<id>/cancel`, `jobs/<id>/resume`, `jobs/<id>/items/<iid>` (azioni `certify`, `set`, `reject`, `reopen`, `undo`),
`settings`, `remote/ping`, `tokens`, `audit/verify`.

Remoto (`--remote`, header `Authorization: Bearer <gettone>`): `POST /api/jobs/upload` (zip nel corpo; ricetta in
`X-Recipe-B64`, nome in `X-Job-Name`, variabili in `X-Vars-B64`), poi `GET /api/jobs/<id>`, `…/items`, `…/download`,
`POST …/items/<iid>`, `…/resume`. Solo i lavori di quel cliente.

### 2.7 Dati e sicurezza

- `strumenti.sqlite`: `jobs`, `ledger` (crediti per cliente e mese), `tokens` (solo l'impronta sha256), `audit` (catena
  `prev` → `hash`; `audit_verify` la ricontrolla).
- Lavori in `lavori/<id>/`: `stato.json`, `lavoro/NN-passo/` (file intermedi), registro della verifica. La cartella di
  arrivo non viene mai svuotata; `route` rifiuta percorsi fuori da essa; zip estratti con controllo dei percorsi.
- Celle Excel che iniziano con `= + - @` vengono scritte come testo (niente formule iniettate).

### 2.8 Riga di comando

```
python -m docmap_strumenti serve [--port 8091] [--remote --host 0.0.0.0 --cert c.pem --key k.pem] [--open]
python -m docmap_strumenti url | blocchi | ricette | modelli | info
python -m docmap_strumenti importa ricetta.json | esporta <id>
python -m docmap_strumenti prova <id> file.pdf [--json]
python -m docmap_strumenti esegui <id> --da cartella --a arrivo [--remoto]
python -m docmap_strumenti token crea --cliente X [--crediti N] | elenco | revoca --cliente X
python -m docmap_strumenti consumi | registro
```

### 2.9 Limiti di questa versione e prossimi passi

- Non ancora nell'app né nell'hub: la sezione «Strumenti» per l'amministratore (anche nella vista del cliente), i piani
  con modalità e crediti in `plans.json` e la consegna automatica del server remoto dall'hub vengono dopo la PR #20.
- OCR: Tesseract o servizi; un modello proprio per i dattiloscritti si collega come servizio esterno (`ocr.remote_endpoint`).
- Nell'editor il blocco `extract` mostra tutti i parametri, non solo quelli del metodo scelto.
- Non provato su Windows vero, con scansioni vere di Dave e con un server remoto vero: righe S1–S6 di
  [`COLLAUDO-REALE.md`](COLLAUDO-REALE.md).
