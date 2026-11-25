# Riconoscimento dalle foto — la base nel codice (v12.16)

Per chi sviluppa. Descrive cosa salva oggi l'inventario per arrivare, più avanti, a riconoscere **tutti i faldoni di una
scatola da un'unica foto** e a un **modello di lettura specializzato** (coste, prime pagine, tag giusti e sbagliati).
Il **briefing sullo stato dell'arte** (modelli di segmentazione e lettura, addestramento, costi, scelte consigliate) è un
documento a parte: <https://claude.ai/artifact/6vVNg8CmEyoT7YYzgzs6TL>. Questo file dice cosa c'è già nel codice e come
agganciarci quelle scelte senza cambiare i dati.

## 1. Cosa salva già il telefono

| Dato | Dove | Formato |
|---|---|---|
| Foto della costa di ogni faldone | IndexedDB `docmap_v26_inv` › `photos`, poi server (`photo_put`) | `inv.ph` del faldone; con la raffica è la striscia attorno al suo QR |
| Foto della prima pagina | idem | `inv.ph2` |
| **Foto della scatola aperta** | idem | `inv.shots[]` della scatola: `{ph, at, w, h, by, codes:[{c, x, y, w, h}]}` |
| Posizione di ogni etichetta nella foto | dentro lo shot | `x, y, w, h` sono frazioni della foto (0..1), `c` è lo short code letto dal QR |
| Risposta giusta | il faldone | campi confermati da una persona (`inv.st = 'confirmed'`), tag, anni |
| Lettura AI | il faldone | `inv.ai` (testo, anno, azienda, fiducia, modello) |

Le posizioni vengono dal lettore nativo del browser (`BarcodeDetector`, Chrome su Android): `DMCamScanner.boxes`
(`assets/js/11b-assoc.js`) → `invShotCodes` (`02f-inventory.js`). Su iPhone il lettore di riserva (jsQR) non dà le
posizioni: la foto si salva lo stesso, senza `codes`.

## 2. Il punto di aggancio: i riconoscitori

`INV_RECOGNIZERS` in `assets/js/02f-inventory.js`. Un riconoscitore riceve uno shot e restituisce le **regioni**:

```js
invRecognizerAdd({
  id: 'mio-modello', label: 'Segmentazione coste', priority: 10,
  run: (shot, ctx) => [{c: 'dm26AbcdAAAB', x: 0.08, y: 0, w: 0.12, h: 1, kind: 'spine', score: 0.92}]
});
invRecognize(shot)   // per ogni codice la regione con il punteggio più alto
```

- Quello di serie, `qr-anchor`, usa solo il QR: una striscia verticale attorno a ogni etichetta (punteggio 0,3).
- Un modello di segmentazione (le coste di tutti i faldoni nella foto) si registra con una `priority` e un `score` più
  alti e vince da solo; il resto dell'app non cambia.
- Un modello che gira sul server o in sede (asincrono) scrive le sue regioni nello shot quando ha finito
  (campo nuovo, per esempio `regions`), senza toccare `codes`.

## 3. Dati per l'addestramento

PC › progetto › scheda Lavoro › **Dati per l'addestramento**: un file JSON Lines (`docmap-inv-train` v1, una riga per
foto), costruito da `invTrainRows` (`02f`) ed esportato da `ivxTrainExport` (`06qb`).

- Riga `binder`: `photo`, `kind` (spine | page | doc), `confirmed`, `truth` (campi confermati), `ai` (lettura AI),
  `nolabel`, `box`.
- Riga `shot`: `photo`, `w`, `h`, `codes` (posizioni delle etichette): il materiale per insegnare a un modello a trovare
  le coste e a collegarle al QR giusto.
- Le foto si includono solo se chi esporta lo sceglie (`data` = data URL). Il file contiene dati dei clienti: si condivide
  solo con chi tratta i dati per lo studio (bozze in `docs/commerciale/`). Ogni esportazione va nel registro
  (`inventory.train_export`).

## 4. Regole

- Il QR resta la verità: un riconoscitore propone, non cambia mai il codice di un faldone.
- Le regioni sono sempre frazioni della foto, così valgono a qualsiasi risoluzione.
- Campi nuovi solo in aggiunta (`shots`, `regions`, …): le versioni vecchie li conservano senza usarli.
- Il codice leggibile grande sull'etichetta (Impostazioni del progetto › Codice leggibile: grande) aiuta anche l'OCR
  quando il QR è rovinato o troppo piccolo nella foto.

## 5. Dove siamo rispetto al briefing (fase 0, «le fondamenta nel codice»)

Il briefing propone sei fondamenta da mettere nel codice prima della foto unica. Stato al rilascio 26.12.17:

