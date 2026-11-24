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

Il briefing propone sei fondamenta da mettere nel codice prima della foto unica. Stato al rilascio 26.12.16:

| Fondamenta del briefing | Stato | Dove |
|---|---|---|
| Schema di riconoscimento unico e versionato (campi, tag, contorno, QR abbinato, fiducia per campo, fornitore/modello/prompt) | **in parte**: `inv.ai` ha testo, campi, fiducia e modello per tutti i fornitori; mancano la fiducia per campo, la versione del prompt e il contorno del dorso | `invAiNorm`, `invAiPrompt` (02f), `ai_spine` (PHP/Python) |
| Interfaccia «riconoscitore» a pezzi (QR, dorsi, testo, tag; cloud, locale o spento) | **fatto per il QR e la lettura del testo**: registro `invRecognizerAdd` con `qr-anchor`; fornitore AI agnostico (Claude, OpenAI-compatibile, Ollama, spento). Il rilevatore dei dorsi si aggiunge come riconoscitore nuovo | §2 di questo file |
| Archivio delle verità (foto, proposta AI, valore confermato, chi e quando) ed esportazione standard | **fatto in JSONL** (`docmap-inv-train` v1, §3); l'esportazione COCO dei contorni arriverà con il primo rilevatore di dorsi, perché oggi i contorni non esistono ancora | `invTrainRows`, `ivxTrainExport` |
| Etichetta da dorso e codice grande, con le modalità di etichettatura del progetto | **fatto**: `inv.plan` (fuori, fuori e dentro, nessuna; faldoni tutti, alcuni, nessuno; codice grande, normale, nascosto) | `ivpLabelHTML`, `ivpPlanHTML` (06q) |
| Vocabolario dei tag per cliente, con sinonimi, parole escluse e coda «nuovi tag suggeriti» | **da fare**: oggi ci sono i tag rapidi del progetto e dei modelli | prossimo passo |
| Banco di prova (foto vere con risposte giuste e un comando che misura ogni fornitore) | **da fare**: il file di addestramento con «Solo faldoni confermati» è già il formato del set di prova | prossimo passo |

Il conteggio dei «faldoni senza QR» che il briefing indica come la funzione enterprise più utile esiste già a mano
(Faldoni nella scatola, Faldone senza etichetta). Quando arriverà il rilevatore dei dorsi, il numero dei dorsi visti
nella foto della scatola si confronterà con quel conteggio e con i QR letti («8 dorsi visti, 7 QR letti»).