| Fondamenta del briefing | Stato | Dove |
|---|---|---|
| Schema di riconoscimento unico e versionato (campi, tag, contorno, QR abbinato, fiducia per campo, fornitore/modello/prompt) | **fatto per la lettura del testo** (26.12.17): ogni lettura ha `field_conf` per campo, `provider`, `model`, `prompt_v`, uguale per tutti i fornitori e uguale tra PHP, Python e PC. Il contorno del dorso arriverà con il rilevatore dei dorsi | `invAiNorm`, `invAiStamp` (02f), `ai_norm`, `ai_schema`, `DM_AI_PROMPT_V` (server) |
| Interfaccia «riconoscitore» a pezzi (QR, dorsi, testo, tag; cloud, locale o spento) | **fatto per QR, testo e tag**: registro `invRecognizerAdd` con `qr-anchor`; lettura del testo agnostica (Claude, OpenAI-compatibile, Ollama, spento); tag con il vocabolario (`invAiTags`). Il rilevatore dei dorsi si aggiunge come riconoscitore nuovo | §2, §6 |
| Archivio delle verità (foto, proposta AI, valore confermato, chi e quando) ed esportazione standard | **fatto in JSONL** (`docmap-inv-train` v1, §3, ora con `field_conf`, `provider`, `prompt_v`); l'esportazione COCO dei contorni arriverà con il primo rilevatore di dorsi | `invTrainRows`, `ivxTrainExport` |
| Etichetta da dorso e codice grande, con le modalità di etichettatura del progetto | **fatto** (26.12.16): `inv.plan` | `ivpLabelHTML`, `ivpPlanHTML` (06q) |
| Vocabolario dei tag per cliente, con sinonimi, parole escluse e coda «nuovi tag suggeriti» | **fatto** (26.12.17): `inv.vocab`, suggerimenti calcolati dalle letture (mai nomi) | §6, `06qc-inventory-ai.js` |
| Banco di prova (foto vere con risposte giuste e un comando che misura ogni fornitore) | **fatto sul PC** (26.12.17): rilegge i faldoni confermati, misura campo per campo, tempo e affidabilità, conserva le prove. Manca un comando da riga di comando per un set di prova fuori dai progetti | §6 |

Il conteggio dei «faldoni senza QR» che il briefing indica come la funzione enterprise più utile esiste già a mano
(Faldoni nella scatola, Faldone senza etichetta). Quando arriverà il rilevatore dei dorsi, il numero dei dorsi visti
nella foto della scatola si confronterà con quel conteggio e con i QR letti («8 dorsi visti, 7 QR letti»).

**Prossimi passi tecnici** (fase 1 del briefing): modalità «Foto della scatola» con lettura dei dorsi per ritaglio
(`invBurstCrop` + `invShotCodes` danno già le strisce), rilevatore dei dorsi come riconoscitore, esportazione COCO,
banco di prova da riga di comando sul file di addestramento.

## 6. Lettura AI dal 26.12.17: fiducia per campo, vocabolario, banco di prova

**Forma di una lettura** (`inv.ai` di un faldone):

```json
{"company": "Rossi Srl", "title": "Fatture acquisti", "year_from": 2019, "year_to": 2019, "doc_type": "", "tags": ["IVA"],
 "notes": "", "text": "ROSSI SRL FATTURE ACQUISTI 2019 IVA", "confidence": 0.9,
 "field_conf": {"company": 0.95, "title": 0.8, "years": 0.4, "doc_type": 0, "tags": 0.9}, "empty_spine": false,
 "provider": "anthropic", "model": "…", "prompt_v": 2, "ms": 1800, "at": "2026-11-24T10:00:00.000Z"}
```

- `field_conf` viene dal modello (prompt e schema la chiedono); se manca vale `confidence` sui campi pieni; un campo vuoto
  vale sempre 0. Le letture vecchie passano da `invAiFieldConf`.
- Un campo pieno sotto `INV_FIELD_DOUBT` (0,6) è «da controllare»: giallo nella revisione, stato `review` (`invAiState`),
  mai confermato in blocco (`ivpSafe`). La voce dell'operatore resta più forte della foto.
- Cambiare il testo del prompt o la forma della risposta vuol dire **aumentare `DM_AI_PROMPT_V`** in `api.php`, `api.py`
  e `INV_AI_PROMPT_V` in `02f-inventory.js` (`tests/v1212.js` e `tests/v1217.js` confrontano i tre), così il banco di
  prova distingue le letture dei due prompt.

**Vocabolario** (`inv.vocab`): `invFold` rende uguali maiuscole, accenti, punti e apostrofi. All'AI vanno i tag e poi i
sinonimi (`invVocabHintTags`, massimo 40); la risposta e la trascrizione tornano ai tag canonici (`invAiTags`); le parole
escluse (`INV_STOP_DEFAULT` + quelle del cliente + il marchio) non diventano mai tag. I suggerimenti (`invVocabSuggest`)
sono parole di almeno 4 lettere, senza cifre, su almeno 3 faldoni, mai parole dei nomi di ditte o persone (GDPR).

**Banco di prova** (`inv.bench`): `invBenchScore` confronta una lettura con i campi confermati (ditta e tipo uguali o
contenuti, contenuto con parole in comune ≥ 50%, anni uguali, tag uguali dopo il vocabolario; un campo che nessuno dei
due ha non conta); `invBenchSummary` dà la quota giusta per campo, i faldoni tutti giusti, il tempo mediano e
l'affidabilità (tra le letture con fiducia ≥ soglia del progetto, quante erano tutte giuste). Per provare un fornitore
nuovo basta che risponda come `ai_spine` (`ivqAiCall`).

## 7. Chi legge: fornitori e workstation (Strumenti 0.3.0, 0.4.0)

Negli Strumenti la lettura passa da un registro unico (pacchetto `ai/`, dalla 0.4.0 con cascata, confronto in parallelo e compiti): Claude, OpenAI, Gemini, servizi compatibili, vLLM, Ollama e le tue **workstation** con il gateway (`workstation/`, protocollo [`WORKSTATION-API.md`](WORKSTATION-API.md)), con **profili** e **riserva**. Ogni risposta porta `provider`, `model`, `profile` e i token usati, come chiede lo schema unico del §5. Il modello su cui Dave fa le prove (Inkling 2 Mini, looped transformer) si collega da lì senza codice speciale. Il sito e il server di sede usano ancora `ai_spine` con i fornitori del §6: portarli sullo stesso registro è il passo A di [`AI-FORNITORI.md`](AI-FORNITORI.md) §10; oggi il sito può già usare una workstation come servizio `openai_compatible` (indirizzo del gateway + `/v1`, gettone come chiave).
